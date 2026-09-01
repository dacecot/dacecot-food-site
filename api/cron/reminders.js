// /api/cron/reminders — two jobs in one secured endpoint:
//   1. Payment reminders for still-unpaid orders (older than 3h, has a pay link).
//   2. Booking reminders ~1–2 hours before today's table reservations.
//
// Guarded by CRON_SECRET: the caller must pass ?secret=<CRON_SECRET>, an
// x-cron-secret header, or Vercel cron's Bearer token. If CRON_SECRET is unset,
// this endpoint NEVER sends and returns 503 — no unauthenticated mail blasts.
//
// Triggers: Vercel's daily cron (payment nudges) + a GitHub Actions schedule
// every 30 minutes (so booking reminders land 1–2h before the table). Both hit
// this same endpoint; every reminder is sent at most once per submission.
const store = require('../../lib/orders/store');
const mailer = require('../../lib/orders/mailer');
const R = require('../../lib/orders/reservations');

const OLDER_THAN_MINUTES = 180;
const BOOKING_WINDOW_MIN = 150;   // remind when the table is at most 2.5h away
const JUST_BOOKED_GRACE_MS = 2 * 60 * 60 * 1000; // they just got a confirmation

// Current minutes-from-midnight in Edmonton (restaurant local time).
function nowEdmontonMinutes() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const m = /(\d{1,2}):(\d{2})/.exec(parts);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  } catch (e) { return null; }
}

function getSecret(req) {
  const header = req.headers['x-cron-secret'];
  if (header) return String(header);
  // Vercel's native cron scheduler authenticates with `Authorization: Bearer <CRON_SECRET>`.
  const authz = req.headers['authorization'] || req.headers['Authorization'];
  if (authz && /^Bearer\s+/i.test(authz)) return String(authz).replace(/^Bearer\s+/i, '').trim();
  const qs = (req.url || '').split('?')[1];
  if (qs) {
    for (const p of qs.split('&')) {
      const i = p.indexOf('=');
      if (i > -1 && decodeURIComponent(p.slice(0, i)) === 'secret') {
        try { return decodeURIComponent(p.slice(i + 1)); } catch (e) { return p.slice(i + 1); }
      }
    }
  }
  return null;
}

module.exports = async (req, res) => {
  const expected = process.env.CRON_SECRET;
  // Never run (never send) unless a secret is configured AND matches.
  if (!expected) {
    return res.status(503).json({ error: 'Reminders are disabled (CRON_SECRET is not set).' });
  }
  const provided = getSecret(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  let candidates;
  try {
    candidates = await store.listUnpaid({ olderThanMinutes: OLDER_THAN_MINUTES });
  } catch (e) {
    return res.status(502).json({ error: 'Could not load unpaid orders: ' + (e && e.message || e) });
  }

  // Only remind orders that have a payment link and haven't already been reminded/paid.
  const due = candidates.filter((s) =>
    s.payment_link_url &&
    s.payment_status !== 'reminded' &&
    s.payment_status !== 'paid'
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const sub of due) {
    let result = { ok: false };
    try { result = await mailer.sendReminder(sub); } catch (e) { result = { ok: false, error: String(e && e.message || e) }; }
    if (result.ok) {
      try { await store.markReminded(sub.id); sent += 1; }
      catch (e) { failed += 1; }
    } else if (result.skipped) {
      skipped += 1; // e.g. no customer email — leave it unpaid, don't mark reminded.
    } else {
      failed += 1;
    }
  }

  // ---- Booking reminders: today's tables starting within the next ~2.5h ----
  let bookingSent = 0, bookingFailed = 0;
  try {
    const today = R.todayISO();
    const nowMin = nowEdmontonMinutes();
    if (nowMin != null) {
      const reservations = await store.list({ type: 'reservation' });
      const dueBookings = reservations.filter((s) => {
        const d = s.details || {};
        if (d.cancelled || d.booking_reminded_at) return false;
        if (d.approval_status === 'pending') return false; // not confirmed yet
        if (!s.email) return false;
        if (R.parseDate(d.reservation_date) !== today) return false;
        const t = R.parseTime(d.reservation_time);
        if (t == null) return false;                       // no time — can't judge "soon"
        const untilStart = t - nowMin;
        if (untilStart <= 0 || untilStart > BOOKING_WINDOW_MIN) return false;
        // Skip guests who booked moments ago — their confirmation just arrived.
        const created = Date.parse(s.created_at || '');
        if (Number.isFinite(created) && Date.now() - created < JUST_BOOKED_GRACE_MS) return false;
        return true;
      });
      for (const sub of dueBookings) {
        let result = { ok: false };
        try { result = await mailer.sendBookingReminder(sub); } catch (e) { result = { ok: false }; }
        if (result.ok) {
          try {
            const details = Object.assign({}, sub.details, { booking_reminded_at: new Date().toISOString() });
            await store.update(sub.id, { details });
            bookingSent += 1;
          } catch (e) { bookingFailed += 1; }
        } else if (!result.skipped) {
          bookingFailed += 1;
        }
      }
    }
  } catch (e) {
    console.error('booking reminders failed', e && e.message);
    bookingFailed = -1; // sentinel: the whole pass errored
  }

  return res.status(200).json({
    ok: true,
    payments: { scanned: candidates.length, due: due.length, reminded: sent, skipped: skipped, failed: failed },
    bookings: { reminded: bookingSent, failed: bookingFailed }
  });
};
