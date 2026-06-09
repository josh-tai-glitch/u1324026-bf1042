import { z } from "zod";
import type { Order } from "./contracts.ts";
import {
  abTestAnalyticsSchema,
  abTestGroupSchema,
  auditLogActionSchema,
  auditLogSchema,
  auditLogTargetTypeSchema,
  analyticsInsightsSchema,
  analyticsSummarySchema,
  analyticsTrendsSchema,
  categorySchema,
  categorySalesSchema,
  discountTypeSchema,
  fulfillmentTypeSchema,
  menuBundleSchema,
  menuItemSchema,
  orderSchema,
  queueSummarySchema,
  orderIssueTypeSchema,
  orderStatusSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  priceSensitivityAnalyticsSchema,
  promotionDiscountPreviewSchema,
  promotionSchema,
  roleRequestSchema,
  roleSchema,
  sessionUserSchema,
  topItemSalesSchema,
} from "./contracts.ts";
import toTaipeiDateTime from "../util.ts";

export type { Order };

const optionalIsoDateTimeSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => {
    if (!value) return true;
    const time = Date.parse(value);
    return Number.isFinite(time);
  }, "Invalid date time");

const optionalGuestPhoneSchema = z
  .string()
  .trim()
  .max(30)
  .optional()
  .nullable()
  .refine((value) => {
    if (!value) return true;
    return /^[0-9+\-() ]{6,30}$/.test(value);
  }, "Invalid phone number");

const optionalImageUrlSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => {
    if (!value) return true;
    return (
      value.startsWith("/") ||
      value.startsWith("http://") ||
      value.startsWith("https://")
    );
  }, "Image URL must start with /, http://, or https://");

const groupOrderFieldsSchema = {
  isGroupOrder: z.boolean().optional(),
  groupName: z.string().trim().max(80).optional().nullable(),
  contactName: z.string().trim().max(80).optional().nullable(),
  contactPhone: optionalGuestPhoneSchema,
};

const orderItemCustomizationSchema = {
  memberName: z.string().trim().max(80).optional().nullable(),
  bundleId: z.number().int().min(1).optional().nullable(),
  bundleName: z.string().trim().max(80).optional().nullable(),
};

// ─── API Layer Error Response（API 層錯誤格式定義）────────────────────────

// API error / response helpers
export const apiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const demoUserResponseSchema = sessionUserSchema;

export const demoUserListResponseSchema = z.object({
  data: z.array(demoUserResponseSchema),
});

export const demoLoginBodySchema = z.object({
  userId: z.string().min(1),
});

export const demoLoginResponseSchema = z.object({
  data: demoUserResponseSchema,
});

export const demoLogoutResponseSchema = z.object({
  data: z.boolean(),
});

// ─── API Layer Order Response（Order 的 API 層呈現）──────────────────────

// Order response mapper
export const orderResponseSchema = orderSchema.extend({
  createdAtTaipei: z.string().min(1),
});

export type OrderResponse = z.infer<typeof orderResponseSchema>;

/**
 * 將數據庫/內部 Order 轉換為 API 響應格式
 * 添加台北時區時間戳
 */
export function toOrderResponse(order: Order): OrderResponse {
  return {
    ...order,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
  };
}

// ─── Request Schemas（按 route 分組）────────────────────────────────────

// Request params/body schemas
/** POST /api/menu */
export const createMenuItemBodySchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0).max(99999),
  category: z.string().min(1),
  primaryCategoryId: z.number().int().min(1).optional(),
  description: z.string().min(1),
  image_url: optionalImageUrlSchema.pipe(z.string().min(1)),
  isAvailable: z.boolean().optional(),
  abTestGroup: abTestGroupSchema.nullable().optional(),
});

/** PATCH /api/menu/:id */
export const updateMenuItemParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const menuItemHistoryParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateMenuItemDisplayOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateMenuItemDisplayOrderBodySchema = z.object({
  displayOrder: z.number().int().min(0).max(9999),
});

