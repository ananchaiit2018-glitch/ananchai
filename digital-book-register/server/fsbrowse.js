'use strict';
// เรียกดูโฟลเดอร์ในเครื่องหลัก เพื่อให้ผู้ใช้กดเลือกตำแหน่งเก็บไฟล์สำรอง (แสดงเฉพาะโฟลเดอร์ ไม่แสดงไฟล์)
const fs = require('fs');
const path = require('path');
const os = require('os');
const U = require('./util');

function roots() {
  const drives = [];
  if (process.platform === 'win32') {
    for (let c = 65; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { if (fs.existsSync(d)) drives.push({ name: `ไดรฟ์ ${String.fromCharCode(c)}:`, path: d }); } catch { /* ข้าม */ } }
  } else drives.push({ name: '/ (ราก)', path: '/' });
  const home = os.homedir();
  const short = [['โฟลเดอร์ผู้ใช้', home], ['Desktop', path.join(home, 'Desktop')], ['Documents', path.join(home, 'Documents')]]
    .filter(([, p]) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }).map(([name, p]) => ({ name, path: p }));
  return { path: '', parent: null, root: true, writable: false, dirs: [...short, ...drives] };
}

function listDir(p) {
  p = String(p || '').trim();
  if (!p) return roots();
  p = path.resolve(p);
  let ents;
  try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch { throw new U.HttpError(400, 'เปิดโฟลเดอร์นี้ไม่ได้ (ไม่มีสิทธิ์หรือไม่มีอยู่)'); }
  const dirs = ents.filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$'))
    .map(e => ({ name: e.name, path: path.join(p, e.name) })).sort((a, b) => a.name.localeCompare(b.name, 'th')).slice(0, 500);
  let writable = true; try { fs.accessSync(p, fs.constants.W_OK); } catch { writable = false; }
  const up = path.dirname(p);
  return { path: p, parent: up !== p ? up : '', root: false, writable, dirs };
}

function makeDir(parent, name) {
  name = String(name || '').trim(); parent = String(parent || '').trim();
  if (!parent) throw new U.HttpError(400, 'กรุณาเลือกตำแหน่งก่อน');
  if (!name || name === '.' || name === '..' || name.length > 100 || /[\\/:*?"<>|]/.test(name)) throw new U.HttpError(400, 'ชื่อโฟลเดอร์ไม่ถูกต้อง (ห้ามมี \\ / : * ? " < > |)');
  const p = path.join(path.resolve(parent), name);
  try { fs.mkdirSync(p); } catch (e) { throw new U.HttpError(400, e.code === 'EEXIST' ? 'มีโฟลเดอร์ชื่อนี้อยู่แล้ว' : 'สร้างโฟลเดอร์ไม่ได้ (ไม่มีสิทธิ์)'); }
  return { path: p };
}
module.exports = { listDir, makeDir };
