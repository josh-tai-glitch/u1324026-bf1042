import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysia/cors";
import { and, desc, eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import toTaipeiDateTime from "./util.ts";
import {
  apiErrorResponseSchema,
  apiErrorOrVersionConflictResponseSchema,
  abTestAnalyticsResponseSchema,
  auditLogLooseListResponseSchema,
  analyticsDateRangeQuerySchema,
  analyticsInsightsResponseSchema,
  analyticsTrendsResponseSchema,
  assignMenuItemCategoryBodySchema,
  assignMenuItemCategoryParamsSchema,
  analyticsSummaryResponseSchema,
  cancelOrderParamsSchema,
  categoryListResponseSchema,
  categoryParamsSchema,
  categoryResponseSchema,
  categorySalesListResponseSchema,
  createCategoryBodySchema,
  createMenuItemBodySchema,
  createPromotionBodySchema,
  createGuestOrderBodySchema,
  createRoleRequestBodySchema,
  createWalkInOrderBodySchema,
  currentUserResponseSchema,
  clearOrderIssueParamsSchema,
  deleteMenuItemParamsSchema,
  demoLoginBodySchema,
  demoLoginResponseSchema,
  demoLogoutResponseSchema,
  demoUserListResponseSchema,
  getCategoriesQuerySchema,
  getAdminRoleRequestsQuerySchema,
  getAuditLogsQuerySchema,
  getPromotionsQuerySchema,
  getOrderByIdParamsSchema,
  healthResponseSchema,
  menuItemHistoryParamsSchema,
  menuItemHistoryResponseSchema,
  menuItemResponseSchema,
  menuListResponseSchema,
  nullableOrderResponseEnvelopeSchema,
  orderListResponseSchema,
  orderResponseEnvelopeSchema,
  priceSensitivityAnalyticsResponseSchema,
  promotionListResponseSchema,
  promotionParamsSchema,
  promotionResponseSchema,
  removeMenuItemCategoryParamsSchema,
  reviewRoleRequestBodySchema,
  reviewRoleRequestParamsSchema,
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  submitOrderBodySchema,
  submitOrderParamsSchema,
  setOrderIssueBodySchema,
  setOrderIssueParamsSchema,
  toOrderResponse,
  topItemSalesListResponseSchema,
  topItemsAnalyticsQuerySchema,
  updateCategoryBodySchema,
  updateMenuItemDisplayOrderBodySchema,
  updateMenuItemDisplayOrderParamsSchema,
  updateMenuItemBodySchema,
  updateMenuItemParamsSchema,
  updateOrderBodySchema,
  updateOrderPaymentBodySchema,
  updateOrderPaymentParamsSchema,
  updateOrderRatingBodySchema,
  updateOrderRatingParamsSchema,
  updateOrderParamsSchema,
  updateOrderStatusBodySchema,
  updateOrderStatusParamsSchema,
  updatePromotionBodySchema,
  updateUserRolesBodySchema,
  updateUserRolesParamsSchema,
  userRolesResponseSchema,
} from "./shared/route-schemas.ts";
import type {
  AuditLogAction,
  AuditLogTargetType,
  DiscountType,
  OrderIssueType,
  OrderStatus,
  Role,
  RoleRequest,
} from "./shared/contracts.ts";
import { hasAnyRole, requireAnyRole, requireRole } from "./shared/guards.ts";
import {
  CategoryNotFoundError,
  CategorySlugConflictError,
  type AnalyticsDateRangeInput,
} from "./store/Store.ts";
import { createStore } from "./store/index.ts";
import { menuRepository } from "./store/menu/MenuRepository.ts";
import { auth, getCurrentUser } from "./auth/better-auth.ts";
import {
  DEMO_AUTH_COOKIE_NAME,
  DEMO_AUTH_ENABLED,
  getDemoUserById,
  listDemoUsers,
} from "./auth/demo-users.ts";
import { db } from "./db/client.ts";
import { roleRequests } from "./db/schema.ts";
import { user as authUser } from "./db/auth-schema.ts";

// Runtime configuration
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";
const store = createStore({ dataFilePath: "./data/store.json" });
const hasPublicAssets =
  existsSync("./public") && existsSync("./public/index.html");
const menuManagerRoles = ["owner", "admin"] satisfies Role[];
const orderViewerRoles = ["staff", "chef", "owner", "admin"] satisfies Role[];
const orderEditorRoles = ["staff", "owner", "admin"] satisfies Role[];
const statusUpdaterRoles = ["staff", "chef", "owner", "admin"] satisfies Role[];
const paymentUpdaterRoles = ["staff", "owner", "admin"] satisfies Role[];
const walkInOrderRoles = ["staff", "owner", "admin"] satisfies Role[];
const orderCancelManagerRoles = ["staff", "owner", "admin"] satisfies Role[];
const orderIssueReporterRoles = [
  "chef",
  "staff",
  "owner",
  "admin",
] satisfies Role[];
const orderIssueManagerRoles = ["staff", "owner", "admin"] satisfies Role[];
const nextOrderStatusByStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  submitted: "preparing",
  preparing: "ready",
  ready: "completed",
};

function canUpdateOrderStatus(
  userRoles: readonly Role[],
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
): boolean {
  if (userRoles.some((role) => role === "owner" || role === "admin")) {
    return true;
  }

  if (
    userRoles.includes("chef") &&
    ((currentStatus === "submitted" && nextStatus === "preparing") ||
      (currentStatus === "preparing" && nextStatus === "ready"))
  ) {
    return true;
  }

  return (
    userRoles.includes("staff") &&
    currentStatus === "ready" &&
    nextStatus === "completed"
  );
}

function isStandardOrderStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
): boolean {
  return nextOrderStatusByStatus[currentStatus] === nextStatus;
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRangeFromQuery(query: {
  range?: "all" | "today" | "last7Days" | "thisMonth" | "custom";
  startDate?: string;
  endDate?: string;
}): AnalyticsDateRangeInput {
  const today = new Date();

  switch (query.range ?? "all") {
    case "today": {
      const date = formatDateOnly(today);
      return { startDate: date, endDate: date };
    }
    case "last7Days": {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return {
        startDate: formatDateOnly(start),
        endDate: formatDateOnly(today),
      };
    }
    case "thisMonth": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        startDate: formatDateOnly(start),
        endDate: formatDateOnly(today),
      };
    }
    case "custom":
      return {
        startDate: query.startDate || undefined,
        endDate: query.endDate || undefined,
      };
    case "all":
    default:
      return {};
  }
}

const getAnalyticsDateRange = getDateRangeFromQuery;

function getAuditActor(user: {
  id: string;
  email?: string;
  name?: string;
  roles?: readonly Role[];
}) {
  return {
    actorUserId: user.id,
    actorName: user.name ?? user.email ?? user.id,
    actorRoles: [...(user.roles ?? [])],
  };
}

async function writeAuditLog(
  user: {
    id: string;
    email?: string;
    name?: string;
    roles?: readonly Role[];
  },
  input: {
    action: AuditLogAction;
    targetType: AuditLogTargetType;
    targetId?: string | null;
    message: string;
    metadata?: Record<string, unknown> | null;
  },
) {
  try {
    await store.appendAuditLog({
      ...getAuditActor(user),
      ...input,
    });
  } catch (error) {
    console.warn("Unable to write audit log", error);
  }
}

