import { describe, expect, it } from "bun:test";
import type { MenuItem, OrderItem } from "../shared/contracts.ts";
import { menuRepository } from "../store/menu/MenuRepository.ts";

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: "Classic Toast",
    price: 60,
    category: "Breakfast",
    primary_category_id: null,
    primary_category_name: null,
    categories: [],
    description: "Toast with egg",
    image_url: "/images/toast.jpg",
    is_available: true,
    display_order: 10,
    version: 1,
    menu_item_group_id: "toast-group",
    is_current_version: true,
    change_reason: "Initial version",
    changed_by: null,
    previous_version_id: null,
    ...overrides,
  };
}

function makeOrderItem(item: MenuItem, overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    item,
    qty: 1,
    menu_item_version: item.version,
    menu_item_group_id: item.menu_item_group_id,
    ...overrides,
  };
}

describe("MenuRepository menu versioning", () => {
  it("returns only current menu items", () => {
    const v1 = makeMenuItem({
      id: 1,
      version: 1,
      is_current_version: false,
    });
    const v2 = makeMenuItem({
      id: 2,
      version: 2,
      is_current_version: true,
      previous_version_id: 1,
    });

    expect(menuRepository.getCurrentMenu([v1, v2])).toEqual([v2]);
  });

  it("returns version history for the same menu item group", () => {
    const v1 = makeMenuItem({
      id: 1,
      version: 1,
      is_current_version: false,
    });
    const v2 = makeMenuItem({
      id: 2,
      version: 2,
      is_current_version: true,
      previous_version_id: 1,
    });
    const other = makeMenuItem({
      id: 3,
      name: "Coffee",
      menu_item_group_id: "coffee-group",
    });

    expect(menuRepository.getMenuItemVersionHistoryById([v1, v2, other], 1)).toEqual([
      v2,
      v1,
    ]);
  });

  it("accepts order items that match the current version", () => {
    const current = makeMenuItem({ id: 2, version: 2 });
    const orderItem = makeOrderItem(current);

    expect(
      menuRepository.validateOrderItemVersions([current], [orderItem]),
    ).toEqual({ ok: true });
  });

  it("rejects order items with an old menu version", () => {
    const oldVersion = makeMenuItem({
      id: 1,
      version: 1,
      is_current_version: false,
    });
    const current = makeMenuItem({
      id: 2,
      version: 2,
      is_current_version: true,
      previous_version_id: 1,
    });
    const orderItem = makeOrderItem(oldVersion);

    expect(
      menuRepository.validateOrderItemVersions([oldVersion, current], [orderItem]),
    ).toEqual({
      ok: false,
      itemName: "Classic Toast",
      menuItemGroupId: "toast-group",
      snapshotVersion: 1,
      currentVersion: 2,
    });
  });

  it("builds the next menu item version", () => {
    const current = makeMenuItem({
      id: 7,
      version: 1,
      display_order: 42,
      is_current_version: false,
    });

    const next = menuRepository.buildNextMenuItemVersion({
      currentItem: current,
      nextId: 8,
      changedBy: "admin-1",
      changeReason: "Updated breakfast price",
      changes: {
        name: "Classic Toast Deluxe",
        price: 75,
      },
    });

    expect(next.version).toBe(2);
    expect(next.previous_version_id).toBe(7);
    expect(next.is_current_version).toBe(true);
    expect(next.menu_item_group_id).toBe("toast-group");
    expect(next.display_order).toBe(42);
    expect(next.name).toBe("Classic Toast Deluxe");
    expect(next.price).toBe(75);
    expect(next.change_reason).toBe("Updated breakfast price");
    expect(next.changed_by).toBe("admin-1");
  });
});
