'use strict';
/* แกนกลางฝั่งหน้าจอ: ตัวช่วยทั่วไป, เรียก API, วันที่ไทย, ช่องเซ็นลายเซ็น */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const p2 = n => String(n).padStart(2, '0');

const fmtDate = iso => { if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return ''; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} ${MS[m - 1]} ${y + 543}`; };
const fmtDT = iso => iso ? (iso.length >= 16 ? `${fmtDate(iso)} ${iso.slice(11, 16)} น.` : fmtDate(iso)) : '';
function fmtStamp(isoUtc) { const d = new Date(isoUtc); return isNaN(d) ? '' : `${fmtDate(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`)} ${p2(d.getHours())}:${p2(d.getMinutes())} น.`; }
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const nowLocal = () => { const d = new Date(); return `${todayISO()}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/* ---------- เรียก API ---------- */
let onAuthLost = () => {};
const setAuthLost = f => { onAuthLost = f; };
async function api(url, opts = {}) {
  const o = { credentials: 'same-origin', ...opts };
  try { const d = sessionStorage.getItem('duty'); if (d) o.headers = { ...(o.headers || {}), 'X-Duty-Officer': encodeURIComponent(d) }; } catch { /* ไม่มี storage */ }
  if (o.json !== undefined) { o.method = o.method || 'POST'; o.headers = { ...(o.headers || {}), 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.json); }
  let r;
  try { r = await fetch(url, o); } catch { throw new Error('ติดต่อโปรแกรมไม่ได้ โปรแกรมอาจถูกปิดไปแล้ว กรุณาเปิดใหม่จากไอคอน "ทะเบียนหนังสือ" บน Desktop แล้วรีเฟรชหน้านี้'); }
  if (r.status === 401 && !url.startsWith('/api/login')) { onAuthLost(); throw new Error('กรุณาเข้าสู่ระบบ'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : null;
  if (!r.ok) { const e = new Error((data && data.error) || `เกิดข้อผิดพลาด (${r.status})`); e.code = data && data.code; e.status = r.status; throw e; }
  return data;
}
const qs = obj => Object.entries(obj).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/* ---------- แจ้งเตือน / กล่องข้อความ ---------- */
function toast(msg, type = '', ms = 4500) {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}
function modal(inner, { small = false, onClose } = {}) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${small ? 'sm' : ''}" role="dialog" aria-modal="true">${inner}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', key); if (onClose) onClose(); };
  const key = e => { if (e.key === 'Escape') close(); };
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  document.addEventListener('keydown', key);
  document.body.append(bg);
  return { el: bg.firstElementChild, close };
}
function confirmBox(title, body, okText = 'ตกลง', danger = false) {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><div>${body}</div><div class="row" style="margin-top:16px;justify-content:flex-end">
      <button class="btn" data-no>ยกเลิก</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button></div>`, { small: true, onClose: () => res(false) });
    $('[data-no]', m.el).onclick = () => m.close();
    $('[data-ok]', m.el).onclick = () => { res(true); m.el.parentElement.remove(); };
  });
}
function promptBox(title, label, okText = 'ตกลง') {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><div class="field"><label class="f">${esc(label)}</label><textarea data-v class="ink"></textarea></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-no>ปิด</button><button class="btn danger" data-ok>${esc(okText)}</button></div>`, { small: true, onClose: () => res(null) });
    $('[data-v]', m.el).focus();
    $('[data-no]', m.el).onclick = () => m.close();
    $('[data-ok]', m.el).onclick = () => { const v = $('[data-v]', m.el).value.trim(); if (!v) { toast('กรุณากรอกข้อความ', 'err'); return; } res(v); m.el.parentElement.remove(); };
  });
}

/* ---------- ช่องเลือกวันที่: ปฏิทินป๊อปอัป (แสดงปี พ.ศ.) ---------- */
function thaiDatePicker(value) {
  const el = document.createElement('div'); el.className = 'cal-wrap';
  el.innerHTML = '<button type="button" class="cal-btn ink"><span class="cal-text">เลือกวันที่</span><span>📅</span></button><div class="cal-pop" hidden></div>';
  const btn = el.children[0], pop = el.children[1], txt = btn.children[0];
  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  let val = ''; let view = new Date(); view.setDate(1); const cbs = [];
  const label = () => { txt.textContent = val ? fmtDate(val) : 'เลือกวันที่'; txt.classList.toggle('muted', !val); };
  const draw = () => {
    const y = view.getFullYear(), m = view.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), today = todayISO();
    let cells = ''; for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) { const iso = `${y}-${p2(m + 1)}-${p2(d)}`; cells += `<button type="button" class="cal-d ${iso === val ? 'sel' : ''} ${iso === today ? 'today' : ''}" data-d="${iso}">${d}</button>`; }
    pop.innerHTML = `<div class="cal-head"><button type="button" class="btn sm" data-y="-1" title="ปีก่อน">«</button><button type="button" class="btn sm" data-m="-1" title="เดือนก่อน">‹</button><b>${MONTHS[m]} ${y + 543}</b><button type="button" class="btn sm" data-m="1" title="เดือนถัดไป">›</button><button type="button" class="btn sm" data-y="1" title="ปีถัดไป">»</button></div>
      <div class="cal-grid">${DOW.map(x => `<i>${x}</i>`).join('')}${cells}</div><div class="cal-foot"><button type="button" class="btn sm" data-today="1">วันนี้</button><button type="button" class="btn sm" data-clear="1">ล้าง</button></div>`;
  };
  const close = () => { pop.hidden = true; };
  const open = () => { if (val) { const [yy, mm] = val.split('-').map(Number); view = new Date(yy, mm - 1, 1); } draw(); pop.hidden = false; };
  const fire = () => cbs.forEach(f => f());
  btn.addEventListener('click', e => { e.stopPropagation(); pop.hidden ? open() : close(); });
  pop.addEventListener('click', e => {
    e.stopPropagation(); const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.d) { val = t.dataset.d; label(); close(); fire(); }
    else if (t.dataset.m) { view = new Date(view.getFullYear(), view.getMonth() + Number(t.dataset.m), 1); draw(); }
    else if (t.dataset.y) { view = new Date(view.getFullYear() + Number(t.dataset.y), view.getMonth(), 1); draw(); }
    else if (t.dataset.today) { val = todayISO(); label(); close(); fire(); }
    else if (t.dataset.clear) { val = ''; label(); close(); fire(); }
  });
  document.addEventListener('click', ev => { if (!el.isConnected) return; if (!el.contains(ev.target)) close(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(); });
  const api_ = {
    el, get: () => val,
    set(iso) { val = /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso : ''; if (val) { const [yy, mm] = val.split('-').map(Number); view = new Date(yy, mm - 1, 1); } label(); },
    today() { api_.set(todayISO()); }, presetMonthYear() { view = new Date(); view.setDate(1); },
    onChange(fn) { cbs.push(fn); },
  };
  api_.set(value === undefined ? '' : value);
  return api_;
}

/* ---------- ช่องเซ็นลายเซ็นบนหน้าจอ (เมาส์/นิ้ว/ปากกา) ---------- */
function signaturePad(canvas, color = '#174EA6') {
  const ctx = canvas.getContext('2d');
  let drawing = false, dirty = false, last = null, onDraw = () => {};
  function fit() {
    const r = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
    const keep = dirty ? canvas.toDataURL() : null;
    canvas.width = Math.max(1, Math.round(r.width * ratio)); canvas.height = Math.max(1, Math.round(r.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    if (keep) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = keep; }
  }
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); drawing = true; last = pos(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, 7); ctx.fillStyle = color; ctx.fill(); dirty = true; onDraw(); });
  canvas.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  requestAnimationFrame(fit); window.addEventListener('resize', fit);
  return {
    isEmpty: () => !dirty,
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
    toDataURL() { return canvas.toDataURL('image/png'); },
    onDraw(fn) { onDraw = fn; }, fit,
  };
}

/* ---------- ธีมสว่าง/มืด (ค่าตั้งต้นตามระบบของเครื่อง จำค่าที่ผู้ใช้เลือกไว้) ---------- */
const Theme = {
  saved() { try { return localStorage.getItem('theme'); } catch { return null; } },
  isDark() { const t = Theme.saved(); return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); },
  apply() { document.documentElement.dataset.theme = Theme.isDark() ? 'dark' : 'light'; },
  toggle() { try { localStorage.setItem('theme', Theme.isDark() ? 'light' : 'dark'); } catch { /* ไม่มี storage */ } Theme.apply(); },
  label() { return Theme.isDark() ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด'; },
};
Theme.apply();
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!Theme.saved()) Theme.apply(); });
function themeButton(cls = 'btn sm theme-fab') {
  const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = Theme.label();
  b.onclick = () => { Theme.toggle(); b.textContent = Theme.label(); };
  b.dataset.themeBtn = '1'; return b;
}
