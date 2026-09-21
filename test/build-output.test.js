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

// Literals the pause assertions below compare against. Declared as plain
// strings so no regex escaping stands between the test and the bytes served.
const PAUSED_OPEN_TAG = "<div class=\"booking\" data-res-paused";
const FORM_OPEN_TAG = "<div class=\"booking\" data-res-form";
const HIDDEN_ATTR = " hidden";
const TEL_HREF = "href=\"tel:";
const MAILTO_HREF = "href=\"mailto:";
const GT = ">";
const PAUSED_MISSING = "the paused notice is not where main.js looks for it";
const PAUSED_VISIBLE = "the paused notice ships visible - every guest would see \"booking is paused\": ";
const NO_PHONE = "no phone number on the paused notice - the guest is told no, with nowhere to go";
const NO_EMAIL = "no email on the paused notice";


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

/* ---------------------------------------------------------------
   sunday-pasta-classes.html — the page quotes the price the till charges

   Prices live in lib/orders/submission.js and the generator interpolates them.
   These assertions are what stop someone "fixing" a price by retyping it into
   the copy, leaving the page and the recorded amount disagreeing.
   --------------------------------------------------------------- */

const PRICES = require('../lib/orders/submission');
const asMoney = (cents) => '$' + (cents / 100).toFixed(2).replace(/.00$/, '');

test('the page quotes the same prices the store records', () => {
  const sunday = asMoney(PRICES.CLASS_PRICE_CENTS);
  const drop = asMoney(PRICES.DROP_IN_PRICE_CENTS);
  assert.ok(classes.indexOf(sunday + ' per guest') > -1, 'the Sunday price (' + sunday + ') is not on the page');
  assert.ok(classes.indexOf(drop + ' per person') > -1, 'the drop-in price (' + drop + ') is not on the page');
  assert.notStrictEqual(sunday, drop, 'the two classes must not quote the same price');
});

test('the drop-in is never described as free', () => {
  // It was, for as long as it had no price. Those three phrases are the ones
  // that were on the page and in the experiences hub card.
  ['No payment needed', 'no booking fee', 'No fee, no experience'].forEach((claim) => {
    assert.strictEqual(count(classes, claim), 0, 'the classes page still says "' + claim + '"');
    assert.strictEqual(count(read('experiences.html'), claim), 0, 'the experiences page still says "' + claim + '"');
  });
});

test('the price Google is shown matches the price charged', () => {
  // The Event JSON-LD carries an offer price; a stale one is served as a
  // search result long after the page itself is right.
  const m = /"offers":{[^}]*"price":"([0-9.]+)"/.exec(classes);
  assert.ok(m, 'no offer price in the class Event schema');
  assert.strictEqual(m[1], String(PRICES.CLASS_PRICE_CENTS / 100),
    'the structured-data price disagrees with what the store charges');
});

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
   reservations.html — the hooks the mid-service pause needs

   The pause is set and lifted without a rebuild, so the page cannot know about
   it at build time — it can only carry the scaffolding for main.js to reveal.
   If that scaffolding goes missing the page keeps taking bookings that
   api/send.js then refuses, and nobody notices until a guest complains.
   --------------------------------------------------------------- */

test('the reserve page carries both halves of the pause swap', () => {
  assert.ok(reservations.indexOf('data-res-form') > -1, 'no [data-res-form] — main.js has no form to hide');
  assert.ok(reservations.indexOf('data-res-paused') > -1, 'no [data-res-paused] — there is nothing to show instead');
  assert.ok(reservations.indexOf('data-res-paused-until') > -1, 'no slot for the reopening time');
});

test('the paused notice is hidden until the server says otherwise', () => {
  const at = reservations.indexOf(PAUSED_OPEN_TAG);
  assert.ok(at > -1, PAUSED_MISSING);
  const tag = reservations.slice(at, reservations.indexOf(GT, at) + 1);
  assert.ok(tag.indexOf(HIDDEN_ATTR) > -1,
    PAUSED_VISIBLE + tag);
});

