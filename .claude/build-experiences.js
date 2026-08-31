/* ============================================================
   da Cecot Food — Experiences sub-pages + final site writer
   Required by build.js (run: node .claude/build.js)
   ============================================================ */
const B = require('./build.js');
const { pages, page, breadcrumb, breadcrumbSchema, faqBlock, faqSchema, cta, img, IMG, BASE, EXPERIENCE_PAGES, ROOT, fs, path } = B;
const content = require('../lib/cms/content');

const NAP = {
  name: content.get('businessName'), phone: content.get('phone'),
  street: '82 Avenue (Whyte Avenue) & 104 Street', city: content.get('city'), region: content.get('region'), country: 'CA'
};
const POSTAL_ADDRESS = {
  '@type': 'PostalAddress', streetAddress: NAP.street, addressLocality: NAP.city,
  addressRegion: NAP.region, addressCountry: NAP.country
};

/* Build <option> tags for the next `count` weekly class dates from a start date.
   Past dates are dropped automatically at build time, so the list stays current. */
function weeklyDateOptions(startISO, count) {
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  let d = new Date(sy, sm - 1, sd); // local midnight — no timezone-parsing ambiguity
  for (let i = 0; out.length < count && i < 520; i++) {
    if (d >= today) {
      const m = d.getMonth(), day = d.getDate(), y = d.getFullYear();
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      out.push(`<option value="${iso}">${WD[d.getDay()]}, ${MO[m]} ${day}, ${y}</option>`);
    }
    d.setDate(d.getDate() + 7);
  }
  return out.join('\n                  ');
}
const guestOptions = (max) => Array.from({ length: max }, (_, i) => `<option>${i + 1} guest${i ? 's' : ''}</option>`).join('');
const WD_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ---- Pasta class schedule + cap (editable; CMS-driven once content.json is wired) ----
   Sunday classes run every Sunday Sep 20 – Nov 30, 2026, EXCEPT the first Sunday
   of each month — da Cecot is closed the first Sunday of every month (Oct 4 &
   Nov 1 are therefore skipped). Cap: 12 guests per class. */
const CLASS_MAX = content.num('classMax');
const CLASS_DATES = content.list('classDates');

// Turn full date strings into radio "pills". Short label: "Sun · Sep 20".
function datePills(name, dates, required) {
  const WD3 = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };
  const MO3 = { January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun', July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec' };
  return dates.map((d, i) => {
    const m = d.match(/^(\w+), (\w+) (\d+),/);
    const short = m ? `${WD3[m[1]]} · ${MO3[m[2]]} ${m[3]}` : d;
    return `<label class="date-pill"><input type="radio" name="${name}" value="${d}"${i === 0 && required ? ' required' : ''}><span>${short}</span></label>`;
  }).join('\n                ');
}

// Next `count` upcoming dates that fall on `targetDow` (0=Sun..6=Sat), from today.
// Used for the open-ended Thursday drop-in so its list never goes stale.
function upcomingWeekdays(targetDow, count) {
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  while (d.getDay() !== targetDow) d.setDate(d.getDate() + 1);
  const out = [];
  for (let i = 0; i < count; i++) { out.push(`${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`); d.setDate(d.getDate() + 7); }
  return out;
}
const DROP_IN_DATES = upcomingWeekdays(4, 6); // next 6 Thursdays

/* Interactive booking calendar — JS in main.js hydrates it (weekday-only, blocks first weekday of month if set). */
function bookingCalendar({ weekday, blockFirst = false, weeks = 8, start, name, prompt }) {
  const dow = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => `<span>${d}</span>`).join('');
  const legend = blockFirst ? `<p class="cal__legend">The first ${WD_NAMES[weekday]} of each month is closed.</p>` : '';
  return `<div class="cal" data-cal-weekday="${weekday}" data-cal-block-first="${blockFirst ? '1' : '0'}" data-cal-weeks="${weeks}" data-cal-start="${start}">
            <div class="cal__head">
              <button type="button" class="cal__nav" data-cal-prev aria-label="Previous month">&lsaquo;</button>
              <span class="cal__title" data-cal-title></span>
              <button type="button" class="cal__nav" data-cal-next aria-label="Next month">&rsaquo;</button>
            </div>
            <div class="cal__dow" aria-hidden="true">${dow}</div>
            <div class="cal__grid" data-cal-grid role="grid"></div>
            <p class="cal__selected" data-cal-selected>${prompt}</p>
            ${legend}
            <input type="hidden" name="${name}" data-cal-input required>
          </div>`;
}

