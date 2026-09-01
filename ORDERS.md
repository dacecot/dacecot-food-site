# Orders & Payments — go-live guide

Backend scaffolding for capturing website submissions (pasta-shop orders, class
bookings, reservations, contact/wholesale enquiries), creating per-order **Square**
payment links, auto-marking orders paid via Square **webhooks**, and emailing
**reminders** for unpaid orders.

Everything here is **env-gated**. With no env vars set it falls back to a local
JSON store and all payment/email features stay inert — nothing breaks, nothing
sends. Turning it on is entirely a matter of setting env vars in Vercel and doing
the small front-end wiring described at the bottom.

---

## 1. Files in this subsystem

| File | Purpose |
| --- | --- |
| `lib/orders/store.js` | Persistence adapter. `postgres` (Neon) when `DATABASE_URL` is set, else `local` JSON at `.data/submissions.json`. All SQL parameterized. |
| `lib/orders/schema.sql` | `CREATE TABLE submissions` + indexes (idempotent). |
| `lib/orders/submission.js` | `normalize(payload)` — detect type, parse amount, build the submission shape. |
| `lib/orders/square.js` | Square payment-link creation + webhook signature verification. |
| `lib/orders/mailer.js` | Resend helper: `sendPaymentLink(sub)`, `sendReminder(sub)`. |
| `api/square/webhook.js` | Receives Square webhooks; verifies signature; marks orders paid. |
| `api/admin/orders.js` | Admin API — `GET` list, `POST` manual `mark_paid`/`mark_fulfilled`. Reuses CMS auth. |
| `api/cron/reminders.js` | `CRON_SECRET`-guarded job that emails reminders for unpaid orders. |
| `vercel.json` | Cron schedule (every 6h) + security headers for `/admin` and `/api/admin/*`. |

---

## 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. None are
required to build; each unlocks one capability.

