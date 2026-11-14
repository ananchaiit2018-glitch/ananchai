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
  try { r = await fetch(url, o); } catch { throw new Error('ติดต่อโปรแกรมไม่ได้ กรุณาตรวจสอบว่าโปรแกรมยังเปิดอยู่ (หน้าต่างสีดำต้องไม่ถูกปิด)'); }
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

/* ---------- ช่องเลือกวันที่ (พ.ศ.) ---------- */
function thaiDatePicker(value) {
  const el = document.createElement('div'); el.className = 'thdate';
  const yearBE = new Date().getFullYear() + 543;
  el.innerHTML = `<input type="number" min="1" max="31" placeholder="วัน" inputmode="numeric" aria-label="วัน" class="ink">
    <select aria-label="เดือน" class="ink"><option value="">เดือน</option>${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
    <input type="number" min="2400" max="2700" placeholder="พ.ศ." inputmode="numeric" aria-label="ปี พ.ศ." class="ink">`;
  const [d, m, y] = [el.children[0], el.children[1], el.children[2]];
  const api_ = {
    el,
    set(iso) { if (/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) { const [yy, mm, dd] = iso.split('-').map(Number); d.value = dd; m.value = mm; y.value = yy + 543; } else { d.value = ''; m.value = ''; y.value = ''; } },
    get() {
      if (!d.value || !m.value || !y.value) return '';
      const yy = +y.value - 543, mm = +m.value, dd = +d.value, dt = new Date(yy, mm - 1, dd);
      if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return '';
      return `${yy}-${p2(mm)}-${p2(dd)}`;
    },
    today() { api_.set(todayISO()); },
    presetMonthYear() { const t = todayISO().split('-').map(Number); m.value = t[1]; y.value = t[0] + 543; }, onChange(fn) { [d, m, y].forEach(x => x.addEventListener('change', fn)); },
  };
  api_.set(value === undefined ? '' : value);
  void yearBE; return api_;
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
