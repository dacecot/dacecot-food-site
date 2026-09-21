/* ============================================================
   da Cecot CMS — hours of operation, single source of truth.
   The admin edits one field per weekday ("12:00-15:00, 16:30-20:00" or
   "closed"); everything on the site derives from here:
     - the visible Hours tables (homepage + Visit Us)
     - the Restaurant JSON-LD openingHoursSpecification (Google)
     - the pasta-shop pickup-time picker windows
     - the reservation time picker windows
     - one-off closures (closedDates), which override all of the above

   A weekly "closed" and a one-off closure are different things: hoursMon =
   'closed' shuts EVERY Monday, which is not what "we are closed today" means.
   ============================================================ */

const R = require('../orders/reservations');

const DAY_KEYS = ['hoursSun', 'hoursMon', 'hoursTue', 'hoursWed', 'hoursThu', 'hoursFri', 'hoursSat']; // index = JS getDay()
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "16:30" → minutes from midnight.
function toMin(hhmm) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm).trim());
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

// Parse one day's stored value → array of [openMin, closeMin]. "closed"/"" → [].
function parseDay(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s || s === 'closed') return [];
  const out = [];
  for (const part of s.split(',')) {
    const m = /^\s*([0-2]?\d:[0-5]\d)\s*-\s*([0-2]?\d:[0-5]\d)\s*$/.exec(part);
    if (!m) continue;
    const a = toMin(m[1]), b = toMin(m[2]);
    if (a != null && b != null && b > a) out.push([a, b]);
  }
  return out.slice(0, 3);
}

// minutes → "4:30" / "12" (12-hour clock, minutes only when non-zero).
function fmtClock(min) {
  let h = Math.floor(min / 60), mm = min % 60;
  const h12 = ((h % 12) || 12);
  return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '');
}
function meridiem(min) { return Math.floor(min / 60) < 12 ? 'AM' : 'PM'; }

// [open, close] → "12 – 3 PM" or "11 AM – 2 PM" (both labels when they differ).
function fmtRange(w) {
  const [a, b] = w;
  const ma = meridiem(a), mb = meridiem(b);
  return ma === mb
    ? fmtClock(a) + ' – ' + fmtClock(b) + ' ' + mb
    : fmtClock(a) + ' ' + ma + ' – ' + fmtClock(b) + ' ' + mb;
}

// minutes → "HH:MM" (24h, for JSON-LD).
function fmt24(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/* content = the lib/cms/content loader. */
function windows(content) {
  const map = {};
  DAY_KEYS.forEach((key, dow) => { map[dow] = parseDay(content.get(key)); });
  return map;
}

// Visible table rows: [['Mon', '4:30 – 8 PM'], ['Wed', 'Closed'], …] Mon-first.
function displayRows(content) {
  const w = windows(content);
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon … Sun
  return order.map((dow) => [
    DAY_SHORT[dow],
    w[dow].length ? w[dow].map(fmtRange).join(' · ') : 'Closed'
  ]);
}

// JSON-LD OpeningHoursSpecification array.
function jsonLdSpec(content) {
  const w = windows(content);
  const out = [];
  for (let dow = 0; dow < 7; dow++) {
    for (const win of w[dow]) {
      out.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [DAY_NAMES[dow]],
        opens: fmt24(win[0]),
        closes: fmt24(win[1])
      });
    }
  }
  return out;
}

/* ---- One-off closures ----------------------------------------------------
   Single dates the restaurant is shut (a holiday, a family day, a burst pipe).
   Stored in any readable form — '2026-09-15' or 'Monday, September 15, 2026' —
   and normalised to ISO here so the page, the pickers and the API all compare
   the same thing. They expire on their own: a past date blocks nothing.

   A closure shuts BOTH table reservations and pasta-shop pickups. If the doors
   are locked, neither can happen, so there is one list, not two. */
/* A closure line may carry the REASON the doors are shut:

     2026-09-21 | deep cleaning

   The reason travels with its date instead of living in a "closure reason"
   field of its own, because a field of its own outlives the day it was written
   for: the next holiday closure would inherit "deep cleaning" from the last
   one, and nobody would notice until a guest read it. A pipe or a spaced dash
   separates the two; neither can occur inside a date in any format we parse.

   The reason is a short phrase, not a paragraph — it is read in a one-line
   banner — so it is trimmed to REASON_MAX and anything longer is dropped
   rather than shown cut in half. */
const REASON_MAX = 80;

function splitClosure(line) {
  const s = String(line == null ? '' : line).trim();
  const pipe = s.indexOf('|');
  const dash = s.search(/\s[—–-]\s/);   // spaced dash: never part of a date
  let at = -1, sepLen = 1;
  if (pipe > -1 && (dash < 0 || pipe < dash)) { at = pipe; sepLen = 1; }
  else if (dash > -1) { at = dash; sepLen = 3; }
  if (at < 0) return { date: s, reason: '' };
  const reason = s.slice(at + sepLen).trim().replace(/\s+/g, ' ');
  return { date: s.slice(0, at).trim(), reason: reason.length > REASON_MAX ? '' : reason };
}

function closedDates(content) {
  const out = [];
  content.list('closedDates').forEach((d) => {
    const iso = R.parseDate(splitClosure(d).date);
    if (iso && out.indexOf(iso) < 0) out.push(iso);
  });
  return out.sort();
}

/* iso → reason, for the closures that gave one. Days written as a bare date
   are simply absent, and every caller falls back to the plain sentence. */
function closureReasons(content) {
  const out = {};
  content.list('closedDates').forEach((d) => {
    const parts = splitClosure(d);
    const iso = R.parseDate(parts.date);
    // First line wins, so a later duplicate cannot silently retitle the day.
    if (iso && parts.reason && !out[iso]) out[iso] = parts.reason;
  });
  return out;
}

// The reason for one day, in any date format, or '' when none was given.
function closureReason(content, dateStr) {
  const iso = R.parseDate(splitClosure(dateStr).date);
  return (iso && closureReasons(content)[iso]) || '';
}

// Is this date — in any parseable format — one of the one-off closures?
function isClosedOn(content, dateStr) {
  const iso = R.parseDate(splitClosure(dateStr).date);
  return !!iso && closedDates(content).indexOf(iso) > -1;
}

// 'Monday, September 15' — for the message a guest actually reads.
function closureLabel(iso) {
  const p = String(iso).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return DAY_NAMES[d.getUTCDay()] + ', ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

module.exports = { DAY_KEYS, DAY_NAMES, DAY_SHORT, parseDay, windows, displayRows, jsonLdSpec, fmtRange, closedDates, isClosedOn, closureLabel, splitClosure, closureReasons, closureReason };
