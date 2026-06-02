import { mkdir, rename } from "node:fs/promises";
import type {
  AuditLog,
  AnalyticsSummary,
  AnalyticsTrends,
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
  Role,
  TopItemSales,
} from "../../shared/contracts.ts";
import {
  CategoryNotFoundError,
  CategorySlugConflictError,
  type AnalyticsDateRangeInput,
  type AppendAuditLogInput,
  type CategoryStatusFilter,
  type GetAuditLogsInput,
  type Store,
} from "../Store.ts";

interface StoredUser {
  id: string;
  email: string;
  name: string;
  password: string;
}

interface DataStore {
  users: StoredUser[];
  menu: MenuItem[];
  categories?: Category[];
  orders: Order[];
  auditLogs?: AuditLog[];
  userIdCounter: number;
  menuIdCounter: number;
  orderIdCounter: number;
  auditLogIdCounter?: number;
}

interface JsonFileStoreOptions {
  dataFilePath: string;
}

const defaultMenu: MenuItem[] = [
  {
    id: 1,
    name: "火腿蛋吐司",
    price: 40,
    category: "餐點",
    description: "現煎雞蛋搭配火腿與生菜，使用微烤白吐司，口感清爽不油膩。",
    image_url: "/imgs/menu/ham-egg-toast.webp",
    is_available: true,
  },
  {
    id: 2,
    name: "起司豬排堡",
    price: 65,
    category: "餐點",
    description: "厚切豬排搭配起司與生菜，外酥內嫩，適合喜歡有咬勁的你。",
    image_url: "/imgs/menu/cheese-pork-burger.webp",
    is_available: true,
  },
  {
    id: 3,
    name: "鮪魚蛋吐司",
    price: 45,
    category: "餐點",
    description: "自調鮪魚沙拉配上煎蛋與生菜，口味濃郁但不會太鹹。",
    image_url: "/imgs/menu/tuna-egg-toast.webp",
    is_available: true,
  },
  {
    id: 4,
    name: "培根蛋餅",
    price: 45,
    category: "餐點",
    description: "煎到微酥的蛋餅皮包裹煙燻培根與雞蛋，是經典台式早餐選擇。",
    image_url: "/imgs/menu/bacon-egg-roll.webp",
    is_available: true,
  },
];

function cloneDefaultMenu(): MenuItem[] {
  return defaultMenu.map((item) => ({ ...item }));
}

function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, orderItem) => {
    return sum + orderItem.item.price * orderItem.qty;
  }, 0);
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

function toFulfillmentType(value: unknown): FulfillmentType {
  return value === "dine_in" ? "dine_in" : "takeout";
}

function toPaymentMethod(value: unknown): PaymentMethod {
  return value === "card" || value === "online" ? value : "cash";
}

function toPaymentStatus(value: unknown): PaymentStatus {
  return value === "paid" ? "paid" : "unpaid";
}

function normalizeMenuItem(item: Partial<MenuItem>): MenuItem {
  return {
    id: item.id ?? 0,
    name: item.name ?? "",
    price: item.price ?? 0,
    category: item.category ?? "",
    primary_category_id: item.primary_category_id ?? null,
    primary_category_name: item.primary_category_name ?? null,
    categories: Array.isArray(item.categories)
      ? item.categories.map((category) => normalizeCategory(category))
      : [],
    description: item.description ?? "",
    image_url: item.image_url ?? "",
    is_available: item.is_available ?? true,
  };
}

function normalizeCategory(category: Partial<Category>): Category {
  const now = new Date().toISOString();
  return {
    id: category.id ?? 0,
    name: category.name ?? "",
    slug: category.slug ?? "",
    description: category.description ?? null,
    displayOrder: category.displayOrder ?? 0,
    isActive: category.isActive ?? true,
    createdAt: category.createdAt ?? now,
    updatedAt: category.updatedAt ?? now,
  };
}

