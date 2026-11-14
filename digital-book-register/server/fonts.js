'use strict';
// จัดการไฟล์ฟอนต์ที่ผู้ใช้นำเข้า (เช่น THSarabunNew.ttf / THSarabunNew Bold.ttf)
// ระบบไม่ตั้งชื่อฟอนต์เอง: ชื่อฟอนต์อ่านจากไฟล์จริงเท่านั้น
const fs = require('fs');
const path = require('path');
const fontkit = require('fontkit');
const cfg = require('./config');
const U = require('./util');

const KINDS = ['regular', 'bold'];
const cache = new Map();

function fileOf(kind) {
  const f = fs.readdirSync(cfg.DIRS.fonts).find(n => n.startsWith(kind + '.'));
  return f ? path.join(cfg.DIRS.fonts, f) : null;
}

function inspect(buf) {
  let font;
  try { font = fontkit.create(buf); } catch { throw new U.HttpError(400, 'ไม่สามารถอ่านไฟล์ฟอนต์นี้ได้ (รองรับ .ttf .otf .woff)'); }
  if (font.fonts) throw new U.HttpError(400, 'ไม่รองรับไฟล์ฟอนต์แบบ Collection (.ttc) กรุณาใช้ไฟล์ .ttf');
  if (!font.hasGlyphForCodePoint(0x0e01) || !font.hasGlyphForCodePoint(0x0e49)) throw new U.HttpError(400, 'ฟอนต์นี้ไม่มีตัวอักษรภาษาไทย กรุณาเลือกไฟล์ฟอนต์ไทย เช่น THSarabunNew.ttf');
  return { family: font.familyName || '', full: font.fullName || '', style: font.subfamilyName || '' };
}

function extOf(buf) {
  const m = buf.slice(0, 4).toString('latin1');
  if (m === 'wOFF') return '.woff';
  if (m === 'OTTO') return '.otf';
  if (m === 'wOF2') throw new U.HttpError(400, 'ไม่รองรับ .woff2 กรุณาใช้ .ttf หรือ .otf');
  return '.ttf';
}

function save(kind, buf) {
  if (!KINDS.includes(kind)) throw new U.HttpError(400, 'ชนิดฟอนต์ไม่ถูกต้อง');
  if (buf.length < 1000 || buf.length > 20 * 1024 * 1024) throw new U.HttpError(400, 'ไฟล์ฟอนต์ไม่ถูกต้อง');
  const info = inspect(buf);
  const ext = extOf(buf);
  remove(kind);
  fs.writeFileSync(path.join(cfg.DIRS.fonts, kind + ext), buf);
  cache.clear();
  return info;
}
function remove(kind) {
  const f = fileOf(kind);
  if (f) fs.rmSync(f, { force: true });
  cache.clear();
}

function status() {
  const out = {};
  for (const k of KINDS) {
    const f = fileOf(k);
    if (!f) { out[k] = null; continue; }
    const st = fs.statSync(f);
    const key = f + st.mtimeMs;
    if (!cache.has(key)) { try { cache.set(key, inspect(fs.readFileSync(f))); } catch { cache.set(key, { family: '', full: '', style: '' }); } }
    out[k] = { ...cache.get(key), file: path.basename(f), size: st.size, version: Math.floor(st.mtimeMs) };
  }
  return out;
}

// ใช้ตอนสร้าง PDF: ต้องมีฟอนต์ปกติที่นำเข้าแล้วเท่านั้น
function forPdf() {
  const reg = fileOf('regular');
  if (!reg) throw new U.HttpError(409, 'ยังไม่ได้นำเข้าไฟล์ฟอนต์ TH Sarabun กรุณาไปที่ "ตั้งค่าระบบ" > "ฟอนต์" แล้วนำเข้าไฟล์ฟอนต์ก่อน', 'FONT_MISSING');
  const bold = fileOf('bold');
  return { regular: fs.readFileSync(reg), bold: bold ? fs.readFileSync(bold) : null, family: status().regular.family };
}

module.exports = { fileOf, save, remove, status, forPdf };
