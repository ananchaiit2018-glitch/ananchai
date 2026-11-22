"""SQLite: เก็บคิวงาน สถานะ ผู้มีสิทธิ์ และประวัติ (ไม่ใช่ทะเบียนหนังสือ — ทะเบียนจริงอยู่ในระบบเดิม)"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  officer_name TEXT NOT NULL DEFAULT '',      -- ชื่อที่ใช้เลือกผู้เข้าเวรในเว็บทะเบียนเดิม
  pw_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reviewer' CHECK (role IN ('admin','reviewer')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS line_users (            -- รายชื่อ LINE ที่มีสิทธิ์ส่งเอกสาร
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  added_by TEXT NOT NULL DEFAULT '',
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'line',
  line_user_id TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  message_id TEXT UNIQUE,                         -- กัน LINE ส่ง webhook ซ้ำ
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  ocr_method TEXT NOT NULL DEFAULT '',
  ocr_text TEXT NOT NULL DEFAULT '',
  extracted_json TEXT NOT NULL DEFAULT '{}',      -- ผลอ่าน: ค่า + ความมั่นใจ + ต้องตรวจสอบไหม
  final_json TEXT NOT NULL DEFAULT '{}',          -- ค่าที่เจ้าหน้าที่ยืนยัน
  edited_by TEXT NOT NULL DEFAULT '',
  confirmed_by TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT NOT NULL DEFAULT '',
  cancelled_by TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL DEFAULT '',
  claimed_at TEXT NOT NULL DEFAULT '',
  office_path TEXT NOT NULL DEFAULT '',
  office_sha256 TEXT NOT NULL DEFAULT '',
  reg_label TEXT NOT NULL DEFAULT '',
  result_message TEXT NOT NULL DEFAULT '',
  finished_at TEXT NOT NULL DEFAULT '',
  file_purged INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status, created_at);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  job_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_job ON audit (job_id);
CREATE TABLE IF NOT EXISTS outbox (                 -- ข้อความ LINE (Demo: เก็บไว้ดูแทนการส่งจริง)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  to_user TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  last_seen TEXT NOT NULL,
  info TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class DB:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self.conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=FULL")
        self.conn.execute("PRAGMA busy_timeout=10000")
        self.conn.executescript(SCHEMA)

    def q(self, sql: str, *args) -> list[sqlite3.Row]:
        with self._lock:
            return self.conn.execute(sql, args).fetchall()

    def one(self, sql: str, *args) -> sqlite3.Row | None:
        with self._lock:
            return self.conn.execute(sql, args).fetchone()

    def run(self, sql: str, *args) -> sqlite3.Cursor:
        with self._lock:
            return self.conn.execute(sql, args)

    def tx(self):
        """with db.tx(): ... — ธุรกรรมแบบ IMMEDIATE (กันสองเครื่องจองงานเดียวกัน)"""
        db = self

        class _Tx:
            def __enter__(self_inner):
                db._lock.acquire()
                db.conn.execute("BEGIN IMMEDIATE")
                return db

            def __exit__(self_inner, et, ev, tb):
                try:
                    db.conn.execute("ROLLBACK" if et else "COMMIT")
                finally:
                    db._lock.release()
                return False

        return _Tx()

    # ---- ตั้งค่า ----
    def get_setting(self, k: str, default: str = "") -> str:
        r = self.one("SELECT v FROM settings WHERE k=?", k)
        return r["v"] if r else default

    def set_setting(self, k: str, v: str) -> None:
        self.run("INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, v)

    # ---- ประวัติ ----
    def audit(self, action: str, actor: str = "", job_id: str = "", detail: str | dict = "") -> None:
        if isinstance(detail, dict):
            detail = json.dumps(detail, ensure_ascii=False)
        self.run("INSERT INTO audit(at,actor,job_id,action,detail) VALUES(?,?,?,?,?)", now(), actor, job_id, action, detail[:2000])

    def backup_to(self, dest: Path) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            out = sqlite3.connect(str(dest))
            try:
                self.conn.backup(out)
            finally:
                out.close()

    def close(self) -> None:
        with self._lock:
            self.conn.close()
