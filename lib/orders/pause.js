/* ============================================================
   da Cecot — pausing online reservations during service.

   Erika hits "Pause 1 hour" in the site manager when the kitchen is under
   water, and the Reserve page stops taking new table requests until the timer
   runs out. Nothing else is affected: bookings already in the book are
   untouched, and pasta-shop pickups and pasta classes carry on.

   Why the state lives in the orders store and NOT in content.json: a CMS write
   commits to GitHub and rebuilds the site. That takes minutes — useless for a
   30-minute pause — and a rebuild could never un-pause itself when the timer
   ran out. Here it is one row, it takes effect on the next request, and it
   EXPIRES BY BEING READ: nothing has to run on a schedule to clear it, so
   there is no way to leave reservations paused because a cron did not fire.

   The pause is an inconvenience, not a safety device. Every read fails open —
   if the store cannot be reached we report "not paused" and let the guest
   book, because turning away real customers over an infra hiccup is the more
   expensive mistake, and Erika confirms every reservation by hand anyway.
   ============================================================ */

const store = require('./store');

const KEY = 'reservations_paused_until';

/* The durations the site manager offers. Requests are checked against this
   list rather than a min/max range: a typo'd or replayed request can then only
   ever ask for one of these, never "pause for 40000 minutes". Adding an option
   is one edit here — the admin buttons are generated from it. */
const OPTIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 240, label: '4 hours' }
];

function isOption(minutes) {
  const n = Number(minutes);
  return OPTIONS.some((o) => o.minutes === n);
}

/* Current state. `now` is injectable so the tests can stand at a chosen moment
   instead of sleeping through a real pause.
   Returns { paused, until, minutesLeft } — until is an ISO string or null. */
async function status(now) {
  const at = now instanceof Date ? now.getTime() : (now != null ? Number(now) : Date.now());
  let raw = null;
  try {
    await store.init();
    raw = await store.getSetting(KEY);
  } catch (e) {
    // Fail open: an unreachable store must not look like a pause.
    console.error('pause status read failed (treating as not paused)', e && e.message);
    return { paused: false, until: null, minutesLeft: 0 };
  }
  if (!raw) return { paused: false, until: null, minutesLeft: 0 };

  const untilMs = Date.parse(raw);
  // An unparseable value is a corrupt row, not a pause — same fail-open rule.
  if (!Number.isFinite(untilMs)) return { paused: false, until: null, minutesLeft: 0 };
  if (untilMs <= at) return { paused: false, until: null, minutesLeft: 0 };

  return {
    paused: true,
    until: new Date(untilMs).toISOString(),
    minutesLeft: Math.max(1, Math.ceil((untilMs - at) / 60000))
  };
}

/* Start (or extend) a pause. Always measured from NOW, so pressing "1 hour"
   twenty minutes into a two-hour pause SHORTENS it to an hour — that is the
   intent of pressing a button labelled with a duration, and the alternative
   (silently keeping the longer one) leaves her unable to shorten a pause
   without resuming first. */
async function pause(minutes, now) {
  if (!isOption(minutes)) {
    const err = new Error('Unsupported pause length. Choose ' + OPTIONS.map((o) => o.label).join(', ') + '.');
    err.status = 400;
    throw err;
  }
  const at = now instanceof Date ? now.getTime() : (now != null ? Number(now) : Date.now());
  const until = new Date(at + Number(minutes) * 60000).toISOString();
  await store.init();
  await store.setSetting(KEY, until);
  return status(at);
}

// Lift the pause immediately. Clearing the row rather than writing a past date
// keeps "not paused" a single state with a single representation.
async function resume(now) {
  await store.init();
  await store.setSetting(KEY, null);
  return status(now);
}

module.exports = { KEY, OPTIONS, isOption, status, pause, resume };