function eventSchema({ slug, name, desc, image, byDay, startTime, price }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: name,
    description: desc,
    image: image.startsWith('http') ? image : `${BASE}/${image}`,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'Place', name: NAP.name, address: POSTAL_ADDRESS },
    organizer: { '@type': 'Organization', name: NAP.name, url: BASE },
    eventSchedule: {
      '@type': 'Schedule',
      repeatFrequency: 'P1W',
      byDay: byDay,
      startTime: startTime
    },
    offers: {
      '@type': 'Offer',
      price: price,
      priceCurrency: 'CAD',
      availability: 'https://schema.org/InStock',
      url: `${BASE}/${slug}.html`
    }
  };
}
function serviceSchema({ slug, name, desc, image, priceNote }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: name,
    name: name,
    description: desc,
    image: image.startsWith('http') ? image : `${BASE}/${image}`,
    provider: { '@type': 'Restaurant', name: NAP.name, url: BASE, address: POSTAL_ADDRESS, telephone: NAP.phone },
    areaServed: { '@type': 'City', name: 'Edmonton' },
    url: `${BASE}/${slug}.html`,
    offers: { '@type': 'Offer', priceCurrency: 'CAD', description: priceNote, url: `${BASE}/${slug}.html` }
  };
}
const trail = (label) => [{ slug: 'index', label: 'Home' }, { slug: 'experiences', label: 'Experiences' }, { slug: '', label: label }];

/* small helper: standard experience page sections */
function expHero(id, h1, sub, image, dark, pos) {
  const posStyle = pos ? ` background-position:${pos};` : '';
  return `    <section class="hero hero--page${dark ? ' hero--dark' : ''}" style="background-image:url('${image}');${posStyle}" aria-labelledby="${id}">
      <div class="hero__inner reveal">
        <h1 id="${id}">${h1}</h1>
        <p>${sub}</p>
      </div>
    </section>`;
}

/* ============================================================
   EXPERIENCES HUB
   ============================================================ */
const hubFaqs = [
  { q: 'What experiences does da Cecot offer?', a: 'da Cecot offers several core experiences in Edmonton: Pasta Classes (including Pasta With Erika on Thursdays and La Domenica Da Cecot on Sundays), Seasonal & Special Events throughout the year, and Private Events & Pop-Up Restaurants. Each is built around fresh handmade pasta and the warmth of an Italian family table.' },
  { q: 'How do I book a da Cecot experience?', a: 'Pasta Classes are booked using the request form on each class page — pick your date and we confirm your spot. Private Events start with an inquiry form so we can tailor the details to your group. You can also reach us anytime at (825) 888-4218 or info@dacecotfood.com.' },
  { q: 'Where are da Cecot experiences held?', a: 'All experiences take place at our kitchen and dining room on Whyte Avenue (82 Ave) at 104 Street in Edmonton, AB. Pop-up restaurant experiences can also be brought to your venue.' }
];
const hubCards = [
  { slug: 'sunday-pasta-classes', t: 'Pasta Classes', img: 'images/general/erica/erika-class.jpg', d: 'Sunday classes (La Domenica) and Thursday drop-ins (Pasta With Erika) — learn traditional pasta making and the joy of creating something by hand.' },
  { slug: 'sunday-pasta-classes', href: 'sunday-pasta-classes.html#drop-in', t: 'Public Pasta Drop-In', img: IMG.greenpasta, d: 'A relaxed Thursday pasta lab — drop in any Thursday between 5–8 PM and make, cook, and eat your own pasta at your own pace. No fee, no experience needed.' },
  { slug: 'private-events', t: 'Private Events &amp; Pop-Up Restaurants', img: IMG.dining, d: 'Celebrate your special occasion at da Cecot or bring the da Cecot experience to your venue.' }
];
pages.push(page({
  slug: 'experiences',
  active: 'experiences',
  title: 'Pasta Classes & Experiences | da Cecot, Edmonton',
  description: 'Discover da Cecot experiences in Edmonton: Sunday pasta classes, Thursday drop-in nights, wine pairings, private La Famiglia dinners & catering. Reserve now.',
  ogImage: IMG.pastawine,
  schema: [breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'experiences', label: 'Experiences' }]), faqSchema(hubFaqs)],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'experiences', label: 'Experiences' }])}

    <section class="hero hero--page hero--dark hero--parallax" style="background-image:url('${IMG.pastawine}');" aria-labelledby="xp-h1">
      <div class="hero__inner reveal">
        <span class="label">Gather With Us</span>
        <h1 id="xp-h1">Gather around our table.</h1>
        <p>From hands-on pasta classes to seasonal celebrations and private gatherings, discover the experiences that bring people together at da Cecot. At the heart of every experience is the belief that food is meant to be shared, traditions are meant to be passed on, and every table has room for one more guest.</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="xp-intro-h">
      <div class="container text-center narrow reveal" style="margin-bottom:54px;">
        <h2 id="xp-intro-h">Ways to gather around the table</h2>
        <p>da Cecot is more than a pasta bar. We host classes, seasonal celebrations, and private gatherings — each one an invitation to slow down, eat well, and feel like family. Choose the experience that fits your occasion.</p>
      </div>
      <div class="container">
        <div class="card-grid card-grid--center reveal">
