/* ============================================================
   da Cecot Food — static site generator
   Outputs plain static HTML (great for SEO) from shared templates.
   Run:  node .claude/build.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://www.dacecotfood.com';
// Cache-busting build version — appended to CSS/JS so browsers (esp. mobile
// Safari) always fetch the latest assets after each deploy instead of stale cache.
const VERSION = Date.now();

/* ---- shared business data ---- */
const NAP = {
  name: 'da Cecot Food Inc',
  phone: '(825) 888-4218',
  phoneHref: '+18258884218',
  email: 'info@dacecotfood.com',
  street: 'Whyte Ave (82 Ave) & 104 Street',
  city: 'Edmonton',
  region: 'AB',
  country: 'CA',
  mapsQuery: 'Whyte Avenue and 104 Street, Edmonton, AB'
};
const MAPS_EMBED = 'https://www.google.com/maps?q=' + encodeURIComponent(NAP.mapsQuery) + '&output=embed';
const MAPS_LINK = 'https://www.google.com/maps?q=' + encodeURIComponent(NAP.mapsQuery);

const IMG = {
  hero:       'images/food/homepage-hero.jpg',
  pasta:      'images/food/ravioli-butter-sage.jpg',
  food:       'images/food/cicchetti.jpg',
  greenpasta: 'images/raw-pasta/raw-pasta.jpg',
  family:     'images/general/cecot-family.jpg',
  about2:     'images/general/whatsapp-1.jpg',
  aboutHero:  'images/general/whatsapp-2.jpg',
  storefront: 'images/general/storefront-evening.jpg',
  product:    'images/food/fresh-ravioli.jpg',
  pastawine:  'images/general/erica/_MG_1100.jpg',
  wine:       'images/sauces/salsa-al-baffo.jpg',
  dining:     'images/general/photo-6.png',
  freshpasta: 'images/raw-pasta/caserecce.jpg',
  sauce:      'images/food/ragu.jpg',
  lasagna:    'images/food/bosco-romagno.jpg',
  partnerbg:  'images/general/photo-5.png',
  icon:       'images/logos/circle-logo.png',
  logo:       'images/logos/new-logo.png'
};
const OG_DEFAULT = IMG.pasta;

/* ---- navigation model ---- */
const EXPERIENCE_PAGES = [
  { slug: 'experiences',           label: 'Experiences Overview' },
  { slug: 'sunday-pasta-classes',  label: 'Sunday Pasta Classes' },
  { slug: 'pasta-drop-in',         label: 'Public Pasta Drop-In' },
  { slug: 'private-events',        label: 'Private Events' },
];

const MENU_PAGES = [
  { slug: 'menu',     label: 'Our Menu' },
  { slug: 'catering', label: 'Catering' },
];

/* ============================================================
   Template helpers
   ============================================================ */
function img(src, alt, cls, extra) {
  return `<img src="${src}" alt="${alt}"${cls ? ` class="${cls}"` : ''} loading="lazy" decoding="async"${extra || ''}>`;
}

function header(active) {
  const link = (slug, label, key) =>
    `<li><a href="${slug}.html"${active === key ? ' class="active" aria-current="page"' : ''}>${label}</a></li>`;
  const menuItems = MENU_PAGES.map(p =>
    `<li><a href="${p.slug}.html"${active === p.slug ? ' class="active" aria-current="page"' : ''}>${p.label}</a></li>`
  ).join('\n          ');
  const menuActive = MENU_PAGES.some(p => p.slug === active);
  const expItems = EXPERIENCE_PAGES.map(p =>
    `<li><a href="${p.slug}.html"${active === p.slug ? ' class="active" aria-current="page"' : ''}>${p.label}</a></li>`
  ).join('\n          ');
  const expActive = EXPERIENCE_PAGES.some(p => p.slug === active);
  return `  <header class="header">
    <nav class="nav" aria-label="Primary">
      <a href="index.html" class="logo" aria-label="da Cecot Food — home">da Cecot</a>
      <button class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="primary-nav"><span></span><span></span><span></span></button>
      <div class="nav-backdrop" hidden></div>
      <ul class="nav-links" id="primary-nav">
        <li class="nav-drawer-head"><span class="nav-drawer-title">da Cecot</span><button class="nav-close" aria-label="Close menu">&times;</button></li>
        ${link('index', 'Home', 'home')}
        <li class="has-dropdown">
          <button class="dropdown-toggle${menuActive ? ' active' : ''}" aria-expanded="false" aria-haspopup="true">Menu <span class="caret">▾</span></button>
          <ul class="dropdown-menu">
          ${menuItems}
          </ul>
        </li>
        <li class="has-dropdown">
          <button class="dropdown-toggle${expActive ? ' active' : ''}" aria-expanded="false" aria-haspopup="true">Experiences <span class="caret">▾</span></button>
          <ul class="dropdown-menu">
          ${expItems}
          </ul>
        </li>
        ${link('pasta-shop', 'Pasta Shop', 'pasta-shop')}
        ${link('our-story', 'Our Story', 'our-story')}
        ${link('reservations', 'Reserve', 'reservations')}
        ${link('visit-us', 'Visit Us', 'visit-us')}
        <li class="nav-drawer-foot">
          <a class="nav-drawer-phone" href="tel:${NAP.phoneHref}">${NAP.phone}</a>
          <a class="btn btn--green nav-drawer-cta" href="reservations.html">Book a Reservation</a>
        </li>
      </ul>
    </nav>
  </header>`;
}

function breadcrumb(trail) {
  // trail: array of {slug,label}; last item is current (no link)
  const parts = trail.map((t, i) => {
    if (i === trail.length - 1) return `<span aria-current="page">${t.label}</span>`;
    return `<a href="${t.slug}.html">${t.label}</a>`;
  }).join(' &nbsp;&rsaquo;&nbsp; ');
  return `  <nav class="breadcrumb" aria-label="Breadcrumb">${parts}</nav>`;
}

function breadcrumbSchema(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.label,
      item: `${BASE}/${t.slug === 'index' ? '' : t.slug + '.html'}`
    }))
  };
}

function footer() {
  const ig = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.3.8-.4.4-.6.8-.8 1.3-.2.4-.3 1-.4 2.1C2.6 9.9 2.6 10.3 2.6 12s0 2.1.1 3.3c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.3.4.4.8.6 1.3.8.4.2 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.3-.8.4-.4.6-.8.8-1.3.2-.4.3-1 .4-2.1.1-1.2.1-1.6.1-3.3s0-2.1-.1-3.3c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.3-.4-.4-.8-.6-1.3-.8-.4-.2-1-.3-2.1-.4-1.2-.1-1.6-.1-4.7-.1zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8zm0 8.1a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm6.2-8.3a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0z"/></svg>`;
  const fb = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8.5h2.5V5.2C16 5.1 14.9 5 13.7 5 11.1 5 9.3 6.6 9.3 9.5v2.3H6.5V15h2.8v8h3.4v-8h2.7l.4-3.2h-3.1V9.8c0-.9.3-1.3 1.3-1.3z"/></svg>`;
  return `  <footer class="footer">
    <div class="footer__top">
      <div class="footer__brand">
        <div class="footer__logo">da Cecot</div>
        <div class="footer__social">
          <a href="https://www.instagram.com/cecotkitchen/" target="_blank" rel="noopener" aria-label="da Cecot on Instagram">${ig}</a>
          <a href="https://www.facebook.com/" target="_blank" rel="noopener" aria-label="da Cecot on Facebook">${fb}</a>
        </div>
      </div>
      <nav class="footer__links" aria-label="Footer navigation">
        <a href="index.html">Home</a>
        <a href="menu.html">Menu</a>
        <a href="experiences.html">Experiences</a>
        <a href="pasta-shop.html">Pasta Shop</a>
        <a href="our-story.html">Our Story</a>
        <a href="visit-us.html">Visit Us</a>
        <a href="partnerships.html">Catering &amp; Wholesale</a>
        <a href="reservations.html">Reserve a Table</a>
      </nav>
      <p class="footer__contact">
        <a href="tel:${NAP.phoneHref}">${NAP.phone}</a>
        <a href="mailto:${NAP.email}">${NAP.email}</a>
      </p>
    </div>
    <div class="footer__bottom">
      <div class="footer__bottom-inner">
        <p>© 2025 da Cecot Food Inc. · Made by hand on Whyte Avenue, Edmonton.</p>
        <p class="footer__credit">Built by <a href="https://bespokeautomations.ca" target="_blank" rel="noopener">Bespoke Automations</a> &amp; <a href="https://www.unconventionalgroup.ca" target="_blank" rel="noopener">Unconventional Group</a></p>
      </div>
    </div>
  </footer>

  <button class="back-to-top" aria-label="Back to top">↑</button>
  <script src="js/main.js?v=${VERSION}"></script>`;
}

