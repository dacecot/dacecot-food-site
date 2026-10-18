/* ============================================================
   da Cecot — admin notifications (the bell).
   One row per thing Erika should notice: a new reservation (with its time), a
   large-party request, a new order or class booking, a class cutoff approaching.
   Postgres (Neon) when DATABASE_URL is set, JSON file otherwise — the same
   adapter shape as lib/orders/tables.js. Pure storage: who gets notified and
   how (bell, push) is decided by the callers.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const R = require('../orders/reservations');

const ROOT = path.resolve(__dirname, '../..');
const LOCAL_PATH = path.join(ROOT, '.data', 'notifications.json');
const MAX_KEEP = 300; // local store: keep the most recent N

function backend() { return process.env.DATABASE_URL ? 'postgres' : 'local'; }

let _pool = null;
function pool() {
  if (!_pool) { const { Pool } = require('@neondatabase/serverless'); _pool = new Pool({ connectionString: process.env.DATABASE_URL }); }
  return _pool;
}

let _ready = false;
async function init() {
  if (backend() !== 'postgres' || _ready) return;
  await pool().query(`CREATE TABLE IF NOT EXISTS notifications (
    id       text        PRIMARY KEY,
    at       timestamptz NOT NULL DEFAULT now(),
    day      date        NOT NULL,
    kind     text        NOT NULL,
    title    text        NOT NULL,
    body     text,
    link     text,
    read_at  timestamptz
  )`);
  await pool().query('CREATE INDEX IF NOT EXISTS idx_notifications_at ON notifications (at DESC)');
  _ready = true;
}

function readLocal() { try { return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); } catch (e) { return []; } }
function writeLocal(arr) { fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true }); fs.writeFileSync(LOCAL_PATH, JSON.stringify(arr.slice(-MAX_KEEP), null, 2)); }

function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n || 200); }

async function create(n) {
  await init();
  const row = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    day: R.todayISO(),
    kind: clean(n.kind, 40) || 'info',
    title: clean(n.title, 160) || 'Update',
    body: clean(n.body, 400),
    link: clean(n.link, 60),
    read_at: null
  };
  if (backend() === 'postgres') {
    await pool().query('INSERT INTO notifications (id, at, day, kind, title, body, link) VALUES ($1, now(), $2, $3, $4, $5, $6)',
      [row.id, row.day, row.kind, row.title, row.body, row.link]);
  } else {
    const all = readLocal(); all.push(row); writeLocal(all);
  }
  return row;
}

// A caller that may fire repeatedly (a cron) uses this to avoid duplicate rows:
// at most one notification with this `kind` per `day`.
async function createOncePerDay(n) {
  await init();
  const day = R.todayISO();
  if (backend() === 'postgres') {
    const r = await pool().query('SELECT 1 FROM notifications WHERE kind=$1 AND day=$2 LIMIT 1', [clean(n.kind, 40), day]);
    if (r.rows[0]) return null;
  } else {
    if (readLocal().some((x) => x.kind === clean(n.kind, 40) && x.day === day)) return null;
  }
  return create(n);
}

async function list(opts) {
  await init();
  const limit = Math.max(1, Math.min(100, (opts && opts.limit) || 30));
  let rows;
  if (backend() === 'postgres') {
    const r = await pool().query('SELECT * FROM notifications ORDER BY at DESC LIMIT $1', [limit]);
    rows = r.rows;
  } else {
    rows = readLocal().slice(-limit).reverse();
  }
  return rows.map((x) => ({ id: x.id, at: x.at, kind: x.kind, title: x.title, body: x.body, link: x.link, read: !!x.read_at }));
}

async function unreadCount() {
  await init();
  if (backend() === 'postgres') {
    const r = await pool().query('SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL');
    return r.rows[0] ? r.rows[0].n : 0;
  }
  return readLocal().filter((x) => !x.read_at).length;
}

async function markRead(ids) {
  await init();
  const all = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (backend() === 'postgres') {
    if (!all.length) return;
    await pool().query('UPDATE notifications SET read_at=now() WHERE read_at IS NULL AND id = ANY($1)', [all]);
    return;
  }
  const rows = readLocal(); const set = new Set(all);
  rows.forEach((x) => { if (!x.read_at && set.has(x.id)) x.read_at = new Date().toISOString(); });
  writeLocal(rows);
}

async function markAllRead() {
  await init();
  if (backend() === 'postgres') { await pool().query('UPDATE notifications SET read_at=now() WHERE read_at IS NULL'); return; }
  const rows = readLocal(); rows.forEach((x) => { if (!x.read_at) x.read_at = new Date().toISOString(); }); writeLocal(rows);
}

module.exports = { backend, init, create, createOncePerDay, list, unreadCount, markRead, markAllRead };
