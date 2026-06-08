-- V10.3 Group Order + Bundle Order reference migration.
-- This file is documentation for the required schema changes.
-- Do not run blindly if the production database has already been migrated.

ALTER TABLE bf_v10.orders
  ADD COLUMN IF NOT EXISTS is_group_order boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text;

CREATE INDEX IF NOT EXISTS orders_is_group_order_idx
  ON bf_v10.orders (is_group_order);

ALTER TABLE bf_v10.order_items
  ADD COLUMN IF NOT EXISTS member_name text,
  ADD COLUMN IF NOT EXISTS bundle_id integer,
  ADD COLUMN IF NOT EXISTS bundle_name text;

CREATE INDEX IF NOT EXISTS order_items_bundle_id_idx
  ON bf_v10.order_items (bundle_id);

CREATE TABLE IF NOT EXISTS bf_v10.menu_bundles (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_bundles_is_active_idx
  ON bf_v10.menu_bundles (is_active);

CREATE TABLE IF NOT EXISTS bf_v10.menu_bundle_items (
  id serial PRIMARY KEY,
  bundle_id integer NOT NULL REFERENCES bf_v10.menu_bundles(id) ON DELETE CASCADE,
  menu_item_id integer NOT NULL REFERENCES bf_v10.menu_items(id),
  qty integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_bundle_items_bundle_id_idx
  ON bf_v10.menu_bundle_items (bundle_id);

CREATE INDEX IF NOT EXISTS menu_bundle_items_menu_item_id_idx
  ON bf_v10.menu_bundle_items (menu_item_id);
