// /api/cron/reminders — email a payment reminder for still-unpaid orders.
//
// Guarded by CRON_SECRET: the caller must pass ?secret=<CRON_SECRET> or an
// x-cron-secret header equal to it. If CRON_SECRET is unset, this endpoint NEVER
// sends and returns 503 — no unauthenticated mail blasts, ever.
//
// It finds unpaid submissions older than 180 minutes that carry a payment link,
// emails each one a reminder, then marks them 'reminded' so they aren't nagged
// again. Returns a JSON summary.
const store = require('../../lib/orders/store');
const mailer = require('../../lib/orders/mailer');

const OLDER_THAN_MINUTES = 180;

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

  return res.status(200).json({
    ok: true,
    scanned: candidates.length,
    due: due.length,
    reminded: sent,
    skipped: skipped,
    failed: failed
  });
};
