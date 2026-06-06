import type {
  Promotion,
  PromotionDiscountPreview,
} from "../../shared/contracts.ts";

export type PromotionRuleErrorCode =
  | "PROMOTION_INACTIVE"
  | "INVALID_PROMOTION"
  | "PROMOTION_MIN_ORDER_NOT_MET"
  | "PROMOTION_NOT_STARTED"
  | "PROMOTION_EXPIRED"
  | "PROMOTION_USAGE_LIMIT_REACHED";

export function normalizePromotionCode(code?: string | null): string | null {
  const normalized = code?.trim().toUpperCase();
  return normalized ? normalized : null;
}

export function validatePromotionForSubtotal(input: {
  promotion: Promotion;
  subtotal: number;
  now?: Date;
  usageCount?: number;
}): { ok: true } | { ok: false; code: PromotionRuleErrorCode } {
  const { promotion } = input;
  const subtotal = Math.max(0, Math.trunc(input.subtotal));
  const now = input.now ?? new Date();

  if (!promotion.isActive) return { ok: false, code: "PROMOTION_INACTIVE" };
  if (!isPromotionValueValid(promotion)) {
    return { ok: false, code: "INVALID_PROMOTION" };
  }
  if (subtotal < promotion.minOrderAmount) {
    return { ok: false, code: "PROMOTION_MIN_ORDER_NOT_MET" };
  }
  if (promotion.startsAt && now.getTime() < Date.parse(promotion.startsAt)) {
    return { ok: false, code: "PROMOTION_NOT_STARTED" };
  }
  if (promotion.endsAt && now.getTime() > Date.parse(promotion.endsAt)) {
    return { ok: false, code: "PROMOTION_EXPIRED" };
  }
  if (
    promotion.usageLimit !== null &&
    (input.usageCount ?? 0) >= promotion.usageLimit
  ) {
    return { ok: false, code: "PROMOTION_USAGE_LIMIT_REACHED" };
  }

  return { ok: true };
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
