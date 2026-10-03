/* ============================================================
   da Cecot — a guest cancelling their own table from the confirmation email.

   The confirmation email carries a link to /cancel-reservation.html with the
   booking id and a signature (HMAC of the id under SESSION_SECRET). The link
   only OPENS a page; nothing is cancelled until the guest presses the button
   on it. That two-step is deliberate: mail scanners (Outlook Safe Links,
   Gmail's prefetch, corporate gateways) open every link in an email, and a
   link that cancelled on GET would cancel bookings nobody asked to cancel.

   Rules:
   - Table reservations only. Classes are paid through Square and pickups are
     orders — neither is this button's business.
   - Up to 24 hours before the reservation, Edmonton time. Inside that the page
     says to call, because the table is very likely already planned around.
   - A bad or tampered signature looks exactly like a missing booking, so the
     endpoint cannot be used to find out which ids exist.
   - Cancelling twice is not an error: the second press reports it is done.
   ============================================================ */

const crypto = require('crypto');
const store = require('./store');
const R = require('./reservations');

const SITE = process.env.SITE_URL || 'https://www.dacecotfood.com';
const CUTOFF_HOURS = 24;
const PAGE = 'cancel-reservation.html';

function secret() { return process.env.SESSION_SECRET || ''; }

function token(id) {
  const s = secret();
  if (!s || !id) return null;
  return crypto.createHmac('sha256', s).update('guest-cancel:v1:' + id).digest('base64url').slice(0, 32);
}

function validToken(id, t) {
  const want = token(id);
  if (!want || typeof t !== 'string' || t.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(t));
}

/* The link that goes in the email, or null when it cannot be signed — then the
   email simply has no button and keeps the "reply or call" line. */
function cancelUrl(id) {
  const t = token(id);
  return t ? SITE + '/' + PAGE + '?r=' + encodeURIComponent(id) + '&t=' + t : null;
}

// When the table starts, as an instant. An unreadable time counts as the start
// of the day: that makes the cutoff earlier, never later.
function startsAt(sub) {
  const day = R.resDate(sub);
  if (!day) return null;
  const min = R.resTime(sub);
  return R.edmontonInstant(day, min == null ? 0 : min);
}

/* Can this booking be cancelled from the email right now?
   → { ok, reason } with reason one of: cancelled, too_late, no_date. */
function assess(sub, now) {
  const d = (sub && sub.details) || {};
  if (d.cancelled) return { ok: false, reason: 'cancelled' };
  const start = startsAt(sub);
  if (start == null) return { ok: false, reason: 'no_date' };
  if (start - now < CUTOFF_HOURS * 3600000) return { ok: false, reason: 'too_late' };
  return { ok: true, reason: null };
}

// Only what the guest already has in their email — no phone, no email, no notes.
function summary(sub) {
  const d = sub.details || {};
  const day = R.resDate(sub);
  let dateLabel = String(d.reservation_date || '');
  if (day) {
    const [y, m, dd] = day.split('-').map(Number);
    dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      .format(new Date(Date.UTC(y, m - 1, dd)));
  }
  return {
    firstName: sub.name ? String(sub.name).trim().split(/\s+/)[0] : null,
    date: dateLabel,
    time: d.reservation_time ? String(d.reservation_time) : null,
    partySize: d.party_size ? String(d.party_size) : null
  };
}

async function load(id, t) {
  if (!id || !validToken(String(id), t)) return null;
  await store.init();
  const sub = await store.get(String(id));
  return sub && sub.type === 'reservation' ? sub : null;
}

const NOT_FOUND = { status: 404, body: { ok: false, error: 'This cancellation link isn’t valid. Please call us at (825) 888-4218.' } };

/* POST /api/send with { action: 'cancel_lookup' | 'cancel_confirm', r, t }.
   Returns { status, body } — the HTTP layer stays in api/send.js. `now` and
   `mailer` are injectable for the tests. */
async function handle(body, opts) {
  const now = (opts && opts.now != null) ? Number(opts.now) : Date.now();
  const mailer = (opts && opts.mailer) || require('./mailer');
  const sub = await load(body && body.r, body && body.t);
  if (!sub) return NOT_FOUND;

  const verdict = assess(sub, now);
  if (body.action === 'cancel_lookup') {
    return { status: 200, body: { ok: true, booking: summary(sub), canCancel: verdict.ok, reason: verdict.reason, cutoffHours: CUTOFF_HOURS } };
  }

  // cancel_confirm
  if (verdict.reason === 'cancelled') return { status: 200, body: { ok: true, cancelled: true, already: true, booking: summary(sub) } };
  if (!verdict.ok) return { status: 409, body: { ok: false, reason: verdict.reason, booking: summary(sub), error: 'This reservation is less than ' + CUTOFF_HOURS + ' hours away, so it can’t be cancelled online. Please call us at (825) 888-4218.' } };

  const details = Object.assign({}, sub.details, {
    cancelled: true,
    cancelled_at: new Date(now).toISOString(),
    cancelled_by: 'guest'
  });
  const updated = await store.update(sub.id, { details });

  // Both best-effort: the booking IS cancelled whether or not mail goes out.
  const guestMail = await mailer.sendGuestCancelled(updated);
  const staffMail = await mailer.sendStaffGuestCancelled(updated);
  if (!(staffMail && staffMail.ok)) console.error('guest cancel: staff notification not sent', staffMail && (staffMail.reason || staffMail.status));

  return { status: 200, body: { ok: true, cancelled: true, booking: summary(updated), guestEmailed: !!(guestMail && guestMail.ok) } };
}

module.exports = { CUTOFF_HOURS, PAGE, token, validToken, cancelUrl, startsAt, assess, summary, handle };
