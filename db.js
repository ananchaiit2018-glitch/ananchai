// ชั้นฐานข้อมูล: Neon Postgres (DATABASE_URL) หรือหน่วยความจำ (USE_MEMORY_DB=1 สำหรับทดสอบ)
let impl;

function memDb() {
  const store = new Map(), hist = [];
  return {
    kind: 'memory',
    async ensure() {},
    async list(ws, since) {
      const out = [];
      for (const [k, r] of store) {
        if (!k.startsWith(ws + '|')) continue;
        if (since && !(r.updated_at > since)) continue;
        out.push({ key: k.slice(ws.length + 1), value: r.value, version: r.version, updated_at: r.updated_at });
      }
      return out;
    },
    async put(ws, key, value, base) {
      const id = ws + '|' + key, cur = store.get(id);
      if (cur && base != null && cur.version !== base) return { conflict: true, version: cur.version, value: cur.value };
      if (cur) hist.push({ ws, key, version: cur.version, value: cur.value, changed_at: new Date().toISOString() });
      const r = { value, version: cur ? cur.version + 1 : 1, updated_at: new Date().toISOString() };
      store.set(id, r);
      return { ok: true, version: r.version, updated_at: r.updated_at };
    },
    async versions(ws, key) {
      return hist.filter(h => h.ws === ws && h.key === key).map(h => ({ version: h.version, changed_at: h.changed_at, size: JSON.stringify(h.value).length })).reverse().slice(0, 30);
    },
    async version(ws, key, v) {
      const h = hist.find(x => x.ws === ws && x.key === key && x.version === v);
      return h ? h.value : null;
    }
  };
}

function neonDb(sql) {
  let ready = false;
  return {
    kind: 'neon',
    async ensure() {
      if (ready) return;
      await sql`CREATE TABLE IF NOT EXISTS app_store (
        workspace text NOT NULL DEFAULT 'main', key text NOT NULL, value jsonb NOT NULL,
        version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace, key))`;
      await sql`CREATE TABLE IF NOT EXISTS app_store_history (
        id bigserial PRIMARY KEY, workspace text NOT NULL, key text NOT NULL, version integer NOT NULL,
        value jsonb NOT NULL, changed_at timestamptz NOT NULL DEFAULT now())`;
      await sql`CREATE INDEX IF NOT EXISTS app_store_history_idx ON app_store_history (workspace, key, version DESC)`;
      ready = true;
    },
    async list(ws, since) {
      const rows = since
        ? await sql`SELECT key, value, version, updated_at FROM app_store WHERE workspace = ${ws} AND updated_at > ${since}::timestamptz`
        : await sql`SELECT key, value, version, updated_at FROM app_store WHERE workspace = ${ws}`;
      return rows.map(r => ({ key: r.key, value: r.value, version: r.version, updated_at: new Date(r.updated_at).toISOString() }));
    },
    async put(ws, key, value, base) {
      const json = JSON.stringify(value);
      // บันทึกเวอร์ชันเดิมลงประวัติ แล้ว upsert พร้อมตรวจเวอร์ชัน (optimistic locking) ในคำสั่งเดียว
      const rows = await sql`
        WITH old AS (SELECT value, version FROM app_store WHERE workspace = ${ws} AND key = ${key}),
        h AS (
          INSERT INTO app_store_history (workspace, key, version, value)
          SELECT ${ws}, ${key}, version, value FROM old
          WHERE ${base}::int IS NULL OR version = ${base}::int
          RETURNING 1
        )
        INSERT INTO app_store (workspace, key, value, version, updated_at)
        VALUES (${ws}, ${key}, ${json}::jsonb, 1, now())
        ON CONFLICT (workspace, key) DO UPDATE
          SET value = EXCLUDED.value, version = app_store.version + 1, updated_at = now()
          WHERE ${base}::int IS NULL OR app_store.version = ${base}::int
        RETURNING version, updated_at`;
      if (rows.length) {
        if (Math.random() < 0.03) await sql`DELETE FROM app_store_history WHERE changed_at < now() - interval '90 days'`;
        return { ok: true, version: rows[0].version, updated_at: new Date(rows[0].updated_at).toISOString() };
      }
      const cur = await sql`SELECT value, version FROM app_store WHERE workspace = ${ws} AND key = ${key}`;
      return { conflict: true, version: cur[0] ? cur[0].version : 0, value: cur[0] ? cur[0].value : null };
    },
    async versions(ws, key) {
      const rows = await sql`SELECT version, changed_at, length(value::text) AS size FROM app_store_history
        WHERE workspace = ${ws} AND key = ${key} ORDER BY version DESC LIMIT 30`;
      return rows.map(r => ({ version: r.version, changed_at: new Date(r.changed_at).toISOString(), size: Number(r.size) }));
    },
    async version(ws, key, v) {
      const rows = await sql`SELECT value FROM app_store_history WHERE workspace = ${ws} AND key = ${key} AND version = ${v} LIMIT 1`;
      return rows[0] ? rows[0].value : null;
    }
  };
}

function getDb() {
  if (impl) return impl;
  if (process.env.DATABASE_URL) {
    const { neon } = require('@neondatabase/serverless');
    impl = neonDb(neon(process.env.DATABASE_URL));
  } else if (process.env.USE_MEMORY_DB === '1') {
    impl = memDb();
  } else {
    throw new Error('DATABASE_URL is not set');
  }
  return impl;
}

module.exports = { getDb, memDb, neonDb, _reset: () => { impl = null; } };
