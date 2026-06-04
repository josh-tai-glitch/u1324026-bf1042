-- V10.3 A/B Testing support.
-- This file documents the SQL needed for environments that have not yet been
-- migrated. Do not run blindly against production; inspect existing columns
-- first. Statements are guarded with IF NOT EXISTS where PostgreSQL supports it.

ALTER TABLE bf_v10.menu_items
  ADD COLUMN IF NOT EXISTS ab_test_group text;

ALTER TABLE bf_v10.orders
  ADD COLUMN IF NOT EXISTS ab_test_group text;

ALTER TABLE bf_v10.order_items
  ADD COLUMN IF NOT EXISTS ab_test_group text;

CREATE INDEX IF NOT EXISTS menu_items_ab_test_group_idx
  ON bf_v10.menu_items (ab_test_group);

CREATE INDEX IF NOT EXISTS orders_ab_test_group_idx
  ON bf_v10.orders (ab_test_group);

CREATE INDEX IF NOT EXISTS order_items_ab_test_group_idx
  ON bf_v10.order_items (ab_test_group);

-- Existing historical orders can remain NULL and will be treated as control by
-- application analytics fallback logic. If you prefer explicit historical data:
--
-- UPDATE bf_v10.orders
-- SET ab_test_group = 'control'
-- WHERE ab_test_group IS NULL AND status <> 'pending';
