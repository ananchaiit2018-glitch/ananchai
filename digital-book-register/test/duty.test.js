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
