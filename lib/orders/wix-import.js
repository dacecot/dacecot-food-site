/* ============================================================
   da Cecot — Wix "Table Reservations" CSV import.
   Understands the real Wix export shape:
     Time ("Feb 26, 2026, 4:00:00 p.m." — date AND time), Team note, Name,
     Party size, Table name ("1", "9", "1+2" joins), Status (RESERVED/SEATED/
     FINISHED/CANCELED/NO-SHOW), Source, Creation date (IGNORED — booking
     creation, not the reservation), Phone number, Email, Dietary Restrictions.
   Behaviour:
     - Only rows on/after `cutoff` (2026-08-01) are imported.
     - CANCELED / NO-SHOW arrive flagged cancelled (history preserved).
     - Single-number Wix tables are auto-created on the floor plan (named
       "Table N", seats = biggest party seen there, arranged in a grid) and
       the reservations are seated at them. Joined tables ("1+2") keep the
       combo as a note and seat at the first table of the join.
     - Guests are NEVER emailed by an import.
   ============================================================ */
const R = require('./reservations');

const CUTOFF_DEFAULT = '2026-08-01';

// CSV → array of row objects keyed by cleaned lower-case header.
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
  const headers = rows[0].map((h) => h.replace(/﻿/g, '').trim().toLowerCase().replace(/[^a-z]/g, ''));
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((hh, i) => { o[hh] = (r[i] || '').trim(); });
    return o;
  });
}

// "Feb 26, 2026, 4:00:00 p.m." → "4:00 PM" (or '').
function timeFromDatetime(s) {
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s*\.?m/i.exec(String(s || ''));
  if (!m) return '';
  return m[1] + ':' + m[2] + ' ' + m[3].toUpperCase() + 'M';
}

// One Wix row → our field bundle (exact columns; 'creationdate' deliberately ignored).
function mapRow(o) {
  const dt = o.time || o.reservationdate || o.startdate || '';
  const status = String(o.status || '').toUpperCase();
  const notesBits = [];
  if (o.dietaryrestrictions && !/^non?e?$/i.test(o.dietaryrestrictions)) notesBits.push('Dietary: ' + o.dietaryrestrictions);
  if (o.teamnote) notesBits.push(o.teamnote);
  return {
    name: o.name || '',
    email: o.email || '',
    phone: o.phonenumber || o.phone || '',
    dateISO: R.parseDate(dt),
    time: timeFromDatetime(dt) || (o.reservationtime || o.starttime || ''),
    party: o.partysize ? o.partysize + ' guests' : '',
    wixTable: o.tablename || '',
    cancelled: status.indexOf('CANCEL') > -1 || status.indexOf('NO-SHOW') > -1 || status.indexOf('NO_SHOW') > -1,
    status: status,
    notes: notesBits.join(' · ')
  };
}

function clean(s, max) { return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, max || 120); }

/* Import a CSV. deps = { store, tables } (the adapters). Returns a summary. */
async function importCsv(csvText, deps, opts) {
  const store = deps.store, tablesLib = deps.tables;
  const cutoff = (opts && opts.cutoff) || CUTOFF_DEFAULT;
  const rows = parseCsv(csvText);
  if (!rows.length) return { ok: false, error: 'No rows found — paste the CSV including its header line.' };

  const mapped = rows.map(mapRow);
  const keep = [];
  let skipped = 0, tooOld = 0;
  const errors = [];
  for (const f of mapped) {
    if (!f.name && !f.email && !f.phone) { skipped++; continue; }
    if (!f.dateISO) { skipped++; errors.push((f.name || 'row') + ': unreadable date'); continue; }
    if (f.dateISO < cutoff) { tooOld++; continue; }
    keep.push(f);
  }

  // Auto-create floor-plan tables for single-number Wix table names.
  const existing = await tablesLib.list();
  const byName = {};
  existing.forEach((t) => { byName[String(t.name).toLowerCase()] = t; });
  const wanted = {};
  keep.forEach((f) => {
    const first = String(f.wixTable || '').split('+')[0].trim();
    if (/^\d{1,3}$/.test(first)) {
      const key = 'table ' + first;
      const party = parseInt(String(f.party).replace(/[^\d]/g, ''), 10) || 0;
      if (!wanted[key]) wanted[key] = { num: +first, maxParty: 0 };
      wanted[key].maxParty = Math.max(wanted[key].maxParty, party);
    }
  });
  let tablesCreated = 0;
  const names = Object.keys(wanted).sort((a, b) => wanted[a].num - wanted[b].num);
  for (let i = 0; i < names.length; i++) {
    const key = names[i];
    if (byName[key]) continue;
    const col = i % 4, rowI = Math.floor(i / 4);
    const t = await tablesLib.create({
      name: 'Table ' + wanted[key].num,
      seats: Math.min(12, Math.max(2, wanted[key].maxParty || 2)),
      shape: 'round',
      x: 15 + col * 23,
      y: 20 + rowI * 26
    });
    byName[key] = t;
    tablesCreated++;
  }

  // Record the reservations.
  let imported = 0;
  for (const f of keep) {
    const details = {
      reservation_date: f.dateISO,
      reservation_time: clean(f.time, 20),
      party_size: clean(f.party, 20),
      source: 'wix'
    };
    if (f.notes) details.notes = clean(f.notes, 400);
    if (f.wixTable) details.wix_table = clean(f.wixTable, 20);
    if (f.cancelled) { details.cancelled = true; details.wix_status = f.status; }
    const first = String(f.wixTable || '').split('+')[0].trim();
    if (/^\d{1,3}$/.test(first) && byName['table ' + first]) details.table_id = byName['table ' + first].id;

    await store.record({
      type: 'reservation',
      name: clean(f.name, 80) || null,
      email: (clean(f.email, 160).indexOf('@') > 0) ? clean(f.email, 160) : null,
      phone: clean(f.phone, 40) || null,
      amount_cents: null, currency: 'CAD',
      payment_status: 'none', payment_link_url: null,
      square_order_id: null, square_payment_id: null, paid_at: null, reminded_at: null,
      details: details,
      subject: 'Table Reservation (imported from Wix)'
    });
    imported++;
  }

  return { ok: true, imported, skipped, tooOld, tablesCreated, errors: errors.slice(0, 8) };
}

module.exports = { importCsv, parseCsv, mapRow, timeFromDatetime, CUTOFF_DEFAULT };
