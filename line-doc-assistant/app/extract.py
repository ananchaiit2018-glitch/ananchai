"""แยก 4 ช่องหลักจากข้อความหนังสือราชการ: เลขที่หนังสือ / วันที่หนังสือ / ผู้ส่ง / ผู้รับ
(+ เรื่อง — ระบบทะเบียนเดิมบังคับกรอก จึงอ่านเป็นข้อมูลช่วยให้เจ้าหน้าที่ตรวจ)

หลัก: ห้ามเดา — ไม่พบ หรืออ่านไม่ชัด = ทำเครื่องหมาย "กรุณาตรวจสอบ" ไม่ดัดแปลง/เติมค่าให้เอง"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import date

from .ocr import OcrLine

CHECK = "กรุณาตรวจสอบ"
CONF_OK = 80.0                       # ต่ำกว่านี้ = อ่านไม่ชัด ต้องให้คนตรวจ
TH_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")
MONTHS = [("มกราคม", "ม.ค."), ("กุมภาพันธ์", "ก.พ."), ("มีนาคม", "มี.ค."), ("เมษายน", "เม.ย."), ("พฤษภาคม", "พ.ค."), ("มิถุนายน", "มิ.ย."),
          ("กรกฎาคม", "ก.ค."), ("สิงหาคม", "ส.ค."), ("กันยายน", "ก.ย."), ("ตุลาคม", "ต.ค."), ("พฤศจิกายน", "พ.ย."), ("ธันวาคม", "ธ.ค.")]
FIELDS = {"book_no": "เลขที่หนังสือ", "book_date": "วันที่หนังสือ", "sender": "ผู้ส่ง", "receiver": "ผู้รับ", "subject": "เรื่อง"}


@dataclass
class Field:
    value: str = ""
    display: str = ""
    conf: float = 0.0
    check: bool = True
    note: str = CHECK + " — อ่านไม่พบในเอกสาร"


def _loose(word: str) -> str:
    """ยอมให้มีช่องว่างแทรกระหว่างตัวอักษร (OCR มักแทรก) และไม้เอก/โท/ตรี/จัตวาหลุดได้"""
    parts = []
    for c in word:
        e = re.escape(c)
        parts.append(e + "?" if c in "่้๊๋" else e)
    return r"\s*".join(parts)


def _kw(word: str) -> re.Pattern:
    return re.compile(r"^\s*" + _loose(word) + r"\s*[:：.]?\s*")


def _clean(s: str) -> str:
    return re.sub(r"\s{2,}", " ", re.sub(r"[|_~`]+", " ", s or "")).strip()


def _field(value: str, conf: float, display: str = "") -> Field:
    value = _clean(value)
    if not value:
        return Field()
    if conf < CONF_OK:
        return Field(value, display or value, conf, True, f"{CHECK} — อ่านไม่ชัด (ความมั่นใจ {conf:.0f}%)")
    return Field(value, display or value, conf, False, "")


def parse_thai_date(text: str, today: date | None = None) -> tuple[str, str] | None:
    """'๑๗ พฤศจิกายน ๒๕๖๙' -> ('2026-11-17', '17 พฤศจิกายน 2569') · ไม่แก้ปีให้เอง: ปีผิดปกติ = None"""
    t = re.sub(r"(?<=\d)\s+(?=\d)", "", (text or "").translate(TH_DIGITS))   # OCR แยกกลุ่มตัวเลข
    today = today or date.today()
    for mi, names in enumerate(MONTHS):
        for name in names:
            m = re.search(r"(\d{1,2})\s*" + _loose(name) + r"\s*(?:พ\.?\s*ศ\.?\s*)?(\d{4})", t)
            if not m:
                continue
            d, y_be = int(m.group(1)), int(m.group(2))
            if not (2400 <= y_be <= 2700) or abs((y_be - 543) - today.year) > 2:
                return None
            try:
                iso = date(y_be - 543, mi + 1, d).isoformat()
            except ValueError:
                return None                                   # เช่น 31 กุมภาพันธ์
            return iso, f"{d} {MONTHS[mi][0]} {y_be}"
    return None


TH_DIGIT_RE = re.compile(r"[๐-๙]")
NOTE_DIGITS = CHECK + " — ตัวเลขไทยที่อ่านจากภาพอาจผิด (เช่น ๔/๕, ๓/๙)"


def extract(lines: list[OcrLine], today: date | None = None, from_image: bool = False) -> dict[str, dict]:
    res = _extract(lines, today)
    if from_image:                     # OCR สับสนตัวเลขไทยได้แม้ความมั่นใจสูง -> ให้คนตรวจทุกครั้ง (ไม่ถือว่าอ่านชัด)
        for k, f in res.items():
            src = f["display"] if k == "book_date" else f["value"]
            if f["value"] and not f["check"] and (TH_DIGIT_RE.search(src or "") or k == "book_date"):
                f["check"], f["note"] = True, NOTE_DIGITS
    return res


def _extract(lines: list[OcrLine], today: date | None = None) -> dict[str, dict]:
    out = {k: Field() for k in FIELDS}
    re_no, re_dateword = _kw("ที่"), re.compile(_loose("วันที่"))
    stop = [_kw(w) for w in ("เรียน", "อ้างถึง", "สิ่งที่ส่งมาด้วย", "สิ่งที่แนบมาด้วย", "ด้วย", "ตามที่", "เนื่องด้วย", "เนื่องจาก")]
    found = set()
    for i, ln in enumerate(lines):
        t, c = ln.text, ln.conf
        # ผู้ส่ง: "ส่วนราชการ ..." (บันทึกข้อความ)
        if "sender" not in found and _kw("ส่วนราชการ").search(t):
            v = _kw("ส่วนราชการ").sub("", t)
            v = re.split(_loose("โทร"), v)[0]
            out["sender"] = _field(v, c); found.add("sender")
        # เลขที่หนังสือ: บรรทัดขึ้นต้นด้วย "ที่" (ไม่ใช่ "วันที่") และต้องมีตัวเลข
        if "book_no" not in found and re_no.search(t) and not _kw("วันที่").search(t):
            rest = re_no.sub("", t, count=1)
            dw = re_dateword.search(rest)
            if dw:
                if "book_date" not in found:
                    p = parse_thai_date(rest[dw.start():], today)
                    if p:
                        out["book_date"] = _field(p[0], c, p[1]); found.add("book_date")
                rest = rest[: dw.start()]
            if re.search(r"[0-9๐-๙]", rest):
                m = re.match(r"^(.*?/\s*[0-9๐-๙]+)", rest)
                v = re.sub(r"\s*/\s*", "/", (m.group(1) if m else rest)[:80])
                out["book_no"] = _field(v, c); found.add("book_no")
        # วันที่หนังสือ (หนังสือภายนอก: บรรทัดวันที่อยู่เดี่ยวๆ ช่วงต้นหนังสือ)
        if "book_date" not in found and i < 15 and (re_dateword.search(t) or any(re.search(_loose(n), t) for m in MONTHS for n in m)):
            p = parse_thai_date(t, today)
            if p:
                out["book_date"] = _field(p[0], c, p[1]); found.add("book_date")
        # เรื่อง (อาจต่อ 1–2 บรรทัด จนถึง เรียน)
        if "subject" not in found and _kw("เรื่อง").search(t):
            parts, confs = [_kw("เรื่อง").sub("", t, count=1)], [c]
            for nxt in lines[i + 1: i + 3]:
                if any(r.search(nxt.text) for r in stop) or re_no.search(nxt.text):
                    break
                parts.append(nxt.text); confs.append(nxt.conf)
            out["subject"] = _field(" ".join(parts), min(confs)); found.add("subject")
        # ผู้รับ: "เรียน ..."
        if "receiver" not in found and _kw("เรียน").search(t):
            out["receiver"] = _field(_kw("เรียน").sub("", t, count=1), c); found.add("receiver")
    return {k: asdict(v) for k, v in out.items()}
