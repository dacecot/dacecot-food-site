/* ============================================================
   da Cecot — Square client (payment links + webhook verification).

   Env:
     SQUARE_ACCESS_TOKEN          Square API access token (never logged).
     SQUARE_LOCATION_ID           the seller location the checkout belongs to.
     SQUARE_WEBHOOK_SIGNATURE_KEY signature key for webhook verification.
     SQUARE_ENV                   'sandbox' (default) | 'production'.

   No live calls happen at require-time; everything is env-gated so the module
   loads and this file's helpers can be unit-reasoned with no credentials.
   The access token is NEVER logged.
   ============================================================ */
const crypto = require('crypto');

const SQUARE_VERSION = '2024-07-17';

function env() {
  return String(process.env.SQUARE_ENV || 'sandbox').toLowerCase() === 'production'
    ? 'production' : 'sandbox';
}
function baseUrl() {
  return env() === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

// True only when the pieces needed to CREATE a payment link are present.
function configured() {
  return !!process.env.SQUARE_ACCESS_TOKEN && !!process.env.SQUARE_LOCATION_ID;
}
function webhookConfigured() {
  return !!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
}

/* ---------- payment links ----------
   POST /v2/online-checkout/payment-links
   Creates a hosted checkout for a single ad-hoc line item.
   Returns { url, squareOrderId, paymentLinkId }.
*/
async function createPaymentLink(opts) {
  opts = opts || {};
  if (!configured()) throw new Error('Square is not configured (SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID).');

  const amount = parseInt(opts.amountCents, 10);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('createPaymentLink: amountCents must be a positive integer.');

  const body = {
    idempotency_key: (opts.referenceId ? String(opts.referenceId) + ':' : '') + crypto.randomUUID(),
    quick_pay: {
      name: String(opts.name || 'da Cecot order').slice(0, 255),
      price_money: { amount: amount, currency: 'CAD' },
      location_id: process.env.SQUARE_LOCATION_ID
    }
  };
  const checkoutOptions = {};
  if (opts.redirectUrl) checkoutOptions.redirect_url = String(opts.redirectUrl);
  if (Object.keys(checkoutOptions).length) body.checkout_options = checkoutOptions;

  const prePopulated = {};
  if (opts.buyerEmail) prePopulated.buyer_email = String(opts.buyerEmail);
  if (Object.keys(prePopulated).length) body.pre_populated_data = prePopulated;

  if (opts.referenceId) {
    // Stamp our submission id onto the order so the webhook can find it later.
    body.payment_note = String(opts.referenceId).slice(0, 500);
  }

  const r = await fetch(baseUrl() + '/v2/online-checkout/payment-links', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.SQUARE_ACCESS_TOKEN,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Surface Square's status/message but never the token.
    const msg = (json && json.errors && json.errors[0] && json.errors[0].detail) || ('HTTP ' + r.status);
    throw new Error('Square payment-link create failed: ' + msg);
  }
  const link = json.payment_link || {};
  return {
    url: link.url || (link.long_url || null),
    squareOrderId: link.order_id || null,
    paymentLinkId: link.id || null
  };
}

/* ---------- webhook verification ----------
   Square signs the notification with HMAC-SHA256 over (notificationUrl + rawBody),
   base64-encoded, keyed by SQUARE_WEBHOOK_SIGNATURE_KEY. The signature arrives in
   the `x-square-hmacsha256-signature` header. Constant-time compare.
*/
function verifyWebhook(signatureHeader, rawBody, notificationUrl) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signatureHeader || notificationUrl == null) return false;
  const payload = String(notificationUrl) + (rawBody == null ? '' : (Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)));
  const expected = crypto.createHmac('sha256', key).update(payload, 'utf8').digest('base64');
  const a = Buffer.from(String(signatureHeader));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

module.exports = {
  configured, webhookConfigured, env, baseUrl,
  createPaymentLink, verifyWebhook, SQUARE_VERSION
};
