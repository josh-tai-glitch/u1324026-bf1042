-- V10.3 Phone orders support.
-- This file documents the SQL needed for environments that have not yet been
-- migrated. Do not run blindly against production; inspect existing columns
-- first. Statements are guarded with IF NOT EXISTS where PostgreSQL supports it.

ALTER TABLE bf_v10.orders
  ADD COLUMN IF NOT EXISTS guest_phone text;

CREATE INDEX IF NOT EXISTS orders_guest_phone_idx
  ON bf_v10.orders (guest_phone);

CREATE INDEX IF NOT EXISTS orders_order_source_idx
  ON bf_v10.orders (order_source);
