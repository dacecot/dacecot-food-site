/* ============================================================
   da Cecot — site analytics, counted by the site itself.

   No cookies, no third party, no raw IP stored. Each page sends one small
   beacon to /api/send ({ action: 'track' }). The server works out the rest:
   the day (Edmonton), the device (from the browser string), and a `visitor`
   hash — HMAC(secret, day | IP | browser) — that tells two people apart on
   the same day and changes every day, so no one can be followed across days.

   Anything a visitor's browser sends is checked against fixed lists before it
   is stored: a path must be one of the site's real pages, a gift card must be
   one of the real cards. A spammer can inflate a count; they cannot write
   their own text into Erika's admin.

   Counted only from pages that run our JavaScript, so most crawlers never
   appear; the obvious ones that do are dropped by their browser string.
   ============================================================ */

const crypto = require('crypto');
const store = require('./orders/store');
const R = require('./orders/reservations');
const GIFT = require('./giftcards');

// The site's public pages: path → label shown in the admin.
const PAGES = {
  '/': 'Home', '/menu': 'Menu', '/experiences': 'Experiences', '/sunday-pasta-classes': 'Pasta Classes',
  '/private-events': 'Private Events', '/catering': 'Catering', '/pasta-shop': 'Pasta Shop & Meals',
  '/our-story': 'Our Story', '/visit-us': 'Visit Us', '/reservations': 'Reserve', '/partnerships': 'Catering & Wholesale',
  '/gift-cards': 'Gift Cards', '/404': 'Page not found'
};
const GIFT_SLUGS = GIFT.CARDS.map((c) => c.slug);
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|facebookexternalhit|embedly|whatsapp|python|curl|wget/i;
const MAX_DAYS = 90;

