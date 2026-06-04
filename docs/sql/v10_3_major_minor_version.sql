-- V10.3 Major / Minor menu versioning migration record.
-- This file is intentionally not executed by Codex. Review and run manually
-- only when the target database is ready. IF NOT EXISTS guards are included
-- for environments that may already have part of the schema.

ALTER TABLE bf_v10.menu_items
  ADD COLUMN IF NOT EXISTS version_major integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_minor integer NOT NULL DEFAULT 0;

ALTER TABLE bf_v10.order_items
  ADD COLUMN IF NOT EXISTS menu_item_version_major integer,
  ADD COLUMN IF NOT EXISTS menu_item_version_minor integer;

-- Existing serial versions are mapped into v1.N for historical continuity.
UPDATE bf_v10.menu_items
SET
  version_major = COALESCE(version_major, 1),
  version_minor = COALESCE(version_minor, GREATEST(version - 1, 0))
WHERE version_major IS NULL
   OR version_minor IS NULL;

UPDATE bf_v10.order_items AS oi
SET
  menu_item_version_major = COALESCE(oi.menu_item_version_major, mi.version_major),
  menu_item_version_minor = COALESCE(oi.menu_item_version_minor, mi.version_minor)
FROM bf_v10.menu_items AS mi
WHERE oi.item_id = mi.id
  AND (
    oi.menu_item_version_major IS NULL
    OR oi.menu_item_version_minor IS NULL
  );

CREATE INDEX IF NOT EXISTS menu_items_semantic_version_idx
  ON bf_v10.menu_items (
    menu_item_group_id,
    version_major,
    version_minor
  );
