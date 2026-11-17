'use strict';
/* หน้าจอทั้งหมดของโปรแกรม (ต้องโหลด core.js ก่อน) */
const S = { st: null };          // สถานะที่โหลดจากเซิร์ฟเวอร์ (ตั้งค่า, ฟอนต์, ปี)
const KIND = { in: 'หนังสือรับ', out: 'หนังสือส่ง' };
const MENU = [
  ['dashboard', 'home', 'หน้าหลัก'],   // ปุ่มเพิ่มหนังสือรับ/ส่ง อยู่ที่หน้าหลัก (ปุ่มใหญ่) และหน้าทะเบียน (＋ เพิ่ม) แล้ว
  ['grp', 'ทะเบียน'], ['list/in', 'book', 'ทะเบียนหนังสือรับ'], ['list/out', 'book', 'ทะเบียนหนังสือส่ง'], ['search', 'search', 'ค้นหาหนังสือ'], ['stats', 'chart', 'สถิติรายเดือน'], ['reports', 'printer', 'พิมพ์และส่งออก'],
  ['grp', 'ระบบ'], ['settings', 'sliders', 'ตั้งค่าระบบ'], ['backup', 'db', 'สำรองข้อมูล'], ['activity', 'log', 'ประวัติการใช้งาน'],
];
// ฟอนต์หน้าจอ (ฝังในโปรแกรม ใช้ออฟไลน์ได้) — การพิมพ์/PDF ยังใช้ TH Sarabun เสมอ
const UI_FONTS = [
  { id: 'plex', label: 'IBM Plex Sans Thai Looped', tag: 'แนะนำ', css: "'IBM Plex Sans Thai Looped'", base: 17, note: 'ตัวมีหัว อ่านง่าย ดูเป็นทางการ' },
  { id: 'sarabun', label: 'Sarabun (สารบรรณ)', css: "'Sarabun'", base: 18, note: 'หน้าตาคล้าย TH Sarabun แต่คมชัดบนจอ' },
  { id: 'noto', label: 'Noto Sans Thai', css: "'Noto Sans Thai'", base: 17, note: 'ตัวไม่มีหัว ทันสมัย' },
  { id: 'register', label: 'TH SarabunIT๙ (แบบเดิม)', css: "'RegisterFont'", base: 23, note: 'ฟอนต์เดียวกับที่ใช้พิมพ์ ตัวเล็กและบางกว่า' },
];
const UI_SCALES = [['90', 'เล็ก'], ['100', 'ปกติ'], ['112', 'ใหญ่'], ['125', 'ใหญ่มาก']];
function applyUiFont(id, scale) {
  const f = UI_FONTS.find(x => x.id === id) || UI_FONTS[0];
  const r = document.documentElement.style;
  r.setProperty('--font', `${f.css},'Leelawadee UI','Tahoma',sans-serif`);
  r.setProperty('--fs', (f.base * (parseInt(scale, 10) || 100) / 100).toFixed(2) + 'px');
  document.documentElement.dataset.uifont = f.id;
}
// ชั้นความเร็ว / กำหนดดำเนินการ
const URG = ['ด่วน', 'ด่วนมาก', 'ด่วนที่สุด'];
const urgTag = u => u ? `<span class="urg u${URG.indexOf(u) + 1}">${esc(u)}</span> ` : '';
function dueInfo(due) {
  const n = Math.round((new Date(due + 'T00:00') - new Date(todayISO() + 'T00:00')) / 86400000);
  if (n < 0) return { n, lvl: 'over', label: `เลยกำหนด ${-n} วัน` };
  if (n === 0) return { n, lvl: 'today', label: 'ครบกำหนดวันนี้' };
  if (n === 1) return { n, lvl: 'soon', label: 'พรุ่งนี้' };
  return { n, lvl: n <= 3 ? 'near' : 'later', label: `อีก ${n} วัน` };
}
const dueTag = b => b.due_date && !b.done_at && b.status !== 'cancelled' ? ` <span class="lvtag lv-${dueInfo(b.due_date).lvl}">⏰ ${dueInfo(b.due_date).label}</span>` : (b.due_date && b.done_at ? ' <span class="lvtag lv-done">✓ เสร็จแล้ว</span>' : '');
function undoToast(msg, undo) {
  const t = document.createElement('div'); t.className = 'toast ok'; t.innerHTML = `${esc(msg)} <button class="btn sm" style="margin-left:10px">เลิกทำ</button>`; $('#toasts').append(t);
  const rm = setTimeout(() => t.remove(), 7000);
  $('button', t).onclick = async () => { clearTimeout(rm); t.remove(); try { await undo(); toast('เลิกทำแล้ว', 'ok'); } catch (e) { toast(e.message, 'err'); } };
}
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function loadState() {
  S.st = await api('/api/state');
  const s = S.st.settings, f = S.st.fonts;
  applyUiFont(s.ui_font || 'plex', s.ui_scale || '100');
  document.documentElement.style.setProperty('--ink-user', s.data_color || '#174EA6');
  let css = '';
  if (f.regular) css += `@font-face{font-family:'RegisterFont';src:url('/api/font/regular?v=${f.regular.version}');font-weight:400}`;
  if (f.bold) css += `@font-face{font-family:'RegisterFont';src:url('/api/font/bold?v=${f.bold.version}');font-weight:700}`;
  $('#font-style').textContent = css + '.ink,.ink td,td.ink{color:var(--ink)}';
}

/* ---------- โครงหน้า ---------- */
function shell(active) {
  const s = S.st.settings;
  const nav = MENU.map(([r, i, t]) => r === 'grp' ? `<div class="grp">${i}</div>` : `<a href="#/${r}" class="${active === r ? 'on' : ''}">${ic(i)}<span>${t}</span></a>`).join('');
  const themeHtml = () => `${ic(Theme.isDark() ? 'sun' : 'moon')}<span>${Theme.isDark() ? 'โหมดสว่าง' : 'โหมดมืด'}</span>`;
  const duty = getDuty();
  $('#app').innerHTML = `<div class="shell"><aside class="side">
    <div class="brand">${s.logo ? '<img src="/api/logo?' + Date.now() + '" alt="">' : '<img src="/icon.svg" alt="" class="appicon">'}<div><b>${esc(s.org_name || 'ทะเบียนหนังสือ')}</b><small>รับ–ส่ง อิเล็กทรอนิกส์</small></div></div>
    <nav class="nav">${nav}</nav>
    <div class="side-foot">
      ${duty ? `<a class="me" href="#/duty" title="เปลี่ยนผู้เข้าเวร"><span class="av">${esc(initialOf(duty))}</span><span class="grow"><b>${esc(shortName(duty))}</b><small>ผู้เข้าเวร · กดเพื่อเปลี่ยน</small></span></a>` : ''}
      <div class="nav"><a id="theme">${themeHtml()}</a><a id="quit">${ic('power')}<span>ปิดโปรแกรม</span></a>
      ${S.st.has_password ? `<a id="logout">${ic('logout')}<span>ออกจากระบบ</span></a>` : ''}</div></div></aside>
    <main class="main" id="main"></main></div>`;
  $('#theme').onclick = () => { Theme.toggle(); $('#theme').innerHTML = themeHtml(); };
  $('#quit').onclick = async () => {
    if (!await confirmBox('ปิดโปรแกรม', '<p>ต้องการปิดโปรแกรมทะเบียนหนังสือหรือไม่? (ข้อมูลที่บันทึกแล้วไม่หาย)</p>', 'ปิดโปรแกรม', true)) return;
    try { await api('/api/shutdown', { method: 'POST' }); $('#app').innerHTML = '<div class="login"><div class="card" style="text-align:center"><h1 style="font-size:1.5rem">ปิดโปรแกรมเรียบร้อยแล้ว</h1><p class="muted">ปิดหน้าต่างนี้ได้เลย · เปิดใหม่โดยดับเบิลคลิกไอคอน "ทะเบียนหนังสือ" บน Desktop</p></div></div>'; } catch (e) { toast(e.message, 'err', 7000); }
  };
  const lo = $('#logout'); if (lo) lo.onclick = async () => { await api('/api/logout', { method: 'POST' }); location.reload(); };
  return $('#main');
}
function fontWarning() {
  return S.st.fonts.regular ? '' : `<div class="notice warn"><b>ยังไม่ได้นำเข้าไฟล์ฟอนต์ TH Sarabun</b> — การพิมพ์/ส่งออก PDF ต้องใช้ไฟล์ฟอนต์จริง กรุณาไปที่ <a href="#/settings">ตั้งค่าระบบ → ฟอนต์</a> แล้วนำเข้าไฟล์ THSarabunNew.ttf (และ THSarabunNew Bold.ttf)</div>`;
}
// ชื่อสั้น = ยศ+ชื่อ ตัดนามสกุลออก (คำแรกก่อนช่องว่าง) เช่น "ส.ต.ท.เนวิน แดงแจ้" -> "ส.ต.ท.เนวิน"
const shortName = n => String(n || '').trim().split(/\s+/)[0];
// อักษรตัวแรกของชื่อ (ข้ามยศ) ใช้ทำรูปวงกลม เช่น "ส.ต.ท.เนวิน" -> "เ" -> ใช้พยัญชนะ "น"
const initialOf = n => { const nm = shortName(n).split('.').filter(Boolean).pop() || ''; const m = nm.match(/[ก-ฮA-Za-z]/); return m ? m[0] : '?'; };
const getDuty = () => { try { return sessionStorage.getItem('duty') || ''; } catch { return ''; } };
const officers = () => { try { return JSON.parse(S.st.settings.duty_officers || '[]'); } catch { return []; } };
const header = (title, right = '', sub = '') => `<div class="top"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="row"><span class="pill">${ic('calendar')} ปีทะเบียน พ.ศ. ${S.st.year}</span>${right}</div></div>`;

