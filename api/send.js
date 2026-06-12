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
  const fields = Object.entries(data).filter(function (e) { return e[0] !== '_subject' && e[0] !== '_honey'; });

  const esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; });
  };
  const rows = fields.map(function (e) {
    return '<tr><td style="padding:4px 14px 4px 0;font-weight:600;text-transform:capitalize;vertical-align:top">' +
      esc(e[0]) + '</td><td style="padding:4px 0">' + esc(e[1]) + '</td></tr>';
  }).join('');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b">' +
    '<h2 style="margin:0 0 12px">' + esc(subject) + '</h2>' +
    '<table style="font-size:14px;border-collapse:collapse">' + rows + '</table>' +
    '<p style="margin-top:18px;font-size:12px;color:#888">Sent from the da Cecot website.</p></div>';
  const text = fields.map(function (e) { return e[0] + ': ' + e[1]; }).join('\n');

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
      return res.status(502).json({ success: false, error: 'Send failed' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Resend exception', err);
    return res.status(502).json({ success: false, error: 'Send failed' });
  }
};
