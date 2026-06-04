import type {
  Promotion,
  PromotionDiscountPreview,
} from "../../shared/contracts.ts";

export function normalizePromotionCode(code?: string | null): string | null {
  const normalized = code?.trim().toUpperCase();
  return normalized ? normalized : null;
}

export function calculatePromotionDiscount(input: {
  subtotal: number;
  promotion?: Promotion | null;
}): PromotionDiscountPreview {
  const subtotal = Math.max(0, Math.trunc(input.subtotal));
  const promotion = input.promotion ?? null;

  if (!promotion) {
    return {
      promoCode: null,
      subtotal,
      discountAmount: 0,
      total: subtotal,
    };
  }

  const rawDiscount =
    promotion.discountType === "percent"
      ? Math.floor((subtotal * promotion.discountValue) / 100)
      : Math.min(promotion.discountValue, subtotal);
  const discountAmount = Math.min(Math.max(0, rawDiscount), subtotal);

  return {
    promoCode: promotion.code,
    subtotal,
    discountAmount,
    total: subtotal - discountAmount,
  };
}

export function isPromotionValueValid(promotion: Promotion): boolean {
  if (promotion.discountType === "percent") {
    return promotion.discountValue >= 1 && promotion.discountValue <= 100;
  }

  return promotion.discountValue > 0;
}