function normalizeAuditLog(log: Partial<AuditLog>): AuditLog {
  const now = new Date().toISOString();
  return {
    id: log.id ?? 0,
    actorUserId: log.actorUserId ?? null,
    actorName: log.actorName ?? null,
    actorRoles: Array.isArray(log.actorRoles)
      ? (log.actorRoles.filter((role) =>
          ["admin", "owner", "chef", "staff", "customer"].includes(role),
        ) as Role[])
      : [],
    action: log.action ?? "menu_update",
    targetType: log.targetType ?? "menu_item",
    targetId: log.targetId ?? null,
    message: log.message ?? "",
    metadata:
      log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
        ? log.metadata
        : null,
    createdAt: log.createdAt ?? now,
  };
}

function normalizeUserId(rawId: unknown): string {
  if (typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0) {
    return String(rawId).padStart(4, "0");
  }

  if (typeof rawId === "string" && rawId.trim() !== "") {
    const trimmed = rawId.trim();
    if (/^\d+$/.test(trimmed)) {
      return trimmed.padStart(4, "0");
    }
    return trimmed;
  }

  return "0001";
}

function normalizeUser(user: Partial<StoredUser>): StoredUser {
  return {
    id: normalizeUserId(user.id),
    email: user.email ?? "",
    name: user.name ?? "",
    password: user.password ?? "",
  };
}

const defaultUsers: StoredUser[] = [
  {
    id: "0001",
    email: "demo@example.com",
    name: "示範使用者",
    password: "1234",
  },
  {
    id: "0002",
    email: "amy@example.com",
    name: "Amy",
    password: "1234",
  },
];

function cloneDefaultUsers(): StoredUser[] {
  return defaultUsers.map((user) => ({ ...user }));
}

export class JsonFileStore implements Store {
  private readonly dataFilePath: string;

  private users: StoredUser[] = [];
  private menu: MenuItem[] = [];
  private categories: Category[] = [];
  private orders: Order[] = [];
  private auditLogs: AuditLog[] = [];
  private userIdCounter = 0;
  private menuIdCounter = 0;
  private orderIdCounter = 0;
  private auditLogIdCounter = 0;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(options: JsonFileStoreOptions) {
    this.dataFilePath = options.dataFilePath;
  }

