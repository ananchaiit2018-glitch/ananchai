// POST /api/login  { code }  ->  { token, exp, role }
//   รหัส APP_PASSCODE            -> role "admin"  (แก้ไขได้ทุกอย่าง)
//   รหัส VIEWER_CODE (ไม่บังคับ)  -> role "viewer" (ดูอย่างเดียว ใช้เมื่อปิด PUBLIC_VIEW)
const { send, body } = require('../lib/http');
const { sign, safeEq } = require('../lib/auth');

// กันเดารหัส: ผิดครบ 5 ครั้งจาก IP เดียวกัน ล็อก 5 นาที
// (นับในหน่วยความจำของเซิร์ฟเวอร์แต่ละตัว จึงเป็นเพียงด่านชะลอ ไม่ใช่การกันเด็ดขาด)
const fails = new Map();
const MAX_FAILS = 5, LOCK_MS = 5 * 60 * 1000;
const ipOf = (req) => String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'unknown';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const pass = process.env.APP_PASSCODE, secret = process.env.SESSION_SECRET;
  if (!pass || !secret || secret.length < 16) {
    return send(res, 500, { error: 'not_configured', message: 'ยังไม่ได้ตั้ง APP_PASSCODE / SESSION_SECRET (อย่างน้อย 16 ตัวอักษร)' });
  }
  const ip = ipOf(req), rec = fails.get(ip) || { n: 0, until: 0 };
  if (rec.until > Date.now()) {
    return send(res, 429, { error: 'too_many', retry_after: Math.ceil((rec.until - Date.now()) / 1000) });
  }
  const code = String((body(req) || {}).code || '');
  await new Promise((r) => setTimeout(r, 500)); // หน่วงเล็กน้อยทุกครั้ง
  let role = null;
  if (safeEq(code, pass)) role = 'admin';
  else if (process.env.VIEWER_CODE && safeEq(code, process.env.VIEWER_CODE)) role = 'viewer';
  if (!role) {
    rec.n += 1;
    if (rec.n >= MAX_FAILS) { rec.until = Date.now() + LOCK_MS; rec.n = 0; }
    fails.set(ip, rec);
    return send(res, 401, { error: 'bad_code' });
  }
  fails.delete(ip);
  const exp = Date.now() + 30 * 864e5;
  send(res, 200, { token: sign({ exp, ws: 'main', role }, secret), exp, role });
};
