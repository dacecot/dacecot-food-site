/* ============================================================
   da Cecot — tests for the weekly class schedule and the push planner.

   These two modules decide (a) which Sundays a guest may book and (b) which
   paid booking gets moved to which date and who receives which email. A silent
   wrong answer here either loses a booking or emails the wrong thing to a real
   customer, so both are pinned down here rather than eyeballed.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const schedule = require('../lib/classes/schedule');
const push = require('../lib/classes/push');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}

/* ---------------------------------------------------------------
   schedule.js — which Sundays the booking form offers
   --------------------------------------------------------------- */

// Wed 2026-09-16. The Sundays after it: Sep 20, Sep 27, Oct 4*, Oct 11, Oct 18,
// Oct 25, Nov 1*, Nov 8 …  (* = first Sunday of the month, closed)
const FROM = '2026-09-16';

test('returns exactly the number of Sundays asked for', () => {
  assert.strictEqual(schedule.upcoming({ from: FROM, count: 5 }).length, 5);
  assert.strictEqual(schedule.upcoming({ from: FROM, count: 1 }).length, 1);
});

test('every generated date really is a Sunday', () => {
  schedule.upcoming({ from: FROM, count: 12 }).forEach((d) => {
    assert.strictEqual(schedule.utcOf(d.iso).getUTCDay(), 0, d.iso + ' is not a Sunday');
  });
});

