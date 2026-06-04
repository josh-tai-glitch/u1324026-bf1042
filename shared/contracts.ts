import { z } from "zod";

// ─── API Business Schemas（Single Source of Truth）──────────────────────────
// 這裡是前後端共用的業務型別定義。
// 型別（TypeScript type）由 Zod schema 自動推導，不需要手動維護兩份。

// Menu / category schemas
export const categorySchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  displayOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const menuCategoryLinkSchema = z.object({
  id: z.number().int().min(1),
  menuItemId: z.number().int().min(1),
  categoryId: z.number().int().min(1),
  createdAt: z.string().min(1),
  removedAt: z.string().min(1).nullable(),
});

export const abTestGroupSchema = z.enum(["control", "variant_a", "variant_b"]);
export const nullableAbTestGroupSchema = abTestGroupSchema.nullable();

export const menuItemSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  category: z.string().min(1),
  primary_category_id: z.number().int().min(1).nullable().optional(),
  primary_category_name: z.string().nullable().optional(),
  categories: z.array(categorySchema).optional(),
  description: z.string(),
  image_url: z.string().min(1),
  is_available: z.boolean().default(true),
  display_order: z.number().int().default(0),
  version: z.number().int().min(1),
  version_major: z.number().int().min(1).default(1),
  version_minor: z.number().int().min(0).default(0),
  menu_item_group_id: z.string().min(1),
  is_current_version: z.boolean(),
  change_reason: z.string().nullable(),
  changed_by: z.string().nullable(),
  previous_version_id: z.number().int().nullable(),
  ab_test_group: nullableAbTestGroupSchema.default(null),
});

export const menuItemHistorySchema = z.array(menuItemSchema);

export const discountTypeSchema = z.enum(["percent", "fixed"]);

export const promotionSchema = z.object({
  id: z.number().int().min(1),
  code: z.string().min(1),
  discountType: discountTypeSchema,
  discountValue: z.number().int().min(1),
  isActive: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const promotionDiscountPreviewSchema = z.object({
  promoCode: z.string().nullable(),
  subtotal: z.number().min(0),
  discountAmount: z.number().min(0),
  total: z.number().min(0),
});

// Auth / RBAC schemas
export const roleSchema = z.enum([
  "admin",
  "owner",
  "chef",
  "staff",
  "customer",
]);

// ─── User schemas（業務層）──────────────────────────────────────────────────
// userSchema：完整使用者資料（業務/資料層使用，不對外暴露）
// sessionUserSchema：API 回傳的最小安全投影（不含 password 等敏感欄位）
// 注意：V9 使用 Better Auth，userSchema 由 Better Auth DB 負責儲存。
//       sessionUserSchema 為 auth session 對外的唯一輸出格式。

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(3),
  name: z.string().min(1),
  roles: z.array(roleSchema).default(["customer"]),
  password: z.string().min(1),
  // 預留個資欄位（V9+ 實作使用者 profile 時使用）
  birthday: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
});

export const sessionUserSchema = userSchema.pick({
  id: true,
  email: true,
  name: true,
  roles: true,
});

export const roleRequestSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  requestedRole: roleSchema,
  reason: z.string().min(10),
  status: z.enum(["pending", "approved", "rejected"]),
  requestedAt: z.string().min(1),
  reviewedBy: z.string().min(1).nullable(),
  reviewedAt: z.string().min(1).nullable(),
  reviewNote: z.string().nullable(),
});

// Audit log schemas
export const auditLogActionSchema = z.enum([
  "role_update",
  "role_request_review",
  "menu_create",
  "menu_update",
  "menu_delete",
  "category_create",
  "category_update",
  "category_delete",
  "promotion_create",
  "promotion_update",
  "promotion_delete",
  "menu_category_assign",
  "menu_category_remove",
  "order_status_update",
  "order_payment_update",
  "order_cancel",
  "order_issue_set",
  "order_issue_clear",
  "walk_in_order_create",
]);

export const auditLogTargetTypeSchema = z.enum([
  "user",
  "role_request",
  "menu_item",
  "category",
  "promotion",
  "menu_item_category",
  "order",
]);

export const auditLogSchema = z.object({
  id: z.number().int().min(1),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorRoles: z.array(roleSchema).default([]),
  action: auditLogActionSchema,
  targetType: auditLogTargetTypeSchema,
  targetId: z.string().nullable(),
  message: z.string(),
  metadata: z.record(z.unknown()).nullable().catch(null),
  createdAt: z.string().min(1),
});

