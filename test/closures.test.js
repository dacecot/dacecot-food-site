/* ============================================================
   da Cecot — tests for one-off closures ("we are closed today").

   A closure has to hold in two independent places: the pickers embed the list
   at BUILD time, and api/send.js re-checks it at SUBMIT time. Blocking only in
   the browser is not blocking — a tab left open overnight, or a plain POST,
   walks straight past it. These tests are what stop the server half from
   quietly rotting while the page still looks right.

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

// A stand-in for the CMS content loader — only .list is used by the closure code.
const fakeContent = (dates) => ({ list: (key) => (key === 'closedDates' ? dates : []) });

/* ---------------------------------------------------------------
   lib/cms/hours.js — reading the list
   --------------------------------------------------------------- */

test('closure dates are normalised to ISO, whatever Erika types', () => {
  const c = fakeContent(['2026-09-15', 'Monday, September 15, 2026', 'September 16, 2026', '09/17/2026']);
  assert.deepStrictEqual(hours.closedDates(c), ['2026-09-15', '2026-09-16', '2026-09-17'],
    'the same day written two ways must collapse to one entry');
});

test('unreadable lines are dropped, not guessed at', () => {
  assert.deepStrictEqual(hours.closedDates(fakeContent(['', 'next tuesday-ish', '2026-09-15'])), ['2026-09-15']);
  assert.deepStrictEqual(hours.closedDates(fakeContent([])), []);
});

test('isClosedOn matches the day in any format, and nothing else', () => {
  const c = fakeContent(['2026-09-15']);
  assert.ok(hours.isClosedOn(c, '2026-09-15'));
  assert.ok(hours.isClosedOn(c, 'Monday, September 15, 2026'), 'the long form names the same day');
  assert.ok(hours.isClosedOn(c, '09/15/2026'));
  assert.ok(!hours.isClosedOn(c, '2026-09-16'), 'the next day is open');
  assert.ok(!hours.isClosedOn(c, '2026-09-14'));
  assert.ok(!hours.isClosedOn(c, ''), 'an empty date closes nothing');
  assert.ok(!hours.isClosedOn(c, 'whenever'));
  assert.ok(!hours.isClosedOn(fakeContent([]), '2026-09-15'), 'no closures means nothing is closed');
});

test('a closure line can carry its reason, and the date still parses', () => {
  const c = fakeContent(['2026-09-21 | deep cleaning', '2026-10-05 — family day', '2026-11-01 - staff training', '2026-12-25']);
  assert.deepStrictEqual(hours.closedDates(c), ['2026-09-21', '2026-10-05', '2026-11-01', '2026-12-25'],
    'a reason on the line must not cost us the closure itself');
  assert.deepStrictEqual(hours.closureReasons(c), {
    '2026-09-21': 'deep cleaning',
    '2026-10-05': 'family day',
    '2026-11-01': 'staff training'
  }, 'a pipe and a spaced dash both separate a date from its reason');
  assert.strictEqual(hours.closureReason(c, 'Monday, September 21, 2026'), 'deep cleaning',
    'the reason must be findable by the same day written any other way');
  assert.strictEqual(hours.closureReason(c, '2026-12-25'), '', 'a bare date has no reason to report');
  assert.ok(hours.isClosedOn(c, '2026-09-21'), 'a line with a reason still shuts the day');
});

test('a reason belongs to its own day and cannot bleed onto another', () => {
  // The whole point of writing the reason on the date line: "deep cleaning"
  // must not survive into the next closure, which is exactly what a single
  // "closure reason" setting would do.
  const c = fakeContent(['2026-09-21 | deep cleaning', '2026-12-25']);
  assert.strictEqual(hours.closureReason(c, '2026-12-25'), '',
    'Christmas inherited the reason from a September closure');
});