${hubCards.map(c => `          <article class="xp-card">
            ${img(c.img, c.t + ' at da Cecot Food, Edmonton')}
            <div class="xp-card__body">
              <h3>${c.t}</h3>
              <p>${c.d}</p>
              <a class="xp-card__link" href="${c.href || c.slug + '.html'}">Learn more</a>
            </div>
          </article>`).join('\n')}
        </div>
      </div>
    </section>

    <section class="section section--linen" aria-labelledby="xp-gallery-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:48px;">
          <span class="label" style="color:var(--terracotta);">From Our Tables</span>
          <h2 id="xp-gallery-h">A few nights at da Cecot.</h2>
          <p>Glasses raised, pasta rolled, friends shoulder-to-shoulder — a glimpse of what gathering at da Cecot actually looks like.</p>
        </div>
        <div class="gallery reveal">
          <figure class="zoom"><img src="images/general/erica/nights-1.jpg" alt="An evening gathering at da Cecot on Whyte Avenue, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/nights-2.jpg" alt="Shaping fresh pasta by hand at a da Cecot evening, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/nights-3.jpg" alt="Guests around the table at a da Cecot night, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/nights-4.jpg" alt="A warm moment at a da Cecot pasta evening, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/nights-5.jpg" alt="Hands kneading fresh pasta dough at da Cecot, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/nights-6.jpg" alt="Friends together at a da Cecot evening, Edmonton" loading="lazy" decoding="async"></figure>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="xp-faq-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:40px;"><h2 id="xp-faq-h">Experiences FAQ</h2></div>
${faqBlock(hubFaqs)}
      </div>
    </section>`
}));

/* ============================================================
   1. SUNDAY PASTA CLASSES
   ============================================================ */
const classFaqs = [
  { q: 'Do I need any cooking experience?', a: 'Not at all. Our Sunday pasta classes are beginner-friendly and fully guided. Whether you have never touched a rolling pin or you cook every night, our team walks you through every step from dough to plate.' },
  { q: 'What is included in a pasta class?', a: 'Your spot includes hands-on instruction, all ingredients and equipment, an apron to use, the pasta you make to enjoy together at the end, and the recipes to take home so you can recreate them.' },
  { q: 'How long is a class and how many people can attend?', a: 'Classes run about 2.5 to 3 hours and are capped at 12 guests so everyone gets personal attention. They run every Sunday evening — except the first Sunday of each month, when we are closed. See the booking form for upcoming dates.' },
  { q: 'Can I come on my own or book for a couple?', a: 'Both work beautifully. Classes are $95 per guest and solo guests are always welcome — most leave with new friends.' },
  { q: 'Can I buy a pasta class as a gift?', a: 'Yes — a pasta class makes a memorable gift. Reach out at (825) 888-4218 or info@dacecotfood.com and we will help you arrange it.' }
];
pages.push(page({
  slug: 'sunday-pasta-classes',
  active: 'sunday-pasta-classes',
  title: 'Pasta Classes | da Cecot, Edmonton — Sunday Classes & Thursday Drop-In',
  description: 'Pasta classes at da Cecot on Whyte Avenue: La Domenica Sunday classes ($95/guest, 5–8:30 PM) and Pasta With Erika Thursday drop-in (5–8 PM). Reserve online.',
  ogImage: IMG.pastawine,
  schema: [
    breadcrumbSchema(trail('Pasta Classes').map((t, i) => i === 2 ? { slug: 'sunday-pasta-classes', label: t.label } : t)),
    eventSchema({ slug: 'sunday-pasta-classes', name: 'Sunday Pasta Class', desc: 'Hands-on Italian pasta-making class in Edmonton, from dough to plate, ending with a shared meal.', image: IMG.pastawine, byDay: 'https://schema.org/Sunday', startTime: '12:00', price: '95' }),
    faqSchema(classFaqs)
  ],
  body: `${breadcrumb(trail('Pasta Classes').map((t, i) => i === 2 ? { slug: 'sunday-pasta-classes', label: t.label } : t))}

