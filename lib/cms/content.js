/* ============================================================
   da Cecot CMS — content loader (used by the site generator)
   Reads content.json (if present), falls back to schema defaults per key, and
   exposes safe accessors. An absent or invalid content.json renders identically
   to the hardcoded defaults, so the CMS is purely additive.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { defaults, fieldsByKey } = require('./schema');

const CONTENT_PATH = path.resolve(__dirname, '../../content.json');

let raw = {};
try {
  const txt = fs.readFileSync(CONTENT_PATH, 'utf8');
  const parsed = JSON.parse(txt);
  if (parsed && typeof parsed === 'object') raw = parsed;
} catch (e) { raw = {}; }

// Raw merged value: stored value if the key is present, else the schema default.
// Required fields that are present-but-empty fall back to the default (never
// blank out a required field).
function get(key) {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) return defaults[key];
  const f = fieldsByKey[key];
  let v = raw[key];
  if (f && f.required && (v === '' || v === null || v === undefined)) return defaults[key];
  return v;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// HTML-escaped text for safe insertion into element bodies/attributes.
function text(key) { return esc(get(key)); }

// Validated absolute URL (http/https only); anything else returns '' so callers
// can fall back to a safe pending state. Never emits javascript:/data: URLs.
function url(key) {
  const v = String(get(key) == null ? '' : get(key)).trim();
  if (v === '') return '';
  if (/^https?:\/\//i.test(v) && !/[\s"'<>]/.test(v)) return v;
  return '';
}

// tel: href derived from the phone number (digits only, +1 for 10-digit NANP).
function phoneHref() {
  const digits = String(get('phone') || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return '+' + (digits.length === 10 ? '1' + digits : digits);
}

function bool(key) { return get(key) === true || get(key) === 'true'; }
function num(key) { const n = Number(get(key)); return Number.isFinite(n) ? n : Number(defaults[key]); }
function list(key) { const v = get(key); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim() !== '') : (Array.isArray(defaults[key]) ? defaults[key] : []); }

module.exports = { get, esc, text, url, phoneHref, bool, num, list, raw };
