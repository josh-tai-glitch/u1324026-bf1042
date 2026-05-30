import { z } from "zod";

// ─── API Business Schemas（Single Source of Truth）──────────────────────────
// 這裡是前後端共用的業務型別定義。
// 型別（TypeScript type）由 Zod schema 自動推導，不需要手動維護兩份。

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
});

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

export const orderItemSchema = z.object({
  item: menuItemSchema,
  qty: z.number().min(0),
});

export const orderStatusSchema = z.enum([
  "pending",
  "submitted",
  "preparing",
  "ready",
  "completed",
]);

export const orderSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  items: z.array(orderItemSchema),
  total: z.number().min(0),
  status: orderStatusSchema,
  createdAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
});

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

// ─── Derived TypeScript Types（自動推導，永不過時）───────────────────────────
export type MenuItem = z.infer<typeof menuItemSchema>;
export type Category = z.infer<typeof categorySchema>;
export type MenuCategoryLink = z.infer<typeof menuCategoryLinkSchema>;
export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type RoleRequest = z.infer<typeof roleRequestSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type Order = z.infer<typeof orderSchema>;
export type CategorySales = z.infer<typeof categorySalesSchema>;
export type TopItemSales = z.infer<typeof topItemSalesSchema>;

export interface ApiDataResponse<T> {
  data: T;
}
