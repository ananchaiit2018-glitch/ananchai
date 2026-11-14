'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const cfg = require('./config');
const U = require('./util');

const TEXT_FIELDS = ['book_no', 'from_org', 'to_org', 'subject', 'action', 'remark', 'sender_name', 'receiver_name'];
const FIELD_LABELS = {
  book_no: 'ที่', book_date: 'ลงวันที่', from_org: 'จาก', to_org: 'ถึง', subject: 'เรื่อง', action: 'การปฏิบัติ',
  remark: 'หมายเหตุ', sender_name: 'ผู้ส่ง', receiver_name: 'ผู้รับ', sender_at: 'วันเวลาส่ง', receiver_at: 'วันเวลารับ',
  sender_sig: 'ลายเซ็นผู้ส่ง', receiver_sig: 'ลายเซ็นผู้รับ',
};
const MAX_LEN = { subject: 1000, remark: 1000, default: 300 };

/* ---------- ปีทะเบียน / เลขทะเบียน ---------- */
function registrationYear(settings = db.getSettings()) {
  const m = String(settings.year_mode || 'auto');
  if (/^\d{4}$/.test(m)) return parseInt(m, 10);
  return U.currentBuddhistYear();
}
function label(no, year, s) { return U.formatRegNo(no, year, s.reg_format, parseInt(s.reg_pad, 10) || 0); }

// ออกเลขถัดไปภายในธุรกรรม (เรียกจาก tx เท่านั้น)
function allocate(d, kind, year, s) {
  const row = d.prepare('SELECT next_no FROM counters WHERE kind=? AND year=?').get(kind, year);
  let no;
  if (!row) {
    no = Math.max(1, parseInt(s['start_' + kind], 10) || 1);
    // กันเลขซ้ำกรณีมีรายการอยู่ก่อนแล้ว (เช่น กู้คืนข้อมูลเก่า)
    const mx = d.prepare('SELECT MAX(reg_no) m FROM books WHERE kind=? AND year=?').get(kind, year).m;
    if (mx != null && mx >= no) no = mx + 1;
    d.prepare('INSERT INTO counters(kind,year,next_no) VALUES(?,?,?)').run(kind, year, no + 1);
  } else {
    no = row.next_no;
    d.prepare('UPDATE counters SET next_no=? WHERE kind=? AND year=?').run(no + 1, kind, year);
  }
  return no;
}

function peekNext(kind, year) {
  const d = db.get(); const s = db.getSettings();
  const row = d.prepare('SELECT next_no FROM counters WHERE kind=? AND year=?').get(kind, year);
  const no = row ? row.next_no : Math.max(1, parseInt(s['start_' + kind], 10) || 1);
  return { no, label: label(no, year, s) };
}

function counters() {
  const d = db.get(); const s = db.getSettings();
  const year = registrationYear(s);
  const rows = d.prepare('SELECT kind, year, next_no FROM counters ORDER BY year DESC, kind').all();
  const out = rows.map(r => ({ ...r, next_label: label(r.next_no, r.year, s) }));
  for (const kind of ['in', 'out']) {
    if (!out.find(r => r.kind === kind && r.year === year)) {
      const p = peekNext(kind, year);
      out.unshift({ kind, year, next_no: p.no, next_label: p.label, pending: true });
    }
  }
  return out;
}

// กำหนดเลขถัดไปเอง: ต้องไม่ต่ำกว่าเลขที่เคยใช้แล้ว (รวมรายการที่ยกเลิก) -> ห้ามใช้เลขซ้ำ
function setNext(kind, year, nextNo) {
  if (!['in', 'out'].includes(kind)) throw new U.HttpError(400, 'ประเภทไม่ถูกต้อง');
  year = parseInt(year, 10); nextNo = parseInt(nextNo, 10);
  if (!(year >= 2400 && year <= 2700)) throw new U.HttpError(400, 'ปี พ.ศ. ไม่ถูกต้อง');
  if (!(nextNo >= 1 && nextNo <= 9999999)) throw new U.HttpError(400, 'เลขเริ่มต้นไม่ถูกต้อง');
  return db.tx(d => {
    const mx = d.prepare('SELECT MAX(reg_no) m FROM books WHERE kind=? AND year=?').get(kind, year).m || 0;
    if (nextNo <= mx) throw new U.HttpError(409, `ไม่สามารถตั้งเลขต่ำกว่าหรือเท่ากับเลขที่เคยใช้แล้ว (ใช้ไปถึงเลขที่ ${mx}) เพื่อป้องกันเลขซ้ำ`);
    d.prepare('INSERT INTO counters(kind,year,next_no) VALUES(?,?,?) ON CONFLICT(kind,year) DO UPDATE SET next_no=excluded.next_no').run(kind, year, nextNo);
    return { kind, year, next_no: nextNo };
  });
}

