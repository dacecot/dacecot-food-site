# Da Cecot Food Inc — Website

A custom static rebuild of [dacecotfood.com](https://www.dacecotfood.com/) — an authentic Italian
comfort food pasta bar and street food kitchen in Edmonton, AB.

## Stack

Clean static site — no framework, no build step. Plain HTML, CSS, and a small amount of vanilla JS.

## Pages

| File | Page |
|------|------|
| `index.html` | Home |
| `menu.html` | Menu (Pasta Bar, Drinks & Dessert, Philosophy) |
| `about.html` | About / our family story |
| `reservations.html` | Reservation request form |
| `events.html` | Pasta classes, private events, space rental |
| `experiences.html` | "At Our Family Table" weekend special |
| `contact.html` | Contact form + Google Maps embed |
| `partnerships.html` | Wholesale & retail partnerships |

## Structure

```
css/styles.css        Design system + all component styles
js/main.js            Mobile nav, scroll reveal, back-to-top, form handling
*.html                One file per page (shared header/footer markup)
.claude/              Local preview server config (node static server on :4321)
```

## Design system

- **Colours:** cream `#f9f7ef`, dark brown `#4a1e18`, dark olive `#374225`,
  terracotta `#ad5217`, gold `#c4a035`
- **Type:** Playfair Display (serif headings) + Inter (sans body)
- **Patterns:** alternating dark/cream sections, pill CTAs, circular portrait crops,
  two-column value props, three-column offering grids, generous vertical spacing,
  fade-up-on-scroll (progressive enhancement), mobile hamburger menu

## Local preview

```bash
node .claude/static-server.js   # serves on http://localhost:4321
```

## Notes

The contact form and reservation form are front-end mockups (no backend).
Booking/ordering on the original Wix site (Cookin, Wix Bookings) link out or
are represented by native form UI here.
