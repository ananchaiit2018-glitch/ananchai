'use strict';
// ตัวเปิดโปรแกรมแบบซ่อนหน้าต่าง (เรียกจาก start-hidden.vbs)
// เขียนบันทึกการทำงานลง data\server.log เอง (เปิดแบบต่อท้าย ใช้ร่วมกันได้ ไม่ล็อกไฟล์)
// และบันทึกข้อผิดพลาดตอนเริ่มโปรแกรม เพื่อให้ตัวเปิดแจ้งสาเหตุได้ ไม่เงียบหายไป
const fs = require('fs'), path = require('path'), util = require('util');
const cfg = require('./config');
try { fs.mkdirSync(cfg.DATA_DIR, { recursive: true }); } catch { /* แจ้งผ่าน log ด้านล่าง */ }
const logFile = path.join(cfg.DATA_DIR, 'server.log');
try { const st = fs.statSync(logFile); if (st.size > 2 * 1024 * 1024) fs.renameSync(logFile, logFile + '.old'); } catch { /* ไม่มีไฟล์เดิม */ }
const write = (tag, args) => {
  const line = `[${new Date().toLocaleString('th-TH', { hour12: false })}] ${tag}${util.format(...args)}\n`;
  try { fs.appendFileSync(logFile, line); } catch { /* เขียนไม่ได้ก็ทำงานต่อ */ }
};
console.log = (...a) => write('', a);
console.error = (...a) => write('ผิดพลาด: ', a);
process.on('uncaughtException', e => { write('ผิดพลาดร้ายแรง: ', [e && e.stack || e]); process.exit(1); });
write('', ['----- เริ่มโปรแกรม (Node ' + process.version + ') -----']);
require('./index').start();
