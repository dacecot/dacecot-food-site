/* ============================================================
   da Cecot — restaurant floor-plan tables.
   Same adapter pattern as store.js: Postgres (Neon) when DATABASE_URL is set,
   JSON file fallback otherwise. A table: { id, name, seats, shape, x, y, active }.
   x/y are percentages (0-100) of the floor-plan canvas so the plan scales.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const LOCAL_PATH = path.join(ROOT, '.data', 'tables.json');

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

async function list() {
  await init();
  if (backend() === 'postgres') {
    const r = await pool().query('SELECT * FROM restaurant_tables WHERE active = true ORDER BY created_at ASC');
    return r.rows;
  }
  return readLocal().filter((t) => t.active !== false);
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

module.exports = { backend, init, list, create, update, remove };
