// ทดสอบตัวซิงค์ฝั่งหน้าเว็บ (ดึงโค้ดจริงจาก public/index.html) กับ API จริง โดยจำลองเครื่อง 2 เครื่อง
process.env.USE_MEMORY_DB = '1';
process.env.APP_PASSCODE = 'test-pass';
process.env.VIEWER_CODE = 'view-pass';
process.env.PUBLIC_VIEW = '1'; // ชุดทดสอบเดิมทดสอบโหมดเปิดสาธารณะ ส่วนโหมดปิดอยู่ท้ายไฟล์
process.env.SESSION_SECRET = 'x'.repeat(32);
delete process.env.DATABASE_URL;

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const handlers = {
  '/api/health': require('../api/health'), '/api/login': require('../api/login'),
  '/api/store': require('../api/store'), '/api/history': require('../api/history')
};

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const m = html.match(/<script>\s*(window\.DB=[\s\S]*?\}\)\(\);)\s*<\/script>/);
if (!m) throw new Error('ไม่พบตัวซิงค์ใน public/index.html');
const SRC = m[1];

function callHandler(handler, req) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
      end(s) { resolve({ status: this.statusCode, json: s ? JSON.parse(s) : null }); } };
    Promise.resolve(handler(req, res)).catch(() => resolve({ status: 500, json: null }));
  });
}

function device({ online = true } = {}) {
  const mem = new Map();
  class Storage { getItem(k) { return mem.has(k) ? mem.get(k) : null; } setItem(k, v) { mem.set(k, String(v)); } removeItem(k) { mem.delete(k); } }
  const ctx = {
    Storage, localStorage: new Storage(), document: { hidden: false, addEventListener() {} },
    addEventListener() {}, setInterval() { return 0; }, setTimeout, clearTimeout, AbortController, console, atob: globalThis.atob,
    state: { online },
    fetch: async (url, opts = {}) => {
      if (!ctx.state.online) throw new Error('offline');
      const [p, qs] = url.split('?');
      const h = handlers[p];
      if (!h) return { status: 404, headers: { get: () => 'text/html' }, json: async () => ({}) };
      const headers = {}; for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v;
      const r = await callHandler(h, { method: opts.method || 'GET', headers, body: opts.body ? JSON.parse(opts.body) : undefined, query: Object.fromEntries(new URLSearchParams(qs || '')) });
      return { status: r.status, headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : '') }, json: async () => r.json };
    }
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(SRC, ctx);
  const ls = ctx.localStorage;
  return { ctx, DB: ctx.DB, ls, put: (k, v) => ls.setItem(k, JSON.stringify(v)), get: (k) => JSON.parse(ls.getItem(k) || 'null') };
}

