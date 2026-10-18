/* ============================================================
   da Cecot — restaurant floor-plan tables.
   Same adapter pattern as store.js: Postgres (Neon) when DATABASE_URL is set,
   JSON file fallback otherwise. A table: { id, name, seats, shape, x, y, active }.
   x/y are percentages (0-100) of the floor-plan canvas so the plan scales.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const R = require('./reservations');

const ROOT = path.resolve(__dirname, '../..');
const LOCAL_PATH = path.join(ROOT, '.data', 'tables.json');
const EVENTS_PATH = path.join(ROOT, '.data', 'table_events.json');

function backend() { return process.env.DATABASE_URL ? 'postgres' : 'local'; }

let _pool = null;
function pool() {
  if (!_pool) {
    const { Pool } = require('@neondatabase/serverless');
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

let _ready = false;
async function init() {
  if (backend() === 'postgres') {
    if (_ready) return;
    await pool().query(`CREATE TABLE IF NOT EXISTS restaurant_tables (
      id text PRIMARY KEY,
      name text NOT NULL,
      seats integer NOT NULL DEFAULT 2,
      shape text NOT NULL DEFAULT 'round',
      x real NOT NULL DEFAULT 50,
      y real NOT NULL DEFAULT 50,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    // Live occupancy — added additively so an existing table keeps its row.
    await pool().query(`ALTER TABLE restaurant_tables
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS occupied_at timestamptz,
      ADD COLUMN IF NOT EXISTS occupied_party integer,
      ADD COLUMN IF NOT EXISTS occupied_submission_id text`);
    // Turn log: one row per seat/clear, for the free/occupied metric + history.
    await pool().query(`CREATE TABLE IF NOT EXISTS table_events (
      id            bigserial   PRIMARY KEY,
      at            timestamptz NOT NULL DEFAULT now(),
      day           date        NOT NULL,
      table_id      text        NOT NULL,
      table_name    text,
      action        text        NOT NULL,   -- 'seated' | 'cleared'
      party         integer,
      duration_min  integer,
      submission_id text
    )`);
    await pool().query('CREATE INDEX IF NOT EXISTS idx_table_events_day ON table_events (day)');
    _ready = true;
  }
}

/* ---- local JSON fallback ---- */
function readLocal() {
  try { return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); } catch (e) { return []; }
}
function writeLocal(arr) {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(arr, null, 2));
}

function sanitize(input, existing) {
  const t = Object.assign({}, existing || {});
  if (input.name != null) t.name = String(input.name).replace(/[<>]/g, '').trim().slice(0, 40) || t.name || 'Table';
  if (input.seats != null) { const n = Math.round(Number(input.seats)); t.seats = Number.isFinite(n) ? Math.min(30, Math.max(1, n)) : (t.seats || 2); }
  if (input.shape != null) t.shape = ['round', 'square', 'booth'].indexOf(String(input.shape)) > -1 ? String(input.shape) : (t.shape || 'round');
  if (input.x != null) { const n = Number(input.x); t.x = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : (t.x || 50); }
  if (input.y != null) { const n = Number(input.y); t.y = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : (t.y || 50); }
  if (input.active != null) t.active = !!input.active;
  return t;
}

function withStatus(t) {
  return Object.assign({ status: 'free', occupied_at: null, occupied_party: null, occupied_submission_id: null }, t);
}

async function list() {
  await init();
  if (backend() === 'postgres') {
    const r = await pool().query('SELECT * FROM restaurant_tables WHERE active = true ORDER BY created_at ASC');
    return r.rows;
  }
  return readLocal().filter((t) => t.active !== false).map(withStatus);
}

async function create(input) {
  await init();
  const t = sanitize(input);
  t.id = crypto.randomUUID();
  t.active = true;
  t.name = t.name || 'Table'; t.seats = t.seats || 2; t.shape = t.shape || 'round';
  t.x = t.x != null ? t.x : 50; t.y = t.y != null ? t.y : 50;
  if (backend() === 'postgres') {
    await pool().query(
      'INSERT INTO restaurant_tables (id, name, seats, shape, x, y, active) VALUES ($1,$2,$3,$4,$5,$6,true)',
      [t.id, t.name, t.seats, t.shape, t.x, t.y]
    );
    return t;
  }
  const all = readLocal(); all.push(t); writeLocal(all);
  return t;
}

async function update(id, input) {
  await init();
  if (backend() === 'postgres') {
    const r0 = await pool().query('SELECT * FROM restaurant_tables WHERE id = $1', [id]);
    if (!r0.rows[0]) return null;
    const t = sanitize(input, r0.rows[0]);
    await pool().query(
      'UPDATE restaurant_tables SET name=$2, seats=$3, shape=$4, x=$5, y=$6, active=$7 WHERE id=$1',
      [id, t.name, t.seats, t.shape, t.x, t.y, t.active]
    );
    return t;
  }
  const all = readLocal();
  const i = all.findIndex((t) => t.id === id);
  if (i < 0) return null;
  all[i] = sanitize(input, all[i]); all[i].id = id;
  writeLocal(all);
  return all[i];
}

// Soft delete — the table disappears from the plan; past seat assignments keep the id.
async function remove(id) {
  return update(id, { active: false });
}

/* ---- Live occupancy: seat guests / clear the table ---------------------- */
function readEvents() { try { return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8')); } catch (e) { return []; } }
function writeEvents(arr) { fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true }); fs.writeFileSync(EVENTS_PATH, JSON.stringify(arr, null, 2)); }
function intOrNull(v) { const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; }

