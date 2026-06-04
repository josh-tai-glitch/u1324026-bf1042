import { describe, expect, test } from "bun:test";
import type { Promotion } from "../shared/contracts.ts";
import {
  calculatePromotionDiscount,
  normalizePromotionCode,
} from "../store/promotions/PromotionCalculator.ts";

function promotion(
  patch: Partial<Promotion> & Pick<Promotion, "discountType" | "discountValue">,
): Promotion {
  return {
    id: patch.id ?? 1,
    code: patch.code ?? "SAVE10",
    discountType: patch.discountType,
    discountValue: patch.discountValue,
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
});
