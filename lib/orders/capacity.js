/* ============================================================
   da Cecot — ONE shared capacity model for the dining room.

   A seat is a seat: a reservation and a Sunday-class guest both occupy one.
   So reservations and classes draw from the SAME pool — the floor-plan seat
   count (or a CMS override) — for any overlapping time window. Before this,
   classes had a private `classMax` that ignored the room, and reservations
   ignored the class entirely; a full class plus a full dining room could be
   double-sold for the same Sunday evening.

   The two questions the rest of the app asks:
     reservationSeatsLeft(...) — can we seat this party at this time?
     classSeatsLeft(...)       — how many class seats remain this Sunday?

   Both are pure: they take the submissions list, the tables and the content
   loader as arguments, so they test without a database or a clock. All times
   are minutes-from-midnight, Edmonton-local (the restaurant's day).
   ============================================================ */

const R = require('./reservations');

const DEFAULT_TURN_MIN = 120;          // a table turn — two hours
const DEFAULT_CLASS_START = 17 * 60;   // 5:00 PM
const DEFAULT_CLASS_END = 21 * 60;     // 9:00 PM

function intOf(v) { const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; }
function partyOf(sub) { const n = intOf(sub && sub.details && sub.details.party_size); return n && n > 0 ? n : 1; }
function classGuestsOf(sub) { const n = intOf(sub && sub.details && sub.details.guests); return n && n > 0 ? n : 1; }
function cget(content, key) { try { return content && content.get ? content.get(key) : null; } catch (e) { return null; } }

// Total seats the room holds: an explicit CMS override, else the floor plan.
function totalSeats(tables, content) {
  const override = intOf(cget(content, 'totalCapacity'));
  if (override && override > 0) return override;
  return (tables || []).reduce((sum, t) => sum + (Number(t.seats) || 0), 0);
}

// The Sunday class sitting, in minutes. Lenient parse ('5:00 PM' or '17:00');
// falls back to 5–9 PM if unset or nonsensical.
function classWindow(content) {
  let start = R.parseTime(cget(content, 'classStart'));
  let end = R.parseTime(cget(content, 'classEnd'));
  if (start == null) start = DEFAULT_CLASS_START;
  if (end == null) end = DEFAULT_CLASS_END;
  if (!(end > start)) { start = DEFAULT_CLASS_START; end = DEFAULT_CLASS_END; }
  return { start: start, end: end };
}

// Active class guests booked for a Sunday (by 1st-choice date).
function classGuestsOn(list, dateISO) {
  return (list || []).filter((s) =>
    s.type === 'class' && s.details && !s.details.cancelled &&
    R.parseDate(s.details.class_date) === dateISO
  ).reduce((sum, s) => sum + classGuestsOf(s), 0);
}

// Active reservation seats whose turn [t, t+turn] overlaps [startMin, endMin]
// on dateISO. An unknown time counts as overlapping — never under-count seats.
function reservationSeatsInWindow(list, dateISO, startMin, endMin, turnMin) {
  const turn = turnMin || DEFAULT_TURN_MIN;
  return (list || []).filter((s) => {
    if (s.type !== 'reservation') return false;
    const det = s.details || {};
    if (det.cancelled || det.no_show) return false;
    if (R.resDate(s) !== dateISO) return false;
    const t = R.resTime(s);
    if (startMin == null || endMin == null || t == null) return true;
    return t < endMin && (t + turn) > startMin;
  }).reduce((sum, s) => sum + partyOf(s), 0);
}

/* Seats left for a reservation at (dateISO, timeMin). Counts overlapping
   reservations, PLUS a Sunday class's guests when its sitting overlaps this
   party's turn. Returns Infinity when the room has no defined capacity (no
   floor plan and no override) — the caller treats that as "no limit set". */
function reservationSeatsLeft(opts) {
  const o = opts || {};
  const total = totalSeats(o.tables, o.content);
  if (!(total > 0)) return Infinity;
  const turn = o.turnMin || DEFAULT_TURN_MIN;
  const timeMin = (o.timeMin == null) ? null : o.timeMin;
  const start = timeMin == null ? null : timeMin;
  const end = timeMin == null ? null : timeMin + turn;
  let taken = reservationSeatsInWindow(o.list, o.dateISO, start, end, turn);
  const classG = classGuestsOn(o.list, o.dateISO);
  if (classG > 0) {
    const cw = classWindow(o.content);
    const overlaps = (start == null || end == null) ? true : (start < cw.end && end > cw.start);
    if (overlaps) taken += classG;
  }
  return total - taken;
}

/* Seats a class can still take on dateISO. Capped by BOTH the teaching cap
   (classMax) AND the physical room minus any reservations overlapping the
   class sitting; then minus the guests already booked into the class.
   With no floor plan, the room is treated as unlimited and classMax rules —
   exactly the behaviour before this module existed. */
function classSeatsLeft(opts) {
  const o = opts || {};
  const total = totalSeats(o.tables, o.content);
  const cw = classWindow(o.content);
  const resInWindow = total > 0 ? reservationSeatsInWindow(o.list, o.dateISO, cw.start, cw.end) : 0;
  const roomForClass = total > 0 ? Math.max(0, total - resInWindow) : Infinity;
  const teachingCap = (intOf(o.classMax) && intOf(o.classMax) > 0) ? intOf(o.classMax) : Infinity;
  const cap = Math.min(teachingCap, roomForClass);
  const booked = classGuestsOn(o.list, o.dateISO);
  return Math.max(0, cap - booked);
}

module.exports = {
  totalSeats, classWindow, classGuestsOn, reservationSeatsInWindow,
  reservationSeatsLeft, classSeatsLeft,
  DEFAULT_TURN_MIN, DEFAULT_CLASS_START, DEFAULT_CLASS_END
};
