-- V10.3 Guest Checkout / Anonymous quick order support
--
-- This file documents the manual SQL needed for environments that already
-- have bf_v10.orders from earlier phases. Do not run db:push/migrate from
-- Codex for this phase. Review and apply manually in Neon/PostgreSQL.

ALTER TABLE bf_v10.orders
  ALTER COLUMN user_id DROP NOT NULL;

-- Existing order_source values remain valid. The application contract now also
-- accepts:
--   order_source = 'guest'
--
-- Guest orders store:
--   user_id = NULL
--   created_by_staff_id = NULL
--   guest_name / guest_phone = customer contact for pickup
--   status = 'submitted'
--   payment_status = 'unpaid'
--   ab_test_group = 'control'