${expHero('spc-h1', 'La Domenica Da Cecot', 'Pasta · Amore · Condivisione — Sunday at our family table.', 'images/general/erica/erika-class.jpg', true, 'center 28%')}

    <section class="section section--cream" aria-labelledby="spc-what-h">
      <div class="container narrow reveal text-center">
        <h2 id="spc-what-h">Not every Sunday has a plan.</h2>
        <p class="lead">Some are meant to unfold slowly — with flour on your hands, stories in the air, and a table waiting to be shared.</p>
        <p>At da Cecot, we open our kitchen every Sunday evening for something more than a class and gentler than a dinner. Guests will prepare fresh pasta together, enjoy a shared meal, discover regional traditions, and experience the joy of gathering around an Italian family table.</p>
        <p>We won't tell you every detail. Just come with an open heart, an appetite, and a willingness to share. The rest you'll discover around the table.</p>
        <p style="margin-top:24px; font-style:italic; color:var(--terracotta);">"It all starts with intention and a prayer."</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="spc-incl-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:14px;"><h2 id="spc-incl-h">Booking information</h2></div>
        <div class="info-grid reveal">
          <div><h3>$95 per guest</h3><p>Adults only (18+).</p></div>
          <div><h3>5:00 – 8:30 PM</h3><p>Every Sunday · Sep 20 – Nov 30.</p></div>
          <div><h3>Up to ${CLASS_MAX} guests</h3><p>Small classes — ${CLASS_MAX} seats max per Sunday.</p></div>
          <div><h3>Please note</h3><p>Closed the first Sunday of each month.</p></div>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="spc-book-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <h2 id="spc-book-h">Book your class spot</h2>
          <p>Classes are $95 per guest, run from 5–8:30 PM, and are capped at ${CLASS_MAX} guests. Choose one of our upcoming class dates below — or call us at <a href="tel:+18258884218">(825) 888-4218</a>.</p>
        </div>
        <div class="booking" style="margin-top:32px;">
          <form data-formsubmit data-pay-url="https://square.link/u/mTkWSnl5" data-subject="Sunday Pasta Class Booking — da Cecot" aria-label="Sunday pasta class booking request">
            <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
            <fieldset class="date-picker">
              <legend class="date-picker__legend">Choose your class date</legend>
              <div class="date-picker__grid">
                ${datePills('class_date', CLASS_DATES, true)}
              </div>
              <p class="date-picker__note" style="margin-top:12px; font-size:0.9em; opacity:0.75;">Closed the first Sunday of each month.</p>
            </fieldset>
            <div class="field" style="margin-top:22px;">
              <label for="spc-guests">Number of guests <span style="font-weight:400;opacity:0.7;">(max ${CLASS_MAX})</span></label>
              <select id="spc-guests" name="guests">${guestOptions(CLASS_MAX)}</select>
              <p class="field__hint" style="margin-top:6px; font-size:0.85em; opacity:0.7;">Classes are limited to ${CLASS_MAX} guests total.</p>
            </div>
            <div class="form-row">
              <div class="field"><label for="spc-name">Name</label><input type="text" id="spc-name" name="name" required></div>
              <div class="field"><label for="spc-phone">Phone</label><input type="tel" id="spc-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="spc-email">Email</label><input type="email" id="spc-email" name="email" required></div>
            <div class="field">
              <label for="spc-notes">Dietary needs or notes <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="spc-notes" name="notes" placeholder="Allergies, dietary restrictions, celebrating something special…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Proceed to Payment</button>
            <p class="cal__pay-note">You'll be taken to our secure Square checkout to pay $95 per guest.</p>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! Your class request is in — a secure Square checkout has opened in a new tab to confirm your spot ($95 per guest). If it didn't open, we'll follow up by phone or email.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218 or email info@dacecotfood.com.</div>
          </form>
        </div>
      </div>
    </section>

    <section id="drop-in" class="section section--olive" aria-labelledby="drop-how-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <span class="label">Also on Thursdays</span>
          <h2 id="drop-how-h">Pasta With Erika — Thursday Drop-In</h2>
          <p>A relaxed, hands-on pasta lab with Erika. Drop in any Thursday between 5–8 PM and make, cook, and eat your own traditional Italian pasta at your own pace — no experience needed, no booking fee. Pick a Thursday so we can have a station ready, or call <a href="tel:+18258884218">(825) 888-4218</a>.</p>
        </div>
        <div class="booking" style="margin-top:32px;">
          <form data-formsubmit data-subject="Pasta Drop-In Reservation — da Cecot" aria-label="Thursday pasta drop-in reservation request">
            <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
            <fieldset class="date-picker">
              <legend class="date-picker__legend">Choose your Thursday</legend>
              <div class="date-picker__grid">
                ${datePills('drop_in_date', DROP_IN_DATES, true)}
              </div>
            </fieldset>
            <div class="field" style="margin-top:22px;">
              <label for="drop-guests">Number of guests</label>
              <select id="drop-guests" name="guests">${guestOptions(8)}</select>
            </div>
            <div class="form-row">
              <div class="field"><label for="drop-name">Name</label><input type="text" id="drop-name" name="name" required></div>
              <div class="field"><label for="drop-phone">Phone</label><input type="tel" id="drop-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="drop-email">Email</label><input type="email" id="drop-email" name="email" required></div>
            <div class="field">
              <label for="drop-notes">Notes <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="drop-notes" name="notes" placeholder="Roughly what time you'll arrive, dietary needs, anything else…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Reserve My Spot</button>
            <p class="cal__pay-note">No payment needed — just drop in. Pay in person when you arrive.</p>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! We've saved your Thursday drop-in request — see you in the pasta lab. We'll reach out if anything changes.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218 or email info@dacecotfood.com.</div>
          </form>
        </div>
      </div>
    </section>

    <section class="section section--linen" aria-labelledby="spc-gallery-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:48px;">
          <span class="label" style="color:var(--terracotta);">From Past Classes</span>
          <h2 id="spc-gallery-h">See what you'll make.</h2>
          <p>Every class ends with a shared meal — pasta you shaped yourself, finished with our house sauces, eaten together at the table.</p>
        </div>
        <div class="gallery gallery--4 reveal">
          <figure class="zoom"><img src="images/general/erica/_MG_1163.jpg" alt="Hands rolling out fresh pasta dough at a da Cecot Sunday pasta class" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/_MG_1192.jpg" alt="Shaping fresh pasta by hand at a da Cecot pasta class, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/_MG_1138.jpg" alt="Fresh pasta dough being kneaded at a da Cecot class, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/_MG_1198.jpg" alt="Cutting fresh pasta strands at a da Cecot Sunday class, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/_MG_1131.jpg" alt="Guests at work during a hands-on pasta class at da Cecot" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/general/erica/_MG_1205.jpg" alt="Fresh pasta drying at a da Cecot pasta class, Edmonton" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/food/ravioli-butter-sage.jpg" alt="Ravioli with butter and sage — the dish students take home" loading="lazy" decoding="async"></figure>
          <figure class="zoom"><img src="images/food/fresh-ravioli.jpg" alt="Fresh hand-filled ravioli — a da Cecot pasta class finish" loading="lazy" decoding="async"></figure>
        </div>
        <p class="gallery-hint" aria-hidden="true">Swipe to see more →</p>
        <div class="btn-wrap text-center reveal" style="margin-top:36px;">
          <a href="#spc-book-h" class="btn btn--terra">Book a Class</a>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="spc-faq-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:40px;"><h2 id="spc-faq-h">Pasta class FAQ</h2></div>
