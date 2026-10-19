// ดูประวัติเวอร์ชันย้อนหลังของข้อมูล (สำหรับกู้คืน) — เฉพาะแอดมิน
//   GET /api/history?key=rroster_v1            -> รายการเวอร์ชัน
//   GET /api/history?key=rroster_v1&version=12 -> ข้อมูลเวอร์ชันนั้น
const { send } = require('../lib/http');
const { authed } = require('../lib/auth');
const { getDb } = require('../lib/db');
const KEYS = require('../lib/keys');

module.exports = async (req, res) => {
  const user = authed(req);
  if (!user) return send(res, 401, { error: 'unauthorized' });
  if (user.role !== 'admin') return send(res, 403, { error: 'forbidden' });
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  const q = req.query || {};
  if (!KEYS.includes(q.key)) return send(res, 400, { error: 'bad_key' });
  try {
    const db = getDb(); await db.ensure();
    const ws = user.ws || 'main';
    if (q.version) {
      const n = parseInt(q.version, 10);
      const v = await db.version(ws, q.key, n);
      return v ? send(res, 200, { key: q.key, version: n, value: v }) : send(res, 404, { error: 'not_found' });
    }
    send(res, 200, { key: q.key, versions: await db.versions(ws, q.key) });
  } catch (e) { send(res, 500, { error: 'server' }); }
};
