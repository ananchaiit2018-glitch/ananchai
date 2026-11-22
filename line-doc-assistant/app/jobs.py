"""ขั้นตอนงาน: รับจาก LINE → อ่าน → รอตรวจสอบ → ยืนยัน → คอมสำนักงานรับงาน → ผลการบันทึก
กฎ: ไม่บันทึกเข้าระบบเดิมจนกว่าคนยืนยัน · ไม่ส่งงานซ้ำอัตโนมัติ · เก็บประวัติทุกขั้น"""
from __future__ import annotations

import json
import queue
import threading
import uuid
from datetime import date, datetime, timedelta, timezone

from . import extract as ex
from . import files as fl
from .config import Settings
from .db import DB, now
from .line_client import LineClient
from .ocr import read_document

MSG_RECEIVED = "ได้รับเอกสารแล้ว กำลังอ่านข้อมูล"
MSG_READ_DONE = "อ่านเอกสารเสร็จแล้ว กรุณาตรวจสอบข้อมูลก่อนยืนยัน"
MSG_SAVED = "บันทึกข้อมูลลงทะเบียนเรียบร้อยแล้ว"
MSG_FAILED = "ไม่สามารถบันทึกได้ กรุณาตรวจสอบที่คอมพิวเตอร์สำนักงาน"
MSG_NOT_ALLOWED = "ขออภัย บัญชี LINE นี้ยังไม่มีสิทธิ์ส่งเอกสาร กรุณาแจ้งผู้ดูแลระบบ (รหัสผู้ใช้: {uid})"
MSG_HELP = "ส่งไฟล์เอกสาร PDF หรือรูปถ่ายเอกสาร (JPG, PNG) มาในแชทนี้ได้เลย ระบบจะอ่านข้อมูลให้เจ้าหน้าที่ตรวจสอบก่อนบันทึก"

STATUS_TH = {"received": "รับเอกสารแล้ว", "reading": "กำลังอ่านข้อมูล", "review": "รอตรวจสอบ", "confirmed": "ยืนยันแล้ว รอคอมสำนักงาน",
             "processing": "คอมสำนักงานกำลังบันทึก", "done": "บันทึกสำเร็จ", "failed": "บันทึกไม่สำเร็จ", "cancelled": "ยกเลิก", "rejected": "ไม่รับไฟล์"}
FILE_EXT = (".pdf", ".jpg", ".jpeg", ".png")
AUDIT_TH = {"received": "รับเอกสารจาก LINE", "stored": "เก็บไฟล์ (ตรวจ sha256)", "read": "อ่านข้อมูลเสร็จ", "rejected": "ไม่รับไฟล์", "edited": "แก้ไขข้อมูล",
            "confirmed": "ยืนยันข้อมูล", "cancelled": "ยกเลิก", "claimed": "คอมสำนักงานรับงาน", "done": "บันทึกลงทะเบียนสำเร็จ", "failed": "บันทึกไม่สำเร็จ",
            "done_manual": "ยืนยันผลด้วยตนเอง", "requeued": "ส่งให้คอมสำนักงานอีกครั้ง", "purged": "ลบสำเนาบนเซิร์ฟเวอร์", "process_error": "ขัดข้องระหว่างอ่าน"}


class JobError(Exception):
    pass


