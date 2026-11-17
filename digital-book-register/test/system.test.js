'use strict';
// ชุดทดสอบระบบ: ยิงผ่าน HTTP จริง ใช้ฐานข้อมูลชั่วคราว ไม่แตะข้อมูลจริง
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbr-test-'));
process.env.DATA_DIR = tmp;
const test = require('node:test'), assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const AdmZip = require('adm-zip'); const ExcelJS = require('exceljs');
const db = require('../server/db'); const { createApp } = require('../server/index'); const backup = require('../server/backup');

let base, server;
const J = (p, o = {}) => fetch(base + p, { ...o, headers: { 'content-type': 'application/json', ...(o.headers || {}) }, body: o.json !== undefined ? JSON.stringify(o.json) : o.body, method: o.method || (o.json !== undefined ? 'POST' : 'GET') });
const jj = async (p, o) => { const r = await J(p, o); return { s: r.status, d: await r.json().catch(() => null) }; };
const FONT = ['/usr/share/fonts/opentype/tlwg/Loma.otf', 'C:/Windows/Fonts/tahoma.ttf'].find(f => fs.existsSync(f));
const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(200, 1)]).toString('base64');
const book = (o = {}) => ({ book_no: 'ศธ 0001/1', book_date: '2026-03-05', from_org: 'หน่วยงาน ก', to_org: 'หน่วยงาน ข', subject: 'ทดสอบเรื่อง', action: 'ทราบ', remark: '', ...o });

