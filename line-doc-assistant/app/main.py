"""เซิร์ฟเวอร์ LINE Smart Document Assistant (FastAPI)
- /line/webhook   รับข้อความจาก LINE (ตรวจลายเซ็นทุกครั้ง)
- /agent/*        API สำหรับตัวรับงานคอมสำนักงาน (Bearer token)
- หน้า Dashboard   ภาษาไทย ต้องเข้าสู่ระบบรายบุคคล"""
from __future__ import annotations

import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from . import extract as ex
from .config import Settings, load_settings, write_secrets, _read_env_file
from .db import DB, now
from .jobs import AUDIT_TH, STATUS_TH, JobError, Service
from .line_client import LineClient
from .security import check_bearer, hash_password, line_signature, sha256_file, verify_line_signature, verify_password

HERE = Path(__file__).resolve().parent
MENU = [("overview", "/", "ภาพรวม"), ("review", "/review", "เอกสารรอตรวจสอบ"), ("history", "/history", "ประวัติการรับเอกสาร"),
        ("agents", "/agents", "สถานะการเชื่อมต่อคอมสำนักงาน"), ("line", "/settings/line", "ตั้งค่า LINE"), ("system", "/settings/system", "ตั้งค่าระบบ")]
AGENT_ONLINE_SEC = 90


