// /api/admin/orders
//   GET  → list captured submissions (auth required). Optional ?type= and ?status=.
//   POST → manual update { id, action:'mark_paid'|'mark_fulfilled' } (auth + CSRF).
// Reuses the CMS session/CSRF auth. JSON only.
//   POST { action:'mark_responded', id, note? }   inquiry tracker: Erika replied
//        { action:'reopen',         id }          undo that
//        { action:'set_reminder',   id, date, note? }  park a follow-up date
//        { action:'clear_reminder', id }          drop it
//   (These four never email anyone — see lib/orders/followup.js.)
const auth = require('../../lib/cms/auth');
const store = require('../../lib/orders/store');
const mailer = require('../../lib/orders/mailer');

function parseQuery(req) {
  const q = {};
  const qs = (req.url || '').split('?')[1];
  if (qs) {
    qs.split('&').forEach((p) => {
      const i = p.indexOf('=');
      const k = i > -1 ? p.slice(0, i) : p;
      const v = i > -1 ? p.slice(i + 1) : '';
      try { q[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) { q[k] = v; }
    });
  }
  // Prefer a framework-provided req.query if present.
  return Object.assign({}, q, (req.query && typeof req.query === 'object') ? req.query : {});
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (!auth.requireAuth(req, res, false)) return;
    const q = parseQuery(req);
    // ?sub=contacts → deduplicated people across every submission type.
    if (q.sub === 'contacts') {
      try {
        const { aggregate } = require('../../lib/orders/contacts');
        const contacts = aggregate(await store.list({}));
        return res.status(200).json({ ok: true, count: contacts.length, contacts });
      } catch (e) { return res.status(502).json({ error: 'Could not load contacts: ' + (e && e.message || e) }); }
    }
    // ?sub=classes → Sunday class rosters: who is booked on which date, how far
    // each class is from its minimum, and what a push would do to it.
    if (q.sub === 'classes') {
      try {
        const pushLib = require('../../lib/classes/push');
        const content = require('../../lib/cms/content');
        const max = content.num('classMax');
        const min = content.num('classMin');
        const all = await store.list({ type: 'class' });
        const list = pushLib.rosters(all, { max, min }).map((g) => {
          const plan = pushLib.planPush(all, g.label, { max });
          return {
            iso: g.iso,
            label: g.label,
            booked: g.booked,
            left: g.left,
            underMin: g.underMin,
            bookings: g.bookings,
            // What "Move to 2nd choices" would do, so Erika sees it before she clicks.
            preview: {
              moving: plan.moves.length,
              movingGuests: plan.movedGuests,
              rebooking: plan.rebooks.length,
              rebookingGuests: plan.rebookGuests,
              targets: plan.moves.reduce((acc, m) => {
                acc[m.to] = (acc[m.to] || 0) + m.guests; return acc;
              }, {})
            }
          };
        });
        return res.status(200).json({ ok: true, min, max, classes: list });
      } catch (e) { return res.status(502).json({ error: 'Could not load classes: ' + (e && e.message || e) }); }
    }
    const opts = {};
    if (q.type) opts.type = String(q.type);
    if (q.status) opts.status = String(q.status);
    if (q.limit) opts.limit = q.limit;
    try {
      const orders = await store.list(opts);
      /* Attach follow-up state rather than letting the browser recompute it.
         The admin would otherwise need its own copy of the date maths, and the
         two would drift the first time either changed. */
      const followup = require('../../lib/orders/followup');
      const R2 = require('../../lib/orders/reservations');
      const today = R2.todayISO();
      const withFollowup = orders.map((o) => Object.assign({}, o, { followup: followup.describe(o, today) }));
      return res.status(200).json({
        ok: true, store: store.backend(), count: orders.length, orders: withFollowup,
        today: today,
        // Counts across EVERY tracked submission, not just the filtered page,
        // so the strip does not change meaning when she switches tabs.
        followupSummary: followup.summarise(await store.list({}), today)
      });
    } catch (e) {
      return res.status(502).json({ error: 'Could not load orders: ' + (e && e.message || e) });
    }
  }

  if (req.method === 'POST') {
    const s = auth.requireAuth(req, res, true);
    if (!s) return;

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim();

    /* push_class — an under-filled Sunday can't run, so move its guests to the
       2nd choice each of them picked. Acts on a whole class date, not one id.
       Bookings with no usable 2nd choice are NOT moved; they're emailed and
       asked to pick a new Sunday, and left on the original date so Erika can
       still see and chase them. Nothing is deleted either way. */
    if (action === 'push_class') {
      const date = String(body.date || '').trim();
      if (!date) return res.status(400).json({ error: 'Missing class date.' });
      try {
        const pushLib = require('../../lib/classes/push');
        const content = require('../../lib/cms/content');
        const max = content.num('classMax');
        const all = await store.list({ type: 'class' });
        const plan = pushLib.planPush(all, date, { max });
        if (!plan.moves.length && !plan.rebooks.length) {
          return res.status(400).json({ error: 'No active bookings on that date.' });
        }

        const now = new Date().toISOString();
        let moved = 0, movedFailed = 0, asked = 0, askedFailed = 0;

        for (const m of plan.moves) {
          const existing = await store.get(m.id);
          if (!existing) continue;
          const details = Object.assign({}, existing.details, {
            class_date: m.to,
            moved_from: m.from,
            moved_to_second_at: now,
            moved_reason: 'under_minimum'
          });
          // The backup has been used up — clear it so it can't be spent twice.
          delete details.class_date_2;
          const updated = await store.update(m.id, { details });
          moved++;
          if (existing.email) {
            const r2 = await mailer.sendMovedToSecond(updated, m.from);
            if (!(r2 && r2.ok)) movedFailed++;
          }
        }

        for (const rb of plan.rebooks) {
          const existing = await store.get(rb.id);
          if (!existing) continue;
          const details = Object.assign({}, existing.details, {
            rebook_requested_at: now,
            rebook_reason: rb.reason,
            class_not_running: rb.from
          });
          await store.update(rb.id, { details });
          asked++;
          if (existing.email) {
            const r2 = await mailer.sendRebookRequest(existing, rb.from, rb.reason);
            if (!(r2 && r2.ok)) askedFailed++;
          }
        }

        const parts = [];
        if (moved) parts.push(moved + ' booking' + (moved === 1 ? '' : 's') + ' moved to their 2nd choice');
        if (asked) parts.push(asked + ' asked to rebook');
        const failed = movedFailed + askedFailed;
        if (failed) parts.push(failed + ' email' + (failed === 1 ? '' : 's') + ' failed to send');
        return res.status(200).json({
          ok: true,
          moved, asked, emailsFailed: failed,
          emailed: parts.join(' · ') || 'Nothing to move.'
        });
      } catch (e) {
        return res.status(502).json({ error: 'Could not move the class: ' + (e && e.message || e) });
      }
    }

    if (!id) return res.status(400).json({ error: 'Missing order id.' });

    try {
      const existing = await store.get(id);
      if (!existing) return res.status(404).json({ error: 'Order not found.' });

      let updated, emailed = null;
      if (action === 'mark_paid') {
        updated = await store.markPaid(id, { paidAt: new Date().toISOString() });
      } else if (action === 'mark_fulfilled') {
        const details = Object.assign({}, existing.details, { fulfilled: true, fulfilled_at: new Date().toISOString() });
        updated = await store.update(id, { details });
      } else if (action === 'cancel') {
        const details = Object.assign({}, existing.details, { cancelled: true, cancelled_at: new Date().toISOString() });
        updated = await store.update(id, { details });
        if (existing.email) { const r2 = await mailer.sendCancelled(updated); emailed = r2 && r2.ok ? 'cancellation email sent' : 'cancellation email failed'; }
      } else if (action === 'reschedule') {
        // new_date: free-form date string shown to the customer (class_date or pickup_day).
        const newDate = String(body.new_date || '').replace(/[<>]/g, '').trim().slice(0, 60);
        if (!newDate) return res.status(400).json({ error: 'Please provide the new date.' });
        const oldDate = (existing.details && (existing.details.class_date || existing.details.reservation_date || existing.details.pickup_day)) || null;
        const dateKey = (existing.details && existing.details.class_date != null) ? 'class_date'
          : (existing.details && existing.details.reservation_date != null) ? 'reservation_date'
          : 'pickup_day';
        const details = Object.assign({}, existing.details);
        details[dateKey] = newDate;
        details.rescheduled_from = oldDate;
        details.rescheduled_at = new Date().toISOString();
        updated = await store.update(id, { details });
        if (existing.email) { const r2 = await mailer.sendRescheduled(updated, oldDate); emailed = r2 && r2.ok ? 'reschedule email sent' : 'reschedule email failed'; }
      } else if (action === 'mark_responded' || action === 'reopen' || action === 'set_reminder' || action === 'clear_reminder') {
        /* Erika's own tracker. None of these touch the customer — no email is
           sent and none can be: "responded" means she already replied from her
           inbox, and the reminder is a note to herself. */
        const followup = require('../../lib/orders/followup');
        if (!followup.isTracked(existing)) {
          return res.status(400).json({ error: 'Follow-ups are for inquiries and wholesale enquiries. This is a ' + existing.type + '.' });
        }
        let details;
        try {
          if (action === 'mark_responded') details = followup.markResponded(existing.details, { note: body.note });
          else if (action === 'reopen') details = followup.reopen(existing.details);
          else if (action === 'set_reminder') details = followup.setReminder(existing.details, body.date, body.note);
          else details = followup.clearReminder(existing.details);
        } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
        updated = await store.update(id, { details });

      } else if (action === 'send_reminder') {
        if (!existing.email) return res.status(400).json({ error: 'This submission has no email address.' });
        const r2 = await mailer.sendReminder(existing);
        if (!(r2 && r2.ok)) return res.status(502).json({ error: 'The reminder email could not be sent.' });
        updated = await store.markReminded(id);
        emailed = 'payment reminder sent';
      } else {
        return res.status(400).json({ error: "Unknown action. Use 'mark_paid', 'mark_fulfilled', 'cancel', 'reschedule', 'send_reminder', 'push_class', 'mark_responded', 'reopen', 'set_reminder' or 'clear_reminder'." });
      }
      return res.status(200).json({ ok: true, order: updated, emailed });
    } catch (e) {
      return res.status(502).json({ error: 'Could not update order: ' + (e && e.message || e) });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