/* ---- opening hours for schema ---- */
const HOURS_SPEC = [
  { d: ['Monday', 'Tuesday'], o: '12:00', c: '15:00' },
  { d: ['Monday', 'Tuesday'], o: '16:30', c: '20:00' },
  { d: ['Thursday'], o: '16:00', c: '20:00' },
  { d: ['Friday'], o: '11:30', c: '15:00' },
  { d: ['Friday'], o: '16:00', c: '21:00' },
  { d: ['Saturday'], o: '12:00', c: '21:00' },
  { d: ['Sunday'], o: '11:30', c: '16:00' }
].map(h => ({
  '@type': 'OpeningHoursSpecification',
  dayOfWeek: h.d,
  opens: h.o,
  closes: h.c
}));

const POSTAL_ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: '82 Avenue (Whyte Avenue) & 104 Street',
  addressLocality: NAP.city,
  addressRegion: NAP.region,
  addressCountry: NAP.country
};

function restaurantSchema(extra) {
  return Object.assign({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': BASE + '/#restaurant',
    name: NAP.name,
    description: 'Family-run Italian pasta bar and street food kitchen serving authentic comfort food in Edmonton, Alberta.',
    url: BASE,
    telephone: NAP.phone,
    email: NAP.email,
    image: `${BASE}/${IMG.pasta}`,
    servesCuisine: ['Italian', 'Mediterranean'],
    priceRange: '$$',
    address: POSTAL_ADDRESS,
    areaServed: ['Millwoods', 'Terwillegar', 'Chappelle', 'Heritage Valley', 'Edmonton'],
    openingHoursSpecification: HOURS_SPEC,
    acceptsReservations: 'True',
    award: 'Winner — Canadian Choice Award 2026, Italian Restaurants',
    menu: BASE + '/menu.html',
    sameAs: ['https://www.instagram.com/cecotkitchen/']
  }, extra || {});
}

function faqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };
}

/* ---- FAQ rendering (visual, matches FAQPage schema) ---- */
function faqBlock(faqs) {
  const items = faqs.map(f => `        <div class="faq-item">
          <h3><button class="faq-q" aria-expanded="false">${f.q}</button></h3>
          <div class="faq-a"><div class="inner"><p>${f.a}</p></div></div>
        </div>`).join('\n');
  return `      <div class="faq reveal">
${items}
      </div>`;
}

/* ============================================================
   Page assembler
   ============================================================ */
