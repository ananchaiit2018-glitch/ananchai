'use strict';
// สำรอง/กู้คืน: ไฟล์ .zip เดียว รวมฐานข้อมูล ไฟล์แนบ ลายเซ็น ฟอนต์ และโลโก้
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { DatabaseSync } = require('node:sqlite');
const db = require('./db');
const cfg = require('./config');
const U = require('./util');

const PARTS = ['attachments', 'signatures', 'fonts', 'branding'];
const log = [];   // ผลการสำรองล่าสุดในหน่วยความจำ (แสดงบนหน้าจอ)

function backupDir() {
  const s = db.getSettings();
  return path.resolve(s.backup_dir ? s.backup_dir : cfg.DIRS.backups);
}

function backupDir2() { const s = db.getSettings(); return s.backup_dir2 ? path.resolve(s.backup_dir2) : ''; }

function addDirTo(zip, dir, prefix) {
  if (!fs.existsSync(dir)) return;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isFile()) zip.addLocalFile(p, prefix);
  }
}

function run(prefix = 'backup') {
  const tmpDb = path.join(cfg.DATA_DIR, `.snapshot-${process.pid}-${Date.now()}.db`);
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    // สแนปช็อตฐานข้อมูลที่สอดคล้องกัน (ไม่ต้องหยุดระบบ)
    db.get().exec(`VACUUM INTO '${tmpDb.replace(/'/g, "''")}'`);
    const chk = new DatabaseSync(tmpDb, { readOnly: true });
    const ok = chk.prepare('PRAGMA integrity_check').get().integrity_check;
    const counts = chk.prepare("SELECT kind, COUNT(*) c FROM books GROUP BY kind").all();
    chk.close();
    if (ok !== 'ok') throw new Error('ตรวจสอบความสมบูรณ์ของฐานข้อมูลไม่ผ่าน: ' + ok);

    const zip = new AdmZip();
    zip.addLocalFile(tmpDb, '', 'register.db');
    for (const part of PARTS) addDirTo(zip, path.join(cfg.DATA_DIR, part), part);
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ app: 'digital-book-register', version: cfg.VERSION, created: new Date().toISOString(),
      books: Object.fromEntries(counts.map(r => [r.kind, r.c])) }, null, 2)));
    const name = `${prefix}-${U.stamp()}.zip`;
    const final = path.join(dir, name); const part = final + '.tmp';
    zip.writeZip(part);
    // ตรวจอ่านกลับก่อนยืนยันว่าสำเร็จ
    const back = new AdmZip(part);
    if (!back.getEntry('register.db') || back.getEntry('register.db').header.size !== fs.statSync(tmpDb).size) throw new Error('ตรวจสอบไฟล์สำรองหลังเขียนไม่ผ่าน');
    fs.renameSync(part, final);
    const res = { ok: true, name, dir, size: fs.statSync(final).size, at: new Date().toISOString() };
    // คัดลอกซ้ำไปโฟลเดอร์ที่สอง (ถ้ากำหนดไว้) ล้มเหลวไม่ทำให้การสำรองหลักล้มเหลว แต่แจ้งเตือน
    const d2 = backupDir2();
    if (d2) {
      try { fs.mkdirSync(d2, { recursive: true }); fs.copyFileSync(final, path.join(d2, name + '.tmp')); fs.renameSync(path.join(d2, name + '.tmp'), path.join(d2, name)); res.copy2 = d2; }
      catch (e) { res.warn = `สำรองที่โฟลเดอร์หลักสำเร็จ แต่คัดลอกไปที่ ${d2} ไม่สำเร็จ (${e.code || e.message}) ตรวจสอบว่าแฟลชไดรฟ์/ไดรฟ์ปลายทางเสียบอยู่`; }
    }
    log.unshift(res); log.length = Math.min(log.length, 20);
    if (prefix === 'auto' || prefix === 'exit') { const keep = prefix === 'exit' ? 10 : Math.max(3, parseInt(db.getSettings().backup_keep, 10) || 30); for (const dd of [dir, d2]) if (dd) prune(dd, prefix + '-', keep); }
    return res;
  } catch (e) {
    const res = { ok: false, error: e.message, at: new Date().toISOString() };
    log.unshift(res); log.length = Math.min(log.length, 20);
    return res;
  } finally { fs.rmSync(tmpDb, { force: true }); }
}

function prune(dir, prefix, keep) {
  try {
    const items = list(dir).filter(b => b.name.startsWith(prefix));
    for (const b of items.slice(keep)) fs.rmSync(path.join(dir, b.name), { force: true });
  } catch { /* ไม่สำคัญ */ }
}

function list(dir = backupDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => /^[\w.-]+\.(zip|xlsx)$/.test(n)).map(n => {
    const st = fs.statSync(path.join(dir, n));
    return { name: n, size: st.size, at: st.mtime.toISOString() };
  }).sort((a, b) => (a.at < b.at ? 1 : -1));
}
function filePath(name) {
  if (!/^[\w.-]+\.(zip|xlsx)$/.test(name || '')) throw new U.HttpError(400, 'ชื่อไฟล์ไม่ถูกต้อง');
  const p = path.join(backupDir(), name);
  if (!fs.existsSync(p)) throw new U.HttpError(404, 'ไม่พบไฟล์สำรอง');
  return p;
}

