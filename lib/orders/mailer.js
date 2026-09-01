/* ============================================================
   da Cecot — Orders mailer (Resend).
   Mirrors api/send.js's approach (Resend REST, RESEND_API_KEY / RESEND_FROM)
   but sends customer-facing mail: a payment link and unpaid-order reminders.

   Branded in da Cecot's palette (cream / brown / olive / terracotta).
   Best-effort: every function resolves to { ok } and never throws — capturing
   an order must not fail because email is down. The API key is never logged.
   ============================================================ */

const BRAND = {
  cream: '#f9f7ef',
  brown: '#4a1e18',
  olive: '#374225',
  terracotta: '#ad5217',
  gold: '#c4a035'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}
function humanize(k) {
  return String(k).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}
function money(cents, currency) {
  if (cents == null) return null;
  return (currency || 'CAD') + ' $' + (Number(cents) / 100).toFixed(2);
}

// Build the order-detail rows (item, pickup, etc.) shared by both emails.
function detailRows(sub) {
  const d = (sub && sub.details) || {};
  const order = ['item', 'quantity', 'class_date', 'guests', 'pickup_day', 'pickup_time', 'allergies', 'notes', 'message'];
  const keys = order.filter((k) => String(d[k] == null ? '' : d[k]).trim() !== '');
  const rows = keys.map((k) =>
    '<tr>' +
    '<td style="padding:6px 16px 6px 0;font-weight:600;color:' + BRAND.olive + ';white-space:nowrap;vertical-align:top">' + esc(humanize(k)) + '</td>' +
    '<td style="padding:6px 0;color:#2b2b2b;vertical-align:top">' + esc(d[k]).replace(/\n/g, '<br>') + '</td>' +
    '</tr>'
  );
  const total = money(sub && sub.amount_cents, sub && sub.currency);
  if (total) {
    rows.push('<tr>' +
      '<td style="padding:10px 16px 0 0;font-weight:700;color:' + BRAND.brown + ';white-space:nowrap;vertical-align:top">Total</td>' +
      '<td style="padding:10px 0 0;color:' + BRAND.brown + ';font-weight:700;vertical-align:top">' + esc(total) + '</td>' +
      '</tr>');
  }
  return rows.join('');
}

function payButton(url) {
  if (!url) return '';
  return '<table role="presentation" style="margin:22px 0 6px"><tr><td style="border-radius:8px;background:' + BRAND.terracotta + '">' +
    '<a href="' + esc(url) + '" style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#fff;text-decoration:none;border-radius:8px">Complete your payment</a>' +
    '</td></tr></table>';
}

function wrap(innerHtml) {
  return '<div style="background:' + BRAND.cream + ';padding:28px 0;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 30px;border:1px solid #e7e0cf">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;color:' + BRAND.brown + ';letter-spacing:.3px">da Cecot</div>' +
    '<div style="height:3px;width:46px;background:' + BRAND.gold + ';margin:10px 0 20px"></div>' +
    innerHtml +
    '<p style="font-size:12px;color:#999;margin:26px 0 0">da Cecot Food · Edmonton, AB · dacecotfood.com</p>' +
    '</div></div>';
}

function detailsTable(sub) {
  const rows = detailRows(sub);
  if (!rows) return '';
  return '<table style="font-size:14px;line-height:1.5;border-collapse:collapse;margin:16px 0 0">' + rows + '</table>';
}

async function send(sub, subject, introHtml) {
  const key = process.env.RESEND_API_KEY;
  const to = sub && sub.email;
  if (!key) return { ok: false, skipped: true, reason: 'RESEND_API_KEY not set' };
  if (!to || String(to).indexOf('@') < 1) return { ok: false, skipped: true, reason: 'no customer email' };

  const html = wrap(introHtml + detailsTable(sub) + payButton(sub && sub.payment_link_url));
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'da Cecot <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: html
      })
    });
    if (!r.ok) {
      console.error('Orders mailer: Resend error', r.status);
      return { ok: false, status: r.status };
    }
    return { ok: true };
  } catch (err) {
    console.error('Orders mailer: exception', String(err && err.message || err));
    return { ok: false, error: String(err && err.message || err) };
  }
}

function greeting(sub) {
  const name = sub && sub.name ? String(sub.name).split(/\s+/)[0] : null;
  return name ? 'Ciao ' + esc(name) + ',' : 'Ciao,';
}

