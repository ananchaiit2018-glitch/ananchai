'use strict';
// ล้างรหัสผ่านเข้าโปรแกรม (กรณีลืมรหัสผ่าน) — เรียกจาก reset-password.bat ที่เครื่องหลัก
// ลบเฉพาะรหัสผ่าน ข้อมูลทะเบียนทั้งหมดอยู่ครบ (ใช้ได้แม้โปรแกรมกำลังเปิดอยู่)
const db = require('../server/db');
const activity = require('../server/activity');

db.open();
const had = !!db.getSettings().password_hash;
db.get().prepare("DELETE FROM settings WHERE key = 'password_hash'").run();
if (had) activity.log('password', 'ล้างรหัสผ่านด้วยไฟล์ reset-password.bat (ลืมรหัสผ่าน)', { actor: 'ที่เครื่องหลัก', machine: 'เครื่องหลัก' });
db.close();
console.log(had
  ? 'ล้างรหัสผ่านเรียบร้อยแล้ว — เปิดโปรแกรม (หรือรีเฟรชหน้าเว็บ) จะเข้าได้โดยไม่ต้องใช้รหัสผ่าน\nแนะนำให้ตั้งรหัสผ่านใหม่ที่ ตั้งค่าระบบ -> ความปลอดภัย'
  : 'โปรแกรมยังไม่ได้ตั้งรหัสผ่านไว้ ไม่ต้องทำอะไร');
