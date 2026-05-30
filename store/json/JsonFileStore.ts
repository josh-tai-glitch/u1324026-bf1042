import { mkdir, rename } from "node:fs/promises";
import type {
  Category,
  CategorySales,
  MenuItem,
  Order,
  OrderItem,
  TopItemSales,
} from "../../shared/contracts.ts";
import {
  CategoryNotFoundError,
  CategorySlugConflictError,
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
  userIdCounter: number;
  menuIdCounter: number;
  orderIdCounter: number;
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
  },
  {
    id: 2,
    name: "起司豬排堡",
    price: 65,
    category: "餐點",
    description: "厚切豬排搭配起司與生菜，外酥內嫩，適合喜歡有咬勁的你。",
    image_url: "/imgs/menu/cheese-pork-burger.webp",
  },
  {
    id: 3,
    name: "鮪魚蛋吐司",
    price: 45,
    category: "餐點",
    description: "自調鮪魚沙拉配上煎蛋與生菜，口味濃郁但不會太鹹。",
    image_url: "/imgs/menu/tuna-egg-toast.webp",
  },
  {
    id: 4,
    name: "培根蛋餅",
    price: 45,
    category: "餐點",
    description: "煎到微酥的蛋餅皮包裹煙燻培根與雞蛋，是經典台式早餐選擇。",
    image_url: "/imgs/menu/bacon-egg-roll.webp",
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
  private userIdCounter = 0;
  private menuIdCounter = 0;
  private orderIdCounter = 0;
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
          status: order.status === "submitted" ? "submitted" : "pending",
          submittedAt:
            order.status === "submitted" ? order.submittedAt : undefined,
        })),
        userIdCounter: parsed.userIdCounter ?? 0,
        menuIdCounter: parsed.menuIdCounter ?? 0,
        orderIdCounter: parsed.orderIdCounter ?? 0,
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

  getCategories(): ReadonlyArray<Category> {
    return this.categories.filter((category) => category.isActive);
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
        (order) => order.userId === userId && order.status === "submitted",
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
      createdAt: new Date().toISOString(),
    };

    this.orders.push(newOrder);
    await this.persist();

    return newOrder;
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
    input: { userId: string },
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
    await this.persist();

    return { ok: true, order };
  }

  getCategorySalesAnalytics(): ReadonlyArray<CategorySales> {
    const salesByCategory = new Map<
      string,
      { quantity: number; revenue: number; orderIds: Set<number> }
    >();

    for (const order of this.orders) {
      if (order.status !== "submitted") continue;

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
      if (order.status !== "submitted") continue;

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
      userIdCounter: defaultUsers.length,
      menuIdCounter: defaultMenu.length,
      orderIdCounter: 0,
    };
  }

  private applyStore(store: DataStore): void {
    this.users = store.users;
    this.categories = Array.isArray(store.categories) ? store.categories : [];
    this.menu = store.menu;
    this.orders = store.orders;

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

    this.userIdCounter = Math.max(store.userIdCounter || 0, maxUserId);
    this.menuIdCounter = Math.max(store.menuIdCounter || 0, maxMenuId);
    this.orderIdCounter = Math.max(store.orderIdCounter || 0, maxOrderId);
  }

  private buildStoreSnapshot(): DataStore {
    return {
      users: this.users,
      categories: this.categories,
      menu: this.menu,
      orders: this.orders,
      userIdCounter: this.userIdCounter,
      menuIdCounter: this.menuIdCounter,
      orderIdCounter: this.orderIdCounter,
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
