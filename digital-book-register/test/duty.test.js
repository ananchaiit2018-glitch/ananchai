'use strict';
// ทดสอบหน้าเลือกผู้เข้าเวร: ค่าเริ่มต้น / แก้รายชื่อ / ประวัติบันทึกชื่อผู้ทำรายการ
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbr-duty-'));
process.env.DATA_DIR = tmp;
const test = require('node:test'), assert = require('node:assert/strict');
const db = require('../server/db'); const { createApp } = require('../server/index');

let base, server;
const jj = async (p, o = {}) => {
  const r = await fetch(base + p, { method: o.method || (o.json !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(o.headers || {}) }, body: o.json !== undefined ? JSON.stringify(o.json) : undefined });
  return { s: r.status, d: await r.json().catch(() => null) };
};
test.before(async () => { db.open(); await new Promise(r => { server = createApp().listen(0, '127.0.0.1', r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.closeAllConnections(); server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('ปุ่มปิดโปรแกรม: ตอบ ok เมื่อเรียกจากเครื่องหลัก (ในเทสต์ไม่ปิดโปรเซสจริง)', async () => {
  assert.equal((await jj('/api/shutdown', { method: 'POST' })).s, 200);
});
test('ปีงบประมาณ(ค่าตั้งต้น) และค่าตั้งต้นช่อง จาก/ถึง', async () => {
  const d = new Date(); const exp = d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0);
  const st = (await jj('/api/state')).d; assert.equal(st.settings.year_mode, 'fiscal'); assert.equal(st.year, exp);
  assert.deepEqual(JSON.parse(st.settings.to_options), ['ผบ.มว.ฉก.ตชด.๔๔๔๑']); assert.deepEqual(JSON.parse(st.settings.from_options), ['ผบ.ร้อย ฉก.ตชด ๔๔๔']);
  const r = await jj('/api/books/in', { json: { book_date: '2026-03-05', subject: 'งบ' } }); assert.equal(r.d.reg_label, '001/' + exp);
  assert.equal((await jj('/api/settings', { method: 'PUT', json: { year_mode: 'auto', from_options: 'ก\nข' } })).s, 200);
  assert.equal((await jj('/api/settings', { method: 'PUT', json: { year_mode: 'xyz' } })).s, 400);
  assert.deepEqual(JSON.parse((await jj('/api/state')).d.settings.from_options), ['ก', 'ข']);
  await jj('/api/settings', { method: 'PUT', json: { year_mode: 'fiscal' } });
});
test('ผู้เข้าเวร: ค่าเริ่มต้น 3 คน / แก้รายชื่อได้ / ประวัติบันทึกชื่อผู้ทำรายการ', async () => {
  const st = (await jj('/api/state')).d.settings; const list = JSON.parse(st.duty_officers);
  assert.deepEqual(list, ['ส.ต.ท.อนันต์ชัย แก้วหัวไทร', 'ส.ต.ท.เนวิน แดงแจ้', 'ส.ต.ท.ซูไฮมีย์ บาฮา']);
  assert.equal(st.duty_unit, 'ประจำ มว.ฉก.ตชด.๔๔๔๑'); assert.equal(st.duty_title, 'ผู้เข้าเวร วิทยุ');
  const r = await jj('/api/books/in', { json: { book_date: '2026-03-05', subject: 'ทดสอบ' }, headers: { 'x-duty-officer': encodeURIComponent('ส.ต.ท.เนวิน แดงแจ้') } });
  assert.equal(r.d.history[0].actor, 'ส.ต.ท.เนวิน แดงแจ้');
  assert.equal((await jj('/api/settings', { method: 'PUT', json: { duty_officers: 'นาย ก\nนาย ข\nนาย ก\n' } })).s, 200);
  assert.deepEqual(JSON.parse((await jj('/api/state')).d.settings.duty_officers), ['นาย ก', 'นาย ข']);
  assert.equal((await jj('/api/settings', { method: 'PUT', json: { duty_unit: 'ประจำ หน่วยใหม่' } })).s, 200);
  assert.equal((await jj('/api/state')).d.settings.duty_unit, 'ประจำ หน่วยใหม่');
});
test('เลือกโฟลเดอร์สำรอง: เรียกดู / สร้างโฟลเดอร์ใหม่ / กันชื่อไม่ถูกต้อง', async () => {
  fs.mkdirSync(path.join(tmp, 'sub1'));
  const root = (await jj('/api/fs/list')).d; assert.equal(root.root, true); assert.ok(root.dirs.length > 0);
  const l = await jj('/api/fs/list?path=' + encodeURIComponent(tmp)); assert.equal(l.s, 200);
  assert.ok(l.d.dirs.some(d => d.name === 'sub1')); assert.equal(l.d.writable, true); assert.ok(l.d.parent);
  assert.ok(!l.d.dirs.some(d => d.name.startsWith('.')));
  const mk = await jj('/api/fs/mkdir', { json: { parent: tmp, name: 'สำรองทะเบียน' } }); assert.equal(mk.s, 200); assert.ok(fs.statSync(mk.d.path).isDirectory());
  assert.equal((await jj('/api/fs/mkdir', { json: { parent: tmp, name: 'สำรองทะเบียน' } })).s, 400);   // ซ้ำ
  for (const bad of ['..', 'a/b', 'a\\b', '', 'x:y']) assert.equal((await jj('/api/fs/mkdir', { json: { parent: tmp, name: bad } })).s, 400, bad);
  assert.equal((await jj('/api/fs/list?path=' + encodeURIComponent(path.join(tmp, 'ไม่มีจริง')))).s, 400);
});