test.before(async () => {
  db.open(); const app = createApp();
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); }); base = 'http://127.0.0.1:' + server.address().port;
  await jj('/api/settings', { method: 'PUT', json: { year_mode: '2569', org_name: 'หน่วยงานทดสอบ' } });
});
test.after(() => { server.closeAllConnections(); server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('1-3 เพิ่มหนังสือรับ/ส่ง และเลขรันแยกชุด 001..004/2569', async () => {
  for (let i = 1; i <= 4; i++) {
    const a = await jj('/api/books/in', { json: book({ subject: 'รับ ' + i }) }); assert.equal(a.d.reg_label, `00${i}/2569`);
    const b = await jj('/api/books/out', { json: book({ subject: 'ส่ง ' + i }) }); assert.equal(b.d.reg_label, `00${i}/2569`);
  }
  const l = await jj('/api/books?kind=in'); assert.equal(l.d.total, 4);
});
test('เลขทะเบียนแยกจากเลขที่หนังสือ', async () => {
  const r = await jj('/api/books/in', { json: book({ book_no: 'ที่ 999/2569' }) });
  assert.equal(r.d.book_no, 'ที่ 999/2569'); assert.equal(r.d.reg_label, '005/2569');
});
test('กันกดบันทึกซ้ำ (client_token)', async () => {
  const a = await jj('/api/books/out', { json: { ...book(), client_token: 'tok-1' } }); const b = await jj('/api/books/out', { json: { ...book(), client_token: 'tok-1' } });
  assert.equal(a.d.id, b.d.id); assert.equal(b.d.duplicate, true);
});
test('กันเลขซ้ำเมื่อบันทึกพร้อมกัน 60 รายการ', async () => {
  const rs = await Promise.all(Array.from({ length: 60 }, (_, i) => jj('/api/books/in', { json: book({ subject: 'พร้อมกัน ' + i }) })));
  const nos = rs.map(r => r.d.reg_no); assert.equal(new Set(nos).size, 60);
});
test('4 เปลี่ยนปี: ขึ้นปีใหม่เริ่มเลขใหม่ และปีเก่ายังอยู่', async () => {
  await jj('/api/settings', { method: 'PUT', json: { year_mode: '2570' } });
  const r = await jj('/api/books/in', { json: book() }); assert.equal(r.d.reg_label, '001/2570');
  await jj('/api/settings', { method: 'PUT', json: { year_mode: '2569' } });
  assert.equal((await jj('/api/books/in', { json: book() })).d.year, 2569);
});
test('เลขเริ่มต้น และห้ามตั้งเลขต่ำกว่าที่เคยใช้', async () => {
  await jj('/api/settings', { method: 'PUT', json: { year_mode: '2571', start_out: '50' } });
  assert.equal((await jj('/api/books/out', { json: book() })).d.reg_label, '050/2571');
  assert.equal((await jj('/api/counters', { method: 'PUT', json: { kind: 'out', year: 2571, next_no: 40 } })).s, 409);
  assert.equal((await jj('/api/counters', { method: 'PUT', json: { kind: 'out', year: 2571, next_no: 60 } })).s, 200);
  assert.equal((await jj('/api/books/out', { json: book() })).d.reg_label, '060/2571');
  await jj('/api/settings', { method: 'PUT', json: { year_mode: '2569', start_out: '1' } });
});
test('5-6 แก้ไขเก็บประวัติ / ยกเลิกเก็บเลข ไม่ใช้ซ้ำ', async () => {
  const a = (await jj('/api/books/in', { json: book({ subject: 'ก่อนแก้' }) })).d;
  const u = await jj('/api/books/id/' + a.id, { method: 'PUT', json: { subject: 'หลังแก้', remark: 'x' } });
  assert.equal(u.d.subject, 'หลังแก้'); assert.equal(u.d.reg_label, a.reg_label);
  const h = u.d.history.find(x => x.action === 'update'); assert.deepEqual(h.changes.subject, ['ก่อนแก้', 'หลังแก้']);
  assert.equal((await jj(`/api/books/id/${a.id}/cancel`, { json: {} })).s, 400);
  const c = await jj(`/api/books/id/${a.id}/cancel`, { json: { reason: 'ลงผิด' } }); assert.equal(c.d.status, 'cancelled');
  assert.equal((await jj('/api/books/id/' + a.id, { method: 'PUT', json: { subject: 'z' } })).s, 409);
  const n = (await jj('/api/books/in', { json: book() })).d; assert.equal(n.reg_no, a.reg_no + 1);
  assert.equal((await jj('/api/books/id/' + a.id)).d.reg_label, a.reg_label);
});
test('7 ค้นหา: เลขทะเบียน/เลขที่/เรื่อง/หน่วยงาน/ชื่อ/เดือน-ปี', async () => {
  const x = (await jj('/api/books/out', { json: book({ book_no: 'พิเศษ 77/2569', from_org: 'กองคลังจังหวัด', to_org: 'อบต.บ้านดอน', subject: 'ขออนุมัติเบิกจ่ายค่าไฟ', sender_name: 'นายค้นหา ทดสอบ', receiver_name: 'นางรับ เอกสาร' }) })).d;
  for (const q of ['พิเศษ 77', 'เบิกจ่าย', 'กองคลัง', 'บ้านดอน', 'ค้นหา ทดสอบ', 'นางรับ', x.reg_label]) assert.ok((await jj('/api/books?q=' + encodeURIComponent(q))).d.rows.some(r => r.id === x.id), q);
  assert.equal((await jj('/api/books?q=' + encodeURIComponent('ไม่มีคำนี้แน่นอน'))).d.total, 0);
  const ym = await jj('/api/books?kind=out&year=2569&month=' + (new Date().getMonth() + 1)); assert.ok(ym.d.total > 0);
  const asc = (await jj('/api/books?kind=in&year=2569&sort=reg&dir=asc&limit=500')).d.rows.map(r => r.reg_no); assert.deepEqual(asc, [...asc].sort((p, q) => p - q));
  assert.equal((await jj('/api/books?q=' + encodeURIComponent("'; DROP TABLE books;--"))).s, 200);
});
test('8 ลายเซ็นภาพ + ไฟล์แนบ (และปฏิเสธไฟล์อันตราย)', async () => {
  const a = (await jj('/api/books/in', { json: { ...book(), sender_name: 'ส', sender_at: '2026-03-05T09:00', sender_sig_data: PNG } })).d;
  assert.ok(a.has_sender_sig); const r = await J(`/api/books/id/${a.id}/signature/sender`); assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal((await jj('/api/books/in', { json: { ...book(), sender_sig_data: 'data:image/png;base64,AAAA' } })).s, 400);
  const fd = new FormData(); fd.append('files', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'หนังสือ.pdf');
  assert.equal((await fetch(`${base}/api/books/id/${a.id}/attachments`, { method: 'POST', body: fd })).status, 201);
  const d = (await jj('/api/books/id/' + a.id)).d; assert.equal(d.attachments[0].filename, 'หนังสือ.pdf');
  const bad = new FormData(); bad.append('files', new Blob(['MZ evil'], { type: 'application/pdf' }), 'x.pdf');
  assert.equal((await fetch(`${base}/api/books/id/${a.id}/attachments`, { method: 'POST', body: bad })).status, 400);
  assert.equal((await fetch(`${base}/api/attachments/${d.attachments[0].id}`)).status, 200);
});
test('13 ฟอนต์: ไม่มีฟอนต์ห้ามสร้าง PDF / ปฏิเสธไฟล์ที่ไม่ใช่ฟอนต์ไทย', async () => {
  const r = await jj('/api/export/pdf?kind=in&scope=all'); assert.equal(r.s, 409); assert.equal(r.d.code, 'FONT_MISSING');
  const fd = new FormData(); fd.append('file', new Blob([Buffer.alloc(5000, 7)])); assert.equal((await fetch(base + '/api/settings/font/regular', { method: 'POST', body: fd })).status, 400);
});
test('9-10,13 PDF (ฝังฟอนต์ไทย, หลายหน้า) / Excel / CSV', { skip: !FONT }, async () => {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(FONT)]), 'f.otf');
  assert.equal((await fetch(base + '/api/settings/font/regular', { method: 'POST', body: fd })).status, 200);
  const pdf = Buffer.from(await (await fetch(base + '/api/export/pdf?kind=in&scope=year&year=2569')).arrayBuffer());
  assert.equal(pdf.slice(0, 4).toString(), '%PDF'); const pf = path.join(tmp, 't.pdf'); fs.writeFileSync(pf, pdf);
  try {
    assert.match(execFileSync('pdffonts', [pf]).toString(), /yes/);
    const txt = execFileSync('pdftotext', ['-layout', pf, '-']).toString().replace(/\s+/g, ''); assert.match(txt, /ทะเบียนหนังสือรับ/); assert.match(txt, /พิเศษ|ศธ/);
    const info = execFileSync('pdfinfo', [pf]).toString(); assert.match(info, /Page size:\s+841/); assert.ok(/Pages:\s+([2-9]|\d\d)/.test(info));
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const x = Buffer.from(await (await fetch(base + '/api/export/xlsx?kind=in&scope=year&year=2569')).arrayBuffer());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x); const ws = wb.worksheets[0];
  assert.equal(ws.getCell('A1').value, 'ทะเบียนหนังสือรับ'); assert.equal(ws.getCell('A5').value, '001/2569'); assert.equal(ws.getCell('A6').value, '002/2569');
  const cb = Buffer.from(await (await fetch(base + '/api/export/csv?kind=out&scope=all')).arrayBuffer()); assert.deepEqual([...cb.slice(0, 3)], [0xef, 0xbb, 0xbf]); const csv = cb.toString('utf8'); assert.match(csv, /เลขทะเบียนส่ง/);
  assert.equal((await fetch(base + '/api/export/pdf?kind=in&scope=month&year=2569&month=13')).status, 400);
});
test('พิมพ์เฉพาะที่เลือก/ช่วงวันที่', { skip: !FONT }, async () => {
  assert.equal((await fetch(base + '/api/export/pdf?kind=in&scope=selected&ids=1,2')).status, 200);
  assert.equal((await fetch(base + '/api/export/pdf?kind=in&scope=range&from=2020-01-01&to=2099-01-01')).status, 200);
});
test('11-12 เปิดใหม่ข้อมูลยังอยู่ / สำรองและกู้คืน', async () => {
  const before = (await jj('/api/books?limit=1')).d.total;
  db.close(); db.open(); assert.equal((await jj('/api/books?limit=1')).d.total, before);
  const bk = backup.run('backup'); assert.ok(bk.ok, bk.error);
  const z = new AdmZip(path.join(backup.backupDir(), bk.name)); assert.ok(z.getEntry('register.db') && z.getEntry('manifest.json') && z.getEntries().some(e => e.entryName.startsWith('signatures/')) && z.getEntries().some(e => e.entryName.startsWith('attachments/')));
  await jj('/api/books/in', { json: book({ subject: 'หลังสำรอง' }) });
  assert.equal((await jj('/api/books?limit=1')).d.total, before + 1);
  assert.equal((await jj('/api/backup/restore-local', { json: { name: bk.name } })).s, 400);   // ไม่ยืนยัน -> ไม่กู้คืน
  const rs = await jj('/api/backup/restore-local', { json: { name: bk.name, confirm: 'กู้คืน' } }); assert.equal(rs.s, 200, JSON.stringify(rs.d));
  assert.equal((await jj('/api/books?limit=1')).d.total, before);
  assert.ok((await jj('/api/backup')).d.items.some(i => i.name.startsWith('before-restore')));
  assert.equal((await jj('/api/books/in', { json: book() })).s, 201);
  const bad = new FormData(); bad.append('confirm', 'กู้คืน'); bad.append('file', new Blob(['not a zip']), 'x.zip'); assert.equal((await fetch(base + '/api/backup/restore', { method: 'POST', body: bad })).status, 400);
  assert.equal((await jj('/api/settings', { method: 'PUT', json: { backup_dir: path.join(tmp, 'fonts', 'regular.otf', 'x') } })).s, 400);
});
test('รหัสผ่านเข้าใช้งาน', async () => {
  assert.equal((await jj('/api/settings/password', { json: { next: 'ab' } })).s, 400);
  assert.equal((await jj('/api/settings/password', { json: { next: 'secret1' } })).s, 200);
  assert.equal((await jj('/api/books')).s, 401);
  assert.equal((await jj('/api/login', { json: { password: 'wrong' } })).s, 401);
  const r = await J('/api/login', { json: { password: 'secret1' } }); const ck = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/api/books', { headers: { cookie: ck } })).status, 200);
  assert.equal((await fetch(base + '/api/settings/password', { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json' }, body: JSON.stringify({ current: 'secret1', next: '' }) })).status, 200);
  assert.equal((await jj('/api/books')).s, 200);
});
