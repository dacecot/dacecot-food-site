-- da Cecot — Orders & Payments store schema (Postgres / Neon).
-- Idempotent: safe to run repeatedly (used by store.init()).
-- One row per captured submission: pasta-shop order, class booking, reservation,
-- contact or wholesale enquiry.

CREATE TABLE IF NOT EXISTS submissions (
  id                uuid        PRIMARY KEY,
  type              text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  name              text,
  email             text,
  phone             text,
  amount_cents      integer,
  currency          text        NOT NULL DEFAULT 'CAD',
  payment_status    text        NOT NULL DEFAULT 'none',
  payment_link_url  text,
  square_order_id   text,
  square_payment_id text,
  paid_at           timestamptz,
  reminded_at       timestamptz,
  details           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  subject           text
);

-- Small key/value bag for operational switches the restaurant flips during
-- service — currently just the reservation pause. Deliberately NOT in
-- content.json: that store commits to GitHub and rebuilds the site, which is
-- far too slow for a 30-minute pause and could not expire on its own.
CREATE TABLE IF NOT EXISTS site_settings (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submissions_payment_status ON submissions (payment_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at     ON submissions (created_at DESC);

-- Site analytics, counted by the site itself (no cookies, no third party).
-- One row per page view or gift-card interaction. `visitor` is a hash of a
-- secret + the day + IP + browser: it tells two visits apart on the same day
-- and changes every day, so nobody can be followed across days. The raw IP is
-- never stored. `day` is the Edmonton calendar day.
CREATE TABLE IF NOT EXISTS site_events (
  id      bigserial   PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  day     date        NOT NULL,
  kind    text        NOT NULL,   -- 'view' | 'gift_view' | 'gift_click'
  path    text,
  ref     text,
  device  text,
  visitor text,
  slug    text
);
CREATE INDEX IF NOT EXISTS idx_site_events_day ON site_events (day);
