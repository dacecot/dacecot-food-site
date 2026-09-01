// Vercel Serverless Function — receives website form submissions and emails
// them via Resend (https://resend.com).
//
//   1. STORE notification  → always sent to da Cecot's own inbox (info@…).
//   2. CUSTOMER confirmation → sent back to the person who placed a pasta-shop
//      order, so they get a written "we've got your order" receipt. Best-effort:
//      if it fails the order is still recorded (the store email is what counts).
//
// Required env var (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY   your Resend API key (starts with "re_")
// Optional:
//   RESEND_FROM      e.g. "da Cecot <orders@dacecotfood.com>" — REQUIRED for the
//                    customer confirmation to actually deliver. Resend's test
//                    sender (onboarding@resend.dev) can only email the account
//                    owner, so customer confirmations need the dacecotfood.com
//                    domain verified in Resend and RESEND_FROM set to it.
//   RESEND_TO        where store notifications land. Defaults to info@dacecotfood.com

const TO = process.env.RESEND_TO || 'info@dacecotfood.com';
const FROM = process.env.RESEND_FROM || 'da Cecot Website <onboarding@resend.dev>';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const humanize = (k) => k.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

// Fire a single email through Resend. Returns { ok, status, detail }.
async function sendEmail(key, { to, subject, html, text, replyTo }) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: replyTo, subject, html, text })
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error', r.status, detail);
      return { ok: false, status: r.status, detail };
    }
    return { ok: true };
  } catch (err) {
    console.error('Resend exception', err);
    return { ok: false, status: 0, detail: String(err && err.message || err) };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set');
    return res.status(500).json({ success: false, error: 'Email is not configured yet.' });
  }

  let data = req.body;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
  if (!data || typeof data !== 'object') data = {};

  // Honeypot — silently accept so bots think they succeeded and don't retry.
  if (data._honey) return res.status(200).json({ success: true });

  const subject = String(data._subject || 'New message — da Cecot Food').slice(0, 200);
  const formName = subject.replace(/\s*[—–-]\s*da Cecot.*$/i, '').trim() || 'website enquiry';

  // ---- Build the STORE notification (unchanged behaviour) ----
  const all = Object.keys(data).filter((k) => k !== '_subject' && k !== '_honey' && k !== 'pay_link');
  const top = ['name', 'email', 'phone'];
  const last = ['notes', 'message'];
  const ordered = top.filter((k) => all.indexOf(k) > -1)
    .concat(all.filter((k) => top.indexOf(k) < 0 && last.indexOf(k) < 0))
    .concat(last.filter((k) => all.indexOf(k) > -1));
  const fields = ordered.map((k) => [k, data[k]])
    .filter((e) => String(e[1] == null ? '' : e[1]).trim() !== '');

  const customerName = (typeof data.name === 'string' && data.name.trim()) ? data.name.trim() : 'the customer';

  const rows = fields.map((e) =>
    '<tr>' +
      '<td style="padding:7px 18px 7px 0;font-weight:600;color:#3F512E;white-space:nowrap;vertical-align:top">' + esc(humanize(e[0])) + '</td>' +
      '<td style="padding:7px 0;color:#2b2b2b;vertical-align:top">' + esc(e[1]).replace(/\n/g, '<br>') + '</td>' +
    '</tr>'
  ).join('');
  const storeHtml =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;max-width:560px;margin:0 auto">' +
      '<p style="font-size:15px;margin:0">You have a new <strong>' + esc(formName) + '</strong> from the website:</p>' +
      '<table style="font-size:14px;line-height:1.5;border-collapse:collapse;margin:14px 0 0">' + rows + '</table>' +
      '<p style="font-size:13px;color:#555;margin:22px 0 0">Just reply to this email to get back to ' + esc(customerName) + ' directly.</p>' +
      '<p style="font-size:12px;color:#999;margin:6px 0 0">Sent from dacecotfood.com</p>' +
    '</div>';
  const labelWidth = fields.reduce((m, e) => Math.max(m, humanize(e[0]).length), 0);
  const padLabel = (s) => { while (s.length < labelWidth) { s += ' '; } return s; };
  const storeText = 'You have a new ' + formName + ' from the website:\n\n' +
    fields.map((e) => padLabel(humanize(e[0])) + '   ' + String(e[1]).replace(/\n/g, ' ')).join('\n') +
    '\n\nJust reply to this email to get back to ' + customerName + ' directly.';

  const customerEmail = (typeof data.email === 'string' && /.+@.+\..+/.test(data.email.trim())) ? data.email.trim() : null;

  // ---- Send the store notification (this is the critical one) ----
  const storeRes = await sendEmail(key, {
    to: TO,
    subject,
    html: storeHtml,
    text: storeText,
    replyTo: customerEmail || undefined
  });
  if (!storeRes.ok) {
    return res.status(502).json({
      success: false, error: 'Send failed',
      resendStatus: storeRes.status, resendDetail: storeRes.detail,
      attemptedFrom: FROM, attemptedTo: TO
    });
  }

  // ---- Send the CUSTOMER confirmation (best-effort) ----
  // Any submission that carries the customer's email gets a friendly confirmation.
  // Orders (pasta shop) get an order-style receipt; other forms get a generic
  // "we received your message" note. Never blocks the success response.
  let customerConfirmation = 'skipped';
  const isOrder = /pasta shop order/i.test(subject) || data.item || data.pickup_day || data.quantity;
  if (customerEmail) {
    const firstName = customerName === 'the customer' ? 'there' : customerName.split(/\s+/)[0];

    // Order detail rows (item, quantity, pickup day, allergies, notes) when present.
    const detailKeys = ['item', 'quantity', 'pickup_day', 'pickup_time', 'allergies', 'notes'];
    const detailRows = detailKeys
      .filter((k) => String(data[k] == null ? '' : data[k]).trim() !== '')
      .map((k) =>
        '<tr>' +
          '<td style="padding:6px 18px 6px 0;font-weight:600;color:#3F512E;white-space:nowrap;vertical-align:top">' + esc(humanize(k)) + '</td>' +
          '<td style="padding:6px 0;color:#2b2b2b;vertical-align:top">' + esc(data[k]).replace(/\n/g, '<br>') + '</td>' +
        '</tr>'
      ).join('');

    // A "complete your payment" button when the front-end passed a Square link.
    const payLink = (typeof data.pay_link === 'string' && /^https:\/\/(square\.link|checkout\.square)/i.test(data.pay_link.trim())) ? data.pay_link.trim() : '';
    const payButton = payLink
      ? '<p style="margin:0 0 18px"><a href="' + esc(payLink) + '" style="display:inline-block;background:#ad5217;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Complete your payment</a></p>'
      : '';
    const payLine = payLink ? ('\nComplete your payment: ' + payLink + '\n') : '';

    let intro, closing, subjectLine;
    if (isOrder) {
      subjectLine = 'We\'ve received your order — da Cecot Food';
      intro = 'Grazie, ' + esc(firstName) + '! We\'ve received your pasta-shop order and the kitchen has it. We\'ll confirm your pickup time and total by phone or email shortly.';
      closing = (payLink ? 'You can complete your payment securely with the button above (Square) any time. ' : 'If you paid online, your payment was handled securely by Square and you\'ll have a Square receipt too. ') + 'Questions? Just reply to this email or call us at (825) 888-4218.';
    } else {
      subjectLine = 'Thanks for reaching out — da Cecot Food';
      intro = 'Grazie, ' + esc(firstName) + '! We\'ve received your message and someone from the da Cecot family will get back to you shortly.';
      closing = 'Questions in the meantime? Just reply to this email or call us at (825) 888-4218.';
    }

    const custHtml =
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;max-width:560px;margin:0 auto">' +
        '<h2 style="font-family:Georgia,\'Times New Roman\',serif;color:#4a1e18;font-size:22px;margin:0 0 12px">da Cecot Food</h2>' +
        '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">' + intro + '</p>' +
        (detailRows ? '<table style="font-size:14px;line-height:1.5;border-collapse:collapse;margin:0 0 16px;background:#f9f7ef;border-radius:8px;padding:4px">' + detailRows + '</table>' : '') +
        payButton +
        '<p style="font-size:14px;line-height:1.6;color:#555;margin:0 0 18px">' + closing + '</p>' +
        '<p style="font-size:12px;color:#999;margin:0">da Cecot Food Inc · Whyte Avenue, Edmonton · dacecotfood.com</p>' +
      '</div>';
    const custText = intro.replace(/&#39;/g, "'") + '\n\n' +
      detailKeys.filter((k) => String(data[k] == null ? '' : data[k]).trim() !== '')
        .map((k) => humanize(k) + ': ' + String(data[k]).replace(/\n/g, ' ')).join('\n') +
      payLine +
      '\n\n' + closing.replace(/&#39;/g, "'") + '\n\nda Cecot Food Inc · Whyte Avenue, Edmonton';

    const custRes = await sendEmail(key, {
      to: customerEmail,
      subject: subjectLine,
      html: custHtml,
      text: custText,
      replyTo: TO
    });
    customerConfirmation = custRes.ok ? 'sent' : ('failed:' + custRes.status);
  }

  return res.status(200).json({ success: true, customerConfirmation });
};
