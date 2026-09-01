/* ============================================================
   da Cecot — contacts: every person across all submissions, deduplicated.
   Pure aggregation over the submissions list. Identity = email (case-
   insensitive) → else phone digits → else name. Returns most-recent first.
   ============================================================ */

function keyFor(s) {
  const email = String(s.email || '').trim().toLowerCase();
  if (email.indexOf('@') > 0) return 'e:' + email;
  const digits = String(s.phone || '').replace(/[^\d]/g, '');
  if (digits.length >= 7) return 'p:' + digits;
  const name = String(s.name || '').trim().toLowerCase();
  return name ? 'n:' + name : null;
}

const R = require('./reservations');

// The date the guest actually comes in for this submission (not when they booked).
function visitDate(s) {
  const d = s.details || {};
  return R.parseDate(d.reservation_date || d.class_date || d.pickup_day || d.drop_in_date);
}

function aggregate(submissions) {
  const today = R.todayISO();
  const map = {};
  for (const s of submissions) {
    const key = keyFor(s);
    if (!key) continue;
    let c = map[key];
    if (!c) {
      c = map[key] = {
        name: null, email: null, phone: null,
        counts: {}, total: 0, cancelled: 0,
        spend_cents: 0,
        first_seen: null, last_seen: null, last_type: null,
        last_visit: null, next_visit: null
      };
    }
    // Prefer the longest name seen and the first non-empty contact points.
    if (s.name && (!c.name || String(s.name).length > c.name.length)) c.name = String(s.name);
    if (!c.email && s.email) c.email = String(s.email);
    if (!c.phone && s.phone) c.phone = String(s.phone);
    c.counts[s.type] = (c.counts[s.type] || 0) + 1;
    c.total += 1;
    if (s.details && s.details.cancelled) c.cancelled += 1;
    if (s.payment_status === 'paid' && Number.isFinite(Number(s.amount_cents))) c.spend_cents += Number(s.amount_cents);
    const t = Date.parse(s.created_at || '') || 0;
    if (!c.first_seen || t < Date.parse(c.first_seen)) c.first_seen = s.created_at;
    if (!c.last_seen || t > Date.parse(c.last_seen)) { c.last_seen = s.created_at; c.last_type = s.type; }
    // Actual visits: the reservation/class/pickup date, cancelled ones excluded.
    if (!(s.details && s.details.cancelled)) {
      const v = visitDate(s);
      if (v) {
        if (v <= today) { if (!c.last_visit || v > c.last_visit) c.last_visit = v; }
        else { if (!c.next_visit || v < c.next_visit) c.next_visit = v; }
      }
    }
  }
  const out = Object.keys(map).map((k) => map[k]);
  // Sort by the most relevant date: upcoming visit, else last visit, else last booking activity.
  const sortKey = (c) => c.next_visit || c.last_visit || (c.last_seen || '').slice(0, 10) || '';
  out.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : 0));
  return out;
}

module.exports = { aggregate, keyFor };
