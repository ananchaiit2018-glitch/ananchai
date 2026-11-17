'use strict';
// โฟลเดอร์เก็บหนังสือ (เช่น D:\ทะเบียนหนังสือ) — จัดให้อัตโนมัติทุกครั้งที่บันทึก
//   ทะเบียนหนังสือรับ.xlsx / ทะเบียนหนังสือส่ง.xlsx   (อัปเดตทุกครั้ง โดย liveexcel.js)
//   หนังสือรับ\171169\01.pdf, 02-1.jpg, 02-2.jpg     (แยกตามวันที่ลงทะเบียน วว ดด ปป พ.ศ.)
//   หนังสือส่ง\171169\01.pdf
// ลำดับ 01, 02 ... = ลำดับหนังสือที่ลงทะเบียนในวันนั้น (รวมรายการที่ยกเลิก เพื่อไม่ให้เลขเลื่อน)
// ถ้าหนังสือเดียวมีหลายไฟล์ -> 01-1, 01-2 ...
// ไฟล์ต้นฉบับยังเก็บในโปรแกรม (data\attachments) โฟลเดอร์นี้เป็นสำเนาให้เปิดดูง่าย
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const db = require('./db'), cfg = require('./config');

const KIND_DIR = { in: 'หนังสือรับ', out: 'หนังสือส่ง' };
const OURS = /^\d{2,}(-\d+)?\.[A-Za-z0-9]{1,8}$/;      // ชื่อไฟล์ที่โปรแกรมสร้าง (ไฟล์อื่นในโฟลเดอร์ไม่แตะ)
const MIME_EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

function defaultDir() {
  if (process.platform === 'win32') { try { fs.accessSync('D:\\', fs.constants.W_OK); return 'D:\\ทะเบียนหนังสือ'; } catch { /* ไม่มีไดรฟ์ D */ } }
  return path.join(cfg.DATA_DIR, 'ทะเบียนหนังสือ');
}
function archiveDir() { const s = db.getSettings(); return s.archive_dir ? path.resolve(s.archive_dir) : defaultDir(); }
const enabled = () => db.getSettings().archive_on !== '0';
// 2026-11-17 -> 171169 (วัน เดือน ปี พ.ศ. 2 หลัก)
function dayFolder(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}${m}${String(+y + 543).slice(-2)}`; }

// ป้ายบอกว่าโฟลเดอร์นี้เป็นของข้อมูลชุดไหน — หลังรีเซ็ต (ชุดใหม่) จะไม่เขียนทับ/ลบไฟล์ในโฟลเดอร์ของชุดเดิม
const MARK = '_ชุดข้อมูล-ห้ามลบ.txt';
function instanceId() { let id = db.getSettings().instance_id; if (!id) { id = crypto.randomUUID(); db.setSetting('instance_id', id); } return id; }
function claim(root) {
  const id = instanceId(), f = path.join(root, MARK);
  try {
    if (fs.existsSync(f)) {
      const cur = fs.readFileSync(f, 'utf8').split(/\r?\n/)[0].trim();
      if (cur && cur !== id) return { ok: false, error: `โฟลเดอร์ ${root} เป็นของข้อมูลชุดเดิม (ก่อนเริ่มต้นใหม่) โปรแกรมจะไม่เขียนทับหรือลบไฟล์ในนั้น — เลือกโฟลเดอร์เก็บหนังสือใหม่ที่หน้า "สำรองข้อมูล"` };
      return { ok: true };
    }
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(f, `${id}\r\nไฟล์นี้บอกว่าโฟลเดอร์นี้เป็นของข้อมูลทะเบียนชุดไหน กันโปรแกรมเขียนทับข้อมูลชุดอื่น กรุณาอย่าลบ\r\n`);
    return { ok: true };
  } catch (e) { return { ok: false, error: 'ใช้โฟลเดอร์เก็บหนังสือไม่ได้: ' + (e.code || e.message) }; }
}

// คำนวณว่าไฟล์ไหนควรอยู่ที่ไหน: คืน { files: [{rel, src, size}], links: {book_id: [rel...]} }
function plan() {
  const d = db.get();
  const books = d.prepare('SELECT id, kind, reg_date FROM books ORDER BY id').all();
  const atts = d.prepare("SELECT id, book_id, filename, stored_name, mime, size FROM attachments WHERE removed_at = '' ORDER BY id").all();
  const byBook = new Map(); for (const a of atts) { if (!byBook.has(a.book_id)) byBook.set(a.book_id, []); byBook.get(a.book_id).push(a); }
  const seq = new Map(); const files = [], links = {};
  for (const b of books) {
    const day = dayFolder(b.reg_date), key = b.kind + day; const n = (seq.get(key) || 0) + 1; seq.set(key, n);
    const list = byBook.get(b.id); if (!list) continue;
    const num = String(n).padStart(2, '0');
    list.forEach((a, i) => {
      let ext = path.extname(a.filename || '').toLowerCase(); if (!/^\.[a-z0-9]{1,8}$/.test(ext)) ext = MIME_EXT[a.mime] || '.bin';
      const rel = path.join(KIND_DIR[b.kind], day, (list.length > 1 ? `${num}-${i + 1}` : num) + ext);
      files.push({ rel, src: path.join(cfg.DIRS.attachments, a.stored_name), size: a.size });
      (links[b.id] = links[b.id] || []).push(rel);
    });
  }
  return { files, links };
}

// จัดไฟล์ในโฟลเดอร์ให้ตรงกับแผน: คัดลอกที่ขาด/เปลี่ยน, ลบไฟล์ของโปรแกรมที่ไม่ควรอยู่แล้ว (เช่น 01 -> 01-1, 01-2)
function sync() {
  const root = archiveDir(); const own = claim(root); if (!own.ok) throw new Error(own.error);
  const { files, links } = plan();
  for (const k of Object.values(KIND_DIR)) fs.mkdirSync(path.join(root, k), { recursive: true });
  const want = new Set(files.map(f => path.join(root, f.rel)));
  let copied = 0, removed = 0, failed = 0;
  // ลบไฟล์เก่าที่ไม่อยู่ในแผนก่อน (กันชนชื่อเวลาเปลี่ยน 01.pdf -> 01-1.pdf)
  for (const k of Object.values(KIND_DIR)) {
    const kd = path.join(root, k);
    for (const day of fs.readdirSync(kd)) {
      if (!/^\d{6}$/.test(day)) continue; const dd = path.join(kd, day);
      for (const f of fs.readdirSync(dd)) { const p = path.join(dd, f); if (OURS.test(f) && !want.has(p)) { try { fs.rmSync(p); removed++; } catch { failed++; } } }
      try { if (!fs.readdirSync(dd).length) fs.rmdirSync(dd); } catch { /* ไม่ว่าง/ล็อก */ }
    }
  }
  for (const f of files) {
    const dst = path.join(root, f.rel);
    try {
      if (fs.existsSync(dst) && fs.statSync(dst).size === f.size) continue;
      if (!fs.existsSync(f.src)) { failed++; continue; }
      fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(f.src, dst); copied++;
    } catch { failed++; }
  }
  return { root, links, files: files.length, copied, removed, failed };
}

module.exports = { KIND_DIR, MARK, claim, archiveDir, defaultDir, dayFolder, enabled, plan, sync };
