import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type {
  AnalyticsSummary,
  Category,
  CategorySales,
  FulfillmentType,
  MenuItem,
  Order,
  OrderIssueType,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TopItemSales,
} from "../../shared/contracts.ts";
import { db } from "../../db/client.ts";
import {
  categoriesTable,
  menuItemCategoriesTable,
  menuItemsTable,
  orderItemsTable,
  ordersTable,
} from "../../db/schema.ts";
import {
  CategoryNotFoundError,
  CategorySlugConflictError,
  type CategoryStatusFilter,
  type Store,
} from "../Store.ts";

interface PgStoreOptions {
  dataFilePath?: string;
}

// Seed 用的內部型別（來自 data/store.json）
// V9: 只播 menu，users 由 Better Auth 管理，orders 需真實 session 才能建立
interface SeedData {
  menu?: MenuItem[];
  orders?: Array<{
    id: number;
    userId: string | number;
    status: OrderStatus;
    total: number;
    createdAt: string;
    submittedAt?: string;
    fulfillmentType?: FulfillmentType;
    customerNote?: string | null;
    pickupTime?: string | null;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    issueType?: OrderIssueType | null;
    issueNote?: string | null;
    issueReportedBy?: string | null;
    issueReportedAt?: string | null;
    orderSource?: "customer" | "walk_in";
    guestName?: string | null;
    createdByStaffId?: string | null;
    items: Array<{ item: MenuItem; qty: number }>;
  }>;
}

function calculateTotal(items: ReadonlyArray<OrderItem>): number {
  return items.reduce((sum, oi) => sum + oi.item.price * oi.qty, 0);
}

