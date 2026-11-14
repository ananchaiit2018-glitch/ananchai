'use strict';
/* หน้าจอทั้งหมดของโปรแกรม (ต้องโหลด core.js ก่อน) */
const S = { st: null };          // สถานะที่โหลดจากเซิร์ฟเวอร์ (ตั้งค่า, ฟอนต์, ปี)
const KIND = { in: 'หนังสือรับ', out: 'หนังสือส่ง' };
const MENU = [
  ['dashboard', '🏠', 'Dashboard'], ['new/in', '📥', 'เพิ่มหนังสือรับ'], ['new/out', '📤', 'เพิ่มหนังสือส่ง'], ['sep'],
  ['list/in', '📒', 'ทะเบียนหนังสือรับ'], ['list/out', '📕', 'ทะเบียนหนังสือส่ง'], ['search', '🔍', 'ค้นหาหนังสือ'],
  ['reports', '🖨️', 'รายงานและส่งออก'], ['sep'], ['settings', '⚙️', 'ตั้งค่าระบบ'], ['backup', '💾', 'สำรองข้อมูล'],
];
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function loadState() {
  S.st = await api('/api/state');
  const s = S.st.settings, f = S.st.fonts;
  document.documentElement.style.setProperty('--fs', (s.ui_font_size || 18) + 'px');
  document.documentElement.style.setProperty('--ink', s.data_color || '#174EA6');
  let css = '';
  if (f.regular) css += `@font-face{font-family:'RegisterFont';src:url('/api/font/regular?v=${f.regular.version}');font-weight:400}`;
  if (f.bold) css += `@font-face{font-family:'RegisterFont';src:url('/api/font/bold?v=${f.bold.version}');font-weight:700}`;
  $('#font-style').textContent = css + '.ink,.ink td,td.ink{color:var(--ink)}';
}

/* ---------- โครงหน้า ---------- */
function shell(active) {
  const s = S.st.settings;
  const nav = MENU.map(([r, ic, t]) => r === 'sep' ? '<div class="sep"></div>' : `<a href="#/${r}" class="${active === r ? 'on' : ''}"><span class="ic">${ic}</span>${t}</a>`).join('');
  $('#app').innerHTML = `<div class="shell"><aside class="side">
    <div class="brand">${s.logo ? '<img src="/api/logo?' + Date.now() + '" alt="">' : ''}<div><b>${esc(s.org_name || 'ทะเบียนหนังสือ')}</b><small>รับ–ส่ง อิเล็กทรอนิกส์</small></div></div>
    <nav class="nav">${nav}</nav>
    ${S.st.has_password ? '<div class="nav"><div class="sep"></div><a id="logout"><span class="ic">🚪</span>ออกจากระบบ</a></div>' : ''}</aside>
    <main class="main" id="main"></main></div>`;
  const lo = $('#logout'); if (lo) lo.onclick = async () => { await api('/api/logout', { method: 'POST' }); location.reload(); };
  return $('#main');
}
function fontWarning() {
  return S.st.fonts.regular ? '' : `<div class="notice warn"><b>ยังไม่ได้นำเข้าไฟล์ฟอนต์ TH Sarabun</b> — การพิมพ์/ส่งออก PDF ต้องใช้ไฟล์ฟอนต์จริง กรุณาไปที่ <a href="#/settings">ตั้งค่าระบบ → ฟอนต์</a> แล้วนำเข้าไฟล์ THSarabunNew.ttf (และ THSarabunNew Bold.ttf)</div>`;
}
// ชื่อสั้น = ยศ+ชื่อ ตัดนามสกุลออก (คำแรกก่อนช่องว่าง) เช่น "ส.ต.ท.เนวิน แดงแจ้" -> "ส.ต.ท.เนวิน"
const shortName = n => String(n || '').trim().split(/\s+/)[0];
const getDuty = () => { try { return sessionStorage.getItem('duty') || ''; } catch { return ''; } };
const officers = () => { try { return JSON.parse(S.st.settings.duty_officers || '[]'); } catch { return []; } };
const header = (title, right = '') => `<div class="top"><h1>${title}</h1><div class="row"><a class="pill" href="#/duty" title="เปลี่ยนผู้เข้าเวร" style="text-decoration:none">👤 ${esc(getDuty())} ▾</a><span class="pill">ปีทะเบียน พ.ศ. ${S.st.year}</span>${right}</div></div>`;

