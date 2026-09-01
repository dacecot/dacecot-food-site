// /api/admin/reservations — the reservation book (auth required; mutations CSRF).
//   GET  ?view=today|week|upcoming|past|all
//        → { days:[{date,count,covers,reservations}], tables, view, today }
//   POST { action:'assign',   id, table_id|null, force? }   seat / unseat with conflict checks
//        { action:'add',      reservation:{name,phone,email,date,time,party,notes} }  manual (phone) booking — no email sent
//        { action:'import',   csv:'…' }                     Wix CSV migration — no emails sent
const auth = require('../../lib/cms/auth');
const store = require('../../lib/orders/store');
const tables = require('../../lib/orders/tables');
const R = require('../../lib/orders/reservations');

function clean(s, max) { return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, max || 120); }

function buildReservation(fields, source) {
  const dateISO = R.parseDate(fields.date);
  return {
    type: 'reservation',
    name: clean(fields.name, 80) || null,
    email: (clean(fields.email, 160).indexOf('@') > 0) ? clean(fields.email, 160) : null,
    phone: clean(fields.phone, 40) || null,
    amount_cents: null,
    currency: 'CAD',
    payment_status: 'none',
    payment_link_url: null,
    square_order_id: null, square_payment_id: null, paid_at: null, reminded_at: null,
    details: Object.assign(
      { reservation_date: dateISO || clean(fields.date, 40), reservation_time: clean(fields.time, 20), party_size: clean(fields.party, 20), source: source },
      clean(fields.notes, 400) ? { notes: clean(fields.notes, 400) } : {}
    ),
    subject: source === 'wix' ? 'Table Reservation (imported from Wix)' : 'Table Reservation (added by staff)'
  };
}

// Tiny CSV parser (quotes + commas). Returns array of objects keyed by header.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

// Map a Wix export row's varied column names onto our fields.
function pick(o, names) {
  for (const n of names) {
    for (const k of Object.keys(o)) {
      if (k.replace(/[^a-z]/g, '').indexOf(n) > -1 && o[k]) return o[k];
    }
  }
  return '';
}
function mapWixRow(o) {
  return {
    name: pick(o, ['guestname', 'fullname', 'name', 'firstname']) || [pick(o, ['firstname']), pick(o, ['lastname'])].filter(Boolean).join(' '),
    email: pick(o, ['email']),
    phone: pick(o, ['phone', 'mobile', 'tel']),
    date: pick(o, ['reservationdate', 'startdate', 'date']),
    time: pick(o, ['reservationtime', 'starttime', 'time']),
    party: pick(o, ['partysize', 'guests', 'people', 'covers', 'seats']),
    notes: pick(o, ['notes', 'comment', 'request', 'message'])
  };
}

const tablesHandler = require('../../lib/cms/handlers/tables');