// Sent right after an order is placed — confirms details + payment link.
async function sendPaymentLink(sub) {
  const intro =
    '<p style="font-size:15px;color:#2b2b2b;margin:0">' + greeting(sub) + '</p>' +
    '<p style="font-size:15px;color:#2b2b2b;margin:10px 0 0">Grazie for your order with da Cecot. ' +
    'Here are the details — tap below to pay securely and lock in your pickup.</p>';
  return send(sub, 'Your da Cecot order — complete your payment', intro);
}

// Sent by the reminders cron for an order that is still unpaid.
async function sendReminder(sub) {
  const intro =
    '<p style="font-size:15px;color:#2b2b2b;margin:0">' + greeting(sub) + '</p>' +
    '<p style="font-size:15px;color:#2b2b2b;margin:10px 0 0">Just a friendly reminder — your da Cecot order isn\'t paid yet. ' +
    'Tap below to complete payment so we can have it ready for you.</p>';
  return send(sub, 'Reminder: complete your da Cecot order', intro);
}

// Sent when the restaurant cancels a booking/order from the admin.
async function sendCancelled(sub) {
  const intro =
    '<p style="font-size:15px;color:#2b2b2b;margin:0">' + greeting(sub) + '</p>' +
    '<p style="font-size:15px;color:#2b2b2b;margin:10px 0 0">We\'re sorry — your da Cecot booking below has been cancelled. ' +
    'If you\'ve already paid, we\'ll make it right. Questions? Just reply to this email or call us at (825) 888-4218.</p>';
  return send(sub, 'Your da Cecot booking has been cancelled', intro);
}

// Sent when the restaurant moves a booking to a new date from the admin.
async function sendRescheduled(sub, oldDate) {
  const newDate = (sub.details && (sub.details.class_date || sub.details.reservation_date || sub.details.pickup_day)) || 'a new date';
  const intro =
    '<p style="font-size:15px;color:#2b2b2b;margin:0">' + greeting(sub) + '</p>' +
    '<p style="font-size:15px;color:#2b2b2b;margin:10px 0 0">Your da Cecot booking has been moved' +
    (oldDate ? ' from <strong>' + esc(oldDate) + '</strong>' : '') +
    ' to <strong>' + esc(newDate) + '</strong>. Updated details below — if the new date doesn\'t work, just reply to this email or call us at (825) 888-4218.</p>';
  return send(sub, 'Your da Cecot booking has a new date', intro);
}

// Sent 1–2 hours before a table reservation. Warm, short, no payment button.
async function sendBookingReminder(sub) {
  const d = sub.details || {};
  const when = [d.reservation_time, d.party_size].filter(Boolean).join(' · ');
  const intro =
    '<p style="font-size:15px;color:#2b2b2b;margin:0">' + greeting(sub) + '</p>' +
    '<p style="font-size:15px;color:#2b2b2b;margin:10px 0 0">A little reminder — your table at da Cecot is coming up today' +
    (when ? ' (<strong>' + esc(when) + '</strong>)' : '') + '. We can\'t wait to see you!</p>' +
    '<p style="font-size:14px;color:#555;margin:12px 0 0">Find us on Whyte Ave (82 Ave) &amp; 104 Street, Edmonton. Running late or need to change anything? Call us at (825) 888-4218 or just reply to this email.</p>';
  return send(sub, 'See you soon — your da Cecot reservation today', intro);
}

// Sent when Erika approves a large-party request from the admin.
async function sendApproved(sub) {
  const intro =
    '<p style="font-size:17px;font-weight:700;color:#2b2b2b;margin:0 0 12px">Your reservation is confirmed</p>' +
    '<p style="font-size:15px;color:#2b2b2b;margin:0">' + greeting(sub) + '</p>' +
    '<p style="font-size:15px;color:#2b2b2b;margin:10px 0 0">Great news — your table is confirmed! This email is your confirmation; the details are below. We can\'t wait to host your group.</p>';
  return send(sub, 'Your table is confirmed — da Cecot Food', intro);
}

// Sent when Erika declines a large-party request.
async function sendDeclined(sub) {
  const intro =
    '<p style="font-size:15px;color:#2b2b2b;margin:0">' + greeting(sub) + '</p>' +
    '<p style="font-size:15px;color:#2b2b2b;margin:10px 0 0">Thank you so much for wanting to dine with us — unfortunately we can\'t host your group at that time. ' +
    'Please call us at (825) 888-4218 and we\'ll do everything we can to find a time that works. We\'d love to have you.</p>';
  return send(sub, 'About your table request — da Cecot Food', intro);
}

module.exports = { sendPaymentLink, sendReminder, sendCancelled, sendRescheduled, sendBookingReminder, sendApproved, sendDeclined, BRAND };
