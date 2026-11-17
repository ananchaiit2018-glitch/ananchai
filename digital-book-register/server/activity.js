'use strict';
// บันทึกการใช้งาน (log): ใคร ทำอะไร เมื่อไร จากเครื่องไหน
// - เขียนต่อท้ายอย่างเดียว ไม่มีการแก้ไข/ลบผ่านโปรแกรม
// - แยกจาก "ประวัติการแก้ไข" ของแต่ละรายการ (ตาราง history) ซึ่งยังเก็บรายละเอียดก่อน/หลังแก้ไขเหมือนเดิม
const db = require('./db');

const ACTIONS = {
  app_start: 'เปิดโปรแกรม', app_stop: 'ปิดโปรแกรม',
  login: 'เข้าระบบ', login_fail: 'ใส่รหัสผิด', logout: 'ออกจากระบบ',
  duty_start: 'เข้าเวร', duty_change: 'เปลี่ยนคนเข้าเวร',
  book_create: 'ลงหนังสือใหม่', book_update: 'แก้หนังสือ', book_cancel: 'ยกเลิกหนังสือ',
  attach_add: 'แนบไฟล์', attach_remove: 'ลบไฟล์แนบ',
  print: 'สั่งพิมพ์', export: 'โหลดไฟล์ออก',
  settings: 'แก้ตั้งค่า', counters: 'ตั้งเลขทะเบียนใหม่', password: 'เปลี่ยนรหัสผ่าน', font: 'เปลี่ยนฟอนต์', logo: 'เปลี่ยนโลโก้',
  backup: 'สำรองข้อมูล', backup_auto: 'สำรองอัตโนมัติ', restore: 'กู้ข้อมูลคืน',
};
const GROUPS = {
  access: { label: 'เปิดโปรแกรม / เข้าเวร', actions: ['app_start', 'app_stop', 'login', 'login_fail', 'logout', 'duty_start', 'duty_change'] },
  register: { label: 'ลงทะเบียนหนังสือ', actions: ['book_create', 'book_update', 'book_cancel', 'attach_add', 'attach_remove'] },
  output: { label: 'พิมพ์ / โหลดไฟล์', actions: ['print', 'export'] },
  system: { label: 'ตั้งค่า / สำรองข้อมูล', actions: ['settings', 'counters', 'password', 'font', 'logo', 'backup', 'backup_auto', 'restore'] },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,          -- เวลา UTC (ISO)
  day TEXT NOT NULL,         -- วันที่ตามเวลาเครื่อง YYYY-MM-DD (ใช้กรอง)
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ref_id INTEGER,
  machine TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_activity_day ON activity (day);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity (actor);`;
let ready = null;
function conn() { const d = db.get(); if (ready !== d) { d.exec(SCHEMA); ready = d; } return d; }

const p2 = n => String(n).padStart(2, '0');
const localDay = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

function log(action, detail = '', o = {}) {
  try {
    const now = new Date();
    conn().prepare('INSERT INTO activity (at, day, actor, action, detail, ref_id, machine) VALUES (?,?,?,?,?,?,?)')
      .run(now.toISOString(), localDay(now), String(o.actor || '').slice(0, 100), action, String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 500), o.ref || null, String(o.machine || '').slice(0, 60));
  } catch (e) { console.error('บันทึก log ไม่สำเร็จ:', e.message); }   // log ล้มเหลวต้องไม่ทำให้งานหลักล้ม
}

function where(q = {}) {
  const w = [], a = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) { w.push('day >= ?'); a.push(q.from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) { w.push('day <= ?'); a.push(q.to); }
  if (q.actor) { w.push('actor = ?'); a.push(String(q.actor)); }
  if (q.action && ACTIONS[q.action]) { w.push('action = ?'); a.push(q.action); }
  else if (q.action && GROUPS[q.action]) { w.push(`action IN (${GROUPS[q.action].actions.map(() => '?').join(',')})`); a.push(...GROUPS[q.action].actions); }
  if (q.q) { w.push('(detail LIKE ? OR actor LIKE ?)'); const s = `%${String(q.q).replace(/[%_]/g, '')}%`; a.push(s, s); }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
}

function list(q = {}) {
  const d = conn(); const { sql, args } = where(q);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 500);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const total = d.prepare(`SELECT COUNT(*) n FROM activity ${sql}`).get(...args).n;
  const rows = d.prepare(`SELECT * FROM activity ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  const byActor = d.prepare(`SELECT actor, COUNT(*) n FROM activity ${sql} GROUP BY actor ORDER BY n DESC`).all(...args);
  const actors = d.prepare("SELECT DISTINCT actor FROM activity WHERE actor <> '' ORDER BY actor").all().map(r => r.actor);
  return { rows, total, page, limit, byActor, actors, actions: ACTIONS, groups: GROUPS };
}

function forExport(q = {}) {
  const { sql, args } = where(q);
  return conn().prepare(`SELECT * FROM activity ${sql} ORDER BY id ASC`).all(...args);
}

module.exports = { ACTIONS, GROUPS, log, list, forExport };
