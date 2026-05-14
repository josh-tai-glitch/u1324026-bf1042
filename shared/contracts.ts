import { z } from "zod";

// ─── API Business Schemas（Single Source of Truth）──────────────────────────
// 這裡是前後端共用的業務型別定義。
// 型別（TypeScript type）由 Zod schema 自動推導，不需要手動維護兩份。

export const menuItemSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  category: z.string().min(1),
  description: z.string(),
  image_url: z.string().min(1),
});

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(3),
  name: z.string().min(1),
  password: z.string().min(1),
  // 預留個資欄位（未來註冊/個資編輯流程會使用）
  birthday: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
});

export const sessionUserSchema = userSchema.pick({
  id: true,
  email: true,
  name: true,
});

export const orderItemSchema = z.object({
  item: menuItemSchema,
  qty: z.number().min(0),
});

export const orderSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  items: z.array(orderItemSchema),
  total: z.number().min(0),
  status: z.enum(["pending", "submitted"]),
  createdAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
});

// ─── Derived TypeScript Types（自動推導，永不過時）───────────────────────────
export type MenuItem = z.infer<typeof menuItemSchema>;
export type User = z.infer<typeof userSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;

export interface ApiDataResponse<T> {
  data: T;
}
