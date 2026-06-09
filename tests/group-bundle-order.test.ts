import { describe, expect, test } from "bun:test";
import {
  createGuestOrderBodySchema,
  createMenuBundleBodySchema,
  createWalkInOrderBodySchema,
} from "../shared/route-schemas";
import { orderItemSchema, orderSchema } from "../shared/contracts";
import type { MenuBundle, OrderItem } from "../shared/contracts";
import { applyBundlePricingToOrderItems } from "../store/Store";

describe("group order and bundle contracts", () => {
  const toastItem = {
    id: 1,
    name: "Toast",
    price: 40,
    category: "Toast",
    description: "Breakfast toast",
    image_url: "/toast.jpg",
    is_available: true,
    version: 1,
    version_major: 1,
    version_minor: 0,
    menu_item_group_id: "1",
    is_current_version: true,
    previous_version_id: null,
    change_reason: null,
    changed_by: null,
    ab_test_group: "control" as const,
    display_order: 0,
  };
  const drinkItem = {
    ...toastItem,
    id: 2,
    name: "Tea",
    price: 40,
    category: "Drink",
    menu_item_group_id: "2",
  };
  const classicBundle: MenuBundle = {
    id: 7,
    name: "Classic combo",
    description: "Toast and tea",
    price: 80,
    isActive: true,
    displayOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [
      { menuItemId: 1, qty: 1, item: toastItem },
      { menuItemId: 2, qty: 1, item: drinkItem },
    ],
  };

  function buildOrderItem(
    item: typeof toastItem,
    qty = 1,
  ): OrderItem {
    return {
      item: { ...item },
      qty,
      menu_item_version: item.version,
      menu_item_group_id: item.menu_item_group_id,
      memberName: null,
      bundleId: classicBundle.id,
      bundleName: classicBundle.name,
    };
  }

  function calculateOrderTotal(orderItems: ReadonlyArray<OrderItem>): number {
    return orderItems.reduce(
      (sum, orderItem) => sum + orderItem.item.price * orderItem.qty,
      0,
    );
  }

  test("order schema accepts group order fields", () => {
    const parsed = orderSchema.parse({
      id: 1,
      userId: "user-1",
      status: "submitted",
      items: [],
      total: 120,
      subtotal: 120,
      discountAmount: 0,
      promoCode: null,
      fulfillmentType: "takeout",
      customerNote: null,
      pickupTime: null,
      paymentMethod: "cash",
      paymentStatus: "unpaid",
      orderSource: "customer",
      guestName: null,
      guestPhone: null,
      createdByStaffId: null,
      isGroupOrder: true,
      groupName: "Office breakfast",
      contactName: "Josh",
      contactPhone: "0912-345-678",
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      rating: null,
      ratingComment: null,
      ratedAt: null,
      issueType: null,
      issueNote: null,
      issueReportedBy: null,
      issueReportedAt: null,
      abTestGroup: "control",
    });

    expect(parsed.isGroupOrder).toBe(true);
    expect(parsed.groupName).toBe("Office breakfast");
    expect(parsed.contactPhone).toBe("0912-345-678");
  });

  test("order item schema accepts member and bundle snapshot metadata", () => {
    const parsed = orderItemSchema.parse({
      item: {
        id: 1,
        name: "Toast",
        price: 45,
        category: "Toast",
        description: "Breakfast toast",
        image_url: "/toast.jpg",
        is_available: true,
        version: 1,
        version_major: 1,
        version_minor: 0,
        menu_item_group_id: "1",
        is_current_version: true,
        previous_version_id: null,
        change_reason: null,
        changed_by: null,
        ab_test_group: "control",
        display_order: 0,
      },
      qty: 2,
      menu_item_version: 1,
      menu_item_group_id: "1",
      memberName: "Amy",
      bundleId: 3,
      bundleName: "Classic combo",
    });

    expect(parsed.memberName).toBe("Amy");
    expect(parsed.bundleId).toBe(3);
    expect(parsed.bundleName).toBe("Classic combo");
  });

  test("create menu bundle body accepts item composition", () => {
    const parsed = createMenuBundleBodySchema.parse({
      name: "Classic combo",
      description: "Toast and drink",
      price: 80,
      displayOrder: 1,
      items: [
        { menuItemId: 1, qty: 1 },
        { menuItemId: 2, qty: 2 },
      ],
    });

    expect(parsed.items).toHaveLength(2);
  });

  test("create menu bundle body rejects empty item composition", () => {
    expect(() =>
      createMenuBundleBodySchema.parse({
        name: "Empty combo",
        price: 80,
        items: [],
      }),
    ).toThrow();
  });

  test("guest checkout body accepts group fields and member names", () => {
    const parsed = createGuestOrderBodySchema.parse({
      guestName: "Guest",
      guestPhone: "0912-345-678",
      items: [
        {
          itemId: 1,
          qty: 1,
          menuItemVersion: 1,
          memberName: "Amy",
          bundleId: 2,
          bundleName: "Combo",
        },
      ],
      fulfillmentType: "takeout",
      paymentMethod: "cash",
      isGroupOrder: true,
      groupName: "Class A",
      contactName: "Amy",
      contactPhone: "0912-345-678",
    });

    expect(parsed.isGroupOrder).toBe(true);
    expect(parsed.items[0].memberName).toBe("Amy");
  });

  test("staff order body accepts group fields and bundle snapshots", () => {
    const parsed = createWalkInOrderBodySchema.parse({
      orderSource: "phone",
      guestName: "Guest",
      guestPhone: "0912-345-678",
      items: [
        {
          itemId: 1,
          qty: 1,
          menuItemVersion: 1,
          bundleId: 2,
          bundleName: "Combo",
        },
      ],
      fulfillmentType: "takeout",
      paymentMethod: "cash",
      isGroupOrder: true,
      groupName: "Office",
      contactName: "Lead",
      contactPhone: "0912-345-678",
    });

    expect(parsed.orderSource).toBe("phone");
    expect(parsed.items[0].bundleName).toBe("Combo");
  });

  test("group name and bundle qty are bounded", () => {
    expect(() =>
      createGuestOrderBodySchema.parse({
        guestName: "Guest",
        guestPhone: "0912-345-678",
        items: [{ itemId: 1, qty: 1 }],
        fulfillmentType: "takeout",
        paymentMethod: "cash",
        groupName: "x".repeat(81),
      }),
    ).toThrow();

    expect(() =>
      createMenuBundleBodySchema.parse({
        name: "Huge combo",
        price: 80,
        items: [{ menuItemId: 1, qty: 100 }],
      }),
    ).toThrow();
  });

  test("bundle price allocation preserves bundle total for simple combos", () => {
    const orderItems = [
      buildOrderItem({ ...toastItem, price: 40 }),
      buildOrderItem({ ...drinkItem, price: 40 }),
    ];

    const allocatedItems = applyBundlePricingToOrderItems(orderItems, [
      classicBundle,
    ]);
    const subtotal = allocatedItems.reduce(
      (sum, item) => sum + item.item.price * item.qty,
      0,
    );

    expect(subtotal).toBe(80);
  });

  test("bundle price allocation can reduce item snapshot prices", () => {
    const discountedBundle = { ...classicBundle, price: 28 };
    const orderItems = [
      buildOrderItem({ ...toastItem, price: 40 }),
      buildOrderItem({ ...drinkItem, price: 40 }),
    ];

    const allocatedItems = applyBundlePricingToOrderItems(orderItems, [
      discountedBundle,
    ]);
    const subtotal = allocatedItems.reduce(
      (sum, item) => sum + item.item.price * item.qty,
      0,
    );

    expect(subtotal).toBe(28);
    expect(allocatedItems.every((item) => item.item.price < 40)).toBe(true);
  });

  test("bundle price allocation uses bundle price when every required item is tagged", () => {
    const bundle: MenuBundle = {
      ...classicBundle,
      id: 1,
      price: 30,
      items: [
        { menuItemId: 1, qty: 1, item: { ...toastItem, price: 55 } },
        { menuItemId: 2, qty: 1, item: { ...drinkItem, price: 20 } },
      ],
    };
    const orderItems: OrderItem[] = [
      {
        ...buildOrderItem({ ...toastItem, price: 55 }),
        bundleId: 1,
        bundleName: bundle.name,
      },
      {
        ...buildOrderItem({ ...drinkItem, price: 20 }),
        bundleId: 1,
        bundleName: bundle.name,
      },
    ];

    const allocatedItems = applyBundlePricingToOrderItems(orderItems, [bundle]);
    const subtotal = allocatedItems.reduce(
      (sum, item) => sum + item.item.price * item.qty,
      0,
    );

    expect(subtotal).toBe(30);
  });

  test("bundle price allocation multiplies bundle price for multiple complete sets", () => {
    const bundle: MenuBundle = {
      ...classicBundle,
      id: 1,
      price: 30,
      items: [
        { menuItemId: 1, qty: 1, item: { ...toastItem, price: 55 } },
        { menuItemId: 2, qty: 1, item: { ...drinkItem, price: 20 } },
      ],
    };
    const orderItems: OrderItem[] = [
      {
        ...buildOrderItem({ ...toastItem, price: 55 }, 3),
        bundleId: 1,
        bundleName: bundle.name,
      },
      {
        ...buildOrderItem({ ...drinkItem, price: 20 }, 3),
        bundleId: 1,
        bundleName: bundle.name,
      },
    ];

    const allocatedItems = applyBundlePricingToOrderItems(orderItems, [bundle]);

    expect(allocatedItems).not.toBe(orderItems);
    expect(calculateOrderTotal(allocatedItems)).toBe(90);
  });

  test("bundle price allocation charges extra quantities at original item price", () => {
    const bundle: MenuBundle = {
      ...classicBundle,
      id: 1,
      price: 30,
      items: [
        { menuItemId: 1, qty: 1, item: { ...toastItem, price: 55 } },
        { menuItemId: 2, qty: 1, item: { ...drinkItem, price: 20 } },
      ],
    };
    const orderItems: OrderItem[] = [
      {
        ...buildOrderItem({ ...toastItem, price: 55 }, 3),
        bundleId: 1,
        bundleName: bundle.name,
      },
      {
        ...buildOrderItem({ ...drinkItem, price: 20 }, 2),
        bundleId: 1,
        bundleName: bundle.name,
      },
    ];

    const allocatedItems = applyBundlePricingToOrderItems(orderItems, [bundle]);
    const extraToastRow = allocatedItems.find(
      (orderItem) => orderItem.item.id === 1 && orderItem.bundleId === null,
    );

    expect(calculateOrderTotal(allocatedItems)).toBe(115);
    expect(extraToastRow?.qty).toBe(1);
    expect(extraToastRow?.item.price).toBe(55);
  });

  test("bundle price allocation ignores partial bundle metadata", () => {
    const bundle: MenuBundle = {
      ...classicBundle,
      id: 1,
      price: 30,
      items: [
        { menuItemId: 1, qty: 1, item: { ...toastItem, price: 55 } },
        { menuItemId: 2, qty: 1, item: { ...drinkItem, price: 20 } },
      ],
    };
    const orderItems: OrderItem[] = [
      {
        ...buildOrderItem({ ...toastItem, price: 55 }),
        bundleId: null,
        bundleName: null,
      },
      {
        ...buildOrderItem({ ...drinkItem, price: 20 }),
        bundleId: 1,
        bundleName: bundle.name,
      },
    ];

    const allocatedItems = applyBundlePricingToOrderItems(orderItems, [bundle]);
    const subtotal = allocatedItems.reduce(
      (sum, item) => sum + item.item.price * item.qty,
      0,
    );

    expect(subtotal).toBe(75);
  });

  test("bundle price allocation ignores bundle metadata when unrelated items are tagged", () => {
    const bundle: MenuBundle = {
      ...classicBundle,
      id: 1,
      price: 30,
      items: [
        { menuItemId: 1, qty: 1, item: { ...toastItem, price: 55 } },
        { menuItemId: 2, qty: 1, item: { ...drinkItem, price: 20 } },
      ],
    };
    const sideItem = {
      ...toastItem,
      id: 3,
      name: "Hash brown",
      price: 99,
      menu_item_group_id: "3",
    };
    const orderItems: OrderItem[] = [
      {
        ...buildOrderItem({ ...toastItem, price: 55 }),
        bundleId: 1,
        bundleName: bundle.name,
      },
      {
        ...buildOrderItem({ ...drinkItem, price: 20 }),
        bundleId: 1,
        bundleName: bundle.name,
      },
      {
        ...buildOrderItem(sideItem),
        bundleId: 1,
        bundleName: bundle.name,
      },
    ];

    const allocatedItems = applyBundlePricingToOrderItems(orderItems, [bundle]);

    expect(calculateOrderTotal(allocatedItems)).toBe(174);
  });
});
