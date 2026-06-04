import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema.ts";

// PostgreSQL namespace 隔離
// 透過 PG_SCHEMA 環境變數切換，預設 "bf_v10"
// V10 使用 bf_v10（Better Auth 整合版本）
// 注意：不能使用 "public" 作為 schema 名稱（Drizzle 限制）
const schemaName = process.env.PG_SCHEMA || "bf_v10";
if (schemaName === "public") {
  throw new Error(
    'PG_SCHEMA cannot be "public". Use a custom schema name or leave it unset to use the default "bf_v10".',
  );
}
const appSchema = pgSchema(schemaName);

// 對照 shared/contracts.ts：
//   MenuItem { id, name, price, category, description, image_url }
//   Order { id, userId: string, total, status, createdAt, submittedAt }
//   OrderItem { item: MenuItem, qty }  → order_items（反正規化）
//
// V9 設計：userId 直接對應 Better Auth 的 user.id（text PK）
// 不再維護獨立的 users 表，身份完全由 Better Auth 管理。

export const categoriesTable = appSchema.table("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const menuItemsTable = appSchema.table("menu_items", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  category: text("category").notNull(),
  primaryCategoryId: integer("primary_category_id").references(
    () => categoriesTable.id,
  ),
  primaryCategoryName: text("primary_category_name"),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  versionMajor: integer("version_major").notNull().default(1),
  versionMinor: integer("version_minor").notNull().default(0),
  menuItemGroupId: text("menu_item_group_id").notNull(),
  isCurrentVersion: boolean("is_current_version").notNull().default(true),
  changeReason: text("change_reason"),
  changedBy: text("changed_by").references(() => user.id),
  previousVersionId: integer("previous_version_id"),
});

export const menuItemCategoriesTable = appSchema.table(
  "menu_item_categories",
  {
    id: serial("id").primaryKey(),
    menuItemId: integer("menu_item_id")
      .notNull()
      .references(() => menuItemsTable.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    removedAt: timestamp("removed_at"),
  },
  (table) => ({
    activeMenuItemCategoryUniqueIdx: uniqueIndex(
      "menu_item_categories_active_unique_idx",
    )
      .on(table.menuItemId, table.categoryId)
      .where(sql`${table.removedAt} is null`),
  }),
);

export const ordersTable = appSchema.table("orders", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  total: integer("total").notNull().default(0),
  status: text("status").notNull().default("pending"),
  orderSource: text("order_source").notNull().default("customer"),
  guestName: text("guest_name"),
  createdByStaffId: text("created_by_staff_id").references(() => user.id),
  fulfillmentType: text("fulfillment_type").notNull().default("takeout"),
  customerNote: text("customer_note"),
  pickupTime: timestamp("pickup_time", { withTimezone: true }),
  paymentMethod: text("payment_method").notNull().default("cash"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  issueType: text("issue_type"),
  issueNote: text("issue_note"),
  issueReportedBy: text("issue_reported_by").references(() => user.id),
  issueReportedAt: timestamp("issue_reported_at", { withTimezone: true }),
  rating: integer("rating"),
  ratingComment: text("rating_comment"),
  ratedAt: timestamp("rated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const roleRequests = appSchema.table("role_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  requestedRole: text("requested_role").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedBy: text("reviewed_by").references(() => user.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
});

export const auditLogsTable = appSchema.table("audit_logs", {
  id: serial("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => user.id),
  actorName: text("actor_name"),
  actorRoles: text("actor_roles").array(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orderItemsTable = appSchema.table(
  "order_items",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull(),
    menuItemVersion: integer("menu_item_version"),
    menuItemVersionMajor: integer("menu_item_version_major"),
    menuItemVersionMinor: integer("menu_item_version_minor"),
    menuItemGroupId: text("menu_item_group_id"),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    imageUrl: text("image_url").notNull(),
    qty: integer("qty").notNull(),
  },
  (table) => ({
    orderItemUniqueIdx: uniqueIndex("order_items_order_item_idx").on(
      table.orderId,
      table.itemId,
    ),
  }),
);