// Order schemas
export const orderItemSchema = z.object({
  item: menuItemSchema,
  qty: z.number().min(0),
  menu_item_version: z.number().int().min(1).nullable(),
  menu_item_version_major: z.number().int().min(1).nullable().optional(),
  menu_item_version_minor: z.number().int().min(0).nullable().optional(),
  menu_item_group_id: z.string().nullable(),
  ab_test_group: nullableAbTestGroupSchema.default(null),
});

export const orderStatusSchema = z.enum([
  "pending",
  "submitted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);

export const fulfillmentTypeSchema = z.enum(["dine_in", "takeout"]);
export const paymentMethodSchema = z.enum(["cash", "card", "online"]);
export const paymentStatusSchema = z.enum(["unpaid", "paid"]);
export const orderSourceSchema = z.enum(["customer", "walk_in"]);
export const orderIssueTypeSchema = z.enum([
  "out_of_stock",
  "need_customer_confirmation",
  "special_request_problem",
  "other",
]);

export const orderSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  items: z.array(orderItemSchema),
  subtotal: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  promoCode: z.string().nullable().default(null),
  total: z.number().min(0),
  abTestGroup: nullableAbTestGroupSchema.default(null),
  status: orderStatusSchema,
  orderSource: orderSourceSchema.default("customer"),
  guestName: z.string().nullable().default(null),
  createdByStaffId: z.string().nullable().default(null),
  fulfillmentType: fulfillmentTypeSchema.default("takeout"),
  customerNote: z.string().nullable().default(null),
  pickupTime: z.string().nullable().default(null),
  paymentMethod: paymentMethodSchema.default("cash"),
  paymentStatus: paymentStatusSchema.default("unpaid"),
  issueType: orderIssueTypeSchema.nullable().default(null),
  issueNote: z.string().nullable().default(null),
  issueReportedBy: z.string().nullable().default(null),
  issueReportedAt: z.string().nullable().default(null),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  ratingComment: z.string().nullable().default(null),
  ratedAt: z.string().nullable().default(null),
  createdAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
});

// Analytics schemas
export const categorySalesSchema = z.object({
  category: z.string().min(1),
  quantity: z.number().min(0),
  revenue: z.number().min(0),
  orderCount: z.number().int().min(0),
});

export const topItemSalesSchema = z.object({
  itemId: z.number().int().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().min(0),
  revenue: z.number().min(0),
  orderCount: z.number().int().min(0),
});

export const abTestAnalyticsItemSchema = z.object({
  group: abTestGroupSchema,
  orderCount: z.number().int().min(0),
  revenue: z.number().int().min(0),
  quantity: z.number().int().min(0),
  averageOrderValue: z.number().min(0),
});

export const abTestAnalyticsSchema = z.array(abTestAnalyticsItemSchema);

export const priceSensitivityPointSchema = z.object({
  price: z.number().min(0),
  quantity: z.number().min(0),
  revenue: z.number().min(0),
  orderCount: z.number().int().min(0),
});

export const priceSensitivityItemSchema = z.object({
  menuItemGroupId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  currentPrice: z.number().min(0).nullable(),
  totalQuantity: z.number().min(0),
  totalRevenue: z.number().min(0),
  pricePoints: z.array(priceSensitivityPointSchema),
});

export const priceSensitivityAnalyticsSchema = z.array(
  priceSensitivityItemSchema,
);

export const analyticsDailyRevenueSchema = z.object({
  date: z.string().min(1),
  revenue: z.number().min(0),
  orderCount: z.number().int().min(0),
});

export const analyticsHourlyOrdersSchema = z.object({
  hour: z.number().int().min(0).max(23),
  orderCount: z.number().int().min(0),
  revenue: z.number().min(0),
});

export const analyticsRatingDistributionSchema = z.object({
  "1": z.number().int().min(0),
  "2": z.number().int().min(0),
  "3": z.number().int().min(0),
  "4": z.number().int().min(0),
  "5": z.number().int().min(0),
});