test('skips the first Sunday of each month (da Cecot is closed)', () => {
  const got = schedule.upcoming({ from: FROM, count: 6 }).map((d) => d.iso);
  assert.ok(!got.includes('2026-10-04'), 'Oct 4 is a first Sunday and must be skipped');
  assert.ok(!got.includes('2026-11-01'), 'Nov 1 is a first Sunday and must be skipped');
  assert.deepStrictEqual(got, ['2026-09-20', '2026-09-27', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-08']);
});

test('includes first Sundays when the closure is turned off', () => {
  const got = schedule.upcoming({ from: FROM, count: 3, firstSundayClosed: false }).map((d) => d.iso);
  assert.deepStrictEqual(got, ['2026-09-20', '2026-09-27', '2026-10-04']);
});

test('blackout dates are dropped, in any date format Erika types', () => {
  const got = schedule.upcoming({
    from: FROM, count: 3,
    blackout: ['Sunday, September 27, 2026', '2026-10-11']
  }).map((d) => d.iso);
  // Still 3 dates: a blackout removes that Sunday, it doesn't shorten the list.
  assert.deepStrictEqual(got, ['2026-09-20', '2026-10-18', '2026-10-25']);
});

test('never offers a date in the past', () => {
  // Starting mid-week, the Sunday just gone (Sep 13) must not appear.
  const got = schedule.upcoming({ from: FROM, count: 5 }).map((d) => d.iso);
  got.forEach((iso) => assert.ok(iso >= FROM, iso + ' is before ' + FROM));
});

test('a Sunday is still bookable on the day itself', () => {
  const got = schedule.upcoming({ from: '2026-09-20', count: 1 }).map((d) => d.iso);
  assert.deepStrictEqual(got, ['2026-09-20']);
});

test('a blackout list can never starve the generator', () => {
  // Blacking out more dates than exist must terminate, not hang or over-return.
  const blackout = schedule.upcoming({ from: FROM, count: 40 }).map((d) => d.iso);
  const got = schedule.upcoming({ from: FROM, count: 5, blackout });
  assert.ok(got.length <= 5);
});

test('labels match the exact format stored on bookings', () => {
  // class-availability.js keys its seat counts by this string, and the booking
  // pills submit it verbatim. A format drift here silently breaks the live
  // seat counter and the capacity guard.
  assert.strictEqual(schedule.longLabel('2026-09-20'), 'Sunday, September 20, 2026');
  assert.strictEqual(schedule.shortLabel('2026-09-20'), 'Sun · Sep 20');
});

test('isBookable accepts any format naming a scheduled day, rejects others', () => {
  const list = schedule.upcoming({ from: FROM, count: 5 });
  assert.ok(schedule.isBookable('Sunday, September 20, 2026', list));
  assert.ok(schedule.isBookable('2026-09-20', list), 'ISO form of a scheduled date');
  assert.ok(!schedule.isBookable('2026-10-04', list), 'a closed first Sunday');
  assert.ok(!schedule.isBookable('2026-09-13', list), 'a date in the past');
  assert.ok(!schedule.isBookable('', list));
  assert.ok(!schedule.isBookable('not a date', list));
});

test('sameDay matches across formats', () => {
  assert.ok(schedule.sameDay('Sunday, September 20, 2026', '2026-09-20'));
  assert.ok(!schedule.sameDay('Sunday, September 20, 2026', '2026-09-27'));
  assert.ok(!schedule.sameDay('', '2026-09-20'));
});

test('the schedule is identical regardless of server timezone', () => {
  // Vercel runs UTC, the restaurant is in Edmonton, and a dev machine could be
  // anywhere. If any date math slipped into local time, these would disagree by
  // a day at the extremes (+14 and -11).
  const script =
    "const s=require(" + JSON.stringify(path.join(__dirname, '../lib/classes/schedule.js')) + ");" +
    "process.stdout.write(JSON.stringify(s.upcoming({from:'" + FROM + "',count:8}).map(d=>d.iso+'|'+d.label)));";
  const run = (tz) => execFileSync(process.execPath, ['-e', script], {
    env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8'
  });
  const east = run('Pacific/Kiritimati');   // UTC+14
  const west = run('Pacific/Niue');         // UTC-11
  const edm = run('America/Edmonton');
  assert.strictEqual(east, west, 'schedule shifted between UTC+14 and UTC-11');
  assert.strictEqual(east, edm, 'schedule shifted between UTC+14 and Edmonton');
});

/* ---------------------------------------------------------------
   push.js — who moves where when a class is under-filled
   --------------------------------------------------------------- */

const SEP20 = 'Sunday, September 20, 2026';
const SEP27 = 'Sunday, September 27, 2026';
const OCT11 = 'Sunday, October 11, 2026';

let n = 0;
function booking(first, second, guests, extra) {
  n++;
  return Object.assign({
    id: 'b' + n,
    type: 'class',
    name: 'Guest ' + n,
    email: 'guest' + n + '@example.com',
    details: Object.assign({
      class_date: first,
      guests: guests == null ? '1 guest' : guests + (guests === 1 ? ' guest' : ' guests')
    }, second ? { class_date_2: second } : {})
  }, extra || {});
}

test('a guest with a 2nd choice moves to their own backup date', () => {
  const all = [booking(SEP20, SEP27, 2)];
  const plan = push.planPush(all, SEP20, { max: 12 });
  assert.strictEqual(plan.moves.length, 1);
  assert.strictEqual(plan.rebooks.length, 0);
  assert.strictEqual(plan.moves[0].to, SEP27);
  assert.strictEqual(plan.movedGuests, 2);
});

test('guests scatter to their OWN backups, not to one shared date', () => {
  // This is the behaviour Haruun chose: nobody lands on a Sunday they did not pick.
  const all = [booking(SEP20, SEP27, 1), booking(SEP20, OCT11, 1), booking(SEP20, SEP27, 1)];
  const plan = push.planPush(all, SEP20, { max: 12 });
  assert.deepStrictEqual(plan.moves.map((m) => m.to), [SEP27, OCT11, SEP27]);
});

test('a guest with no 2nd choice is asked to rebook, not moved', () => {
  const all = [booking(SEP20, null, 2)];
  const plan = push.planPush(all, SEP20, { max: 12 });
  assert.strictEqual(plan.moves.length, 0);
  assert.strictEqual(plan.rebooks.length, 1);
  assert.strictEqual(plan.rebooks[0].reason, 'no_second');
});

test('a 2nd choice naming the same day as the 1st is not a backup', () => {
  const all = [booking(SEP20, '2026-09-20', 1)];
  const plan = push.planPush(all, SEP20, { max: 12 });
  assert.strictEqual(plan.moves.length, 0);
  assert.strictEqual(plan.rebooks[0].reason, 'no_second');
});

test('a guest whose backup is already full is asked to rebook', () => {
  const all = [booking(SEP20, SEP27, 2), booking(SEP27, null, 12)]; // Sep 27 at cap
  const plan = push.planPush(all, SEP20, { max: 12 });
  assert.strictEqual(plan.moves.length, 0);
  assert.strictEqual(plan.rebooks[0].reason, 'second_full');
});

test('moves claim seats as they go — the target cannot be oversold', () => {
  // Sep 27 has 10 of 12 taken. Two parties of 2 both want it: only one fits.
  // If the planner checked each booking against the ORIGINAL count instead of a
  // running one, both would be told "there's room" and Sep 27 would end at 14.
  const all = [
    booking(SEP27, null, 10),
    booking(SEP20, SEP27, 2),
    booking(SEP20, SEP27, 2)
  ];
  const plan = push.planPush(all, SEP20, { max: 12 });
  assert.strictEqual(plan.moves.length, 1, 'exactly one party should fit');
  assert.strictEqual(plan.rebooks.length, 1);
  assert.strictEqual(plan.rebooks[0].reason, 'second_full');
  const after = push.bookedOn(all, SEP27) + plan.movedGuests;
  assert.ok(after <= 12, 'Sep 27 would be oversold: ' + after);
});

test('cancelled bookings are neither moved nor counted', () => {
  const all = [
    booking(SEP20, SEP27, 2, null),
    booking(SEP20, SEP27, 5, null)
  ];
  all[1].details.cancelled = true;
  const plan = push.planPush(all, SEP20, { max: 12 });
  assert.strictEqual(plan.moves.length, 1);
  assert.strictEqual(plan.totalGuests, 2, 'a cancelled booking must not be moved or emailed');
  assert.strictEqual(push.bookedOn(all, SEP20), 2);
});

test('an unreadable guest count is worth one seat, never zero', () => {
  // A booking that counted as 0 would let a class quietly exceed its cap.
  assert.strictEqual(push.guestCount({ details: { guests: '' } }), 1);
  assert.strictEqual(push.guestCount({ details: {} }), 1);
  assert.strictEqual(push.guestCount({ details: { guests: 'party of 3' } }), 3);
});

test('an unknown date plans nothing rather than guessing', () => {
  const plan = push.planPush([booking(SEP20, SEP27, 2)], 'whenever', { max: 12 });
  assert.strictEqual(plan.moves.length, 0);
  assert.strictEqual(plan.rebooks.length, 0);
});

test('rosters flag exactly the classes below the minimum', () => {
  const all = [
    booking(SEP20, SEP27, 3),   // 3 guests — under a minimum of 4
    booking(SEP27, null, 4),    // 4 guests — exactly at the minimum, runs
    booking(OCT11, null, 9)
  ];
  const rs = push.rosters(all, { max: 12, min: 4 });
  const byIso = {};
  rs.forEach((r) => { byIso[r.iso] = r; });
  assert.strictEqual(byIso['2026-09-20'].underMin, true);
  assert.strictEqual(byIso['2026-09-27'].underMin, false, 'exactly at the minimum must still run');
  assert.strictEqual(byIso['2026-10-11'].underMin, false);
  assert.strictEqual(byIso['2026-10-11'].left, 3);
});

test('rosters sum guests per class rather than counting bookings', () => {
  const all = [booking(SEP20, null, 2), booking(SEP20, null, 3)];
  const rs = push.rosters(all, { max: 12, min: 4 });
  assert.strictEqual(rs[0].booked, 5, 'two bookings of 2 and 3 are 5 guests');
  assert.strictEqual(rs[0].underMin, false);
});

/* --------------------------------------------------------------- */

if (failures.length) {
  console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
  process.exit(1);
}
console.log('✓ ' + passed + ' tests passed');
