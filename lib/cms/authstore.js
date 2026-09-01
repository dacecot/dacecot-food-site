/* ============================================================
   da Cecot CMS — admin password storage
   Resolution order at login:
     1. Hash stored in the database (set when the admin changes her password)
     2. ADMIN_PASSWORD_HASH env var
     3. Built-in DEFAULT (TeamDaCecot25!) — first-run only; the UI forces a
        password change when this is what matched.
   Only bcrypt hashes are ever stored — never plaintext. Changing the password
   requires DATABASE_URL (serverless functions can't rewrite env vars).
   ============================================================ */
const bcrypt = require('bcryptjs');

// bcrypt of the well-known first-run default password. Works only until a real
// password is set (env or DB); the admin UI forces a change when it matches.
const DEFAULT_HASH = '$2a$12$Y4eJhFUbZx7xcvA3RKmhYe8xprLT7k0avI5rkDdOrQEJMooxcx1hy';

function dbConfigured() { return !!process.env.DATABASE_URL; }

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
  if (!dbConfigured() || _ready) return;
  await pool().query(
    'CREATE TABLE IF NOT EXISTS admin_auth (id text PRIMARY KEY, password_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())'
  );
  _ready = true;
}

// The stored hash from the DB, or null (no DB / not set yet).
async function storedHash() {
  if (!dbConfigured()) return null;
  try {
    await init();
    const r = await pool().query('SELECT password_hash FROM admin_auth WHERE id = $1', ['admin']);
    return (r.rows[0] && r.rows[0].password_hash) || null;
  } catch (e) { console.error('authstore read failed', e && e.message); return null; }
}

async function saveHash(hash) {
  if (!dbConfigured()) throw Object.assign(new Error('Password changes need the database (DATABASE_URL) configured.'), { status: 503 });
  await init();
  await pool().query(
    'INSERT INTO admin_auth (id, password_hash, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET password_hash = $2, updated_at = now()',
    ['admin', hash]
  );
}

/* Verify a password against the chain. Returns:
   { ok: false }                             — no match
   { ok: true, source: 'db'|'env'|'default', mustChange, canChange } */
async function verify(plain) {
  const pw = String(plain == null ? '' : plain);
  const db = await storedHash();
  if (db) {
    const ok = await bcrypt.compare(pw, db);
    return ok ? { ok: true, source: 'db', mustChange: false, canChange: true } : { ok: false };
  }
  const env = process.env.ADMIN_PASSWORD_HASH;
  if (env) {
    // A real password exists — the built-in default is disabled from here on.
    const ok = await bcrypt.compare(pw, env);
    return ok ? { ok: true, source: 'env', mustChange: false, canChange: dbConfigured() } : { ok: false };
  }
  const ok = await bcrypt.compare(pw, DEFAULT_HASH);
  if (ok) return { ok: true, source: 'default', mustChange: true, canChange: dbConfigured() };
  return { ok: false };
}

// Set a new password (plaintext in, bcrypt stored). Rejects weak/default.
async function setPassword(next) {
  const pw = String(next == null ? '' : next);
  if (pw.length < 10) throw Object.assign(new Error('Please choose a password of at least 10 characters.'), { status: 400 });
  if (await bcrypt.compare(pw, DEFAULT_HASH)) throw Object.assign(new Error('Please choose a different password than the starting one.'), { status: 400 });
  await saveHash(bcrypt.hashSync(pw, 12));
}

module.exports = { verify, setPassword, dbConfigured, DEFAULT_HASH };
