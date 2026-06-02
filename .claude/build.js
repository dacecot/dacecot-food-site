/* ============================================================
   da Cecot Food — static site generator
   Outputs plain static HTML (great for SEO) from shared templates.
   Run:  node .claude/build.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://www.dacecotfood.com';
const M = 'https://static.wixstatic.com/media/';
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
  hero:      M + '77f047_338fa580ed654196bb445b86639bfd8c~mv2.png',
  pasta:     M + '7c0be1_77745bd3095d4afc83ac24b7798df4ee~mv2.jpg',
  food:      M + '7c0be1_dfac201973bf4ee195273ab10da689a2~mv2.jpg',
  greenpasta:M + '7c0be1_b066360dd22941e2b0d32d3f8437a5cb~mv2.jpg',
  family:    M + '7c0be1_1425b4bd252e412db1f1f5a621e2276e~mv2.jpg',   // real Cecot family portrait
  about2:    M + '77f047_338fa580ed654196bb445b86639bfd8c~mv2.png',   // warm atmospheric backdrop (about hero)
  aboutHero: M + '77f047_338fa580ed654196bb445b86639bfd8c~mv2.png',   // warm atmospheric backdrop
  product:   M + '7c0be1_34fa4d0deae440e6ab56beff84a1d33c~mv2.png',   // pasta/ravioli to-go product shot
  pastawine: M + '11062b_4c68ff7404e7429aa4270be3fac9c9f8~mv2_d_4500_3003_s_4_2.jpg',
  wine:      M + 'nsplsh_75f0185e417b49dcb72e0a0ebd8830a4~mv2.jpg',
  dining:    M + 'nsplsh_3663694c6464546f54674d~mv2_d_6000_4000_s_4_2.jpg',
  freshpasta:M + '8eaf7d54fb4e47bdb3f871c347480ec1.jpg',
  sauce:     M + '7c0be1_dfcabf0955044fda943142e1830567c3~mv2.jpg',
  lasagna:   M + 'nsplsh_584178764b703074647755~mv2.jpg',
  partnerbg: M + 'nsplsh_b2056eb0df36469089b188aa0be75632~mv2.jpg',
  icon:      M + '7c0be1_3204ca41b9b64e1abd5c10f6c86c4451~mv2.png',
  logo:      M + '7c0be1_ee1b5d1b8a1047f1a89d65a233c038fb~mv2.png'
};
const OG_DEFAULT = IMG.pasta;

/* ---- navigation model ---- */
const EXPERIENCE_PAGES = [
  { slug: 'experiences',           label: 'Experiences Overview' },
  { slug: 'sunday-pasta-classes',  label: 'Sunday Pasta Classes' },
  { slug: 'pasta-drop-in',         label: 'Public Pasta Drop-In' },
  { slug: 'food-drink-experiences',label: 'Food & Drink Experiences' },
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
        <p class="footer__tag">Fresh handmade pasta &amp; Italian comfort food, made by hand on Whyte Avenue in Edmonton.</p>
        <div class="footer__social">
          <a href="https://www.instagram.com/" target="_blank" rel="noopener" aria-label="da Cecot on Instagram">${ig}</a>
          <a href="https://www.facebook.com/" target="_blank" rel="noopener" aria-label="da Cecot on Facebook">${fb}</a>
        </div>
      </div>
      <div class="footer__col">
        <h4>Explore</h4>
        <nav class="footer__links" aria-label="Footer navigation">
          <a href="index.html">Home</a>
          <a href="menu.html">Menu</a>
          <a href="experiences.html">Experiences</a>
          <a href="pasta-shop.html">Pasta Shop</a>
          <a href="our-story.html">Our Story</a>
          <a href="visit-us.html">Visit Us</a>
          <a href="partnerships.html">Wholesale &amp; Retail</a>
          <a href="reservations.html">Reserve a Table</a>
        </nav>
      </div>
      <div class="footer__col">
        <h4>Find Us</h4>
        <p class="footer__contact">
          <a href="${MAPS_LINK}" target="_blank" rel="noopener">Whyte Ave (82 Ave) &amp; 104 Street<br>Edmonton, AB</a>
        </p>
        <p class="footer__contact">
          <a href="tel:${NAP.phoneHref}">${NAP.phone}</a><br>
          <a href="mailto:${NAP.email}">${NAP.email}</a>
        </p>
        <p class="footer__hours">
          <strong>Hours</strong><br>
          Mon–Tue 11:30–2 · 4–8<br>
          Wed Closed · Thu 4–8<br>
          Fri 11:30–2 · 4–9<br>
          Sat 12–8 · Sun 4–8
        </p>
      </div>
      <div class="footer__col footer__news">
        <h4>Stay in the Loop</h4>
        <p>Fresh pasta drops, classes, and seasonal menus — straight to your inbox.</p>
        <form class="newsletter" data-formsubmit data-subject="Newsletter Signup — da Cecot" aria-label="Newsletter signup">
          <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
          <label for="nl-email" class="sr-only">Email address</label>
          <div class="newsletter__row">
            <input type="email" id="nl-email" name="email" placeholder="Your email" required>
            <button type="submit" class="btn btn--terra">Subscribe</button>
          </div>
          <div class="form-success">Grazie! You're on the list — we'll be in touch soon.</div>
          <div class="form-error">Something went wrong — please email us at info@dacecotfood.com.</div>
        </form>
      </div>
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
  { d: ['Monday', 'Tuesday'], o: '11:30', c: '14:00' },
  { d: ['Monday', 'Tuesday'], o: '16:00', c: '20:00' },
  { d: ['Thursday'], o: '16:00', c: '20:00' },
  { d: ['Friday'], o: '11:30', c: '14:00' },
  { d: ['Friday'], o: '16:00', c: '21:00' },
  { d: ['Saturday'], o: '12:00', c: '20:00' },
  { d: ['Sunday'], o: '16:00', c: '20:00' }
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
    image: IMG.pasta,
    servesCuisine: ['Italian', 'Mediterranean'],
    priceRange: '$$',
    address: POSTAL_ADDRESS,
    areaServed: ['Millwoods', 'Terwillegar', 'Chappelle', 'Heritage Valley', 'Edmonton'],
    openingHoursSpecification: HOURS_SPEC,
    acceptsReservations: 'True',
    award: 'Winner — Canadian Choice Award 2026, Italian Restaurants',
    menu: BASE + '/menu.html',
    sameAs: ['https://www.instagram.com/', 'https://www.facebook.com/']
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
  const og = opts.ogImage || OG_DEFAULT;
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
  <link rel="preconnect" href="https://static.wixstatic.com">
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
  ogImage: IMG.pasta,
  schema: [restaurantSchema({ aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '127' } })],
  body: `    <section class="hero hero--home hero--parallax" style="background-image:url('${IMG.pasta}');">
      <div class="hero__inner reveal">
        <span class="label">da Cecot · On Whyte Avenue, Edmonton</span>
        <h1 class="hero__brand">Fresh Handmade Pasta on Whyte Ave</h1>
        <p class="hero__tag">Authentic Italian pasta, shaped by hand and made fresh every day — from our family's table to yours.</p>
        <div class="btn-group">
          <a href="reservations.html" class="btn btn--green">Reserve a Table</a>
          <a href="sunday-pasta-classes.html" class="btn btn--brown">Book a Pasta Class</a>
          <a href="pasta-shop.html" class="btn btn--terra">Order Fresh Pasta</a>
        </div>
      </div>
      <a class="hero__scroll" href="#kitchen" aria-label="Scroll to content"><span></span></a>
    </section>

    <section id="kitchen" class="section section--cream" aria-labelledby="kitchen-h">
      <div class="container text-center narrow reveal">
        <span class="label" style="color:var(--terracotta);">Our Italian Kitchen</span>
        <h2 id="kitchen-h">A warm Italian home, where pasta is made by hand.</h2>
        <p>da Cecot began with a family that carried two homes in its heart — the warmth of Nigeria and the rich culinary tradition of Italy. We pour that love into every plate: slow-cooked sauces, fresh pasta rolled by hand, and a table where everyone belongs.</p>
        <p>Come as a guest, leave as family. That's the way we've always done it.</p>
        ${cta('our-story.html', 'Learn Our Story', 'terra')}
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="fresh-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:56px;">
          <span class="label">Fresh Pasta Made Daily</span>
          <h2 id="fresh-h">Hand-shaped, never rushed.</h2>
        </div>
        <div class="feature-grid reveal" data-stagger>
          <article class="feature-card"><div class="zoom">${img(IMG.pasta, 'Hand-shaped fresh pasta at da Cecot, Edmonton')}</div><h3>Hand-Shaped</h3><p>Every shape is rolled, cut, and formed by hand in our kitchen — the way nonna taught us.</p></article>
          <article class="feature-card"><div class="zoom">${img(IMG.product, 'Seasonal filled ravioli at da Cecot, Edmonton')}</div><h3>Seasonal Fillings</h3><p>Ravioli and specials built around what's fresh, with fillings that change through the seasons.</p></article>
          <article class="feature-card"><div class="zoom">${img(IMG.freshpasta, 'Fresh pasta made daily at da Cecot, Edmonton')}</div><h3>Crafted Daily</h3><p>We make our pasta fresh every morning — so what you taste is never more than a few hours old.</p></article>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="exp-h">
      <div class="container">
        <div class="two-col menu-row reveal">
          <figure class="menu-photo zoom">${img(IMG.pastawine, 'Guests laughing while making pasta at a da Cecot class, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label" style="color:var(--terracotta);">Experiences</span>
            <h2 id="exp-h">Roll up your sleeves with us.</h2>
            <p>Learn to make fresh pasta by hand in a relaxed, hands-on class — then sit down and enjoy everything you made. From Sunday classes to private dinners at our family table, there's a way for everyone to gather.</p>
            ${cta('experiences.html', 'Book a Pasta Class', 'brown')}
          </div>
        </div>
      </div>
    </section>

    <section class="fullbleed hero--parallax" style="background-image:url('${IMG.greenpasta}');" aria-label="Fresh pasta at da Cecot Food, Edmonton">
      <div class="fullbleed__inner reveal">
        <p class="fullbleed__quote">"Through every bite, we bring a little joy home."</p>
        <span class="fullbleed__by">— the Cecot family</span>
      </div>
    </section>

    <section class="section section--linen" aria-labelledby="take-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:54px;">
          <span class="label" style="color:var(--terracotta);">Take Home</span>
          <h2 id="take-h">Fresh pasta for your own table.</h2>
          <p>Take our handmade pasta home and finish it your way. Available fresh from our Pasta Shop.</p>
        </div>
        <div class="offer-grid reveal" data-stagger>
          <a class="offer-card" href="pasta-shop.html">
            <div class="offer-card__img zoom">${img(IMG.greenpasta, 'Fresh tagliatelle to take home from da Cecot, Edmonton')}</div>
            <div class="offer-card__body"><h3>Tagliatelle</h3><p>Silky ribbons of fresh egg pasta — perfect with ragù or butter &amp; sage.</p><span class="offer-card__link">Visit Pasta Shop</span></div>
          </a>
          <a class="offer-card" href="pasta-shop.html">
            <div class="offer-card__img zoom">${img(IMG.product, 'Fresh ravioli to take home from da Cecot, Edmonton')}</div>
            <div class="offer-card__body"><h3>Ravioli</h3><p>Hand-filled parcels with seasonal fillings, ready to drop straight into the pot.</p><span class="offer-card__link">Visit Pasta Shop</span></div>
          </a>
          <a class="offer-card" href="pasta-shop.html">
            <div class="offer-card__img zoom">${img(IMG.pasta, 'Fresh rigatoni to take home from da Cecot, Edmonton')}</div>
            <div class="offer-card__body"><h3>Rigatoni</h3><p>Ridged tubes that hold every drop of sauce — a takeout-and-cook favourite.</p><span class="offer-card__link">Visit Pasta Shop</span></div>
          </a>
        </div>
        <div class="btn-wrap text-center"><a href="pasta-shop.html" class="btn btn--terra">Visit Pasta Shop</a></div>
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
                <tr><th>Mon – Tue</th><td>11:30 AM – 2 PM · 4 – 8 PM</td></tr>
                <tr><th>Wed</th><td>Closed</td></tr>
                <tr><th>Thu</th><td>4 – 8 PM</td></tr>
                <tr><th>Fri</th><td>11:30 AM – 2 PM · 4 – 9 PM</td></tr>
                <tr><th>Sat</th><td>12 – 8 PM</td></tr>
                <tr><th>Sun</th><td>4 – 8 PM</td></tr>
              </table>
            </div>
            <div class="btn-group">
              <a href="reservations.html" class="btn btn--terra">Reserve a Table</a>
              <a href="${MAPS_LINK}" target="_blank" rel="noopener" class="btn btn--ghost">Get Directions</a>
            </div>
          </div>
          <div class="visit__map">
            <iframe src="${MAPS_EMBED}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map showing da Cecot Food on Whyte Avenue at 104 Street, Edmonton, AB"></iframe>
          </div>
        </div>
      </div>
    </section>`
}));

