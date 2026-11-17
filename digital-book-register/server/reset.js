'use strict';
// เริ่มต้นใหม่ (รีเซ็ต): ใช้เมื่อย้ายหน่วย / ส่งต่อเครื่อง / ล้างข้อมูลทดลอง
// 1) สำรองข้อมูลทั้งหมดเป็น zip ก่อนเสมอ (ไม่สำเร็จ = ไม่ลบอะไร)
// 2) ลบทะเบียน ไฟล์แนบในโปรแกรม ประวัติ ตั้งค่า รหัสผ่าน แล้วบีบอัดฐานข้อมูล (ไม่ให้กู้ข้อมูลเก่าจากไฟล์ได้)
// ไม่แตะ: โฟลเดอร์เก็บหนังสือ (Excel + รูปเอกสาร) และไฟล์สำรอง zip
const fs = require('fs'), path = require('path');
const db = require('./db'), cfg = require('./config'), backup = require('./backup'), archive = require('./archive'), U = require('./util');

function info() {
  const d = db.get(); const n = (sql, ...a) => d.prepare(sql).get(...a).n;
  const last = backup.list().filter(b => b.name.endsWith('.zip'))[0];
  return {
    books_in: n("SELECT COUNT(*) n FROM books WHERE kind='in'"), books_out: n("SELECT COUNT(*) n FROM books WHERE kind='out'"),
    attachments: n("SELECT COUNT(*) n FROM attachments WHERE removed_at=''"),
    archive_dir: archive.archiveDir(), backup_dir: backup.backupDir(), last_backup: last ? { name: last.name, at: last.at } : null,
  };
}

async function run() {
  const bdir = backup.backupDir(), adir = archive.archiveDir();
  const b = await backup.runAll('before-reset');
  if (!b.ok) throw new U.HttpError(500, 'สำรองข้อมูลไม่สำเร็จ จึงยังไม่ลบอะไรเลย: ' + (b.error || ''));
  db.tx(d => {
    for (const t of ['history', 'attachments', 'books', 'counters', 'settings']) d.exec(`DELETE FROM ${t}`);
    try { d.exec('DELETE FROM activity'); } catch { /* ยังไม่มีตาราง */ }
  });
  try { db.get().exec('VACUUM'); } catch { /* ไม่สำคัญ */ }
  // ไฟล์ในโปรแกรมของชุดเดิม (เฉพาะโฟลเดอร์เหล่านี้ใน data เท่านั้น)
  for (const k of ['attachments', 'signatures', 'branding']) {
    const dir = cfg.DIRS[k]; if (!dir || !fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  }
  db.setSetting('fresh_start', '1');
  return { ok: true, backup: b.name, excel: b.excel || '', backup_dir: bdir, archive_dir: adir };
}

module.exports = { info, run };
