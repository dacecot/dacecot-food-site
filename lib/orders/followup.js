/* ============================================================
   da Cecot — follow-up tracking for inquiries and wholesale enquiries.

   Orders, class bookings and reservations already carry their own state (paid,
   fulfilled, approved, cancelled). Inquiries carried none: someone asked a
   question through the website and nothing on the screen said whether anyone
   had ever written back. This is that missing state — open, responded, and an
   optional reminder date so Erika can park one for later.

   Deliberately NOT a message system. "Responded" is Erika ticking a box after
   she replies from her own inbox; nothing here emails the customer, and
   nothing here can. The reminder is a date she sets for herself.

   Dates are plain 'YYYY-MM-DD' in Edmonton terms, not timestamps: "follow up
   on Thursday" has no meaningful time of day, and comparing dates as strings
   removes every timezone question from the comparison.
   ============================================================ */

const R = require('./reservations');

// The submission types a human owes a reply to.
const TRACKED_TYPES = ['contact', 'wholesale'];

// How far ahead a reminder may be parked. A year is generous for a catering
// enquiry about next summer; beyond that it is a typo, not a plan.
const MAX_REMINDER_DAYS = 365;

const NOTE_MAX = 300;

function isTracked(sub) {
  return TRACKED_TYPES.indexOf(sub && sub.type) > -1;
}

/* 'open' | 'responded' | 'closed'.
   A cancelled inquiry is closed and drops out of the counts — it is neither
   waiting for a reply nor evidence that one was sent. */
function status(sub) {
  const d = (sub && sub.details) || {};
  if (d.cancelled) return 'closed';
  return d.responded_at ? 'responded' : 'open';
}

// Whole days from `fromISO` to `toISO`; negative when `toISO` is in the past.
function daysBetween(fromISO, toISO) {
  const a = R.parseDate(fromISO);
  const b = R.parseDate(toISO);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86400000);
}

/* The reminder on a submission, seen from `today`, or null if none is set.
   due    — today or earlier: it wants attention now.
   overdue— strictly earlier than today: it was missed. */
function reminder(sub, today) {
  const d = (sub && sub.details) || {};
  const date = R.parseDate(d.reminder_date);
  if (!date) return null;
  const from = R.parseDate(today) || R.todayISO();
  const daysAway = daysBetween(from, date);
  return {
    date: date,
    note: d.reminder_note || null,
    daysAway: daysAway,
    due: daysAway <= 0,
    overdue: daysAway < 0
  };
}

/* Everything the admin needs about one submission, computed here so the
   browser never re-implements the date maths and quietly disagrees. */
function describe(sub, today) {
  return {
    tracked: isTracked(sub),
    status: status(sub),
    respondedAt: (sub && sub.details && sub.details.responded_at) || null,
    respondedNote: (sub && sub.details && sub.details.responded_note) || null,
    reminder: reminder(sub, today)
  };
}

/* Counts for the tracker strip. Only tracked types are counted — an unpaid
   pasta order is not an unanswered question. */
function summarise(list, today) {
  const from = R.parseDate(today) || R.todayISO();
  const out = { open: 0, responded: 0, dueNow: 0, overdue: 0, total: 0 };
  (list || []).filter(isTracked).forEach((sub) => {
    const s = status(sub);
    if (s === 'closed') return;
    out.total++;
    if (s === 'open') out.open++; else out.responded++;
    const r = reminder(sub, from);
    if (!r) return;
    // A reminder on something already answered is still a reminder — she may
    // have promised to check back in — so this is not limited to open ones.
    if (r.overdue) out.overdue++;
    else if (r.due) out.dueNow++;
  });
  return out;
}

function fail(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/* Validate a date Erika typed into the reminder field.
   Yesterday is refused: a reminder that is already overdue the moment it is
   set is a mistake, and silently accepting it would fill her overdue count
   with noise. */
function validateReminderDate(input, today) {
  const date = R.parseDate(input);
  if (!date) throw fail('That date could not be read. Use the date picker, or type it as 2026-09-20.');
  const from = R.parseDate(today) || R.todayISO();
  const away = daysBetween(from, date);
  if (away < 0) throw fail('That date has already passed — pick today or a day in the future.');
  if (away > MAX_REMINDER_DAYS) throw fail('That is more than a year away — pick a nearer date.');
  return date;
}

// Free text Erika types. Trimmed, length-capped, angle brackets stripped so a
// note can never inject markup into the admin.
function cleanNote(input) {
  return String(input == null ? '' : input).replace(/[<>]/g, '').trim().slice(0, NOTE_MAX);
}

/* The four state changes, as plain details patches. Returning a patch rather
   than writing means the caller owns the store call and these stay testable
   without a database. */
function markResponded(existingDetails, opts) {
  const o = opts || {};
  const note = cleanNote(o.note);
  const patch = Object.assign({}, existingDetails, {
    responded_at: o.at || new Date().toISOString()
  });
  if (note) patch.responded_note = note; else delete patch.responded_note;
  return patch;
}

// Reopen: she ticked it by mistake, or the customer came back with more.
function reopen(existingDetails) {
  const patch = Object.assign({}, existingDetails);
  delete patch.responded_at;
  delete patch.responded_note;
  return patch;
}

function setReminder(existingDetails, dateInput, note, today) {
  const date = validateReminderDate(dateInput, today);
  const clean = cleanNote(note);
  const patch = Object.assign({}, existingDetails, { reminder_date: date });
  if (clean) patch.reminder_note = clean; else delete patch.reminder_note;
  return patch;
}

function clearReminder(existingDetails) {
  const patch = Object.assign({}, existingDetails);
  delete patch.reminder_date;
  delete patch.reminder_note;
  return patch;
}

module.exports = {
  TRACKED_TYPES, MAX_REMINDER_DAYS, NOTE_MAX,
  isTracked, status, reminder, describe, summarise, daysBetween,
  validateReminderDate, cleanNote,
  markResponded, reopen, setReminder, clearReminder
};