let A, B;
test('ไม่มีเซิร์ฟเวอร์ (โฮสต์แบบสถิต) -> ออฟไลน์ แต่ข้อมูลในเครื่องยังบันทึกได้', async () => {
  const d = device({ online: false });
  const states = []; d.DB.bind({ reload() {}, onState: (s) => states.push(s) });
  await d.DB.ready;
  d.put('rppl_v1', [{ id: 1, name: 'ก' }]);
  assert.deepEqual(d.get('rppl_v1'), [{ id: 1, name: 'ก' }]);
  assert.ok(states.includes('off'));
});
test('ไม่ล็อกอิน = โหมดผู้ชม (อ่านได้) ; รหัสผิดถูกปฏิเสธ ; รหัสแอดมินได้สิทธิ์แก้ไข', async () => {
  A = device(); const states = []; A.DB.bind({ reload() {}, onState: (s) => states.push(s) });
  await A.DB.ready;
  assert.equal(A.DB.role, 'viewer');
  assert.equal(A.DB.publicView, true);
  assert.equal((await A.DB.login('wrong')).ok, false);
  assert.equal((await A.DB.login('test-pass')).ok, true);
  assert.equal(A.DB.role, 'admin');
});
test('ไม่มีเซิร์ฟเวอร์ที่เคยเห็น = local (ใช้งานเต็มในเครื่อง)', async () => {
  const d = device({ online: false }); d.DB.bind({ reload() {}, onState() {} }); await d.DB.ready;
  assert.equal(d.DB.role, 'local');
});
test('A เขียนข้อมูล -> ซิงค์ขึ้นเซิร์ฟเวอร์ -> เครื่อง B ดึงลงมาได้', async () => {
  A.put('rppl_v1', [{ id: 1, name: 'ก' }]);
  A.put('rroster_v1', { '2026-10-17': { nco: 'สิบเวร ก' } });
  await A.DB.sync();
  B = device(); B.DB.bind({ reload() {}, onState() {} });
  await B.DB.ready; await B.DB.login('test-pass');
  assert.equal(B.DB.role, 'admin');
  assert.deepEqual(B.get('rppl_v1'), [{ id: 1, name: 'ก' }]);
  assert.equal(B.get('rroster_v1')['2026-10-17'].nco, 'สิบเวร ก');
});
test('ผู้ชม: ดึงได้เฉพาะข้อมูลที่อนุญาต, แก้ในเครื่องแล้วไม่ถูกส่งขึ้นเซิร์ฟเวอร์', async () => {
  A.put('routines_v2', [{ id: 1, title: 'เช็ควิทยุ' }]);
  A.put('rmis_v1', [{ id: 1, title: 'ภารกิจ ก', dress: 'เครื่องแบบสนาม', team: 'ข, ค' }]);
  await A.DB.sync();
  const V = device(); V.DB.bind({ reload() {}, onState() {} }); await V.DB.ready;
  assert.equal(V.DB.role, 'viewer');
  assert.equal(V.get('rmis_v1')[0].dress, 'เครื่องแบบสนาม');       // เห็นภารกิจ+การแต่งกาย+ผู้ไป
  assert.equal(V.get('rppl_v1').length, 1);                          // เห็นกำลังพล
  assert.equal(V.get('routines_v2'), null);                          // ไม่ได้รับข้อมูลรูทีน
  V.put('rmis_v1', [{ id: 99, title: 'ผู้ชมแอบแก้' }]);
  await V.DB.sync();
  await A.DB.sync();
  assert.equal(A.get('rmis_v1')[0].title, 'ภารกิจ ก');               // ข้อมูลจริงไม่ถูกแตะ
});
test('รหัสผู้ชม (VIEWER_CODE) ได้ role viewer', async () => {
  const V = device(); V.DB.bind({ reload() {}, onState() {} }); await V.DB.ready;
  assert.equal((await V.DB.login('view-pass')).ok, true);
  assert.equal(V.DB.role, 'viewer');
});
test('โหมดปิด (ค่าเริ่มต้นของระบบ): ต้องใส่รหัสก่อนถึงจะดูได้', async () => {
  process.env.PUBLIC_VIEW = '0';
  try {
    const D = device(); const states = []; D.DB.bind({ reload() {}, onState: (s) => states.push(s) }); await D.DB.ready;
    assert.equal(D.DB.publicView, false);
    assert.equal(states[states.length - 1], 'login');
  } finally { process.env.PUBLIC_VIEW = '1'; }
});
test('แก้พร้อมกัน 2 เครื่อง -> รวมตาม id ไม่มีรายการหาย', async () => {
  A.put('rppl_v1', [{ id: 1, name: 'ก' }, { id: 2, name: 'ข' }]);
  B.put('rppl_v1', [{ id: 1, name: 'ก' }, { id: 3, name: 'ค' }]);
  await A.DB.sync();            // A ขึ้นก่อน
  await B.DB.sync();            // B ชนเวอร์ชัน -> รวมแล้วส่งซ้ำ
  await A.DB.sync();            // A ดึงผลรวม
  const ids = (x) => x.get('rppl_v1').map((p) => p.id).sort();
  assert.deepEqual(ids(A), [1, 2, 3]);
  assert.deepEqual(ids(B), [1, 2, 3]);
});
test('ตั้งค่าร่วม (ผลัดเวร/ชื่อหน่วย) ซิงค์ข้ามเครื่อง แต่ค่าส่วนตัว (ธีม) ไม่ข้าม', async () => {
  A.put('rsettings', { theme: 'dark', snd: 'siren', unit: 'หน่วย 444', shifts: [{ n: 'ผลัด 1', t: '08:00-14:00' }] });
  await A.DB.sync();
  B.put('rsettings', { theme: 'light' });
  await B.DB.sync();
  const sb = B.get('rsettings');
  assert.equal(sb.unit, 'หน่วย 444');
  assert.equal(sb.shifts[0].t, '08:00-14:00');
  assert.equal(sb.theme, 'light');   // ธีมของ B ไม่ถูกทับ
  assert.equal(sb.snd, undefined);   // ค่าส่วนตัวของ A ไม่ถูกส่งมา
});
test('เครื่องใหม่ที่มีข้อมูลเดิมในเครื่องอยู่แล้ว ต่อเข้ากับเซิร์ฟเวอร์ที่มีข้อมูล -> รวม ไม่ทับ', async () => {
  const C = device();
  C.put('rnotes_v1', [{ id: 77, text: 'โน้ตเดิมในเครื่อง C' }]);
  C.put('rppl_v1', [{ id: 9, name: 'ง' }]);
  C.DB.bind({ reload() {}, onState() {} });
  await C.DB.ready; await C.DB.login('test-pass');
  const ids = C.get('rppl_v1').map((p) => p.id).sort();
  assert.deepEqual(ids, [1, 2, 3, 9]);           // ของเดิมบนเซิร์ฟเวอร์ + ของเครื่อง C
  assert.equal(C.get('rnotes_v1')[0].id, 77);
  await A.DB.sync();
  assert.ok(A.get('rppl_v1').some((p) => p.id === 9)); // A เห็นของ C ด้วย
});
test('ประวัติเวอร์ชัน: ดูและกู้คืนข้อมูลเก่าได้', async () => {
  const v = await A.DB.versions('rppl_v1');
  assert.ok(v.versions.length >= 1);
  const old = await A.DB.version('rppl_v1', v.versions[v.versions.length - 1].version);
  assert.ok(Array.isArray(old.value));
  A.DB.restore('rppl_v1', old.value);
  assert.deepEqual(A.get('rppl_v1'), old.value);
});
test('ส่งออก / นำเข้า (ย้ายข้อมูลจาก artifact ไปเว็บ Vercel)', async () => {
  const text = A.DB.exportAll();
  const D = device();
  assert.ok(D.DB.importAll(text) >= 3);
  assert.deepEqual(D.get('rroster_v1'), A.get('rroster_v1'));
  assert.equal(D.DB.importAll('ไม่ใช่ json'), -1);
  assert.equal(D.DB.importAll('{"app":"other"}'), -1);
});

