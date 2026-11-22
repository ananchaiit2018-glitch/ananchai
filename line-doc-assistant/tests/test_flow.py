"""ทดสอบทั้งเส้นทาง: LINE → อ่าน → ตรวจสอบ → ยืนยัน → คอมสำนักงาน → ผล → แจ้ง LINE"""
import json
import threading
from pathlib import Path

import pytest

from conftest import ALLOWED_UID, FIX, line_post, login_admin, outbox, send_file
from app import jobs as J


def _confirm_values(**kw):
    v = {"book_no": "นร ๕๑๑๙.๑/๑๕๑๗", "book_date": "2026-11-14", "sender": "ร้อย ฉก.ตชด.๔๔๔", "receiver": "ผบ.มว.ฉก.ตชด.๔๔๔๑",
         "subject": "ขอส่งรายงาน", "officer": "ส.ต.ท.เนวิน แดงแจ้", "kind": "in"}
    v.update(kw)
    return v


def _agent(env, agent_id="office-1"):
    from agent.adapters.demo_register import DemoRegisterAdapter
    from agent.office_agent import OfficeAgent
    inbox = env["tmp"] / "office"
    return OfficeAgent("http://testserver", env["s"].agent_token, agent_id, inbox, DemoRegisterAdapter(inbox), client=env["client"])


# ---------------- ความปลอดภัยของ webhook ----------------
def test_webhook_rejects_bad_signature(env):
    r = line_post(env, [], sig="invalid")
    assert r.status_code == 401
    r = line_post(env, [], secret="other-secret")
    assert r.status_code == 401
    assert env["db"].one("SELECT COUNT(*) n FROM audit WHERE action='bad_signature'")["n"] == 2


def test_unknown_line_user_is_refused(env):
    stranger = "U" + "b" * 32
    send_file(env, FIX / "memo-text.pdf", uid=stranger)
    assert env["db"].one("SELECT COUNT(*) n FROM jobs")["n"] == 0
    assert stranger in outbox(env)[-1] and "ยังไม่มีสิทธิ์" in outbox(env)[-1]


def test_text_message_gets_help(env):
    line_post(env, [{"type": "message", "replyToken": "r", "source": {"userId": ALLOWED_UID}, "message": {"type": "text", "id": "t1", "text": "สวัสดี"}}])
    assert "PDF" in outbox(env)[-1]


# ---------------- รับไฟล์ + อ่านข้อมูล ----------------
def test_pdf_text_flow_reads_fields(env):
    assert send_file(env, FIX / "memo-text.pdf").status_code == 200
    assert outbox(env)[-1] == J.MSG_RECEIVED
    env["svc"].drain()
    j = env["db"].one("SELECT * FROM jobs")
    assert j["status"] == "review" and j["ocr_method"] == "pdf-text" and len(j["sha256"]) == 64
    f = json.loads(j["extracted_json"])
    assert f["book_no"]["value"] == "นร ๕๑๑๙.๑ (ร้อย ฉก.ตชด.๔๔๔)๘๔/๑๕๑๗" and not f["book_no"]["check"]
    assert f["book_date"]["value"] == "2026-11-14" and f["book_date"]["display"] == "14 พฤศจิกายน 2569"
    assert f["sender"]["value"] == "ร้อย ฉก.ตชด.๔๔๔" and f["receiver"]["value"] == "ผบ.มว.ฉก.ตชด.๔๔๔๑"
    assert outbox(env)[-1].startswith(J.MSG_READ_DONE) and f"/review/{j['id']}" in outbox(env)[-1]


def test_scanned_image_is_ocr_and_unclear_fields_flagged(env):
    send_file(env, FIX / "memo-scan.png", as_image=True)
    env["svc"].drain()
    j = env["db"].one("SELECT * FROM jobs")
    assert j["status"] == "review" and j["ocr_method"] == "image-ocr" and j["file_type"] == "png"
    f = json.loads(j["extracted_json"])
    for k, v in f.items():               # ทุกช่อง: มีค่าที่อ่านชัด หรือถูกทำเครื่องหมาย "กรุณาตรวจสอบ" (ไม่มีการเดา)
        assert (v["value"] and not v["check"]) or (v["check"] and "กรุณาตรวจสอบ" in v["note"]), (k, v)


def test_duplicate_line_delivery_creates_one_job(env):
    send_file(env, FIX / "memo-text.pdf", mid="same")
    send_file(env, FIX / "memo-text.pdf", mid="same")
    assert env["db"].one("SELECT COUNT(*) n FROM jobs")["n"] == 1


