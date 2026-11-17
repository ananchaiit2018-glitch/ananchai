'use strict';
/* แกนกลางฝั่งหน้าจอ: ตัวช่วยทั่วไป, เรียก API, วันที่ไทย, ช่องเซ็นลายเซ็น */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const p2 = n => String(n).padStart(2, '0');
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const longToday = () => { const d = new Date(); return `วัน${DAYS[d.getDay()]}ที่ ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`; };

/* ---------- ไอคอนเส้น (ชุดเดียวกันทั้งโปรแกรม) ---------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  inbox: '<path d="M12 3v10"/><path d="m7.5 8.5 4.5 4.5 4.5-4.5"/><path d="M3 14h5l1.5 2.5h5L16 14h5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  send: '<path d="M12 13V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M3 14h5l1.5 2.5h5L16 14h5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M4 19.5V5a3 3 0 0 1 3-3h13v16H7a3 3 0 0 0-3 3z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-4"/><path d="M8.5 7h7M8.5 11h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  power: '<path d="M12 2v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><path d="M7 21v-7h10v7"/>',
  clip: '<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 9h10M7 12h10M7 15h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  log: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="M9 11h6M9 15h4"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

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
function confirmBox(title, body, okText = 'ตกลง', danger = false, noText = 'ยกเลิก') {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><div>${body}</div><div class="row" style="margin-top:16px;justify-content:flex-end">
      <button class="btn" data-no>${esc(noText)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button></div>`, { small: true, onClose: () => res(false) });
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
  const b = document.createElement('button'); b.type = 'button'; b.className = cls;
  const draw = () => { b.innerHTML = `${ic(Theme.isDark() ? 'sun' : 'moon')} ${Theme.isDark() ? 'โหมดสว่าง' : 'โหมดมืด'}`; };
  draw(); b.onclick = () => { Theme.toggle(); draw(); };
  b.dataset.themeBtn = '1'; return b;
}
