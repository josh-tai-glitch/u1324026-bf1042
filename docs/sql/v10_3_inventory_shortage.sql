-- V10.3 Inventory / shortage impact reference SQL.
-- Do not run this automatically from Codex. If the Neon environment has
-- already been patched manually, review before executing again.

CREATE TABLE IF NOT EXISTS bf_v10.ingredients (
  id serial PRIMARY KEY,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'unit',
  current_stock integer NOT NULL DEFAULT 0,
  safety_stock integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bf_v10.menu_item_ingredients (
  id serial PRIMARY KEY,
  menu_item_id integer NOT NULL REFERENCES bf_v10.menu_items(id) ON DELETE CASCADE,
  ingredient_id integer NOT NULL REFERENCES bf_v10.ingredients(id),
  quantity_per_item integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingredients_is_active_idx
  ON bf_v10.ingredients(is_active);

CREATE INDEX IF NOT EXISTS menu_item_ingredients_menu_item_id_idx
  ON bf_v10.menu_item_ingredients(menu_item_id);

CREATE INDEX IF NOT EXISTS menu_item_ingredients_ingredient_id_idx
  ON bf_v10.menu_item_ingredients(ingredient_id);
