# da Cecot CMS — build plan

Goal: let Erika log in at `/admin` and safely edit the site herself, plus an AI
assistant that can make the same edits by chat. Additive, SEO-preserving.

## Approach (git-based CMS)
The site is already generated from data by `.claude/build*.js`. We externalize the
editable content into **`content.json`** (read by the generator, with the current
hardcoded values as fallbacks). The admin edits `content.json` + uploads images;
on save the store adapter persists it and the site rebuilds — content lands in the
static HTML, so SEO is preserved.

- **Content stays in HTML** (no client-side injection) → SEO intact.
- **Store adapter**: `local` (writes to disk — used for local verify) / `github`
  (commits to the repo via API on Vercel → auto-redeploy). Chosen by env.
- **No database** to operate; content is versioned in git.

## Auth (proper)
- One admin (Erika). Password = bcrypt hash in `ADMIN_PASSWORD_HASH` env (never committed).
- Session = signed JWT (HS256, `SESSION_SECRET`) in a HttpOnly, Secure, SameSite=Strict cookie; 8h expiry; logout clears it.
- CSRF: SameSite=Strict + double-submit token required on all mutations.
- Login rate-limited (Upstash Redis if configured, else in-memory best-effort).
- `/admin` is a static shell; ALL content + mutations require a valid session at the API (server-enforced).

## Editable content (v1)
Business & contact (name, phone, email, address, reservation link) · Homepage hero
copy · Announcement banner · Pasta class dates + cap · Photos (hero + about).
(Opening hours = documented fast-follow; currently correct and hardcoded.)

## AI assistant
In-admin chatbot (Claude tool-use) that reads the schema and calls the same guarded
save functions. Env-gated on `ANTHROPIC_API_KEY` — inert (and clearly labelled) until
spend is approved. Forms-based CMS works fully without it.

## Files
- `content.json`, `lib/cms/{schema,content,auth,store,ratelimit,validate}.js`
- `api/admin/{login,logout,session,content,upload,chat}.js`
- `admin/{index.html,admin.css,admin.js}`

## Orders & payments subsystem (requested — phased, needs inputs)
- **Now (Phase A, no new infra):** on order submit, email the customer their
  order details + date + a **payment link** (uses the product's Square link).
- **Phase B (needs a data store):** capture every pasta-shop order / class booking /
  reservation to a DB (Neon), and add an **Orders & Reservations tab** in the CMS
  to view them (mark paid/fulfilled).  Decision needed: which store.
- **Phase C (needs Square API creds + spend approval + cron):** create per-order
  Square payment links via API, listen for Square **webhooks** to auto-mark paid,
  and a scheduled job to **email reminders** for unpaid orders.
- Blockers for B/C: (1) data store choice, (2) client's Square API access token +
  location id, (3) go-ahead on a reminders cron. Table reservations have no payment.

## Verify
Login works · an edit saves + renders on the site · `/admin` blocked when logged out ·
build passes · chatbot scaffold present (inert w/o key). Then PAUSE for prod go-ahead.

## Reservations OS (key feature — 2026-09-01)
Views: Today / This Week / All upcoming / Past, grouped by day with covers count.
Floor plan: SVG editor — add/drag tables (name, seats, shape), stored in DB.
Seating: assign a reservation to a table; seat-count + double-book conflict warnings.
Manual add (phone bookings) + Wix CSV import (migration) — imported rows never email guests.
Data: reservations stay in `submissions`; tables in new `restaurant_tables`; assignment = details.table_id.