def thai_time(iso: str) -> str:
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso).astimezone()
    except ValueError:
        return iso
    m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][d.month - 1]
    return f"{d.day} {m} {d.year + 543} {d:%H:%M} น."


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or load_settings()
    if s.is_demo and not s.line_channel_secret:                     # Demo: สร้าง secret จำลองเพื่อให้ตรวจลายเซ็นจริงเหมือนใช้งานจริง
        sec = _read_env_file(s.data_dir / "secrets.env")
        if not sec.get("DEMO_CHANNEL_SECRET"):
            sec["DEMO_CHANNEL_SECRET"] = secrets.token_hex(16); write_secrets(s.data_dir, sec)
        s.line_channel_secret = sec["DEMO_CHANNEL_SECRET"]
    db = DB(s.db_path)
    demo_dir = s.data_dir / "demo-line-content"
    demo_dir.mkdir(parents=True, exist_ok=True)
    line = LineClient(db, s.line_channel_access_token, s.is_demo, demo_dir)
    svc = Service(s, db, line)
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(_app):
        svc.start_worker()
        for j in db.q("SELECT id FROM jobs WHERE status='received'"):   # งานที่ค้างตอนปิดโปรแกรม
            svc.enqueue(j["id"])
        yield

    app = FastAPI(title="LINE Smart Document Assistant", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.settings, app.state.db, app.state.svc = s, db, svc
    app.add_middleware(SessionMiddleware, secret_key=s.session_secret, same_site="strict", https_only=not s.is_demo, max_age=12 * 3600, session_cookie="lsda")
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
    tpl = Jinja2Templates(directory=HERE / "templates")
    tpl.env.filters["thai_time"] = thai_time
    tpl.env.globals.update(STATUS_TH=STATUS_TH, FIELDS=ex.FIELDS, AUDIT_TH=AUDIT_TH)
    fails: dict[str, list[float]] = {}

    @app.middleware("http")
    async def headers(request: Request, call_next):
        # กัน CSRF: คำขอ POST ของหน้า Dashboard ต้องมาจากเว็บไซต์เดียวกันเท่านั้น
        if request.method == "POST" and not request.url.path.startswith(("/line/", "/agent/")):
            origin = request.headers.get("origin") or request.headers.get("referer") or ""
            host = request.headers.get("host", "")
            if origin and host and f"//{host}" not in origin:
                return JSONResponse({"error": "คำขอไม่ถูกต้อง"}, status_code=403)
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        return resp

    # ---------------- ผู้ใช้ Dashboard ----------------
    def user(request: Request):
        uid = request.session.get("uid")
        if not uid:
            return None
        return db.one("SELECT * FROM users WHERE id=? AND active=1", uid)

    def need(request: Request, admin: bool = False):
        u = user(request)
        if not u:
            raise HTTPException(status_code=303, headers={"Location": "/login"})
        if admin and u["role"] != "admin":
            raise HTTPException(status_code=403, detail="เฉพาะผู้ดูแลระบบ")
        return u

    def page(request: Request, name: str, active: str, u, **ctx):
        counts = {r["status"]: r["n"] for r in db.q("SELECT status, COUNT(*) n FROM jobs GROUP BY status")}
        return tpl.TemplateResponse(request, name, {"menu": MENU, "active": active, "me": u, "demo": s.is_demo, "counts": counts, **ctx})

    def flash(request: Request, msg: str, kind: str = "ok"):
        request.session["flash"] = [kind, msg]

    @app.get("/login", response_class=HTMLResponse)
    def login_page(request: Request):
        first = db.one("SELECT COUNT(*) n FROM users")["n"] == 0
        return tpl.TemplateResponse(request, "login.html", {"first": first, "demo": s.is_demo, "error": request.session.pop("login_error", "")})

    @app.post("/login")
    def login(request: Request, username: str = Form(""), password: str = Form(""), display_name: str = Form(""), officer_name: str = Form("")):
        ip = request.client.host if request.client else "?"
        recent = [t for t in fails.get(ip, []) if t > time.time() - 300]
        if len(recent) >= 5:
            request.session["login_error"] = "ใส่รหัสผิดหลายครั้ง กรุณารอ 5 นาที"
            return RedirectResponse("/login", 303)
        if db.one("SELECT COUNT(*) n FROM users")["n"] == 0:                # ตั้งผู้ดูแลระบบคนแรก
            if len(username) < 3 or len(password) < 8:
                request.session["login_error"] = "ชื่อผู้ใช้อย่างน้อย 3 ตัว รหัสผ่านอย่างน้อย 8 ตัว"
                return RedirectResponse("/login", 303)
            db.run("INSERT INTO users(username,display_name,officer_name,pw_hash,role,created_at) VALUES(?,?,?,?,?,?)",
                   username.strip(), display_name.strip() or username, officer_name.strip(), hash_password(password), "admin", now())
            db.audit("first_admin", username)
        u = db.one("SELECT * FROM users WHERE username=? AND active=1", username.strip())
        if not u or not verify_password(password, u["pw_hash"]):
            fails[ip] = recent + [time.time()]
            db.audit("login_fail", username, "", ip)
            request.session["login_error"] = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
            return RedirectResponse("/login", 303)
        request.session.clear(); request.session["uid"] = u["id"]
        db.audit("login", u["username"], "", ip)
        return RedirectResponse("/", 303)

    @app.post("/logout")
    def logout(request: Request):
        request.session.clear()
        return RedirectResponse("/login", 303)

    # ---------------- LINE webhook ----------------
    @app.post("/line/webhook")
    async def webhook(request: Request):
        body = await request.body()
        if not verify_line_signature(s.line_channel_secret, body, request.headers.get("x-line-signature")):
            db.audit("bad_signature", "", "", request.client.host if request.client else "")
            return JSONResponse({"error": "invalid signature"}, status_code=401)
        try:
            events = json.loads(body.decode("utf-8")).get("events", [])
        except (ValueError, UnicodeDecodeError):
            return JSONResponse({"error": "bad body"}, status_code=400)
        svc.handle_events(events)
        return {"ok": True}

    # ---------------- คอมสำนักงาน (agent) ----------------
    def agent_auth(request: Request) -> str:
        if not check_bearer(s.agent_token, request.headers.get("authorization")):
            raise HTTPException(401, "token ไม่ถูกต้อง")
        from urllib.parse import unquote
        return unquote(request.headers.get("x-agent-id") or "office-pc")[:60]

    @app.post("/agent/heartbeat")
    async def agent_heartbeat(request: Request):
        aid = agent_auth(request); body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
        svc.agent_seen(aid, json.dumps(body, ensure_ascii=False)[:300])
        return {"ok": True, "time": now()}

    @app.post("/agent/claim")
    def agent_claim(request: Request):
        job = svc.claim(agent_auth(request))
        return {"job": job}

    @app.get("/agent/jobs/{jid}/file")
    def agent_file(jid: str, request: Request):
        aid = agent_auth(request)
        j = db.one("SELECT * FROM jobs WHERE id=?", jid)
        if not j or j["status"] != "processing" or j["agent_id"] != aid or j["file_purged"]:
            raise HTTPException(404, "ไม่พบไฟล์")
        return FileResponse(j["stored_path"], media_type="application/octet-stream")

    @app.post("/agent/jobs/{jid}/result")
    async def agent_result(jid: str, request: Request):
        aid = agent_auth(request); b = await request.json()
        try:
            svc.report(jid, aid, bool(b.get("ok")), str(b.get("reg_label", "")), str(b.get("message", "")), str(b.get("office_path", "")), str(b.get("office_sha256", "")))
        except JobError as e:
            raise HTTPException(409, str(e)) from e
        return {"ok": True}

    # ---------------- Dashboard ----------------
    def jobrow(j) -> dict:
        d = dict(j)
        d["extracted"] = json.loads(j["extracted_json"] or "{}")
        d["final"] = json.loads(j["final_json"] or "{}")
        return d

    def agents_info():
        out = []
        for a in db.q("SELECT * FROM agents ORDER BY last_seen DESC"):
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(a["last_seen"])).total_seconds()
            out.append({**dict(a), "online": age < AGENT_ONLINE_SEC, "age": int(age)})
        return out

    @app.get("/", response_class=HTMLResponse)
    def overview(request: Request):
        u = need(request)
        recent = [jobrow(j) for j in db.q("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 8")]
        stuck_before = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat(timespec="seconds")
        stuck = db.one("SELECT COUNT(*) n FROM jobs WHERE status='processing' AND claimed_at<?", stuck_before)["n"]
        today = db.one("SELECT COUNT(*) n FROM jobs WHERE created_at>=?", datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat(timespec="seconds"))["n"]
        return page(request, "overview.html", "overview", u, recent=recent, agents=agents_info(), stuck=stuck, today=today)

    @app.get("/review", response_class=HTMLResponse)
    def review_list(request: Request):
        u = need(request)
        rows = [jobrow(j) for j in db.q("SELECT * FROM jobs WHERE status IN ('review','reading','received','failed') ORDER BY created_at")]
        return page(request, "review_list.html", "review", u, rows=rows)

    @app.get("/review/{jid}", response_class=HTMLResponse)
    def review(jid: str, request: Request):
        u = need(request)
        j = db.one("SELECT * FROM jobs WHERE id=?", jid)
        if not j:
            raise HTTPException(404, "ไม่พบรายการ")
        log = db.q("SELECT * FROM audit WHERE job_id=? ORDER BY id", jid)
        officers = [r["officer_name"] for r in db.q("SELECT officer_name FROM users WHERE active=1 AND officer_name<>'' ORDER BY id")]
        pages = 1
        if j["file_type"] == "pdf" and j["stored_path"] and not j["file_purged"]:
            import pypdfium2 as pdfium
            try:
                _p = pdfium.PdfDocument(j["stored_path"]); pages = min(len(_p), 20); _p.close()
            except Exception:  # noqa: BLE001
                pages = 1
        return page(request, "review.html", "review", u, j=jobrow(j), log=log, officers=officers, flash=request.session.pop("flash", None), pages=pages,
                    draft=request.session.pop("draft", None))

    @app.get("/review/{jid}/file")
    def review_file(jid: str, request: Request):
        need(request)
        j = db.one("SELECT * FROM jobs WHERE id=?", jid)
        if not j or not j["stored_path"] or j["file_purged"]:
            raise HTTPException(404, "ไม่มีไฟล์")
        mime = {"pdf": "application/pdf", "jpg": "image/jpeg", "png": "image/png"}.get(j["file_type"], "application/octet-stream")
        return FileResponse(j["stored_path"], media_type=mime, headers={"Content-Disposition": "inline", "Cache-Control": "private, no-store"})

    @app.get("/review/{jid}/original")
    def review_original(jid: str, request: Request):
        """รูปต้นฉบับที่ส่งมาทาง LINE (กรณีระบบแปลงเป็น PDF แล้ว)"""
        need(request)
        j = db.one("SELECT * FROM jobs WHERE id=?", jid)
        if not j or not j["orig_path"] or j["file_purged"] or not Path(j["orig_path"]).exists():
            raise HTTPException(404, "ไม่มีไฟล์")
        mime = "image/png" if j["orig_path"].endswith(".png") else "image/jpeg"
        return FileResponse(j["orig_path"], media_type=mime, headers={"Content-Disposition": "inline", "Cache-Control": "private, no-store"})

    @app.get("/review/{jid}/page/{n}.png")
    def review_page_png(jid: str, n: int, request: Request):
        """ภาพหน้าเอกสาร PDF สำหรับดูบนมือถือ/เบราว์เซอร์ใน LINE (ซึ่งมักแสดง PDF ในหน้าเว็บไม่ได้)"""
        need(request)
        j = db.one("SELECT * FROM jobs WHERE id=?", jid)
        if not j or j["file_type"] != "pdf" or j["file_purged"] or not j["stored_path"] or not (1 <= n <= 20):
            raise HTTPException(404, "ไม่มีหน้านี้")
        src = Path(j["stored_path"]); cache = src.with_name(f"{src.stem}-p{n}.png")
        if not cache.exists():
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(str(src))
            try:
                if n > len(pdf):
                    raise HTTPException(404, "ไม่มีหน้านี้")
                pdf[n - 1].render(scale=1.6).to_pil().save(cache, "PNG")
            finally:
                pdf.close()
        return FileResponse(cache, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})

    def form_values(form) -> dict:
        return {k: form.get(k, "") for k in ("book_no", "book_date", "sender", "receiver", "subject", "officer", "kind", "remark")}

    @app.post("/review/{jid}")
    async def review_action(jid: str, request: Request):
        u = need(request); f = await request.form(); act = f.get("action")
        try:
            if act == "save":
                svc.save_edits(jid, form_values(f), u["username"]); flash(request, "บันทึกการแก้ไขแล้ว (ยังไม่ส่งเข้าทะเบียน)")
            elif act == "confirm":
                svc.confirm(jid, form_values(f), u["username"]); flash(request, "ยืนยันแล้ว — รอคอมสำนักงานบันทึกลงทะเบียน")
            elif act == "cancel":
                svc.cancel(jid, str(f.get("reason", "")), u["username"]); flash(request, "ยกเลิกรายการแล้ว")
            elif act == "done_manual":
                svc.mark_done_manual(jid, str(f.get("reg_label", "")), u["username"]); flash(request, "บันทึกผลด้วยตนเองแล้ว")
            elif act == "requeue":
                svc.requeue(jid, u["username"], f.get("checked") == "1"); flash(request, "ส่งให้คอมสำนักงานอีกครั้งแล้ว", "warn")
        except JobError as e:
            if act in ("save", "confirm"):
                request.session["draft"] = form_values(f)
            flash(request, str(e), "err")
        return RedirectResponse(f"/review/{jid}", 303)

    @app.get("/history", response_class=HTMLResponse)
    def history(request: Request, status: str = "", q: str = ""):
        u = need(request)
        sql, args = "SELECT * FROM jobs WHERE 1=1", []
        if status:
            sql += " AND status=?"; args.append(status)
        if q:
            sql += " AND (file_name LIKE ? OR sender_name LIKE ? OR final_json LIKE ? OR reg_label LIKE ?)"; args += [f"%{q}%"] * 4
        rows = [jobrow(j) for j in db.q(sql + " ORDER BY created_at DESC LIMIT 300", *args)]
        return page(request, "history.html", "history", u, rows=rows, status=status, q=q)

    @app.get("/agents", response_class=HTMLResponse)
    def agents(request: Request):
        u = need(request)
        stuck_before = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat(timespec="seconds")
        stuck = [jobrow(j) for j in db.q("SELECT * FROM jobs WHERE status='processing' AND claimed_at<? ORDER BY claimed_at", stuck_before)]
        waiting = db.one("SELECT COUNT(*) n FROM jobs WHERE status='confirmed'")["n"]
        return page(request, "agents.html", "agents", u, agents=agents_info(), stuck=stuck, waiting=waiting,
                    agent_token=s.agent_token if u["role"] == "admin" else "", base=s.public_base_url)

    @app.get("/settings/line", response_class=HTMLResponse)
    def line_settings(request: Request):
        u = need(request)
        users = db.q("SELECT * FROM line_users ORDER BY added_at")
        rejected = db.q("SELECT actor, MAX(at) at, COUNT(*) n FROM audit WHERE action='reject_user' GROUP BY actor ORDER BY at DESC LIMIT 10")
        outbox = db.q("SELECT * FROM outbox ORDER BY id DESC LIMIT 15")
        return page(request, "line.html", "line", u, users=users, rejected=rejected, outbox=outbox, s=s,
                    has_secret=bool(s.line_channel_secret) and not s.is_demo, has_token=bool(s.line_channel_access_token), flash=request.session.pop("flash", None))

    @app.post("/settings/line/users")
    async def line_users(request: Request):
        u = need(request, admin=True); f = await request.form()
        lid, name, op = str(f.get("line_user_id", "")).strip(), str(f.get("display_name", "")).strip(), f.get("op")
        if op == "add":
            if not lid.startswith("U") or len(lid) != 33:
                flash(request, "LINE User ID ต้องขึ้นต้นด้วย U และยาว 33 ตัวอักษร", "err")
            else:
                db.run("INSERT INTO line_users(line_user_id,display_name,added_by,added_at) VALUES(?,?,?,?) ON CONFLICT(line_user_id) DO UPDATE SET display_name=excluded.display_name, active=1",
                       lid, name or lid, u["username"], now())
                db.audit("line_user_add", u["username"], "", {"line_user_id": lid, "name": name}); flash(request, "เพิ่มผู้มีสิทธิ์ส่งเอกสารแล้ว")
        elif op in ("disable", "enable"):
            db.run("UPDATE line_users SET active=? WHERE line_user_id=?", 1 if op == "enable" else 0, lid)
            db.audit("line_user_" + op, u["username"], "", lid); flash(request, "ปรับสิทธิ์แล้ว")
        return RedirectResponse("/settings/line", 303)

    @app.get("/settings/system", response_class=HTMLResponse)
    def system_settings(request: Request):
        u = need(request)
        users = db.q("SELECT id, username, display_name, officer_name, role, active FROM users ORDER BY id")
        return page(request, "system.html", "system", u, users=users, s=s, flash=request.session.pop("flash", None))

    @app.post("/settings/system/users")
    async def system_users(request: Request):
        u = need(request, admin=True); f = await request.form()
        uname, pw = str(f.get("username", "")).strip(), str(f.get("password", ""))
        if len(uname) < 3 or len(pw) < 8:
            flash(request, "ชื่อผู้ใช้อย่างน้อย 3 ตัว รหัสผ่านอย่างน้อย 8 ตัว", "err")
        elif db.one("SELECT 1 FROM users WHERE username=?", uname):
            flash(request, "มีชื่อผู้ใช้นี้แล้ว", "err")
        else:
            db.run("INSERT INTO users(username,display_name,officer_name,pw_hash,role,created_at) VALUES(?,?,?,?,?,?)", uname, str(f.get("display_name", "")).strip() or uname,
                   str(f.get("officer_name", "")).strip(), hash_password(pw), "admin" if f.get("role") == "admin" else "reviewer", now())
            db.audit("user_add", u["username"], "", uname); flash(request, "เพิ่มผู้ใช้แล้ว")
        return RedirectResponse("/settings/system", 303)

    @app.post("/settings/system/backup")
    def system_backup(request: Request):
        u = need(request, admin=True)
        dest = s.data_dir / "backups" / f"assistant-{datetime.now():%Y%m%d-%H%M%S}.db"
        db.backup_to(dest)
        import sqlite3
        ok = sqlite3.connect(str(dest)).execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        bad = [j["id"] for j in db.q("SELECT id, stored_path, sha256, orig_path, orig_sha256 FROM jobs WHERE file_purged=0 AND stored_path<>''")
               if not Path(j["stored_path"]).exists() or sha256_file(j["stored_path"]) != j["sha256"]
               or (j["orig_path"] and (not Path(j["orig_path"]).exists() or sha256_file(j["orig_path"]) != j["orig_sha256"]))]
        db.audit("backup", u["username"], "", {"file": dest.name, "integrity": ok, "bad_files": bad})
        flash(request, f"สำรองข้อมูลแล้ว: {dest.name} · ตรวจฐานข้อมูล {'ผ่าน' if ok else 'ไม่ผ่าน'} · ไฟล์เอกสารเสีย/หาย {len(bad)} ไฟล์", "ok" if ok and not bad else "err")
        return RedirectResponse("/settings/system", 303)

    # ---------------- Demo: จำลองการส่งเอกสารจาก LINE ----------------
    @app.get("/demo", response_class=HTMLResponse)
    def demo_page(request: Request):
        u = need(request)
        if not s.is_demo:
            raise HTTPException(404)
        return page(request, "demo.html", "demo", u, users=db.q("SELECT * FROM line_users WHERE active=1"), outbox=db.q("SELECT * FROM outbox ORDER BY id DESC LIMIT 20"),
                    flash=request.session.pop("flash", None))

    @app.post("/demo/send")
    async def demo_send(request: Request, line_user_id: str = Form(...), file: UploadFile = File(...)):
        need(request)
        if not s.is_demo:
            raise HTTPException(404)
        data = await file.read()
        mid = str(int(time.time() * 1000)) + secrets.token_hex(2)
        (demo_dir / f"{mid}.bin").write_bytes(data)
        is_img = (file.content_type or "").startswith("image/") and not (file.filename or "").lower().endswith(".pdf")
        msg = {"type": "image", "id": mid} if is_img else {"type": "file", "id": mid, "fileName": file.filename or "เอกสาร.pdf", "fileSize": len(data)}
        body = json.dumps({"destination": "demo", "events": [{"type": "message", "replyToken": "demo-" + mid, "source": {"type": "user", "userId": line_user_id}, "message": msg}]}).encode()
        # ผ่านเส้นทางเดียวกับ LINE จริง: ลงลายเซ็นแล้วตรวจลายเซ็น
        if not verify_line_signature(s.line_channel_secret, body, line_signature(s.line_channel_secret, body)):
            raise HTTPException(500)
        svc.handle_events(json.loads(body)["events"])
        flash(request, "จำลองการส่งเอกสารจาก LINE แล้ว — กำลังอ่านข้อมูล")
        return RedirectResponse("/demo", 303)

    @app.exception_handler(HTTPException)
    async def http_err(request: Request, exc: HTTPException):
        if exc.status_code == 303:
            return RedirectResponse(exc.headers["Location"], 303)
        if request.url.path.startswith(("/agent/", "/line/")):
            return JSONResponse({"error": exc.detail}, status_code=exc.status_code)
        return HTMLResponse(f"<p style='font-family:sans-serif;padding:30px'>{exc.detail} — <a href='/'>กลับหน้าแรก</a></p>", status_code=exc.status_code)

    return app