class Service:
    def __init__(self, settings: Settings, db: DB, line: LineClient):
        self.s, self.db, self.line = settings, db, line
        self._q: queue.Queue[str] = queue.Queue()
        self._worker: threading.Thread | None = None

    # ---------- ผู้มีสิทธิ์ส่งเอกสาร ----------
    def is_allowed(self, uid: str) -> bool:
        r = self.db.one("SELECT active FROM line_users WHERE line_user_id=?", uid)
        return bool(r and r["active"])

    def sender_name(self, uid: str) -> str:
        r = self.db.one("SELECT display_name FROM line_users WHERE line_user_id=?", uid)
        return r["display_name"] if r else ""

    # ---------- รับ webhook ----------
    def handle_events(self, events: list[dict]) -> list[str]:
        created = []
        for ev in events:
            if ev.get("type") != "message":
                continue
            uid = (ev.get("source") or {}).get("userId", "")
            msg = ev.get("message") or {}
            rt = ev.get("replyToken", "")
            if not self.is_allowed(uid):
                self.db.audit("reject_user", uid, "", {"message_type": msg.get("type")})
                self.line.reply(rt, uid, MSG_NOT_ALLOWED.format(uid=uid)); continue
            mtype = msg.get("type")
            if mtype not in ("image", "file"):
                self.line.reply(rt, uid, MSG_HELP); continue
            name = msg.get("fileName") or "รูปเอกสาร.jpg"
            if mtype == "file" and not name.lower().endswith(FILE_EXT):
                self.line.reply(rt, uid, "รับเฉพาะไฟล์ PDF, JPG, JPEG, PNG"); continue
            if mtype == "file" and int(msg.get("fileSize") or 0) > self.s.max_file_mb * 1024 * 1024:
                self.line.reply(rt, uid, f"ไฟล์ใหญ่เกิน {self.s.max_file_mb} MB"); continue
            jid = uuid.uuid4().hex
            cur = self.db.run("INSERT OR IGNORE INTO jobs(id,created_at,updated_at,line_user_id,sender_name,message_id,file_name,status) VALUES(?,?,?,?,?,?,?,?)",
                              jid, now(), now(), uid, self.sender_name(uid), str(msg.get("id")), fl.safe_display_name(name, "jpg"), "received")
            if cur.rowcount == 0:                       # LINE ส่ง webhook ซ้ำ -> ไม่สร้างงานซ้ำ
                continue
            self.db.audit("received", uid, jid, {"file": name, "type": mtype})
            self.line.reply(rt, uid, MSG_RECEIVED)
            created.append(jid)
            self.enqueue(jid)
        return created

    # ---------- อ่านเอกสาร (ทำในเธรดพื้นหลัง) ----------
    def enqueue(self, jid: str) -> None:
        self._q.put(jid)

    def start_worker(self) -> None:
        def loop():
            while True:
                jid = self._q.get()
                try:
                    self.process(jid)
                except Exception as e:  # noqa: BLE001
                    self.db.audit("process_error", "ระบบ", jid, str(e))
        self._worker = threading.Thread(target=loop, daemon=True, name="ocr-worker")
        self._worker.start()

    def drain(self) -> None:
        """ใช้ในการทดสอบ: ประมวลผลคิวที่ค้างทั้งหมดทันที"""
        while not self._q.empty():
            self.process(self._q.get())

    def process(self, jid: str) -> None:
        job = self.db.one("SELECT * FROM jobs WHERE id=?", jid)
        if not job or job["status"] != "received":
            return
        uid = job["line_user_id"]
        try:
            data = self.line.get_content(job["message_id"], self.s.max_file_mb * 1024 * 1024)
            kind, pages = fl.validate(data, self.s.max_file_mb, self.s.max_pdf_pages)
        except (fl.FileRejected, ValueError) as e:
            msg = str(e) if isinstance(e, fl.FileRejected) else f"ไฟล์ใหญ่เกิน {self.s.max_file_mb} MB"
            self.db.run("UPDATE jobs SET status='rejected', result_message=?, updated_at=? WHERE id=?", msg, now(), jid)
            self.db.audit("rejected", "ระบบ", jid, msg)
            self.line.push(uid, f"ไม่รับไฟล์นี้: {msg}"); return
        sf = fl.store(self.s.files_dir, jid, data, kind, pages)
        name = job["file_name"]
        if not name.lower().endswith("." + kind) and not (kind == "jpg" and name.lower().endswith(".jpeg")):
            name = name.rsplit(".", 1)[0] + "." + kind
        self.db.run("UPDATE jobs SET status='reading', file_type=?, file_size=?, sha256=?, stored_path=?, file_name=?, updated_at=? WHERE id=?",
                    kind, sf.size, sf.sha256, str(sf.path), name, now(), jid)
        self.db.audit("stored", "ระบบ", jid, {"sha256": sf.sha256, "size": sf.size, "pages": pages})
        res = read_document(sf.path, kind, self.s.tesseract_cmd)
        fields = ex.extract(res.lines, from_image=res.method != "pdf-text")
        self.db.run("UPDATE jobs SET status='review', ocr_method=?, ocr_text=?, extracted_json=?, updated_at=? WHERE id=?",
                    res.method, res.text[:20000], json.dumps(fields, ensure_ascii=False), now(), jid)
        self.db.audit("read", "ระบบ", jid, {"method": res.method, "error": res.error, "check": [k for k, v in fields.items() if v["check"]]})
        self.line.push(uid, f"{MSG_READ_DONE}\n{self.s.public_base_url}/review/{jid}")

    # ---------- ตรวจสอบ / แก้ไข / ยืนยัน / ยกเลิก ----------
    def _clean_values(self, values: dict) -> dict:
        out = {k: str(values.get(k, "") or "").strip()[:500] for k in ("book_no", "book_date", "sender", "receiver", "subject", "officer", "kind", "remark")}
        out["kind"] = "in"  # LINE ใช้ลงทะเบียนหนังสือรับเท่านั้น (หนังสือส่งทำที่คอมสำนักงานตามเดิม)
        return out

    def save_edits(self, jid: str, values: dict, actor: str) -> None:
        job = self._job(jid)
        if job["status"] != "review":
            raise JobError("แก้ไขได้เฉพาะรายการที่รอตรวจสอบ")
        v = self._clean_values(values)
        self.db.run("UPDATE jobs SET final_json=?, edited_by=?, updated_at=? WHERE id=?", json.dumps(v, ensure_ascii=False), actor, now(), jid)
        self.db.audit("edited", actor, jid, v)

    def confirm(self, jid: str, values: dict, actor: str) -> None:
        v = self._clean_values(values)
        missing = [ex.FIELDS[k] for k in ("book_date", "sender", "receiver", "subject") if not v[k]]
        if not v["officer"]:
            missing.append("ผู้บันทึก")
        if missing:
            raise JobError("กรุณากรอกให้ครบ: " + ", ".join(missing))
        try:
            date.fromisoformat(v["book_date"])
        except ValueError as e:
            raise JobError("วันที่หนังสือไม่ถูกต้อง") from e
        with self.db.tx() as d:
            job = d.conn.execute("SELECT status FROM jobs WHERE id=?", (jid,)).fetchone()
            if not job:
                raise JobError("ไม่พบรายการ")
            if job["status"] != "review":
                raise JobError(f"ยืนยันไม่ได้ (สถานะ: {STATUS_TH.get(job['status'], job['status'])})")
            d.conn.execute("UPDATE jobs SET status='confirmed', final_json=?, confirmed_by=?, confirmed_at=?, updated_at=? WHERE id=?",
                           (json.dumps(v, ensure_ascii=False), actor, now(), now(), jid))
        self.db.audit("confirmed", actor, jid, v)

    def cancel(self, jid: str, reason: str, actor: str) -> None:
        with self.db.tx() as d:
            job = d.conn.execute("SELECT status FROM jobs WHERE id=?", (jid,)).fetchone()
            if not job:
                raise JobError("ไม่พบรายการ")
            if job["status"] not in ("review", "confirmed", "failed"):
                raise JobError(f"ยกเลิกไม่ได้ (สถานะ: {STATUS_TH.get(job['status'], job['status'])})")
            d.conn.execute("UPDATE jobs SET status='cancelled', cancelled_by=?, cancel_reason=?, updated_at=? WHERE id=?", (actor, reason[:300], now(), jid))
        self.db.audit("cancelled", actor, jid, reason)

    # ---------- คอมสำนักงาน ----------
    def agent_seen(self, agent_id: str, info: str = "") -> None:
        self.db.run("INSERT INTO agents(agent_id,last_seen,info) VALUES(?,?,?) ON CONFLICT(agent_id) DO UPDATE SET last_seen=excluded.last_seen, info=excluded.info", agent_id, now(), info[:300])

    def claim(self, agent_id: str) -> dict | None:
        """จองงานที่ยืนยันแล้ว 1 งาน — ธุรกรรมเดียว คอมสองเครื่องจะไม่ได้งานเดียวกัน"""
        self.agent_seen(agent_id)
        with self.db.tx() as d:
            row = d.conn.execute("SELECT * FROM jobs WHERE status='confirmed' ORDER BY confirmed_at, created_at LIMIT 1").fetchone()
            if not row:
                return None
            d.conn.execute("UPDATE jobs SET status='processing', agent_id=?, claimed_at=?, updated_at=? WHERE id=? AND status='confirmed'", (agent_id, now(), now(), row["id"]))
        self.db.audit("claimed", agent_id, row["id"], "")
        return {"id": row["id"], "file_name": row["file_name"], "file_type": row["file_type"], "sha256": row["sha256"], "size": row["file_size"],
                "values": json.loads(row["final_json"] or "{}"), "confirmed_by": row["confirmed_by"]}

    def report(self, jid: str, agent_id: str, ok: bool, reg_label: str = "", message: str = "", office_path: str = "", office_sha256: str = "") -> None:
        job = self._job(jid)
        if job["status"] != "processing" or job["agent_id"] != agent_id:
            raise JobError("รายงานผลไม่ได้: งานนี้ไม่ได้อยู่ระหว่างบันทึกโดยเครื่องนี้")
        if ok and office_sha256 and office_sha256 != job["sha256"]:
            ok, message = False, "ไฟล์ที่คอมสำนักงานไม่ตรงกับต้นฉบับ (sha256 ไม่ตรง)"
        st = "done" if ok else "failed"
        self.db.run("UPDATE jobs SET status=?, reg_label=?, result_message=?, office_path=?, office_sha256=?, finished_at=?, updated_at=? WHERE id=?",
                    st, reg_label[:60], message[:500], office_path[:400], office_sha256, now(), now(), jid)
        self.db.audit(st, agent_id, jid, {"reg_label": reg_label, "message": message, "office_path": office_path})
        uid = job["line_user_id"]
        if uid:
            self.line.push(uid, f"{MSG_SAVED}\nเลขทะเบียน {reg_label}" if ok else MSG_FAILED)

    # ---------- แก้ปัญหาด้วยคน (ไม่มีการส่งซ้ำอัตโนมัติ) ----------
    def mark_done_manual(self, jid: str, reg_label: str, actor: str) -> None:
        job = self._job(jid)
        if job["status"] not in ("failed", "processing"):
            raise JobError("ใช้ได้กับรายการที่บันทึกไม่สำเร็จหรือค้างเท่านั้น")
        if not reg_label.strip():
            raise JobError("กรุณาใส่เลขทะเบียนที่เห็นในเว็บทะเบียนจริง")
        self.db.run("UPDATE jobs SET status='done', reg_label=?, result_message=?, finished_at=?, updated_at=? WHERE id=?",
                    reg_label.strip()[:60], f"ยืนยันด้วยตนเองโดย {actor}", now(), now(), jid)
        self.db.audit("done_manual", actor, jid, reg_label)

    def requeue(self, jid: str, actor: str, checked_not_saved: bool) -> None:
        if not checked_not_saved:
            raise JobError("ต้องตรวจในเว็บทะเบียนจริงก่อนว่ายังไม่ได้บันทึก (กันเลขทะเบียนซ้ำ)")
        job = self._job(jid)
        if job["status"] not in ("failed", "processing"):
            raise JobError("ส่งซ้ำได้เฉพาะรายการที่บันทึกไม่สำเร็จหรือค้าง")
        self.db.run("UPDATE jobs SET status='confirmed', agent_id='', claimed_at='', result_message='', updated_at=? WHERE id=?", now(), jid)
        self.db.audit("requeued", actor, jid, "เจ้าหน้าที่ตรวจแล้วว่ายังไม่ได้บันทึกในเว็บทะเบียน")

    # ---------- ลบสำเนาบนเซิร์ฟเวอร์ (เฉพาะที่คอมสำนักงานเก็บสำเร็จแล้ว) ----------
    def purge_files(self, older_than_days: int | None = None) -> int:
        days = self.s.retention_days if older_than_days is None else older_than_days
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
        n = 0
        for j in self.db.q("SELECT * FROM jobs WHERE status='done' AND file_purged=0 AND office_sha256<>'' AND office_sha256=sha256 AND finished_at<=?", cutoff):
            from pathlib import Path
            p = Path(j["stored_path"])
            if p.exists() and str(p.resolve()).startswith(str(self.s.files_dir.resolve())):
                p.unlink()
            self.db.run("UPDATE jobs SET file_purged=1 WHERE id=?", j["id"])
            self.db.audit("purged", "ระบบ", j["id"], "ลบสำเนาบนเซิร์ฟเวอร์ (คอมสำนักงานเก็บแล้ว ตรวจ sha256 ตรงกัน)")
            n += 1
        return n

    def _job(self, jid: str):
        j = self.db.one("SELECT * FROM jobs WHERE id=?", jid)
        if not j:
            raise JobError("ไม่พบรายการ")
        return j
