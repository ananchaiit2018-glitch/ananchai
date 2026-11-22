"""Adapter สำหรับเว็บไซต์ทะเบียนหนังสือเดิม (Playwright) — ยังไม่เปิดใช้งาน

จะเขียนส่วนกรอกข้อมูลจริงหลังได้รับจากผู้ดูแล:
  1) URL ของเว็บทะเบียนเดิมในคอมสำนักงาน
  2) ภาพหน้าจอ: หน้าเข้าสู่ระบบ / หน้าเลือกผู้เข้าเวร / หน้าเพิ่มหนังสือรับ / หน้าจอหลังบันทึกสำเร็จ / กล่องเตือนลงซ้ำ / หน้าทะเบียน
  3) ยืนยันว่าทดสอบกับข้อมูลทดลองได้ (ไม่ใช่ข้อมูลจริง) และสำรองข้อมูลระบบเดิมแล้ว

ไม่เดาชื่อช่องหรือปุ่ม — ตัวเลือก (selector) ทุกตัวต้องมาจากหน้าจอจริงและเก็บในไฟล์ตั้งค่า
รหัสผ่านเข้าเว็บเดิมอ่านจากตัวแปรแวดล้อม LEGACY_PASSWORD (ไม่อยู่ในซอร์สโค้ด)"""
from __future__ import annotations

from pathlib import Path

from .base import AdapterNotReady, RegisterAdapter, SubmitResult


class LegacyWebAdapter(RegisterAdapter):
    name = "legacy-web"

    def __init__(self, url: str, selectors_file: Path):
        self.url, self.selectors_file = url, Path(selectors_file)

    def submit(self, job: dict, file_path: Path) -> SubmitResult:
        raise AdapterNotReady("ยังไม่ได้ตั้งค่า Adapter เว็บทะเบียนเดิม — รอ URL และภาพหน้าจอจริงจากผู้ดูแล (ดู docs/ข้อมูลที่ต้องขอ.md)")
