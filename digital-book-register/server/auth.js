'use strict';
// รหัสผ่านเข้าใช้งาน (ไม่บังคับ แต่แนะนำเมื่อเปิดให้เครื่องอื่นเข้าถึง) เก็บเป็น scrypt hash เท่านั้น
const crypto = require('crypto');
const db = require('./db');
const U = require('./util');

const sessions = new Map();      // token -> expiry
const fails = new Map();         // ip -> {n, until}
const TTL = 12 * 3600 * 1000;

function hash(pw) {
  const salt = crypto.randomBytes(16);
  return 's1$' + salt.toString('hex') + '$' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function verify(pw, stored) {
  const [v, salt, h] = String(stored).split('$');
  if (v !== 's1' || !salt || !h) return false;
  const a = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 32); const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const required = () => !!db.getSettings().password_hash;
function cookieToken(req) { const m = /(?:^|;\s*)sid=([a-f0-9]{48})/.exec(req.headers.cookie || ''); return m && m[1]; }
function isAuthed(req) {
  if (!required()) return true;
  const t = cookieToken(req); const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
function middleware(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ', code: 'AUTH' });
}
function login(req, res) {
  const ip = req.ip; const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now()) throw new U.HttpError(429, 'ใส่รหัสผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่');
  const s = db.getSettings();
  if (!s.password_hash) return res.json({ ok: true });
  if (!verify(String(req.body.password || ''), s.password_hash)) {
    f.n++; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; }
    fails.set(ip, f);
    throw new U.HttpError(401, 'รหัสผ่านไม่ถูกต้อง');
  }
  fails.delete(ip);
  const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, Date.now() + TTL);
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}`);
  res.json({ ok: true });
}
function logout(req, res) {
  const t = cookieToken(req); if (t) sessions.delete(t);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
}
function setPassword(current, next) {
  const s = db.getSettings();
  if (s.password_hash && !verify(String(current || ''), s.password_hash)) throw new U.HttpError(403, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  next = String(next || '');
  if (next && next.length < 4) throw new U.HttpError(400, 'รหัสผ่านต้องยาวอย่างน้อย 4 ตัวอักษร');
  db.setSetting('password_hash', next ? hash(next) : '');
  sessions.clear();
}
const checkPassword = pw => { const s = db.getSettings(); return !s.password_hash || verify(String(pw || ''), s.password_hash); };
module.exports = { middleware, login, logout, setPassword, required, isAuthed, checkPassword };