function respondMenuVersionChanged(
  set: { status: number },
  scope: "cart" | "menu",
  itemName?: string,
) {
  set.status = 409;
  return {
    error:
      scope === "cart"
        ? "Menu item version changed. Please refresh your cart."
        : "Menu item version changed. Please refresh menu.",
    code: "MENU_VERSION_CHANGED" as const,
    ...(itemName ? { itemName } : {}),
  };
}

function normalizePromotionCodeForApi(code: string) {
  return code.trim().toUpperCase();
}

function isPromotionDiscountValueValid(
  discountType: DiscountType,
  discountValue: number,
) {
  if (discountType === "percent") {
    return discountValue >= 1 && discountValue <= 100;
  }
  return discountValue > 0;
}

function respondPromotionStoreError(
  set: { status: number },
  code:
    | "PROMOTION_NOT_FOUND"
    | "PROMOTION_INACTIVE"
    | "PROMOTION_MIN_ORDER_NOT_MET"
    | "PROMOTION_NOT_STARTED"
    | "PROMOTION_EXPIRED"
    | "PROMOTION_USAGE_LIMIT_REACHED"
    | "INVALID_PROMOTION",
  promoCode?: string | null,
) {
  const normalizedCode = promoCode ? normalizePromotionCodeForApi(promoCode) : "";
  const promotion = normalizedCode
    ? store
        .getPromotions({ status: "all" })
        .find((candidate) => candidate.code === normalizedCode)
    : undefined;
  switch (code) {
    case "PROMOTION_NOT_FOUND":
      set.status = 404;
      return { error: "Promotion code not found" };
    case "PROMOTION_INACTIVE":
      set.status = 409;
      return { error: "Promotion code is inactive" };
    case "PROMOTION_MIN_ORDER_NOT_MET":
      set.status = 409;
      return {
        error: `Minimum order amount for ${
          promotion?.code ?? (normalizedCode || "this promo code")
        } is $${promotion?.minOrderAmount ?? 0}.`,
      };
    case "PROMOTION_NOT_STARTED":
      set.status = 409;
      return { error: `Promo code ${promotion?.code ?? normalizedCode} is not active yet.` };
    case "PROMOTION_EXPIRED":
      set.status = 409;
      return { error: `Promo code ${promotion?.code ?? normalizedCode} has expired.` };
    case "PROMOTION_USAGE_LIMIT_REACHED":
      set.status = 409;
      return {
        error: `Promo code ${promotion?.code ?? normalizedCode} has reached its usage limit.`,
      };
    case "INVALID_PROMOTION":
      set.status = 400;
      return { error: "Invalid promotion" };
  }
}

function maskPhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}

function ensureDemoEnabled(set: { status: number }) {
  if (!DEMO_AUTH_ENABLED) {
    set.status = 404;
    return false;
  }

  return true;
}

function serializeDemoAuthCookie(userId: string, maxAge: number) {
  const cookieParts = [
    `${DEMO_AUTH_COOKIE_NAME}=${encodeURIComponent(userId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (process.env.NODE_ENV === "production") {
    cookieParts.push("Secure");
  }

  return cookieParts.join("; ");
}

async function upsertDemoUser(user: {
  id: string;
  email: string;
  name: string;
  roles: readonly Role[];
}) {
  const now = new Date();
  await db
    .insert(authUser)
    .values({
      id: user.id,
      email: user.email,
      name: user.name,
      roles: [...user.roles],
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: authUser.id,
      set: {
        email: user.email,
        name: user.name,
        roles: [...user.roles],
        emailVerified: true,
        updatedAt: now,
      },
    });
}

function toVisibleOrderResponse(
  order: Parameters<typeof toOrderResponse>[0],
  user: { roles: readonly Role[] } | null,
) {
  if (user?.roles.some((role) => orderViewerRoles.includes(role))) {
    return toOrderResponse(order);
  }

  return toOrderResponse({
    ...order,
    issueType: null,
    issueNote: null,
    issueReportedBy: null,
    issueReportedAt: null,
  });
}

function toRoleRequestResponse(
  row: typeof roleRequests.$inferSelect,
): RoleRequest {
  return {
    id: row.id,
    userId: row.userId,
    requestedRole: row.requestedRole as Role,
    reason: row.reason,
    status: row.status as RoleRequest["status"],
    requestedAt:
      row.requestedAt instanceof Date
        ? row.requestedAt.toISOString()
        : new Date(row.requestedAt).toISOString(),
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt
      ? row.reviewedAt instanceof Date
        ? row.reviewedAt.toISOString()
        : new Date(row.reviewedAt).toISOString()
      : null,
    reviewNote: row.reviewNote,
  };
}

// Auth helper
// Protect routes and return the current user, or throw a JSON 401 response.
async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

const app = new Elysia();

// CORS plugin
app.use(
  cors({
    origin:
      allowedOrigin === "*" ? "*" : allowedOrigin || "http://localhost:5173",
    credentials: allowedOrigin !== "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Better Auth routes
// Auth / session routes
// Better Auth exposes a standard fetch handler, so the wildcard routes are
// defined explicitly instead of using Elysia mount.
//
// Keep these before the API routes so Better Auth paths match first.
app.get("/api/auth/*", ({ request }) => auth.handler(request));
app.post("/api/auth/*", ({ request }) => auth.handler(request));

app.get(
  "/api/me",
  async ({ request, set }) => {
    const user = await getCurrentUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    return { data: user };
  },
  {
    detail: {
      tags: ["auth"],
      summary: "Get current user",
      description: "Return the current signed-in user with database roles.",
    },
    response: {
      200: currentUserResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/dev/demo-users",
  ({ set }) => {
    if (!ensureDemoEnabled(set)) {
      return { error: "Not found" };
    }

    return { data: listDemoUsers() };
  },
  {
    detail: {
      tags: ["auth"],
      summary: "List demo login users",
      description: "Return classroom/demo users when demo auth is enabled.",
    },
    response: {
      200: demoUserListResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.post(
  "/api/dev/demo-login",
  async ({ body, set }) => {
    if (!ensureDemoEnabled(set)) {
      return { error: "Not found" };
    }

    const input = body as { userId: string };
    const demoUser = getDemoUserById(input.userId);
    if (!demoUser) {
      set.status = 404;
      return { error: "Demo user not found" };
    }

    await upsertDemoUser(demoUser);
    set.headers["Set-Cookie"] = serializeDemoAuthCookie(demoUser.id, 86400);
    return { data: demoUser };
  },
  {
    body: demoLoginBodySchema,
    detail: {
      tags: ["auth"],
      summary: "Demo login",
      description: "Set an HttpOnly demo auth cookie for classroom/demo use.",
    },
    response: {
      200: demoLoginResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.post(
  "/api/dev/demo-logout",
  ({ set }) => {
    if (!ensureDemoEnabled(set)) {
      return { error: "Not found" };
    }

    set.headers["Set-Cookie"] = serializeDemoAuthCookie("", 0);
    return { data: true };
  },
  {
    detail: {
      tags: ["auth"],
      summary: "Demo logout",
      description: "Clear the classroom/demo auth cookie.",
    },
    response: {
      200: demoLogoutResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// OpenAPI plugin
app.use(
  openapi({
    path: "/openapi",
    specPath: "/openapi/json",
    documentation: {
      info: {
        title: "Breakfast Demo API",
        version: "0.2.3",
        description:
          "Breakfast ordering demo API for teaching route schema, contract-first design, and future database/auth upgrades. V9-clean-better-auth-v3: optimized static handling, CORS plugin, and Better Auth macro integration.",
      },
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "menu", description: "Menu management endpoints" },
        { name: "categories", description: "Category management endpoints" },
        { name: "orders", description: "Order query and mutation endpoints" },
        { name: "users", description: "User profile and role requests" },
        { name: "admin", description: "Admin role management endpoints" },
        { name: "system", description: "System and health check endpoints" },
      ],
    },
    exclude: {
      staticFile: true,
      paths: ["/openapi", "/openapi/json"],
    },
  }),
);

// Request logger
app.onRequest(({ request }) => {
  console.log(
    `[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`,
  );
});

// API routes

// Sign-out proxy
// Better Auth sign-out checks CSRF origin against trusted origins. This proxy
// forwards the request with the configured Better Auth origin so production
// sign-out still works when the app origin differs.
//
// Session identity still comes from the cookie; only the server-side origin is
// normalized for Better Auth.
app.post("/api/sign-out", async ({ request }) => {
  const baBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  // Copy headers and force the origin to Better Auth's trusted base URL.
  const proxiedHeaders = new Headers(request.headers);
  proxiedHeaders.set("origin", baBaseUrl);

  const proxiedRequest = new Request(`${baBaseUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: proxiedHeaders,
  });

  const res = await auth.handler(proxiedRequest);
  if (!res.ok) {
    const body = await res
      .clone()
      .text()
      .catch(() => "(unreadable)");
    console.error(`[sign-out proxy] Better Auth returned ${res.status}:`, body);
  }
  return res;
});

