const crypto = require('crypto');

const b64 = (s) => Buffer.from(s).toString('base64url');
const hmac = (body, secret) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

function sign(payload, secret) {
  const body = b64(JSON.stringify(payload));
  return body + '.' + hmac(body, secret);
}

function verify(token, secret) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(hmac(body, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p && p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// เทียบรหัสผ่านแบบเวลาคงที่
function safeEq(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authed(req) {
  const h = req.headers['authorization'] || '';
  return verify(h.startsWith('Bearer ') ? h.slice(7) : '', process.env.SESSION_SECRET);
}

module.exports = { sign, verify, safeEq, authed };
