'use strict';
// ทดสอบบันทึกการใช้งาน (log): เข้าเวร / เพิ่ม-แก้-ยกเลิกหนังสือ / ตั้งค่า / ส่งออก / รหัสผ่านผิด / กรอง / ส่งออก Excel
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbr-log-'));
process.env.DATA_DIR = tmp;
const test = require('node:test'), assert = require('node:assert/strict');
const db = require('../server/db'); const { createApp } = require('../server/index');

let base, server;
const N1 = 'ส.ต.ท.อนันต์ชัย แก้วหัวไทร', N2 = 'ส.ต.ท.เนวิน แดงแจ้';
const jj = async (p, o = {}) => {
  const h = { 'content-type': 'application/json', ...(o.as ? { 'x-duty-officer': encodeURIComponent(o.as) } : {}) };
  const r = await fetch(base + p, { method: o.method || (o.json !== undefined ? 'POST' : 'GET'), headers: h, body: o.json !== undefined ? JSON.stringify(o.json) : undefined });
  return { s: r.status, d: await r.json().catch(() => null), r };
};
const logs = async (q = '') => (await jj('/api/activity?' + q)).d;
const settle = () => new Promise(r => setTimeout(r, 50));   // log เขียนตอน response เสร็จ
test.before(async () => { db.open(); await new Promise(r => { server = createApp().listen(0, '127.0.0.1', r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.closeAllConnections(); server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('เข้าเวร / เปลี่ยนผู้เข้าเวร ถูกบันทึกพร้อมชื่อและเครื่อง', async () => {
  await jj('/api/duty', { json: { name: N1, prev: '' }, as: N1 });
  await jj('/api/duty', { json: { name: N2, prev: N1 }, as: N2 }); await settle();
  const r = await logs('action=access');
  assert.equal(r.rows[0].action, 'duty_change'); assert.equal(r.rows[0].actor, N2); assert.match(r.rows[0].detail, /รับเวรต่อจาก ส\.ต\.ท\.อนันต์ชัย/);
  assert.equal(r.rows[1].action, 'duty_start'); assert.equal(r.rows[1].actor, N1); assert.equal(r.rows[0].machine, 'เครื่องหลัก');
});

test('เพิ่ม / แก้ไข / ยกเลิกหนังสือ บันทึกเลขทะเบียน ผู้ทำรายการ และช่องที่แก้', async () => {
  const c = (await jj('/api/books/in', { json: { book_date: '2026-11-17', subject: 'ทดสอบ log', client_token: 'tok-1' }, as: N2 })).d;
  await jj('/api/books/in', { json: { book_date: '2026-11-17', subject: 'ทดสอบ log', client_token: 'tok-1' }, as: N2 });   // ส่งซ้ำ: ไม่บันทึกซ้ำ
  await jj('/api/books/id/' + c.id, { method: 'PUT', json: { subject: 'ทดสอบ log (แก้)', remark: 'ด่วน' }, as: N1 });
  await jj(`/api/books/id/${c.id}/cancel`, { json: { reason: 'ลงผิด' }, as: N1 }); await settle();
  const r = await logs('action=register');
  assert.deepEqual(r.rows.map(x => x.action), ['book_cancel', 'book_update', 'book_create']);
  assert.equal(r.rows[2].actor, N2); assert.match(r.rows[2].detail, new RegExp(`ทะเบียนรับ ${c.reg_label.replace('/', '\\/')} · ทดสอบ log`)); assert.equal(r.rows[2].ref_id, c.id);
  assert.equal(r.rows[1].actor, N1); assert.match(r.rows[1].detail, /แก้ช่อง .*เรื่อง/); assert.match(r.rows[1].detail, /หมายเหตุ/);
  assert.match(r.rows[0].detail, /เพราะ ลงผิด/);
});

test('ตั้งค่า: บันทึกเฉพาะหัวข้อที่เปลี่ยนจริง / ส่งออก / รหัสผ่านผิด', async () => {
  const st = (await jj('/api/state')).d.settings;
  await jj('/api/settings', { method: 'PUT', json: { org_name: 'หน่วยทดสอบ', duty_unit: st.duty_unit }, as: N1 });
  await jj('/api/settings', { method: 'PUT', json: { duty_unit: st.duty_unit }, as: N1 });   // ไม่เปลี่ยน -> ไม่บันทึก
  await fetch(base + '/api/export/csv?kind=in&scope=all', { headers: { 'x-duty-officer': encodeURIComponent(N1) } }).then(r => r.arrayBuffer());
  await fetch(base + '/api/export/pdf?kind=in&scope=all').then(r => r.arrayBuffer());   // ดูตัวอย่าง PDF ไม่บันทึก
  await jj('/api/activity/print', { json: { query: 'kind=out&scope=all' }, as: N1 });
  await settle();
  const sys = (await logs('action=system')).rows;
  assert.equal(sys.filter(x => x.action === 'settings').length, 1); assert.match(sys.find(x => x.action === 'settings').detail, /ชื่อหน่วยงาน/);
  const out = (await logs('action=output')).rows;
  assert.deepEqual(out.map(x => x.action), ['print', 'export']); assert.match(out[0].detail, /ทะเบียนหนังสือส่ง/); assert.match(out[1].detail, /^CSV/);
  await jj('/api/settings/password', { json: { current: '', next: 'abc123' }, as: N1 });
  await jj('/api/login', { json: { password: 'ผิด' } }); await settle();
});

test('กรองตามผู้ทำรายการ / วันที่ / คำค้น และส่งออก Excel', async () => {
  // หลังตั้งรหัสผ่านแล้ว ต้องล็อกอินก่อน
  const lg = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'abc123' }) });
  const cookie = (lg.headers.get('set-cookie') || '').split(';')[0];
  const get = async p => (await fetch(base + p, { headers: { cookie } })).json();
  const all = await get('/api/activity');
  assert.ok(all.rows.some(x => x.action === 'login_fail')); assert.ok(all.rows.some(x => x.action === 'login'));
  assert.ok(all.actors.includes(N1) && all.actors.includes(N2));
  const mine = await get('/api/activity?actor=' + encodeURIComponent(N2)); assert.ok(mine.rows.length >= 2 && mine.rows.every(x => x.actor === N2));
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal((await get(`/api/activity?from=${today}&to=${today}`)).total, all.total);
  assert.equal((await get('/api/activity?from=2000-01-01&to=2000-01-02')).total, 0);
  assert.ok((await get('/api/activity?q=' + encodeURIComponent('ลงผิด'))).rows.every(x => /ลงผิด/.test(x.detail)));
  const x = await fetch(base + '/api/activity/export', { headers: { cookie } }); assert.equal(x.status, 200);
  const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await x.arrayBuffer()));
  const ws = wb.worksheets[0]; assert.equal(ws.name, 'ประวัติการใช้งาน'); assert.equal(ws.actualRowCount, all.total + 1);
  assert.equal(ws.getCell('D2').value, 'เข้าเวร');   // เรียงเก่า -> ใหม่
});
