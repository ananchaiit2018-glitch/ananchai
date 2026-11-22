"""ตัวรับงานคอมสำนักงาน: ดึงงานที่ยืนยันแล้ว → เก็บไฟล์ (ตรวจ sha256) → Adapter กรอกระบบทะเบียน → รายงานผล
ทำงานแบบ "ดึงงานเอง" (เชื่อมต่อขาออกด้วย HTTPS + token) จึงไม่ต้องเปิดพอร์ตที่คอมสำนักงาน
งานที่ล้มเหลวจะไม่ลองใหม่เอง — เจ้าหน้าที่ตัดสินใจใน Dashboard"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import socket
import sys
import tempfile
import time
from urllib.parse import quote
from datetime import date
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent.adapters.base import AdapterNotReady, RegisterAdapter, SubmitResult  # noqa: E402
from agent.adapters.demo_register import DemoRegisterAdapter  # noqa: E402
from agent.adapters.legacy_web import LegacyWebAdapter  # noqa: E402


def _env() -> dict[str, str]:
    out = {}
    f = ROOT / ".env"
    if f.exists():
        for ln in f.read_text(encoding="utf-8").splitlines():
            if "=" in ln and not ln.strip().startswith("#"):
                k, v = ln.split("=", 1); out[k.strip()] = v.strip()
    return {**out, **os.environ}


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


class OfficeAgent:
    def __init__(self, server: str, token: str, agent_id: str, inbox: Path, adapter: RegisterAdapter, client: httpx.Client | None = None):
        self.server, self.agent_id, self.inbox, self.adapter = server.rstrip("/"), agent_id, Path(inbox), adapter
        self.h = {"Authorization": f"Bearer {token}", "X-Agent-Id": quote(agent_id)}   # ชื่อเครื่องภาษาไทยได้ (เข้ารหัสใน header)
        self.http = client or httpx.Client(timeout=60)

    def heartbeat(self) -> None:
        self.http.post(f"{self.server}/agent/heartbeat", headers=self.h, json={"adapter": self.adapter.name, "host": socket.gethostname()}).raise_for_status()

    def _report(self, jid: str, res: SubmitResult, office_path: str = "", office_sha: str = "") -> None:
        self.http.post(f"{self.server}/agent/jobs/{jid}/result", headers=self.h,
                       json={"ok": res.ok, "reg_label": res.reg_label, "message": res.message, "office_path": office_path, "office_sha256": office_sha}).raise_for_status()

    def fetch_file(self, job: dict) -> Path:
        """ดาวน์โหลด → ตรวจ sha256 → ย้ายเข้าโฟลเดอร์สำนักงาน → อ่านกลับมาตรวจ sha256 อีกครั้ง"""
        day = self.inbox / date.today().isoformat()
        day.mkdir(parents=True, exist_ok=True)
        safe = re.sub(r"[\x00-\x1f\\/:*?\"<>|]", "_", job["file_name"])[:100] or f"document.{job['file_type']}"
        dest = day / f"{job['id'][:8]}_{safe}"
        fd, tmp = tempfile.mkstemp(dir=day, suffix=".part"); os.close(fd)
        try:
            with self.http.stream("GET", f"{self.server}/agent/jobs/{job['id']}/file", headers=self.h) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for c in r.iter_bytes():
                        f.write(c)
            if sha256_file(Path(tmp)) != job["sha256"]:
                raise ValueError("ไฟล์ที่ดาวน์โหลดไม่ตรงกับต้นฉบับ (sha256 ไม่ตรง)")
            shutil.move(tmp, dest)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        if sha256_file(dest) != job["sha256"]:
            raise ValueError("ไฟล์ในคอมสำนักงานเสียหายหลังคัดลอก (sha256 ไม่ตรง)")
        return dest

    def run_once(self) -> str | None:
        """ทำงาน 1 รอบ: คืน id งานที่ทำ หรือ None ถ้าไม่มีงาน"""
        self.heartbeat()
        r = self.http.post(f"{self.server}/agent/claim", headers=self.h); r.raise_for_status()
        job = r.json().get("job")
        if not job:
            return None
        jid = job["id"]
        try:
            path = self.fetch_file(job)
        except Exception as e:  # noqa: BLE001
            self._report(jid, SubmitResult(False, message=f"เก็บไฟล์ในคอมสำนักงานไม่สำเร็จ: {e}")); return jid
        office_sha = sha256_file(path)
        try:
            res = self.adapter.submit(job, path)
        except AdapterNotReady as e:
            res = SubmitResult(False, message=str(e))
        except Exception as e:  # noqa: BLE001 — ไม่แน่ใจว่าบันทึกหรือยัง = ไม่สำเร็จ ให้คนตรวจ
            res = SubmitResult(False, message=f"เกิดข้อผิดพลาดระหว่างบันทึก (กรุณาตรวจในเว็บทะเบียนว่าบันทึกแล้วหรือยัง): {e}")
        self._report(jid, res, str(path), office_sha)
        return jid

    def loop(self, poll_sec: float = 15) -> None:
        print(f"[ตัวรับงานคอมสำนักงาน] {self.agent_id} → {self.server} · adapter={self.adapter.name}")
        while True:
            try:
                while self.run_once():
                    pass
            except httpx.HTTPError as e:
                print(f"[เชื่อมต่อเซิร์ฟเวอร์ไม่ได้] {e} — จะลองใหม่")
            time.sleep(poll_sec)


def build_adapter(env: dict, inbox: Path) -> RegisterAdapter:
    kind = env.get("ADAPTER", "demo")
    if kind == "demo":
        return DemoRegisterAdapter(inbox)
    if kind == "legacy-web":
        return LegacyWebAdapter(env.get("LEGACY_URL", ""), ROOT / "agent" / "legacy-selectors.json")
    raise SystemExit(f"ไม่รู้จัก ADAPTER={kind}")


def main() -> None:
    env = _env()
    ap = argparse.ArgumentParser(description="ตัวรับงานคอมสำนักงาน")
    ap.add_argument("--once", action="store_true", help="ทำงานรอบเดียวแล้วจบ")
    a = ap.parse_args()
    token = env.get("AGENT_TOKEN", "")
    if not token:
        sec = Path(env.get("DATA_DIR") or (ROOT / "data")) / "secrets.env"   # ติดตั้งเครื่องเดียวกับเซิร์ฟเวอร์
        if sec.exists():
            token = next((ln.split("=", 1)[1].strip() for ln in sec.read_text(encoding="utf-8").splitlines() if ln.startswith("AGENT_TOKEN=")), "")
    if not token:
        raise SystemExit("ไม่พบ AGENT_TOKEN — ใส่ในไฟล์ .env ของคอมสำนักงาน")
    inbox = Path(env.get("OFFICE_INBOX", str(ROOT / "office-inbox")))
    ag = OfficeAgent(env.get("SERVER_URL", "http://localhost:8800"), token, env.get("AGENT_ID", socket.gethostname()), inbox, build_adapter(env, inbox))
    if a.once:
        print(ag.run_once() or "ไม่มีงาน")
    else:
        ag.loop(float(env.get("POLL_SEC", "15")))


if __name__ == "__main__":
    main()
