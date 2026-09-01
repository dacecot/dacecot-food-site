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

  // Table reservations require name, phone and email — enforce server-side too
  // (the form marks them required, but the API must not trust the client).
  if (/table reservation/i.test(String(data._subject || '')) || data.reservation_date) {
    const missing = ['name', 'phone', 'email', 'allergies'].filter((k) => !String(data[k] == null ? '' : data[k]).trim());
    if (missing.length) return res.status(400).json({ success: false, error: 'Please fill in your ' + missing.map((k) => k === 'allergies' ? 'allergies/dietary restrictions (type "None" if none)' : k).join(', ') + '.' });

    // Capacity guard: the dining room can only hold what the floor plan holds.
    // Sum the party sizes of active reservations within a 2-hour window of the
    // requested time; refuse when adding this party would exceed total seats.
    // Fails open if the floor plan is empty or the check errors (never blocks
    // real guests because of an infra hiccup — Erika confirms every booking).
    try {
      const tablesLib = require('../lib/orders/tables');
      const ordersStore = require('../lib/orders/store');
      const R = require('../lib/orders/reservations');
      const tbls = await tablesLib.list();
      const capacity = tbls.reduce((sum, t) => sum + (Number(t.seats) || 0), 0);
      if (capacity > 0) {
        await ordersStore.init();
        const reqDate = R.parseDate(data.reservation_date);
        const reqTime = R.parseTime(data.reservation_time);
        const party = parseInt(String(data.party_size || '').replace(/[^\d]/g, ''), 10) || 1;
        if (reqDate) {
          const all = await ordersStore.list({ type: 'reservation' });
          const overlapping = all.filter((s) => {
            const det = s.details || {};
            if (det.cancelled) return false;
            if (R.parseDate(det.reservation_date) !== reqDate) return false;
            const t = R.parseTime(det.reservation_time);
            if (reqTime == null || t == null) return true; // unknown times: count them (safe)
            return Math.abs(t - reqTime) < 120;
          });
          const seated = overlapping.reduce((sum, s) => sum + (parseInt(String(s.details.party_size || '').replace(/[^\d]/g, ''), 10) || 1), 0);
          if (seated + party > capacity) {
            return res.status(409).json({
              success: false,
              error: 'We’re fully booked around that time — please try a different time or day, or call us at (825) 888-4218 and we’ll do our best to fit you in.'
            });
          }
        }
      }
    } catch (e) { console.error('reservation capacity check failed (allowing through)', e && e.message); }
  }

  // Sunday pasta classes have a hard capacity — reject bookings that would
  // overfill the class (the page shows live availability, but never trust it).
  if (/class booking/i.test(String(data._subject || '')) && data.class_date) {
    try {
      const ordersStore = require('../lib/orders/store');
      await ordersStore.init();
      let max = 12;
      try { const content = require('../lib/cms/content'); const n = Number(content.get('classMax')); if (Number.isFinite(n) && n > 0) max = n; } catch (e) {}
      const requested = parseInt(String(data.guests || '').replace(/[^\d]/g, ''), 10) || 1;
      const existing = await ordersStore.list({ type: 'class' });
      const booked = existing
        .filter((s) => s.details && !s.details.cancelled && String(s.details.class_date || '').trim() === String(data.class_date).trim())
        .reduce((sum, s) => sum + (parseInt(String(s.details.guests || '').replace(/[^\d]/g, ''), 10) || 1), 0);
      const left = Math.max(0, max - booked);
      if (requested > left) {
        return res.status(409).json({
          success: false,
          error: left === 0
            ? 'That class is now fully booked — please choose another Sunday.'
            : 'Only ' + left + ' seat' + (left === 1 ? '' : 's') + ' left for that class — please lower your guest count or pick another Sunday.'
        });
      }
    } catch (e) { console.error('class capacity check failed (allowing through)', e && e.message); }
  }

  // Capture the submission to the orders store (best-effort, never blocks email).
  let submissionId = null;
  try {
    const ordersStore = require('../lib/orders/store');
    const { normalize } = require('../lib/orders/submission');
    await ordersStore.init();
    const rec = await ordersStore.record(normalize(data));
    submissionId = rec && rec.id;
  } catch (e) { console.error('order capture failed (non-blocking)', e && e.message); }

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
  // Classify: a table reservation, a pasta-shop order, a class/drop-in booking,
  // or a general enquiry.
  const isReservation = /table reservation/i.test(subject) || data.reservation_date;
  const isClass = /class booking|drop-in|drop in/i.test(subject) || data.class_date || data.drop_in_date;
  const isOrder = /pasta shop order/i.test(subject) || data.item || data.pickup_day || data.quantity;
  if (customerEmail) {
    const firstName = customerName === 'the customer' ? 'there' : customerName.split(/\s+/)[0];

    // Detail rows shown back to the customer — order, booking AND reservation fields.
    const detailKeys = ['item', 'quantity', 'class_date', 'drop_in_date', 'reservation_date', 'reservation_time', 'party_size', 'guests', 'pickup_day', 'pickup_time', 'allergies', 'notes'];
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
    if (isReservation) {
      subjectLine = 'Your table is confirmed — da Cecot Food';
      intro = 'Grazie, ' + esc(firstName) + '! Your table at da Cecot is confirmed — this email is your confirmation, and your details are below. We look forward to hosting you!';
      closing = 'Need to change or cancel? Just reply to this email or call us at (825) 888-4218. A presto!';
    } else if (isClass) {
      subjectLine = 'Your class booking — da Cecot Food';
      intro = 'Grazie, ' + esc(firstName) + '! We\'ve received your class booking — the details are below. We look forward to making pasta with you!';
      closing = (payLink ? 'Please complete your payment securely with the button above (Square) to confirm your spot. ' : 'We\'ll confirm your spot by phone or email shortly. ') + 'Questions? Just reply to this email or call us at (825) 888-4218.';
    } else if (isOrder) {
      subjectLine = 'We\'ve received your order — da Cecot Food';
      intro = 'Grazie, ' + esc(firstName) + '! We\'ve received your pasta-shop order and the kitchen has it. We\'ll confirm your pickup time and total by phone or email shortly.';
      closing = (payLink ? 'You can complete your payment securely with the button above (Square) any time. ' : 'If you paid online, your payment was handled securely by Square and you\'ll have a Square receipt too. ') + 'Questions? Just reply to this email or call us at (825) 888-4218.';
    } else {
      subjectLine = 'Thanks for reaching out — da Cecot Food';
      intro = 'Grazie, ' + esc(firstName) + '! We\'ve received your message and someone from the da Cecot family will get back to you shortly.';
      closing = 'Questions in the meantime? Just reply to this email or call us at (825) 888-4218.';
    }

    let custHtml, custText;
    if (isReservation) {
      // Structured confirmation (mirrors the layout guests knew from Wix):
      // Reservation details / Restaurant info / Guest details.
      const niceDate = (() => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data.reservation_date || '').trim());
        if (!m) return String(data.reservation_date || '');
        const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return MO[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
      })();
      const secHead = (t) => '<p style="font-size:14px;font-weight:700;color:#4a1e18;margin:18px 0 6px">' + t + '</p>';
      const line = (l, v) => v ? '<p style="font-size:14px;line-height:1.55;margin:0"><span style="color:#6b6157">' + l + ':</span> ' + esc(v) + '</p>' : '';
      const ADDR = '8137 104 Street NW, Edmonton, AB T6E 4E4, Canada';
      // Parties above 5 wait for Erika's approval — their email says so.
      const bigParty = (parseInt(String(data.party_size || '').replace(/[^\d]/g, ''), 10) || 1) > 5;
      const headline = bigParty ? 'We’ve received your table request' : 'Your reservation is confirmed';
      const opening = bigParty
        ? 'Thank you for booking with us! For larger tables we double-check the room first — we’ll confirm your reservation shortly by email.'
        : 'Thank you for booking with us — this email is your confirmation. Please let us know about any changes.';
      subjectLine = bigParty ? 'We’ve received your table request — da Cecot Food' : subjectLine;
      custHtml =
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;max-width:560px;margin:0 auto">' +
          '<h2 style="font-family:Georgia,\'Times New Roman\',serif;color:#4a1e18;font-size:22px;margin:0 0 4px">da Cecot Food</h2>' +
          '<p style="font-size:17px;font-weight:700;margin:0 0 14px">' + headline + '</p>' +
          '<p style="font-size:15px;line-height:1.6;margin:0">Hi ' + esc(firstName) + ',</p>' +
          '<p style="font-size:15px;line-height:1.6;margin:8px 0 0">' + opening + '</p>' +
          secHead('Reservation details') +
          line('Date', niceDate) +
          line('Time', data.reservation_time) +
          line('Party size', data.party_size) +
          line('Dietary restrictions', data.allergies) +
          (String(data.notes || '').trim() ? line('Notes', data.notes) : '') +
          secHead('Restaurant info') +
          '<p style="font-size:14px;line-height:1.55;margin:0">Da Cecot Food Inc<br>' + ADDR + '<br><a href="tel:+18258884218" style="color:#ad5217">+1 825-888-4218</a></p>' +
          secHead('Guest details') +
          line('Name', data.name) +
          line('Phone', data.phone) +
          line('Email', data.email) +
          '<p style="font-size:14px;line-height:1.6;color:#555;margin:20px 0 18px">Need to change or cancel? Just reply to this email or call us at (825) 888-4218. A presto!</p>' +
          '<p style="font-size:12px;color:#999;margin:0">da Cecot Food Inc · Whyte Avenue, Edmonton · dacecotfood.com</p>' +
        '</div>';
      custText = headline + '\n\nHi ' + firstName + ',\n' + opening + '\n\n' +
        'Reservation details:\nDate: ' + niceDate + '\nTime: ' + (data.reservation_time || '') + '\nParty size: ' + (data.party_size || '') + '\nDietary restrictions: ' + (data.allergies || '') +
        (String(data.notes || '').trim() ? '\nNotes: ' + data.notes : '') +
        '\n\nRestaurant info:\nDa Cecot Food Inc\n' + ADDR + '\n+1 825-888-4218' +
        '\n\nGuest details:\nName: ' + (data.name || '') + '\nPhone: ' + (data.phone || '') + '\nEmail: ' + (data.email || '') +
        '\n\nNeed to change or cancel? Reply to this email or call (825) 888-4218. A presto!';
    } else {
      custHtml =
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;max-width:560px;margin:0 auto">' +
          '<h2 style="font-family:Georgia,\'Times New Roman\',serif;color:#4a1e18;font-size:22px;margin:0 0 12px">da Cecot Food</h2>' +
          '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">' + intro + '</p>' +
          (detailRows ? '<table style="font-size:14px;line-height:1.5;border-collapse:collapse;margin:0 0 16px;background:#f9f7ef;border-radius:8px;padding:4px">' + detailRows + '</table>' : '') +
          payButton +
          '<p style="font-size:14px;line-height:1.6;color:#555;margin:0 0 18px">' + closing + '</p>' +
          '<p style="font-size:12px;color:#999;margin:0">da Cecot Food Inc · Whyte Avenue, Edmonton · dacecotfood.com</p>' +
        '</div>';
      custText = intro.replace(/&#39;/g, "'") + '\n\n' +
        detailKeys.filter((k) => String(data[k] == null ? '' : data[k]).trim() !== '')
          .map((k) => humanize(k) + ': ' + String(data[k]).replace(/\n/g, ' ')).join('\n') +
        payLine +
        '\n\n' + closing.replace(/&#39;/g, "'") + '\n\nda Cecot Food Inc · Whyte Avenue, Edmonton';
    }

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
