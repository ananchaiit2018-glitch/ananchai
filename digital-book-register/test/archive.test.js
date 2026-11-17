'use strict';
// ทดสอบโฟลเดอร์เก็บหนังสือ: Excel 2 ไฟล์ + หนังสือรับ/หนังสือส่ง แยกตามวัน ชื่อไฟล์ 01, 02-1, 02-2 ...
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbr-arc-'));
process.env.DATA_DIR = path.join(tmp, 'data');
const test = require('node:test'), assert = require('node:assert/strict');
const db = require('../server/db'), books = require('../server/books'), archive = require('../server/archive'), live = require('../server/liveexcel');

const ARC = path.join(tmp, 'D', 'ทะเบียนหนังสือ');
const PDF = Buffer.from('%PDF-1.4\n%test\n'), PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), JPG = Buffer.from('ffd8ffe000104a464946', 'hex');
const ls = rel => { const p = path.join(ARC, rel); return fs.existsSync(p) ? fs.readdirSync(p).sort() : []; };
const day = iso => archive.dayFolder(iso);
let A, B, C, Dd, O, today;
test.before(() => {
  db.open(); db.setSetting('archive_dir', ARC);
  A = books.create('in', { book_date: '2026-11-10', subject: 'หนังสือ A' });
  B = books.create('in', { book_date: '2026-11-10', subject: 'หนังสือ B' });
  C = books.create('in', { book_date: '2026-11-10', subject: 'หนังสือ C ไม่มีไฟล์' });
  Dd = books.create('in', { book_date: '2026-11-10', subject: 'หนังสือ D' });
  O = books.create('out', { book_date: '2026-11-10', subject: 'หนังสือส่ง', to_org: 'x' });
  books.addAttachment(A.id, 'หนังสือ ก.pdf', PDF);
  books.addAttachment(B.id, 'หน้า1.png', PNG); books.addAttachment(B.id, 'หน้า2.JPG', JPG);
  books.addAttachment(Dd.id, 'd.pdf', PDF); books.addAttachment(O.id, 'ส่ง.pdf', PDF);
  today = day(A.reg_date);
});
test.after(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('ชื่อโฟลเดอร์วัน = วว ดด ปป (พ.ศ.)', () => {
  assert.equal(archive.dayFolder('2026-11-11'), '111169'); assert.equal(archive.dayFolder('2027-01-05'), '050170');
});
test('จัดไฟล์: 01 / 02-1 02-2 / 03 ไม่มีไฟล์แต่เลขยังนับ / 04 / หนังสือส่งแยกโฟลเดอร์', async () => {
  const s = await live.write(); assert.equal(s.error, '', s.error);
  assert.deepEqual(ls(path.join('หนังสือรับ', today)), ['01.pdf', '02-1.png', '02-2.jpg', '04.pdf']);
  assert.deepEqual(ls(path.join('หนังสือส่ง', today)), ['01.pdf']);
  assert.ok(fs.readFileSync(path.join(ARC, 'หนังสือรับ', today, '01.pdf')).equals(PDF));
  assert.deepEqual(ls('').filter(f => f.endsWith('.xlsx')), ['ทะเบียนหนังสือรับ.xlsx', 'ทะเบียนหนังสือส่ง.xlsx']);
});
test('Excel มีคอลัมน์ไฟล์หนังสือ พร้อมลิงก์ไปไฟล์', async () => {
  const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(ARC, 'ทะเบียนหนังสือรับ.xlsx'));
  const ws = wb.worksheets[0]; assert.equal(wb.worksheets.length, 1); assert.equal(ws.getCell('L4').value, 'ไฟล์หนังสือ');
  const cellOf = subj => { for (let r = 5; r <= ws.actualRowCount; r++) if (ws.getCell('F' + r).value === subj) return ws.getCell('L' + r).value; return null; };
  const a = cellOf('หนังสือ A'); assert.equal(a.hyperlink, `หนังสือรับ/${today}/01.pdf`);
  assert.equal(cellOf('หนังสือ B').text, [`หนังสือรับ/${today}/02-1.png`, `หนังสือรับ/${today}/02-2.jpg`].map(x => x.split('/').join(path.sep)).join('\n'));
  assert.equal(cellOf('หนังสือ C ไม่มีไฟล์'), '');
});
test('เพิ่มไฟล์ที่ 2 -> 01 กลายเป็น 01-1, 01-2 / ลบไฟล์ -> กลับเป็น 01 / ไฟล์อื่นของผู้ใช้ไม่ถูกแตะ', async () => {
  fs.writeFileSync(path.join(ARC, 'หนังสือรับ', today, 'โน้ตของฉัน.txt'), 'x');
  const att = books.addAttachment(A.id, 'แนบเพิ่ม.png', PNG); await live.write();
  assert.deepEqual(ls(path.join('หนังสือรับ', today)), ['01-1.pdf', '01-2.png', '02-1.png', '02-2.jpg', '04.pdf', 'โน้ตของฉัน.txt']);
  books.removeAttachment(att); await live.write();
  assert.deepEqual(ls(path.join('หนังสือรับ', today)), ['01.pdf', '02-1.png', '02-2.jpg', '04.pdf', 'โน้ตของฉัน.txt']);
});
test('ยกเลิกหนังสือ: เลขลำดับในวันไม่เลื่อน / หนังสือวันอื่นไปโฟลเดอร์ของวันนั้น', async () => {
  books.cancel(B.id, 'ทดสอบ'); await live.write();
  assert.ok(ls(path.join('หนังสือรับ', today)).includes('04.pdf'));
  db.get().prepare("UPDATE books SET reg_date='2026-11-11' WHERE id=?").run(Dd.id); await live.write();
  assert.deepEqual(ls(path.join('หนังสือรับ', '111169')), ['01.pdf']);
  assert.ok(!ls(path.join('หนังสือรับ', today)).includes('04.pdf'));
});
test('ปิดการจัดเก็บได้ / ค่าตั้งต้นของโฟลเดอร์', async () => {
  db.setSetting('archive_on', '0'); const r = await live.write(); assert.equal(r.archive, false);
  db.setSetting('archive_on', '1'); db.setSetting('archive_dir', '');
  assert.equal(archive.archiveDir(), process.platform === 'win32' ? archive.defaultDir() : path.join(process.env.DATA_DIR, 'ทะเบียนหนังสือ'));
});