// สำรอง zip + ไฟล์ Excel (ถ้าเปิดไว้) — Excel ล้มเหลวไม่ทำให้การสำรองหลักล้มเหลว แต่แจ้งเตือน
async function runAll(prefix = 'backup') {
  const res = run(prefix);
  if (!res.ok || db.getSettings().backup_excel !== '1') return res;
  try {
    const buf = await require('./export').makeXlsxAll();
    const stamp = res.name.replace(/^[a-z-]+?-(\d{8}-\d{6})\.zip$/, '$1');
    const name = `registers-${prefix}-${stamp}.xlsx`;
    const targets = [backupDir(), backupDir2()].filter(Boolean);
    for (const [i, d] of targets.entries()) { try { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, name), buf); } catch (e) { if (i === 0) throw e; res.warn = (res.warn ? res.warn + ' · ' : '') + 'คัดลอกไฟล์ Excel ไปโฟลเดอร์ที่สองไม่สำเร็จ'; } }
    res.excel = name;
    if (prefix === 'auto' || prefix === 'exit') { const keep = prefix === 'exit' ? 10 : Math.max(3, parseInt(db.getSettings().backup_keep, 10) || 30); for (const d of targets) prune(d, `registers-${prefix}-`, keep); }
  } catch (e) { res.warn = (res.warn ? res.warn + ' · ' : '') + 'สำรองข้อมูลสำเร็จ แต่สร้างไฟล์ Excel ไม่สำเร็จ: ' + e.message; }
  return res;
}

function autoIfDue() {
  const s = db.getSettings();
  if (s.auto_backup !== '1') return null;
  const hours = Math.max(1, parseInt(s.backup_every_hours, 10) || 24);
  const last = list().find(b => b.name.startsWith('auto-'));
  if (last && Date.now() - new Date(last.at).getTime() < (hours * 60 - 2) * 60 * 1000) return null;
  return runAll('auto');
}

/* ---------- กู้คืน ---------- */
function restoreFromZip(zipPath) {
  let zip;
  try { zip = new AdmZip(zipPath); } catch { throw new U.HttpError(400, 'ไฟล์สำรองเสียหายหรือไม่ใช่ไฟล์ .zip'); }
  const man = zip.getEntry('manifest.json'); const dbEntry = zip.getEntry('register.db');
  if (!man || !dbEntry) throw new U.HttpError(400, 'ไม่ใช่ไฟล์สำรองของโปรแกรมนี้');
  try { if (JSON.parse(man.getData().toString()).app !== 'digital-book-register') throw 0; } catch { throw new U.HttpError(400, 'ไม่ใช่ไฟล์สำรองของโปรแกรมนี้'); }

  // ตรวจฐานข้อมูลในไฟล์สำรองก่อนแตะข้อมูลจริง
  const stage = path.join(cfg.DATA_DIR, `.restore-${Date.now()}`);
  fs.mkdirSync(stage, { recursive: true });
  try {
    const stagedDb = path.join(stage, 'register.db');
    fs.writeFileSync(stagedDb, dbEntry.getData());
    const chk = new DatabaseSync(stagedDb, { readOnly: true });
    try {
      if (chk.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('x');
      chk.prepare('SELECT COUNT(*) FROM books').get(); chk.prepare('SELECT COUNT(*) FROM counters').get();
    } catch { chk.close(); throw new U.HttpError(400, 'ฐานข้อมูลในไฟล์สำรองเสียหาย'); }
    chk.close();
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      const top = e.entryName.split('/')[0];
      if (!PARTS.includes(top)) continue;
      const rel = path.normalize(e.entryName);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new U.HttpError(400, 'ไฟล์สำรองไม่ปลอดภัย');
      const out = path.join(stage, rel); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, e.getData());
    }

    // สำรองข้อมูลปัจจุบันไว้ก่อนเสมอ เผื่อกู้ผิดไฟล์
    const safety = run('before-restore');
    if (!safety.ok) throw new U.HttpError(500, 'ไม่สามารถสำรองข้อมูลปัจจุบันก่อนกู้คืนได้ จึงยกเลิกการกู้คืน: ' + safety.error);

    db.close();
    try {
      for (const ext of ['', '-wal', '-shm']) fs.rmSync(cfg.DB_FILE + ext, { force: true });
      fs.copyFileSync(stagedDb, cfg.DB_FILE);
      for (const part of PARTS) {
        const dst = path.join(cfg.DATA_DIR, part);
        fs.rmSync(dst, { recursive: true, force: true });
        const src = path.join(stage, part);
        if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true }); else fs.mkdirSync(dst, { recursive: true });
      }
    } finally { db.open(); }
    return { ok: true, safety: safety.name, books: JSON.parse(man.getData().toString()).books || {} };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

function onExit() { return db.getSettings().backup_on_exit === '1' ? runAll('exit') : null; }

module.exports = { run, runAll, list, onExit, backupDir2, filePath, autoIfDue, restoreFromZip, backupDir, log: () => log };
