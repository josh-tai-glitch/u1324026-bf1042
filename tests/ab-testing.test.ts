import { describe, expect, test } from "bun:test";
import type { MenuItem, OrderItem } from "../shared/contracts.ts";
import { menuRepository } from "../store/menu/MenuRepository.ts";

function makeMenuItem(
  overrides: Partial<MenuItem> & { id: number; menu_item_group_id: string },
): MenuItem {
  return {
    id: overrides.id,
    name: overrides.name ?? `Item ${overrides.id}`,
    price: overrides.price ?? 50,
    category: overrides.category ?? "Breakfast",
    primary_category_id: null,
    primary_category_name: null,
    categories: [],
    description: overrides.description ?? "Test item",
    image_url: overrides.image_url ?? "/test.webp",
    is_available: overrides.is_available ?? true,
    ab_test_group: overrides.ab_test_group ?? null,
    display_order: overrides.display_order ?? 0,
    version: overrides.version ?? 1,
    version_major: overrides.version_major ?? 1,
    version_minor: overrides.version_minor ?? 0,
    menu_item_group_id: overrides.menu_item_group_id,
    is_current_version: overrides.is_current_version ?? true,
    change_reason: overrides.change_reason ?? "Initial version",
    changed_by: overrides.changed_by ?? null,
    previous_version_id: overrides.previous_version_id ?? null,
  };
}

function makeOrderItem(item: MenuItem): OrderItem {
  return {
    item,
    qty: 1,
    menu_item_version: item.version,
    menu_item_version_major: item.version_major,
    menu_item_version_minor: item.version_minor,
    menu_item_group_id: item.menu_item_group_id,
    ab_test_group: item.ab_test_group,
  };
}

describe("A/B testing menu repository helpers", () => {
  test("resolveAbTestGroupForUserId is stable and valid", () => {
    const first = menuRepository.resolveAbTestGroupForUserId("demo-user-1");
    const second = menuRepository.resolveAbTestGroupForUserId("demo-user-1");

    expect(second).toBe(first);
    expect(["control", "variant_a", "variant_b"]).toContain(first);
  });

  test("resolveAbTestGroupForUserId defaults anonymous users to control", () => {
    expect(menuRepository.resolveAbTestGroupForUserId(null)).toBe("control");
    expect(menuRepository.resolveAbTestGroupForUserId("")).toBe("control");
  });

  test("filterMenuForAbTestGroup includes ungrouped items and matching group only", () => {
    const menu = [
      makeMenuItem({ id: 1, menu_item_group_id: "base", ab_test_group: null }),
      makeMenuItem({
        id: 2,
        menu_item_group_id: "a",
        ab_test_group: "variant_a",
      }),
      makeMenuItem({
        id: 3,
        menu_item_group_id: "b",
        ab_test_group: "variant_b",
      }),
    ];

    const filtered = menuRepository.filterMenuForAbTestGroup(menu, "variant_a");

    expect(filtered.map((item) => item.id)).toEqual([1, 2]);
  });

  test("getCurrentMenu applies current version and A/B group filters", () => {
    const menu = [
      makeMenuItem({
        id: 1,
        menu_item_group_id: "shared",
        version: 1,
        is_current_version: false,
        ab_test_group: null,
      }),
      makeMenuItem({
        id: 2,
        menu_item_group_id: "shared",
        version: 2,
        is_current_version: true,
        ab_test_group: null,
      }),
      makeMenuItem({
        id: 3,
        menu_item_group_id: "variant",
        ab_test_group: "variant_b",
      }),
    ];

    const currentForControl = menuRepository.getCurrentMenu(menu, {
      abTestGroup: "control",
    });
    const currentForVariant = menuRepository.getCurrentMenu(menu, {
      abTestGroup: "variant_b",
    });

    expect(currentForControl.map((item) => item.id)).toEqual([2]);
    expect(currentForVariant.map((item) => item.id)).toEqual([2, 3]);
  });

  test("A/B group changes are minor menu versions and order validation uses snapshots", () => {
    const current = makeMenuItem({
      id: 1,
      menu_item_group_id: "item",
      version: 1,
      version_major: 1,
      version_minor: 0,
      ab_test_group: null,
    });
    const next = menuRepository.buildNextMenuItemVersion({
      currentItem: current,
      nextId: 2,
      changes: { ab_test_group: "variant_a" },
      changeReason: "Assign variant",
      changedBy: "admin",
    });

    expect(next.version).toBe(2);
    expect(next.version_major).toBe(1);
    expect(next.version_minor).toBe(1);
    expect(next.previous_version_id).toBe(current.id);
    expect(next.ab_test_group).toBe("variant_a");

    const validation = menuRepository.validateOrderItemVersions(
      [{ ...current, is_current_version: false }, next],
      [makeOrderItem(current)],
    );

    expect(validation).toEqual({
      ok: false,
      itemName: current.name,
      menuItemGroupId: current.menu_item_group_id,
      snapshotVersion: 1,
      currentVersion: 2,
    });
  });
});
