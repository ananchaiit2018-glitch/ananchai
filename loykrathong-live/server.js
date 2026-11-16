// เซิร์ฟเวอร์ตัวกลาง: ดึงอีเวนต์จาก TikTok LIVE (คอมเมนต์/ของขวัญ/หัวใจ/เข้าห้อง/ติดตาม/แชร์)
// แล้วส่งต่อแบบเรียลไทม์ผ่าน WebSocket ไปยังหน้าฉาก (public/index.html) ที่เปิดใน OBS / TikTok LIVE Studio
//
// ใช้งาน:  TIKTOK_USERNAME=ชื่อบัญชี npm start      หรือ   node server.js ชื่อบัญชี
// ทดสอบโดยไม่ต้องไลฟ์:  npm run demo   แล้วเปิด http://localhost:8080
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const args = process.argv.slice(2);
const DEMO = args.includes('--demo') || process.env.DEMO === '1';
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const SIGN_API_KEY = process.env.SIGN_API_KEY || undefined;
let username = (args.find(a => !a.startsWith('--')) || process.env.TIKTOK_USERNAME || '').replace(/^@/, '').trim();

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

// ---------- HTTP: เสิร์ฟไฟล์หน้าเว็บ ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

// ---------- WebSocket: กระจายอีเวนต์ไปทุกหน้าจอ ----------
const wss = new WebSocketServer({ server, path: '/ws' });
let status = { type: 'status', state: 'idle', username, message: '' };

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
}
function setStatus(state, message = '') {
  status = { type: 'status', state, username, message };
  console.log(`[สถานะ] ${state}${username ? ' @' + username : ''} ${message}`);
  broadcast(status);
}

wss.on('connection', ws => {
  ws.send(JSON.stringify(status));
  if (DEMO) ws.send(JSON.stringify({ type: 'demo', on: true }));
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    // คำสั่งจากแผงควบคุม (control.html)
    if (m.cmd === 'connect' && typeof m.username === 'string') {
      username = m.username.replace(/^@/, '').trim();
      connectTikTok(true);
    } else if (m.cmd === 'disconnect') {
      username = '';
      stopTikTok();
      setStatus('idle');
    } else if (m.cmd === 'sim' && m.event && typeof m.event.type === 'string') {
      broadcast(m.event); // อีเวนต์จำลองสำหรับทดสอบ
    } else if (m.cmd === 'scene' && typeof m.action === 'string') {
      broadcast({ type: 'scene', action: m.action, value: m.value });
    } else if (m.cmd === 'demo') {
      broadcast({ type: 'demo', on: !!m.on });
    }
  });
});

// ---------- แปลงข้อมูล TikTok เป็นรูปแบบเรียบง่าย ----------
function pickUser(u) {
  if (!u) return { id: 'unknown', name: 'ผู้ชม', avatar: '' };
  const pic = u.profilePicture?.url?.[0] || u.profilePictureMedium?.url?.[0] || '';
  return {
    id: String(u.uniqueId || u.userId || u.nickname || 'unknown'),
    name: String(u.nickname || u.uniqueId || 'ผู้ชม').slice(0, 24),
    avatar: pic,
  };
}

let connection = null;
let reconnectTimer = null;
let reconnectDelay = 5000;
let wantConnected = false;

function stopTikTok() {
  wantConnected = false;
  clearTimeout(reconnectTimer);
  if (connection) {
    const c = connection;
    connection = null;
    c.removeAllListeners?.();
    c.disconnect().catch(() => {});
  }
}

async function connectTikTok(fresh) {
  if (!username) return setStatus('idle', 'ยังไม่ได้ใส่ชื่อบัญชี TikTok');
  if (fresh) { stopTikTok(); reconnectDelay = 5000; }
  wantConnected = true;
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
  const conn = new TikTokLiveConnection(username, { signApiKey: SIGN_API_KEY, enableExtendedGiftInfo: true });
  connection = conn;
  setStatus('connecting');

  conn.on(WebcastEvent.CHAT, d => broadcast({ type: 'chat', user: pickUser(d.user), text: String(d.comment || '') }));
  conn.on(WebcastEvent.MEMBER, d => broadcast({ type: 'join', user: pickUser(d.user) }));
  conn.on(WebcastEvent.LIKE, d => broadcast({ type: 'like', user: pickUser(d.user), likes: Number(d.likeCount) || 1, total: Number(d.totalLikeCount) || 0 }));
  conn.on(WebcastEvent.FOLLOW, d => broadcast({ type: 'follow', user: pickUser(d.user) }));
  conn.on(WebcastEvent.SHARE, d => broadcast({ type: 'share', user: pickUser(d.user) }));
  conn.on(WebcastEvent.ROOM_USER, d => broadcast({ type: 'viewers', count: Number(d.viewerCount) || 0 }));
  conn.on(WebcastEvent.GIFT, d => {
    const g = d.giftDetails || {};
    // ของขวัญแบบส่งรัว (giftType 1) จะนับตอนจบสตรีคเท่านั้น จะได้ไม่ซ้ำ
    if (g.giftType === 1 && !d.repeatEnd) return;
    broadcast({
      type: 'gift',
      user: pickUser(d.user),
      gift: {
        id: d.giftId,
        name: g.giftName || d.extendedGiftInfo?.name || 'ของขวัญ',
        diamonds: Number(g.diamondCount ?? d.extendedGiftInfo?.diamond_count) || 1,
        count: Math.max(1, Number(d.repeatCount) || 1),
        image: g.giftImage?.url?.[0] || g.icon?.url?.[0] || '',
      },
    });
  });
  conn.on(WebcastEvent.STREAM_END, () => {
    setStatus('ended', 'ไลฟ์จบแล้ว');
    stopTikTok();
  });
  conn.on(ControlEvent.DISCONNECTED, () => {
    if (connection !== conn || !wantConnected) return;
    setStatus('reconnecting', `หลุดการเชื่อมต่อ จะลองใหม่ใน ${reconnectDelay / 1000} วิ`);
    scheduleReconnect();
  });
  conn.on(ControlEvent.ERROR ?? 'error', err => console.warn('[TikTok error]', err?.message || err));

  try {
    const state = await conn.connect();
    if (connection !== conn) return;
    reconnectDelay = 5000;
    setStatus('connected', `roomId ${state.roomId}`);
  } catch (err) {
    if (connection !== conn) return;
    const msg = err?.constructor?.name === 'UserOfflineError' ? 'บัญชีนี้ยังไม่ได้เปิดไลฟ์' : (err?.message || String(err));
    setStatus('reconnecting', `${msg} — จะลองใหม่ใน ${reconnectDelay / 1000} วิ`);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => { if (wantConnected) connectTikTok(false); }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 60000);
}

server.listen(PORT, HOST, () => {
  console.log('==============================================');
  console.log(' ลอยกระทงไลฟ์ — พร้อมใช้งาน');
  console.log(` ฉาก (ใส่ใน OBS/LIVE Studio):  http://localhost:${PORT}/`);
  console.log(` แผงควบคุม/ทดสอบ:            http://localhost:${PORT}/control.html`);
  console.log(DEMO ? ' โหมดเดโม: มีผู้ชมจำลองเดินเข้างานอัตโนมัติ' : '');
  console.log('==============================================');
  if (username) connectTikTok(true);
  else setStatus('idle', 'ใส่ชื่อบัญชีในแผงควบคุม หรือรัน: node server.js ชื่อบัญชี');
});

process.on('SIGINT', () => { stopTikTok(); process.exit(0); });