test('a reason too long for the banner is dropped, not shown cut in half', () => {
  const long = 'x'.repeat(200);
  const c = fakeContent(['2026-09-21 | ' + long]);
  assert.deepStrictEqual(hours.closedDates(c), ['2026-09-21'], 'the day is still closed');
  assert.strictEqual(hours.closureReason(c, '2026-09-21'), '');
});

test('splitClosure leaves a plain date exactly as it found it', () => {
  ['2026-09-15', 'Monday, September 15, 2026', '09/15/2026'].forEach((d) => {
    assert.deepStrictEqual(hours.splitClosure(d), { date: d, reason: '' },
      d + ' was mangled by the reason parser');
  });
});

test('closureLabel reads like a date a guest would recognise', () => {
  assert.strictEqual(hours.closureLabel('2026-09-15'), 'Tuesday, September 15');
  assert.strictEqual(hours.closureLabel('2026-12-25'), 'Friday, December 25');
});

test('a weekly closed day is NOT a one-off closure', () => {
  // hoursWed:'closed' shuts every Wednesday; that is a different mechanism and
  // must not leak into the dated list, or "closed today" would close forever.
  const c = { list: () => [], get: (k) => (k === 'hoursWed' ? 'closed' : '12:00-15:00') };
  assert.deepStrictEqual(hours.closedDates(c), []);
  assert.strictEqual(hours.parseDay('closed').length, 0, 'the weekly value still parses as closed');
});

/* ---------------------------------------------------------------
   js/main.js — the clock the banner comes down by

   The banner must clear at midnight in EDMONTON, on a page that has been open
   since the day before. Both halves of that are easy to get wrong and
   impossible to notice: a UTC "today" takes the notice down six hours early,
   and a helper that quietly went missing would leave a page open overnight
   still saying "closed today" over breakfast.

   There is no DOM here, so the two pure functions are lifted out of the
   shipped file and run as themselves. Reading the real js/main.js is the
   point: a test against a copy of this logic would pass forever after someone
   deleted the original.
   --------------------------------------------------------------- */

const MAIN = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');

function lift(name) {
  const re = new RegExp('function ' + name + '\\(\\) \\{[\\s\\S]*?\\n      \\}');
  const src = re.exec(MAIN);
  assert.ok(src, name + '() is gone from js/main.js — the banner has no clock');
  return new Function('return (' + src[0] + ')')();
}

// Stand the clock at a chosen instant, in UTC, and run fn.
function at(utcIso, fn) {
  const Real = Date;
  const fixed = Real.parse(utcIso);
  function Fake(...args) {
    return args.length ? new Real(...args) : new Real(fixed);
  }
  Fake.prototype = Real.prototype;
  Fake.now = () => fixed;
  Fake.parse = Real.parse;
  Fake.UTC = Real.UTC;
  global.Date = Fake;
  try { return fn(); } finally { global.Date = Real; }
}

test('"today" is the restaurant\'s day, not UTC\'s', () => {
  const edmontonToday = lift('edmontonToday');
  // 11:30 PM Monday in Edmonton is already Tuesday in UTC. The banner has to
  // still be up: the doors are shut for another half hour.
  assert.strictEqual(at('2026-09-22T05:30:00Z', edmontonToday), '2026-09-21',
    'a UTC today would have taken the notice down six hours early');
  // One minute past midnight, Edmonton: a new day, banner gone.
  assert.strictEqual(at('2026-09-22T06:01:00Z', edmontonToday), '2026-09-22');
});

test('the re-check lands on midnight in Edmonton, not a minute after', () => {
  const msToMidnight = lift('msToEdmontonMidnight');
  const mins = (ms) => Math.round(ms / 60000);

  // 11:59 PM Monday (MDT, UTC-6) — one minute of closure left.
  assert.strictEqual(mins(at('2026-09-22T05:59:00Z', msToMidnight)), 1);
  // Midnight itself — a full day ahead.
  assert.strictEqual(mins(at('2026-09-22T06:00:00Z', msToMidnight)), 24 * 60);
  // Mid-afternoon: the tick caps at a minute anyway, but the number it works
  // from has to be right or the final approach never converges.
  assert.strictEqual(mins(at('2026-09-21T21:00:00Z', msToMidnight)), 9 * 60);

  // Standard time (UTC-7 in January) — read off the wall clock, so no case.
  assert.strictEqual(mins(at('2026-01-13T06:59:00Z', msToMidnight)), 1);
});

