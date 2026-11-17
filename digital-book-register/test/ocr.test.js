'use strict';
// ทดสอบตัวแยกข้อมูลจากข้อความ OCR (บันทึกข้อความ / หนังสือภายนอก) และการจับคู่กับตัวเลือกที่ตั้งไว้
const test = require('node:test'), assert = require('node:assert/strict');
const { parseThaiDoc, bestMatch } = require('../public/ocrparse.js');
const Y = new Date().getFullYear();

test('บันทึกข้อความ: ส่วนราชการ / ที่ ... วันที่ ... / เรื่อง 2 บรรทัด / เรียน', () => {
  const p = parseThaiDoc(`บันทึกข้อความ\nส่วนราชการ ร้อย ฉก.ตชด.๔๔๔ โทร. ๐๗๓-๑๒๓๔๕๖\nที่ นร ๕๑๑๙.๑ (ร้อย ฉก.ตชด.๔๔๔)๘๔/ ๑๕๑๒ วันที่ ๑๗ พฤศจิกายน ${Y + 543}\nเรื่อง ขอส่งรายงานผลการปฏิบัติงาน\nประจําเดือน ตุลาคม\nเรียน ผบ.มว.ฉก.ตชด.๔๔๔๑\nด้วย ...`);
  assert.equal(p.book_no, 'นร ๕๑๑๙.๑ (ร้อย ฉก.ตชด.๔๔๔)๘๔/๑๕๑๒');
  assert.equal(p.book_date, `${Y}-11-17`);
  assert.equal(p.subject, 'ขอส่งรายงานผลการปฏิบัติงาน ประจำเดือน ตุลาคม');
  assert.equal(p.to_org, 'ผบ.มว.ฉก.ตชด.๔๔๔๑'); assert.equal(p.from_org, 'ร้อย ฉก.ตชด.๔๔๔');
});
test('หนังสือภายนอก: วันที่แบบย่อ / ไม่มีส่วนราชการ', () => {
  const p = parseThaiDoc(`ที่ กห ๐๔๐๑/๗๗๘\nกองบัญชาการ\n๓ ต.ค. ${Y + 543}\nเรื่อง แจ้งกำหนดการ\nเรียน ผบ.ร้อย ฉก.ตชด ๔๔๔`);
  assert.equal(p.book_no, 'กห ๐๔๐๑/๗๗๘'); assert.equal(p.book_date, `${Y}-10-03`); assert.equal(p.from_org, '');
});
test('ทนข้อผิดพลาด OCR: ช่องว่างแทรก / ไม้เอกหาย / ปีเพี้ยน / บรรทัดเนื้อหาไม่ถูกมองเป็น ที่', () => {
  const p = parseThaiDoc('ท ี่ ศธ 1234/56 วันที่ ๑๕ พฤศจิกายน ๒๕๒๓\nเรือง ทดสอบ\nเรียน ก\nทั้งนี้ ๑๒๓/๔๕');
  assert.equal(p.book_no, 'ศธ 1234/56'); assert.equal(p.subject, 'ทดสอบ'); assert.equal(p.book_date, `${Y}-11-15`);
});
test('จับคู่กับตัวเลือกที่ตั้งไว้ แม้ตัวเลขไทยเพี้ยน (๔↔๕, ๙↔๓, ๘↔๕)', () => {
  assert.equal(bestMatch('นร๕๑๑๓.๑(ร้อยฉก.ตชด.๕๕๕)๕๕/', ['นร ๕๑๑๙.๑ (ร้อย ฉก.ตชด.๔๔๔)๘๔/']), 'นร ๕๑๑๙.๑ (ร้อย ฉก.ตชด.๔๔๔)๘๔/');
  const opts = ['ผบ.ร้อย ฉก.ตชด ๔๔๔', 'ผบ.มว.ฉก.ตชด.๔๔๔๑'];
  assert.equal(bestMatch('ร้อย ฉก.ตชด.๕๕๕', opts), 'ผบ.ร้อย ฉก.ตชด ๔๔๔');
  assert.equal(bestMatch('ผบ.มว.ฉกุตชด.๕๕๕๑', opts), 'ผบ.มว.ฉก.ตชด.๔๔๔๑');
  assert.equal(bestMatch('กองกำกับการ ๔', opts), null);
});
test('วันที่อ่านเกินมา 1 หลัก (๑๔๔ พฤศจิกายน) -> ใช้ ๑๔', () => {
  const { findDate } = require('../public/ocrparse.js');
  assert.equal(findDate(`วันที่ ๑๔๔ พฤศจิกายน ${Y + 543}`), `${Y}-11-14`);
  assert.equal(findDate(`วันที่ ๙ ธันวาคม ${Y + 543}`), `${Y}-12-09`);
});