/* ---------- MENU ---------- */
const menuFaqs = [
  { q: 'How does the da Cecot pasta bar work?', a: 'Build your own bowl in three steps: choose a fresh handmade pasta (Tagliatelle, Rigatoni, or Ravioli), pick a house sauce (Pomodoro, Ragù, Cacio e Pepe, or Pesto), and add any extras. We also bake lasagna fresh daily and serve Italian coffee and soft drinks.' },
  { q: 'Do you offer takeout pasta?', a: 'Yes. Every dish is built for dine-in or takeout, and you can buy our fresh pasta raw from the Pasta Shop to cook at home exactly how you like it.' },
  { q: 'Can you accommodate dietary restrictions?', a: 'We can help with many dietary needs, including vegan and gluten-free pasta. Call us ahead at (825) 888-4218 with any questions about ingredients, allergens, or to place a large order in advance.' }
];
pages.push(page({
  slug: 'menu',
  active: 'menu',
  title: 'Menu | da Cecot Pasta Bar, Edmonton',
  description: 'Explore the da Cecot pasta bar: fresh pasta shapes, slow-cooked Italian sauces, daily lasagna, coffee & housemade tiramisu. Dine in or grab it & go.',
  ogImage: IMG.greenpasta,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'menu', label: 'Menu' }])
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'menu', label: 'Menu' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.food}');" aria-labelledby="menu-h1">
      <div class="hero__inner reveal">
        <span class="label">Eat With Us</span>
        <h1 id="menu-h1">Our Menu</h1>
        <p>Fresh handmade pasta, slow-cooked house sauces, and lasagna baked daily. Build your own bowl — dine in or grab it &amp; go.</p>
        <p class="hero__note">À la carte · Call <a href="tel:${NAP.phoneHref}">${NAP.phone}</a> for dietary questions or large orders</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="build-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:50px;">
          <span class="label" style="color:var(--terracotta);">How It Works</span>
          <h2 id="build-h">Build Your Pasta</h2>
          <p>Three simple steps to your perfect bowl.</p>
        </div>
        <div class="steps reveal" data-stagger>
          <div class="step"><span class="step__num">1</span><h3>Choose Pasta</h3><p>Pick your shape — Caserecce, Rigatoni, Tagliatelle, Ravioli, and rotating specials, all made fresh daily.</p></div>
          <div class="step"><span class="step__num">2</span><h3>Choose Sauce</h3><p>Pair it with a house sauce: Ragù Bolognese, Plasé, Cacio e Pepé, Salsa al Baffo, or Butter &amp; Sage.</p></div>
          <div class="step"><span class="step__num">3</span><h3>Add Extras</h3><p>Finish with cheese, fresh herbs, and the little touches that make it yours.</p></div>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="pasta-h">
      <div class="container">
        <div class="two-col menu-row reveal">
          <figure class="menu-photo zoom">${img(IMG.pasta, 'Fresh handmade pasta at the da Cecot pasta bar, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label">Choose Your Pasta</span>
            <h2 id="pasta-h">Fresh Pasta</h2>
            <p style="font-size:0.8em;letter-spacing:0.08em;text-transform:uppercase;opacity:0.6;margin-bottom:8px;font-weight:600;">Always Available</p>
            <ul class="menu-list">
              <li>Caserecce <span>Short twisted pasta · our signature shape</span></li>
              <li>Rigatoni <span>Ridged tubes</span></li>
              <li>Tagliatelle <span>Egg ribbons</span></li>
              <li>Traditional Ravioli <span>Hand-filled parcels</span></li>
            </ul>
            <p style="font-size:0.8em;letter-spacing:0.08em;text-transform:uppercase;opacity:0.6;margin-top:18px;margin-bottom:8px;font-weight:600;">Rotating — Based on Availability</p>
            <ul class="menu-list">
              <li>Radiatori</li>
              <li>Mafalde</li>
              <li>Spaghetti</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="fullbleed hero--parallax" style="background-image:url('${IMG.greenpasta}');" aria-label="Italian comfort food plated at da Cecot, Edmonton">
      <div class="fullbleed__inner reveal">
        <p class="fullbleed__quote">"Fresh pasta, made by hand, every single day."</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="sauces-h">
      <div class="container">
        <div class="two-col menu-row menu-row--rev reveal">
          <figure class="menu-photo zoom">${img(IMG.sauce, 'Slow-cooked Italian sauce at da Cecot, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label" style="color:var(--terracotta);">Choose Your Sauce</span>
            <h2 id="sauces-h">House Sauces</h2>
            <ul class="menu-list">
              <li>Ragù Bolognese <span>Slow-cooked meat sauce</span></li>
              <li>Plasé <span>Tomato sauce</span></li>
              <li>Cacio e Pepé <span>Pecorino &amp; black pepper</span></li>
              <li>Salsa al Baffo <span>Rosé sauce</span></li>
              <li>Butter &amp; Sage Sauce</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="sig-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:50px;">
          <span class="label">House Favourites</span>
          <h2 id="sig-h">Signature Dishes</h2>
        </div>
        <div class="offer-grid offer-grid--2 reveal" data-stagger>
          <article class="offer-card">
            <div class="offer-card__img zoom">${img(IMG.lasagna, 'Hand-layered lasagna baked fresh daily at da Cecot, Edmonton')}</div>
            <div class="offer-card__body"><h3>Lasagna</h3><p>Layered by hand with slow-cooked ragù, silky béchamel, and Italian cheeses — baked fresh every morning. Always available — baked fresh daily with seasonal ingredients. Available for dine-in and takeout.</p></div>
          </article>
          <article class="offer-card">
            <div class="offer-card__img zoom">${img(IMG.product, 'Fresh hand-filled ravioli at da Cecot, Edmonton')}</div>
            <div class="offer-card__body"><h3>Ravioli</h3><p>Delicate hand-filled parcels with seasonal fillings, finished simply with butter &amp; sage or our house sauces.</p></div>
          </article>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="philosophy-h">
      <div class="container narrow reveal">
        <div class="text-center" style="margin-bottom:36px;">
          <span class="label" style="color:var(--terracotta);">Our Pasta Philosophy</span>
          <h2 id="philosophy-h">Made fresh. Best enjoyed now.</h2>
        </div>
        <p>Not every pasta shape holds up well once it leaves our kitchen. Fresh egg-based pastas, filled pastas like ravioli, or delicate hand-folded shapes can lose their texture and integrity during transport. They are best enjoyed immediately, in-house.</p>
        <p style="margin-top:16px;">For this reason, we've chosen Caserecce as our signature takeout/delivery pasta. It maintains its bite, holds sauce beautifully, and delivers the same quality experience at home as it does at the table.</p>
        <p style="margin-top:16px;">That said, you can still enjoy our other pasta varieties through delivery or pickup — perfect to surprise loved ones or to bring a wholesome, freshly prepared meal to your family. By bringing home our raw fresh pasta, you can have a healthy, authentic Italian meal cooked in just five minutes. At Da Cecot, we produce pasta fresh every day, so whether you dine in, take out, or cook at home, you'll always taste the difference.</p>
      </div>
    </section>

    <section class="section section--linen" aria-labelledby="drinks-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:50px;">
          <span class="label" style="color:var(--terracotta);">To Finish</span>
          <h2 id="drinks-h">Drinks &amp; Dessert</h2>
        </div>
        <div class="three-col reveal" data-stagger>
          <article class="menu-card menu-card--light"><h3>Coffee</h3><p>Fresh Italian Moka, brewed the traditional way.</p></article>
          <article class="menu-card menu-card--light"><h3>Soft Drinks</h3><ul class="menu-list"><li>Coke</li><li>Sanpellegrino</li><li>Fanta</li><li>Iced Tea</li></ul></article>
          <article class="menu-card menu-card--light"><h3>Tiramisu</h3><p>Our housemade recipe — espresso-soaked, light, and made in-house.</p></article>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="menu-cta-h">
      <div class="container text-center narrow reveal">
        <span class="label" style="color:var(--terracotta);">Save Your Spot</span>
        <h2 id="menu-cta-h">Come hungry. Leave family.</h2>
        <p>Seating is limited for our weekend specials — reserve ahead so we can save you a place at the table. Questions about the menu or a large order? Call us at <a href="tel:${NAP.phoneHref}">${NAP.phone}</a>.</p>
        <div class="btn-group" style="justify-content:center;">
          <a href="reservations.html" class="btn btn--green">Reserve a Table</a>
          <a href="tel:${NAP.phoneHref}" class="btn btn--outline">Call ${NAP.phone}</a>
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

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.pastawine}');" aria-labelledby="story-h1">
      <div class="hero__inner reveal">
        <span class="label">Our Story</span>
        <h1 id="story-h1">From our family to yours.</h1>
        <p>A Nigerian-Italian family bringing handmade pasta and a warm table to Whyte Avenue.</p>
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
            <p>Our family carries two homes in its heart — the vibrant warmth of Nigeria and the rich culinary tradition of Italy. We pour both into everything we make.</p>
            <p>One of our earliest traditions was making Strucchi, the little sweet pastries we'd prepare together for special occasions. That spirit — cooking side by side and sharing what we make — is the foundation of da Cecot.</p>
            <p class="signature">— Diego, Erika, Giovanni &amp; Ennio</p>
            ${cta('visit-us.html', 'Come Visit Us', 'green')}
          </div>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="roots-h">
      <div class="container"><div class="two-col menu-row reveal">
        <figure class="menu-photo zoom">${img(IMG.sauce, 'Slow-cooked Italian sauce in the da Cecot kitchen, Edmonton')}</figure>
        <div class="menu-copy">
          <span class="label">Roots in Italy</span>
          <h2 id="roots-h">Recipes passed down by hand.</h2>
          <p>Our pasta is built on generations of Italian tradition — sauces simmered slowly, dough rolled by hand, and the conviction that good food is made with patience and love. These are the recipes we grew up with, and the ones we're proud to share.</p>
        </div>
      </div></div>
    </section>

    <section class="section section--linen" aria-labelledby="journey-h">
      <div class="container"><div class="two-col menu-row menu-row--rev reveal">
        <figure class="menu-photo zoom">${img(IMG.dining, 'A welcoming dinner table at da Cecot on Whyte Avenue, Edmonton')}</figure>
        <div class="menu-copy">
          <span class="label" style="color:var(--terracotta);">The Journey</span>
          <h2 id="journey-h">From two homes to Whyte Ave.</h2>
          <p>In 2021 we moved to Canada and brought our recipes, our memories, and our love of feeding people with us. We found our home on Whyte Avenue in Edmonton — and turned it into a little corner of Italy, open to everyone who walks through the door.</p>
        </div>
      </div></div>
    </section>

    <section class="section section--brown" aria-labelledby="community-h">
      <div class="container"><div class="two-col menu-row reveal">
        <figure class="menu-photo zoom">${img(IMG.freshpasta, 'Hands making fresh pasta together in the da Cecot kitchen, Edmonton')}</figure>
        <div class="menu-copy">
          <span class="label">Community</span>
          <h2 id="community-h">A table for everyone.</h2>
          <p>We believe food is a right, not a luxury. We keep our menu affordable and welcoming, create meaningful work for our team, and open our space for classes, gatherings, and pop-ups. When you walk through our doors, you're not just a customer — you're family.</p>
        </div>
      </div></div>
    </section>

    <section class="section section--cream" aria-labelledby="join-h">
      <div class="container text-center narrow reveal">
        <span class="label" style="color:var(--terracotta);">Join the Family</span>
        <h2 id="join-h">Pull up a chair.</h2>
        <p>Come share a meal, learn to make pasta, or simply say hello. We can't wait to welcome you to our table on Whyte Avenue.</p>
        <div class="btn-group" style="justify-content:center;">
          <a href="reservations.html" class="btn btn--green">Reserve a Table</a>
          <a href="visit-us.html" class="btn btn--outline">Visit Us</a>
        </div>
      </div>
    </section>

    <section class="section section--brown award-section" aria-labelledby="award-h">
      <div class="container text-center narrow reveal">
        <svg class="award-seal" viewBox="0 0 140 120" role="img" aria-label="Canadian Choice Award 2026 Winner seal">
          <circle cx="70" cy="58" r="50" fill="#3F512E" stroke="#C7A45A" stroke-width="3"/>
          <circle cx="70" cy="58" r="41" fill="none" stroke="#C7A45A" stroke-width="1.5"/>
          <path d="M70 26 l5.1 10.3 11.4 1.7 -8.3 8 1.9 11.3 -10.1 -5.3 -10.1 5.3 1.9 -11.3 -8.3 -8 11.4 -1.7 Z" fill="#C7A45A"/>
          <text x="70" y="78" text-anchor="middle" fill="#F4F0E8" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="700" letter-spacing="2.5">WINNER</text>
          <text x="70" y="97" text-anchor="middle" fill="#C7A45A" font-family="Georgia,'Times New Roman',serif" font-size="16" font-weight="700">2026</text>
        </svg>
        <span class="label">Award-Winning</span>
        <h2 id="award-h">Canadian Choice Award 2026</h2>
        <p class="award-cat">Winner · Italian Restaurants</p>
        <p>We're honoured to be named a 2026 Canadian Choice Award winner in the Italian Restaurants category — a recognition we share with the community that has welcomed us to Whyte Avenue.</p>
      </div>
    </section>`
}));

/* ---------- RESERVATIONS ---------- */
pages.push(page({
  slug: 'reservations',
  active: 'reservations',
  title: 'Reservations | Book a Table at da Cecot, Edmonton',
  description: "Reserve your table at da Cecot in Edmonton. Book a weekend 'At Our Family Table' experience or a weekday seat. Limited seating — reserve now.",
  ogImage: IMG.dining,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'reservations', label: 'Reservations' }]),
    restaurantSchema({ acceptsReservations: 'True' })
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'reservations', label: 'Reservations' }])}

    <section class="section section--cream" style="padding-top:40px;" aria-labelledby="res-h1">
      <div class="container text-center narrow reveal">
        <h1 id="res-h1">Make a Reservation</h1>
        <p class="lead" style="margin-top:18px;">Select your details below to reserve your table at da Cecot in Edmonton. Booking for the weekend? Be sure to ask about our <strong>"At Our Family Table"</strong> experience — an intimate, fixed-menu evening you won't forget.</p>
      </div>
      <div class="container" style="max-width:760px; margin:0 auto; padding-bottom:60px;">
        <!-- Start Square Appointments Embed Code --><script src='https://square.site/appointments/buyer/widget/cj1toniazzz1ms/LYPSZAFKKPK8Z.js'></script><!-- End Square Appointments Embed Code -->
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

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.dining}');" aria-labelledby="visit-h1">
      <div class="hero__inner reveal">
        <span class="label">Find Us</span>
        <h1 id="visit-h1">Visit da Cecot</h1>
        <p>You'll find us on Whyte Avenue, in the heart of Old Strathcona. Come dine in, grab takeout, or join us for a class.</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="visit-h">
      <div class="container">
        <div class="visit reveal">
          <div class="visit__info">
            <span class="label">Located on Whyte Ave</span>
            <h2 id="visit-h">Come say ciao.</h2>
            <p>da Cecot is on Whyte Avenue (82 Ave) at 104 Street in Edmonton. Dine in, take out, or pre-order fresh pasta to cook at home.</p>
            <ul class="visit__list">
              <li><span>Address</span><a href="${MAPS_LINK}" target="_blank" rel="noopener">Whyte Ave (82 Ave) &amp; 104 Street, Edmonton, AB</a></li>
              <li><span>Phone</span><a href="tel:${NAP.phoneHref}">${NAP.phone}</a></li>
              <li><span>Email</span><a href="mailto:${NAP.email}">${NAP.email}</a></li>
            </ul>
            <div class="visit__hours">
              <h3>Hours</h3>
              <table>
                <tr><th>Mon – Tue</th><td>11:30 AM – 2 PM · 4 – 8 PM</td></tr>
                <tr><th>Wed</th><td>Closed</td></tr>
                <tr><th>Thu</th><td>4 – 8 PM</td></tr>
                <tr><th>Fri</th><td>11:30 AM – 2 PM · 4 – 9 PM</td></tr>
                <tr><th>Sat</th><td>12 – 8 PM</td></tr>
                <tr><th>Sun</th><td>4 – 8 PM</td></tr>
              </table>
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
  title: 'Pasta Shop | Fresh Pasta for Home — da Cecot, Edmonton',
  description: 'Take da Cecot home. Fresh handmade pasta, house sauces, ravioli, lasagna trays & weekly specials from our Whyte Ave shop in Edmonton. Pre-order or grab & go.',
  ogImage: IMG.product,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'pasta-shop', label: 'Pasta Shop' }])
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'pasta-shop', label: 'Pasta Shop' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.product}');" aria-labelledby="shop-h1">
      <div class="hero__inner reveal">
        <span class="label">From Our Kitchen, With Purpose</span>
        <h1 id="shop-h1">Fresh Pasta for Home</h1>
        <p>The same handmade pasta we serve, ready for your own kitchen. Each dish is made fresh to order — call ahead to reserve yours for pickup on Whyte Ave.</p>
        <div class="btn-group">
          <a href="tel:${NAP.phoneHref}" class="btn btn--terra">Call to Order</a>
          <a href="reservations.html" class="btn btn--outline">Reserve a Table</a>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="shop-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:54px;">
          <span class="label" style="color:var(--terracotta);">The Shop Menu</span>
          <h2 id="shop-h">Made today, cooked at yours.</h2>
          <p>Handmade in our kitchen and crafted fresh to order — please allow about 2 hours. Call <a href="tel:${NAP.phoneHref}">${NAP.phone}</a> to reserve your dishes for pickup; availability rotates with the season.</p>
        </div>
        <div class="offer-grid reveal" data-stagger>
          <article class="offer-card">
            <div class="offer-card__img zoom">${img(IMG.food, 'Handmade gnocchi with Plasé tomato sauce from da Cecot, Edmonton')}</div>
            <div class="offer-card__body">
              <h3>Gnocchi di Pomodoro Plasé</h3>
              <p>Soft, pillowy gnocchi crafted fresh by hand, served with our signature Plasé tomato sauce — rich, comforting flavour in every bite. Served hot for lunch.</p>
              <span class="offer-card__price">$12 <small>Individual · 250 g</small></span>
              <p class="offer-card__opts">Family size (450 g) — $24 · Add stracciatella +$5 · Italian salad +$4</p>
              <p class="offer-card__allergens">Contains: dairy, egg, gluten</p>
            </div>
          </article>
          <article class="offer-card">
            <div class="offer-card__img zoom">${img(IMG.product, 'Handmade potato and sausage ravioli with butter and sage from da Cecot, Edmonton')}</div>
            <div class="offer-card__body">
              <h3>Potato &amp; Sausage Ravioli</h3>
              <p>Handmade ravioli generously filled with tender potato and savoury sausage, paired with our handmade butter &amp; sage sauce to finish at home.</p>
              <span class="offer-card__price">$18 <small>Individual · 250 g</small></span>
              <p class="offer-card__opts">Family size (450 g) — $30</p>
              <p class="offer-card__allergens">Contains: egg, gluten, dairy</p>
            </div>
          </article>
          <article class="offer-card">
            <div class="offer-card__img zoom">${img(IMG.greenpasta, 'Green spinach tortelloni filled with cheese in mushroom sauce from da Cecot, Edmonton')}</div>
            <div class="offer-card__body">
              <h3>Tortelloni Verdi</h3>
              <p>Delicate hand-closed spinach pasta parcels filled with a creamy blend of fine cheeses, served in a luxurious, velvety mushroom sauce. An elegant taste of Italian comfort.</p>
              <span class="offer-card__price">$18 <small>Individual · 250 g</small></span>
              <p class="offer-card__opts">Family size available — call for pricing</p>
              <p class="offer-card__allergens">Contains: gluten, dairy, egg, soy</p>
            </div>
          </article>
          <article class="offer-card">
            <div class="offer-card__img zoom">${img(IMG.lasagna, 'Sfoglia lasagna bianca with beef and mozzarella from da Cecot, Edmonton')}</div>
            <div class="offer-card__body">
              <h3>Sfoglia Lasagna Bianca</h3>
              <p>A delicate white-sauce lasagna of thin handmade pasta sheets, layered with seasoned beef, creamy béchamel, and mozzarella. A lighter alternative to red-sauce lasagna — still hearty and satisfying.</p>
              <span class="offer-card__price">$18</span>
              <p class="offer-card__opts">Made fresh to order</p>
              <p class="offer-card__allergens">Contains: dairy, egg, gluten, soy</p>
            </div>
          </article>
          <article class="offer-card offer-card--cta">
            <div class="offer-card__body">
              <h3>Reserve Your Pasta</h3>
              <p>Every dish is made fresh to order (about 2 hours' notice). Call ahead and we'll have it ready for pickup on Whyte Avenue — large orders welcome.</p>
              <a href="tel:${NAP.phoneHref}" class="btn btn--terra" style="margin-top:6px;">Call ${NAP.phone}</a>
            </div>
          </article>
        </div>
        <p class="text-center reveal" style="margin-top:36px; opacity:0.75; font-size:0.95rem;">Menu, sizes, and availability change with the season. Call <a href="tel:${NAP.phoneHref}" style="color:var(--terracotta);">${NAP.phone}</a> or email <a href="mailto:${NAP.email}" style="color:var(--terracotta);">${NAP.email}</a> for today's selection, family sizes, and large orders.</p>
      </div>
    </section>

    <section class="fullbleed hero--parallax" style="background-image:url('${IMG.freshpasta}');" aria-label="Fresh handmade pasta at da Cecot, Edmonton">
      <div class="fullbleed__inner reveal">
        <p class="fullbleed__quote">"The same pasta we serve — now in your kitchen."</p>
        <div class="btn-wrap"><a href="reservations.html" class="btn btn--green">Reserve a Table</a></div>
      </div>
    </section>`
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