${faqBlock(classFaqs)}
      </div>
    </section>`
}));



/* ============================================================
   4. PRIVATE EVENTS
   ============================================================ */
const peFaqs = [
  { q: 'How many guests can a private event host?', a: 'La Famiglia private events are designed for groups of 10 to 25 guests. Our dining room seats up to 26, so we can host everything from an intimate dinner to a full private gathering.' },
  { q: 'What is included in a private event?', a: 'Private events include a dedicated space, a custom multi-course Italian menu, wine, and music — typically running 2.5 to 3 hours. We tailor the menu and details to your occasion.' },
  { q: 'How much does a private event cost?', a: 'Pricing depends on your group size, menu, and inclusions — every La Famiglia evening is custom. Send us your details and we’ll come back with a tailored quote. A deposit confirms your booking once we agree on the menu.' },
  { q: 'How do I book a private event?', a: 'Start with an inquiry through our contact page or call (825) 888-4218. We will discuss your date, group size, and menu, then secure your evening with a deposit.' },
  { q: 'Can you accommodate dietary restrictions?', a: 'Yes. Share any allergies or dietary needs when planning your event and we will build the menu around your group.' }
];
pages.push(page({
  slug: 'private-events',
  active: 'private-events',
  title: 'Private Events & Group Dining | da Cecot, Edmonton',
  description: 'Host a private La Famiglia dinner at da Cecot in Edmonton. Custom multi-course Italian menu, wine & music for 10–25 guests. Inquire for a tailored quote.',
  ogImage: IMG.dining,
  schema: [
    breadcrumbSchema(trail('Private Events').map((t, i) => i === 2 ? { slug: 'private-events', label: t.label } : t)),
    serviceSchema({ slug: 'private-events', name: 'La Famiglia Private Events', desc: 'Private multi-course Italian dinners for groups of 10–25 in Edmonton, with wine and music.', image: IMG.dining, priceNote: 'Custom quote — contact for details' }),
    faqSchema(peFaqs)
  ],
  body: `${breadcrumb(trail('Private Events').map((t, i) => i === 2 ? { slug: 'private-events', label: t.label } : t))}

