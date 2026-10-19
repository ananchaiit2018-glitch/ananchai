-- ตารางเหล่านี้ API สร้างให้เองอัตโนมัติ (CREATE TABLE IF NOT EXISTS) ไม่ต้องรันก็ได้
-- อธิบายไว้เพื่อให้เปิดดู/สำรอง/ตรวจสอบเองใน Neon SQL Editor

-- ข้อมูลปัจจุบัน: 1 แถว = 1 ชุดข้อมูล (เช่น รายการภารกิจ ตารางเวร กำลังพล)
CREATE TABLE IF NOT EXISTS app_store (
  workspace  text NOT NULL DEFAULT 'main',
  key        text NOT NULL,
  value      jsonb NOT NULL,
  version    integer NOT NULL DEFAULT 1,          -- เพิ่มทีละ 1 ทุกครั้งที่บันทึก (กันเขียนทับกัน)
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace, key)
);

-- ประวัติเวอร์ชันเก่า (เก็บ 90 วัน) ใช้กู้คืนข้อมูลที่แก้ผิด/ลบผิด
CREATE TABLE IF NOT EXISTS app_store_history (
  id         bigserial PRIMARY KEY,
  workspace  text NOT NULL,
  key        text NOT NULL,
  version    integer NOT NULL,
  value      jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_store_history_idx ON app_store_history (workspace, key, version DESC);

-- ตัวอย่างคำสั่งดูข้อมูล
--   ทุกชุดข้อมูลและเวลาล่าสุด:
--     SELECT key, version, updated_at, pg_column_size(value) AS bytes FROM app_store ORDER BY updated_at DESC;
--   รายชื่อกำลังพล:
--     SELECT p->>'rank' AS rank, p->>'name' AS name, p->>'duty' AS duty
--     FROM app_store, jsonb_array_elements(value) p WHERE key = 'rppl_v1';
--   ตารางเวรของวันที่ 2026-10-17:
--     SELECT value->'2026-10-17' FROM app_store WHERE key = 'rroster_v1';
--   ผลการปฏิบัติของวันที่ 2026-10-17:
--     SELECT value->'2026-10-17' FROM app_store WHERE key = 'rhist_v1';
