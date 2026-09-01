/* ============================================================
   da Cecot — Orders & Payments store adapter
   Persists every captured submission (pasta-shop order, class booking,
   reservation, contact, wholesale) to one of two backends, chosen by env:

     - postgres : when DATABASE_URL is set. Uses @neondatabase/serverless.
                  ALL SQL is parameterized ($1, $2, …) — no string
                  interpolation of values, so it is SQL-injection safe.
     - local    : otherwise. A JSON file at .data/submissions.json. Lets the
                  whole subsystem run and be tested with no database.

   Submission shape (see normalize() in submission.js):
     { id, type, created_at, name, email, phone, amount_cents, currency,
       payment_status, payment_link_url, square_order_id, square_payment_id,
       paid_at, reminded_at, details, subject }

   No secrets are ever logged.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, '.data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Columns, in a fixed order, used for both INSERT and row mapping.
const COLUMNS = [
  'id', 'type', 'created_at', 'name', 'email', 'phone', 'amount_cents',
  'currency', 'payment_status', 'payment_link_url', 'square_order_id',
  'square_payment_id', 'paid_at', 'reminded_at', 'details', 'subject'
];

const UNPAID_STATUSES = ['none', 'pending'];

function backend() {
  return process.env.DATABASE_URL ? 'postgres' : 'local';
}

/* ---------- shared helpers ---------- */

// Fill in any missing fields so every stored row has a complete, predictable shape.
function shape(sub) {
  const s = Object.assign({}, sub);
  if (!s.id) s.id = crypto.randomUUID();
  if (!s.created_at) s.created_at = new Date().toISOString();
  if (!s.currency) s.currency = 'CAD';
  if (!s.payment_status) s.payment_status = 'none';
  if (s.amount_cents === undefined) s.amount_cents = null;
  if (!s.details || typeof s.details !== 'object') s.details = {};
  for (const k of ['name', 'email', 'phone', 'payment_link_url', 'square_order_id',
    'square_payment_id', 'paid_at', 'reminded_at', 'subject', 'type']) {
    if (s[k] === undefined) s[k] = null;
  }
  return s;
}

/* ============================================================
   Postgres backend (@neondatabase/serverless)
   ============================================================ */
let _pool = null;
function pool() {
  if (_pool) return _pool;
  const { Pool } = require('@neondatabase/serverless');
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

function rowToSub(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    amount_cents: row.amount_cents == null ? null : Number(row.amount_cents),
    currency: row.currency,
    payment_status: row.payment_status,
    payment_link_url: row.payment_link_url,
    square_order_id: row.square_order_id,
    square_payment_id: row.square_payment_id,
    paid_at: row.paid_at instanceof Date ? row.paid_at.toISOString() : row.paid_at,
    reminded_at: row.reminded_at instanceof Date ? row.reminded_at.toISOString() : row.reminded_at,
    details: (row.details && typeof row.details === 'object') ? row.details : {},
    subject: row.subject
  };
}

