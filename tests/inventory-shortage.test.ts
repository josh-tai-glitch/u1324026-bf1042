import { rm } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import {
  adjustIngredientStockBodySchema,
  createIngredientBodySchema,
  setMenuItemIngredientsBodySchema,
} from "../shared/route-schemas";
import { JsonFileStore } from "../store/json/JsonFileStore";

describe("inventory shortage contracts and store behavior", () => {
  test("createIngredientBodySchema accepts valid data", () => {
    const parsed = createIngredientBodySchema.parse({
      name: "Egg",
      unit: "pcs",
      currentStock: 12,
      safetyStock: 3,
    });

    expect(parsed.name).toBe("Egg");
    expect(parsed.unit).toBe("pcs");
  });

  test("createIngredientBodySchema rejects negative stock", () => {
    expect(() =>
      createIngredientBodySchema.parse({
        name: "Egg",
        currentStock: -1,
      }),
    ).toThrow();
  });

  test("adjustIngredientStockBodySchema accepts delta", () => {
    const parsed = adjustIngredientStockBodySchema.parse({
      delta: -2,
      reason: "waste",
    });

    expect(parsed.delta).toBe(-2);
  });

  test("setMenuItemIngredientsBodySchema accepts ingredient list", () => {
    const parsed = setMenuItemIngredientsBodySchema.parse({
      ingredients: [{ ingredientId: 1, quantityPerItem: 2 }],
    });

    expect(parsed.ingredients[0]?.quantityPerItem).toBe(2);
  });

  test("setMenuItemIngredientsBodySchema rejects quantity <= 0", () => {
    expect(() =>
      setMenuItemIngredientsBodySchema.parse({
        ingredients: [{ ingredientId: 1, quantityPerItem: 0 }],
      }),
    ).toThrow();
  });

  test("inventory impact marks out of stock ingredients and affected menu items", async () => {
    const path = `./data/test-inventory-shortage-${Date.now()}.json`;
    const store = new JsonFileStore({ dataFilePath: path });
    await store.init();

    try {
      const ingredient = await store.createIngredient({
        name: "Egg",
        unit: "pcs",
        currentStock: 0,
        safetyStock: 2,
      });
      await store.setMenuItemIngredients(1, [
        { ingredientId: ingredient.id, quantityPerItem: 1 },
      ]);

      const [impact] = store.getInventoryImpacts();
      const [menuImpact] = store.getMenuItemAvailabilityImpacts();

      expect(impact?.status).toBe("out_of_stock");
      expect(impact?.affectedMenuItems[0]?.id).toBe(1);
      expect(menuImpact?.canPrepare).toBe(false);
      expect(menuImpact?.missingIngredients[0]?.ingredientName).toBe("Egg");
    } finally {
      await rm(path, { force: true });
    }
  });

  test("inventory impact marks low stock but can prepare when enough stock exists", async () => {
    const path = `./data/test-inventory-low-${Date.now()}.json`;
    const store = new JsonFileStore({ dataFilePath: path });
    await store.init();

    try {
      const ingredient = await store.createIngredient({
        name: "Milk",
        unit: "ml",
        currentStock: 2,
        safetyStock: 3,
      });
      await store.setMenuItemIngredients(1, [
        { ingredientId: ingredient.id, quantityPerItem: 1 },
      ]);

      const [impact] = store.getInventoryImpacts();
      const [menuImpact] = store.getMenuItemAvailabilityImpacts();

      expect(impact?.status).toBe("low_stock");
      expect(menuImpact?.canPrepare).toBe(true);
      expect(menuImpact?.lowStockIngredients[0]?.ingredientName).toBe("Milk");
    } finally {
      await rm(path, { force: true });
    }
  });

  test("inventory sync disables shortage items but does not auto-restore after restock", async () => {
    const path = `./data/test-inventory-sync-${Date.now()}.json`;
    const store = new JsonFileStore({ dataFilePath: path });
    await store.init();

    try {
      const [menuItem] = store.getCurrentMenu();
      expect(menuItem).toBeDefined();
      const ingredient = await store.createIngredient({
        name: "Egg",
        unit: "pcs",
        currentStock: 0,
        safetyStock: 1,
      });
      await store.setMenuItemIngredients(menuItem.id, [
        { ingredientId: ingredient.id, quantityPerItem: 1 },
      ]);

      const shortageSync = await store.syncMenuAvailabilityByInventory();
      const disabledItem = store
        .getCurrentMenu()
        .find(
          (item) => item.menu_item_group_id === menuItem.menu_item_group_id,
        );

      expect(shortageSync.disabledCount).toBe(1);
      expect(shortageSync.restoredCount).toBe(0);
      expect(disabledItem?.is_available).toBe(false);

      await store.adjustIngredientStock(ingredient.id, { currentStock: 10 });
      const restockSync = await store.syncMenuAvailabilityByInventory();
      const restockedItem = store
        .getCurrentMenu()
        .find(
          (item) => item.menu_item_group_id === menuItem.menu_item_group_id,
        );

      expect(restockSync.disabledCount).toBe(0);
      expect(restockSync.restoredCount).toBe(0);
      expect(restockedItem?.is_available).toBe(false);
    } finally {
      await rm(path, { force: true });
    }
  });
});
