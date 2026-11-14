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
const backup = require('./backup');
const auth = require('./auth');
const U = require('./util');
const ctx = require('./context');

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
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'self' blob:; object-src 'self' blob:; frame-ancestors 'self'");
    next();
  });
  app.use(express.json({ limit: '6mb' }));
  const wrap = fn => (req, res, next) => { try { const r = fn(req, res); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };

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
  app.get('/api/state', wrap((req, res) => {
    const s = publicSettings();
    res.json({ settings: s, has_password: auth.required(), year: books.registrationYear(), fonts: fonts.status(), data_dir: cfg.DATA_DIR,
      backup_dir: backup.backupDir(), version: cfg.VERSION, months: U.MONTHS });
  }));
  app.put('/api/settings', wrap((req, res) => {
    const b = req.body || {}; const old = db.getSettings(); const out = {};
    const str = (k, max = 200) => { if (b[k] !== undefined) { const v = String(b[k]).trim(); if (v.length > max) throw new U.HttpError(400, `${k} ยาวเกินไป`); out[k] = v; } };
    ['org_name', 'dept_name'].forEach(k => str(k)); ['duty_title', 'duty_unit'].forEach(k => str(k, 100));
    for (const k of ['from_options', 'to_options']) {
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
    num('ui_font_size', 12, 28, 'ขนาดตัวอักษรหน้าจอ'); num('print_font_size', 8, 24, 'ขนาดตัวอักษรพิมพ์');
    if (b.data_color !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(b.data_color)) throw new U.HttpError(400, 'รหัสสีไม่ถูกต้อง เช่น #174EA6'); out.data_color = b.data_color.toUpperCase(); }
    if (b.auto_backup !== undefined) out.auto_backup = b.auto_backup ? '1' : '0';
    if (b.backup_every_hours !== undefined) { const n = parseInt(b.backup_every_hours, 10); if (![1, 3, 6, 12, 24, 72, 168].includes(n)) throw new U.HttpError(400, 'ความถี่การสำรองไม่ถูกต้อง'); out.backup_every_hours = String(n); }
    if (b.backup_keep !== undefined) { const n = parseInt(b.backup_keep, 10); if (!(n >= 3 && n <= 365)) throw new U.HttpError(400, 'จำนวนชุดที่เก็บต้องอยู่ระหว่าง 3-365'); out.backup_keep = String(n); }
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

  /* --- สำรอง / กู้คืน --- */
  app.get('/api/backup', wrap((req, res) => res.json({ dir: backup.backupDir(), dir2: backup.backupDir2(), items: backup.list(), log: backup.log() })));
  app.post('/api/backup/run', wrap((req, res) => res.json(backup.run('backup'))));
  app.get('/api/backup/download/:name', wrap((req, res) => res.download(backup.filePath(req.params.name))));
  app.post('/api/backup/restore', uploadBig.single('file'), wrap((req, res) => {
    try {
      if (req.file) return res.json(backup.restoreFromZip(req.file.path));
      if (req.body && req.body.name) return res.json(backup.restoreFromZip(backup.filePath(String(req.body.name))));
      throw new U.HttpError(400, 'ไม่พบไฟล์สำรอง');
    } finally { if (req.file) fs.rmSync(req.file.path, { force: true }); }
  }));
  // restore ด้วยชื่อไฟล์ ส่งแบบ JSON ได้เช่นกัน
  app.post('/api/backup/restore-local', wrap((req, res) => res.json(backup.restoreFromZip(backup.filePath(String((req.body || {}).name))))));

  // ปิดโปรแกรมจากหน้าจอ (ทำได้เฉพาะจากเครื่องหลักเท่านั้น)
  app.post('/api/shutdown', (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new U.HttpError(403, 'ปิดโปรแกรมได้เฉพาะที่เครื่องหลักเท่านั้น');
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
  const app = createApp();
  const auto = backup.autoIfDue(); if (auto) console.log(auto.ok ? `[สำรองอัตโนมัติ] ${auto.name}` : `[สำรองอัตโนมัติล้มเหลว] ${auto.error}`);
  const timer = setInterval(() => { try { backup.autoIfDue(); } catch (e) { console.error(e); } }, 10 * 60 * 1000); timer.unref();
  const openBrowser = () => { if (process.argv.includes('--open') && process.platform === 'win32') require('child_process').exec(`start "" "http://localhost:${cfg.PORT}"`); };
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
  const stop = () => { try { backup.onExit(); } catch (e) { console.error(e); } server.close(); db.close(); process.exit(0); };
  app.locals.shutdown = stop;
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return server;
}

if (require.main === module) start();
module.exports = { createApp, start };
