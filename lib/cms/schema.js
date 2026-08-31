/* ============================================================
   da Cecot CMS — content schema (single source of truth)
   Both the site generator (.claude/build*.js) and the admin UI read this.
   Each field has a stable `key`, a friendly `label`, a `type`, and a `default`
   (the current live value). The generator falls back to `default` whenever a
   value is missing from content.json, so an empty/absent store renders exactly
   like today.
   ============================================================ */

const CLASS_DATES_DEFAULT = [
  'Sunday, September 20, 2026',
  'Sunday, September 27, 2026',
  'Sunday, October 11, 2026',
  'Sunday, October 18, 2026',
  'Sunday, October 25, 2026',
  'Sunday, November 8, 2026',
  'Sunday, November 15, 2026',
  'Sunday, November 22, 2026',
  'Sunday, November 29, 2026'
];

const groups = [
  {
    id: 'contact',
    title: 'Business & Contact',
    icon: '🏠',
    intro: 'Your business name, phone, email, address and reservation link — shown across the site and to Google.',
    fields: [
      { key: 'businessName', label: 'Business name', type: 'text', default: 'da Cecot Food Inc', maxlength: 120, required: true },
      { key: 'phone', label: 'Phone number', type: 'tel', default: '(825) 888-4218', maxlength: 40, required: true, help: 'Shown as a tap-to-call link.' },
      { key: 'email', label: 'Email address', type: 'email', default: 'info@dacecotfood.com', maxlength: 160, required: true },
      { key: 'streetDisplay', label: 'Street / location', type: 'text', default: 'Whyte Ave (82 Ave) & 104 Street', maxlength: 200 },
      { key: 'city', label: 'City', type: 'text', default: 'Edmonton', maxlength: 80 },
      { key: 'region', label: 'Province', type: 'text', default: 'AB', maxlength: 40 },
      { key: 'reservationUrl', label: 'Reservation booking link', type: 'url', default: 'https://dacecotfood.wixsite.com/my-site', maxlength: 400, help: 'Where the "Book a Table" button sends guests. Leave blank to show a "booking coming soon" message.' }
    ]
  },
  {
    id: 'home',
    title: 'Homepage',
    icon: '⭐',
    intro: 'The big heading and subtext on the homepage hero.',
    fields: [
      { key: 'heroHeading', label: 'Hero heading', type: 'text', default: 'Fresh Handmade Pasta on Whyte Ave', maxlength: 140, required: true },
      { key: 'heroTag', label: 'Hero subtext', type: 'textarea', default: 'Handmade pasta, Italian hospitality, and a table where everyone belongs. Crafted daily on Whyte Avenue by the Cecot family — inspired by the traditions of sharing food, stories, and meaningful moments around the table.', maxlength: 600 }
    ]
  },
  {
    id: 'announcement',
    title: 'Announcement Banner',
    icon: '📣',
    intro: 'Show a message bar at the very top of every page — holiday hours, a closure, a special. Turn it off to hide it.',
    fields: [
      { key: 'announcementEnabled', label: 'Show the banner', type: 'toggle', default: false },
      { key: 'announcementText', label: 'Banner message', type: 'text', default: '', maxlength: 200, help: 'Keep it short — one line.' }
    ]
  },
  {
    id: 'classes',
    title: 'Pasta Classes',
    icon: '🍝',
    intro: 'The Sunday class dates and the guest cap shown on the booking form. (We are closed the first Sunday of each month.)',
    fields: [
      { key: 'classMax', label: 'Max guests per class', type: 'number', default: 12, min: 1, max: 40, required: true },
      { key: 'classDates', label: 'Upcoming Sunday class dates', type: 'list', itemLabel: 'date', default: CLASS_DATES_DEFAULT, maxItems: 24, help: 'One per line, e.g. "Sunday, September 20, 2026". Remove past dates; add new ones as you schedule them.' }
    ]
  },
  {
    id: 'photos',
    title: 'Photos',
    icon: '🖼️',
    intro: 'Swap key photos. Upload a JPG, PNG or WebP (max 5 MB). The site keeps the old one until you save.',
    fields: [
      { key: 'heroImage', label: 'Homepage hero photo', type: 'image', default: 'images/food/homepage-hero.jpg' },
      { key: 'aboutImage', label: 'Family / about photo', type: 'image', default: 'images/general/cecot-family.jpg' }
    ]
  }
];

// Flat map: key -> field (with its group id), for fast lookup + validation.
const fieldsByKey = {};
groups.forEach((g) => g.fields.forEach((f) => { fieldsByKey[f.key] = Object.assign({ group: g.id }, f); }));

// Defaults object: key -> default value.
const defaults = {};
groups.forEach((g) => g.fields.forEach((f) => { defaults[f.key] = f.default; }));

module.exports = { groups, fieldsByKey, defaults, CLASS_DATES_DEFAULT };
