// ฉากลอยกระทงแบบเรียลไทม์ — วาดด้วย Canvas ขนาด 1080x1920 (แนวตั้ง 9:16 สำหรับ TikTok LIVE)
(() => {
  'use strict';
  const C = window.LK_CONFIG;
  const cv = document.getElementById('scene');
  const ctx = cv.getContext('2d');
  const W = 1080, H = 1920;
  const params = new URLSearchParams(location.search);
  const FONT = '"Kanit", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';

  // ---------- พิกัดฉาก ----------
  const RIVER_TOP = 905, RIVER_BOT = 1290;
  const BANK_Y = 1338;
  const PLAZA_TOP = 1385;
  const SHRINE = { x: 165, y: 1500 };
  const STAGE = { x: 560, y: 1560, rx: 225, ry: 78 };
  const SHOP = { x: 945, y: 1490 };
  const WHEEL = { x: 905, y: 735, r: 150 };
  const MOON = { x: 680, y: 610, r: 82 };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now();
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) | 0; return Math.abs(h); };

  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    cv.style.width = W * s + 'px';
    cv.style.height = H * s + 'px';
  }
  addEventListener('resize', fit);
  fit();

  // ---------- รูปโปรไฟล์ ----------
  const imgCache = new Map();
  function getImg(url) {
    if (!url) return null;
    let im = imgCache.get(url);
    if (!im) {
      im = new Image();
      im.referrerPolicy = 'no-referrer';
      im.src = url;
      imgCache.set(url, im);
      if (imgCache.size > 600) imgCache.delete(imgCache.keys().next().value);
    }
    return im.complete && im.naturalWidth ? im : null;
  }

  // ---------- ตัวช่วยวาด ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  function wrap(text, maxW, maxLines = 3) {
    const parts = seg ? Array.from(seg.segment(text), s => s.segment) : Array.from(text);
    const lines = [];
    let line = '';
    for (const p of parts) {
      const test = line + p;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line.trim());
        line = p;
        if (lines.length === maxLines) break;
      } else line = test;
    }
    if (lines.length < maxLines && line.trim()) lines.push(line.trim());
    return lines;
  }
  function fitText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    const chars = Array.from(text);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
    return chars.join('') + '…';
  }
  function label(text, x, y, size = 16, bg = 'rgba(10,12,40,.72)', fg = '#fff') {
    ctx.font = `600 ${size}px ${FONT}`;
    const t = fitText(text, 170);
    const w = ctx.measureText(t).width + size;
    rr(x - w / 2, y - size * 0.75, w, size * 1.5, size * 0.75);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y + 1);
  }
  function bubble(text, x, y, sub) {
    ctx.font = `600 22px ${FONT}`;
    const lines = wrap(text, 280, 3);
    const lh = 28;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width), sub ? 60 : 0) + 30;
    const h = lines.length * lh + (sub ? 22 : 0) + 16;
    const bx = clamp(x - w / 2, 8, W - w - 8), by = y - h - 14;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 10;
    rr(bx, by, w, h, 14);
    ctx.fillStyle = 'rgba(32,24,84,.9)';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,215,120,.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 9, by + h);
    ctx.lineTo(x, by + h + 12);
    ctx.lineTo(x + 9, by + h);
    ctx.fillStyle = 'rgba(32,24,84,.9)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + 8 + i * lh));
    if (sub) {
      ctx.font = `600 16px ${FONT}`;
      ctx.fillStyle = '#ffd36b';
      ctx.fillText(fitText(sub, w - 20), bx + w / 2, by + 10 + lines.length * lh);
    }
  }
  function avatarCircle(url, name, x, y, r, ring = '#fff') {
    const im = getImg(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (im) ctx.drawImage(im, x - r, y - r, r * 2, r * 2);
    else drawFace(name, x, y, r);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = ring;
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.stroke();
  }
  // หน้าการ์ตูนสำรอง (ตอนไม่มีรูปโปรไฟล์)
  const HAIR = ['#2b1d16', '#3d2a1e', '#1a1a2e', '#5a3a22', '#7a4a2a', '#222'];
  function drawFace(name, x, y, r) {
    const h = hash(name);
    ctx.fillStyle = ['#f6d3b5', '#eec29d', '#e2ad86', '#f9dcc4'][h % 4];
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = HAIR[h % HAIR.length];
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.55, r * 1.1, r * 0.75, 0, Math.PI, 0);
    ctx.fill();
    if (h % 3 === 0) { ctx.fillStyle = '#ff7aa8'; ctx.beginPath(); ctx.arc(x + r * 0.55, y - r * 0.55, r * 0.22, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#2a1a12';
    ctx.beginPath(); ctx.arc(x - r * 0.33, y + r * 0.05, r * 0.11, 0, 7); ctx.arc(x + r * 0.33, y + r * 0.05, r * 0.11, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,140,.45)';
    ctx.beginPath(); ctx.arc(x - r * 0.5, y + r * 0.32, r * 0.14, 0, 7); ctx.arc(x + r * 0.5, y + r * 0.32, r * 0.14, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a3a2a';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath(); ctx.arc(x, y + r * 0.3, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }

  // ---------- ฉากหลัง (วาดครั้งเดียวเก็บไว้) ----------
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  const stars = Array.from({ length: 140 }, () => ({ x: rand(0, W), y: rand(0, 820), r: rand(0.6, 2.2), p: rand(0, 6) }));

  function renderBackground() {
    const g = bg.getContext('2d');
    // ท้องฟ้า
    let gr = g.createLinearGradient(0, 0, 0, RIVER_TOP);
    gr.addColorStop(0, '#070a26'); gr.addColorStop(0.5, '#1b1f55'); gr.addColorStop(0.85, '#432d66'); gr.addColorStop(1, '#7a3f5a');
    g.fillStyle = gr; g.fillRect(0, 0, W, RIVER_TOP);
    for (const s of stars) { g.fillStyle = `rgba(255,255,255,${0.35 + s.r / 4})`; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill(); }
    // พระจันทร์เต็มดวง
    gr = g.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.6, MOON.x, MOON.y, MOON.r * 3.2);
    gr.addColorStop(0, 'rgba(255,236,170,.55)'); gr.addColorStop(1, 'rgba(255,236,170,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, RIVER_TOP);
    gr = g.createRadialGradient(MOON.x - 20, MOON.y - 20, 10, MOON.x, MOON.y, MOON.r);
    gr.addColorStop(0, '#fffbe6'); gr.addColorStop(1, '#f6d77e');
    g.fillStyle = gr; g.beginPath(); g.arc(MOON.x, MOON.y, MOON.r, 0, 7); g.fill();
    g.fillStyle = 'rgba(200,160,80,.18)';
    [[-25, -10, 18], [20, 25, 14], [30, -30, 9], [-10, 35, 10]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(MOON.x + dx, MOON.y + dy, r, 0, 7); g.fill(); });
    // ทิวไม้/ตึกไกล ๆ
    g.fillStyle = '#1a1336';
    g.beginPath(); g.moveTo(0, RIVER_TOP);
    for (let x = 0; x <= W; x += 30) g.lineTo(x, 860 - Math.abs(Math.sin(x * 0.013)) * 30 - (x % 90 === 0 ? 12 : 0));
    g.lineTo(W, RIVER_TOP); g.fill();
    // วัด (สีทองเรืองแสง)
    g.save(); g.shadowColor = 'rgba(255,190,80,.8)'; g.shadowBlur = 30;
    templeHall(g, 95, 892, 150);
    prang(g, 160, 895, 110, 42);
    prang(g, 640, 895, 120, 44);
    prang(g, 255, 895, 185, 62);
    prang(g, 545, 895, 185, 62);
    prang(g, 400, 895, 335, 105);
    g.restore();
    // ไฟริมฝั่งไกล
    for (let x = 10; x < W; x += 22) { g.fillStyle = `hsla(${35 + (x % 3) * 10},100%,${65 + (x % 5) * 4}%,.9)`; g.beginPath(); g.arc(x, 897 + (x % 7) * 0.6, 2.2, 0, 7); g.fill(); }
    // แม่น้ำ
    gr = g.createLinearGradient(0, RIVER_TOP, 0, RIVER_BOT);
    gr.addColorStop(0, '#1d1d4f'); gr.addColorStop(0.4, '#14204a'); gr.addColorStop(1, '#0a1534');
    g.fillStyle = gr; g.fillRect(0, RIVER_TOP, W, RIVER_BOT - RIVER_TOP);
    // เงาวัดในน้ำ
    g.save(); g.globalAlpha = 0.12; g.translate(0, RIVER_TOP * 2 + 10); g.scale(1, -1);
    g.drawImage(bg, 0, 520, W, RIVER_TOP - 520, 0, 520, W, RIVER_TOP - 520);
    g.restore();
    // บันไดท่าน้ำ
    for (let i = 0; i < 4; i++) {
      const y = RIVER_BOT + i * 24;
      gr = g.createLinearGradient(0, y, 0, y + 24);
      gr.addColorStop(0, '#d9a56a'); gr.addColorStop(0.2, '#a8743f'); gr.addColorStop(1, '#6e4524');
      g.fillStyle = gr; g.fillRect(0, y, W, 24);
    }
    // ลานงาน
    gr = g.createLinearGradient(0, PLAZA_TOP - 30, 0, H);
    gr.addColorStop(0, '#b9844e'); gr.addColorStop(0.4, '#9a6a3d'); gr.addColorStop(1, '#5d3c22');
    g.fillStyle = gr; g.fillRect(0, PLAZA_TOP - 30, W, H - PLAZA_TOP + 30);
    g.strokeStyle = 'rgba(60,35,15,.28)'; g.lineWidth = 1.5;
    for (let y = PLAZA_TOP; y < H; y += 26 + (y - PLAZA_TOP) * 0.04) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = -14; i <= 14; i++) { g.beginPath(); g.moveTo(W / 2 + i * 40, PLAZA_TOP - 30); g.lineTo(W / 2 + i * 110, H); g.stroke(); }
    // แสงอุ่นกลางลาน
    gr = g.createRadialGradient(W / 2, 1620, 50, W / 2, 1620, 650);
    gr.addColorStop(0, 'rgba(255,200,120,.28)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.fillRect(0, PLAZA_TOP - 30, W, H);
    shrine(g);
    stage(g);
    shop(g);
  }

  function prang(g, x, baseY, h, w) {
    const gold = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gold.addColorStop(0, '#a8661e'); gold.addColorStop(0.45, '#ffd877'); gold.addColorStop(1, '#b8742a');
    g.fillStyle = gold;
    const baseH = h * 0.18;
    g.fillRect(x - w * 0.62, baseY - baseH * 0.45, w * 1.24, baseH * 0.45);
    g.fillRect(x - w * 0.52, baseY - baseH, w * 1.04, baseH * 0.55);
    const top = baseY - h, bodyB = baseY - baseH, bodyH = bodyB - top;
    g.beginPath();
    g.moveTo(x - w * 0.45, bodyB);
    g.bezierCurveTo(x - w * 0.47, bodyB - bodyH * 0.45, x - w * 0.2, bodyB - bodyH * 0.75, x - w * 0.04, top + bodyH * 0.12);
    g.lineTo(x, top);
    g.lineTo(x + w * 0.04, top + bodyH * 0.12);
    g.bezierCurveTo(x + w * 0.2, bodyB - bodyH * 0.75, x + w * 0.47, bodyB - bodyH * 0.45, x + w * 0.45, bodyB);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,60,10,.55)'; g.lineWidth = 1.5;
    for (let i = 1; i < 7; i++) {
      const yy = bodyB - bodyH * i * 0.11;
      const ww = w * 0.45 * (1 - i * 0.11);
      g.beginPath(); g.moveTo(x - ww, yy); g.lineTo(x + ww, yy); g.stroke();
    }
    g.fillStyle = 'rgba(255,240,190,.9)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + (i - 2.5) * w * 0.14, bodyB - 6, 2, 0, 7); g.fill(); }
  }
  function templeHall(g, x, baseY, w) {
    g.fillStyle = '#b06a22'; g.fillRect(x - w / 2, baseY - 40, w, 40);
    const roof = (y, ww, hh, col) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(x - ww / 2, y); g.lineTo(x, y - hh); g.lineTo(x + ww / 2, y); g.closePath(); g.fill();
    };
    roof(baseY - 38, w * 1.15, 40, '#8f2b2b');
    roof(baseY - 58, w * 0.85, 50, '#a83a2a');
    roof(baseY - 80, w * 0.55, 55, '#c9902c');
    g.strokeStyle = '#ffd877'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, baseY - 135); g.quadraticCurveTo(x + 6, baseY - 150, x + 14, baseY - 148); g.stroke();
  }
  function shrine(g) {
    const { x, y } = SHRINE;
    g.save();
    let gr = g.createRadialGradient(x, y - 60, 10, x, y - 60, 170);
    gr.addColorStop(0, 'rgba(255,210,120,.55)'); gr.addColorStop(1, 'rgba(255,210,120,0)');
    g.fillStyle = gr; g.fillRect(x - 180, y - 230, 360, 300);
    g.fillStyle = '#7a4a24'; g.fillRect(x - 115, y - 10, 230, 26);
    g.fillStyle = '#c99a52'; g.fillRect(x - 105, y - 22, 210, 14);
    g.fillStyle = '#b8742a';
    [-90, -32, 32, 90].forEach(dx => g.fillRect(x + dx - 6, y - 150, 12, 130));
    // หลังคาซ้อน
    [[y - 150, 280, 45, '#8f2b2b'], [y - 185, 210, 45, '#a83a2a'], [y - 218, 130, 45, '#c9902c']].forEach(([yy, ww, hh, col]) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(x - ww / 2, yy); g.lineTo(x, yy - hh); g.lineTo(x + ww / 2, yy); g.closePath(); g.fill();
      g.strokeStyle = '#ffd877'; g.lineWidth = 3; g.stroke();
    });
    // พานดอกไม้ธูปเทียน
    gr = g.createLinearGradient(0, y - 80, 0, y - 22);
    gr.addColorStop(0, '#ffe7a0'); gr.addColorStop(1, '#c08a2c');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - 30, y - 22); g.lineTo(x - 18, y - 50); g.lineTo(x + 18, y - 50); g.lineTo(x + 30, y - 22); g.fill();
    g.beginPath(); g.ellipse(x, y - 58, 26, 14, 0, 0, 7); g.fillStyle = '#f2a33a'; g.fill();
    ['#ff6fa3', '#ffd23f', '#fff', '#ff9f43'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(x - 15 + i * 10, y - 64 - (i % 2) * 5, 7, 0, 7); g.fill(); });
    [-70, -50, 50, 70].forEach(dx => { g.fillStyle = '#fff7e0'; g.fillRect(x + dx - 3, y - 50, 6, 28); });
    g.restore();
  }
  function stage(g) {
    const { x, y, rx, ry } = STAGE;
    g.fillStyle = '#5a3418'; g.beginPath(); g.ellipse(x, y + 14, rx + 6, ry + 6, 0, 0, 7); g.fill();
    const gr = g.createLinearGradient(0, y - ry, 0, y + ry);
    gr.addColorStop(0, '#d39a5b'); gr.addColorStop(1, '#8e5a2c');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,50,20,.35)'; g.lineWidth = 2;
    for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(x + i * 48, y - ry * Math.sqrt(1 - Math.min(1, (i * 48 / rx) ** 2))); g.lineTo(x + i * 48, y + ry * Math.sqrt(1 - Math.min(1, (i * 48 / rx) ** 2))); g.stroke(); }
    // พวงมาลัยดาวเรือง
    for (let a = 0; a < Math.PI; a += 0.09) {
      const px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry + 4;
      g.fillStyle = a * 10 % 2 < 1 ? '#ffb020' : '#ff8a00';
      g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill();
    }
    for (let a = 0.25; a < Math.PI; a += 0.45) {
      const px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry + 10;
      g.fillStyle = '#fff2f6'; g.beginPath(); g.ellipse(px, py + 12, 4, 12, 0, 0, 7); g.fill();
      g.fillStyle = '#ff6f91'; g.beginPath(); g.arc(px, py + 25, 4, 0, 7); g.fill();
    }
    // โต๊ะพานกลางเวที
    g.fillStyle = '#fff6ea'; g.beginPath(); g.moveTo(x - 30, y - 2); g.lineTo(x - 24, y - 34); g.lineTo(x + 24, y - 34); g.lineTo(x + 30, y - 2); g.fill();
    g.fillStyle = '#e8b53a'; g.beginPath(); g.ellipse(x, y - 40, 22, 9, 0, 0, 7); g.fill();
    ['#ff8fb8', '#ff5d8f', '#ffc2d6'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(x - 26 + i * 26, y - 54 - (i === 1 ? 6 : 0), 10, 0, 7); g.fill(); });
  }
  function shop(g) {
    const { x, y } = SHOP;
    g.fillStyle = '#6b3d1d'; g.fillRect(x - 95, y - 40, 190, 90);
    g.fillStyle = '#e8d2b0'; g.fillRect(x - 100, y - 48, 200, 14);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#fff4f4' : '#e24a5a';
      g.beginPath(); g.moveTo(x - 110 + i * 27.5, y - 140); g.lineTo(x - 110 + (i + 1) * 27.5, y - 140); g.lineTo(x - 110 + (i + 1) * 27.5, y - 110);
      g.quadraticCurveTo(x - 110 + (i + 0.5) * 27.5, y - 98, x - 110 + i * 27.5, y - 110); g.fill();
    }
    g.fillStyle = '#8a5528'; g.fillRect(x - 100, y - 145, 8, 100); g.fillRect(x + 92, y - 145, 8, 100);
    for (let i = 0; i < 5; i++) miniKrathong(g, x - 72 + i * 36, y - 52, ['#ff8fb8', '#ffd23f', '#9bf', '#ff9f43', '#c5f'][i]);
    for (let i = 0; i < 4; i++) miniKrathong(g, x - 54 + i * 36, y - 20, ['#ffd23f', '#ff8fb8', '#ff9f43', '#9bf'][i]);
  }
  function miniKrathong(g, x, y, col) {
    g.fillStyle = '#3f9b4a'; g.beginPath(); g.ellipse(x, y, 15, 7, 0, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(x, y - 6, 9, Math.PI, 0); g.fill();
    g.fillStyle = '#fff'; g.fillRect(x - 1, y - 20, 2, 8);
  }

  // ---------- ข้อความป้าย (วาดทุกเฟรมให้ฟอนต์ไทยโหลดทัน) ----------
  function sign(text, x, y, sub) {
    ctx.font = `800 30px ${FONT}`;
    const w = Math.max(ctx.measureText(text).width, sub ? (ctx.font = `600 17px ${FONT}`, ctx.measureText(sub).width) : 0) + 40;
    const h = sub ? 70 : 48;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 8;
    rr(x - w / 2, y - h / 2, w, h, 12);
    ctx.fillStyle = 'rgba(38,26,92,.92)'; ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#f3c55a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ffd877'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(text, x, y - (sub ? 11 : -1));
    if (sub) { ctx.font = `600 17px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(sub, x, y + 20); }
  }

  // ---------- ชิงช้าสวรรค์ ----------
  const GONDOLAS = 8;
  const riders = Array.from({ length: GONDOLAS }, () => []);
  let wheelAngle = 0;
  function gondolaPos(i) {
    const a = wheelAngle + (i / GONDOLAS) * Math.PI * 2;
    return { x: WHEEL.x + Math.cos(a) * WHEEL.r, y: WHEEL.y + Math.sin(a) * WHEEL.r };
  }
  function drawWheel(t) {
    const { x, y, r } = WHEEL;
    ctx.save();
    ctx.strokeStyle = '#6c5a9e'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 80, 900); ctx.moveTo(x, y); ctx.lineTo(x + 80, 900); ctx.stroke();
    ctx.shadowColor = '#ff7ad9'; ctx.shadowBlur = 18;
    ctx.lineWidth = 4;
    for (let ring = 0; ring < 2; ring++) {
      ctx.strokeStyle = ring ? '#ff9de6' : '#9ad8ff';
      ctx.beginPath(); ctx.arc(x, y, r - ring * 22, 0, 7); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,220,255,.7)';
    for (let i = 0; i < 16; i++) {
      const a = wheelAngle + i * Math.PI / 8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke();
    }
    for (let i = 0; i < 32; i++) {
      const a = wheelAngle + i * Math.PI / 16;
      ctx.fillStyle = `hsl(${(i * 30 + t * 120) % 360},100%,75%)`;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 3.5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#ffd877'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
    for (let i = 0; i < GONDOLAS; i++) {
      const p = gondolaPos(i);
      const cols = ['#ff7aa8', '#7ad0ff', '#ffd23f', '#9f7aff'];
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + 10); ctx.stroke();
      riders[i].forEach((c, k) => avatarCircle(c.avatar, c.name, p.x - 10 + k * 20, p.y + 16, 13, outfitOf(c).sash));
      rr(p.x - 22, p.y + 10, 44, 30, 8);
      ctx.fillStyle = cols[i % 4]; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(p.x - 18, p.y + 14, 36, 4);
      if (riders[i].length) label(riders[i][0].name, p.x, p.y + 52, 13);
    }
    ctx.restore();
  }

  // ---------- น้ำ / ไฟ ----------
  function drawWaterFx(t) {
    ctx.save();
    // แสงจันทร์ในน้ำ
    for (let i = 0; i < 26; i++) {
      const y = RIVER_TOP + 12 + i * 14;
      const w = (40 + Math.sin(t * 1.5 + i) * 18) * (1 + i * 0.05);
      const x = MOON.x + Math.sin(t * 0.8 + i * 1.7) * 10;
      ctx.fillStyle = `rgba(255,225,140,${0.42 - i * 0.012})`;
      ctx.fillRect(x - w / 2, y, w, 3);
    }
    // ประกายแสงไฟริมฝั่ง
    ctx.fillStyle = 'rgba(255,190,90,.22)';
    for (let i = 0; i < 46; i++) {
      const x = (i * 97 + t * 12) % W, y = RIVER_TOP + 8 + (i * 53) % (RIVER_BOT - RIVER_TOP - 20);
      ctx.fillRect(x, y, 14 + (i % 4) * 8, 2);
    }
    ctx.restore();
  }
  function drawBankLights(t) {
    ctx.save();
    for (let x = 60; x < W; x += 160) {
      const y = RIVER_BOT - 6;
      ctx.fillStyle = '#5a3418'; ctx.fillRect(x - 5, y - 58, 10, 60);
      const fl = 0.85 + Math.sin(t * 6 + x) * 0.08;
      const gr = ctx.createRadialGradient(x, y - 66, 2, x, y - 66, 60);
      gr.addColorStop(0, `rgba(255,214,120,${0.9 * fl})`); gr.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - 60, y - 126, 120, 120);
      rr(x - 11, y - 82, 22, 30, 5); ctx.fillStyle = '#ffd877'; ctx.fill();
      ctx.fillStyle = 'rgba(255,200,90,.25)'; ctx.fillRect(x - 3, y + 6, 6, 70);
    }
    // สายไฟประดับ
    for (let row = 0; row < 2; row++) {
      const y0 = PLAZA_TOP - 10 + row * 34;
      ctx.strokeStyle = 'rgba(40,30,20,.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) ctx.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 3) * 14);
      ctx.stroke();
      for (let x = 20; x < W; x += 40) {
        const y = y0 + Math.sin((x / W) * Math.PI * 3) * 14 + 6;
        const on = (Math.floor(t * 3) + x / 40 + row) % 4 !== 0;
        ctx.fillStyle = on ? ['#ffe08a', '#ff8fc8', '#8fe3ff', '#b6ff8f'][(x / 40 + row) % 4] : 'rgba(255,255,255,.3)';
        ctx.beginPath(); ctx.arc(x, y, on ? 5 : 3.5, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- กระทง ----------
  const krathongs = [];
  const KSIZE = { leaf: 1, lotus: 1.05, rainbow: 1.15, gold: 1.35, swan: 1.6, boat: 2.3 };
  function spawnKrathong(o) {
    krathongs.push({
      kind: o.kind || 'leaf', x: o.x, y: RIVER_BOT - 5,
      lane: rand(RIVER_TOP + 70, RIVER_BOT - 40),
      speed: rand(18, 34) * (o.kind === 'boat' ? 0.75 : 1),
      wish: o.wish || '', name: o.name || '', avatar: o.avatar || '', born: now(),
      wishMs: o.kind && o.kind !== 'leaf' ? 14000 : 9000, phase: rand(0, 6),
    });
    if (krathongs.length > 140) krathongs.splice(0, krathongs.length - 140);
  }
  function persp(y) { return 0.5 + clamp((y - RIVER_TOP) / (RIVER_BOT - RIVER_TOP), 0, 1) * 0.55; }
  function updateKrathongs(dt) {
    for (const k of krathongs) {
      k.x += k.speed * dt * persp(k.y);
      k.y += (k.lane - k.y) * Math.min(1, dt * 0.45);
    }
    for (let i = krathongs.length - 1; i >= 0; i--) if (krathongs[i].x > W + 160) krathongs.splice(i, 1);
  }
  function drawKrathong(k, t) {
    const s = persp(k.y) * KSIZE[k.kind];
    const bob = Math.sin(t * 2 + k.phase) * 2;
    ctx.save();
    ctx.translate(k.x, k.y + bob);
    // แสงเทียนสะท้อนน้ำ
    const gr = ctx.createRadialGradient(0, 4, 2, 0, 4, 70 * s);
    gr.addColorStop(0, 'rgba(255,190,90,.45)'); gr.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 6, 80 * s, 26 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,110,.25)'; ctx.fillRect(-3 * s, 10 * s, 6 * s, 40 * s);
    ctx.scale(s, s);
    KDRAW[k.kind](t + k.phase);
    ctx.restore();
  }
  function candle(x, y, t, h = 22) {
    ctx.fillStyle = '#fff6e0'; ctx.fillRect(x - 3, y - h, 6, h);
    const f = 1 + Math.sin(t * 13) * 0.15;
    ctx.save();
    ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.ellipse(x, y - h - 7 * f, 4, 8 * f, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y - h - 5, 1.6, 3.5, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  function incense(x, y) {
    ctx.strokeStyle = '#c87a3a'; ctx.lineWidth = 1.6;
    [-5, 0, 5].forEach(d => { ctx.beginPath(); ctx.moveTo(x + d * 0.4, y); ctx.lineTo(x + d, y - 36); ctx.stroke(); ctx.fillStyle = '#ff4a2a'; ctx.fillRect(x + d - 1, y - 38, 2.4, 3); });
  }
  function leafBase(col = '#3f9b4a', edge = '#7fd17a', w = 34) {
    ctx.fillStyle = '#2b6e33'; ctx.beginPath(); ctx.ellipse(0, 0, w, w * 0.32, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 9; i++) {
      const x = -w + (i + 0.5) * (2 * w / 9);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 6, 4); ctx.lineTo(x, -14 - (i % 2) * 4); ctx.lineTo(x + 6, 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  const KDRAW = {
    leaf(t) {
      leafBase();
      ['#ff9f1a', '#ffb020', '#ff8a00', '#ffc23a', '#ff9f1a'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-16 + i * 8, -16 - (i % 2) * 5, 8, 0, 7); ctx.fill(); });
      incense(10, -18); candle(-4, -20, t);
    },
    lotus(t) {
      ctx.fillStyle = '#2b6e33'; ctx.beginPath(); ctx.ellipse(0, 2, 34, 10, 0, 0, 7); ctx.fill();
      for (let layer = 0; layer < 3; layer++) {
        for (let i = -3 + layer; i <= 3 - layer; i++) {
          ctx.save(); ctx.translate(i * (9 - layer), -layer * 7); ctx.rotate(i * 0.22);
          ctx.fillStyle = ['#f78fb3', '#ffa8c8', '#ffd0e0'][layer];
          ctx.beginPath(); ctx.ellipse(0, -10, 7, 16, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = '#e0608f'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        }
      }
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(0, -24, 6, 0, 7); ctx.fill();
      candle(0, -26, t, 16);
    },
    rainbow(t) {
      leafBase();
      const cols = ['#ff4d6d', '#ffb020', '#ffe94a', '#5ee07a', '#4ac8ff', '#9d6bff', '#ff7ad9'];
      for (let i = 0; i < 18; i++) {
        const a = Math.PI + (i / 17) * Math.PI;
        const r = 12 + (i % 3) * 7;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.3, -8 + Math.sin(a) * r * 0.9, 6.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff6a0'; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.3, -8 + Math.sin(a) * r * 0.9, 2, 0, 7); ctx.fill();
      }
      candle(0, -30, t, 14);
    },
    gold(t) {
      ctx.save(); ctx.shadowColor = '#ffd36b'; ctx.shadowBlur = 24;
      leafBase('#e8b53a', '#fff1b8', 36);
      ctx.restore();
      const gr = ctx.createLinearGradient(-20, -40, 20, 0);
      gr.addColorStop(0, '#fff1b8'); gr.addColorStop(1, '#c9902c');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-24, -6); ctx.quadraticCurveTo(0, -60, 24, -6); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(-12, -44); ctx.lineTo(-8, -56); ctx.lineTo(-3, -46); ctx.lineTo(0, -60); ctx.lineTo(3, -46); ctx.lineTo(8, -56); ctx.lineTo(12, -44); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 5; i++) { const a = t * 2 + i * 1.3; ctx.fillStyle = 'rgba(255,255,220,.9)'; ctx.beginPath(); ctx.arc(Math.cos(a) * 34, -24 + Math.sin(a) * 20, 2.2, 0, 7); ctx.fill(); }
      candle(18, -10, t, 14); candle(-18, -10, t + 1, 14);
    },
    swan(t) {
      ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#fbfbff';
      ctx.beginPath(); ctx.moveTo(-34, -4); ctx.quadraticCurveTo(-30, 12, 0, 12); ctx.quadraticCurveTo(30, 12, 30, -6); ctx.quadraticCurveTo(0, -2, -34, -4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-34, -4); ctx.quadraticCurveTo(-50, -20, -36, -26); ctx.quadraticCurveTo(-20, -10, -20, -2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#fbfbff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(22, -4); ctx.bezierCurveTo(40, -20, 16, -36, 30, -52); ctx.stroke();
      ctx.fillStyle = '#fbfbff'; ctx.beginPath(); ctx.arc(32, -54, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff9f1a'; ctx.beginPath(); ctx.moveTo(37, -55); ctx.lineTo(46, -52); ctx.lineTo(37, -50); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(33, -56, 1.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.moveTo(-20, -4); ctx.quadraticCurveTo(-4, -26, 14, -6); ctx.fill();
      ['#ff8fb8', '#ffd23f', '#fff'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-8 + i * 8, -14, 5, 0, 7); ctx.fill(); });
      candle(-2, -16, t, 12);
    },
    boat(t) {
      ctx.save(); ctx.shadowColor = '#ffcf4a'; ctx.shadowBlur = 28;
      const gr = ctx.createLinearGradient(0, -20, 0, 14);
      gr.addColorStop(0, '#fff1b8'); gr.addColorStop(1, '#b8742a');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(-48, -8); ctx.quadraticCurveTo(-40, 14, 0, 14); ctx.quadraticCurveTo(40, 14, 46, -8); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#e8b53a';
      // หัวเรือหงส์
      ctx.beginPath(); ctx.moveTo(40, -6); ctx.bezierCurveTo(62, -20, 44, -46, 58, -62); ctx.lineTo(64, -60); ctx.bezierCurveTo(54, -42, 70, -22, 48, 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(58, -62); ctx.lineTo(72, -58); ctx.lineTo(62, -54); ctx.fill();
      // หางเรือ
      ctx.beginPath(); ctx.moveTo(-46, -6); ctx.quadraticCurveTo(-66, -26, -58, -48); ctx.quadraticCurveTo(-52, -26, -36, -8); ctx.fill();
      // บุษบก
      ctx.fillStyle = '#a83a2a'; ctx.fillRect(-14, -34, 28, 24);
      ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.moveTo(-20, -34); ctx.lineTo(0, -64); ctx.lineTo(20, -34); ctx.fill();
      ctx.fillStyle = '#c9902c'; for (let i = -36; i <= 30; i += 8) ctx.fillRect(i, -10, 4, 6);
      ['#ff8fb8', '#ffd23f', '#ff9f43', '#fff'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-30 + i * 6, -12, 4, 0, 7); ctx.arc(14 + i * 6, -12, 4, 0, 7); ctx.fill(); });
      candle(-28, -14, t, 10); candle(28, -14, t + 2, 10);
      for (let i = 0; i < 6; i++) { const a = t * 1.5 + i; ctx.fillStyle = 'rgba(255,240,180,.9)'; ctx.beginPath(); ctx.arc(Math.cos(a) * 56, -24 + Math.sin(a * 1.3) * 24, 2, 0, 7); ctx.fill(); }
    },
  };
  function drawKrathongLabels(t) {
    const tn = now();
    // แสดงคำอธิษฐานพร้อมกันไม่เกิน 5 ใบ (ใบล่าสุด) จะได้ไม่รก
    const showWish = new Set(krathongs.filter(k => k.wish && tn - k.born < k.wishMs).slice(-5));
    for (const k of krathongs) {
      const s = persp(k.y) * KSIZE[k.kind];
      const topY = k.y - 62 * s - 10;
      if (k.name) {
        avatarCircle(k.avatar, k.name, k.x, topY - 4, clamp(16 * persp(k.y) * 1.4, 12, 24), k.kind === 'leaf' ? '#fff' : '#ffd36b');
        label(k.name, k.x, k.y + 22 * s + 8, 14);
      }
      if (showWish.has(k)) bubble(k.wish, k.x, topY - 26, null);
    }
  }

  // ---------- โคมลอย / พลุ / หัวใจ ----------
  const lanterns = [], sparks = [], hearts = [];
  function releaseLantern(x, y) {
    lanterns.push({ x, y, vx: rand(-10, 14), vy: rand(-48, -32), t: rand(0, 6), s: rand(0.8, 1.2) });
    if (lanterns.length > 120) lanterns.shift();
  }
  function drawLanterns(dt, t) {
    for (let i = lanterns.length - 1; i >= 0; i--) {
      const l = lanterns[i];
      l.x += (l.vx + Math.sin(t + l.t) * 8) * dt; l.y += l.vy * dt;
      if (l.y < -60) { lanterns.splice(i, 1); continue; }
      const sc = l.s * clamp(0.35 + l.y / 1500, 0.3, 1.2);
      ctx.save(); ctx.translate(l.x, l.y); ctx.scale(sc, sc);
      const gr = ctx.createRadialGradient(0, 0, 4, 0, 0, 50);
      gr.addColorStop(0, 'rgba(255,170,70,.55)'); gr.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = gr; ctx.fillRect(-50, -50, 100, 100);
      const g2 = ctx.createLinearGradient(0, -24, 0, 22);
      g2.addColorStop(0, '#ffe2a8'); g2.addColorStop(1, '#ff8a2a');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(-16, -24); ctx.lineTo(16, -24); ctx.lineTo(11, 22); ctx.lineTo(-11, 22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.ellipse(0, 18, 5, 4 + Math.sin(t * 9 + l.t), 0, 0, 7); ctx.fill();
      ctx.restore();
    }
  }
  function firework(x, y, n = 60) {
    const hue = rand(0, 360);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(80, 320);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(1, 1.8), max: 1.8, hue: hue + rand(-25, 25) });
    }
    if (sparks.length > 2400) sparks.splice(0, sparks.length - 2400);
  }
  let fireworkShowUntil = 0;
  function drawSparks(dt) {
    if (now() < fireworkShowUntil && Math.random() < dt * 3) firework(rand(120, 960), rand(160, 620));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 90 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.fillStyle = `hsla(${p.hue},100%,65%,${p.life / p.max})`;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.restore();
  }
  function heartShape(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
    ctx.fill();
  }
  function drawHearts(dt) {
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      h.life -= dt; h.y -= 70 * dt; h.x += Math.sin(h.life * 5 + h.p) * 30 * dt;
      if (h.life <= 0) { hearts.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(h.life, 0, 1);
      heartShape(h.x, h.y, h.s, h.c);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- ตัวละคร ----------
  const chars = new Map();
  const outfitOf = c => C.outfits[c.outfit % C.outfits.length];
  function persC(y) { return 0.78 + clamp((y - BANK_Y) / (H - BANK_Y), 0, 1) * 0.42; }
  function wanderPoint() { return { x: rand(60, W - 60), y: rand(1680, 1870) }; }

  class Char {
    constructor(u) {
      this.id = u.id; this.name = u.name; this.avatar = u.avatar || '';
      this.outfit = hash(u.id) % C.outfits.length;
      this.x = rand(80, W - 80); this.y = H + 60;
      const p = wanderPoint(); this.tx = p.x; this.ty = p.y;
      this.mode = 'wander'; this.timer = rand(2, 5); this.walkT = 0;
      this.queue = []; this.bubble = null; this.lastActive = now();
      this.lastFloat = -1e9; this.lastLantern = -1e9;
      this.gifts = 0; this.angle = 0; this.gondola = -1; this.hidden = false; this.fade = 0;
    }
    touch(u) { this.lastActive = now(); if (u) { this.name = u.name || this.name; if (u.avatar) this.avatar = u.avatar; } }
    say(text, ms = 5000) { this.bubble = { text, until: now() + ms }; }
    go(x, y) { this.tx = x; this.ty = y; }
    leaveRide() {
      if (this.gondola >= 0) { const r = riders[this.gondola]; const k = r.indexOf(this); if (k >= 0) r.splice(k, 1); this.gondola = -1; }
      if (this.hidden) { this.hidden = false; this.x = WHEEL.x + rand(-60, 0); this.y = BANK_Y + 10; }
    }
    setMode(m) {
      this.leaveRide();
      this.mode = m;
      if (m === 'float') this.go(clamp(this.x + rand(-160, 160), 50, W - 50), BANK_Y + rand(-4, 8));
      else if (m === 'dance') { this.angle = rand(0, Math.PI * 2); this.go(...ringPos(this.angle)); this.timer = 25; }
      else if (m === 'pray') { this.go(SHRINE.x + rand(-95, 95), SHRINE.y + rand(55, 100)); this.timer = 14; }
      else if (m === 'ride') this.go(WHEEL.x - rand(20, 80), BANK_Y + 6);
      else if (m === 'leave') this.go(this.x, H + 120);
      else { const p = wanderPoint(); this.go(p.x, p.y); this.timer = rand(3, 8); }
      this.arrived = false;
    }
    update(dt) {
      if (this.hidden) {
        this.timer -= dt;
        if (this.timer <= 0) { this.leaveRide(); this.setMode('wander'); }
        return;
      }
      if (this.mode === 'dance' && this.arrived) {
        this.angle += dt * 0.35;
        [this.x, this.y] = ringPos(this.angle);
        this.timer -= dt; this.walkT += dt;
        if (this.timer <= 0) this.setMode('wander');
        return;
      }
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
      if (d > 3) {
        const sp = Math.min(d, 150 * dt);
        this.x += dx / d * sp; this.y += dy / d * sp;
        this.walkT += dt; this.dir = dx < 0 ? -1 : 1;
        return;
      }
      this.walkT = 0;
      if (!this.arrived) { this.arrived = true; this.onArrive(); }
      this.timer -= dt;
      if (this.mode === 'floatWait' && this.timer <= 0) this.launch();
      else if ((this.mode === 'wander' || this.mode === 'pray') && this.timer <= 0) this.setMode('wander');
    }
    onArrive() {
      if (this.mode === 'float') { this.mode = 'floatWait'; this.timer = 0.9; }
      else if (this.mode === 'ride') {
        const free = riders.findIndex(r => r.length < 2);
        if (free < 0) { this.say('ชิงช้าเต็ม ไปรำวงก่อน 💃'); this.setMode('dance'); return; }
        riders[free].push(this); this.gondola = free; this.hidden = true; this.timer = 28;
      } else if (this.mode === 'leave') chars.delete(this.id);
    }
    launch() {
      const items = this.queue.splice(0, this.queue.length);
      items.forEach((it, i) => spawnKrathong({ ...it, x: clamp(this.x + (i - (items.length - 1) / 2) * 70, 30, W - 30), name: this.name, avatar: this.avatar }));
      if (items[0]?.wish) this.say(items[0].wish, 5000);
      this.setMode('wander');
    }
    floatKrathong(item) {
      this.queue.push(item);
      if (this.mode !== 'float' && this.mode !== 'floatWait') this.setMode('float');
    }
    draw(t) {
      if (this.hidden) return;
      const s = persC(this.y);
      const o = outfitOf(this);
      const walking = this.walkT > 0 && this.mode !== 'dance';
      const ph = Math.sin(this.walkT * 11);
      const dancing = this.mode === 'dance' && this.arrived;
      const praying = this.mode === 'pray' && this.arrived;
      const crouch = this.mode === 'floatWait' ? 8 : praying ? 14 : 0;
      const bob = dancing ? -Math.abs(Math.sin(t * 4 + this.angle * 3)) * 6 : walking ? -Math.abs(ph) * 3 : 0;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 7, 0, 0, 7); ctx.fill();
      ctx.translate(0, bob + crouch);
      // ขา
      ctx.fillStyle = '#e9b98f';
      if (!praying) { ctx.fillRect(-9 + ph * (walking ? 4 : 0), -20, 7, 20 - crouch * 0.5); ctx.fillRect(2 - ph * (walking ? 4 : 0), -20, 7, 20 - crouch * 0.5); }
      // ผ้าถุง/โจงกระเบน
      ctx.fillStyle = o.dress;
      ctx.beginPath(); ctx.moveTo(-14, -56); ctx.lineTo(14, -56); ctx.lineTo(praying ? 26 : 20, -16); ctx.lineTo(praying ? -26 : -20, -16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-18, -24, 36, 4);
      // เสื้อ + สไบ
      ctx.fillStyle = '#fff3e6'; rr(-13, -72, 26, 18, 6); ctx.fill();
      ctx.fillStyle = o.sash;
      ctx.beginPath(); ctx.moveTo(-14, -72); ctx.lineTo(-6, -72); ctx.lineTo(14, -54); ctx.lineTo(6, -54); ctx.closePath(); ctx.fill();
      // แขน
      ctx.strokeStyle = '#e9b98f'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      if (dancing) {
        const sw = Math.sin(t * 3 + this.angle * 2) * 8;
        ctx.moveTo(-12, -68); ctx.quadraticCurveTo(-26, -76, -24 + sw * 0.3, -92 + sw);
        ctx.moveTo(12, -68); ctx.quadraticCurveTo(24, -62, 30, -70 - sw);
      } else if (praying) {
        ctx.moveTo(-12, -68); ctx.lineTo(-2, -78); ctx.moveTo(12, -68); ctx.lineTo(2, -78);
      } else if (this.mode === 'floatWait') {
        ctx.moveTo(-12, -68); ctx.lineTo(-10, -44); ctx.moveTo(12, -68); ctx.lineTo(10, -44);
      } else {
        const sw = walking ? ph * 6 : 0;
        ctx.moveTo(-13, -68); ctx.lineTo(-17 - sw * 0.3, -46 + Math.abs(sw) * 0.2);
        ctx.moveTo(13, -68); ctx.lineTo(17 + sw * 0.3, -46 + Math.abs(sw) * 0.2);
      }
      ctx.stroke();
      ctx.restore();
      // หัว = รูปโปรไฟล์
      const hx = this.x, hy = this.y + (bob + crouch - 96) * s;
      avatarCircle(this.avatar, this.name, hx, hy, 25 * s, this.gifts > 0 ? '#ffd36b' : '#fff');
      if (this.gifts >= 30) { ctx.font = `${20 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('👑', hx, hy - 30 * s); }
      else { ctx.fillStyle = o.sash; ctx.beginPath(); ctx.arc(hx + 17 * s, hy - 17 * s, 5 * s, 0, 7); ctx.fill(); }
      if (praying && Math.random() < 0.02) hearts.push({ x: hx, y: hy - 30, s: 14, c: 'rgba(255,220,150,.9)', life: 1.4, p: rand(0, 6) });
      this.headY = hy - 25 * s;
    }
    drawLabel() {
      if (this.hidden) return;
      label(this.name, this.x, this.y + 14 * persC(this.y), 14, this.gifts ? 'rgba(120,70,0,.8)' : 'rgba(10,12,40,.62)');
    }
    drawBubble() {
      if (this.hidden || !this.bubble) return;
      if (now() > this.bubble.until) { this.bubble = null; return; }
      bubble(this.bubble.text, this.x, this.headY - 6, null);
    }
  }
  function ringPos(a) { return [STAGE.x + Math.cos(a) * (STAGE.rx - 40), STAGE.y + Math.sin(a) * (STAGE.ry - 14) - 6]; }

  function getChar(u) {
    if (!u || !u.id) return null;
    let c = chars.get(u.id);
    if (c) { if (c.mode === 'leave') c.setMode('wander'); c.touch(u); return c; }
    if (chars.size >= C.maxCharacters) {
      let oldest = null;
      for (const x of chars.values()) if (!x.gifts && x.mode !== 'leave' && (!oldest || x.lastActive < oldest.lastActive)) oldest = x;
      if (oldest) { oldest.leaveRide(); chars.delete(oldest.id); } else return null;
    }
    c = new Char(u);
    chars.set(u.id, c);
    return c;
  }

  // ---------- คะแนน / ป้ายอันดับ ----------
  const dayKey = 'lk-' + new Date().toISOString().slice(0, 10);
  let board = { gifters: {}, hearts: {}, goal: C.heartGoal, progress: 0 };
  try { const s = JSON.parse(localStorage.getItem(dayKey)); if (s && s.gifters) board = s; } catch { /* ไม่มี storage ก็ใช้ค่าเริ่มต้น */ }
  let saveT = 0;
  function save() { try { localStorage.setItem(dayKey, JSON.stringify(board)); } catch { /* ignore */ } }
  function top3(obj) { return Object.entries(obj).sort((a, b) => b[1].v - a[1].v).slice(0, 3); }

  // ---------- ข้อความแจ้งเตือน / แบนเนอร์ ----------
  const toasts = [];
  function toast(text, icon = '✨', color = '#ffd877') {
    toasts.unshift({ text, icon, color, born: now() });
    if (toasts.length > 6) toasts.pop();
  }
  let spotlight = null;
  function showSpotlight(title, sub, user, ms = 5000) { spotlight = { title, sub, user, until: now() + ms, born: now() }; }

  // ---------- จัดการอีเวนต์จาก TikTok ----------
  function clean(text) {
    let s = String(text || '').replace(/\s+/g, ' ').trim();
    const low = s.toLowerCase();
    if (C.blockedWords.some(w => w && low.includes(w.toLowerCase()))) return '🙏';
    const arr = Array.from(s);
    return arr.length > C.wishMaxLength ? arr.slice(0, C.wishMaxLength).join('') + '…' : s;
  }
  const has = (text, list) => list.some(k => text.toLowerCase().includes(k.toLowerCase()));
  function stripKeys(text, list) { let s = text; for (const k of list) s = s.split(k).join(' '); return s.replace(/\s+/g, ' ').trim(); }

  function onChat(u, text) {
    const c = getChar(u); if (!c) return;
    const raw = String(text || '').trim();
    const n = raw.match(/^\s*(\d)\s*$/);
    if (n && +n[1] >= 1 && +n[1] <= C.outfits.length) { c.outfit = +n[1] - 1; c.say(`เปลี่ยนเป็น${outfitOf(c).name} ✨`, 3000); return; }
    const cm = C.commands;
    if (has(raw, cm.float)) {
      const cd = C.freeFloatCooldownSec * 1000 - (now() - c.lastFloat);
      if (cd > 0) { c.say(`รออีก ${Math.ceil(cd / 1000)} วิ ค่อยลอยใหม่นะ`, 2500); return; }
      c.lastFloat = now();
      const wish = clean(stripKeys(raw, cm.float)) || pick(C.defaultWishes);
      c.floatKrathong({ kind: 'leaf', wish });
      return;
    }
    if (has(raw, cm.lantern)) {
      if (now() - c.lastLantern < C.lanternCooldownSec * 1000) return;
      c.lastLantern = now();
      releaseLantern(c.x, c.y - 120);
      c.say('ปล่อยโคม 🏮', 2500);
      return;
    }
    if (has(raw, cm.dance)) { c.setMode('dance'); c.say('รำวงกัน 💃', 2500); return; }
    if (has(raw, cm.pray)) { c.setMode('pray'); c.say(clean(stripKeys(raw, cm.pray)) || 'สาธุ 🙏', 4000); return; }
    if (has(raw, cm.ride)) { c.setMode('ride'); c.say('ไปขึ้นชิงช้าสวรรค์ 🎡', 2500); return; }
    c.say(clean(raw), 4500);
  }
  function tierFor(diamonds) { let t = C.giftTiers[0]; for (const x of C.giftTiers) if (diamonds >= x.min) t = x; return t; }
  function onGift(u, g) {
    const c = getChar(u);
    const count = Math.max(1, g.count | 0), each = Math.max(1, g.diamonds | 0), total = count * each;
    const tier = tierFor(each);
    const e = board.gifters[u.id] || { n: u.name, a: u.avatar, v: 0 };
    e.v += total; e.n = u.name; e.a = u.avatar || e.a; board.gifters[u.id] = e; save();
    toast(`${u.name} ส่ง ${g.name} ×${count}`, tier.icon, '#ffd36b');
    if (!c) return;
    c.gifts += total;
    const n = Math.min(count, C.maxKrathongPerGift);
    const wish = c.bubble?.text && !c.bubble.text.startsWith('รออีก') ? c.bubble.text : pick(C.defaultWishes);
    for (let i = 0; i < n; i++) c.floatKrathong({ kind: tier.kind, wish: i === 0 ? wish : '' });
    for (let i = 0; i < Math.min(12, count * 2); i++) hearts.push({ x: c.x + rand(-30, 30), y: c.y - 120, s: rand(14, 24), c: '#ffd36b', life: rand(1.2, 2), p: rand(0, 6) });
    if (tier.spotlight || total >= 299) {
      showSpotlight(`${tier.label}!`, `${u.name} ส่ง ${g.name} ×${count}`, u, 6000);
      fireworkShowUntil = now() + 6000;
    } else if (total >= 30) firework(rand(200, 880), rand(200, 500));
  }
  function onLike(u, likes) {
    likes = Math.max(1, likes | 0);
    const c = getChar(u);
    const e = board.hearts[u.id] || { n: u.name, a: u.avatar, v: 0 };
    e.v += likes; e.n = u.name; board.hearts[u.id] = e;
    board.progress += likes;
    if (c) for (let i = 0; i < Math.min(likes, 4); i++) hearts.push({ x: c.x + rand(-20, 20), y: c.y - 110, s: rand(14, 22), c: pick(['#ff4d79', '#ff7aa8', '#ff2d55']), life: rand(1, 1.8), p: rand(0, 6) });
    if (board.progress >= board.goal) goalReached();
    if (now() - saveT > 3000) { saveT = now(); save(); }
  }
  function goalReached() {
    showSpotlight('ครบเป้าหัวใจแล้ว! 💖', 'ปล่อยโคมลอยเต็มฟ้า ขอบคุณทุกคน', null, 6000);
    fireworkShowUntil = now() + 8000;
    for (let i = 0; i < 45; i++) setTimeout(() => releaseLantern(rand(40, W - 40), rand(1300, 1900)), i * 120);
    board.goal += C.heartGoalStep;
    save();
  }
  function onJoin(u) {
    if (C.spawnOnJoin) getChar(u);
    if (toasts.length < 4 || now() - toasts[0].born > 1200) toast(`${u.name} เข้าร่วมแล้ว`, '👋', '#bfe3ff');
  }
  function onFollow(u) {
    const c = getChar(u); if (c) c.say('ติดตามแล้ว 💖', 4000);
    toast(`${u.name} ติดตามแล้ว ขอบคุณค่ะ`, '💖', '#ff9ccf');
    firework(rand(200, 880), rand(220, 520), 40);
  }
  function onShare(u) {
    const c = getChar(u); if (c) c.say('แชร์ไลฟ์แล้ว 🔁', 3000);
    toast(`${u.name} แชร์ไลฟ์`, '🔁', '#b6ff8f');
  }
  let viewers = 0;

  // ---------- รอบลอยพร้อมกัน ----------
  let nextRound = now() + C.roundEveryMinutes * 60000;
  function startRound() {
    nextRound = now() + C.roundEveryMinutes * 60000;
    showSpotlight('ลอยกระทงพร้อมกัน! 🌕', 'ขอให้ทุกคำอธิษฐานเป็นจริง', null, 6000);
    fireworkShowUntil = now() + 7000;
    let i = 0;
    for (const c of chars.values()) {
      if (c.mode === 'leave' || i++ > 70) continue;
      c.floatKrathong({ kind: 'leaf', wish: '' });
    }
  }

  function handle(ev) {
    if (!ev || typeof ev.type !== 'string') return;
    const u = ev.user ? { id: String(ev.user.id || ev.user.name), name: String(ev.user.name || 'ผู้ชม'), avatar: String(ev.user.avatar || '') } : null;
    switch (ev.type) {
      case 'chat': if (u) onChat(u, ev.text); break;
      case 'gift': if (u && ev.gift) onGift(u, ev.gift); break;
      case 'like': if (u) onLike(u, ev.likes); break;
      case 'join': if (u) onJoin(u); break;
      case 'follow': if (u) onFollow(u); break;
      case 'share': if (u) onShare(u); break;
      case 'viewers': viewers = ev.count | 0; break;
      case 'status': conn = ev; break;
      case 'demo': setDemo(ev.on); break;
      case 'scene':
        if (ev.action === 'round') startRound();
        else if (ev.action === 'fireworks') fireworkShowUntil = now() + 6000;
        else if (ev.action === 'lanterns') for (let i = 0; i < 30; i++) setTimeout(() => releaseLantern(rand(40, W - 40), rand(1300, 1900)), i * 150);
        else if (ev.action === 'clear') { chars.clear(); krathongs.length = 0; riders.forEach(r => (r.length = 0)); }
        else if (ev.action === 'resetBoard') { board = { gifters: {}, hearts: {}, goal: C.heartGoal, progress: 0 }; save(); }
        break;
    }
  }
  window.LK = { handle, startRound }; // เผื่อเรียกจาก console

  // ---------- เชื่อมต่อเซิร์ฟเวอร์ ----------
  let conn = { state: location.protocol.startsWith('http') ? 'connecting-server' : 'offline' };
  function connectWS() {
    if (!location.protocol.startsWith('http')) return;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onmessage = e => { try { handle(JSON.parse(e.data)); } catch (err) { console.warn(err); } };
    ws.onclose = () => { conn = { state: 'server-lost' }; setTimeout(connectWS, 2000); };
  }
  connectWS();

  // ---------- ผู้ชมจำลอง (เดโม) ----------
  const DEMO_NAMES = ['น้องฝน', 'ฟ้า', 'มะลิ', 'แพรวา', 'พี่ต้น', 'เจ้าขุน', 'นนท์', 'ลุงบุญ', 'ยายสมศรี', 'ปลายฟ้า', 'Mai', 'Bank', 'Ploy', 'จันทร์จิรา', 'ข้าวหอม', 'ต้นกล้า', 'มิ้นท์', 'บีม', 'โอ๊ต', 'เฟิร์น', 'น้ำหนึ่ง', 'ก้อง', 'ใบเตย', 'Joy', 'แจน'];
  const DEMO_CHAT = ['ลอย ขอให้สุขภาพแข็งแรง 🙏', 'ลอย ขอให้รักกันนานๆ 💕', 'ลอย ขอให้สอบผ่านทุกวิชา', 'รำ', 'รำวง', 'ไหว้', 'ชิงช้า', 'โคม', 'สวัสดีค่า', 'สวยมาก', '1', '2', '3', '4', 'ลอย ขอให้รวยๆ', 'ลอย'];
  const DEMO_GIFTS = [['Rose', 1], ['Rose', 1], ['Finger Heart', 5], ['Doughnut', 30], ['Hand Hearts', 100], ['Rocket', 299]];
  let demo = params.has('demo') || !location.protocol.startsWith('http');
  let demoT = 0;
  function setDemo(on) { demo = !!on; }
  function demoTick(dt) {
    if (!demo) return;
    demoT -= dt;
    if (demoT > 0) return;
    demoT = rand(0.35, 1.3);
    const name = pick(DEMO_NAMES);
    const u = { id: 'demo-' + name, name, avatar: '' };
    const r = Math.random();
    if (r < 0.2) handle({ type: 'join', user: u });
    else if (r < 0.62) handle({ type: 'chat', user: u, text: pick(DEMO_CHAT) });
    else if (r < 0.9) handle({ type: 'like', user: u, likes: Math.ceil(rand(1, 30)) });
    else if (r < 0.98) { const g = Math.random() < 0.8 ? pick(DEMO_GIFTS.slice(0, 4)) : pick(DEMO_GIFTS); handle({ type: 'gift', user: u, gift: { name: g[0], diamonds: g[1], count: Math.random() < 0.3 ? Math.ceil(rand(2, 6)) : 1 } }); }
    else handle({ type: 'follow', user: u });
  }

  // ---------- HUD ----------
  function panel(x, y, w, h) {
    rr(x, y, w, h, 16);
    ctx.fillStyle = 'rgba(16,14,48,.78)'; ctx.fill();
    ctx.strokeStyle = 'rgba(243,197,90,.85)'; ctx.lineWidth = 2.5; ctx.stroke();
  }
  function drawHUD(t) {
    ctx.textBaseline = 'middle';
    // หัวเรื่อง
    ctx.textAlign = 'center';
    ctx.font = `800 66px ${FONT}`;
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(60,20,70,.85)'; ctx.lineJoin = 'round';
    ctx.strokeText('🪷 ' + C.title + ' 🪷', W / 2, 64);
    const gg = ctx.createLinearGradient(0, 30, 0, 100);
    gg.addColorStop(0, '#fff3c2'); gg.addColorStop(1, '#f0b43c');
    ctx.fillStyle = gg; ctx.fillText('🪷 ' + C.title + ' 🪷', W / 2, 64);
    // การ์ดของขวัญ
    const n = C.giftTiers.length, cw = (W - 40 - (n - 1) * 10) / n;
    C.giftTiers.forEach((tier, i) => {
      const x = 20 + i * (cw + 10), y = 118;
      panel(x, y, cw, 88);
      ctx.textAlign = 'left';
      ctx.font = `34px ${FONT}`; ctx.fillText(tier.icon, x + 10, y + 32);
      ctx.font = `700 20px ${FONT}`; ctx.fillStyle = '#ffd36b'; ctx.fillText('🪙' + tier.min + (i < n - 1 ? '+' : '+'), x + 10, y + 68);
      ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = `600 18px ${FONT}`;
      const lines = wrap(tier.label, cw - 60, 2);
      lines.forEach((l, k) => ctx.fillText(l, x + cw - 10, y + 28 + k * 24 - (lines.length - 1) * 4));
    });
    // เป้าหัวใจ
    const py = 218, ph = 160, pw = (W - 60) / 3;
    panel(20, py, pw, ph);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffb3cf'; ctx.font = `700 22px ${FONT}`;
    ctx.fillText('💗 เป้ากดหัวใจ', 20 + pw / 2, py + 28);
    const prog = clamp(board.progress / board.goal, 0, 1);
    rr(40, py + 52, pw - 40, 22, 11); ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fill();
    if (prog > 0) { rr(40, py + 52, Math.max(22, (pw - 40) * prog), 22, 11); const hg = ctx.createLinearGradient(40, 0, pw, 0); hg.addColorStop(0, '#ff4d79'); hg.addColorStop(1, '#ffb3cf'); ctx.fillStyle = hg; ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = `700 26px ${FONT}`;
    ctx.fillText(`${board.progress.toLocaleString()} / ${board.goal.toLocaleString()}`, 20 + pw / 2, py + 100);
    ctx.font = `500 16px ${FONT}`; ctx.fillStyle = '#ffd877';
    ctx.fillText('ครบแล้ว: พลุ + ปล่อยโคมเต็มฟ้า', 20 + pw / 2, py + 136);
    // อันดับ
    const lists = [['🎁 TOP ของขวัญ', board.gifters, '🪙'], ['💖 TOP หัวใจ', board.hearts, '']];
    lists.forEach(([title, obj, unit], j) => {
      const x = 20 + (pw + 10) * (j + 1);
      panel(x, py, pw, ph);
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffd877'; ctx.font = `700 22px ${FONT}`;
      ctx.fillText(title, x + pw / 2, py + 28);
      top3(obj).forEach(([, e], k) => {
        const yy = py + 66 + k * 34;
        ctx.textAlign = 'left'; ctx.fillStyle = ['#ffd36b', '#e0e0e0', '#e0a070'][k]; ctx.font = `800 20px ${FONT}`;
        ctx.fillText(String(k + 1), x + 14, yy);
        avatarCircle(e.a, e.n, x + 46, yy, 13, ['#ffd36b', '#ddd', '#e0a070'][k]);
        ctx.fillStyle = '#fff'; ctx.font = `600 18px ${FONT}`;
        ctx.fillText(fitText(e.n, pw - 150), x + 66, yy + 1);
        ctx.textAlign = 'right'; ctx.fillStyle = '#ffd36b';
        ctx.fillText(unit + e.v.toLocaleString(), x + pw - 12, yy + 1);
      });
      if (!Object.keys(obj).length) { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `500 17px ${FONT}`; ctx.fillText('ยังไม่มี — มาเป็นคนแรก!', x + pw / 2, py + 100); }
    });
    // แถบคำสั่ง (เลื่อน)
    const help = `พิมพ์ในแชท 👉  ลอย + คำอธิษฐาน  ·  รำ  ·  ไหว้  ·  ชิงช้า  ·  โคม  ·  เลข 1-${C.outfits.length} เปลี่ยนชุด  ·  ส่งของขวัญได้กระทงพิเศษ  ·  `;
    rr(20, 388, W - 40, 44, 22); ctx.fillStyle = 'rgba(16,14,48,.7)'; ctx.fill();
    ctx.save(); rr(20, 388, W - 40, 44, 22); ctx.clip();
    ctx.font = `600 22px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    const hw = ctx.measureText(help).width;
    const off = (t * 70) % hw;
    ctx.fillText(help, 30 - off, 411); ctx.fillText(help, 30 - off + hw, 411);
    ctx.restore();
    if (viewers) { ctx.textAlign = 'right'; ctx.font = `600 18px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(`👀 ${viewers.toLocaleString()} · 👥 ${chars.size} ในงาน`, W - 24, 456); }
    else { ctx.textAlign = 'right'; ctx.font = `600 18px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(`👥 ${chars.size} คนในงาน`, W - 24, 456); }
  }
  function drawToasts() {
    const tn = now();
    toasts.forEach((m, i) => {
      const age = (tn - m.born) / 1000;
      if (age > 7) return;
      const a = clamp(Math.min(age * 4, (7 - age)), 0, 1);
      const y = 470 + i * 50, x = 20 - (1 - Math.min(1, age * 4)) * 60;
      ctx.globalAlpha = a;
      ctx.font = `600 20px ${FONT}`;
      const text = fitText(m.text, 420);
      const w = ctx.measureText(text).width + 64;
      rr(x, y, w, 40, 20); ctx.fillStyle = 'rgba(16,14,48,.75)'; ctx.fill();
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `22px ${FONT}`; ctx.fillText(m.icon, x + 12, y + 21);
      ctx.font = `600 20px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(text, x + 46, y + 21);
      ctx.globalAlpha = 1;
    });
  }
  function drawCountdown() {
    const left = (nextRound - now()) / 1000;
    if (left <= 0) { startRound(); return; }
    if (left > C.roundCountdownSeconds) return;
    const x = 140, y = 500, w = W - 280, h = 200;
    panel(x, y, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd877'; ctx.font = `800 34px ${FONT}`;
    ctx.fillText(`🪷 อีก ${Math.ceil(left)} วินาที`, W / 2, y + 38);
    ctx.fillStyle = '#fff'; ctx.font = `600 24px ${FONT}`;
    ctx.fillText('เปิดรอบลอยกระทงพร้อมกัน', W / 2, y + 78);
    ctx.font = `800 64px ${FONT}`;
    const s = Math.ceil(left);
    ctx.fillText(`00:${String(s).padStart(2, '0')}`, W / 2, y + 130);
    ctx.font = `500 18px ${FONT}`; ctx.fillStyle = '#ffd877';
    ctx.fillText('เตรียมพิมพ์ ลอย + คำอธิษฐาน', W / 2, y + 178);
    rr(x + 30, y + h - 10, (w - 60) * (left / C.roundCountdownSeconds), 5, 3); ctx.fillStyle = '#ffd877'; ctx.fill();
  }
  function drawSpotlight() {
    if (!spotlight) return;
    const tn = now();
    if (tn > spotlight.until) { spotlight = null; return; }
    const age = (tn - spotlight.born) / 1000;
    const sc = Math.min(1, 0.6 + age * 2.5);
    ctx.save();
    ctx.translate(W / 2, 760); ctx.scale(sc, sc);
    ctx.globalAlpha = clamp((spotlight.until - tn) / 600, 0, 1);
    const w = 860, h = spotlight.user ? 190 : 150;
    ctx.shadowColor = '#ffcf4a'; ctx.shadowBlur = 40;
    rr(-w / 2, -h / 2, w, h, 24);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, 'rgba(90,30,110,.95)'); g.addColorStop(1, 'rgba(30,20,80,.95)');
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ffd877'; ctx.lineWidth = 4; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let ty = -h / 2 + 50;
    if (spotlight.user) { avatarCircle(spotlight.user.avatar, spotlight.user.name, -w / 2 + 90, 0, 60, '#ffd877'); }
    const cx = spotlight.user ? 50 : 0;
    ctx.fillStyle = '#ffe28a'; ctx.font = `800 52px ${FONT}`; ctx.fillText(fitText(spotlight.title, 620), cx, ty);
    ctx.fillStyle = '#fff'; ctx.font = `600 28px ${FONT}`; ctx.fillText(fitText(spotlight.sub, 620), cx, ty + 62);
    ctx.restore();
  }
  function drawStatus() {
    if (demo && conn.state !== 'connected') {
      ctx.textAlign = 'left'; ctx.font = `600 16px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText('● โหมดเดโม', 22, H - 22);
      return;
    }
    const col = conn.state === 'connected' ? '#3ddc84' : conn.state === 'idle' ? '#999' : '#ffb020';
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(28, H - 22, 6, 0, 7); ctx.fill();
    if (conn.state !== 'connected') {
      ctx.textAlign = 'left'; ctx.font = `600 16px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.fillText(fitText(`${conn.state}${conn.username ? ' @' + conn.username : ''} ${conn.message || ''}`, 900), 42, H - 21);
    }
  }

  // ---------- ลูปหลัก ----------
  let last = now(), lastCleanup = 0;
  function frame() {
    const tn = now();
    const dt = Math.min(0.05, (tn - last) / 1000);
    last = tn;
    const t = tn / 1000;
    demoTick(dt);
    wheelAngle += dt * 0.12;
    updateKrathongs(dt);
    for (const c of chars.values()) c.update(dt);
    if (tn - lastCleanup > 2000) {
      lastCleanup = tn;
      for (const c of chars.values()) if (!c.gifts && c.mode !== 'leave' && tn - c.lastActive > C.idleLeaveMinutes * 60000) c.setMode('leave');
    }

    ctx.drawImage(bg, 0, 0);
    // ดาวกะพริบ
    for (let i = 0; i < stars.length; i += 3) {
      const s = stars[i];
      const a = (Math.sin(t * 2 + s.p) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,230,${a * 0.8})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 0.6, 0, 7); ctx.fill();
    }
    drawLanterns(dt, t);
    drawSparks(dt);
    drawWheel(t);
    drawWaterFx(t);
    const ks = krathongs.slice().sort((a, b) => a.y - b.y);
    for (const k of ks) drawKrathong(k, t);
    drawBankLights(t);
    sign('ไหว้พระ', SHRINE.x, SHRINE.y - 268, 'พิมพ์ ไหว้');
    sign('รำวง', STAGE.x, STAGE.y - STAGE.ry - 70, 'พิมพ์ รำ');
    sign('ร้านกระทง', SHOP.x, SHOP.y - 172, 'พิมพ์ ลอย');
    const cs = Array.from(chars.values()).sort((a, b) => a.y - b.y);
    for (const c of cs) c.draw(t);
    for (const c of cs) c.drawLabel();
    drawHearts(dt);
    drawKrathongLabels(t);
    for (const c of cs) c.drawBubble();
    drawHUD(t);
    drawToasts();
    drawCountdown();
    drawSpotlight();
    drawStatus();
    requestAnimationFrame(frame);
  }

  renderBackground();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => renderBackground());
  requestAnimationFrame(frame);
})();
