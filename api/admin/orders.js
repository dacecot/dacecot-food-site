// /api/admin/orders
//   GET  → list captured submissions (auth required). Optional ?type= and ?status=.
//   POST → manual update { id, action:'mark_paid'|'mark_fulfilled' } (auth + CSRF).
// Reuses the CMS session/CSRF auth. JSON only.
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
    const opts = {};
    if (q.type) opts.type = String(q.type);
    if (q.status) opts.status = String(q.status);
    if (q.limit) opts.limit = q.limit;
    try {
      const orders = await store.list(opts);
      return res.status(200).json({ ok: true, store: store.backend(), count: orders.length, orders });
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
      } else if (action === 'send_reminder') {
        if (!existing.email) return res.status(400).json({ error: 'This submission has no email address.' });
        const r2 = await mailer.sendReminder(existing);
        if (!(r2 && r2.ok)) return res.status(502).json({ error: 'The reminder email could not be sent.' });
        updated = await store.markReminded(id);
        emailed = 'payment reminder sent';
      } else {
        return res.status(400).json({ error: "Unknown action. Use 'mark_paid', 'mark_fulfilled', 'cancel', 'reschedule' or 'send_reminder'." });
      }
      return res.status(200).json({ ok: true, order: updated, emailed });
    } catch (e) {
      return res.status(502).json({ error: 'Could not update order: ' + (e && e.message || e) });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
