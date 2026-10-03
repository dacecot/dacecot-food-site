/* ============================================================
   da Cecot — tests for the "rest of today" pause and for guests cancelling
   their own table from the confirmation email.

   Both write client-visible records, so these drive the real handlers:
   api/send.js builds the email a guest receives, the link is pulled OUT of
   that email, and the cancel goes through the same endpoint the page calls.
   global.fetch is replaced before anything loads, so nothing is ever sent.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../.data');
const SETTINGS = path.join(DATA_DIR, 'settings.json');
const STORE = path.join(DATA_DIR, 'submissions.json');

let settingsSnap = null, storeSnap = null;
try { settingsSnap = fs.readFileSync(SETTINGS, 'utf8'); } catch (e) {}
try { storeSnap = fs.readFileSync(STORE, 'utf8'); } catch (e) {}
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(STORE, '[]');
try { fs.rmSync(SETTINGS, { force: true }); } catch (e) {}
function restore() {
  try {
    if (settingsSnap === null) fs.rmSync(SETTINGS, { force: true }); else fs.writeFileSync(SETTINGS, settingsSnap);
    if (storeSnap === null) fs.rmSync(STORE, { force: true }); else fs.writeFileSync(STORE, storeSnap);
  } catch (e) { /* best effort */ }
}

delete process.env.DATABASE_URL;   // local JSON backend
process.env.RESEND_API_KEY = 're_TEST_NEVER_SENT';
process.env.RESEND_FROM = 'da Cecot <test@local.invalid>';
process.env.RESEND_TO = 'store@local.invalid';
process.env.SESSION_SECRET = 'test-secret-not-real';

const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  sent.push(JSON.parse(opts.body));
  return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'test' }) };
};

const pause = require('../lib/orders/pause');
const store = require('../lib/orders/store');
const gc = require('../lib/orders/guest-cancel');
const handler = require('../api/send.js');

const failures = [];
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}
const iso = (ms) => new Date(ms).toISOString();
const H = 3600000;

async function post(payload) {
  const r = { _s: 0, _j: null };
  r.status = (c) => { r._s = c; return r; };
  r.json = (j) => { r._j = j; return r; };
  r.setHeader = () => {};
  await handler({ method: 'POST', headers: {}, body: payload }, r);
  return r;
}

// A table well in the future, on a Friday evening the default hours keep open.
const DAY = '2027-01-15';
const reservation = () => ({
  _subject: 'Table Reservation — da Cecot',
  reservation_date: DAY, reservation_time: '7:00 PM', party_size: '2 guests',
  name: 'Anna Rossi', phone: '780-555-0100', email: 'anna@example.invalid', allergies: 'None'
});
// 7:00 PM on Jan 15 in Edmonton (MST, UTC-7) = 02:00Z on Jan 16.
const STARTS = Date.parse('2027-01-16T02:00:00Z');

// The guest's email is the one addressed to the guest; pull the button's link out of it.
function guestLink() {
  const mail = sent.filter((m) => m.to && m.to[0] === 'anna@example.invalid').pop();
  assert.ok(mail, 'the guest got no confirmation email at all');
  const m = /href="([^"]*cancel-reservation\.html[^"]*)"/.exec(mail.html);
  if (!m) return null;
  const u = new URL(m[1].replace(/&amp;/g, '&'));
  return { r: u.searchParams.get('r'), t: u.searchParams.get('t'), mail };
}

