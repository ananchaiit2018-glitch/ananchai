// โหมด "ศึกปราบอสูร" — ผู้ชมช่วยกันโจมตีสัตว์ประหลาดด้วยของขวัญ หัวใจ และคอมเมนต์ (Canvas 1080x1920)
(() => {
  'use strict';
  const C = window.BOSS_CONFIG;
  const cv = document.getElementById('scene');
  const ctx = cv.getContext('2d');
  const W = 1080, H = 1920;
  const params = new URLSearchParams(location.search);
  const FONT = '"Kanit", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';
  const BOSS = { x: 540, y: 880, r: 210 };
  const ARENA_TOP = 1390, ARENA_BOT = 1860;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now();
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) | 0; return Math.abs(h); };
  const fmt = n => Math.max(0, Math.round(n)).toLocaleString();

  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    cv.style.width = W * s + 'px';
    cv.style.height = H * s + 'px';
  }
  addEventListener('resize', fit);
  fit();

  // ---------- ตัวช่วยวาด ----------
  const imgCache = new Map();
  function getImg(url) {
    if (!url) return null;
    let im = imgCache.get(url);
    if (!im) {
      im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = url; imgCache.set(url, im);
      if (imgCache.size > 600) imgCache.delete(imgCache.keys().next().value);
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    const chars = Array.from(text);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
    return chars.join('') + '…';
  }
  function label(text, x, y, size = 14, bg = 'rgba(10,8,30,.7)', fg = '#fff') {
    ctx.font = `600 ${size}px ${FONT}`;
    const t = fitText(text, 150);
    const w = ctx.measureText(t).width + size;
    rr(x - w / 2, y - size * 0.75, w, size * 1.5, size * 0.75);
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y + 1);
  }
  function bubble(text, x, y) {
    ctx.font = `600 20px ${FONT}`;
    const t = fitText(text, 260);
    const w = ctx.measureText(t).width + 26, h = 36;
    const bx = clamp(x - w / 2, 8, W - w - 8), by = y - h - 10;
    rr(bx, by, w, h, 12); ctx.fillStyle = 'rgba(30,16,60,.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,90,.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, bx + w / 2, by + h / 2 + 1);
  }
  const HAIR = ['#2b1d16', '#3d2a1e', '#1a1a2e', '#5a3a22', '#7a4a2a', '#222'];
  function drawFace(name, x, y, r) {
    const h = hash(name);
    ctx.fillStyle = ['#f6d3b5', '#eec29d', '#e2ad86', '#f9dcc4'][h % 4];
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = HAIR[h % HAIR.length];
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.55, r * 1.1, r * 0.75, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#2a1a12';
    ctx.beginPath(); ctx.arc(x - r * 0.33, y + r * 0.05, r * 0.11, 0, 7); ctx.arc(x + r * 0.33, y + r * 0.05, r * 0.11, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = r * 0.08;
    ctx.beginPath(); ctx.arc(x, y + r * 0.3, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  function avatarCircle(url, name, x, y, r, ring = '#fff', grey = false) {
    const im = getImg(url);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    if (grey) ctx.filter = 'grayscale(1) brightness(.7)';
    if (im) ctx.drawImage(im, x - r, y - r, r * 2, r * 2); else drawFace(name, x, y, r);
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = ring; ctx.lineWidth = Math.max(2, r * 0.12); ctx.stroke();
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

  // ---------- ฉากหลัง ----------
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  function renderBackground() {
    const g = bg.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, ARENA_TOP);
    gr.addColorStop(0, '#07041a'); gr.addColorStop(0.55, '#24104a'); gr.addColorStop(1, '#5a1f4a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${rand(0.2, 0.8)})`; g.beginPath(); g.arc(rand(0, W), rand(0, 1100), rand(0.5, 1.8), 0, 7); g.fill(); }
    // พระจันทร์สีเลือด
    gr = g.createRadialGradient(840, 640, 20, 840, 640, 260);
    gr.addColorStop(0, 'rgba(255,90,90,.45)'); gr.addColorStop(1, 'rgba(255,90,90,0)');
    g.fillStyle = gr; g.fillRect(500, 300, 600, 700);
    g.fillStyle = '#ff8a7a'; g.beginPath(); g.arc(840, 640, 70, 0, 7); g.fill();
    // ภูเขา/ซากปราสาท
    g.fillStyle = '#1a0b2e';
    g.beginPath(); g.moveTo(0, 1250);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, 1130 - Math.abs(Math.sin(x * 0.006)) * 140 - (x % 120 === 0 ? 30 : 0));
    g.lineTo(W, 1250); g.fill();
    g.fillStyle = '#120722';
    [[90, 1000, 70, 230], [190, 1060, 50, 170], [880, 1030, 60, 200], [980, 980, 70, 260]].forEach(([x, y, w, h]) => {
      g.fillRect(x - w / 2, y, w, h + 200);
      for (let i = 0; i < 3; i++) g.fillRect(x - w / 2 + i * w / 2.5, y - 16, w / 5, 16);
      g.fillStyle = 'rgba(255,170,80,.6)'; g.fillRect(x - 6, y + 40, 12, 20); g.fillStyle = '#120722';
    });
    // ลานต่อสู้
    gr = g.createLinearGradient(0, 1180, 0, H);
    gr.addColorStop(0, '#3a1d3e'); gr.addColorStop(0.3, '#2a1630'); gr.addColorStop(1, '#120a18');
    g.fillStyle = gr; g.fillRect(0, 1200, W, H - 1200);
    g.strokeStyle = 'rgba(255,120,200,.12)'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(BOSS.x, 1260, 120 + i * 90, 30 + i * 22, 0, 0, 7); g.stroke(); }
    gr = g.createRadialGradient(BOSS.x, 1240, 20, BOSS.x, 1240, 520);
    gr.addColorStop(0, 'rgba(180,80,255,.35)'); gr.addColorStop(1, 'rgba(180,80,255,0)');
    g.fillStyle = gr; g.fillRect(0, 900, W, 800);
  }

  // ---------- สถานะเกม ----------
  const dayKey = 'boss-' + new Date().toISOString().slice(0, 10);
  let save = { level: 1, hp: null, dmg: {}, kills: 0 };
  try { const s = JSON.parse(localStorage.getItem(dayKey)); if (s && s.level) save = s; } catch { /* ไม่มี storage */ }
  function persist() { try { localStorage.setItem(dayKey, JSON.stringify(save)); } catch { /* ignore */ } }

  const boss = { level: 1, maxHp: 1, hp: 1, def: null, hurt: 0, shake: 0, state: 'alive', stateT: 0, lastHit: 0, nextAttack: 0, windup: 0, lastHitter: null, fightDmg: {}, appear: 0 };
  function bossHp(level) { return Math.round(C.baseHp * Math.pow(C.hpGrowth, level - 1)); }
  function spawnBoss(level, hp) {
    boss.level = level;
    boss.def = C.bosses[(level - 1) % C.bosses.length];
    boss.maxHp = bossHp(level);
    boss.hp = hp != null ? clamp(hp, 1, boss.maxHp) : boss.maxHp;
    boss.state = 'alive'; boss.stateT = 0; boss.windup = 0; boss.fightDmg = {}; boss.lastHitter = null;
    boss.nextAttack = now() + C.bossAttackEverySec * 1000;
    boss.lastHit = now(); boss.appear = now();
    save.level = level; save.hp = boss.hp; persist();
    toast(`ด่าน ${level}: ${boss.def.name} ปรากฏตัว!`, '👹', '#ff8a8a');
    if (boss.carry > 0) {
      const c = Math.min(boss.carry, boss.hp * 0.9);
      boss.carry = 0;
      setTimeout(() => applyDamage(c, null, BOSS.x, BOSS.y, true), 1000);
    }
  }

  // ---------- ฮีโร่ (ผู้ชม) ----------
  const heroes = new Map();
  const CAPES = ['#e84a5f', '#3b82d6', '#2fae6a', '#d9a521', '#8a4fd1', '#ff7a3a'];
  const persH = y => 0.8 + clamp((y - ARENA_TOP) / (ARENA_BOT - ARENA_TOP), 0, 1) * 0.38;
  class Hero {
    constructor(u) {
      this.id = u.id; this.name = u.name; this.avatar = u.avatar || '';
      this.cape = CAPES[hash(u.id) % CAPES.length];
      this.x = rand(60, W - 60); this.y = H + 80;
      this.hx = this.x; this.hy = rand(ARENA_TOP, ARENA_BOT);
      this.lastActive = now(); this.lastAtk = -1e9; this.lastHeal = -1e9; this.lastShield = -1e9;
      this.ko = 0; this.shield = false; this.lunge = 0; this.dmg = 0; this.gifts = 0; this.bubble = null; this.leaving = false;
      this.phase = rand(0, 6);
    }
    touch(u) { this.lastActive = now(); this.leaving = false; if (u) { this.name = u.name || this.name; if (u.avatar) this.avatar = u.avatar; } }
    say(t, ms = 3000) { this.bubble = { t, until: now() + ms }; }
    get alive() { return now() > this.ko; }
    update(dt) {
      const ty = this.leaving ? H + 120 : this.hy;
      const dx = this.hx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      if (d > 2) { const sp = Math.min(d, 220 * dt); this.x += dx / d * sp; this.y += dy / d * sp; this.walking = true; }
      else { this.walking = false; if (this.leaving) heroes.delete(this.id); }
      this.lunge = Math.max(0, this.lunge - dt * 4);
    }
    head() { const s = persH(this.y); return { x: this.x, y: this.y - 92 * s - this.lunge * 30, s }; }
    draw(t) {
      const s = persH(this.y);
      const ko = !this.alive;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 8, 0, 0, 7); ctx.fill();
      if (ko) {
        ctx.rotate(-Math.PI / 2.2); ctx.translate(-30, -10); ctx.globalAlpha = 0.75;
      }
      const bob = this.walking ? -Math.abs(Math.sin(t * 12 + this.phase)) * 4 : Math.sin(t * 2 + this.phase) * 1.5;
      ctx.translate(0, bob - this.lunge * 30);
      // ผ้าคลุม
      ctx.fillStyle = this.cape;
      ctx.beginPath(); ctx.moveTo(-14, -70); ctx.quadraticCurveTo(-26 + Math.sin(t * 3 + this.phase) * 3, -30, -22, -14); ctx.lineTo(22, -14); ctx.quadraticCurveTo(26, -30, 14, -70); ctx.fill();
      // ขา
      ctx.fillStyle = '#3a3550'; ctx.fillRect(-10, -22, 8, 22); ctx.fillRect(2, -22, 8, 22);
      // เกราะ
      const gr = ctx.createLinearGradient(-14, -72, 14, -20);
      gr.addColorStop(0, '#e8e8f8'); gr.addColorStop(1, '#8c8cab');
      ctx.fillStyle = gr; rr(-14, -72, 28, 52, 8); ctx.fill();
      ctx.fillStyle = this.cape; ctx.fillRect(-14, -40, 28, 6);
      // ดาบ/โล่
      ctx.save();
      ctx.translate(16, -52); ctx.rotate(-0.6 - this.lunge * 1.6);
      ctx.fillStyle = '#d0d4ff'; ctx.fillRect(-2.5, -46, 5, 46);
      ctx.fillStyle = '#ffd36b'; ctx.fillRect(-9, -2, 18, 5); ctx.fillRect(-2, 3, 4, 10);
      ctx.restore();
      if (this.shield) {
        ctx.fillStyle = '#4aa8ff'; ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-30, -66); ctx.lineTo(-12, -66); ctx.lineTo(-12, -40); ctx.quadraticCurveTo(-21, -26, -30, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      const h = this.head();
      if (!ko) avatarCircle(this.avatar, this.name, h.x, h.y, 24 * s, this.gifts ? '#ffd36b' : '#fff');
      else {
        avatarCircle(this.avatar, this.name, this.x - 50 * s, this.y - 22 * s, 22 * s, '#888', true);
        ctx.font = `${20 * s}px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('💫', this.x - 50 * s + Math.sin(t * 4) * 10, this.y - 56 * s);
      }
      if (this.shield && !ko) {
        ctx.strokeStyle = `rgba(120,200,255,${0.5 + Math.sin(t * 5) * 0.2})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.x, this.y - 55 * s, 42 * s, 70 * s, 0, 0, 7); ctx.stroke();
      }
      if (this.gifts >= 99 && !ko) { ctx.font = `${22 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('👑', h.x, h.y - 30 * s); }
    }
    drawLabel() {
      const ko = !this.alive;
      const txt = ko ? `${this.name} ${Math.ceil((this.ko - now()) / 1000)}` : this.name;
      label(txt, this.x, this.y + 14 * persH(this.y), 14, ko ? 'rgba(60,60,60,.75)' : this.gifts ? 'rgba(120,70,0,.8)' : 'rgba(10,8,30,.65)');
    }
    drawBubble() {
      if (!this.bubble) return;
      if (now() > this.bubble.until) { this.bubble = null; return; }
      const h = this.head();
      bubble(this.bubble.t, h.x, h.y - 26 * h.s);
    }
  }
  function getHero(u) {
    if (!u || !u.id) return null;
    let h = heroes.get(u.id);
    if (h) { h.touch(u); return h; }
    if (heroes.size >= C.maxHeroes) {
      let oldest = null;
      for (const x of heroes.values()) if (!x.gifts && (!oldest || x.lastActive < oldest.lastActive)) oldest = x;
      if (!oldest) return null;
      heroes.delete(oldest.id);
    }
    h = new Hero(u);
    heroes.set(u.id, h);
    return h;
  }

  // ---------- เอฟเฟกต์โจมตี ----------
  const fx = [], parts = [], nums = [];
  let screenShake = 0, buffUntil = 0, flash = 0;
  const dmgMult = () => (now() < buffUntil ? 1.5 : 1);
  const DUR = { punch: 0.45, heart: 0.9, fireball: 0.7, lightning: 0.55, meteor: 1.2, sword: 1.1, ultimate: 2.4 };
  function attack(kind, hero, dmg, user) {
    const h = hero ? hero.head() : { x: rand(100, W - 100), y: ARENA_TOP, s: 1 };
    if (hero) hero.lunge = 1;
    fx.push({ kind, t: 0, dur: DUR[kind], fx: h.x, fy: h.y, tx: BOSS.x + rand(-110, 110), ty: BOSS.y + rand(-110, 80), dmg, user, applied: 0, seed: rand(0, 1000) });
  }
  function applyDamage(amount, user, x, y, big) {
    if (amount <= 0) return;
    // ดาเมจที่ส่งมาช่วงอสูรตาย/รอตัวใหม่ เก็บไว้ทบให้ตัวถัดไป ไม่ให้ของขวัญเสียเปล่า
    if (boss.state !== 'alive') { boss.carry = (boss.carry || 0) + amount; return; }
    boss.hp -= amount;
    boss.hurt = 0.18; boss.shake = Math.min(26, boss.shake + 3 + amount / 60);
    boss.lastHit = now();
    nums.push({ x: x + rand(-30, 30), y: y + rand(-20, 20), v: Math.round(amount), life: 1.3, big });
    if (nums.length > 80) nums.shift();
    burst(x, y, big ? 26 : 8, big ? '#ffd36b' : '#fff');
    if (user) {
      const e = save.dmg[user.id] || { n: user.name, a: user.avatar, v: 0 };
      e.v += amount; e.n = user.name; e.a = user.avatar || e.a; save.dmg[user.id] = e;
      const f = boss.fightDmg[user.id] || { n: user.name, a: user.avatar, v: 0 };
      f.v += amount; boss.fightDmg[user.id] = f;
      const hero = heroes.get(user.id); if (hero) hero.dmg += amount;
      boss.lastHitter = user;
    }
    if (boss.hp <= 0) defeat();
  }
  function burst(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 380);
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 1), max: 1, col, g: 300 });
    }
    if (parts.length > 2500) parts.splice(0, parts.length - 2500);
  }
  function confetti(n) {
    for (let i = 0; i < n; i++) parts.push({ x: rand(0, W), y: rand(-200, 0), vx: rand(-60, 60), vy: rand(100, 300), life: rand(2, 4), max: 4, col: `hsl(${rand(0, 360)},90%,65%)`, g: 60, sq: true });
  }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      e.t += dt;
      const p = e.t / e.dur;
      if (e.kind === 'ultimate') {
        // ลำแสง: ดาเมจทยอยเข้า
        const want = clamp((p - 0.15) / 0.8, 0, 1) * e.dmg;
        if (want - e.applied >= e.dmg / 12 || (p >= 0.95 && e.applied < e.dmg)) {
          const d = (p >= 0.95 ? e.dmg : want) - e.applied;
          e.applied += d; applyDamage(d, e.user, e.tx, e.ty, true);
          screenShake = Math.max(screenShake, 14);
        }
      } else {
        const hitAt = { punch: 1, heart: 1, fireball: 1, lightning: 0.25, meteor: 0.85, sword: 0.7 }[e.kind];
        if (!e.applied && p >= hitAt) {
          e.applied = e.dmg;
          applyDamage(e.dmg, e.user, e.tx, e.ty, e.kind !== 'punch' && e.kind !== 'heart');
          if (e.kind === 'meteor' || e.kind === 'sword') { screenShake = Math.max(screenShake, 18); burst(e.tx, e.ty, 50, e.kind === 'meteor' ? '#ff8a3a' : '#bfe3ff'); flash = 0.3; }
        }
      }
      if (p >= 1) fx.splice(i, 1);
    }
  }
  function drawFx(t) {
    for (const e of fx) {
      const p = clamp(e.t / e.dur, 0, 1);
      ctx.save();
      if (e.kind === 'punch') {
        const x = lerp(e.fx, e.tx, p), y = lerp(e.fy, e.ty, p) - Math.sin(p * Math.PI) * 60;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,120,.4)'; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill();
      } else if (e.kind === 'heart') {
        const x = lerp(e.fx, e.tx, p) + Math.sin(p * 9 + e.seed) * 20, y = lerp(e.fy, e.ty, p) - Math.sin(p * Math.PI) * 120;
        heartShape(x, y - 10, 22, '#ff4d79');
      } else if (e.kind === 'fireball') {
        const x = lerp(e.fx, e.tx, p), y = lerp(e.fy, e.ty, p) - Math.sin(p * Math.PI) * 160;
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 6; k++) {
          const q = clamp(p - k * 0.03, 0, 1);
          const tx = lerp(e.fx, e.tx, q), ty = lerp(e.fy, e.ty, q) - Math.sin(q * Math.PI) * 160;
          ctx.fillStyle = `rgba(255,${120 + k * 20},40,${0.5 - k * 0.07})`; ctx.beginPath(); ctx.arc(tx, ty, 22 - k * 3, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
      } else if (e.kind === 'lightning') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 6; ctx.shadowColor = '#6cf'; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.moveTo(e.tx + 40, 0);
        let x = e.tx + 40;
        for (let y = 0; y < e.ty; y += 60) { x += ((hash(e.seed + y) % 100) - 50) * 0.9; ctx.lineTo(x, y); }
        ctx.lineTo(e.tx, e.ty); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      } else if (e.kind === 'meteor') {
        const q = clamp(p / 0.85, 0, 1);
        const sx = e.tx - 520, sy = -120;
        const x = lerp(sx, e.tx, q), y = lerp(sy, e.ty, q);
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createLinearGradient(sx, sy, x, y);
        gr.addColorStop(0, 'rgba(255,120,40,0)'); gr.addColorStop(1, 'rgba(255,180,60,.9)');
        ctx.strokeStyle = gr; ctx.lineWidth = 40; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(lerp(sx, e.tx, Math.max(0, q - 0.35)), lerp(sy, e.ty, Math.max(0, q - 0.35))); ctx.lineTo(x, y); ctx.stroke();
        if (p < 0.85) { ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(x, y, 34, 0, 7); ctx.fill(); ctx.fillStyle = '#8a3a1a'; ctx.beginPath(); ctx.arc(x - 6, y - 4, 22, 0, 7); ctx.fill(); }
        else { ctx.globalAlpha = 1 - (p - 0.85) / 0.15; ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(e.tx, e.ty, 60 + (p - 0.85) * 1200, 0, 7); ctx.fill(); }
      } else if (e.kind === 'sword') {
        const q = clamp(p / 0.7, 0, 1);
        const y = lerp(-300, e.ty - 60, q * q);
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#9cf'; ctx.shadowBlur = 40;
        ctx.translate(e.tx, y);
        ctx.fillStyle = 'rgba(200,230,255,.95)';
        ctx.beginPath(); ctx.moveTo(0, 160); ctx.lineTo(-26, 20); ctx.lineTo(-26, -200); ctx.lineTo(26, -200); ctx.lineTo(26, 20); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd36b'; ctx.fillRect(-70, -210, 140, 22); ctx.fillRect(-12, -290, 24, 80);
        if (p > 0.7) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1 - (p - 0.7) / 0.3; ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(e.tx, e.ty, 120 + (p - 0.7) * 600, -2.6, -0.5); ctx.stroke(); }
      } else if (e.kind === 'ultimate') {
        const a = p < 0.15 ? p / 0.15 : p > 0.9 ? (1 - p) / 0.1 : 1;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        const w = 40 + Math.sin(t * 40) * 8;
        const gr = ctx.createLinearGradient(e.fx, e.fy, e.tx, e.ty);
        gr.addColorStop(0, '#ff7ad9'); gr.addColorStop(0.5, '#ffd36b'); gr.addColorStop(1, '#7af0ff');
        ctx.strokeStyle = gr; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(e.fx, e.fy); ctx.lineTo(e.tx, e.ty); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.35; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(e.tx, e.ty, 70 + Math.sin(t * 30) * 12, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(e.fx, e.fy, 40, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawParts(dt) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0 || p.y > H + 20) { parts.splice(i, 1); continue; }
      p.vx *= 0.98; p.vy = p.vy * 0.98 + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.col;
      if (p.sq) { ctx.globalCompositeOperation = 'source-over'; ctx.fillRect(p.x, p.y, 8, 12); ctx.globalCompositeOperation = 'lighter'; }
      else ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    }
    ctx.restore();
  }
  function drawNums(dt) {
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i];
      n.life -= dt; n.y -= 70 * dt;
      if (n.life <= 0) { nums.splice(i, 1); continue; }
      const sz = n.big ? clamp(34 + Math.log10(n.v + 1) * 10, 34, 74) : 28;
      ctx.globalAlpha = clamp(n.life * 1.5, 0, 1);
      ctx.font = `800 ${sz}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(40,0,30,.9)'; ctx.strokeText('-' + fmt(n.v), n.x, n.y);
      ctx.fillStyle = n.big ? '#ffd36b' : '#fff'; ctx.fillText('-' + fmt(n.v), n.x, n.y);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- วาดอสูร ----------
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function drawBoss(t) {
    const d = boss.def;
    if (!d) return;
    const hpP = boss.hp / boss.maxHp;
    let alpha = 1, scale = 1;
    if (boss.state === 'dying') { alpha = clamp(1 - boss.stateT / 2.6, 0, 1); scale = 1 + boss.stateT * 0.08; }
    if (boss.state === 'victory') return;
    const appear = clamp((now() - boss.appear) / 900, 0, 1);
    scale *= 0.4 + appear * 0.6;
    const breathe = 1 + Math.sin(t * 2) * 0.025;
    const sx = (Math.random() - 0.5) * boss.shake, sy = (Math.random() - 0.5) * boss.shake;
    const winding = boss.windup > 0;
    const R = BOSS.r;
    ctx.save();
    ctx.globalAlpha = alpha * appear;
    ctx.translate(BOSS.x + sx, BOSS.y + sy + Math.sin(t * 1.4) * 10);
    ctx.scale(scale * breathe, scale / breathe);
    // ออร่า
    const aur = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.7);
    aur.addColorStop(0, winding ? 'rgba(255,60,60,.55)' : shade(d.color, 0.2).replace('rgb', 'rgba').replace(')', ',.45)'));
    aur.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aur; ctx.beginPath(); ctx.arc(0, 0, R * 1.7, 0, 7); ctx.fill();
    // แขน
    for (const side of [-1, 1]) {
      const sw = Math.sin(t * 2 + side) * 0.25 + (winding ? -0.9 : 0);
      ctx.save(); ctx.translate(side * R * 0.82, R * 0.1); ctx.rotate(side * (0.5 + sw));
      ctx.fillStyle = shade(d.color, -0.25);
      rr(-34, 0, 68, R * 0.95, 34); ctx.fill();
      ctx.fillStyle = '#f2ead6';
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 20 - 9, R * 0.92); ctx.lineTo(k * 20, R * 1.12); ctx.lineTo(k * 20 + 9, R * 0.92); ctx.fill(); }
      ctx.restore();
    }
    // เขา
    for (let i = 0; i < d.horns; i++) {
      const a = -Math.PI / 2 + (i - (d.horns - 1) / 2) * 0.42;
      ctx.save(); ctx.rotate(a + Math.PI / 2);
      const hg = ctx.createLinearGradient(0, -R * 1.45, 0, -R * 0.8);
      hg.addColorStop(0, '#fff6e0'); hg.addColorStop(1, '#a89c86');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.moveTo(-26, -R * 0.82); ctx.quadraticCurveTo(-10, -R * 1.2, i % 2 ? 22 : -22, -R * 1.42); ctx.quadraticCurveTo(14, -R * 1.15, 26, -R * 0.82); ctx.fill();
      ctx.restore();
    }
    // ตัว
    const bgr = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R * 1.1);
    bgr.addColorStop(0, shade(d.color, 0.35)); bgr.addColorStop(0.7, d.color); bgr.addColorStop(1, shade(d.color, -0.45));
    ctx.fillStyle = bgr;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) {
      const wob = 1 + Math.sin(a * 5 + t * 2) * 0.03 + (a > 0.3 && a < Math.PI - 0.3 ? Math.sin(a * 14) * 0.035 : 0);
      ctx.lineTo(Math.cos(a) * R * wob, Math.sin(a) * R * 0.92 * wob);
    }
    ctx.closePath(); ctx.fill();
    // จุดลาย
    ctx.fillStyle = shade(d.color, -0.2);
    [[-0.55, 0.35, 0.12], [0.6, 0.25, 0.09], [0.35, 0.6, 0.07], [-0.3, 0.65, 0.08]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x * R, y * R, r * R, 0, 7); ctx.fill(); });
    // รอยแตกเมื่อเลือดน้อย
    if (hpP < 0.5) {
      ctx.strokeStyle = 'rgba(30,0,10,.7)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-R * 0.6, -R * 0.4); ctx.lineTo(-R * 0.45, -R * 0.2); ctx.lineTo(-R * 0.55, 0); ctx.lineTo(-R * 0.4, R * 0.15); ctx.stroke();
      if (hpP < 0.25) { ctx.beginPath(); ctx.moveTo(R * 0.5, -R * 0.5); ctx.lineTo(R * 0.38, -R * 0.3); ctx.lineTo(R * 0.52, -R * 0.1); ctx.stroke(); }
    }
    // ตา
    const angry = hpP < 0.3 || winding;
    const look = boss.lastHitter ? clamp((heroes.get(boss.lastHitter.id)?.x ?? BOSS.x) - BOSS.x, -200, 200) / 200 : Math.sin(t * 0.7);
    const n = d.eyes;
    for (let i = 0; i < n; i++) {
      const ex = (i - (n - 1) / 2) * R * (n === 1 ? 0 : 0.42), ey = -R * 0.25 - (n === 3 && i === 1 ? R * 0.12 : 0);
      const er = n === 1 ? R * 0.3 : R * 0.17;
      const blink = (Math.sin(t * 0.9 + i) > 0.985) ? 0.15 : 1;
      ctx.save(); ctx.translate(ex, ey); ctx.scale(1, blink);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, er, 0, 7); ctx.fill();
      ctx.fillStyle = angry ? '#ff2a2a' : d.eye;
      ctx.beginPath(); ctx.arc(look * er * 0.35, er * 0.1, er * 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = '#120010'; ctx.beginPath(); ctx.arc(look * er * 0.4, er * 0.1, er * 0.28, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(look * er * 0.4 - er * 0.12, -er * 0.05, er * 0.1, 0, 7); ctx.fill();
      ctx.restore();
      if (angry) {
        ctx.strokeStyle = shade(d.color, -0.6); ctx.lineWidth = 10; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex - er * 1.1, ey - er * 1.3); ctx.lineTo(ex + er * 0.9, ey - er * 0.8); ctx.stroke();
      }
    }
    // ปาก
    const open = winding ? 0.55 : 0.25 + Math.sin(t * 3) * 0.05 + boss.hurt * 1.5;
    ctx.fillStyle = '#2a0016';
    ctx.beginPath(); ctx.ellipse(0, R * 0.38, R * 0.48, R * open, 0, 0, Math.PI); ctx.lineTo(-R * 0.48, R * 0.38); ctx.fill();
    ctx.fillStyle = '#f7f2e6';
    for (let k = 0; k < 6; k++) { const x = -R * 0.4 + k * R * 0.16; ctx.beginPath(); ctx.moveTo(x - 10, R * 0.38); ctx.lineTo(x, R * 0.38 + 26); ctx.lineTo(x + 10, R * 0.38); ctx.fill(); }
    // กระพริบขาวตอนโดนตี
    if (boss.hurt > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${boss.hurt * 2.5})`;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- อสูรสวนกลับ / ชนะ ----------
  let shockwave = null;
  function updateBoss(dt) {
    boss.hurt = Math.max(0, boss.hurt - dt);
    boss.shake = Math.max(0, boss.shake - dt * 40);
    const tn = now();
    if (boss.state === 'alive') {
      if (boss.windup > 0) {
        boss.windup -= dt;
        if (boss.windup <= 0) bossStrike();
      } else if (tn > boss.nextAttack && heroes.size > 0) {
        boss.windup = C.bossWindupSec;
      }
      if (tn - boss.lastHit > C.regenAfterIdleSec * 1000 && boss.hp < boss.maxHp) {
        boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * C.regenPercentPerSec / 100 * dt);
      }
      if (tn - saveT > 2000) { saveT = tn; save.hp = boss.hp; persist(); }
    } else if (boss.state === 'dying') {
      boss.stateT += dt;
      if (Math.random() < dt * 14) burst(BOSS.x + rand(-200, 200), BOSS.y + rand(-200, 200), 30, pick(['#ffd36b', '#ff7ad9', '#fff', boss.def.color]));
      screenShake = Math.max(screenShake, 10);
      if (boss.stateT > 2.6) { boss.state = 'victory'; boss.stateT = 0; confetti(260); }
    } else if (boss.state === 'victory') {
      boss.stateT += dt;
      if (boss.stateT > 8) spawnBoss(boss.level + 1);
    }
  }
  let saveT = 0;
  function bossStrike() {
    boss.nextAttack = now() + C.bossAttackEverySec * 1000;
    shockwave = { t: 0 };
    screenShake = 26; flash = 0.25;
    const alive = Array.from(heroes.values()).filter(h => h.alive && !h.leaving);
    let blocked = 0, kos = 0;
    alive.sort(() => Math.random() - 0.5);
    for (const h of alive) {
      if (kos >= C.knockoutCount) break;
      if (h.shield) { h.shield = false; blocked++; h.say('กันได้! 🛡️', 2500); continue; }
      h.ko = now() + C.reviveSec * 1000; kos++;
    }
    for (const h of heroes.values()) h.shield = false;
    toast(kos ? `${boss.def.name} โจมตี! สลบ ${kos} คน${blocked ? ` · กันได้ ${blocked}` : ''} — พิมพ์ "ฮีล" ช่วยเพื่อน` : `ทุกคนกันการโจมตีได้! 🛡️`, '💥', '#ff8a8a');
  }
  function defeat() {
    boss.hp = 0;
    boss.state = 'dying'; boss.stateT = 0;
    save.kills = (save.kills || 0) + 1;
    save.level = boss.level + 1; save.hp = null; persist();
    const last = boss.lastHitter;
    const mvp = Object.values(boss.fightDmg).sort((a, b) => b.v - a.v)[0];
    showBanner(`ปราบ ${boss.def.name} สำเร็จ! 🎉`, `MVP: ${mvp ? mvp.n + ' (' + fmt(mvp.v) + ')' : '-'}${last ? ' · ปิดฉาก: ' + last.name : ''}`, mvp ? { name: mvp.n, avatar: mvp.a } : null, 9000);
    for (const h of heroes.values()) { h.ko = 0; h.say(pick(['เย้! 🎉', 'ชนะแล้ว!', 'สุดยอด!', '💪']), 3000); }
  }
  function drawWarning(t) {
    if (boss.windup > 0) {
      const a = 0.6 + Math.sin(t * 12) * 0.4;
      ctx.fillStyle = `rgba(255,0,40,${0.12 * a})`; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 46px ${FONT}`; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(40,0,0,.9)';
      const txt = `⚠️ อสูรกำลังโจมตีใน ${Math.ceil(boss.windup)} วิ!`;
      ctx.strokeText(txt, W / 2, 1170); ctx.fillStyle = `rgba(255,${120 + a * 100},120,1)`; ctx.fillText(txt, W / 2, 1170);
      ctx.font = `700 30px ${FONT}`; ctx.strokeText('พิมพ์ "กัน" เพื่อป้องกัน 🛡️', W / 2, 1225); ctx.fillStyle = '#fff'; ctx.fillText('พิมพ์ "กัน" เพื่อป้องกัน 🛡️', W / 2, 1225);
    }
    if (shockwave) {
      shockwave.t += 1 / 60;
      const p = shockwave.t / 0.8;
      if (p >= 1) { shockwave = null; return; }
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 30 * (1 - p) + 4;
      ctx.beginPath(); ctx.ellipse(BOSS.x, 1300, 100 + p * 900, 40 + p * 500, 0, 0, 7); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- แจ้งเตือน / แบนเนอร์ ----------
  const toasts = [];
  function toast(text, icon = '✨', color = '#ffd877') {
    toasts.unshift({ text, icon, color, born: now() });
    if (toasts.length > 5) toasts.pop();
  }
  let banner = null;
  function showBanner(title, sub, user, ms = 5000) { banner = { title, sub, user, until: now() + ms, born: now() }; }

  // ---------- อีเวนต์ ----------
  const has = (text, list) => list.some(k => text.toLowerCase().includes(k.toLowerCase()));
  function onChat(u, text) {
    const h = getHero(u); if (!h) return;
    const raw = String(text || '').trim();
    const cm = C.commands;
    if (has(raw, cm.heal)) {
      if (!h.alive) { h.say('สลบอยู่ ฮีลไม่ได้ 😵', 2000); return; }
      if (now() - h.lastHeal < C.healCooldownSec * 1000) return;
      h.lastHeal = now();
      const kos = Array.from(heroes.values()).filter(x => !x.alive).slice(0, 3);
      kos.forEach(x => { x.ko = 0; x.say(`${h.name} ช่วยไว้ 💚`, 2500); burst(x.x, x.y - 60, 14, '#7dff9a'); });
      h.say(kos.length ? `ฮีล ${kos.length} คน 💚` : 'ทุกคนยังไหว 💚', 2500);
      return;
    }
    if (has(raw, cm.shield)) {
      if (!h.alive) return;
      if (now() - h.lastShield < C.shieldCooldownSec * 1000) return;
      h.lastShield = now(); h.shield = true; h.say('ตั้งโล่! 🛡️', 2000);
      return;
    }
    if (!h.alive) { h.say(`สลบอยู่ 😵 รอเพื่อนฮีล`, 2000); return; }
    // พิมพ์คำสั่งโจมตี หรือพิมพ์อะไรก็ได้ = ตี 1 ครั้ง (มีคูลดาวน์)
    if (now() - h.lastAtk < C.chatCooldownSec * 1000) { if (has(raw, cm.attack)) return; h.say(raw.slice(0, 30), 2500); return; }
    h.lastAtk = now();
    attack('punch', h, C.chatDamage * dmgMult(), u);
    if (!has(raw, cm.attack) && raw) h.say(raw.slice(0, 30), 2500);
  }
  function tierFor(each) { let t = C.attackTiers[0]; for (const x of C.attackTiers) if (each >= x.min) t = x; return t; }
  function onGift(u, g) {
    const h = getHero(u);
    const count = Math.max(1, g.count | 0), each = Math.max(1, g.diamonds | 0), total = count * each;
    const tier = tierFor(each);
    if (h) { h.gifts += total; if (!h.alive) { h.ko = 0; h.say('ฟื้นแล้ว! ⚡', 2000); } }
    const dmg = total * C.coinDamage * dmgMult();
    const shots = Math.min(count, 5);
    for (let i = 0; i < shots; i++) setTimeout(() => attack(tier.kind, h, dmg / shots, u), i * 220);
    toast(`${u.name} ใช้ ${tier.label} (${g.name} ×${count}) -${fmt(dmg)}`, tier.icon, '#ffd36b');
    if (each >= 299 || total >= 299) showBanner(`${tier.label}!!`, `${u.name} ส่ง ${g.name} ×${count}`, u, 3500);
  }
  function onLike(u, likes) {
    likes = Math.max(1, likes | 0);
    const h = getHero(u);
    if (h && !h.alive) return;
    const n = Math.min(3, likes);
    for (let i = 0; i < n; i++) setTimeout(() => attack('heart', h, (likes * C.likeDamage * dmgMult()) / n, u), i * 120);
  }
  function onFollow(u) {
    const h = getHero(u);
    buffUntil = now() + C.followBuffSec * 1000;
    if (h) h.say('ติดตามแล้ว 💖', 3000);
    toast(`${u.name} ติดตาม! ทั้งทีมดาเมจ x1.5 ${C.followBuffSec} วิ`, '💖', '#ff9ccf');
  }
  function onShare(u) {
    const h = getHero(u);
    const kos = Array.from(heroes.values()).filter(x => !x.alive).slice(0, 5);
    kos.forEach(x => (x.ko = 0));
    if (h) h.say('แชร์แล้ว 🔁', 2500);
    toast(`${u.name} แชร์ไลฟ์ ชุบชีวิตเพื่อน ${kos.length} คน`, '🔁', '#b6ff8f');
  }
  let viewers = 0, conn = { state: location.protocol.startsWith('http') ? 'connecting-server' : 'offline' };
  function handle(ev) {
    if (!ev || typeof ev.type !== 'string') return;
    const u = ev.user ? { id: String(ev.user.id || ev.user.name), name: String(ev.user.name || 'ผู้ชม'), avatar: String(ev.user.avatar || '') } : null;
    switch (ev.type) {
      case 'chat': if (u) onChat(u, ev.text); break;
      case 'gift': if (u && ev.gift) onGift(u, ev.gift); break;
      case 'like': if (u) onLike(u, ev.likes); break;
      case 'join': if (u && C.spawnOnJoin) { getHero(u); if (toasts.length < 3 || now() - toasts[0].born > 1500) toast(`${u.name} เข้าร่วมทีม`, '⚔️', '#bfe3ff'); } break;
      case 'follow': if (u) onFollow(u); break;
      case 'share': if (u) onShare(u); break;
      case 'viewers': viewers = ev.count | 0; break;
      case 'status': conn = ev; break;
      case 'demo': demo = !!ev.on; break;
      case 'scene':
        if (ev.action === 'bossNext') { if (boss.state === 'alive') defeat(); }
        else if (ev.action === 'bossAttack') { if (boss.state === 'alive') boss.windup = C.bossWindupSec; }
        else if (ev.action === 'bossReset' || ev.action === 'resetBoard') { save = { level: 1, hp: null, dmg: {}, kills: 0 }; persist(); spawnBoss(1); }
        else if (ev.action === 'clear') heroes.clear();
        else if (ev.action === 'fireworks') confetti(200);
        break;
    }
  }
  window.BOSS = { handle };

  function connectWS() {
    if (!location.protocol.startsWith('http')) return;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onmessage = e => { try { handle(JSON.parse(e.data)); } catch (err) { console.warn(err); } };
    ws.onclose = () => { conn = { state: 'server-lost' }; setTimeout(connectWS, 2000); };
  }
  connectWS();

  // ---------- ผู้ชมจำลอง ----------
  const DEMO_NAMES = ['น้องฝน', 'ฟ้า', 'มะลิ', 'แพรวา', 'พี่ต้น', 'เจ้าขุน', 'นนท์', 'ลุงบุญ', 'ปลายฟ้า', 'Mai', 'Bank', 'Ploy', 'ข้าวหอม', 'ต้นกล้า', 'มิ้นท์', 'บีม', 'โอ๊ต', 'เฟิร์น', 'ก้อง', 'ใบเตย', 'Joy', 'แจน'];
  const DEMO_CHAT = ['ตี', 'ตี', 'ตี', 'โจมตี', 'สู้ๆ', 'ฮีล', 'กัน', 'ตีมันเลย', 'ไปเลยยย'];
  const DEMO_GIFTS = [['Rose', 1], ['Rose', 1], ['Finger Heart', 5], ['Doughnut', 30], ['Hand Hearts', 100], ['Rocket', 299]];
  let demo = params.has('demo') || !location.protocol.startsWith('http');
  let demoT = 0;
  function demoTick(dt) {
    if (!demo) return;
    demoT -= dt;
    if (demoT > 0) return;
    demoT = rand(0.25, 0.9);
    const name = pick(DEMO_NAMES);
    const u = { id: 'demo-' + name, name, avatar: '' };
    const r = Math.random();
    if (r < 0.15) handle({ type: 'join', user: u });
    else if (r < 0.6) handle({ type: 'chat', user: u, text: boss.windup > 0 && Math.random() < 0.5 ? 'กัน' : pick(DEMO_CHAT) });
    else if (r < 0.9) handle({ type: 'like', user: u, likes: Math.ceil(rand(1, 20)) });
    else if (r < 0.985) { const g = Math.random() < 0.85 ? pick(DEMO_GIFTS.slice(0, 4)) : pick(DEMO_GIFTS); handle({ type: 'gift', user: u, gift: { name: g[0], diamonds: g[1], count: Math.random() < 0.25 ? Math.ceil(rand(2, 5)) : 1 } }); }
    else handle({ type: 'follow', user: u });
  }

  // ---------- HUD ----------
  function panel(x, y, w, h, border = 'rgba(255,140,200,.75)') {
    rr(x, y, w, h, 16);
    ctx.fillStyle = 'rgba(14,8,34,.8)'; ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 2.5; ctx.stroke();
  }
  function drawHUD(t) {
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = `800 62px ${FONT}`; ctx.lineJoin = 'round';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(50,0,40,.9)'; ctx.strokeText('⚔️ ' + C.title + ' ⚔️', W / 2, 58);
    const tg = ctx.createLinearGradient(0, 25, 0, 95); tg.addColorStop(0, '#ffe3f4'); tg.addColorStop(1, '#ff5fae');
    ctx.fillStyle = tg; ctx.fillText('⚔️ ' + C.title + ' ⚔️', W / 2, 58);
    // ชื่อบอส + หลอดเลือด
    const d = boss.def;
    ctx.font = `700 30px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(`ด่าน ${boss.level} · ${d ? d.name : ''}`, W / 2, 122);
    const bx = 40, by = 148, bw = W - 80, bh = 54;
    rr(bx, by, bw, bh, 27); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
    ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 3; ctx.stroke();
    const p = clamp(boss.hp / boss.maxHp, 0, 1);
    if (p > 0) {
      ctx.save(); rr(bx + 4, by + 4, bw - 8, bh - 8, 23); ctx.clip();
      const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      hg.addColorStop(0, '#ff2a55'); hg.addColorStop(1, p < 0.3 ? '#ff7a2a' : '#ff6fd0');
      ctx.fillStyle = hg; ctx.fillRect(bx + 4, by + 4, (bw - 8) * p, bh - 8);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(bx + 4, by + 6, (bw - 8) * p, 10);
      ctx.restore();
    }
    ctx.font = `800 28px ${FONT}`; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const hpT = `❤️ ${fmt(boss.hp)} / ${fmt(boss.maxHp)}`;
    ctx.strokeText(hpT, W / 2, by + bh / 2 + 1); ctx.fillStyle = '#fff'; ctx.fillText(hpT, W / 2, by + bh / 2 + 1);
    if (now() - boss.lastHit > C.regenAfterIdleSec * 1000 && boss.state === 'alive' && boss.hp < boss.maxHp) {
      ctx.font = `700 22px ${FONT}`; ctx.fillStyle = '#7dff9a'; ctx.fillText('อสูรกำลังฟื้นเลือด! รีบตีเร็ว!', W / 2, by + bh + 22);
    }
    // ท่าโจมตีจากของขวัญ
    const n = C.attackTiers.length, cw = (W - 40 - (n - 1) * 10) / n, cy = 236;
    C.attackTiers.forEach((tier, i) => {
      const x = 20 + i * (cw + 10);
      panel(x, cy, cw, 84, 'rgba(255,211,107,.8)');
      ctx.textAlign = 'left'; ctx.font = `30px ${FONT}`; ctx.fillText(tier.icon, x + 10, cy + 30);
      ctx.font = `700 19px ${FONT}`; ctx.fillStyle = '#ffd36b'; ctx.fillText('🪙' + tier.min + '+', x + 10, cy + 64);
      ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = `700 19px ${FONT}`;
      ctx.fillText(fitText(tier.label, cw - 56), x + cw - 10, cy + 30);
      ctx.fillStyle = '#ff9ccf'; ctx.font = `600 16px ${FONT}`;
      ctx.fillText('-' + fmt(tier.min * C.coinDamage), x + cw - 10, cy + 62);
    });
    // MVP
    const my = 334;
    panel(20, my, W - 40, 112);
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffd36b'; ctx.font = `700 22px ${FONT}`;
    ctx.fillText('🏆 MVP ดาเมจวันนี้', 40, my + 26);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 18px ${FONT}`;
    ctx.fillText(`ปราบแล้ว ${save.kills || 0} ตัว · ⚔️ ${heroes.size} คนในทีม${viewers ? ` · 👀 ${fmt(viewers)}` : ''}`, W - 40, my + 26);
    const top = Object.values(save.dmg).sort((a, b) => b.v - a.v).slice(0, 3);
    const colW = (W - 80) / 3;
    top.forEach((e, k) => {
      const x = 40 + k * colW, y = my + 74;
      avatarCircle(e.a, e.n, x + 22, y, 22, ['#ffd36b', '#ddd', '#e0a070'][k]);
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `700 19px ${FONT}`;
      ctx.fillText(fitText(`${k + 1}. ${e.n}`, colW - 60), x + 52, y - 11);
      ctx.fillStyle = '#ff9ccf'; ctx.font = `600 17px ${FONT}`;
      ctx.fillText(fmt(e.v), x + 52, y + 14);
    });
    if (!top.length) { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `500 19px ${FONT}`; ctx.fillText('ยังไม่มีใครโจมตี — เป็นคนแรกเลย!', W / 2, my + 74); }
    // แถบคำสั่ง
    const help = `พิมพ์ 👉  ตี = โจมตี  ·  กัน = ตั้งโล่  ·  ฮีล = ชุบเพื่อนที่สลบ  ·  กดใจ = ยิงหัวใจ  ·  ส่งของขวัญ = ท่าไม้ตาย  ·  ติดตาม = ทีมแรงขึ้น x1.5  ·  `;
    rr(20, 458, W - 40, 44, 22); ctx.fillStyle = 'rgba(14,8,34,.75)'; ctx.fill();
    ctx.save(); rr(20, 458, W - 40, 44, 22); ctx.clip();
    ctx.font = `600 22px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    const hw = ctx.measureText(help).width, off = (t * 70) % hw;
    ctx.fillText(help, 30 - off, 481); ctx.fillText(help, 30 - off + hw, 481);
    ctx.restore();
    if (now() < buffUntil) {
      ctx.textAlign = 'center'; ctx.font = `800 26px ${FONT}`; ctx.fillStyle = `rgba(255,140,210,${0.7 + Math.sin(t * 6) * 0.3})`;
      ctx.fillText(`💖 พลังทีม x1.5 อีก ${Math.ceil((buffUntil - now()) / 1000)} วิ`, W / 2, 530);
    }
  }
  function drawToasts() {
    const tn = now();
    toasts.forEach((m, i) => {
      const age = (tn - m.born) / 1000;
      if (age > 7) return;
      ctx.globalAlpha = clamp(Math.min(age * 4, 7 - age), 0, 1);
      const y = 1262 + i * 46, x = 20;
      ctx.font = `600 19px ${FONT}`;
      const text = fitText(m.text, 700);
      const w = ctx.measureText(text).width + 60;
      rr(x, y, w, 38, 19); ctx.fillStyle = 'rgba(14,8,34,.78)'; ctx.fill();
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `20px ${FONT}`; ctx.fillText(m.icon, x + 12, y + 20);
      ctx.font = `600 19px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(text, x + 42, y + 20);
      ctx.globalAlpha = 1;
    });
  }
  function drawBanner() {
    if (!banner) return;
    const tn = now();
    if (tn > banner.until) { banner = null; return; }
    const age = (tn - banner.born) / 1000;
    ctx.save();
    ctx.translate(W / 2, 880); ctx.scale(Math.min(1, 0.6 + age * 2.5), Math.min(1, 0.6 + age * 2.5));
    ctx.globalAlpha = clamp((banner.until - tn) / 500, 0, 1);
    const w = 900, h = 190;
    ctx.shadowColor = '#ff5fae'; ctx.shadowBlur = 40;
    rr(-w / 2, -h / 2, w, h, 24);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, 'rgba(110,20,90,.96)'); g.addColorStop(1, 'rgba(30,10,60,.96)');
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 4; ctx.stroke();
    if (banner.user) avatarCircle(banner.user.avatar, banner.user.name, -w / 2 + 90, 0, 60, '#ffd36b');
    const cx = banner.user ? 55 : 0, mw = banner.user ? 640 : 820;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe28a'; ctx.font = `800 48px ${FONT}`; ctx.fillText(fitText(banner.title, mw), cx, -28);
    ctx.fillStyle = '#fff'; ctx.font = `600 26px ${FONT}`; ctx.fillText(fitText(banner.sub, mw), cx, 36);
    ctx.restore();
    if (boss.state === 'victory') {
      ctx.textAlign = 'center'; ctx.font = `700 30px ${FONT}`; ctx.fillStyle = '#fff';
      ctx.fillText(`อสูรตัวต่อไปจะมาใน ${Math.max(0, Math.ceil(8 - boss.stateT))} วิ…`, W / 2, 1040);
    }
  }
  function drawStatus() {
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `600 16px ${FONT}`;
    if (demo && conn.state !== 'connected') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText('● โหมดเดโม', 22, H - 22); return; }
    ctx.fillStyle = conn.state === 'connected' ? '#3ddc84' : conn.state === 'idle' ? '#999' : '#ffb020';
    ctx.beginPath(); ctx.arc(28, H - 22, 6, 0, 7); ctx.fill();
    if (conn.state !== 'connected') { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(fitText(`${conn.state}${conn.username ? ' @' + conn.username : ''} ${conn.message || ''}`, 900), 42, H - 21); }
  }

  // ---------- ลูปหลัก ----------
  let last = now(), lastCleanup = 0;
  function frame() {
    const tn = now();
    const dt = Math.min(0.05, (tn - last) / 1000);
    last = tn;
    const t = tn / 1000;
    demoTick(dt);
    updateBoss(dt);
    updateFx(dt);
    for (const h of heroes.values()) h.update(dt);
    if (tn - lastCleanup > 2000) {
      lastCleanup = tn;
      for (const h of heroes.values()) if (!h.gifts && !h.leaving && tn - h.lastActive > C.idleLeaveMinutes * 60000) h.leaving = true;
    }
    screenShake = Math.max(0, screenShake - dt * 40);
    ctx.save();
    if (screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    ctx.drawImage(bg, -20, -20, W + 40, H + 40);
    drawBoss(t);
    const hs = Array.from(heroes.values()).sort((a, b) => a.y - b.y);
    for (const h of hs) h.draw(t);
    for (const h of hs) h.drawLabel();
    drawFx(t);
    drawParts(dt);
    drawNums(dt);
    for (const h of hs) h.drawBubble();
    drawWarning(t);
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 1.5); }
    drawHUD(t);
    drawToasts();
    drawBanner();
    drawStatus();
    requestAnimationFrame(frame);
  }

  renderBackground();
  spawnBoss(save.level || 1, save.hp);
  requestAnimationFrame(frame);
})();