// ─── Derived TypeScript Types（自動推導，永不過時）───────────────────────────
export const analyticsSummarySchema = z.object({
  totalRevenue: z.number().min(0),
  revenueOrderCount: z.number().int().min(0),
  averageOrderValue: z.number().min(0),
  todayRevenue: z.number().min(0),
  todayOrderCount: z.number().int().min(0),
  cancellationCount: z.number().int().min(0),
  averageRating: z.number().min(1).max(5).nullable(),
  ratingsCount: z.number().int().min(0),
  paymentMethods: z.object({
    cash: z.number().int().min(0),
    card: z.number().int().min(0),
    online: z.number().int().min(0),
  }),
  paymentStatuses: z.object({
    paid: z.number().int().min(0),
    unpaid: z.number().int().min(0),
  }),
  orderStatuses: z.object({
    submitted: z.number().int().min(0),
    preparing: z.number().int().min(0),
    ready: z.number().int().min(0),
    completed: z.number().int().min(0),
    cancelled: z.number().int().min(0),
  }),
  orderSources: z.object({
    customer: z.number().int().min(0),
    walk_in: z.number().int().min(0),
  }),
});

export const analyticsTrendsSchema = z.object({
  dailyRevenue: z.array(analyticsDailyRevenueSchema),
  hourlyOrders: z.array(analyticsHourlyOrdersSchema),
  ratingDistribution: analyticsRatingDistributionSchema,
  lowRatingCount: z.number().int().min(0),
  cancellationRate: z.number().min(0).max(1),
});

export const analyticsLowRatingOrderSchema = z.object({
  orderId: z.number().int().min(1),
  pickupNumber: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  date: z.string().min(1),
});

export const analyticsCancelledOrderSchema = z.object({
  orderId: z.number().int().min(1),
  pickupNumber: z.string().min(1),
  source: orderSourceSchema,
  total: z.number().min(0),
  createdAt: z.string().min(1),
  customerNote: z.string().nullable(),
});

export const analyticsPeakHourSchema = z.object({
  hour: z.number().int().min(0).max(23).nullable(),
  orderCount: z.number().int().min(0),
  revenue: z.number().min(0),
});

export const analyticsSourceComparisonSchema = z.object({
  source: orderSourceSchema,
  orderCount: z.number().int().min(0),
  revenue: z.number().min(0),
});

export const analyticsPaymentMethodComparisonSchema = z.object({
  paymentMethod: paymentMethodSchema,
  orderCount: z.number().int().min(0),
  revenue: z.number().min(0),
});

export const analyticsInsightsSchema = z.object({
  lowRatingOrders: z.array(analyticsLowRatingOrderSchema),
  cancelledOrders: z.array(analyticsCancelledOrderSchema),
  peakHour: analyticsPeakHourSchema,
  sourceComparison: z.array(analyticsSourceComparisonSchema),
  paymentMethodComparison: z.array(analyticsPaymentMethodComparisonSchema),
});

// Derived TypeScript Types
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuItemHistory = z.infer<typeof menuItemHistorySchema>;
export type AbTestGroup = z.infer<typeof abTestGroupSchema>;
export type DiscountType = z.infer<typeof discountTypeSchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type PromotionDiscountPreview = z.infer<
  typeof promotionDiscountPreviewSchema
>;
export type Category = z.infer<typeof categorySchema>;
export type MenuCategoryLink = z.infer<typeof menuCategoryLinkSchema>;
export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type RoleRequest = z.infer<typeof roleRequestSchema>;
export type AuditLogAction = z.infer<typeof auditLogActionSchema>;
export type AuditLogTargetType = z.infer<typeof auditLogTargetTypeSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type FulfillmentType = z.infer<typeof fulfillmentTypeSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type OrderSource = z.infer<typeof orderSourceSchema>;
export type OrderIssueType = z.infer<typeof orderIssueTypeSchema>;
export type Order = z.infer<typeof orderSchema>;
export type CategorySales = z.infer<typeof categorySalesSchema>;
export type TopItemSales = z.infer<typeof topItemSalesSchema>;
export type AbTestAnalyticsItem = z.infer<typeof abTestAnalyticsItemSchema>;
export type PriceSensitivityPoint = z.infer<
  typeof priceSensitivityPointSchema
>;
export type PriceSensitivityItem = z.infer<typeof priceSensitivityItemSchema>;
export type PriceSensitivityAnalytics = z.infer<
  typeof priceSensitivityAnalyticsSchema
>;
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;
export type AnalyticsTrends = z.infer<typeof analyticsTrendsSchema>;
export type AnalyticsInsights = z.infer<typeof analyticsInsightsSchema>;

export interface ApiDataResponse<T> {
  data: T;
}