// เปลี่ยนรูปแบบเลขทะเบียนแล้ว ต้องคำนวณป้ายเลขที่แสดงใหม่ทั้งหมด (ลำดับตัวเลขจริงไม่เปลี่ยน)
function relabelAll() {
  const s = db.getSettings();
  db.tx(d => {
    const upd = d.prepare('UPDATE books SET reg_label=? WHERE id=?');
    for (const r of d.prepare('SELECT id, reg_no, year FROM books').all()) upd.run(label(r.reg_no, r.year, s), r.id);
  });
}

/* ---------- ตรวจข้อมูลเข้า ---------- */
function clean(input, { partial = false } = {}) {
  const o = {};
  for (const f of TEXT_FIELDS) {
    if (input[f] === undefined) { if (!partial) o[f] = ''; continue; }
    const v = String(input[f] ?? '').replace(/\r\n/g, '\n').trim();
    const max = MAX_LEN[f] || MAX_LEN.default;
    if (v.length > max) throw new U.HttpError(400, `${FIELD_LABELS[f]} ยาวเกินไป (สูงสุด ${max} ตัวอักษร)`);
    o[f] = v;
  }
  if (input.book_date !== undefined || !partial) {
    if (!U.isISODate(input.book_date)) throw new U.HttpError(400, 'กรุณาระบุ "ลงวันที่" ให้ถูกต้อง');
    o.book_date = input.book_date;
  }
  for (const f of ['sender_at', 'receiver_at']) {
    if (input[f] === undefined) { if (!partial) o[f] = ''; continue; }
    const v = String(input[f] || '');
    if (v && !U.isLocalDateTime(v)) throw new U.HttpError(400, `${FIELD_LABELS[f]} ไม่ถูกต้อง`);
    o[f] = v;
  }
  if (o.subject !== undefined && !o.subject) throw new U.HttpError(400, 'กรุณากรอก "เรื่อง"');
  if (!partial && !o.subject) throw new U.HttpError(400, 'กรุณากรอก "เรื่อง"');
  return o;
}

/* ---------- ลายเซ็น (ภาพ PNG) ---------- */
function saveSignature(dataUrl, bookId, who) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new U.HttpError(400, 'ข้อมูลลายเซ็นไม่ถูกต้อง');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf.length > 1.5 * 1024 * 1024 || buf.readUInt32BE(0) !== 0x89504e47) throw new U.HttpError(400, 'ไฟล์ลายเซ็นไม่ถูกต้อง');
  const name = `b${bookId}_${who}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.png`;
  fs.writeFileSync(path.join(cfg.DIRS.signatures, name), buf);
  return name;
}

function logHistory(d, bookId, action, changes) {
  d.prepare('INSERT INTO history(book_id, action, changes, at) VALUES(?,?,?,?)').run(bookId, action, JSON.stringify(changes || {}), new Date().toISOString());
}

