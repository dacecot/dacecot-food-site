/* ============================================================
   da Cecot CMS — input validation & sanitization
   Every value written to content.json passes through here. We strip control
   characters and angle brackets (so stored content can never inject markup or
   break the generator's templates), enforce types, lengths and formats, and
   drop unknown keys. Defense-in-depth: the loader also HTML-escapes on render.
   ============================================================ */
const { fieldsByKey, defaults } = require('./schema');

// Strip control chars (keep \n=10 and \r=13 for textareas) and angle brackets,
// so stored content can never open an HTML tag or break the generator.
function clean(s) {
  let out = '';
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 && code !== 10 && code !== 13) continue; // control chars
    if (code === 127) continue;                            // DEL
    const ch = str[i];
    if (ch === '<' || ch === '>') continue;                // angle brackets
    out += ch;
  }
  return out;
}

function fieldError(f, msg) {
  const e = new Error('"' + f.label + '" ' + msg + '.');
  e.field = f.key; e.status = 400;
  return e;
}

function validateField(f, value) {
  switch (f.type) {
    case 'text':
    case 'tel':
    case 'email':
    case 'url': {
      let s = clean(value).trim();
      if (f.maxlength) s = s.slice(0, f.maxlength);
      if (f.type === 'email' && s && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw fieldError(f, 'must be a valid email address');
      if (f.type === 'url' && s && !/^https?:\/\/[^\s]+$/i.test(s)) throw fieldError(f, 'must start with http:// or https://');
      if (f.required && !s) throw fieldError(f, 'is required');
      return s;
    }
    case 'textarea': {
      let s = clean(value); // keep newlines
      if (f.maxlength) s = s.slice(0, f.maxlength);
      if (f.required && !s.trim()) throw fieldError(f, 'is required');
      return s;
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw fieldError(f, 'must be a number');
      let r = Math.round(n);
      if (f.min != null) r = Math.max(f.min, r);
      if (f.max != null) r = Math.min(f.max, r);
      return r;
    }
    case 'toggle':
      return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
    case 'list': {
      let arr = Array.isArray(value) ? value : clean(value).split('\n');
      arr = arr.map((x) => clean(x).trim()).filter(Boolean);
      if (f.maxItems) arr = arr.slice(0, f.maxItems);
      return arr;
    }
    case 'image': {
      const s = clean(value).trim();
      if (!s) return defaults[f.key];
      if (s.indexOf('..') > -1 || !/^images\/[A-Za-z0-9._/-]+\.(jpe?g|png|webp|gif)$/i.test(s)) {
        throw fieldError(f, 'must be an uploaded image path');
      }
      return s;
    }
    default:
      return clean(value);
  }
}

// Validate a patch (subset of keys). Returns a clean object of known keys only.
function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw Object.assign(new Error('Invalid content payload.'), { status: 400 });
  }
  const out = {};
  for (const key of Object.keys(patch)) {
    const f = fieldsByKey[key];
    if (!f) continue; // ignore anything not in the schema
    out[key] = validateField(f, patch[key]);
  }
  if (!Object.keys(out).length) throw Object.assign(new Error('No known fields to update.'), { status: 400 });
  return out;
}

module.exports = { validatePatch, validateField, clean };