export const updateMenuItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().int().min(0).max(99999).optional(),
  category: z.string().min(1).optional(),
  primaryCategoryId: z.number().int().min(1).nullable().optional(),
  description: z.string().min(1).optional(),
  image_url: optionalImageUrlSchema.optional(),
  isAvailable: z.boolean().optional(),
  abTestGroup: abTestGroupSchema.nullable().optional(),
  changeReason: z.string().trim().min(1).max(500).optional(),
});

const menuBundleItemsBodySchema = z
  .array(
    z.object({
      menuItemId: z.number().int().min(1),
      qty: z.number().int().min(1).max(99),
    }),
  )
  .min(1);

export const createMenuBundleBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().default(""),
  price: z.number().int().min(0).max(99999),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  items: menuBundleItemsBodySchema,
});

export const updateMenuBundleBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  price: z.number().int().min(0).max(99999).optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  items: menuBundleItemsBodySchema.optional(),
});

export const menuBundleParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** DELETE /api/menu/:id */
export const deleteMenuItemParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** GET /api/orders/:id */
export const getOrderByIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** PATCH /api/orders/:id */
export const updateOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderBodySchema = z.object({
  itemId: z.number().int().min(1),
  qty: z.number().int().min(0).max(99),
});

/** PATCH /api/orders/:id/status */
export const updateOrderStatusParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderStatusBodySchema = z.object({
  status: orderStatusSchema,
});

/** PATCH /api/orders/:id/cancel */
export const cancelOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** PATCH /api/orders/:id/issue */
export const setOrderIssueParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const setOrderIssueBodySchema = z.object({
  issueType: orderIssueTypeSchema,
  issueNote: z.string().max(500).optional().nullable(),
});

/** DELETE /api/orders/:id/issue */
export const clearOrderIssueParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** PATCH /api/orders/:id/rating */
export const updateOrderRatingParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderRatingBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  ratingComment: z.string().max(500).optional().nullable(),
});

/** PATCH /api/orders/:id/payment */
export const updateOrderPaymentParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderPaymentBodySchema = z.object({
  paymentStatus: z.literal("paid"),
});

/** POST /api/orders/:id/submit */
export const submitOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const submitOrderBodySchema = z.object({
  fulfillmentType: fulfillmentTypeSchema.default("takeout"),
  customerNote: z.string().max(500).optional().nullable(),
  pickupTime: optionalIsoDateTimeSchema,
  paymentMethod: paymentMethodSchema.default("cash"),
  paymentStatus: paymentStatusSchema.optional(),
  promoCode: z.string().trim().max(32).optional().nullable(),
  ...groupOrderFieldsSchema,
  itemCustomizations: z
    .array(
      z.object({
        itemId: z.number().int().min(1),
        ...orderItemCustomizationSchema,
      }),
    )
    .optional(),
});

export const createWalkInOrderBodySchema = z.object({
  orderSource: z.enum(["walk_in", "phone"]).default("walk_in").optional(),
  guestName: z.string().trim().max(80).optional().nullable(),
  guestPhone: optionalGuestPhoneSchema,
  items: z
    .array(
      z.object({
        itemId: z.number().int().min(1),
        qty: z.number().int().min(1).max(99),
        menuItemVersion: z.number().int().min(1).optional(),
        ...orderItemCustomizationSchema,
      }),
    )
    .min(1),
  fulfillmentType: fulfillmentTypeSchema.default("takeout"),
  customerNote: z.string().max(500).optional().nullable(),
  pickupTime: optionalIsoDateTimeSchema,
  paymentMethod: paymentMethodSchema.default("cash"),
  paymentStatus: paymentStatusSchema.optional(),
  promoCode: z.string().trim().max(32).optional().nullable(),
  ...groupOrderFieldsSchema,
});