function page(opts) {
  // opts: {slug,title,description,h1(unused),ogImage,active,schema:[],body}
  const url = `${BASE}/${opts.slug === 'index' ? '' : opts.slug + '.html'}`;
  const canonical = opts.slug === 'index' ? BASE + '/' : url;
  const ogRaw = opts.ogImage || OG_DEFAULT;
  const og = ogRaw.startsWith('http') ? ogRaw : `${BASE}/${ogRaw}`;
  const schemaBlocks = (opts.schema || []).map(s =>
    `  <script type="application/ld+json">${JSON.stringify(s)}</script>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
  <meta name="description" content="${opts.description}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#4a1e18">
  <meta name="author" content="da Cecot Food Inc">

  <!-- Open Graph -->
  <meta property="og:type" content="${opts.slug === 'index' ? 'restaurant.restaurant' : 'website'}">
  <meta property="og:site_name" content="da Cecot Food Inc">
  <meta property="og:title" content="${opts.title}">
  <meta property="og:description" content="${opts.description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${og}">
  <meta property="og:locale" content="en_CA">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${opts.title}">
  <meta name="twitter:description" content="${opts.description}">
  <meta name="twitter:image" content="${og}">

  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="css/styles.min.css?v=${VERSION}">
${schemaBlocks}
</head>
<body>

${header(opts.active)}

  <main id="main">
${opts.body}
  </main>

${footer()}
</body>
</html>
`;
}

/* ============================================================
   CTA helper
   ============================================================ */
function cta(href, text, variant) {
  return `<div class="btn-wrap"><a href="${href}" class="btn btn--${variant || 'green'}">${text}</a></div>`;
}

/* ============================================================
   PAGE CONTENT
   ============================================================ */
const pages = [];

/* ---------- HOME ---------- */
pages.push(page({
  slug: 'index',
  active: 'home',
  title: 'da Cecot Food | Italian Comfort Food in Edmonton',
  description: 'Family-run Italian pasta bar & street food in Edmonton. Fresh handmade pasta, slow-cooked sauces, dine in or take out. Explore the menu & book a table.',
  ogImage: IMG.hero,
  schema: [restaurantSchema({ aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '127' } })],
  body: `    <section class="hero hero--home hero--parallax" style="background-image:url('${IMG.hero}');">
      <div class="hero__inner reveal">
        <span class="label">da Cecot · On Whyte Avenue, Edmonton</span>
        <h1 class="hero__brand">Fresh Handmade Pasta on Whyte Ave</h1>
        <p class="hero__tag">Handmade pasta, Italian hospitality, and a table where everyone belongs. Crafted daily on Whyte Avenue by the Cecot family — inspired by the traditions of sharing food, stories, and meaningful moments around the table.</p>
        <div class="btn-group">
          <a href="reservations.html" class="btn btn--green">Reserve a Table</a>
          <a href="experiences.html" class="btn btn--brown">Explore Experiences</a>
          <a href="pasta-shop.html" class="btn btn--terra">Order Fresh Pasta</a>
        </div>
      </div>
      <a class="hero__scroll" href="#kitchen" aria-label="Scroll to content"><span></span></a>
    </section>

    <section id="kitchen" class="section section--cream" aria-labelledby="kitchen-h">
      <div class="container">
        <div class="two-col menu-row reveal">
          <figure class="menu-photo zoom">${img('images/food/italian-kitchen.jpg', 'The da Cecot team making fresh pasta in their warm Italian kitchen, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label" style="color:var(--terracotta);">Our Italian Kitchen</span>
            <h2 id="kitchen-h">A warm Italian home, where pasta is made by hand.</h2>
            <p>da Cecot is an Italian family kitchen built on a love of hospitality, tradition, and good food shared with others. Inspired by our family's roots in Friuli Venezia Giulia, everything we serve is made with care and meant to be shared.</p>
            <p>Join a pasta class, gather around our family table, or celebrate a special occasion. At da Cecot, food is only the beginning.</p>
            <div class="btn-group">
              <a href="our-story.html" class="btn btn--terra">Our Story</a>
              <a href="experiences.html" class="btn btn--brown">Explore Experiences</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--olive" aria-labelledby="take-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:54px;">
          <span class="label" style="color:var(--terracotta);">Take Home</span>
          <h2 id="take-h">Fresh pasta for your own table.</h2>
          <p>Take our handmade pasta home and finish it your way. Available fresh from our Pasta Shop.</p>
        </div>
        <div class="offer-grid reveal" data-stagger>
          <a class="offer-card" href="pasta-shop.html">
            <div class="offer-card__img zoom">${img('images/general/erica/days-rolling.jpg', 'Erika rolling fresh pasta by hand at da Cecot, Edmonton')}</div>
            <div class="offer-card__body"><h3>Fresh Pasta</h3><p>Available in 450g and 1kg — vegan semolina shapes and silky egg pasta, made fresh daily.</p></div>
          </a>
          <a class="offer-card" href="pasta-shop.html">
            <div class="offer-card__img zoom">${img(IMG.product, 'Handmade ravioli with rotating seasonal fillings from da Cecot, Edmonton')}</div>
            <div class="offer-card__body"><h3>Ravioli</h3><p>Handmade in small batches with rotating seasonal fillings.</p></div>
          </a>
          <a class="offer-card" href="pasta-shop.html">
            <div class="offer-card__img zoom">${img(IMG.sauce, 'Small-batch house sauces from da Cecot, Edmonton')}</div>
            <div class="offer-card__body"><h3>House Sauces</h3><p>Prepared in small batches and ready to pair with your favourite pasta.</p></div>
          </a>
          <a class="offer-card" href="pasta-shop.html">
            <div class="offer-card__img zoom">${img(IMG.greenpasta, 'Family Pasta Bundle from da Cecot, Edmonton — fresh pasta, sauces, freezer-friendly')}</div>
            <div class="offer-card__body"><h3>Family Bundle</h3><p>A simple way to keep authentic Italian meals ready at home.</p></div>
          </a>
        </div>
        <div class="btn-group" style="justify-content:center; margin-top:32px;">
          <a href="pasta-shop.html" class="btn btn--terra">Visit Pasta Shop</a>
          <a href="catering.html" class="btn btn--brown">Catering &amp; Wholesale</a>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="reviews-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:54px;">
          <span class="label" style="color:var(--warm-brown);">Loved in the Neighbourhood</span>
          <h2 id="reviews-h">What our guests are saying.</h2>
          <div class="rating">
            <span class="rating__stars" aria-hidden="true">★★★★★</span>
            <span class="rating__score"><strong>4.8</strong> out of 5</span>
            <span class="rating__src">Based on Google reviews</span>
          </div>
        </div>
        <div class="review-grid reveal" data-stagger>
          <figure class="review-card">
            <div class="review-card__stars" aria-hidden="true">★★★★★</div>
            <blockquote>"The most authentic pasta in Edmonton, hands down. You can taste that everything is made fresh and with love. The Caserecce with bolognese is unreal."</blockquote>
            <figcaption>— Marco R.</figcaption>
          </figure>
          <figure class="review-card">
            <div class="review-card__stars" aria-hidden="true">★★★★★</div>
            <blockquote>"A hidden gem on Whyte Ave. The family makes you feel like you've been coming for years. We did the pasta class and it was the highlight of our month."</blockquote>
            <figcaption>— Janelle T.</figcaption>
          </figure>
          <figure class="review-card">
            <div class="review-card__stars" aria-hidden="true">★★★★★</div>
            <blockquote>"Cozy, welcoming, and the food is incredible. The tiramisu is the best I've had outside of Italy. We'll be back every week."</blockquote>
            <figcaption>— Daniel & Sofia</figcaption>
          </figure>
        </div>
        <div class="btn-wrap text-center"><a href="https://www.google.com/maps?q=da+Cecot+Food,+Edmonton" target="_blank" rel="noopener" class="btn btn--green">Read More on Google</a></div>
      </div>
    </section>

    <section class="section section--brown" id="visit" aria-labelledby="visit-h">
      <div class="container">
        <div class="visit reveal">
          <div class="visit__info">
            <span class="label">Located on Whyte Ave</span>
            <h2 id="visit-h">Visit us in Edmonton.</h2>
            <p>You'll find da Cecot on Whyte Avenue (82 Ave) at 104 Street — in the heart of Old Strathcona. Come dine in, grab takeout, or join us for a weekend experience.</p>
            <ul class="visit__list">
              <li><span>Address</span><a href="${MAPS_LINK}" target="_blank" rel="noopener">Whyte Ave (82 Ave) &amp; 104 Street, Edmonton, AB</a></li>
              <li><span>Phone</span><a href="tel:${NAP.phoneHref}">${NAP.phone}</a></li>
              <li><span>Email</span><a href="mailto:${NAP.email}">${NAP.email}</a></li>
            </ul>
            <div class="visit__hours">
              <h3>Hours</h3>
              <table>
                <tr><th>Mon &amp; Tue</th><td>12 – 3 PM · 4:30 – 8 PM</td></tr>
                <tr><th>Wed</th><td>Closed</td></tr>
                <tr><th>Thu</th><td>4 – 8 PM</td></tr>
                <tr><th>Fri</th><td>11:30 AM – 3 PM · 4 – 9 PM</td></tr>
                <tr><th>Sat</th><td>12 – 9 PM</td></tr>
                <tr><th>Sun</th><td>11:30 AM – 4 PM</td></tr>
                <tr><th>Sunday Pasta Classes</th><td>5 – 9 PM</td></tr>
              </table>
              <p style="margin-top:14px; opacity:0.78; font-size:0.92em;"><em>First Sunday of every month: closed.</em></p>
            </div>
            <div class="btn-group">
              <a href="reservations.html" class="btn btn--terra">Reserve a Table</a>
              <a href="${MAPS_LINK}" target="_blank" rel="noopener" class="btn btn--ghost">Get Directions</a>
            </div>
          </div>
          <figure class="visit__map zoom" style="margin:0;">
            <img src="${IMG.storefront}" alt="The da Cecot storefront on Whyte Avenue at night — warm lights, guests dining inside" loading="lazy" decoding="async" style="width:100%; height:100%; object-fit:cover; border-radius:10px;">
          </figure>
        </div>
      </div>
    </section>`
}));

/* ---------- MENU (hub: buttons open PDFs — replace files in /menus to update) ---------- */
const menuFaqs = [
  { q: 'Where can I see the current da Cecot menus?', a: 'Right on our menu page — choose Lunch, Dinner, Drinks & Dessert, Kids, or Gluten-Free and the latest menu opens instantly. Menus change with the seasons and our handmade production.' },
  { q: 'What is the Ravioli Atelier?', a: 'Each week we prepare a small selection of handmade ravioli inspired by regional Italian traditions, seasonal ingredients, and the creativity of our kitchen — available Friday and Saturday evenings in limited quantities. Reservations recommended.' },
  { q: 'Can you accommodate dietary restrictions?', a: 'Yes — we offer a dedicated gluten-free menu and vegan pasta options. Call us ahead at (825) 888-4218 with any questions about ingredients, allergens, or to place a large order in advance.' }
];
const menuCards = [
  { name: 'Dinner Menu', file: 'menus/dinner-menu.pdf', d: 'Antipasti, handmade pasta, Ravioli Atelier, secondi, desserts, and evening specials.', ready: true },
  { name: 'Drink Menu', file: 'menus/drink-menu.pdf', d: 'Espresso, moka coffee, Italian drinks, and more.', ready: true },
  { name: 'Lunch Menu', d: 'Fresh pasta, quick lunches, and comforting Italian dishes.', ready: false },
  { name: 'Liquor Menu', d: 'Wine, beer, spirits, and Italian aperitivi.', ready: false },
  { name: 'Gluten-Free Menu', d: 'Gluten-free pasta options and dishes prepared with care.', ready: false },
  { name: 'Kids Menu', d: 'Simple, comforting pasta options made for younger guests.', ready: false }
];
pages.push(page({
  slug: 'menu',
  active: 'menu',
  title: 'Menu | da Cecot, Edmonton — Lunch, Dinner, Kids & Gluten-Free',
  description: 'View da Cecot menus: lunch, dinner, drinks & dessert, kids, and gluten-free — plus the Ravioli Atelier, Friday & Saturday evenings on Whyte Avenue.',
  ogImage: IMG.pasta,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'menu', label: 'Menu' }]),
    faqSchema(menuFaqs)
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'menu', label: 'Menu' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('images/food/menu-hero.jpg');" aria-labelledby="menu-h1">
      <div class="hero__inner reveal">
        <span class="label">Eat With Us</span>
        <h1 id="menu-h1">Our Menu</h1>
        <p>Fresh pasta, handmade ravioli, Italian comfort food, espresso, desserts, and family-style dining on Whyte Avenue.</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="choose-menu-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:16px;">
          <span class="label" style="color:var(--terracotta);">Choose a Menu</span>
          <h2 id="choose-menu-h">Choose a menu.</h2>
          <p>Our menus change with the seasons, our handmade production, and the ingredients available in our kitchen. View the latest menu below.</p>
        </div>
        <div class="menu-promo__track menu-promo__track--lg reveal" aria-hidden="true" style="margin-bottom:38px;">
          <img class="menu-promo__bike" src="images/general/bike-logo.png" alt="" loading="lazy" decoding="async">
        </div>
        <div class="info-grid info-grid--compact reveal" data-stagger style="text-align:center;">
