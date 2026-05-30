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
  { slug: 'catering',              label: 'Catering' }
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
  const dropItems = EXPERIENCE_PAGES.map(p =>
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
        ${link('menu', 'Menu', 'menu')}
        ${link('about', 'About', 'about')}
        ${link('reservations', 'Reservations', 'reservations')}
        ${link('events', 'Events', 'events')}
        <li class="has-dropdown">
          <button class="dropdown-toggle${expActive ? ' active' : ''}" aria-expanded="false" aria-haspopup="true">Experiences <span class="caret">▾</span></button>
          <ul class="dropdown-menu">
          ${dropItems}
          </ul>
        </li>
        ${link('contact', 'Contact', 'contact')}
        ${link('partnerships', 'Partnerships', 'partnerships')}
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
  return `  <footer class="footer">
    <div class="footer__logo">da Cecot</div>
    <nav class="footer__nav" aria-label="Footer">
      <a href="index.html">Home</a>
      <a href="menu.html">Menu</a>
      <a href="about.html">About</a>
      <a href="experiences.html">Experiences</a>
      <a href="events.html">Events</a>
      <a href="contact.html">Contact</a>
    </nav>
    <nav class="footer__nav footer__nav--secondary" aria-label="More">
      <a href="partnerships.html">Wholesale &amp; Retail Partnerships</a>
      <a href="reservations.html">Book a Table</a>
    </nav>
    <div class="footer__cols">
      <div>
        <h2>Get in Touch</h2>
        <p>
          <a href="tel:${NAP.phoneHref}">${NAP.phone}</a><br>
          <a href="mailto:${NAP.email}">${NAP.email}</a><br>
          <span>${NAP.street}, ${NAP.city}, ${NAP.region}</span>
        </p>
      </div>
      <div>
        <h2>Hours of Operation</h2>
        <p>
          Mon–Tue: 11:30 AM–2 PM &amp; 4–8 PM<br>
          Wed: Closed<br>
          Thu: 4 PM–8 PM<br>
          Fri: 11:30 AM–2 PM &amp; 4–9 PM<br>
          Sat: 12 PM–8 PM<br>
          Sun: 4 PM–8 PM<br>
          Sunday pasta class: 12–3 PM public · 4:30–7:30 PM class
        </p>
      </div>
    </div>
    <div class="footer__social">
      <a href="https://www.instagram.com/" target="_blank" rel="noopener" aria-label="da Cecot on Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.3.8-.4.4-.6.8-.8 1.3-.2.4-.3 1-.4 2.1C2.6 9.9 2.6 10.3 2.6 12s0 2.1.1 3.3c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.3.4.4.8.6 1.3.8.4.2 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.3-.8.4-.4.6-.8.8-1.3.2-.4.3-1 .4-2.1.1-1.2.1-1.6.1-3.3s0-2.1-.1-3.3c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.3-.4-.4-.8-.6-1.3-.8-.4-.2-1-.3-2.1-.4-1.2-.1-1.6-.1-4.7-.1zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8zm0 8.1a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm6.2-8.3a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0z"/></svg></a>
      <a href="https://www.facebook.com/" target="_blank" rel="noopener" aria-label="da Cecot on Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8.5h2.5V5.2C16 5.1 14.9 5 13.7 5 11.1 5 9.3 6.6 9.3 9.5v2.3H6.5V15h2.8v8h3.4v-8h2.7l.4-3.2h-3.1V9.8c0-.9.3-1.3 1.3-1.3z"/></svg></a>
    </div>
    <p class="footer__copy">© 2025 da Cecot Food Inc. · Authentic Italian comfort food in Edmonton, AB.</p>
  </footer>

  <button class="back-to-top" aria-label="Back to top">↑</button>
  <script src="js/main.js"></script>`;
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
  <link rel="stylesheet" href="css/styles.min.css">
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
  body: `    <section class="hero hero--home hero--parallax" style="background-image:url('${IMG.hero}');">
      <div class="hero__inner reveal">
        <span class="label">On Whyte Avenue · Edmonton</span>
        <h1 class="hero__brand">da Cecot</h1>
        <p class="hero__tag">Authentic Italian comfort food, from our family to yours — a handcrafted pasta bar in the heart of Edmonton.</p>
        <div class="btn-group">
          <a href="menu.html" class="btn btn--terra">Explore Menu</a>
          <a href="reservations.html" class="btn btn--ghost">Reserve a Table</a>
        </div>
      </div>
      <a class="hero__scroll" href="#welcome" aria-label="Scroll to content"><span></span></a>
    </section>

    <section id="welcome" class="section section--cream" aria-labelledby="community-h">
      <div class="container text-center narrow reveal">
        <span class="label" style="color:var(--warm-brown);">Benvenuti</span>
        <h2 id="community-h">We create community around the table, one plate at a time.</h2>
        <p>da Cecot is a place where families, students, and neighbours of all ages gather to share simple, delicious meals. We believe food is a right, not a luxury — a way to nourish, connect, and uplift.</p>
        <p>Rooted in recipes passed down through generations, every dish is a testament to love, patience, and craft. Through every bite, we bring a little joy home and remind everyone that a caring community can make anything possible.</p>
        ${cta('about.html', 'Our Story', 'terra')}
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="offer-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:60px;">
          <span class="label">What We Offer</span>
          <h2 id="offer-h">More than a meal.</h2>
          <p>From our daily pasta bar to hands-on classes and full-service catering, there's a way for everyone to pull up a chair.</p>
        </div>
        <div class="offer-grid reveal" data-stagger>
          <a class="offer-card" href="menu.html">
            <div class="offer-card__img zoom">${img(IMG.pasta, 'Fresh handmade pasta at the da Cecot pasta bar in Edmonton')}</div>
            <div class="offer-card__body">
              <h3>The Pasta Bar</h3>
              <p>Build your own bowl — choose a fresh pasta shape and a slow-cooked house sauce. Dine in or grab it &amp; go.</p>
              <span class="offer-card__link">View the Menu</span>
            </div>
          </a>
          <a class="offer-card" href="experiences.html">
            <div class="offer-card__img zoom">${img(IMG.pastawine, 'Hands-on pasta-making experience at da Cecot, Edmonton')}</div>
            <div class="offer-card__body">
              <h3>Experiences</h3>
              <p>Pasta classes, community drop-in nights, wine pairings, and private dinners at our family table.</p>
              <span class="offer-card__link">Explore Experiences</span>
            </div>
          </a>
          <a class="offer-card" href="catering.html">
            <div class="offer-card__img zoom">${img(IMG.lasagna, 'Italian catering trays of lasagna from da Cecot, Edmonton')}</div>
            <div class="offer-card__body">
              <h3>Catering</h3>
              <p>Budget-friendly, handcrafted Italian catering for offices, parties, and celebrations across Edmonton.</p>
              <span class="offer-card__link">Get a Quote</span>
            </div>
          </a>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="taste-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:50px;">
          <span class="label" style="color:var(--warm-brown);">A Taste of da Cecot</span>
          <h2 id="taste-h">Made fresh, served with love.</h2>
        </div>
        <div class="gallery gallery--4 reveal" data-stagger>
          <figure class="zoom">${img(IMG.food, 'Italian comfort food plated at da Cecot, Edmonton')}</figure>
          <figure class="zoom">${img(IMG.sauce, 'Slow-cooked house sauce at da Cecot, Edmonton')}</figure>
          <figure class="zoom">${img(IMG.freshpasta, 'Fresh handmade pasta drying at da Cecot, Edmonton')}</figure>
          <figure class="zoom">${img(IMG.dining, 'A warm dinner table set at da Cecot, Edmonton')}</figure>
        </div>
      </div>
    </section>

    <section class="fullbleed hero--parallax" style="background-image:url('${IMG.greenpasta}');" aria-label="Fresh pasta at da Cecot Food, Edmonton">
      <div class="fullbleed__inner reveal">
        <p class="fullbleed__quote">"Through every bite, we bring a little joy home."</p>
        <span class="fullbleed__by">— the Cecot family</span>
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
    </section>

    <section class="section section--cream" aria-labelledby="order-h">
      <div class="container text-center narrow reveal">
        <span class="label" style="color:var(--warm-brown);">Delivery &amp; Pickup</span>
        <h2 id="order-h">Order out.</h2>
        <p>Can't dine in? Order fresh pasta, sauces, and our signature dishes for delivery or pickup through Cookin — Edmonton's home-cook marketplace. Browse the latest menu, check availability, and have comfort food on its way.</p>
        ${cta('https://www.cookin.com/', 'Order on Cookin', 'green')}
      </div>
    </section>`
}));