@pytest.mark.parametrize("name,expect", [("fake.pdf", "รับเฉพาะไฟล์"), ("evil.pdf", "สคริปต์")])
def test_dangerous_files_rejected(env, name, expect):
    send_file(env, FIX / name, mid="x" + name)
    env["svc"].drain()
    j = env["db"].one("SELECT * FROM jobs")
    assert j["status"] == "rejected" and expect in j["result_message"]
    assert not list((env["s"].files_dir).glob("**/*.pdf"))
    assert expect in outbox(env)[-1]


def test_oversize_file_rejected_before_download(env):
    line_post(env, [{"type": "message", "replyToken": "r", "source": {"userId": ALLOWED_UID}, "message": {"type": "file", "id": "big", "fileName": "a.pdf", "fileSize": 999_000_000}}])
    assert env["db"].one("SELECT COUNT(*) n FROM jobs")["n"] == 0 and "ใหญ่เกิน" in outbox(env)[-1]


# ---------------- ตรวจสอบ / ยืนยัน ----------------
def _review_job(env, mid="m1"):
    send_file(env, FIX / "memo-text.pdf", mid=mid)
    env["svc"].drain()
    return env["db"].one("SELECT id FROM jobs WHERE message_id=?", mid)["id"]


def test_confirm_requires_complete_fields_and_only_once(env):
    jid = _review_job(env)
    with pytest.raises(J.JobError, match="ผู้บันทึก"):
        env["svc"].confirm(jid, _confirm_values(officer=""), "admin")
    with pytest.raises(J.JobError, match="วันที่หนังสือ"):
        env["svc"].confirm(jid, _confirm_values(book_date=""), "admin")
    env["svc"].confirm(jid, _confirm_values(), "admin")
    with pytest.raises(J.JobError):
        env["svc"].confirm(jid, _confirm_values(), "admin")
    j = env["db"].one("SELECT * FROM jobs WHERE id=?", jid)
    assert j["status"] == "confirmed" and j["confirmed_by"] == "admin"


def test_line_jobs_are_always_incoming(env):
    jid = _review_job(env)
    env["svc"].confirm(jid, _confirm_values(kind="out"), "admin")   # แม้ฟอร์มส่ง out มา ก็ต้องเป็นหนังสือรับ
    assert json.loads(env["db"].one("SELECT final_json FROM jobs WHERE id=?", jid)["final_json"])["kind"] == "in"
    _agent(env).run_once()
    ledger = json.loads((env["tmp"] / "office" / "ทะเบียนจำลอง.json").read_text(encoding="utf-8"))
    assert ledger["entries"][0]["kind"] == "in"


def test_nothing_reaches_register_before_confirmation(env):
    _review_job(env)
    ag = _agent(env)
    assert ag.run_once() is None                         # ยังไม่ยืนยัน -> คอมสำนักงานไม่ได้งาน
    assert not (env["tmp"] / "office" / "ทะเบียนจำลอง.json").exists()


# ---------------- คอมสำนักงาน ----------------
def test_agent_saves_and_notifies(env):
    jid = _review_job(env)
    env["svc"].confirm(jid, _confirm_values(), "admin")
    ag = _agent(env)
    assert ag.run_once() == jid
    j = env["db"].one("SELECT * FROM jobs WHERE id=?", jid)
    assert j["status"] == "done" and j["reg_label"].startswith("001/") and j["office_sha256"] == j["sha256"]
    assert Path(j["office_path"]).exists()
    assert outbox(env)[-1].startswith(J.MSG_SAVED) and j["reg_label"] in outbox(env)[-1]
    ledger = json.loads((env["tmp"] / "office" / "ทะเบียนจำลอง.json").read_text(encoding="utf-8"))
    assert len(ledger["entries"]) == 1 and ledger["entries"][0]["subject"] == "ขอส่งรายงาน"
    assert ag.run_once() is None                          # ไม่มีงานซ้ำ


