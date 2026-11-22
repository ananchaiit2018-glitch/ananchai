"""การตั้งค่าระบบ — อ่านจากไฟล์ .env และ data/secrets.env (รหัส/token ไม่อยู่ในซอร์สโค้ด)"""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _read_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


@dataclass
class Settings:
    data_dir: Path
    mode: str = "demo"                       # demo = จำลอง LINE / live = ใช้ LINE จริง
    line_channel_secret: str = ""
    line_channel_access_token: str = ""
    public_base_url: str = "http://localhost:8800"
    agent_token: str = ""
    session_secret: str = ""
    max_file_mb: int = 20
    max_pdf_pages: int = 30
    retention_days: int = 30
    tesseract_cmd: str = ""
    office_inbox: Path = field(default_factory=lambda: ROOT / "office-inbox")
    use_claude: bool = False                 # ปิดเสมอจนกว่าผู้ดูแลอนุมัติ (ยังไม่มีส่วนเชื่อมต่อ)

    @property
    def is_demo(self) -> bool:
        return self.mode != "live"

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "assistant.db"


def _secret_file(data_dir: Path) -> Path:
    return data_dir / "secrets.env"


def ensure_generated_secrets(data_dir: Path) -> dict[str, str]:
    """สร้าง session secret / agent token แบบสุ่มครั้งแรก เก็บใน data/secrets.env (สิทธิ์เฉพาะเจ้าของไฟล์)"""
    data_dir.mkdir(parents=True, exist_ok=True)
    f = _secret_file(data_dir)
    cur = _read_env_file(f)
    changed = False
    for k in ("SESSION_SECRET", "AGENT_TOKEN"):
        if not cur.get(k):
            cur[k] = secrets.token_urlsafe(32)
            changed = True
    if changed:
        write_secrets(data_dir, cur)
    return cur


def write_secrets(data_dir: Path, values: dict[str, str]) -> None:
    f = _secret_file(data_dir)
    body = "# สร้างโดยระบบ — ห้ามส่งไฟล์นี้ให้ผู้อื่น ห้ามขึ้น git\n" + "".join(f"{k}={v}\n" for k, v in values.items())
    tmp = f.with_suffix(".tmp")
    tmp.write_text(body, encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    tmp.replace(f)


def load_settings(data_dir: str | Path | None = None) -> Settings:
    env = {**_read_env_file(ROOT / ".env"), **os.environ}
    d = Path(data_dir or env.get("DATA_DIR") or (ROOT / "data")).resolve()
    gen = ensure_generated_secrets(d)
    sec = _read_env_file(_secret_file(d))
    get = lambda k, dv="": env.get(k) or sec.get(k) or dv  # noqa: E731
    return Settings(
        data_dir=d,
        mode=get("MODE", "demo").lower(),
        line_channel_secret=get("LINE_CHANNEL_SECRET"),
        line_channel_access_token=get("LINE_CHANNEL_ACCESS_TOKEN"),
        public_base_url=get("PUBLIC_BASE_URL", "http://localhost:8800").rstrip("/"),
        agent_token=get("AGENT_TOKEN") or gen["AGENT_TOKEN"],
        session_secret=get("SESSION_SECRET") or gen["SESSION_SECRET"],
        max_file_mb=int(get("MAX_FILE_MB", "20")),
        max_pdf_pages=int(get("MAX_PDF_PAGES", "30")),
        retention_days=int(get("RETENTION_DAYS", "30")),
        tesseract_cmd=get("TESSERACT_CMD"),
        office_inbox=Path(get("OFFICE_INBOX", str(ROOT / "office-inbox"))),
        use_claude=False,
    )