/* ---------- Dashboard ---------- */
async function viewDashboard() {
  const m = shell('dashboard'); const d = await api('/api/dashboard');
  const rows = d.recent.map(b => `<tr class="click ${b.status === 'cancelled' ? 'cancelled' : ''}" data-id="${b.id}">
    <td><span class="tag ${b.kind}">${b.kind === 'in' ? 'รับ' : 'ส่ง'}</span></td><td class="regno">${esc(b.reg_label)}</td><td class="ink">${esc(b.book_no)}</td><td class="ink nowrap">${fmtDate(b.book_date)}</td>
    <td class="ink">${urgTag(b.urgency)}${esc(b.subject)}${dueTag(b)}</td><td class="ink">${esc(b.kind === 'in' ? b.from_org : b.to_org)}</td></tr>`).join('');
  const s = S.st.settings;
  m.innerHTML = header(`สวัสดี ${esc(shortName(getDuty()))}`, '', `${ic('clock')} <span id="today">${longToday()}</span> · <span id="clock"></span> น. &nbsp;·&nbsp; ${esc(s.duty_title)} ${esc(s.duty_unit)}`) + fontWarning() + `
    <div class="hero">
      <a class="tile in" href="#/new/in"><span class="tile-ic">${ic('inbox')}</span><span class="grow"><b>เพิ่มหนังสือรับ</b><small>เลขทะเบียนรับถัดไป <span class="num">${esc(d.next_in)}</span></small></span><span class="tile-go">${ic('plus')}</span></a>
      <a class="tile out" href="#/new/out"><span class="tile-ic">${ic('send')}</span><span class="grow"><b>เพิ่มหนังสือส่ง</b><small>เลขทะเบียนส่งถัดไป <span class="num">${esc(d.next_out)}</span></small></span><span class="tile-go">${ic('plus')}</span></a>
    </div>
    <div id="tasks"></div>
    <div class="grid g4 stats">
      <div class="card stat"><span class="st-ic in">${ic('inbox')}</span><div><div class="l">หนังสือรับ ปีนี้</div><div class="n">${d.in_year}</div><small class="muted">ทั้งหมด ${d.in_total}</small></div></div>
      <div class="card stat"><span class="st-ic in">${ic('calendar')}</span><div><div class="l">หนังสือรับ เดือนนี้</div><div class="n">${d.in_month}</div></div></div>
      <div class="card stat"><span class="st-ic out">${ic('send')}</span><div><div class="l">หนังสือส่ง ปีนี้</div><div class="n">${d.out_year}</div><small class="muted">ทั้งหมด ${d.out_total}</small></div></div>
      <div class="card stat"><span class="st-ic out">${ic('calendar')}</span><div><div class="l">หนังสือส่ง เดือนนี้</div><div class="n">${d.out_month}</div></div></div>
    </div>
    <div class="actions two">
      <a class="act" href="#/reports?kind=in&scope=all&auto=1">${ic('printer')}<span>พิมพ์ทะเบียนรับ (ทั้งฉบับ)</span></a>
      <a class="act" href="#/reports?kind=out&scope=all&auto=1">${ic('printer')}<span>พิมพ์ทะเบียนส่ง (ทั้งฉบับ)</span></a>
    </div>
    <div class="card xlcard" id="xlcard"></div>
    <div class="card"><h2>รายการล่าสุด</h2>${d.recent.length ? `<div class="tw" style="max-height:none"><table class="t"><thead><tr><th></th><th>เลขทะเบียน</th><th>ที่</th><th>ลงวันที่</th><th>เรื่อง</th><th>จาก/ถึง</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">ยังไม่มีรายการ เริ่มต้นด้วยการกด "เพิ่มหนังสือรับ" หรือ "เพิ่มหนังสือส่ง"</p>'}
    ${d.cancelled ? `<p class="muted">รายการที่ยกเลิก (ยังเก็บเลขทะเบียนไว้): ${d.cancelled} รายการ</p>` : ''}</div>`;
  $$('tr.click', m).forEach(tr => tr.onclick = () => openDetail(+tr.dataset.id));
  const tick = () => { const c = $('#clock'); if (!c) return clearInterval(clk); const n = new Date(); c.textContent = `${p2(n.getHours())}:${p2(n.getMinutes())}`; $('#today').textContent = longToday(); };
  const clk = setInterval(tick, 15000); tick();
  liveExcelCard($('#xlcard')); tasksCard($('#tasks'));
}

/* ---------- เตือนความจำ: เรื่องที่ต้องดำเนินการ ---------- */
async function tasksCard(el) {
  const list = await api('/api/tasks').catch(() => null); if (!list || !el.isConnected) return;
  if (!list.length) { el.innerHTML = `<div class="card tasks empty"><span class="tk-ok">${ic('clock')}</span><b>ไม่มีเรื่องค้าง</b><span class="muted">หนังสือที่มีกำหนด "ภายในวันที่" จะขึ้นเตือนที่นี่</span></div>`; return; }
  const over = list.filter(t => dueInfo(t.due_date).n < 0).length;
  el.innerHTML = `<div class="card tasks"><div class="xlhead"><div class="xlicon tk">${ic('clock')}</div><div class="grow"><h2 style="margin:0">เตือนความจำ · เรื่องที่ต้องดำเนินการ</h2>
      <div class="muted" style="font-size:.92rem">หนังสือที่มีกำหนด "ภายในวันที่" · ทำเสร็จแล้วกด ✓ สำเร็จแล้ว</div></div>
      <span class="pill">${list.length} เรื่อง${over ? ` · <b style="color:var(--danger)">เลยกำหนด ${over}</b>` : ''}</span></div>
    <div class="tasklist">${list.map(t => { const d = dueInfo(t.due_date); return `<div class="task lv-${d.lvl}">
      <div class="due"><b>${d.label}</b><small>${fmtDate(t.due_date)}</small></div>
      <div class="grow tk-body"><div class="tk-top">${urgTag(t.urgency)}<span class="tag ${t.kind}">${t.kind === 'in' ? 'รับ' : 'ส่ง'}</span> <b class="regno">${esc(t.reg_label)}</b> <span class="muted">· ที่ ${esc(t.book_no) || '-'}</span></div>
        <div class="tk-subj ink">${esc(t.subject)}</div><small class="muted">${t.kind === 'in' ? 'จาก ' + esc(t.from_org || '-') : 'ถึง ' + esc(t.to_org || '-')}</small></div>
      <div class="tk-acts"><button class="btn sm" data-view="${t.id}">ดูรายละเอียด</button><button class="btn sm okbtn" data-done="${t.id}">✓ สำเร็จแล้ว</button></div></div>`; }).join('')}</div></div>`;
  $$('[data-view]', el).forEach(b => b.onclick = () => openDetail(+b.dataset.view));
  $$('[data-done]', el).forEach(b => b.onclick = async () => {
    b.disabled = true; const id = b.dataset.done;
    try { await api(`/api/books/id/${id}/done`, { method: 'POST' }); b.closest('.task').classList.add('gone'); setTimeout(() => tasksCard(el), 320);
      undoToast('ทำเครื่องหมายว่าสำเร็จแล้ว', async () => { await api(`/api/books/id/${id}/undone`, { method: 'POST' }); if (el.isConnected) tasksCard(el); });
    } catch (e) { toast(e.message, 'err'); b.disabled = false; }
  });
}

/* ---------- การ์ดไฟล์ Excel อัปเดตอัตโนมัติ ---------- */
function downloadAllXlsx() {
  fetch('/api/export-all/xlsx', { credentials: 'same-origin' }).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'ส่งออกไม่สำเร็จ');
    const cd = r.headers.get('content-disposition') || ''; const nm = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(cd) || [])[1] || 'ทะเบียน.xlsx');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = nm; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('ดาวน์โหลด Excel แล้ว: ' + nm, 'ok');
  }).catch(e => toast(e.message, 'err'));
}
async function liveExcelCard(el) {
  const s = await api('/api/live-excel').catch(() => null); if (!s || !el.isConnected) return;
  const local = S.st.is_local, on = s.enabled || s.archive;
  el.innerHTML = `<div class="xlhead"><div class="xlicon">${ic('folder')}</div><div class="grow"><h2 style="margin:0">โฟลเดอร์เก็บหนังสือ</h2>
      <div class="muted" style="font-size:.92rem">${on ? 'บันทึกเมื่อไร โปรแกรมจัดให้เอง: Excel ทะเบียนรับ/ส่ง + ไฟล์หนังสือแยกโฟลเดอร์ตามวัน' : 'ปิดอยู่ — เปิดได้ที่หน้า "สำรองข้อมูล"'}</div></div>
      ${on ? `<span class="xlstate ${s.error ? 'bad' : 'good'}">${s.error ? '⚠️ ยังไม่อัปเดต' : s.at ? '✅ อัปเดตแล้ว ' + fmtStamp(s.at) : '⏳ กำลังเตรียม'}</span>` : ''}</div>
    ${s.error ? `<div class="notice warn" style="margin-top:10px">${esc(s.error)}</div>` : ''}${s.warn2 ? `<div class="notice warn" style="margin-top:10px">${esc(s.warn2)}</div>` : ''}
    ${on ? `<div class="muted xlpath">📁 ${esc(s.dir)}${s.archive && s.files ? ` · ไฟล์หนังสือ ${s.files} ไฟล์` : ''}</div>` : ''}
    <div class="row" style="margin-top:10px">${local && on ? `<button class="btn primary" id="xlfolder">${ic('folder')} เปิดโฟลเดอร์</button>` : ''}
      ${local && s.enabled ? `<button class="btn" data-xk="in">${ic('sheet')} Excel ทะเบียนรับ</button><button class="btn" data-xk="out">${ic('sheet')} Excel ทะเบียนส่ง</button>` : ''}
      <button class="btn" id="xldl">${ic('download')} โหลด Excel (รับ+ส่ง)</button>${on ? `<button class="btn" id="xlnow">${ic('refresh')} อัปเดตตอนนี้</button>` : ''}</div>`;
  const open = body => async () => { try { await api('/api/live-excel/open', { json: body }); toast(body.folder ? 'เปิดโฟลเดอร์แล้ว' : 'กำลังเปิดใน Excel… (ระหว่างเปิดค้างไว้ ระบบจะอัปเดตไฟล์นี้ไม่ได้จนกว่าจะปิด)', 'ok', 6000); } catch (e) { toast(e.message, 'err', 7000); } };
  if ($('#xlfolder', el)) $('#xlfolder', el).onclick = open({ folder: true });
  $$('[data-xk]', el).forEach(b => b.onclick = open({ kind: b.dataset.xk }));
  $('#xldl', el).onclick = downloadAllXlsx;
  if ($('#xlnow', el)) $('#xlnow', el).onclick = async () => { const r = await api('/api/live-excel/update', { method: 'POST' }).catch(e => ({ error: e.message })); toast(r.error || 'อัปเดตโฟลเดอร์เก็บหนังสือแล้ว', r.error ? 'err' : 'ok'); liveExcelCard(el); };
}

/* ---------- ช่องเลือกจากรายการ (+ พิมพ์เอง) ---------- */
function choiceHtml(id, options, current, ph) {
  const other = !!current && !options.includes(current);
  return `<select id="${id}_sel" class="ink"><option value="">— เลือก —</option>${options.map(o => `<option value="${esc(o)}" ${o === current ? 'selected' : ''}>${esc(o)}</option>`).join('')}<option value="__other" ${other ? 'selected' : ''}>อื่นๆ (พิมพ์เอง)…</option></select>
    <input type="text" id="${id}" class="ink" style="margin-top:6px" placeholder="${esc(ph)}" value="${other ? esc(current) : ''}" ${other ? '' : 'hidden'}>`;
}
function wireChoice(id) { const sel = $('#' + id + '_sel'), inp = $('#' + id); sel.onchange = () => { inp.hidden = sel.value !== '__other'; if (!inp.hidden) inp.focus(); }; }
const getChoice = id => { const sel = $('#' + id + '_sel'); return sel.value === '__other' ? $('#' + id).value.trim() : sel.value; };

/* ---------- ฟอร์มเพิ่ม / แก้ไข ---------- */
async function viewForm(kind, editId) {
  const m = shell(editId ? '' : 'list/' + kind);   // กำลังเพิ่มหนังสือรับ -> ไฮไลต์ ทะเบียนหนังสือรับ
  const edit = editId ? await api('/api/books/id/' + editId) : null;
  if (edit) kind = edit.kind;
  if (edit && edit.status === 'cancelled') { m.innerHTML = header('แก้ไขไม่ได้') + '<div class="notice err">รายการที่ยกเลิกแล้วไม่สามารถแก้ไขได้</div>'; return; }
  const next = edit ? null : await api('/api/next/' + kind);
  const sug = {};
  await Promise.all(['from_org', 'to_org', 'action', 'receiver_name'].map(async f => { sug[f] = await api('/api/suggest?field=' + f).catch(() => []); }));
  const isIn = kind === 'in';
  const L = { sender: isIn ? 'ผู้ส่งมอบหนังสือ' : 'ผู้ส่งหนังสือ', receiver: 'ผู้รับหนังสือ' };
  const jl = k => { try { return JSON.parse(S.st.settings[k] || '[]'); } catch { return []; } };
  const fromOpts = jl('from_options'), toOpts = jl('to_options');
  // ทะเบียนรับ: จาก=ต้นทางหลัก ถึง=หน่วยเรา / ทะเบียนส่ง: สลับกัน
  const defFrom = (isIn ? fromOpts[0] : toOpts[0]) || '', defTo = (isIn ? toOpts[0] : fromOpts[0]) || '';
  for (const f of ['from_org', 'to_org']) sug[f] = [...new Set([...fromOpts, ...toOpts, ...sug[f]])];
  const orgOpts = f => [...new Set([...fromOpts, ...toOpts, ...(sug[f] || [])])].slice(0, 60);
  const prefixes = jl('book_no_prefixes');
  let preSel = '__custom', sufVal = '';
  { const cur = edit ? edit.book_no : '';
    if (!edit) preSel = prefixes[0] || '__custom';
    else { const mt = prefixes.filter(x => cur.startsWith(x)).sort((x, y) => y.length - x.length)[0]; if (mt) { preSel = mt; sufVal = cur.slice(mt.length); } else sufVal = cur; } }
  const dl = f => `<datalist id="dl-${f}">${sug[f].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const v = f => esc(edit ? edit[f] : '');
  const recvOptions = [...new Set(officers().map(shortName))];
  const recvCur = edit ? shortName(edit.receiver_name || edit.action) : shortName(getDuty());
  if (recvCur && !recvOptions.includes(recvCur)) recvOptions.push(recvCur);
  const sigBlock = who => `<div class="sigbox"><div class="sec" style="margin-top:0"><span>2</span>ผู้รับหนังสือ / ผู้บันทึก</div>
    <div class="grid g2"><div class="field"><label class="f">ชื่อ <small>(ลงช่อง "การปฏิบัติ" ในทะเบียน · ยศ+ชื่อ ไม่มีนามสกุล)</small></label>
      <select id="${who}_name" class="ink"><option value="">— เลือก —</option>${recvOptions.map(n => `<option value="${esc(n)}" ${n === recvCur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="field"><label class="f">วันและเวลา${who === 'sender' ? 'ส่ง' : 'รับ'}</label><div class="row"><div class="grow" id="${who}_at_date"></div><span class="timesel"><select id="${who}_hh" class="ink" aria-label="ชั่วโมง"><option value="">--</option>${Array.from({ length: 24 }, (_, i) => `<option>${p2(i)}</option>`).join('')}</select><b>:</b><select id="${who}_mm" class="ink" aria-label="นาที"><option value="">--</option>${Array.from({ length: 60 }, (_, i) => `<option>${p2(i)}</option>`).join('')}</select><small class="muted">น.</small></span><button type="button" class="btn sm" id="${who}_now">ตอนนี้</button></div></div></div></div>`;
  m.innerHTML = header(edit ? `แก้ไข${KIND[kind]} ${esc(edit.reg_label)}` : `เพิ่ม${KIND[kind]}`) + fontWarning() + `
    <form class="card" id="f" autocomplete="off">
      <div class="regbox"><div>เลขทะเบียน${isIn ? 'รับ' : 'ส่ง'}</div><b>${edit ? esc(edit.reg_label) : esc(next.label)}</b>
        <small class="muted">${edit ? 'เลขทะเบียนแก้ไขไม่ได้' : 'ระบบออกเลขให้อัตโนมัติเมื่อกดบันทึก (เลขจริงอาจเปลี่ยนถ้ามีเครื่องอื่นบันทึกก่อน)'} · ไม่ใช่เลขที่หนังสือราชการ</small></div>
      <div class="ocrbox" id="ocrbox">
        <div class="ocr-drop" id="ocrDrop"><span class="ocr-ic">${ic('scan')}</span>
          <div class="grow"><b>มีไฟล์หนังสือไหม? ให้โปรแกรมอ่านแล้วกรอกให้</b><small>PDF จากระบบสารบรรณอิเล็กทรอนิกส์ หรือรูปสแกน/ถ่าย · ลากมาวาง · กดเลือกไฟล์ · หรือ <kbd>Ctrl</kbd>+<kbd>V</kbd> — อ่านในเครื่องนี้ ไม่ส่งออกอินเทอร์เน็ต</small></div>
          <button type="button" class="btn primary" id="ocrPick">${ic('image')} เลือกไฟล์</button><input type="file" id="ocrFile" accept="image/*,.pdf,application/pdf" hidden></div>
        <div class="ocr-run" id="ocrRun" hidden><img id="ocrThumb" alt=""><div class="grow"><b id="ocrMsg">กำลังเตรียมตัวอ่าน…</b><div class="ocr-bar"><i id="ocrBar"></i></div><small class="muted" id="ocrSub">ครั้งแรกอาจใช้เวลาสักครู่</small></div></div>
      </div>
      <div class="sec"><span>1</span>ข้อมูลหนังสือ <small>เรียงตามช่องในทะเบียน</small></div>
      <div class="grid g2"><div class="field"><label class="f">ที่ <small>(เลือกตัวนำหน้า แล้วพิมพ์เฉพาะเลขหลัง / )</small></label>
          <div style="display:flex;gap:8px"><select id="book_pre" class="ink" style="flex:3 1 0;min-width:0">${prefixes.map(x => `<option value="${esc(x)}" ${x === preSel ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="__custom" ${preSel === '__custom' ? 'selected' : ''}>✏️ พิมพ์เลขที่เอง (พิมพ์ทั้งหมด ไม่ใช้ตัวนำหน้า)</option></select>
            <input type="text" id="book_suf" class="ink" style="flex:1 1 0;min-width:96px" value="${esc(sufVal)}" maxlength="200"></div></div>
        <div class="field"><label class="f">ลงวันที่ <span class="muted">*</span></label><div id="book_date_w"></div></div></div>
      <div class="grid g2"><div class="field"><label class="f">จาก</label>${choiceHtml('from_org', orgOpts('from_org'), edit ? edit.from_org : defFrom, 'พิมพ์ชื่อหน่วยงานต้นทาง')}</div>
        <div class="field"><label class="f">ถึง</label>${choiceHtml('to_org', orgOpts('to_org'), edit ? edit.to_org : defTo, 'พิมพ์ชื่อหน่วยงานปลายทาง')}</div></div>
      <div class="field"><label class="f">เรื่อง <span class="muted">*</span></label><textarea id="subject" class="ink" maxlength="1000">${v('subject')}</textarea></div>
      <div class="field"><label class="f">หมายเหตุ</label><input type="text" id="remark" class="ink" value="${v('remark')}"></div>
      <div class="grid g2"><div class="field"><label class="f">ชั้นความเร็ว</label><div class="seg urgseg">${['', ...URG].map(u => `<label class="${u ? 'u' + (URG.indexOf(u) + 1) : ''}"><input type="radio" name="urgency" value="${u}" ${((edit && edit.urgency) || '') === u ? 'checked' : ''}>${u || 'ปกติ'}</label>`).join('')}</div></div>
        <div class="field"><label class="f">ต้องดำเนินการภายใน <small>(เว้นว่าง = แจ้งเพื่อทราบ ไม่ต้องเตือน)</small></label><div id="due_w"></div></div></div>
      <div class="grid">${sigBlock('receiver')}</div>
      <div class="sec"><span>3</span>แนบไฟล์ <small>ไม่บังคับ · PDF, JPG, PNG ไม่เกิน 20 MB ต่อไฟล์</small></div>
      <div class="field">
        <input type="file" id="files" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg">
        <div id="existing_att">${edit ? edit.attachments.map(a => `<div class="att" data-aid="${a.id}"><a href="/api/attachments/${a.id}" target="_blank">📎 ${esc(a.filename)}</a><small class="muted">${fmtSize(a.size)}</small><button type="button" class="btn sm danger" data-rm="${a.id}">ลบ</button></div>`).join('') : ''}</div></div>
      ${dl('receiver_name')}
      <div class="savebar"><span class="muted grow" id="msg">กด <kbd>Ctrl</kbd>+<kbd>S</kbd> เพื่อบันทึกได้</span><a class="btn big" href="#/${edit ? 'list/' + kind : 'dashboard'}">ยกเลิก</a>
        <button class="btn primary big" id="save" type="submit">${ic('save')} บันทึก${edit ? 'การแก้ไข' : ''}</button></div>
    </form>`;

  const bd = thaiDatePicker(edit ? edit.book_date : '');
  const prefillAt = !edit; $('#book_date_w').append(bd.el); if (!edit) bd.presetMonthYear();
  const dd = thaiDatePicker(edit ? edit.due_date || '' : ''); $('#due_w').append(dd.el); if (!edit) dd.presetMonthYear();
  wireChoice('from_org'); wireChoice('to_org');
  const syncPre = () => { const c = $('#book_pre').value === '__custom'; $('#book_suf').placeholder = c ? 'พิมพ์เลขที่หนังสือเต็มๆ ตามต้นฉบับ' : 'เลขหลัง /'; $('#book_pre').style.flex = c ? '1 1 0' : '3 1 0'; $('#book_suf').style.flex = c ? '3 1 0' : '1 1 0'; }; $('#book_pre').onchange = () => { syncPre(); $('#book_suf').focus(); }; syncPre();
  /* ---- อ่านจากรูป (OCR) แล้วกรอกให้ ---- */
  const nsp = s => String(s || '').replace(/\s+/g, '');
  const mark = el => { const f = el.closest('.field') || el; f.classList.add('ocr-hit'); el.addEventListener('input', () => f.classList.remove('ocr-hit'), { once: true }); el.addEventListener('change', () => f.classList.remove('ocr-hit'), { once: true }); };
  const setChoice = (id, val) => { const sel = $('#' + id + '_sel'), inp = $('#' + id);
    const opts = [...sel.options].map(x => x.value).filter(v => v && v !== '__other'); const hit = bestMatch(val, opts);
    if (hit) { sel.value = hit; inp.hidden = true; } else { sel.value = '__other'; inp.hidden = false; inp.value = val; } mark(sel); };
  function fillFromOcr(p) {
    const got = [];
    if (p.book_no) { const cut = p.book_no.lastIndexOf('/'); const pres = [...$('#book_pre').options].map(o => o.value).filter(v => v !== '__custom');
      const pre = cut > 0 ? bestMatch(p.book_no.slice(0, cut + 1), pres) : null;
      if (pre) { $('#book_pre').value = pre; $('#book_suf').value = nsp(p.book_no.slice(cut + 1)); } else { $('#book_pre').value = '__custom'; $('#book_suf').value = p.book_no; }
      syncPre(); mark($('#book_suf')); got.push('ที่'); }
    if (p.book_date) { bd.set(p.book_date); mark($('#book_date_w')); got.push('ลงวันที่'); }
    if (p.from_org) { setChoice('from_org', p.from_org); got.push('จาก'); }
    if (p.to_org) { setChoice('to_org', p.to_org); got.push('ถึง'); }
    if (p.subject) { $('#subject').value = p.subject; mark($('#subject')); got.push('เรื่อง'); }
    if (p.urgency) { const r = $(`[name=urgency][value="${p.urgency}"]`); if (r) { r.checked = true; mark(r.closest('.seg')); got.push(p.urgency); } }
    if (p.due_date) { dd.set(p.due_date); mark($('#due_w')); got.push('ภายในวันที่'); }
    return got;
  }
  async function runOcr(file) {
    const isPdf = file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
    if (!file || (!isPdf && !/^image\//.test(file.type))) { toast('ต้องเป็นไฟล์ PDF หรือรูป (JPG, PNG)', 'err'); return; }
    $('#ocrRun').hidden = false; $('#ocrDrop').classList.add('busy'); $('#ocrPick').disabled = true;
    let url = isPdf ? '' : URL.createObjectURL(file); if (url) $('#ocrThumb').src = url;
    let how = 'ocr';
    const prog = (msg, pct, sub) => { if (!$('#ocrMsg')) return; $('#ocrMsg').textContent = msg; $('#ocrBar').style.width = Math.round(pct * 100) + '%'; if (sub !== undefined) $('#ocrSub').textContent = sub; };
    try {
      let text;
      if (isPdf) {
        prog('กำลังเปิดไฟล์ PDF…', 0.05);
        const r = await readPdf(file);
        url = r.thumb; $('#ocrThumb').src = url;
        if (r.text) {
          text = r.text; how = 'pdf';
          const garbled = /[\x00-\x08\x0e-\x1f]/.test(text) || (text.match(/[ก-๛][!"#$%&;<=>?@^_`{|}~0-9][ก-๛]/g) || []).length > 3;
          if (garbled || parseThaiDoc(text).found.length < 3) {   // ฟอนต์ใน PDF บางไฟล์ถอดเป็นตัวอักษรไม่ได้ -> อ่านจากภาพหน้าที่เรนเดอร์คมชัด
            const t2 = await ocrImage(await r.page2400(), prog);
            if (parseThaiDoc(t2).found.length >= parseThaiDoc(text).found.length) { text = t2; how = 'pdfocr'; }
          }
        } else { how = 'pdfscan'; text = await ocrImage(r.canvas, prog); }
      } else text = await ocrImage(file, prog);
      if (!m.isConnected) return;
      const p = parseThaiDoc(text); const got = fillFromOcr(p);
      // แนบรูปนี้เป็นไฟล์แนบให้ด้วย
      const dt = new DataTransfer(); [...$('#files').files].forEach(f => dt.items.add(f)); dt.items.add(new File([file], file.name || `รูปหนังสือ-${Date.now()}.png`, { type: file.type })); $('#files').files = dt.files;
      $('#ocrRun').innerHTML = `<img src="${url}" alt="" class="ocr-done-img"><div class="grow"><b>${got.length ? `อ่านได้ ${got.length} ช่อง: ${got.join(', ')}` : 'อ่านรูปได้ แต่หาช่องที่ใช้ไม่เจอ'}</b>
        <small class="muted">${how === 'pdf' ? '📄 อ่านจากตัวอักษรใน PDF โดยตรง (ตรงตามต้นฉบับ) · ' : how === 'pdfscan' ? '📄 PDF นี้เป็นภาพสแกน จึงอ่านจากภาพ · ' : how === 'pdfocr' ? '📄 ฟอนต์ใน PDF นี้ถอดเป็นตัวอักษรไม่ได้ จึงอ่านจากภาพของหน้า PDF · ' : ''}${got.length ? `ช่องที่กรอกให้มีกรอบสีเหลือง <b>ตรวจให้ถูกก่อนกดบันทึกนะ</b>${how === 'pdf' ? '' : ' (อ่านจากภาพ อาจผิดบางตัว)'} · แนบไฟล์นี้ไว้ในไฟล์แนบให้แล้ว` : 'หาข้อมูลที่ใช้ไม่เจอ กรอกเองได้เลย · แนบไฟล์นี้ไว้ในไฟล์แนบให้แล้ว'}</small>
        <details><summary>ดูข้อความที่อ่านได้ทั้งหมด</summary><textarea readonly class="ocr-text">${esc(text)}</textarea></details></div>
        <button type="button" class="btn sm" id="ocrAgain">${ic('image')} ใช้รูปอื่น</button>`;
      $('#ocrAgain').onclick = () => $('#ocrFile').click();
      $('#ocrAgain').innerHTML = `${ic('image')} ใช้ไฟล์อื่น`;
      toast(got.length ? `กรอกให้ ${got.length} ช่องแล้ว ตรวจก่อนบันทึกนะ` : 'หาข้อมูลในรูปไม่เจอ ลองรูปที่ชัดกว่านี้', got.length ? 'ok' : 'err', 6000);
    } catch (e) { toast('อ่านรูปไม่สำเร็จ: ' + e.message, 'err', 8000); $('#ocrRun').hidden = true; }
    finally { if ($('#ocrDrop')) { $('#ocrDrop').classList.remove('busy'); $('#ocrPick').disabled = false; } }
  }
  $('#ocrPick').onclick = () => $('#ocrFile').click();
  $('#ocrFile').onchange = () => { const f = $('#ocrFile').files[0]; $('#ocrFile').value = ''; if (f) runOcr(f); };
  const drop = $('#ocrDrop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  const okFile = x => /^image\//.test(x.type) || x.type === 'application/pdf' || /\.pdf$/i.test(x.name || '');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = [...(e.dataTransfer.files || [])].find(okFile); if (f) runOcr(f); else toast('ลากมาเฉพาะไฟล์ PDF หรือรูปนะ', 'err'); };
  window.__ocrPaste = e => { if (!m.isConnected) return; const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(okFile); if (f) { e.preventDefault(); runOcr(f); } };
  const bookNo = () => { const suf = $('#book_suf').value.trim(); return suf ? (($('#book_pre').value === '__custom' ? '' : $('#book_pre').value) + suf) : ''; };
  const dt = {};
  const setT = (w, v) => { const [h, mi] = (v || '').split(':'); $(`#${w}_hh`).value = h || ''; $(`#${w}_mm`).value = mi || ''; };
  const getT = w => ($(`#${w}_hh`).value && $(`#${w}_mm`).value) ? `${$(`#${w}_hh`).value}:${$(`#${w}_mm`).value}` : '';
  for (const who of ['receiver']) {
    const at = edit ? edit[who + '_at'] : '';
    dt[who] = thaiDatePicker(at ? at.slice(0, 10) : ''); $(`#${who}_at_date`).append(dt[who].el);
    setT(who, at ? at.slice(11, 16) : '');
    if (prefillAt) { const n = nowLocal(); dt[who].set(n.slice(0, 10)); setT(who, n.slice(11, 16)); }
    const stamp = () => { if (!dt[who].get()) { const n = nowLocal(); dt[who].set(n.slice(0, 10)); setT(who, n.slice(11, 16)); } };
    $(`#${who}_now`).onclick = () => { const n = nowLocal(); dt[who].set(n.slice(0, 10)); setT(who, n.slice(11, 16)); };
    $(`#${who}_name`).addEventListener('change', () => { if ($(`#${who}_name`).value.trim()) stamp(); });
  }
  $$('[data-rm]', m).forEach(b => b.onclick = async () => {
    if (!await confirmBox('ลบไฟล์แนบ', 'ลบไฟล์แนบนี้ออกจากรายการ? (บันทึกในประวัติการแก้ไข)', 'ลบ', true)) return;
    try { await api('/api/attachments/' + b.dataset.rm, { method: 'DELETE' }); b.closest('.att').remove(); toast('ลบไฟล์แนบแล้ว', 'ok'); } catch (e) { toast(e.message, 'err'); }
  });

  const token = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^\w-]/g, '');
  let saving = false;
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); if (saving) return;
    const g = id => $('#' + id).value.trim();
    if (!g('subject')) { toast('กรุณากรอก "เรื่อง"', 'err'); $('#subject').focus(); return; }
    if (!bd.get()) { toast('กรุณาเลือก "ลงวันที่" จากปฏิทิน', 'err'); return; }
    if (!g('receiver_name')) { toast('กรุณาเลือกชื่อผู้รับหนังสือ / ผู้บันทึก', 'err'); $('#receiver_name').focus(); return; }
    const body = { book_no: bookNo(), book_date: bd.get(), from_org: getChoice('from_org'), to_org: getChoice('to_org'), subject: g('subject'), action: g('receiver_name'), remark: g('remark'), receiver_name: g('receiver_name'), urgency: ($('[name=urgency]:checked') || {}).value || '', due_date: dd.get() };
    for (const who of ['receiver']) {
      const d_ = dt[who].get(); const t = getT(who);
      body[who + '_at'] = d_ ? `${d_}T${t || '00:00'}` : '';
    }
    // เตือนถ้าอาจลงซ้ำ (ที่ ตรงกัน หรือ เรื่อง+ลงวันที่ ตรงกัน)
    const dups = await api('/api/books/dupcheck/' + kind, { json: { book_no: body.book_no, subject: body.subject, book_date: body.book_date, except: edit ? edit.id : 0 } }).catch(() => []);
    if (dups.length && !await confirmBox('⚠️ หนังสือนี้อาจลงซ้ำ', `<p>ดูเหมือนเคยลงทะเบียนไปแล้ว:</p><ul class="duplist">${dups.map(d => `<li><b>${esc(d.reg_label)}</b> · ที่ ${esc(d.book_no || '-')} · ลงวันที่ ${fmtDate(d.book_date)}<br><span class="muted">${esc(d.subject)}</span></li>`).join('')}</ul><p>ถ้าเป็นหนังสือคนละฉบับ กด <b>บันทึกต่อ</b> ได้เลย</p>`, 'บันทึกต่อ', false, 'กลับไปตรวจ')) return;
    const files = [...$('#files').files];
    saving = true; $('#save').disabled = true; $('#msg').textContent = 'กำลังบันทึก...';
    try {
      let rec;
      if (edit) rec = await api('/api/books/id/' + edit.id, { method: 'PUT', json: body });
      else { body.client_token = token; rec = await api('/api/books/' + kind, { json: body }); }
      let attErr = '';
      if (files.length && !rec.duplicate) {
        const fd = new FormData(); files.forEach(f => fd.append('files', f, f.name));
        try { await api(`/api/books/id/${rec.id}/attachments`, { method: 'POST', body: fd }); } catch (e) { attErr = e.message; }
      }
      if (edit) { toast('บันทึกการแก้ไขเรียบร้อย' + (attErr ? ' (แต่แนบไฟล์ไม่สำเร็จ: ' + attErr + ')' : ''), attErr ? 'err' : 'ok'); location.hash = '#/list/' + kind; return; }
      const mm = modal(`<h2>✅ บันทึกเรียบร้อยแล้ว</h2><div class="notice ok"><div>เลขทะเบียน${isIn ? 'รับ' : 'ส่ง'}</div><div style="font-size:2.2rem;font-weight:700">${esc(rec.reg_label)}</div></div>
        <p>${esc(rec.subject)}</p>${attErr ? `<div class="notice err">บันทึกรายการแล้ว แต่แนบไฟล์ไม่สำเร็จ: ${esc(attErr)} (แนบเพิ่มได้โดยกดแก้ไขรายการ)</div>` : ''}
        <div class="row" style="justify-content:flex-end"><a class="btn" href="#/list/${kind}" data-c>ดูทะเบียน</a><button class="btn primary" data-n>เพิ่มรายการต่อไป</button></div>`, { small: true, onClose: () => { location.hash = '#/list/' + kind; } });
      $('[data-c]', mm.el).onclick = () => mm.el.parentElement.remove();
      $('[data-n]', mm.el).onclick = () => { mm.el.parentElement.remove(); route(true); };
    } catch (e) { toast(e.message, 'err', 7000); $('#msg').textContent = ''; saving = false; $('#save').disabled = false; }
  };
}

/* ---------- อ่านตัวอักษรจากรูป (OCR) ทำงานในเครื่องนี้ ไม่ใช้อินเทอร์เน็ต ---------- */
let ocrWorkerP = null, ocrProgress = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดตัวอ่านรูปไม่สำเร็จ')); document.head.append(s); }); }
function getOcrWorker() {
  if (!ocrWorkerP) ocrWorkerP = (async () => {
    if (!window.Tesseract) await loadScript('/ocr/tesseract.min.js');
    return Tesseract.createWorker('tha', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/', langPath: '/ocr/lang', workerBlobURL: false, cacheMethod: 'none', logger: x => ocrProgress && ocrProgress(x) });
  })().catch(e => { ocrWorkerP = null; throw e; });
  return ocrWorkerP;
}
// เตรียมรูป: หมุนตามกล้อง ขยายให้ตัวหนังสือใหญ่พอ ทำเป็นขาวดำ เพิ่มความคม
async function prepImage(file) {
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bmp = await createImageBitmap(file); }
  const long = Math.max(bmp.width, bmp.height); const sc = long < 2200 ? Math.min(3, 2400 / long) : long > 3600 ? 3200 / long : 1;
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.filter = 'grayscale(1) contrast(1.35)'; g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
async function ocrImage(file, prog) {
  const TH = { 'loading tesseract core': 'กำลังเตรียมตัวอ่าน…', 'initializing tesseract': 'กำลังเตรียมตัวอ่าน…', 'loading language traineddata': 'กำลังโหลดภาษาไทย…', 'initializing api': 'กำลังเตรียมตัวอ่าน…', 'recognizing text': 'กำลังอ่านรูป…' };
  ocrProgress = x => prog((TH[x.status] || 'กำลังเตรียม…') + (x.status === 'recognizing text' ? ` ${Math.round(x.progress * 100)}%` : ''), x.status === 'recognizing text' ? x.progress : 0.05, x.status === 'recognizing text' ? 'รูปใหญ่/ตัวหนังสือเยอะ อาจใช้เวลา 10–30 วินาที' : undefined);
  prog('กำลังเตรียมรูป…', 0.02);
  const canvas = await prepImage(file);
  const w = await getOcrWorker();
  const r = await w.recognize(canvas, {}, { text: true, blocks: true });
  let text = r.data.text || '';
  try { prog('กำลังตรวจตัวเลขไทย…', 1); const fx = await fixThaiDigits(r.data.blocks, canvas); if (fx && fx.text.trim()) text = fx.text; } catch (e) { console.warn('ตรวจตัวเลขไม่สำเร็จ', e); }
  return text;
}
document.addEventListener('paste', e => { if (window.__ocrPaste && $('#ocrbox')) window.__ocrPaste(e); });

/* ---------- อ่านไฟล์ PDF (หนังสืออิเล็กทรอนิกส์) ด้วย pdf.js ในเครื่อง ---------- */
let pdfjsP = null;
function getPdfjs() {
  if (!pdfjsP) pdfjsP = import('/pdfjs/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'; return m; }).catch(e => { pdfjsP = null; throw new Error('โหลดตัวอ่าน PDF ไม่สำเร็จ'); });
  return pdfjsP;
}
// PDF จาก Word + ฟอนต์ TH Sarabun มักเก็บสระบน/วรรณยุกต์เป็นรหัสพิเศษ (U+F700–F71A) -> แปลงกลับเป็นอักษรไทยปกติ
const THAI_PUA = { '': 'ฐ', '': 'ิ', '': 'ี', '': 'ึ', '': 'ื', '': '่', '': '้', '': '๊', '': '๋', '': '์',
  '': '่', '': '้', '': '๊', '': '๋', '': '์', '': 'ญ', '': 'ั', '': 'ํ', '': '็', '': '่', '': '้', '': '๊', '': '๋', '': '์', '': 'ุ', '': 'ู', '': 'ฺ' };
const fixThaiPua = s => s.replace(/[-]/g, c => THAI_PUA[c] || '');
// คืน { text } ถ้า PDF มีตัวอักษร หรือ { canvas } (ภาพหน้าแรก) ถ้าเป็น PDF สแกน + thumb ภาพย่อหน้าแรก
async function readPdf(file) {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const render = async longSide => { const v0 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: longSide / Math.max(v0.width, v0.height) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise; return c; };
  const thumb = (await render(300)).toDataURL('image/png');
  const tc = await page.getTextContent();
  const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 10 }));
  const page2400 = () => render(2400);
  if (items.reduce((n, i) => n + i.s.replace(/\s/g, '').length, 0) < 30) return { canvas: await page2400(), thumb };   // แทบไม่มีตัวอักษร = PDF สแกน
  // รวมเป็นบรรทัดตามตำแหน่งแนวตั้ง แล้วเรียงซ้าย->ขวา
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) { const ln = lines.find(l => Math.abs(l.y - it.y) < Math.min(l.h, it.h) * 0.5); if (ln) ln.items.push(it); else lines.push({ y: it.y, h: it.h, items: [it] }); }
  const text = lines.sort((a, b) => b.y - a.y).map(l => { l.items.sort((a, b) => a.x - b.x); let out = '', end = null;
    for (const it of l.items) { if (end !== null && it.x - end > it.h * 0.18) out += ' '; out += it.s; end = it.x + it.w; } return out; }).join('\n');
  return { text: fixThaiPua(text), thumb, page2400 };
}

/* ---------- ตารางรายการ + ค้นหา ---------- */
async function viewList(kind) {
  const isAll = kind === 'all';
  const m = shell(isAll ? 'search' : 'list/' + kind);
  const counters = await api('/api/counters'); const years = [...new Set(counters.map(c => c.year))].sort((a, b) => b - a);
  const F = { q: '', year: '', month: '', status: '', sort: 'reg', dir: 'desc', page: 1, kind: isAll ? '' : kind };
  const sel = new Set();
  m.innerHTML = header(isAll ? 'ค้นหาหนังสือ' : 'ทะเบียน' + KIND[kind], isAll ? '' : `<a class="btn primary" href="#/new/${kind}">＋ เพิ่ม${KIND[kind]}</a>`) + `
    <div class="card"><div class="row">
      <div class="grow" style="min-width:260px"><input type="search" id="q" class="ink" placeholder="พิมพ์เพื่อค้นหา: เลขทะเบียน / เลขที่หนังสือ / เรื่อง / หน่วยงาน / ชื่อผู้ส่ง-ผู้รับ" autofocus></div>
      ${isAll ? `<select id="kind" style="width:150px"><option value="">รับ+ส่ง ทั้งหมด</option><option value="in">หนังสือรับ</option><option value="out">หนังสือส่ง</option></select>` : ''}
      <select id="year" style="width:140px"><option value="">ทุกปี</option>${years.map(y => `<option value="${y}">พ.ศ. ${y}</option>`).join('')}</select>
      <select id="month" style="width:150px"><option value="">ทุกเดือน</option>${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select>
      <select id="status" style="width:150px"><option value="">ทุกสถานะ</option><option value="active">ใช้งาน</option><option value="cancelled">ยกเลิกแล้ว</option></select>
      <select id="sort" style="width:190px"><option value="reg:desc">เลขทะเบียน (ใหม่→เก่า)</option><option value="reg:asc">เลขทะเบียน (เก่า→ใหม่)</option><option value="date:desc">ลงวันที่ (ใหม่→เก่า)</option><option value="date:asc">ลงวันที่ (เก่า→ใหม่)</option></select></div>
      <div class="row" style="margin-top:10px"><span id="count" class="muted"></span><span class="grow"></span>
        <button class="btn sm" id="prSel" disabled>🖨️ พิมพ์ที่เลือก</button><button class="btn sm" id="prAll">🖨️ พิมพ์/ส่งออกตามตัวกรองนี้</button><button class="btn sm" id="xlAll">📊 ส่งออก Excel ทั้งหมด</button></div></div>
    <div class="tw"><table class="t"><thead><tr><th><input type="checkbox" id="selAll" aria-label="เลือกทั้งหมด"></th>${isAll ? '<th>ประเภท</th>' : ''}<th>เลขทะเบียน</th><th>ที่</th><th>ลงวันที่</th><th>จาก</th><th>ถึง</th><th>เรื่อง</th><th>การปฏิบัติ</th><th>หมายเหตุ</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="pager" id="pager"></div>`;
  $('#xlAll').onclick = downloadAllXlsx;
  let seq = 0;
  async function load() {
    const my = ++seq;
    const r = await api('/api/books?' + qs({ ...F, limit: 50 }));
    if (my !== seq || !m.isConnected) return;   // ผู้ใช้เปลี่ยนหน้าไปแล้ว
    $('#count').textContent = `พบ ${r.total} รายการ`;
    $('#rows').innerHTML = r.rows.length ? r.rows.map(b => `<tr class="click ${b.status}" data-id="${b.id}"><td class="nostrike"><input type="checkbox" data-sel="${b.id}" ${sel.has(b.id) ? 'checked' : ''}></td>
      ${isAll ? `<td class="nostrike"><span class="tag ${b.kind}">${b.kind === 'in' ? 'รับ' : 'ส่ง'}</span></td>` : ''}
      <td class="regno nostrike">${esc(b.reg_label)}${b.status === 'cancelled' ? ' <span class="tag x">ยกเลิก</span>' : ''}</td><td class="ink">${esc(b.book_no)}</td><td class="ink" style="white-space:nowrap">${fmtDate(b.book_date)}</td>
      <td class="ink">${esc(b.from_org)}</td><td class="ink">${esc(b.to_org)}</td><td class="ink">${urgTag(b.urgency)}${esc(b.subject)}${dueTag(b)}</td><td class="ink">${esc(b.action)}</td><td class="ink">${esc(b.remark)}</td>
      <td class="nostrike">${b.att_count ? '📎' : ''}${b.has_sender_sig || b.has_receiver_sig ? '✍️' : ''}</td></tr>`).join('') : `<tr><td colspan="12" class="muted" style="text-align:center;padding:30px">ไม่พบรายการ</td></tr>`;
    $$('#rows tr.click').forEach(tr => tr.onclick = e => { if (e.target.matches('input')) return; openDetail(+tr.dataset.id); });
    $$('[data-sel]').forEach(c => c.onchange = () => { c.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); syncSel(); });
    $('#pager').innerHTML = r.pages > 1 ? `<button class="btn sm" ${F.page <= 1 ? 'disabled' : ''} data-p="${F.page - 1}">‹ ก่อนหน้า</button><span>หน้า ${F.page} / ${r.pages}</span><button class="btn sm" ${F.page >= r.pages ? 'disabled' : ''} data-p="${F.page + 1}">ถัดไป ›</button>` : '';
    $$('#pager [data-p]').forEach(b => b.onclick = () => { F.page = +b.dataset.p; load(); });
    $('#selAll').checked = false;
  }
  function syncSel() { $('#prSel').disabled = !sel.size; $('#prSel').textContent = `🖨️ พิมพ์ที่เลือก${sel.size ? ' (' + sel.size + ')' : ''}`; }
  const refresh = () => { F.page = 1; load().catch(e => toast(e.message, 'err')); };
  $('#q').addEventListener('input', debounce(() => { F.q = $('#q').value; refresh(); }, 180));
  for (const id of ['year', 'month', 'status']) $('#' + id).onchange = () => { F[id] = $('#' + id).value; refresh(); };
  if (isAll) $('#kind').onchange = () => { F.kind = $('#kind').value; refresh(); };
  $('#sort').onchange = () => { [F.sort, F.dir] = $('#sort').value.split(':'); refresh(); };
  $('#selAll').onchange = e => { $$('[data-sel]').forEach(c => { c.checked = e.target.checked; e.target.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); }); syncSel(); };
  $('#prSel').onclick = () => { const k = isAll ? 'in' : kind; location.hash = `#/reports?${qs({ kind: k, scope: 'selected', ids: [...sel].join(',') })}`; };
  $('#prAll').onclick = () => {
    const k = isAll ? (F.kind || 'in') : kind;
    const scope = F.year && F.month ? 'month' : F.year ? 'year' : 'all';
    location.hash = `#/reports?${qs({ kind: k, scope, year: F.year, month: F.month })}`;
  };
  load().catch(e => toast(e.message, 'err'));
}

