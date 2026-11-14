'use strict';
// สำรองข้อมูลจากบรรทัดคำสั่ง (ใช้ได้แม้ไม่ได้เปิดโปรแกรมหลัก): node scripts/backup.js
const db = require('../server/db'); const backup = require('../server/backup');
db.open(); const r = backup.run('backup'); db.close();
if (r.ok) { console.log(`สำรองข้อมูลสำเร็จ: ${r.dir}\\${r.name}`); process.exit(0); }
console.error('สำรองข้อมูลไม่สำเร็จ: ' + r.error); process.exit(1);