export const createGuestOrderBodySchema = z.object({
  guestName: z.string().trim().min(1).max(80),
  guestPhone: z
    .string()
    .trim()
    .min(1, "Guest phone is required")
    .max(30)
    .refine(
      (value) => /^[0-9+\-() ]{6,30}$/.test(value),
      "Invalid phone number",
    ),
  items: z
    .array(
      z.object({
        itemId: z.number().int().min(1),
        qty: z.number().int().min(1).max(99),
        menuItemVersion: z.number().int().min(1).optional(),
        ...orderItemCustomizationSchema,
      }),
    )
    .min(1),
  fulfillmentType: fulfillmentTypeSchema.default("takeout"),
  customerNote: z.string().max(500).optional().nullable(),
  pickupTime: optionalIsoDateTimeSchema,
  paymentMethod: paymentMethodSchema.default("cash"),
  promoCode: z.string().trim().max(32).optional().nullable(),
  ...groupOrderFieldsSchema,
});

export const guestOrderLookupBodySchema = z.object({
  pickupNumber: z.string().trim().min(1).max(20),
  guestPhone: z
    .string()
    .trim()
    .min(1, "Guest phone is required")
    .max(30)
    .refine(
      (value) => /^[0-9+\-() ]{6,30}$/.test(value),
      "Invalid phone number",
    ),
});

function validatePromotionDateRange(
  value: { startsAt?: string | null; endsAt?: string | null },
  context: z.RefinementCtx,
) {
  if (!value.startsAt || !value.endsAt) return;
  if (Date.parse(value.startsAt) > Date.parse(value.endsAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "Promotion end time must be after start time.",
    });
  }
}

export const createPromotionBodySchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    discountType: discountTypeSchema,
    discountValue: z.number().int().positive(),
    minOrderAmount: z.number().int().min(0).max(999999).optional(),
    startsAt: optionalIsoDateTimeSchema,
    endsAt: optionalIsoDateTimeSchema,
    usageLimit: z.number().int().min(1).max(999999).nullable().optional(),
  })
  .superRefine(validatePromotionDateRange);

export const updatePromotionBodySchema = z
  .object({
    code: z.string().trim().min(1).max(32).optional(),
    discountType: discountTypeSchema.optional(),
    discountValue: z.number().int().positive().optional(),
    minOrderAmount: z.number().int().min(0).max(999999).optional(),
    startsAt: optionalIsoDateTimeSchema,
    endsAt: optionalIsoDateTimeSchema,
    usageLimit: z.number().int().min(1).max(999999).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(validatePromotionDateRange);

export const promotionParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const getPromotionsQuerySchema = z.object({
  status: z.enum(["active", "inactive", "all"]).default("active").optional(),
});

/** POST /api/users/me/role-request */
export const createRoleRequestBodySchema = z.object({
  requestedRole: roleSchema.refine(
    (role) => role === "staff" || role === "chef",
    "requestedRole must be staff or chef",
  ),
  reason: z.string().min(10),
});

/** GET /api/admin/role-requests */
export const getAdminRoleRequestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
});

/** PATCH /api/admin/role-requests/:id */
export const reviewRoleRequestParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const reviewRoleRequestBodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().optional(),
});

/** PATCH /api/admin/users/:userId/roles */
export const updateUserRolesParamsSchema = z.object({
  userId: z.string().min(1),
});

export const updateUserRolesBodySchema = z.object({
  roles: z.array(roleSchema).min(1),
});