### Data store (Phase B)
| Var | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Persisting orders to Postgres | A Neon connection string (`postgres://…`). **Unset → local JSON fallback** (fine for dev, not for production — Vercel's filesystem is ephemeral). |

### Square payments (Phase C)
| Var | Needed for | Notes |
| --- | --- | --- |
| `SQUARE_ACCESS_TOKEN` | Creating payment links | From the Square Developer dashboard. **Never logged.** |
| `SQUARE_LOCATION_ID` | Creating payment links | The seller location id. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Verifying webhooks | Shown when you register the webhook subscription. |
| `SQUARE_ENV` | Choosing environment | `sandbox` (default) or `production`. |
| `SQUARE_WEBHOOK_URL` | (optional) | Force the exact notification URL used for signature checks. Defaults to the reconstructed request URL; set it if you sit behind a proxy that rewrites host/proto. |

### Email (reuses the existing Resend account)
| Var | Needed for | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | Sending customer email | Same key `api/send.js` already uses. |
| `RESEND_FROM` | Sender identity | e.g. `da Cecot <bookings@dacecotfood.com>` once the domain is verified. Defaults to Resend's test sender. |

### Reminders cron
| Var | Needed for | Notes |
| --- | --- | --- |
| `CRON_SECRET` | Authorizing the reminders job | **If unset, the reminders endpoint refuses to run and never sends.** Set a long random string. Vercel's scheduler automatically sends it as `Authorization: Bearer <CRON_SECRET>`. |

---

## 3. Run the database migration (only if using Postgres)

The table is created automatically the first time the store is used
(`store.init()` runs `lib/orders/schema.sql`, which is idempotent). To create it
up front instead, run the SQL against your Neon database:

```bash
# with psql:
psql "$DATABASE_URL" -f lib/orders/schema.sql
```

Or from Node:

```bash
DATABASE_URL="postgres://…" node -e "require('./lib/orders/store').init().then(()=>console.log('migrated')).catch(e=>{console.error(e);process.exit(1)})"
```

The table is `submissions` (uuid pk, `jsonb` details, `timestamptz` columns,
indexes on `payment_status` and `created_at`).

---

## 4. Register the Square webhook

1. Square Developer dashboard → your application → **Webhooks → Subscriptions → Add endpoint**.
2. **Notification URL:** `https://dacecotfood.com/api/square/webhook`
   (use your Vercel production domain).
3. **Events:** subscribe to `payment.created`, `payment.updated`, and
   `order.updated`.
4. Copy the **Signature key** shown for the subscription into
   `SQUARE_WEBHOOK_SIGNATURE_KEY`.
5. Use Square's **Send test event** to confirm you get a `200`. A valid but
   unmatched event returns `200 {ignored|matched:false}`; a bad signature
   returns `401`; if Square isn't configured the endpoint returns `503`.

The webhook verifies `HMAC-SHA256(notificationUrl + rawBody)` (base64) against the
signature key, then on a **COMPLETED** payment (or a paid order) looks up our
submission by `reference_id` (our submission id) or `square_order_id` and marks it
paid.

---

## 5. Admin — viewing orders

`GET /api/admin/orders` (requires a valid CMS admin session) returns all captured
submissions, newest first. Filter with `?type=order|class|reservation|contact|wholesale`
and/or `?status=none|pending|paid|reminded`.

`POST /api/admin/orders` (session **+ CSRF header** `X-CSRF-Token`) with
`{ "id": "…", "action": "mark_paid" }` or `{ "id": "…", "action": "mark_fulfilled" }`
for manual updates. This mirrors the existing `/api/admin/content` auth exactly, so
an **Orders & Reservations tab** can be added to `admin/` reusing the same fetch
pattern (`credentials:'same-origin'` + the CSRF token from the session).

---

## 6. Front-end wiring (done by the site owner — NOT in this branch)

This branch deliberately does **not** edit `api/send.js`, `js/main.js`, or
`.claude/build*.js`. Two small changes turn the plumbing on:

### 6a. Capture every submission (Phase B — one line in `api/send.js`)

Inside the `try { … }` where `api/send.js` calls Resend (right after building the
email, before or after the send), add a **best-effort, non-blocking** capture so a
store failure can never break the existing email flow:

```js
// Best-effort capture for the Orders CMS — never blocks/breaks the email send.
try {
  require('../lib/orders/store')
    .record(require('../lib/orders/submission').normalize(data))
    .catch(function () {});
} catch (e) { /* ignore */ }
```

Place it so it runs for every accepted POST (after the honeypot check). It uses
`data` — the already-parsed request body in `api/send.js`. No `await`, so it adds
no latency and cannot throw into the response path.

### 6b. Server-created payment links (Phase C — replace the static `square.link` URLs)

Today the pasta-shop order buttons and the Sunday class use fixed
`square.link/u/…` checkout URLs (see `.claude/build.js`: the `data-pay="…"`
attributes on `data-order-open` buttons, and the class Square link). To move to
**per-order** links so each order has its own amount + reference id:

1. **New endpoint (owner to add), e.g. `api/orders/create.js`:** on order submit,
   `const sub = await store.record(normalize(data));` then
   ```js
   const link = await require('../../lib/orders/square').createPaymentLink({
     name: sub.subject || 'da Cecot order',
     amountCents: sub.amount_cents,
     referenceId: sub.id,            // lets the webhook match the payment back
     redirectUrl: 'https://dacecotfood.com/pasta-shop.html?paid=1',
     buyerEmail: sub.email
   });
   await store.update(sub.id, {
     payment_status: 'pending',
     payment_link_url: link.url,
     square_order_id: link.squareOrderId
   });
   ```
   Return `{ url: link.url }` and optionally fire `mailer.sendPaymentLink(sub)`.
2. **`js/main.js` order modal (`data-order-submit`):** instead of redirecting to
   the static `data-pay` URL, `POST` the form to the new endpoint and redirect the
   customer to the returned `url`. Keep the static `data-pay` URL as a fallback for
   when Square isn't configured (endpoint returns no url → use `data-pay`).
3. **`.claude/build.js`:** no structural change needed — the `data-pay` attributes
   can stay as the graceful fallback. Optionally add a `data-amount-cents` attribute
   so the client can show the total; the server still authoritatively computes the
   amount via `normalize()`.

Until 6b is wired, orders are still captured (6a) and the existing static Square
links keep working exactly as they do now.

---

## 7. Rollout order (recommended)

1. **Phase B:** add 6a + set `DATABASE_URL` → orders start landing in the DB;
   add the Orders tab in `/admin`.
2. **Phase C:** set the `SQUARE_*` vars, register the webhook (§4), add the
   `api/orders/create.js` endpoint + `js/main.js` change (6b) → per-order links +
   auto-paid.
3. **Reminders:** set `CRON_SECRET` → the every-6h cron (in `vercel.json`) starts
   nudging unpaid orders that have a payment link.

Reservations currently go to Wix and carry no payment; they are captured (type
`reservation`) for visibility only.