/* ---------- รายละเอียดรายการ ---------- */
const ACT = { done: 'ทำเสร็จแล้ว', undone: 'เปลี่ยนเป็นยังไม่เสร็จ', create: 'สร้างรายการ', update: 'แก้ไขข้อมูล', cancel: 'ยกเลิกรายการ', attach_add: 'แนบไฟล์', attach_remove: 'ลบไฟล์แนบ' };
const FL = { urgency: 'ชั้นความเร็ว', due_date: 'ต้องดำเนินการภายใน', book_no: 'ที่', book_date: 'ลงวันที่', from_org: 'จาก', to_org: 'ถึง', subject: 'เรื่อง', action: 'การปฏิบัติ', remark: 'หมายเหตุ', sender_name: 'ผู้ส่ง', receiver_name: 'ผู้รับ', sender_at: 'วันเวลาส่ง', receiver_at: 'วันเวลารับ', sender_sig: 'ลายเซ็นผู้ส่ง', receiver_sig: 'ลายเซ็นผู้รับ' };
function histText(h) {
  const c = h.changes || {};
  if (h.action === 'update') return Object.entries(c).map(([k, [a, b]]) => `${FL[k] || k}: “${esc(a || '-')}” → “${esc(b || '-')}”`).join('<br>');
  if (h.action === 'cancel') return 'เหตุผล: ' + esc(c.reason);
  if (h.action.startsWith('attach')) return esc(c.filename);
  return h.action === 'create' ? 'เลขทะเบียน ' + esc(c.reg_label) : '';
}
async function openDetail(id) {
  let b; try { b = await api('/api/books/id/' + id); } catch (e) { toast(e.message, 'err'); return; }
  const isIn = b.kind === 'in'; const cancelled = b.status === 'cancelled';
  const sig = (who, name, at) => `<div class="sigbox"><h3>ผู้รับหนังสือ</h3><div class="ink">${esc(shortName(name)) || '<span class="muted">-</span>'}</div><div class="muted">${at ? fmtDT(at) : ''}</div></div>`;
  const m = modal(`<div class="row"><h2 class="grow">${isIn ? 'หนังสือรับ' : 'หนังสือส่ง'} เลขทะเบียน ${esc(b.reg_label)} ${cancelled ? '<span class="tag x">ยกเลิก</span>' : ''}</h2></div>
    ${cancelled ? `<div class="notice err">ยกเลิกเมื่อ ${fmtStamp(b.cancelled_at)} — เหตุผล: ${esc(b.cancel_reason)} (เลขทะเบียนนี้ถูกเก็บไว้ ไม่นำกลับมาใช้ใหม่)</div>` : ''}
    <dl class="kv ink"><dt>ที่</dt><dd>${esc(b.book_no) || '-'}</dd><dt>ลงวันที่</dt><dd>${fmtDate(b.book_date)}</dd><dt>วันที่ลงทะเบียน</dt><dd>${fmtDate(b.reg_date)}</dd>
      <dt>จาก</dt><dd>${esc(b.from_org) || '-'}</dd><dt>ถึง</dt><dd>${esc(b.to_org) || '-'}</dd><dt>เรื่อง</dt><dd>${esc(b.subject)}</dd><dt>การปฏิบัติ</dt><dd>${esc(b.action) || '-'}</dd><dt>หมายเหตุ</dt><dd>${esc(b.remark) || '-'}</dd></dl>
    ${b.urgency || b.due_date ? `<div class="duebox">${urgTag(b.urgency)}${b.due_date ? `<span>ต้องดำเนินการภายใน <b>${fmtDate(b.due_date)}</b></span>${b.done_at ? `<span class="lvtag lv-done">✓ สำเร็จแล้ว ${fmtStamp(b.done_at)}${b.done_by ? ' · ' + esc(shortName(b.done_by)) : ''}</span>` : (cancelled ? '' : `<span class="lvtag lv-${dueInfo(b.due_date).lvl}">⏰ ${dueInfo(b.due_date).label}</span>`)}` : ''}
      <span class="grow"></span>${!cancelled && b.due_date ? (b.done_at ? '<button class="btn sm" data-undone>เปลี่ยนเป็นยังไม่เสร็จ</button>' : '<button class="btn sm okbtn" data-done>✓ สำเร็จแล้ว</button>') : ''}</div>` : ''}
    <div style="margin:12px 0">${sig('receiver', b.receiver_name, b.receiver_at)}</div>
    <h2>ไฟล์แนบ</h2>${b.attachments.length ? b.attachments.map(a => `<div class="att"><a href="/api/attachments/${a.id}" target="_blank">📎 ${esc(a.filename)}</a><small class="muted">${fmtSize(a.size)}</small></div>`).join('') : '<p class="muted">ไม่มี</p>'}
    <h2 style="margin-top:12px">ประวัติการแก้ไข</h2><ul class="hist">${b.history.map(h => `<li><b>${ACT[h.action] || h.action}</b> <small class="muted">${fmtStamp(h.at)}${h.actor ? ' · โดย ' + esc(h.actor) : ''}</small><div>${histText(h)}</div></li>`).join('')}</ul>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-close>ปิด</button><a class="btn" data-print href="#/reports?${qs({ kind: b.kind, scope: 'selected', ids: b.id })}">🖨️ พิมพ์รายการนี้</a>
      ${cancelled ? '' : `<button class="btn danger" data-cancel>ยกเลิกรายการ</button><a class="btn primary" data-edit href="#/edit/${b.id}">✏️ แก้ไข</a>`}</div>`);
  $('[data-close]', m.el).onclick = m.close;
  for (const [sel, path, msg] of [['[data-done]', 'done', 'ทำเครื่องหมายว่าสำเร็จแล้ว'], ['[data-undone]', 'undone', 'เปลี่ยนเป็นยังไม่เสร็จแล้ว']]) {
    const bt = $(sel, m.el); if (bt) bt.onclick = async () => { try { await api(`/api/books/id/${b.id}/${path}`, { method: 'POST' }); toast(msg, 'ok'); m.close(); route(); } catch (e) { toast(e.message, 'err'); } };
  }
  for (const a of $$('[data-print],[data-edit]', m.el)) a.addEventListener('click', () => m.close());
  const cb = $('[data-cancel]', m.el);
  if (cb) cb.onclick = async () => {
    const why = await promptBox('ยกเลิกรายการ ' + b.reg_label, 'เหตุผลการยกเลิก (เลขทะเบียนจะยังคงอยู่ ไม่ถูกนำกลับมาใช้ใหม่)', 'ยืนยันยกเลิกรายการ');
    if (!why) return;
    try { await api(`/api/books/id/${b.id}/cancel`, { json: { reason: why } }); toast('ยกเลิกรายการแล้ว (เก็บเลขทะเบียนและประวัติไว้)', 'ok'); m.close(); route(true); } catch (e) { toast(e.message, 'err'); }
  };
}

