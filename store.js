// GET  /api/store            อ่านข้อมูล: ต้องมีโทเคน (แอดมิน/ผู้ชม) ยกเว้นตั้ง PUBLIC_VIEW=1 ให้ใครก็ดูได้
// PUT  /api/store            บันทึกข้อมูล — เฉพาะแอดมินเท่านั้น (ตรวจเวอร์ชัน กันเขียนทับกัน)
const { send, body } = require('../lib/http');
const { authed } = require('../lib/auth');
const { getDb } = require('../lib/db');
const KEYS = require('../lib/keys');

const MAX_BYTES = 2000000;
// ข้อมูลที่ "ผู้ชม" (ไม่ใช่แอดมิน) มีสิทธิ์ได้รับ: ภารกิจที่กำลังเข้ามา โน้ต วันสำคัญ กำลังพล ตารางเวร และตั้งค่าร่วม
const VIEWER_KEYS = ['rmis_v1', 'rinc_v1', 'rnotes_v1', 'rcust_v1', 'rppl_v1', 'rroster_v1', 'rshared_v1'];

module.exports = async (req, res) => {
  const user = authed(req);
  const publicView = process.env.PUBLIC_VIEW === '1'; // ค่าเริ่มต้น = ปิด (ต้องใส่รหัสก่อนจึงเห็นข้อมูล)
  if (req.method === 'PUT') {
    if (!user) return send(res, 401, { error: 'unauthorized' });
    if (user.role !== 'admin') return send(res, 403, { error: 'forbidden', message: 'ต้องใช้รหัสผู้ดูแลเพื่อแก้ไข' });
  } else if (!user && !publicView) {
    return send(res, 401, { error: 'unauthorized' });
  }
  let db;
  try { db = getDb(); await db.ensure(); } catch (e) { return send(res, 500, { error: 'db', message: 'เชื่อมต่อฐานข้อมูลไม่ได้' }); }
  const ws = (user && user.ws) || 'main';

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const since = typeof q.since === 'string' && !isNaN(Date.parse(q.since)) ? q.since : null;
      const rows = await db.list(ws, since);
      const items = {};
      const admin = !!user && user.role === 'admin';
      for (const r of rows) {
        if (!KEYS.includes(r.key)) continue;
        if (!admin && !VIEWER_KEYS.includes(r.key)) continue; // ผู้ชมไม่ได้รับข้อมูลรูทีน/ผลการปฏิบัติ
        items[r.key] = { value: r.value, version: r.version, updated_at: r.updated_at };
      }
      return send(res, 200, { items, now: new Date().toISOString() });
    }

    if (req.method === 'PUT') {
      const b = body(req);
      if (!b || typeof b.items !== 'object' || b.items === null) return send(res, 400, { error: 'bad_request' });
      const results = {};
      for (const [key, it] of Object.entries(b.items)) {
        if (!KEYS.includes(key)) { results[key] = { ok: false, error: 'key_not_allowed' }; continue; }
        const v = it && it.value;
        if (v === null || typeof v !== 'object') { results[key] = { ok: false, error: 'bad_value' }; continue; }
        if (JSON.stringify(v).length > MAX_BYTES) { results[key] = { ok: false, error: 'too_large' }; continue; }
        const base = Number.isInteger(it.base) ? it.base : null;
        const r = await db.put(ws, key, v, base);
        results[key] = r.ok ? { ok: true, version: r.version, updated_at: r.updated_at }
                           : { ok: false, conflict: true, version: r.version, value: r.value };
      }
      return send(res, 200, { results });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    return send(res, 500, { error: 'server' });
  }
};
