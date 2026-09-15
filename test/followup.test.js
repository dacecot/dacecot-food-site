/* ============================================================
   da Cecot — the inquiry follow-up tracker.

   Two things here would cost real money if they went wrong quietly:

     1. An inquiry that is open but reads as answered. Someone asked about a
        private event and nobody ever wrote back, while the screen said
        somebody had.
     2. A tracker button emailing the customer. These are Erika's own notes —
        "replied" means she already wrote from her inbox. If "Mark replied"
        ever sent mail, it would send it to real customers, from a button
        whose label promises nothing of the sort.

   The second is asserted explicitly: the send path is spied on and must stay
   untouched for every one of these actions.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../.data');
const STORE = path.join(DATA_DIR, 'submissions.json');

let storeSnap = null;
try { storeSnap = fs.readFileSync(STORE, 'utf8'); } catch (e) {}
fs.mkdirSync(DATA_DIR, { recursive: true });
function restore() {
  try {
    if (storeSnap === null) fs.rmSync(STORE, { force: true });
    else fs.writeFileSync(STORE, storeSnap);
  } catch (e) { /* best effort */ }
}

delete process.env.DATABASE_URL;   // local JSON backend
const followup = require('../lib/orders/followup');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}

const TODAY = '2026-09-15';
const sub = (type, details) => ({ id: 'x', type: type, details: details || {} });

/* ---------------------------------------------------------------
   what counts, and what state it is in
   --------------------------------------------------------------- */

test('only inquiries and wholesale enquiries are tracked', () => {
  assert.ok(followup.isTracked(sub('contact')));
  assert.ok(followup.isTracked(sub('wholesale')));
  // These have their own status flows already; a paid order is not an
  // unanswered question.
  ['order', 'class', 'reservation'].forEach((t) => {
    assert.ok(!followup.isTracked(sub(t)), t + ' must not be tracked');
  });
});

test('an inquiry starts open and becomes responded', () => {
  assert.strictEqual(followup.status(sub('contact')), 'open');
  assert.strictEqual(followup.status(sub('contact', { responded_at: '2026-09-15T10:00:00Z' })), 'responded');
});

test('a cancelled inquiry is closed, not open', () => {
  // It must not sit in the "waiting for a reply" count forever.
  assert.strictEqual(followup.status(sub('contact', { cancelled: true })), 'closed');
  assert.strictEqual(followup.status(sub('contact', { cancelled: true, responded_at: 'x' })), 'closed');
});

/* ---------------------------------------------------------------
   reminders — the date maths Erika reads off the screen
   --------------------------------------------------------------- */

test('no reminder set reads as no reminder', () => {
  assert.strictEqual(followup.reminder(sub('contact'), TODAY), null);
  assert.strictEqual(followup.reminder(sub('contact', { reminder_date: 'nonsense' }), TODAY), null);
});

test('a reminder knows whether it is due, overdue or still ahead', () => {
  const at = (d) => followup.reminder(sub('contact', { reminder_date: d }), TODAY);
  assert.deepStrictEqual(
    { d: at('2026-09-15').daysAway, due: at('2026-09-15').due, over: at('2026-09-15').overdue },
    { d: 0, due: true, over: false }, 'today is due but not overdue');
  assert.deepStrictEqual(
    { d: at('2026-09-12').daysAway, due: at('2026-09-12').due, over: at('2026-09-12').overdue },
    { d: -3, due: true, over: true }, 'three days ago is overdue');
  assert.deepStrictEqual(
    { d: at('2026-09-20').daysAway, due: at('2026-09-20').due, over: at('2026-09-20').overdue },
    { d: 5, due: false, over: false }, 'five days out is neither');
});

test('the reminder date survives being written in any readable form', () => {
  ['2026-09-20', 'September 20, 2026', 'Sunday, September 20, 2026', '09/20/2026'].forEach((form) => {
    const r = followup.reminder(sub('contact', { reminder_date: form }), TODAY);
    assert.strictEqual(r.date, '2026-09-20', form + ' did not normalise');
    assert.strictEqual(r.daysAway, 5);
  });
});

