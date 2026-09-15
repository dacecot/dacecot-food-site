/* ============================================================
   da Cecot — what each class costs, and what the store records.

   Two different classes at two different prices, both normalising to type
   'class'. For a long time every Thursday drop-in was recorded at the SUNDAY
   rate — a two-guest drop-in landed in the book at $190. Nobody notices a
   wrong number in an admin column until someone queries a bill, so the
   arithmetic is pinned here.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');
const { normalize, detectType, CLASS_PRICE_CENTS, DROP_IN_PRICE_CENTS } = require('../lib/orders/submission');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}

const who = { name: 'Anna Rossi', phone: '780-555-0100', email: 'anna@example.invalid' };
const dropIn = (guests) => Object.assign({
  _subject: 'Pasta Drop-In Reservation — da Cecot',
  drop_in_date: 'Thursday, September 17, 2026', guests: guests
}, who);
const sunday = (guests) => Object.assign({
  _subject: 'Sunday Pasta Class Booking — da Cecot',
  class_date: 'Sunday, September 27, 2026', guests: guests
}, who);

test('the two prices are the ones the client set', () => {
  // If these ever change, every assertion below moves with them — but the
  // change has to be deliberate, not a stray edit.
  assert.strictEqual(CLASS_PRICE_CENTS, 9500, 'La Domenica is $95 per guest');
  assert.strictEqual(DROP_IN_PRICE_CENTS, 4500, 'Pasta With Erika is $45 per person');
});

test('a Thursday drop-in is charged the drop-in rate', () => {
  assert.strictEqual(normalize(dropIn('1 guest')).amount_cents, 4500);
  assert.strictEqual(normalize(dropIn('2 guests')).amount_cents, 9000);
  assert.strictEqual(normalize(dropIn('8 guests')).amount_cents, 36000);
});

test('a drop-in is never charged the Sunday rate', () => {
  // The actual regression. Stated separately from the arithmetic above so the
  // failure names the bug rather than an arithmetic slip.
  const two = normalize(dropIn('2 guests')).amount_cents;
  assert.notStrictEqual(two, 2 * CLASS_PRICE_CENTS,
    'a two-guest drop-in was recorded at the Sunday rate ($' + (two / 100).toFixed(2) + ')');
  assert.strictEqual(two, 2 * DROP_IN_PRICE_CENTS);
});

test('the Sunday class still charges the Sunday rate', () => {
  // The control: the fix must not have quietly repriced La Domenica.
  assert.strictEqual(normalize(sunday('1 guest')).amount_cents, 9500);
  assert.strictEqual(normalize(sunday('2 guests')).amount_cents, 19000);
  assert.strictEqual(normalize(sunday('12 guests')).amount_cents, 114000);
});

test('the date field is what tells them apart', () => {
  // Both are type 'class' — the admin's Pasta Classes tab wants them together.
  // drop_in_date is the only thing distinguishing the price.
  assert.strictEqual(detectType('Pasta Drop-In Reservation — da Cecot', dropIn('2 guests')), 'class');
  assert.strictEqual(detectType('Sunday Pasta Class Booking — da Cecot', sunday('2 guests')), 'class');
  const bare = Object.assign({ _subject: 'Pasta Class Booking — da Cecot', guests: '2 guests' }, who);
  assert.strictEqual(normalize(bare).amount_cents, 19000,
    'a class booking with no drop_in_date is a Sunday class and stays at the Sunday rate');
});

test('no guest count means no amount, not a free class', () => {
  const d = normalize(Object.assign(dropIn(''), { guests: '' }));
  assert.strictEqual(d.amount_cents, null, 'better to record nothing than to record $0');
  const s = normalize(Object.assign(sunday(''), { guests: '' }));
  assert.strictEqual(s.amount_cents, null);
});

test('the drop-in date is kept on the booking', () => {
  // Erika needs to know which Thursday, and the price now depends on the field
  // being there — if it stopped being captured the rate would silently jump.
  const d = normalize(dropIn('2 guests'));
  assert.strictEqual(d.details.drop_in_date, 'Thursday, September 17, 2026');
  assert.strictEqual(d.details.guests, '2 guests');
});

test('pasta-shop orders are priced from the item, not the class rate', () => {
  const order = Object.assign({
    _subject: 'Pasta Shop Order: Fresh Pasta — 450 g',
    item: 'Fresh Pasta — 450 g', price: '$9.95', quantity: '2'
  }, who);
  assert.strictEqual(normalize(order).amount_cents, 1990, 'two at $9.95');
});

if (failures.length) {
  console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
  process.exit(1);
}
console.log('✓ ' + passed + ' pricing tests passed');
