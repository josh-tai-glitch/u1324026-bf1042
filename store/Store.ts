import type {
  Category,
  CategorySales,
  AnalyticsSummary,
  FulfillmentType,
  MenuItem,
  Order,
  OrderIssueType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
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
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_EDITABLE";

export type SubmitOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_EDITABLE"
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
  | "MENU_ITEM_UNAVAILABLE";

export type CategoryStatusFilter = "active" | "inactive" | "all";

export interface Store {
  init(): Promise<void>;

  getMenu(): ReadonlyArray<MenuItem>;
  createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    primaryCategoryId?: number;
    description: string;
    image_url: string;
    isAvailable?: boolean;
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
    },
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

  getOrders(): ReadonlyArray<Order>;
  getCurrentOrderByUserId(userId: string): Order | undefined;
  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order>;
  getOrderById(orderId: number): Order | undefined;
  createOrder(input: { userId: string }): Promise<Order>;
  createWalkInOrder(input: {
    staffUserId: string;
    guestName?: string | null;
    items: Array<{ itemId: number; qty: number }>;
    fulfillmentType: FulfillmentType;
    customerNote?: string | null;
    pickupTime?: string | null;
    paymentMethod: PaymentMethod;
    paymentStatus?: PaymentStatus;
  }): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: CreateWalkInOrderErrorCode }
  >;
  updateOrderItem(
    orderId: number,
    input: {
      userId: string;
      itemId: number;
      qty: number;
    },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: UpdateOrderItemErrorCode }
  >;
  submitOrder(
    orderId: number,
    input: {
      userId: string;
      fulfillmentType: FulfillmentType;
      customerNote?: string | null;
      pickupTime?: string | null;
      paymentMethod: PaymentMethod;
      paymentStatus?: PaymentStatus;
    },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: SubmitOrderErrorCode }
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

  getCategorySalesAnalytics(): ReadonlyArray<CategorySales>;
  getTopItemSalesAnalytics(limit?: number): ReadonlyArray<TopItemSales>;
  getAnalyticsSummary(): AnalyticsSummary;
}
