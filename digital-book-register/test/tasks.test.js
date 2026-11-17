'use strict';
// ทดสอบชั้นความเร็ว + เตือนความจำ (ต้องดำเนินการภายใน / สำเร็จแล้ว)
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbr-task-'));
process.env.DATA_DIR = path.join(tmp, 'data');
const test = require('node:test'), assert = require('node:assert/strict');
const db = require('../server/db'); const { createApp } = require('../server/index');

let base, server;
const N = 'ส.ต.ท.เนวิน แดงแจ้';
const jj = async (p, o = {}) => { const r = await fetch(base + p, { method: o.method || (o.json !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', 'x-duty-officer': encodeURIComponent(N) }, body: o.json !== undefined ? JSON.stringify(o.json) : undefined }); return { s: r.status, d: await r.json().catch(() => null) }; };
test.before(async () => { db.open(); await new Promise(r => { server = createApp().listen(0, '127.0.0.1', r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.closeAllConnections(); server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

let A, B, C;
test('บันทึกชั้นความเร็ว/กำหนดได้ และตรวจค่าที่ไม่ถูกต้อง', async () => {
  A = (await jj('/api/books/in', { json: { book_date: '2026-11-10', subject: 'ส่งข้อมูลกำลังพล', urgency: 'ด่วนที่สุด', due_date: '2026-11-20' } })).d;
  B = (await jj('/api/books/in', { json: { book_date: '2026-11-10', subject: 'รายงานประจำเดือน', due_date: '2026-11-15' } })).d;
  C = (await jj('/api/books/in', { json: { book_date: '2026-11-10', subject: 'แจ้งเพื่อทราบ' } })).d;
  assert.equal(A.urgency, 'ด่วนที่สุด'); assert.equal(A.due_date, '2026-11-20'); assert.equal(C.due_date, '');
  assert.equal((await jj('/api/books/in', { json: { book_date: '2026-11-10', subject: 'x', urgency: 'ด่วนจี๋' } })).s, 400);
  assert.equal((await jj('/api/books/in', { json: { book_date: '2026-11-10', subject: 'x', due_date: '20/11/2569' } })).s, 400);
});
test('เตือนความจำ: เฉพาะที่มีกำหนดและยังไม่เสร็จ เรียงตามวันครบกำหนด / ไม่รวมหนังสือแจ้งเพื่อทราบ', async () => {
  const t = (await jj('/api/tasks')).d; assert.deepEqual(t.map(x => x.id), [B.id, A.id]);
});
test('สำเร็จแล้ว -> หายจากเตือน (บันทึกผู้ทำ + ประวัติ + log) / เลิกทำ -> กลับมา', async () => {
  const r = (await jj(`/api/books/id/${B.id}/done`, { method: 'POST' })).d;
  assert.ok(r.done_at); assert.equal(r.done_by, N); assert.equal(r.history[0].action, 'done');
  assert.deepEqual((await jj('/api/tasks')).d.map(x => x.id), [A.id]);
  assert.ok((await jj('/api/activity?action=task_done')).d.rows.some(x => x.ref_id === B.id && x.actor === N));
  await jj(`/api/books/id/${B.id}/undone`, { method: 'POST' });
  assert.deepEqual((await jj('/api/tasks')).d.map(x => x.id), [B.id, A.id]);
});
test('แก้กำหนด / ยกเลิกหนังสือ -> ไม่อยู่ในเตือน', async () => {
  const u = (await jj('/api/books/id/' + A.id, { method: 'PUT', json: { due_date: '2026-11-12' } })).d;
  assert.equal(u.history[0].changes.due_date[1], '2026-11-12');
  assert.deepEqual((await jj('/api/tasks')).d.map(x => x.id), [A.id, B.id]);
  await jj(`/api/books/id/${A.id}/cancel`, { json: { reason: 'ลงซ้ำ' } });
  assert.deepEqual((await jj('/api/tasks')).d.map(x => x.id), [B.id]);
  assert.equal((await jj(`/api/books/id/${A.id}/done`, { method: 'POST' })).s, 409);
});
test('สถิติรายเดือน: เดือนเรียง ต.ค.–ก.ย. (ปีงบ) / นับเฉพาะที่ไม่ยกเลิก / ด่วน / ตามกำหนด', async () => {
  const st = (await jj('/api/stats')).d;
  assert.equal(st.fiscal, true); assert.equal(st.months.length, 12); assert.equal(st.months[0].short, 'ต.ค.'); assert.equal(st.months[11].short, 'ก.ย.');
  assert.equal(st.totals.in, 2); assert.equal(st.totals.cancelled, 1);                       // A ถูกยกเลิก
  assert.equal(st.months.reduce((a, m) => a + m.in, 0), 2);
  assert.equal(st.urgency['ด่วนที่สุด'], 0); assert.equal(st.due.total, 1);
  const cal = require('../server/stats').monthsOf(2570, false); assert.equal(cal[0].key, '2027-01'); assert.equal(cal[11].key, '2027-12');
});
