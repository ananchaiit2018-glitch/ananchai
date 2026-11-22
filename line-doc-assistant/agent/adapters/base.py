"""ข้อตกลงของ Adapter — ตัวกลางที่นำข้อมูลที่ยืนยันแล้วไปกรอกในระบบทะเบียนเดิม

ทุก Adapter ต้อง:
1. ไม่แก้เว็บไซต์/ฐานข้อมูลเดิม ไม่ลบข้อมูล — ทำผ่านหน้าเว็บเหมือนเจ้าหน้าที่เท่านั้น
2. ไม่กำหนดเลขทะเบียนเอง — อ่านเลขที่ระบบเดิมออกให้จากหน้าจอผลลัพธ์
3. ตรวจผลการบันทึกจากระบบจริงก่อนตอบว่าสำเร็จ
4. ถ้าไม่แน่ใจว่าบันทึกแล้วหรือยัง ให้ตอบ "ไม่สำเร็จ" พร้อมเหตุผล (ห้ามลองใหม่เอง — กันเลขทะเบียนซ้ำ)
5. ถ้าระบบเดิมเตือนว่าอาจลงซ้ำ ให้หยุดและแจ้งเจ้าหน้าที่ ห้ามกดยืนยันแทน"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class SubmitResult:
    ok: bool
    reg_label: str = ""
    message: str = ""


class RegisterAdapter:
    name = "base"

    def submit(self, job: dict, file_path: Path) -> SubmitResult:   # pragma: no cover - interface
        raise NotImplementedError


class AdapterNotReady(Exception):
    """Adapter ยังไม่ได้ตั้งค่าครบ (เช่น ยังไม่ได้รับ URL/ภาพหน้าจอเว็บไซต์จริง)"""
