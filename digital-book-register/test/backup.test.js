'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbr-bk-'));
process.env.DATA_DIR = path.join(tmp, 'data');
const test = require('node:test'), assert = require('node:assert/strict');
const db = require('../server/db'); const books = require('../server/books'); const backup = require('../server/backup');

const dir2 = path.join(tmp, 'usb');
test.before(() => { db.open(); books.create('in', { book_date: '2026-03-05', subject: 'ทดสอบสำรอง' }); });
test.after(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('สำรองซ้ำไปโฟลเดอร์ที่สอง (แฟลชไดรฟ์)', () => {
  db.setSetting('backup_dir2', dir2);
  const r = backup.run('backup'); assert.ok(r.ok, r.error); assert.equal(r.copy2, dir2); assert.ok(fs.existsSync(path.join(dir2, r.name)));
  assert.equal(fs.statSync(path.join(dir2, r.name)).size, r.size);
});
test('ปลายทางที่สองใช้ไม่ได้ -> สำรองหลักยังสำเร็จ แต่มีคำเตือน', () => {
  db.setSetting('backup_dir2', path.join(tmp, 'data', 'register.db', 'x'));   // พาธที่เขียนไม่ได้ (ไฟล์เป็นโฟลเดอร์แม่)
  const r = backup.run('backup'); assert.ok(r.ok); assert.ok(r.warn && /ไม่สำเร็จ/.test(r.warn));
  db.setSetting('backup_dir2', dir2);
});
test('ความถี่สำรองอัตโนมัติ: ยังไม่ถึงเวลาไม่สำรอง / เลยเวลาแล้วสำรอง', () => {
  db.setSetting('auto_backup', '1'); db.setSetting('backup_every_hours', '6');
  const first = backup.autoIfDue(); assert.ok(first && first.ok);
  assert.equal(backup.autoIfDue(), null);                                   // เพิ่งสำรอง
  const f = path.join(backup.backupDir(), first.name); const old = new Date(Date.now() - 7 * 3600 * 1000); fs.utimesSync(f, old, old);
  const again = backup.autoIfDue(); assert.ok(again && again.ok);           // เกิน 6 ชม. แล้ว
  db.setSetting('auto_backup', '0'); const f2 = path.join(backup.backupDir(), again.name); fs.utimesSync(f2, old, old);
  assert.equal(backup.autoIfDue(), null);                                   // ปิดสำรองอัตโนมัติ
});
test('เก็บเฉพาะ N ชุดล่าสุด', () => {
  db.setSetting('backup_keep', '3');
  for (let i = 0; i < 5; i++) { const r = backup.run('auto'); assert.ok(r.ok); const f = path.join(backup.backupDir(), r.name); const t = new Date(Date.now() - (10 - i) * 1000); fs.utimesSync(f, t, t); }
  const autos = backup.list().filter(b => b.name.startsWith('auto-')); assert.ok(autos.length <= 3, 'เหลือ ' + autos.length);
});
test('สำรองตอนปิดโปรแกรม (เปิด/ปิดได้)', () => {
  db.setSetting('backup_on_exit', '1'); const r = backup.onExit(); assert.ok(r && r.ok && r.name.startsWith('exit-'));
  db.setSetting('backup_on_exit', '0'); assert.equal(backup.onExit(), null);
});
