/* ============================================================
   da Cecot — tests for the site's own analytics (lib/analytics.js).

   What can go wrong and reach Erika:
   - numbers that are wrong (a visitor counted twice, a day split at the UTC
     midnight instead of Edmonton's),
   - text a stranger typed showing up in her admin (fake page names, junk
     referrers),
   - a guest's IP address being stored,
   - the admin numbers being readable without signing in.
   The beacon goes through the real api/send.js handler, and the admin view
   through the real api/admin/orders.js handler.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../.data');
const EVENTS = path.join(DATA_DIR, 'events.json');
let snap = null;
try { snap = fs.readFileSync(EVENTS, 'utf8'); } catch (e) {}
fs.mkdirSync(DATA_DIR, { recursive: true });
try { fs.rmSync(EVENTS, { force: true }); } catch (e) {}
function restore() {
  try { if (snap === null) fs.rmSync(EVENTS, { force: true }); else fs.writeFileSync(EVENTS, snap); } catch (e) {}
}

delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;      // tracking must not depend on email being set up
process.env.SESSION_SECRET = 'test-secret-not-real';

const A = require('../lib/analytics');
const auth = require('../lib/cms/auth');
const send = require('../api/send.js');
const ordersAdmin = require('../api/admin/orders.js');

const failures = [];
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}
const events = () => { try { return JSON.parse(fs.readFileSync(EVENTS, 'utf8')); } catch (e) { return []; } };
const clear = () => { try { fs.rmSync(EVENTS, { force: true }); } catch (e) {} };

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1';
const LAPTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const req = (ua, ip) => ({ headers: { 'user-agent': ua, 'x-forwarded-for': ip || '203.0.113.7' } });
const NOON = Date.parse('2026-10-02T18:00:00Z');          // noon in Edmonton

async function beacon(body, ua, ip) {
  const r = { _s: 0, statusCode: 0, ended: false };
  r.status = (c) => { r._s = c; return r; };
  r.json = () => r;
  r.end = () => { r.ended = true; };
  r.setHeader = () => {};
  await send({ method: 'POST', headers: { 'user-agent': ua || LAPTOP, 'x-forwarded-for': ip || '203.0.113.7' }, body: Object.assign({ action: 'track' }, body) }, r);
  return r;
}

async function run() {
  await test('a page view goes through the real endpoint and answers 204, even with no email set up', async () => {
    clear();
    const r = await beacon({ kind: 'view', path: '/menu.html', ref: 'https://www.google.ca/' });
    assert.strictEqual(r.statusCode, 204);
    const e = events();
    assert.strictEqual(e.length, 1, 'one view, one row');
    assert.strictEqual(e[0].path, '/menu');
    assert.strictEqual(e[0].ref, 'Google');
    assert.strictEqual(e[0].device, 'Computer');
  });

  await test('the guest\'s IP address is never stored', async () => {
    const raw = fs.readFileSync(EVENTS, 'utf8');
    assert.strictEqual(raw.indexOf('203.0.113.7'), -1, 'IP found in the stored events');
    assert.strictEqual(raw.indexOf('Chrome'), -1, 'browser string found in the stored events');
  });

  await test('only the site\'s real pages are stored — nothing a stranger types', async () => {
    clear();
    for (const p of ['/wp-admin', '/admin', '/<script>alert(1)</script>', 'https://evil.example/', '', null, '/cancel-reservation.html']) {
      await A.track({ kind: 'view', path: p }, req(LAPTOP), { now: NOON });
    }
    assert.strictEqual(events().length, 0, 'junk paths must not land in the admin: ' + JSON.stringify(events()));
    await A.track({ kind: 'view', path: '/index.html?utm=x#top' }, req(LAPTOP), { now: NOON });
    await A.track({ kind: 'view', path: '/' }, req(LAPTOP), { now: NOON });
    assert.deepStrictEqual(events().map((e) => e.path), ['/', '/'], 'home under either spelling is one page');
  });

  await test('referrers become a source name, never raw text', async () => {
    assert.strictEqual(A.normRef('https://l.instagram.com/?u=x'), 'Instagram');
    assert.strictEqual(A.normRef('https://m.facebook.com/'), 'Facebook');
    assert.strictEqual(A.normRef('https://www.dacecotfood.com/menu.html'), 'Direct', 'moving between our own pages is not a source');
    assert.strictEqual(A.normRef(''), 'Direct');
    assert.strictEqual(A.normRef('javascript:alert(1)'), 'Direct');
    assert.strictEqual(A.normRef('https://news.example.org/a'), 'news.example.org');
  });

  await test('crawlers and requests with no browser are not counted', async () => {
    clear();
    await A.track({ kind: 'view', path: '/' }, req('Googlebot/2.1 (+http://www.google.com/bot.html)'), { now: NOON });
    await A.track({ kind: 'view', path: '/' }, req('curl/8.4.0'), { now: NOON });
    await A.track({ kind: 'view', path: '/' }, { headers: {} }, { now: NOON });
    assert.strictEqual(events().length, 0);
  });

  await test('one person on one day is one visitor; a second person is a second', async () => {
    clear();
    for (let i = 0; i < 3; i++) await A.track({ kind: 'view', path: '/' }, req(PHONE, '198.51.100.1'), { now: NOON });
    await A.track({ kind: 'view', path: '/menu' }, req(PHONE, '198.51.100.1'), { now: NOON });
    await A.track({ kind: 'view', path: '/' }, req(LAPTOP, '198.51.100.2'), { now: NOON });
    const s = await A.summary(7, { now: NOON });
    assert.strictEqual(s.totals.views, 5);
    assert.strictEqual(s.totals.visitors, 2, 'a visitor reloading the page is still one visitor');
    const home = s.pages.find((p) => p.path === '/');
    assert.strictEqual(home.views, 4); assert.strictEqual(home.visitors, 2);
    assert.strictEqual(home.label, 'Home');
    assert.deepStrictEqual(s.devices.map((d) => d.device + ':' + d.share).sort(), ['Computer:50', 'Phone:50']);
  });

  await test('the same person tomorrow cannot be linked to today', async () => {
    const today = A.visitorHash('2026-10-02', '198.51.100.1', PHONE);
    assert.strictEqual(today, A.visitorHash('2026-10-02', '198.51.100.1', PHONE));
    assert.notStrictEqual(today, A.visitorHash('2026-10-03', '198.51.100.1', PHONE));
  });

  await test('days are Edmonton days, not UTC days', async () => {
    clear();
    // 11:30 PM Oct 2 in Edmonton is already Oct 3 in UTC.
    await A.track({ kind: 'view', path: '/' }, req(LAPTOP), { now: Date.parse('2026-10-03T05:30:00Z') });
    assert.strictEqual(events()[0].day, '2026-10-02');
  });

  await test('the period is compared with the one before it', async () => {
    clear();
    await A.track({ kind: 'view', path: '/' }, req(LAPTOP, '1.1.1.1'), { now: NOON });
    await A.track({ kind: 'view', path: '/' }, req(LAPTOP, '1.1.1.2'), { now: NOON - 8 * 86400000 });   // previous 7-day window
    await A.track({ kind: 'view', path: '/' }, req(LAPTOP, '1.1.1.3'), { now: NOON - 20 * 86400000 });  // outside both
    const s = await A.summary(7, { now: NOON });
    assert.strictEqual(s.totals.visitors, 1);
    assert.strictEqual(s.previous.visitors, 1);
    assert.strictEqual(s.daily.length, 7, 'one bar per day, empty days included');
    assert.strictEqual(s.daily[6].day, '2026-10-02');
    assert.strictEqual(s.daily[6].visitors, 1);
    assert.strictEqual(s.countingSince, '2026-09-12');
  });

  await test('gift cards: seen once per visit, clicks counted, junk slugs dropped', async () => {
    clear();
    await A.track({ kind: 'view', path: '/gift-cards.html' }, req(PHONE), { now: NOON });
    await A.track({ kind: 'gift', views: ['pasta-con-erika', 'pasta-con-erika', 'one-bag-fresh-pasta', 'not-a-card', '<b>x</b>'] }, req(PHONE), { now: NOON });
    await A.track({ kind: 'gift', click: 'pasta-con-erika' }, req(PHONE), { now: NOON });
    await A.track({ kind: 'gift', click: 'free-money' }, req(PHONE), { now: NOON });
    const s = await A.summary(7, { now: NOON });
    const erika = s.gifts.cards.find((c) => c.slug === 'pasta-con-erika');
    assert.strictEqual(erika.views, 1, 'seen twice in one beacon is one view');
    assert.strictEqual(erika.clicks, 1);
    assert.strictEqual(erika.rate, 100);
    assert.strictEqual(s.gifts.clicks, 1, 'an unknown card is not a click');
    assert.strictEqual(s.gifts.pageViews, 1);
    assert.strictEqual(s.gifts.cards.length, 7, 'only the cards on the page are listed');
    assert.strictEqual(s.gifts.cards[0].slug, 'pasta-con-erika', 'most-clicked first');
  });

  await test('the admin numbers need a signed-in admin', async () => {
    const r = { _s: 0, _j: null, statusCode: 0 };
    r.status = (c) => { r._s = c; r.statusCode = c; return r; };
    r.json = (j) => { r._j = j; return r; };
    r.setHeader = () => {}; r.end = () => {};
    await ordersAdmin({ method: 'GET', url: '/api/admin/orders?sub=analytics&days=30', headers: {} }, r);
    assert.strictEqual(r._s, 401, 'signed-out request got ' + r._s + ' ' + JSON.stringify(r._j));
  });

  await test('signed in, the admin endpoint returns the summary', async () => {
    const real = auth.requireAuth;
    auth.requireAuth = () => ({ email: 'test@local.invalid' });
    try {
      const r = { _s: 0, _j: null };
      r.status = (c) => { r._s = c; return r; };
      r.json = (j) => { r._j = j; return r; };
      r.setHeader = () => {};
      await ordersAdmin({ method: 'GET', url: '/api/admin/orders?sub=analytics&days=90', headers: {} }, r);
      assert.strictEqual(r._s, 200, JSON.stringify(r._j));
      assert.strictEqual(r._j.range.days, 90);
      assert.ok(Array.isArray(r._j.gifts.cards));
    } finally { auth.requireAuth = real; }
  });
}

run().then(finish).catch((e) => { failures.push({ name: 'analytics harness', message: e && e.stack }); finish(); });

function finish() {
  restore();
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
    process.exit(1);
  }
  console.log('✓ ' + passed + ' analytics tests passed');
}