// '/menu.html', '/menu', '/index.html', '/' → the PAGES key, or null.
function normPath(p) {
  let s = String(p || '').split(/[?#]/)[0].trim().toLowerCase();
  if (!s.startsWith('/')) return null;
  s = s.replace(/\.html$/, '').replace(/\/+$/, '');
  if (s === '' || s === '/index') s = '/';
  return Object.prototype.hasOwnProperty.call(PAGES, s) ? s : null;
}

// document.referrer → a source name. Our own pages and empty → 'Direct'.
function normRef(r) {
  let host;
  try { host = new URL(String(r || '')).hostname.toLowerCase(); } catch (e) { return 'Direct'; }
  host = host.replace(/^www\./, '');
  if (!host || host.endsWith('dacecotfood.com') || host === 'localhost') return 'Direct';
  if (/(^|\.)google\./.test(host)) return 'Google';
  if (/(^|\.)bing\.com$/.test(host)) return 'Bing';
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram';
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(host)) return 'Facebook';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'TikTok';
  if (/(^|\.)ubereats\.com$/.test(host)) return 'Uber Eats';
  if (/(^|\.)yelp\./.test(host)) return 'Yelp';
  if (/(^|\.)squareup\.com$|(^|\.)square\.site$/.test(host)) return 'Square';
  if (!/^[a-z0-9.-]{1,60}$/.test(host)) return 'Other';
  return host;
}

function deviceOf(ua) {
  ua = String(ua || '');
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'Phone';
  return 'Computer';
}

function clientIp(req) {
  const xff = req && req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || '';
}

function visitorHash(day, ip, ua) {
  const secret = process.env.SESSION_SECRET || 'dacecot-analytics';
  return crypto.createHmac('sha256', secret).update(day + '|' + ip + '|' + ua).digest('base64url').slice(0, 16);
}

/* Record one beacon. Never throws to the caller: analytics must never break a
   page. Returns the number of rows written (the tests read this). */
async function track(body, req, opts) {
  const now = (opts && opts.now != null) ? Number(opts.now) : Date.now();
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  if (!ua || BOT.test(ua)) return 0;
  const day = R.edmontonDateOf(now);
  const base = { day, device: deviceOf(ua), visitor: visitorHash(day, clientIp(req), ua) };
  const rows = [];

  if (body.kind === 'view') {
    const p = normPath(body.path);
    if (!p) return 0;
    rows.push(Object.assign({ kind: 'view', path: p, ref: normRef(body.ref) }, base));
  } else if (body.kind === 'gift') {
    const views = Array.isArray(body.views) ? body.views.slice(0, GIFT_SLUGS.length) : [];
    Array.from(new Set(views)).forEach((s) => {
      if (GIFT_SLUGS.indexOf(s) > -1) rows.push(Object.assign({ kind: 'gift_view', slug: s }, base));
    });
    if (body.click && GIFT_SLUGS.indexOf(body.click) > -1) rows.push(Object.assign({ kind: 'gift_click', slug: body.click }, base));
  }

  try {
    await store.init();
    for (const r of rows) await store.recordEvent(r);
    return rows.length;
  } catch (e) {
    console.error('analytics: record failed', e && e.message);
    return 0;
  }
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
function uniq(list) { return new Set(list.map((e) => e.visitor)).size; }
function groupCount(list, key) {
  const m = new Map();
  list.forEach((e) => {
    const k = e[key];
    if (!m.has(k)) m.set(k, { views: 0, visitors: new Set() });
    const g = m.get(k); g.views++; g.visitors.add(e.visitor);
  });
  return Array.from(m.entries()).map(([k, g]) => ({ key: k, views: g.views, visitors: g.visitors.size }));
}

/* The admin's numbers for the last `days` days, ending today (Edmonton), and
   the same-length period before it for comparison. */
async function summary(days, opts) {
  const now = (opts && opts.now != null) ? Number(opts.now) : Date.now();
  days = Math.min(MAX_DAYS, Math.max(1, Number(days) || 30));
  const until = R.edmontonDateOf(now);
  const since = R.addDaysISO(until, -(days - 1));
  const prevUntil = R.addDaysISO(since, -1);
  const prevSince = R.addDaysISO(prevUntil, -(days - 1));

  await store.init();
  const [all, first] = await Promise.all([store.listEvents(prevSince, until), store.firstEventDay()]);
  const cur = all.filter((e) => e.day >= since);
  const prev = all.filter((e) => e.day < since);
  const views = cur.filter((e) => e.kind === 'view');
  const prevViews = prev.filter((e) => e.kind === 'view');

  const daily = [];
  for (let d = since; d <= until; d = R.addDaysISO(d, 1)) {
    const v = views.filter((e) => e.day === d);
    daily.push({ day: d, views: v.length, visitors: uniq(v) });
  }

  const pages = groupCount(views, 'path').map((g) => ({ path: g.key, label: PAGES[g.key] || g.key, views: g.views, visitors: g.visitors }))
    .sort((a, b) => b.views - a.views);
  const sources = groupCount(views, 'ref').map((g) => ({ source: g.key, views: g.views, visitors: g.visitors }))
    .sort((a, b) => b.visitors - a.visitors).slice(0, 10);
  const devTotal = uniq(views);
  const devices = groupCount(views, 'device').map((g) => ({ device: g.key, visitors: g.visitors, share: pct(g.visitors, devTotal) }))
    .sort((a, b) => b.visitors - a.visitors);

  const giftPage = views.filter((e) => e.path === '/gift-cards');
  const cards = GIFT.CARDS.filter((c) => c.ready).map((c) => {
    const seen = cur.filter((e) => e.kind === 'gift_view' && e.slug === c.slug);
    const clicked = cur.filter((e) => e.kind === 'gift_click' && e.slug === c.slug);
    return { slug: c.slug, title: c.title, price: c.price, views: seen.length, clicks: clicked.length, rate: pct(clicked.length, seen.length) };
  }).sort((a, b) => b.clicks - a.clicks || b.views - a.views);

  return {
    range: { days, since, until },
    countingSince: first,
    totals: { visitors: uniq(views), views: views.length },
    previous: { visitors: uniq(prevViews), views: prevViews.length },
    daily, pages, sources, devices,
    gifts: {
      pageViews: giftPage.length,
      pageVisitors: uniq(giftPage),
      clicks: cur.filter((e) => e.kind === 'gift_click').length,
      cards
    }
  };
}

module.exports = { PAGES, MAX_DAYS, normPath, normRef, deviceOf, visitorHash, track, summary };
