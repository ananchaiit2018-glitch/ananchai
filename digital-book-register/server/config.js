'use strict';
// อ่านค่าตั้งต้นของเซิร์ฟเวอร์จาก config.json (ถ้ามี) และตัวแปรสภาพแวดล้อม
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let file = {};
try { file = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch { /* ไม่มีไฟล์ใช้ค่าเริ่มต้น */ }

const dataDir = path.resolve(ROOT, process.env.DATA_DIR || file.dataDir || 'data');

module.exports = {
  ROOT,
  PORT: parseInt(process.env.PORT || file.port || 3000, 10),
  // 127.0.0.1 = ใช้ได้เฉพาะเครื่องนี้ (ปลอดภัยสุด) / 0.0.0.0 = เครื่องอื่นในเครือข่ายภายในเข้าได้
  HOST: process.env.HOST || file.host || '127.0.0.1',
  DATA_DIR: dataDir,
  DB_FILE: path.join(dataDir, 'register.db'),
  DIRS: {
    attachments: path.join(dataDir, 'attachments'),
    signatures: path.join(dataDir, 'signatures'),
    fonts: path.join(dataDir, 'fonts'),
    branding: path.join(dataDir, 'branding'),
    backups: path.join(dataDir, 'backups'),
  },
  VERSION: '1.0.0',
};