${expHero('pe-h1', 'Private Events', 'Gather your people at our family table for a private, multi-course Italian dinner — wine, music, and warmth included.', IMG.dining, true)}

    <section class="section section--cream" aria-labelledby="pe-what-h">
      <div class="container narrow reveal text-center">
        <h2 id="pe-what-h">What is a La Famiglia private event?</h2>
        <p class="lead">A La Famiglia private event is a private group dinner at da Cecot in Edmonton for 10 to 25 guests. You get a dedicated space and a custom multi-course Italian menu paired with wine and music — an unhurried, intimate evening hosted by our family, ideal for birthdays, celebrations, and team gatherings.</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="pe-incl-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:14px;"><h2 id="pe-incl-h">What's included</h2></div>
        <div class="info-grid reveal">
          <div><h3>Your own space</h3><p>A dedicated dining room for your group, seating up to 26.</p></div>
          <div><h3>Custom multi-course menu</h3><p>An Italian menu tailored to your occasion and tastes.</p></div>
          <div><h3>Wine &amp; music</h3><p>Beverages and ambiance to set the tone for the evening.</p></div>
          <div><h3>2.5–3 hours together</h3><p>A relaxed timeline so no one feels rushed.</p></div>
        </div>
        <div class="text-center" style="margin-top:30px;">
          <p style="opacity:0.85;">10–25 guests · Custom menu &amp; pricing tailored to your evening</p>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="pe-how-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <h2 id="pe-how-h">Book your private event</h2>
          <p>Tell us your date, group size, and what you're celebrating — we'll craft a menu to match and send a custom quote, then confirm your evening with a deposit once we agree.</p>
        </div>
        <div class="booking">
          <form data-formsubmit data-subject="Private Event Inquiry — da Cecot" aria-label="Private event booking inquiry">
            <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
            <div class="form-row">
              <div class="field">
                <label for="pe-occasion">Occasion</label>
                <select id="pe-occasion" name="occasion">
                  <option>Birthday</option><option>Anniversary</option><option>Corporate dinner</option>
                  <option>Graduation</option><option>Celebration</option><option>Other</option>
                </select>
              </div>
              <div class="field">
                <label for="pe-date">Event date</label>
                <input type="date" id="pe-date" name="event_date" required>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="pe-guests">Guest count</label>
                <select id="pe-guests" name="guest_count">
                  <option>10–15 guests</option><option>16–20 guests</option><option>21–25 guests</option>
                </select>
              </div>
              <div class="field">
                <label for="pe-time">Preferred start time <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
                <input type="time" id="pe-time" name="event_time">
              </div>
            </div>
            <div class="form-row">
              <div class="field"><label for="pe-name">Name</label><input type="text" id="pe-name" name="name" required></div>
              <div class="field"><label for="pe-phone">Phone</label><input type="tel" id="pe-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="pe-email">Email</label><input type="email" id="pe-email" name="email" required></div>
            <div class="field">
              <label for="pe-notes">Dietary needs &amp; notes <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="pe-notes" name="notes" placeholder="Allergies, dietary restrictions, menu preferences, or anything else that will help us plan your evening…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Send Your Inquiry</button>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! We've received your event inquiry and will be in touch within 24 hours.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218 or email info@dacecotfood.com.</div>
          </form>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="pe-faq-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:40px;"><h2 id="pe-faq-h">Private events FAQ</h2></div>
