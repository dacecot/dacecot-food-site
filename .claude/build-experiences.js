/* ============================================================
   da Cecot Food — Experiences sub-pages + final site writer
   Required by build.js (run: node .claude/build.js)
   ============================================================ */
const B = require('./build.js');
const { pages, page, breadcrumb, breadcrumbSchema, faqBlock, faqSchema, cta, img, IMG, BASE, EXPERIENCE_PAGES, ROOT, fs, path } = B;

const NAP = {
  name: 'da Cecot Food Inc', phone: '(825) 888-4218',
  street: '82 Avenue (Whyte Avenue) & 104 Street', city: 'Edmonton', region: 'AB', country: 'CA'
};
const POSTAL_ADDRESS = {
  '@type': 'PostalAddress', streetAddress: NAP.street, addressLocality: NAP.city,
  addressRegion: NAP.region, addressCountry: NAP.country
};

function eventSchema({ slug, name, desc, image, byDay, startTime, price }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: name,
    description: desc,
    image: image,
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
    image: image,
    provider: { '@type': 'Restaurant', name: NAP.name, url: BASE, address: POSTAL_ADDRESS, telephone: NAP.phone },
    areaServed: { '@type': 'City', name: 'Edmonton' },
    url: `${BASE}/${slug}.html`,
    offers: { '@type': 'Offer', priceCurrency: 'CAD', description: priceNote, url: `${BASE}/${slug}.html` }
  };
}
const trail = (label) => [{ slug: 'index', label: 'Home' }, { slug: 'experiences', label: 'Experiences' }, { slug: '', label: label }];

