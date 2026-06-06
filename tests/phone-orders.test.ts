import { describe, expect, test } from "bun:test";
import {
  analyticsSummarySchema,
  orderSchema,
  orderSourceSchema,
} from "../shared/contracts.ts";
import { createWalkInOrderBodySchema } from "../shared/route-schemas.ts";

describe("phone order contracts", () => {
  test("order source accepts phone", () => {
    expect(orderSourceSchema.parse("phone")).toBe("phone");
  });

  test("walk-in route body accepts phone orders with guest phone", () => {
    const parsed = createWalkInOrderBodySchema.parse({
      orderSource: "phone",
      guestName: "Phone Guest",
      guestPhone: "0912-345-678",
      items: [{ itemId: 1, qty: 2, menuItemVersion: 1 }],
      fulfillmentType: "takeout",
      paymentMethod: "cash",
    });

    expect(parsed.orderSource).toBe("phone");
    expect(parsed.guestPhone).toBe("0912-345-678");
  });

  test("order schema preserves guest phone for phone orders", () => {
    const parsed = orderSchema.parse({
      id: 1,
      userId: "staff-1",
      items: [],
      subtotal: 0,
      discountAmount: 0,
      promoCode: null,
      total: 0,
      status: "submitted",
      orderSource: "phone",
      guestName: "Phone Guest",
      guestPhone: "0912-345-678",
      createdByStaffId: "staff-1",
      createdAt: new Date().toISOString(),
    });

    expect(parsed.orderSource).toBe("phone");
    expect(parsed.guestPhone).toBe("0912-345-678");
  });

  test("analytics summary includes phone source counts", () => {
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
      orderSources: { customer: 0, walk_in: 0, phone: 1, guest: 0 },
    });

    expect(parsed.orderSources.phone).toBe(1);
  });
});
