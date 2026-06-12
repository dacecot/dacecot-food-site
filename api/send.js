// Vercel Serverless Function — receives website form submissions and emails
// them via Resend (https://resend.com). The recipient is hard-coded so this
// endpoint can only ever email da Cecot's own inbox (it can't be abused to
// send mail to arbitrary addresses).
//
// Required env var (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY   your Resend API key (starts with "re_")
// Optional:
//   RESEND_FROM      e.g. "da Cecot <bookings@dacecotfood.com>" once the domain
//                    is verified in Resend. Defaults to Resend's test sender.

const TO = 'info@dacecotfood.com';

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
  // Friendly label for the body, derived from the subject (e.g. "Sunday Pasta Class Booking").
  const formName = subject.replace(/\s*[—–-]\s*da Cecot.*$/i, '').trim() || 'website enquiry';

  const humanize = function (k) {
    return k.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  };
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  // Order: contact details first, free-text notes last, everything else between.
  const all = Object.keys(data).filter(function (k) { return k !== '_subject' && k !== '_honey'; });
  const top = ['name', 'email', 'phone'];
  const last = ['notes', 'message'];
  const ordered = top.filter(function (k) { return all.indexOf(k) > -1; })
    .concat(all.filter(function (k) { return top.indexOf(k) < 0 && last.indexOf(k) < 0; }))
    .concat(last.filter(function (k) { return all.indexOf(k) > -1; }));
  const fields = ordered.map(function (k) { return [k, data[k]]; })
    .filter(function (e) { return String(e[1] == null ? '' : e[1]).trim() !== ''; });

  const customer = (typeof data.name === 'string' && data.name.trim()) ? data.name.trim() : 'the customer';

  const rows = fields.map(function (e) {
    return '<tr>' +
      '<td style="padding:7px 18px 7px 0;font-weight:600;color:#3F512E;white-space:nowrap;vertical-align:top">' + esc(humanize(e[0])) + '</td>' +
      '<td style="padding:7px 0;color:#2b2b2b;vertical-align:top">' + esc(e[1]).replace(/\n/g, '<br>') + '</td>' +
    '</tr>';
  }).join('');
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;max-width:560px;margin:0 auto">' +
      '<p style="font-size:15px;margin:0">You have a new <strong>' + esc(formName) + '</strong> from the website:</p>' +
      '<table style="font-size:14px;line-height:1.5;border-collapse:collapse;margin:14px 0 0">' + rows + '</table>' +
      '<p style="font-size:13px;color:#555;margin:22px 0 0">Just reply to this email to get back to ' + esc(customer) + ' directly.</p>' +
      '<p style="font-size:12px;color:#999;margin:6px 0 0">Sent from dacecotfood.com</p>' +
    '</div>';

  const labelWidth = fields.reduce(function (m, e) { return Math.max(m, humanize(e[0]).length); }, 0);
  const padLabel = function (s) { while (s.length < labelWidth) { s += ' '; } return s; };
  const text = 'You have a new ' + formName + ' from the website:\n\n' +
    fields.map(function (e) { return padLabel(humanize(e[0])) + '   ' + String(e[1]).replace(/\n/g, ' '); }).join('\n') +
    '\n\nJust reply to this email to get back to ' + customer + ' directly.';

  const replyTo = (typeof data.email === 'string' && data.email.indexOf('@') > 0) ? data.email : undefined;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'da Cecot Website <onboarding@resend.dev>',
        to: [TO],
        reply_to: replyTo,
        subject: subject,
        html: html,
        text: text
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error', r.status, detail);
      return res.status(502).json({ success: false, error: 'Send failed', _status: r.status, _detail: String(detail).slice(0, 400) });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Resend exception', err);
    return res.status(502).json({ success: false, error: 'Send failed' });
  }
};
