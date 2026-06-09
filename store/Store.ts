import type {
  AuditLog,
  AuditLogAction,
  AuditLogTargetType,
  AbTestAnalyticsItem,
  AbTestGroup,
  Category,
  CategorySales,
  AnalyticsInsights,
  AnalyticsSummary,
  AnalyticsTrends,
  DiscountType,
  FulfillmentType,
  MenuBundle,
  MenuItem,
  Order,
  OrderItem,
  OrderIssueType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PriceSensitivityAnalytics,
  Promotion,
  PromotionDiscountPreview,
  Role,
  TopItemSales,
} from "../shared/contracts.ts";

export class CategorySlugConflictError extends Error {
  constructor() {
    super("Category slug already exists");
    this.name = "CategorySlugConflictError";
  }
}

export class CategoryNotFoundError extends Error {
  constructor() {
    super("Category not found");
    this.name = "CategoryNotFoundError";
  }
}

export type UpdateOrderItemErrorCode =
  | "ORDER_NOT_FOUND"
  | "MENU_ITEM_NOT_FOUND"
  | "MENU_ITEM_UNAVAILABLE"
  | "MENU_VERSION_CHANGED"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_EDITABLE";

export type SubmitOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_EDITABLE"
  | "MENU_VERSION_CHANGED"
  | "PROMOTION_NOT_FOUND"
  | "PROMOTION_INACTIVE"
  | "PROMOTION_MIN_ORDER_NOT_MET"
  | "PROMOTION_NOT_STARTED"
  | "PROMOTION_EXPIRED"
  | "PROMOTION_USAGE_LIMIT_REACHED"
  | "INVALID_PROMOTION"
  | "EMPTY_ORDER";

export type UpdateOrderStatusErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_STATUS_TRANSITION"
  | "ORDER_STATUS_LOCKED";

export type UpdateOrderPaymentStatusErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_SUBMITTED";

export type CancelOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_CANCELLABLE"
  | "ORDER_ALREADY_CANCELLED";

export type UpdateOrderIssueErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_ISSUE_NOT_EDITABLE";

export type UpdateOrderRatingErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_COMPLETED";

export type CreateWalkInOrderErrorCode =
  | "EMPTY_ORDER"
  | "MENU_ITEM_NOT_FOUND"
  | "MENU_VERSION_CHANGED"
  | "MENU_ITEM_UNAVAILABLE"
  | "PROMOTION_NOT_FOUND"
  | "PROMOTION_INACTIVE"
  | "PROMOTION_MIN_ORDER_NOT_MET"
  | "PROMOTION_NOT_STARTED"
  | "PROMOTION_EXPIRED"
  | "PROMOTION_USAGE_LIMIT_REACHED"
  | "INVALID_PROMOTION";
export type CreateGuestOrderErrorCode = CreateWalkInOrderErrorCode;

export type CategoryStatusFilter = "active" | "inactive" | "all";
export type PromotionStatusFilter = "active" | "inactive" | "all";

export type GetCurrentMenuInput = {
  abTestGroup?: AbTestGroup;
};
export type AnalyticsDateRangeInput = {
  startDate?: string;
  endDate?: string;
};

export function applyBundlePricingToOrderItems(
  orderItems: OrderItem[],
  bundles: ReadonlyArray<MenuBundle>,
): OrderItem[] {
  const itemsByBundleId = new Map<number, OrderItem[]>();
  for (const orderItem of orderItems) {
    if (!orderItem.bundleId) continue;
    const group = itemsByBundleId.get(orderItem.bundleId) ?? [];
    group.push(orderItem);
    itemsByBundleId.set(orderItem.bundleId, group);
  }

  for (const [bundleId, bundledOrderItems] of itemsByBundleId.entries()) {
    const bundle = bundles.find(
      (candidate) => candidate.id === bundleId && candidate.isActive,
    );
    if (!bundle || bundle.price <= 0 || bundledOrderItems.length === 0) {
      continue;
    }

    const bundleItemByMenuItemId = new Map(
      bundle.items.map((bundleItem) => [bundleItem.menuItemId, bundleItem]),
    );
    const allItemsBelongToBundle = bundledOrderItems.every((orderItem) =>
      bundleItemByMenuItemId.has(orderItem.item.id),
    );
    if (!allItemsBelongToBundle) continue;
    const hasAllRequiredItems = bundle.items.every((bundleItem) => {
      const matchingOrderItem = bundledOrderItems.find(
        (orderItem) => orderItem.item.id === bundleItem.menuItemId,
      );
      return Boolean(
        matchingOrderItem && matchingOrderItem.qty >= bundleItem.qty,
      );
    });
    if (!hasAllRequiredItems) continue;

    const originalSubtotal = bundledOrderItems.reduce(
      (sum, orderItem) => sum + orderItem.item.price * orderItem.qty,
      0,
    );
    if (originalSubtotal <= 0) continue;

    const allocatedSubtotals = bundledOrderItems.map((orderItem) => ({
      orderItem,
      allocatedSubtotal: Math.floor(
        (bundle.price * orderItem.item.price * orderItem.qty) / originalSubtotal,
      ),
    }));

    const allocatedTotal = allocatedSubtotals.reduce(
      (sum, entry) => sum + entry.allocatedSubtotal,
      0,
    );
    const roundingRemainder = bundle.price - allocatedTotal;
    const lastEntry = allocatedSubtotals[allocatedSubtotals.length - 1];
    if (lastEntry) {
      lastEntry.allocatedSubtotal += roundingRemainder;
    }

    for (const entry of allocatedSubtotals) {
      if (entry.orderItem.qty <= 0) continue;
      const allocatedUnitPrice = Math.max(
        0,
        Math.round(entry.allocatedSubtotal / entry.orderItem.qty),
      );
      entry.orderItem.item = {
        ...entry.orderItem.item,
        price: allocatedUnitPrice,
      };
      entry.orderItem.bundleName = entry.orderItem.bundleName ?? bundle.name;
    }
  }

  return orderItems;
}

