import { describe, expect, test } from "bun:test";
import {
  createGuestOrderBodySchema,
  createMenuBundleBodySchema,
  createWalkInOrderBodySchema,
} from "../shared/route-schemas";
import { orderItemSchema, orderSchema } from "../shared/contracts";

describe("group order and bundle contracts", () => {
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
});