const pg = {
  async init() {
    const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    // Fixed schema text, no value interpolation — runs CREATE TABLE + indexes.
    await pool().query(sql);
  },

  async record(sub) {
    const s = shape(sub);
    const placeholders = COLUMNS.map((_, i) => '$' + (i + 1)).join(', ');
    const values = COLUMNS.map((c) => (c === 'details' ? JSON.stringify(s[c] || {}) : s[c]));
    const text = 'INSERT INTO submissions (' + COLUMNS.join(', ') + ') VALUES (' + placeholders + ') RETURNING *';
    const r = await pool().query(text, values);
    return rowToSub(r.rows[0]);
  },

  async list(opts) {
    opts = opts || {};
    const where = [];
    const params = [];
    if (opts.type) { params.push(opts.type); where.push('type = $' + params.length); }
    if (opts.status) { params.push(opts.status); where.push('payment_status = $' + params.length); }
    let text = 'SELECT * FROM submissions';
    if (where.length) text += ' WHERE ' + where.join(' AND ');
    text += ' ORDER BY created_at DESC';
    if (opts.limit != null) { params.push(Math.max(1, Math.min(1000, parseInt(opts.limit, 10) || 0))); text += ' LIMIT $' + params.length; }
    const r = await pool().query(text, params);
    return r.rows.map(rowToSub);
  },

  async get(id) {
    const r = await pool().query('SELECT * FROM submissions WHERE id = $1', [id]);
    return rowToSub(r.rows[0]);
  },

  async markPaid(id, info) {
    info = info || {};
    const r = await pool().query(
      'UPDATE submissions SET payment_status = $1, square_payment_id = COALESCE($2, square_payment_id), paid_at = $3 WHERE id = $4 RETURNING *',
      ['paid', info.squarePaymentId || null, info.paidAt || new Date().toISOString(), id]
    );
    return rowToSub(r.rows[0]);
  },

  async markReminded(id) {
    const r = await pool().query(
      "UPDATE submissions SET payment_status = 'reminded', reminded_at = $1 WHERE id = $2 RETURNING *",
      [new Date().toISOString(), id]
    );
    return rowToSub(r.rows[0]);
  },

  async listUnpaid(opts) {
    opts = opts || {};
    const params = [UNPAID_STATUSES];
    let text = 'SELECT * FROM submissions WHERE payment_status = ANY($1)';
    if (opts.olderThanMinutes != null) {
      params.push(new Date(Date.now() - opts.olderThanMinutes * 60 * 1000).toISOString());
      text += ' AND created_at <= $' + params.length;
    }
    text += ' ORDER BY created_at DESC';
    const r = await pool().query(text, params);
    return r.rows.map(rowToSub);
  },

  async update(id, patch) {
    patch = patch || {};
    const allowed = COLUMNS.filter((c) => c !== 'id');
    const sets = [];
    const params = [];
    for (const c of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, c)) {
        params.push(c === 'details' ? JSON.stringify(patch[c] || {}) : patch[c]);
        sets.push(c + ' = $' + params.length);
      }
    }
    if (!sets.length) return this.get(id);
    params.push(id);
    const text = 'UPDATE submissions SET ' + sets.join(', ') + ' WHERE id = $' + params.length + ' RETURNING *';
    const r = await pool().query(text, params);
    return rowToSub(r.rows[0]);
  }
};

/* ============================================================
   Local JSON backend (.data/submissions.json)
   ============================================================ */
function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}
function writeAll(rows) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2) + '\n');
}
function byNewest(a, b) {
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

const local = {
  async init() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) writeAll([]);
  },

  async record(sub) {
    const s = shape(sub);
    const rows = readAll();
    rows.push(s);
    writeAll(rows);
    return s;
  },

  async list(opts) {
    opts = opts || {};
    let rows = readAll();
    if (opts.type) rows = rows.filter((r) => r.type === opts.type);
    if (opts.status) rows = rows.filter((r) => r.payment_status === opts.status);
    rows.sort(byNewest);
    if (opts.limit != null) rows = rows.slice(0, Math.max(0, parseInt(opts.limit, 10) || 0));
    return rows;
  },

  async get(id) {
    return readAll().find((r) => r.id === id) || null;
  },

  async markPaid(id, info) {
    info = info || {};
    return this.update(id, {
      payment_status: 'paid',
      square_payment_id: info.squarePaymentId || undefined,
      paid_at: info.paidAt || new Date().toISOString()
    });
  },

  async markReminded(id) {
    return this.update(id, { payment_status: 'reminded', reminded_at: new Date().toISOString() });
  },

  async listUnpaid(opts) {
    opts = opts || {};
    const cutoff = opts.olderThanMinutes != null
      ? Date.now() - opts.olderThanMinutes * 60 * 1000
      : null;
    let rows = readAll().filter((r) => UNPAID_STATUSES.indexOf(r.payment_status) > -1);
    if (cutoff != null) rows = rows.filter((r) => new Date(r.created_at).getTime() <= cutoff);
    rows.sort(byNewest);
    return rows;
  },

  async update(id, patch) {
    patch = patch || {};
    const rows = readAll();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    // undefined values in the patch are ignored (leave the existing value alone).
    const clean = {};
    Object.keys(patch).forEach((k) => { if (patch[k] !== undefined) clean[k] = patch[k]; });
    rows[idx] = Object.assign({}, rows[idx], clean);
    writeAll(rows);
    return rows[idx];
  }
};

/* ---------- public API — delegates to the active backend ---------- */
function impl() { return backend() === 'postgres' ? pg : local; }

module.exports = {
  backend,
  init: (...a) => impl().init(...a),
  record: (...a) => impl().record(...a),
  list: (...a) => impl().list(...a),
  get: (...a) => impl().get(...a),
  markPaid: (...a) => impl().markPaid(...a),
  markReminded: (...a) => impl().markReminded(...a),
  listUnpaid: (...a) => impl().listUnpaid(...a),
  update: (...a) => impl().update(...a)
};