/* ---------- รายงาน / พิมพ์ / ส่งออก ---------- */
async function viewReports(params) {
  const m = shell('reports'); const counters = await api('/api/counters');
  const years = [...new Set(counters.map(c => c.year))].sort((a, b) => b - a);
  const cur = S.st.year; const mon = new Date().getMonth() + 1;
  const P = { kind: params.kind === 'out' ? 'out' : 'in', scope: params.scope || (params.ids ? 'selected' : 'all'), year: params.year || cur, month: params.month || mon, ids: params.ids || '' };
  m.innerHTML = header('รายงานและส่งออก') + fontWarning() + `<div class="card"><form id="rf">
    <div class="grid g2"><div><label class="f">ประเภททะเบียน</label><div class="seg" id="kindseg"><label><input type="radio" name="kind" value="in">ทะเบียนหนังสือรับ</label><label><input type="radio" name="kind" value="out">ทะเบียนหนังสือส่ง</label></div></div>
      <div><label class="f">การแบ่งหน้า</label><div class="seg"><label><input type="radio" name="pageBy" value="continuous" checked>ต่อเนื่อง (ประหยัดกระดาษ)</label><label><input type="radio" name="pageBy" value="day">หน้าละวัน</label></div></div>
      <div><label class="f">สี</label><div class="seg"><label><input type="radio" name="color" value="0" checked>ขาวดำ (ตัวอักษรสีดำ)</label><label><input type="radio" name="color" value="1">สี (ข้อมูลสีน้ำเงินหมึกปากกา)</label></div></div></div>
    <div class="field" style="margin-top:12px"><label class="f">ขอบเขตรายการ</label><div class="seg" id="scopeseg">
      <label><input type="radio" name="scope" value="month">รายการประจำเดือน</label><label><input type="radio" name="scope" value="year">รายการประจำปี</label><label><input type="radio" name="scope" value="all">ทั้งหมด</label>
      <label><input type="radio" name="scope" value="range">กำหนดช่วงวันที่เอง</label><label><input type="radio" name="scope" value="selected">เฉพาะรายการที่เลือก${P.ids ? ' (' + P.ids.split(',').length + ')' : ''}</label></div></div>
    <div class="row" id="scopeopts"><select id="year" style="width:150px">${years.map(y => `<option value="${y}">พ.ศ. ${y}</option>`).join('')}</select>
      <select id="month" style="width:160px">${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select>
      <span id="rng" class="row"><span>ตั้งแต่</span><span id="rf_from"></span><span>ถึง</span><span id="rf_to"></span></span></div>
    <div class="row" style="margin-top:8px"><label><input type="checkbox" id="cancelled" checked> รวมรายการที่ยกเลิก (แสดงเพื่อให้เลขทะเบียนต่อเนื่อง)</label>
      <label><input type="checkbox" id="headerDate"> เติม "วันที่ เดือน พ.ศ." ที่หัวกระดาษให้อัตโนมัติ (ค่าตั้งต้น: เว้นว่างไว้เขียนเอง)</label>
      <label id="fromLbl"><input type="checkbox" id="withFrom"> แสดงคอลัมน์ "จาก" ในทะเบียนส่ง</label></div>
    <div class="row" style="margin-top:14px"><button type="button" class="btn primary big" id="prev">👁️ ดูตัวอย่างก่อนพิมพ์</button><button type="button" class="btn big" id="print" disabled>🖨️ พิมพ์</button>
      <span class="grow"></span><button type="button" class="btn" id="dlpdf">⬇ PDF</button><button type="button" class="btn" id="dlx">⬇ Excel (.xlsx)</button><button type="button" class="btn" id="dlc">⬇ CSV</button></div></form></div>
    <div class="card" id="pvcard" hidden><div class="row"><h2 class="grow">ตัวอย่างก่อนพิมพ์ (A4 แนวนอน)</h2><small class="muted">ถ้าไม่เห็นปุ่มพิมพ์ ให้ใช้ปุ่ม 🖨️ ในกรอบด้านล่าง หรือกด Ctrl+P</small></div><iframe class="preview" id="pv" title="ตัวอย่างก่อนพิมพ์"></iframe></div>`;
  const from = thaiDatePicker(''), to = thaiDatePicker(''); $('#rf_from').append(from.el); $('#rf_to').append(to.el);
  $(`input[name=kind][value=${P.kind}]`).checked = true; $(`input[name=scope][value=${P.scope}]`).checked = true;
  $('#year').value = P.year; $('#month').value = P.month;
  if (!P.ids) $('input[name=scope][value=selected]').closest('label').hidden = true;
  const val = n => $(`input[name=${n}]:checked`).value;
  function q(extra = {}) {
    const scope = val('scope');
    return qs({ kind: val('kind'), scope, year: scope === 'month' || scope === 'year' ? $('#year').value : '', month: scope === 'month' ? $('#month').value : '',
      from: scope === 'range' ? from.get() : '', to: scope === 'range' ? to.get() : '', ids: scope === 'selected' ? P.ids : '',
      color: val('color'), pageBy: val('pageBy'), headerDate: $('#headerDate').checked ? '1' : '0', cancelled: $('#cancelled').checked ? '1' : '0', withFrom: $('#withFrom').checked ? '1' : '0', ...extra });
  }
  function sync() {
    const sc = val('scope');
    $('#year').hidden = !(sc === 'month' || sc === 'year'); $('#month').hidden = sc !== 'month'; $('#rng').hidden = sc !== 'range';
    $('#fromLbl').hidden = val('kind') !== 'out';
    $('#print').disabled = true;      // เปลี่ยนตัวเลือกแล้วต้องดูตัวอย่างใหม่ก่อนพิมพ์
  }
  $('#rf').addEventListener('change', sync); sync();
  let blobUrl = '';
  async function preview() {
    if (val('scope') === 'range' && (!from.get() || !to.get())) { toast('กรุณาระบุช่วงวันที่ให้ครบ', 'err'); return false; }
    try {
      const r = await fetch('/api/export/pdf?' + q(), { credentials: 'same-origin' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'สร้างตัวอย่างไม่สำเร็จ'); }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(await r.blob()); $('#pvcard').hidden = false; $('#pv').src = blobUrl; $('#print').disabled = false;
      $('#pvcard').scrollIntoView({ behavior: 'smooth' }); return true;
    } catch (e) { toast(e.message, 'err', 8000); return false; }
  }
  $('#prev').onclick = preview;
  $('#print').onclick = () => { api('/api/activity/print', { json: { query: q() } }).catch(() => {}); try { $('#pv').contentWindow.focus(); $('#pv').contentWindow.print(); } catch { window.open(blobUrl, '_blank'); } };
  const dl = (fmt, extra) => () => {
    if (val('scope') === 'range' && (!from.get() || !to.get())) { toast('กรุณาระบุช่วงวันที่ให้ครบ', 'err'); return; }
    fetch(`/api/export/${fmt}?` + q({ download: '1' }), { credentials: 'same-origin' }).then(async r => {
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'ส่งออกไม่สำเร็จ'); }
      const cd = r.headers.get('content-disposition') || ''; const nm = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(cd) || [])[1] || 'export.' + fmt);
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = nm; document.body.append(a); a.click(); a.remove(); toast('ส่งออกไฟล์ ' + nm + ' แล้ว', 'ok');
    }).catch(e => toast(e.message, 'err', 8000));
    void extra;
  };
  $('#dlpdf').onclick = dl('pdf'); $('#dlx').onclick = dl('xlsx'); $('#dlc').onclick = dl('csv');
  if (params.ids || params.auto) preview();   // เปิดจากปุ่มลัด: แสดงตัวอย่างทันที
}

