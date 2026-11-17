'use strict';
// ทดสอบรหัสผ่าน: ตั้ง / ต้องเข้าสู่ระบบ / ลบด้วยรหัสเดิม / ลืมรหัส -> reset-password (ขณะโปรแกรมเปิดอยู่) ข้อมูลไม่หาย
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbr-pw-'));
process.env.DATA_DIR = path.join(tmp, 'data');
const test = require('node:test'), assert = require('node:assert/strict');
const db = require('../server/db'), books = require('../server/books'); const { createApp } = require('../server/index');

let base, server;
const req = async (p, o = {}) => { const r = await fetch(base + p, { method: o.method || (o.json ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie: o.cookie || '' }, body: o.json ? JSON.stringify(o.json) : undefined }); return { s: r.status, d: await r.json().catch(() => null), r }; };
const login = async pw => { const r = await req('/api/login', { json: { password: pw } }); return { s: r.s, cookie: (r.r.headers.get('set-cookie') || '').split(';')[0] }; };
test.before(async () => { db.open(); books.create('in', { book_date: '2026-11-17', subject: 'ข้อมูลต้องอยู่ครบ' }); await new Promise(r => { server = createApp().listen(0, '127.0.0.1', r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.closeAllConnections(); server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('ตั้งรหัส -> ต้องเข้าสู่ระบบ / ลบรหัสต้องใช้รหัสเดิมที่ถูกต้อง', async () => {
  assert.equal((await req('/api/settings/password', { json: { current: '', next: 'abc' } })).s, 400);       // สั้นเกินไป
  assert.equal((await req('/api/settings/password', { json: { current: '', next: 'abcd1234' } })).s, 200);
  assert.equal((await req('/api/state')).s, 401);
  assert.equal((await login('ผิด')).s, 401);
  const { cookie } = await login('abcd1234'); assert.equal((await req('/api/state', { cookie })).s, 200);
  assert.equal((await req('/api/settings/password', { json: { current: 'ผิด', next: '' }, cookie })).s, 403);   // ลบด้วยรหัสผิดไม่ได้
  assert.equal((await req('/api/settings/password', { json: { current: 'abcd1234', next: '' }, cookie })).s, 200);
  assert.equal((await req('/api/state')).s, 200);
});
test('ลืมรหัสผ่าน: reset-password ล้างรหัสได้ขณะโปรแกรมเปิดอยู่ ข้อมูลไม่หาย และบันทึกใน log', async () => {
  await req('/api/settings/password', { json: { current: '', next: 'ลืมแน่นอน99' } });
  assert.equal((await req('/api/state')).s, 401);
  const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'scripts', 'reset-password.js')], { env: { ...process.env }, encoding: 'utf8' });
  assert.match(out, /ล้างรหัสผ่านเรียบร้อย/);
  const st = await req('/api/state'); assert.equal(st.s, 200); assert.equal(st.d.has_password, false);
  assert.equal((await req('/api/books?kind=in')).d.rows[0].subject, 'ข้อมูลต้องอยู่ครบ');
  assert.ok((await req('/api/activity?action=password')).d.rows.some(r => /reset-password/.test(r.detail)));
  const again = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'scripts', 'reset-password.js')], { env: { ...process.env }, encoding: 'utf8' });
  assert.match(again, /ยังไม่ได้ตั้งรหัสผ่าน/);
});