const validOrderStatuses = [
  "pending",
  "submitted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] satisfies OrderStatus[];

const revenueOrderStatuses = [
  "submitted",
  "preparing",
  "ready",
  "completed",
] satisfies OrderStatus[];

const visibleOrderHistoryStatuses = [
  "submitted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] satisfies OrderStatus[];

const nextOrderStatusByStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  submitted: "preparing",
  preparing: "ready",
  ready: "completed",
};

function toOrderStatus(value: string): OrderStatus {
  return validOrderStatuses.includes(value as OrderStatus)
    ? (value as OrderStatus)
    : "pending";
}

function toOrderIssueType(value: unknown): OrderIssueType | null {
  return value === "out_of_stock" ||
    value === "need_customer_confirmation" ||
    value === "special_request_problem" ||
    value === "other"
    ? value
    : null;
}

export class PgStore implements Store {
  private readonly dataFilePath: string;
  private menu: MenuItem[] = [];
  private categories: Category[] = [];
  private allCategories: Category[] = [];
  private orders: Order[] = [];

  constructor(options: PgStoreOptions = {}) {
    this.dataFilePath = options.dataFilePath ?? "./data/store.json";
  }

  async init(): Promise<void> {
    await db.execute(sql`select 1`);
    await this.seedFromJsonIfEmpty();
    await this.reloadFromDatabase();
  }

  // ── Menu ────────────────────────────────────────────────────

  getMenu(): ReadonlyArray<MenuItem> {
    return this.menu;
  }

  getCategories(input: { status?: CategoryStatusFilter } = {}): ReadonlyArray<Category> {
    const status = input.status ?? "active";
    if (status === "all") return this.allCategories;
    return this.allCategories.filter((category) =>
      status === "active" ? category.isActive : !category.isActive,
    );
  }

  async createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    primaryCategoryId?: number;
    description: string;
    image_url: string;
  }): Promise<MenuItem> {
    const primaryCategory =
      input.primaryCategoryId !== undefined
        ? await this.findActiveCategory(input.primaryCategoryId)
        : null;
    if (input.primaryCategoryId !== undefined && !primaryCategory) {
      throw new CategoryNotFoundError();
    }

    const [inserted] = await db
      .insert(menuItemsTable)
      .values({
        name: input.name,
        price: input.price,
        category: primaryCategory?.name ?? input.category,
        description: input.description,
        imageUrl: input.image_url,
        primaryCategoryId: primaryCategory?.id ?? null,
        primaryCategoryName: primaryCategory?.name ?? null,
      })
      .returning();

    if (!inserted) throw new Error("Failed to insert menu item");

    if (primaryCategory) {
      await this.ensureActiveMenuCategoryLink(inserted.id, primaryCategory.id);
    }

    await this.reloadFromDatabase();
    const created = this.menu.find((item) => item.id === inserted.id);
    if (!created) throw new Error("Failed to load created menu item");
    return created;
  }

  async updateMenuItem(
    menuId: number,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      primaryCategoryId?: number | null;
      description?: string;
      image_url?: string;
    },
  ): Promise<MenuItem | null> {
    let primaryCategory: Category | null = null;
    const shouldUpdatePrimary = patch.primaryCategoryId !== undefined;
    if (typeof patch.primaryCategoryId === "number") {
      primaryCategory = await this.findActiveCategory(patch.primaryCategoryId);
      if (!primaryCategory) throw new CategoryNotFoundError();
    }

    const [updated] = await db
      .update(menuItemsTable)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.price !== undefined ? { price: patch.price } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(primaryCategory !== null ? { category: primaryCategory.name } : {}),
        ...(shouldUpdatePrimary
          ? {
              primaryCategoryId: primaryCategory?.id ?? null,
              primaryCategoryName: primaryCategory?.name ?? null,
            }
          : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.image_url !== undefined ? { imageUrl: patch.image_url } : {}),
      })
      .where(eq(menuItemsTable.id, menuId))
      .returning();

    if (!updated) return null;

    if (primaryCategory) {
      await this.ensureActiveMenuCategoryLink(menuId, primaryCategory.id);
    }

    await this.reloadFromDatabase();
    return this.menu.find((item) => item.id === menuId) ?? null;
  }

  async deleteMenuItem(menuId: number): Promise<MenuItem | null> {
    const [removed] = await db
      .delete(menuItemsTable)
      .where(eq(menuItemsTable.id, menuId))
      .returning();

    if (!removed) return null;

    const removedItem: MenuItem = {
      id: removed.id,
      name: removed.name,
      price: removed.price,
      category: removed.category,
      primary_category_id: removed.primaryCategoryId,
      primary_category_name: removed.primaryCategoryName,
      categories:
        this.menu.find((item) => item.id === menuId)?.categories ?? [],
      description: removed.description,
      image_url: removed.imageUrl,
    };

    const idx = this.menu.findIndex((item) => item.id === menuId);
    if (idx !== -1) this.menu.splice(idx, 1);

    return removedItem;
  }

  async createCategory(input: {
    name: string;
    slug: string;
    description?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  }): Promise<Category> {
    const [existing] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, input.slug))
      .limit(1);

    if (existing) {
      throw new CategorySlugConflictError();
    }

    const [inserted] = await db
      .insert(categoriesTable)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        displayOrder: input.displayOrder ?? 0,
        isActive: input.isActive ?? true,
      })
      .returning();

    if (!inserted) throw new Error("Failed to insert category");

    const created = this.toCategory(inserted);
    this.allCategories.push(created);
    this.allCategories.sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
    );
    if (created.isActive) {
      this.categories.push(created);
      this.categories.sort(
        (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
      );
    }
    return created;
  }

  async updateCategory(
    categoryId: number,
    patch: {
      name?: string;
      slug?: string;
      description?: string | null;
      displayOrder?: number;
      isActive?: boolean;
    },
  ): Promise<Category | null> {
    if (patch.slug !== undefined) {
      const [existing] = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.slug, patch.slug),
            ne(categoriesTable.id, categoryId),
          ),
        )
        .limit(1);

      if (existing) {
        throw new CategorySlugConflictError();
      }
    }

    const [updated] = await db
      .update(categoriesTable)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.displayOrder !== undefined
          ? { displayOrder: patch.displayOrder }
          : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(categoriesTable.id, categoryId))
      .returning();

    if (!updated) return null;

    if (updated.isActive) {
      await db
        .update(menuItemsTable)
        .set({ primaryCategoryName: updated.name })
        .where(eq(menuItemsTable.primaryCategoryId, categoryId));
    } else {
      await db
        .update(menuItemsTable)
        .set({ primaryCategoryId: null, primaryCategoryName: null })
        .where(eq(menuItemsTable.primaryCategoryId, categoryId));
    }

    await this.reloadFromDatabase();
    return this.toCategory(updated);
  }

  async deleteCategory(categoryId: number): Promise<Category | null> {
    const [updated] = await db
      .update(categoriesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(categoriesTable.id, categoryId))
      .returning();

    if (!updated) return null;

    await db
      .update(menuItemsTable)
      .set({ primaryCategoryId: null, primaryCategoryName: null })
      .where(eq(menuItemsTable.primaryCategoryId, categoryId));

    await this.reloadFromDatabase();
    return this.toCategory(updated);
  }

  async addCategoryToMenuItem(
    menuId: number,
    categoryId: number,
  ): Promise<MenuItem | null> {
    const menuItem = this.menu.find((item) => item.id === menuId);
    const category = this.categories.find(
      (item) => item.id === categoryId && item.isActive,
    );
    if (!menuItem || !category) return null;

    const [existingActive] = await db
      .select()
      .from(menuItemCategoriesTable)
      .where(
        and(
          eq(menuItemCategoriesTable.menuItemId, menuId),
          eq(menuItemCategoriesTable.categoryId, categoryId),
          isNull(menuItemCategoriesTable.removedAt),
        ),
      )
      .limit(1);

    if (!existingActive) {
      await db.insert(menuItemCategoriesTable).values({
        menuItemId: menuId,
        categoryId,
      });
    }

    if (!menuItem.primary_category_id) {
      await db
        .update(menuItemsTable)
        .set({
          primaryCategoryId: category.id,
          primaryCategoryName: category.name,
        })
        .where(eq(menuItemsTable.id, menuId));
    }

    await this.reloadFromDatabase();
    return this.menu.find((item) => item.id === menuId) ?? null;
  }

  async removeCategoryFromMenuItem(
    menuId: number,
    categoryId: number,
  ): Promise<MenuItem | null> {
    const menuItem = this.menu.find((item) => item.id === menuId);
    const category = this.categories.find((item) => item.id === categoryId);
    if (!menuItem || !category) return null;

    await db
      .update(menuItemCategoriesTable)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(menuItemCategoriesTable.menuItemId, menuId),
          eq(menuItemCategoriesTable.categoryId, categoryId),
          isNull(menuItemCategoriesTable.removedAt),
        ),
      );

    if (menuItem.primary_category_id === categoryId) {
      await db
        .update(menuItemsTable)
        .set({ primaryCategoryId: null, primaryCategoryName: null })
        .where(eq(menuItemsTable.id, menuId));
    }

    await this.reloadFromDatabase();
    return this.menu.find((item) => item.id === menuId) ?? null;
  }

  // ── Orders ──────────────────────────────────────────────────

  getOrders(): ReadonlyArray<Order> {
    return this.orders;
  }

  getCurrentOrderByUserId(userId: string): Order | undefined {
    const pendingOrders = this.orders.filter(
      (o) => o.userId === userId && o.status === "pending",
    );

    if (pendingOrders.length === 0) return undefined;

    // 取最新 pending（id 越大越新），避免使用到舊的空購物車訂單。
    return pendingOrders.reduce((latest, current) =>
      current.id > latest.id ? current : latest,
    );
  }

  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order> {
    return this.orders
      .filter(
        (o) =>
          o.userId === userId && visibleOrderHistoryStatuses.includes(o.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrderById(orderId: number): Order | undefined {
    return this.orders.find((o) => o.id === orderId);
  }

  async createOrder(input: { userId: string }): Promise<Order> {
    const existingOrder = this.getCurrentOrderByUserId(input.userId);
    if (existingOrder) {
      return existingOrder;
    }

    const createdAt = new Date();

    const [inserted] = await db
      .insert(ordersTable)
      .values({ userId: input.userId, status: "pending", total: 0, createdAt })
      .returning();

    if (!inserted) throw new Error("Failed to create order");

    const order: Order = {
      id: inserted.id,
      userId: input.userId,
      items: [],
      total: inserted.total,
      status: "pending",
      orderSource: "customer",
      guestName: null,
      createdByStaffId: null,
      fulfillmentType: "takeout",
      customerNote: null,
      pickupTime: null,
      paymentMethod: "cash",
      paymentStatus: "unpaid",
      issueType: null,
      issueNote: null,
      issueReportedBy: null,
      issueReportedAt: null,
      rating: null,
      ratingComment: null,
      ratedAt: null,
      createdAt:
        inserted.createdAt instanceof Date
          ? inserted.createdAt.toISOString()
          : new Date(inserted.createdAt).toISOString(),
    };

    this.orders.push(order);
    return order;
  }

  async createWalkInOrder(input: {
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
    | { ok: false; code: "EMPTY_ORDER" | "MENU_ITEM_NOT_FOUND" }
  > {
    const requestedItems = input.items.filter((item) => item.qty > 0);
    if (requestedItems.length === 0) {
      return { ok: false, code: "EMPTY_ORDER" };
    }

    const orderItems: OrderItem[] = [];
    for (const requestedItem of requestedItems) {
      const menuItem = this.menu.find((item) => item.id === requestedItem.itemId);
      if (!menuItem) {
        return { ok: false, code: "MENU_ITEM_NOT_FOUND" };
      }
      orderItems.push({ item: { ...menuItem }, qty: requestedItem.qty });
    }

    const now = new Date();
    const submittedAt = now.toISOString();
    const pickupTime = input.pickupTime ? new Date(input.pickupTime) : null;
    const paymentStatus = input.paymentStatus ?? "unpaid";
    const total = calculateTotal(orderItems);

    const [inserted] = await db
      .insert(ordersTable)
      .values({
        userId: input.staffUserId,
        total,
        status: "submitted",
        orderSource: "walk_in",
        guestName: input.guestName?.trim() || null,
        createdByStaffId: input.staffUserId,
        fulfillmentType: input.fulfillmentType,
        customerNote: input.customerNote?.trim() || null,
        pickupTime,
        paymentMethod: input.paymentMethod,
        paymentStatus,
        createdAt: now,
        submittedAt: now,
      })
      .returning();

    if (!inserted) throw new Error("Failed to create walk-in order");

    await db.insert(orderItemsTable).values(
      orderItems.map((orderItem) => ({
        orderId: inserted.id,
        itemId: orderItem.item.id,
        name: orderItem.item.name,
        price: orderItem.item.price,
        category: orderItem.item.category,
        description: orderItem.item.description,
        imageUrl: orderItem.item.image_url,
        qty: orderItem.qty,
      })),
    );

    const order: Order = {
      id: inserted.id,
      userId: input.staffUserId,
      items: orderItems,
      total,
      status: "submitted",
      orderSource: "walk_in",
      guestName: input.guestName?.trim() || null,
      createdByStaffId: input.staffUserId,
      fulfillmentType: input.fulfillmentType,
      customerNote: input.customerNote?.trim() || null,
      pickupTime: pickupTime ? pickupTime.toISOString() : null,
      paymentMethod: input.paymentMethod,
      paymentStatus,
      issueType: null,
      issueNote: null,
      issueReportedBy: null,
      issueReportedAt: null,
      rating: null,
      ratingComment: null,
      ratedAt: null,
      createdAt: submittedAt,
      submittedAt,
    };

    this.orders.unshift(order);
    return { ok: true, order };
  }

  async updateOrderItem(
    orderId: number,
    input: { userId: string; itemId: number; qty: number },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "MENU_ITEM_NOT_FOUND"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_EDITABLE";
      }
  > {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.userId !== input.userId)
      return { ok: false, code: "ORDER_NOT_OWNED" };
    if (order.status !== "pending")
      return { ok: false, code: "ORDER_NOT_EDITABLE" };

    const menuItem = this.menu.find((item) => item.id === input.itemId);
    if (!menuItem) return { ok: false, code: "MENU_ITEM_NOT_FOUND" };

    const existingIdx = order.items.findIndex(
      (oi) => oi.item.id === input.itemId,
    );

    if (existingIdx !== -1) {
      if (input.qty === 0) {
        await db
          .delete(orderItemsTable)
          .where(
            and(
              eq(orderItemsTable.orderId, orderId),
              eq(orderItemsTable.itemId, input.itemId),
            ),
          );
        order.items.splice(existingIdx, 1);
      } else {
        await db
          .update(orderItemsTable)
          .set({ qty: input.qty })
          .where(
            and(
              eq(orderItemsTable.orderId, orderId),
              eq(orderItemsTable.itemId, input.itemId),
            ),
          );
        const target = order.items[existingIdx];
        if (target) target.qty = input.qty;
      }
    } else if (input.qty > 0) {
      await db.insert(orderItemsTable).values({
        orderId,
        itemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        category: menuItem.category,
        description: menuItem.description,
        imageUrl: menuItem.image_url,
        qty: input.qty,
      });
      order.items.push({ item: { ...menuItem }, qty: input.qty });
    }

    order.total = calculateTotal(order.items);
    await db
      .update(ordersTable)
      .set({ total: order.total })
      .where(eq(ordersTable.id, orderId));

    return { ok: true, order };
  }

  async submitOrder(
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
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_EDITABLE"
          | "EMPTY_ORDER";
      }
  > {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.userId !== input.userId)
      return { ok: false, code: "ORDER_NOT_OWNED" };
    if (order.status !== "pending")
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    if (order.items.length === 0) return { ok: false, code: "EMPTY_ORDER" };

    const submittedAt = new Date().toISOString();
    const pickupTime = input.pickupTime ? new Date(input.pickupTime) : null;
    const paymentStatus = input.paymentStatus ?? "unpaid";

    await db
      .update(ordersTable)
      .set({
        status: "submitted",
        submittedAt: new Date(submittedAt),
        fulfillmentType: input.fulfillmentType,
        customerNote: input.customerNote?.trim() || null,
        pickupTime,
        paymentMethod: input.paymentMethod,
        paymentStatus,
      })
      .where(eq(ordersTable.id, orderId));

    order.status = "submitted";
    order.submittedAt = submittedAt;
    order.fulfillmentType = input.fulfillmentType;
    order.customerNote = input.customerNote?.trim() || null;
    order.pickupTime = pickupTime ? pickupTime.toISOString() : null;
    order.paymentMethod = input.paymentMethod;
    order.paymentStatus = paymentStatus;

    return { ok: true, order };
  }

  async updateOrderStatus(
    orderId: number,
    input: { status: OrderStatus; allowAnyTransition?: boolean },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "INVALID_STATUS_TRANSITION"
          | "ORDER_STATUS_LOCKED";
      }
  > {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };

    if (order.status === "completed" && !input.allowAnyTransition) {
      return { ok: false, code: "ORDER_STATUS_LOCKED" };
    }

    const expectedNextStatus = nextOrderStatusByStatus[order.status];
    if (
      !input.allowAnyTransition &&
      (expectedNextStatus === undefined || input.status !== expectedNextStatus)
    ) {
      return { ok: false, code: "INVALID_STATUS_TRANSITION" };
    }

    await db
      .update(ordersTable)
      .set({ status: input.status })
      .where(eq(ordersTable.id, orderId));

    order.status = input.status;
    return { ok: true, order };
  }

  async updateOrderPaymentStatus(
    orderId: number,
    input: { paymentStatus: PaymentStatus },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: "ORDER_NOT_FOUND" | "ORDER_NOT_SUBMITTED" }
  > {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.status === "pending") {
      return { ok: false, code: "ORDER_NOT_SUBMITTED" };
    }

    await db
      .update(ordersTable)
      .set({ paymentStatus: input.paymentStatus })
      .where(eq(ordersTable.id, orderId));

    order.paymentStatus = input.paymentStatus;
    return { ok: true, order };
  }

  async cancelOrder(
    orderId: number,
    input: { userId: string; allowManagerCancel?: boolean },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_CANCELLABLE"
          | "ORDER_ALREADY_CANCELLED";
      }
  > {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.status === "cancelled") {
      return { ok: false, code: "ORDER_ALREADY_CANCELLED" };
    }
    if (order.status === "pending" || order.status === "completed") {
      return { ok: false, code: "ORDER_NOT_CANCELLABLE" };
    }

    if (!input.allowManagerCancel) {
      if (order.userId !== input.userId) {
        return { ok: false, code: "ORDER_NOT_OWNED" };
      }
      if (order.status !== "submitted") {
        return { ok: false, code: "ORDER_NOT_CANCELLABLE" };
      }
    } else if (
      order.status !== "submitted" &&
      order.status !== "preparing" &&
      order.status !== "ready"
    ) {
      return { ok: false, code: "ORDER_NOT_CANCELLABLE" };
    }

    await db
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, orderId));

    order.status = "cancelled";
    return { ok: true, order };
  }

  async setOrderIssue(
    orderId: number,
    input: {
      issueType: OrderIssueType;
      issueNote?: string | null;
      reportedBy: string;
      allowManagerIssue?: boolean;
    },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: "ORDER_NOT_FOUND" | "ORDER_ISSUE_NOT_EDITABLE" }
  > {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.status !== "submitted" && order.status !== "preparing") {
      return { ok: false, code: "ORDER_ISSUE_NOT_EDITABLE" };
    }

    const reportedAt = new Date();
    const issueNote = input.issueNote?.trim() || null;

    await db
      .update(ordersTable)
      .set({
        issueType: input.issueType,
        issueNote,
        issueReportedBy: input.reportedBy,
        issueReportedAt: reportedAt,
      })
      .where(eq(ordersTable.id, orderId));

    order.issueType = input.issueType;
    order.issueNote = issueNote;
    order.issueReportedBy = input.reportedBy;
    order.issueReportedAt = reportedAt.toISOString();
    return { ok: true, order };
  }

  async clearOrderIssue(
    orderId: number,
    _input: { userId: string },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: "ORDER_NOT_FOUND" | "ORDER_ISSUE_NOT_EDITABLE" }
  > {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (
      order.status === "pending" ||
      order.status === "completed" ||
      order.status === "cancelled"
    ) {
      return { ok: false, code: "ORDER_ISSUE_NOT_EDITABLE" };
    }

    await db
      .update(ordersTable)
      .set({
        issueType: null,
        issueNote: null,
        issueReportedBy: null,
        issueReportedAt: null,
      })
      .where(eq(ordersTable.id, orderId));

    order.issueType = null;
    order.issueNote = null;
    order.issueReportedBy = null;
    order.issueReportedAt = null;
    return { ok: true, order };
  }

  async updateOrderRating(
    orderId: number,
    input: {
      userId: string;
      rating: number;
      ratingComment?: string | null;
    },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code: "ORDER_NOT_FOUND" | "ORDER_NOT_OWNED" | "ORDER_NOT_COMPLETED";
      }
  > {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.userId !== input.userId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }
    if (order.status !== "completed") {
      return { ok: false, code: "ORDER_NOT_COMPLETED" };
    }

    const safeRating = Math.max(1, Math.min(5, Math.trunc(input.rating)));
    const ratingComment = input.ratingComment?.trim() || null;
    const ratedAt = new Date();

    await db
      .update(ordersTable)
      .set({
        rating: safeRating,
        ratingComment,
        ratedAt,
      })
      .where(eq(ordersTable.id, orderId));

    order.rating = safeRating;
    order.ratingComment = ratingComment;
    order.ratedAt = ratedAt.toISOString();
    return { ok: true, order };
  }

  getCategorySalesAnalytics(): ReadonlyArray<CategorySales> {
    const salesByCategory = new Map<
      string,
      { quantity: number; revenue: number; orderIds: Set<number> }
    >();

    for (const order of this.orders) {
      if (!revenueOrderStatuses.includes(order.status)) continue;

      for (const orderItem of order.items) {
        const category = orderItem.item.category || "Uncategorized";
        const sales = salesByCategory.get(category) ?? {
          quantity: 0,
          revenue: 0,
          orderIds: new Set<number>(),
        };
        sales.quantity += orderItem.qty;
        sales.revenue += orderItem.item.price * orderItem.qty;
        sales.orderIds.add(order.id);
        salesByCategory.set(category, sales);
      }
    }

    return Array.from(salesByCategory.entries())
      .map(([category, sales]) => ({
        category,
        quantity: sales.quantity,
        revenue: sales.revenue,
        orderCount: sales.orderIds.size,
      }))
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.quantity - a.quantity ||
          a.category.localeCompare(b.category),
      );
  }

  getTopItemSalesAnalytics(limit = 10): ReadonlyArray<TopItemSales> {
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
    const salesByItem = new Map<
      string,
      {
        itemId: number;
        name: string;
        category: string;
        quantity: number;
        revenue: number;
        orderIds: Set<number>;
      }
    >();

    for (const order of this.orders) {
      if (!revenueOrderStatuses.includes(order.status)) continue;

      for (const orderItem of order.items) {
        const key = `${orderItem.item.id}:${orderItem.item.name}:${orderItem.item.category}`;
        const sales = salesByItem.get(key) ?? {
          itemId: orderItem.item.id,
          name: orderItem.item.name,
          category: orderItem.item.category,
          quantity: 0,
          revenue: 0,
          orderIds: new Set<number>(),
        };
        sales.quantity += orderItem.qty;
        sales.revenue += orderItem.item.price * orderItem.qty;
        sales.orderIds.add(order.id);
        salesByItem.set(key, sales);
      }
    }

    return Array.from(salesByItem.values())
      .map((sales) => ({
        itemId: sales.itemId,
        name: sales.name,
        category: sales.category,
        quantity: sales.quantity,
        revenue: sales.revenue,
        orderCount: sales.orderIds.size,
      }))
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.quantity - a.quantity ||
          a.name.localeCompare(b.name),
      )
      .slice(0, safeLimit);
  }

  // ── Private ─────────────────────────────────────────────────

  getAnalyticsSummary(): AnalyticsSummary {
    const today = new Date().toLocaleDateString();
    const formalOrders = this.orders.filter((order) => order.status !== "pending");
    const revenueOrders = this.orders.filter((order) =>
      revenueOrderStatuses.includes(order.status),
    );
    const ratedOrders = this.orders.filter((order) => order.rating !== null);
    const totalRevenue = revenueOrders.reduce(
      (sum, order) => sum + order.total,
      0,
    );
    const todayRevenueOrders = revenueOrders.filter((order) => {
      const date = new Date(order.submittedAt ?? order.createdAt);
      return (
        !Number.isNaN(date.getTime()) && date.toLocaleDateString() === today
      );
    });
    const ratingsTotal = ratedOrders.reduce(
      (sum, order) => sum + (order.rating ?? 0),
      0,
    );

    const summary: AnalyticsSummary = {
      totalRevenue,
      revenueOrderCount: revenueOrders.length,
      averageOrderValue:
        revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0,
      todayRevenue: todayRevenueOrders.reduce(
        (sum, order) => sum + order.total,
        0,
      ),
      todayOrderCount: todayRevenueOrders.length,
      cancellationCount: this.orders.filter(
        (order) => order.status === "cancelled",
      ).length,
      averageRating:
        ratedOrders.length > 0 ? ratingsTotal / ratedOrders.length : null,
      ratingsCount: ratedOrders.length,
      paymentMethods: { cash: 0, card: 0, online: 0 },
      paymentStatuses: { paid: 0, unpaid: 0 },
      orderStatuses: {
        submitted: 0,
        preparing: 0,
        ready: 0,
        completed: 0,
        cancelled: 0,
      },
      orderSources: { customer: 0, walk_in: 0 },
    };

    for (const order of formalOrders) {
      summary.paymentMethods[order.paymentMethod] += 1;
      summary.paymentStatuses[order.paymentStatus] += 1;
      if (order.status !== "pending") {
        summary.orderStatuses[order.status] += 1;
      }
      summary.orderSources[order.orderSource] += 1;
    }

    return summary;
  }

  private async findActiveCategory(categoryId: number): Promise<Category | null> {
    const [row] = await db
      .select()
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, categoryId),
          eq(categoriesTable.isActive, true),
        ),
      )
      .limit(1);

    return row ? this.toCategory(row) : null;
  }

  private async ensureActiveMenuCategoryLink(
    menuId: number,
    categoryId: number,
  ): Promise<void> {
    const [existingActive] = await db
      .select({ id: menuItemCategoriesTable.id })
      .from(menuItemCategoriesTable)
      .where(
        and(
          eq(menuItemCategoriesTable.menuItemId, menuId),
          eq(menuItemCategoriesTable.categoryId, categoryId),
          isNull(menuItemCategoriesTable.removedAt),
        ),
      )
      .limit(1);

    if (existingActive) return;

    await db.insert(menuItemCategoriesTable).values({
      menuItemId: menuId,
      categoryId,
    });
  }

  private async seedFromJsonIfEmpty(): Promise<void> {
    const [countRow] = await db
      .select({ value: sql<number>`count(*)` })
      .from(menuItemsTable);

    if (Number(countRow?.value ?? 0) > 0) return;

    const file = Bun.file(this.dataFilePath);
    if (!(await file.exists())) return;

    const parsed = JSON.parse(await file.text()) as SeedData;
    const menu = Array.isArray(parsed.menu) ? parsed.menu : [];

    if (menu.length > 0) {
      await db.insert(menuItemsTable).values(
        menu.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          category: item.category,
          description: item.description,
          imageUrl: item.image_url,
        })),
      );
    }

    // V9: 不再播 orders seed data（orders 的 user_id FK 指向 Better Auth user 表，
    // seed JSON 中的舊 userId 在 bf_v9.user 不存在，強制播入會觸發 FK violation）

    const schema = process.env.PG_SCHEMA ?? "public";
    await db.execute(
      sql.raw(
        `select setval('${schema}.menu_items_id_seq', coalesce((select max(id) from ${schema}.menu_items), 1), true)`,
      ),
    );
  }

  private async reloadFromDatabase(): Promise<void> {
    const categoryRows = await db
      .select()
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.displayOrder), asc(categoriesTable.id));

    const menuRows = await db
      .select()
      .from(menuItemsTable)
      .orderBy(asc(menuItemsTable.id));

    const menuCategoryRows = await db
      .select({
        menuItemId: menuItemCategoriesTable.menuItemId,
        category: categoriesTable,
      })
      .from(menuItemCategoriesTable)
      .innerJoin(
        categoriesTable,
        eq(menuItemCategoriesTable.categoryId, categoriesTable.id),
      )
      .where(
        and(
          isNull(menuItemCategoriesTable.removedAt),
          eq(categoriesTable.isActive, true),
        ),
      )
      .orderBy(
        asc(categoriesTable.displayOrder),
        asc(categoriesTable.id),
        asc(menuItemCategoriesTable.id),
      );

    const orderRows = await db
      .select()
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id));

    const orderItemRows = await db
      .select()
      .from(orderItemsTable)
      .orderBy(asc(orderItemsTable.id));

    this.allCategories = categoryRows.map((row) => this.toCategory(row));
    this.categories = this.allCategories.filter((category) => category.isActive);

    const categoriesByMenuId = new Map<number, Category[]>();
    for (const row of menuCategoryRows) {
      const categories = categoriesByMenuId.get(row.menuItemId) ?? [];
      categories.push(this.toCategory(row.category));
      categoriesByMenuId.set(row.menuItemId, categories);
    }

    this.menu = menuRows.map((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      category: row.category,
      primary_category_id: row.primaryCategoryId,
      primary_category_name: row.primaryCategoryName,
      categories: categoriesByMenuId.get(row.id) ?? [],
      description: row.description,
      image_url: row.imageUrl,
    }));

    const itemsByOrderId = new Map<number, OrderItem[]>();
    for (const row of orderItemRows) {
      const items = itemsByOrderId.get(row.orderId) ?? [];
      items.push({
        item: {
          id: row.itemId,
          name: row.name,
          price: row.price,
          category: row.category,
          description: row.description,
          image_url: row.imageUrl,
        },
        qty: row.qty,
      });
      itemsByOrderId.set(row.orderId, items);
    }

    this.orders = orderRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      items: itemsByOrderId.get(row.id) ?? [],
      total: row.total,
      status: toOrderStatus(row.status),
      orderSource: row.orderSource === "walk_in" ? "walk_in" : "customer",
      guestName: row.guestName ?? null,
      createdByStaffId: row.createdByStaffId ?? null,
      fulfillmentType:
        row.fulfillmentType === "dine_in" ? "dine_in" : "takeout",
      customerNote: row.customerNote ?? null,
      pickupTime: row.pickupTime
        ? row.pickupTime instanceof Date
          ? row.pickupTime.toISOString()
          : new Date(row.pickupTime).toISOString()
        : null,
      paymentMethod:
        row.paymentMethod === "card" || row.paymentMethod === "online"
          ? row.paymentMethod
          : "cash",
      paymentStatus: row.paymentStatus === "paid" ? "paid" : "unpaid",
      issueType: toOrderIssueType(row.issueType),
      issueNote: row.issueNote ?? null,
      issueReportedBy: row.issueReportedBy ?? null,
      issueReportedAt: row.issueReportedAt
        ? row.issueReportedAt instanceof Date
          ? row.issueReportedAt.toISOString()
          : new Date(row.issueReportedAt).toISOString()
        : null,
      rating:
        typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5
          ? row.rating
          : null,
      ratingComment: row.ratingComment ?? null,
      ratedAt: row.ratedAt
        ? row.ratedAt instanceof Date
          ? row.ratedAt.toISOString()
          : new Date(row.ratedAt).toISOString()
        : null,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(row.createdAt).toISOString(),
      submittedAt: row.submittedAt
        ? row.submittedAt instanceof Date
          ? row.submittedAt.toISOString()
          : new Date(row.submittedAt).toISOString()
        : undefined,
    }));
  }

  private toCategory(row: typeof categoriesTable.$inferSelect): Category {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(row.createdAt).toISOString(),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : new Date(row.updatedAt).toISOString(),
    };
  }
}
