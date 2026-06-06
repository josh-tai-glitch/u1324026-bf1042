import { describe, expect, test } from "bun:test";
import {
  analyticsSummarySchema,
  orderSchema,
  orderSourceSchema,
} from "../shared/contracts.ts";
import { createGuestOrderBodySchema } from "../shared/route-schemas.ts";

describe("guest checkout contracts", () => {
  test("order source accepts guest", () => {
    expect(orderSourceSchema.parse("guest")).toBe("guest");
  });

  test("guest checkout body requires guest contact and item snapshots", () => {
    const parsed = createGuestOrderBodySchema.parse({
      guestName: " Guest Customer ",
      guestPhone: "0912-345-678",
      items: [{ itemId: 1, qty: 2, menuItemVersion: 3 }],
      fulfillmentType: "takeout",
      paymentMethod: "cash",
      promoCode: "breakfast10",
    });

    expect(parsed.guestName).toBe("Guest Customer");
    expect(parsed.guestPhone).toBe("0912-345-678");
    expect(parsed.items[0]?.menuItemVersion).toBe(3);
    expect(parsed.promoCode).toBe("breakfast10");
  });

  test("guest checkout body rejects missing phone", () => {
    expect(() =>
      createGuestOrderBodySchema.parse({
        guestName: "Guest Customer",
        items: [{ itemId: 1, qty: 1 }],
      }),
    ).toThrow();
  });

  test("order schema supports anonymous guest orders", () => {
    const parsed = orderSchema.parse({
      id: 10,
      userId: null,
      items: [],
      subtotal: 120,
      discountAmount: 20,
      promoCode: "BREAKFAST",
      total: 100,
      status: "submitted",
      orderSource: "guest",
      guestName: "Guest Customer",
      guestPhone: "0912-345-678",
      createdByStaffId: null,
      createdAt: new Date().toISOString(),
    });

    expect(parsed.userId).toBeNull();
    expect(parsed.orderSource).toBe("guest");
    expect(parsed.paymentStatus).toBe("unpaid");
  });

  test("analytics summary includes guest source counts", () => {
    const parsed = analyticsSummarySchema.parse({
      totalRevenue: 100,
      revenueOrderCount: 1,
      averageOrderValue: 100,
      todayRevenue: 100,
      todayOrderCount: 1,
      cancellationCount: 0,
      averageRating: null,
      ratingsCount: 0,
      paymentMethods: { cash: 1, card: 0, online: 0 },
      paymentStatuses: { paid: 0, unpaid: 1 },
      orderStatuses: {
        submitted: 1,
        preparing: 0,
        ready: 0,
        completed: 0,
        cancelled: 0,
      },
      orderSources: { customer: 0, walk_in: 0, phone: 0, guest: 1 },
    });

    expect(parsed.orderSources.guest).toBe(1);
  });
});
