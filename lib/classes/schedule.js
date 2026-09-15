/* ============================================================
   da Cecot — Sunday pasta-class schedule (single source of truth).

   Classes run WEEKLY on Sundays. The schedule is generated, not hand-kept, so
   the booking form can never show a date that has already passed.

   Everyone reads this module: the site generator (booking pills), the public
   availability API, the submit-time validator, and the admin Classes view. If
   they ever disagreed, a guest could book a date the server then rejects.

   Date math is done entirely in UTC and formatted by hand, so the result does
   not shift with the server's timezone (Vercel runs UTC, the restaurant is in
   Edmonton). Only "today" is Edmonton-local — that is the date the restaurant
   is actually living in, and it decides when a Sunday drops off the list.
   ============================================================ */

const R = require('../orders/reservations');

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MO3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DEFAULT_COUNT = 5;

// 'YYYY-MM-DD' -> UTC Date at midnight. Never uses local-time parsing.
function utcOf(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function isoOf(dt) {
  return dt.getUTCFullYear() + '-' +
    String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getUTCDate()).padStart(2, '0');
}

// 'Sunday, September 20, 2026' — the canonical label stored on every booking.
function longLabel(iso) {
  const dt = utcOf(iso);
  return WD[dt.getUTCDay()] + ', ' + MO[dt.getUTCMonth()] + ' ' + dt.getUTCDate() + ', ' + dt.getUTCFullYear();
}

// 'Sun · Sep 20' — the short label on the booking pills.
function shortLabel(iso) {
  const dt = utcOf(iso);
  return WD3[dt.getUTCDay()] + ' · ' + MO3[dt.getUTCMonth()] + ' ' + dt.getUTCDate();
}

// A Sunday falling on the 1st–7th is that month's first Sunday — da Cecot is
// closed then, so no class runs.
function isFirstSundayOfMonth(iso) {
  return utcOf(iso).getUTCDate() <= 7;
}

/* The next `count` Sunday class dates, most recent first.
   opts:
     from             'YYYY-MM-DD' to start from (default: today in Edmonton)
     count            how many dates to return (default 5)
     firstSundayClosed skip the first Sunday of each month (default true)
     blackout         dates Erika has blacked out, any parseable format
   Returns [{ iso, label, short }]. Today counts as available — a Sunday only
   drops off the list once it is genuinely in the past. */
function upcoming(opts) {
  const o = opts || {};
  const from = o.from || R.todayISO();
  const count = Number.isFinite(Number(o.count)) && Number(o.count) > 0 ? Math.floor(Number(o.count)) : DEFAULT_COUNT;
  const skipFirst = o.firstSundayClosed !== false;
  const blocked = {};
  (Array.isArray(o.blackout) ? o.blackout : []).forEach((b) => {
    const iso = R.parseDate(b);
    if (iso) blocked[iso] = true;
  });

  const out = [];
  const dt = utcOf(from);
  // Walk forward to the first Sunday on or after `from`.
  while (dt.getUTCDay() !== 0) dt.setUTCDate(dt.getUTCDate() + 1);
  // Bounded: 260 weeks is five years — a blackout list can never spin this.
  for (let i = 0; out.length < count && i < 260; i++) {
    const iso = isoOf(dt);
    if (!(skipFirst && isFirstSundayOfMonth(iso)) && !blocked[iso]) {
      out.push({ iso, label: longLabel(iso), short: shortLabel(iso) });
    }
    dt.setUTCDate(dt.getUTCDate() + 7);
  }
  return out;
}

// Read the schedule straight from the CMS content values.
function fromContent(content, o) {
  const opts = Object.assign({
    count: content.num('classWeeksShown'),
    firstSundayClosed: content.bool('firstSundayClosed'),
    blackout: content.list('classBlackoutDates')
  }, o || {});
  return upcoming(opts);
}

/* Is this date one a guest is allowed to book right now?
   Compared on the ISO date, so a stale or reformatted label ('Sep 20 2026',
   '2026-09-20') still matches the class it means. */
function isBookable(dateStr, list) {
  const iso = R.parseDate(dateStr);
  if (!iso) return false;
  return (list || []).some((d) => d.iso === iso);
}

// Two date strings naming the same day, whatever their format.
function sameDay(a, b) {
  const x = R.parseDate(a);
  const y = R.parseDate(b);
  return !!x && !!y && x === y;
}

module.exports = {
  upcoming, fromContent, isBookable, sameDay,
  longLabel, shortLabel, isFirstSundayOfMonth, isoOf, utcOf,
  DEFAULT_COUNT
};
