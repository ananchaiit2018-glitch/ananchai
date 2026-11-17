'use strict';
// ไฟล์ Excel อัปเดตอัตโนมัติ: เขียนทับไฟล์เดียวทุกครั้งที่บันทึก/แก้ไข/ยกเลิกรายการ
// มีทะเบียนรับ + ทะเบียนส่ง ทุกรายการ (ต่อท้ายเรียงตามเลขทะเบียน) คนละแผ่นงาน
// เก็บในโฟลเดอร์สำรองข้อมูล และคัดลอกไปโฟลเดอร์ที่สอง (ถ้าตั้งไว้)
const fs = require('fs'), path = require('path');
const db = require('./db'), backup = require('./backup'), exp = require('./export');

const archive = require('./archive');
const NAMES = { in: 'ทะเบียนหนังสือรับ.xlsx', out: 'ทะเบียนหนังสือส่ง.xlsx' };
const NAME = NAMES.in;   // (คงไว้ให้โค้ดเดิม)
const st = { at: '', dir: '', copy2: '', error: '', warn2: '', files: 0, copied: 0, archived: '' };
let timer = null, retry = null, running = false, again = false;

const enabled = () => db.getSettings().live_excel !== '0';
const isLocked = e => ['EBUSY', 'EPERM', 'EACCES'].includes(e && e.code);

function put(dir, name, buf) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name), t = f + '.tmp';
  fs.writeFileSync(t, buf);
  try { fs.renameSync(t, f); } catch (e) { fs.rmSync(t, { force: true }); throw e; }
  return f;
}

async function write() {
  if (running) { again = true; return status(); }
  running = true;
  try {
    if (!enabled() && !archive.enabled()) return status();
    const dir = archive.archiveDir(); st.dir = dir; const errs = [];
    const own = archive.claim(dir); if (!own.ok) { st.error = own.error; return status(); }   // โฟลเดอร์ของชุดเดิม: ไม่แตะ
    // 1) จัดไฟล์หนังสือลงโฟลเดอร์ หนังสือรับ/หนังสือส่ง แยกตามวัน
    let links = null;
    if (archive.enabled()) {
      try { const r = archive.sync(); links = r.links; st.files = r.files; st.copied = r.copied; st.archived = new Date().toISOString(); if (r.failed) errs.push(`คัดลอกไฟล์หนังสือไม่สำเร็จ ${r.failed} ไฟล์`); }
      catch (e) { errs.push('จัดไฟล์หนังสือไม่สำเร็จ: ' + (e.code || e.message)); }
    }
    // 2) Excel ทะเบียนรับ / ทะเบียนส่ง (ไฟล์ละทะเบียน)
    if (enabled()) {
      const d2 = backup.backupDir2(); st.copy2 = ''; st.warn2 = '';
      for (const kind of ['in', 'out']) {
        const buf = await exp.makeXlsxKind(kind, 'ข้อมูลทั้งหมด · อัปเดตอัตโนมัติทุกครั้งที่บันทึก', links);
        try { put(dir, NAMES[kind], buf); }
        catch (e) { errs.push(isLocked(e) ? `ไฟล์ ${NAMES[kind]} เปิดค้างอยู่ในโปรแกรม Excel จึงอัปเดตไม่ได้ — ปิดไฟล์แล้วระบบจะอัปเดตให้เองภายใน 1 นาที` : `เขียน ${NAMES[kind]} ไม่สำเร็จ: ${e.code || e.message}`); }
        if (d2) { try { put(d2, NAMES[kind], buf); st.copy2 = d2; } catch (e) { st.warn2 = `คัดลอกไปที่ ${d2} ไม่สำเร็จ (${e.code || e.message})`; } }
      }
    }
    st.error = errs.join(' · ');
    if (!st.error) { st.at = new Date().toISOString(); clearTimeout(retry); }
    else { clearTimeout(retry); retry = setTimeout(() => { write().catch(() => {}); }, 60 * 1000); if (retry.unref) retry.unref(); }
  } catch (e) { st.error = e.message; }
  finally { running = false; if (again) { again = false; schedule(200); } }
  return status();
}

function schedule(ms = 1500) {
  if (!enabled() && !archive.enabled()) return;
  clearTimeout(timer); timer = setTimeout(() => { write().catch(() => {}); }, ms); if (timer.unref) timer.unref();
}

function status() {
  const dir = archive.archiveDir();
  return { ...st, enabled: enabled(), archive: archive.enabled(), dir, names: NAMES, file: path.join(dir, NAMES.in), files_in: path.join(dir, NAMES.in), files_out: path.join(dir, NAMES.out), default_dir: archive.defaultDir() };
}

module.exports = { NAME, NAMES, schedule, write, status };