def test_failure_is_reported_and_never_auto_retried(env):
    jid = _review_job(env)
    env["svc"].confirm(jid, _confirm_values(subject="ทดสอบ [จำลองผิดพลาด]"), "admin")
    ag = _agent(env)
    ag.run_once()
    j = env["db"].one("SELECT * FROM jobs WHERE id=?", jid)
    assert j["status"] == "failed" and outbox(env)[-1] == J.MSG_FAILED
    assert ag.run_once() is None                          # ไม่ส่งซ้ำอัตโนมัติ
    with pytest.raises(J.JobError, match="ตรวจในเว็บทะเบียน"):
        env["svc"].requeue(jid, "admin", checked_not_saved=False)
    env["svc"].mark_done_manual(jid, "045/2570", "admin")
    assert env["db"].one("SELECT status, reg_label FROM jobs WHERE id=?", jid)["reg_label"] == "045/2570"


def test_two_office_pcs_never_get_same_job(env):
    jid = _review_job(env)
    env["svc"].confirm(jid, _confirm_values(), "admin")
    got, lock = [], threading.Lock()

    def worker(n):
        r = env["svc"].claim(f"pc-{n}")
        with lock:
            got.append(r)
    ts = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert len([g for g in got if g]) == 1


def test_agent_token_required(env):
    c = env["client"]
    assert c.post("/agent/claim").status_code == 401
    assert c.post("/agent/claim", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_report_only_by_claiming_agent(env):
    jid = _review_job(env)
    env["svc"].confirm(jid, _confirm_values(), "admin")
    env["svc"].claim("pc-a")
    with pytest.raises(J.JobError):
        env["svc"].report(jid, "pc-b", True, "001/2570")


def test_sha_mismatch_means_failure(env):
    jid = _review_job(env)
    env["svc"].confirm(jid, _confirm_values(), "admin")
    env["svc"].claim("pc-a")
    env["svc"].report(jid, "pc-a", True, "001/2570", office_sha256="0" * 64)
    assert env["db"].one("SELECT status FROM jobs WHERE id=?", jid)["status"] == "failed"


def test_server_copy_purged_only_after_verified_office_copy(env):
    a = _review_job(env, "a")
    b = _review_job(env, "b")
    for jid in (a, b):
        env["svc"].confirm(jid, _confirm_values(), "admin")
    _agent(env).run_once()                                         # a สำเร็จ (คอมสำนักงานเก็บแล้ว)
    assert env["svc"].purge_files(older_than_days=0) == 1
    ja, jb = (env["db"].one("SELECT * FROM jobs WHERE id=?", x) for x in (a, b))
    assert ja["file_purged"] == 1 and not Path(ja["stored_path"]).exists()
    assert jb["file_purged"] == 0 and Path(jb["stored_path"]).exists()   # ยังไม่เสร็จ -> ไม่ลบ


# ---------------- Dashboard ----------------
def test_dashboard_requires_login_and_blocks_cross_site_post(env):
    c = env["client"]
    assert c.get("/", follow_redirects=False).headers["location"] == "/login"
    login_admin(env)
    assert c.get("/").status_code == 200
    jid = _review_job(env)
    r = c.post(f"/review/{jid}", data={"action": "confirm", **_confirm_values()}, headers={"origin": "https://evil.example"}, follow_redirects=False)
    assert r.status_code == 403
    r = c.post(f"/review/{jid}", data={"action": "confirm", **_confirm_values()}, headers={"origin": "http://testserver"}, follow_redirects=False)
    assert r.status_code == 303
    assert env["db"].one("SELECT status FROM jobs WHERE id=?", jid)["status"] == "confirmed"


def test_all_dashboard_pages_render(env):
    c = login_admin(env)
    jid = _review_job(env)
    for p in ["/", "/review", f"/review/{jid}", f"/review/{jid}/file", f"/review/{jid}/page/1.png", "/history", "/history?status=review&q=memo", "/agents", "/settings/line", "/settings/system", "/demo"]:
        assert c.get(p).status_code == 200, p


def test_backup_checks_integrity(env):
    c = login_admin(env)
    _review_job(env)
    c.post("/settings/system/backup", headers={"origin": "http://testserver"})
    a = env["db"].one("SELECT detail FROM audit WHERE action='backup'")
    d = json.loads(a["detail"])
    assert d["integrity"] is True and d["bad_files"] == []


def test_thai_office_pc_name(env):
    jid = _review_job(env)
    env["svc"].confirm(jid, _confirm_values(), "admin")
    ag = _agent(env, agent_id="คอมสารบรรณ-1")
    assert ag.run_once() == jid
    j = env["db"].one("SELECT status, agent_id FROM jobs WHERE id=?", jid)
    assert j["status"] == "done" and j["agent_id"] == "คอมสารบรรณ-1"