async function logEvent(ev) {
  const row = Object.assign({ at: new Date().toISOString(), day: R.todayISO() }, ev);
  if (backend() === 'postgres') {
    await pool().query(
      'INSERT INTO table_events (at, day, table_id, table_name, action, party, duration_min, submission_id) VALUES (now(),$1,$2,$3,$4,$5,$6,$7)',
      [row.day, row.table_id, row.table_name || null, row.action, row.party == null ? null : row.party, row.duration_min == null ? null : row.duration_min, row.submission_id || null]
    );
    return;
  }
  const all = readEvents(); all.push(row); writeEvents(all);
}

// Mark a table occupied (a seated reservation or a walk-in). Idempotent-ish:
// re-seating an occupied table just refreshes the party/time.
async function occupy(id, opts) {
  await init();
  const o = opts || {};
  const party = intOrNull(o.party);
  const subId = o.submissionId ? String(o.submissionId) : null;
  let table;
  if (backend() === 'postgres') {
    const r = await pool().query(
      "UPDATE restaurant_tables SET status='occupied', occupied_at=now(), occupied_party=$2, occupied_submission_id=$3 WHERE id=$1 AND active=true RETURNING *",
      [id, party, subId]
    );
    table = r.rows[0];
  } else {
    const all = readLocal(); const i = all.findIndex((t) => t.id === id);
    if (i < 0) return null;
    all[i] = Object.assign(withStatus(all[i]), { status: 'occupied', occupied_at: new Date().toISOString(), occupied_party: party, occupied_submission_id: subId });
    writeLocal(all); table = all[i];
  }
  if (!table) return null;
  await logEvent({ table_id: id, table_name: table.name, action: 'seated', party: party, submission_id: subId });
  return table;
}

// Guests have left — free the table and log the turn (how long it was occupied).
async function clear(id) {
  await init();
  let table, occupiedAt;
  if (backend() === 'postgres') {
    const r0 = await pool().query('SELECT * FROM restaurant_tables WHERE id=$1', [id]);
    table = r0.rows[0]; if (!table) return null;
    occupiedAt = table.occupied_at;
    const r = await pool().query(
      "UPDATE restaurant_tables SET status='free', occupied_at=NULL, occupied_party=NULL, occupied_submission_id=NULL WHERE id=$1 RETURNING *",
      [id]
    );
    table = r.rows[0];
  } else {
    const all = readLocal(); const i = all.findIndex((t) => t.id === id);
    if (i < 0) return null;
    const cur = withStatus(all[i]); occupiedAt = cur.occupied_at;
    all[i] = Object.assign(cur, { status: 'free', occupied_at: null, occupied_party: null, occupied_submission_id: null });
    writeLocal(all); table = all[i];
  }
  let durationMin = null;
  if (occupiedAt) { const ms = Date.now() - Date.parse(occupiedAt); if (Number.isFinite(ms) && ms >= 0) durationMin = Math.round(ms / 60000); }
  await logEvent({ table_id: id, table_name: table.name, action: 'cleared', party: null, duration_min: durationMin });
  return table;
}

/* Live metric: how full is the room right now + today's turns. */
async function statusSummary() {
  const tbls = await list();
  const occupied = tbls.filter((t) => t.status === 'occupied');
  const seatsTotal = tbls.reduce((s, t) => s + (Number(t.seats) || 0), 0);
  const seatsOccupied = occupied.reduce((s, t) => s + (Number(t.seats) || 0), 0);
  const coversNow = occupied.reduce((s, t) => s + (Number(t.occupied_party) || 0), 0);

  // Today's cleared turns + average duration.
  const today = R.todayISO();
  let turnsToday = 0, avgTurnMin = null;
  try {
    if (backend() === 'postgres') {
      const r = await pool().query("SELECT count(*)::int AS n, avg(duration_min) AS avg FROM table_events WHERE day=$1 AND action='cleared'", [today]);
      turnsToday = r.rows[0] ? r.rows[0].n : 0;
      avgTurnMin = r.rows[0] && r.rows[0].avg != null ? Math.round(Number(r.rows[0].avg)) : null;
    } else {
      const cleared = readEvents().filter((e) => e.day === today && e.action === 'cleared');
      turnsToday = cleared.length;
      const durs = cleared.map((e) => e.duration_min).filter((d) => Number.isFinite(d));
      avgTurnMin = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    }
  } catch (e) { /* metric is best-effort */ }

  return {
    tables: tbls.length,
    free: tbls.length - occupied.length,
    occupied: occupied.length,
    seatsTotal: seatsTotal,
    seatsOccupied: seatsOccupied,
    seatsFree: Math.max(0, seatsTotal - seatsOccupied),
    coversNow: coversNow,
    turnsToday: turnsToday,
    avgTurnMin: avgTurnMin
  };
}

// Recent turn history (newest first), for the floor view.
async function recentEvents(limit) {
  await init();
  const n = Math.max(1, Math.min(200, limit || 40));
  if (backend() === 'postgres') {
    const r = await pool().query('SELECT * FROM table_events ORDER BY at DESC LIMIT $1', [n]);
    return r.rows;
  }
  return readEvents().slice(-n).reverse();
}

module.exports = { backend, init, list, create, update, remove, occupy, clear, statusSummary, recentEvents };
