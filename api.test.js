// รัน: npm test   (ใช้ฐานข้อมูลในหน่วยความจำ ไม่ต้องมี Neon)
process.env.USE_MEMORY_DB = '1';
process.env.APP_PASSCODE = 'test-pass';
process.env.VIEWER_CODE = 'view-pass';
process.env.SESSION_SECRET = 'x'.repeat(32);
delete process.env.DATABASE_URL;
delete process.env.PUBLIC_VIEW;

const test = require('node:test');
const assert = require('node:assert');
const health = require('../api/health');
const login = require('../api/login');
const store = require('../api/store');
const history = require('../api/history');

function call(handler, { method = 'GET', headers = {}, body, query } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(s) { resolve({ status: this.statusCode, json: s ? JSON.parse(s) : null }); }
    };
    Promise.resolve(handler({ method, headers, body, query }, res)).catch((e) => resolve({ status: 500, err: e }));
  });
}
const claims = (t) => JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString());
const put = (headers, items) => call(store, { method: 'PUT', headers, body: { items } });

let admin, viewer;

test('health: แจ้งสถานะการตั้งค่า', async () => {
  const r = await call(health);
  assert.equal(r.status, 200);
  assert.equal(r.json.db, 'memory');
  assert.ok(r.json.setup.passcode && r.json.setup.secret);
  assert.equal(r.json.setup.publicView, false); // ค่าเริ่มต้น: ปิด ต้องใส่รหัสก่อนดูข้อมูล
});
test('login: รหัสผิดถูกปฏิเสธ', async () => {
  assert.equal((await call(login, { method: 'POST', body: { code: 'wrong' } })).status, 401);
});
test('login: รหัสแอดมิน -> role admin', async () => {
  const r = await call(login, { method: 'POST', body: { code: 'test-pass' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.role, 'admin');
  assert.equal(claims(r.json.token).role, 'admin');
  admin = { authorization: 'Bearer ' + r.json.token };
});
test('login: รหัสผู้ชม (VIEWER_CODE) -> role viewer', async () => {
  const r = await call(login, { method: 'POST', body: { code: 'view-pass' } });
  assert.equal(r.json.role, 'viewer');
  viewer = { authorization: 'Bearer ' + r.json.token };
});
test('แก้ไขข้อมูล: ไม่มีโทเคน = 401, ผู้ชม = 403, แอดมิน = ได้', async () => {
  const body = { rppl_v1: { value: [{ id: 1, name: 'ก' }], base: null } };
  assert.equal((await put({}, body)).status, 401);
  assert.equal((await put(viewer, body)).status, 403);
  const r = await put(admin, body);
  assert.equal(r.status, 200);
  assert.equal(r.json.results.rppl_v1.version, 1);
});
test('คีย์ที่ไม่อนุญาต / ค่าผิดรูปแบบ', async () => {
  const r = await put(admin, { evil: { value: {} }, rnotes_v1: { value: 'x' } });
  assert.equal(r.json.results.evil.error, 'key_not_allowed');
  assert.equal(r.json.results.rnotes_v1.error, 'bad_value');
});
test('ภารกิจ (rmis_v1) บันทึกได้ และชนเวอร์ชันถูกปฏิเสธ', async () => {
  let r = await put(admin, { rmis_v1: { value: [{ id: 1, title: 'ลาดตระเวน', dress: 'เครื่องแบบสนาม', team: 'ก, ข' }], base: null } });
  assert.equal(r.json.results.rmis_v1.version, 1);
  r = await put(admin, { rmis_v1: { value: [{ id: 1, title: 'ลาดตระเวน (แก้)' }], base: 1 } });
  assert.equal(r.json.results.rmis_v1.version, 2);
  r = await put(admin, { rmis_v1: { value: [{ id: 9 }], base: 1 } });
  assert.equal(r.json.results.rmis_v1.conflict, true);
  assert.equal(r.json.results.rmis_v1.value[0].title, 'ลาดตระเวน (แก้)');
});
test('ค่าเริ่มต้นปิด: ไม่มีโทเคน = ไม่ได้ข้อมูลอะไรเลย (401)', async () => {
  await put(admin, { rppl_v1: { value: [{ id: 1, name: 'ข้อมูลลับ' }], base: 1 } });
  const r = await call(store, { query: {} });
  assert.equal(r.status, 401);
  assert.equal(JSON.stringify(r.json).includes('ลับ'), false);
  assert.equal((await call(store, { headers: { authorization: 'Bearer garbage.token' }, query: {} })).status, 401);
});
test('ผู้ชมที่ใส่รหัสกำลังพลแล้ว อ่านได้เฉพาะข้อมูลที่อนุญาต ไม่เห็นรูทีน/ผลการปฏิบัติ', async () => {
  await put(admin, { routines_v2: { value: [{ id: 1, title: 'เช็ควิทยุ' }], base: null }, rhist_v1: { value: { '2026-10-17': [] }, base: null }, rdone_v2: { value: {}, base: null } });
  process.env.PUBLIC_VIEW = '1'; // เปิดสาธารณะแบบจงใจ
  let pub; try { pub = await call(store, { query: {} }); } finally { delete process.env.PUBLIC_VIEW; }
  assert.equal(pub.status, 200);
  assert.ok(pub.json.items.rppl_v1 && pub.json.items.rmis_v1);
  for (const k of ['routines_v2', 'rhist_v1', 'rdone_v2']) assert.equal(pub.json.items[k], undefined, k + ' ต้องไม่ถูกส่งให้ผู้ชม');
  const v = await call(store, { headers: viewer, query: {} });
  assert.equal(v.json.items.routines_v2, undefined);
  const a = await call(store, { headers: admin, query: {} });
  assert.ok(a.json.items.routines_v2 && a.json.items.rhist_v1);
});
test('ประวัติเวอร์ชัน: เฉพาะแอดมิน', async () => {
  assert.equal((await call(history, { query: { key: 'rmis_v1' } })).status, 401);
  assert.equal((await call(history, { headers: viewer, query: { key: 'rmis_v1' } })).status, 403);
  let r = await call(history, { headers: admin, query: { key: 'rmis_v1' } });
  assert.equal(r.json.versions.length, 1);          // เก็บเฉพาะเวอร์ชันที่ถูกแทนที่แล้ว (v1)
  r = await call(history, { headers: admin, query: { key: 'rmis_v1', version: '1' } });
  assert.equal(r.json.value[0].title, 'ลาดตระเวน');
});
test('PUBLIC_VIEW=1 เปิดสาธารณะได้ (จงใจเท่านั้น) และเขียนยังต้องเป็นแอดมิน', async () => {
  process.env.PUBLIC_VIEW = '1';
  try {
    assert.equal((await call(store, { query: {} })).status, 200);
    assert.equal((await call(health)).json.setup.publicView, true);
    assert.equal((await put({}, { rppl_v1: { value: [], base: null } })).status, 401);
  } finally { delete process.env.PUBLIC_VIEW; }
});
test('กันเดารหัส: ผิด 5 ครั้งถูกล็อก แม้ใส่รหัสถูกก็ยังเข้าไม่ได้ชั่วคราว', async () => {
  const h = { 'x-forwarded-for': '9.9.9.9' };
  for (let i = 0; i < 5; i++) assert.equal((await call(login, { method: 'POST', headers: h, body: { code: 'nope' + i } })).status, 401);
  const r = await call(login, { method: 'POST', headers: h, body: { code: 'test-pass' } });
  assert.equal(r.status, 429);
  assert.ok(r.json.retry_after > 0);
  // IP อื่นไม่ถูกกระทบ
  assert.equal((await call(login, { method: 'POST', headers: { 'x-forwarded-for': '1.1.1.1' }, body: { code: 'test-pass' } })).status, 200);
});
