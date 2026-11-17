'use strict';
// ตรวจว่าโปรแกรมถูกอัปเดต (ไฟล์โปรแกรมเปลี่ยน) ตั้งแต่เปิดครั้งก่อนหรือไม่
// ถ้าใช่ -> สำรองข้อมูลให้อัตโนมัติก่อนใช้งานเวอร์ชันใหม่ (before-update-....zip) และบันทึกใน log
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const cfg = require('./config'), db = require('./db');

function fingerprint() {
  const h = crypto.createHash('sha1');
  for (const dir of ['server', 'public']) {
    const d = path.join(cfg.ROOT, dir);
    for (const f of fs.readdirSync(d).filter(n => /\.(js|css|html)$/.test(n)).sort()) h.update(f).update(fs.readFileSync(path.join(d, f)));
  }
  return h.digest('hex').slice(0, 16);
}

// คืน { updated, backup? }
function checkAndBackup(backup, activity) {
  const fp = fingerprint(); const prev = db.getSettings().code_fp || '';
  if (prev === fp) return { updated: false };
  db.setSetting('code_fp', fp);
  if (!prev) return { updated: false, first: true };             // เปิดครั้งแรก: จำไว้เฉยๆ
  const hasData = db.get().prepare('SELECT COUNT(*) n FROM books').get().n > 0;
  const r = hasData ? backup.run('before-update') : { ok: true, name: '' };
  activity.log('app_start', r.ok ? `อัปเดตโปรแกรมแล้ว${r.name ? ` · สำรองข้อมูลก่อนอัปเดตไว้ที่ ${r.name}` : ''}` : `อัปเดตโปรแกรมแล้ว แต่สำรองข้อมูลก่อนอัปเดตไม่สำเร็จ: ${r.error}`, { actor: 'ระบบ', machine: 'เครื่องหลัก' });
  return { updated: true, backup: r };
}

module.exports = { fingerprint, checkAndBackup };
