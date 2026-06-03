-- V10.1 Menu Versioning migration record.
-- This file is intentionally not executed by Codex. If the production
-- database already has these columns, keep the IF NOT EXISTS guards and do
-- not rerun destructive data changes.

ALTER TABLE bf_v10.menu_items
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS menu_item_group_id text,
  ADD COLUMN IF NOT EXISTS is_current_version boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS changed_by text REFERENCES bf_v10."user"(id),
  ADD COLUMN IF NOT EXISTS previous_version_id integer REFERENCES bf_v10.menu_items(id);

UPDATE bf_v10.menu_items
SET menu_item_group_id = id::text
WHERE menu_item_group_id IS NULL OR menu_item_group_id = '';

ALTER TABLE bf_v10.menu_items
  ALTER COLUMN menu_item_group_id SET NOT NULL;

UPDATE bf_v10.menu_items
SET change_reason = COALESCE(change_reason, 'Initial version')
WHERE version = 1;

ALTER TABLE bf_v10.order_items
  ADD COLUMN IF NOT EXISTS menu_item_version integer,
  ADD COLUMN IF NOT EXISTS menu_item_group_id text;

UPDATE bf_v10.order_items AS oi
SET
  menu_item_version = COALESCE(oi.menu_item_version, mi.version),
  menu_item_group_id = COALESCE(oi.menu_item_group_id, mi.menu_item_group_id)
FROM bf_v10.menu_items AS mi
WHERE oi.item_id = mi.id
  AND (oi.menu_item_version IS NULL OR oi.menu_item_group_id IS NULL);

CREATE INDEX IF NOT EXISTS menu_items_current_version_idx
  ON bf_v10.menu_items (is_current_version, menu_item_group_id);

CREATE INDEX IF NOT EXISTS order_items_menu_version_idx
  ON bf_v10.order_items (menu_item_group_id, menu_item_version);

-- V10.3 display order was added later but is included here as a reference for
-- environments bootstrapping from one consolidated schema.
ALTER TABLE bf_v10.menu_items
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS menu_items_display_order_idx
  ON bf_v10.menu_items (display_order, id);
