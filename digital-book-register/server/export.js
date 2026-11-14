'use strict';
const ExcelJS = require('exceljs');
const books = require('./books');
const db = require('./db');
const fonts = require('./fonts');
const pdf = require('./pdf');
const U = require('./util');

// แปลงพารามิเตอร์ขอบเขตการพิมพ์ -> เงื่อนไขค้นหา + ข้อความช่วงเวลาบนหัวรายงาน
function resolveScope(q) {
  const kind = q.kind === 'out' ? 'out' : 'in';
  const scope = q.scope || 'all';
  const p = { kind, cancelled: q.cancelled };
  let line = ''; let dateParts = { d: '', m: '', y: '' };
  const yr = parseInt(q.year, 10);
  if (scope === 'selected') { p.ids = q.ids; line = 'เฉพาะรายการที่เลือก'; }
  else if (scope === 'month') {
    const m = parseInt(q.month, 10);
    if (!(m >= 1 && m <= 12) || !yr) throw new U.HttpError(400, 'กรุณาเลือกเดือนและปี');
    dateParts = { d: '', m: U.MONTHS[m - 1], y: String(yr) }; p.year = yr; p.month = m; line = `ประจำเดือน ${U.MONTHS[m - 1]} พ.ศ. ${yr}`;
  } else if (scope === 'year') {
    if (!yr) throw new U.HttpError(400, 'กรุณาเลือกปี');
    dateParts = { d: '', m: '', y: String(yr) }; p.year = yr; line = `ประจำปี พ.ศ. ${yr}`;
  } else if (scope === 'range') {
    if (!q.from || !q.to) throw new U.HttpError(400, 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุด');
    p.from = q.from; p.to = q.to; line = `ตั้งแต่ ${U.thaiDate(q.from, true)} ถึง ${U.thaiDate(q.to, true)}`;
  } else { line = 'ทั้งหมด'; }
  return { p, kind, line, dateParts };
}

const HEADERS = {
  in: ['เลขทะเบียนรับ', 'ที่', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'การปฏิบัติ', 'หมายเหตุ', 'ผู้รับหนังสือ', 'วันเวลารับ', 'สถานะ'],
  out: ['เลขทะเบียนส่ง', 'ที่', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'การปฏิบัติ', 'หมายเหตุ', 'ผู้รับหนังสือ', 'วันเวลารับ', 'สถานะ'],
};
function toRow(b) {
  return [b.reg_label, b.book_no, U.thaiDate(b.book_date), b.from_org, b.to_org, b.subject, b.action, b.remark,
    U.shortName(b.receiver_name), U.thaiDateTime(b.receiver_at),
    b.status === 'cancelled' ? `ยกเลิก (${b.cancel_reason})` : 'ใช้งาน'];
}

function titleOf(kind) { return kind === 'in' ? 'ทะเบียนหนังสือรับ' : 'ทะเบียนหนังสือส่ง'; }

async function makePdf(q) {
  const { p, kind, line, dateParts } = resolveScope(q);
  const rows = books.listForExport(p);
  return pdf.build({ dateParts, kind, rows, settings: db.getSettings(), titleLine: line, color: q.color !== '0', withFrom: q.withFrom === '1', pageBy: q.pageBy === 'day' ? 'day' : 'continuous' });
}

async function makeXlsx(q) {
  const { p, kind, line } = resolveScope(q);
  const rows = books.listForExport(p);
  const s = db.getSettings();
  const fam = (fonts.status().regular || {}).family || undefined;   // ใช้ชื่อฟอนต์จากไฟล์ที่นำเข้าเท่านั้น
  const color = q.color !== '0' ? 'FF' + (s.data_color || '#174EA6').slice(1).toUpperCase() : 'FF000000';
  const wb = new ExcelJS.Workbook();
  wb.creator = s.org_name || 'Digital Book Register';
  const ws = wb.addWorksheet(titleOf(kind), { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const hdr = HEADERS[kind];
  const widths = [14, 18, 14, 26, 26, 46, 18, 20, 20, 18, 16];
  ws.columns = widths.map(w => ({ width: w }));
  const base = f => ({ ...(fam ? { name: fam } : {}), ...f });
  ws.mergeCells(1, 1, 1, hdr.length); ws.getCell('A1').value = titleOf(kind);
  ws.getCell('A1').font = base({ size: 18, bold: true }); ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells(2, 1, 2, hdr.length); ws.getCell('A2').value = [s.dept_name, s.org_name].filter(Boolean).join('  ');
  ws.getCell('A2').font = base({ size: 14 }); ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.mergeCells(3, 1, 3, hdr.length); ws.getCell('A3').value = line;
  ws.getCell('A3').font = base({ size: 14 }); ws.getCell('A3').alignment = { horizontal: 'center' };
  const hr = ws.getRow(4); hdr.forEach((h, i) => { hr.getCell(i + 1).value = h; });
  hr.eachCell(c => { c.font = base({ size: 14, bold: true, color: { argb: 'FF000000' } }); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } }; });
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  rows.forEach((b, idx) => {
    const r = ws.getRow(5 + idx); toRow(b).forEach((v, i) => { r.getCell(i + 1).value = v; });
    r.eachCell({ includeEmpty: true }, (c, n) => { c.font = base({ size: 14, color: { argb: color } }); c.alignment = { vertical: 'top', wrapText: true, horizontal: n === 1 || n === 3 ? 'center' : 'left' }; c.border = border; });
  });
  hr.eachCell(c => { c.border = border; });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + Math.max(rows.length, 1), column: hdr.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csvCell(v) {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;           // กัน CSV/Excel formula injection
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function makeCsv(q) {
  const { p, kind } = resolveScope(q);
  const rows = books.listForExport(p);
  const lines = [HEADERS[kind], ...rows.map(toRow)].map(r => r.map(csvCell).join(','));
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');   // BOM ให้ Excel อ่านภาษาไทยถูกต้อง
}

module.exports = { makePdf, makeXlsx, makeCsv, titleOf, resolveScope };