/* ---------- ตั้งค่า ---------- */
async function viewSettings() {
  const m = shell('settings'); await loadState(); const s = S.st.settings, f = S.st.fonts;
  const counters = await api('/api/counters'); const cy = S.st.year;
  const fontRow = (k, label) => `<div class="field"><label class="f">${label}</label>${f[k] ? `<div class="notice ok">ใช้ไฟล์: <b>${esc(f[k].file)}</b> — ชื่อฟอนต์จากไฟล์: <b>${esc(f[k].full || f[k].family)}</b> (${fmtSize(f[k].size)})</div>` : '<div class="notice warn">ยังไม่ได้นำเข้า</div>'}
    <div class="row"><input type="file" data-font="${k}" accept=".ttf,.otf,.woff"><button class="btn sm danger" data-fontdel="${k}" ${f[k] ? '' : 'hidden'}>ลบฟอนต์</button></div></div>`;
  const fresh = s.fresh_start === '1' ? `<div class="card fresh"><h2>${ic('sliders')} เริ่มต้นใหม่แล้ว — ตั้งค่าหน่วยใหม่ตามนี้</h2><ol>
      <li><b>ผู้เข้าเวร</b>: หัวข้อ หน่วยที่ประจำ และรายชื่อ (ด้านล่าง)</li><li><b>ตัวนำหน้า "ที่"</b> และ <b>จาก / ถึง</b> ของหน่วยใหม่</li>
      <li><b>ข้อมูลหน่วยงาน</b> ชื่อหน่วย / โลโก้</li><li><b>ต่อเลขจากสมุด</b> ถ้ามีสมุดทะเบียนเดิม (การ์ดเลขทะเบียน)</li>
      <li><b>โฟลเดอร์เก็บหนังสือ</b> เลือกโฟลเดอร์ใหม่ที่หน้า <a href="#/backup">สำรองข้อมูล</a> (โฟลเดอร์ของชุดเดิมโปรแกรมจะไม่แตะ)</li><li><b>รหัสผ่าน</b> (ถ้าต้องการ)</li></ol>
      <p class="muted" style="margin:0">ทำเสร็จแล้วกด <b>บันทึกการตั้งค่า</b> ข้อความนี้จะหายไป</p></div>` : '';
  m.innerHTML = header('ตั้งค่าระบบ') + fontWarning() + fresh + `
  <div class="card"><h2>ผู้เข้าเวร (หน้าแรก)</h2><div class="grid g2">
    <div class="field"><label class="f">หัวข้อหน้าแรก</label><input type="text" id="duty_title" value="${esc(s.duty_title)}"></div>
    <div class="field"><label class="f">หน่วยที่ประจำ</label><input type="text" id="duty_unit" value="${esc(s.duty_unit)}"></div></div>
    <div class="field"><label class="f">รายชื่อผู้เข้าเวร <small>(ชื่อเต็ม · ตอนพิมพ์ทะเบียนจะใช้แค่ยศ+ชื่อ)</small></label><div id="duty_officers"></div></div></div>
  <div class="card"><h2>ตัวนำหน้า "ที่" (เลขที่หนังสือ)</h2>
    <div class="field"><label class="f">รายการตัวนำหน้า <small>(ลงท้ายด้วย / · ★ = ค่าหลัก · ตอนกรอกพิมพ์แค่เลขหลัง /)</small></label><div id="book_no_prefixes"></div></div>
    <p class="muted" style="font-size:.9rem;margin:0">ตัวอย่าง: <b>นร ๕๑๑๙.๑ (ร้อย ฉก.ตชด.๔๔๔)๘๔/</b> แล้วพิมพ์ ๑๕๐๔ → ได้ "นร ๕๑๑๙.๑ (ร้อย ฉก.ตชด.๔๔๔)๘๔/๑๕๐๔"</p></div>
  <div class="card"><h2>ค่าตั้งต้นช่อง "จาก" / "ถึง"</h2><div class="grid g2">
    <div class="field"><label class="f">จาก <small>(★ = ค่าหลัก)</small></label><div id="from_options"></div></div>
    <div class="field"><label class="f">ถึง <small>(★ = ค่าหลัก)</small></label><div id="to_options"></div></div></div>
    <p class="muted" style="font-size:.9rem">ทะเบียนรับ: ใส่ "จาก" และ "ถึง" ตามลำดับ · ทะเบียนส่ง: สลับกันอัตโนมัติ (จาก = ถึงหลัก, ถึง = จากหลัก) แก้ไขเฉพาะรายการได้ตอนกรอก</p></div>
  <div class="card"><h2>ข้อมูลหน่วยงาน</h2><div class="grid g2">
    <div class="field"><label class="f">ชื่อหน่วยงาน</label><input type="text" id="org_name" class="ink" value="${esc(s.org_name)}"></div>
    <div class="field"><label class="f">ชื่อส่วนราชการ</label><input type="text" id="dept_name" class="ink" value="${esc(s.dept_name)}"></div></div>
    <div class="field"><label class="f">โลโก้หน่วยงาน (PNG/JPG ไม่เกิน 2 MB)</label>${s.logo ? '<img src="/api/logo?' + Date.now() + '" style="height:60px;display:block;margin-bottom:6px" alt="">' : ''}
      <div class="row"><input type="file" id="logo" accept=".png,.jpg,.jpeg"><button class="btn sm danger" id="logodel" ${s.logo ? '' : 'hidden'}>ลบโลโก้</button></div></div></div>
  <div class="card"><h2>เลขทะเบียน</h2>
    <div class="carrybox"><b>${ic('book')} ต่อเลขจากสมุดทะเบียนเล่มเดิม</b>
      <div class="muted" style="font-size:.92rem;margin:2px 0 8px">ใส่เลขทะเบียน<b>ตัวสุดท้าย</b>ที่เขียนในสมุด ปี ${cy} โปรแกรมจะเริ่มเลขถัดไปต่อให้ (เว้นช่องว่างได้ถ้าไม่ต้องการตั้ง)</div>
      <div class="row"><label class="carry-f">ทะเบียนรับ ถึงเลข <input type="number" id="cIn" min="1" placeholder="เช่น 50"></label>
        <label class="carry-f">ทะเบียนส่ง ถึงเลข <input type="number" id="cOut" min="1" placeholder="เช่น 43"></label>
        <button class="btn primary" id="cGo">${ic('save')} ต่อเลขจากสมุด</button></div></div>
    <div class="grid g3">
    <div class="field"><label class="f">ปี พ.ศ. ที่ใช้ออกเลข</label><select id="year_mode"><option value="fiscal">ปีงบประมาณ (เริ่ม 1 ต.ค. เช่น ต.ค. 2569 = 2570)</option><option value="auto">ปีปฏิทิน (ตามวันที่ของเครื่อง)</option><option value="manual">กำหนดปีเอง</option></select>
      <input type="number" id="year_val" placeholder="เช่น 2569" style="margin-top:6px" hidden></div>
    <div class="field"><label class="f">รูปแบบเลขทะเบียน <small>({no}=ลำดับ {year}=ปี พ.ศ.)</small></label><input type="text" id="reg_format" value="${esc(s.reg_format)}"></div>
    <div class="field"><label class="f">จำนวนหลักของลำดับ</label><input type="number" id="reg_pad" min="0" max="8" value="${esc(s.reg_pad)}"></div>
    <div class="field"><label class="f">เลขเริ่มต้นทะเบียนรับ (ปีใหม่)</label><input type="number" id="start_in" min="1" value="${esc(s.start_in)}"></div>
    <div class="field"><label class="f">เลขเริ่มต้นทะเบียนส่ง (ปีใหม่)</label><input type="number" id="start_out" min="1" value="${esc(s.start_out)}"></div></div>
    <h2 style="margin-top:8px">เลขถัดไปของแต่ละชุด</h2>
    <div class="tw" style="max-height:none"><table class="t"><thead><tr><th>ชุดเลข</th><th>ปี พ.ศ.</th><th>เลขถัดไป</th><th>ตั้งเลขถัดไปใหม่</th></tr></thead><tbody>${counters.map(c => `<tr><td>${c.kind === 'in' ? 'ทะเบียนรับ' : 'ทะเบียนส่ง'}</td><td>${c.year}</td><td class="regno">${esc(c.next_label)}</td>
      <td><div class="row"><input type="number" min="1" style="width:110px" data-nk="${c.kind}" data-ny="${c.year}" value="${c.next_no}"><button class="btn sm" data-setnext="${c.kind}:${c.year}">ตั้งค่า</button></div></td></tr>`).join('')}</tbody></table></div>
    <p class="muted">ตั้งเลขถัดไปได้เฉพาะเลขที่สูงกว่าเลขที่เคยใช้แล้ว (รวมรายการที่ยกเลิก) เพื่อป้องกันเลขซ้ำ — เมื่อขึ้นปีใหม่ เลขจะเริ่มต้นใหม่ตามเลขเริ่มต้นข้างต้น</p></div>
  <div class="card"><h2>ฟอนต์และขนาดตัวอักษรบนหน้าจอ</h2><p class="muted" style="margin-top:-4px">ใช้แสดงผลบนหน้าจอเท่านั้น (ฝังในโปรแกรม ไม่ต้องติดตั้ง) · การพิมพ์ทะเบียน/PDF ยังใช้ TH Sarabun ตามแบบฟอร์มราชการ · เลือกแล้วเห็นผลทันที</p>
    <div class="fontpick">${UI_FONTS.filter(x => x.id !== 'register' || f.regular).map(x => `<label class="fp"><input type="radio" name="ui_font" value="${x.id}" ${(s.ui_font || 'plex') === x.id ? 'checked' : ''}>
      <span class="fp-head"><b>${x.label}</b>${x.tag ? `<span class="le-badge">${x.tag}</span>` : ''}</span>
      <span class="fp-sample" style="font-family:${x.css},sans-serif;font-size:${(x.base / 17).toFixed(2)}em">ทะเบียนหนังสือรับ ที่ นร ๕๑๑๙.๑/๑๕๐๔ ลงวันที่ ๑๗ พ.ย. ๒๕๖๙</span>
      <small class="muted">${x.note}</small></label>`).join('')}</div>
    <div class="field" style="margin-top:14px"><label class="f">ขนาดตัวอักษร</label><div class="seg">${UI_SCALES.map(([v, t]) => `<label><input type="radio" name="ui_scale" value="${v}" ${(s.ui_scale || '100') === v ? 'checked' : ''}>${t}</label>`).join('')}</div></div></div>
  <div class="card"><h2>ฟอนต์สำหรับพิมพ์ (TH Sarabun) และสีตัวอักษร</h2>
    ${fontRow('regular', 'ไฟล์ฟอนต์ปกติ (เช่น THSarabunNew.ttf)')}${fontRow('bold', 'ไฟล์ฟอนต์ตัวหนา (เช่น THSarabunNew Bold.ttf — ไม่บังคับ)')}
    <div class="grid g2"><div class="field"><label class="f">ขนาดตัวอักษรเมื่อพิมพ์ (pt)</label><input type="number" id="print_font_size" min="8" max="24" value="${esc(s.print_font_size)}"></div>
      <div class="field"><label class="f">สีตัวอักษรข้อมูลที่กรอก</label><div class="row"><input type="color" id="data_color" value="${esc(s.data_color)}" style="width:60px;padding:2px"><span class="muted">ค่าตั้งต้น #174EA6 (น้ำเงินหมึกปากกา)</span></div></div></div></div>
  <div class="card"><h2>ความปลอดภัย</h2><p class="muted">${S.st.has_password ? 'ตั้งรหัสผ่านเข้าใช้งานไว้แล้ว' : 'ยังไม่ได้ตั้งรหัสผ่านเข้าใช้งาน (แนะนำให้ตั้ง โดยเฉพาะเมื่อให้เครื่องอื่นใช้งานร่วมกัน)'}</p>
    <div class="grid g3">${S.st.has_password ? '<div class="field"><label class="f">รหัสผ่านปัจจุบัน</label><input type="password" id="pw_cur" autocomplete="off"></div>' : ''}
    <div class="field"><label class="f">${S.st.has_password ? 'รหัสผ่านใหม่' : 'ตั้งรหัสผ่าน'} <small>(อย่างน้อย 4 ตัว)</small></label><input type="password" id="pw_new" autocomplete="new-password"></div>
    <div class="field"><label class="f">พิมพ์รหัสผ่านอีกครั้ง</label><input type="password" id="pw_new2" autocomplete="new-password"></div></div>
    <div class="row"><button class="btn primary" id="pw_save">${ic('save')} ${S.st.has_password ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}</button>${S.st.has_password ? '<button class="btn danger" id="pw_del">ลบรหัสผ่าน (เข้าได้โดยไม่ต้องใช้รหัส)</button>' : ''}</div>
    <div class="notice warn" style="margin-top:12px"><b>ลืมรหัสผ่าน?</b> ที่เครื่องหลัก เปิดโฟลเดอร์โปรแกรม แล้วดับเบิลคลิก <code>reset-password.bat</code> → พิมพ์ Y → รหัสผ่านถูกล้าง ข้อมูลทะเบียนอยู่ครบ แล้วค่อยตั้งรหัสใหม่</div>
    <p class="muted" style="font-size:.9rem">ข้อมูลทั้งหมดเก็บที่: <code>${esc(S.st.data_dir)}</code> (ไฟล์แนบเข้าถึงได้ผ่านโปรแกรมเท่านั้น ไม่ได้อยู่ในโฟลเดอร์สาธารณะ)</p></div>
  <div class="card dz"><h2>${ic('refresh')} เริ่มต้นใหม่ (ล้างข้อมูล)</h2>
    <p class="muted" style="margin-top:-4px">ใช้เมื่อย้ายหน่วย / ส่งต่อเครื่องให้หน่วยอื่น / ล้างข้อมูลที่ลองบันทึกเล่น</p>
    <div class="grid g2"><div class="dz-box del"><b>สิ่งที่จะถูกลบ</b><ul><li>ทะเบียนรับ–ส่งทุกรายการ และเลขทะเบียน</li><li>ไฟล์แนบที่เก็บในโปรแกรม ประวัติการแก้ไข ประวัติการใช้งาน</li><li>การตั้งค่าทั้งหมด (กลับเป็นค่าตั้งต้น) และรหัสผ่าน</li></ul></div>
      <div class="dz-box keep"><b>สิ่งที่ไม่ลบ</b><ul><li><b>ไฟล์ Excel และรูปเอกสาร</b> ในโฟลเดอร์เก็บหนังสือ (เช่น D:\\ทะเบียนหนังสือ)</li><li>ไฟล์สำรอง (.zip) ทั้งหมด — และระบบจะ<b>สำรองให้อีกชุดก่อนลบเสมอ</b></li><li>ตัวโปรแกรมและฟอนต์</li></ul></div></div>
    <div class="row" style="margin-top:12px"><button class="btn danger" id="resetBtn" ${S.st.is_local ? '' : 'disabled'}>${ic('refresh')} เริ่มต้นใหม่…</button>${S.st.is_local ? '' : '<span class="muted">ทำได้เฉพาะที่เครื่องหลัก</span>'}</div></div>
  <div class="savebar"><span class="muted grow" id="dirty"></span><button class="btn primary big" id="save">${ic('save')} บันทึกการตั้งค่า</button></div>`;
  const jl = k => { try { return JSON.parse(s[k] || '[]'); } catch { return []; } };
  const markDirty = () => { $('#dirty').textContent = '● มีการเปลี่ยนแปลงที่ยังไม่บันทึก'; };
  const LE = {
    duty_officers: listEditor($('#duty_officers'), officers(), { ph: 'เช่น ส.ต.ท.สมชาย ใจดี', star: false, onChange: markDirty }),
    book_no_prefixes: listEditor($('#book_no_prefixes'), jl('book_no_prefixes'), { ph: 'เช่น นร ๕๑๑๙.๑ (ร้อย ฉก.ตชด.๔๔๔)๘๔/', onChange: markDirty }),
    from_options: listEditor($('#from_options'), jl('from_options'), { ph: 'เพิ่มหน่วยงาน', onChange: markDirty }),
    to_options: listEditor($('#to_options'), jl('to_options'), { ph: 'เพิ่มหน่วยงาน', onChange: markDirty }) };
  $$('.card input:not(.le-new):not(#cIn):not(#cOut):not([data-nk]), .card select', m).forEach(i => i.addEventListener('input', markDirty));   // ช่องที่มีปุ่มบันทึกของตัวเองไม่นับ
  $$('[name=ui_font],[name=ui_scale]', m).forEach(r => r.addEventListener('change', () => applyUiFont(($('[name=ui_font]:checked') || {}).value, $('[name=ui_scale]:checked').value)));
  const ym = /^\d{4}$/.test(s.year_mode); $('#year_mode').value = ym ? 'manual' : (s.year_mode === 'auto' ? 'auto' : 'fiscal'); $('#year_val').value = ym ? s.year_mode : ''; $('#year_val').hidden = !ym;
  $('#year_mode').onchange = () => { $('#year_val').hidden = $('#year_mode').value !== 'manual'; if (!$('#year_val').hidden && !$('#year_val').value) $('#year_val').value = S.st.year; };
  $('#save').onclick = async () => {
    const g = id => LE[id] ? LE[id].get().join('\n') : $('#' + id).value;
    if (!LE.duty_officers.get().length) { toast('ต้องมีผู้เข้าเวรอย่างน้อย 1 คน', 'err'); return; }
    try {
      await api('/api/settings', { method: 'PUT', json: { duty_title: g('duty_title'), duty_unit: g('duty_unit'), duty_officers: g('duty_officers'), org_name: g('org_name'), dept_name: g('dept_name'), year_mode: g('year_mode') === 'manual' ? g('year_val') : g('year_mode'), from_options: g('from_options'), to_options: g('to_options'), book_no_prefixes: g('book_no_prefixes'), reg_format: g('reg_format'), reg_pad: g('reg_pad'),
        start_in: g('start_in'), start_out: g('start_out'), ui_font: $('[name=ui_font]:checked') ? $('[name=ui_font]:checked').value : 'plex', ui_scale: $('[name=ui_scale]:checked').value, fresh_start: '0', print_font_size: g('print_font_size'), data_color: g('data_color') } });
      toast('บันทึกการตั้งค่าเรียบร้อย', 'ok'); await loadState(); viewSettings();
    } catch (e) { toast(e.message, 'err', 7000); }
  };
  $('#resetBtn').onclick = () => resetFlow();
  $('#cGo').onclick = async () => {
    const vals = { in: parseInt($('#cIn').value, 10), out: parseInt($('#cOut').value, 10) };
    if (!(vals.in > 0) && !(vals.out > 0)) { toast('ใส่เลขตัวสุดท้ายในสมุดอย่างน้อย 1 ช่อง', 'err'); return; }
    const msg = ['in', 'out'].filter(k => vals[k] > 0).map(k => `${k === 'in' ? 'ทะเบียนรับ' : 'ทะเบียนส่ง'} เริ่มที่เลข <b>${vals[k] + 1}</b>`).join('<br>');
    if (!await confirmBox('ต่อเลขจากสมุดเดิม', `<p>${msg}</p><p class="muted">ปี ${cy} · ตรวจเลขให้ถูกก่อนนะ (ถ้าบันทึกรายการไปแล้ว จะลดเลขลงไม่ได้)</p>`, 'ยืนยัน')) return;
    try { for (const k of ['in', 'out']) if (vals[k] > 0) await api('/api/counters', { method: 'PUT', json: { kind: k, year: cy, next_no: vals[k] + 1 } });
      toast('ตั้งเลขต่อจากสมุดแล้ว', 'ok'); viewSettings(); } catch (e) { toast(e.message, 'err', 8000); }
  };
  $$('[data-setnext]').forEach(b => b.onclick = async () => {
    const [k, y] = b.dataset.setnext.split(':'); const v = $(`[data-nk=${k}][data-ny="${y}"]`).value;
    try { await api('/api/counters', { method: 'PUT', json: { kind: k, year: +y, next_no: +v } }); toast('ตั้งเลขถัดไปเรียบร้อย', 'ok'); viewSettings(); } catch (e) { toast(e.message, 'err', 8000); }
  });
  $$('[data-font]').forEach(inp => inp.onchange = async () => {
    if (!inp.files[0]) return; const fd = new FormData(); fd.append('file', inp.files[0]);
    try { const r = await api('/api/settings/font/' + inp.dataset.font, { method: 'POST', body: fd }); toast('นำเข้าฟอนต์ ' + r.info.full + ' เรียบร้อย', 'ok'); await loadState(); viewSettings(); } catch (e) { toast(e.message, 'err', 8000); inp.value = ''; }
  });
  $$('[data-fontdel]').forEach(b => b.onclick = async () => { if (await confirmBox('ลบฟอนต์', 'ลบไฟล์ฟอนต์นี้?', 'ลบ', true)) { await api('/api/settings/font/' + b.dataset.fontdel, { method: 'DELETE' }); await loadState(); viewSettings(); } });
  $('#logo').onchange = async e => { if (!e.target.files[0]) return; const fd = new FormData(); fd.append('file', e.target.files[0]); try { await api('/api/settings/logo', { method: 'POST', body: fd }); toast('อัปโหลดโลโก้แล้ว', 'ok'); await loadState(); viewSettings(); } catch (er) { toast(er.message, 'err'); } };
  $('#logodel').onclick = async () => { await api('/api/settings/logo', { method: 'DELETE' }); await loadState(); viewSettings(); };
  const cur = () => ($('#pw_cur') ? $('#pw_cur').value : '');
  $('#pw_save').onclick = async () => {
    const n1 = $('#pw_new').value, n2 = $('#pw_new2').value;
    if (S.st.has_password && !cur()) { toast('ใส่รหัสผ่านปัจจุบันก่อน', 'err'); $('#pw_cur').focus(); return; }
    if (n1.length < 4) { toast('รหัสผ่านใหม่ต้องยาวอย่างน้อย 4 ตัวอักษร', 'err'); $('#pw_new').focus(); return; }
    if (n1 !== n2) { toast('รหัสผ่านสองช่องไม่ตรงกัน ลองพิมพ์ใหม่', 'err'); $('#pw_new2').focus(); return; }
    try { await api('/api/settings/password', { json: { current: cur(), next: n1 } }); toast('ตั้งรหัสผ่านแล้ว ต้องเข้าสู่ระบบใหม่ (จดรหัสเก็บไว้ในที่ปลอดภัยด้วย)', 'ok', 6000); setTimeout(() => location.reload(), 1500); } catch (e) { toast(e.message, 'err'); }
  };
  if ($('#pw_del')) $('#pw_del').onclick = async () => {
    if (!cur()) { toast('ใส่รหัสผ่านปัจจุบันก่อน แล้วค่อยกดลบ', 'err'); $('#pw_cur').focus(); return; }
    if (!await confirmBox('ลบรหัสผ่าน', '<p>หลังลบ ใครเปิดโปรแกรมก็เข้าได้เลยโดยไม่ต้องใส่รหัสผ่าน</p><p class="muted">ถ้าเครื่องนี้มีคนอื่นใช้ร่วมด้วย แนะนำให้มีรหัสผ่านไว้</p>', 'ลบรหัสผ่าน', true)) return;
    try { await api('/api/settings/password', { json: { current: cur(), next: '' } }); toast('ลบรหัสผ่านแล้ว', 'ok'); setTimeout(() => location.reload(), 800); } catch (e) { toast(e.message, 'err'); }
  };
}

