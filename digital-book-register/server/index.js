'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const db = require('./db');
const books = require('./books');
const fonts = require('./fonts');
const exp = require('./export');
const live = require('./liveexcel');
const backup = require('./backup');
const auth = require('./auth');
const U = require('./util');
const fsb = require('./fsbrowse');
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const ctx = require('./context');
const activity = require('./activity');
const resetMod = require('./reset');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 10 } });
const uploadBig = multer({ dest: path.join(cfg.DATA_DIR, '.uploads'), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// ชื่อไฟล์ภาษาไทยจากบางเบราว์เซอร์มาเป็น latin1 เพี้ยน -> แปลงกลับเป็น UTF-8 เฉพาะกรณีที่เป็นแบบนั้นจริง
function fixName(n) {
  if (/^[\u0000-\u00ff]*$/.test(n) && /[\u0080-\u00ff]/.test(n)) { const u = Buffer.from(n, 'latin1').toString('utf8'); if (!u.includes('\ufffd')) return u; }
  return n;
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'self' blob:; object-src 'self' blob:; frame-ancestors 'self'");
    next();
  });
  app.use(express.json({ limit: '6mb' }));
  const wrap = fn => (req, res, next) => { try { const r = fn(req, res); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };

  /* --- บันทึกการใช้งาน (log): ดูผลลัพธ์ของแต่ละคำขอแล้วบันทึกว่าใครทำอะไร --- */
  const SET_LABELS = { duty_title: 'หัวข้อหน้าแรก', duty_unit: 'หน่วยที่ประจำ', duty_officers: 'รายชื่อผู้เข้าเวร', book_no_prefixes: 'ตัวนำหน้า ที่',
    from_options: 'ตัวเลือก จาก', to_options: 'ตัวเลือก ถึง', org_name: 'ชื่อหน่วยงาน', dept_name: 'ชื่อส่วนราชการ', year_mode: 'ปีที่ใช้ออกเลข',
    reg_format: 'รูปแบบเลขทะเบียน', reg_pad: 'จำนวนหลัก', start_in: 'เลขเริ่มต้นรับ', start_out: 'เลขเริ่มต้นส่ง', ui_font: 'ฟอนต์หน้าจอ', ui_scale: 'ขนาดตัวอักษร',
    print_font_size: 'ขนาดตัวอักษรพิมพ์', data_color: 'สีตัวอักษร', auto_backup: 'สำรองอัตโนมัติ', backup_every_hours: 'ความถี่สำรอง', backup_keep: 'จำนวนชุดสำรอง',
    backup_on_exit: 'สำรองตอนปิดโปรแกรม', backup_excel: 'สำรองเป็น Excel', live_excel: 'Excel อัปเดตอัตโนมัติ', archive_on: 'จัดเก็บไฟล์หนังสือ', archive_dir: 'โฟลเดอร์เก็บหนังสือ', backup_dir: 'โฟลเดอร์สำรอง', backup_dir2: 'โฟลเดอร์สำรองที่สอง' };
  const FLD = { book_no: 'ที่', book_date: 'ลงวันที่', from_org: 'จาก', to_org: 'ถึง', subject: 'เรื่อง', action: 'การปฏิบัติ', remark: 'หมายเหตุ', receiver_name: 'ผู้รับ', receiver_at: 'วันเวลารับ', sender_name: 'ผู้ส่ง', sender_at: 'วันเวลาส่ง' };
  const KN = k => k === 'out' ? 'ทะเบียนส่ง' : 'ทะเบียนรับ';
  const RULES = [
    ['POST', /^\/api\/login$/, (q, b, st) => st < 300 ? ['login', 'ใส่รหัสผ่านเข้าโปรแกรม'] : st === 401 ? ['login_fail', 'ใส่รหัสผ่านผิด'] : null, true],
    ['POST', /^\/api\/logout$/, () => ['logout', '']],
    ['POST', /^\/api\/duty$/, q => { const prev = String((q.body || {}).prev || ''); const name = String((q.body || {}).name || ''); return prev && prev !== name ? ['duty_change', `รับเวรต่อจาก ${prev}`] : ['duty_start', 'เริ่มเข้าเวร']; }],
    ['POST', /^\/api\/books\/(in|out)$/, (q, b) => b && !b.duplicate ? ['book_create', `${KN(b.kind)} ${b.reg_label} · ${b.subject}`, b.id] : null],
    ['PUT', /^\/api\/books\/id\/\d+$/, (q, b) => { if (!b) return null; const h = (b.history || [])[0]; const f = h && h.action === 'update' ? Object.keys(h.changes || {}).map(k => FLD[k] || k) : [];
      return ['book_update', `${KN(b.kind)} ${b.reg_label} · ${b.subject}${f.length ? ' · แก้ช่อง ' + f.join(', ') : ' · (กดบันทึกแต่ไม่ได้แก้อะไร)'}`, b.id]; }],
    ['POST', /^\/api\/books\/id\/\d+\/cancel$/, (q, b) => b ? ['book_cancel', `${KN(b.kind)} ${b.reg_label} · เพราะ ${(q.body || {}).reason || '-'}`, b.id] : null],
    ['POST', /^\/api\/books\/id\/(\d+)\/attachments$/, (q, b, st, m) => { let r = ''; try { r = books.get(+m[1]).reg_label; } catch { /* ignore */ } return ['attach_add', `${r} · ${(q.files || []).map(f => fixName(f.originalname)).join(', ')}`, +m[1]]; }],
    ['DELETE', /^\/api\/attachments\/(\d+)$/, (q, b, st, m) => ['attach_remove', `ลบไฟล์แนบ (รหัส ${m[1]})`]],
    ['PUT', /^\/api\/settings$/, q => { const before = q._settingsBefore || {}; const after = db.getSettings();
      const ch = Object.keys(SET_LABELS).filter(k => String(before[k] ?? '') !== String(after[k] ?? '')).map(k => SET_LABELS[k]);
      return ch.length ? ['settings', ch.join(', ')] : null; }],
    ['POST', /^\/api\/settings\/password$/, (q, b) => ['password', b && b.has_password ? 'ตั้งรหัสผ่านใหม่' : 'เอารหัสผ่านออก']],
    ['POST', /^\/api\/settings\/font\/(\w+)$/, (q, b, st, m) => ['font', `ใส่ไฟล์ฟอนต์ใหม่ (${m[1] === 'bold' ? 'ตัวหนา' : 'ตัวปกติ'})`]],
    ['DELETE', /^\/api\/settings\/font\/(\w+)$/, (q, b, st, m) => ['font', `ลบไฟล์ฟอนต์ (${m[1] === 'bold' ? 'ตัวหนา' : 'ตัวปกติ'})`]],
    ['POST', /^\/api\/settings\/logo$/, () => ['logo', 'ใส่โลโก้ใหม่']],
    ['DELETE', /^\/api\/settings\/logo$/, () => ['logo', 'ลบโลโก้']],
    ['PUT', /^\/api\/counters$/, q => { const x = q.body || {}; return ['counters', `${KN(x.kind)} ปี ${x.year} ให้เลขต่อไปเป็น ${x.next_no}`]; }],
    ['GET', /^\/api\/export\/(xlsx|csv|pdf)$/, (q, b, st, m) => { if (m[1] === 'pdf' && q.query.download !== '1') return null; let line = ''; try { line = exp.resolveScope(q.query).line || ''; } catch { /* ignore */ }
      return ['export', `${m[1].toUpperCase()} ${exp.titleOf(q.query.kind === 'out' ? 'out' : 'in')} ${line}`]; }],
    ['GET', /^\/api\/export-all\/xlsx$/, () => ['export', 'Excel ทะเบียนรับ+ส่ง ทั้งหมด']],
    ['POST', /^\/api\/activity\/print$/, q => { const x = Object.fromEntries(new URLSearchParams(String((q.body || {}).query || ''))); let line = ''; try { line = exp.resolveScope(x).line || ''; } catch { /* ignore */ }
      return ['print', `${exp.titleOf(x.kind === 'out' ? 'out' : 'in')} ${line}`]; }],
    ['POST', /^\/api\/backup\/run$/, (q, b) => ['backup', b && b.ok ? `${b.name}${b.excel ? ' + ' + b.excel : ''}` : `ไม่สำเร็จ ${(b && b.error) || ''}`]],
    ['POST', /^\/api\/backup\/restore(-local)?$/, q => ['restore', (q.body && q.body.name) || (q.file && fixName(q.file.originalname)) || 'จากไฟล์ที่เลือก']],
    ['POST', /^\/api\/shutdown$/, () => ['app_stop', 'กดปุ่มปิดโปรแกรม']],
    ['POST', /^\/api\/reset$/, (q, b) => b && b.ok ? ['reset', `ล้างข้อมูลแล้ว · สำรองข้อมูลชุดเดิมไว้ที่ ${b.backup_dir}${path.sep}${b.backup}`] : null],
  ];
  app.use((req, res, next) => {
    const rule = RULES.find(r => r[0] === req.method && r[1].test(req.path)); if (!rule) return next();
    if (rule[1].source.includes('settings$')) req._settingsBefore = db.getSettings();
    let body = null; const json = res.json.bind(res); res.json = b => { body = b; return json(b); };
    res.on('finish', () => {
      if (res.statusCode >= 300 && !rule[3]) return;
      try {
        const out = rule[2](req, body, res.statusCode, req.path.match(rule[1])); if (!out) return;
        let actor = ''; try { actor = decodeURIComponent(req.headers['x-duty-officer'] || ''); } catch { /* ignore */ }
        if (out[0] === 'duty_start' || out[0] === 'duty_change') actor = String((req.body || {}).name || actor);
        const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
        activity.log(out[0], out[1], { actor: actor.replace(/[\r\n]/g, ' '), ref: out[2], machine: isLocal(req) ? 'เครื่องหลัก' : ip });
      } catch (e) { console.error('log:', e.message); }
    });
    next();
  });

  /* --- ไม่ต้องล็อกอิน --- */
  app.get('/api/session', (req, res) => res.json({ auth_required: auth.required(), authenticated: auth.isAuthed(req), version: cfg.VERSION }));
  app.post('/api/login', wrap(auth.login));
  app.post('/api/logout', auth.logout);

  app.use('/api', auth.middleware);
  app.use('/api', (req, res, next) => {   // ผู้เข้าเวรที่ทำรายการ
    let a = ''; try { a = decodeURIComponent(req.headers['x-duty-officer'] || ''); } catch { /* ignore */ }
    ctx.run(a.replace(/[\r\n]/g, ' ').slice(0, 100), next);
  });

  /* --- สถานะ / ตั้งค่า --- */
  const publicSettings = () => { const s = db.getSettings(); delete s.password_hash; return s; };
  // บันทึก/แก้ไข/ยกเลิก/กู้คืน/เปลี่ยนตั้งค่า สำเร็จ -> อัปเดตไฟล์ Excel อัตโนมัติ
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && /^\/(books|attachments|backup\/restore|settings)/.test(req.path)) res.on('finish', () => { if (res.statusCode < 300) live.schedule(); });
    next();
  });
  app.get('/api/state', wrap((req, res) => {
    const s = publicSettings();
    res.json({ settings: s, has_password: auth.required(), year: books.registrationYear(), fonts: fonts.status(), data_dir: cfg.DATA_DIR,
      backup_dir: backup.backupDir(), version: cfg.VERSION, months: U.MONTHS, is_local: isLocal(req) });
  }));
  app.put('/api/settings', wrap((req, res) => {
    const b = req.body || {}; const old = db.getSettings(); const out = {};
    const str = (k, max = 200) => { if (b[k] !== undefined) { const v = String(b[k]).trim(); if (v.length > max) throw new U.HttpError(400, `${k} ยาวเกินไป`); out[k] = v; } };
    ['org_name', 'dept_name'].forEach(k => str(k)); ['duty_title', 'duty_unit'].forEach(k => str(k, 100));
    for (const k of ['from_options', 'to_options', 'book_no_prefixes']) {
      if (b[k] === undefined) continue;
      const arr = (Array.isArray(b[k]) ? b[k] : String(b[k]).split('\n')).map(x => String(x).trim()).filter(Boolean);
      if (arr.length > 50 || arr.some(x => x.length > 300)) throw new U.HttpError(400, 'รายการหน่วยงานไม่ถูกต้อง (ไม่เกิน 50 รายการ)');
      out[k] = JSON.stringify([...new Set(arr)]);
    }
    if (b.duty_officers !== undefined) {
      const arr = (Array.isArray(b.duty_officers) ? b.duty_officers : String(b.duty_officers).split('\n')).map(x => String(x).trim()).filter(Boolean);
      if (arr.length > 30 || arr.some(x => x.length > 100)) throw new U.HttpError(400, 'รายชื่อผู้เข้าเวรไม่ถูกต้อง (ไม่เกิน 30 คน คนละไม่เกิน 100 ตัวอักษร)');
      out.duty_officers = JSON.stringify([...new Set(arr)]);
    }
    if (b.year_mode !== undefined) {
      const v = String(b.year_mode).trim();
      if (v !== 'auto' && v !== 'fiscal' && !/^(24|25|26)\d{2}$/.test(v)) throw new U.HttpError(400, 'ปี พ.ศ. ไม่ถูกต้อง (ใส่ auto, fiscal หรือปี เช่น 2570)');
      out.year_mode = v;
    }
    if (b.reg_format !== undefined) {
      const v = String(b.reg_format).trim();
      if (!v.includes('{no}') || v.length > 40) throw new U.HttpError(400, 'รูปแบบเลขทะเบียนต้องมี {no} เช่น {no}/{year}');
      out.reg_format = v;
    }
    const num = (k, lo, hi, label) => { if (b[k] !== undefined) { const n = parseInt(b[k], 10); if (!(n >= lo && n <= hi)) throw new U.HttpError(400, `${label} ต้องอยู่ระหว่าง ${lo}-${hi}`); out[k] = String(n); } };
    num('reg_pad', 0, 8, 'จำนวนหลักเลขทะเบียน'); num('start_in', 1, 999999, 'เลขเริ่มต้นทะเบียนรับ'); num('start_out', 1, 999999, 'เลขเริ่มต้นทะเบียนส่ง');
    num('ui_font_size', 12, 28, 'ขนาดตัวอักษรหน้าจอ');
    if (b.ui_font !== undefined) { if (!['plex', 'sarabun', 'noto', 'register'].includes(b.ui_font)) throw new U.HttpError(400, 'ฟอนต์หน้าจอไม่ถูกต้อง'); out.ui_font = b.ui_font; }
    if (b.ui_scale !== undefined) { if (!['90', '100', '112', '125'].includes(String(b.ui_scale))) throw new U.HttpError(400, 'ขนาดตัวอักษรไม่ถูกต้อง'); out.ui_scale = String(b.ui_scale); } num('print_font_size', 8, 24, 'ขนาดตัวอักษรพิมพ์');
    if (b.data_color !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(b.data_color)) throw new U.HttpError(400, 'รหัสสีไม่ถูกต้อง เช่น #174EA6'); out.data_color = b.data_color.toUpperCase(); }
    if (b.auto_backup !== undefined) out.auto_backup = b.auto_backup ? '1' : '0';
    if (b.backup_every_hours !== undefined) { const n = parseInt(b.backup_every_hours, 10); if (![1, 3, 6, 12, 24, 72, 168].includes(n)) throw new U.HttpError(400, 'ความถี่การสำรองไม่ถูกต้อง'); out.backup_every_hours = String(n); }
    if (b.backup_keep !== undefined) { const n = parseInt(b.backup_keep, 10); if (!(n >= 3 && n <= 365)) throw new U.HttpError(400, 'จำนวนชุดที่เก็บต้องอยู่ระหว่าง 3-365'); out.backup_keep = String(n); }
    if (b.backup_excel !== undefined) out.backup_excel = b.backup_excel ? '1' : '0';
    if (b.live_excel !== undefined) out.live_excel = b.live_excel ? '1' : '0';
    if (b.archive_on !== undefined) out.archive_on = b.archive_on ? '1' : '0';
    if (b.fresh_start !== undefined) out.fresh_start = b.fresh_start === '1' ? '1' : '0';
    if (b.archive_dir !== undefined) {
      const v = String(b.archive_dir).trim();
      if (v) { try { fs.mkdirSync(v, { recursive: true }); fs.accessSync(v, fs.constants.W_OK); } catch { throw new U.HttpError(400, 'เขียนไฟล์ในโฟลเดอร์นี้ไม่ได้ ตรวจสอบตำแหน่ง/ไดรฟ์อีกครั้ง'); } }
      out.archive_dir = v;
    }
    if (b.backup_on_exit !== undefined) out.backup_on_exit = b.backup_on_exit ? '1' : '0';
    if (b.backup_dir2 !== undefined) {
      const v = String(b.backup_dir2).trim();
      if (v) { try { fs.mkdirSync(v, { recursive: true }); fs.accessSync(v, fs.constants.W_OK); } catch { throw new U.HttpError(400, 'ไม่สามารถเขียนไฟล์ในโฟลเดอร์สำรองที่สองได้ กรุณาตรวจสอบตำแหน่ง/ว่าเสียบไดรฟ์แล้ว'); } }
      out.backup_dir2 = v;
    }
    if (b.backup_dir !== undefined) {
      const v = String(b.backup_dir).trim();
      if (v) { try { fs.mkdirSync(v, { recursive: true }); fs.accessSync(v, fs.constants.W_OK); } catch { throw new U.HttpError(400, 'ไม่สามารถเขียนไฟล์ในโฟลเดอร์สำรองที่ระบุได้ กรุณาตรวจสอบตำแหน่ง'); } }
      out.backup_dir = v;
    }
    db.tx(() => { for (const [k, v] of Object.entries(out)) db.setSetting(k, v); });
    if ((out.reg_format && out.reg_format !== old.reg_format) || (out.reg_pad && out.reg_pad !== old.reg_pad)) books.relabelAll();
    res.json({ ok: true, settings: publicSettings(), year: books.registrationYear() });
  }));
  app.post('/api/settings/password', wrap((req, res) => { auth.setPassword(req.body.current, req.body.next); res.json({ ok: true, has_password: auth.required() }); }));

  app.post('/api/settings/font/:kind', upload.single('file'), wrap((req, res) => {
    if (!req.file) throw new U.HttpError(400, 'ไม่พบไฟล์');
    res.json({ ok: true, info: fonts.save(req.params.kind, req.file.buffer), fonts: fonts.status() });
  }));
  app.delete('/api/settings/font/:kind', wrap((req, res) => { fonts.remove(req.params.kind); res.json({ ok: true, fonts: fonts.status() }); }));
  app.get('/api/font/:kind', wrap((req, res) => {
    const f = fonts.fileOf(req.params.kind === 'bold' ? 'bold' : 'regular');
    if (!f) throw new U.HttpError(404, 'ยังไม่ได้นำเข้าฟอนต์');
    res.setHeader('Cache-Control', 'private, max-age=86400'); res.sendFile(f);
  }));
  app.post('/api/settings/logo', upload.single('file'), wrap((req, res) => {
    if (!req.file) throw new U.HttpError(400, 'ไม่พบไฟล์');
    const b = req.file.buffer; const png = b.readUInt32BE(0) === 0x89504e47; const jpg = b[0] === 0xff && b[1] === 0xd8;
    if (!png && !jpg) throw new U.HttpError(400, 'โลโก้ต้องเป็นไฟล์ PNG หรือ JPG');
    if (b.length > 2 * 1024 * 1024) throw new U.HttpError(400, 'ไฟล์โลโก้ใหญ่เกิน 2 MB');
    const name = 'logo-' + Date.now() + (png ? '.png' : '.jpg');
    for (const n of fs.readdirSync(cfg.DIRS.branding)) fs.rmSync(path.join(cfg.DIRS.branding, n), { force: true });
    fs.writeFileSync(path.join(cfg.DIRS.branding, name), b); db.setSetting('logo', name);
    res.json({ ok: true, logo: name });
  }));
  app.delete('/api/settings/logo', wrap((req, res) => {
    for (const n of fs.readdirSync(cfg.DIRS.branding)) fs.rmSync(path.join(cfg.DIRS.branding, n), { force: true });
    db.setSetting('logo', ''); res.json({ ok: true });
  }));
  app.get('/api/logo', wrap((req, res) => {
    const l = db.getSettings().logo; const p = l && path.join(cfg.DIRS.branding, l);
    if (!p || !fs.existsSync(p)) throw new U.HttpError(404, 'ไม่มีโลโก้');
    res.sendFile(p);
  }));

  /* --- เลขทะเบียน --- */
  app.get('/api/counters', wrap((req, res) => res.json(books.counters())));
  app.put('/api/counters', wrap((req, res) => res.json({ ok: true, ...books.setNext(req.body.kind, req.body.year, req.body.next_no) })));
  app.get('/api/next/:kind', wrap((req, res) => {
    if (!['in', 'out'].includes(req.params.kind)) throw new U.HttpError(400, 'ประเภทไม่ถูกต้อง');
    res.json({ year: books.registrationYear(), ...books.peekNext(req.params.kind, books.registrationYear()) });
  }));

  /* --- หนังสือ --- */
  app.get('/api/dashboard', wrap((req, res) => res.json(books.dashboard())));
  app.get('/api/suggest', wrap((req, res) => res.json(books.suggest(req.query.field, req.query.q))));
  app.get('/api/books', wrap((req, res) => res.json(books.list(req.query))));
  app.post('/api/books/dupcheck/:kind', wrap((req, res) => res.json(books.findDuplicates(req.params.kind, req.body || {}, +(req.body || {}).except || 0))));
  app.post('/api/books/:kind', wrap((req, res) => res.status(201).json(books.create(req.params.kind, req.body || {}))));
  app.get('/api/books/id/:id', wrap((req, res) => res.json(books.get(+req.params.id))));
  app.put('/api/books/id/:id', wrap((req, res) => res.json(books.update(+req.params.id, req.body || {}))));
  app.post('/api/books/id/:id/cancel', wrap((req, res) => res.json(books.cancel(+req.params.id, req.body && req.body.reason))));
  app.get('/api/books/id/:id/signature/:who', wrap((req, res) => {
    if (!['sender', 'receiver'].includes(req.params.who)) throw new U.HttpError(400, 'ไม่ถูกต้อง');
    res.setHeader('Cache-Control', 'private, no-cache'); res.sendFile(books.signaturePath(+req.params.id, req.params.who));
  }));
  app.post('/api/books/id/:id/attachments', upload.array('files', 10), wrap((req, res) => {
    const ids = (req.files || []).map(f => books.addAttachment(+req.params.id, fixName(f.originalname), f.buffer));
    res.status(201).json({ ok: true, ids });
  }));
  app.get('/api/attachments/:id', wrap((req, res) => {
    const a = books.getAttachment(+req.params.id);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
    res.sendFile(a.path, { headers: { 'Content-Type': a.mime } });
  }));
  app.delete('/api/attachments/:id', wrap((req, res) => { books.removeAttachment(+req.params.id); res.json({ ok: true }); }));

  /* --- พิมพ์ / ส่งออก --- */
  const send = (res, buf, mime, base, ext, download) => {
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(base + ext)}`);
    res.setHeader('Cache-Control', 'no-store'); res.send(buf);
  };
  app.get('/api/export/:fmt', wrap(async (req, res) => {
    const q = req.query; const { kind } = exp.resolveScope(q); const base = exp.titleOf(kind) + (q.year ? '-' + q.year : '');
    const dl = q.download === '1';
    if (req.params.fmt === 'pdf') return send(res, await exp.makePdf(q), 'application/pdf', base, '.pdf', dl);
    if (req.params.fmt === 'xlsx') return send(res, await exp.makeXlsx(q), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base, '.xlsx', true);
    if (req.params.fmt === 'csv') return send(res, exp.makeCsv(q), 'text/csv; charset=utf-8', base, '.csv', true);
    throw new U.HttpError(400, 'รูปแบบไฟล์ไม่ถูกต้อง');
  }));

  /* --- เริ่มต้นใหม่ (รีเซ็ต) — เฉพาะเครื่องหลัก --- */
  app.get('/api/reset/info', wrap((req, res) => res.json(resetMod.info())));
  app.post('/api/reset', wrap(async (req, res) => {
    if (!isLocal(req)) throw new U.HttpError(403, 'เริ่มต้นใหม่ได้เฉพาะที่เครื่องหลักเท่านั้น');
    const q = req.body || {};
    if (String(q.confirm || '').trim() !== 'เริ่มใหม่') throw new U.HttpError(400, 'พิมพ์คำว่า เริ่มใหม่ เพื่อยืนยัน');
    if (!auth.checkPassword(q.password)) throw new U.HttpError(403, 'รหัสผ่านไม่ถูกต้อง');
    const r = await resetMod.run(); live.schedule(300); res.json(r);
  }));

  /* --- บันทึกการใช้งาน --- */
  app.post('/api/duty', wrap((req, res) => { const n = String((req.body || {}).name || '').trim(); if (!n) throw new U.HttpError(400, 'ไม่มีชื่อผู้เข้าเวร'); res.json({ ok: true }); }));
  app.post('/api/activity/print', wrap((req, res) => res.json({ ok: true })));
  app.get('/api/activity', wrap((req, res) => res.json(activity.list(req.query))));
  app.get('/api/activity/export', wrap(async (req, res) => {
    const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('ประวัติการใช้งาน');
    ws.columns = [{ header: 'วันที่', width: 14 }, { header: 'เวลา', width: 9 }, { header: 'ใคร', width: 26 }, { header: 'ทำอะไร', width: 20 }, { header: 'รายละเอียด', width: 70 }, { header: 'เครื่องไหน', width: 14 }];
    ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of activity.forExport(req.query)) {
      const d = new Date(r.at); const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      const [y, mo, da] = r.day.split('-').map(Number);
      ws.addRow([`${da}/${mo}/${y + 543}`, t, r.actor || '-', activity.ACTIONS[r.action] || r.action, r.detail, r.machine]);
    }
    const d = new Date(); send(res, Buffer.from(await wb.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `ประวัติการใช้งาน-${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear() + 543}`, '.xlsx', true);
  }));

  /* --- ไฟล์ Excel อัปเดตอัตโนมัติ / ส่งออก Excel ทั้งหมด --- */
  app.get('/api/live-excel', wrap((req, res) => res.json(live.status())));
  app.post('/api/live-excel/update', wrap(async (req, res) => res.json(await live.write())));
  app.post('/api/live-excel/open', wrap(async (req, res) => {
    if (!isLocal(req)) throw new U.HttpError(403, 'เปิดไฟล์ได้เฉพาะที่เครื่องหลัก — ใช้ปุ่มดาวน์โหลดแทน');
    const q = req.body || {}; let s = live.status();
    const file = q.kind === 'out' ? s.files_out : s.files_in;
    if (!fs.existsSync(q.folder ? s.dir : file)) s = await live.write();
    if (q.folder) { fs.mkdirSync(s.dir, { recursive: true }); if (process.platform === 'win32') require('child_process').exec(`explorer "${s.dir}"`); return res.json({ ok: true, dir: s.dir }); }
    if (!fs.existsSync(file)) throw new U.HttpError(400, s.error || 'ยังไม่มีไฟล์ Excel');
    if (process.platform === 'win32') require('child_process').exec(`start "" "${file}"`);
    res.json({ ok: true, file });
  }));
  app.get('/api/export-all/xlsx', wrap(async (req, res) => {
    const d = new Date(); const stamp = `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear() + 543}`;
    send(res, await exp.makeXlsxAll('ข้อมูลทั้งหมด ณ ' + d.toLocaleString('th-TH', { hour12: false })), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'ทะเบียนหนังสือรับ-ส่ง-ทั้งหมด-' + stamp, '.xlsx', true);
  }));

  /* --- สำรอง / กู้คืน --- */
  app.get('/api/backup', wrap((req, res) => res.json({ dir: backup.backupDir(), dir2: backup.backupDir2(), items: backup.list(), log: backup.log() })));
  app.post('/api/backup/run', wrap(async (req, res) => res.json(await backup.runAll('backup'))));
  app.get('/api/backup/download/:name', wrap((req, res) => res.download(backup.filePath(req.params.name))));
  app.post('/api/backup/restore', uploadBig.single('file'), wrap((req, res) => {
    try {
      const q = req.body || {};
      if (String(q.confirm || '').trim() !== 'กู้คืน') throw new U.HttpError(400, 'พิมพ์คำว่า กู้คืน เพื่อยืนยัน');
      if (!auth.checkPassword(q.password)) throw new U.HttpError(403, 'รหัสผ่านไม่ถูกต้อง');
      if (req.file) return res.json(backup.restoreFromZip(req.file.path));
      if (req.body && req.body.name) return res.json(backup.restoreFromZip(backup.filePath(String(req.body.name))));
      throw new U.HttpError(400, 'ไม่พบไฟล์สำรอง');
    } finally { if (req.file) fs.rmSync(req.file.path, { force: true }); }
  }));
  // restore ด้วยชื่อไฟล์ ส่งแบบ JSON ได้เช่นกัน
  app.post('/api/backup/restore-local', wrap((req, res) => {
    const q = req.body || {};
    if (String(q.confirm || '').trim() !== 'กู้คืน') throw new U.HttpError(400, 'พิมพ์คำว่า กู้คืน เพื่อยืนยัน');
    if (!auth.checkPassword(q.password)) throw new U.HttpError(403, 'รหัสผ่านไม่ถูกต้อง');
    res.json(backup.restoreFromZip(backup.filePath(String(q.name))));
  }));

  // เลือกโฟลเดอร์สำรอง (เรียกดูโฟลเดอร์ของเครื่องหลัก ใช้ได้เฉพาะที่เครื่องหลักเท่านั้น)
  app.get('/api/fs/list', wrap((req, res) => { if (!isLocal(req)) throw new U.HttpError(403, 'เลือกโฟลเดอร์ได้เฉพาะที่เครื่องหลัก — กรุณาพิมพ์ตำแหน่งเอง'); res.json(fsb.listDir(req.query.path)); }));
  app.post('/api/fs/mkdir', wrap((req, res) => { if (!isLocal(req)) throw new U.HttpError(403, 'สร้างโฟลเดอร์ได้เฉพาะที่เครื่องหลัก'); res.json(fsb.makeDir((req.body || {}).parent, (req.body || {}).name)); }));

  // ปิดโปรแกรมจากหน้าจอ (ทำได้เฉพาะจากเครื่องหลักเท่านั้น)
  app.post('/api/shutdown', (req, res) => {
    if (!isLocal(req)) throw new U.HttpError(403, 'ปิดโปรแกรมได้เฉพาะที่เครื่องหลักเท่านั้น');
    res.json({ ok: true });
    setTimeout(() => { if (app.locals.shutdown) app.locals.shutdown(); }, 300);
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบบริการที่ร้องขอ' }));
  app.use(express.static(path.join(cfg.ROOT, 'public'), { maxAge: 0, etag: true }));

  app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
    if (err instanceof U.HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกินกำหนด (สูงสุด 20 MB)' : 'อัปโหลดไฟล์ไม่สำเร็จ' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'ข้อมูลใหญ่เกินกำหนด' });
    if (err && /UNIQUE constraint failed/.test(err.message || '')) return res.status(409).json({ error: 'ข้อมูลซ้ำกับรายการที่มีอยู่ กรุณาลองบันทึกอีกครั้ง' });
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ: ' + (err && err.message) });
  });
  return app;
}

function start() {
  db.open();
  fonts.installBundled();
  // อัปเดตโปรแกรมมาใหม่? -> สำรองข้อมูลให้ก่อนอัตโนมัติ
  try { const u = require('./updatecheck').checkAndBackup(backup, activity); if (u.updated) console.log(u.backup.ok ? '[อัปเดตโปรแกรม] สำรองข้อมูลก่อนอัปเดต: ' + (u.backup.name || '-') : '[อัปเดตโปรแกรม] สำรองไม่สำเร็จ: ' + u.backup.error); } catch (e) { console.error(e); }
  const app = createApp();
  activity.log('app_start', `โปรแกรมเริ่มทำงาน (รุ่น ${cfg.VERSION || ''})`, { actor: 'ระบบ', machine: 'เครื่องหลัก' });
  const logAuto = auto => { if (auto) activity.log('backup_auto', auto.ok ? `${auto.name}${auto.excel ? ' + ' + auto.excel : ''}` : `ไม่สำเร็จ ${auto.error}`, { actor: 'ระบบ', machine: 'เครื่องหลัก' }); return auto; };
  Promise.resolve(backup.autoIfDue()).then(logAuto).then(auto => { if (auto) console.log(auto.ok ? `[สำรองอัตโนมัติ] ${auto.name}${auto.excel ? ' + ' + auto.excel : ''}` : `[สำรองอัตโนมัติล้มเหลว] ${auto.error}`); }).catch(e => console.error(e));
  const timer = setInterval(() => { Promise.resolve(backup.autoIfDue()).then(logAuto).catch(e => console.error(e)); }, 10 * 60 * 1000); timer.unref();
  const openBrowser = () => { if (process.argv.includes('--open') && process.platform === 'win32') require('child_process').exec(`start "" "http://localhost:${cfg.PORT}"`); };
  live.schedule(300);
  const server = app.listen(cfg.PORT, cfg.HOST, () => {
    openBrowser();
    console.log(`ระบบทะเบียนหนังสือรับ-ส่ง พร้อมใช้งานที่  http://localhost:${cfg.PORT}`);
    console.log(`ข้อมูลเก็บไว้ที่: ${cfg.DATA_DIR}`);
    if (cfg.HOST !== '127.0.0.1' && cfg.HOST !== 'localhost') console.log(`เปิดให้เครื่องอื่นในเครือข่ายเข้าถึงได้ (host=${cfg.HOST}) ควรตั้งรหัสผ่านในหน้า "ตั้งค่าระบบ"`);
  });
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') openBrowser();   // เปิดซ้ำ: โปรแกรมทำงานอยู่แล้ว แค่เปิดหน้าเว็บให้
    if (e.code === 'EADDRINUSE') console.error(`พอร์ต ${cfg.PORT} ถูกใช้งานอยู่ อาจเปิดโปรแกรมนี้ค้างไว้แล้ว หรือเปลี่ยน port ในไฟล์ config.json`);
    else console.error(e);
    process.exit(1);
  });
  const stop = async () => { try { await backup.onExit(); } catch (e) { console.error(e); } server.close(); db.close(); process.exit(0); };
  app.locals.shutdown = stop;
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return server;
}

if (require.main === module) start();
module.exports = { createApp, start };