/* ---------- MENU ---------- */
const menuFaqs = [
  { q: 'What is on the da Cecot menu?', a: 'Our menu is a build-your-own pasta bar: choose a pasta shape (Caserecce, Rigatoni, Tagliatelle, or Traditional Ravioli) and pair it with a house sauce such as Ragù Bolognese, Plasé (tomato), Cacio e Pepé, Salsa al Baffo (rosé), or Butter & Sage. We also bake fresh lasagna daily and serve Italian coffee, soft drinks, and housemade tiramisu.' },
  { q: 'Do you offer takeout pasta?', a: 'Yes. Every dish is built for dine-in or takeout. Caserecce is our signature takeout pasta — its twist and ridges hold sauce beautifully and stay perfectly al dente on the way home. You can also buy our fresh pasta raw to cook at home.' },
  { q: 'Can you accommodate dietary restrictions?', a: 'We can help with many dietary needs. Call us ahead at (825) 888-4218 with any questions about ingredients, allergens, or to place a large order in advance.' }
];
pages.push(page({
  slug: 'menu',
  active: 'menu',
  title: 'Menu | da Cecot Pasta Bar, Edmonton',
  description: 'Explore the da Cecot pasta bar: fresh pasta shapes, slow-cooked Italian sauces, daily lasagna, coffee & housemade tiramisu. Dine in or grab it & go.',
  ogImage: IMG.greenpasta,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'menu', label: 'Menu' }]),
    faqSchema(menuFaqs)
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'menu', label: 'Menu' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.greenpasta}');" aria-labelledby="menu-h1">
      <div class="hero__inner reveal">
        <span class="label">Our Menu</span>
        <h1 id="menu-h1">The Pasta Bar</h1>
        <p>Fresh pasta shapes, slow-cooked house sauces, and lasagna baked daily. Build your own bowl — dine in or grab it &amp; go.</p>
        <p class="hero__note">À la carte · Call ahead for dietary questions or large orders</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="pastabar-h">
      <div class="container">
        <div class="two-col menu-row reveal">
          <figure class="menu-photo zoom">${img(IMG.pasta, 'Fresh handmade pasta bowl at the da Cecot pasta bar, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label">Build Your Bowl</span>
            <h2 id="pastabar-h">Pasta Shapes</h2>
            <span class="menu-sub">Always Available</span>
            <ul class="menu-list">
              <li>Caserecce</li><li>Rigatoni</li><li>Tagliatelle</li><li>Traditional Ravioli</li>
            </ul>
            <span class="menu-sub">Rotating Based on Availability</span>
            <ul class="menu-list">
              <li>Radiatori</li><li>Mafalde</li><li>Spaghetti</li>
            </ul>
          </div>
        </div>

        <div class="two-col menu-row menu-row--rev reveal" style="margin-top:clamp(56px,8vw,96px);">
          <figure class="menu-photo zoom">${img(IMG.sauce, 'Slow-cooked Italian sauce at da Cecot, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label">Pick Your Sauce</span>
            <h2>Sauces</h2>
            <ul class="menu-list">
              <li>Ragù Bolognese</li>
              <li>Plasé <span>Tomato</span></li>
              <li>Cacio e Pepé</li>
              <li>Salsa al Baffo <span>Rosé</span></li>
              <li>Butter &amp; Sage</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="fullbleed hero--parallax" style="background-image:url('${IMG.food}');" aria-label="Italian comfort food plated at da Cecot, Edmonton">
      <div class="fullbleed__inner reveal">
        <p class="fullbleed__quote">"Fresh pasta, made by hand, every single day."</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="lasagna-h">
      <div class="container">
        <div class="two-col menu-row reveal">
          <figure class="menu-photo zoom">${img(IMG.lasagna, 'Hand-layered lasagna baked fresh daily at da Cecot, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label" style="color:var(--warm-brown);">From the Oven</span>
            <h2 id="lasagna-h">Lasagna, Baked Daily</h2>
            <p>Layered by hand with our slow-cooked ragù, silky béchamel, and Italian cheeses, then baked fresh every morning. Ask our team about today's selection — it goes fast.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="drinks-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:54px;">
          <span class="label">To Finish</span>
          <h2 id="drinks-h">Drinks &amp; Dessert</h2>
        </div>
        <div class="three-col reveal" data-stagger>
          <article class="menu-card"><h3>Moka</h3><p>Fresh Italian coffee, brewed the traditional way.</p></article>
          <article class="menu-card"><h3>Soft Drinks</h3><ul class="menu-list"><li>Coke</li><li>Sanpellegrino</li><li>Fanta</li><li>Iced Tea</li></ul></article>
          <article class="menu-card"><h3>Tiramisu</h3><p>Our housemade recipe — espresso-soaked, light, and made in-house.</p></article>
        </div>
      </div>
    </section>

    <section class="section section--beige" aria-labelledby="philosophy-h">
      <div class="container">
        <div class="two-col menu-row menu-row--rev reveal">
          <figure class="menu-photo zoom">${img(IMG.product, 'Fresh pasta and ravioli ready to take home from da Cecot, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label" style="color:var(--warm-brown);">Our Pasta Philosophy</span>
            <h2 id="philosophy-h">Chosen with intention.</h2>
            <p>Every shape on our menu is picked for a reason. We think carefully about which pastas travel best for takeout — holding their texture and sauce from our kitchen to your table.</p>
            <p>Caserecce is our signature takeout pasta: its twist and ridges cradle sauce beautifully and stay perfectly al dente on the journey home. Prefer to cook it yourself? We also sell our fresh pasta raw.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="menu-faq-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:40px;"><h2 id="menu-faq-h">Menu FAQ</h2></div>
${faqBlock(menuFaqs)}
      </div>
    </section>`
}));

/* ---------- ABOUT ---------- */
pages.push(page({
  slug: 'about',
  active: 'about',
  title: 'About da Cecot | Family-Run Italian Kitchen, Edmonton',
  description: "Meet the Cecot family — a Nigerian-Italian family who brought their pasta traditions to Edmonton in 2021. Our story of community, tradition & sustainability.",
  ogImage: IMG.family,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'about', label: 'About' }]),
    { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About da Cecot Food', url: BASE + '/about.html', about: restaurantSchema() }
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'about', label: 'About' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.pastawine}');" aria-labelledby="about-h1">
      <div class="hero__inner reveal">
        <span class="label">Our Story</span>
        <h1 id="about-h1">About da Cecot</h1>
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
            <h2 id="family-h">Ciao! We are the Cecot family.</h2>
            <p>Our family carries two homes in its heart — the vibrant warmth of Nigeria and the rich culinary tradition of Italy. In 2021 we moved to Canada and brought our recipes, our memories, and our love of feeding people with us.</p>
            <p>One of our earliest traditions was making Strucchi, the little sweet pastries we'd prepare together for special occasions. That spirit — of cooking side by side and sharing what we make — is the foundation of everything we do at da Cecot.</p>
            <p class="signature">— Diego, Erika, Giovanni &amp; Ennio</p>
            ${cta('contact.html', 'Get in Touch', 'green')}
          </div>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="vision-h">
      <div class="container"><div class="two-col menu-row reveal">
        <figure class="menu-photo zoom">${img(IMG.dining, 'A welcoming dinner table at da Cecot, Edmonton')}</figure>
        <div class="menu-copy">
          <span class="label">Our Vision</span>
          <h2 id="vision-h">Food is a bridge.</h2>
          <p>We believe food connects people across cultures, generations, and backgrounds — and preserves the traditions that make us who we are. Through every plate we serve, we share a piece of our heritage and create a place where everyone feels they belong.</p>
        </div>
      </div></div>
    </section>

    <section class="section section--beige" aria-labelledby="access-h">
      <div class="container"><div class="two-col menu-row menu-row--rev reveal">
        <figure class="menu-photo zoom">${img(IMG.food, 'Affordable, inclusive Italian comfort food at da Cecot, Edmonton')}</figure>
        <div class="menu-copy">
          <span class="label" style="color:var(--warm-brown);">Accessibility</span>
          <h2 id="access-h">A place for everyone.</h2>
          <p>Great food should be for everyone. We keep our menu affordable, inclusive, and welcoming — with thoughtful options for a range of dietary needs. Whether you're stopping in for a quick bowl or gathering with friends, there's always a place for you at our table.</p>
        </div>
      </div></div>
    </section>

    <section class="section section--brown" aria-labelledby="empower-h">
      <div class="container"><div class="two-col menu-row reveal">
        <figure class="menu-photo zoom">${img(IMG.freshpasta, 'Hands making fresh pasta in the da Cecot kitchen, Edmonton')}</figure>
        <div class="menu-copy">
          <span class="label">Our Team</span>
          <h2 id="empower-h">Empowerment in the workplace.</h2>
          <p>We're proud to create meaningful work opportunities and to invest in the people who join us. From culinary skills to confidence in the kitchen, we want our team to grow with us — building careers, community, and craft along the way.</p>
        </div>
      </div></div>
    </section>

    <section class="section section--cream" aria-labelledby="join-h">
      <div class="container text-center narrow reveal">
        <h2 id="join-h">Join the Family!</h2>
        <p>When you walk through our doors, you're not just a customer — you're family. Come share a meal, learn to make pasta, or simply say hello. We can't wait to welcome you.</p>
        ${cta('contact.html', 'Get in Touch', 'green')}
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
      <div class="booking reveal">
        <form data-mock aria-label="Reservation request">
          <div class="form-row">
            <div class="field">
              <label for="party">Party Size</label>
              <select id="party" name="party">
                <option>1 guest</option><option selected>2 guests</option><option>3 guests</option><option>4 guests</option><option>5 guests</option><option>6 guests</option><option>7+ guests</option>
              </select>
            </div>
            <div class="field"><label for="date">Date</label><input type="date" id="date" name="date" required></div>
          </div>
          <div class="field">
            <label for="time">Time</label>
            <select id="time" name="time" required>
              <option value="">Select a time</option>
              <option>11:30 AM</option><option>12:00 PM</option><option>12:30 PM</option><option>1:00 PM</option><option>4:00 PM</option><option>5:00 PM</option><option>6:00 PM</option><option>7:00 PM</option><option>8:00 PM</option>
            </select>
          </div>
          <div class="field"><label for="rname">Name</label><input type="text" id="rname" name="name" required></div>
          <div class="field"><label for="rphone">Phone</label><input type="tel" id="rphone" name="phone" required></div>
          <button type="submit" class="btn btn--green" style="width:100%;">Request Reservation</button>
          <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Thanks! Your reservation request has been received — we'll confirm with you shortly.</div>
        </form>
      </div>
    </section>`
}));

/* ---------- EVENTS ---------- */
pages.push(page({
  slug: 'events',
  active: 'events',
  title: 'Events & Catering | da Cecot Food, Edmonton',
  description: 'Pasta classes, La Famiglia private dinners, after-hours space rental and catering in Edmonton. Elevate your event with budget-friendly Italian food.',
  ogImage: IMG.pastawine,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'events', label: 'Events' }])
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'events', label: 'Events' }])}

    <section class="hero hero--page" style="background-image:url('${IMG.pastawine}');" aria-labelledby="events-h1">
      <div class="hero__inner reveal"><h1 id="events-h1">Our Events</h1></div>
    </section>

    <section class="section section--brown" aria-labelledby="ev-classes-h">
      <div class="container"><div class="two-col reveal">
        ${img(IMG.pastawine, 'Hands shaping fresh pasta dough at a da Cecot pasta class', 'circle-img')}
        <div>
          <h2 id="ev-classes-h">Pasta Classes</h2>
          <p>Roll up your sleeves and learn to make pasta the way we do — by hand, from scratch. Hands-on classes are equal parts technique and good company, ending with a meal of everything you've made.</p>
          <ul class="detail-list">
            <li><strong>When:</strong> Twice monthly</li>
            <li><strong>Length:</strong> 2.5–3 hours</li>
            <li><strong>Price:</strong> Starting from $95 per person · $185 per couple</li>
            <li><strong>Group size:</strong> Maximum 15 people</li>
          </ul>
          <div class="btn-wrap text-center"><a href="sunday-pasta-classes.html" class="btn btn--terra">Learn More</a></div>
        </div>
      </div></div>
    </section>

    <section class="section section--cream" aria-labelledby="ev-fam-h">
      <div class="container"><div class="two-col reveal">
        <div>
          <h2 id="ev-fam-h">La Famiglia Private Events</h2>
          <p>Gather your people for an unforgettable evening at our family table — a private, multi-course Italian dinner paired with wine, music, and the unhurried warmth of a real Italian gathering.</p>
          <ul class="detail-list">
            <li><strong>Guests:</strong> 10–25</li>
            <li><strong>Includes:</strong> Multi-course menu, wine &amp; music</li>
            <li><strong>Length:</strong> 2.5–3 hours</li>
            <li><strong>Price:</strong> Starting from $95 per guest</li>
            <li><strong>Booking:</strong> 50% deposit to reserve</li>
          </ul>
          <div class="btn-wrap text-center"><a href="private-events.html" class="btn btn--green">Learn More</a></div>
        </div>
        ${img(IMG.wine, 'Wine glasses set for a La Famiglia private dinner at da Cecot', 'circle-img')}
      </div></div>
    </section>

    <section class="section section--olive" aria-labelledby="ev-space-h">
      <div class="container text-center narrow reveal">
        <h2 id="ev-space-h">Use Our Space</h2>
        <p>After hours, our kitchen and dining room are open for collaboration. We welcome artists, performers, bakers, and startups to rent the space for pop-ups, workshops, and events — complete with a commercial kitchen and a prime Edmonton location.</p>
        ${cta('contact.html', 'Inquire', 'terra')}
      </div>
    </section>`
}));

/* ---------- CONTACT ---------- */
pages.push(page({
  slug: 'contact',
  active: 'contact',
  title: 'Contact da Cecot Food | Edmonton Italian Restaurant',
  description: 'Contact da Cecot Food in Edmonton at (825) 888-4218 or info@dacecotfood.com. Find us on Whyte Avenue at 104 Street. Questions, wholesale, catering & reservations.',
  ogImage: IMG.food,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'contact', label: 'Contact' }]),
    restaurantSchema({ '@type': ['Restaurant', 'LocalBusiness'], hasMap: MAPS_LINK })
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'contact', label: 'Contact' }])}

    <section class="section section--olive" aria-labelledby="contact-h1">
      <div class="container text-center reveal" style="margin-bottom:50px;">
        <span class="label">Let's Connect</span>
        <h1 id="contact-h1">Get in Touch</h1>
        <p class="narrow lead" style="margin:18px auto 0;">Have a question about our menu, dietary options, wholesale, or catering? We'd love to hear from you. Reach out below and we'll be in touch soon.</p>
      </div>
      <div class="container">
        <div class="contact-grid reveal">
          <div class="contact-info">
            <h2>Reach us directly</h2>
            <ul class="contact-list">
              <li><span>Address</span><a href="${MAPS_LINK}" target="_blank" rel="noopener">Whyte Ave (82 Ave) &amp; 104 Street, Edmonton, AB</a></li>
              <li><span>Phone</span><a href="tel:${NAP.phoneHref}">${NAP.phone}</a></li>
              <li><span>Email</span><a href="mailto:${NAP.email}">${NAP.email}</a></li>
            </ul>
            <h3>Hours</h3>
            <table class="hours-table">
              <tr><th>Mon – Tue</th><td>11:30 AM – 2 PM · 4 – 8 PM</td></tr>
              <tr><th>Wed</th><td>Closed</td></tr>
              <tr><th>Thu</th><td>4 – 8 PM</td></tr>
              <tr><th>Fri</th><td>11:30 AM – 2 PM · 4 – 9 PM</td></tr>
              <tr><th>Sat</th><td>12 – 8 PM</td></tr>
              <tr><th>Sun</th><td>4 – 8 PM</td></tr>
            </table>
          </div>
          <div class="contact-form-wrap">
            <form class="form" data-mock aria-label="Contact form">
              <div class="form-row">
                <div class="field"><label for="fname">First Name *</label><input type="text" id="fname" name="firstName" required></div>
                <div class="field"><label for="lname">Last Name *</label><input type="text" id="lname" name="lastName" required></div>
              </div>
              <div class="form-row">
                <div class="field"><label for="phone">Phone *</label><input type="tel" id="phone" name="phone" required></div>
                <div class="field"><label for="email">Email *</label><input type="email" id="email" name="email" required></div>
              </div>
              <div class="field"><label for="message">Message *</label><textarea id="message" name="message" placeholder="What are you inquiring about?" required></textarea></div>
              <button type="submit" class="btn btn--terra" style="width:100%;">Send Message</button>
              <div class="form-success">Thanks for reaching out! We will get back to you as soon as possible.</div>
            </form>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="book-h">
      <div class="container text-center narrow reveal">
        <span class="label" style="color:var(--warm-brown);">Save Your Spot</span>
        <h2 id="book-h">Book a Table</h2>
        <p>Seating is limited and reservations are required for our weekend specials — we cap each seating at 26 guests to keep the evening intimate.</p>
        <p>Stopping in for one of our signature Caserecce bowls? Those are always walk-in friendly. Pull up a seat any time.</p>
        ${cta('reservations.html', 'Reserve Now', 'green')}
      </div>
    </section>

    <section class="map-embed" aria-label="Map to da Cecot Food on Whyte Avenue at 104 Street, Edmonton">
      <iframe src="${MAPS_EMBED}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map showing da Cecot Food on Whyte Avenue at 104 Street, Edmonton, AB"></iframe>
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

    <section class="hero hero--dark" style="background-image:url('${IMG.partnerbg}');" aria-labelledby="part-h1">
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
        ${cta('contact.html', 'Inquire', 'terra')}
      </div>
    </section>`
}));

module.exports = { pages, page, breadcrumb, breadcrumbSchema, faqBlock, faqSchema, cta, img, restaurantSchema, IMG, BASE, EXPERIENCE_PAGES, ROOT, fs, path };

/* the experiences pages are appended from build-experiences.js to keep files readable */
require('./build-experiences.js');