test('a paused guest is given a way to reach the restaurant', () => {
  const at = reservations.indexOf(PAUSED_OPEN_TAG);
  assert.ok(at > -1, PAUSED_MISSING);
  // The notice runs to the end of the booking card; the next booking card is
  // the form, so stopping there keeps this to the paused block only.
  const end = reservations.indexOf(FORM_OPEN_TAG, at);
  const notice = reservations.slice(at, end > -1 ? end : at + 2000);
  assert.ok(notice.indexOf(TEL_HREF) > -1, NO_PHONE);
  assert.ok(notice.indexOf(MAILTO_HREF) > -1, NO_EMAIL);
});

test('main.js actually asks the server whether bookings are paused', () => {
  const js = read('js/main.js');
  assert.ok(js.indexOf("fetch('/api/status'") > -1, 'nothing fetches /api/status, so the page can never learn about a pause');
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

/* ---------------------------------------------------------------
   The "closed today" banner — the half of a closure a guest can SEE

   A closure blocks the two pickers, which a guest who never opens one never
   meets. The banner is the only line that says the doors are shut, so these
   assertions are about the bytes on the page, on every page, and about it
   saying so ONLY on the day it should.
   --------------------------------------------------------------- */

// "Today" on the restaurant's clock — the same question the generator asked.
const todayEdmonton = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const shutToday = closed.indexOf(todayEdmonton) > -1;

const EVERY_PAGE = ['index.html', 'menu.html', 'visit-us.html', 'reservations.html', 'pasta-shop.html', 'sunday-pasta-classes.html', 'our-story.html'];

test('every page carries the closure list and the banner element', () => {
  EVERY_PAGE.forEach((f) => {
    const html = read(f);
    assert.deepStrictEqual(embedded(html, 'site-closures').closed, closed,
      f + ' ships a different closure list than the CMS holds');
    assert.ok(html.indexOf('id="site-closure"') > -1,
      f + ' has no banner element, so main.js has nothing to reveal tomorrow');
  });
});

test('the banner is visible exactly on a closed day, and hidden otherwise', () => {
  EVERY_PAGE.forEach((f) => {
    const html = read(f);
    const m = /<div class="site-banner site-banner--closed" id="site-closure"([\s\S]*?)>/.exec(html);
    assert.ok(m, f + ' is missing the closure banner');
    const hidden = m[1].indexOf(' hidden') > -1;
    assert.strictEqual(hidden, !shutToday,
      shutToday
        ? f + ' hides the closure notice on a day the restaurant is closed'
        : f + ' ships a visible "we are closed" banner on an open day');
  });
});

test('a closure reason reaches the page it was written for, and no other day', () => {
  const reasons = hours.closureReasons(content);
  const cfg = embedded(read('index.html'), 'site-closures');
  assert.deepStrictEqual(cfg.reasons || {}, reasons,
    'the page ships a different set of reasons than the CMS holds');
  Object.keys(cfg.reasons || {}).forEach((iso) => {
    assert.ok(closed.indexOf(iso) > -1, iso + ' has a reason but is not a closed day');
  });
  if (shutToday && reasons[todayEdmonton]) {
    assert.ok(read('index.html').indexOf('for ' + reasons[todayEdmonton] + '.') > -1,
      'today’s closure has a reason that never made it into the banner');
  }
});

test('on a closed day the banner names the day, and the announcement stands down', () => {
  if (!shutToday) {
    // Open day: the notice must carry no leftover sentence to flash on load.
    assert.ok(read('index.html').indexOf('<span class="site-closure-text"></span>') > -1,
      'the hidden banner was built with text in it — it would flash before main.js hides it');
    return;
  }
  const html = read('index.html');
  assert.ok(html.indexOf('We’re closed today (' + hours.closureLabel(todayEdmonton) + ')') > -1,
    'the banner does not name today — a guest cannot tell which day is meant');
  const ann = /<div class="site-banner" id="site-announcement"([\s\S]*?)>/.exec(html);
  if (ann) {
    assert.ok(ann[1].indexOf(' hidden') > -1,
      'the standing announcement is still showing under a "we are closed" notice');
  }
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