test('day counting does not drift across a month or a DST change', () => {
  // Edmonton springs forward on 2026-03-08; counted as dates, that is still 1 day.
  assert.strictEqual(followup.daysBetween('2026-03-07', '2026-03-08'), 1);
  assert.strictEqual(followup.daysBetween('2026-09-30', '2026-10-01'), 1);
  assert.strictEqual(followup.daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.strictEqual(followup.daysBetween('2026-09-15', '2026-09-15'), 0);
});

/* ---------------------------------------------------------------
   the counts on the tracker strip
   --------------------------------------------------------------- */

test('the summary counts the right things and ignores the rest', () => {
  const list = [
    sub('contact', {}),                                           // open
    sub('contact', { responded_at: 'x' }),                        // responded
    sub('wholesale', {}),                                         // open
    sub('contact', { cancelled: true }),                          // closed — ignored
    sub('order', {}),                                             // not tracked — ignored
    sub('class', {}),                                             // not tracked — ignored
    sub('contact', { reminder_date: '2026-09-15' }),              // open + due today
    sub('contact', { reminder_date: '2026-09-10' }),              // open + overdue
    sub('contact', { responded_at: 'x', reminder_date: '2026-09-12' }) // answered but still overdue
  ];
  // Tracked and not closed: the two plain opens, the wholesale one, the two
  // with reminders, and the answered one — six. The cancelled inquiry and the
  // order and class are out entirely.
  assert.deepStrictEqual(followup.summarise(list, TODAY), {
    open: 4, responded: 2, dueNow: 1, overdue: 2, total: 6
  });
});

test('an empty book summarises to zeroes, not to errors', () => {
  assert.deepStrictEqual(followup.summarise([], TODAY), { open: 0, responded: 0, dueNow: 0, overdue: 0, total: 0 });
  assert.deepStrictEqual(followup.summarise(null, TODAY), { open: 0, responded: 0, dueNow: 0, overdue: 0, total: 0 });
});

/* ---------------------------------------------------------------
   validation — what Erika is allowed to type
   --------------------------------------------------------------- */

test('a reminder cannot be set in the past', () => {
  // It would be born overdue and just pad the count with noise.
  let threw = null;
  try { followup.validateReminderDate('2026-09-14', TODAY); } catch (e) { threw = e; }
  assert.ok(threw, 'yesterday was accepted');
  assert.strictEqual(threw.status, 400);
  assert.ok(/passed/i.test(threw.message), threw.message);
});

test('today is allowed, and so is a year out; beyond that is not', () => {
  assert.strictEqual(followup.validateReminderDate('2026-09-15', TODAY), '2026-09-15');
  assert.strictEqual(followup.validateReminderDate('2027-09-15', TODAY), '2027-09-15');
  let threw = null;
  try { followup.validateReminderDate('2030-01-01', TODAY); } catch (e) { threw = e; }
  assert.ok(threw && threw.status === 400, 'a date years out should be refused');
});

test('an unreadable date is refused rather than guessed at', () => {
  ['', 'soon', 'next week sometime', null, undefined].forEach((bad) => {
    let threw = null;
    try { followup.validateReminderDate(bad, TODAY); } catch (e) { threw = e; }
    assert.ok(threw, 'accepted ' + JSON.stringify(bad));
  });
});

test('notes are trimmed, capped and stripped of markup', () => {
  assert.strictEqual(followup.cleanNote('  called them back  '), 'called them back');
  assert.strictEqual(followup.cleanNote('<b>bold</b>'), 'bbold/b', 'angle brackets must not survive into the admin');
  assert.strictEqual(followup.cleanNote('x'.repeat(500)).length, followup.NOTE_MAX);
  assert.strictEqual(followup.cleanNote(null), '');
});

/* ---------------------------------------------------------------
   the state changes, as patches
   --------------------------------------------------------------- */

test('marking replied records when, and the note if there is one', () => {
  const before = { message: 'do you cater?' };
  const after = followup.markResponded(before, { note: 'quoted her', at: '2026-09-15T10:00:00Z' });
  assert.strictEqual(after.responded_at, '2026-09-15T10:00:00Z');
  assert.strictEqual(after.responded_note, 'quoted her');
  assert.strictEqual(after.message, 'do you cater?', 'the original submission must survive');
  assert.strictEqual(before.responded_at, undefined, 'the patch must not mutate what it was given');
});

test('reopening clears the reply but keeps the reminder', () => {
  const after = followup.reopen({ responded_at: 'x', responded_note: 'n', reminder_date: '2026-09-20', message: 'hi' });
  assert.strictEqual(after.responded_at, undefined);
  assert.strictEqual(after.responded_note, undefined);
  assert.strictEqual(after.reminder_date, '2026-09-20', 'a reminder is separate from whether she replied');
  assert.strictEqual(after.message, 'hi');
});

test('setting a reminder normalises the date and keeps the inquiry intact', () => {
  const after = followup.setReminder({ message: 'hi' }, 'September 20, 2026', 'chase the quote', TODAY);
  assert.strictEqual(after.reminder_date, '2026-09-20');
  assert.strictEqual(after.reminder_note, 'chase the quote');
  assert.strictEqual(after.message, 'hi');
});

test('clearing a reminder leaves the reply state alone', () => {
  const after = followup.clearReminder({ reminder_date: '2026-09-20', reminder_note: 'n', responded_at: 'x' });
  assert.strictEqual(after.reminder_date, undefined);
  assert.strictEqual(after.reminder_note, undefined);
  assert.strictEqual(after.responded_at, 'x');
});

/* ---------------------------------------------------------------
   api/admin/orders.js — the buttons, and what they must never do
   --------------------------------------------------------------- */

async function handlerTests() {
  const store = require('../lib/orders/store');
  const seeded = [
    { id: 'inq-1', type: 'contact', name: 'Anna', email: 'anna@example.invalid', created_at: '2026-09-15T09:00:00Z', details: { message: 'do you cater?' }, payment_status: 'none', currency: 'CAD' },
    { id: 'whl-1', type: 'wholesale', name: 'Bar Roma', email: 'bar@example.invalid', created_at: '2026-09-15T09:00:00Z', details: { message: 'trade pricing?' }, payment_status: 'none', currency: 'CAD' },
    { id: 'ord-1', type: 'order', name: 'Carl', email: 'carl@example.invalid', created_at: '2026-09-15T09:00:00Z', details: { item: 'Ravioli' }, payment_status: 'pending', currency: 'CAD' }
  ];
  fs.writeFileSync(STORE, JSON.stringify(seeded, null, 2));

  process.env.RESEND_API_KEY = 're_TEST_NEVER_SENT';
  process.env.RESEND_FROM = 'da Cecot <test@local.invalid>';
  process.env.RESEND_TO = 'store@local.invalid';

  // Spy, not a stub that swallows: any send at all is a failure here.
  const realFetch = global.fetch;
  const sends = [];
  global.fetch = async (url, opts) => {
    sends.push({ url: String(url), body: opts && opts.body });
    return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'test' }) };
  };

  const auth = require('../lib/cms/auth');
  const realRequireAuth = auth.requireAuth;
  auth.requireAuth = () => ({ email: 'erika@local.invalid' });

  const handler = require('../api/admin/orders.js');
  const call = async (method, url, body) => {
    const r = { _s: 0, _j: null };
    r.status = (c) => { r._s = c; return r; };
    r.json = (j) => { r._j = j; return r; };
    r.setHeader = () => {};
    await handler({ method, url, headers: {}, body }, r);
    return r;
  };
  const post = (body) => call('POST', '/api/admin/orders', body);
  const check = async (name, fn) => {
    try { await fn(); passed++; }
    catch (e) { failures.push({ name, message: e && e.message }); }
  };

  await check('the list carries follow-up state and a summary', async () => {
    const r = await call('GET', '/api/admin/orders');
    assert.strictEqual(r._s, 200, JSON.stringify(r._j));
    const inq = r._j.orders.find((o) => o.id === 'inq-1');
    assert.ok(inq.followup, 'no follow-up state on the inquiry');
    assert.strictEqual(inq.followup.tracked, true);
    assert.strictEqual(inq.followup.status, 'open');
    const ord = r._j.orders.find((o) => o.id === 'ord-1');
    assert.strictEqual(ord.followup.tracked, false, 'a pasta order must not be tracked');
    assert.deepStrictEqual(
      { open: r._j.followupSummary.open, responded: r._j.followupSummary.responded },
      { open: 2, responded: 0 }, 'two inquiries waiting');
  });

  await check('Mark replied moves it to answered', async () => {
    const r = await post({ id: 'inq-1', action: 'mark_responded', note: 'quoted her' });
    assert.strictEqual(r._s, 200, JSON.stringify(r._j));
    const list = await call('GET', '/api/admin/orders');
    const inq = list._j.orders.find((o) => o.id === 'inq-1');
    assert.strictEqual(inq.followup.status, 'responded');
    assert.strictEqual(inq.followup.respondedNote, 'quoted her');
    assert.strictEqual(list._j.followupSummary.open, 1, 'the waiting count must drop');
  });

  await check('none of the tracker actions email anybody', async () => {
    // The whole point. "Mark replied" is Erika's bookkeeping, not a message.
    sends.length = 0;
    await post({ id: 'whl-1', action: 'mark_responded' });
    await post({ id: 'whl-1', action: 'reopen' });
    await post({ id: 'whl-1', action: 'set_reminder', date: '2026-12-01' });
    await post({ id: 'whl-1', action: 'clear_reminder' });
    assert.strictEqual(sends.length, 0,
      'a tracker action tried to send ' + sends.length + ' message(s): ' + JSON.stringify(sends[0] || {}).slice(0, 200));
  });

  await check('Still open puts it back', async () => {
    const r = await post({ id: 'inq-1', action: 'reopen' });
    assert.strictEqual(r._s, 200);
    const list = await call('GET', '/api/admin/orders');
    assert.strictEqual(list._j.orders.find((o) => o.id === 'inq-1').followup.status, 'open');
  });

  await check('a reminder can be set, read back and cleared', async () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const r = await post({ id: 'inq-1', action: 'set_reminder', date: soon, note: 'chase the quote' });
    assert.strictEqual(r._s, 200, JSON.stringify(r._j));
    let list = await call('GET', '/api/admin/orders');
    let inq = list._j.orders.find((o) => o.id === 'inq-1');
    assert.strictEqual(inq.followup.reminder.date, soon);
    assert.strictEqual(inq.followup.reminder.note, 'chase the quote');
    assert.strictEqual(inq.followup.reminder.due, false, 'three days out is not due yet');

    await post({ id: 'inq-1', action: 'clear_reminder' });
    list = await call('GET', '/api/admin/orders');
    inq = list._j.orders.find((o) => o.id === 'inq-1');
    assert.strictEqual(inq.followup.reminder, null);
  });

  await check('a reminder in the past is refused by the server', async () => {
    const r = await post({ id: 'inq-1', action: 'set_reminder', date: '2020-01-01' });
    assert.strictEqual(r._s, 400, JSON.stringify(r._j));
    assert.ok(/passed/i.test(r._j.error), r._j.error);
  });

  await check('the tracker refuses to touch an order or a booking', async () => {
    // Blast radius: these buttons only exist for inquiries, and the server
    // must say so even if a stale page sends the action anyway.
    const r = await post({ id: 'ord-1', action: 'mark_responded' });
    assert.strictEqual(r._s, 400, JSON.stringify(r._j));
    assert.ok(/inquir/i.test(r._j.error), r._j.error);
  });

  await check('an unknown action is still rejected', async () => {
    const r = await post({ id: 'inq-1', action: 'mark_responded_lol' });
    assert.strictEqual(r._s, 400);
  });

  auth.requireAuth = realRequireAuth;
  global.fetch = realFetch;
}

handlerTests().then(finish).catch((e) => {
  failures.push({ name: 'follow-up handler harness', message: e && e.message });
  finish();
});

function finish() {
  restore();
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
    process.exit(1);
  }
  console.log('✓ ' + passed + ' follow-up tests passed');
}
