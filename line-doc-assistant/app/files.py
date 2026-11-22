"""ตรวจและเก็บไฟล์อย่างปลอดภัย: ชนิดจากเนื้อไฟล์, ขนาด, PDF อันตราย, ภาพผิดรูป"""
from __future__ import annotations

import io
import os
import re
from dataclasses import dataclass
from pathlib import Path

from .security import sha256_bytes

ALLOWED = {"pdf": "application/pdf", "jpg": "image/jpeg", "png": "image/png"}
# คำสั่งใน PDF ที่ใช้รันโค้ด/เปิดโปรแกรม/ฝังไฟล์ — เอกสารราชการปกติไม่มี
PDF_DANGER = [rb"/JavaScript", rb"/JS\b", rb"/Launch", rb"/EmbeddedFile", rb"/RichMedia", rb"/OpenAction\s*<<[^>]*?/S\s*/JavaScript", rb"/XFA"]


class FileRejected(Exception):
    """ไฟล์ไม่ผ่านการตรวจ — ข้อความเป็นภาษาไทยสำหรับแจ้งผู้ส่ง"""


@dataclass
class StoredFile:
    path: Path
    kind: str          # pdf / jpg / png
    mime: str
    size: int
    sha256: str
    pages: int


def sniff(data: bytes) -> str | None:
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    return None


def safe_display_name(name: str, kind: str) -> str:
    """ชื่อไฟล์สำหรับแสดงผลเท่านั้น (ไม่ใช้เป็นพาธ) — ตัดอักขระควบคุม/ตัวคั่นพาธ"""
    name = re.sub(r"[\x00-\x1f\\/:*?\"<>|]", "_", (name or "").strip())[:120]
    return name or f"เอกสาร.{kind}"


def validate(data: bytes, max_mb: int, max_pages: int) -> tuple[str, int]:
    if not data:
        raise FileRejected("ไฟล์ว่างเปล่า")
    if len(data) > max_mb * 1024 * 1024:
        raise FileRejected(f"ไฟล์ใหญ่เกิน {max_mb} MB")
    kind = sniff(data)
    if not kind:
        raise FileRejected("รับเฉพาะไฟล์ PDF, JPG, JPEG, PNG")
    pages = 1
    if kind == "pdf":
        for pat in PDF_DANGER:
            if re.search(pat, data):
                raise FileRejected("ไฟล์ PDF นี้มีสคริปต์หรือไฟล์ฝังอยู่ ระบบไม่รับเพื่อความปลอดภัย")
        import pypdfium2 as pdfium
        try:
            pdf = pdfium.PdfDocument(data)
        except pdfium.PdfiumError as e:
            if "password" in str(e).lower():
                raise FileRejected("ไฟล์ PDF มีรหัสผ่าน กรุณาส่งไฟล์ที่ไม่ล็อก") from e
            raise FileRejected("เปิดไฟล์ PDF ไม่ได้ (ไฟล์อาจเสีย)") from e
        try:
            pages = len(pdf)
        finally:
            pdf.close()
        if pages < 1:
            raise FileRejected("ไฟล์ PDF ไม่มีหน้าเอกสาร")
        if pages > max_pages:
            raise FileRejected(f"ไฟล์ PDF มี {pages} หน้า เกินที่กำหนด ({max_pages} หน้า)")
    else:
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = 60_000_000          # กันภาพระเบิด (decompression bomb)
        try:
            with Image.open(io.BytesIO(data)) as im:
                im.verify()
            with Image.open(io.BytesIO(data)) as im:
                if im.width < 200 or im.height < 200:
                    raise FileRejected("ภาพเล็กเกินไป อ่านข้อความไม่ได้")
        except FileRejected:
            raise
        except Exception as e:  # noqa: BLE001
            raise FileRejected("ไฟล์ภาพเสียหรือไม่ใช่ภาพจริง") from e
    return kind, pages


def store(files_dir: Path, job_id: str, data: bytes, kind: str, pages: int) -> StoredFile:
    """เก็บด้วยชื่อที่ระบบสร้าง: files/<job_id>/<sha256>.<ext> — เขียนไฟล์ชั่วคราวแล้วค่อยเปลี่ยนชื่อ"""
    digest = sha256_bytes(data)
    d = files_dir / job_id
    d.mkdir(parents=True, exist_ok=True)
    dest = d / f"{digest}.{kind}"
    tmp = d / f".{digest}.tmp"
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(dest)
    try:
        os.chmod(dest, 0o600)
    except OSError:
        pass
    return StoredFile(path=dest, kind=kind, mime=ALLOWED[kind], size=len(data), sha256=digest, pages=pages)