${faqBlock(peFaqs)}
      </div>
    </section>`
}));

/* ============================================================
   5. CATERING
   ============================================================ */
const catFaqs = [
  { q: 'What does da Cecot cater?', a: 'We cater fresh Italian comfort food across Edmonton — trays of pasta with our house sauces, baked lasagna, sides, and dessert. Menus suit offices, parties, celebrations, and gatherings, with heat-and-serve options to make hosting easy.' },
  { q: 'How much does catering cost?', a: 'Catering is budget-friendly and quoted per event based on your menu and headcount. Contact us for a custom quote tailored to your gathering.' },
  { q: 'How much notice do you need?', a: 'We recommend reaching out as early as possible — especially for larger orders and weekends — so we can confirm availability and prep your menu fresh. Get in touch and we will let you know what is possible for your date.' },
  { q: 'Do you deliver, and where?', a: 'We serve the Edmonton area, including Millwoods, Terwillegar, Chappelle, and Heritage Valley. Share your location when you inquire and we will confirm delivery details.' },
  { q: 'Can you handle vegetarian, vegan, or gluten-free needs?', a: 'Yes. We offer egg-based, vegan, and gluten-free pasta options and can build your catering menu around dietary needs. Just let us know when you request a quote.' }
];
pages.push(page({
  slug: 'catering',
  active: 'catering',
  title: 'Italian Catering in Edmonton | da Cecot Food',
  description: 'Budget-friendly Italian catering in Edmonton from da Cecot. Fresh pasta, lasagna trays & sauces for offices, parties & events. Heat-and-serve — get a quote.',
  ogImage: IMG.lasagna,
  schema: [
    breadcrumbSchema([{ slug: 'index', label: 'Home' }, { slug: 'menu', label: 'Menu' }, { slug: 'catering', label: 'Catering' }]),
    serviceSchema({ slug: 'catering', name: 'Italian Catering', desc: 'Budget-friendly Italian catering in Edmonton: fresh pasta, lasagna trays, and sauces for events and offices.', image: IMG.lasagna, priceNote: 'Custom quote per event' }),
    faqSchema(catFaqs)
  ],
  body: `${breadcrumb([{ slug: 'index', label: 'Home' }, { slug: 'menu', label: 'Menu' }, { slug: 'catering', label: 'Catering' }])}

${expHero('cat-h1', 'Catering', 'Handcrafted Italian catering for events, offices, and celebrations across Edmonton.', 'images/food/caprese-canapes.jpg', true)}

    <section class="section section--cream" aria-labelledby="cat-intro-h">
      <div class="container narrow reveal text-center">
        <h2 id="cat-intro-h">Let's make your event special.</h2>
        <p class="lead">At da Cecot, we take pride in offering a menu that embraces inclusivity, catering to a wide range of dietary preferences and requirements.</p>
        <p>We are excited about the opportunity to create a unique and memorable team-building event for your company. Please let us know if you'd like to proceed with the proposal as is or discuss any adjustments to better meet your needs. We look forward to working together to make this event truly special!</p>
      </div>
    </section>

    <section class="section section--linen" aria-labelledby="cat-quote-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <h2 id="cat-quote-h">Contact us for pricing &amp; details</h2>
          <p>Tell us your date, headcount, and what you have in mind — we'll get back to you with pricing and a tailored proposal within 24 hours. Or reach us directly at <a href="tel:+18258884218">(825) 888-4218</a>.</p>
        </div>
        <div class="booking">
          <form data-formsubmit data-subject="Catering Quote Request — da Cecot" aria-label="Catering quote request">
            <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
            <div class="form-row">
              <div class="field">
                <label for="cat-guests">Guest count</label>
                <select id="cat-guests" name="guest_count">
                  <option>Under 15 guests</option>
                  <option>15–25 guests</option>
                  <option>26–40 guests</option>
                  <option>41–60 guests</option>
                  <option>60+ guests</option>
                </select>
              </div>
              <div class="field">
                <label for="cat-date">Event date</label>
                <input type="date" id="cat-date" name="event_date" required>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="cat-menu">Menu interest</label>
                <select id="cat-menu" name="menu_interest">
                  <option>Pasta trays only</option>
                  <option>Lasagna only</option>
                  <option>Pasta trays + lasagna</option>
                  <option>Full spread (pasta + lasagna + sides + dessert)</option>
                  <option>Not sure — please suggest</option>
                </select>
              </div>
              <div class="field">
                <label for="cat-occasion">Occasion <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
                <select id="cat-occasion" name="occasion">
                  <option value="">Select…</option>
                  <option>Office / Corporate</option><option>Birthday</option><option>Wedding</option>
                  <option>Anniversary</option><option>Holiday party</option><option>Graduation</option><option>Other</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="cat-time">Event time <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
                <input type="time" id="cat-time" name="event_time">
              </div>
              <div class="field">
                <label for="cat-service">Service style <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
                <select id="cat-service" name="service_style">
                  <option value="">Select…</option>
                  <option>Heat-and-serve delivery</option><option>Drop-off delivery</option>
                  <option>On-site serving</option><option>Pickup</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="cat-venue">Venue / delivery address <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <input type="text" id="cat-venue" name="venue_address" placeholder="Where should we deliver or serve?">
            </div>
            <div class="form-row">
              <div class="field"><label for="cat-name">Name</label><input type="text" id="cat-name" name="name" required></div>
              <div class="field"><label for="cat-phone">Phone</label><input type="tel" id="cat-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="cat-email">Email</label><input type="email" id="cat-email" name="email" required></div>
            <div class="field">
              <label for="cat-notes">Dietary needs &amp; other details <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="cat-notes" name="notes" placeholder="Allergies, dietary restrictions (vegan, gluten-free counts), or anything else that helps us quote accurately…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Request a Quote</button>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! We've received your catering request and will send a custom quote within 24 hours.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218 or email info@dacecotfood.com.</div>
          </form>
        </div>
      </div>
    </section>`
}));

/* ============================================================
   FINAL WRITE: pages, favicon, robots, sitemap, 404, min css
   ============================================================ */
const ALL_SLUGS = [
  'index', 'menu', 'experiences', 'sunday-pasta-classes',
  'private-events', 'catering', 'pasta-shop',
  'our-story', 'visit-us', 'reservations', 'partnerships'
];

// pages array order matches push order; write each
pages.forEach((html) => {
  const m = html.match(/<link rel="canonical" href="([^"]+)">/);
  let slug = 'index';
  if (m) {
    const u = m[1].replace(BASE, '').replace(/^\//, '').replace('.html', '').replace(/\/$/, '');
    slug = u === '' ? 'index' : u;
  }
  fs.writeFileSync(path.join(ROOT, slug + '.html'), html, 'utf8');
});

/* favicon — terracotta circle with serif "D" monogram */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#4a1e18"/>
  <circle cx="32" cy="32" r="22" fill="none" stroke="#c4a035" stroke-width="2.5"/>
  <text x="32" y="43" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#f9f7ef" text-anchor="middle" font-style="italic">D</text>
</svg>`;
fs.writeFileSync(path.join(ROOT, 'favicon.svg'), favicon, 'utf8');

