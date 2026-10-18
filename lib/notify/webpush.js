/* ============================================================
   da Cecot — Web Push (VAPID) for Erika's phone.
   Stores the browser push subscriptions she grants from /admin and fans an
   alert out to each. Android Chrome delivers these through FCM even when the
   PWA is closed, which is the whole point.

   Keys live in the environment, never the repo:
     VAPID_PUBLIC_KEY   shipped to the browser (not secret)
     VAPID_PRIVATE_KEY  SECRET — signs the push
     VAPID_SUBJECT      a mailto: contact (defaults to info@dacecotfood.com)
   With no keys set the whole thing is inert: publicKey() is '', fanout() is a
   no-op, so the bell still works and nothing errors.

   Postgres (Neon) when DATABASE_URL is set, JSON file otherwise.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LOCAL_PATH = path.join(ROOT, '.data', 'push_subscriptions.json');

function backend() { return process.env.DATABASE_URL ? 'postgres' : 'local'; }
function configured() { return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY); }
function publicKey() { return process.env.VAPID_PUBLIC_KEY || ''; }

let _wp = null;
function wp() {
  if (!_wp) {
    _wp = require('web-push');
    if (configured()) _wp.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:info@dacecotfood.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  }
  return _wp;
}

let _pool = null;
function pool() { if (!_pool) { const { Pool } = require('@neondatabase/serverless'); _pool = new Pool({ connectionString: process.env.DATABASE_URL }); } return _pool; }

let _ready = false;
async function init() {
  if (backend() !== 'postgres' || _ready) return;
  await pool().query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint   text        PRIMARY KEY,
    p256dh     text        NOT NULL,
    auth       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_ok_at timestamptz
  )`);
  _ready = true;
}

function readLocal() { try { return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); } catch (e) { return []; } }
function writeLocal(a) { fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true }); fs.writeFileSync(LOCAL_PATH, JSON.stringify(a, null, 2)); }

function valid(sub) { return sub && typeof sub.endpoint === 'string' && /^https?:\/\//.test(sub.endpoint) && sub.keys && sub.keys.p256dh && sub.keys.auth; }

async function save(sub) {
  if (!valid(sub)) throw new Error('Invalid push subscription.');
  await init();
  if (backend() === 'postgres') {
    await pool().query(
      'INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ($1,$2,$3) ON CONFLICT (endpoint) DO UPDATE SET p256dh=$2, auth=$3',
      [sub.endpoint, sub.keys.p256dh, sub.keys.auth]
    );
    return;
  }
  const all = readLocal().filter((s) => s.endpoint !== sub.endpoint);
  all.push({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, created_at: new Date().toISOString() });
  writeLocal(all);
}

async function remove(sub) {
  const endpoint = sub && (sub.endpoint || sub);
  if (!endpoint) return;
  await init();
  if (backend() === 'postgres') { await pool().query('DELETE FROM push_subscriptions WHERE endpoint=$1', [endpoint]); return; }
  writeLocal(readLocal().filter((s) => s.endpoint !== endpoint));
}

async function list() {
  await init();
  if (backend() === 'postgres') { const r = await pool().query('SELECT * FROM push_subscriptions'); return r.rows; }
  return readLocal();
}

function toWebPush(row) { return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }; }

/* Send one alert to every subscribed device. Dead endpoints (404/410) are
   pruned so the list self-heals. Never throws — callers are best-effort. */
async function fanout(n) {
  if (!configured()) return { sent: 0, skipped: true };
  let subs;
  try { subs = await list(); } catch (e) { return { sent: 0, error: 'list failed' }; }
  const payload = JSON.stringify({ title: n.title || 'da Cecot', body: n.body || '', link: n.link || '' });
  let sent = 0, pruned = 0;
  await Promise.all(subs.map(async (row) => {
    try {
      await wp().sendNotification(toWebPush(row), payload, { TTL: 3600 });
      sent++;
    } catch (err) {
      const code = err && err.statusCode;
      if (code === 404 || code === 410) { try { await remove(row.endpoint); pruned++; } catch (e) {} }
      else console.error('push send failed', code || (err && err.message));
    }
  }));
  return { sent, pruned };
}

module.exports = { configured, publicKey, init, save, remove, list, fanout };