export type AppendAuditLogInput = {
  actorUserId?: string | null;
  actorName?: string | null;
  actorRoles?: Role[];
  action: AuditLogAction;
  targetType: AuditLogTargetType;
  targetId?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
};

export type GetAuditLogsInput = {
  limit?: number;
  action?: AuditLogAction;
  targetType?: AuditLogTargetType;
  startDate?: string;
  endDate?: string;
  actor?: string;
  targetId?: string;
};

export interface Store {
  init(): Promise<void>;

  // Menu / categories
  getMenu(): ReadonlyArray<MenuItem>;
  getCurrentMenu(input?: GetCurrentMenuInput): ReadonlyArray<MenuItem>;
  getMenuItemVersionHistoryById(menuId: number): ReadonlyArray<MenuItem>;
  createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    primaryCategoryId?: number;
    description: string;
    image_url: string;
    isAvailable?: boolean;
    displayOrder?: number;
    abTestGroup?: AbTestGroup | null;
  }): Promise<MenuItem>;
  updateMenuItem(
    menuId: number,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      primaryCategoryId?: number | null;
      description?: string;
      image_url?: string;
      isAvailable?: boolean;
      abTestGroup?: AbTestGroup | null;
      changeReason?: string;
      changedBy?: string;
    },
  ): Promise<MenuItem | null>;
  updateMenuItemDisplayOrder(
    menuId: number,
    displayOrder: number,
  ): Promise<MenuItem | null>;
  deleteMenuItem(menuId: number): Promise<MenuItem | null>;

  getCategories(input?: {
    status?: CategoryStatusFilter;
  }): ReadonlyArray<Category>;
  createCategory(input: {
    name: string;
    slug: string;
    description?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  }): Promise<Category>;
  updateCategory(
    categoryId: number,
    patch: {
      name?: string;
      slug?: string;
      description?: string | null;
      displayOrder?: number;
      isActive?: boolean;
    },
  ): Promise<Category | null>;
  deleteCategory(categoryId: number): Promise<Category | null>;
  addCategoryToMenuItem(
    menuId: number,
    categoryId: number,
  ): Promise<MenuItem | null>;
  removeCategoryFromMenuItem(
    menuId: number,
    categoryId: number,
  ): Promise<MenuItem | null>;

  getPromotions(input?: {
    status?: PromotionStatusFilter;
  }): ReadonlyArray<Promotion>;
  createPromotion(input: {
    code: string;
    discountType: DiscountType;
    discountValue: number;
    minOrderAmount?: number;
    startsAt?: string | null;
    endsAt?: string | null;
    usageLimit?: number | null;
  }): Promise<Promotion>;
  updatePromotion(
    promotionId: number,
    patch: {
      code?: string;
      discountType?: DiscountType;
      discountValue?: number;
      minOrderAmount?: number;
      startsAt?: string | null;
      endsAt?: string | null;
      usageLimit?: number | null;
      isActive?: boolean;
    },
  ): Promise<Promotion | null>;
  deletePromotion(promotionId: number): Promise<Promotion | null>;
  previewPromotionDiscount(input: {
    subtotal: number;
    promoCode?: string | null;
  }): PromotionDiscountPreview | null;

  getMenuBundles(): ReadonlyArray<MenuBundle>;
  getActiveMenuBundles(): ReadonlyArray<MenuBundle>;
  createMenuBundle(input: {
    name: string;
    description?: string;
    price: number;
    displayOrder?: number;
    isActive?: boolean;
    items: Array<{ menuItemId: number; qty: number }>;
  }): Promise<MenuBundle>;
  updateMenuBundle(
    bundleId: number,
    patch: {
      name?: string;
      description?: string;
      price?: number;
      displayOrder?: number;
      isActive?: boolean;
      items?: Array<{ menuItemId: number; qty: number }>;
    },
  ): Promise<MenuBundle | null>;
  deleteMenuBundle(bundleId: number): Promise<MenuBundle | null>;

  // Orders
  getOrders(): ReadonlyArray<Order>;
  getCurrentOrderByUserId(userId: string): Order | undefined;
  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order>;
  getOrderById(orderId: number): Order | undefined;
  createOrder(input: { userId: string }): Promise<Order>;
  createWalkInOrder(input: {
    staffUserId: string;
    orderSource?: "walk_in" | "phone";
    guestName?: string | null;
    guestPhone?: string | null;
    items: Array<{
      itemId: number;
      qty: number;
      menuItemVersion?: number;
      memberName?: string | null;
      bundleId?: number | null;
      bundleName?: string | null;
    }>;
    fulfillmentType: FulfillmentType;
    customerNote?: string | null;
    pickupTime?: string | null;
    paymentMethod: PaymentMethod;
    paymentStatus?: PaymentStatus;
    promoCode?: string | null;
    abTestGroup?: AbTestGroup;
    isGroupOrder?: boolean;
    groupName?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
  }): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: CreateWalkInOrderErrorCode; itemName?: string }
  >;
  createGuestOrder(input: {
    guestName: string;
    guestPhone: string;
    items: Array<{
      itemId: number;
      qty: number;
      menuItemVersion?: number;
      memberName?: string | null;
      bundleId?: number | null;
      bundleName?: string | null;
    }>;
    fulfillmentType: FulfillmentType;
    customerNote?: string | null;
    pickupTime?: string | null;
    paymentMethod: PaymentMethod;
    promoCode?: string | null;
    isGroupOrder?: boolean;
    groupName?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
  }): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: CreateGuestOrderErrorCode; itemName?: string }
  >;

  // Order operations
  updateOrderItem(
    orderId: number,
    input: {
      userId: string;
      itemId: number;
      qty: number;
    },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderItemErrorCode; itemName?: string }
  >;
  validateOrderItemVersions(
    orderId: number,
  ): { ok: true } | { ok: false; code: "MENU_VERSION_CHANGED"; itemName?: string };
  submitOrder(
    orderId: number,
    input: {
      userId: string;
      fulfillmentType: FulfillmentType;
      customerNote?: string | null;
      pickupTime?: string | null;
      paymentMethod: PaymentMethod;
      paymentStatus?: PaymentStatus;
      promoCode?: string | null;
      abTestGroup?: AbTestGroup;
      isGroupOrder?: boolean;
      groupName?: string | null;
      contactName?: string | null;
      contactPhone?: string | null;
      itemCustomizations?: Array<{
        itemId: number;
        memberName?: string | null;
        bundleId?: number | null;
        bundleName?: string | null;
      }>;
    },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: SubmitOrderErrorCode; itemName?: string }
  >;
  updateOrderStatus(
    orderId: number,
    input: {
      status: OrderStatus;
      allowAnyTransition?: boolean;
    },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderStatusErrorCode }
  >;
  updateOrderPaymentStatus(
    orderId: number,
    input: { paymentStatus: PaymentStatus },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderPaymentStatusErrorCode }
  >;
  cancelOrder(
    orderId: number,
    input: {
      userId: string;
      allowManagerCancel?: boolean;
    },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: CancelOrderErrorCode }
  >;
  setOrderIssue(
    orderId: number,
    input: {
      issueType: OrderIssueType;
      issueNote?: string | null;
      reportedBy: string;
      allowManagerIssue?: boolean;
    },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderIssueErrorCode }
  >;
  clearOrderIssue(
    orderId: number,
    input: { userId: string },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderIssueErrorCode }
  >;
  updateOrderRating(
    orderId: number,
    input: {
      userId: string;
      rating: number;
      ratingComment?: string | null;
    },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderRatingErrorCode }
  >;

  // Analytics
  getCategorySalesAnalytics(
    input?: AnalyticsDateRangeInput,
  ): ReadonlyArray<CategorySales>;
  getTopItemSalesAnalytics(
    limit?: number,
    input?: AnalyticsDateRangeInput,
  ): ReadonlyArray<TopItemSales>;
  getAnalyticsSummary(input?: AnalyticsDateRangeInput): AnalyticsSummary;
  getAnalyticsTrends(input?: AnalyticsDateRangeInput): AnalyticsTrends;
  getAnalyticsInsights(input?: AnalyticsDateRangeInput): AnalyticsInsights;
  getPriceSensitivityAnalytics(
    input?: AnalyticsDateRangeInput,
  ): PriceSensitivityAnalytics;
  getAbTestAnalytics(
    input?: AnalyticsDateRangeInput,
  ): ReadonlyArray<AbTestAnalyticsItem>;

  // Audit logs
  appendAuditLog(input: AppendAuditLogInput): Promise<void>;
  getAuditLogs(input?: GetAuditLogsInput): ReadonlyArray<AuditLog>;
}
