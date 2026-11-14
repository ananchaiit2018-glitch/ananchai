'use strict';
// สร้าง PDF ทะเบียนหนังสือ A4 แนวนอน ฝังฟอนต์ไทยจากไฟล์จริงที่ผู้ใช้นำเข้า
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const fonts = require('./fonts');
const cfg = require('./config');
const U = require('./util');

const PAGE = { w: 841.89, h: 595.28 };
const M = { top: 28, bottom: 34, left: 36, right: 28 };
const PAD = 3;

// สัดส่วนคอลัมน์ตามแบบสมุดทะเบียนจริง (เรื่องกว้างสุด / ลงวันที่แคบ)
const COLS = {
  in: [
    { key: 'reg_label', title: 'เลขทะเบียนรับ', w: 90, align: 'center' },
    { key: 'book_no', title: 'ที่', w: 100 },
    { key: 'book_date', title: 'ลงวันที่', w: 105, align: 'center' },
    { key: 'from_org', title: 'จาก', w: 105 },
    { key: 'to_org', title: 'ถึง', w: 105 },
    { key: 'subject', title: 'เรื่อง', w: 240 },
    { key: 'action', title: 'การปฏิบัติ', w: 130 },
    { key: 'remark', title: 'หมายเหตุ', w: 110 },
  ],
  out: [
    { key: 'reg_label', title: 'เลขทะเบียนส่ง', w: 90, align: 'center' },
    { key: 'book_no', title: 'ที่', w: 110 },
    { key: 'book_date', title: 'ลงวันที่', w: 105, align: 'center' },
    { key: 'from_org', title: 'จาก', w: 105, optional: true },
    { key: 'to_org', title: 'ถึง', w: 125 },
    { key: 'subject', title: 'เรื่อง', w: 250 },
    { key: 'action', title: 'การปฏิบัติ', w: 120 },
    { key: 'remark', title: 'หมายเหตุ', w: 100 },
  ],
};

// ชุดคอลัมน์ที่ใช้พิมพ์ (ทะเบียนส่งแบบราชการไม่มีช่อง "จาก" เว้นแต่ผู้ใช้เลือก) ปรับความกว้างให้พอดีหน้ากระดาษ
function columnsFor(kind, withFrom) {
  let cols = COLS[kind].filter(c => !c.optional || withFrom);
  const total = PAGE.w - M.left - M.right;
  const sum = cols.reduce((s, c) => s + c.w, 0);
  const k = total / sum;
  return cols.map(c => ({ ...c, w: c.w * k }));
}

function cellText(row, key) {
  if (key === 'book_date') return U.thaiDate(row.book_date);
  if (key === 'subject' && row.status === 'cancelled') return `${row.subject}\n(ยกเลิก: ${row.cancel_reason})`;
  return row[key] || '';
}

const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const gseg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;

// ตัดบรรทัดภาษาไทยตามขอบเขตคำ (ภาษาไทยไม่มีช่องว่างคั่นคำ) ไม่ให้ข้อความล้นช่อง
function wrap(doc, text, width) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    if (para === '') { lines.push(''); continue; }
    const words = seg ? [...seg.segment(para)].map(s => s.segment) : para.split(/(?<=\s)/);
    let cur = '';
    const push = () => { lines.push(cur.replace(/\s+$/, '')); cur = ''; };
    for (const w of words) {
      if (doc.widthOfString(cur + w) <= width) { cur += w; continue; }
      if (cur.trim()) push();
      if (doc.widthOfString(w) <= width) { cur = w.replace(/^\s+/, ''); continue; }
      // คำเดี่ยวยาวเกินช่อง -> ตัดทีละตัวอักษร (grapheme)
      for (const g of (gseg ? [...gseg.segment(w)].map(s => s.segment) : [...w])) {
        if (doc.widthOfString(cur + g) > width && cur) push();
        cur += g;
      }
    }
    if (cur !== '') push();
  }
  return lines;
}