${menuCards.map(m => `          <div style="display:flex; flex-direction:column; align-items:center; gap:8px; padding:20px 16px; background:var(--linen, #efe7d8); border-radius:12px;${m.ready ? '' : ' opacity:0.7;'}">
            <h3>${m.name}</h3>
            <p style="flex:1;">${m.d}</p>
            ${m.ready
              ? `<a href="${m.file}" target="_blank" rel="noopener" class="btn btn--terra" style="margin-top:6px;">View ${m.name}</a>`
              : `<span class="btn btn--outline" style="margin-top:6px; pointer-events:none; opacity:0.85;">Coming soon</span>`}
          </div>`).join('\n')}
        </div>
        <p class="text-center reveal" style="margin-top:30px; opacity:0.7; font-size:0.9rem;">Menus open in a new tab — pinch or zoom to read comfortably on mobile.</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="atelier-h">
      <div class="container">
        <div class="two-col menu-row reveal">
          <figure class="menu-photo zoom">${img('images/food/ravioli-atelier.jpg', 'Limited handmade Ravioli Atelier ravioli at da Cecot, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label">Signature</span>
            <h2 id="atelier-h">Ravioli Atelier</h2>
            <p style="font-size:0.85em; letter-spacing:0.06em; text-transform:uppercase; opacity:0.75; margin-bottom:12px;">Limited handmade ravioli · Friday &amp; Saturday evenings</p>
            <p>Each week, we prepare a small selection of handmade ravioli inspired by regional Italian traditions, seasonal ingredients, and the creativity of our kitchen.</p>
            <p>Available in limited quantities. Reservations recommended.</p>
            ${cta('reservations.html', 'Reserve a Table', 'terra')}
          </div>
        </div>
      </div>
    </section>

    <section class="section section--linen" aria-labelledby="dishes-gallery-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:50px;">
          <span class="label" style="color:var(--terracotta);">From Our Kitchen</span>
          <h2 id="dishes-gallery-h">A taste of what's waiting.</h2>
        </div>
        <div class="gallery gallery--4 reveal">
          <figure class="zoom"><img src="images/food/taste-1.jpg" alt="Handmade pasta dish at da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/food/taste-2.jpg" alt="Italian drinks at da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/food/taste-3.jpg" alt="Fresh pasta being finished at da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/food/taste-4.jpg" alt="Ragù pasta dish at da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="menu-cta-h">
      <div class="container text-center narrow reveal">
        <span class="label" style="color:var(--terracotta);">Save Your Spot</span>
        <h2 id="menu-cta-h">Come hungry. Leave family.</h2>
        <p>Join us for handmade pasta, warm hospitality, and a table that feels like home.</p>
        <div class="btn-group" style="justify-content:center;">
          <a href="reservations.html" class="btn btn--green">Reserve a Table</a>
          <a href="visit-us.html" class="btn btn--outline">Visit Us</a>
        </div>
      </div>
    </section>`
}));

/* ---------- ABOUT ---------- */
pages.push(page({
  slug: 'our-story',
  active: 'our-story',
  title: 'Our Story | da Cecot, Family-Run Italian Kitchen, Edmonton',
  description: "Meet the Cecot family — a Nigerian-Italian family who brought their pasta traditions to Whyte Avenue, Edmonton in 2021. Our roots, our journey & our community.",
  ogImage: IMG.family,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'our-story', label: 'Our Story' }]),
    { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'Our Story — da Cecot Food', url: BASE + '/our-story.html', about: restaurantSchema() }
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'our-story', label: 'Our Story' }])}

    <section class="hero hero--page hero--dark hero--slideshow" aria-labelledby="story-h1">
      <div class="hero__slides" aria-hidden="true">
        <div class="hero__slide" style="background-image:url('images/general/heritage/childhood-dinner.jpg');"></div>
        <div class="hero__slide" style="background-image:url('images/general/heritage/erika-diego-celebration.jpg');"></div>
      </div>
      <div class="hero__inner reveal">
        <span class="label">Our Story</span>
        <h1 id="story-h1">From our family to yours.</h1>
        <p>da Cecot is the story of two cultures, one family, and a shared belief that food brings people together. From Friuli Venezia Giulia to Edmonton, we welcome guests the same way we would welcome them into our home.</p>
      </div>
    </section>

    <div class="values-bar">
      <div class="inner reveal">
        <span class="val">Community</span>
        <span class="val-sep" aria-hidden="true"></span>
        <span class="val">Tradition</span>
        <span class="val-sep" aria-hidden="true"></span>
        <span class="val">Sustainability</span>
      </div>
    </div>

    <section class="section section--cream" aria-labelledby="family-h">
      <div class="container">
        <div class="two-col reveal">
          ${img(IMG.family, 'The Cecot family, founders of da Cecot Food in Edmonton', 'circle-img')}
          <div>
            <span class="label" style="color:var(--terracotta);">Meet the Family</span>
            <h2 id="family-h">Ciao! We are the Cecot family.</h2>
            <p>da Cecot began with a simple dream: to create a place where people feel at home.</p>
            <p>After spending our lives in Italy, we moved to Canada in 2021 carrying our recipes, traditions, and memories with us. What started around our family table became a small pasta kitchen, and eventually a restaurant on Whyte Avenue.</p>
            <p>Today, we make fresh pasta by hand, share the traditions of Friuli Venezia Giulia, and welcome guests the same way we would welcome friends into our home.</p>
            <p class="signature">— Diego, Erika, Giovanni &amp; Ennio</p>
            ${cta('visit-us.html', 'Come Visit Us', 'green')}
          </div>
        </div>
      </div>
    </section>

    <section class="section section--linen" aria-labelledby="notebook-h">
      <div class="container"><div class="two-col menu-row reveal">
        <div class="note-slider" data-note-slider style="align-self:start;">
          <div class="note-slider__track" data-note-track>
            <figure><img src="images/general/heritage/notebook-recipe-1.jpg" alt="A page from Erika&#39;s handwritten recipe notebook" loading="lazy" decoding="async"></figure>
            <figure><img src="images/general/heritage/notebook-recipe-2.jpg" alt="A page from Erika&#39;s handwritten recipe notebook" loading="lazy" decoding="async"></figure>
            <figure><img src="images/general/heritage/notebook-recipe-3.jpg" alt="A page from Erika&#39;s handwritten recipe notebook" loading="lazy" decoding="async"></figure>
            <figure><img src="images/general/heritage/notebook-pan-di-spagna.jpg" alt="Pan di Spagna recipe in Erika&#39;s notebook" loading="lazy" decoding="async"></figure>
            <figure><img src="images/general/heritage/notebook-torta-paradiso.jpg" alt="Torta Paradiso recipe in Erika&#39;s notebook" loading="lazy" decoding="async"></figure>
            <figure><img src="images/general/heritage/notebook-dedication.png" alt="The dedication page of Erika&#39;s recipe notebook" loading="lazy" decoding="async"></figure>
          </div>
          <div class="note-slider__dots" data-note-dots role="tablist" aria-label="Notebook pages"></div>
        </div>
        <div class="menu-copy">
          <span class="label" style="color:var(--terracotta);">A Notebook Full of Memories</span>
          <h2 id="notebook-h">A notebook full of memories.</h2>
          <p>For as long as I can remember, food has been part of my story.</p>
          <p>This notebook has been with me since I was eight years old. It began with the encouragement of my godmothers, Aurelia and Nina, who helped me start filling its pages with recipes, ideas, and memories.</p>
          <p>As I grew, so did the notebook. Over the years, it became a collection of reflections, family traditions, and dishes inspired by the people, places, and experiences that shaped me — from family meals in Plasencis and the villages of Friuli Venezia Giulia to the food we prepare today at da Cecot.</p>
          <p>Many of the ideas behind our kitchen were written down long before da Cecot existed. These pages remind us where we come from, the people who inspired us, and the importance of gathering around a table to share food, stories, and time together.</p>
          <p>Today, that same spirit continues at da Cecot.</p>
          <p class="signature">— Erika</p>
          <p style="margin-top:8px; opacity:0.75; font-size:0.85em;"><em>Original recipe notebook, started at age 8.</em></p>
        </div>
      </div></div>
    </section>

    <section class="section section--brown" aria-labelledby="community-h">
      <div class="container"><div class="two-col menu-row reveal">
        <figure class="menu-photo zoom">${img('images/general/restaurant-interior.jpg', 'Guests gathered inside the da Cecot dining room on Whyte Avenue, Edmonton')}</figure>
        <div class="menu-copy">
          <span class="label">Community</span>
          <h2 id="community-h">A table for everyone.</h2>
          <p>We believe food is a right, not a luxury. We keep our menu affordable and welcoming, create meaningful work for our team, and open our space for classes, gatherings, and pop-ups. When you walk through our doors, you're not just a customer — you're family.</p>
          <p>As we grow, we hope to create meaningful employment and learning opportunities for people of all abilities while preserving the traditions of handmade pasta for future generations.</p>
        </div>
      </div></div>
    </section>

    <section class="section section--linen" aria-labelledby="behind-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:48px;">
          <span class="label" style="color:var(--terracotta);">Behind the Scenes</span>
          <h2 id="behind-h">Days at da Cecot.</h2>
          <p>A glimpse into the people and moments that make up our kitchen on Whyte Avenue.</p>
        </div>
        <div class="gallery gallery--4 reveal">
          <figure class="zoom"><img src="images/general/erica/days-rolling.jpg" alt="Rolling fresh pasta by hand at da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/whatsapp-2.jpg" alt="The da Cecot team at work in Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/days-table.jpg" alt="Guests gathered around the table during a pasta evening at da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/cut-img-2360.jpg" alt="Friends gathered around the table at a da Cecot class, Edmonton" loading="lazy" decoding="async"></figure>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="join-h">
      <div class="container text-center narrow reveal">
        <span class="label" style="color:var(--terracotta);">Join the Family</span>
        <h2 id="join-h">Pull up a chair.</h2>
        <p>Come share a meal, learn to make pasta, or simply say hello. There will always be a place for you at our table.</p>
        <div class="btn-group" style="justify-content:center;">
          <a href="reservations.html" class="btn btn--green">Reserve a Table</a>
          <a href="visit-us.html" class="btn btn--outline">Visit Us</a>
        </div>
      </div>
    </section>`
}));

