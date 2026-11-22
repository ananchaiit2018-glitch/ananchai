"""จำลอง LINE ส่ง webhook ที่ลงลายเซ็นถูกต้องเข้าเซิร์ฟเวอร์ผ่าน HTTP (ใช้ทดสอบเส้นทางจริง/อุโมงค์ HTTPS)
ใช้ได้เฉพาะ Demo Mode (LINE จำลองจะดึงไฟล์จากโฟลเดอร์ data/demo-line-content)

    python scripts/simulate_line.py ไฟล์.pdf --user U<32 ตัว> [--url http://localhost:8800]"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.config import _read_env_file, load_settings  # noqa: E402
from app.security import line_signature  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file"); ap.add_argument("--user", required=True); ap.add_argument("--url", default="http://localhost:8800")
    a = ap.parse_args()
    s = load_settings()
    if not s.is_demo:
        raise SystemExit("ใช้ได้เฉพาะ MODE=demo")
    secret = s.line_channel_secret or _read_env_file(s.data_dir / "secrets.env").get("DEMO_CHANNEL_SECRET", "")
    if not secret:
        raise SystemExit("ยังไม่มี secret จำลอง — เปิดเซิร์ฟเวอร์ Demo สักครั้งก่อน")
    data = Path(a.file).read_bytes()
    mid = f"sim{int(time.time() * 1000)}"
    (s.data_dir / "demo-line-content").mkdir(parents=True, exist_ok=True)
    (s.data_dir / "demo-line-content" / f"{mid}.bin").write_bytes(data)
    msg = {"type": "file", "id": mid, "fileName": Path(a.file).name, "fileSize": len(data)}
    body = json.dumps({"destination": "sim", "events": [{"type": "message", "replyToken": "sim", "source": {"type": "user", "userId": a.user}, "message": msg}]}).encode()
    r = httpx.post(a.url.rstrip("/") + "/line/webhook", content=body, headers={"x-line-signature": line_signature(secret, body), "content-type": "application/json"})
    print(r.status_code, r.text)


if __name__ == "__main__":
    main()
