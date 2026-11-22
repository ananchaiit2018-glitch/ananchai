"""ทะเบียนจำลอง (Demo Mode) — ทำตัวเหมือนระบบทะเบียน: ออกเลขเอง, กันงานซ้ำ, ตรวจผลหลังบันทึก
ไม่แตะเว็บไซต์หรือฐานข้อมูลจริงใดๆ — เก็บเป็นไฟล์ JSON ในโฟลเดอร์คอมสำนักงาน"""
from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

from .base import RegisterAdapter, SubmitResult

FAIL_MARK = "[จำลองผิดพลาด]"


class DemoRegisterAdapter(RegisterAdapter):
    name = "demo"

    def __init__(self, folder: Path):
        self.path = Path(folder) / "ทะเบียนจำลอง.json"

    def _load(self) -> dict:
        if self.path.exists():
            return json.loads(self.path.read_text(encoding="utf-8"))
        return {"entries": [], "counters": {}}

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(self.path)

    def submit(self, job: dict, file_path: Path) -> SubmitResult:
        v = job["values"]
        if FAIL_MARK in v.get("subject", ""):
            return SubmitResult(False, message="ทะเบียนจำลอง: จำลองว่าเว็บทะเบียนตอบข้อผิดพลาด")
        if not Path(file_path).exists():
            return SubmitResult(False, message="ไม่พบไฟล์แนบในคอมสำนักงาน")
        data = self._load()
        for e in data["entries"]:                        # งานเดิมเคยบันทึกแล้ว -> ไม่ออกเลขใหม่
            if e["job_id"] == job["id"]:
                return SubmitResult(True, e["reg_label"], "ทะเบียนจำลอง: รายการนี้บันทึกไว้แล้ว (ไม่ออกเลขซ้ำ)")
        year = date.today().year + 543
        key = f'{v.get("kind", "in")}-{year}'
        no = data["counters"].get(key, 0) + 1
        data["counters"][key] = no
        reg = f"{no:03d}/{year}"
        data["entries"].append({"job_id": job["id"], "kind": v.get("kind", "in"), "reg_label": reg, "book_no": v.get("book_no"), "book_date": v.get("book_date"),
                                "from": v.get("sender"), "to": v.get("receiver"), "subject": v.get("subject"), "officer": v.get("officer"),
                                "attachment": os.path.basename(str(file_path))})
        self._save(data)
        check = [e for e in self._load()["entries"] if e["job_id"] == job["id"]]   # ตรวจผลจาก "ระบบ" หลังบันทึก
        if len(check) != 1 or check[0]["reg_label"] != reg:
            return SubmitResult(False, message="ทะเบียนจำลอง: ตรวจผลหลังบันทึกไม่พบรายการ")
        return SubmitResult(True, reg, "ทะเบียนจำลอง: บันทึกและตรวจผลแล้ว")
