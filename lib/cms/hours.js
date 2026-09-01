/* ============================================================
   da Cecot CMS — hours of operation, single source of truth.
   The admin edits one field per weekday ("12:00-15:00, 16:30-20:00" or
   "closed"); everything on the site derives from here:
     - the visible Hours tables (homepage + Visit Us)
     - the Restaurant JSON-LD openingHoursSpecification (Google)
     - the pasta-shop pickup-time picker windows
     - the reservation time picker windows
   ============================================================ */

const DAY_KEYS = ['hoursSun', 'hoursMon', 'hoursTue', 'hoursWed', 'hoursThu', 'hoursFri', 'hoursSat']; // index = JS getDay()
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

module.exports = { DAY_KEYS, DAY_NAMES, DAY_SHORT, parseDay, windows, displayRows, jsonLdSpec, fmtRange };
