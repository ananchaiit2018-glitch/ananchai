/* แก้ตัวเลขไทยที่ OCR อ่านผิด (เช่น ๔→๕, ๙→๓, ๘→๕)
   วิธี: ตัดรูปตัวเลขแต่ละตัวจากหน้ากระดาษ แล้วเทียบรูปร่างกับตัวเลขไทยที่วาดจากฟอนต์จริง
   (TH SarabunIT๙ ปกติ/หนา และฟอนต์ไทยอื่น) เลือกตัวที่เหมือนที่สุด — ทำในเครื่อง ไม่ใช้อินเทอร์เน็ต */
(function (root) {
  'use strict';
  const DIG = '๐๑๒๓๔๕๖๗๘๙';
  const GW = 18, GH = 26;                      // ขนาดตารางเทียบรูปร่าง
  const FONTS = ["'RegisterFont'", "'Sarabun'", "'Noto Sans Thai'", "'IBM Plex Sans Thai Looped'", "'Leelawadee UI'", 'Tahoma'];
  let templates = null;

  function grayOf(canvas) {
    const g = canvas.getContext('2d', { willReadFrequently: true }); const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
    const out = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    return out;
  }
  // ค่าแบ่งขาว/ดำแบบ Otsu ภายในกรอบ
  function otsu(gray, W, b) {
    const h = new Array(256).fill(0); let n = 0;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { h[gray[y * W + x]]++; n++; }
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
    let sB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) { wB += h[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * h[t];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = t; } }
    return thr;
  }
  function inkBox(gray, W, b, thr) {
    let x0 = b.x1, y0 = b.y1, x1 = b.x0 - 1, y1 = b.y0 - 1;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (gray[y * W + x] < thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < x0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }
  // ย่อ/ขยายรูปตัวเลขเป็นตาราง GW x GH (ค่าความเข้ม) แล้วปรับให้เทียบกันได้
  function vec(gray, W, b, thr) {
    const v = new Float32Array(GW * GH), bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const sx0 = b.x0 + gx * bw / GW, sx1 = b.x0 + (gx + 1) * bw / GW, sy0 = b.y0 + gy * bh / GH, sy1 = b.y0 + (gy + 1) * bh / GH;
      let s = 0, c = 0;
      for (let y = Math.floor(sy0); y < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); y++) for (let x = Math.floor(sx0); x < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); x++) { s += gray[y * W + x] < thr ? 1 : 0; c++; }
      v[gy * GW + gx] = s / c;
    }
    let m = 0; for (const x of v) m += x; m /= v.length; let n = 0; for (let i = 0; i < v.length; i++) { v[i] -= m; n += v[i] * v[i]; } n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  async function buildTemplates() {
    if (templates) return templates;
    const c = document.createElement('canvas'); c.width = 140; c.height = 140; const g = c.getContext('2d', { willReadFrequently: true });
    const T = [];
    for (const f of FONTS) for (const wt of ['400', '700']) {
      try { await document.fonts.load(`${wt} 90px ${f}`, DIG); } catch { /* ไม่มีฟอนต์นี้ */ }
      if (!document.fonts.check(`${wt} 90px ${f}`, DIG) && !/Tahoma|Leelawadee/.test(f)) continue;
      for (let d = 0; d < 10; d++) {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 140, 140); g.fillStyle = '#000'; g.font = `${wt} 90px ${f}, sans-serif`; g.textBaseline = 'middle'; g.fillText(DIG[d], 25, 70);
        const gray = grayOf(c); const b = inkBox(gray, 140, { x0: 0, y0: 0, x1: 140, y1: 140 }, 128); if (!b) continue;
        T.push({ d, v: vec(gray, 140, b, 128), ar: (b.x1 - b.x0) / (b.y1 - b.y0) });
      }
    }
    templates = T; return T;
  }

  function classify(gray, W, H, bbox, thr, T) {
    const b = { x0: Math.max(0, bbox.x0 - 1), y0: Math.max(0, bbox.y0 - 1), x1: Math.min(W, bbox.x1 + 1), y1: Math.min(H, bbox.y1 + 1) };
    const ib = inkBox(gray, W, b, thr); if (!ib || ib.x1 - ib.x0 < 3 || ib.y1 - ib.y0 < 5) return null;
    const v = vec(gray, W, ib, thr), ar = (ib.x1 - ib.x0) / (ib.y1 - ib.y0);
    const score = new Array(10).fill(-9);
    for (const t of T) { const s = dot(v, t.v) - 0.35 * Math.abs(Math.log(ar / t.ar)); if (s > score[t.d]) score[t.d] = s; }
    return score;
  }

  const isDigit = t => DIG.includes(t) || /^[0-9]$/.test(t);
  const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
  const best = sc => { let b = 0; for (let d = 1; d < 10; d++) if (sc[d] > sc[b]) b = d; return b; };

  // อ่านตัวเลขในช่วง x0..x1 ของบรรทัดเอง: แยกตัวด้วยคอลัมน์ว่าง แล้วเทียบรูปร่างทีละตัว
  function readDigitRun(gray, W, H, thr, T, x0, x1, y0, y1, hintW, hintH) {
    const col = new Int32Array(x1 - x0);
    for (let x = x0; x < x1; x++) { let c = 0; for (let y = y0; y < y1; y++) if (gray[y * W + x] < thr) c++; col[x - x0] = c; }
    let segs = []; let s = -1;
    for (let i = 0; i <= col.length; i++) { const on = i < col.length && col[i] > 0; if (on && s < 0) s = i; if (!on && s >= 0) { segs.push([x0 + s, x0 + i]); s = -1; } }
    const mw = hintW || median(segs.map(g => g[1] - g[0])) || 1;
    segs = segs.filter(g => g[1] - g[0] >= mw * 0.2);
    const parts = [];
    for (const [a, b] of segs) { const n = Math.max(1, Math.round((b - a) / (mw * 1.05))); for (let k = 0; k < n; k++) parts.push([Math.round(a + (b - a) * k / n), Math.round(a + (b - a) * (k + 1) / n)]); }
    let out = '';
    for (const [a, b] of parts) {
      const ib = inkBox(gray, W, { x0: a, y0, x1: b, y1 }, thr); if (!ib || ib.y1 - ib.y0 < 4) continue;
      const hh = hintH || (y1 - y0) / 1.85; if ((ib.y1 - ib.y0) < hh * 0.3 && (ib.x1 - ib.x0) < hh * 0.35) { out += '.'; continue; }      // จุด (เช่น ๕๑๑๙.๑)
      const sc = classify(gray, W, H, ib, thr, T); if (sc && sc[best(sc)] > 0.35) out += DIG[best(sc)];
    }
    return out;
  }

  // คืนข้อความทั้งหน้าที่แก้ตัวเลขไทยแล้ว (ใส่ช่องว่างเฉพาะที่มีระยะห่างจริงบนกระดาษ)
  async function fixThaiDigits(blocks, canvas) {
    if (!blocks || !blocks.length) return null;
    const T = await buildTemplates(); if (!T.length) return null;
    const W = canvas.width, H = canvas.height, gray = grayOf(canvas); const thr = otsu(gray, W, { x0: 0, y0: 0, x1: W, y1: H });
    const lines = [];
    for (const bl of blocks) for (const pa of bl.paragraphs || []) for (const li of pa.lines || []) {
      const syms = []; for (const w of li.words || []) for (const sy of w.symbols || []) if (sy.bbox) syms.push({ t: sy.text, b: sy.bbox });
      if (!syms.length) continue;
      const lb = li.bbox || { y0: Math.min(...syms.map(x => x.b.y0)), y1: Math.max(...syms.map(x => x.b.y1)) };
      const lh = lb.y1 - lb.y0; const gapSpace = lh * 0.28;
      // หาช่วงตัวเลขต่อเนื่อง (รวมจุดคั่นระหว่างตัวเลข)
      const items = []; let i = 0;
      while (i < syms.length) {
        if (!isDigit(syms[i].t)) { items.push(syms[i]); i++; continue; }
        let j = i; while (j + 1 < syms.length && (isDigit(syms[j + 1].t) || (syms[j + 1].t === '.' && j + 2 < syms.length && isDigit(syms[j + 2].t))) && syms[j + 1].b.x0 - syms[j].b.x1 < lh * 0.5) j++;
        const run = syms.slice(i, j + 1); const dw = median(run.filter(x => isDigit(x.t)).map(x => x.b.x1 - x.b.x0));
        let x0 = run[0].b.x0, x1 = run[run.length - 1].b.x1;
        const dg = run.filter(x => isDigit(x.t)); const dh = median(dg.map(x => x.b.y1 - x.b.y0)) || lh * 0.5;
        const by0 = Math.max(0, Math.round(median(dg.map(x => x.b.y0)) - dh * 0.6)), by1 = Math.min(H, Math.round(median(dg.map(x => x.b.y1)) + dh * 0.25));
        // ขยายไปทางขวา/ซ้าย เผื่อ OCR ทำตัวเลขหล่นหาย (หยุดเมื่อเจอช่องว่างกว้าง หรือชนตัวอักษรถัดไป)
        const stopR = (j + 1 < syms.length ? syms[j + 1].b.x0 : W) - Math.round(dw * 0.25), stopL = (i > 0 ? syms[i - 1].b.x1 : 0) + Math.round(dw * 0.25);
        const inkCol = x => { for (let y = by0; y < by1; y++) if (gray[y * W + x] < thr) return true; return false; };
        for (let x = x1, empty = 0; x < stopR - 1 && empty < dw * 0.6; x++) { if (inkCol(x)) { x1 = x + 1; empty = 0; } else empty++; }
        for (let x = x0 - 1, empty = 0; x > stopL + 1 && empty < dw * 0.6; x--) { if (inkCol(x)) { x0 = x; empty = 0; } else empty--; if (empty < -dw * 0.6) break; }
        // ค่าแบ่งขาว/ดำเฉพาะบริเวณนี้ (รูปมัว/แสงไม่เท่ากัน)
        const pad = Math.round(dh), lt = otsu(gray, W, { x0: Math.max(0, x0 - pad), y0: by0, x1: Math.min(W, x1 + pad), y1: by1 });
        let txt = readDigitRun(gray, W, H, Math.min(255, lt + 8), T, x0, x1, by0, by1, dw, dh);
        // ผลดูไม่สมเหตุสมผล (ขึ้นต้นด้วยจุด / จำนวนตัวเลขต่างจาก OCR มาก) -> ใช้ของ OCR เดิม
        const nd = t => (t.match(/[๐-๙0-9]/g) || []).length, ocrTxt = run.map(x => x.t).join('');
        if (!txt || /^\./.test(txt) || /\.$/.test(txt) && !/\.$/.test(ocrTxt) || Math.abs(nd(txt) - nd(ocrTxt)) > 1) txt = ocrTxt;
        if (root.__ocrDebug) root.__ocrDebug.push({ x0, x1, y0: by0, y1: by1, ocr: run.map(x => x.t).join(''), txt, syms: run.map(x => x.b) });
        items.push({ t: txt || run.map(x => x.t).join(''), b: { x0, x1, y0: by0, y1: by1 }, run: true });
        i = j + 1;
      }
      let line = '', prevX1 = null;
      for (const it of items) { if (prevX1 !== null && it.b.x0 - prevX1 > gapSpace) line += ' '; line += it.t; prevX1 = Math.max(prevX1 ?? 0, it.b.x1); }
      // ใช้ข้อความบรรทัดเดิมของ OCR (เว้นวรรคเป็นธรรมชาติ) แล้วแทนเฉพาะกลุ่มตัวเลขที่แก้แล้ว
      const runs = items.filter(x => x.run).map(x => x.t); const base = String(li.text || '').replace(/\n$/, '');
      const re = /[๐-๙0-9](?:[๐-๙0-9.]*[๐-๙0-9])?/g; const ms = base.match(re) || [];
      if (base && ms.length === runs.length) { let k = 0; lines.push(base.replace(re, () => runs[k++])); } else lines.push(line);
    }
    return { text: lines.join('\n') };
  }

  root.fixThaiDigits = fixThaiDigits;
})(window);
