import type {
  Category,
  CategorySales,
  MenuItem,
  Order,
  OrderStatus,
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
    input: { userId: string },
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

  getCategorySalesAnalytics(): ReadonlyArray<CategorySales>;
  getTopItemSalesAnalytics(limit?: number): ReadonlyArray<TopItemSales>;
}
