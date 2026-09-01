/* ============================================================
   Local dev server — serves the static site AND mounts the Vercel serverless
   functions under /api/* with Vercel-compatible req/res shims, so the whole
   CMS (login → edit → save → rebuild) can be exercised locally.

   Usage:
     SESSION_SECRET=... ADMIN_PASSWORD_HASH=... node lib/cms/dev-server.js
   (No env → login correctly reports "not set up". CMS_STORE defaults to local:
   saves write content.json + rebuild the site in place.)
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const PORT = process.env.PORT || 4400;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.pdf': 'application/pdf', '.webp': 'image/webp' };

const ROUTES = {
  '/api/send': '../../api/send.js',
  '/api/admin/login': '../../api/admin/login.js',
  '/api/admin/logout': '../../api/admin/logout.js',
  '/api/admin/session': '../../api/admin/session.js',
  '/api/admin/content': '../../api/admin/content.js',
  '/api/admin/upload': '../../api/admin/upload.js',
  '/api/admin/password': '../../api/admin/password.js',
  '/api/admin/orders': '../../api/admin/orders.js',
  '/api/square/webhook': '../../api/square/webhook.js',
  '/api/cron/reminders': '../../api/cron/reminders.js'
};

function shimRes(res) {
  res.status = function (c) { res.statusCode = c; return res; };
  res.json = function (obj) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

// After a local save, rebuild the static pages so edits show up immediately.
let lastContent = '';
function maybeRebuild() {
  try {
    const now = fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8');
    if (now !== lastContent) {
      lastContent = now;
      execFileSync('node', [path.join(ROOT, '.claude/build.js')], { stdio: 'ignore' });
      console.log('[dev] content.json changed → site rebuilt');
    }
  } catch (e) { /* no content.json yet */ }
}
try { lastContent = fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8'); } catch (e) {}

http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);

  const route = ROUTES[pathname.replace(/\/$/, '')] || null;
  if (route) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw && (req.headers['content-type'] || '').includes('json')) { try { req.body = JSON.parse(raw); } catch (e) { req.body = raw; } }
      else if (raw) req.body = raw;
      try {
        await require(path.join(__dirname, route))(req, shimRes(res));
        if (pathname.indexOf('/api/admin/') === 0 && req.method === 'POST') maybeRebuild();
      } catch (e) {
        console.error('[dev] handler error', pathname, e);
        if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: 'dev handler error' })); }
      }
    });
    return;
  }

  // /admin → admin/index.html; static files otherwise.
  let p = pathname;
  if (p === '/' ) p = '/index.html';
  if (p === '/admin' || p === '/admin/') p = '/admin/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('[dev] site + CMS API on http://localhost:' + PORT));
