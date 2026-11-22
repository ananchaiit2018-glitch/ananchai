"""อ่านข้อความจากเอกสาร: PDF ที่มีตัวอักษร (อ่านตรง) / PDF สแกน + รูป (Tesseract ภาษาไทย)
คืนข้อความเป็นบรรทัด พร้อมค่าความมั่นใจ (0–100) ของแต่ละบรรทัด — ไม่ส่งเอกสารออกนอกเครื่อง"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

# PDF จาก Word + ฟอนต์ TH Sarabun มักเก็บสระบน/วรรณยุกต์เป็นรหัสพิเศษ U+F700–F71A
THAI_PUA = dict(zip(
    [chr(c) for c in range(0xF700, 0xF71B)],
    ["ฐ", "ิ", "ี", "ึ", "ื", "่", "้", "๊", "๋", "์", "่", "้", "๊", "๋", "์", "ญ", "ั", "ํ", "็", "่", "้", "๊", "๋", "์", "ุ", "ู", "ฺ"],
))
_COMBINING = "ัิ-ฺ็-๎"


@dataclass
class OcrLine:
    text: str
    conf: float          # 0–100 (PDF ที่มีตัวอักษร = 100)


@dataclass
class OcrResult:
    method: str          # pdf-text / pdf-ocr / image-ocr / failed
    lines: list[OcrLine] = field(default_factory=list)
    error: str = ""

    @property
    def text(self) -> str:
        return "\n".join(l.text for l in self.lines)


def normalize_thai(s: str) -> str:
    s = "".join(THAI_PUA.get(c, c) for c in s)
    s = re.sub(rf"\s+(?=[{_COMBINING}])", "", s)          # ช่องว่างหน้าสระบน/ล่าง/วรรณยุกต์เป็นของเกินเสมอ
    s = s.replace("ํา", "ำ")                # ํ + า -> ำ
    return re.sub(r"[ \t]{2,}", " ", s).strip()


def looks_garbled(text: str) -> bool:
    """ข้อความจาก PDF บางไฟล์ถอดออกมาเป็นอักขระควบคุม/สัญลักษณ์แทรกกลางคำไทย"""
    if re.search(r"[\x00-\x08\x0e-\x1f]", text):
        return True
    return len(re.findall(r"[ก-๛][!\"#$%&;<=>?@^_`{|}~][ก-๛]", text)) > 3


def _tesseract(img, lang: str = "tha") -> list[OcrLine]:
    import pytesseract
    from PIL import ImageOps

    g = ImageOps.exif_transpose(img).convert("L")
    long_side = max(g.size)
    if long_side < 2200:
        s = min(3.0, 2600 / long_side)
        g = g.resize((int(g.width * s), int(g.height * s)))
    elif long_side > 4000:
        s = 3600 / long_side
        g = g.resize((int(g.width * s), int(g.height * s)))
    g = ImageOps.autocontrast(g, cutoff=1)
    d = pytesseract.image_to_data(g, lang=lang, config="--psm 3", output_type=pytesseract.Output.DICT)
    groups: dict[tuple, list[tuple[str, float]]] = {}
    for i, word in enumerate(d["text"]):
        w = (word or "").strip()
        conf = float(d["conf"][i])
        if not w or conf < 0:
            continue
        key = (d["block_num"][i], d["par_num"][i], d["line_num"][i])
        groups.setdefault(key, []).append((w, conf, d["left"][i], d["width"][i], d["height"][i]))
    lines = []
    for key in sorted(groups):
        words = sorted(groups[key], key=lambda x: x[2])
        h = sorted(x[4] for x in words)[len(words) // 2] or 1
        text, end = "", None
        for w, _, left, width, _ in words:            # Tesseract แยกภาษาไทยเป็นชิ้นเล็กๆ -> ใส่ช่องว่างเฉพาะที่ห่างจริง
            if end is not None and left - end > h * 0.5:
                text += " "
            text += w; end = left + width
        text = normalize_thai(text)
        if text:
            lines.append(OcrLine(text, sum(x[1] for x in words) / len(words)))
    return lines


def _pdf_text_lines(page) -> list[OcrLine]:
    tp = page.get_textpage()
    try:
        raw = tp.get_text_bounded()
    finally:
        tp.close()
    out = []
    for ln in raw.replace("\r", "\n").split("\n"):
        t = normalize_thai(ln)
        if t:
            out.append(OcrLine(t, 100.0))
    return out


def read_document(path, kind: str, tesseract_cmd: str = "") -> OcrResult:
    try:
        if tesseract_cmd:
            import pytesseract
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        if kind == "pdf":
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(str(path))
            try:
                page = pdf[0]                                  # ข้อมูลหัวหนังสืออยู่หน้าแรก
                lines = _pdf_text_lines(page)
                txt = "\n".join(l.text for l in lines)
                if len(re.sub(r"\s", "", txt)) >= 30 and not looks_garbled(txt):
                    return OcrResult("pdf-text", lines)
                img = page.render(scale=300 / 72).to_pil()     # 300 dpi
                return OcrResult("pdf-ocr", _tesseract(img))
            finally:
                pdf.close()
        from PIL import Image
        with Image.open(path) as im:
            im.load()
            return OcrResult("image-ocr", _tesseract(im))
    except Exception as e:  # noqa: BLE001 — อ่านไม่ได้ก็ยังให้คนตรวจเองได้
        return OcrResult("failed", [], error=f"{type(e).__name__}: {e}"[:300])


def read_bytes_image(data: bytes) -> OcrResult:
    from PIL import Image
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        return OcrResult("image-ocr", _tesseract(im))
