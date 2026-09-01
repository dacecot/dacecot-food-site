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

CREATE INDEX IF NOT EXISTS idx_submissions_payment_status ON submissions (payment_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at     ON submissions (created_at DESC);