/* ---------- RESERVATIONS ---------- */
pages.push(page({
  slug: 'reservations',
  active: 'reservations',
  title: 'Reservations | Book a Table at da Cecot, Edmonton',
  description: 'Reserve a table at da Cecot in Edmonton — lunch, dinner, or Sunday family lunch on Whyte Avenue. For pasta classes & special experiences see the Experiences page.',
  ogImage: IMG.dining,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'reservations', label: 'Reservations' }]),
    restaurantSchema({ acceptsReservations: 'True' })
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'reservations', label: 'Reservations' }])}

    <section class="section section--cream" style="padding-top:40px;" aria-labelledby="res-h1">
      <div class="container text-center narrow reveal">
        <h1 id="res-h1">Reserve a Table</h1>
        <p class="lead" style="margin-top:18px;">Book your table at da Cecot for lunch, dinner, or Sunday family lunch. For pasta classes, private dinners, and special experiences, please visit our <a href="experiences.html" style="color:var(--terracotta); font-weight:600;">Experiences page</a>.</p>
      </div>
      <div class="container narrow reveal" style="padding-bottom:20px;">
        <div class="booking">
          <form data-formsubmit data-subject="Reservation Request — da Cecot" aria-label="Reservation request">
            <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
            <div class="form-row">
              <div class="field">
                <label for="res-date">Date</label>
                <input type="date" id="res-date" name="date" required>
              </div>
              <div class="field">
                <label for="res-time">Preferred time</label>
                <input type="time" id="res-time" name="time" required>
              </div>
            </div>
            <div class="field">
              <label for="res-party">Party size</label>
              <select id="res-party" name="party_size">
                <option>1 guest</option>
                <option>2 guests</option>
                <option>3 guests</option>
                <option>4 guests</option>
                <option>5 guests</option>
                <option>6 guests</option>
              </select>
            </div>
            <div class="form-row">
              <div class="field"><label for="res-name">Name</label><input type="text" id="res-name" name="name" required></div>
              <div class="field"><label for="res-phone">Phone</label><input type="tel" id="res-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="res-email">Email</label><input type="email" id="res-email" name="email" required></div>
            <div class="field">
              <label for="res-notes">Special requests <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="res-notes" name="notes" placeholder="Occasion, seating preference, dietary needs, high chair, accessibility…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Request Reservation</button>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! We've received your reservation request and will confirm by phone or email shortly.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218 or email info@dacecotfood.com.</div>
          </form>
        </div>
      </div>
      <div class="container narrow text-center reveal" style="padding-bottom:60px;">
        <p style="opacity:0.78; font-size:0.95em;"><em>Reservation requests are confirmed by our team — we'll reach out to lock in your table. For groups larger than 6 guests, private events, catering, or pasta classes, please <a href="visit-us.html" style="color:var(--terracotta);">contact us directly</a> or visit the <a href="experiences.html" style="color:var(--terracotta);">Experiences page</a>.</em></p>
      </div>
    </section>`
}));

/* ---------- VISIT US (replaces Contact) ---------- */
pages.push(page({
  slug: 'visit-us',
  active: 'visit-us',
  title: 'Visit da Cecot | Whyte Ave & 104 St, Edmonton',
  description: 'Visit da Cecot on Whyte Avenue (82 Ave) at 104 Street, Edmonton. Hours, directions, map, and contact. Reserve a table or come say ciao.',
  ogImage: IMG.dining,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'visit-us', label: 'Visit Us' }]),
    restaurantSchema({ '@type': ['Restaurant', 'LocalBusiness'], hasMap: MAPS_LINK })
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'visit-us', label: 'Visit Us' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.storefront}');" aria-labelledby="visit-h1">
      <div class="hero__inner reveal">
        <span class="label">Find Us</span>
        <h1 id="visit-h1">Visit our family kitchen on Whyte Avenue.</h1>
        <p>Fresh pasta, Italian hospitality, pasta classes, and seasonal experiences in the heart of Old Strathcona.</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="visit-intro-h">
      <div class="container narrow text-center reveal">
        <p class="lead" id="visit-intro-h">da Cecot is a family-owned Italian pastificio and restaurant bringing handmade pasta, regional Italian traditions, and community experiences to Whyte Avenue.</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="visit-h">
      <div class="container">
        <div class="visit reveal">
          <div class="visit__info">
            <span class="label">Located on Whyte Ave</span>
            <h2 id="visit-h">Come say ciao.</h2>
            <p>Located in the heart of Old Strathcona, da Cecot is a family-run Italian kitchen specializing in fresh pasta, ravioli, espresso, and community experiences.</p>
            <p>Join us for lunch, dinner, pasta classes, or take fresh pasta home.</p>
            <ul class="visit__list">
              <li><span>Address</span><a href="${MAPS_LINK}" target="_blank" rel="noopener">Whyte Ave (82 Ave) &amp; 104 Street, Edmonton, AB</a></li>
              <li><span>Phone</span><a href="tel:${NAP.phoneHref}">${NAP.phone}</a></li>
              <li><span>Email</span><a href="mailto:${NAP.email}">${NAP.email}</a></li>
            </ul>
            <div class="visit__hours">
              <h3>Hours</h3>
              <table>
                <tr><th>Mon &amp; Tue</th><td>12 – 3 PM · 4:30 – 8 PM</td></tr>
                <tr><th>Wed</th><td>Closed</td></tr>
                <tr><th>Thu</th><td>4 – 8 PM</td></tr>
                <tr><th>Fri</th><td>11:30 AM – 3 PM · 4 – 9 PM</td></tr>
                <tr><th>Sat</th><td>12 – 9 PM</td></tr>
                <tr><th>Sun</th><td>11:30 AM – 4 PM</td></tr>
                <tr><th>Sunday Pasta Classes</th><td>5 – 9 PM</td></tr>
              </table>
              <p style="margin-top:14px; opacity:0.78; font-size:0.92em;"><em>First Sunday of every month: closed.</em></p>
            </div>
            <div class="btn-group">
              <a href="reservations.html" class="btn btn--green">Reserve a Table</a>
              <a href="${MAPS_LINK}" target="_blank" rel="noopener" class="btn btn--outline">Get Directions</a>
            </div>
          </div>
          <div class="visit__map">
            <iframe src="${MAPS_EMBED}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map showing da Cecot Food on Whyte Avenue at 104 Street, Edmonton, AB"></iframe>
          </div>
        </div>

        <div class="reveal" style="margin-top:40px; max-width:680px;">
          <h3 style="color:var(--cream);">Parking</h3>
          <p style="color:var(--cream); opacity:0.92;">Free street parking is available nearby. Additional public parking lots are located throughout Old Strathcona within a short walking distance of the restaurant.</p>
        </div>
      </div>
    </section>

    <section class="section section--linen" aria-labelledby="why-visit-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:48px;">
          <span class="label" style="color:var(--terracotta);">Reasons to Visit</span>
          <h2 id="why-visit-h">Why visit da Cecot?</h2>
        </div>
        <div class="info-grid reveal" data-stagger>
          <div>
            <h3>Fresh Pasta Daily</h3>
            <p>Made fresh in-house every day.</p>
          </div>
          <div>
            <h3>Pasta Classes</h3>
            <p>Learn traditional pasta making with Erika.</p>
          </div>
          <div>
            <h3>Ravioli Atelier</h3>
            <p>Seasonal handmade ravioli inspired by regional Italian traditions.</p>
          </div>
          <div>
            <h3>Private Events</h3>
            <p>Celebrate birthdays, anniversaries, and special occasions around our family table.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="msg-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:40px;">
          <span class="label" style="color:var(--terracotta);">Say Hello</span>
          <h2 id="msg-h">Send us a message.</h2>
          <p>Questions about the menu, dietary options, wholesale, or private events? We'd love to hear from you.</p>
        </div>
        <form class="form reveal" data-formsubmit data-subject="New Message — da Cecot Website" aria-label="Contact form" style="max-width:680px;">
          <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
          <div class="form-row">
            <div class="field"><label for="fname">First Name *</label><input type="text" id="fname" name="firstName" required></div>
            <div class="field"><label for="lname">Last Name *</label><input type="text" id="lname" name="lastName" required></div>
          </div>
          <div class="form-row">
            <div class="field"><label for="phone">Phone *</label><input type="tel" id="phone" name="phone" required></div>
            <div class="field"><label for="email">Email *</label><input type="email" id="email" name="email" required></div>
          </div>
          <div class="field">
            <label for="inquiry-type">Inquiry Type *</label>
            <select id="inquiry-type" name="inquiry_type" required>
              <option value="">Select an inquiry type…</option>
              <option>Reservation Question</option>
              <option>Pasta Classes</option>
              <option>Private Events</option>
              <option>Catering</option>
              <option>Wholesale</option>
              <option>General Inquiry</option>
            </select>
          </div>
          <div class="field"><label for="message">Message *</label><textarea id="message" name="message" placeholder="What are you inquiring about?" required></textarea></div>
          <div class="text-center"><button type="submit" class="btn btn--terra">Send Message</button></div>
          <div class="form-success">Thanks for reaching out! We will get back to you as soon as possible.</div>
          <div class="form-error">Something went wrong — please email us directly at info@dacecotfood.com.</div>
        </form>
      </div>
    </section>`
}));