/* ---------- เริ่มต้นใหม่: ยืนยัน 2 ชั้น ---------- */
async function resetFlow() {
  let info; try { info = await api('/api/reset/info'); } catch (e) { toast(e.message, 'err'); return; }
  const close = mm => mm.el.parentElement.remove();
  // ชั้นที่ 1: สำรองข้อมูลแล้วหรือยัง
  const ok1 = await new Promise(res => {
    const mm = modal(`<h2>① สำรองข้อมูลไว้แล้วหรือยัง?</h2>
      <p>${info.last_backup ? `สำรองล่าสุด: <b>${fmtStamp(info.last_backup.at)}</b><br><span class="muted">${esc(info.backup_dir)}</span>` : '<b style="color:var(--danger)">ยังไม่เคยสำรองข้อมูล</b>'}</p>
      <div class="notice ok">ไม่ต้องกังวล: ก่อนลบ ระบบจะ<b>สำรองข้อมูลทั้งหมดให้อีกชุดอัตโนมัติ</b> (ชื่อไฟล์ขึ้นต้น before-reset) กู้คืนกลับได้เสมอ</div>
      <p class="muted">ถ้าอยากเก็บไว้นอกเครื่องด้วย ไปที่หน้าสำรองข้อมูลแล้วคัดลอกไฟล์ zip ใส่แฟลชไดรฟ์ก่อน</p>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x>ยกเลิก</button><a class="btn" href="#/backup" data-go>ไปหน้าสำรองข้อมูล</a><button class="btn primary" data-next>สำรองแล้ว ไปต่อ →</button></div>`, { small: true, onClose: () => res(false) });
    $('[data-x]', mm.el).onclick = () => { close(mm); res(false); };
    $('[data-go]', mm.el).onclick = () => { close(mm); res(false); };
    $('[data-next]', mm.el).onclick = () => { close(mm); res(true); };
  });
  if (!ok1) return;
  // ชั้นที่ 2: ข้อมูลทั้งหมดจะหายไป
  await new Promise(res => {
    const mm = modal(`<h2 style="color:var(--danger)">② ข้อมูลทั้งหมดจะหายไป</h2>
      <div class="notice err"><b>จะลบ:</b> ทะเบียนรับ ${info.books_in} รายการ · ทะเบียนส่ง ${info.books_out} รายการ · ไฟล์แนบในโปรแกรม ${info.attachments} ไฟล์ · ประวัติ · การตั้งค่า · รหัสผ่าน</div>
      <div class="notice ok"><b>ไม่ลบ:</b> ไฟล์ Excel และรูปเอกสารใน <b>${esc(info.archive_dir)}</b> · ไฟล์สำรอง zip ใน ${esc(info.backup_dir)}</div>
      <div class="field"><label class="f">พิมพ์คำว่า <b>เริ่มใหม่</b> เพื่อยืนยัน</label><input type="text" id="rsTxt" autocomplete="off" placeholder="เริ่มใหม่"></div>
      ${S.st.has_password ? '<div class="field"><label class="f">รหัสผ่านเข้าโปรแกรม</label><input type="password" id="rsPw" autocomplete="off"></div>' : ''}
      <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn" data-x>ยกเลิก</button><button class="btn danger" data-do disabled>ลบข้อมูลทั้งหมดและเริ่มใหม่</button></div>`, { small: true, onClose: () => res() });
    const txt = $('#rsTxt', mm.el), go = $('[data-do]', mm.el); txt.focus();
    txt.oninput = () => { go.disabled = txt.value.trim() !== 'เริ่มใหม่'; };
    $('[data-x]', mm.el).onclick = () => { close(mm); res(); };
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'กำลังสำรองและล้างข้อมูล…';
      try {
        const r = await api('/api/reset', { json: { confirm: txt.value, password: $('#rsPw', mm.el) ? $('#rsPw', mm.el).value : '' } });
        close(mm); res();
        try { sessionStorage.removeItem('duty'); } catch { /* ignore */ }
        const done = modal(`<h2>✅ เริ่มต้นใหม่เรียบร้อย</h2><p>สำรองข้อมูลชุดเดิมไว้ที่<br><b>${esc(r.backup_dir)}</b><br><code>${esc(r.backup)}</code></p>
          <p class="muted">ไฟล์ Excel และรูปเอกสารเดิมยังอยู่ที่ ${esc(r.archive_dir)} (ไม่ถูกแตะ)</p>
          <div class="row" style="justify-content:flex-end"><button class="btn primary" data-ok>ไปตั้งค่าหน่วยใหม่ →</button></div>`, { small: true, onClose: () => { location.hash = '#/settings'; route(); } });
        $('[data-ok]', done.el).onclick = () => { done.el.parentElement.remove(); location.hash = '#/settings'; route(); };
      } catch (e) { toast(e.message, 'err', 9000); go.disabled = false; go.textContent = 'ลบข้อมูลทั้งหมดและเริ่มใหม่'; }
    };
  });
}

/* ---------- ตัวแก้ไขรายการ (เพิ่ม/ลบ/แก้/เลื่อน/ตั้งค่าหลัก) ---------- */
function listEditor(host, items, o = {}) {
  let list = items.slice(); const star = o.star !== false;
  host.className = 'le';
  const changed = () => { render(); o.onChange && o.onChange(); };
  function render() {
    host.innerHTML = `<ul class="le-list">${list.map((t, i) => `<li class="le-item${star && i === 0 ? ' main' : ''}" draggable="true" data-i="${i}">
        <span class="le-grip" title="ลากเพื่อเรียงลำดับ">⋮⋮</span>
        ${star ? `<button type="button" class="le-star" data-star="${i}" title="${i === 0 ? 'ค่าหลัก' : 'ตั้งเป็นค่าหลัก'}">${i === 0 ? '★' : '☆'}</button>` : `<span class="le-no">${i + 1}</span>`}
        <input type="text" class="le-text" data-ed="${i}" value="${esc(t)}" aria-label="แก้ไขรายการ">
        ${star && i === 0 ? '<span class="le-badge">ค่าหลัก</span>' : ''}
        <button type="button" class="le-btn" data-up="${i}" title="เลื่อนขึ้น" ${i ? '' : 'disabled'}>↑</button>
        <button type="button" class="le-btn" data-dn="${i}" title="เลื่อนลง" ${i < list.length - 1 ? '' : 'disabled'}>↓</button>
        <button type="button" class="le-btn del" data-del="${i}" title="ลบ">✕</button></li>`).join('') || '<li class="le-empty muted">ยังไม่มีรายการ — เพิ่มด้านล่าง</li>'}</ul>
      <div class="le-add"><input type="text" class="le-new" placeholder="${esc(o.ph || 'พิมพ์รายการใหม่')}"><button type="button" class="btn primary sm le-addbtn">＋ เพิ่ม</button></div>`;
    const add = () => { const inp = $('.le-new', host); const v = inp.value.trim(); if (!v) { inp.focus(); return; }
      if (list.includes(v)) { toast('มีรายการนี้อยู่แล้ว', 'err'); return; } list.push(v); changed(); $('.le-new', host).focus(); };
    $('.le-addbtn', host).onclick = add;
    $('.le-new', host).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    $$('[data-ed]', host).forEach(inp => { inp.onchange = () => { const v = inp.value.trim(), i = +inp.dataset.ed;
      if (!v) list.splice(i, 1); else list[i] = v; list = [...new Set(list)]; changed(); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } }; });
    $$('[data-del]', host).forEach(b => b.onclick = () => { list.splice(+b.dataset.del, 1); changed(); });
    $$('[data-up]', host).forEach(b => b.onclick = () => { const i = +b.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; changed(); });
    $$('[data-dn]', host).forEach(b => b.onclick = () => { const i = +b.dataset.dn; [list[i + 1], list[i]] = [list[i], list[i + 1]]; changed(); });
    $$('[data-star]', host).forEach(b => b.onclick = () => { const i = +b.dataset.star; list.unshift(...list.splice(i, 1)); changed(); });
    let from = null;
    $$('.le-item', host).forEach(li => {
      li.ondragstart = e => { if (e.target.closest && e.target.closest('input')) { e.preventDefault(); return; } from = +li.dataset.i; li.classList.add('drag'); };
      li.ondragend = () => li.classList.remove('drag');
      li.ondragover = e => { e.preventDefault(); li.classList.add('over'); };
      li.ondragleave = () => li.classList.remove('over');
      li.ondrop = e => { e.preventDefault(); const to = +li.dataset.i; if (from === null || from === to) return; list.splice(to, 0, ...list.splice(from, 1)); from = null; changed(); };
    });
  }
  render();
  return { get: () => list.slice() };
}

