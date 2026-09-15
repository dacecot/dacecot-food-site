/* ============================================================
   da Cecot CMS — content schema (single source of truth)
   Both the site generator (.claude/build*.js) and the admin UI read this.
   Each field has a stable `key`, a friendly `label`, a `type`, and a `default`
   (the current live value). The generator falls back to `default` whenever a
   value is missing from content.json, so an empty/absent store renders exactly
   like today.
   ============================================================ */

/* Class dates are no longer hand-kept. Sunday classes run weekly and the
   booking form generates the next few automatically (lib/classes/schedule.js),
   so past dates can never linger. Erika controls how many show and which
   Sundays to skip. Kept exported for any caller still importing the old name. */
const CLASS_DATES_DEFAULT = [];

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
      { key: 'region', label: 'Province', type: 'text', default: 'AB', maxlength: 40 }
    ]
  },
  // NOTE: the homepage hero copy stays generator-managed (group removed from the
  // CMS on Haruun's call 2026-09-01) — heroHeading/heroTag defaults below keep
  // rendering via content.js defaults.
  {
    id: 'announcement',
    title: 'Announcement Banner',
    icon: '📣',
    intro: 'Show a message bar at the very top of every page — holiday hours, a closure, a special. Turn it off to hide it.',
    fields: [
      { key: 'announcementEnabled', label: 'Show the banner', type: 'toggle', default: false },
      { key: 'announcementText', label: 'Banner message', type: 'text', default: '', maxlength: 200, help: 'Keep it short — one line.' },
      { key: 'announcementUrl', label: 'Banner link (optional)', type: 'url', default: '', maxlength: 400, help: 'If set, tapping the banner opens this link (e.g. your Uber Eats page).' }
    ]
  },
  {
    id: 'hours',
    title: 'Hours of Operation',
    icon: '🕐',
    intro: 'Your opening hours — shown on the site, sent to Google, and used for pickup and reservation times. Use 24-hour times like "12:00-15:00, 16:30-20:00" (comma between lunch and dinner), or type "closed".',
    fields: [
      { key: 'hoursMon', label: 'Monday', type: 'hours', default: '16:30-20:00' },
      { key: 'hoursTue', label: 'Tuesday', type: 'hours', default: '12:00-15:00, 16:30-20:00' },
      { key: 'hoursWed', label: 'Wednesday', type: 'hours', default: 'closed' },
      { key: 'hoursThu', label: 'Thursday', type: 'hours', default: '12:00-15:00, 16:30-20:00' },
      { key: 'hoursFri', label: 'Friday', type: 'hours', default: '12:00-15:00, 16:00-21:00' },
      { key: 'hoursSat', label: 'Saturday', type: 'hours', default: '12:00-21:00' },
      { key: 'hoursSun', label: 'Sunday', type: 'hours', default: '12:00-16:00' },
      { key: 'firstSundayClosed', label: 'Closed the first Sunday of each month', type: 'toggle', default: true, help: 'Also blocks that day for pickups and reservations.' }
    ]
  },
  {
    id: 'classes',
    title: 'Pasta Classes',
    icon: '🍝',
    intro: 'Classes run every Sunday. The booking form fills in the upcoming dates for you — past Sundays disappear on their own, so there is no list to keep tidy. (We are closed the first Sunday of each month, and those are skipped automatically.)',
    fields: [
      { key: 'classMax', label: 'Max guests per class', type: 'number', default: 12, min: 1, max: 40, required: true },
      { key: 'classMin', label: 'Minimum guests to run a class', type: 'number', default: 4, min: 1, max: 40, required: true, help: 'Classes below this show as "under minimum" in Orders & Bookings, where you can move those guests to their 2nd-choice date.' },
      { key: 'classWeeksShown', label: 'How many Sundays to show', type: 'number', default: 9, min: 1, max: 12, required: true, help: 'How far ahead guests can book. The list rolls forward on its own — at 9 it always runs about two and a half months ahead. Lower it to 4–5 if you would rather keep the form short and fill the near dates first.' },
      { key: 'classBlackoutDates', label: 'Sundays to skip', type: 'list', itemLabel: 'date', default: [], maxItems: 24, help: 'Holidays or closures — one per line, e.g. "Sunday, December 27, 2026". Everything else runs automatically; you do not need to list the dates you ARE open.' }
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

// Generator-only keys (no CMS editor, but the templates still read them).
defaults.heroHeading = 'Fresh Handmade Pasta on Whyte Ave';
defaults.heroTag = 'Handmade pasta, Italian hospitality, and a table where everyone belongs. Crafted daily on Whyte Avenue by the Cecot family — inspired by the traditions of sharing food, stories, and meaningful moments around the table.';

module.exports = { groups, fieldsByKey, defaults, CLASS_DATES_DEFAULT };
