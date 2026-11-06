/* ==========================================================
   LYNK | Tiny server (no installs needed, just Node 18 or newer)

   It does two jobs:
   1. Serves your website files (HTML / CSS / JS folders) over the web.
   2. Passes messages between the laptop and the phone that are in
      the same "session" (the code hidden in the QR code):
        - laptop -> phone : "countdown started", "here is your objective"
        - phone -> laptop : "here is my photo"

   Start it:   node server/server.js      (or: npm start)
   Then open:  http://localhost:3000
   Settings (all optional, set as environment variables):
     PORT         the port to listen on (default 3000)
     PUBLIC_URL   the https address people reach this server at, used
                  for the QR code if you open the game on localhost
   Photos are only passed along in memory. Nothing is saved to disk.
   ========================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const ROOT = path.resolve(__dirname, '..');

const MAX_BODY = 4 * 1024 * 1024;        // biggest message accepted (a photo is ~100-300 KB)
const MAX_SESSIONS = 2000;
const SESSION_IDLE_MS = 3 * 60 * 60 * 1000;
const REPLAY_MAX_AGE_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 20 * 1000;
const POSTS_PER_MINUTE = 240;            // per visitor address

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const PUBLIC_FOLDERS = ['HTML', 'CSS', 'JS', 'IMG', 'IMAGES', 'ASSETS', 'FONTS'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

/* ---------- Sessions ---------- */
// id -> { clients: Map(clientId -> { res, role }), replay: { countdown, hunt }, touched }
const sessions = new Map();
let presenceCounter = 0;

function getSession(id, create) {
  let s = sessions.get(id);
  if (!s && create) {
    if (sessions.size >= MAX_SESSIONS) { return null; }
    s = { clients: new Map(), replay: {}, touched: Date.now() };
    sessions.set(id, s);
  }
  if (s) { s.touched = Date.now(); }
  return s;
}

function sendEvent(res, msg) {
  res.write('data: ' + JSON.stringify(msg) + '\n\n');
}

function broadcastPresence(s) {
  let laptops = 0, phones = 0;
  s.clients.forEach((c) => { if (c.role === 'phone') { phones += 1; } else { laptops += 1; } });
  presenceCounter += 1;
  const msg = { id: 'p-' + Date.now() + '-' + presenceCounter, data: { type: '_presence', laptops, phones } };
  s.clients.forEach((c) => sendEvent(c.res, msg));
}

setInterval(() => {
  const now = Date.now();
  sessions.forEach((s, id) => {
    s.clients.forEach((c) => { try { c.res.write(': keep-alive\n\n'); } catch (e) { /* closed */ } });
    if (s.clients.size === 0 && now - s.touched > SESSION_IDLE_MS) { sessions.delete(id); }
  });
}, HEARTBEAT_MS).unref();

/* ---------- Tiny rate limit ---------- */
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000).unref();
function tooMany(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  return n > POSTS_PER_MINUTE;
}

/* ---------- Helpers ---------- */
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((n) => { if (n.family === 'IPv4' && !n.internal) { out.push(n.address); } });
  });
  return out;
}

/* ---------- API ---------- */
function handleEvents(req, res, url) {
  const sid = url.searchParams.get('s');
  const cid = url.searchParams.get('c');
  const role = url.searchParams.get('role') === 'phone' ? 'phone' : 'laptop';
  if (!ID_RE.test(sid || '') || !ID_RE.test(cid || '')) { return json(res, 400, { error: 'bad id' }); }

  const s = getSession(sid, true);
  if (!s) { return json(res, 503, { error: 'busy' }); }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 2000\n\n');

  // A phone that joins late catches up on what the laptop is doing right now
  if (role === 'phone') {
    const now = Date.now();
    ['countdown', 'hunt'].forEach((type) => {
      const r = s.replay[type];
      if (r && now - r.at < REPLAY_MAX_AGE_MS) { sendEvent(res, r.msg); }
    });
  }

  const old = s.clients.get(cid);
  if (old) { try { old.res.end(); } catch (e) { /* ignore */ } }
  s.clients.set(cid, { res, role });
  broadcastPresence(s);

  req.on('close', () => {
    const cur = s.clients.get(cid);
    if (cur && cur.res === res) { s.clients.delete(cid); broadcastPresence(s); }
  });
}

function handleSend(req, res, url) {
  const sid = url.searchParams.get('s');
  const cid = url.searchParams.get('c');
  if (!ID_RE.test(sid || '') || !ID_RE.test(cid || '')) { return json(res, 400, { error: 'bad id' }); }
  if (tooMany(req)) { return json(res, 429, { error: 'slow down' }); }

  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) { json(res, 413, { error: 'too big' }); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (res.writableEnded) { return; }
    let msg;
    try { msg = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return json(res, 400, { error: 'bad json' }); }
    if (!msg || typeof msg.id !== 'string' || msg.id.length > 80 || !msg.data || typeof msg.data !== 'object') {
      return json(res, 400, { error: 'bad message' });
    }

    const s = getSession(sid, true);
    if (!s) { return json(res, 503, { error: 'busy' }); }

    const type = msg.data.type;
    if (type === 'countdown') { s.replay = {}; }                       // a new round: forget the old one
    if (type === 'countdown' || type === 'hunt') { s.replay[type] = { at: Date.now(), msg }; }

    let delivered = 0;
    s.clients.forEach((c, id) => {
      if (id !== cid) { sendEvent(c.res, msg); delivered += 1; }
    });
    json(res, 200, { ok: true, delivered });
  });
}

/* ---------- Website files ---------- */
function handleStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (e) { pathname = '/'; }
  if (pathname === '/' || pathname === '') {
    res.writeHead(302, { Location: '/HTML/index.html' });
    return res.end();
  }

  const file = path.normalize(path.join(ROOT, pathname));
  const rel = path.relative(ROOT, file);
  const top = rel.split(path.sep)[0].toUpperCase();
  if (rel.startsWith('..') || path.isAbsolute(rel) || !PUBLIC_FOLDERS.includes(top)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- Server ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname === '/api/events' && req.method === 'GET') { return handleEvents(req, res, url); }
  if (url.pathname === '/api/send' && req.method === 'POST') { return handleSend(req, res, url); }
  if (url.pathname === '/api/info' && req.method === 'GET') {
    return json(res, 200, { publicUrl: PUBLIC_URL || null, lan: lanAddresses(), port: PORT });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  handleStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log('\nLYNK is running.\n');
  console.log('  On this computer:  http://localhost:' + PORT);
  lanAddresses().forEach((ip) => console.log('  Same Wi-Fi (no camera, http only):  http://' + ip + ':' + PORT));
  console.log(PUBLIC_URL ? '  Public address:    ' + PUBLIC_URL : '\n  For real phone cameras you need an https address (see README.md).');
  console.log('');
});

module.exports = server;
