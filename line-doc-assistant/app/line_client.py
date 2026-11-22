"""LINE Messaging API — โหมดจริงเรียก api.line.me / โหมดจำลองเก็บข้อความไว้ในตาราง outbox"""
from __future__ import annotations

from pathlib import Path

from .db import DB, now

API = "https://api.line.me/v2/bot"
DATA_API = "https://api-data.line.me/v2/bot"


class LineClient:
    def __init__(self, db: DB, token: str, demo: bool, demo_content_dir: Path):
        self.db, self.token, self.demo, self.demo_dir = db, token, demo, demo_content_dir

    def _log(self, to: str, kind: str, text: str, delivered: bool, error: str = "") -> None:
        self.db.run("INSERT INTO outbox(at,to_user,kind,text,delivered,error) VALUES(?,?,?,?,?,?)", now(), to, kind, text, int(delivered), error[:300])

    def _post(self, url: str, payload: dict) -> str:
        import httpx
        r = httpx.post(url, json=payload, headers={"Authorization": f"Bearer {self.token}"}, timeout=15)
        return "" if r.status_code < 300 else f"HTTP {r.status_code}: {r.text[:200]}"

    def reply(self, reply_token: str, to_user: str, text: str) -> None:
        """ตอบกลับทันที (ไม่นับโควตาข้อความ) — ใช้ได้ครั้งเดียวภายในไม่กี่นาทีหลังได้รับข้อความ"""
        if self.demo or not reply_token:
            self._log(to_user, "reply", text, not self.demo); return
        err = self._post(f"{API}/message/reply", {"replyToken": reply_token, "messages": [{"type": "text", "text": text}]})
        self._log(to_user, "reply", text, not err, err)

    def push(self, to_user: str, text: str) -> None:
        """ส่งข้อความภายหลัง (นับโควตาข้อความของ LINE OA)"""
        if self.demo:
            self._log(to_user, "push", text, False); return
        err = self._post(f"{API}/message/push", {"to": to_user, "messages": [{"type": "text", "text": text[:4900]}]})
        self._log(to_user, "push", text, not err, err)

    def get_content(self, message_id: str, max_bytes: int) -> bytes:
        """ดาวน์โหลดไฟล์ที่ผู้ใช้ส่งมา — หยุดทันทีถ้าใหญ่เกินกำหนด (ไม่โหลดทั้งไฟล์เข้าหน่วยความจำ)"""
        if self.demo:
            p = self.demo_dir / f"{message_id}.bin"
            data = p.read_bytes()
            p.unlink(missing_ok=True)
            return data
        import httpx
        buf = bytearray()
        with httpx.stream("GET", f"{DATA_API}/message/{message_id}/content", headers={"Authorization": f"Bearer {self.token}"}, timeout=60) as r:
            if r.status_code >= 300:
                raise RuntimeError(f"ดาวน์โหลดไฟล์จาก LINE ไม่สำเร็จ (HTTP {r.status_code})")
            for chunk in r.iter_bytes():
                buf.extend(chunk)
                if len(buf) > max_bytes:
                    raise ValueError("too-large")
        return bytes(buf)
