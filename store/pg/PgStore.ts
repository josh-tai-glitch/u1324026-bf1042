import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { MenuItem, Order, OrderItem } from "../../shared/contracts.ts";
import { db } from "../../db/client.ts";
import {
  menuItemsTable,
  orderItemsTable,
  ordersTable,
} from "../../db/schema.ts";
import type { Store } from "../Store.ts";

function calculateTotal(items: ReadonlyArray<OrderItem>): number {
  return items.reduce((sum, item) => sum + item.item.price * item.qty, 0);
}

export class PgStore implements Store {
  private menu: MenuItem[] = [];
  private orders: Order[] = [];

  constructor() {}

  async init(): Promise<void> {
    await db.execute(sql`select 1`);
    await this.reloadFromDatabase();
  }

  getMenu(): ReadonlyArray<MenuItem> {
    return this.menu;
  }

  async createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }): Promise<MenuItem> {
    const [inserted] = await db
      .insert(menuItemsTable)
      .values({
        name: input.name,
        price: input.price,
        category: input.category,
        description: input.description,
        imageUrl: input.image_url,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert menu item");
    }

    const createdItem: MenuItem = {
      id: inserted.id,
      name: inserted.name,
      price: inserted.price,
      category: inserted.category,
      description: inserted.description,
      image_url: inserted.imageUrl,
    };

    this.menu.push(createdItem);
    return createdItem;
  }

  async updateMenuItem(
    menuId: number,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      description?: string;
      image_url?: string;
    },
  ): Promise<MenuItem | null> {
    const [updated] = await db
      .update(menuItemsTable)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.price !== undefined ? { price: patch.price } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.image_url !== undefined ? { imageUrl: patch.image_url } : {}),
      })
      .where(eq(menuItemsTable.id, menuId))
      .returning();

    if (!updated) {
      return null;
    }

    const nextItem: MenuItem = {
      id: updated.id,
      name: updated.name,
      price: updated.price,
      category: updated.category,
      description: updated.description,
      image_url: updated.imageUrl,
    };

    const targetIndex = this.menu.findIndex((item) => item.id === menuId);
    if (targetIndex !== -1) {
      this.menu[targetIndex] = nextItem;
    }

    return nextItem;
  }

  async deleteMenuItem(menuId: number): Promise<MenuItem | null> {
    const [removed] = await db
      .delete(menuItemsTable)
      .where(eq(menuItemsTable.id, menuId))
      .returning();

    if (!removed) {
      return null;
    }

    const removedItem: MenuItem = {
      id: removed.id,
      name: removed.name,
      price: removed.price,
      category: removed.category,
      description: removed.description,
      image_url: removed.imageUrl,
    };

    const targetIndex = this.menu.findIndex((item) => item.id === menuId);
    if (targetIndex !== -1) {
      this.menu.splice(targetIndex, 1);
    }

    return removedItem;
  }

  getOrders(): ReadonlyArray<Order> {
    return this.orders;
  }

  getCurrentOrderByUserId(userId: string): Order | undefined {
    return this.orders.find(
      (order) => order.userId === userId && order.status === "pending",
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
    const createdAt = new Date();

    const [inserted] = await db
      .insert(ordersTable)
      .values({
        userId: input.userId,
        status: "pending",
        total: 0,
        createdAt,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to create order");
    }

    const order: Order = {
      id: inserted.id,
      userId: inserted.userId,
      items: [],
      total: inserted.total,
      status: inserted.status === "submitted" ? "submitted" : "pending",
      createdAt:
        inserted.createdAt instanceof Date
          ? inserted.createdAt.toISOString()
          : new Date(inserted.createdAt).toISOString(),
      submittedAt: inserted.submittedAt
        ? inserted.submittedAt instanceof Date
          ? inserted.submittedAt.toISOString()
          : new Date(inserted.submittedAt).toISOString()
        : undefined,
    };

    this.orders.push(order);
    return order;
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

    const existingOrderItemIndex = order.items.findIndex(
      (item) => item.item.id === input.itemId,
    );

    if (existingOrderItemIndex !== -1) {
      if (input.qty === 0) {
        await db
          .delete(orderItemsTable)
          .where(
            and(
              eq(orderItemsTable.orderId, orderId),
              eq(orderItemsTable.itemId, input.itemId),
            ),
          );
        order.items.splice(existingOrderItemIndex, 1);
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
        const target = order.items[existingOrderItemIndex];
        if (target) {
          target.qty = input.qty;
        }
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

      order.items.push({
        item: {
          ...menuItem,
        },
        qty: input.qty,
      });
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

    const submittedAt = new Date().toISOString();

    await db
      .update(ordersTable)
      .set({
        status: "submitted",
        submittedAt: new Date(submittedAt),
      })
      .where(eq(ordersTable.id, orderId));

    order.status = "submitted";
    order.submittedAt = submittedAt;

    return { ok: true, order };
  }

  private async reloadFromDatabase(): Promise<void> {
    const menuRows = await db
      .select()
      .from(menuItemsTable)
      .orderBy(asc(menuItemsTable.id));
    const orderRows = await db
      .select()
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id));
    const orderItemRows = await db
      .select()
      .from(orderItemsTable)
      .orderBy(asc(orderItemsTable.id));

    this.menu = menuRows.map((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      category: row.category,
      description: row.description,
      image_url: row.imageUrl,
    }));

    const itemsByOrderId = new Map<number, OrderItem[]>();
    for (const row of orderItemRows) {
      const orderItems = itemsByOrderId.get(row.orderId) ?? [];
      orderItems.push({
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
      itemsByOrderId.set(row.orderId, orderItems);
    }

    this.orders = orderRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      items: itemsByOrderId.get(row.id) ?? [],
      total: row.total,
      status: row.status === "submitted" ? "submitted" : "pending",
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
}