  async init(): Promise<void> {
    const file = Bun.file(this.dataFilePath);

    if (!(await file.exists())) {
      const initialStore = this.createInitialStore();
      this.applyStore(initialStore);
      await this.saveStore(initialStore);
      return;
    }

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as Partial<DataStore>;

      if (!Array.isArray(parsed.menu) || !Array.isArray(parsed.orders)) {
        throw new Error("Invalid store schema");
      }

      const normalizedUsers = Array.isArray(parsed.users)
        ? parsed.users.map((user) => normalizeUser(user))
        : cloneDefaultUsers();

      const fallbackUserId = normalizedUsers[0]?.id ?? "0001";

      this.applyStore({
        users: normalizedUsers,
        categories: Array.isArray(parsed.categories)
          ? parsed.categories.map((category) => normalizeCategory(category))
          : [],
        menu: parsed.menu.map((item) => normalizeMenuItem(item)),
        orders: parsed.orders.map((order) => ({
          ...order,
          userId: normalizeUserId(order.userId ?? fallbackUserId),
          items: order.items.map((orderItem) => ({
            ...orderItem,
            item: normalizeMenuItem(orderItem.item),
          })),
          status: toOrderStatus(order.status),
          orderSource: order.orderSource === "walk_in" ? "walk_in" : "customer",
          guestName: order.guestName ?? null,
          createdByStaffId: order.createdByStaffId ?? null,
          fulfillmentType: toFulfillmentType(order.fulfillmentType),
          customerNote: order.customerNote ?? null,
          pickupTime: order.pickupTime ?? null,
          paymentMethod: toPaymentMethod(order.paymentMethod),
          paymentStatus: toPaymentStatus(order.paymentStatus),
          issueType: toOrderIssueType(order.issueType),
          issueNote: order.issueNote ?? null,
          issueReportedBy: order.issueReportedBy ?? null,
          issueReportedAt: order.issueReportedAt ?? null,
          rating:
            typeof order.rating === "number" &&
            order.rating >= 1 &&
            order.rating <= 5
              ? order.rating
              : null,
          ratingComment: order.ratingComment ?? null,
          ratedAt: order.ratedAt ?? null,
          submittedAt: order.status === "pending" ? undefined : order.submittedAt,
        })),
        auditLogs: Array.isArray(parsed.auditLogs)
          ? parsed.auditLogs.map((log) => normalizeAuditLog(log))
          : [],
        userIdCounter: parsed.userIdCounter ?? 0,
        menuIdCounter: parsed.menuIdCounter ?? 0,
        orderIdCounter: parsed.orderIdCounter ?? 0,
        auditLogIdCounter: parsed.auditLogIdCounter ?? 0,
      });
    } catch (error) {
      console.warn("[store] load failed, fallback to initial store", error);
      const initialStore = this.createInitialStore();
      this.applyStore(initialStore);
      await this.saveStore(initialStore);
    }
  }

  getMenu(): ReadonlyArray<MenuItem> {
    return this.menu;
  }

  async createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    primaryCategoryId?: number;
    description: string;
    image_url: string;
    isAvailable?: boolean;
  }): Promise<MenuItem> {
    const primaryCategory =
      input.primaryCategoryId !== undefined
        ? this.findActiveCategory(input.primaryCategoryId)
        : null;
    if (input.primaryCategoryId !== undefined && !primaryCategory) {
      throw new CategoryNotFoundError();
    }

    const newMenuItem: MenuItem = {
      id: ++this.menuIdCounter,
      name: input.name,
      price: input.price,
      category: primaryCategory?.name ?? input.category,
      primary_category_id: primaryCategory?.id ?? null,
      primary_category_name: primaryCategory?.name ?? null,
      categories: primaryCategory ? [{ ...primaryCategory }] : [],
      description: input.description,
      image_url: input.image_url,
      is_available: input.isAvailable ?? true,
    };

    this.menu.push(newMenuItem);
    await this.persist();

    return newMenuItem;
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
      isAvailable?: boolean;
    },
  ): Promise<MenuItem | null> {
    const menuItem = this.menu.find((item) => item.id === menuId);
    if (!menuItem) {
      return null;
    }
    const shouldUpdatePrimary = patch.primaryCategoryId !== undefined;
    const primaryCategory =
      typeof patch.primaryCategoryId === "number"
        ? this.findActiveCategory(patch.primaryCategoryId)
        : null;
    if (typeof patch.primaryCategoryId === "number" && !primaryCategory) {
      throw new CategoryNotFoundError();
    }

    menuItem.name = patch.name ?? menuItem.name;
    menuItem.price = patch.price ?? menuItem.price;
    menuItem.category = patch.category ?? menuItem.category;
    if (primaryCategory) {
      menuItem.category = primaryCategory.name;
      menuItem.primary_category_id = primaryCategory.id;
      menuItem.primary_category_name = primaryCategory.name;
      const linkedCategories = menuItem.categories ?? [];
      if (
        !linkedCategories.some((category) => category.id === primaryCategory.id)
      ) {
        linkedCategories.push({ ...primaryCategory });
      }
      menuItem.categories = linkedCategories
        .filter((category) => category.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
    } else if (shouldUpdatePrimary) {
      menuItem.primary_category_id = null;
      menuItem.primary_category_name = null;
    }
    menuItem.description = patch.description ?? menuItem.description;
    menuItem.image_url = patch.image_url ?? menuItem.image_url;
    menuItem.is_available = patch.isAvailable ?? menuItem.is_available;

    await this.persist();

    return menuItem;
  }

  async deleteMenuItem(menuId: number): Promise<MenuItem | null> {
    const targetIndex = this.menu.findIndex((item) => item.id === menuId);
    if (targetIndex === -1) {
      return null;
    }

    const [removedMenuItem] = this.menu.splice(targetIndex, 1);
    await this.persist();

    return removedMenuItem ?? null;
  }

  getCategories(input: { status?: CategoryStatusFilter } = {}): ReadonlyArray<Category> {
    const status = input.status ?? "active";
    if (status === "all") return this.categories;
    return this.categories.filter((category) =>
      status === "active" ? category.isActive : !category.isActive,
    );
  }

  async createCategory(input: {
    name: string;
    slug: string;
    description?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  }): Promise<Category> {
    if (this.categories.some((category) => category.slug === input.slug)) {
      throw new CategorySlugConflictError();
    }

    const now = new Date().toISOString();
    const nextId =
      this.categories.reduce((max, category) => Math.max(max, category.id), 0) +
      1;
    const category: Category = {
      id: nextId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      displayOrder: input.displayOrder ?? 0,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.categories.push(category);
    this.categories.sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
    await this.persist();
    return category;
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
    const category = this.categories.find((item) => item.id === categoryId);
    if (!category) return null;
    if (
      patch.slug !== undefined &&
      this.categories.some(
        (item) => item.id !== categoryId && item.slug === patch.slug,
      )
    ) {
      throw new CategorySlugConflictError();
    }

    category.name = patch.name ?? category.name;
    category.slug = patch.slug ?? category.slug;
    category.description =
      patch.description !== undefined ? patch.description : category.description;
    category.displayOrder = patch.displayOrder ?? category.displayOrder;
    category.isActive = patch.isActive ?? category.isActive;
    category.updatedAt = new Date().toISOString();

    for (const item of this.menu) {
      if (item.primary_category_id === categoryId) {
        if (category.isActive) {
          item.primary_category_name = category.name;
        } else {
          item.primary_category_id = null;
          item.primary_category_name = null;
        }
      }
      item.categories = (item.categories ?? [])
        .map((linked) => (linked.id === categoryId ? { ...category } : linked))
        .filter((linked) => linked.isActive);
    }

    await this.persist();
    return category;
  }

  async deleteCategory(categoryId: number): Promise<Category | null> {
    return this.updateCategory(categoryId, { isActive: false });
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

    const linkedCategories = menuItem.categories ?? [];
    if (!linkedCategories.some((item) => item.id === categoryId)) {
      linkedCategories.push({ ...category });
    }
    menuItem.categories = linkedCategories.sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
    );

    if (!menuItem.primary_category_id) {
      menuItem.primary_category_id = category.id;
      menuItem.primary_category_name = category.name;
    }

    await this.persist();
    return menuItem;
  }

  async removeCategoryFromMenuItem(
    menuId: number,
    categoryId: number,
  ): Promise<MenuItem | null> {
    const menuItem = this.menu.find((item) => item.id === menuId);
    const category = this.categories.find((item) => item.id === categoryId);
    if (!menuItem || !category) return null;

    menuItem.categories = (menuItem.categories ?? []).filter(
      (item) => item.id !== categoryId,
    );
    if (menuItem.primary_category_id === categoryId) {
      menuItem.primary_category_id = null;
      menuItem.primary_category_name = null;
    }

    await this.persist();
    return menuItem;
  }

  getOrders(): ReadonlyArray<Order> {
    return this.orders;
  }

  getCurrentOrderByUserId(userId: string): Order | undefined {
    const pendingOrders = this.orders.filter(
      (order) => order.userId === userId && order.status === "pending",
    );

    if (pendingOrders.length === 0) {
      return undefined;
    }

    // 取最新 pending（id 越大越新），避免拿到舊的空購物車訂單。
    return pendingOrders.reduce((latest, current) =>
      current.id > latest.id ? current : latest,
    );
  }

  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order> {
    return this.orders
      .filter(
        (order) =>
          order.userId === userId &&
          visibleOrderHistoryStatuses.includes(order.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrderById(orderId: number): Order | undefined {
    return this.orders.find((order) => order.id === orderId);
  }

  async createOrder(input: { userId: string }): Promise<Order> {
    const existingOrder = this.getCurrentOrderByUserId(input.userId);
    if (existingOrder) {
      return existingOrder;
    }

    const newOrder: Order = {
      id: ++this.orderIdCounter,
      userId: input.userId,
      items: [],
      total: 0,
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
      createdAt: new Date().toISOString(),
    };

    this.orders.push(newOrder);
    await this.persist();

    return newOrder;
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
    | {
        ok: false;
        code: "EMPTY_ORDER" | "MENU_ITEM_NOT_FOUND" | "MENU_ITEM_UNAVAILABLE";
      }
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
      if (!menuItem.is_available) {
        return { ok: false, code: "MENU_ITEM_UNAVAILABLE" };
      }
      orderItems.push({ item: menuItem, qty: requestedItem.qty });
    }

    const submittedAt = new Date().toISOString();
    const order: Order = {
      id: ++this.orderIdCounter,
      userId: input.staffUserId,
      items: orderItems,
      total: calculateOrderTotal(orderItems),
      status: "submitted",
      orderSource: "walk_in",
      guestName: input.guestName?.trim() || null,
      createdByStaffId: input.staffUserId,
      fulfillmentType: input.fulfillmentType,
      customerNote: input.customerNote?.trim() || null,
      pickupTime: input.pickupTime || null,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus ?? "unpaid",
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
    await this.persist();
    return { ok: true, order };
  }

  async updateOrderItem(
    orderId: number,
    input: {
      userId: string;
      itemId: number;
      qty: number;
    },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "MENU_ITEM_NOT_FOUND"
          | "MENU_ITEM_UNAVAILABLE"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_EDITABLE";
      }
  > {
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (order.userId !== input.userId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    const menuItem = this.menu.find((item) => item.id === input.itemId);
    if (!menuItem) {
      return { ok: false, code: "MENU_ITEM_NOT_FOUND" };
    }

    const existingItemIndex = order.items.findIndex(
      (orderItem) => orderItem.item.id === input.itemId,
    );
    const existingQty =
      existingItemIndex !== -1
        ? order.items[existingItemIndex]?.qty ?? 0
        : 0;
    if (!menuItem.is_available && input.qty > existingQty) {
      return { ok: false, code: "MENU_ITEM_UNAVAILABLE" };
    }

    if (existingItemIndex !== -1) {
      const existingOrderItem = order.items[existingItemIndex];

      if (input.qty === 0) {
        order.items.splice(existingItemIndex, 1);
      } else if (existingOrderItem) {
        existingOrderItem.qty = input.qty;
      }
    } else if (input.qty > 0) {
      order.items.push({ item: menuItem, qty: input.qty });
    }

    order.total = calculateOrderTotal(order.items);
    await this.persist();

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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (order.userId !== input.userId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    if (order.items.length === 0) {
      return { ok: false, code: "EMPTY_ORDER" };
    }

    order.status = "submitted";
    order.submittedAt = new Date().toISOString();
    order.fulfillmentType = input.fulfillmentType;
    order.customerNote = input.customerNote?.trim() || null;
    order.pickupTime = input.pickupTime || null;
    order.paymentMethod = input.paymentMethod;
    order.paymentStatus = input.paymentStatus ?? "unpaid";
    await this.persist();

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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
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

    order.status = input.status;
    await this.persist();
    return { ok: true, order };
  }

  async updateOrderPaymentStatus(
    orderId: number,
    input: { paymentStatus: PaymentStatus },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: "ORDER_NOT_FOUND" | "ORDER_NOT_SUBMITTED" }
  > {
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.status === "pending") {
      return { ok: false, code: "ORDER_NOT_SUBMITTED" };
    }

    order.paymentStatus = input.paymentStatus;
    await this.persist();
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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
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

    order.status = "cancelled";
    await this.persist();
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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.status !== "submitted" && order.status !== "preparing") {
      return { ok: false, code: "ORDER_ISSUE_NOT_EDITABLE" };
    }

    order.issueType = input.issueType;
    order.issueNote = input.issueNote?.trim() || null;
    order.issueReportedBy = input.reportedBy;
    order.issueReportedAt = new Date().toISOString();
    await this.persist();
    return { ok: true, order };
  }

  async clearOrderIssue(
    orderId: number,
    _input: { userId: string },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: "ORDER_NOT_FOUND" | "ORDER_ISSUE_NOT_EDITABLE" }
  > {
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (
      order.status === "pending" ||
      order.status === "completed" ||
      order.status === "cancelled"
    ) {
      return { ok: false, code: "ORDER_ISSUE_NOT_EDITABLE" };
    }

    order.issueType = null;
    order.issueNote = null;
    order.issueReportedBy = null;
    order.issueReportedAt = null;
    await this.persist();
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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.userId !== input.userId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }
    if (order.status !== "completed") {
      return { ok: false, code: "ORDER_NOT_COMPLETED" };
    }

    order.rating = Math.max(1, Math.min(5, Math.trunc(input.rating)));
    order.ratingComment = input.ratingComment?.trim() || null;
    order.ratedAt = new Date().toISOString();
    await this.persist();
    return { ok: true, order };
  }

  getCategorySalesAnalytics(
    input?: AnalyticsDateRangeInput,
  ): ReadonlyArray<CategorySales> {
    const salesByCategory = new Map<
      string,
      { quantity: number; revenue: number; orderIds: Set<number> }
    >();

    for (const order of this.getAnalyticsOrders(input)) {
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

  getTopItemSalesAnalytics(
    limit = 10,
    input?: AnalyticsDateRangeInput,
  ): ReadonlyArray<TopItemSales> {
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

    for (const order of this.getAnalyticsOrders(input)) {
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

  getAnalyticsSummary(input?: AnalyticsDateRangeInput): AnalyticsSummary {
    const today = new Date().toLocaleDateString();
    const analyticsOrders = this.getAnalyticsOrders(input);
    const formalOrders = analyticsOrders.filter((order) => order.status !== "pending");
    const revenueOrders = analyticsOrders.filter((order) =>
      revenueOrderStatuses.includes(order.status),
    );
    const ratedOrders = analyticsOrders.filter((order) => order.rating !== null);
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
      cancellationCount: analyticsOrders.filter(
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

  getAnalyticsTrends(input?: AnalyticsDateRangeInput): AnalyticsTrends {
    const analyticsOrders = this.getAnalyticsOrders(input);
    const formalOrders = analyticsOrders.filter((order) => order.status !== "pending");
    const revenueOrders = analyticsOrders.filter((order) =>
      revenueOrderStatuses.includes(order.status),
    );
    const dailyByDate = new Map<
      string,
      { date: string; revenue: number; orderCount: number }
    >();
    const hourlyOrders = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orderCount: 0,
      revenue: 0,
    }));
    const ratingDistribution = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
    };
    let lowRatingCount = 0;

    for (const order of revenueOrders) {
      const orderDate = this.getAnalyticsOrderDate(order);
      if (!orderDate) continue;

      const date = this.formatAnalyticsDateOnly(orderDate);
      const daily = dailyByDate.get(date) ?? {
        date,
        revenue: 0,
        orderCount: 0,
      };
      daily.revenue += order.total;
      daily.orderCount += 1;
      dailyByDate.set(date, daily);

      const hourly = hourlyOrders[orderDate.getHours()];
      hourly.orderCount += 1;
      hourly.revenue += order.total;
    }

    for (const order of analyticsOrders) {
      if (order.rating === null) continue;
      const rating = Math.trunc(order.rating);
      if (rating < 1 || rating > 5) continue;
      ratingDistribution[String(rating) as keyof typeof ratingDistribution] += 1;
      if (rating < 3) lowRatingCount += 1;
    }

    const cancelledCount = analyticsOrders.filter(
      (order) => order.status === "cancelled",
    ).length;

    return {
      dailyRevenue: Array.from(dailyByDate.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      hourlyOrders,
      ratingDistribution,
      lowRatingCount,
      cancellationRate:
        formalOrders.length > 0 ? cancelledCount / formalOrders.length : 0,
    };
  }

  async appendAuditLog(input: AppendAuditLogInput): Promise<void> {
    const auditLog: AuditLog = {
      id: ++this.auditLogIdCounter,
      actorUserId: input.actorUserId ?? null,
      actorName: input.actorName ?? null,
      actorRoles: input.actorRoles ?? [],
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      message: input.message,
      metadata: input.metadata ?? null,
      createdAt: new Date().toISOString(),
    };

    this.auditLogs.unshift(auditLog);
    await this.persist();
  }

  getAuditLogs(input: GetAuditLogsInput = {}): ReadonlyArray<AuditLog> {
    const safeLimit = this.getAuditLogLimit(input.limit);
    return this.auditLogs
      .filter((log) => !input.action || log.action === input.action)
      .filter((log) => !input.targetType || log.targetType === input.targetType)
      .slice()
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          b.id - a.id,
      )
      .slice(0, safeLimit);
  }

  private getAuditLogLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit) || !limit) return 50;
    return Math.min(Math.max(Math.floor(limit), 1), 200);
  }

  private getAnalyticsOrders(input?: AnalyticsDateRangeInput): Order[] {
    const start = this.parseAnalyticsDateBound(input?.startDate, false);
    const end = this.parseAnalyticsDateBound(input?.endDate, true);

    if (!start && !end) return this.orders;

    return this.orders.filter((order) => {
      const date = new Date(order.submittedAt ?? order.createdAt);
      if (Number.isNaN(date.getTime())) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }

  private getAnalyticsOrderDate(order: Order): Date | null {
    const date = new Date(order.submittedAt ?? order.createdAt);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatAnalyticsDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private parseAnalyticsDateBound(
    value: string | undefined,
    isEnd: boolean,
  ): Date | undefined {
    if (!value) return undefined;
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = dateOnlyMatch
      ? new Date(
          Number(dateOnlyMatch[1]),
          Number(dateOnlyMatch[2]) - 1,
          Number(dateOnlyMatch[3]),
          isEnd ? 23 : 0,
          isEnd ? 59 : 0,
          isEnd ? 59 : 0,
          isEnd ? 999 : 0,
        )
      : new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private findActiveCategory(categoryId: number): Category | null {
    return (
      this.categories.find(
        (category) => category.id === categoryId && category.isActive,
      ) ?? null
    );
  }

  private createInitialStore(): DataStore {
    return {
      users: cloneDefaultUsers(),
      categories: [],
      menu: cloneDefaultMenu(),
      orders: [],
      auditLogs: [],
      userIdCounter: defaultUsers.length,
      menuIdCounter: defaultMenu.length,
      orderIdCounter: 0,
      auditLogIdCounter: 0,
    };
  }

  private applyStore(store: DataStore): void {
    this.users = store.users;
    this.categories = Array.isArray(store.categories) ? store.categories : [];
    this.menu = store.menu;
    this.orders = store.orders;
    this.auditLogs = Array.isArray(store.auditLogs) ? store.auditLogs : [];

    const maxUserId = this.users.reduce((max, user) => {
      const asNumber = Number.parseInt(user.id, 10);
      return Number.isFinite(asNumber) ? Math.max(max, asNumber) : max;
    }, 0);

    const maxMenuId = this.menu.reduce(
      (max, item) => Math.max(max, item.id),
      0,
    );
    const maxOrderId = this.orders.reduce(
      (max, order) => Math.max(max, order.id),
      0,
    );
    const maxAuditLogId = this.auditLogs.reduce(
      (max, log) => Math.max(max, log.id),
      0,
    );

    this.userIdCounter = Math.max(store.userIdCounter || 0, maxUserId);
    this.menuIdCounter = Math.max(store.menuIdCounter || 0, maxMenuId);
    this.orderIdCounter = Math.max(store.orderIdCounter || 0, maxOrderId);
    this.auditLogIdCounter = Math.max(
      store.auditLogIdCounter || 0,
      maxAuditLogId,
    );
  }

  private buildStoreSnapshot(): DataStore {
    return {
      users: this.users,
      categories: this.categories,
      menu: this.menu,
      orders: this.orders,
      auditLogs: this.auditLogs,
      userIdCounter: this.userIdCounter,
      menuIdCounter: this.menuIdCounter,
      orderIdCounter: this.orderIdCounter,
      auditLogIdCounter: this.auditLogIdCounter,
    };
  }

  private async saveStore(snapshot: DataStore): Promise<void> {
    await mkdir("./data", { recursive: true });
    const tmpPath = `${this.dataFilePath}.tmp`;
    await Bun.write(tmpPath, JSON.stringify(snapshot, null, 2));
    await rename(tmpPath, this.dataFilePath);
  }

  private async persist(): Promise<void> {
    const snapshot = this.buildStoreSnapshot();

    this.persistQueue = this.persistQueue.then(async () => {
      await this.saveStore(snapshot);
    });

    await this.persistQueue;
  }
}