module.exports = async (req, res) => {
  // ?sub=tables → the floor-plan tables sub-endpoint (kept in this function to
  // stay under Vercel Hobby's 12-function deployment cap).
  if (/(?:^|[?&])sub=tables(?:&|$)/.test((req.url || '').split('?')[1] || '')) return tablesHandler(req, res);

  if (req.method === 'GET') {
    if (!auth.requireAuth(req, res, false)) return;
    const qs = (req.url || '').split('?')[1] || '';
    const view = (/view=([a-z]+)/.exec(qs) || [])[1] || 'week';
    try {
      const all = await store.list({ type: 'reservation' });
      const pending = all.filter((s) => s.details && s.details.approval_status === 'pending' && !s.details.cancelled);
      // 'requests' view: only large parties awaiting Erika's approval.
      const source = view === 'requests' ? pending : all;
      const listForView = view === 'requests'
        ? R.forView(source, 'all')
        : R.forView(source, ['today', 'week', 'upcoming', 'past', 'all'].indexOf(view) > -1 ? view : 'week');
      return res.status(200).json({
        ok: true, view: view, today: R.todayISO(),
        days: R.groupByDay(listForView),
        totals: { all: all.length, upcoming: R.forView(all, 'upcoming').length, past: R.forView(all, 'past').length, requests: pending.length },
        tables: await tables.list()
      });
    } catch (e) { return res.status(502).json({ error: 'Could not load reservations: ' + (e && e.message || e) }); }
  }

  if (req.method === 'POST') {
    if (!auth.requireAuth(req, res, true)) return;
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const action = String(body.action || '');

    try {
      if (action === 'assign') {
        const id = String(body.id || '');
        const sub = await store.get(id);
        if (!sub) return res.status(404).json({ error: 'Reservation not found.' });
        const tableId = body.table_id ? String(body.table_id) : null;

        if (tableId) {
          const tbls = await tables.list();
          const table = tbls.filter((t) => t.id === tableId)[0];
          if (!table) return res.status(404).json({ error: 'Table not found.' });
          const party = parseInt(String(sub.details && sub.details.party_size || '').replace(/[^\d]/g, ''), 10) || 0;
          const warnings = [];
          if (party > table.seats) warnings.push('This party is ' + party + ' guests but ' + table.name + ' seats ' + table.seats + '.');
          const all = await store.list({ type: 'reservation' });
          const clashes = R.findConflicts(sub, tableId, all);
          if (clashes.length) warnings.push(table.name + ' already has ' + clashes.map((c) => (c.name || 'a booking') + (R.resTime(c) != null ? ' at ' + (c.details.reservation_time || '') : '')).join(', ') + ' that day.');
          if (warnings.length && !body.force) return res.status(409).json({ warning: warnings.join(' '), needsForce: true });
        }

        const details = Object.assign({}, sub.details);
        if (tableId) details.table_id = tableId; else delete details.table_id;
        const updated = await store.update(id, { details });
        return res.status(200).json({ ok: true, order: updated });
      }

      if (action === 'approve' || action === 'decline') {
        const mailer = require('../../lib/orders/mailer');
        const id = String(body.id || '');
        const sub = await store.get(id);
        if (!sub) return res.status(404).json({ error: 'Request not found.' });
        if (!(sub.details && sub.details.approval_status === 'pending')) return res.status(400).json({ error: 'This reservation isn’t awaiting approval.' });
        const details = Object.assign({}, sub.details);
        let emailed = null;
        if (action === 'approve') {
          details.approval_status = 'approved';
          details.approved_at = new Date().toISOString();
          const updated = await store.update(id, { details });
          if (sub.email) { const r2 = await mailer.sendApproved(updated); emailed = r2 && r2.ok ? 'confirmation email sent' : 'confirmation email failed'; }
          return res.status(200).json({ ok: true, order: updated, emailed });
        }
        details.approval_status = 'declined';
        details.cancelled = true;
        details.declined_at = new Date().toISOString();
        const updated = await store.update(id, { details });
        if (sub.email) { const r2 = await mailer.sendDeclined(updated); emailed = r2 && r2.ok ? 'decline email sent' : 'decline email failed'; }
        return res.status(200).json({ ok: true, order: updated, emailed });
      }

      if (action === 'add') {
        const f = (body.reservation && typeof body.reservation === 'object') ? body.reservation : {};
        if (!clean(f.name, 80)) return res.status(400).json({ error: 'Please enter the guest name.' });
        if (!clean(f.phone, 40)) return res.status(400).json({ error: 'Please enter the guest phone number.' });
        if (!R.parseDate(f.date)) return res.status(400).json({ error: 'Please enter a valid date.' });
        const rec = await store.record(buildReservation(f, 'staff'));
        return res.status(200).json({ ok: true, order: rec });
      }

      if (action === 'import') {
        const wix = require('../../lib/orders/wix-import');
        const summary = await wix.importCsv(body.csv, { store: store, tables: tables });
        if (!summary.ok) return res.status(400).json({ error: summary.error });
        return res.status(200).json(summary);
      }

      return res.status(400).json({ error: "Unknown action. Use 'assign', 'add' or 'import'." });
    } catch (e) {
      return res.status(502).json({ error: 'Reservation update failed: ' + (e && e.message || e) });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