test('the banner re-checks itself rather than trusting the page load', () => {
  // The three things that take a stale notice down on an open page. Losing any
  // one of them is silent: the banner simply stays up.
  assert.ok(/setTimeout\(function \(\) \{ apply\(\); tick\(\); \}/.test(MAIN),
    'the midnight timer is gone — an open page keeps yesterday\'s notice');
  assert.ok(/visibilitychange/.test(MAIN),
    'nothing re-checks when a backgrounded tab comes back, where timers are throttled');
  assert.ok(/shownFor !== today/.test(MAIN),
    'a page crossing into a SECOND closed day would keep naming the first');
});

/* ---------------------------------------------------------------
   api/send.js — the half a guest cannot see, and the half that counts

   global.fetch is replaced before the handler loads, so nothing is ever sent.
   The closure list is injected into the shared content module, so these tests
   keep saying the same thing next month when content.json has moved on.
   --------------------------------------------------------------- */

const CLOSED = '2027-01-06';   // stubbed closure
const OPEN = '2027-01-07';     // the control: same shape, open day

async function serverTests() {
  const STORE = path.join(__dirname, '../.data/submissions.json');
  let snapshot = null;
  try { snapshot = fs.readFileSync(STORE, 'utf8'); } catch (e) { /* no store yet */ }
  try { fs.mkdirSync(path.dirname(STORE), { recursive: true }); fs.writeFileSync(STORE, '[]'); } catch (e) {}

  const content = require('../lib/cms/content');
  const realList = content.list;
  content.list = (key) => (key === 'closedDates' ? [CLOSED] : realList(key));

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

  await check('a table reservation on a closed day is refused by the server', async () => {
    const r = await post(reservation(CLOSED));
    assert.strictEqual(r._s, 409, 'the server must refuse it even though the page already should have');
    assert.ok(/closed/i.test(r._j.error), 'the guest must be told WHY: ' + r._j.error);
    assert.ok(/January 6/.test(r._j.error), 'and which day: ' + r._j.error);
  });

  await check('a table reservation on an open day still goes through', async () => {
    // The control. Without it, a guard that refused everything would look fine.
    const r = await post(reservation(OPEN));
    assert.strictEqual(r._s, 200, 'an open day must still be bookable: ' + JSON.stringify(r._j));
  });

  await check('a pasta-shop pickup on a closed day is refused too', async () => {
    const r = await post(pickup(CLOSED));
    assert.strictEqual(r._s, 409, 'nobody can collect pasta from a locked door');
    assert.ok(/closed/i.test(r._j.error), r._j.error);
  });

  await check('a pasta-shop pickup on an open day still goes through', async () => {
    const r = await post(pickup(OPEN));
    assert.strictEqual(r._s, 200, 'an open day must still take orders: ' + JSON.stringify(r._j));
  });

  await check('the long date form is refused as readily as the ISO one', async () => {
    const r = await post(reservation('Wednesday, January 6, 2027'));
    assert.strictEqual(r._s, 409, 'a reformatted date must not slip past the closure');
  });

  content.list = realList;
  global.fetch = realFetch;
  try {
    if (snapshot === null) fs.rmSync(STORE, { force: true });
    else fs.writeFileSync(STORE, snapshot);
  } catch (e) { /* best effort */ }
}

serverTests().then(finish).catch((e) => {
  failures.push({ name: 'closure server harness', message: e && e.message });
  finish();
});

function finish() {
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
    process.exit(1);
  }
  console.log('✓ ' + passed + ' closure tests passed');
}
