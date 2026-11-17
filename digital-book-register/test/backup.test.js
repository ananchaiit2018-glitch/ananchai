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
test('ความถี่สำรองอัตโนมัติ: ยังไม่ถึงเวลาไม่สำรอง / เลยเวลาแล้วสำรอง', async () => {
  db.setSetting('auto_backup', '1'); db.setSetting('backup_every_hours', '6');
  const first = await backup.autoIfDue(); assert.ok(first && first.ok);
  assert.equal(await backup.autoIfDue(), null);                             // เพิ่งสำรอง
  const f = path.join(backup.backupDir(), first.name); const old = new Date(Date.now() - 7 * 3600 * 1000); fs.utimesSync(f, old, old);
  const again = await backup.autoIfDue(); assert.ok(again && again.ok);           // เกิน 6 ชม. แล้ว
  db.setSetting('auto_backup', '0'); const f2 = path.join(backup.backupDir(), again.name); fs.utimesSync(f2, old, old);
  assert.equal(await backup.autoIfDue(), null);                             // ปิดสำรองอัตโนมัติ
});
test('เก็บเฉพาะ N ชุดล่าสุด', async () => {
  db.setSetting('backup_keep', '3');
  for (let i = 0; i < 5; i++) { const r = await backup.runAll('auto'); assert.ok(r.ok); const f = path.join(backup.backupDir(), r.name); const t = new Date(Date.now() - (10 - i) * 1000); fs.utimesSync(f, t, t); }
  const autos = backup.list().filter(b => b.name.startsWith('auto-')); assert.ok(autos.length <= 3, 'เหลือ ' + autos.length);
});
test('สำรองตอนปิดโปรแกรม (เปิด/ปิดได้)', async () => {
  db.setSetting('backup_on_exit', '1'); const r = await backup.onExit(); assert.ok(r && r.ok && r.name.startsWith('exit-'));
  db.setSetting('backup_on_exit', '0'); assert.equal(await backup.onExit(), null);
});
test('สำรองเป็นไฟล์ Excel ทุกครั้ง (รับ+ส่ง คนละแผ่นงาน) และคัดลอกไปโฟลเดอร์ที่สอง / ปิดได้', async () => {
  const ExcelJS = require('exceljs');
  books.create('out', { book_date: '2026-03-06', subject: 'ส่งทดสอบ Excel', to_org: 'ปลายทาง' });
  db.setSetting('backup_excel', '1'); db.setSetting('backup_dir2', dir2);
  const r = await backup.runAll('backup'); assert.ok(r.ok && r.excel && /^registers-backup-\d{8}-\d{6}\.xlsx$/.test(r.excel), JSON.stringify(r));
  assert.ok(fs.existsSync(path.join(backup.backupDir(), r.excel)) && fs.existsSync(path.join(dir2, r.excel)));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(backup.backupDir(), r.excel));
  assert.deepEqual(wb.worksheets.map(w => w.name), ['ทะเบียนหนังสือรับ', 'ทะเบียนหนังสือส่ง']);
  assert.equal(wb.worksheets[0].getCell('F5').value, 'ทดสอบสำรอง'); assert.equal(wb.worksheets[1].getCell('F5').value, 'ส่งทดสอบ Excel');
  db.setSetting('backup_excel', '0'); const r2 = await backup.runAll('backup'); assert.ok(r2.ok && !r2.excel);
  db.setSetting('backup_excel', '1');
});
test('ไฟล์ Excel อัปเดตอัตโนมัติ: ไฟล์เดียว เพิ่มรายการต่อท้าย / คัดลอกไปโฟลเดอร์ที่สอง / ปิดได้', async () => {
  const ExcelJS = require('exceljs'); const live = require('../server/liveexcel');
  db.setSetting('live_excel', '1'); db.setSetting('backup_dir2', dir2);
  const count = async f => { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); return wb.worksheets.map(w => w.actualRowCount); };
  const s1 = await live.write(); assert.ok(!s1.error, s1.error); assert.ok(fs.existsSync(s1.file) && fs.existsSync(path.join(dir2, live.NAME)));
  const before = await count(s1.file);
  books.create('in', { book_date: '2026-03-07', subject: 'รายการใหม่ต่อท้าย' });
  const s2 = await live.write(); const after = await count(s2.file);
  assert.equal(after[0], before[0] + 1); assert.equal(after[1], before[1]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(s2.file); const ws = wb.worksheets[0];
  assert.equal(ws.getCell('F' + ws.actualRowCount).value, 'รายการใหม่ต่อท้าย');
  assert.ok(!backup.list().some(b => b.name === live.NAME));          // ไม่ปนกับรายการไฟล์สำรอง
  db.setSetting('live_excel', '0'); const t = fs.statSync(s2.file).mtimeMs; await live.write(); assert.equal(fs.statSync(s2.file).mtimeMs, t);
  db.setSetting('live_excel', '1');
});
test('อัปเดตโปรแกรม (ไฟล์โปรแกรมเปลี่ยน) -> สำรองข้อมูลก่อนอัตโนมัติ / เปิดซ้ำเวอร์ชันเดิมไม่สำรอง', () => {
  const uc = require('../server/updatecheck'); const activity = require('../server/activity');
  db.setSetting('code_fp', ''); assert.equal(uc.checkAndBackup(backup, activity).updated, false);      // ครั้งแรก: จำลายนิ้วมือ
  assert.equal(uc.checkAndBackup(backup, activity).updated, false);                                    // เวอร์ชันเดิม
  db.setSetting('code_fp', 'เวอร์ชันเก่า'); const r = uc.checkAndBackup(backup, activity);               // จำลองว่าไฟล์โปรแกรมเปลี่ยน
  assert.ok(r.updated && r.backup.ok && /^before-update-/.test(r.backup.name)); assert.ok(fs.existsSync(path.join(backup.backupDir(), r.backup.name)));
  assert.equal(db.getSettings().code_fp, uc.fingerprint());
});
