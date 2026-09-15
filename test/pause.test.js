/* ============================================================
   da Cecot — tests for pausing online reservations.

   The pause is a timer Erika sets mid-service, so the two things that can
   really hurt are (a) it does not actually stop a booking and (b) it does not
   let go when the timer runs out and the Reserve page stays dark all evening.
   Both are pinned down here, along with the blast radius: a pause must stop
   TABLE bookings and nothing else.

   Time is injected rather than waited for — a test that sleeps for 30 minutes
   is a test nobody runs.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../.data');
const SETTINGS = path.join(DATA_DIR, 'settings.json');
const STORE = path.join(DATA_DIR, 'submissions.json');

// Run against an empty store and put whatever was there back afterwards.
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
const pause = require('../lib/orders/pause');
const store = require('../lib/orders/store');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}

const T0 = Date.parse('2026-09-15T18:00:00-06:00');   // 6:00 PM in Edmonton
const mins = (n) => T0 + n * 60000;

async function run() {

  /* ---- the timer itself ---- */

  await test('nothing stored means nothing is paused', async () => {
    await pause.resume(T0);
    const s = await pause.status(T0);
    assert.strictEqual(s.paused, false);
    assert.strictEqual(s.until, null);
    assert.strictEqual(s.minutesLeft, 0);
  });

  await test('every offered duration pauses for exactly that long', async () => {
    // The five buttons Erika sees. If one of them silently did nothing, the
    // Reserve page would keep taking bookings while the card said "paused".
    for (const o of pause.OPTIONS) {
      const s = await pause.pause(o.minutes, T0);
      assert.strictEqual(s.paused, true, o.label + ' did not pause');
      assert.strictEqual(Date.parse(s.until), mins(o.minutes), o.label + ' ended at the wrong time');
      assert.strictEqual(s.minutesLeft, o.minutes, o.label + ' reported the wrong time left');
    }
    assert.deepStrictEqual(pause.OPTIONS.map((o) => o.minutes), [30, 60, 120, 180, 240],
      'the offered durations changed — the admin buttons and this list must agree');
  });

  await test('the pause lets go on its own when the timer runs out', async () => {
    // The failure that would keep the Reserve page dark all night. Nothing runs
    // on a schedule to clear it, so this has to hold by being read.
    await pause.pause(30, T0);
    assert.strictEqual((await pause.status(mins(29))).paused, true, 'still paused a minute before');
    assert.strictEqual((await pause.status(mins(30))).paused, false, 'must be open the moment it expires');
    assert.strictEqual((await pause.status(mins(600))).paused, false, 'ten hours later, still open');
  });

  await test('minutes left counts down and never reads zero while paused', async () => {
    await pause.pause(60, T0);
    assert.strictEqual((await pause.status(mins(0))).minutesLeft, 60);
    assert.strictEqual((await pause.status(mins(30))).minutesLeft, 30);
    // A pause with 10 seconds left is still a pause — rounding it to 0 would
    // print "about 0 more minutes" to Erika.
    assert.strictEqual((await pause.status(mins(59.9))).minutesLeft, 1);
  });

  await test('Resume now lifts it immediately', async () => {
    await pause.pause(240, T0);
    const s = await pause.resume(T0);
    assert.strictEqual(s.paused, false);
    assert.strictEqual(await store.getSetting(pause.KEY), null, 'resume should clear the row, not park a stale date in it');
  });

  await test('pressing a shorter duration shortens a running pause', async () => {
    // Deliberate: the buttons are always measured from now, so she can cut a
    // 4-hour pause short without having to resume first.
    await pause.pause(240, T0);
    const s = await pause.pause(30, mins(20));
    assert.strictEqual(Date.parse(s.until), mins(50), 'the new, shorter timer should win');
  });

  await test('a length that is not one of the buttons is refused', async () => {
    await pause.resume(T0);
    for (const bad of [45, 0, -30, 1440, 100000, 'abc', null, undefined, '60; DROP TABLE']) {
      let threw = null;
      try { await pause.pause(bad, T0); } catch (e) { threw = e; }
      assert.ok(threw, 'accepted an unsupported duration: ' + String(bad));
      assert.strictEqual(threw.status, 400, 'should be a 400 for ' + String(bad));
    }
    assert.strictEqual((await pause.status(T0)).paused, false, 'a refused request must not have paused anything');
  });

  await test("'60' as a string is still 60 minutes", async () => {
    // The admin posts JSON; a stringified number must not be read as garbage.
    const s = await pause.pause('60', T0);
    assert.strictEqual(Date.parse(s.until), mins(60));
    await pause.resume(T0);
  });

  await test('a corrupt stored value reads as open, not paused', async () => {
    // Fail open. A junk row must never lock the Reserve page.
    await store.setSetting(pause.KEY, 'not a date at all');
    assert.strictEqual((await pause.status(T0)).paused, false);
    await pause.resume(T0);
  });

  /* ---- api/send.js — the half that actually turns a booking away ---- */

  process.env.RESEND_API_KEY = 're_TEST_NEVER_SENT';
  process.env.RESEND_FROM = 'da Cecot <test@local.invalid>';
  process.env.RESEND_TO = 'store@local.invalid';

  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({ id: 'test' }) });

  const handler = require('../api/send.js');
  const post = async (payload) => {
    const r = { _s: 0, _j: null };
    r.status = (c) => { r._s = c; return r; };
    r.json = (j) => { r._j = j; return r; };
    r.setHeader = () => {};
    await handler({ method: 'POST', headers: {}, body: payload }, r);
    return r;
  };

  // A date that is open and in the future, so nothing else in send.js objects.
  const OPEN_DATE = '2027-01-07';
  const reservation = () => ({
    _subject: 'Table Reservation — da Cecot',
    reservation_date: OPEN_DATE, reservation_time: '6:30 PM', party_size: '2 guests',
    name: 'Anna Rossi', phone: '780-555-0100', email: 'anna@example.invalid', allergies: 'None'
  });
  const pickup = () => ({
    _subject: 'Pasta Shop Order: Ravioli', item: 'Ravioli', quantity: '2',
    pickup_day: OPEN_DATE, pickup_time: '1:00 PM',
    name: 'Anna Rossi', phone: '780-555-0100', email: 'anna@example.invalid'
  });

  await test('a table booking is refused while reservations are paused', async () => {
    await pause.pause(60);                      // real clock: paused for the next hour
    const r = await post(reservation());
    assert.strictEqual(r._s, 409, 'the server must turn the booking away');
    assert.ok(/paused/i.test(r._j.error), 'the guest should be told it is paused: ' + r._j.error);
    assert.ok(/call/i.test(r._j.error), 'and pointed at the phone: ' + r._j.error);
  });

  await test('a pasta-shop pickup is NOT affected by the reservation pause', async () => {
    // Blast radius. Pausing the dining room must not stop the shop selling pasta.
    const r = await post(pickup());
    assert.strictEqual(r._s, 200, 'pickups should still go through: ' + JSON.stringify(r._j));
  });

  await test('a table booking goes through again once the pause is lifted', async () => {
    // The control: proves the 409 above came from the pause and nothing else.
    await pause.resume();
    const r = await post(reservation());
    assert.strictEqual(r._s, 200, 'an unpaused booking must be accepted: ' + JSON.stringify(r._j));
  });

  await test('an expired pause does not refuse anything', async () => {
    // Park an already-past deadline directly — the same shape a finished pause
    // leaves behind if nothing clears the row.
    await store.setSetting(pause.KEY, new Date(Date.now() - 60000).toISOString());
    const r = await post(reservation());
    assert.strictEqual(r._s, 200, 'a finished pause must not keep blocking: ' + JSON.stringify(r._j));
    await pause.resume();
  });

  /* ---- api/status.js — how the Reserve page finds out ---- */

  const statusHandler = require('../api/status.js');
  const getStatus = async () => {
    const r = { _s: 0, _j: null };
    r.status = (c) => { r._s = c; return r; };
    r.json = (j) => { r._j = j; return r; };
    r.setHeader = () => {};
    await statusHandler({ method: 'GET', headers: {} }, r);
    return r;
  };

  await test('/api/status reports an open site as open', async () => {
    await pause.resume();
    const r = await getStatus();
    assert.strictEqual(r._s, 200);
    assert.strictEqual(r._j.reservations.paused, false);
  });

  await test('/api/status reports a pause, with a time a guest can read', async () => {
    await pause.pause(120);
    const r = await getStatus();
    assert.strictEqual(r._j.reservations.paused, true);
    assert.ok(r._j.reservations.until, 'the page needs the deadline');
    const label = String(r._j.reservations.untilLabel).trim();
    assert.ok(/^\d{1,2}:\d{2}\s?[AP]M$/.test(label),
      'untilLabel should read like the rest of the site ("7:30 PM"), got: ' + label);
    // The page prints it mid-sentence, so a trailing "." renders as "p.m..".
    assert.ok(!label.endsWith('.'), 'the clock label must not end in a full stop: ' + label);
    await pause.resume();
  });

  await test('/api/status leaks nothing but the switches', async () => {
    // It is public and uncredentialed — no guest names, no booking counts.
    await pause.pause(30);
    const r = await getStatus();
    assert.deepStrictEqual(Object.keys(r._j), ['reservations']);
    assert.deepStrictEqual(Object.keys(r._j.reservations).sort(), ['minutesLeft', 'paused', 'until', 'untilLabel']);
    await pause.resume();
  });

  await test('/api/status refuses anything but GET', async () => {
    const r = { _s: 0, _j: null, _h: {} };
    r.status = (c) => { r._s = c; return r; };
    r.json = (j) => { r._j = j; return r; };
    r.setHeader = (k, v) => { r._h[k] = v; };
    await statusHandler({ method: 'POST', headers: {}, body: {} }, r);
    assert.strictEqual(r._s, 405);
  });

  /* ---- api/admin/reservations.js — the buttons Erika actually presses ---- */

  const auth = require('../lib/cms/auth');
  const realRequireAuth = auth.requireAuth;
  auth.requireAuth = () => ({ email: 'test@local.invalid' });   // signed in, CSRF ok
  const adminHandler = require('../api/admin/reservations.js');
  const admin = async (method, url, body) => {
    const r = { _s: 0, _j: null };
    r.status = (c) => { r._s = c; return r; };
    r.json = (j) => { r._j = j; return r; };
    r.setHeader = () => {};
    await adminHandler({ method, url, headers: {}, body }, r);
    return r;
  };

  await test('the admin can pause and resume through the real handler', async () => {
    const p = await admin('POST', '/api/admin/reservations', { action: 'pause', minutes: 120 });
    assert.strictEqual(p._s, 200, JSON.stringify(p._j));
    assert.strictEqual(p._j.pause.paused, true);
    assert.ok(p._j.options && p._j.options.length, 'the reply must carry the buttons so the card can redraw');

    const back = await admin('POST', '/api/admin/reservations', { action: 'resume' });
    assert.strictEqual(back._s, 200);
    assert.strictEqual(back._j.pause.paused, false);
  });

  await test('the admin refuses a duration that is not on the card', async () => {
    const r = await admin('POST', '/api/admin/reservations', { action: 'pause', minutes: 999 });
    assert.strictEqual(r._s, 400, JSON.stringify(r._j));
    assert.strictEqual((await pause.status()).paused, false, 'a refused request must not have paused anything');
  });

  await test('?pause=1 answers cheaply, without touching the booking list', async () => {
    await pause.pause(30);
    const r = await admin('GET', '/api/admin/reservations?pause=1');
    assert.strictEqual(r._s, 200);
    assert.strictEqual(r._j.pause.paused, true);
    assert.ok(r._j.options.length, 'the card builds its buttons from this');
    assert.strictEqual(r._j.days, undefined, 'the cheap call should not be loading the whole book');
    await pause.resume();
  });

  auth.requireAuth = realRequireAuth;
  global.fetch = realFetch;
}

run().then(finish).catch((e) => {
  failures.push({ name: 'pause test harness', message: e && e.message });
  finish();
});

function finish() {
  restore();
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
    process.exit(1);
  }
  console.log('✓ ' + passed + ' pause tests passed');
}