/* ---------- สถิติรายเดือน ---------- */
async function viewStats(params) {
  const m = shell('stats');
  const st = await api('/api/stats?' + qs({ year: params.year || '' })); if (!m.isConnected) return;
  const yearOpts = st.years.map(y => `<option value="${y}" ${y === st.year ? 'selected' : ''}>${st.fiscal ? 'ปีงบประมาณ' : 'ปี'} ${y}</option>`).join('');
  const urgTotal = Object.values(st.urgency).reduce((a, b) => a + b, 0);
  const done = st.due.on_time + st.due.late;
  m.innerHTML = header('สถิติรายเดือน', `<select id="stYear" style="width:220px">${yearOpts}</select>`, `${ic('chart')} ${st.fiscal ? 'ปีงบประมาณ' : 'ปีปฏิทิน'} ${st.year} · ไม่นับรายการที่ยกเลิก${st.totals.cancelled ? ` (ยกเลิก ${st.totals.cancelled} รายการ)` : ''}`) + `
    <div class="grid g4 stats">
      <div class="card stat"><span class="st-ic in">${ic('inbox')}</span><div><div class="l">หนังสือรับ ทั้งปี</div><div class="n">${st.totals.in}</div></div></div>
      <div class="card stat"><span class="st-ic out">${ic('send')}</span><div><div class="l">หนังสือส่ง ทั้งปี</div><div class="n">${st.totals.out}</div></div></div>
      <div class="card stat"><span class="st-ic urgic">${ic('clock')}</span><div><div class="l">หนังสือด่วน</div><div class="n">${urgTotal}</div><small class="muted">${['ด่วน', 'ด่วนมาก', 'ด่วนที่สุด'].map(u => `${u} ${st.urgency[u]}`).join(' · ')}</small></div></div>
      <div class="card stat"><span class="st-ic okic">✓</span><div><div class="l">มีกำหนดดำเนินการ</div><div class="n">${st.due.total}</div><small class="muted">เสร็จทันกำหนด ${st.due.on_time}${done ? ` (${Math.round(st.due.on_time * 100 / done)}%)` : ''}</small></div></div>
    </div>
    <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">จำนวนหนังสือรายเดือน</h2>
      <div class="legend"><span><i class="sw s1"></i>หนังสือรับ</span><span><i class="sw s2"></i>หนังสือส่ง</span></div></div>
      <div class="chartwrap" id="chart"></div>
      <details class="tblview"><summary>ดูเป็นตาราง</summary><div class="tw" style="max-height:none;margin-top:8px"><table class="t"><thead><tr><th>เดือน</th><th class="right">หนังสือรับ</th><th class="right">หนังสือส่ง</th><th class="right">รวม</th></tr></thead>
        <tbody>${st.months.map(x => `<tr><td>${x.full}</td><td class="right">${x.in}</td><td class="right">${x.out}</td><td class="right"><b>${x.in + x.out}</b></td></tr>`).join('')}
        <tr><td><b>รวมทั้งปี</b></td><td class="right"><b>${st.totals.in}</b></td><td class="right"><b>${st.totals.out}</b></td><td class="right"><b>${st.totals.in + st.totals.out}</b></td></tr></tbody></table></div></details></div>
    <div class="grid g2">
      <div class="card"><h2>หน่วยที่ส่งหนังสือมาบ่อย <small class="muted">(หนังสือรับ · จาก)</small></h2><div id="topFrom"></div></div>
      <div class="card"><h2>หน่วยที่เราส่งหนังสือไปบ่อย <small class="muted">(หนังสือส่ง · ถึง)</small></h2><div id="topTo"></div></div>
    </div>
    <div class="card"><h2>การดำเนินการตามกำหนด</h2><div class="duegrid">
      <div class="dg ok">✓ <b>${st.due.on_time}</b><span>เสร็จทันกำหนด</span></div><div class="dg warn">⚠ <b>${st.due.late}</b><span>เสร็จช้ากว่ากำหนด</span></div>
      <div class="dg info">⏰ <b>${st.due.pending}</b><span>ยังไม่ถึงกำหนด</span></div><div class="dg bad">✕ <b>${st.due.overdue}</b><span>เลยกำหนด ยังไม่เสร็จ</span></div></div></div>`;
  $('#stYear').onchange = () => { location.hash = '#/stats?year=' + $('#stYear').value; };
  drawMonthChart($('#chart'), st.months);
  hbars($('#topFrom'), st.top_from, 's1'); hbars($('#topTo'), st.top_to, 's2');
}
// แผนภูมิแท่งคู่รายเดือน (รับ/ส่ง) — SVG + กล่องรายละเอียดเมื่อชี้
function drawMonthChart(el, months) {
  const W = 900, H = 290, L = 40, R = 10, T = 22, B = 44, pw = W - L - R, ph = H - T - B;
  const max = Math.max(1, ...months.map(x => Math.max(x.in, x.out)));
  const step = max <= 5 ? 1 : Math.pow(10, Math.floor(Math.log10(max / 4))) * ([1, 2, 5, 10].find(f => Math.pow(10, Math.floor(Math.log10(max / 4))) * f * 4 >= max) || 10);
  const top = Math.ceil(max / step) * step, y = v => T + ph - v / top * ph, gw = pw / 12, bw = Math.min(24, gw * 0.3);
  const bar = (x, v, cls) => { if (!v) return ''; const h = Math.max(2, ph - (y(v) - T)), yy = T + ph - h, r = Math.min(4, bw / 2, h);
    return `<path class="${cls}" d="M${x},${T + ph} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${T + ph} Z"/>`; };
  const peak = k => { const mx = Math.max(...months.map(x => x[k])); return mx ? months.findIndex(x => x[k] === mx) : -1; };
  const pi = peak('in'), po = peak('out');
  let g = '';
  for (let v = 0; v <= top; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  months.forEach((mo, i) => {
    const cx = L + gw * i + gw / 2, x1 = cx - bw - 1, x2 = cx + 1;
    g += bar(x1, mo.in, 's1') + bar(x2, mo.out, 's2');
    if (i === pi) g += `<text class="dl" x="${x1 + bw / 2}" y="${y(mo.in) - 6}" text-anchor="middle">${mo.in}</text>`;
    if (i === po) g += `<text class="dl" x="${x2 + bw / 2}" y="${y(mo.out) - 6}" text-anchor="middle">${mo.out}</text>`;
    g += `<text class="ax" x="${cx}" y="${H - B + 20}" text-anchor="middle">${mo.short}</text>`;
    if (i === 0 || mo.short === 'ม.ค.') g += `<text class="ax sub" x="${cx}" y="${H - B + 38}" text-anchor="middle">${mo.yy}</text>`;
    g += `<rect class="hit" data-i="${i}" x="${L + gw * i}" y="${T}" width="${gw}" height="${ph}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="จำนวนหนังสือรับและส่งรายเดือน"><line class="base" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>${g}</svg><div class="tip" hidden></div>`;
  const tip = $('.tip', el), svg = $('svg', el);
  $$('.hit', el).forEach(h => {
    h.onmouseenter = () => { const mo = months[+h.dataset.i]; h.classList.add('on');
      tip.innerHTML = `<b>${mo.full}</b><div><i class="sw s1"></i>หนังสือรับ <b>${mo.in}</b></div><div><i class="sw s2"></i>หนังสือส่ง <b>${mo.out}</b></div>`; tip.hidden = false;
      const r = svg.getBoundingClientRect(), hb = h.getBoundingClientRect(); let left = hb.left - r.left + hb.width / 2 + 12; if (left > r.width - 170) left = hb.left - r.left - 170; tip.style.left = left + 'px'; tip.style.top = '10px'; };
    h.onmouseleave = () => { h.classList.remove('on'); tip.hidden = true; };
  });
}
// แท่งแนวนอน (หน่วยงานที่พบบ่อย)
function hbars(el, rows, cls) {
  if (!rows.length) { el.innerHTML = '<p class="muted">ยังไม่มีข้อมูล</p>'; return; }
  const max = Math.max(...rows.map(r => r.n));
  el.innerHTML = `<div class="hb">${rows.map(r => `<div class="hb-row" title="${esc(r.name)}: ${r.n} ฉบับ"><span class="hb-name">${esc(r.name)}</span><span class="hb-track"><i class="${cls}" style="width:${Math.max(2, r.n / max * 100)}%"></i></span><b class="hb-n">${r.n}</b></div>`).join('')}</div>`;
}

/* ---------- บันทึกการใช้งาน (log) ---------- */
async function viewActivity() {
  const m = shell('activity');
  const F = { from: todayISO(), to: todayISO(), actor: '', action: '', q: '', page: 1 };
  const meta = await api('/api/activity?limit=1'); if (!m.isConnected) return;
  const grpOf = a => Object.keys(meta.groups).find(g => meta.groups[g].actions.includes(a)) || 'system';
  m.innerHTML = header('ประวัติการใช้งาน', `<button class="btn" id="lgx">${ic('download')} โหลดเป็น Excel</button>`, `${ic('log')} ดูว่าใครเข้าเวร ทำอะไรไปบ้าง ตอนไหน · โปรแกรมจดให้เอง ลบหรือแก้ไม่ได้`) + `
    <div class="card"><div class="row" style="margin-bottom:10px"><div class="seg" id="quick">
        <label><input type="radio" name="qr" value="today" checked>วันนี้</label><label><input type="radio" name="qr" value="7">7 วันล่าสุด</label>
        <label><input type="radio" name="qr" value="month">เดือนนี้</label><label><input type="radio" name="qr" value="all">ทั้งหมด</label><label><input type="radio" name="qr" value="range">เลือกวันเอง</label></div></div>
      <div class="row" id="rangeRow" hidden><span>ตั้งแต่วันที่</span><div id="lgFrom" style="width:220px"></div><span>ถึงวันที่</span><div id="lgTo" style="width:220px"></div></div>
      <div class="row" style="margin-top:10px">
        <select id="lgActor" style="width:260px"><option value="">ทุกคน</option>${meta.actors.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select>
        <select id="lgAction" style="width:280px"><option value="">ทุกเรื่อง</option>${Object.entries(meta.groups).map(([g, x]) => `<optgroup label="${esc(x.label)}"><option value="${g}">— ${esc(x.label)} (ทุกอย่าง)</option>${x.actions.map(a => `<option value="${a}">${esc(meta.actions[a])}</option>`).join('')}</optgroup>`).join('')}</select>
        <div class="grow"><input type="search" id="lgQ" placeholder="ค้นหา เช่น 012/2570 หรือชื่อเรื่อง"></div></div></div>
    <div id="lgSum" class="lgsum"></div>
    <div class="tw"><table class="t"><thead><tr><th>เมื่อไร</th><th>ใคร</th><th>ทำอะไร</th><th>รายละเอียด</th><th>เครื่องไหน</th></tr></thead><tbody id="lgRows"></tbody></table></div>
    <div class="pager" id="lgPager"></div>`;
  const pf = thaiDatePicker(F.from), pt = thaiDatePicker(F.to); $('#lgFrom').append(pf.el); $('#lgTo').append(pt.el);
  const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  function range() {
    const v = $('[name=qr]:checked').value, n = new Date(); $('#rangeRow').hidden = v !== 'range';
    if (v === 'today') { F.from = F.to = iso(n); }
    else if (v === '7') { const a = new Date(n); a.setDate(a.getDate() - 6); F.from = iso(a); F.to = iso(n); }
    else if (v === 'month') { F.from = iso(new Date(n.getFullYear(), n.getMonth(), 1)); F.to = iso(n); }
    else if (v === 'all') { F.from = F.to = ''; }
    else { F.from = pf.get(); F.to = pt.get(); }
  }
  let seq = 0;
  async function load() {
    const my = ++seq; const r = await api('/api/activity?' + qs({ ...F, limit: 100 })); if (my !== seq || !m.isConnected) return;
    const fmtAt = a => { const d = new Date(a); return `${fmtDate(iso(d))} <b>${p2(d.getHours())}:${p2(d.getMinutes())}</b><small class="muted">:${p2(d.getSeconds())}</small>`; };
    $('#lgSum').innerHTML = `<span class="muted">ทั้งหมด ${r.total.toLocaleString()} ครั้ง</span>${r.byActor.map(x => `<button class="chip ${F.actor === x.actor ? 'on' : ''}" data-actor="${esc(x.actor)}"><span class="av sm">${esc(initialOf(x.actor || '?'))}</span>${esc(x.actor || 'ไม่รู้ว่าใคร')} <b>${x.n}</b></button>`).join('')}`;
    $('#lgRows').innerHTML = r.rows.map(x => `<tr class="${x.ref_id ? 'click' : ''}" data-ref="${x.ref_id || ''}"><td class="nowrap">${fmtAt(x.at)}</td><td class="nowrap">${x.actor ? `<b>${esc(shortName(x.actor))}</b>` : '<span class="muted">-</span>'}</td>
      <td class="nowrap"><span class="lgtag ${grpOf(x.action)} ${x.action}">${esc(r.actions[x.action] || x.action)}</span></td><td>${esc(x.detail)}</td><td class="nowrap muted">${esc(x.machine)}</td></tr>`).join('')
      || '<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">ช่วงนี้ยังไม่มีใครทำอะไร</td></tr>';
    const pages = Math.max(1, Math.ceil(r.total / r.limit));
    $('#lgPager').innerHTML = pages > 1 ? `<button class="btn sm" data-p="${F.page - 1}" ${F.page <= 1 ? 'disabled' : ''}>‹ ก่อนหน้า</button><span class="muted">หน้า ${F.page} / ${pages}</span><button class="btn sm" data-p="${F.page + 1}" ${F.page >= pages ? 'disabled' : ''}>ถัดไป ›</button>` : '';
    $$('[data-p]', m).forEach(b => b.onclick = () => { F.page = +b.dataset.p; load(); });
    $$('[data-actor]', m).forEach(b => b.onclick = () => { F.actor = F.actor === b.dataset.actor ? '' : b.dataset.actor; $('#lgActor').value = F.actor; F.page = 1; load(); });
    $$('#lgRows tr.click').forEach(tr => tr.onclick = () => openDetail(+tr.dataset.ref).catch(e => toast(e.message, 'err')));
  }
  const reload = () => { F.page = 1; load(); };
  $$('[name=qr]').forEach(r => r.onchange = () => { range(); reload(); });
  pf.onChange(() => { range(); reload(); }); pt.onChange(() => { range(); reload(); });
  $('#lgActor').onchange = () => { F.actor = $('#lgActor').value; reload(); };
  $('#lgAction').onchange = () => { F.action = $('#lgAction').value; reload(); };
  $('#lgQ').oninput = debounce(() => { F.q = $('#lgQ').value.trim(); reload(); }, 250);
  $('#lgx').onclick = () => {
    fetch('/api/activity/export?' + qs(F), { credentials: 'same-origin' }).then(async r => {
      if (!r.ok) throw new Error('โหลดไฟล์ไม่สำเร็จ');
      const cd = r.headers.get('content-disposition') || ''; const nm = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(cd) || [])[1] || 'log.xlsx');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = nm; document.body.append(a); a.click(); a.remove(); toast('โหลดไฟล์แล้ว: ' + nm, 'ok');
    }).catch(e => toast(e.message, 'err'));
  };
  load();
}

/* ---------- หน้าต่างเลือกโฟลเดอร์ (เครื่องหลัก) ---------- */
function pickFolder(start) {
  return new Promise(resolve => {
    const m = modal(`<h2>เลือกโฟลเดอร์</h2>
      <div class="row"><button class="btn sm" id="fp_up">⬆ ขึ้นไป</button><code id="fp_path" style="flex:1 1 200px;word-break:break-all"></code></div>
      <div id="fp_list" class="tw" style="max-height:46vh;margin:10px 0"></div>
      <div class="notice warn" id="fp_warn" hidden>โฟลเดอร์นี้เขียนไฟล์ไม่ได้ กรุณาเลือกที่อื่น หรือสร้างโฟลเดอร์ใหม่ที่ตำแหน่งที่เขียนได้</div>
      <div class="row" style="justify-content:space-between"><button class="btn" id="fp_new">📁＋ สร้างโฟลเดอร์ใหม่</button>
        <span class="row"><button class="btn" id="fp_cancel">ยกเลิก</button><button class="btn primary" id="fp_ok" disabled>เลือกโฟลเดอร์นี้</button></span></div>`, { onClose: () => resolve(null) });
    let cur = { path: '', parent: null, dirs: [] };
    const render = () => {
      $('#fp_path', m.el).textContent = cur.path || 'เครื่องนี้ (เลือกไดรฟ์หรือโฟลเดอร์)';
      $('#fp_up', m.el).disabled = cur.parent === null;
      $('#fp_new', m.el).disabled = !cur.path || !cur.writable;
      $('#fp_ok', m.el).disabled = !cur.path || !cur.writable;
      $('#fp_warn', m.el).hidden = !cur.path || cur.writable;
      $('#fp_list', m.el).innerHTML = cur.dirs.length ? cur.dirs.map((d, i) => `<div class="att" style="padding:8px 12px;cursor:pointer" data-i="${i}">📁 <span>${esc(d.name)}</span></div>`).join('') : '<div class="muted" style="padding:16px">ไม่มีโฟลเดอร์ย่อย</div>';
      $$('#fp_list [data-i]', m.el).forEach(r => r.onclick = () => load(cur.dirs[+r.dataset.i].path));
    };
    const load = async p => { try { cur = await api('/api/fs/list?' + qs({ path: p })); render(); } catch (e) { toast(e.message, 'err', 7000); if (p) load(''); } };
    $('#fp_up', m.el).onclick = () => load(cur.parent || '');
    $('#fp_cancel', m.el).onclick = () => m.close();
    $('#fp_ok', m.el).onclick = () => { resolve(cur.path); m.close(); };
    $('#fp_new', m.el).onclick = async () => {
      const name = await promptBox('สร้างโฟลเดอร์ใหม่', 'ชื่อโฟลเดอร์ (เช่น สำรองทะเบียนหนังสือ)', 'สร้างโฟลเดอร์');
      if (!name) return;
      try { const r = await api('/api/fs/mkdir', { json: { parent: cur.path, name } }); load(r.path); } catch (e) { toast(e.message, 'err', 7000); }
    };
    load(start || '');
  });
}

/* ---------- สำรองข้อมูล ---------- */
async function viewBackup() {
  const m = shell('backup'); const [b, lx] = await Promise.all([api('/api/backup'), api('/api/live-excel')]); const s = S.st.settings;
  const n = new Date(), dayEx = `${p2(n.getDate())}${p2(n.getMonth() + 1)}${String(n.getFullYear() + 543).slice(-2)}`;
  const logRows = b.log.map(l => `<div class="notice ${l.ok ? 'ok' : 'err'}">${fmtStamp(l.at)} — ${l.ok ? 'สำรองสำเร็จ: ' + esc(l.name) + ' (' + fmtSize(l.size) + ')' + (l.copy2 ? ' · คัดลอกไป ' + esc(l.copy2) : '') + (l.excel ? ' · Excel: ' + esc(l.excel) : '') + (l.warn ? '<br><b>คำเตือน:</b> ' + esc(l.warn) : '') : 'สำรองไม่สำเร็จ: ' + esc(l.error)}</div>`).join('');
  m.innerHTML = header('สำรองและกู้คืนข้อมูล') + `
  <div class="card"><h2>${ic('folder')} โฟลเดอร์เก็บหนังสือ</h2>
    <p class="muted" style="margin-top:-4px">บันทึกหนังสือเมื่อไร โปรแกรมจัดไฟล์ลงโฟลเดอร์นี้ให้เอง ไม่ต้องทำอะไรเพิ่ม (ไฟล์ต้นฉบับยังเก็บในโปรแกรมด้วย)</p>
    <div class="arcgrid"><pre class="tree">📁 <b>${esc(lx.dir)}</b>
 ├─ 📊 ทะเบียนหนังสือรับ.xlsx   <i>อัปเดตทุกครั้งที่บันทึก</i>
 ├─ 📊 ทะเบียนหนังสือส่ง.xlsx
 ├─ 📁 หนังสือรับ
 │   └─ 📁 ${dayEx}          <i>← วันที่ลงทะเบียน (วว ดด ปป)</i>
 │       ├─ 📄 01.pdf      <i>← หนังสือลำดับที่ 1 ของวัน</i>
 │       ├─ 📄 02-1.jpg    <i>← หนังสือเดียวกันหลายไฟล์</i>
 │       └─ 📄 02-2.jpg
 └─ 📁 หนังสือส่ง
     └─ 📁 ${dayEx}
         └─ 📄 01.pdf</pre>
    <div>
      <div class="field"><label class="f">ตำแหน่งโฟลเดอร์ <small>(ว่าง = ${esc(lx.default_dir)})</small></label>
        <div class="row"><input type="text" id="adir" class="grow" value="${esc(s.archive_dir)}" placeholder="${esc(lx.default_dir)}"><button class="btn" id="adirpick">${ic('folder')} เลือก…</button></div></div>
      <label class="chk"><input type="checkbox" id="arcOn" ${s.archive_on !== '0' ? 'checked' : ''}> เก็บไฟล์หนังสือแยกโฟลเดอร์ หนังสือรับ / หนังสือส่ง ตามวัน</label>
      <label class="chk"><input type="checkbox" id="livexl" ${s.live_excel !== '0' ? 'checked' : ''}> Excel ทะเบียนรับ / ทะเบียนส่ง (2 ไฟล์ อัปเดตทุกครั้ง มีลิงก์กดเปิดไฟล์หนังสือได้)</label>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="arcSave">${ic('save')} บันทึก</button><button class="btn" id="arcNow">${ic('refresh')} จัดเก็บตอนนี้</button>${S.st.is_local ? `<button class="btn" id="arcOpen">${ic('folder')} เปิดโฟลเดอร์</button>` : ''}</div>
      <div class="muted" style="margin-top:8px;font-size:.9rem">${lx.error ? `<span style="color:var(--warn)">⚠️ ${esc(lx.error)}</span>` : lx.at ? `✅ จัดเก็บล่าสุด ${fmtStamp(lx.at)}${lx.archive ? ` · ไฟล์หนังสือ ${lx.files} ไฟล์` : ''}` : 'ยังไม่ได้จัดเก็บ'}</div>
    </div></div></div>
  <div class="card"><h2>สำรองข้อมูล</h2><p>ไฟล์สำรองเป็น .zip เดียว รวมฐานข้อมูล ไฟล์แนบ ลายเซ็น ฟอนต์ และโลโก้</p>
    <div class="row"><button class="btn primary big" id="run">💾 สำรองข้อมูลตอนนี้</button></div>
    <div class="card" style="background:var(--bg2);margin:14px 0 0;box-shadow:none"><h2>ตั้งค่าสำรองอัตโนมัติ</h2>
      <div class="row"><label><input type="checkbox" id="auto" ${s.auto_backup === '1' ? 'checked' : ''}> เปิดสำรองอัตโนมัติ</label>
        <span>ทุก</span><select id="every" style="width:150px">${[[1, '1 ชั่วโมง'], [3, '3 ชั่วโมง'], [6, '6 ชั่วโมง'], [12, '12 ชั่วโมง'], [24, '1 วัน'], [72, '3 วัน'], [168, '7 วัน']].map(([v, t]) => `<option value="${v}" ${String(v) === s.backup_every_hours ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <span>เก็บไว้</span><input type="number" id="keep" min="3" max="365" value="${esc(s.backup_keep)}" style="width:90px"><span>ชุดล่าสุด</span></div>
      <div class="row" style="margin-top:8px"><label><input type="checkbox" id="xl" ${s.backup_excel === '1' ? 'checked' : ''}> สำรองเป็นไฟล์ <b>Excel (.xlsx)</b> ด้วย (ทะเบียนรับ+ส่ง ทุกรายการ) เปิดดู/แก้ไขได้โดยไม่ต้องใช้โปรแกรมนี้</label></div>
      <div class="row" style="margin-top:8px"><label><input type="checkbox" id="onexit" ${s.backup_on_exit === '1' ? 'checked' : ''}> สำรองให้อัตโนมัติทุกครั้งที่กด "ปิดโปรแกรม"</label></div>
      <div class="field" style="margin-top:10px"><label class="f">สำรองซ้ำไปอีกที่ <small>(เช่น แฟลชไดรฟ์ E:\\Backup — แนะนำมาก เพราะถ้าดิสก์เสีย ไฟล์สำรองในเครื่องเดียวกันหายด้วย)</small></label>
        <div class="row"><input type="text" id="bdir2" class="grow" value="${esc(s.backup_dir2)}" placeholder="เว้นว่างถ้าไม่ใช้"><button class="btn" id="bdir2pick">📁 เลือกโฟลเดอร์…</button></div></div>
      <button class="btn" id="autosave">บันทึกการตั้งค่าสำรองอัตโนมัติ</button>
      <p class="muted" style="margin:8px 0 0">ระบบตรวจทุก 10 นาที ขณะเปิดโปรแกรมอยู่ ${(() => { const a = b.items.find(i => i.name.startsWith('auto-')); return a ? '· สำรองอัตโนมัติล่าสุด: ' + fmtStamp(a.at) : '· ยังไม่มีการสำรองอัตโนมัติ'; })()}</p></div>
    <div class="field" style="margin-top:12px"><label class="f">โฟลเดอร์เก็บไฟล์สำรอง <small>(แนะนำให้เป็นไดรฟ์อื่น/แฟลชไดรฟ์ เช่น D:\\Backup\\Register)</small></label>
      <div class="row"><input type="text" id="bdir" class="grow" value="${esc(s.backup_dir)}" placeholder="${esc(b.dir)}"><button class="btn" id="bdirpick">📁 เลือกโฟลเดอร์…</button><button class="btn" id="bdirsave">บันทึกตำแหน่ง</button></div>
      <small class="muted">ตำแหน่งปัจจุบัน: ${esc(b.dir)}</small></div><div id="log">${logRows}</div></div>
  <div class="card"><h2>ไฟล์สำรองที่มี</h2>${b.items.length ? `<table class="t"><thead><tr><th>ชื่อไฟล์</th><th>วันเวลา</th><th>ขนาด</th><th></th></tr></thead><tbody>${b.items.map(i => `<tr><td>${esc(i.name)}</td><td>${fmtStamp(i.at)}</td><td>${fmtSize(i.size)}</td>
    <td class="right"><a class="btn sm" href="/api/backup/download/${encodeURIComponent(i.name)}">ดาวน์โหลด</a> ${i.name.endsWith('.zip') ? `<button class="btn sm danger" data-rs="${esc(i.name)}">กู้คืน</button>` : '<span class="tag in">Excel</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">ยังไม่มีไฟล์สำรอง</p>'}</div>
  <div class="card"><h2>กู้คืนจากไฟล์ที่เลือก</h2><div class="notice warn">การกู้คืนจะ <b>แทนที่ข้อมูลทั้งหมดในปัจจุบัน</b> ด้วยข้อมูลในไฟล์สำรอง (ระบบจะสำรองข้อมูลปัจจุบันไว้ให้อัตโนมัติก่อนเสมอ ชื่อไฟล์ขึ้นต้น before-restore)</div>
    <div class="row"><input type="file" id="rfile" accept=".zip"><button class="btn danger" id="rbtn">กู้คืนจากไฟล์นี้</button></div></div>`;
  $('#run').onclick = async e => { e.target.disabled = true; const r = await api('/api/backup/run', { method: 'POST' }).catch(er => ({ ok: false, error: er.message })); toast(r.ok ? 'สำรองข้อมูลสำเร็จ: ' + r.name + (r.excel ? ' + Excel' : '') + (r.warn ? ' — คำเตือน: ' + r.warn : r.copy2 ? ' (และคัดลอกไป ' + r.copy2 + ' แล้ว)' : '') : 'สำรองข้อมูลไม่สำเร็จ: ' + r.error, r.ok && !r.warn ? 'ok' : 'err', 10000); viewBackup(); };
  const arcSave = async () => { try { await api('/api/settings', { method: 'PUT', json: { archive_dir: $('#adir').value, archive_on: $('#arcOn').checked, live_excel: $('#livexl').checked } }); await api('/api/live-excel/update', { method: 'POST' }); toast('บันทึกแล้ว และจัดเก็บไฟล์ลงโฟลเดอร์ให้แล้ว', 'ok'); await loadState(); viewBackup(); } catch (e) { toast(e.message, 'err', 8000); } };
  $('#arcSave').onclick = arcSave;
  $('#adirpick').onclick = async () => { const p = await pickFolder($('#adir').value || lx.dir); if (p) { $('#adir').value = p; arcSave(); } };
  $('#arcNow').onclick = async () => { const r = await api('/api/live-excel/update', { method: 'POST' }).catch(e => ({ error: e.message })); toast(r.error || `จัดเก็บแล้ว (ไฟล์หนังสือ ${r.files || 0} ไฟล์)`, r.error ? 'err' : 'ok', 7000); viewBackup(); };
  if ($('#arcOpen')) $('#arcOpen').onclick = async () => { try { await api('/api/live-excel/open', { json: { folder: true } }); toast('เปิดโฟลเดอร์แล้ว', 'ok'); } catch (e) { toast(e.message, 'err'); } };
  $('#bdirpick').onclick = async () => { const p = await pickFolder($('#bdir').value); if (p) { $('#bdir').value = p; $('#bdirsave').click(); } };
  $('#bdir2pick').onclick = async () => { const p = await pickFolder($('#bdir2').value); if (p) { $('#bdir2').value = p; $('#autosave').click(); } };
  $('#autosave').onclick = async () => {
    try { await api('/api/settings', { method: 'PUT', json: { auto_backup: $('#auto').checked, backup_every_hours: $('#every').value, backup_keep: $('#keep').value, backup_on_exit: $('#onexit').checked, backup_excel: $('#xl').checked, backup_dir2: $('#bdir2').value } });
      toast('บันทึกการตั้งค่าสำรองอัตโนมัติแล้ว', 'ok'); await loadState(); viewBackup(); } catch (e) { toast(e.message, 'err', 8000); }
  };
  $('#bdirsave').onclick = async () => { try { await api('/api/settings', { method: 'PUT', json: { backup_dir: $('#bdir').value } }); toast('บันทึกตำแหน่งสำรองข้อมูลแล้ว', 'ok'); await loadState(); viewBackup(); } catch (e) { toast(e.message, 'err', 8000); } };
  // กู้คืน: ยืนยัน 2 ชั้น (เหมือนเริ่มต้นใหม่)  src = { name, at, size } ของไฟล์ที่จะกู้คืน, send(extra) = ส่งคำขอพร้อมคำยืนยัน
  const doRestore = async (src, send) => {
    let info; try { info = await api('/api/reset/info'); } catch (e) { toast(e.message, 'err'); return; }
    const close = mm => mm.el.parentElement.remove();
    const ok1 = await new Promise(res => {
      const mm = modal(`<h2>① สำรองข้อมูลปัจจุบันไว้แล้วหรือยัง?</h2>
        <p>${info.last_backup ? `สำรองล่าสุด: <b>${fmtStamp(info.last_backup.at)}</b>` : '<b style="color:var(--danger)">ยังไม่เคยสำรองข้อมูล</b>'}</p>
        <div class="notice ok">ก่อนกู้คืน ระบบจะ<b>สำรองข้อมูลปัจจุบันให้อัตโนมัติ</b> (ชื่อไฟล์ขึ้นต้น before-restore) ถ้ากู้ผิดไฟล์ ก็กู้กลับได้</div>
        <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x>ยกเลิก</button><button class="btn" data-bk>${ic('save')} สำรองตอนนี้</button><button class="btn primary" data-next>สำรองแล้ว ไปต่อ →</button></div>`, { small: true, onClose: () => res(false) });
      $('[data-x]', mm.el).onclick = () => { close(mm); res(false); };
      $('[data-next]', mm.el).onclick = () => { close(mm); res(true); };
      $('[data-bk]', mm.el).onclick = async e => { e.target.disabled = true; e.target.textContent = 'กำลังสำรอง…';
        const r = await api('/api/backup/run', { method: 'POST' }).catch(er => ({ ok: false, error: er.message }));
        if (r.ok) { toast('สำรองข้อมูลแล้ว: ' + r.name, 'ok', 6000); close(mm); res(true); } else { toast('สำรองไม่สำเร็จ: ' + r.error, 'err', 8000); e.target.disabled = false; e.target.textContent = 'สำรองตอนนี้'; } };
    });
    if (!ok1) return;
    await new Promise(res => {
      const mm = modal(`<h2 style="color:var(--danger)">② ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด</h2>
        <div class="notice err"><b>ข้อมูลตอนนี้</b> (ทะเบียนรับ ${info.books_in} · ทะเบียนส่ง ${info.books_out} รายการ · ไฟล์แนบ ${info.attachments} ไฟล์ · การตั้งค่า) <b>จะถูกแทนที่</b>ด้วยข้อมูลในไฟล์</div>
        <div class="notice warn">📦 <b>${esc(src.name)}</b>${src.at ? `<br>สำรองเมื่อ ${fmtStamp(src.at)}` : ''}${src.size ? ` · ${fmtSize(src.size)}` : ''}</div>
        <p class="muted" style="margin:0 0 8px">รายการที่บันทึกหลังจากวันที่ของไฟล์นี้จะหายไป (แต่ยังอยู่ในไฟล์สำรอง before-restore)</p>
        <div class="field"><label class="f">พิมพ์คำว่า <b>กู้คืน</b> เพื่อยืนยัน</label><input type="text" id="rtTxt" autocomplete="off" placeholder="กู้คืน"></div>
        ${S.st.has_password ? '<div class="field"><label class="f">รหัสผ่านเข้าโปรแกรม</label><input type="password" id="rtPw" autocomplete="off"></div>' : ''}
        <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn" data-x>ยกเลิก</button><button class="btn danger" data-do disabled>กู้คืนข้อมูลจากไฟล์นี้</button></div>`, { small: true, onClose: () => res() });
      const txt = $('#rtTxt', mm.el), go = $('[data-do]', mm.el); txt.focus();
      txt.oninput = () => { go.disabled = txt.value.trim() !== 'กู้คืน'; };
      $('[data-x]', mm.el).onclick = () => { close(mm); res(); };
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'กำลังกู้คืน…';
        try { const r = await send({ confirm: txt.value.trim(), password: $('#rtPw', mm.el) ? $('#rtPw', mm.el).value : '' });
          close(mm); res(); toast(`กู้คืนข้อมูลสำเร็จ (สำรองข้อมูลก่อนกู้คืนไว้ที่ ${r.safety})`, 'ok', 9000); await loadState(); setTimeout(() => viewBackup(), 300);
        } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + e.message, 'err', 9000); go.disabled = false; go.textContent = 'กู้คืนข้อมูลจากไฟล์นี้'; }
      };
    });
  };
  $$('[data-rs]').forEach(bt => bt.onclick = () => { const it = b.items.find(i => i.name === bt.dataset.rs) || { name: bt.dataset.rs };
    doRestore(it, extra => api('/api/backup/restore-local', { json: { name: it.name, ...extra } })); });
  $('#rbtn').onclick = () => { const f = $('#rfile').files[0]; if (!f) { toast('กรุณาเลือกไฟล์สำรอง (.zip)', 'err'); return; } doRestore({ name: f.name, size: f.size }, extra => { const fd = new FormData(); fd.append('confirm', extra.confirm); fd.append('password', extra.password); fd.append('file', f); return api('/api/backup/restore', { method: 'POST', body: fd }); }); };
}