/* robots.txt */
const robots = `User-agent: *
Allow: /

Sitemap: ${BASE}/sitemap.xml
`;
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf8');

/* sitemap.xml */
const today = '2026-05-30';
const priority = (s) => s === 'index' ? '1.0' : (['menu', 'experiences', 'pasta-shop', 'visit-us', 'reservations'].includes(s) ? '0.9' : '0.8');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ALL_SLUGS.map(s => `  <url>
    <loc>${BASE}/${s === 'index' ? '' : s + '.html'}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${s === 'index' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${priority(s)}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

/* 404 page */
const notFound = page({
  slug: '404',
  active: '',
  title: 'Page Not Found | da Cecot Food, Edmonton',
  description: "The page you're looking for isn't here. Head back to da Cecot Food's homepage to explore our Italian menu, experiences, and reservations in Edmonton.",
  ogImage: IMG.pasta,
  schema: [],
  body: `    <section class="section section--brown" style="min-height:60vh; display:flex; align-items:center;">
      <div class="container text-center narrow reveal">
        <span class="label">Error 404</span>
        <h1>This page wandered off.</h1>
        <p>The page you're looking for can't be found — but there's still plenty of pasta to discover. Let's get you back to the table.</p>
        <div class="btn-wrap"><a href="index.html" class="btn btn--terra">Back to Home</a></div>
        <p style="margin-top:30px;"><a href="menu.html" style="color:var(--gold); text-decoration:underline;">View the Menu</a> &nbsp;·&nbsp; <a href="experiences.html" style="color:var(--gold); text-decoration:underline;">Experiences</a> &nbsp;·&nbsp; <a href="visit-us.html" style="color:var(--gold); text-decoration:underline;">Visit Us</a></p>
      </div>
    </section>`
});
fs.writeFileSync(path.join(ROOT, '404.html'), notFound.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, follow">'), 'utf8');

/* minify CSS */
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}
const srcCss = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
fs.writeFileSync(path.join(ROOT, 'css', 'styles.min.css'), minifyCss(srcCss), 'utf8');

console.log('Built ' + pages.length + ' pages + 404, sitemap, robots, favicon, minified CSS.');
console.log('Slugs: ' + ALL_SLUGS.join(', '));