/* small helper: standard experience page sections */
function expHero(id, h1, sub, image, dark) {
  return `    <section class="hero hero--page${dark ? ' hero--dark' : ''}" style="background-image:url('${image}');" aria-labelledby="${id}">
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
  { q: 'What experiences does da Cecot offer?', a: 'da Cecot offers five Italian food experiences in Edmonton: Sunday Pasta Classes, a weekly Public Pasta Drop-In, Food & Drink Special Experiences, Private Events (La Famiglia), and Catering. Each is built around fresh handmade pasta and the warmth of an Italian family table.' },
  { q: 'How do I book a da Cecot experience?', a: 'Most experiences can be booked through our reservations page or by contacting us at (825) 888-4218 or info@dacecotfood.com. Private events and catering start with an inquiry so we can tailor the details to your group.' },
  { q: 'Where are da Cecot experiences held?', a: 'All experiences take place at our kitchen and dining room on Whyte Avenue (82 Ave) at 104 Street in Edmonton, AB — except catering, which we bring to your location across the Edmonton area.' }
];
const hubCards = [
  { slug: 'sunday-pasta-classes', t: 'Sunday Pasta Classes', img: IMG.pastawine, d: 'Learn to make fresh pasta by hand in a relaxed Sunday class — then sit down and enjoy what you made.' },
  { slug: 'pasta-drop-in', t: 'Public Pasta Drop-In', img: IMG.greenpasta, d: 'Our casual Thursday community pasta night. No reservation needed — just pull up a chair.' },
  { slug: 'food-drink-experiences', t: 'Food & Drink Experiences', img: IMG.wine, d: 'Curated tasting evenings and wine-paired Italian menus for a special night out.' },
  { slug: 'private-events', t: 'Private Events', img: IMG.dining, d: 'Host your group at our family table with a private, multi-course La Famiglia dinner.' },
  { slug: 'catering', t: 'Catering', img: IMG.lasagna, d: 'Bring da Cecot to your event with budget-friendly, heat-and-serve Italian catering.' }
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
        <h1 id="xp-h1">Pasta Classes &amp; Experiences</h1>
        <p>From hands-on pasta classes to private dinners at our family table — here's how to share a little Italian magic with us in Edmonton.</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="xp-intro-h">
      <div class="container text-center narrow reveal" style="margin-bottom:54px;">
        <h2 id="xp-intro-h">Five ways to gather around the table</h2>
        <p>da Cecot is more than a pasta bar. We host classes, community nights, tastings, private dinners, and catering — each one an invitation to slow down, eat well, and feel like family. Choose the experience that fits your occasion.</p>
      </div>
      <div class="container">
        <div class="card-grid reveal">
${hubCards.map(c => `          <article class="xp-card">
            ${img(c.img, c.t + ' at da Cecot Food, Edmonton')}
            <div class="xp-card__body">
              <h3>${c.t}</h3>
              <p>${c.d}</p>
              <a class="xp-card__link" href="${c.slug}.html">Learn more</a>
            </div>
          </article>`).join('\n')}
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="weekend-h">
      <div class="container">
        <div class="two-col reveal">
          ${img(IMG.dining, 'A dinner table set with pasta and wine for the At Our Family Table experience', 'circle-img')}
          <div>
            <span class="label">Weekend Special</span>
            <h2 id="weekend-h">At Our Family Table</h2>
            <p>Join us for a relaxed, intimate evening of fixed-menu dining — the kind of unhurried meal that feels like Sunday dinner at nonna's. Good food, good wine, and good company, all at our family table.</p>
            <p class="price-tag">Starting from CA$15.00 / guest</p>
            <ul class="detail-list">
              <li><strong>Duration:</strong> 2 hrs 30 min</li>
              <li><strong>Availability:</strong> Weekends · multiple dates</li>
            </ul>
            ${cta('reservations.html', 'Reserve Now', 'terra')}
          </div>
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
  { q: 'How long is a class and how many people can attend?', a: 'Classes run about 2.5 to 3 hours and are capped at 15 guests so everyone gets personal attention. They run on select Sundays — contact us for the next available dates.' },
  { q: 'Can I come on my own or book for a couple?', a: 'Both work beautifully. Pricing starts from $95 per person, with a couples option from $185. Solo guests are always welcome and often leave with new friends.' },
  { q: 'Can I buy a pasta class as a gift?', a: 'Yes — a pasta class makes a memorable gift. Reach out at (825) 888-4218 or info@dacecotfood.com and we will help you arrange it.' }
];
pages.push(page({
  slug: 'sunday-pasta-classes',
  active: 'sunday-pasta-classes',
  title: 'Sunday Pasta Classes in Edmonton | da Cecot Food',
  description: 'Learn to make fresh pasta by hand at da Cecot in Edmonton. Beginner-friendly Sunday classes, small groups, all included. Starting from $95 — book your spot.',
  ogImage: IMG.pastawine,
  schema: [
    breadcrumbSchema(trail('Sunday Pasta Classes').map((t, i) => i === 2 ? { slug: 'sunday-pasta-classes', label: t.label } : t)),
    eventSchema({ slug: 'sunday-pasta-classes', name: 'Sunday Pasta Class', desc: 'Hands-on Italian pasta-making class in Edmonton, from dough to plate, ending with a shared meal.', image: IMG.pastawine, byDay: 'https://schema.org/Sunday', startTime: '12:00', price: '95' }),
    faqSchema(classFaqs)
  ],
  body: `${breadcrumb(trail('Sunday Pasta Classes').map((t, i) => i === 2 ? { slug: 'sunday-pasta-classes', label: t.label } : t))}

${expHero('spc-h1', 'Sunday Pasta Classes', 'Roll up your sleeves and learn to make fresh pasta by hand — then sit down and savour what you created.', IMG.pastawine, true)}

    <section class="section section--cream" aria-labelledby="spc-what-h">
      <div class="container narrow reveal text-center">
        <h2 id="spc-what-h">What is a da Cecot pasta class?</h2>
        <p class="lead">A Sunday pasta class at da Cecot is a hands-on, beginner-friendly workshop in Edmonton where you make fresh Italian pasta from scratch — mixing the dough, shaping it by hand, and finishing it with one of our signature sauces. You'll spend about 2.5–3 hours with our family, then sit down to eat everything you've made.</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="spc-incl-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:14px;"><h2 id="spc-incl-h">What's included</h2></div>
        <div class="info-grid reveal">
          <div><h3>Hands-on instruction</h3><p>Step-by-step guidance from our family — no experience needed.</p></div>
          <div><h3>All ingredients &amp; tools</h3><p>Flour, eggs, equipment, and an apron are all provided.</p></div>
          <div><h3>A shared meal</h3><p>Sit down and enjoy the pasta you made, together at the table.</p></div>
          <div><h3>Recipes to take home</h3><p>Leave with the techniques and recipes to recreate it all.</p></div>
        </div>
        <div class="text-center" style="margin-top:30px;">
          <p class="price-tag">Starting from $95 per person · $185 per couple</p>
          <p style="opacity:0.85;">About 2.5–3 hours · Maximum 15 guests · Select Sundays</p>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="spc-book-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <h2 id="spc-book-h">Reserve your class spot</h2>
          <p>Classes fill quickly — spots are limited to 15 guests. Pick a Sunday below and we'll confirm your seat, or call us at <a href="tel:+18258884218">(825) 888-4218</a>.</p>
        </div>
        <div class="booking">
          <form data-formsubmit data-subject="Pasta Class Booking — da Cecot" aria-label="Sunday Pasta Class booking request">
            <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
            <div class="form-row">
              <div class="field">
                <label for="spc-type">Booking type</label>
                <select id="spc-type" name="booking_type">
                  <option>Solo — $95/person</option>
                  <option>Couple — $185</option>
                  <option>Group (3+)</option>
                </select>
              </div>
              <div class="field">
                <label for="spc-guests">Number of guests</label>
                <select id="spc-guests" name="guests">
                  <option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6+</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="spc-date">Choose a Sunday</label>
              <input type="date" id="spc-date" name="preferred_date" required>
              <small style="display:block;margin-top:6px;opacity:0.65;font-size:0.82em;">Sundays only — select any upcoming Sunday</small>
            </div>
            <div class="field">
              <label for="spc-time">Afternoon time slot</label>
              <select id="spc-time" name="start_time" required>
                <option value="">Select a start time</option>
                <option>4:00 PM</option>
                <option>4:30 PM</option>
                <option>5:00 PM</option>
                <option>5:30 PM</option>
              </select>
              <small style="display:block;margin-top:6px;opacity:0.65;font-size:0.82em;">Classes run approx. 2.5–3 hrs · Last start 5:30 PM · Done by 8 PM</small>
            </div>
            <div class="form-row">
              <div class="field"><label for="spc-name">Name</label><input type="text" id="spc-name" name="name" required></div>
              <div class="field"><label for="spc-phone">Phone</label><input type="tel" id="spc-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="spc-email">Email</label><input type="email" id="spc-email" name="email" required></div>
            <div class="field">
              <label for="spc-notes">Dietary needs or notes <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="spc-notes" name="notes" placeholder="Allergies, dietary restrictions, or anything else we should know…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Request a Class Spot</button>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! We've received your class request and will confirm your spot within 24 hours.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218 or email info@dacecotfood.com.</div>
          </form>
        </div>
      </div>
    </section>
    <script>
    (function () {
      var input = document.getElementById('spc-date');
      if (!input) return;
      var today = new Date();
      input.min = today.toISOString().split('T')[0];
      input.addEventListener('change', function () {
        if (!this.value) return;
        var d = new Date(this.value + 'T00:00:00');
        if (d.getDay() !== 0) {
          this.setCustomValidity('Please choose a Sunday.');
          this.reportValidity();
          this.value = '';
        } else {
          this.setCustomValidity('');
        }
      });
    })();
    </script>

    <section class="section section--brown" aria-labelledby="spc-faq-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:40px;"><h2 id="spc-faq-h">Pasta class FAQ</h2></div>
${faqBlock(classFaqs)}
      </div>
    </section>`
}));

/* ============================================================
   2. PUBLIC PASTA DROP-IN
   ============================================================ */
const dropFaqs = [
  { q: 'Do I need a reservation for the pasta drop-in?', a: 'No reservation is required. The Public Pasta Drop-In is a casual, walk-in night — just show up on Thursday between 4 PM and 8 PM and grab a seat. For larger groups, a quick call ahead helps us be ready for you.' },
  { q: 'When is the pasta drop-in?', a: 'Our Public Pasta Drop-In runs every Thursday from 4 PM to 8 PM on Whyte Avenue (82 Ave) at 104 Street in Edmonton. It is our weekly community pasta night.' },
  { q: 'What can I order at the drop-in?', a: 'Choose from our pasta bar — a rotating selection of fresh pasta shapes and house sauces, including our signature Caserecce — plus tiramisu and drinks. Everything is available to dine in or take to go.' },
  { q: 'Is the drop-in family-friendly?', a: 'Absolutely. The drop-in is relaxed and welcoming for all ages, families, and solo diners alike — exactly the kind of easy weeknight meal we love to share.' }
];
pages.push(page({
  slug: 'pasta-drop-in',
  active: 'pasta-drop-in',
  title: 'Public Pasta Drop-In (Thursdays) | da Cecot, Edmonton',
  description: 'da Cecot’s casual Thursday pasta night in Edmonton. Walk in 4–8 PM, no reservation needed — fresh pasta, house sauces & good company. Dine in or take out.',
  ogImage: IMG.greenpasta,
  schema: [
    breadcrumbSchema(trail('Public Pasta Drop-In').map((t, i) => i === 2 ? { slug: 'pasta-drop-in', label: t.label } : t)),
    eventSchema({ slug: 'pasta-drop-in', name: 'Public Pasta Drop-In', desc: 'Casual weekly walk-in pasta night at da Cecot in Edmonton, every Thursday evening.', image: IMG.greenpasta, byDay: 'https://schema.org/Thursday', startTime: '16:00', price: '0' }),
    faqSchema(dropFaqs)
  ],
  body: `${breadcrumb(trail('Public Pasta Drop-In').map((t, i) => i === 2 ? { slug: 'pasta-drop-in', label: t.label } : t))}

${expHero('drop-h1', 'Public Pasta Drop-In', 'Our casual Thursday community pasta night in Edmonton. No reservation, no fuss — just pull up a chair.', IMG.greenpasta, true)}

    <section class="section section--cream" aria-labelledby="drop-what-h">
      <div class="container narrow reveal text-center">
        <h2 id="drop-what-h">What is the Public Pasta Drop-In?</h2>
        <p class="lead">The Public Pasta Drop-In is da Cecot's weekly walk-in pasta night, held every Thursday from 4 PM to 8 PM in Edmonton. There's nothing to book — simply drop by, choose your pasta and sauce from the bar, and enjoy fresh Italian comfort food in a relaxed, neighbourly setting.</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="drop-expect-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:14px;"><h2 id="drop-expect-h">What to expect</h2></div>
        <div class="info-grid reveal">
          <div><h3>Walk-in welcome</h3><p>No reservation needed — seating is first come, first served.</p></div>
          <div><h3>Build your bowl</h3><p>Pick a fresh pasta shape and a house sauce, including our signature Caserecce.</p></div>
          <div><h3>Dine in or take out</h3><p>Stay and relax, or grab it &amp; go on your way home.</p></div>
          <div><h3>Community vibe</h3><p>A friendly weeknight table for families, friends, and solo diners.</p></div>
        </div>
        <div class="text-center" style="margin-top:30px;">
          <p class="price-tag">À la carte · Contact for current pricing</p>
          <p style="opacity:0.85;">Every Thursday · 4 PM – 8 PM · Whyte Ave &amp; 104 Street, Edmonton</p>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="drop-how-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <h2 id="drop-how-h">How to join</h2>
          <p>No reservation needed — just walk in on Thursday between 4 PM and 8 PM. Bringing a group of 5 or more? Let us know below so we can have seats ready for you.</p>
        </div>
        <div class="booking">
          <form data-formsubmit data-subject="Drop-In Group Notification — da Cecot" aria-label="Drop-in group notification">
            <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
            <div class="form-row">
              <div class="field">
                <label for="drop-size">Group size</label>
                <select id="drop-size" name="group_size">
                  <option>5–8 guests</option><option>9–12 guests</option><option>13–16 guests</option><option>17+ guests</option>
                </select>
              </div>
              <div class="field">
                <label for="drop-date">Thursday date</label>
                <input type="date" id="drop-date" name="visit_date" required>
              </div>
            </div>
            <div class="form-row">
              <div class="field"><label for="drop-name">Name</label><input type="text" id="drop-name" name="name" required></div>
              <div class="field"><label for="drop-phone">Phone</label><input type="tel" id="drop-phone" name="phone" required></div>
            </div>
            <div class="field">
              <label for="drop-notes">Any notes? <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="drop-notes" name="notes" placeholder="Dietary needs, arrival time, or anything else…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Let Us Know You're Coming</button>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Perfect! We'll have space ready for your group — see you Thursday.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218.</div>
          </form>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="drop-faq-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:40px;"><h2 id="drop-faq-h">Drop-in FAQ</h2></div>
${faqBlock(dropFaqs)}
      </div>
    </section>`
}));

/* ============================================================
   3. FOOD & DRINK SPECIAL EXPERIENCES
   ============================================================ */
const fdFaqs = [
  { q: 'What are Food & Drink Experiences?', a: 'Food & Drink Experiences are da Cecot’s special ticketed evenings in Edmonton — multi-course tasting menus, wine-paired Italian dinners, Cicchetti small-bite nights, and seasonal themed events. Each is a hosted, curated occasion beyond our everyday pasta bar.' },
  { q: 'What is included?', a: 'Depending on the evening, your ticket includes a multi-course menu, curated wine or beverage pairings, and a hosted experience guided by our family. Each event page or inquiry will outline exactly what is served.' },
  { q: 'How much do these experiences cost?', a: 'Pricing varies by event and what is included. Contact us for current dates and pricing, and we will share the details for each upcoming experience.' },
  { q: 'Can you accommodate dietary needs?', a: 'Yes — let us know about allergies or dietary preferences when you book and we will do our best to tailor your tasting. Reach us at (825) 888-4218 or info@dacecotfood.com.' }
];
pages.push(page({
  slug: 'food-drink-experiences',
  active: 'food-drink-experiences',
  title: 'Food & Drink Experiences | Tastings & Wine, Edmonton',
  description: 'Curated Italian tasting evenings & wine-paired dinners at da Cecot in Edmonton. Multi-course menus, small bites & seasonal nights. Limited seating — inquire now.',
  ogImage: IMG.wine,
  schema: [
    breadcrumbSchema(trail('Food & Drink Experiences').map((t, i) => i === 2 ? { slug: 'food-drink-experiences', label: t.label } : t)),
    serviceSchema({ slug: 'food-drink-experiences', name: 'Food & Drink Special Experiences', desc: 'Curated multi-course tasting menus and wine-paired Italian dinners in Edmonton.', image: IMG.wine, priceNote: 'Varies by event — contact for pricing' }),
    faqSchema(fdFaqs)
  ],
  body: `${breadcrumb(trail('Food & Drink Experiences').map((t, i) => i === 2 ? { slug: 'food-drink-experiences', label: t.label } : t))}

${expHero('fd-h1', 'Food &amp; Drink Experiences', 'Curated tasting evenings and wine-paired Italian menus — a special night out, the da Cecot way.', IMG.wine, true)}

    <section class="section section--cream" aria-labelledby="fd-what-h">
      <div class="container narrow reveal text-center">
        <h2 id="fd-what-h">What are Food &amp; Drink Experiences?</h2>
        <p class="lead">Food &amp; Drink Experiences are da Cecot's special ticketed evenings in Edmonton — multi-course tasting menus, wine-paired dinners, Cicchetti small-bite nights, and seasonal themed events. Each is a hosted, intimate occasion that goes beyond our everyday pasta bar.</p>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="fd-incl-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:14px;"><h2 id="fd-incl-h">What to expect</h2></div>
        <div class="info-grid reveal">
          <div><h3>Multi-course menus</h3><p>Thoughtfully built tasting menus that tell a story, course by course.</p></div>
          <div><h3>Wine &amp; pairings</h3><p>Italian-inspired drink pairings chosen to match each plate.</p></div>
          <div><h3>Cicchetti small bites</h3><p>Italian small-plate nights perfect for grazing and sharing.</p></div>
          <div><h3>Hosted &amp; intimate</h3><p>Limited seats and a warm, personal evening with our family.</p></div>
        </div>
        <div class="text-center" style="margin-top:30px;">
          <p class="price-tag">Pricing varies by event · Contact for details</p>
          <p style="opacity:0.85;">Limited seating · Select dates throughout the year</p>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="fd-how-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <h2 id="fd-how-h">Reserve your seat</h2>
          <p>Seats are limited and these evenings book up fast. Fill in the form below and we'll reach out with upcoming dates, menus, and pricing.</p>
        </div>
        <div class="booking">
          <form data-formsubmit data-subject="Food &amp; Drink Experience Inquiry — da Cecot" aria-label="Food &amp; Drink experience reservation inquiry">
            <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
            <div class="form-row">
              <div class="field">
                <label for="fd-guests">Number of guests</label>
                <select id="fd-guests" name="guests">
                  <option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6+</option>
                </select>
              </div>
              <div class="field">
                <label for="fd-date">Preferred date <span style="font-weight:400;opacity:0.7;">(if known)</span></label>
                <input type="date" id="fd-date" name="preferred_date">
              </div>
            </div>
            <div class="form-row">
              <div class="field"><label for="fd-name">Name</label><input type="text" id="fd-name" name="name" required></div>
              <div class="field"><label for="fd-phone">Phone</label><input type="tel" id="fd-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="fd-email">Email</label><input type="email" id="fd-email" name="email" required></div>
            <div class="field">
              <label for="fd-dietary">Dietary needs <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="fd-dietary" name="dietary_notes" placeholder="Allergies, dietary restrictions, or anything else we should know…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Request a Seat</button>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! We'll be in touch soon with upcoming event details and pricing.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please email us at info@dacecotfood.com.</div>
          </form>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="fd-faq-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:40px;"><h2 id="fd-faq-h">Food &amp; Drink FAQ</h2></div>
${faqBlock(fdFaqs)}
      </div>
    </section>`
}));

/* ============================================================
   4. PRIVATE EVENTS
   ============================================================ */
const peFaqs = [
  { q: 'How many guests can a private event host?', a: 'La Famiglia private events are designed for groups of 10 to 25 guests. Our dining room seats up to 26, so we can host everything from an intimate dinner to a full private gathering.' },
  { q: 'What is included in a private event?', a: 'Private events include a dedicated space, a custom multi-course Italian menu, wine, and music — typically running 2.5 to 3 hours. We tailor the menu and details to your occasion.' },
  { q: 'How much does a private event cost?', a: 'Private dinners start from $95 per guest, depending on the menu and inclusions. A 50% deposit confirms your booking.' },
  { q: 'How do I book a private event?', a: 'Start with an inquiry through our contact page or call (825) 888-4218. We will discuss your date, group size, and menu, then secure your evening with a deposit.' },
  { q: 'Can you accommodate dietary restrictions?', a: 'Yes. Share any allergies or dietary needs when planning your event and we will build the menu around your group.' }
];
pages.push(page({
  slug: 'private-events',
  active: 'private-events',
  title: 'Private Events & Group Dining | da Cecot, Edmonton',
  description: 'Host a private La Famiglia dinner at da Cecot in Edmonton. Multi-course Italian menu, wine & music for 10–25 guests. Starting from $95/guest — inquire today.',
  ogImage: IMG.dining,
  schema: [
    breadcrumbSchema(trail('Private Events').map((t, i) => i === 2 ? { slug: 'private-events', label: t.label } : t)),
    serviceSchema({ slug: 'private-events', name: 'La Famiglia Private Events', desc: 'Private multi-course Italian dinners for groups of 10–25 in Edmonton, with wine and music.', image: IMG.dining, priceNote: 'Starting from $95 per guest' }),
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
          <p class="price-tag">Starting from $95 per guest</p>
          <p style="opacity:0.85;">10–25 guests · 50% deposit confirms your booking</p>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="pe-how-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <h2 id="pe-how-h">Book your private event</h2>
          <p>Tell us your date, group size, and what you're celebrating — we'll craft a menu to match and confirm your evening with a 50% deposit.</p>
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
            <div class="field">
              <label for="pe-guests">Guest count</label>
              <select id="pe-guests" name="guest_count">
                <option>10–15 guests</option><option>16–20 guests</option><option>21–25 guests</option>
              </select>
            </div>
            <div class="form-row">
              <div class="field"><label for="pe-name">Name</label><input type="text" id="pe-name" name="name" required></div>
              <div class="field"><label for="pe-phone">Phone</label><input type="tel" id="pe-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="pe-email">Email</label><input type="email" id="pe-email" name="email" required></div>
            <div class="field">
              <label for="pe-notes">Dietary needs &amp; notes <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="pe-notes" name="notes" placeholder="Allergies, menu preferences, or anything else that will help us plan your evening…"></textarea>
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

${expHero('cat-h1', 'Catering', 'Bring da Cecot to your table — budget-friendly, handcrafted Italian catering for events across Edmonton.', IMG.lasagna, true)}

    <section class="section section--cream" aria-labelledby="cat-what-h">
      <div class="container narrow reveal text-center">
        <h2 id="cat-what-h">What is da Cecot catering?</h2>
        <p class="lead">da Cecot catering brings our fresh Italian comfort food to your event anywhere in Edmonton. We prepare trays of handmade pasta, slow-cooked sauces, baked lasagna, sides, and dessert — designed to heat and serve — so you can host offices, parties, and celebrations without the stress.</p>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="cat-pasta-h">
      <div class="container">
        <div class="two-col menu-row reveal">
          <figure class="menu-photo zoom">${img(IMG.pasta, 'Fresh handmade pasta catering tray at da Cecot, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label" style="color:var(--terracotta);">Fresh Pasta Trays</span>
            <h2 id="cat-pasta-h">Pasta Trays</h2>
            <p>Our fresh pasta trays are the centrepiece of any da Cecot catering spread. Each tray feeds 8–10 guests and comes with your choice of pasta and sauce.</p>
            <p style="font-size:0.8em;letter-spacing:0.08em;text-transform:uppercase;opacity:0.6;margin-top:18px;margin-bottom:8px;font-weight:600;">Choose Your Pasta</p>
            <ul class="menu-list">
              <li>Caserecce <span>Our signature shape — best for takeout &amp; catering</span></li>
              <li>Rigatoni <span>Ridged tubes</span></li>
              <li>Tagliatelle <span>Egg ribbons</span></li>
            </ul>
            <p style="font-size:0.8em;letter-spacing:0.08em;text-transform:uppercase;opacity:0.6;margin-top:18px;margin-bottom:8px;font-weight:600;">Choose Your Sauce</p>
            <ul class="menu-list">
              <li>Ragù Bolognese <span>Slow-cooked meat sauce</span></li>
              <li>Plasé <span>Tomato sauce</span></li>
              <li>Cacio e Pepé <span>Pecorino &amp; black pepper</span></li>
              <li>Salsa al Baffo <span>Rosé sauce</span></li>
              <li>Butter &amp; Sage Sauce</li>
            </ul>
            <p style="margin-top:16px;opacity:0.8;font-size:0.9em;">Egg-based, vegan, and gluten-free pasta available on request.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="cat-lasagna-h">
      <div class="container">
        <div class="two-col menu-row menu-row--rev reveal">
          <figure class="menu-photo zoom">${img(IMG.lasagna, 'Freshly baked lasagna for catering at da Cecot, Edmonton')}</figure>
          <div class="menu-copy">
            <span class="label">Baked Dishes</span>
            <h2 id="cat-lasagna-h">Lasagna &amp; Baked Dishes</h2>
            <p>Our hand-layered lasagna is made fresh daily with slow-cooked ragù, silky béchamel, and Italian cheeses — ready to heat and serve at your venue.</p>
            <ul class="menu-list" style="margin-top:16px;">
              <li>Classic Lasagna <span>Ragù, béchamel &amp; Italian cheeses</span></li>
              <li>Vegetarian Lasagna <span>Seasonal vegetables &amp; béchamel — on request</span></li>
            </ul>
            <p style="margin-top:16px;opacity:0.8;font-size:0.9em;">Trays serve 8–12 guests. Heat-and-serve delivery available across Edmonton.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="cat-sides-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:40px;">
          <span class="label" style="color:var(--terracotta);">Complete Your Spread</span>
          <h2 id="cat-sides-h">Sides &amp; Dessert</h2>
        </div>
        <div class="three-col reveal" data-stagger>
          <article class="menu-card menu-card--light">
            <h3>Arugula Salad</h3>
            <p>Fresh arugula with lemon dressing and shaved Parmigiano — a light, bright start to your catering table.</p>
          </article>
          <article class="menu-card menu-card--light">
            <h3>Garlic Bread</h3>
            <p>Warm, buttery, and perfect alongside any of our pasta trays or lasagna.</p>
          </article>
          <article class="menu-card menu-card--light">
            <h3>Tiramisu</h3>
            <p>Our housemade tiramisu — espresso-soaked, light, and made fresh. Available in individual portions or as a full tray for sharing.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="cat-pkg-h">
      <div class="container">
        <div class="text-center narrow reveal" style="margin-bottom:40px;">
          <span class="label">Simple Pricing</span>
          <h2 id="cat-pkg-h">Catering Packages</h2>
          <p>Every order is quoted to your headcount and menu. Below are our most popular starting points.</p>
        </div>
        <div class="offer-grid offer-grid--2 reveal" data-stagger>
          <article class="offer-card">
            <div class="offer-card__body">
              <h3>Office Lunch</h3>
              <p>One pasta tray, one sauce, and garlic bread. Easy weekday catering for 8–15 guests.</p>
              <p class="price-tag" style="margin-top:12px;">From $120</p>
            </div>
          </article>
          <article class="offer-card">
            <div class="offer-card__body">
              <h3>Family Gathering</h3>
              <p>Two pasta trays, lasagna, salad, and tiramisu for dessert. A complete meal for 16–25 guests.</p>
              <p class="price-tag" style="margin-top:12px;">From $280</p>
            </div>
          </article>
          <article class="offer-card">
            <div class="offer-card__body">
              <h3>Celebration Package</h3>
              <p>Full spread — pasta trays, lasagna, sides, dessert, and a custom menu consultation for 25–40 guests.</p>
              <p class="price-tag" style="margin-top:12px;">From $480</p>
            </div>
          </article>
          <article class="offer-card">
            <div class="offer-card__body">
              <h3>Custom Quote</h3>
              <p>Larger headcount, multiple menu options, or special dietary needs? We'll build a package to fit your event exactly.</p>
              <p class="price-tag" style="margin-top:12px;">Contact us</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="section section--cream" aria-labelledby="cat-quote-h">
      <div class="container narrow reveal">
        <div class="text-center">
          <h2 id="cat-quote-h">Request a catering quote</h2>
          <p>Tell us your date, headcount, and the kind of menu you have in mind — we'll get back to you with a custom quote within 24 hours. Or reach us directly at <a href="tel:+18258884218">(825) 888-4218</a>.</p>
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
            <div class="form-row">
              <div class="field"><label for="cat-name">Name</label><input type="text" id="cat-name" name="name" required></div>
              <div class="field"><label for="cat-phone">Phone</label><input type="tel" id="cat-phone" name="phone" required></div>
            </div>
            <div class="field"><label for="cat-email">Email</label><input type="email" id="cat-email" name="email" required></div>
            <div class="field">
              <label for="cat-notes">Event details &amp; dietary needs <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
              <textarea id="cat-notes" name="notes" placeholder="Occasion, location, dietary restrictions, delivery address, or anything else that helps us quote accurately…"></textarea>
            </div>
            <button type="submit" class="btn btn--green" style="width:100%;">Request a Quote</button>
            <div class="form-success" style="background:rgba(48,99,30,0.12); color:var(--brown); border-color:var(--deep-green);">Grazie! We've received your catering request and will send a custom quote within 24 hours.</div>
            <div class="form-error" style="color:var(--brown);">Something went wrong — please call us at (825) 888-4218 or email info@dacecotfood.com.</div>
          </form>
        </div>
      </div>
    </section>

    <section class="section section--brown" aria-labelledby="cat-faq-h">
      <div class="container">
        <div class="text-center reveal" style="margin-bottom:40px;"><h2 id="cat-faq-h">Catering FAQ</h2></div>
${faqBlock(catFaqs)}
      </div>
    </section>`
}));

/* ============================================================
   FINAL WRITE: pages, favicon, robots, sitemap, 404, min css
   ============================================================ */
const ALL_SLUGS = [
  'index', 'menu', 'experiences', 'sunday-pasta-classes', 'pasta-drop-in',
  'food-drink-experiences', 'private-events', 'catering', 'pasta-shop',
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
