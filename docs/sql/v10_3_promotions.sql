-- V10.3 Promotion / Coupon migration reference.
-- This file is a documented SQL draft only. Do not run it blindly if the
-- production database has already been updated manually.

CREATE TABLE IF NOT EXISTS bf_v10.promotions (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL,
  discount_value integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE bf_v10.orders
  ADD COLUMN IF NOT EXISTS subtotal integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_code text;

UPDATE bf_v10.orders
SET subtotal = total
WHERE subtotal = 0 AND total > 0;

CREATE INDEX IF NOT EXISTS promotions_code_idx
  ON bf_v10.promotions (code);

CREATE INDEX IF NOT EXISTS promotions_is_active_idx
  ON bf_v10.promotions (is_active);
