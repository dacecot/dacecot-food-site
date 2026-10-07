/* ============================================================
   da Cecot — tests for "Days with no online reservations".

   The restaurant is open, the online book is shut: a buyout, a private event.
   What separates this from a closure is everything it must NOT do — refuse a
   pasta-shop pickup, or put up a "closed" banner. So every refusal here is
   paired with the thing that must still go through, or a guard that refused
   everything would pass.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const hours = require('../lib/cms/hours');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}

const fakeContent = (lists) => ({ list: (key) => lists[key] || [] });

/* ---------------------------------------------------------------
   lib/cms/hours.js — reading the list
   --------------------------------------------------------------- */

test('no-reservation days are normalised to ISO, reasons and all', () => {
  const c = fakeContent({ noReservationDates: ['2026-10-24 | private event', 'Saturday, October 24, 2026', '10/31/2026', 'someday'] });
  assert.deepStrictEqual(hours.noReservationDates(c), ['2026-10-24', '2026-10-31']);
  assert.deepStrictEqual(hours.noReservationReasons(c), { '2026-10-24': 'private event' });
  assert.strictEqual(hours.noReservationReason(c, 'Saturday, October 24, 2026'), 'private event');
  assert.strictEqual(hours.noReservationReason(c, '2026-10-31'), '');
});

test('isNoReservationOn matches the day in any format, and nothing else', () => {
  const c = fakeContent({ noReservationDates: ['2026-10-24'] });
  assert.ok(hours.isNoReservationOn(c, '2026-10-24'));
  assert.ok(hours.isNoReservationOn(c, 'Saturday, October 24, 2026'));
  assert.ok(!hours.isNoReservationOn(c, '2026-10-25'), 'the next day is bookable');
  assert.ok(!hours.isNoReservationOn(c, ''));
});

test('the two lists stay apart — a no-reservation day is not a closure', () => {
  const c = fakeContent({ noReservationDates: ['2026-10-24'], closedDates: ['2026-12-25'] });
  assert.deepStrictEqual(hours.closedDates(c), ['2026-12-25'],
    'a private event leaked into the closures, which would block pickups and raise the banner');
  assert.ok(!hours.isClosedOn(c, '2026-10-24'));
  assert.ok(!hours.isNoReservationOn(c, '2026-12-25'));
});

test('the CMS offers the field, so Erika can actually set it', () => {
  const { fieldsByKey } = require('../lib/cms/schema');
  const f = fieldsByKey.noReservationDates;
  assert.ok(f, 'no "noReservationDates" field in the site manager schema');
  assert.strictEqual(f.type, 'list');
});

/* ---------------------------------------------------------------
   api/send.js — the half that counts
   --------------------------------------------------------------- */

const NO_RES = '2027-01-09';   // stubbed no-reservation day (a Saturday)
const CLOSED = '2027-01-06';   // stubbed closure, to check precedence
const OPEN = '2027-01-08';     // control

async function serverTests() {
  const STORE = path.join(__dirname, '../.data/submissions.json');
  let snapshot = null;
  try { snapshot = fs.readFileSync(STORE, 'utf8'); } catch (e) { /* no store yet */ }
  try { fs.mkdirSync(path.dirname(STORE), { recursive: true }); fs.writeFileSync(STORE, '[]'); } catch (e) {}

  const content = require('../lib/cms/content');
  const realList = content.list;
  content.list = (key) => {
    if (key === 'noReservationDates') return [NO_RES + ' | private event', CLOSED];
    if (key === 'closedDates') return [CLOSED];
    return realList(key);
  };

  process.env.RESEND_API_KEY = 're_TEST_NEVER_SENT';
  process.env.RESEND_FROM = 'da Cecot <test@local.invalid>';
  process.env.RESEND_TO = 'store@local.invalid';
  delete process.env.DATABASE_URL;

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
  const reservation = (date) => ({
    _subject: 'Table Reservation — da Cecot',
    reservation_date: date, reservation_time: '6:30 PM', party_size: '2 guests',
    name: 'Anna Rossi', phone: '780-555-0100', email: 'anna@example.invalid', allergies: 'None'
  });
  const pickup = (day) => ({
    _subject: 'Pasta Shop Order: Ravioli', item: 'Ravioli', quantity: '2',
    pickup_day: day, pickup_time: '1:00 PM',
    name: 'Anna Rossi', phone: '780-555-0100', email: 'anna@example.invalid'
  });
  const check = async (name, fn) => {
    try { await fn(); passed++; }
    catch (e) { failures.push({ name, message: e && e.message }); }
  };

  await check('a table reservation on a no-reservation day is refused by the server', async () => {
    const r = await post(reservation(NO_RES));
    assert.strictEqual(r._s, 409, 'the server must refuse it even though the page already should have');
    assert.ok(/not taking online reservations/i.test(r._j.error), r._j.error);
    assert.ok(/January 9/.test(r._j.error), 'and which day: ' + r._j.error);
    assert.ok(/private event/.test(r._j.error), 'and the reason Erika gave: ' + r._j.error);
    assert.ok(!/closed/i.test(r._j.error), 'we are open that day — the refusal must not say closed: ' + r._j.error);
  });

  await check('the long date form is refused as readily as the ISO one', async () => {
    const r = await post(reservation('Saturday, January 9, 2027'));
    assert.strictEqual(r._s, 409);
  });

  await check('a pasta-shop pickup on a no-reservation day still goes through', async () => {
    const r = await post(pickup(NO_RES));
    assert.strictEqual(r._s, 200, 'the doors are open — pickups must run: ' + JSON.stringify(r._j));
  });

  await check('a table reservation on an open day still goes through', async () => {
    const r = await post(reservation(OPEN));
    assert.strictEqual(r._s, 200, 'an ordinary day must still be bookable: ' + JSON.stringify(r._j));
  });

  await check('a day on both lists is reported as a closure', async () => {
    const r = await post(reservation(CLOSED));
    assert.strictEqual(r._s, 409);
    assert.ok(/closed/i.test(r._j.error), 'a shut door is the truer story: ' + r._j.error);
  });

  content.list = realList;
  global.fetch = realFetch;
  try {
    if (snapshot === null) fs.rmSync(STORE, { force: true });
    else fs.writeFileSync(STORE, snapshot);
  } catch (e) { /* best effort */ }
}

serverTests().then(finish).catch((e) => {
  failures.push({ name: 'no-reservation server harness', message: e && e.message });
  finish();
});

function finish() {
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
    process.exit(1);
  }
  console.log('✓ ' + passed + ' no-reservation-day tests passed');
}