async function run() {
  /* ---------------- rest-of-today pause ---------------- */

  await test('"rest of today" lifts at the next Edmonton midnight, not 24 hours on', async () => {
    const at = Date.parse('2026-10-02T23:00:00Z');                 // 5:00 PM in Edmonton (MDT)
    const st = await pause.pause('today', at);
    assert.strictEqual(st.until, '2026-10-03T06:00:00.000Z', 'midnight MDT is 06:00Z');
    assert.strictEqual(st.forToday, true, 'the guest notice keys off this');
    assert.strictEqual((await pause.status(Date.parse('2026-10-03T05:59:00Z'))).paused, true, 'still paused at 11:59 PM');
    assert.strictEqual((await pause.status(Date.parse('2026-10-03T06:00:00Z'))).paused, false, 'open again at midnight — tomorrow is not blacked out');
    await pause.resume();
  });

  await test('on the night the clocks go back, midnight is still midnight', async () => {
    // Nov 1 2026 ends daylight time; Nov 2's midnight is MST, 07:00Z.
    const st = await pause.pause('today', Date.parse('2026-11-01T22:00:00Z'));
    assert.strictEqual(st.until, '2026-11-02T07:00:00.000Z');
    await pause.resume();
  });

  await test('pressed at 11:30 PM it covers the last half hour, not all of tomorrow', async () => {
    const st = await pause.pause('today', Date.parse('2026-10-03T05:30:00Z'));
    assert.strictEqual(st.until, '2026-10-03T06:00:00.000Z');
    await pause.resume();
  });

  await test('a timed pause is not reported as "for today"', async () => {
    const st = await pause.pause(60, Date.parse('2026-10-02T23:00:00Z'));
    assert.strictEqual(st.forToday, false, 'a one-hour pause must keep saying "back around 7:00 PM"');
    await pause.resume();
  });

  await test('only the listed options are accepted', async () => {
    assert.strictEqual(pause.isOption('today'), true);
    for (const bad of ['tomorrow', '', null, undefined, 1440, '1440']) {
      assert.strictEqual(pause.isOption(bad), false, String(bad) + ' must be refused');
    }
    assert.ok(pause.OPTIONS.some((o) => o.minutes === 'today'), 'the admin buttons are built from OPTIONS');
  });

  /* ---------------- the cancel button in the email ---------------- */

  let link = null;
  await test('the confirmation email carries a working cancel button', async () => {
    sent.length = 0;
    const r = await post(reservation());
    assert.strictEqual(r._s, 200, 'booking must go through: ' + JSON.stringify(r._j));
    link = guestLink();
    assert.ok(link, 'no cancel link in the guest email');
    assert.ok(link.r && link.t, 'link must carry the booking and its signature');
    assert.ok(/Cancel my reservation/.test(link.mail.html), 'the button text');
    assert.ok(/cancel-reservation\.html\?r=/.test(link.mail.text), 'plain-text email gets the link too');
    const staff = sent.find((m) => m.to && m.to[0] === 'store@local.invalid');
    assert.ok(staff && !/cancel-reservation/.test(staff.html), 'the restaurant copy must not carry the guest\'s cancel link');
  });

  await test('opening the link cancels nothing (mail scanners open every link)', async () => {
    const r = await post({ action: 'cancel_lookup', r: link.r, t: link.t });
    assert.strictEqual(r._s, 200, JSON.stringify(r._j));
    assert.strictEqual(r._j.canCancel, true);
    assert.strictEqual(r._j.booking.time, '7:00 PM');
    assert.strictEqual(r._j.booking.phone, undefined, 'the page shows no contact details');
    const sub = await store.get(link.r);
    assert.ok(!sub.details.cancelled, 'a lookup must never cancel');
  });

  await test('a tampered or missing signature looks like no booking at all', async () => {
    const flipped = link.t.slice(0, -1) + (link.t.slice(-1) === 'A' ? 'B' : 'A');
    for (const body of [
      { action: 'cancel_confirm', r: link.r, t: flipped },
      { action: 'cancel_confirm', r: link.r, t: '' },
      { action: 'cancel_confirm', r: link.r },
      { action: 'cancel_lookup', r: 'no-such-id', t: gc.token('no-such-id') }
    ]) {
      const r = await post(body);
      assert.strictEqual(r._s, 404, JSON.stringify(body) + ' → ' + r._s);
    }
    assert.ok(!(await store.get(link.r)).details.cancelled, 'still booked');
  });

  await test('inside 24 hours the button refuses and the table stays booked', async () => {
    const out = await gc.handle({ action: 'cancel_confirm', r: link.r, t: link.t }, { now: STARTS - 24 * H + 60000 });
    assert.strictEqual(out.status, 409);
    assert.strictEqual(out.body.reason, 'too_late');
    assert.ok(!(await store.get(link.r)).details.cancelled);
  });

  await test('exactly 24 hours before is still allowed, and it cancels for real', async () => {
    sent.length = 0;
    const out = await gc.handle({ action: 'cancel_confirm', r: link.r, t: link.t }, { now: STARTS - 24 * H });
    assert.strictEqual(out.status, 200, JSON.stringify(out.body));
    const sub = await store.get(link.r);
    assert.strictEqual(sub.details.cancelled, true, 'the stored booking must be cancelled');
    assert.strictEqual(sub.details.cancelled_by, 'guest', 'the admin labels it "Cancelled by guest" from this');
    assert.strictEqual(sub.details.reservation_time, '7:00 PM', 'the rest of the booking is kept');

    const toGuest = sent.find((m) => m.to[0] === 'anna@example.invalid');
    const toStaff = sent.find((m) => m.to[0] === 'store@local.invalid');
    assert.ok(toGuest && /cancelled/i.test(toGuest.subject), 'the guest gets a receipt');
    assert.ok(toStaff && /Cancelled by guest/.test(toStaff.subject), 'Erika is told');
    assert.ok(/Anna Rossi/.test(toStaff.subject) && /7:00 PM/.test(toStaff.subject), 'who and when, in the subject: ' + toStaff.subject);
    assert.strictEqual(toStaff.reply_to, 'anna@example.invalid', 'she can reply straight to the guest');
  });

  await test('pressing it again says done, and sends nothing twice', async () => {
    sent.length = 0;
    const r = await post({ action: 'cancel_confirm', r: link.r, t: link.t });
    assert.strictEqual(r._s, 200);
    assert.strictEqual(r._j.already, true);
    assert.strictEqual(sent.length, 0, 'no second round of emails');
  });

  await test('a cancelled table frees itself everywhere it counts', async () => {
    const R = require('../lib/orders/reservations');
    const sub = await store.get(link.r);
    const onT1 = Object.assign({}, sub, { details: Object.assign({}, sub.details, { table_id: 't1' }) });
    const newcomer = { id: 'someone-else', details: { reservation_date: DAY, reservation_time: '7:00 PM', table_id: 't1' } };
    // Control: the same booking NOT cancelled does block the table — otherwise this proves nothing.
    const live = Object.assign({}, onT1, { details: Object.assign({}, onT1.details, { cancelled: false }) });
    assert.strictEqual(R.findConflicts(newcomer, 't1', [live], 90).length, 1, 'control: a live booking holds the table');
    assert.strictEqual(R.findConflicts(newcomer, 't1', [onT1], 90).length, 0, 'the guest-cancelled booking must not block it');
  });

  await test('the cutoff follows Edmonton time across the clock change', async () => {
    // 7:00 PM Nov 1 2026 is MST (UTC-7) → 02:00Z Nov 2. Daylight time ended that morning.
    const sub = { type: 'reservation', details: { reservation_date: '2026-11-01', reservation_time: '7:00 PM' } };
    assert.strictEqual(gc.startsAt(sub), Date.parse('2026-11-02T02:00:00Z'));
  });

  await test('the button only works on table reservations', async () => {
    const cls = await store.record({ type: 'class', name: 'Marco', email: 'm@example.invalid', details: { class_date: 'Sunday, January 17, 2027' } });
    const r = await post({ action: 'cancel_confirm', r: cls.id, t: gc.token(cls.id) });
    assert.strictEqual(r._s, 404, 'a class booking (paid through Square) is not this button\'s business');
    assert.ok(!(await store.get(cls.id)).details.cancelled);
  });

  await test('without a signing secret the email keeps only reply-or-call', async () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      sent.length = 0;
      const r = await post(reservation());
      assert.strictEqual(r._s, 200);
      assert.strictEqual(guestLink(), null, 'an unsigned link would be a link anyone could forge');
      const mail = sent.find((m) => m.to[0] === 'anna@example.invalid');
      assert.ok(/reply to this email or call us/i.test(mail.html), 'the guest still gets a way to cancel');
    } finally { process.env.SESSION_SECRET = saved; }
  });

  global.fetch = realFetch;
}

run().then(finish).catch((e) => {
  failures.push({ name: 'guest-cancel test harness', message: e && e.stack });
  finish();
});

function finish() {
  restore();
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
    process.exit(1);
  }
  console.log('✓ ' + passed + ' guest-cancel + day-pause tests passed');
}