test('โหมดปิด: เครื่องที่ไม่มีรหัสไม่ได้ข้อมูลเลย; รหัสกำลังพลเห็นเฉพาะส่วนที่อนุญาต; รหัสแอดมินเห็นครบ', async () => {
  process.env.PUBLIC_VIEW = '0';
  try {
    const N = device(); N.DB.bind({ reload() {}, onState() {} }); await N.DB.ready;
    assert.equal(N.DB.state, 'login');
    assert.equal(N.get('rppl_v1'), null);                      // ไม่มีข้อมูลหลุดมาที่เครื่องนี้
    assert.equal(N.get('rmis_v1'), null);
    const V = device(); V.DB.bind({ reload() {}, onState() {} }); await V.DB.ready;
    assert.equal((await V.DB.login('view-pass')).ok, true);
    assert.equal(V.DB.role, 'viewer');
    assert.ok(V.get('rppl_v1'));                               // กำลังพลเห็นกำลังพล
    assert.equal(V.get('routines_v2'), null);                  // แต่ไม่เห็นรูทีน
    const Ad = device(); Ad.DB.bind({ reload() {}, onState() {} }); await Ad.DB.ready;
    assert.equal((await Ad.DB.login('test-pass')).role === undefined, true); // login() คืน {ok}
    assert.equal(Ad.DB.role, 'admin');
    assert.ok(Ad.get('routines_v2'));                          // แอดมินเห็นครบ
  } finally { process.env.PUBLIC_VIEW = '1'; }
});
