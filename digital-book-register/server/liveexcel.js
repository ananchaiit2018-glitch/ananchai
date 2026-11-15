'use strict';
// ไฟล์ Excel อัปเดตอัตโนมัติ: เขียนทับไฟล์เดียวทุกครั้งที่บันทึก/แก้ไข/ยกเลิกรายการ
// มีทะเบียนรับ + ทะเบียนส่ง ทุกรายการ (ต่อท้ายเรียงตามเลขทะเบียน) คนละแผ่นงาน
// เก็บในโฟลเดอร์สำรองข้อมูล และคัดลอกไปโฟลเดอร์ที่สอง (ถ้าตั้งไว้)
const fs = require('fs'), path = require('path');
const db = require('./db'), backup = require('./backup'), exp = require('./export');

const NAME = 'ทะเบียนหนังสือรับ-ส่ง (อัปเดตอัตโนมัติ).xlsx';
const st = { at: '', path: '', copy2: '', error: '', warn2: '' };
let timer = null, retry = null, running = false, again = false;

const enabled = () => db.getSettings().live_excel !== '0';
const isLocked = e => ['EBUSY', 'EPERM', 'EACCES'].includes(e && e.code);

function put(dir, buf) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, NAME), t = f + '.tmp';
  fs.writeFileSync(t, buf);
  try { fs.renameSync(t, f); } catch (e) { fs.rmSync(t, { force: true }); throw e; }
  return f;
}

async function write() {
  if (running) { again = true; return status(); }
  running = true;
  try {
    if (!enabled()) return status();
    const buf = await exp.makeXlsxAll('ข้อมูลทั้งหมด · อัปเดตอัตโนมัติทุกครั้งที่บันทึก');
    try { st.path = put(backup.backupDir(), buf); st.at = new Date().toISOString(); st.error = ''; clearTimeout(retry); }
    catch (e) {
      st.error = isLocked(e) ? 'ไฟล์ Excel เปิดค้างอยู่ในโปรแกรม Excel จึงอัปเดตไม่ได้ — ปิดไฟล์ Excel แล้วระบบจะอัปเดตให้เองภายใน 1 นาที' : 'เขียนไฟล์ Excel ไม่สำเร็จ: ' + (e.code || e.message);
      clearTimeout(retry); retry = setTimeout(() => { write().catch(() => {}); }, 60 * 1000); if (retry.unref) retry.unref();
    }
    const d2 = backup.backupDir2(); st.copy2 = ''; st.warn2 = '';
    if (d2) { try { st.copy2 = put(d2, buf); } catch (e) { st.warn2 = `คัดลอกไปที่ ${d2} ไม่สำเร็จ (${e.code || e.message})`; } }
  } catch (e) { st.error = e.message; }
  finally { running = false; if (again) { again = false; schedule(200); } }
  return status();
}

function schedule(ms = 1500) {
  if (!enabled()) return;
  clearTimeout(timer); timer = setTimeout(() => { write().catch(() => {}); }, ms); if (timer.unref) timer.unref();
}

function status() { return { ...st, enabled: enabled(), name: NAME, dir: backup.backupDir(), file: path.join(backup.backupDir(), NAME) }; }

module.exports = { NAME, schedule, write, status };
