"""ความปลอดภัย: ลายเซ็น LINE, รหัสผ่าน, token ของคอมสำนักงาน"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os


def line_signature(channel_secret: str, body: bytes) -> str:
    mac = hmac.new(channel_secret.encode("utf-8"), body, hashlib.sha256).digest()
    return base64.b64encode(mac).decode("ascii")


def verify_line_signature(channel_secret: str, body: bytes, signature: str | None) -> bool:
    """ตรวจ X-Line-Signature (HMAC-SHA256 ของ body ดิบ ด้วย Channel secret) — เทียบแบบเวลาคงที่"""
    if not channel_secret or not signature:
        return False
    return hmac.compare_digest(line_signature(channel_secret, body), signature)


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(pw.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + salt.hex() + "$" + dk.hex()


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.scrypt(pw.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except (ValueError, TypeError):
        return False


def check_bearer(expected: str, header: str | None) -> bool:
    if not expected or not header or not header.startswith("Bearer "):
        return False
    return hmac.compare_digest(header[7:].strip(), expected)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
