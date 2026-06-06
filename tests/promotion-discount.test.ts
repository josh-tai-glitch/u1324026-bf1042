import { describe, expect, test } from "bun:test";
import type { Promotion } from "../shared/contracts.ts";
import {
  calculatePromotionDiscount,
  normalizePromotionCode,
  validatePromotionForSubtotal,
} from "../store/promotions/PromotionCalculator.ts";

function promotion(
  patch: Partial<Promotion> & Pick<Promotion, "discountType" | "discountValue">,
): Promotion {
  return {
    id: patch.id ?? 1,
    code: patch.code ?? "SAVE10",
    discountType: patch.discountType,
    discountValue: patch.discountValue,
    minOrderAmount: patch.minOrderAmount ?? 0,
    startsAt: patch.startsAt ?? null,
    endsAt: patch.endsAt ?? null,
    usageLimit: patch.usageLimit ?? null,
    isActive: patch.isActive ?? true,
    createdAt: patch.createdAt ?? new Date("2026-01-01").toISOString(),
    updatedAt: patch.updatedAt ?? new Date("2026-01-01").toISOString(),
  };
}

describe("promotion discount calculation", () => {
  test("normalizes promo codes for lookup and storage", () => {
    expect(normalizePromotionCode(" save10 ")).toBe("SAVE10");
    expect(normalizePromotionCode("")).toBeNull();
    expect(normalizePromotionCode(null)).toBeNull();
  });

  test("applies percent discount with integer floor", () => {
    const result = calculatePromotionDiscount({
      subtotal: 333,
      promotion: promotion({ discountType: "percent", discountValue: 10 }),
    });

    expect(result).toEqual({
      promoCode: "SAVE10",
      subtotal: 333,
      discountAmount: 33,
      total: 300,
    });
  });

  test("clamps fixed discount to subtotal", () => {
    const result = calculatePromotionDiscount({
      subtotal: 80,
      promotion: promotion({
        code: "FREEISH",
        discountType: "fixed",
        discountValue: 120,
      }),
    });

    expect(result.discountAmount).toBe(80);
    expect(result.total).toBe(0);
  });

  test("returns gross total when no promotion is supplied", () => {
    const result = calculatePromotionDiscount({ subtotal: 250 });

    expect(result).toEqual({
      promoCode: null,
      subtotal: 250,
      discountAmount: 0,
      total: 250,
    });
  });

  test("accepts promotion when minimum order amount is met", () => {
    const result = validatePromotionForSubtotal({
      subtotal: 500,
      promotion: promotion({
        discountType: "fixed",
        discountValue: 50,
        minOrderAmount: 300,
      }),
    });

    expect(result).toEqual({ ok: true });
  });

  test("rejects promotion when minimum order amount is not met", () => {
    const result = validatePromotionForSubtotal({
      subtotal: 200,
      promotion: promotion({
        discountType: "fixed",
        discountValue: 50,
        minOrderAmount: 300,
      }),
    });

    expect(result).toEqual({
      ok: false,
      code: "PROMOTION_MIN_ORDER_NOT_MET",
    });
  });

  test("rejects promotion before start time", () => {
    const result = validatePromotionForSubtotal({
      subtotal: 500,
      now: new Date("2026-01-01T09:00:00.000Z"),
      promotion: promotion({
        discountType: "percent",
        discountValue: 10,
        startsAt: "2026-01-02T00:00:00.000Z",
      }),
    });

    expect(result).toEqual({ ok: false, code: "PROMOTION_NOT_STARTED" });
  });

  test("rejects promotion after end time", () => {
    const result = validatePromotionForSubtotal({
      subtotal: 500,
      now: new Date("2026-01-03T00:00:00.000Z"),
      promotion: promotion({
        discountType: "percent",
        discountValue: 10,
        endsAt: "2026-01-02T23:59:59.000Z",
      }),
    });

    expect(result).toEqual({ ok: false, code: "PROMOTION_EXPIRED" });
  });

  test("rejects promotion when usage limit is reached", () => {
    const result = validatePromotionForSubtotal({
      subtotal: 500,
      usageCount: 10,
      promotion: promotion({
        discountType: "percent",
        discountValue: 10,
        usageLimit: 10,
      }),
    });

    expect(result).toEqual({
      ok: false,
      code: "PROMOTION_USAGE_LIMIT_REACHED",
    });
  });

  test("rejects inactive promotion", () => {
    const result = validatePromotionForSubtotal({
      subtotal: 500,
      promotion: promotion({
        discountType: "percent",
        discountValue: 10,
        isActive: false,
      }),
    });

    expect(result).toEqual({ ok: false, code: "PROMOTION_INACTIVE" });
  });
});
