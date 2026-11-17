/* แยกข้อมูลจากข้อความที่อ่านได้ (OCR) ของหนังสือราชการ -> ช่องในทะเบียน
   รองรับ: บันทึกข้อความ (ส่วนราชการ / ที่ ... วันที่ ... / เรื่อง / เรียน)
           หนังสือภายนอก (ที่ ... / วันเดือนปี / เรื่อง / เรียน)
   ใช้ได้ทั้งในเบราว์เซอร์ (window.parseThaiDoc) และ Node (require) */
(function (root) {
  'use strict';
  const TH_DIG = '๐๑๒๓๔๕๖๗๘๙';
  const toArabic = s => String(s).replace(/[๐-๙]/g, d => String(TH_DIG.indexOf(d)));
  const MONTHS = [
    ['มกราคม', 'ม.ค.'], ['กุมภาพันธ์', 'ก.พ.'], ['มีนาคม', 'มี.ค.'], ['เมษายน', 'เม.ย.'], ['พฤษภาคม', 'พ.ค.'], ['มิถุนายน', 'มิ.ย.'],
    ['กรกฎาคม', 'ก.ค.'], ['สิงหาคม', 'ส.ค.'], ['กันยายน', 'ก.ย.'], ['ตุลาคม', 'ต.ค.'], ['พฤศจิกายน', 'พ.ย.'], ['ธันวาคม', 'ธ.ค.'],
  ];
  // OCR มักแทรกช่องว่างกลางคำไทย -> สร้าง regex ที่ยอมให้มีช่องว่างระหว่างตัวอักษร
  const esc = c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loose = w => [...w].map(c => /[\u0E48-\u0E4B]/.test(c) ? esc(c) + '?' : esc(c)).join('\\s*');
  const kw = w => new RegExp('^\\s*' + loose(w) + '\\s*[:：.]?\\s*', 'u');
  const clean = s => String(s || '').replace(/[|_~`]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // ตัดช่องว่างที่ OCR แทรกระหว่างตัวอักษรไทยติดกัน (ไม่ตัดช่องว่างระหว่างคำที่มีตัวเลข/อังกฤษ)
  // (สระบน/ล่าง วรรณยุกต์ และ า ำ ขึ้นต้นคำไม่ได้ ช่องว่างหน้าตัวพวกนี้จึงเป็นของเกินจาก OCR เสมอ)
  const tightThai = s => String(s || '').replace(/\s+(?=[ั-ฺ็-๎])/gu, '').replace(/ํา/g, 'ำ');   // ํ+า -> ำ

  function findDate(text) {
    const t = toArabic(text);
    for (let i = 0; i < 12; i++) {
      for (const name of MONTHS[i]) {
        const re = new RegExp('(\\d{1,3})\\s*' + loose(name) + '\\s*(?:พ\\.?\\s*ศ\\.?\\s*)?(\\d{4}|\\d{2})', 'u');
        const m = t.match(re);
        if (m) {
          // วันที่อ่านเกินมา 1 ตัว (เช่น ๑๔๔) -> ลองสองหลักแรก แล้วสองหลักท้าย
          const ds = m[1]; const d = [+ds, +ds.slice(0, 2), +ds.slice(-2)].find(x => x >= 1 && x <= 31) || 0; let y = +m[2]; if (y < 100) y += 2500; if (y > 2400) y -= 543;
          const now = new Date().getFullYear(); if (Math.abs(y - now) > 1) y = now;
          if (d >= 1 && d <= 31 && y > 1900 && y < 2200) return `${y}-${String(i + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }
    }
    return '';
  }

  function parseThaiDoc(raw) {
    const lines = String(raw || '').split(/\r?\n/).map(l => tightThai(clean(l))).filter(Boolean);
    const out = { book_no: '', book_date: '', subject: '', to_org: '', from_org: '', found: [] };
    const STOP = ['เรียน', 'อ้างถึง', 'สิ่งที่ส่งมาด้วย', 'สิ่งที่แนบมาด้วย', 'ด้วย', 'ตามที่', 'เนื่องด้วย', 'เนื่องจาก'].map(kw);
    const isStop = l => STOP.some(r => r.test(l));
    const reNo = kw('ที่'), reDateWord = new RegExp(loose('วันที่'), 'u');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      // ส่วนราชการ (บันทึกข้อความ) -> จาก
      if (!out.from_org && kw('ส่วนราชการ').test(l)) out.from_org = clean(l.replace(kw('ส่วนราชการ'), '').split(new RegExp(loose('โทร'), 'u'))[0]);
      // ที่ ... (ไม่ใช่ "วันที่")
      if (!out.book_no && reNo.test(l) && !kw('วันที่').test(l)) {
        let rest = l.replace(reNo, '');
        const dw = rest.search(reDateWord);
        if (dw >= 0) { if (!out.book_date) out.book_date = findDate(rest.slice(dw)); rest = rest.slice(0, dw); }
        const slash = rest.match(/^(.*?\/\s*[0-9๐-๙]+(?:\s*[0-9๐-๙])*)/u);
        if (/[0-9๐-๙]/.test(rest)) out.book_no = clean(slash ? slash[1] : rest.slice(0, 60)).replace(/\s*\/\s*/g, '/');
      }
      if (!out.book_date && (reDateWord.test(l) || MONTHS.some(m => m.some(n => new RegExp(loose(n), 'u').test(l))))) out.book_date = findDate(l);
      // เรื่อง (อาจยาวหลายบรรทัด จนถึง เรียน)
      if (!out.subject && kw('เรื่อง').test(l)) {
        const parts = [l.replace(kw('เรื่อง'), '')];
        for (let j = i + 1; j < lines.length && j <= i + 3 && !isStop(lines[j]) && !reNo.test(lines[j]); j++) parts.push(lines[j]);
        out.subject = clean(parts.join(' '));
      }
      if (!out.to_org && kw('เรียน').test(l)) out.to_org = clean(l.replace(kw('เรียน'), ''));
    }
    // ชั้นความเร็ว: ดูเฉพาะหัวหนังสือ (บรรทัดต้นๆ ที่ขึ้นต้นด้วยคำว่า ด่วน) กันคำว่า "โดยด่วน" ในเนื้อหา
    out.urgency = '';
    for (const l of lines.slice(0, 10)) { const t = l.replace(/\s+/g, ''); if (/^ด่วนที่สุด/.test(t)) { out.urgency = 'ด่วนที่สุด'; break; } if (/^ด่วนมาก/.test(t)) { out.urgency = 'ด่วนมาก'; break; } if (/^ด่วน$/.test(t)) { out.urgency = 'ด่วน'; break; } }
    // กำหนด "ภายในวันที่ ..." ในเนื้อหา
    out.due_date = '';
    const all = lines.join(' '); const mm = all.match(new RegExp(loose('ภายใน') + '(?:\\s*' + loose('วันที่') + ')?\\s*(.{0,40})', 'u'));
    if (mm) out.due_date = findDate(mm[1]);
    for (const k of ['book_no', 'book_date', 'subject', 'to_org', 'from_org', 'urgency', 'due_date']) if (out[k]) out.found.push(k);
    return out;
  }

  const CONF = ['๔๕', '๕๘', '๔๘', '๓๙', '๒๖', '๒๗', '๖๗', '๐อ', '๑๙', '๓๕'];
  const subCost = (a, b) => a === b ? 0 : (CONF.some(p => p.includes(a) && p.includes(b)) ? 0.3 : 1);
  function distance(a, b) {
    const m = [...a], n = [...b]; let prev = Array.from({ length: n.length + 1 }, (_, j) => j);
    for (let i = 1; i <= m.length; i++) { const cur = [i]; for (let j = 1; j <= n.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + subCost(m[i - 1], n[j - 1])); prev = cur; }
    return prev[n.length];
  }
  const ns = s => String(s || '').replace(/\s+/g, '');
  // หาตัวเลือกที่ใกล้เคียงที่สุด (เช่น ข้อความจาก OCR -> รายการในตั้งค่า) ยอมให้ต่างกันได้ไม่เกิน maxRatio
  function bestMatch(text, cands, maxRatio = 0.25) {
    const t = ns(text); if (!t) return null; let best = null, br = 9;
    for (const c of cands) for (const v of [c, String(c).replace(/^ผบ\.\s*/, '')]) { const r = distance(t, ns(v)) / Math.max([...t].length, [...ns(v)].length, 1); if (r < br) { br = r; best = c; } }
    return br <= maxRatio ? best : null;
  }
  const api = { parseThaiDoc, findDate, toArabic, bestMatch, distance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