/* ---------- PASTA SHOP ---------- */
pages.push(page({
  slug: 'pasta-shop',
  active: 'pasta-shop',
  title: 'Pasta Shop | Fresh Pasta, Ravioli & Sauces — da Cecot, Edmonton',
  description: 'Fresh pasta made in Edmonton with traditional Italian methods. 450g from $9.95, ravioli, house sauces & the Family Bundle. Order for pickup on Whyte Ave.',
  ogImage: IMG.product,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'pasta-shop', label: 'Pasta Shop' }])
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'pasta-shop', label: 'Pasta Shop' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('images/food/ravioli-making.jpg');" aria-labelledby="shop-h1">
      <div class="hero__inner reveal">
        <span class="label">Our Pastificio</span>
        <h1 id="shop-h1">Fresh Pasta for Home</h1>
        <p>Fresh pasta made in Edmonton using traditional Italian methods. Prepared fresh for pickup, freezer-friendly, and ready in minutes — perfect for busy families, pasta lovers, and anyone keeping authentic Italian meals ready at home.</p>
        <div class="btn-group">
          <a href="tel:${NAP.phoneHref}" class="btn btn--terra">Call to Order</a>
          <a href="#bundle-h" class="btn btn--outline">Family Bundle — $39.99</a>
        </div>
      </div>
    </section>

    <section class="section section--linen menu-promo" aria-labelledby="ourmenu-h">
      <div class="container text-center reveal">
        <div class="menu-promo__track" aria-hidden="true">
          <img class="menu-promo__bike" src="images/general/bike-logo.png" alt="" loading="lazy" decoding="async">
        </div>
        <h2 id="ourmenu-h" class="menu-promo__title">Our Menu</h2>
        <p>Fresh pasta, antipasti, secondi, dolci, and Italian drinks — see what's waiting on the table.</p>
        <div class="btn-wrap"><a href="menu.html" class="btn btn--terra">View Our Menus</a></div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="fresh-pasta-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:48px;">
          <span class="label" style="color:var(--terracotta);">Available Daily</span>
          <h2 id="fresh-pasta-h">Fresh pasta, made every morning.</h2>
          <p class="price-tag" style="margin-top:12px;">450 g — $9.95 &nbsp;·&nbsp; 1 kg — $15.00</p>
          <p style="margin-top:14px;">Made fresh daily and ready to take home — just drop it in boiling water and serve in minutes.</p>
        </div>
        <div class="two-col reveal" style="align-items:start;">
          <div>
            <h3 style="color:var(--terracotta);">Vegan Pasta <span style="font-weight:400; font-size:0.85em; opacity:0.75;">(semolina &amp; water)</span></h3>
            <ul class="detail-list" style="margin-top:14px;">
              <li><strong>Always available:</strong> Caserecce · Radiatori · Mafalde</li>
              <li><strong>Seasonal rotations:</strong> Orecchiette · Cavatelli · Fusilloni</li>
            </ul>
          </div>
          <div>
            <h3 style="color:var(--terracotta);">Egg Pasta</h3>
            <ul class="detail-list" style="margin-top:14px;">
              <li><strong>Always available:</strong> Tagliatelle · Spaghetti · Rigatoni · Lasagna Sheets</li>
              <li><strong>Seasonal rotations:</strong> Garganelli &amp; other regional specialties</li>
            </ul>
          </div>
        </div>
        <div class="btn-group reveal" style="justify-content:center; margin-top:36px;">
          <button type="button" class="btn btn--terra" data-order-open data-product="Fresh Pasta — 450 g" data-price="$9.95" data-pay="https://square.link/u/Zni3QXfs">Order 450 g · $9.95</button>
          <button type="button" class="btn btn--terra" data-order-open data-product="Fresh Pasta — 1 kg" data-price="$15.00" data-pay="https://square.link/u/QJAt0LlI">Order 1 kg · $15.00</button>
        </div>
        <div class="gallery gallery--4 reveal" style="margin-top:48px;">
          <figure class="zoom"><img src="images/raw-pasta/caserecce.jpg" alt="Fresh caserecce pasta to take home from da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/raw-pasta/tagliatelle.jpg" alt="Fresh tagliatelle to take home from da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/raw-pasta/rigatoni.jpg" alt="Fresh rigatoni to take home from da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/food/lasagna.jpg" alt="Fresh lasagna ready to take home from da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="ravioli-h">
      <div class="container"><div class="two-col menu-row reveal">
        <figure class="menu-photo zoom">${img(IMG.product, 'Handmade ricotta and spinach ravioli from da Cecot, Edmonton')}</figure>
        <div class="menu-copy">
          <span class="label">Handmade in Small Batches</span>
          <h2 id="ravioli-h">Ravioli &amp; filled pasta.</h2>
          <p>Available for preorder and pickup.</p>
          <ul class="detail-list">
            <li><strong>Ricotta &amp; Spinach Ravioli</strong> — 350 g · $18.00</li>
            <li><strong>Seasonal Ravioli</strong> — rotating flavours throughout the year</li>
            <li><strong>Cannelloni</strong> — available by preorder</li>
            <li><strong>Custom options</strong> for vegan &amp; gluten-free customers</li>
          </ul>
          <a href="tel:${NAP.phoneHref}" class="btn btn--terra" style="margin-top:18px;">Preorder by Phone</a>
        </div>
      </div></div>
    </section>

    <section class="section section--linen" aria-labelledby="sauces-h">
      <div class="container">
        <div class="two-col menu-row menu-row--rev reveal">
          <figure class="menu-photo zoom">${img(IMG.sauce, 'House sauces in 12 oz jars from da Cecot, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label" style="color:var(--terracotta);">12 oz Jars</span>
            <h2 id="sauces-h">House sauces.</h2>
            <p>Designed to pair perfectly with our fresh pasta — and they freeze beautifully.</p>
            <div class="order-rows" role="group" aria-label="Order house sauces">
              <button type="button" class="order-row" data-order-open data-product="Salsa Amatriciana — 12 oz" data-price="$12.99" data-pay="https://square.link/u/apGE8Wtl"><span class="order-row__name">Salsa Amatriciana</span><span class="order-row__price">$12.99</span></button>
              <button type="button" class="order-row" data-order-open data-product="Salsa Plasé — 12 oz" data-price="$12.99" data-pay="https://square.link/u/GhjM2ayB"><span class="order-row__name">Salsa Plasé <em>(tomato sauce · our signature)</em></span><span class="order-row__price">$12.99</span></button>
              <button type="button" class="order-row" data-order-open data-product="Ragù Bolognese — 12 oz" data-price="$14.55" data-pay="https://square.link/u/lAb7z4YK"><span class="order-row__name">Ragù Bolognese <em>(beef)</em></span><span class="order-row__price">$14.55</span></button>
            </div>
          </div>
        </div>
        <div class="gallery gallery--4 reveal" style="margin-top:48px;">
          <figure class="zoom"><img src="images/sauces/sauce-ragu.jpg" alt="Ragù alla Bolognese house sauce in a 12 oz jar from da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/sauces/sauce-plase.jpg" alt="Salsa Plasé house sauce in a 12 oz jar from da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/sauces/sauce-bosco-romagno.jpg" alt="Bosco Romagno house sauce in a 12 oz jar from da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/sauces/salsa-al-baffo.jpg" alt="Salsa al baffo house sauce in a 12 oz jar from da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="bundle-h">
      <div class="container text-center narrow reveal">
        <span class="label">Mix &amp; Match</span>
        <h2 id="bundle-h">Family Pasta Bundle — $39.99</h2>
        <p>1 kg of fresh pasta (choose up to 2 shapes) + two 12 oz house sauces. Mix and match your favourites — perfect for freezer stocking and quick weeknight dinners.</p>
        <div class="btn-group" style="justify-content:center; margin-top:24px;">
          <button type="button" class="btn btn--terra" data-order-open data-product="Family Pasta Bundle" data-price="$39.99" data-pay="https://square.link/u/4kQeTAoi">Order Bundle · $39.99</button>
          <a href="tel:${NAP.phoneHref}" class="btn btn--outline">Call to Order</a>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="how-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:40px;">
          <h2 id="how-h">How it works.</h2>
        </div>
        <div class="info-grid reveal" data-stagger style="text-align:center;">
          <div><h3>1 · Choose</h3><p>Pick your pasta shapes, ravioli, sauces, or bundle.</p></div>
          <div><h3>2 · Order</h3><p>Call <a href="tel:${NAP.phoneHref}">${NAP.phone}</a> or order online.</p></div>
          <div><h3>3 · Pick up</h3><p>Collect from da Cecot on Whyte Avenue.</p></div>
          <div><h3>4 · Enjoy</h3><p>Cook in minutes — fresh or straight from your freezer.</p></div>
        </div>
      </div>
    </section>

    <section class="section section--olive" aria-labelledby="shop-wholesale-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:40px;">
          <span class="label">For Professional Kitchens</span>
          <h2 id="shop-wholesale-h">Wholesale &amp; restaurant supply.</h2>
          <p>Fresh pasta made for professional kitchens — fresh pasta, ravioli, cannelloni, lasagna sheets, and seasonal or custom filled pasta. Available for restaurants, cafés, caterers, and hospitality businesses throughout Edmonton.</p>
        </div>
        <form class="form reveal" data-formsubmit data-subject="Wholesale Inquiry — da Cecot Pasta Shop" aria-label="Wholesale information request" style="max-width:680px; margin:0 auto;">
          <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
          <div class="form-row">
            <div class="field"><label for="ws-business">Business Name *</label><input type="text" id="ws-business" name="business_name" required></div>
            <div class="field"><label for="ws-contact">Contact Name *</label><input type="text" id="ws-contact" name="contact_name" required></div>
          </div>
          <div class="form-row">
            <div class="field"><label for="ws-email">Email *</label><input type="email" id="ws-email" name="email" required></div>
            <div class="field"><label for="ws-phone">Phone Number *</label><input type="tel" id="ws-phone" name="phone" required></div>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="ws-interest">Product Interest *</label>
              <select id="ws-interest" name="product_interest" required>
                <option value="">Select a product…</option>
                <option>Fresh Pasta</option>
                <option>Ravioli</option>
                <option>Cannelloni</option>
                <option>Lasagna Sheets</option>
                <option>Seasonal / Custom Filled Pasta</option>
                <option>Multiple Products</option>
              </select>
            </div>
            <div class="field">
              <label for="ws-volume">Estimated Weekly Volume *</label>
              <select id="ws-volume" name="weekly_volume" required>
                <option value="">Select a range…</option>
                <option>Under 10 kg</option>
                <option>10–25 kg</option>
                <option>25–50 kg</option>
                <option>50+ kg</option>
                <option>Not sure yet</option>
              </select>
            </div>
          </div>
          <div class="text-center"><button type="submit" class="btn btn--terra">Request Wholesale Information</button></div>
          <div class="form-success">Grazie! We'll be in touch within one business day to talk products, volume, and pricing.</div>
          <div class="form-error">Something went wrong — please email us at info@dacecotfood.com.</div>
        </form>
      </div>
    </section>

    <section class="fullbleed hero--parallax" style="background-image:url('${IMG.freshpasta}');" aria-label="Fresh handmade pasta at da Cecot, Edmonton">
      <div class="fullbleed__inner reveal">
        <p class="fullbleed__quote">"The same pasta we serve — now in your kitchen."</p>
        <div class="btn-wrap"><a href="reservations.html" class="btn btn--green">Reserve a Table</a></div>
      </div>
    </section>

    <div class="order-modal" data-order-modal hidden>
      <div class="order-modal__backdrop" data-order-close></div>
      <div class="order-modal__panel" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
        <button type="button" class="order-modal__close" data-order-close aria-label="Close">&times;</button>
        <span class="label" style="color:var(--terracotta);">Order for Pickup</span>
        <h3 id="order-modal-title" data-order-title>Your order</h3>
        <p class="order-modal__price" data-order-price></p>
        <form data-formsubmit aria-label="Pasta shop order">
          <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
          <input type="hidden" name="item" data-order-product>
          <div class="form-row">
            <div class="field"><label for="om-qty">Quantity</label><input type="number" id="om-qty" name="quantity" min="1" value="1" required></div>
            <div class="field"><label for="om-pickup">Day of pickup</label><input type="date" id="om-pickup" name="pickup_day" required></div>
          </div>
          <div class="field"><label for="om-allergies">Any allergies?</label><input type="text" id="om-allergies" name="allergies" placeholder="Gluten, nuts, none…"></div>
          <div class="field"><label for="om-notes">Pasta shapes &amp; sauces <span style="font-weight:400;opacity:0.7;">(for the bundle, list your choices)</span></label><textarea id="om-notes" name="notes" placeholder="Family Bundle — choose up to 2 pasta shapes + 2 sauces (e.g. tagliatelle &amp; rigatoni, Plasé &amp; Ragù). For single items, note your pasta shape or any preferences."></textarea></div>
          <div class="form-row">
            <div class="field"><label for="om-name">Name</label><input type="text" id="om-name" name="name" required></div>
            <div class="field"><label for="om-phone">Phone</label><input type="tel" id="om-phone" name="phone" required></div>
          </div>
          <div class="field"><label for="om-email">Email</label><input type="email" id="om-email" name="email" required></div>
          <button type="submit" class="btn btn--terra" style="width:100%;" data-order-submit>Send My Order</button>
          <p class="cal__pay-note" data-order-note style="display:none;">You'll be taken to our secure Square checkout to pay.</p>
          <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! We've got your order — we'll confirm your pickup and total by phone or email shortly.</div>
          <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218 or email info@dacecotfood.com.</div>
        </form>
      </div>
    </div>`
}));

/* ---------- PARTNERSHIPS ---------- */
pages.push(page({
  slug: 'partnerships',
  active: 'partnerships',
  title: 'Wholesale & Retail Pasta Partnerships | da Cecot, Edmonton',
  description: "Bring da Cecot's handcrafted pasta, sauces & lasagna to your menu or shelves. Wholesale & retail partnerships for Edmonton restaurants, hotels & retailers.",
  ogImage: IMG.freshpasta,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'partnerships', label: 'Partnerships' }])
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'partnerships', label: 'Wholesale & Retail Partnerships' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.partnerbg}');" aria-labelledby="part-h1">
      <div class="hero__inner reveal">
        <span class="label">Wholesale &amp; Retail Partnerships</span>
        <h1 id="part-h1">Handcrafted pasta, ready for your menu and your shelves.</h1>
      </div>
    </section>

    <section class="section section--olive" aria-labelledby="part-intro-h">
      <div class="container text-center narrow reveal">
        <h2 id="part-intro-h" class="sr-only">Wholesale &amp; retail overview</h2>
        <p class="lead">Our wholesale and retail program brings the same fresh, handmade pasta we serve every day to restaurants, hotels, and retailers across the Edmonton region. Real ingredients, authentic craft, and the flexibility to fit your kitchen or your storefront.</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="offer-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:56px;"><h2 id="offer-h">What We Offer</h2></div>
        <div class="feature-grid reveal">
          <article class="feature-card">
            ${img(IMG.freshpasta, 'Fresh handmade wholesale pasta from da Cecot')}
            <h3>Fresh Pasta*</h3>
            <p>Egg-based, vegan, and gluten-free options — all made by hand with the texture and bite that sets fresh pasta apart.</p>
          </article>
          <article class="feature-card">
            ${img(IMG.sauce, 'Fresh Italian sauces made with local ingredients')}
            <h3>Sauces</h3>
            <p>Our signature Italian classics, slow-cooked with fresh local ingredients and ready to elevate any plate.</p>
          </article>
          <article class="feature-card">
            ${img(IMG.lasagna, 'Heat-and-serve lasagna trays from da Cecot')}
            <h3>Lasagna Trays</h3>
            <p>Layered by hand in multiple flavours — simple to heat and serve, perfect for kitchens and retail freezers alike.</p>
          </article>
        </div>
        <p class="text-center" style="margin-top:40px; font-size:0.9rem; opacity:0.75;">*Restaurant Pastas are designed and produced to professional kitchen standards.</p>
      </div>
    </section>

    <section class="section section--olive" aria-labelledby="why-h">
      <div class="container text-center narrow reveal">
        <h2 id="why-h">Why Partner With Us?</h2>
        <p style="font-family:var(--serif); font-style:italic; color:var(--gold); font-size:1.2rem; margin:24px 0;">Authentic craft &nbsp;·&nbsp; Local ingredients &nbsp;·&nbsp; Flexible options &nbsp;·&nbsp; Reliable supply</p>
        <p>For us, pasta is a craft — an art passed down and perfected. We bring deep knowledge, genuine dedication, and a commitment to quality to every order. When you partner with da Cecot, you're offering your customers something truly handmade.</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="part-cta-h">
      <div class="container text-center narrow reveal">
        <h2 id="part-cta-h" class="sr-only">Inquire about partnership</h2>
        <p class="lead">Ready to talk? Reach out for wholesale pricing, to request samples, or to start a partnership. We'd love to find the right fit for your business.</p>
        ${cta('visit-us.html', 'Inquire', 'terra')}
      </div>
    </section>`
}));

module.exports = { pages, page, breadcrumb, breadcrumbSchema, faqBlock, faqSchema, cta, img, restaurantSchema, IMG, BASE, EXPERIENCE_PAGES, ROOT, fs, path };

/* the experiences pages are appended from build-experiences.js to keep files readable */
require('./build-experiences.js');
