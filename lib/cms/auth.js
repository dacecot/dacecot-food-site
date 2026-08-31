/* ============================================================
   da Cecot CMS — authentication
   Stateless signed-session auth for a single admin (Erika).
   - Password: bcrypt hash in ADMIN_PASSWORD_HASH (never committed).
   - Session: HS256 JWT (built-in crypto) in a HttpOnly/Secure/SameSite=Strict
     cookie, 8h expiry.
   - CSRF: a per-session random token embedded in the JWT and echoed by the
     client in the X-CSRF-Token header on every mutation.
   No external JWT dependency; bcryptjs is the only runtime dep.
   ============================================================ */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE = 'dacecot_admin';
const SESSION_TTL = 8 * 60 * 60; // seconds

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function secret() {
  const s = process.env.SESSION_SECRET;
  return (s && s.length >= 16) ? s : null;
}
function isProd() {
  return process.env.VERCEL === '1' || process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

// Whether auth is fully configured (both env secrets present).
function configured() {
  return !!secret() && !!process.env.ADMIN_PASSWORD_HASH;
}

function sign(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = header + '.' + body;
  const sig = b64url(crypto.createHmac('sha256', secret()).update(data).digest());
  return data + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !secret()) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = parts[0] + '.' + parts[1];
  const expected = b64url(crypto.createHmac('sha256', secret()).update(data).digest());
  const a = Buffer.from(parts[2]); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8')); } catch (e) { return null; }
  if (!payload || payload.exp == null || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

function parseCookies(req) {
  const h = (req.headers && req.headers.cookie) || '';
  const out = {};
  h.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) {} }
  });
  return out;
}
function serializeCookie(name, value, opts) {
  opts = opts || {};
  let s = name + '=' + encodeURIComponent(value);
  if (opts.maxAge != null) s += '; Max-Age=' + opts.maxAge;
  s += '; Path=' + (opts.path || '/');
  if (opts.httpOnly) s += '; HttpOnly';
  if (opts.secure) s += '; Secure';
  s += '; SameSite=' + (opts.sameSite || 'Strict');
  return s;
}

// Verify the submitted password against the bcrypt hash in env. Async.
async function verifyPassword(plain) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return false;
  try { return await bcrypt.compare(String(plain == null ? '' : plain), hash); }
  catch (e) { return false; }
}

// Issue a fresh session cookie; returns the CSRF token to hand back to the client.
function issueSession(res) {
  const csrf = b64url(crypto.randomBytes(24));
  const now = Math.floor(Date.now() / 1000);
  const token = sign({ sub: 'admin', role: 'admin', csrf, iat: now, exp: now + SESSION_TTL });
  res.setHeader('Set-Cookie', serializeCookie(COOKIE, token, { httpOnly: true, secure: isProd(), sameSite: 'Strict', maxAge: SESSION_TTL, path: '/' }));
  return csrf;
}
function clearSession(res) {
  res.setHeader('Set-Cookie', serializeCookie(COOKIE, '', { httpOnly: true, secure: isProd(), sameSite: 'Strict', maxAge: 0, path: '/' }));
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[COOKIE]);
}

// Gate a request. Returns the session on success; on failure writes a 401/403
// and returns null. Mutations must pass requireCsrf=true.
function requireAuth(req, res, requireCsrf) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Not signed in.' });
    return null;
  }
  if (requireCsrf) {
    const header = req.headers['x-csrf-token'] || req.headers['X-CSRF-Token'];
    if (!header || header !== session.csrf) {
      res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      return null;
    }
  }
  return session;
}

module.exports = {
  COOKIE, SESSION_TTL, configured, verifyPassword,
  issueSession, clearSession, getSession, requireAuth, isProd
};
