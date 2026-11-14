'use strict';
// ฐานข้อมูล SQLite (โมดูล node:sqlite ที่มากับ Node.js ไม่ต้องคอมไพล์เพิ่ม)
// WAL + synchronous=FULL = ข้อมูลที่บันทึกแล้วไม่หายแม้ไฟดับกลางคัน
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- ตัวนับเลขทะเบียน แยกตามประเภท (in/out) และปี พ.ศ.  next_no = เลขถัดไปที่จะออก (ไม่ถอยหลังเด็ดขาด)
CREATE TABLE IF NOT EXISTS counters (
  kind TEXT NOT NULL CHECK (kind IN ('in','out')),
  year INTEGER NOT NULL,
  next_no INTEGER NOT NULL,
  PRIMARY KEY (kind, year)
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('in','out')),
  year INTEGER NOT NULL,            -- ปี พ.ศ. ของชุดเลขทะเบียน
  reg_no INTEGER NOT NULL,          -- ลำดับเลขทะเบียน
  reg_label TEXT NOT NULL,          -- เลขทะเบียนที่แสดง เช่น 001/2569
  reg_date TEXT NOT NULL,           -- วันที่ลงทะเบียน (ค.ศ. YYYY-MM-DD)
  book_no TEXT NOT NULL DEFAULT '', -- ที่ (เลขที่หนังสือราชการ) แยกจากเลขทะเบียนโดยสิ้นเชิง
  book_date TEXT NOT NULL,          -- ลงวันที่ (ค.ศ. YYYY-MM-DD)
  from_org TEXT NOT NULL DEFAULT '',
  to_org TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  receiver_name TEXT NOT NULL DEFAULT '',
  sender_at TEXT NOT NULL DEFAULT '',
  receiver_at TEXT NOT NULL DEFAULT '',
  sender_sig TEXT NOT NULL DEFAULT '',
  receiver_sig TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  cancel_reason TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT NOT NULL DEFAULT '',
  client_token TEXT UNIQUE,         -- กันกดบันทึกซ้ำ
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, year, reg_no)       -- กันเลขซ้ำระดับฐานข้อมูล
);
CREATE INDEX IF NOT EXISTS idx_books_kind_year ON books (kind, year, reg_no);
CREATE INDEX IF NOT EXISTS idx_books_reg_date ON books (reg_date);
CREATE INDEX IF NOT EXISTS idx_books_book_date ON books (book_date);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id),
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  removed_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_att_book ON attachments (book_id);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id),
  action TEXT NOT NULL,
  changes TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hist_book ON history (book_id);
`;

function open(file = cfg.DB_FILE) {
  fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
  for (const d of Object.values(cfg.DIRS)) fs.mkdirSync(d, { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');
  db.exec(SCHEMA);
  if (!db.prepare('PRAGMA table_info(history)').all().some(c => c.name === 'actor')) db.exec("ALTER TABLE history ADD COLUMN actor TEXT NOT NULL DEFAULT ''");
  return db;
}
function close() { if (db) { try { db.close(); } catch { /* ignore */ } db = null; } }
function get() { if (!db) throw new Error('ฐานข้อมูลยังไม่เปิด'); return db; }

// ธุรกรรมแบบ IMMEDIATE: ล็อกการเขียนทันที ป้องกันเลขซ้ำแม้มีหลายเครื่อง/หลายโปรเซสบันทึกพร้อมกัน
function tx(fn) {
  const d = get();
  d.exec('BEGIN IMMEDIATE');
  try { const r = fn(d); d.exec('COMMIT'); return r; }
  catch (e) { try { d.exec('ROLLBACK'); } catch { /* ignore */ } throw e; }
}

const DEFAULTS = {
  duty_title: 'ผู้เข้าเวร วิทยุ',
  duty_unit: 'ประจำ มว.ฉก.ตชด.๔๔๔๑',
  duty_officers: JSON.stringify(['ส.ต.ท.อนันต์ชัย แก้วหัวไทร', 'ส.ต.ท.เนวิน แดงแจ้', 'ส.ต.ท.ซูไฮมีย์ บาฮา']),
  org_name: '',
  dept_name: '',
  year_mode: 'auto',       // auto = ใช้ปี พ.ศ. ตามวันที่ของเครื่อง / หรือระบุปีเอง เช่น 2569
  reg_format: '{no}/{year}',
  reg_pad: '3',
  start_in: '1',
  start_out: '1',
  ui_font_size: '20',
  print_font_size: '16',
  data_color: '#174EA6',
  logo: '',
  backup_dir: '',
  auto_backup: '1',
  password_hash: '',
};
function getSettings() {
  const out = { ...DEFAULTS };
  for (const r of get().prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
function setSetting(key, value) {
  get().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}

module.exports = { open, close, get, tx, getSettings, setSetting, DEFAULTS };
