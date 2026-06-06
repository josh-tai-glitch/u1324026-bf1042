-- V10.3 Advanced promotion rules reference SQL.
-- Do not run blindly if these columns already exist in the target database.
-- This file is documentation for the manual migration/push step.

ALTER TABLE bf_v10.promotions
  ADD COLUMN IF NOT EXISTS min_order_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS starts_at timestamp,
  ADD COLUMN IF NOT EXISTS ends_at timestamp,
  ADD COLUMN IF NOT EXISTS usage_limit integer;

CREATE INDEX IF NOT EXISTS promotions_starts_at_idx
  ON bf_v10.promotions (starts_at);

CREATE INDEX IF NOT EXISTS promotions_ends_at_idx
  ON bf_v10.promotions (ends_at);