/**
 * @param opts { kind, rows, settings, titleLine (ช่วงเวลา), color (bool), withFrom (bool) }
 * @returns Promise<Buffer>
 */
function build(opts) {
  const { kind, rows, settings, color, withFrom } = opts;
  const f = fonts.forPdf();
  const size = Math.min(Math.max(parseFloat(settings.print_font_size) || 14, 8), 24);
  const dataColor = color ? (/^#[0-9a-fA-F]{6}$/.test(settings.data_color) ? settings.data_color : '#174EA6') : '#000000';
  const cols = columnsFor(kind, withFrom);
  let lineH = size * 1.2;   // ปรับตามฟอนต์จริงหลังโหลด
  const title = kind === 'in' ? 'ทะเบียนหนังสือรับ' : 'ทะเบียนหนังสือส่ง';

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true, autoFirstPage: false,
    info: { Title: title, Author: settings.org_name || 'ทะเบียนหนังสือ', Producer: 'Digital Book Register' },
  });
  doc.registerFont('Reg', f.regular);
  doc.registerFont('Bold', f.bold || f.regular);
  lineH = Math.min(doc.font('Reg').fontSize(size).currentLineHeight(), size * 1.3);
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });

  let logo = null;
  if (settings.logo) { const p = path.join(cfg.DIRS.branding, settings.logo); if (fs.existsSync(p)) logo = p; }
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  let y = 0;

  const bottomY = PAGE.h - M.bottom;
  const ROWS_PER_PAGE = 20;   // ตามแบบสมุดทะเบียนจริง: 1 บรรทัดประ = 1 แถว ความสูงสม่ำเสมอ
  let rowPitch = 0, textOff = 0;
  let tableTop = 0, pageNo = 0;
  const dateLine = opts.dateParts || { d: '', m: '', y: '' };

  function vlines(yTo) {   // เส้นตั้งทึบแบ่งคอลัมน์ + กรอบ
    doc.undash().lineWidth(0.9).strokeColor('#000');
    let x = M.left;
    doc.moveTo(x, tableTop).lineTo(x, yTo).stroke();
    for (const c of cols) { x += c.w; doc.moveTo(x, tableTop).lineTo(x, yTo).stroke(); }
    doc.moveTo(M.left, yTo).lineTo(M.left + tableW, yTo).stroke();
  }
  function dotted(yy) {    // เส้นบรรทัดประ
    doc.lineWidth(0.5).strokeColor('#555').dash(1, { space: 2 });
    doc.moveTo(M.left, yy).lineTo(M.left + tableW, yy).stroke();
    doc.undash();
  }
  function header() {
    doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    pageNo++; y = M.top; doc.fillColor('#000');
    const f1 = f.bold ? 'Bold' : 'Reg';
    let tx = M.left;
    if (logo) { try { doc.image(logo, M.left, y - 2, { fit: [34, 34] }); tx += 40; } catch { /* ภาพเสียข้ามไป */ } }
    doc.font(f1).fontSize(size + 5).text(title, tx, y, { lineBreak: false });
    const org = [settings.dept_name, settings.org_name].filter(Boolean).join('  ');
    doc.font('Reg').fontSize(size - 1);
    if (org) doc.text(org, tx, y + doc.font(f1).fontSize(size + 5).currentLineHeight() * 0.95, { lineBreak: false });
    // วันที่ ...... เดือน ...... พ.ศ. ......
    doc.font('Reg').fontSize(size);
    const seg = [['วันที่', dateLine.d, 46], ['เดือน', dateLine.m, 96], ['พ.ศ.', dateLine.y, 56]];
    const total = seg.reduce((s_, [l, , w]) => s_ + doc.widthOfString(l + ' ') + w + 6, 0);
    let dx = M.left + tableW - total; const dy = y + 4;
    for (const [l, val, w] of seg) {
      doc.fillColor('#000').text(l, dx, dy, { lineBreak: false }); dx += doc.widthOfString(l + ' ');
      doc.lineWidth(0.5).strokeColor('#000').dash(1, { space: 2 }).moveTo(dx, dy + lineH - 2).lineTo(dx + w, dy + lineH - 2).stroke().undash();
      if (val) doc.fillColor(dataColor).text(val, dx, dy, { width: w, align: 'center', lineBreak: false });
      dx += w + 6;
    }
    y += Math.max(doc.font(f1).fontSize(size + 5).currentLineHeight() + (org ? lineH * 0.9 : 0), lineH + 6) + 6;
    // หัวตาราง (สีดำ) ตัดบรรทัดได้ถ้าช่องแคบ
    tableTop = y;
    doc.font('Bold').fontSize(size);
    const hl = cols.map(c => wrap(doc, c.title, c.w - PAD * 2));
    const hh = Math.max(...hl.map(l => l.length)) * lineH + PAD * 2 + 1;
    let x = M.left;
    cols.forEach((c, i) => {
      doc.fillColor('#000').font('Bold').fontSize(size);
      hl[i].forEach((ln, j) => doc.text(ln, x + PAD, y + PAD + j * lineH, { width: c.w - PAD * 2, align: 'center', lineBreak: false }));
      x += c.w;
    });
    y += hh;
    doc.lineWidth(0.9).strokeColor('#000').moveTo(M.left, tableTop).lineTo(M.left + tableW, tableTop).stroke().moveTo(M.left, y).lineTo(M.left + tableW, y).stroke();
    lineMarks.length = 0;
    if (!rowPitch) {
      rowPitch = (bottomY - y) / ROWS_PER_PAGE;
      const th = Math.min(doc.font('Reg').fontSize(size).currentLineHeight(), size * 1.2);
      textOff = Math.max(0, rowPitch - th - 1);
    }
  }
  const lineMarks = [];
  function endPage(fillBlank) {   // เติมบรรทัดประเปล่าถึงท้ายหน้า เหมือนสมุดทะเบียน
    if (fillBlank) while (y + rowPitch <= bottomY + 0.01) { y += rowPitch; dotted(y); }
    vlines(Math.min(y, bottomY));
  }

  header();
  for (const row of rows) {
    doc.font('Reg').fontSize(size);
    const cells = cols.map(c => wrap(doc, cellText(row, c.key), c.w - PAD * 2));
    const nLines = Math.max(...cells.map(l => l.length), 1);
    const rowH = nLines * rowPitch;
    if (y + rowH > bottomY + 0.01) { endPage(true); header(); }
    let x = M.left;
    cols.forEach((c, i) => {
      doc.font('Reg').fontSize(size).fillColor(dataColor);
      cells[i].forEach((ln, j) => doc.text(ln, x + PAD, y + textOff + j * rowPitch, { width: c.w - PAD * 2, align: c.align || 'left', lineBreak: false }));
      x += c.w;
    });
    for (let k = 1; k <= nLines; k++) dotted(y + k * rowPitch);
    y += rowH;
  }
  if (!rows.length) doc.font('Reg').fontSize(size).fillColor('#000').text('ไม่มีรายการในช่วงที่เลือก', M.left, y + 6, { width: tableW, align: 'center', lineBreak: false });
  endPage(true);

  // เลขหน้า
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font('Reg').fontSize(size - 2).fillColor('#000');
    doc.text(`หน้า ${i + 1} / ${range.count}`, M.left, PAGE.h - M.bottom + 10, { width: tableW, align: 'right', lineBreak: false });
    doc.text(`พิมพ์เมื่อ ${U.thaiDateTime(U.nowLocal())}`, M.left, PAGE.h - M.bottom + 10, { width: tableW / 2, align: 'left', lineBreak: false });
  }
  doc.end();
  return done;
}

module.exports = { build, columnsFor, COLS };
