import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
FIX = Path(__file__).parent / "fixtures"
ALLOWED_UID = "U" + "a" * 32


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("MODE", "demo")
    monkeypatch.setenv("OFFICE_INBOX", str(tmp_path / "office"))
    monkeypatch.setenv("PUBLIC_BASE_URL", "http://testserver")
    from app.config import load_settings
    from app.main import create_app
    s = load_settings(tmp_path / "data")
    app = create_app(s)
    client = TestClient(app, base_url="http://testserver")
    svc, db = app.state.svc, app.state.db
    db.run("INSERT INTO line_users(line_user_id,display_name,added_at) VALUES(?,?,?)", ALLOWED_UID, "ส.ต.ท.เนวิน", "2026-01-01")
    yield {"app": app, "client": client, "svc": svc, "db": db, "s": s, "tmp": tmp_path}
    db.close()


def line_post(env, events: list[dict], secret: str | None = None, sig: str | None = None):
    from app.security import line_signature
    body = json.dumps({"destination": "x", "events": events}).encode()
    s = env["s"]
    signature = sig if sig is not None else line_signature(secret or s.line_channel_secret, body)
    return env["client"].post("/line/webhook", content=body, headers={"x-line-signature": signature, "content-type": "application/json"})


def send_file(env, path: Path, uid: str = ALLOWED_UID, mid: str = "m1", as_image: bool = False):
    """จำลองผู้ใช้ส่งไฟล์ใน LINE: วางเนื้อไฟล์ไว้ที่ที่ LINE จำลองจะให้ดาวน์โหลด แล้วยิง webhook ที่ลงลายเซ็นถูกต้อง"""
    data = Path(path).read_bytes()
    (env["s"].data_dir / "demo-line-content" / f"{mid}.bin").write_bytes(data)
    msg = {"type": "image", "id": mid} if as_image else {"type": "file", "id": mid, "fileName": Path(path).name, "fileSize": len(data)}
    return line_post(env, [{"type": "message", "replyToken": "rt-" + mid, "source": {"type": "user", "userId": uid}, "message": msg}])


def outbox(env) -> list[str]:
    return [r["text"] for r in env["db"].q("SELECT text FROM outbox ORDER BY id")]


def login_admin(env):
    c = env["client"]
    r = c.post("/login", data={"username": "admin", "password": "password123", "display_name": "ผู้ดูแล", "officer_name": "ส.ต.ท.อนันต์ชัย แก้วหัวไทร"},
               headers={"origin": "http://testserver"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/"
    return c
