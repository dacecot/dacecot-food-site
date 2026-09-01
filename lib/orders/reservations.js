/* ============================================================
   da Cecot — reservation helpers: date/time parsing, day grouping,
   and table-assignment conflict checks. Pure functions, no I/O.
   ============================================================ */

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

// Any reasonable date string → 'YYYY-MM-DD' (or null).
// Handles '2026-09-05', '09/05/2026', 'Sunday, September 27, 2026', 'Sep 27 2026'.
function parseDate(s) {
  s = String(s == null ? '' : s).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);           // assume MM/DD/YYYY (Wix NA exports)
  if (m) return m[3] + '-' + String(+m[1]).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0');
  m = /([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(s); // 'September 27, 2026'
  if (m && MONTHS[m[1].toLowerCase()]) return m[3] + '-' + String(MONTHS[m[1].toLowerCase()]).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0');
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  return null;
}

// '7:00 PM' / '19:00' / '7 PM' → minutes from midnight (or null).
function parseTime(s) {
  s = String(s == null ? '' : s).trim();
  if (!s) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.replace(/\./g, ''));
  if (!m) return null;
  let h = +m[1]; const mm = m[2] ? +m[2] : 0; const ap = m[3] ? m[3].toLowerCase() : null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

// Local 'YYYY-MM-DD' for today (Edmonton runs the restaurant; the serverless
// region may differ, so allow an explicit tz offset via RES_TZ_OFFSET_MIN,
// defaulting to America/Edmonton's current offset computed via Intl).
function todayISO() {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date()); // en-CA gives YYYY-MM-DD
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// The reservation's canonical date/time, from details.
function resDate(sub) { return parseDate(sub && sub.details && sub.details.reservation_date); }
function resTime(sub) { return parseTime(sub && sub.details && sub.details.reservation_time); }

// Filter+sort reservations for a view. view: today|week|upcoming|past|all
function forView(list, view) {
  const today = todayISO();
  const weekEnd = addDaysISO(today, 6);
  const withDate = list.map((r) => ({ r, d: resDate(r), t: resTime(r) }));
  let keep;
  if (view === 'today') keep = withDate.filter((x) => x.d === today);
  else if (view === 'week') keep = withDate.filter((x) => x.d && x.d >= today && x.d <= weekEnd);
  else if (view === 'past') keep = withDate.filter((x) => x.d && x.d < today);
  else if (view === 'upcoming') keep = withDate.filter((x) => x.d && x.d >= today);
  else keep = withDate;
  const dir = view === 'past' ? -1 : 1; // past shows most recent first
  keep.sort((a, b) => {
    if ((a.d || '') !== (b.d || '')) return (a.d || '') < (b.d || '') ? -dir : dir;
    return ((a.t == null ? 9999 : a.t) - (b.t == null ? 9999 : b.t)) * dir;
  });
  return keep.map((x) => x.r);
}

// Group a sorted list into [{ date, count, covers, reservations }].
function groupByDay(list) {
  const days = [];
  const idx = {};
  for (const r of list) {
    const d = resDate(r) || 'unknown';
    if (!(d in idx)) { idx[d] = days.length; days.push({ date: d, count: 0, covers: 0, reservations: [] }); }
    const g = days[idx[d]];
    g.count++;
    const p = parseInt(String(r.details && r.details.party_size || '').replace(/[^\d]/g, ''), 10);
    g.covers += Number.isFinite(p) && p > 0 ? p : 0;
    g.reservations.push(r);
  }
  return days;
}

/* Would seating `sub` at `tableId` clash with an existing assignment?
   Conflict = same table, same date, active (not cancelled), and start times
   within `windowMin` minutes (default 120 — a two-hour turn). */
function findConflicts(sub, tableId, all, windowMin) {
  const win = windowMin || 120;
  const d = resDate(sub); const t = resTime(sub);
  if (!d) return [];
  return all.filter((o) => {
    if (o.id === sub.id) return false;
    if (!o.details || o.details.table_id !== tableId) return false;
    if (o.details.cancelled) return false;
    if (resDate(o) !== d) return false;
    const ot = resTime(o);
    if (t == null || ot == null) return true; // unknown times on the same day: be safe, flag it
    return Math.abs(ot - t) < win;
  });
}

module.exports = { parseDate, parseTime, todayISO, addDaysISO, resDate, resTime, forView, groupByDay, findConflicts };