/* ---------- เข้าสู่ระบบ ---------- */
function viewLogin() {
  $('#app').innerHTML = `<div class="welcome"><div class="welcome-card" style="max-width:420px"><img src="/icon.svg" alt="" class="welcome-logo"><h1 style="font-size:1.4rem;white-space:nowrap">ระบบทะเบียนหนังสือรับ–ส่ง</h1><p class="muted">กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน</p>
    <form id="lf"><div class="field"><input type="password" id="pw" placeholder="รหัสผ่าน" autofocus></div><button class="btn primary big" style="width:100%">เข้าสู่ระบบ</button></form>
    <details style="margin-top:14px;text-align:left"><summary class="muted" style="cursor:pointer;text-align:center">ลืมรหัสผ่าน?</summary><p class="muted" style="font-size:.92rem">ที่<b>เครื่องหลัก</b> (เครื่องที่ติดตั้งโปรแกรม) เปิดโฟลเดอร์โปรแกรม แล้วดับเบิลคลิก <code>reset-password.bat</code> → พิมพ์ Y → รีเฟรชหน้านี้ จะเข้าได้โดยไม่ต้องใช้รหัส ข้อมูลทะเบียนไม่หาย</p></details></div></div>`;
  $('#app').append(themeButton());
  $('#lf').onsubmit = async e => { e.preventDefault(); try { await api('/api/login', { json: { password: $('#pw').value } }); boot(); } catch (er) { toast(er.message, 'err'); } };
}

/* ---------- หน้าแรก: เลือกผู้เข้าเวร ---------- */
function viewDuty() {
  const s = S.st.settings; const list = officers();
  $('#app').innerHTML = `<div class="welcome"><div class="welcome-card">
    <img src="${s.logo ? '/api/logo' : '/icon.svg'}" alt="" class="welcome-logo">
    <h1>${esc(s.duty_title)}</h1><p class="unit">${esc(s.duty_unit)}</p>
    <p class="muted" style="margin:6px 0 0">${longToday()} · เลือกชื่อผู้เข้าเวรที่กำลังบันทึกทะเบียนหนังสือ</p>
    <div class="officers">${list.map((n, i) => `<button class="officer" data-i="${i}"><span class="av">${esc(initialOf(n))}</span><span class="grow"><b>${esc(shortName(n))}</b><small>${esc(n)}</small></span>${ic('right')}</button>`).join('') || '<div class="notice warn">ยังไม่มีรายชื่อผู้เข้าเวร</div>'}</div>
    <a href="#/settings" class="muted small-link">${ic('sliders')} ตั้งค่ารายชื่อผู้เข้าเวร</a></div></div>`;
  $('#app').append(themeButton());
  $$('[data-i]').forEach(b => b.onclick = async () => {
    const name = list[+b.dataset.i], prev = getDuty();
    try { sessionStorage.setItem('duty', name); } catch { /* ignore */ }
    if (name !== prev) await api('/api/duty', { json: { name, prev } }).catch(() => {});   // บันทึกการเข้าเวร
    if (location.hash === '#/dashboard') route(); else location.hash = '#/dashboard';
  });
}

/* ---------- เส้นทาง ---------- */
let navSeq = 0;   // กันหน้าเก่าที่โหลดช้ามาทับหน้าใหม่เมื่อกดเปลี่ยนหน้าเร็วๆ
async function route() {
  const myNav = ++navSeq;
  const h = location.hash.replace(/^#\/?/, '') || 'dashboard'; const [path, query] = h.split('?'); const parts = path.split('/'); const params = Object.fromEntries(new URLSearchParams(query || ''));
  try {
    await loadState();
    if (path === 'duty') return viewDuty();
    if (path !== 'settings' && (!getDuty() || (officers().length && !officers().includes(getDuty())))) { if (location.hash !== '#/duty') location.hash = '#/duty'; return viewDuty(); }
    if (path === 'dashboard') await viewDashboard();
    else if (parts[0] === 'new') await viewForm(parts[1] === 'out' ? 'out' : 'in');
    else if (parts[0] === 'edit') await viewForm(null, +parts[1]);
    else if (parts[0] === 'list') await viewList(parts[1] === 'out' ? 'out' : 'in');
    else if (path === 'search') await viewList('all');
    else if (path === 'reports') await viewReports(params);
    else if (path === 'settings') await viewSettings();
    else if (path === 'backup') await viewBackup();
    else if (path === 'activity') await viewActivity();
    else if (path === 'stats') await viewStats(params);
    else location.hash = '#/dashboard';
  } catch (e) { if (myNav !== navSeq) return; if (e.message !== 'กรุณาเข้าสู่ระบบ') { (S.st ? shell('') : $('#app')).innerHTML = `<div class="card notice err" style="margin:20px">${esc(e.message)}</div>`; } }
}
async function boot() {
  setAuthLost(viewLogin);
  const ss = await api('/api/session').catch(e => { $('#app').innerHTML = `<div class="card notice err" style="margin:20px">${esc(e.message)}</div>`; return null; });
  if (!ss) return;
  if (ss.auth_required && !ss.authenticated) return viewLogin();
  route();
}
window.addEventListener('hashchange', () => route());
// Ctrl+S = กดปุ่มบันทึกของหน้านั้น
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { const b = $('#main #save'); if (b) { e.preventDefault(); b.click(); } } });
boot();