/* ---------- สร้าง / แก้ไข / ยกเลิก ---------- */
function create(kind, input) {
  if (!['in', 'out'].includes(kind)) throw new U.HttpError(400, 'ประเภทหนังสือไม่ถูกต้อง');
  const data = clean(input);
  const token = input.client_token ? String(input.client_token).slice(0, 64) : null;
  const files = [];
  try {
    const result = db.tx(d => {
      if (token) {
        const dup = d.prepare('SELECT id FROM books WHERE client_token=?').get(token);
        if (dup) return { id: dup.id, duplicate: true };
      }
      const s = db.getSettings();
      const year = registrationYear(s);
      const no = allocate(d, kind, year, s);
      const now = new Date().toISOString();
      const r = d.prepare(`INSERT INTO books (kind,year,reg_no,reg_label,reg_date,book_no,book_date,from_org,to_org,subject,action,remark,
        sender_name,receiver_name,sender_at,receiver_at,client_token,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        kind, year, no, label(no, year, s), U.todayISO(), data.book_no, data.book_date, data.from_org, data.to_org, data.subject, data.action,
        data.remark, data.sender_name, data.receiver_name, data.sender_at, data.receiver_at, token, now, now);
      const id = Number(r.lastInsertRowid);
      for (const [who, key] of [['sender', 'sender_sig_data'], ['receiver', 'receiver_sig_data']]) {
        if (input[key]) {
          const name = saveSignature(input[key], id, who); files.push(name);
          d.prepare(`UPDATE books SET ${who}_sig=? WHERE id=?`).run(name, id);
        }
      }
      logHistory(d, id, 'create', { reg_label: label(no, year, s) });
      return { id, duplicate: false };
    });
    return { ...get(result.id), duplicate: result.duplicate };
  } catch (e) {
    for (const f of files) fs.rmSync(path.join(cfg.DIRS.signatures, f), { force: true });
    throw e;
  }
}

function update(id, input) {
  const files = [];
  try {
    db.tx(d => {
      const cur = d.prepare('SELECT * FROM books WHERE id=?').get(id);
      if (!cur) throw new U.HttpError(404, 'ไม่พบรายการ');
      if (cur.status === 'cancelled') throw new U.HttpError(409, 'รายการที่ยกเลิกแล้วไม่สามารถแก้ไขได้');
      const data = clean(input, { partial: true });
      const changes = {};
      for (const [k, v] of Object.entries(data)) if (v !== cur[k]) changes[k] = [cur[k], v];
      const sets = { ...data };
      for (const who of ['sender', 'receiver']) {
        const key = `${who}_sig_data`;
        if (input[key] === undefined) continue;
        if (input[key] === '') {          // ลบลายเซ็น
          if (cur[`${who}_sig`]) { sets[`${who}_sig`] = ''; changes[`${who}_sig`] = ['มี', 'ลบแล้ว']; }
        } else {
          const name = saveSignature(input[key], id, who); files.push(name);
          sets[`${who}_sig`] = name; changes[`${who}_sig`] = [cur[`${who}_sig`] ? 'มี' : 'ไม่มี', 'เซ็นใหม่'];
        }
      }
      if (!Object.keys(changes).length) return;
      sets.updated_at = new Date().toISOString();
      const cols = Object.keys(sets);
      d.prepare(`UPDATE books SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`).run(...cols.map(c => sets[c]), id);
      logHistory(d, id, 'update', changes);   // ภาพลายเซ็นเดิมยังเก็บไว้ในโฟลเดอร์ เป็นหลักฐานย้อนหลัง
    });
    return get(id);
  } catch (e) {
    for (const f of files) fs.rmSync(path.join(cfg.DIRS.signatures, f), { force: true });
    throw e;
  }
}

function cancel(id, reason) {
  reason = String(reason || '').trim();
  if (!reason) throw new U.HttpError(400, 'กรุณาระบุเหตุผลการยกเลิก');
  if (reason.length > 500) throw new U.HttpError(400, 'เหตุผลยาวเกินไป');
  db.tx(d => {
    const cur = d.prepare('SELECT status FROM books WHERE id=?').get(id);
    if (!cur) throw new U.HttpError(404, 'ไม่พบรายการ');
    if (cur.status === 'cancelled') throw new U.HttpError(409, 'รายการนี้ถูกยกเลิกไปแล้ว');
    const now = new Date().toISOString();
    d.prepare("UPDATE books SET status='cancelled', cancel_reason=?, cancelled_at=?, updated_at=? WHERE id=?").run(reason, now, now, id);
    logHistory(d, id, 'cancel', { reason });
  });
  return get(id);   // เลขทะเบียนเดิมยังอยู่ ไม่ถูกนำกลับมาใช้ใหม่
}

/* ---------- อ่าน / ค้นหา ---------- */
function get(id) {
  const d = db.get();
  const b = d.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!b) throw new U.HttpError(404, 'ไม่พบรายการ');
  b.attachments = d.prepare("SELECT id, filename, mime, size, created_at FROM attachments WHERE book_id=? AND removed_at='' ORDER BY id").all(id);
  b.history = d.prepare('SELECT id, action, changes, at FROM history WHERE book_id=? ORDER BY id DESC').all(id).map(h => ({ ...h, changes: JSON.parse(h.changes) }));
  b.has_sender_sig = !!b.sender_sig; b.has_receiver_sig = !!b.receiver_sig;
  delete b.client_token;
  return b;
}

const SEARCH_COLS = ['reg_label', 'book_no', 'from_org', 'to_org', 'subject', 'action', 'remark', 'sender_name', 'receiver_name'];
const likeEsc = s => s.replace(/[\\%_]/g, c => '\\' + c);

function buildWhere(p) {
  const w = []; const a = [];
  if (p.kind === 'in' || p.kind === 'out') { w.push('kind=?'); a.push(p.kind); }
  if (p.year) { w.push('year=?'); a.push(parseInt(p.year, 10)); }
  if (p.month) { w.push("substr(reg_date,6,2)=?"); a.push(U.pad(parseInt(p.month, 10))); }
  if (p.from) { if (!U.isISODate(p.from)) throw new U.HttpError(400, 'วันที่เริ่มต้นไม่ถูกต้อง'); w.push('reg_date>=?'); a.push(p.from); }
  if (p.to) { if (!U.isISODate(p.to)) throw new U.HttpError(400, 'วันที่สิ้นสุดไม่ถูกต้อง'); w.push('reg_date<=?'); a.push(p.to); }
  if (p.status === 'active' || p.status === 'cancelled') { w.push('status=?'); a.push(p.status); }
  if (p.ids) {
    const ids = String(p.ids).split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (!ids.length) throw new U.HttpError(400, 'ไม่ได้เลือกรายการ');
    w.push(`id IN (${ids.map(() => '?').join(',')})`); a.push(...ids);
  }
  const terms = String(p.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  for (const t of terms) {
    w.push('(' + SEARCH_COLS.map(c => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
    for (let i = 0; i < SEARCH_COLS.length; i++) a.push('%' + likeEsc(t) + '%');
  }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
}

const SORTS = { reg: ['year', 'reg_no'], date: ['book_date', 'year', 'reg_no'], regdate: ['reg_date', 'year', 'reg_no'] };
function orderBy(sort, dir) {
  const cols = SORTS[sort] || SORTS.reg; const dd = dir === 'asc' ? 'ASC' : 'DESC';
  return 'ORDER BY ' + cols.map(c => `${c} ${dd}`).join(', ') + (dd === 'DESC' ? ', kind DESC' : ', kind ASC');
}

function list(p) {
  const d = db.get();
  const { where, args } = buildWhere(p);
  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const total = d.prepare(`SELECT COUNT(*) c FROM books ${where}`).get(...args).c;
  const rows = d.prepare(`SELECT id,kind,year,reg_no,reg_label,reg_date,book_no,book_date,from_org,to_org,subject,action,remark,sender_name,receiver_name,status,
      (sender_sig!='') has_sender_sig,(receiver_sig!='') has_receiver_sig,
      (SELECT COUNT(*) FROM attachments a WHERE a.book_id=books.id AND a.removed_at='') att_count
    FROM books ${where} ${orderBy(p.sort, p.dir)} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), rows };
}

// สำหรับพิมพ์/ส่งออก: เรียงตามเลขทะเบียนเสมอ
function listForExport(p) {
  const { where, args } = buildWhere(p);
  const incl = p.cancelled === '0' ? "AND status='active'" : '';
  const w = where ? where + ' ' + incl : (incl ? 'WHERE 1=1 ' + incl : '');
  return db.get().prepare(`SELECT * FROM books ${w} ORDER BY year ASC, reg_no ASC`).all(...args);
}

function dashboard() {
  const d = db.get(); const s = db.getSettings();
  const year = registrationYear(s); const month = U.todayISO().slice(0, 7);
  const cnt = (kind, extra = '', ...a) => d.prepare(`SELECT COUNT(*) c FROM books WHERE kind=? AND status='active' ${extra}`).get(kind, ...a).c;
  return {
    year,
    in_total: cnt('in'), out_total: cnt('out'),
    in_month: cnt('in', "AND substr(reg_date,1,7)=?", month), out_month: cnt('out', "AND substr(reg_date,1,7)=?", month),
    in_year: cnt('in', 'AND year=?', year), out_year: cnt('out', 'AND year=?', year),
    cancelled: d.prepare("SELECT COUNT(*) c FROM books WHERE status='cancelled'").get().c,
    next_in: peekNext('in', year).label, next_out: peekNext('out', year).label,
    recent: d.prepare(`SELECT id,kind,reg_label,book_no,book_date,subject,from_org,to_org,status,created_at FROM books ORDER BY id DESC LIMIT 10`).all(),
  };
}

function suggest(field, q) {
  const allowed = ['from_org', 'to_org', 'action', 'sender_name', 'receiver_name'];
  if (!allowed.includes(field)) throw new U.HttpError(400, 'ฟิลด์ไม่ถูกต้อง');
  const t = '%' + likeEsc(String(q || '').trim()) + '%';
  return db.get().prepare(`SELECT ${field} v, COUNT(*) c FROM books WHERE ${field}!='' AND ${field} LIKE ? ESCAPE '\\' GROUP BY ${field} ORDER BY c DESC, v LIMIT 20`).all(t).map(r => r.v);
}

/* ---------- ไฟล์แนบ ---------- */
const ALLOWED_MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
function sniff(buf) {
  if (buf.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  if (buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  return null;
}
function addAttachment(bookId, originalName, buf) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!ALLOWED_MIME[ext]) throw new U.HttpError(400, 'แนบได้เฉพาะไฟล์ PDF, JPG, PNG');
  const real = sniff(buf);
  if (!real || real !== ALLOWED_MIME[ext]) throw new U.HttpError(400, `ไฟล์ "${originalName}" ไม่ใช่ไฟล์ ${ext.slice(1).toUpperCase()} ที่ถูกต้อง`);
  const stored = crypto.randomBytes(16).toString('hex') + ext;
  return db.tx(d => {
    const b = d.prepare('SELECT status FROM books WHERE id=?').get(bookId);
    if (!b) throw new U.HttpError(404, 'ไม่พบรายการ');
    if (b.status === 'cancelled') throw new U.HttpError(409, 'รายการที่ยกเลิกแล้วไม่สามารถแนบไฟล์ได้');
    fs.writeFileSync(path.join(cfg.DIRS.attachments, stored), buf);
    const r = d.prepare('INSERT INTO attachments(book_id,filename,stored_name,mime,size,created_at) VALUES(?,?,?,?,?,?)')
      .run(bookId, originalName, stored, real, buf.length, new Date().toISOString());
    logHistory(d, bookId, 'attach_add', { filename: originalName });
    return Number(r.lastInsertRowid);
  });
}
function getAttachment(id) {
  const a = db.get().prepare('SELECT * FROM attachments WHERE id=?').get(id);
  if (!a || a.removed_at) throw new U.HttpError(404, 'ไม่พบไฟล์แนบ');
  return { ...a, path: path.join(cfg.DIRS.attachments, a.stored_name) };
}
// ลบไฟล์แนบ = ซ่อนจากรายการและบันทึกประวัติ (ไฟล์จริงยังอยู่ในโฟลเดอร์เพื่อตรวจสอบย้อนหลัง)
function removeAttachment(id) {
  const a = getAttachment(id);
  db.tx(d => {
    d.prepare('UPDATE attachments SET removed_at=? WHERE id=?').run(new Date().toISOString(), id);
    logHistory(d, a.book_id, 'attach_remove', { filename: a.filename });
  });
}
function signaturePath(id, who) {
  const b = db.get().prepare('SELECT sender_sig, receiver_sig FROM books WHERE id=?').get(id);
  const f = b && b[`${who}_sig`];
  if (!f) throw new U.HttpError(404, 'ไม่มีลายเซ็น');
  return path.join(cfg.DIRS.signatures, f);
}

module.exports = { registrationYear, label, create, update, cancel, get, list, listForExport, dashboard, suggest, counters, setNext, peekNext, relabelAll,
  addAttachment, getAttachment, removeAttachment, signaturePath, FIELD_LABELS };