// Analytics query schemas
export const analyticsDateRangeQuerySchema = z.object({
  range: z
    .enum(["all", "today", "last7Days", "thisMonth", "custom"])
    .default("all"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const topItemsAnalyticsQuerySchema = analyticsDateRangeQuerySchema.extend({
  limit: z.string().regex(/^[0-9]+$/).optional(),
});

// Admin query schemas
export const getAuditLogsQuerySchema = z.object({
  limit: z.string().regex(/^[0-9]+$/).optional(),
  action: auditLogActionSchema.optional(),
  targetType: auditLogTargetTypeSchema.optional(),
  range: z
    .enum(["all", "today", "last7Days", "thisMonth", "custom"])
    .default("all"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  actor: z.string().optional(),
  targetId: z.string().optional(),
});

export const getCategoriesQuerySchema = z.object({
  status: z.enum(["active", "inactive", "all"]).default("active"),
});

/** /api/categories/:id */
export const categoryParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** POST /api/categories */
export const createCategoryBodySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/categories/:id */
export const updateCategoryBodySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

/** POST /api/menu/:id/categories */
export const assignMenuItemCategoryParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const assignMenuItemCategoryBodySchema = z.object({
  categoryId: z.number().int().min(1),
});

/** DELETE /api/menu/:id/categories/:categoryId */
export const removeMenuItemCategoryParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
  categoryId: z.string().regex(/^[0-9]+$/),
});

// ─── Response Schemas（API envelope 層）─────────────────────────────────

// Response envelope schemas
export const menuListResponseSchema = z.object({
  data: z.array(menuItemSchema),
});

export const menuItemResponseSchema = z.object({
  data: menuItemSchema,
});

export const menuItemHistoryResponseSchema = z.object({
  data: z.array(menuItemSchema),
});

export const menuBundleResponseSchema = z.object({
  data: menuBundleSchema,
});

export const menuBundleListResponseSchema = z.object({
  data: z.array(menuBundleSchema),
});

export const versionConflictResponseSchema = z.object({
  error: z.string(),
  code: z.literal("MENU_VERSION_CHANGED"),
  itemName: z.string().optional(),
});

export const apiErrorOrVersionConflictResponseSchema = z.union([
  apiErrorResponseSchema,
  versionConflictResponseSchema,
]);

export const categoryResponseSchema = z.object({
  data: categorySchema,
});

export const categoryListResponseSchema = z.object({
  data: z.array(categorySchema),
});

export const promotionResponseSchema = z.object({
  data: promotionSchema,
});

export const promotionListResponseSchema = z.object({
  data: z.array(promotionSchema),
});

export const promotionDiscountPreviewResponseSchema = z.object({
  data: promotionDiscountPreviewSchema,
});

export const categorySalesListResponseSchema = z.object({
  data: z.array(categorySalesSchema),
});

export const analyticsSummaryResponseSchema = z.object({
  data: analyticsSummarySchema,
});

export const analyticsTrendsResponseSchema = z.object({
  data: analyticsTrendsSchema,
});

export const analyticsInsightsResponseSchema = z.object({
  data: analyticsInsightsSchema,
});

export const priceSensitivityAnalyticsResponseSchema = z.object({
  data: priceSensitivityAnalyticsSchema,
});

export const abTestAnalyticsResponseSchema = z.object({
  data: abTestAnalyticsSchema,
});

export const topItemSalesListResponseSchema = z.object({
  data: z.array(topItemSalesSchema),
});

export const auditLogListResponseSchema = z.object({
  data: z.array(auditLogSchema),
});

export const auditLogLooseListResponseSchema = z.object({
  data: z.array(z.unknown()),
});

export const orderListResponseSchema = z.object({
  data: z.array(orderResponseSchema),
});

export const orderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema,
});

export const queueSummaryResponseSchema = z.object({
  data: queueSummarySchema,
});

export const nullableOrderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema.nullable(),
});

export const roleRequestResponseSchema = z.object({
  data: roleRequestSchema,
});

export const roleRequestListResponseSchema = z.object({
  data: z.array(roleRequestSchema),
});

export const userRolesResponseSchema = z.object({
  data: z.object({
    userId: z.string().min(1),
    roles: z.array(roleSchema).min(1),
  }),
});

export const currentUserResponseSchema = z.object({
  data: sessionUserSchema,
});

export const healthResponseSchema = z.object({
  status: z.string(),
});
