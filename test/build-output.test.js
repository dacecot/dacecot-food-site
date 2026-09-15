/* ============================================================
   da Cecot — tests that read the GENERATED PAGES, not the generator.

   Everything else in test/ checks a module in isolation. That is not enough
   here: the three things this suite guards (menus showing "coming soon", a
   Sunday marked fully booked, a day the restaurant is closed) are only real if
   they survive the build and land in the HTML a guest is actually served. A
   module that returns the right value into a page that never prints it is the
   exact failure this file exists to catch.

   So it runs the real build and then reads the real .html files.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const content = require('../lib/cms/content');
const hours = require('../lib/cms/hours');
const schedule = require('../lib/classes/schedule');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}

// Build first — the assertions below are about the artifact, so it has to exist
// and be current. Anything the build prints on failure comes straight through.
execFileSync(process.execPath, [path.join('.claude', 'build.js')], { cwd: ROOT, stdio: 'pipe' });

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const menu = read('menu.html');
const classes = read('sunday-pasta-classes.html');
const reservations = read('reservations.html');
const pastaShop = read('pasta-shop.html');

const count = (hay, needle) => hay.split(needle).length - 1;

// The JSON the pickers read, pulled back out of the page.
function embedded(html, id) {
  const m = new RegExp('<script id="' + id + '" type="application/json">([\\s\\S]*?)</script>').exec(html);
  assert.ok(m, 'no #' + id + ' block in the page — the picker has nothing to read');
  return JSON.parse(m[1]);
}

// Every date pill on a page, as raw <label>…</label> strings.
function pills(html) {
  return html.match(/<label class="date-pill[\s\S]*?<\/label>/g) || [];
}

/* ---------------------------------------------------------------
   menu.html — every menu reads "Coming soon", nothing links a PDF
   --------------------------------------------------------------- */

test('the menu page links no PDF at all', () => {
  assert.strictEqual(count(menu, 'href="menus/'), 0, 'a menu PDF is still linked on the page');
  assert.strictEqual(count(menu, '.pdf'), 0, 'a .pdf reference survived somewhere on the page');
});

test('every menu card says Coming soon', () => {
  // One card per grid tile. If a card ever links a PDF again, this pairing is
  // what fails — deliberately: the copy below it would then be lying.
  const cards = count(menu, 'background:var(--linen, #efe7d8)');
  assert.ok(cards >= 6, 'expected the six menu cards, found ' + cards);
  assert.strictEqual(count(menu, '>Coming soon</span>'), cards,
    cards + ' menu cards but ' + count(menu, '>Coming soon</span>') + ' marked coming soon');
});

test('the page does not promise a menu it cannot open', () => {
  assert.strictEqual(count(menu, 'View the latest menu below'), 0,
    'the intro still tells guests to view a menu that is not there');
  assert.strictEqual(count(menu, 'Menus open in a new tab'), 0,
    'the footnote still describes opening a menu PDF');
});

test('the FAQ answer Google reads is updated too', () => {
  // This one is in the FAQPage JSON-LD as well as the accordion, so a stale
  // answer keeps being served as a search result long after the page is fixed.
  assert.strictEqual(count(menu, 'the latest menu opens instantly'), 0,
    'the menu FAQ still claims a menu opens instantly');
});

/* ---------------------------------------------------------------
   sunday-pasta-classes.html — a full Sunday is visibly sold out
   --------------------------------------------------------------- */

const scheduled = schedule.fromContent(content);
const fullOnPage = scheduled.filter((d) => d.full && classes.indexOf(d.label) > -1);

test('the fully-booked Sundays configured in the CMS reached the page', () => {
  const configured = content.list('classFullDates')
    .filter((d) => scheduled.some((s) => schedule.sameDay(s.label, d) && s.full));
  assert.strictEqual(fullOnPage.length, configured.length,
    configured.length + ' Sundays are marked full in the CMS but ' + fullOnPage.length + ' render that way');
});

test('each full Sunday renders disabled, flagged and labelled', () => {
  const all = pills(classes);
  assert.ok(all.length > 0, 'no date pills on the classes page at all');
  fullOnPage.forEach((d) => {
    const mine = all.filter((p) => p.indexOf('value="' + d.label + '"') > -1);
    assert.ok(mine.length > 0, 'no pill for ' + d.label);
    mine.forEach((p) => {
      assert.ok(p.indexOf(' disabled') > -1, d.label + ' is marked full but its pill is still selectable');
      assert.ok(p.indexOf('data-sold-out="1"') > -1, d.label + ' is missing the flag main.js looks for');
      assert.ok(p.indexOf('Fully booked') > -1, d.label + ' does not say "Fully booked" to the guest');
    });
  });
});

test('Sundays that are NOT full stay bookable', () => {
  // The control. A generator that disabled every pill would pass the test above.
  const fullLabels = fullOnPage.map((d) => d.label);
  const open = pills(classes).filter((p) => !fullLabels.some((l) => p.indexOf('value="' + l + '"') > -1));
  assert.ok(open.length > 0, 'every single date pill is disabled — nobody can book anything');
  open.forEach((p) => {
    assert.strictEqual(p.indexOf(' disabled'), -1, 'an open date was rendered disabled: ' + p.slice(0, 120));
  });
});

test('the "pick a date" requirement sits on a pill that can be picked', () => {
  // required on a disabled radio cannot be satisfied, so the requirement would
  // silently vanish — and a booking with no date reaches the kitchen.
  const first = pills(classes).filter((p) => p.indexOf('name="class_date"') > -1);
  const required = first.filter((p) => p.indexOf(' required') > -1);
  assert.strictEqual(required.length, 1, 'expected exactly one required 1st-choice pill, found ' + required.length);
  assert.strictEqual(required[0].indexOf(' disabled'), -1, 'the required pill is disabled');
});

/* ---------------------------------------------------------------
   reservations.html / pasta-shop.html — the closure reached both pickers
   --------------------------------------------------------------- */

const closed = hours.closedDates(content);

test('the reservation picker was built with the closure list', () => {
  const cfg = embedded(reservations, 'service-hours');
  assert.deepStrictEqual(cfg.closed, closed,
    'the reservation form does not know which days we are closed');
});

test('the pasta-shop pickup picker was built with the same list', () => {
  const cfg = embedded(pastaShop, 'pickup-hours');
  assert.deepStrictEqual(cfg.closed, closed,
    'pickups can still be booked on a day the doors are shut');
});

test('each configured closure is literally present in both pages', () => {
  // deepStrictEqual above compares what we parsed back; this compares the bytes
  // actually served, so an empty list can never quietly satisfy both.
  closed.forEach((iso) => {
    assert.ok(reservations.indexOf(iso) > -1, iso + ' is missing from reservations.html');
    assert.ok(pastaShop.indexOf(iso) > -1, iso + ' is missing from pasta-shop.html');
  });
  if (!closed.length) {
    assert.ok(reservations.indexOf('"closed":[]') > -1, 'no closures configured, so the page should carry an empty list');
  }
});

if (failures.length) {
  console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
  process.exit(1);
}
console.log('✓ ' + passed + ' build-output tests passed');