// Menu and category routes
// Categories
app.get("/api/categories", ({ query }) => {
  const status =
    (query as { status?: "active" | "inactive" | "all" }).status ?? "active";
  return { data: [...store.getCategories({ status })] };
}, {
  query: getCategoriesQuerySchema,
  detail: {
    tags: ["categories"],
    summary: "List categories",
    description: "Return menu categories filtered by active state.",
  },
  response: {
    200: categoryListResponseSchema,
  },
});

app.post(
  "/api/categories",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const input = body as {
      name: string;
      slug: string;
      description?: string;
      displayOrder?: number;
      isActive?: boolean;
    };
    let category;
    try {
      category = await store.createCategory(input);
    } catch (error) {
      if (error instanceof CategorySlugConflictError) {
        set.status = 409;
        return { error: "Category slug already exists" };
      }
      throw error;
    }

    set.status = 201;
    await writeAuditLog(user, {
      action: "category_create",
      targetType: "category",
      targetId: String(category.id),
      message: `Created category ${category.name}`,
      metadata: {
        name: category.name,
        slug: category.slug,
        isActive: category.isActive,
      },
    });
    return { data: category };
  },
  {
    body: createCategoryBodySchema,
    detail: {
      tags: ["categories"],
      summary: "Create a category",
      description: "Create a menu category.",
    },
    response: {
      201: categoryResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/categories/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const categoryId = parseInt(params.id, 10);
    const patch = body as {
      name?: string;
      slug?: string;
      description?: string | null;
      displayOrder?: number;
      isActive?: boolean;
    };
    let category;
    try {
      category = await store.updateCategory(categoryId, patch);
    } catch (error) {
      if (error instanceof CategorySlugConflictError) {
        set.status = 409;
        return { error: "Category slug already exists" };
      }
      throw error;
    }

    if (!category) {
      set.status = 404;
      return { error: "Category not found" };
    }

    await writeAuditLog(user, {
      action: "category_update",
      targetType: "category",
      targetId: String(category.id),
      message: `Updated category ${category.name}`,
      metadata: {
        patchKeys: Object.keys(patch),
        isActive: category.isActive,
      },
    });
    return { data: category };
  },
  {
    params: categoryParamsSchema,
    body: updateCategoryBodySchema,
    detail: {
      tags: ["categories"],
      summary: "Update a category",
      description: "Update fields of an existing category.",
    },
    response: {
      200: categoryResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/categories/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const categoryId = parseInt(params.id, 10);
    const category = await store.deleteCategory(categoryId);

    if (!category) {
      set.status = 404;
      return { error: "Category not found" };
    }

    await writeAuditLog(user, {
      action: "category_delete",
      targetType: "category",
      targetId: String(category.id),
      message: `Deleted/deactivated category ${category.name}`,
      metadata: {
        name: category.name,
        slug: category.slug,
        isActive: category.isActive,
      },
    });
    return { data: category };
  },
  {
    params: categoryParamsSchema,
    detail: {
      tags: ["categories"],
      summary: "Deactivate a category",
      description: "Soft deactivate a category.",
    },
    response: {
      200: categoryResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// Promotions
app.get(
  "/api/admin/promotions",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const status =
      (query as { status?: "active" | "inactive" | "all" }).status ?? "active";
    return { data: [...store.getPromotions({ status })] };
  },
  {
    query: getPromotionsQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "List promotions",
      description: "Return promotion codes filtered by active state.",
    },
    response: {
      200: promotionListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.post(
  "/api/admin/promotions",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const input = body as {
      code: string;
      discountType: DiscountType;
      discountValue: number;
      minOrderAmount?: number;
      startsAt?: string | null;
      endsAt?: string | null;
      usageLimit?: number | null;
    };
    const code = normalizePromotionCodeForApi(input.code);
    const duplicate = store
      .getPromotions({ status: "all" })
      .some((promotion) => promotion.code === code);
    if (duplicate) {
      set.status = 409;
      return { error: "Promotion code already exists" };
    }
    if (!isPromotionDiscountValueValid(input.discountType, input.discountValue)) {
      set.status = 400;
      return { error: "Invalid promotion discount value" };
    }

    const promotion = await store.createPromotion({
      code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderAmount: input.minOrderAmount ?? 0,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      usageLimit: input.usageLimit ?? null,
    });

    set.status = 201;
    await writeAuditLog(user, {
      action: "promotion_create",
      targetType: "promotion",
      targetId: String(promotion.id),
      message: `Created promotion ${promotion.code}`,
      metadata: {
        code: promotion.code,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        minOrderAmount: promotion.minOrderAmount,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
        usageLimit: promotion.usageLimit,
      },
    });
    return { data: promotion };
  },
  {
    body: createPromotionBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Create promotion",
      description: "Create a promotion code for order checkout.",
    },
    response: {
      201: promotionResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/promotions/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const promotionId = Number.parseInt(params.id, 10);
    const currentPromotion = store
      .getPromotions({ status: "all" })
      .find((promotion) => promotion.id === promotionId);
    if (!currentPromotion) {
      set.status = 404;
      return { error: "Promotion not found" };
    }

    const patch = body as {
      code?: string;
      discountType?: DiscountType;
      discountValue?: number;
      minOrderAmount?: number;
      startsAt?: string | null;
      endsAt?: string | null;
      usageLimit?: number | null;
      isActive?: boolean;
    };
    if (patch.code !== undefined) {
      const code = normalizePromotionCodeForApi(patch.code);
      const duplicate = store
        .getPromotions({ status: "all" })
        .some(
          (promotion) =>
            promotion.id !== promotionId && promotion.code === code,
        );
      if (duplicate) {
        set.status = 409;
        return { error: "Promotion code already exists" };
      }
      patch.code = code;
    }

    const nextDiscountType = patch.discountType ?? currentPromotion.discountType;
    const nextDiscountValue =
      patch.discountValue ?? currentPromotion.discountValue;
    if (!isPromotionDiscountValueValid(nextDiscountType, nextDiscountValue)) {
      set.status = 400;
      return { error: "Invalid promotion discount value" };
    }
    const nextStartsAt =
      patch.startsAt !== undefined ? patch.startsAt : currentPromotion.startsAt;
    const nextEndsAt =
      patch.endsAt !== undefined ? patch.endsAt : currentPromotion.endsAt;
    if (
      nextStartsAt &&
      nextEndsAt &&
      Date.parse(nextStartsAt) > Date.parse(nextEndsAt)
    ) {
      set.status = 400;
      return { error: "Promotion end time must be after start time." };
    }

    const promotion = await store.updatePromotion(promotionId, patch);
    if (!promotion) {
      set.status = 404;
      return { error: "Promotion not found" };
    }

    await writeAuditLog(user, {
      action: "promotion_update",
      targetType: "promotion",
      targetId: String(promotion.id),
      message: `Updated promotion ${promotion.code}`,
      metadata: {
        patchKeys: Object.keys(patch),
        code: promotion.code,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        minOrderAmount: promotion.minOrderAmount,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
        usageLimit: promotion.usageLimit,
        isActive: promotion.isActive,
      },
    });
    return { data: promotion };
  },
  {
    params: promotionParamsSchema,
    body: updatePromotionBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Update promotion",
      description: "Update a promotion code.",
    },
    response: {
      200: promotionResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/admin/promotions/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const promotion = await store.deletePromotion(Number.parseInt(params.id, 10));
    if (!promotion) {
      set.status = 404;
      return { error: "Promotion not found" };
    }

    await writeAuditLog(user, {
      action: "promotion_delete",
      targetType: "promotion",
      targetId: String(promotion.id),
      message: `Deactivated promotion ${promotion.code}`,
      metadata: {
        code: promotion.code,
        isActive: promotion.isActive,
      },
    });
    return { data: promotion };
  },
  {
    params: promotionParamsSchema,
    detail: {
      tags: ["admin"],
      summary: "Deactivate promotion",
      description: "Soft deactivate a promotion code.",
    },
    response: {
      200: promotionResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// Public menu / menu management
app.get("/api/menu", async ({ request }) => {
  const user = await getCurrentUser(request);
  const canSeeAllMenuItems = user?.roles.some((role) =>
    role === "owner" || role === "admin" || role === "staff"
  );
  if (canSeeAllMenuItems) {
    return { data: [...store.getCurrentMenu()] };
  }

  const abTestGroup = menuRepository.resolveAbTestGroupForUserId(user?.id);
  return { data: [...store.getCurrentMenu({ abTestGroup })] };
}, {
  detail: {
    tags: ["menu"],
    summary: "List menu items",
    description: "Return all available breakfast menu items.",
  },
  response: {
    200: menuListResponseSchema,
  },
});

app.post(
  "/api/menu",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const input = body as {
      name: string;
      price: number;
      category: string;
      primaryCategoryId?: number;
      description: string;
      image_url: string;
      isAvailable?: boolean;
      abTestGroup?: "control" | "variant_a" | "variant_b" | null;
    };
    input.isAvailable = input.isAvailable ?? true;
    let newMenuItem;
    try {
      newMenuItem = await store.createMenuItem(input);
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        set.status = 404;
        return { error: "Category not found" };
      }
      throw error;
    }
    set.status = 201;
    await writeAuditLog(user, {
      action: "menu_create",
      targetType: "menu_item",
      targetId: String(newMenuItem.id),
      message: `Created menu item ${newMenuItem.name}`,
      metadata: {
        name: newMenuItem.name,
        price: newMenuItem.price,
        category: newMenuItem.category,
        primaryCategoryId: newMenuItem.primary_category_id,
        isAvailable: newMenuItem.is_available,
        abTestGroup: newMenuItem.ab_test_group,
        version: newMenuItem.version,
        menuItemGroupId: newMenuItem.menu_item_group_id,
      },
    });
    return { data: newMenuItem };
  },
  {
    body: createMenuItemBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Create a menu item",
      description: "Add a new menu item into the breakfast menu.",
    },
    response: {
      201: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const menuId = parseInt(params.id);
    const patch = body as {
      name?: string;
      price?: number;
      category?: string;
      primaryCategoryId?: number | null;
      description?: string;
      image_url?: string;
      isAvailable?: boolean;
      abTestGroup?: "control" | "variant_a" | "variant_b" | null;
      changeReason?: string;
      changedBy?: string;
    };
    patch.changedBy = user.id;
    const previousMenuItem = store
      .getMenu()
      .find((item) => item.id === menuId);
    let menuItem;
    try {
      menuItem = await store.updateMenuItem(menuId, patch);
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        set.status = 404;
        return { error: "Category not found" };
      }
      throw error;
    }

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    const auditAction: AuditLogAction =
      patch.isAvailable !== undefined
        ? "menu_availability_update"
        : patch.abTestGroup !== undefined
          ? "menu_ab_test_update"
          : "menu_update";
    const auditMessage =
      auditAction === "menu_availability_update"
        ? `Availability updated for ${menuItem.name}`
        : auditAction === "menu_ab_test_update"
          ? `A/B group updated for ${menuItem.name}`
          : `Menu item updated: ${menuItem.name}`;
    await writeAuditLog(user, {
      action: auditAction,
      targetType: "menu_item",
      targetId: String(menuItem.id),
      message: auditMessage,
      metadata: {
        patchKeys: Object.keys(patch),
        name: menuItem.name,
        price: menuItem.price,
        category: menuItem.category,
        isAvailable: menuItem.is_available,
        previousAbTestGroup: previousMenuItem?.ab_test_group ?? null,
        abTestGroup: menuItem.ab_test_group,
        version: menuItem.version,
        versionMajor: menuItem.version_major,
        versionMinor: menuItem.version_minor,
        semanticVersion: `v${menuItem.version_major}.${menuItem.version_minor}`,
        previousVersionId: menuItem.previous_version_id,
        menuItemGroupId: menuItem.menu_item_group_id,
        changeReason: menuItem.change_reason,
      },
    });
    return { data: menuItem };
  },
  {
    params: updateMenuItemParamsSchema,
    body: updateMenuItemBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Update a menu item",
      description: "Update fields of an existing menu item.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/:id/display-order",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const menuId = parseInt(params.id, 10);
    const input = body as { displayOrder: number };
    const menuItem = await store.updateMenuItemDisplayOrder(
      menuId,
      input.displayOrder,
    );

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    await writeAuditLog(user, {
      action: "menu_display_order_update",
      targetType: "menu_item",
      targetId: String(menuItem.id),
      message: `Display order updated for ${menuItem.name}`,
      metadata: {
        menuItemId: menuItem.id,
        displayOrder: menuItem.display_order,
        version: menuItem.version,
        menuItemGroupId: menuItem.menu_item_group_id,
      },
    });
    return { data: menuItem };
  },
  {
    params: updateMenuItemDisplayOrderParamsSchema,
    body: updateMenuItemDisplayOrderBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Update menu item display order",
      description:
        "Update the display order of a current menu item without creating a new version.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/menu/:id/history",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const menuId = parseInt(params.id, 10);
    const history = store.getMenuItemVersionHistoryById(menuId);
    if (history.length === 0) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: history };
  },
  {
    params: menuItemHistoryParamsSchema,
    detail: {
      tags: ["menu"],
      summary: "Get menu item version history",
      description: "Return all versions for a logical menu item.",
    },
    response: {
      200: menuItemHistoryResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/menu/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const menuId = parseInt(params.id);
    const removedMenuItem = await store.deleteMenuItem(menuId);

    if (!removedMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    await writeAuditLog(user, {
      action: "menu_delete",
      targetType: "menu_item",
      targetId: String(removedMenuItem.id),
      message: `Deleted menu item ${removedMenuItem.name}`,
      metadata: {
        name: removedMenuItem.name,
        price: removedMenuItem.price,
        category: removedMenuItem.category,
      },
    });
    return { data: removedMenuItem };
  },
  {
    params: deleteMenuItemParamsSchema,
    detail: {
      tags: ["menu"],
      summary: "Delete a menu item",
      description: "Remove a menu item by id.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// Menu item category routes
app.post(
  "/api/menu/:id/categories",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const menuId = parseInt(params.id, 10);
    const input = body as { categoryId: number };
    const menuItem = await store.addCategoryToMenuItem(menuId, input.categoryId);

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item or category not found" };
    }

    await writeAuditLog(user, {
      action: "menu_category_assign",
      targetType: "menu_item_category",
      targetId: `${menuId}:${input.categoryId}`,
      message: `Assigned category to menu item #${menuId}`,
      metadata: { menuId, categoryId: input.categoryId },
    });
    return { data: menuItem };
  },
  {
    params: assignMenuItemCategoryParamsSchema,
    body: assignMenuItemCategoryBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Assign category to menu item",
      description: "Add an active category link to a menu item.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/menu/:id/categories/:categoryId",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const menuId = parseInt(params.id, 10);
    const categoryId = parseInt(params.categoryId, 10);
    const menuItem = await store.removeCategoryFromMenuItem(menuId, categoryId);

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item or category not found" };
    }

    await writeAuditLog(user, {
      action: "menu_category_remove",
      targetType: "menu_item_category",
      targetId: `${menuId}:${categoryId}`,
      message: `Removed category from menu item #${menuId}`,
      metadata: { menuId, categoryId },
    });
    return { data: menuItem };
  },
  {
    params: removeMenuItemCategoryParamsSchema,
    detail: {
      tags: ["menu"],
      summary: "Remove category from menu item",
      description: "Soft remove an active category link from a menu item.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// Customer orders / cart
app.get(
  "/api/orders",
  async ({ request }) => {
    const user = await requireUser(request);
    const orders = hasAnyRole(user, orderViewerRoles)
      ? store.getOrders()
      : store.getOrders().filter((order) => order.userId === user.id);
    const submittedOrders = orders.filter((order) => order.status !== "pending");

    return {
      data: submittedOrders.map((order) => toVisibleOrderResponse(order, user)),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "List visible orders",
      description:
        "Return all orders for staff roles, or only the current user's orders.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// Current cart order
app.get(
  "/api/orders/current",
  async ({ request }) => {
    const user = await requireUser(request);
    const currentOrder = store.getCurrentOrderByUserId(user.id);
    return {
      data: currentOrder ? toVisibleOrderResponse(currentOrder, user) : null,
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get current order",
      description:
        "Return the current pending order of a user, or null if none exists.",
    },
    response: {
      200: nullableOrderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// Customer order history
app.get(
  "/api/orders/history",
  async ({ request }) => {
    const user = await requireUser(request);
    return {
      data: store
        .getOrderHistoryByUserId(user.id)
        .map((order) => toVisibleOrderResponse(order, user)),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get order history",
      description:
        "Return submitted and later order states belonging to a user.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// Create pending order
app.post(
  "/api/orders",
  async ({ request, set }) => {
    const user = await requireUser(request);
    const existingOrder = store.getCurrentOrderByUserId(user.id);
    if (existingOrder) {
      return { data: toVisibleOrderResponse(existingOrder, user) };
    }

    const newOrder = await store.createOrder({ userId: user.id });
    set.status = 201;
    return { data: toVisibleOrderResponse(newOrder, user) };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Create or reuse current order",
      description:
        "Create a new pending order, or return the existing pending order for the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      201: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// Walk-in order
// Manager orders / order operations
app.post(
  "/api/orders/walk-in",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, walkInOrderRoles);
    const input = body as {
      orderSource?: "walk_in" | "phone";
      guestName?: string | null;
      guestPhone?: string | null;
      items: Array<{ itemId: number; qty: number; menuItemVersion?: number }>;
      fulfillmentType: "dine_in" | "takeout";
      customerNote?: string | null;
      pickupTime?: string | null;
      paymentMethod: "cash" | "card" | "online";
      paymentStatus?: "unpaid" | "paid";
      promoCode?: string | null;
    };

    const result = await store.createWalkInOrder({
      staffUserId: user.id,
      orderSource: input.orderSource ?? "walk_in",
      guestName: input.guestName ?? null,
      guestPhone: input.guestPhone ?? null,
      items: input.items,
      fulfillmentType: input.fulfillmentType,
      customerNote: input.customerNote ?? null,
      pickupTime: input.pickupTime ?? null,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus ?? "unpaid",
      promoCode: input.promoCode ?? null,
      abTestGroup: "control",
    });

    if (result.ok === false) {
      switch (result.code) {
        case "EMPTY_ORDER":
          set.status = 400;
          return { error: "Empty order cannot be submitted" };
        case "MENU_ITEM_NOT_FOUND":
          set.status = 404;
          return { error: "Menu item not found" };
        case "MENU_VERSION_CHANGED":
          return respondMenuVersionChanged(set, "menu", result.itemName);
        case "MENU_ITEM_UNAVAILABLE":
          set.status = 409;
          return { error: "Menu item is unavailable" };
        case "PROMOTION_NOT_FOUND":
        case "PROMOTION_INACTIVE":
        case "PROMOTION_MIN_ORDER_NOT_MET":
        case "PROMOTION_NOT_STARTED":
        case "PROMOTION_EXPIRED":
        case "PROMOTION_USAGE_LIMIT_REACHED":
        case "INVALID_PROMOTION":
          return respondPromotionStoreError(set, result.code, input.promoCode);
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    set.status = 201;
    const sourceLabel =
      result.order.orderSource === "phone" ? "phone" : "walk-in";
    const orderCreateAction: AuditLogAction =
      result.order.orderSource === "phone"
        ? "phone_order_create"
        : "walk_in_order_create";
    await writeAuditLog(user, {
      action: orderCreateAction,
      targetType: "order",
      targetId: String(result.order.id),
      message: `Created ${sourceLabel} order #${result.order.id}`,
      metadata: {
        orderSource: result.order.orderSource,
        guestName: result.order.guestName,
        guestPhone: maskPhoneNumber(result.order.guestPhone),
        hasGuestPhone: Boolean(result.order.guestPhone),
        itemCount: result.order.items.length,
        subtotal: result.order.subtotal,
        discountAmount: result.order.discountAmount,
        total: result.order.total,
        promoCode: result.order.promoCode,
        fulfillmentType: result.order.fulfillmentType,
        paymentMethod: result.order.paymentMethod,
        paymentStatus: result.order.paymentStatus,
      },
    });
    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    body: createWalkInOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Create walk-in order",
      description: "Create a submitted order for a counter guest.",
    },
    response: {
      201: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorOrVersionConflictResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// Guest checkout
app.post(
  "/api/orders/guest",
  async ({ body, set }) => {
    const input = body as {
      guestName: string;
      guestPhone: string;
      items: Array<{ itemId: number; qty: number; menuItemVersion?: number }>;
      fulfillmentType: "dine_in" | "takeout";
      customerNote?: string | null;
      pickupTime?: string | null;
      paymentMethod: "cash" | "card" | "online";
      promoCode?: string | null;
    };

    const result = await store.createGuestOrder({
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      items: input.items,
      fulfillmentType: input.fulfillmentType,
      customerNote: input.customerNote ?? null,
      pickupTime: input.pickupTime ?? null,
      paymentMethod: input.paymentMethod,
      promoCode: input.promoCode ?? null,
    });

    if (result.ok === false) {
      switch (result.code) {
        case "EMPTY_ORDER":
          set.status = 400;
          return { error: "Empty order cannot be submitted" };
        case "MENU_ITEM_NOT_FOUND":
          set.status = 404;
          return { error: "Menu item not found" };
        case "MENU_VERSION_CHANGED":
          return respondMenuVersionChanged(set, "cart", result.itemName);
        case "MENU_ITEM_UNAVAILABLE":
          set.status = 409;
          return { error: "Menu item is unavailable" };
        case "PROMOTION_NOT_FOUND":
        case "PROMOTION_INACTIVE":
        case "PROMOTION_MIN_ORDER_NOT_MET":
        case "PROMOTION_NOT_STARTED":
        case "PROMOTION_EXPIRED":
        case "PROMOTION_USAGE_LIMIT_REACHED":
        case "INVALID_PROMOTION":
          return respondPromotionStoreError(set, result.code, input.promoCode);
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    set.status = 201;
    return { data: toVisibleOrderResponse(result.order, null) };
  },
  {
    body: createGuestOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Create guest checkout order",
      description:
        "Create a submitted order for an unauthenticated guest checkout.",
    },
    response: {
      201: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorOrVersionConflictResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/orders/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (order.userId !== user.id && !hasAnyRole(user, orderViewerRoles)) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    return { data: toVisibleOrderResponse(order, user) };
  },
  {
    params: getOrderByIdParamsSchema,
    detail: {
      tags: ["orders"],
      summary: "Get order by id",
      description:
        "Return a single order when it belongs to the requested user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// Update order item quantity
app.patch(
  "/api/orders/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (order.userId !== user.id && !hasAnyRole(user, orderEditorRoles)) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    const patch = body as { itemId: number; qty: number };
    const result = await store.updateOrderItem(orderId, {
      userId: order.userId ?? user.id,
      itemId: patch.itemId,
      qty: patch.qty,
    });

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "MENU_ITEM_NOT_FOUND":
          set.status = 404;
          return { error: "Menu item not found" };
        case "MENU_VERSION_CHANGED":
          return respondMenuVersionChanged(set, "cart", result.itemName);
        case "MENU_ITEM_UNAVAILABLE":
          set.status = 409;
          return { error: "Menu item is unavailable" };
        case "ORDER_NOT_OWNED":
          set.status = 403;
          return { error: "Forbidden" };
        case "ORDER_NOT_EDITABLE":
          set.status = 409;
          return { error: "Order is not editable" };
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    params: updateOrderParamsSchema,
    body: updateOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Update order item quantity",
      description: "Set the quantity of a menu item within a pending order.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorOrVersionConflictResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// Update order status
app.patch(
  "/api/orders/:id/status",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    const input = body as { status: OrderStatus };
    const allowAnyTransition = hasAnyRole(user, menuManagerRoles);

    if (input.status === "pending") {
      set.status = 409;
      return { error: "Order status cannot be changed back to pending" };
    }

    if (input.status === "cancelled") {
      set.status = 409;
      return { error: "Use the cancel order endpoint" };
    }

    if (order.status === "cancelled") {
      set.status = 409;
      return { error: "Cancelled order status is locked" };
    }

    if (!allowAnyTransition && !hasAnyRole(user, statusUpdaterRoles)) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (
      !allowAnyTransition &&
      isStandardOrderStatusTransition(order.status, input.status) &&
      !canUpdateOrderStatus(user.roles, order.status, input.status)
    ) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    const previousStatus = order.status;
    const result = await store.updateOrderStatus(orderId, {
      status: input.status,
      allowAnyTransition,
    });

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "INVALID_STATUS_TRANSITION":
          set.status = 409;
          return { error: "Invalid status transition" };
        case "ORDER_STATUS_LOCKED":
          set.status = 409;
          return { error: "Order status is locked" };
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    await writeAuditLog(user, {
      action: "order_status_update",
      targetType: "order",
      targetId: String(result.order.id),
      message: `Updated order #${result.order.id} status to ${result.order.status}`,
      metadata: {
        previousStatus,
        status: result.order.status,
      },
    });
    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    params: updateOrderStatusParamsSchema,
    body: updateOrderStatusBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Update order status",
      description: "Move a submitted order through kitchen and pickup states.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorOrVersionConflictResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id/cancel",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    const allowManagerCancel = hasAnyRole(user, orderCancelManagerRoles);
    if (!allowManagerCancel && user.roles.includes("chef")) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    const previousStatus = order.status;
    const result = await store.cancelOrder(orderId, {
      userId: user.id,
      allowManagerCancel,
    });

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "ORDER_NOT_OWNED":
          set.status = 403;
          return { error: "Forbidden" };
        case "ORDER_NOT_CANCELLABLE":
          set.status = 409;
          return { error: "Order cannot be cancelled" };
        case "ORDER_ALREADY_CANCELLED":
          set.status = 409;
          return { error: "Order already cancelled" };
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    await writeAuditLog(user, {
      action: "order_cancel",
      targetType: "order",
      targetId: String(result.order.id),
      message: `Cancelled order #${result.order.id}`,
      metadata: { previousStatus },
    });
    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    params: cancelOrderParamsSchema,
    detail: {
      tags: ["orders"],
      summary: "Cancel order",
      description:
        "Cancel a submitted order by the customer, or void an active order from the counter.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorOrVersionConflictResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id/issue",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    if (!hasAnyRole(user, orderIssueReporterRoles)) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    const orderId = parseInt(params.id, 10);
    const input = body as {
      issueType: OrderIssueType;
      issueNote?: string | null;
    };
    const allowManagerIssue = hasAnyRole(user, orderIssueManagerRoles);

    const result = await store.setOrderIssue(orderId, {
      issueType: input.issueType,
      issueNote: input.issueNote ?? null,
      reportedBy: user.id,
      allowManagerIssue,
    });

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "ORDER_ISSUE_NOT_EDITABLE":
          set.status = 409;
          return { error: "Order issue is not editable" };
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    await writeAuditLog(user, {
      action: "order_issue_set",
      targetType: "order",
      targetId: String(result.order.id),
      message: `Set issue on order #${result.order.id}`,
      metadata: {
        issueType: input.issueType,
        hasIssueNote: Boolean(input.issueNote),
      },
    });
    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    params: setOrderIssueParamsSchema,
    body: setOrderIssueBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Set order issue",
      description:
        "Report an internal kitchen or counter issue for an active order.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorOrVersionConflictResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/orders/:id/issue",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, orderIssueManagerRoles);

    const orderId = parseInt(params.id, 10);
    const result = await store.clearOrderIssue(orderId, { userId: user.id });

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "ORDER_ISSUE_NOT_EDITABLE":
          set.status = 409;
          return { error: "Order issue is not editable" };
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    await writeAuditLog(user, {
      action: "order_issue_clear",
      targetType: "order",
      targetId: String(result.order.id),
      message: `Cleared issue on order #${result.order.id}`,
      metadata: {},
    });
    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    params: clearOrderIssueParamsSchema,
    detail: {
      tags: ["orders"],
      summary: "Clear order issue",
      description: "Clear an internal order issue from the counter.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorOrVersionConflictResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id/rating",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const input = body as {
      rating: number;
      ratingComment?: string | null;
    };

    const result = await store.updateOrderRating(orderId, {
      userId: user.id,
      rating: input.rating,
      ratingComment: input.ratingComment ?? null,
    });

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "ORDER_NOT_OWNED":
          set.status = 403;
          return { error: "Forbidden" };
        case "ORDER_NOT_COMPLETED":
          set.status = 409;
          return { error: "Order is not completed" };
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    await writeAuditLog(user, {
      action: "order_rating_update",
      targetType: "order",
      targetId: String(result.order.id),
      message: `Rating updated for order #${result.order.id}`,
      metadata: {
        rating: input.rating,
        hasRatingComment: Boolean(input.ratingComment),
      },
    });
    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    params: updateOrderRatingParamsSchema,
    body: updateOrderRatingBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Update order rating",
      description: "Save or update a customer rating for a completed order.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id/payment",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, paymentUpdaterRoles);

    const orderId = parseInt(params.id, 10);
    const input = body as { paymentStatus: "paid" };
    const result = await store.updateOrderPaymentStatus(orderId, {
      paymentStatus: input.paymentStatus,
    });

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "ORDER_NOT_SUBMITTED":
          set.status = 400;
          return { error: "Order is not submitted" };
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    await writeAuditLog(user, {
      action: "order_payment_update",
      targetType: "order",
      targetId: String(result.order.id),
      message: `Marked order #${result.order.id} payment as paid`,
      metadata: { paymentStatus: result.order.paymentStatus },
    });
    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    params: updateOrderPaymentParamsSchema,
    body: updateOrderPaymentBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Update order payment status",
      description: "Mark a submitted order as paid from the counter.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.post(
  "/api/orders/:id/submit",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const input = body as {
      fulfillmentType: "dine_in" | "takeout";
      customerNote?: string | null;
      pickupTime?: string | null;
      paymentMethod: "cash" | "card" | "online";
      paymentStatus?: "unpaid" | "paid";
      promoCode?: string | null;
    };
    const abTestGroup = menuRepository.resolveAbTestGroupForUserId(user.id);
    const result = await store.submitOrder(orderId, {
      userId: user.id,
      fulfillmentType: input.fulfillmentType,
      customerNote: input.customerNote ?? null,
      pickupTime: input.pickupTime ?? null,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus ?? "unpaid",
      promoCode: input.promoCode ?? null,
      abTestGroup,
    });

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "ORDER_NOT_OWNED":
          set.status = 403;
          return { error: "Forbidden" };
        case "ORDER_NOT_EDITABLE":
          set.status = 409;
          return { error: "Order already submitted" };
        case "MENU_VERSION_CHANGED":
          return respondMenuVersionChanged(set, "cart", result.itemName);
        case "EMPTY_ORDER":
          set.status = 400;
          return { error: "Empty order cannot be submitted" };
        case "PROMOTION_NOT_FOUND":
        case "PROMOTION_INACTIVE":
        case "PROMOTION_MIN_ORDER_NOT_MET":
        case "PROMOTION_NOT_STARTED":
        case "PROMOTION_EXPIRED":
        case "PROMOTION_USAGE_LIMIT_REACHED":
        case "INVALID_PROMOTION":
          return respondPromotionStoreError(set, result.code, input.promoCode);
        default:
          set.status = 500;
          return { error: "Unexpected store state" };
      }
    }

    await writeAuditLog(user, {
      action: "order_submit",
      targetType: "order",
      targetId: String(result.order.id),
      message: `Order #${result.order.id} submitted by customer`,
      metadata: {
        itemCount: result.order.items.length,
        subtotal: result.order.subtotal,
        discountAmount: result.order.discountAmount,
        total: result.order.total,
        promoCode: result.order.promoCode,
        fulfillmentType: result.order.fulfillmentType,
        paymentMethod: result.order.paymentMethod,
        paymentStatus: result.order.paymentStatus,
        abTestGroup: result.order.abTestGroup,
        orderSource: result.order.orderSource,
        hasCustomerNote: Boolean(result.order.customerNote),
      },
    });
    return { data: toVisibleOrderResponse(result.order, user) };
  },
  {
    params: submitOrderParamsSchema,
    body: submitOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Submit order",
      description: "Submit a pending order that belongs to the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// Role requests
app.post(
  "/api/users/me/role-request",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    const input = body as { requestedRole: "staff" | "chef"; reason: string };
    const [existingPending] = await db
      .select()
      .from(roleRequests)
      .where(
        and(
          eq(roleRequests.userId, user.id),
          eq(roleRequests.status, "pending"),
        ),
      )
      .limit(1);

    if (existingPending) {
      set.status = 400;
      return { error: "Pending role request already exists" };
    }

    const [created] = await db
      .insert(roleRequests)
      .values({
        userId: user.id,
        requestedRole: input.requestedRole,
        reason: input.reason,
      })
      .returning();

    if (!created) {
      set.status = 500;
      return { error: "Unexpected database state" };
    }

    set.status = 201;
    await writeAuditLog(user, {
      action: "role_request_create",
      targetType: "role_request",
      targetId: String(created.id),
      message: `${user.email} requested ${input.requestedRole} role`,
      metadata: {
        requestedRole: input.requestedRole,
        hasReason: Boolean(input.reason),
      },
    });
    return { data: toRoleRequestResponse(created) };
  },
  {
    body: createRoleRequestBodySchema,
    detail: {
      tags: ["users"],
      summary: "Create a role request",
      description: "Request staff or chef access for the current user.",
    },
    response: {
      201: roleRequestResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// Analytics
app.get(
  "/api/admin/analytics/summary",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);
    return { data: store.getAnalyticsSummary(getAnalyticsDateRange(query)) };
  },
  {
    query: analyticsDateRangeQuerySchema,
    detail: {
      tags: ["analytics"],
      summary: "Get analytics summary",
      description:
        "Return revenue, orders, payment, source, cancellation, and rating summary metrics.",
    },
    response: {
      200: analyticsSummaryResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/analytics/category-sales",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    return {
      data: store.getCategorySalesAnalytics(getAnalyticsDateRange(query)),
    };
  },
  {
    query: analyticsDateRangeQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "Get category sales analytics",
      description:
        "Return category sales totals for submitted and later order states.",
    },
    response: {
      200: categorySalesListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/analytics/top-items",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const rawLimit = (query as { limit?: string }).limit;
    const parsedLimit =
      rawLimit !== undefined ? Number.parseInt(rawLimit, 10) : 10;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 100)
        : 10;

    return {
      data: store.getTopItemSalesAnalytics(
        limit,
        getAnalyticsDateRange(query),
      ),
    };
  },
  {
    query: topItemsAnalyticsQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "Get top item sales analytics",
      description:
        "Return top-selling menu items for submitted and later order states.",
    },
    response: {
      200: topItemSalesListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/analytics/price-sensitivity",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    return {
      data: store.getPriceSensitivityAnalytics(getAnalyticsDateRange(query)),
    };
  },
  {
    query: analyticsDateRangeQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "Get price sensitivity analytics",
      description:
        "Compare quantity and revenue across historical snapshot prices for each menu item.",
    },
    response: {
      200: priceSensitivityAnalyticsResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/analytics/ab-tests",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    return {
      data: store.getAbTestAnalytics(getAnalyticsDateRange(query)),
    };
  },
  {
    query: analyticsDateRangeQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "Get A/B test analytics",
      description:
        "Compare order count, revenue, quantity, and average order value across menu A/B groups.",
    },
    response: {
      200: abTestAnalyticsResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/analytics/trends",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    return {
      data: store.getAnalyticsTrends(getAnalyticsDateRange(query)),
    };
  },
  {
    query: analyticsDateRangeQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "Get analytics trends",
      description:
        "Return daily revenue, hourly order, rating, and cancellation trends.",
    },
    response: {
      200: analyticsTrendsResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/analytics/insights",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    return {
      data: store.getAnalyticsInsights(getAnalyticsDateRange(query)),
    };
  },
  {
    query: analyticsDateRangeQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "Get analytics operational insights",
      description:
        "Return low ratings, cancelled orders, peak hour, source, and payment method insights.",
    },
    response: {
      200: analyticsInsightsResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

// Audit logs
app.get(
  "/api/admin/audit-logs",
  async ({ query, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);

    const rawLimit = (query as { limit?: string }).limit;
    const parsedLimit =
      rawLimit !== undefined ? Number.parseInt(rawLimit, 10) : 50;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 200)
        : 50;

    let logs;
    try {
      logs = store.getAuditLogs({
        limit,
        action: (query as { action?: AuditLogAction }).action,
        targetType: (query as { targetType?: AuditLogTargetType }).targetType,
        ...getDateRangeFromQuery(query),
        actor: (query as { actor?: string }).actor?.trim() || undefined,
        targetId: (query as { targetId?: string }).targetId?.trim() || undefined,
      });
    } catch (error) {
      console.warn("Unable to read audit logs", error);
      set.status = 500;
      return { error: "Unable to read audit logs" };
    }

    return { data: logs };
  },
  {
    query: getAuditLogsQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "List audit logs",
      description: "Return recent system operation logs for owners and admins.",
    },
    response: {
      200: auditLogLooseListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// Role requests / admin role management
app.get(
  "/api/admin/role-requests",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireRole(user, "admin");

    const { status = "pending" } = query as {
      status?: "pending" | "approved" | "rejected" | "all";
    };
    const rows =
      status === "all"
        ? await db
            .select()
            .from(roleRequests)
            .orderBy(desc(roleRequests.requestedAt), desc(roleRequests.id))
        : await db
            .select()
            .from(roleRequests)
            .where(eq(roleRequests.status, status))
            .orderBy(desc(roleRequests.requestedAt), desc(roleRequests.id));

    return { data: rows.map(toRoleRequestResponse) };
  },
  {
    query: getAdminRoleRequestsQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "List role requests",
      description: "List role requests, optionally filtered by review status.",
    },
    response: {
      200: roleRequestListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/role-requests/:id",
  async ({ params, body, request, set }) => {
    const reviewer = await requireUser(request);
    requireRole(reviewer, "admin");
    const input = body as {
      status: "approved" | "rejected";
      reviewNote?: string;
    };

    const requestId = parseInt(params.id, 10);
    const [roleRequest] = await db
      .select()
      .from(roleRequests)
      .where(eq(roleRequests.id, requestId))
      .limit(1);

    if (!roleRequest) {
      set.status = 404;
      return { error: "Role request not found" };
    }

    if (roleRequest.status !== "pending") {
      set.status = 400;
      return { error: "Role request is already reviewed" };
    }

    if (input.status === "approved") {
      const [targetUser] = await db
        .select()
        .from(authUser)
        .where(eq(authUser.id, roleRequest.userId))
        .limit(1);

      if (!targetUser) {
        set.status = 404;
        return { error: "User not found" };
      }

      const currentRoles = targetUser.roles as Role[];
      const requestedRole = roleRequest.requestedRole as Role;
      const nextRoles = currentRoles.includes(requestedRole)
        ? currentRoles
        : [...currentRoles, requestedRole];

      await db
        .update(authUser)
        .set({ roles: nextRoles, updatedAt: new Date() })
        .where(eq(authUser.id, targetUser.id));
    }

    const [updated] = await db
      .update(roleRequests)
      .set({
        status: input.status,
        reviewedBy: reviewer.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote ?? null,
      })
      .where(eq(roleRequests.id, requestId))
      .returning();

    if (!updated) {
      set.status = 500;
      return { error: "Unexpected database state" };
    }

    await writeAuditLog(reviewer, {
      action: "role_request_review",
      targetType: "role_request",
      targetId: String(requestId),
      message: `Reviewed role request #${requestId}: ${input.status}`,
      metadata: {
        status: input.status,
        requestedRole: roleRequest.requestedRole,
        targetUserId: roleRequest.userId,
        hasReviewNote: Boolean(input.reviewNote),
      },
    });
    return { data: toRoleRequestResponse(updated) };
  },
  {
    params: reviewRoleRequestParamsSchema,
    body: reviewRoleRequestBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Review a role request",
      description: "Approve or reject a pending role request.",
    },
    response: {
      200: roleRequestResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/users/:userId/roles",
  async ({ params, body, request, set }) => {
    const admin = await requireUser(request);
    requireRole(admin, "admin");
    const input = body as { roles: Role[] };

    const [existingUser] = await db
      .select({ userId: authUser.id, roles: authUser.roles })
      .from(authUser)
      .where(eq(authUser.id, params.userId))
      .limit(1);

    if (!existingUser) {
      set.status = 404;
      return { error: "User not found" };
    }

    const [updated] = await db
      .update(authUser)
      .set({ roles: input.roles, updatedAt: new Date() })
      .where(eq(authUser.id, params.userId))
      .returning({ userId: authUser.id, roles: authUser.roles });

    if (!updated) {
      set.status = 404;
      return { error: "User not found" };
    }

    await writeAuditLog(admin, {
      action: "role_update",
      targetType: "user",
      targetId: updated.userId,
      message: `Updated roles for user ${updated.userId}`,
      metadata: {
        previousRoles: existingUser.roles as Role[],
        roles: input.roles,
      },
    });
    return { data: { userId: updated.userId, roles: updated.roles as Role[] } };
  },
  {
    params: updateUserRolesParamsSchema,
    body: updateUserRolesBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Update user roles",
      description: "Replace a user's role list.",
    },
    response: {
      200: userRolesResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// Health route
// Health / static assets
app.get("/health", () => ({ status: "ok" }), {
  detail: {
    tags: ["system"],
    summary: "Health check",
    description: "Return API health status.",
  },
  response: {
    200: healthResponseSchema,
  },
});

// Manual static file and SPA fallback
// Serve built frontend assets without adding another route plugin.
if (hasPublicAssets) {
  app.get("*", async ({ request }) => {
    const pathname = new URL(request.url).pathname;

    // API routes return 404 through the API fallback.
    if (pathname.startsWith("/api/") || pathname.startsWith("/openapi")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Try to serve the matching static asset.
    const staticFile = Bun.file(`./public${pathname}`);
    if (pathname !== "/" && (await staticFile.exists())) {
      return staticFile;
    }

    // SPA fallback: return index.html.
    return Bun.file("./public/index.html");
  });
}

// Global error handler
app.onError(({ error, set, code }) => {
  if (error instanceof Response) {
    return error;
  }

  if (code === "VALIDATION") {
    set.status = 400;
    return {
      error: "Validation failed",
      message: "Please check your request parameters",
    };
  }

  set.status = 500;
  return { error: "Internal server error" };
});

// Start server
await store.init();

app.listen(port, () => {
  console.log(`Breakfast API: http://${host}:${port}`);
  console.log(`Web App: http://${host}:${port}`);
  console.log(`Menu API: http://${host}:${port}/api/menu`);
  console.log(`Orders API: http://${host}:${port}/api/orders`);
  console.log(`Health check: http://${host}:${port}/health`);
  console.log(`CORS Origin: ${allowedOrigin}`);
  if (!hasPublicAssets) {
    console.log(
      "public/ does not exist; serving API only. Run bun run build:frontend to serve the web app.",
    );
  }
});
