// /api/square/webhook — receive Square webhooks and auto-mark orders paid.
//
// Square signs each notification with HMAC-SHA256 over (notificationUrl + rawBody).
// We MUST read the RAW body to verify — so Vercel's automatic JSON body parsing is
// disabled below and we buffer the request ourselves.
//
// Flow: verify signature → on a COMPLETED payment / paid order, find our submission
// by reference_id (our submission id, carried as the order's reference/note) or by
// square_order_id → store.markPaid. Always answer 200 fast for valid events so
// Square doesn't retry. Returns 503 when Square isn't configured, 401 on bad signature.

const store = require('../../lib/orders/store');
const square = require('../../lib/orders/square');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    // If a framework already buffered it, use that.
    if (req.body != null && (typeof req.body === 'string' || Buffer.isBuffer(req.body))) {
      return resolve(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body);
    }
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Reconstruct the exact URL Square posted to (used as the signature's prefix).
function notificationUrl(req) {
  if (process.env.SQUARE_WEBHOOK_URL) return process.env.SQUARE_WEBHOOK_URL;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host + (req.url || '/api/square/webhook');
}

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!square.webhookConfigured()) {
    return res.status(503).json({ error: 'Square webhooks are not configured.' });
  }

  const raw = await readRawBody(req);
  const sig = req.headers['x-square-hmacsha256-signature'];
  if (!square.verifyWebhook(sig, raw, notificationUrl(req))) {
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  let event;
  try { event = JSON.parse(raw || '{}'); } catch (e) { event = {}; }
  const type = String(event.type || '');
  const obj = (event.data && event.data.object) || {};

  try {
    const payment = obj.payment || (type.startsWith('payment') ? obj : null);
    const order = obj.order || (type.startsWith('order') ? obj : null);

    let referenceId = null;
    let squareOrderId = null;
    let squarePaymentId = null;
    let completed = false;

    if (payment) {
      squarePaymentId = payment.id || null;
      squareOrderId = payment.order_id || null;
      referenceId = payment.reference_id || payment.note || null;
      completed = String(payment.status || '').toUpperCase() === 'COMPLETED';
    } else if (order) {
      squareOrderId = order.id || null;
      referenceId = order.reference_id || null;
      const state = String(order.state || '').toUpperCase();
      const tenders = Array.isArray(order.tenders) ? order.tenders : [];
      completed = state === 'COMPLETED' || (order.net_amount_due_money && order.net_amount_due_money.amount === 0) || tenders.length > 0;
    }

    if (!completed) {
      // Valid event we simply don't act on (e.g. an in-progress payment).
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Find our submission: reference_id is our submission id; fall back to order id.
    let sub = null;
    if (referenceId) sub = await store.get(referenceId).catch(() => null);
    if (!sub && squareOrderId) {
      const rows = await store.list({}).catch(() => []);
      sub = rows.find((r) => r.square_order_id && r.square_order_id === squareOrderId) || null;
    }

    if (sub && sub.payment_status !== 'paid') {
      await store.markPaid(sub.id, {
        squarePaymentId: squarePaymentId,
        paidAt: new Date().toISOString()
      });
    }

    return res.status(200).json({ ok: true, matched: !!sub });
  } catch (err) {
    console.error('Square webhook handler error', String(err && err.message || err));
    // Still 200 so Square doesn't hammer retries on a transient store hiccup;
    // the reminders cron remains a backstop for anything missed.
    return res.status(200).json({ ok: true, deferred: true });
  }
};

module.exports = handler;
// Tell Vercel not to parse the body — we need the exact bytes for the signature.
module.exports.config = { api: { bodyParser: false } };