/* ---------- Dashboard ---------- */
async function viewDashboard() {
  const m = shell('dashboard'); const d = await api('/api/dashboard');
  const rows = d.recent.map(b => `<tr class="click ${b.status === 'cancelled' ? 'cancelled' : ''}" data-id="${b.id}">
    <td><span class="tag ${b.kind}">${b.kind === 'in' ? 'รับ' : 'ส่ง'}</span></td><td class="regno">${esc(b.reg_label)}</td><td class="ink">${esc(b.book_no)}</td><td class="ink">${fmtDate(b.book_date)}</td>
    <td class="ink">${esc(b.subject)}</td><td class="ink">${esc(b.kind === 'in' ? b.from_org : b.to_org)}</td></tr>`).join('');
  m.innerHTML = header('Dashboard') + fontWarning() + `
    <div class="grid g4">
      <div class="card stat"><div class="l">หนังสือรับทั้งหมด</div><div class="n">${d.in_total}</div><small class="muted">ปีนี้ ${d.in_year} · เลขถัดไป ${esc(d.next_in)}</small></div>
      <div class="card stat out"><div class="l">หนังสือส่งทั้งหมด</div><div class="n">${d.out_total}</div><small class="muted">ปีนี้ ${d.out_year} · เลขถัดไป ${esc(d.next_out)}</small></div>
      <div class="card stat"><div class="l">หนังสือรับประจำเดือนนี้</div><div class="n">${d.in_month}</div></div>
      <div class="card stat out"><div class="l">หนังสือส่งประจำเดือนนี้</div><div class="n">${d.out_month}</div></div>
    </div>
    <div class="card"><div class="quick">
      <a class="btn primary big" href="#/new/in">📥 เพิ่มหนังสือรับ</a><a class="btn primary big" href="#/new/out">📤 เพิ่มหนังสือส่ง</a>
      <a class="btn big" href="#/search">🔍 ค้นหาหนังสือ</a><a class="btn big" href="#/reports">🖨️ พิมพ์ทะเบียน</a><a class="btn big" href="#/reports?export=1">📊 ส่งออกข้อมูล</a></div></div>
    <div class="card"><h2>รายการล่าสุด</h2>${d.recent.length ? `<div class="tw" style="max-height:none"><table class="t"><thead><tr><th></th><th>เลขทะเบียน</th><th>ที่</th><th>ลงวันที่</th><th>เรื่อง</th><th>จาก/ถึง</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">ยังไม่มีรายการ เริ่มต้นด้วยการกด "เพิ่มหนังสือรับ" หรือ "เพิ่มหนังสือส่ง"</p>'}
    ${d.cancelled ? `<p class="muted">รายการที่ยกเลิก (ยังเก็บเลขทะเบียนไว้): ${d.cancelled} รายการ</p>` : ''}</div>`;
  $$('tr.click', m).forEach(tr => tr.onclick = () => openDetail(+tr.dataset.id));
}

/* ---------- ฟอร์มเพิ่ม / แก้ไข ---------- */
async function viewForm(kind, editId) {
  const m = shell(editId ? '' : 'new/' + kind);
  const edit = editId ? await api('/api/books/id/' + editId) : null;
  if (edit) kind = edit.kind;
  if (edit && edit.status === 'cancelled') { m.innerHTML = header('แก้ไขไม่ได้') + '<div class="notice err">รายการที่ยกเลิกแล้วไม่สามารถแก้ไขได้</div>'; return; }
  const next = edit ? null : await api('/api/next/' + kind);
  const sug = {};
  await Promise.all(['from_org', 'to_org', 'action', 'receiver_name'].map(async f => { sug[f] = await api('/api/suggest?field=' + f).catch(() => []); }));
  const isIn = kind === 'in';
  const L = { sender: isIn ? 'ผู้ส่งมอบหนังสือ' : 'ผู้ส่งหนังสือ', receiver: 'ผู้รับหนังสือ' };
  const dl = f => `<datalist id="dl-${f}">${sug[f].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const v = f => esc(edit ? edit[f] : '');
  const recvOptions = [...new Set(officers().map(shortName))];
  const recvCur = edit ? shortName(edit.receiver_name) : shortName(getDuty());
  if (recvCur && !recvOptions.includes(recvCur)) recvOptions.push(recvCur);
  const sigBlock = who => `<div class="sigbox"><h3>${L.receiver}</h3>
    <div class="field"><label class="f">เลือกชื่อผู้รับหนังสือ <small>(พิมพ์เป็นยศ+ชื่อ ไม่มีนามสกุล · แก้รายชื่อได้ที่ ตั้งค่าระบบ)</small></label>
      <select id="${who}_name" class="ink"><option value="">— เลือก —</option>${recvOptions.map(n => `<option value="${esc(n)}" ${n === recvCur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="field"><label class="f">วันและเวลา${who === 'sender' ? 'ส่ง' : 'รับ'}</label><div class="row"><div class="grow" id="${who}_at_date"></div><input type="time" id="${who}_at_time" class="ink" style="width:140px"><button type="button" class="btn sm" id="${who}_now">ตอนนี้</button></div></div></div>`;
  m.innerHTML = header(edit ? `แก้ไข${KIND[kind]} ${esc(edit.reg_label)}` : `เพิ่ม${KIND[kind]}`) + fontWarning() + `
    <form class="card" id="f" autocomplete="off">
      <div class="regbox"><div>เลขทะเบียน${isIn ? 'รับ' : 'ส่ง'}</div><b>${edit ? esc(edit.reg_label) : esc(next.label)}</b>
        <small class="muted">${edit ? 'เลขทะเบียนแก้ไขไม่ได้' : 'ระบบออกเลขให้อัตโนมัติเมื่อกดบันทึก (เลขจริงอาจเปลี่ยนถ้ามีเครื่องอื่นบันทึกก่อน)'} · ไม่ใช่เลขที่หนังสือราชการ</small></div>
      <div class="grid g3"><div class="field"><label class="f">ที่ <small>(เลขที่หนังสือ${isIn ? 'จากหน่วยงานต้นทาง' : 'ราชการ'})</small></label><input type="text" id="book_no" class="ink" value="${v('book_no')}" maxlength="300"></div>
        <div class="field"><label class="f">ลงวันที่ <span class="muted">*</span></label><div id="book_date_w"></div></div>
        <div class="field"><label class="f">การปฏิบัติ</label><input type="text" id="action" class="ink" list="dl-action" value="${v('action')}"></div></div>
      <div class="grid g2"><div class="field"><label class="f">จาก</label><input type="text" id="from_org" class="ink" list="dl-from_org" value="${v('from_org')}"></div>
        <div class="field"><label class="f">ถึง</label><input type="text" id="to_org" class="ink" list="dl-to_org" value="${v('to_org')}"></div></div>
      <div class="field"><label class="f">เรื่อง <span class="muted">*</span></label><textarea id="subject" class="ink" maxlength="1000">${v('subject')}</textarea></div>
      <div class="field"><label class="f">หมายเหตุ</label><input type="text" id="remark" class="ink" value="${v('remark')}"></div>
      <div class="grid">${sigBlock('receiver')}</div>
      <div class="field"><label class="f">แนบไฟล์ <small>(PDF, JPG, PNG — ไม่เกิน 20 MB ต่อไฟล์)</small></label>
        <input type="file" id="files" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg">
        <div id="existing_att">${edit ? edit.attachments.map(a => `<div class="att" data-aid="${a.id}"><a href="/api/attachments/${a.id}" target="_blank">📎 ${esc(a.filename)}</a><small class="muted">${fmtSize(a.size)}</small><button type="button" class="btn sm danger" data-rm="${a.id}">ลบ</button></div>`).join('') : ''}</div></div>
      ${dl('from_org')}${dl('to_org')}${dl('action')}${dl('receiver_name')}
      <div class="row" style="margin-top:14px"><button class="btn primary big" id="save" type="submit">💾 บันทึก${edit ? 'การแก้ไข' : ''}</button>
        <a class="btn big" href="#/${edit ? 'list/' + kind : 'dashboard'}">ยกเลิก</a><span class="muted" id="msg"></span></div>
    </form>`;

  const bd = thaiDatePicker(edit ? edit.book_date : '');
  const prefillAt = !edit && getDuty(); $('#book_date_w').append(bd.el);
  const dt = {};
  for (const who of ['receiver']) {
    const at = edit ? edit[who + '_at'] : '';
    dt[who] = thaiDatePicker(at ? at.slice(0, 10) : ''); $(`#${who}_at_date`).append(dt[who].el);
    $(`#${who}_at_time`).value = at ? at.slice(11, 16) : '';
    if (prefillAt) { const n = nowLocal(); dt[who].set(n.slice(0, 10)); $(`#${who}_at_time`).value = n.slice(11, 16); }
    const stamp = () => { if (!dt[who].get()) { const n = nowLocal(); dt[who].set(n.slice(0, 10)); $(`#${who}_at_time`).value = n.slice(11, 16); } };
    $(`#${who}_now`).onclick = () => { const n = nowLocal(); dt[who].set(n.slice(0, 10)); $(`#${who}_at_time`).value = n.slice(11, 16); };
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
    if (!bd.get()) { toast('กรุณาระบุ "ลงวันที่" ให้ครบและถูกต้อง (วัน เดือน ปี พ.ศ.)', 'err'); return; }
    const body = { book_no: g('book_no'), book_date: bd.get(), from_org: g('from_org'), to_org: g('to_org'), subject: g('subject'), action: g('action'), remark: g('remark'), receiver_name: g('receiver_name') };
    for (const who of ['receiver']) {
      const d_ = dt[who].get(); const t = $(`#${who}_at_time`).value;
      body[who + '_at'] = d_ ? `${d_}T${t || '00:00'}` : '';
    }
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
        <button class="btn sm" id="prSel" disabled>🖨️ พิมพ์ที่เลือก</button><button class="btn sm" id="prAll">🖨️ พิมพ์/ส่งออกตามตัวกรองนี้</button></div></div>
    <div class="tw"><table class="t"><thead><tr><th><input type="checkbox" id="selAll" aria-label="เลือกทั้งหมด"></th>${isAll ? '<th>ประเภท</th>' : ''}<th>เลขทะเบียน</th><th>ที่</th><th>ลงวันที่</th><th>จาก</th><th>ถึง</th><th>เรื่อง</th><th>การปฏิบัติ</th><th>หมายเหตุ</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="pager" id="pager"></div>`;
  let seq = 0;
  async function load() {
    const my = ++seq;
    const r = await api('/api/books?' + qs({ ...F, limit: 50 }));
    if (my !== seq) return;
    $('#count').textContent = `พบ ${r.total} รายการ`;
    $('#rows').innerHTML = r.rows.length ? r.rows.map(b => `<tr class="click ${b.status}" data-id="${b.id}"><td class="nostrike"><input type="checkbox" data-sel="${b.id}" ${sel.has(b.id) ? 'checked' : ''}></td>
      ${isAll ? `<td class="nostrike"><span class="tag ${b.kind}">${b.kind === 'in' ? 'รับ' : 'ส่ง'}</span></td>` : ''}
      <td class="regno nostrike">${esc(b.reg_label)}${b.status === 'cancelled' ? ' <span class="tag x">ยกเลิก</span>' : ''}</td><td class="ink">${esc(b.book_no)}</td><td class="ink" style="white-space:nowrap">${fmtDate(b.book_date)}</td>
      <td class="ink">${esc(b.from_org)}</td><td class="ink">${esc(b.to_org)}</td><td class="ink">${esc(b.subject)}</td><td class="ink">${esc(b.action)}</td><td class="ink">${esc(b.remark)}</td>
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
const ACT = { create: 'สร้างรายการ', update: 'แก้ไขข้อมูล', cancel: 'ยกเลิกรายการ', attach_add: 'แนบไฟล์', attach_remove: 'ลบไฟล์แนบ' };
const FL = { book_no: 'ที่', book_date: 'ลงวันที่', from_org: 'จาก', to_org: 'ถึง', subject: 'เรื่อง', action: 'การปฏิบัติ', remark: 'หมายเหตุ', sender_name: 'ผู้ส่ง', receiver_name: 'ผู้รับ', sender_at: 'วันเวลาส่ง', receiver_at: 'วันเวลารับ', sender_sig: 'ลายเซ็นผู้ส่ง', receiver_sig: 'ลายเซ็นผู้รับ' };
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
    <div style="margin:12px 0">${sig('receiver', b.receiver_name, b.receiver_at)}</div>
    <h2>ไฟล์แนบ</h2>${b.attachments.length ? b.attachments.map(a => `<div class="att"><a href="/api/attachments/${a.id}" target="_blank">📎 ${esc(a.filename)}</a><small class="muted">${fmtSize(a.size)}</small></div>`).join('') : '<p class="muted">ไม่มี</p>'}
    <h2 style="margin-top:12px">ประวัติการแก้ไข</h2><ul class="hist">${b.history.map(h => `<li><b>${ACT[h.action] || h.action}</b> <small class="muted">${fmtStamp(h.at)}${h.actor ? ' · โดย ' + esc(h.actor) : ''}</small><div>${histText(h)}</div></li>`).join('')}</ul>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-close>ปิด</button><a class="btn" data-print href="#/reports?${qs({ kind: b.kind, scope: 'selected', ids: b.id })}">🖨️ พิมพ์รายการนี้</a>
      ${cancelled ? '' : `<button class="btn danger" data-cancel>ยกเลิกรายการ</button><a class="btn primary" data-edit href="#/edit/${b.id}">✏️ แก้ไข</a>`}</div>`);
  $('[data-close]', m.el).onclick = m.close;
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
  const P = { kind: params.kind === 'out' ? 'out' : 'in', scope: params.scope || (params.ids ? 'selected' : 'month'), year: params.year || cur, month: params.month || mon, ids: params.ids || '' };
  m.innerHTML = header('รายงานและส่งออก') + fontWarning() + `<div class="card"><form id="rf">
    <div class="grid g2"><div><label class="f">ประเภททะเบียน</label><div class="seg" id="kindseg"><label><input type="radio" name="kind" value="in">ทะเบียนหนังสือรับ</label><label><input type="radio" name="kind" value="out">ทะเบียนหนังสือส่ง</label></div></div>
      <div><label class="f">สี</label><div class="seg"><label><input type="radio" name="color" value="1" checked>พิมพ์สี (ข้อมูลสีน้ำเงินหมึกปากกา)</label><label><input type="radio" name="color" value="0">ขาวดำ</label></div></div></div>
    <div class="field" style="margin-top:12px"><label class="f">ขอบเขตรายการ</label><div class="seg" id="scopeseg">
      <label><input type="radio" name="scope" value="month">รายการประจำเดือน</label><label><input type="radio" name="scope" value="year">รายการประจำปี</label><label><input type="radio" name="scope" value="all">ทั้งหมด</label>
      <label><input type="radio" name="scope" value="range">กำหนดช่วงวันที่เอง</label><label><input type="radio" name="scope" value="selected">เฉพาะรายการที่เลือก${P.ids ? ' (' + P.ids.split(',').length + ')' : ''}</label></div></div>
    <div class="row" id="scopeopts"><select id="year" style="width:150px">${years.map(y => `<option value="${y}">พ.ศ. ${y}</option>`).join('')}</select>
      <select id="month" style="width:160px">${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select>
      <span id="rng" class="row"><span>ตั้งแต่</span><span id="rf_from"></span><span>ถึง</span><span id="rf_to"></span></span></div>
    <div class="row" style="margin-top:8px"><label><input type="checkbox" id="cancelled" checked> รวมรายการที่ยกเลิก (แสดงเพื่อให้เลขทะเบียนต่อเนื่อง)</label>
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
      color: val('color'), cancelled: $('#cancelled').checked ? '1' : '0', withFrom: $('#withFrom').checked ? '1' : '0', ...extra });
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
  $('#print').onclick = () => { try { $('#pv').contentWindow.focus(); $('#pv').contentWindow.print(); } catch { window.open(blobUrl, '_blank'); } };
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
  if (params.ids) preview();
}

/* ---------- ตั้งค่า ---------- */
async function viewSettings() {
  const m = shell('settings'); await loadState(); const s = S.st.settings, f = S.st.fonts;
  const counters = await api('/api/counters'); const cy = S.st.year;
  const fontRow = (k, label) => `<div class="field"><label class="f">${label}</label>${f[k] ? `<div class="notice ok">ใช้ไฟล์: <b>${esc(f[k].file)}</b> — ชื่อฟอนต์จากไฟล์: <b>${esc(f[k].full || f[k].family)}</b> (${fmtSize(f[k].size)})</div>` : '<div class="notice warn">ยังไม่ได้นำเข้า</div>'}
    <div class="row"><input type="file" data-font="${k}" accept=".ttf,.otf,.woff"><button class="btn sm danger" data-fontdel="${k}" ${f[k] ? '' : 'hidden'}>ลบฟอนต์</button></div></div>`;
  m.innerHTML = header('ตั้งค่าระบบ') + fontWarning() + `
  <div class="card"><h2>ผู้เข้าเวร (หน้าแรก)</h2><div class="grid g2">
    <div class="field"><label class="f">หัวข้อหน้าแรก</label><input type="text" id="duty_title" value="${esc(s.duty_title)}"></div>
    <div class="field"><label class="f">หน่วยที่ประจำ</label><input type="text" id="duty_unit" value="${esc(s.duty_unit)}"></div></div>
    <div class="field"><label class="f">รายชื่อผู้เข้าเวร <small>(หนึ่งคนต่อหนึ่งบรรทัด)</small></label><textarea id="duty_officers" style="min-height:110px">${esc(officers().join('\n'))}</textarea></div></div>
  <div class="card"><h2>ข้อมูลหน่วยงาน</h2><div class="grid g2">
    <div class="field"><label class="f">ชื่อหน่วยงาน</label><input type="text" id="org_name" class="ink" value="${esc(s.org_name)}"></div>
    <div class="field"><label class="f">ชื่อส่วนราชการ</label><input type="text" id="dept_name" class="ink" value="${esc(s.dept_name)}"></div></div>
    <div class="field"><label class="f">โลโก้หน่วยงาน (PNG/JPG ไม่เกิน 2 MB)</label>${s.logo ? '<img src="/api/logo?' + Date.now() + '" style="height:60px;display:block;margin-bottom:6px" alt="">' : ''}
      <div class="row"><input type="file" id="logo" accept=".png,.jpg,.jpeg"><button class="btn sm danger" id="logodel" ${s.logo ? '' : 'hidden'}>ลบโลโก้</button></div></div></div>
  <div class="card"><h2>เลขทะเบียน</h2><div class="grid g3">
    <div class="field"><label class="f">ปี พ.ศ. ที่ใช้ออกเลข</label><select id="year_mode"><option value="auto">อัตโนมัติ (ตามวันที่ของเครื่อง)</option><option value="manual">กำหนดปีเอง</option></select>
      <input type="number" id="year_val" placeholder="เช่น 2569" style="margin-top:6px" hidden></div>
    <div class="field"><label class="f">รูปแบบเลขทะเบียน <small>({no}=ลำดับ {year}=ปี พ.ศ.)</small></label><input type="text" id="reg_format" value="${esc(s.reg_format)}"></div>
    <div class="field"><label class="f">จำนวนหลักของลำดับ</label><input type="number" id="reg_pad" min="0" max="8" value="${esc(s.reg_pad)}"></div>
    <div class="field"><label class="f">เลขเริ่มต้นทะเบียนรับ (ปีใหม่)</label><input type="number" id="start_in" min="1" value="${esc(s.start_in)}"></div>
    <div class="field"><label class="f">เลขเริ่มต้นทะเบียนส่ง (ปีใหม่)</label><input type="number" id="start_out" min="1" value="${esc(s.start_out)}"></div></div>
    <h2 style="margin-top:8px">เลขถัดไปของแต่ละชุด</h2>
    <div class="tw" style="max-height:none"><table class="t"><thead><tr><th>ชุดเลข</th><th>ปี พ.ศ.</th><th>เลขถัดไป</th><th>ตั้งเลขถัดไปใหม่</th></tr></thead><tbody>${counters.map(c => `<tr><td>${c.kind === 'in' ? 'ทะเบียนรับ' : 'ทะเบียนส่ง'}</td><td>${c.year}</td><td class="regno">${esc(c.next_label)}</td>
      <td><div class="row"><input type="number" min="1" style="width:110px" data-nk="${c.kind}" data-ny="${c.year}" value="${c.next_no}"><button class="btn sm" data-setnext="${c.kind}:${c.year}">ตั้งค่า</button></div></td></tr>`).join('')}</tbody></table></div>
    <p class="muted">ตั้งเลขถัดไปได้เฉพาะเลขที่สูงกว่าเลขที่เคยใช้แล้ว (รวมรายการที่ยกเลิก) เพื่อป้องกันเลขซ้ำ — เมื่อขึ้นปีใหม่ เลขจะเริ่มต้นใหม่ตามเลขเริ่มต้นข้างต้น</p></div>
  <div class="card"><h2>ฟอนต์และสีตัวอักษร</h2>
    ${fontRow('regular', 'ไฟล์ฟอนต์ปกติ (เช่น THSarabunNew.ttf)')}${fontRow('bold', 'ไฟล์ฟอนต์ตัวหนา (เช่น THSarabunNew Bold.ttf — ไม่บังคับ)')}
    <div class="grid g3"><div class="field"><label class="f">ขนาดตัวอักษรบนหน้าจอ (px)</label><input type="number" id="ui_font_size" min="12" max="28" value="${esc(s.ui_font_size)}"></div>
      <div class="field"><label class="f">ขนาดตัวอักษรเมื่อพิมพ์ (pt)</label><input type="number" id="print_font_size" min="8" max="24" value="${esc(s.print_font_size)}"></div>
      <div class="field"><label class="f">สีตัวอักษรข้อมูลที่กรอก</label><div class="row"><input type="color" id="data_color" value="${esc(s.data_color)}" style="width:60px;padding:2px"><span class="muted">ค่าตั้งต้น #174EA6 (น้ำเงินหมึกปากกา)</span></div></div></div></div>
  <div class="card"><h2>ความปลอดภัย</h2><p class="muted">${S.st.has_password ? 'ตั้งรหัสผ่านเข้าใช้งานไว้แล้ว' : 'ยังไม่ได้ตั้งรหัสผ่านเข้าใช้งาน (แนะนำให้ตั้ง โดยเฉพาะเมื่อให้เครื่องอื่นใช้งานร่วมกัน)'}</p>
    <div class="grid g3">${S.st.has_password ? '<div class="field"><label class="f">รหัสผ่านปัจจุบัน</label><input type="password" id="pw_cur" autocomplete="off"></div>' : ''}
    <div class="field"><label class="f">รหัสผ่านใหม่ ${S.st.has_password ? '<small>(เว้นว่างเพื่อลบรหัสผ่าน)</small>' : ''}</label><input type="password" id="pw_new" autocomplete="new-password"></div>
    <div class="field"><label class="f">&nbsp;</label><button class="btn" id="pw_save">บันทึกรหัสผ่าน</button></div></div>
    <p class="muted" style="font-size:.9rem">ข้อมูลทั้งหมดเก็บที่: <code>${esc(S.st.data_dir)}</code> (ไฟล์แนบเข้าถึงได้ผ่านโปรแกรมเท่านั้น ไม่ได้อยู่ในโฟลเดอร์สาธารณะ)</p></div>
  <div class="row"><button class="btn primary big" id="save">💾 บันทึกการตั้งค่า</button></div>`;
  const ym = /^\d{4}$/.test(s.year_mode); $('#year_mode').value = ym ? 'manual' : 'auto'; $('#year_val').value = ym ? s.year_mode : ''; $('#year_val').hidden = !ym;
  $('#year_mode').onchange = () => { $('#year_val').hidden = $('#year_mode').value !== 'manual'; if (!$('#year_val').hidden && !$('#year_val').value) $('#year_val').value = S.st.year; };
  $('#save').onclick = async () => {
    const g = id => $('#' + id).value;
    try {
      await api('/api/settings', { method: 'PUT', json: { duty_title: g('duty_title'), duty_unit: g('duty_unit'), duty_officers: g('duty_officers'), org_name: g('org_name'), dept_name: g('dept_name'), year_mode: g('year_mode') === 'manual' ? g('year_val') : 'auto', reg_format: g('reg_format'), reg_pad: g('reg_pad'),
        start_in: g('start_in'), start_out: g('start_out'), ui_font_size: g('ui_font_size'), print_font_size: g('print_font_size'), data_color: g('data_color') } });
      toast('บันทึกการตั้งค่าเรียบร้อย', 'ok'); await loadState(); viewSettings();
    } catch (e) { toast(e.message, 'err', 7000); }
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
  $('#pw_save').onclick = async () => {
    try { const r = await api('/api/settings/password', { json: { current: $('#pw_cur') ? $('#pw_cur').value : '', next: $('#pw_new').value } }); toast(r.has_password ? 'ตั้งรหัสผ่านแล้ว ต้องเข้าสู่ระบบใหม่' : 'ลบรหัสผ่านแล้ว', 'ok'); setTimeout(() => location.reload(), 800); } catch (e) { toast(e.message, 'err'); }
  };
}

/* ---------- สำรองข้อมูล ---------- */
async function viewBackup() {
  const m = shell('backup'); const b = await api('/api/backup'); const s = S.st.settings;
  const logRows = b.log.map(l => `<div class="notice ${l.ok ? 'ok' : 'err'}">${fmtStamp(l.at)} — ${l.ok ? 'สำรองสำเร็จ: ' + esc(l.name) + ' (' + fmtSize(l.size) + ')' : 'สำรองไม่สำเร็จ: ' + esc(l.error)}</div>`).join('');
  m.innerHTML = header('สำรองและกู้คืนข้อมูล') + `
  <div class="card"><h2>สำรองข้อมูล</h2><p>ไฟล์สำรองเป็น .zip เดียว รวมฐานข้อมูล ไฟล์แนบ ลายเซ็น ฟอนต์ และโลโก้</p>
    <div class="row"><button class="btn primary big" id="run">💾 สำรองข้อมูลตอนนี้</button><label><input type="checkbox" id="auto" ${s.auto_backup === '1' ? 'checked' : ''}> สำรองอัตโนมัติวันละครั้ง (เมื่อเปิดโปรแกรม)</label></div>
    <div class="field" style="margin-top:12px"><label class="f">โฟลเดอร์เก็บไฟล์สำรอง <small>(แนะนำให้เป็นไดรฟ์อื่น/แฟลชไดรฟ์ เช่น D:\\Backup\\Register)</small></label>
      <div class="row"><input type="text" id="bdir" class="grow" value="${esc(s.backup_dir)}" placeholder="${esc(b.dir)}"><button class="btn" id="bdirsave">บันทึกตำแหน่ง</button></div>
      <small class="muted">ตำแหน่งปัจจุบัน: ${esc(b.dir)}</small></div><div id="log">${logRows}</div></div>
  <div class="card"><h2>ไฟล์สำรองที่มี</h2>${b.items.length ? `<table class="t"><thead><tr><th>ชื่อไฟล์</th><th>วันเวลา</th><th>ขนาด</th><th></th></tr></thead><tbody>${b.items.map(i => `<tr><td>${esc(i.name)}</td><td>${fmtStamp(i.at)}</td><td>${fmtSize(i.size)}</td>
    <td class="right"><a class="btn sm" href="/api/backup/download/${encodeURIComponent(i.name)}">ดาวน์โหลด</a> <button class="btn sm danger" data-rs="${esc(i.name)}">กู้คืน</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">ยังไม่มีไฟล์สำรอง</p>'}</div>
  <div class="card"><h2>กู้คืนจากไฟล์ที่เลือก</h2><div class="notice warn">การกู้คืนจะ <b>แทนที่ข้อมูลทั้งหมดในปัจจุบัน</b> ด้วยข้อมูลในไฟล์สำรอง (ระบบจะสำรองข้อมูลปัจจุบันไว้ให้อัตโนมัติก่อนเสมอ ชื่อไฟล์ขึ้นต้น before-restore)</div>
    <div class="row"><input type="file" id="rfile" accept=".zip"><button class="btn danger" id="rbtn">กู้คืนจากไฟล์นี้</button></div></div>`;
  $('#run').onclick = async e => { e.target.disabled = true; const r = await api('/api/backup/run', { method: 'POST' }).catch(er => ({ ok: false, error: er.message })); toast(r.ok ? 'สำรองข้อมูลสำเร็จ: ' + r.name : 'สำรองข้อมูลไม่สำเร็จ: ' + r.error, r.ok ? 'ok' : 'err', 8000); viewBackup(); };
  $('#auto').onchange = async e => { await api('/api/settings', { method: 'PUT', json: { auto_backup: e.target.checked } }); toast('บันทึกแล้ว', 'ok'); };
  $('#bdirsave').onclick = async () => { try { await api('/api/settings', { method: 'PUT', json: { backup_dir: $('#bdir').value } }); toast('บันทึกตำแหน่งสำรองข้อมูลแล้ว', 'ok'); await loadState(); viewBackup(); } catch (e) { toast(e.message, 'err', 8000); } };
  const doRestore = async (fn) => {
    if (!await confirmBox('ยืนยันการกู้คืนข้อมูล', '<p>ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วยข้อมูลจากไฟล์สำรอง ต้องการดำเนินการต่อหรือไม่?</p>', 'กู้คืนข้อมูล', true)) return;
    try { const r = await fn(); toast(`กู้คืนข้อมูลสำเร็จ (สำรองข้อมูลเดิมไว้ที่ ${r.safety})`, 'ok', 9000); await loadState(); setTimeout(() => viewBackup(), 300); } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + e.message, 'err', 9000); }
  };
  $$('[data-rs]').forEach(bt => bt.onclick = () => doRestore(() => api('/api/backup/restore-local', { json: { name: bt.dataset.rs } })));
  $('#rbtn').onclick = () => { const f = $('#rfile').files[0]; if (!f) { toast('กรุณาเลือกไฟล์สำรอง (.zip)', 'err'); return; } doRestore(() => { const fd = new FormData(); fd.append('file', f); return api('/api/backup/restore', { method: 'POST', body: fd }); }); };
}

/* ---------- เข้าสู่ระบบ ---------- */
function viewLogin() {
  $('#app').innerHTML = `<div class="login"><div class="card"><h1 style="font-size:1.4rem">ระบบทะเบียนหนังสือรับ–ส่ง</h1><p class="muted">กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน</p>
    <form id="lf"><div class="field"><input type="password" id="pw" placeholder="รหัสผ่าน" autofocus></div><button class="btn primary big" style="width:100%">เข้าสู่ระบบ</button></form></div></div>`;
  $('#lf').onsubmit = async e => { e.preventDefault(); try { await api('/api/login', { json: { password: $('#pw').value } }); boot(); } catch (er) { toast(er.message, 'err'); } };
}

/* ---------- หน้าแรก: เลือกผู้เข้าเวร ---------- */
function viewDuty() {
  const s = S.st.settings; const list = officers();
  $('#app').innerHTML = `<div class="login" style="max-width:560px"><div class="card" style="text-align:center">
    ${s.logo ? '<img src="/api/logo" alt="" style="height:70px;margin-bottom:6px">' : ''}
    <h1 style="font-size:1.7rem">${esc(s.duty_title)}</h1><p style="font-size:1.2rem;margin:0 0 4px;color:var(--navy)"><b>${esc(s.duty_unit)}</b></p>
    <p class="muted">กรุณาเลือกชื่อผู้เข้าเวรที่กำลังบันทึกทะเบียนหนังสือ</p>
    <div style="display:grid;gap:10px;margin:14px 0">${list.map((n, i) => `<button class="btn primary big" data-i="${i}">👤 ${esc(n)}</button>`).join('') || '<div class="notice warn">ยังไม่มีรายชื่อผู้เข้าเวร</div>'}</div>
    <a href="#/settings" class="muted">⚙️ ตั้งค่ารายชื่อผู้เข้าเวร</a></div></div>`;
  $$('[data-i]').forEach(b => b.onclick = () => { try { sessionStorage.setItem('duty', list[+b.dataset.i]); } catch { /* ignore */ } if (location.hash === '#/dashboard') route(); else location.hash = '#/dashboard'; });
}

/* ---------- เส้นทาง ---------- */
async function route() {
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
    else location.hash = '#/dashboard';
  } catch (e) { if (e.message !== 'กรุณาเข้าสู่ระบบ') { (S.st ? shell('') : $('#app')).innerHTML = `<div class="card notice err" style="margin:20px">${esc(e.message)}</div>`; } }
}
async function boot() {
  setAuthLost(viewLogin);
  const ss = await api('/api/session').catch(e => { $('#app').innerHTML = `<div class="card notice err" style="margin:20px">${esc(e.message)}</div>`; return null; });
  if (!ss) return;
  if (ss.auth_required && !ss.authenticated) return viewLogin();
  route();
}
window.addEventListener('hashchange', () => route());
boot();
