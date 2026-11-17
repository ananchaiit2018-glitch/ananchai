'use strict';
// ทดสอบเริ่มต้นใหม่ (รีเซ็ต): ยืนยันถูกต้องเท่านั้น / สำรองก่อนลบ / ลบข้อมูลในโปรแกรม / ไม่แตะ Excel+รูปในโฟลเดอร์เก็บหนังสือ / กู้คืนได้
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbr-reset-'));
process.env.DATA_DIR = path.join(tmp, 'data');
const test = require('node:test'), assert = require('node:assert/strict');
const db = require('../server/db'), books = require('../server/books'), live = require('../server/liveexcel'), backup = require('../server/backup');
const { createApp } = require('../server/index');

const ARC = path.join(tmp, 'D', 'ทะเบียนหนังสือ');
const PDF = Buffer.from('%PDF-1.4\n%reset-test\n');
let base, server, cookie = '';
const jj = async (p, o = {}) => {
  const r = await fetch(base + p, { method: o.method || (o.json !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie }, body: o.json !== undefined ? JSON.stringify(o.json) : undefined });
  return { s: r.status, d: await r.json().catch(() => null) };
};
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)).map(x => path.join(e.name, x)) : [e.name]).sort() : [];
let before, excelBefore;
test.before(async () => {
  db.open(); await new Promise(r => { server = createApp().listen(0, '127.0.0.1', r); }); base = 'http://127.0.0.1:' + server.address().port;
  db.setSetting('archive_dir', ARC); db.setSetting('org_name', 'หน่วยเดิม');
  const a = books.create('in', { book_date: '2026-11-10', subject: 'หนังสือหน่วยเดิม' }); books.addAttachment(a.id, 'ก.pdf', PDF);
  books.create('out', { book_date: '2026-11-10', subject: 'ส่งหน่วยเดิม', to_org: 'x' });
  books.setNext('in', books.registrationYear(), 51);
  const s = await live.write(); assert.equal(s.error, '', s.error);
  before = walk(ARC); excelBefore = fs.readFileSync(path.join(ARC, 'ทะเบียนหนังสือรับ.xlsx'));
});
test.after(() => { server.closeAllConnections(); server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('ข้อมูลก่อนรีเซ็ต: ดูจำนวนที่จะถูกลบได้', async () => {
  const i = (await jj('/api/reset/info')).d; assert.equal(i.books_in, 1); assert.equal(i.books_out, 1); assert.equal(i.attachments, 1); assert.equal(i.archive_dir, ARC);
  assert.ok(before.includes('ทะเบียนหนังสือรับ.xlsx') && before.some(f => f.endsWith('01.pdf')));
});
test('ยืนยันไม่ถูกต้อง -> ไม่ลบ / ตั้งรหัสผ่านไว้ต้องใส่รหัสถูก', async () => {
  assert.equal((await jj('/api/reset', { json: { confirm: 'ok' } })).s, 400);
  await jj('/api/settings/password', { json: { current: '', next: 'pass1234' } });
  const lg = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'pass1234' }) }); cookie = (lg.headers.get('set-cookie') || '').split(';')[0];
  assert.equal((await jj('/api/reset', { json: { confirm: 'เริ่มใหม่', password: 'ผิด' } })).s, 403);
  assert.equal(db.get().prepare('SELECT COUNT(*) n FROM books').get().n, 2);
});
test('รีเซ็ต: สำรองก่อน / ล้างข้อมูลในโปรแกรม / ตั้งค่ากลับค่าตั้งต้น / ไม่แตะไฟล์ในโฟลเดอร์เก็บหนังสือ', async () => {
  const r = await jj('/api/reset', { json: { confirm: 'เริ่มใหม่', password: 'pass1234' } }); assert.equal(r.s, 200, JSON.stringify(r.d));
  assert.ok(/^before-reset-.*\.zip$/.test(r.d.backup)); assert.ok(fs.existsSync(path.join(r.d.backup_dir, r.d.backup)));
  const d = db.get(); for (const t of ['books', 'attachments', 'history', 'counters']) assert.equal(d.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, t);
  const s = db.getSettings(); assert.equal(s.org_name, db.DEFAULTS.org_name); assert.equal(s.fresh_start, '1'); assert.ok(!s.password_hash);
  assert.equal(fs.readdirSync(path.join(process.env.DATA_DIR, 'attachments')).length, 0);
  assert.equal(books.peekNext('in', books.registrationYear()).no, 1);                       // เลขเริ่มใหม่
  const act = (await jj('/api/activity')).d.rows; assert.equal(act[0].action, 'reset');      // log เริ่มด้วยการรีเซ็ต
  // โฟลเดอร์เก็บหนังสือเดิม (ค่าตั้งต้นกลับมาชี้ที่อื่น) — จำลองว่าชี้กลับมาที่เดิม: ต้องไม่เขียนทับ/ไม่ลบ
  db.setSetting('archive_dir', ARC); books.create('in', { book_date: '2026-11-17', subject: 'หนังสือหน่วยใหม่' });
  const w = await live.write(); assert.match(w.error, /ชุดเดิม/);
  assert.deepEqual(walk(ARC), before); assert.ok(fs.readFileSync(path.join(ARC, 'ทะเบียนหนังสือรับ.xlsx')).equals(excelBefore));
});
test('เลือกโฟลเดอร์ใหม่ -> ใช้งานต่อได้ / กู้คืนไฟล์สำรองก่อนรีเซ็ต -> ข้อมูลเดิมกลับมา และโฟลเดอร์เดิมใช้ได้อีก', async () => {
  const NEW = path.join(tmp, 'D', 'ทะเบียนหนังสือ-ใหม่'); db.setSetting('archive_dir', NEW);
  const w = await live.write(); assert.equal(w.error, ''); assert.ok(fs.existsSync(path.join(NEW, 'ทะเบียนหนังสือรับ.xlsx')));
  const zip = backup.list().find(b => b.name.startsWith('before-reset-') && b.name.endsWith('.zip')).name;
  backup.restoreFromZip(backup.filePath(zip));
  assert.equal(db.get().prepare("SELECT subject FROM books WHERE kind='in'").get().subject, 'หนังสือหน่วยเดิม');
  assert.equal(db.getSettings().org_name, 'หน่วยเดิม'); assert.equal(archive().archiveDir(), ARC);
  const w2 = await live.write(); assert.equal(w2.error, '');
});
function archive() { return require('../server/archive'); }
