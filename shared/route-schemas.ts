import { z } from "zod";
import type { Order } from "./contracts.ts";
import {
  auditLogActionSchema,
  auditLogSchema,
  auditLogTargetTypeSchema,
  analyticsSummarySchema,
  analyticsTrendsSchema,
  categorySchema,
  categorySalesSchema,
  fulfillmentTypeSchema,
  menuItemSchema,
  orderSchema,
  orderIssueTypeSchema,
  orderStatusSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  roleRequestSchema,
  roleSchema,
  sessionUserSchema,
  topItemSalesSchema,
} from "./contracts.ts";
import toTaipeiDateTime from "../util.ts";

export type { Order };

// ─── API Layer Error Response（API 層錯誤格式定義）────────────────────────

// API error / response helpers
export const apiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

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
  price: z.number().int().min(0),
  category: z.string().min(1),
  primaryCategoryId: z.number().int().min(1).optional(),
  description: z.string().min(1),
  image_url: z.string().min(1),
  isAvailable: z.boolean().optional(),
});

/** PATCH /api/menu/:id */
export const updateMenuItemParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateMenuItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().int().min(0).optional(),
  category: z.string().min(1).optional(),
  primaryCategoryId: z.number().int().min(1).nullable().optional(),
  description: z.string().min(1).optional(),
  image_url: z.string().min(1).optional(),
  isAvailable: z.boolean().optional(),
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
  qty: z.number().min(0),
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
  pickupTime: z.string().optional().nullable(),
  paymentMethod: paymentMethodSchema.default("cash"),
  paymentStatus: paymentStatusSchema.optional(),
});

export const createWalkInOrderBodySchema = z.object({
  guestName: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        itemId: z.number().int().min(1),
        qty: z.number().int().min(1),
      }),
    )
    .min(1),
  fulfillmentType: fulfillmentTypeSchema.default("takeout"),
  customerNote: z.string().max(500).optional().nullable(),
  pickupTime: z.string().optional().nullable(),
  paymentMethod: paymentMethodSchema.default("cash"),
  paymentStatus: paymentStatusSchema.optional(),
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
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/categories/:id */
export const updateCategoryBodySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  displayOrder: z.number().int().optional(),
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

export const categoryResponseSchema = z.object({
  data: categorySchema,
});

export const categoryListResponseSchema = z.object({
  data: z.array(categorySchema),
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
