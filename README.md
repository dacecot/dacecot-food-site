# da Cecot Food Inc — Website

A custom static rebuild of [dacecotfood.com](https://www.dacecotfood.com/) — an authentic Italian
comfort food pasta bar and street food kitchen in Edmonton, AB. Production-ready: full SEO/AIO,
structured data, responsive, accessible.

## Stack

Clean static site — plain HTML, CSS, and vanilla JS. No runtime framework. Pages are generated
from shared templates by a small Node build script so SEO scaffolding, nav, and footer stay
consistent across all 13 pages. **The output is plain static HTML** (ideal for SEO/crawlers).

## Pages (13)

| File | Page |
|------|------|
| `index.html` | Home |
| `menu.html` | Menu (Pasta Bar, Drinks & Dessert, Philosophy, FAQ) |
| `about.html` | About / family story |
| `experiences.html` | Experiences hub (links the 5 sub-pages) |
| `sunday-pasta-classes.html` | Sunday Pasta Classes |
| `pasta-drop-in.html` | Public Pasta Drop-In (Thursdays) |
| `food-drink-experiences.html` | Food & Drink Special Experiences |
| `private-events.html` | Private Events (La Famiglia) |
| `catering.html` | Catering |
| `events.html` | Events overview |
| `reservations.html` | Reservation request form |
| `contact.html` | Contact form + Google Maps embed |
| `partnerships.html` | Wholesale & retail partnerships |

Plus: `404.html`, `sitemap.xml`, `robots.txt`, `favicon.svg`.

## Build

Pages are authored in the generator, not by hand-editing the `.html` files directly.

```bash
node .claude/build.js     # regenerates all 13 pages + 404 + sitemap + robots + favicon + styles.min.css
```

- `.claude/build.js` — head/SEO, nav (with Experiences dropdown), footer, schema helpers, and the
  7 core pages.
- `.claude/build-experiences.js` — the 6 Experiences pages and the final writer (sitemap, robots,
  404, favicon, CSS minification).

> ⚠️ Edit the generator and re-run the build. Editing the `.html` files directly will be
> overwritten on the next build.

## SEO / AIO

- Unique title + meta description, canonical, Open Graph, Twitter card on every page
- One `<h1>` per page, semantic `header`/`nav`/`main`/`section`/`article`/`footer`
- Alt text on every image, lazy loading + `decoding=async`
- JSON-LD: `Restaurant` (home), `Restaurant`+`LocalBusiness` (contact), `Event` (classes/drop-in),
  `Service` (experiences/private events/catering), `FAQPage` (where FAQs exist), `BreadcrumbList`
- Direct "What is…" answer paragraphs + FAQ accordions for AI Overviews / featured snippets
- Entity-rich copy (Edmonton, Italian cuisine, da Cecot Food), internal linking, clean slugs
- `sitemap.xml` + `robots.txt`, minified CSS (`styles.min.css`)

## Structure

```
css/styles.css         Design system source
css/styles.min.css     Minified, linked by pages (generated)
js/main.js             Mobile nav, dropdown, FAQ accordion, scroll reveal, back-to-top, forms
*.html                 Generated static pages
favicon.svg            Brand monogram favicon
.claude/               Generator + local preview server (node static server on :4321)
```

## Local preview

```bash
node .claude/static-server.js   # http://localhost:4321
```

## Images

Currently sourced from the client's Wix CDN (the live site's real photos). The client also has a
Google Drive folder of originals — see `DRIVE-PHOTOS.md` for the filename/ID inventory and the
access issue blocking automated import.

## Notes

Contact and reservation forms are front-end mockups (no backend). Cookin ordering and bookings
link out to / are represented by native form UI.
