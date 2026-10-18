/* Class booking cutoff — a Sunday closes to new bookings `cutoffDays` before it
   (default 6 = end of the Monday before). The closed Sunday stays on the list,
   greyed, until it actually passes. Pure date logic, pinned here so the pills,
   the availability API and the submit-check can never drift apart. */
const assert = require('assert');
const schedule = require('../lib/classes/schedule');

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); passed++; }

// Sunday 2026-10-18. Cutoff default 6 → cutoff day is Monday 2026-10-12.
const SUN = '2026-10-18';
function entryFor(todayISO, cutoffDays) {
  const list = schedule.upcoming({ from: '2026-10-01', today: todayISO, count: 8, cutoffDays: cutoffDays });
  return list.find((d) => d.iso === SUN);
}

// --- default cutoff (6 days = the Monday before) ---
ok('cutoff day is the Monday before (2026-10-12)', schedule.minusDaysISO(SUN, 6) === '2026-10-12');

ok('open a week before', entryFor('2026-10-05').closed === false);
ok('open ON the cutoff Monday (end of day)', entryFor('2026-10-12').closed === false);
ok('CLOSED the Tuesday after cutoff', entryFor('2026-10-13').closed === true);
ok('still CLOSED on the class day itself', entryFor('2026-10-18').closed === true);

// isBookable / isClosed agree with the flag
const tue = schedule.upcoming({ from: '2026-10-01', today: '2026-10-13', count: 8 });
ok('isBookable false after cutoff', schedule.isBookable(SUN, tue) === false);
ok('isClosed true after cutoff', schedule.isClosed(SUN, tue) === true);
ok('isFull stays false (it is closed, not full)', schedule.isFull(SUN, tue) === false);

const mon = schedule.upcoming({ from: '2026-10-01', today: '2026-10-12', count: 8 });
ok('isBookable true on the cutoff Monday', schedule.isBookable(SUN, mon) === true);

// --- configurable: cutoffDays:2 keeps it open until the Friday before ---
ok('cutoffDays 2 → open on Thursday 2026-10-15', entryFor('2026-10-15', 2).closed === false);
ok('cutoffDays 2 → closed on Sunday-2? Saturday 2026-10-17 closed', entryFor('2026-10-17', 2).closed === true);

// --- closed never silently removes the Sunday from the list ---
ok('closed Sunday still present in the list', !!entryFor('2026-10-13'));

// --- a full date outranks closed in the server message split ---
const fullList = schedule.upcoming({ from: '2026-10-01', today: '2026-10-13', count: 8, fullDates: [SUN] });
ok('full + past-cutoff → isFull true, isClosed false (full wins the message)',
  schedule.isFull(SUN, fullList) === true && schedule.isClosed(SUN, fullList) === false);

console.log('cutoff.test.js: ' + passed + ' assertions passed');
