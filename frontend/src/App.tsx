import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import type {
  AbTestAnalyticsItem,
  AbTestGroup,
  ApiDataResponse,
  AuditLog,
  AuditLogAction,
  AuditLogTargetType,
  AnalyticsInsights,
  AnalyticsSummary,
  AnalyticsTrends,
  Category,
  CategorySales,
  DiscountType,
  FulfillmentType,
  MenuItem,
  Order,
  OrderIssueType,
  OrderStatus,
  PaymentMethod,
  PriceSensitivityItem,
  Promotion,
  Role,
  RoleRequest,
  SessionUser,
  TopItemSales,
} from "../../shared/contracts.ts";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const defaultRoles: Role[] = ["customer"];
const editableRoles: Role[] = ["customer", "staff", "chef", "owner", "admin"];
const managerOrderStatuses: OrderStatus[] = [
  "submitted",
  "preparing",
  "ready",
  "completed",
];
const orderIssueTypeOptions: OrderIssueType[] = [
  "out_of_stock",
  "need_customer_confirmation",
  "special_request_problem",
  "other",
];
const abTestGroupOptions: Array<{ id: "" | AbTestGroup; label: string }> = [
  { id: "", label: "No A/B group" },
  { id: "control", label: "Control" },
  { id: "variant_a", label: "Variant A" },
  { id: "variant_b", label: "Variant B" },
];
const orderBoardFilters = [
  { id: "active", label: "Active" },
  { id: "submitted", label: "Submitted" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
] as const;
const analyticsRangeOptions = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "last7Days", label: "Last 7 days" },
  { id: "thisMonth", label: "This month" },
  { id: "custom", label: "Custom" },
] as const;
const auditLogActionOptions: AuditLogAction[] = [
  "role_update",
  "role_request_review",
  "menu_create",
  "menu_update",
  "menu_delete",
  "category_create",
  "category_update",
  "category_delete",
  "promotion_create",
  "promotion_update",
  "promotion_delete",
  "menu_category_assign",
  "menu_category_remove",
  "order_status_update",
  "order_payment_update",
  "order_cancel",
  "order_issue_set",
  "order_issue_clear",
  "walk_in_order_create",
];
const auditLogTargetTypeOptions: AuditLogTargetType[] = [
  "user",
  "role_request",
  "menu_item",
  "category",
  "promotion",
  "menu_item_category",
  "order",
];
const auditLogActionLabels: Record<AuditLogAction, string> = {
  role_update: "Role updated",
  role_request_review: "Role request reviewed",
  menu_create: "Menu created",
  menu_update: "Menu updated",
  menu_delete: "Menu deleted",
  category_create: "Category created",
  category_update: "Category updated",
  category_delete: "Category deactivated",
  promotion_create: "Promotion created",
  promotion_update: "Promotion updated",
  promotion_delete: "Promotion deactivated",
  menu_category_assign: "Category assigned",
  menu_category_remove: "Category removed",
  order_status_update: "Order status updated",
  order_payment_update: "Payment updated",
  order_cancel: "Order cancelled",
  order_issue_set: "Issue set",
  order_issue_clear: "Issue cleared",
  walk_in_order_create: "Walk-in order created",
};
const auditLogTargetTypeLabels: Record<AuditLogTargetType, string> = {
  user: "User",
  role_request: "Role request",
  menu_item: "Menu item",
  category: "Category",
  promotion: "Promotion",
  menu_item_category: "Menu item category",
  order: "Order",
};
const emptyMenuForm = {
  name: "",
  price: "",
  category: "",
  primaryCategoryId: "",
  description: "",
  image_url: "",
  abTestGroup: "",
  changeReason: "",
};
const emptyCategoryForm = {
  name: "",
  slug: "",
  description: "",
  displayOrder: "0",
  isActive: true,
};
const emptyPromotionForm = {
  code: "",
  discountType: "percent" as DiscountType,
  discountValue: "10",
};
const emptyCheckoutForm = {
  fulfillmentType: "takeout" as FulfillmentType,
  customerNote: "",
  pickupTime: "",
  paymentMethod: "cash" as PaymentMethod,
  promoCode: "",
};
const emptyWalkInOrderForm = {
  orderSource: "walk_in" as "walk_in" | "phone",
  guestName: "",
  guestPhone: "",
  fulfillmentType: "takeout" as FulfillmentType,
  customerNote: "",
  pickupTime: "",
  paymentMethod: "cash" as PaymentMethod,
  promoCode: "",
};

type MenuForm = typeof emptyMenuForm;
type CategoryForm = typeof emptyCategoryForm;
type CheckoutForm = typeof emptyCheckoutForm;
type WalkInOrderForm = typeof emptyWalkInOrderForm;
type WalkInOrderItem = { itemId: number; qty: number; menuItemVersion?: number };
type OrderIssueDraft = { issueType: OrderIssueType; issueNote: string };
type OrderRatingDraft = { rating: string; ratingComment: string };
type AnalyticsRange = "all" | "today" | "last7Days" | "thisMonth" | "custom";
type AuditLogRange = "all" | "today" | "last7Days" | "thisMonth" | "custom";
type AnalyticsDateFilters = {
  range: AnalyticsRange;
  startDate: string;
  endDate: string;
};
type ApiErrorPayload = { error?: string; message?: string };
type ApiErrorDetails = ApiErrorPayload & {
  code?: string;
  itemName?: string;
};
type RoleRequestStatus = "pending" | "approved" | "rejected" | "all";
type ManagerTab =
  | "orders"
  | "analytics"
  | "menu"
  | "categories"
  | "promotions"
  | "roleRequests"
  | "auditLogs";
type OrderBoardFilter = (typeof orderBoardFilters)[number]["id"];
type CategoryStatusFilter = "active" | "inactive" | "all";
type PromotionStatusFilter = "active" | "inactive" | "all";
type PromotionForm = typeof emptyPromotionForm;

function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

function normalizeUser(user: Partial<SessionUser>): SessionUser {
  return {
    id: user.id ?? "",
    email: user.email ?? "",
    name: user.name ?? user.email ?? "User",
    roles: Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : defaultRoles,
  };
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.message || payload.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function readApiErrorDetails(response: Response): Promise<ApiErrorDetails> {
  try {
    const payload = (await response.json()) as ApiErrorDetails;
    return {
      error: payload.error,
      message: payload.message,
      code: payload.code,
      itemName: payload.itemName,
    };
  } catch {
    return { error: `HTTP ${response.status}` };
  }
}

function formatApiErrorDetails(details: ApiErrorDetails) {
  const message = details.message || details.error || "Request failed.";
  if (details.code === "MENU_VERSION_CHANGED" && details.itemName) {
    return `${message} Changed item: ${details.itemName}`;
  }
  return message;
}

function isMenuVersionChangedMessage(message: string) {
  return message.toLowerCase().includes("version changed");
}

function formatSemanticVersion(
  item: Pick<MenuItem, "version" | "version_major" | "version_minor">,
) {
  return `v${item.version_major ?? 1}.${item.version_minor ?? Math.max(item.version - 1, 0)}`;
}

function formatAbTestGroup(group?: AbTestGroup | null) {
  if (group === "control") return "Control";
  if (group === "variant_a") return "Variant A";
  if (group === "variant_b") return "Variant B";
  return "No A/B group";
}

function formatOrderSource(source: Order["orderSource"]) {
  if (source === "walk_in") return "Walk-in";
  if (source === "phone") return "Phone";
  return "Customer";
}

export default function App() {
  // Auth / session state
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [demoUsers, setDemoUsers] = useState<SessionUser[]>([]);
  const [demoAuthAvailable, setDemoAuthAvailable] = useState(false);
  const [demoAuthError, setDemoAuthError] = useState("");
  const [demoLoginLoading, setDemoLoginLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Menu / category state
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuForm, setMenuForm] = useState<MenuForm>(emptyMenuForm);
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);
  const [menuMessage, setMenuMessage] = useState("");
  const [menuBusy, setMenuBusy] = useState(false);
  const [categoryForm, setCategoryForm] =
    useState<CategoryForm>(emptyCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );
  const [categoryMessage, setCategoryMessage] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryManagementItems, setCategoryManagementItems] = useState<
    Category[]
  >([]);
  const [categoryManagementStatusFilter, setCategoryManagementStatusFilter] =
    useState<CategoryStatusFilter>("active");
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promotionForm, setPromotionForm] =
    useState<PromotionForm>(emptyPromotionForm);
  const [editingPromotionId, setEditingPromotionId] = useState<number | null>(
    null,
  );
  const [promotionStatusFilter, setPromotionStatusFilter] =
    useState<PromotionStatusFilter>("active");
  const [promotionMessage, setPromotionMessage] = useState("");
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [selectedCategoryByItemId, setSelectedCategoryByItemId] = useState<
    Record<number, string>
  >({});
  const [menuHistoryByItemId, setMenuHistoryByItemId] = useState<
    Record<number, MenuItem[]>
  >({});
  const [menuHistoryLoadingId, setMenuHistoryLoadingId] = useState<
    number | null
  >(null);
  const [displayOrderDrafts, setDisplayOrderDrafts] = useState<
    Record<number, string>
  >({});
  const [displayOrderUpdatingId, setDisplayOrderUpdatingId] = useState<
    number | null
  >(null);

  // Cart / order state
  const [orderId, setOrderId] = useState<number | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<Record<number, number>>(
    {},
  );
  const [cartItemSnapshotsById, setCartItemSnapshotsById] = useState<
    Record<number, MenuItem>
  >({});
  const [cartTotal, setCartTotal] = useState(0);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [isRefreshingCartVersion, setIsRefreshingCartVersion] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartBusyItemId, setCartBusyItemId] = useState<number | null>(null);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [checkoutForm, setCheckoutForm] =
    useState<CheckoutForm>(emptyCheckoutForm);
  const [walkInOrderForm, setWalkInOrderForm] =
    useState<WalkInOrderForm>(emptyWalkInOrderForm);
  const [walkInOrderItems, setWalkInOrderItems] = useState<WalkInOrderItem[]>(
    [],
  );
  const [walkInSelectedItemId, setWalkInSelectedItemId] = useState("");
  const [walkInQty, setWalkInQty] = useState("1");
  const [walkInBusy, setWalkInBusy] = useState(false);
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState<
    number | null
  >(null);
  const [paymentUpdatingOrderId, setPaymentUpdatingOrderId] = useState<
    number | null
  >(null);
  const [cancelUpdatingOrderId, setCancelUpdatingOrderId] = useState<
    number | null
  >(null);
  const [issueUpdatingOrderId, setIssueUpdatingOrderId] = useState<
    number | null
  >(null);
  const [ratingUpdatingOrderId, setRatingUpdatingOrderId] = useState<
    number | null
  >(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [orderStatusDrafts, setOrderStatusDrafts] = useState<
    Record<number, OrderStatus>
  >({});
  const [issueDrafts, setIssueDrafts] = useState<
    Record<number, OrderIssueDraft>
  >({});
  const [ratingDrafts, setRatingDrafts] = useState<
    Record<number, OrderRatingDraft>
  >({});
  const [orderStatusFilter, setOrderStatusFilter] =
    useState<OrderBoardFilter>("active");

  // Role request / admin review state
  const [roleRequestRole, setRoleRequestRole] = useState<"staff" | "chef">(
    "staff",
  );
  const [roleRequestReason, setRoleRequestReason] = useState("");
  const [roleRequestMessage, setRoleRequestMessage] = useState("");
  const [roleRequestBusy, setRoleRequestBusy] = useState(false);
  const [adminStatus, setAdminStatus] = useState<RoleRequestStatus>("pending");
  const [adminRequests, setAdminRequests] = useState<RoleRequest[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminReviewBusyId, setAdminReviewBusyId] = useState<number | null>(
    null,
  );
  const [adminReviewNotes, setAdminReviewNotes] = useState<
    Record<number, string>
  >({});
  const [adminRoleUserId, setAdminRoleUserId] = useState("");
  const [adminRoleDraft, setAdminRoleDraft] = useState<Role[]>(["customer"]);
  const [adminRoleBusy, setAdminRoleBusy] = useState(false);

  // Analytics state
  const [analyticsSummary, setAnalyticsSummary] =
    useState<AnalyticsSummary | null>(null);
  const [analyticsTrends, setAnalyticsTrends] =
    useState<AnalyticsTrends | null>(null);
  const [analyticsInsights, setAnalyticsInsights] =
    useState<AnalyticsInsights | null>(null);
  const [priceSensitivity, setPriceSensitivity] = useState<
    PriceSensitivityItem[]
  >([]);
  const [abTestAnalytics, setAbTestAnalytics] = useState<
    AbTestAnalyticsItem[]
  >([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [topItemSales, setTopItemSales] = useState<TopItemSales[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsMessage, setAnalyticsMessage] = useState("");
  const [analyticsRange, setAnalyticsRange] =
    useState<AnalyticsRange>("all");
  const [analyticsStartDate, setAnalyticsStartDate] = useState("");
  const [analyticsEndDate, setAnalyticsEndDate] = useState("");
  const [appliedAnalyticsRange, setAppliedAnalyticsRange] =
    useState<AnalyticsRange>("all");
  const [appliedAnalyticsStartDate, setAppliedAnalyticsStartDate] =
    useState("");
  const [appliedAnalyticsEndDate, setAppliedAnalyticsEndDate] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsMessage, setAuditLogsMessage] = useState("");
  const [auditLogActionFilter, setAuditLogActionFilter] = useState<
    "" | AuditLogAction
  >("");
  const [auditLogTargetTypeFilter, setAuditLogTargetTypeFilter] = useState<
    "" | AuditLogTargetType
  >("");
  const [auditLogLimit, setAuditLogLimit] = useState("50");
  const [auditLogRange, setAuditLogRange] = useState<AuditLogRange>("all");
  const [auditLogStartDate, setAuditLogStartDate] = useState("");
  const [auditLogEndDate, setAuditLogEndDate] = useState("");
  const [auditLogActorFilter, setAuditLogActorFilter] = useState("");
  const [auditLogTargetIdFilter, setAuditLogTargetIdFilter] = useState("");
  const [managerTab, setManagerTab] = useState<ManagerTab>("orders");

  const menuSectionRef = useRef<HTMLElement | null>(null);
  const managerSectionRef = useRef<HTMLElement | null>(null);
  const ordersSectionRef = useRef<HTMLElement | null>(null);
  const accountSectionRef = useRef<HTMLElement | null>(null);
  const lastAuditLogsAutoLoadTab = useRef<ManagerTab | null>(null);

  // Role / permission helpers
  const roles = user?.roles?.length ? user.roles : defaultRoles;
  const hasRole = useCallback((role: Role) => roles.includes(role), [roles]);
  const hasAnyRole = useCallback(
    (requiredRoles: Role[]) => requiredRoles.some((role) => hasRole(role)),
    [hasRole],
  );
  const canManageMenu = hasAnyRole(["owner", "admin"]);
  const canViewAllOrders = hasAnyRole(["staff", "chef", "owner", "admin"]);
  const canUpdatePaymentStatus = hasAnyRole(["staff", "owner", "admin"]);
  const canCancelManagerOrder = canUpdatePaymentStatus;
  const canCreateWalkInOrder = canUpdatePaymentStatus;
  const canReportOrderIssue = hasAnyRole(["chef", "staff", "owner", "admin"]);
  const canClearOrderIssue = canUpdatePaymentStatus;
  const isAdmin = hasRole("admin");
  const managerTabs = useMemo(
    () =>
      [
        { id: "orders" as const, label: "Orders", visible: canViewAllOrders },
        { id: "analytics" as const, label: "Analytics", visible: canManageMenu },
        { id: "menu" as const, label: "Menu", visible: canManageMenu },
        {
          id: "categories" as const,
          label: "Categories",
          visible: canManageMenu,
        },
        {
          id: "promotions" as const,
          label: "Promotions",
          visible: canManageMenu,
        },
        {
          id: "auditLogs" as const,
          label: "Audit logs",
          visible: canManageMenu,
        },
        { id: "roleRequests" as const, label: "Role requests", visible: isAdmin },
      ].filter((tab) => tab.visible),
    [canManageMenu, canViewAllOrders, isAdmin],
  );
  const hasManagerTools = managerTabs.length > 0;
  const activeOrders = historyOrders.filter((order) =>
    ["submitted", "preparing", "ready"].includes(order.status),
  ).length;
  const readyOrders = historyOrders.filter(
    (order) => order.status === "ready",
  ).length;
  const completedOrders = historyOrders.filter(
    (order) => order.status === "completed",
  ).length;
  const ratedOrders = historyOrders.filter(
    (order) =>
      order.rating !== null &&
      isOrderInAnalyticsDateRange(
        order.ratedAt ?? order.submittedAt ?? order.createdAt,
        {
          range: appliedAnalyticsRange,
          startDate: appliedAnalyticsStartDate,
          endDate: appliedAnalyticsEndDate,
        },
      ),
  );
  const analyticsRangeLabel = formatAnalyticsRangeLabel({
    range: appliedAnalyticsRange,
    startDate: appliedAnalyticsStartDate,
    endDate: appliedAnalyticsEndDate,
  });

  // Analytics derived helpers
  const maxDailyRevenue = analyticsTrends
    ? Math.max(0, ...analyticsTrends.dailyRevenue.map((row) => row.revenue))
    : 0;
  const maxHourlyOrderCount = analyticsTrends
    ? Math.max(0, ...analyticsTrends.hourlyOrders.map((row) => row.orderCount))
    : 0;
  const activeHourlyRows = analyticsTrends
    ? analyticsTrends.hourlyOrders.filter(
        (row) => row.orderCount > 0 || row.revenue > 0,
      ).length
    : 0;

  // Order board helpers
  const filteredBoardOrders = useMemo(() => {
    if (orderStatusFilter === "all") {
      return historyOrders;
    }

    if (orderStatusFilter === "active") {
      return historyOrders.filter((order) =>
        ["submitted", "preparing", "ready"].includes(order.status),
      );
    }

    return historyOrders.filter((order) => order.status === orderStatusFilter);
  }, [historyOrders, orderStatusFilter]);

  function getNextAllowedStatuses(order: Order): OrderStatus[] {
    if (canManageMenu) {
      return managerOrderStatuses;
    }

    if (hasRole("chef")) {
      if (order.status === "submitted") return ["preparing"];
      if (order.status === "preparing") return ["ready"];
    }

    if (hasRole("staff") && order.status === "ready") {
      return ["completed"];
    }

    return [];
  }

  function getPrimaryOrderAction(
    order: Order,
  ): { label: string; status: OrderStatus } | null {
    const allowedStatuses = getNextAllowedStatuses(order);

    if (
      order.status === "submitted" &&
      allowedStatuses.includes("preparing")
    ) {
      return { label: "Start preparing", status: "preparing" };
    }

    if (order.status === "preparing" && allowedStatuses.includes("ready")) {
      return { label: "Mark ready", status: "ready" };
    }

    if (order.status === "ready" && allowedStatuses.includes("completed")) {
      return { label: "Complete pickup", status: "completed" };
    }

    return null;
  }

  function getStatusBadgeClass(status: OrderStatus): string {
    switch (status) {
      case "pending":
        return "badge-neutral";
      case "submitted":
        return "badge-info";
      case "preparing":
        return "badge-warning";
      case "ready":
        return "badge-primary";
      case "completed":
        return "badge-success";
      case "cancelled":
        return "badge-error";
      default:
        return "badge-neutral";
    }
  }

  function scrollToSection(ref: React.RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formatCheckoutDateTime(value?: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function parseAnalyticsDateBound(
    value: string,
    isEnd: boolean,
  ): Date | null {
    if (!value) return null;
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

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isOrderInAnalyticsDateRange(
    value: string | null | undefined,
    filters: AnalyticsDateFilters,
  ): boolean {
    if (filters.range === "all") return true;
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    const start = parseAnalyticsDateBound(filters.startDate, false);
    const end = parseAnalyticsDateBound(filters.endDate, true);

    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }

  function buildAnalyticsQueryString(filters: AnalyticsDateFilters): string {
    const params = new URLSearchParams({ range: filters.range });

    if (filters.range === "custom") {
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);
    }

    return params.toString();
  }

  function formatAnalyticsRangeLabel(filters: AnalyticsDateFilters): string {
    switch (filters.range) {
      case "today":
        return "Today";
      case "last7Days":
        return "Last 7 days";
      case "thisMonth":
        return "This month";
      case "custom":
        if (filters.startDate && filters.endDate) {
          return `Custom ${filters.startDate} to ${filters.endDate}`;
        }
        if (filters.startDate) return `Custom from ${filters.startDate}`;
        if (filters.endDate) return `Custom until ${filters.endDate}`;
        return "Custom";
      case "all":
      default:
        return "All time";
    }
  }

  function formatAuditMetadata(metadata: AuditLog["metadata"]): string {
    if (!metadata) return "-";
    const summary = JSON.stringify(metadata);
    return summary.length > 160 ? `${summary.slice(0, 157)}...` : summary;
  }

  function formatAuditMetadataDetail(metadata: AuditLog["metadata"]): string {
    if (!metadata) return "-";
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return "Unable to display metadata";
    }
  }

  function formatAuditAction(action: AuditLogAction): string {
    return auditLogActionLabels[action] ?? action;
  }

  function formatAuditTargetType(targetType: AuditLogTargetType): string {
    return auditLogTargetTypeLabels[targetType] ?? targetType;
  }

  function formatTrendHour(hour: number): string {
    return `${String(hour).padStart(2, "0")}:00`;
  }

  function getTrendBarWidth(value: number, maxValue: number): string {
    if (maxValue <= 0 || value <= 0) return "0%";
    return `${Math.max(4, Math.round((value / maxValue) * 100))}%`;
  }

  function formatPickupNumber(orderId: number): string {
    return `#${String(orderId).padStart(4, "0")}`;
  }

  function formatReceiptText(order: Order): string {
    const lines = [
      "Breakfast Shop Receipt",
      "======================",
      `Pickup number: ${formatPickupNumber(order.id)}`,
      `Order ID: ${order.id}`,
      `Source: ${formatOrderSource(order.orderSource)}`,
    ];

    if (order.guestName) {
      lines.push(`Guest name: ${order.guestName}`);
    }
    if (order.guestPhone) {
      lines.push(`Phone: ${order.guestPhone}`);
    }

    lines.push(
      `Status: ${order.status}`,
      `Fulfillment: ${order.fulfillmentType}`,
    );

    if (order.pickupTime) {
      lines.push(`Pickup time: ${formatCheckoutDateTime(order.pickupTime)}`);
    }

    lines.push(
      `Payment: ${order.paymentMethod} / ${order.paymentStatus}`,
    );

    if (order.customerNote) {
      lines.push(`Note: ${order.customerNote}`);
    }

    lines.push("", "Items:");
    for (const detail of order.items) {
      lines.push(
        `${detail.item.name} x ${detail.qty} = $${
          detail.item.price * detail.qty
        }`,
      );
    }

    if (order.discountAmount > 0 || order.promoCode) {
      lines.push(
        "",
        `Subtotal: $${order.subtotal}`,
        `Promo code: ${order.promoCode ?? "-"}`,
        `Discount: -$${order.discountAmount}`,
      );
    }

    lines.push("", `Total: $${order.total}`);
    return lines.join("\n");
  }

  function printReceipt(order: Order): void {
    const receiptText = formatReceiptText(order);
    const printWindow = window.open("", "_blank", "width=420,height=640");

    if (!printWindow) {
      setStatusMessage("Unable to open print window.");
      return;
    }

    printWindow.document.write(`<!doctype html>
<html>
<head>
  <title>Receipt ${formatPickupNumber(order.id)}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 16px; }
    pre { white-space: pre-wrap; font-size: 14px; line-height: 1.45; }
  </style>
</head>
<body>
  <pre>${receiptText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function getOrderAgeMinutes(order: Order): number {
    const date = new Date(order.submittedAt ?? order.createdAt);
    if (Number.isNaN(date.getTime())) return 0;
    return Math.floor((Date.now() - date.getTime()) / 60000);
  }

  function isUrgentOrder(order: Order): boolean {
    return (
      (order.status === "submitted" || order.status === "preparing") &&
      getOrderAgeMinutes(order) > 10
    );
  }

  // Data loading helpers
  const loadMenu = useCallback(async () => {
    const response = await fetch(buildApiUrl("/api/menu"));
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const payload = (await response.json()) as ApiDataResponse<MenuItem[]>;
    setItems(Array.isArray(payload?.data) ? payload.data : []);
  }, []);

  const loadCategories = useCallback(async () => {
    const response = await fetch(buildApiUrl("/api/categories"));
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const payload = (await response.json()) as ApiDataResponse<Category[]>;
    setCategories(Array.isArray(payload?.data) ? payload.data : []);
  }, []);

  const loadCategoryManagementItems = useCallback(
    async (status: CategoryStatusFilter) => {
      const response = await fetch(
        buildApiUrl(`/api/categories?status=${status}`),
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Category[]>;
      setCategoryManagementItems(
        Array.isArray(payload?.data) ? payload.data : [],
      );
    },
    [],
  );

  const loadPromotions = useCallback(async (status: PromotionStatusFilter) => {
    const response = await fetch(
      buildApiUrl(`/api/admin/promotions?status=${status}`),
      { credentials: "include" },
    );
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const payload = (await response.json()) as ApiDataResponse<Promotion[]>;
    setPromotions(Array.isArray(payload?.data) ? payload.data : []);
  }, []);

  function syncCartFromOrder(order: Order) {
    const nextQtyByItemId = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.qty;
        return acc;
      },
      {} as Record<number, number>,
    );

    setCartQtyByItemId(nextQtyByItemId);
    setCartItemSnapshotsById(
      order.items.reduce(
        (acc, orderItem) => {
          acc[orderItem.item.id] = orderItem.item;
          return acc;
        },
        {} as Record<number, MenuItem>,
      ),
    );
    setCartTotal(order.total);
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
    setCartItemSnapshotsById({});
    setCartTotal(0);
    setIsCartOpen(false);
  }

  async function loadCurrentOrder(): Promise<Order | null> {
    const response = await fetch(buildApiUrl("/api/orders/current"), {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Load current order failed: ${await readApiError(response)}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order | null>;
    const currentOrder = payload?.data;

    if (!currentOrder) {
      resetCartState();
      return null;
    }

    setOrderId(currentOrder.id);
    syncCartFromOrder(currentOrder);
    return currentOrder;
  }

  async function loadOrderHistory(): Promise<void> {
    setHistoryLoading(true);

    try {
      const response = await fetch(buildApiUrl("/api/orders"), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Load history failed: ${await readApiError(response)}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order[]>;
      setHistoryOrders(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshUserOrders(): Promise<void> {
    await Promise.all([loadCurrentOrder(), loadOrderHistory()]);
  }

  const loadAdminRoleRequests = useCallback(async () => {
    if (!isAdmin) return;

    setAdminLoading(true);
    setAdminMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/role-requests?status=${adminStatus}`),
        { credentials: "include" },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<RoleRequest[]>;
      setAdminRequests(Array.isArray(payload?.data) ? payload.data : []);
    } catch (loadError) {
      setAdminMessage(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load role requests.",
      );
    } finally {
      setAdminLoading(false);
    }
  }, [adminStatus, isAdmin]);

  const loadAnalytics = useCallback(async (filters?: AnalyticsDateFilters) => {
    if (!canManageMenu) return;

    const activeFilters = filters ?? {
      range: appliedAnalyticsRange,
      startDate: appliedAnalyticsStartDate,
      endDate: appliedAnalyticsEndDate,
    };
    const analyticsQuery = buildAnalyticsQueryString(activeFilters);
    const analyticsSuffix = analyticsQuery ? `?${analyticsQuery}` : "";
    const topItemsQuery = new URLSearchParams(analyticsQuery);
    topItemsQuery.set("limit", "10");

    setAnalyticsLoading(true);
    setAnalyticsMessage("");
    try {
      const [
        summaryResponse,
        categoryResponse,
        topItemsResponse,
        trendsResponse,
        insightsResponse,
        priceSensitivityResponse,
        abTestResponse,
      ] = await Promise.all([
        fetch(buildApiUrl(`/api/admin/analytics/summary${analyticsSuffix}`), {
          credentials: "include",
        }),
        fetch(
          buildApiUrl(`/api/admin/analytics/category-sales${analyticsSuffix}`),
          {
            credentials: "include",
          },
        ),
        fetch(
          buildApiUrl(
            `/api/admin/analytics/top-items?${topItemsQuery.toString()}`,
          ),
          {
            credentials: "include",
          },
        ),
        fetch(buildApiUrl(`/api/admin/analytics/trends${analyticsSuffix}`), {
          credentials: "include",
        }),
        fetch(buildApiUrl(`/api/admin/analytics/insights${analyticsSuffix}`), {
          credentials: "include",
        }),
        fetch(
          buildApiUrl(
            `/api/admin/analytics/price-sensitivity${analyticsSuffix}`,
          ),
          {
            credentials: "include",
          },
        ),
        fetch(buildApiUrl(`/api/admin/analytics/ab-tests${analyticsSuffix}`), {
          credentials: "include",
        }),
      ]);

      if (!summaryResponse.ok) {
        throw new Error(await readApiError(summaryResponse));
      }
      if (!categoryResponse.ok) {
        throw new Error(await readApiError(categoryResponse));
      }
      if (!topItemsResponse.ok) {
        throw new Error(await readApiError(topItemsResponse));
      }
      if (!trendsResponse.ok) {
        throw new Error(await readApiError(trendsResponse));
      }
      if (!insightsResponse.ok) {
        throw new Error(await readApiError(insightsResponse));
      }
      if (!priceSensitivityResponse.ok) {
        throw new Error(await readApiError(priceSensitivityResponse));
      }
      if (!abTestResponse.ok) {
        throw new Error(await readApiError(abTestResponse));
      }

      const summaryPayload =
        (await summaryResponse.json()) as ApiDataResponse<AnalyticsSummary>;
      const categoryPayload =
        (await categoryResponse.json()) as ApiDataResponse<CategorySales[]>;
      const topItemsPayload =
        (await topItemsResponse.json()) as ApiDataResponse<TopItemSales[]>;
      const trendsPayload =
        (await trendsResponse.json()) as ApiDataResponse<AnalyticsTrends>;
      const insightsPayload =
        (await insightsResponse.json()) as ApiDataResponse<AnalyticsInsights>;
      const priceSensitivityPayload =
        (await priceSensitivityResponse.json()) as ApiDataResponse<
          PriceSensitivityItem[]
        >;
      const abTestPayload =
        (await abTestResponse.json()) as ApiDataResponse<AbTestAnalyticsItem[]>;

      setAnalyticsSummary(summaryPayload?.data ?? null);
      setAnalyticsTrends(trendsPayload?.data ?? null);
      setAnalyticsInsights(insightsPayload?.data ?? null);
      setCategorySales(
        Array.isArray(categoryPayload?.data) ? categoryPayload.data : [],
      );
      setTopItemSales(
        Array.isArray(topItemsPayload?.data) ? topItemsPayload.data : [],
      );
      setPriceSensitivity(
        Array.isArray(priceSensitivityPayload?.data)
          ? priceSensitivityPayload.data
          : [],
      );
      setAbTestAnalytics(
        Array.isArray(abTestPayload?.data) ? abTestPayload.data : [],
      );
    } catch (analyticsError) {
      setAnalyticsMessage(
        analyticsError instanceof Error
          ? analyticsError.message
          : "Unable to load analytics.",
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }, [
    appliedAnalyticsEndDate,
    appliedAnalyticsRange,
    appliedAnalyticsStartDate,
    canManageMenu,
  ]);

  function applyAnalyticsDateRange() {
    const nextFilters = {
      range: analyticsRange,
      startDate: analyticsStartDate,
      endDate: analyticsEndDate,
    };
    const isUnchanged =
      appliedAnalyticsRange === nextFilters.range &&
      appliedAnalyticsStartDate === nextFilters.startDate &&
      appliedAnalyticsEndDate === nextFilters.endDate;

    setAppliedAnalyticsRange(nextFilters.range);
    setAppliedAnalyticsStartDate(nextFilters.startDate);
    setAppliedAnalyticsEndDate(nextFilters.endDate);

    if (isUnchanged) {
      void loadAnalytics(nextFilters);
    }
  }

  // Audit log loading helpers
  const loadAuditLogs = useCallback(async () => {
    if (!canManageMenu) return;

    const params = new URLSearchParams({ limit: auditLogLimit || "50" });
    if (auditLogActionFilter) params.set("action", auditLogActionFilter);
    if (auditLogTargetTypeFilter) {
      params.set("targetType", auditLogTargetTypeFilter);
    }
    params.set("range", auditLogRange);
    if (auditLogRange === "custom") {
      if (auditLogStartDate) params.set("startDate", auditLogStartDate);
      if (auditLogEndDate) params.set("endDate", auditLogEndDate);
    }
    if (auditLogActorFilter.trim()) {
      params.set("actor", auditLogActorFilter.trim());
    }
    if (auditLogTargetIdFilter.trim()) {
      params.set("targetId", auditLogTargetIdFilter.trim());
    }

    setAuditLogsLoading(true);
    setAuditLogsMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/audit-logs?${params.toString()}`),
        { credentials: "include" },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<AuditLog[]>;
      setAuditLogs(Array.isArray(payload?.data) ? payload.data : []);
    } catch (auditError) {
      setAuditLogsMessage(
        auditError instanceof Error
          ? auditError.message
          : "Unable to load audit logs.",
      );
    } finally {
      setAuditLogsLoading(false);
    }
  }, [
    auditLogActionFilter,
    auditLogActorFilter,
    auditLogEndDate,
    auditLogLimit,
    auditLogRange,
    auditLogStartDate,
    auditLogTargetIdFilter,
    auditLogTargetTypeFilter,
    canManageMenu,
  ]);

  // Effects
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const res = await fetch(buildApiUrl("/api/me"), {
          credentials: "include",
        });
        if (res.ok) {
          const payload = (await res.json()) as ApiDataResponse<SessionUser>;
          if (payload?.data && mounted) {
            setUser(normalizeUser(payload.data));
          }
        }
      } catch {
        // Anonymous sessions are fine on the public menu page.
      }
    }

    async function loadDemoUsers() {
      try {
        const res = await fetch(buildApiUrl("/api/dev/demo-users"), {
          credentials: "include",
        });
        if (res.status === 404) {
          if (mounted) {
            setDemoAuthAvailable(false);
            setDemoUsers([]);
          }
          return;
        }
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }

        const payload = (await res.json()) as ApiDataResponse<SessionUser[]>;
        if (mounted) {
          setDemoUsers(Array.isArray(payload?.data) ? payload.data : []);
          setDemoAuthAvailable(true);
        }
      } catch (demoError) {
        if (mounted) {
          setDemoAuthAvailable(false);
          setDemoAuthError(
            demoError instanceof Error
              ? demoError.message
              : "Unable to load demo users.",
          );
        }
      }
    }

    async function loadInitialMenu() {
      try {
        await Promise.all([loadMenu(), loadCategories()]);
      } catch (fetchError) {
        if (mounted) {
          setError("Unable to load menu.");
          console.error(fetchError);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void restoreSession();
    void loadDemoUsers();
    void loadInitialMenu();

    return () => {
      mounted = false;
    };
  }, [loadCategories, loadMenu]);

  useEffect(() => {
    if (!user) {
      setHistoryOrders([]);
      setIsCartOpen(false);
      resetCartState();
      return;
    }

    void refreshUserOrders().catch((refreshError) => {
      setActionError("Unable to refresh your orders.");
      console.error(refreshError);
    });
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      void loadAdminRoleRequests();
    } else {
      setAdminRequests([]);
    }
  }, [isAdmin, loadAdminRoleRequests]);

  useEffect(() => {
    if (canManageMenu) {
      void loadAnalytics();
    } else {
      setCategorySales([]);
      setTopItemSales([]);
      setAnalyticsTrends(null);
      setAnalyticsMessage("");
    }
  }, [canManageMenu, loadAnalytics]);

  useEffect(() => {
    if (
      canManageMenu &&
      managerTab === "auditLogs" &&
      lastAuditLogsAutoLoadTab.current !== "auditLogs"
    ) {
      lastAuditLogsAutoLoadTab.current = "auditLogs";
      void loadAuditLogs();
    } else if (managerTab !== "auditLogs") {
      lastAuditLogsAutoLoadTab.current = null;
    } else if (!canManageMenu) {
      lastAuditLogsAutoLoadTab.current = null;
      setAuditLogs([]);
      setAuditLogsMessage("");
    }
  }, [canManageMenu, managerTab]);

  useEffect(() => {
    if (canManageMenu) {
      void loadCategoryManagementItems(categoryManagementStatusFilter).catch(
        (categoryError) => {
          setCategoryMessage(
            categoryError instanceof Error
              ? categoryError.message
              : "Unable to load categories.",
          );
        },
      );
    } else {
      setCategoryManagementItems([]);
    }
  }, [canManageMenu, categoryManagementStatusFilter, loadCategoryManagementItems]);

  useEffect(() => {
    if (canManageMenu && managerTab === "promotions") {
      void loadPromotions(promotionStatusFilter).catch((promotionError) => {
        setPromotionMessage(
          promotionError instanceof Error
            ? promotionError.message
            : "Unable to load promotions.",
        );
      });
    } else if (!canManageMenu) {
      setPromotions([]);
    }
  }, [canManageMenu, managerTab, promotionStatusFilter, loadPromotions]);

  useEffect(() => {
    if (!hasManagerTools) return;
    if (!managerTabs.some((tab) => tab.id === managerTab)) {
      setManagerTab(managerTabs[0].id);
    }
  }, [hasManagerTools, managerTab, managerTabs]);

  const grouped = useMemo(() => {
    const groupedItems = items.reduce(
      (acc, item) => {
        const category =
          item?.primary_category_name || item?.category || "Uncategorized";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(item);
        return acc;
      },
      {} as Record<string, MenuItem[]>,
    );

    const categories = Object.keys(groupedItems).sort((a, b) =>
      a.localeCompare(b),
    );
    for (const groupItems of Object.values(groupedItems)) {
      groupItems.sort(
        (a, b) => a.display_order - b.display_order || a.id - b.id,
      );
    }

    return { groupedItems, categories };
  }, [items]);

  const cartItemCount = useMemo(
    () => Object.values(cartQtyByItemId).reduce((sum, qty) => sum + qty, 0),
    [cartQtyByItemId],
  );

  const cartDetails = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const currentItemByGroupId = new Map(
      items.map((item) => [item.menu_item_group_id, item]),
    );

    return Object.entries(cartQtyByItemId)
      .map(([itemIdText, qty]) => {
        const itemId = Number(itemIdText);
        const item = itemById.get(itemId) ?? cartItemSnapshotsById[itemId];
        if (!item || qty <= 0) return null;
        const currentItem =
          currentItemByGroupId.get(item.menu_item_group_id) ??
          itemById.get(itemId);
        const hasPriceChanged =
          Boolean(currentItem) && currentItem?.price !== item.price;

        return {
          itemId,
          qty,
          item,
          currentItem,
          hasPriceChanged,
          subtotal: item.price * qty,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [cartItemSnapshotsById, cartQtyByItemId, items]);

  const walkInOrderDetails = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));

    return walkInOrderItems
      .map((entry) => {
        const item = itemById.get(entry.itemId);
        if (!item) return null;
        return {
          ...entry,
          item,
          subtotal: item.price * entry.qty,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [items, walkInOrderItems]);

  const walkInOrderTotal = useMemo(
    () => walkInOrderDetails.reduce((sum, entry) => sum + entry.subtotal, 0),
    [walkInOrderDetails],
  );

  // Event handlers
  async function ensureOrder(): Promise<number> {
    if (!user) {
      throw new Error("Please sign in first.");
    }

    if (orderId !== null) {
      return orderId;
    }

    const response = await fetch(buildApiUrl("/api/orders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        setUser(null);
        setAuthError("Your session expired. Please sign in again.");
        setActionError("Your session expired. Please sign in again.");
        setHistoryOrders([]);
        resetCartState();
        throw new Error(`Auth expired: HTTP ${response.status}`);
      }

      throw new Error(`Create order failed: ${await readApiError(response)}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order>;
    const createdOrderId = payload?.data?.id;

    if (!createdOrderId) {
      throw new Error("Create order failed: invalid payload");
    }

    setOrderId(createdOrderId);
    return createdOrderId;
  }

  async function patchOrderItemQty(
    targetOrderId: number,
    itemId: number,
    qty: number,
  ): Promise<Order> {
    const response = await fetch(buildApiUrl(`/api/orders/${targetOrderId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ itemId, qty }),
    });

    if (!response.ok) {
      throw new Error(formatApiErrorDetails(await readApiErrorDetails(response)));
    }

    const payload = (await response.json()) as ApiDataResponse<Order>;
    const updatedOrder = payload?.data;

    if (!updatedOrder) {
      throw new Error("Update order failed: invalid payload");
    }

    return updatedOrder;
  }

  async function refreshCartVersionState(): Promise<void> {
    setIsRefreshingCartVersion(true);
    try {
      await Promise.all([loadMenu(), loadCurrentOrder()]);
    } finally {
      setIsRefreshingCartVersion(false);
    }
  }

  async function refreshMenuAndCurrentOrderAfterVersionConflict(
    message: string,
  ) {
    setActionError(message);
    await refreshCartVersionState();
  }

  async function refreshMenuAfterWalkInVersionConflict(message: string) {
    setStatusMessage(message);
    await loadMenu();
  }

  async function handleGoogleSignIn(): Promise<void> {
    setAuthError("");
    setIsGoogleSigningIn(true);
    try {
      const callbackURL = window.location.origin;
      const response = await fetch(buildApiUrl("/api/auth/sign-in/social"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: "google", callbackURL }),
      });

      if (!response.ok) {
        throw new Error(`Google sign-in failed: ${await readApiError(response)}`);
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload?.url) {
        throw new Error("Google sign-in failed: missing redirect URL");
      }

      window.location.href = payload.url;
    } catch {
      setAuthError("Google sign-in failed. Please try again.");
      setIsGoogleSigningIn(false);
    }
  }

  async function handleDemoLogin(userId: string): Promise<void> {
    setAuthError("");
    setDemoAuthError("");
    setDemoLoginLoading(userId);

    try {
      const response = await fetch(buildApiUrl("/api/dev/demo-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<SessionUser>;
      if (!payload?.data) {
        throw new Error("Demo login failed: invalid payload");
      }

      setUser(normalizeUser(payload.data));
      setActionError("");
      await Promise.all([
        loadMenu(),
        loadCategories(),
        loadCurrentOrder(),
        loadOrderHistory(),
      ]);
    } catch (demoError) {
      setDemoAuthError(
        demoError instanceof Error ? demoError.message : "Demo login failed.",
      );
    } finally {
      setDemoLoginLoading(null);
    }
  }

  async function handleLogout(): Promise<void> {
    if (user?.id.startsWith("demo-")) {
      try {
        await fetch(buildApiUrl("/api/dev/demo-logout"), {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // Local cleanup below is still safe if the demo logout endpoint is unavailable.
      }
      setUser(null);
      setAuthError("");
      setActionError("");
      setRoleRequestMessage("");
      setAdminRequests([]);
      resetCartState();
      return;
    }

    try {
      await fetch(buildApiUrl("/api/dev/demo-logout"), {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);

      const res = await fetch(buildApiUrl("/api/sign-out"), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setActionError(`Sign out failed: ${await readApiError(res)}`);
        return;
      }
    } catch {
      setActionError("Sign out failed. Please try again.");
      return;
    }
    setUser(null);
    setAuthError("");
    setActionError("");
    setRoleRequestMessage("");
    setAdminRequests([]);
    resetCartState();
  }

  async function addToCart(item: MenuItem): Promise<void> {
    setActionError("");
    setActiveItemId(item.id);

    try {
      if (!user) {
        throw new Error("Please sign in first.");
      }
      if (!item.is_available) {
        throw new Error("This item is sold out.");
      }

      const targetOrderId = await ensureOrder();
      const currentQty = cartQtyByItemId[item.id] ?? 0;
      const nextQty = currentQty + 1;

      try {
        const updatedOrder = await patchOrderItemQty(
          targetOrderId,
          item.id,
          nextQty,
        );
        syncCartFromOrder(updatedOrder);
      } catch (firstTryError) {
        const firstTryMessage =
          firstTryError instanceof Error ? firstTryError.message : "";

        if (
          firstTryMessage.includes("HTTP 403") ||
          firstTryMessage.includes("HTTP 404")
        ) {
          setOrderId(null);

          const recoveredOrder = await loadCurrentOrder();
          const retryOrderId = recoveredOrder?.id ?? (await ensureOrder());
          const recoveredQty =
            recoveredOrder?.items.find(
              (orderItem) => orderItem.item.id === item.id,
            )?.qty ?? 0;
          const retryQty = recoveredQty + 1;

          const retriedOrder = await patchOrderItemQty(
            retryOrderId,
            item.id,
            retryQty,
          );
          syncCartFromOrder(retriedOrder);
          return;
        }

        throw firstTryError;
      }
    } catch (cartError) {
      if (
        cartError instanceof Error &&
        cartError.message.startsWith("Auth expired:")
      ) {
        return;
      }

      const message =
        cartError instanceof Error ? cartError.message : "Unable to update cart.";
      if (isMenuVersionChangedMessage(message)) {
        await refreshMenuAndCurrentOrderAfterVersionConflict(message);
      } else {
        setActionError("Unable to update cart.");
      }
      console.error(cartError);
    } finally {
      setActiveItemId(null);
    }
  }

  async function updateCartItemQty(itemId: number, qty: number): Promise<void> {
    if (!user) return;

    setActionError("");
    setCartBusyItemId(itemId);
    try {
      const targetOrderId = await ensureOrder();
      const updatedOrder = await patchOrderItemQty(
        targetOrderId,
        itemId,
        Math.max(0, qty),
      );
      syncCartFromOrder(updatedOrder);
    } catch (cartError) {
      if (
        cartError instanceof Error &&
        cartError.message.startsWith("Auth expired:")
      ) {
        return;
      }

      setActionError(
        cartError instanceof Error ? cartError.message : "Unable to update cart.",
      );
      if (
        cartError instanceof Error &&
        isMenuVersionChangedMessage(cartError.message)
      ) {
        await refreshMenuAndCurrentOrderAfterVersionConflict(cartError.message);
      }
      console.error(cartError);
    } finally {
      setCartBusyItemId(null);
    }
  }

  async function clearCart(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) return;

    setActionError("");
    setIsClearingCart(true);

    try {
      for (const detail of cartDetails) {
        const response = await fetch(buildApiUrl(`/api/orders/${orderId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            itemId: detail.itemId,
            qty: 0,
          }),
        });

        if (!response.ok) {
          throw new Error(`Clear cart failed: ${await readApiError(response)}`);
        }
      }

      setCartQtyByItemId({});
      setCartTotal(0);
    } catch (clearError) {
      setActionError("Unable to clear cart.");
      console.error(clearError);
    } finally {
      setIsClearingCart(false);
    }
  }

  async function submitOrder(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) return;

    setActionError("");
    setIsSubmittingOrder(true);

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${orderId}/submit`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            fulfillmentType: checkoutForm.fulfillmentType,
            customerNote: checkoutForm.customerNote.trim() || null,
            pickupTime: checkoutForm.pickupTime
              ? new Date(checkoutForm.pickupTime).toISOString()
              : null,
            paymentMethod: checkoutForm.paymentMethod,
            paymentStatus: "unpaid",
            promoCode: checkoutForm.promoCode.trim() || null,
          }),
        },
      );

      if (!response.ok) {
        const details = await readApiErrorDetails(response);
        throw new Error(`Submit order failed: ${formatApiErrorDetails(details)}`);
      }

      resetCartState();
      setCheckoutForm(emptyCheckoutForm);
      setIsCartOpen(false);
      await loadOrderHistory();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit order.";
      if (isMenuVersionChangedMessage(message)) {
        await refreshMenuAndCurrentOrderAfterVersionConflict(message);
      } else {
        setActionError("Unable to submit order.");
      }
      console.error(submitError);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function updateOrderStatus(
    targetOrderId: number,
    status: OrderStatus,
  ): Promise<void> {
    setStatusUpdatingOrderId(targetOrderId);
    setStatusMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${targetOrderId}/status`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        },
      );

      if (!response.ok) {
        throw new Error(formatApiErrorDetails(await readApiErrorDetails(response)));
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const updatedOrder = payload?.data;
      if (!updatedOrder) {
        throw new Error("Update order status failed: invalid payload");
      }

      setHistoryOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedOrder.id ? updatedOrder : order,
        ),
      );
      setOrderStatusDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[updatedOrder.id];
        return nextDrafts;
      });
      setStatusMessage(`Order #${updatedOrder.id} status updated.`);

      if (canManageMenu) {
        await loadAnalytics();
      }
    } catch (statusError) {
      setStatusMessage(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update order status.",
      );
    } finally {
      setStatusUpdatingOrderId(null);
    }
  }

  async function markOrderPaid(targetOrderId: number): Promise<void> {
    setPaymentUpdatingOrderId(targetOrderId);
    setStatusMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${targetOrderId}/payment`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ paymentStatus: "paid" }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const updatedOrder = payload?.data;
      if (!updatedOrder) {
        throw new Error("Update payment failed: invalid payload");
      }

      setHistoryOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedOrder.id ? updatedOrder : order,
        ),
      );
      setStatusMessage(`Order #${updatedOrder.id} marked paid.`);
    } catch (paymentError) {
      setStatusMessage(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to update payment status.",
      );
    } finally {
      setPaymentUpdatingOrderId(null);
    }
  }

  async function cancelOrder(targetOrderId: number): Promise<void> {
    setCancelUpdatingOrderId(targetOrderId);
    setStatusMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${targetOrderId}/cancel`),
        {
          method: "PATCH",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const updatedOrder = payload?.data;
      if (!updatedOrder) {
        throw new Error("Cancel order failed: invalid payload");
      }

      setHistoryOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedOrder.id ? updatedOrder : order,
        ),
      );
      setStatusMessage(`Order #${updatedOrder.id} cancelled.`);

      if (canManageMenu) {
        await loadAnalytics();
      }
    } catch (cancelError) {
      setStatusMessage(
        cancelError instanceof Error
          ? cancelError.message
          : "Unable to cancel order.",
      );
    } finally {
      setCancelUpdatingOrderId(null);
    }
  }

  async function setOrderIssue(targetOrderId: number): Promise<void> {
    const draft = issueDrafts[targetOrderId] ?? {
      issueType: "out_of_stock" as OrderIssueType,
      issueNote: "",
    };
    setIssueUpdatingOrderId(targetOrderId);
    setStatusMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${targetOrderId}/issue`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            issueType: draft.issueType,
            issueNote: draft.issueNote.trim() || null,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const updatedOrder = payload?.data;
      if (!updatedOrder) {
        throw new Error("Set order issue failed: invalid payload");
      }

      setHistoryOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedOrder.id ? updatedOrder : order,
        ),
      );
      setIssueDrafts((currentDrafts) => ({
        ...currentDrafts,
        [updatedOrder.id]: {
          issueType: updatedOrder.issueType ?? draft.issueType,
          issueNote: "",
        },
      }));
      setStatusMessage(`Order #${updatedOrder.id} issue updated.`);
    } catch (issueError) {
      setStatusMessage(
        issueError instanceof Error
          ? issueError.message
          : "Unable to update order issue.",
      );
    } finally {
      setIssueUpdatingOrderId(null);
    }
  }

  async function clearOrderIssue(targetOrderId: number): Promise<void> {
    setIssueUpdatingOrderId(targetOrderId);
    setStatusMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${targetOrderId}/issue`),
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const updatedOrder = payload?.data;
      if (!updatedOrder) {
        throw new Error("Clear order issue failed: invalid payload");
      }

      setHistoryOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedOrder.id ? updatedOrder : order,
        ),
      );
      setStatusMessage(`Order #${updatedOrder.id} issue cleared.`);
    } catch (issueError) {
      setStatusMessage(
        issueError instanceof Error
          ? issueError.message
          : "Unable to clear order issue.",
      );
    } finally {
      setIssueUpdatingOrderId(null);
    }
  }

  async function updateOrderRating(targetOrderId: number): Promise<void> {
    const draft = ratingDrafts[targetOrderId] ?? {
      rating: "",
      ratingComment: "",
    };
    const rating = Number(draft.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setStatusMessage("Choose a rating from 1 to 5.");
      return;
    }

    setRatingUpdatingOrderId(targetOrderId);
    setStatusMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${targetOrderId}/rating`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            rating,
            ratingComment: draft.ratingComment.trim() || null,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const updatedOrder = payload?.data;
      if (!updatedOrder) {
        throw new Error("Update rating failed: invalid payload");
      }

      setHistoryOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedOrder.id ? updatedOrder : order,
        ),
      );
      setRatingDrafts((currentDrafts) => ({
        ...currentDrafts,
        [updatedOrder.id]: {
          rating: String(updatedOrder.rating ?? rating),
          ratingComment: updatedOrder.ratingComment ?? "",
        },
      }));
      setStatusMessage(`Order #${updatedOrder.id} rating saved.`);
    } catch (ratingError) {
      setStatusMessage(
        ratingError instanceof Error
          ? ratingError.message
          : "Unable to update rating.",
      );
    } finally {
      setRatingUpdatingOrderId(null);
    }
  }

  function addWalkInItem() {
    const itemId = Number(walkInSelectedItemId);
    const qty = Number(walkInQty);
    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      setStatusMessage("Select a menu item and quantity first.");
      return;
    }
    const selectedItem = items.find((item) => item.id === itemId);
    if (!selectedItem?.is_available) {
      setStatusMessage("This item is sold out.");
      return;
    }

    setWalkInOrderItems((currentItems) => {
      const existing = currentItems.find((item) => item.itemId === itemId);
      if (existing) {
        return currentItems.map((item) =>
          item.itemId === itemId ? { ...item, qty: item.qty + qty } : item,
        );
      }
      return [...currentItems, { itemId, qty, menuItemVersion: selectedItem.version }];
    });
    setWalkInSelectedItemId("");
    setWalkInQty("1");
  }

  function removeWalkInItem(itemId: number) {
    setWalkInOrderItems((currentItems) =>
      currentItems.filter((item) => item.itemId !== itemId),
    );
  }

  async function submitWalkInOrder(): Promise<void> {
    if (!canCreateWalkInOrder || walkInOrderItems.length === 0) return;

    setWalkInBusy(true);
    setStatusMessage("");
    try {
      const response = await fetch(buildApiUrl("/api/orders/walk-in"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderSource: walkInOrderForm.orderSource,
          guestName: walkInOrderForm.guestName.trim() || null,
          guestPhone: walkInOrderForm.guestPhone.trim() || null,
          items: walkInOrderItems,
          fulfillmentType: walkInOrderForm.fulfillmentType,
          customerNote: walkInOrderForm.customerNote.trim() || null,
          pickupTime: walkInOrderForm.pickupTime
            ? new Date(walkInOrderForm.pickupTime).toISOString()
            : null,
          paymentMethod: walkInOrderForm.paymentMethod,
          paymentStatus: "unpaid",
          promoCode: walkInOrderForm.promoCode.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await loadOrderHistory();
      setWalkInOrderForm(emptyWalkInOrderForm);
      setWalkInOrderItems([]);
      setWalkInSelectedItemId("");
      setWalkInQty("1");
      setStatusMessage(
        walkInOrderForm.orderSource === "phone"
          ? "Phone order created."
          : "Walk-in order created.",
      );
    } catch (walkInError) {
      const message =
        walkInError instanceof Error
          ? walkInError.message
          : "Unable to create walk-in order.";
      if (isMenuVersionChangedMessage(message)) {
        await refreshMenuAfterWalkInVersionConflict(message);
      } else {
        setStatusMessage(message);
      }
    } finally {
      setWalkInBusy(false);
    }
  }

  async function loadMenuItemHistory(item: MenuItem): Promise<void> {
    if (!canManageMenu) return;

    setMenuHistoryLoadingId(item.id);
    setMenuMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/menu/${item.id}/history`),
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<MenuItem[]>;
      setMenuHistoryByItemId((currentHistory) => ({
        ...currentHistory,
        [item.id]: Array.isArray(payload?.data) ? payload.data : [],
      }));
    } catch (historyError) {
      setMenuMessage(
        historyError instanceof Error
          ? historyError.message
          : "Unable to load menu history.",
      );
    } finally {
      setMenuHistoryLoadingId(null);
    }
  }

  async function updateMenuItemDisplayOrder(item: MenuItem): Promise<void> {
    if (!canManageMenu) return;

    const value = Number.parseInt(
      displayOrderDrafts[item.id] ?? String(item.display_order),
      10,
    );
    if (!Number.isFinite(value) || value < 0) {
      setMenuMessage("Display order must be a non-negative number.");
      return;
    }

    setDisplayOrderUpdatingId(item.id);
    setMenuMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/menu/${item.id}/display-order`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ displayOrder: value }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<MenuItem>;
      const updated = payload?.data;
      if (!updated) {
        throw new Error("Display order update failed: invalid payload");
      }

      setItems((currentItems) =>
        currentItems
          .map((menuItem) => (menuItem.id === updated.id ? updated : menuItem))
          .sort((a, b) => a.display_order - b.display_order || a.id - b.id),
      );
      setDisplayOrderDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[item.id];
        return nextDrafts;
      });
      setMenuMessage(`Display order updated for ${updated.name}.`);
    } catch (displayOrderError) {
      setMenuMessage(
        displayOrderError instanceof Error
          ? displayOrderError.message
          : "Unable to update display order.",
      );
    } finally {
      setDisplayOrderUpdatingId(null);
    }
  }

  function updateMenuForm(field: keyof MenuForm, value: string) {
    setMenuForm((current) => ({ ...current, [field]: value }));
  }

  function updateMenuPrimaryCategory(categoryIdText: string) {
    const selectedCategory = categories.find(
      (category) => String(category.id) === categoryIdText,
    );

    setMenuForm((current) => ({
      ...current,
      primaryCategoryId: categoryIdText,
      category: selectedCategory?.name ?? current.category,
    }));
  }

  function startEditMenuItem(item: MenuItem) {
    setEditingMenuId(item.id);
    setMenuMessage("");
    setMenuForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      primaryCategoryId: item.primary_category_id
        ? String(item.primary_category_id)
        : "",
      description: item.description,
      image_url: item.image_url,
      abTestGroup: item.ab_test_group ?? "",
      changeReason: "",
    });
  }

  function resetMenuForm() {
    setEditingMenuId(null);
    setMenuForm(emptyMenuForm);
  }

  async function submitMenuForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageMenu) return;

    setMenuBusy(true);
    setMenuMessage("");
    try {
      const body = {
        name: menuForm.name.trim(),
        price: Number(menuForm.price),
        category: menuForm.category.trim(),
        description: menuForm.description.trim(),
        image_url: menuForm.image_url.trim(),
        abTestGroup: menuForm.abTestGroup
          ? (menuForm.abTestGroup as AbTestGroup)
          : null,
        ...(menuForm.primaryCategoryId
          ? { primaryCategoryId: Number(menuForm.primaryCategoryId) }
          : editingMenuId
            ? { primaryCategoryId: null }
            : {}),
        ...(editingMenuId && menuForm.changeReason.trim()
          ? { changeReason: menuForm.changeReason.trim() }
          : {}),
      };

      const response = await fetch(
        buildApiUrl(
          editingMenuId ? `/api/menu/${editingMenuId}` : "/api/menu",
        ),
        {
          method: editingMenuId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await Promise.all([loadMenu(), loadCategories()]);
      resetMenuForm();
      setMenuMessage(editingMenuId ? "Menu item updated." : "Menu item added.");
    } catch (menuError) {
      setMenuMessage(
        menuError instanceof Error ? menuError.message : "Menu update failed.",
      );
    } finally {
      setMenuBusy(false);
    }
  }

  async function deleteMenuItem(item: MenuItem) {
    if (!canManageMenu) return;
    if (!window.confirm(`Delete ${item.name}?`)) return;

    setMenuBusy(true);
    setMenuMessage("");
    try {
      const response = await fetch(buildApiUrl(`/api/menu/${item.id}`), {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await Promise.all([loadMenu(), loadCategories()]);
      setMenuMessage("Menu item deleted.");
      if (editingMenuId === item.id) resetMenuForm();
    } catch (menuError) {
      setMenuMessage(
        menuError instanceof Error ? menuError.message : "Delete failed.",
      );
    } finally {
      setMenuBusy(false);
    }
  }

  async function toggleMenuItemAvailability(item: MenuItem) {
    if (!canManageMenu) return;

    setMenuBusy(true);
    setMenuMessage("");
    try {
      const response = await fetch(buildApiUrl(`/api/menu/${item.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          isAvailable: !item.is_available,
          changeReason: item.is_available
            ? "Marked sold out"
            : "Marked available",
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await loadMenu();
      setMenuMessage(
        item.is_available ? "Menu item marked sold out." : "Menu item available.",
      );
    } catch (menuError) {
      setMenuMessage(
        menuError instanceof Error
          ? menuError.message
          : "Availability update failed.",
      );
    } finally {
      setMenuBusy(false);
    }
  }

  function updateCategoryForm(field: keyof CategoryForm, value: string | boolean) {
    setCategoryForm((current) => ({ ...current, [field]: value }));
  }

  function startEditCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryMessage("");
    setCategoryForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      displayOrder: String(category.displayOrder),
      isActive: category.isActive,
    });
  }

  function resetCategoryForm() {
    setEditingCategoryId(null);
    setCategoryForm(emptyCategoryForm);
  }

  async function submitCategoryForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageMenu) return;

    setCategoryBusy(true);
    setCategoryMessage("");
    try {
      const body = {
        name: categoryForm.name.trim(),
        slug: categoryForm.slug.trim(),
        description: categoryForm.description.trim() || undefined,
        displayOrder: Number(categoryForm.displayOrder),
        isActive: categoryForm.isActive,
      };

      const response = await fetch(
        buildApiUrl(
          editingCategoryId
            ? `/api/categories/${editingCategoryId}`
            : "/api/categories",
        ),
        {
          method: editingCategoryId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await Promise.all([
        loadCategories(),
        loadCategoryManagementItems(categoryManagementStatusFilter),
        loadMenu(),
      ]);
      resetCategoryForm();
      setCategoryMessage(
        editingCategoryId ? "Category updated." : "Category created.",
      );
    } catch (categoryError) {
      setCategoryMessage(
        categoryError instanceof Error
          ? categoryError.message
          : "Category update failed.",
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  async function deactivateCategory(category: Category) {
    if (!canManageMenu) return;
    if (!window.confirm(`Deactivate ${category.name}?`)) return;

    setCategoryBusy(true);
    setCategoryMessage("");
    try {
      const response = await fetch(buildApiUrl(`/api/categories/${category.id}`), {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await Promise.all([
        loadCategories(),
        loadCategoryManagementItems(categoryManagementStatusFilter),
        loadMenu(),
      ]);
      setCategoryMessage("Category deactivated.");
      if (editingCategoryId === category.id) resetCategoryForm();
    } catch (categoryError) {
      setCategoryMessage(
        categoryError instanceof Error
          ? categoryError.message
          : "Category deactivate failed.",
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  async function reactivateCategory(category: Category) {
    if (!canManageMenu) return;

    setCategoryBusy(true);
    setCategoryMessage("");
    try {
      const response = await fetch(buildApiUrl(`/api/categories/${category.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: true }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await Promise.all([
        loadCategories(),
        loadCategoryManagementItems(categoryManagementStatusFilter),
        loadMenu(),
      ]);
      setCategoryMessage("Category reactivated.");
      if (editingCategoryId === category.id) resetCategoryForm();
    } catch (categoryError) {
      setCategoryMessage(
        categoryError instanceof Error
          ? categoryError.message
          : "Category reactivate failed.",
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  function resetPromotionForm() {
    setPromotionForm(emptyPromotionForm);
    setEditingPromotionId(null);
  }

  function startEditPromotion(promotion: Promotion) {
    setPromotionForm({
      code: promotion.code,
      discountType: promotion.discountType,
      discountValue: String(promotion.discountValue),
    });
    setEditingPromotionId(promotion.id);
    setPromotionMessage("");
  }

  async function submitPromotionForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageMenu) return;

    const discountValue = Number.parseInt(promotionForm.discountValue, 10);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setPromotionMessage("Discount value must be a positive number.");
      return;
    }
    if (
      promotionForm.discountType === "percent" &&
      (discountValue < 1 || discountValue > 100)
    ) {
      setPromotionMessage("Percent discount must be between 1 and 100.");
      return;
    }

    setPromotionBusy(true);
    setPromotionMessage("");
    try {
      const response = await fetch(
        buildApiUrl(
          editingPromotionId
            ? `/api/admin/promotions/${editingPromotionId}`
            : "/api/admin/promotions",
        ),
        {
          method: editingPromotionId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            code: promotionForm.code,
            discountType: promotionForm.discountType,
            discountValue,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await loadPromotions(promotionStatusFilter);
      resetPromotionForm();
      setPromotionMessage(
        editingPromotionId ? "Promotion updated." : "Promotion created.",
      );
    } catch (promotionError) {
      setPromotionMessage(
        promotionError instanceof Error
          ? promotionError.message
          : "Promotion save failed.",
      );
    } finally {
      setPromotionBusy(false);
    }
  }

  async function setPromotionActive(promotion: Promotion, isActive: boolean) {
    if (!canManageMenu) return;

    setPromotionBusy(true);
    setPromotionMessage("");
    try {
      const response = isActive
        ? await fetch(buildApiUrl(`/api/admin/promotions/${promotion.id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ isActive: true }),
          })
        : await fetch(buildApiUrl(`/api/admin/promotions/${promotion.id}`), {
            method: "DELETE",
            credentials: "include",
          });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await loadPromotions(promotionStatusFilter);
      setPromotionMessage(
        isActive ? "Promotion reactivated." : "Promotion deactivated.",
      );
      if (editingPromotionId === promotion.id && !isActive) resetPromotionForm();
    } catch (promotionError) {
      setPromotionMessage(
        promotionError instanceof Error
          ? promotionError.message
          : "Promotion update failed.",
      );
    } finally {
      setPromotionBusy(false);
    }
  }

  async function addCategoryToItem(item: MenuItem) {
    if (!canManageMenu) return;
    const categoryId = Number(selectedCategoryByItemId[item.id]);
    if (!categoryId) {
      setMenuMessage("Select a category first.");
      return;
    }

    setMenuBusy(true);
    setMenuMessage("");
    try {
      const response = await fetch(buildApiUrl(`/api/menu/${item.id}/categories`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ categoryId }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await loadMenu();
      setMenuMessage("Category assigned to item.");
    } catch (assignError) {
      setMenuMessage(
        assignError instanceof Error
          ? assignError.message
          : "Category assignment failed.",
      );
    } finally {
      setMenuBusy(false);
    }
  }

  async function removeCategoryFromItem(item: MenuItem, category: Category) {
    if (!canManageMenu) return;

    setMenuBusy(true);
    setMenuMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/menu/${item.id}/categories/${category.id}`),
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await loadMenu();
      setMenuMessage("Category removed from item.");
    } catch (removeError) {
      setMenuMessage(
        removeError instanceof Error
          ? removeError.message
          : "Category removal failed.",
      );
    } finally {
      setMenuBusy(false);
    }
  }

  async function submitRoleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setRoleRequestBusy(true);
    setRoleRequestMessage("");
    try {
      const response = await fetch(buildApiUrl("/api/users/me/role-request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requestedRole: roleRequestRole,
          reason: roleRequestReason.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setRoleRequestReason("");
      setRoleRequestMessage("Role request submitted.");
    } catch (requestError) {
      setRoleRequestMessage(
        requestError instanceof Error
          ? requestError.message
          : "Role request failed.",
      );
    } finally {
      setRoleRequestBusy(false);
    }
  }

  async function reviewRoleRequest(
    requestId: number,
    status: "approved" | "rejected",
  ) {
    if (!isAdmin) return;

    setAdminReviewBusyId(requestId);
    setAdminMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/role-requests/${requestId}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status,
            reviewNote: adminReviewNotes[requestId]?.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await loadAdminRoleRequests();
      setAdminMessage(`Request ${status}.`);
    } catch (reviewError) {
      setAdminMessage(
        reviewError instanceof Error ? reviewError.message : "Review failed.",
      );
    } finally {
      setAdminReviewBusyId(null);
    }
  }

  async function submitAdminRoleUpdate() {
    if (!isAdmin) return;
    const userId = adminRoleUserId.trim();
    if (!userId || adminRoleDraft.length === 0) return;

    setAdminRoleBusy(true);
    setAdminMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/users/${userId}/roles`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ roles: adminRoleDraft }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setAdminMessage("Roles updated.");
    } catch (roleError) {
      setAdminMessage(
        roleError instanceof Error ? roleError.message : "Role update failed.",
      );
    } finally {
      setAdminRoleBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error m-4">
        <span>{error}</span>
      </div>
    );
  }

  // Render sections
  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar sticky top-0 z-20 bg-base-100/95 shadow-lg backdrop-blur">
        <div className="navbar-start">
          <div className="dropdown lg:hidden">
            <button tabIndex={0} className="btn btn-ghost" aria-label="Open menu">
              <span className="text-xl">☰</span>
            </button>
            <ul
              tabIndex={0}
              className="menu dropdown-content mt-3 w-56 rounded-box bg-base-100 p-2 shadow"
            >
              <li>
                <button onClick={() => scrollToSection(menuSectionRef)}>
                  Menu
                </button>
              </li>
              {user ? (
                <li>
                  <button onClick={() => setIsCartOpen(true)}>Cart</button>
                </li>
              ) : null}
              {user && !canViewAllOrders ? (
                <li>
                  <button onClick={() => scrollToSection(ordersSectionRef)}>
                    My orders
                  </button>
                </li>
              ) : null}
              {hasManagerTools ? (
                <li>
                  <button onClick={() => scrollToSection(managerSectionRef)}>
                    Manager tools
                  </button>
                </li>
              ) : null}
              <li>
                <button onClick={() => scrollToSection(accountSectionRef)}>
                  {user ? "Account" : "Sign in"}
                </button>
              </li>
            </ul>
          </div>
          <button
            className="btn btn-ghost text-xl normal-case"
            onClick={() => scrollToSection(menuSectionRef)}
          >
            Breakfast Shop
          </button>
        </div>

        <div className="navbar-center hidden lg:flex">
          <div className="join">
            <button
              className="btn btn-sm join-item"
              onClick={() => scrollToSection(menuSectionRef)}
            >
              Menu
            </button>
            {user ? (
              <button
                className="btn btn-sm join-item"
                onClick={() => setIsCartOpen(true)}
              >
                Cart
              </button>
            ) : null}
            {user && !canViewAllOrders ? (
              <button
                className="btn btn-sm join-item"
                onClick={() => scrollToSection(ordersSectionRef)}
              >
                My orders
              </button>
            ) : null}
            {hasManagerTools ? (
              <button
                className="btn btn-sm join-item"
                onClick={() => scrollToSection(managerSectionRef)}
              >
                Manager tools
              </button>
            ) : null}
            <button
              className="btn btn-sm join-item"
              onClick={() => scrollToSection(accountSectionRef)}
            >
              {user ? "Account" : "Sign in"}
            </button>
          </div>
        </div>

        <div className="navbar-end gap-2">
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <span className="badge badge-primary">
              {items.length} items / {grouped.categories.length} categories
            </span>
            {user ? (
              <>
                <span className="badge badge-secondary">Cart {cartItemCount}</span>
                <span className="badge badge-accent">${cartTotal}</span>
              </>
            ) : null}
          </div>
          {user ? (
            <div className="dropdown dropdown-end">
              <button tabIndex={0} className="btn btn-sm btn-outline">
                {user.name}
              </button>
              <div
                tabIndex={0}
                className="dropdown-content mt-3 w-64 rounded-box bg-base-100 p-4 shadow"
              >
                <p className="font-semibold">{user.name}</p>
                <p className="text-xs opacity-60">{user.email}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {roles.map((role) => (
                    <span key={role} className="badge badge-neutral">
                      {role}
                    </span>
                  ))}
                </div>
                <button
                  className="btn btn-sm btn-block mt-4"
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <main className="container mx-auto p-6">
        {!user ? (
          <section
            ref={accountSectionRef}
            className="max-w-xl mx-auto card bg-base-100 shadow-md mb-8 scroll-mt-24"
          >
            <div className="card-body">
              <h2 className="card-title">Sign in with Google</h2>
              <p className="text-sm opacity-70">
                Sign in to create orders, manage your cart, or request staff
                access.
              </p>
              {authError ? (
                <div className="alert alert-error">
                  <span>{authError}</span>
                </div>
              ) : null}
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  void handleGoogleSignIn();
                }}
                disabled={isGoogleSigningIn}
              >
                {isGoogleSigningIn ? "Opening Google..." : "Sign in"}
              </button>
              {demoAuthAvailable ? (
                <div className="mt-4 rounded-box border border-base-300 bg-base-200 p-3">
                  <div className="mb-2">
                    <h3 className="font-semibold">Demo mode only</h3>
                    <p className="text-xs opacity-70">
                      Quickly switch classroom test roles without Google OAuth.
                    </p>
                  </div>
                  {demoAuthError ? (
                    <div className="alert alert-warning mb-2 py-2 text-sm">
                      <span>{demoAuthError}</span>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {demoUsers.map((demoUser) => (
                      <button
                        key={demoUser.id}
                        className="btn btn-sm btn-outline"
                        disabled={demoLoginLoading !== null}
                        onClick={() => {
                          void handleDemoLogin(demoUser.id);
                        }}
                      >
                        {demoLoginLoading === demoUser.id
                          ? "Logging in..."
                          : `Login as ${demoUser.name.replace("Demo ", "")}`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {!demoAuthAvailable && demoAuthError ? (
                <p className="text-xs opacity-60">{demoAuthError}</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {actionError ? (
          <div className="alert alert-warning mb-4">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span>{actionError}</span>
                {isMenuVersionChangedMessage(actionError) ? (
                  <p className="mt-1 text-sm">
                    The menu has changed. Please review your cart before
                    checkout.
                  </p>
                ) : null}
              </div>
              {isMenuVersionChangedMessage(actionError) ? (
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    void refreshCartVersionState();
                  }}
                  disabled={isRefreshingCartVersion}
                >
                  {isRefreshingCartVersion ? "Refreshing..." : "Refresh cart"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {user ? (
          <section
            ref={accountSectionRef}
            className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-24"
          >
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body">
                <h2 className="card-title">Your access</h2>
                <p className="text-sm opacity-70">{user.email}</p>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <span key={role} className="badge badge-outline">
                      {role}
                    </span>
                  ))}
                </div>
                <p className="text-xs opacity-60">
                  {roles.length === 1 && roles.includes("customer")
                    ? "You have the default customer role."
                    : "Your account has elevated access."}
                </p>
              </div>
            </div>

            <form
              className="card bg-base-100 shadow-sm border border-base-300"
              onSubmit={(event) => {
                void submitRoleRequest(event);
              }}
            >
              <div className="card-body">
                <h2 className="card-title">Request a role</h2>
                <div className="form-control">
                  <label className="label" htmlFor="role-request-role">
                    <span className="label-text">Role</span>
                  </label>
                  <select
                    id="role-request-role"
                    className="select select-bordered"
                    value={roleRequestRole}
                    onChange={(event) => {
                      setRoleRequestRole(event.target.value as "staff" | "chef");
                    }}
                  >
                    <option value="staff">staff</option>
                    <option value="chef">chef</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label" htmlFor="role-request-reason">
                    <span className="label-text">Reason</span>
                  </label>
                  <textarea
                    id="role-request-reason"
                    className="textarea textarea-bordered min-h-24"
                    value={roleRequestReason}
                    minLength={10}
                    onChange={(event) => {
                      setRoleRequestReason(event.target.value);
                    }}
                  />
                </div>
                {roleRequestMessage ? (
                  <div className="alert">
                    <span>{roleRequestMessage}</span>
                  </div>
                ) : null}
                <button
                  className="btn btn-primary"
                  disabled={roleRequestBusy || roleRequestReason.trim().length < 10}
                >
                  {roleRequestBusy ? "Submitting..." : "Submit request"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {hasManagerTools ? (
          <section
            ref={managerSectionRef}
            className="mb-8 scroll-mt-24 rounded-box border border-base-300 bg-base-100 shadow-md"
          >
            <div className="border-b border-base-300 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Manager tools</h2>
                  <p className="text-sm opacity-70">
                    Manage orders, analytics, menu items, categories, and role
                    requests based on your role.
                  </p>
                </div>
                <div className="tabs tabs-boxed w-full overflow-x-auto lg:w-auto">
                  {managerTabs.map((tab) => (
                    <button
                      key={tab.id}
                      className={`tab whitespace-nowrap ${
                        managerTab === tab.id ? "tab-active" : ""
                      }`}
                      onClick={() => setManagerTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {managerTab === "orders" && canViewAllOrders ? (
              <div className="p-5">
                <div className="mb-4">
                  <h3 className="text-xl font-bold">Order operations</h3>
                  <p className="text-sm opacity-70">
                    Track submitted orders and update kitchen / pickup status.
                  </p>
                </div>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">Active orders</div>
                    <div className="stat-value text-info">{activeOrders}</div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">Ready for pickup</div>
                    <div className="stat-value text-primary">{readyOrders}</div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">Completed</div>
                    <div className="stat-value text-success">
                      {completedOrders}
                    </div>
                  </div>
                </div>
                {canCreateWalkInOrder ? (
                  <div className="mb-4 rounded-box border border-base-300 bg-base-200 p-4">
                    <div className="mb-3">
                      <h4 className="font-semibold">Staff order</h4>
                      <p className="text-sm opacity-70">
                        Create a walk-in or phone order for a guest without
                        customer login.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                      <select
                        className="select select-bordered select-sm"
                        value={walkInOrderForm.orderSource}
                        onChange={(event) =>
                          setWalkInOrderForm((current) => ({
                            ...current,
                            orderSource: event.target.value as
                              | "walk_in"
                              | "phone",
                          }))
                        }
                      >
                        <option value="walk_in">Walk-in</option>
                        <option value="phone">Phone</option>
                      </select>
                      <input
                        className="input input-bordered input-sm"
                        placeholder="Guest name"
                        value={walkInOrderForm.guestName}
                        onChange={(event) =>
                          setWalkInOrderForm((current) => ({
                            ...current,
                            guestName: event.target.value,
                          }))
                        }
                      />
                      <input
                        className="input input-bordered input-sm"
                        placeholder="Phone number for phone orders"
                        value={walkInOrderForm.guestPhone}
                        onChange={(event) =>
                          setWalkInOrderForm((current) => ({
                            ...current,
                            guestPhone: event.target.value,
                          }))
                        }
                      />
                      <select
                        className="select select-bordered select-sm"
                        value={walkInOrderForm.fulfillmentType}
                        onChange={(event) =>
                          setWalkInOrderForm((current) => ({
                            ...current,
                            fulfillmentType: event.target
                              .value as FulfillmentType,
                          }))
                        }
                      >
                        <option value="takeout">Takeout</option>
                        <option value="dine_in">Dine in</option>
                      </select>
                      <input
                        className="input input-bordered input-sm"
                        type="datetime-local"
                        value={walkInOrderForm.pickupTime}
                        onChange={(event) =>
                          setWalkInOrderForm((current) => ({
                            ...current,
                            pickupTime: event.target.value,
                          }))
                        }
                      />
                      <select
                        className="select select-bordered select-sm"
                        value={walkInOrderForm.paymentMethod}
                        onChange={(event) =>
                          setWalkInOrderForm((current) => ({
                            ...current,
                            paymentMethod: event.target.value as PaymentMethod,
                          }))
                        }
                      >
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="online">Online</option>
                      </select>
                      <input
                        className="input input-bordered input-sm"
                        placeholder="Promo code"
                        value={walkInOrderForm.promoCode}
                        onChange={(event) =>
                          setWalkInOrderForm((current) => ({
                            ...current,
                            promoCode: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <textarea
                      className="textarea textarea-bordered mt-3 min-h-20 w-full"
                      placeholder="Guest note"
                      value={walkInOrderForm.customerNote}
                      onChange={(event) =>
                        setWalkInOrderForm((current) => ({
                          ...current,
                          customerNote: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select
                        className="select select-bordered select-sm min-w-48 flex-1"
                        value={walkInSelectedItemId}
                        onChange={(event) =>
                          setWalkInSelectedItemId(event.target.value)
                        }
                      >
                        <option value="">Select menu item</option>
                        {items.map((item) => (
                          <option
                            key={item.id}
                            value={item.id}
                            disabled={!item.is_available}
                          >
                            {item.name} - ${item.price}
                            {item.is_available ? "" : " - Sold out"}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input input-bordered input-sm w-24"
                        min={1}
                        step={1}
                        type="number"
                        value={walkInQty}
                        onChange={(event) => setWalkInQty(event.target.value)}
                      />
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={addWalkInItem}
                      >
                        Add item
                      </button>
                    </div>
                    {walkInOrderDetails.length > 0 ? (
                      <div className="mt-3 overflow-x-auto">
                        <table className="table table-sm">
                          <tbody>
                            {walkInOrderDetails.map((detail) => (
                              <tr key={detail.itemId}>
                                <td>{detail.item.name}</td>
                                <td>x {detail.qty}</td>
                                <td>${detail.subtotal}</td>
                                <td className="text-right">
                                  <button
                                    className="btn btn-xs btn-ghost"
                                    onClick={() =>
                                      removeWalkInItem(detail.itemId)
                                    }
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <span className="font-semibold">
                        Staff order total: ${walkInOrderTotal}
                      </span>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={walkInBusy || walkInOrderItems.length === 0}
                        onClick={() => void submitWalkInOrder()}
                      >
                        {walkInBusy ? "Creating..." : "Submit walk-in order"}
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mb-4 flex flex-wrap gap-2">
                  {orderBoardFilters.map((filter) => (
                    <button
                      key={filter.id}
                      className={`btn btn-sm ${
                        orderStatusFilter === filter.id
                          ? "btn-primary"
                          : "btn-outline"
                      }`}
                      onClick={() => setOrderStatusFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                {statusMessage ? (
                  <div className="alert mb-4">
                    <span>{statusMessage}</span>
                  </div>
                ) : null}
                {historyLoading ? (
                  <div className="alert">
                    <span>Loading orders...</span>
                  </div>
                ) : historyOrders.length === 0 ? (
                  <div className="alert alert-info">
                    <span>No orders yet.</span>
                  </div>
                ) : filteredBoardOrders.length === 0 ? (
                  <div className="alert alert-info">
                    <span>
                      No orders match this filter. Try another status filter.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredBoardOrders.map((order) => {
                      const allowedStatuses = getNextAllowedStatuses(order);
                      const primaryAction = getPrimaryOrderAction(order);
                      const urgent = isUrgentOrder(order);
                      const orderAgeMinutes = getOrderAgeMinutes(order);
                      const draftedStatus = orderStatusDrafts[order.id];
                      const selectedStatus =
                        draftedStatus && allowedStatuses.includes(draftedStatus)
                          ? draftedStatus
                          : allowedStatuses[0];
                      const canCancelThisOrder =
                        canCancelManagerOrder &&
                        (order.status === "submitted" ||
                          order.status === "preparing" ||
                          order.status === "ready");
                      const canSetIssueForOrder =
                        canReportOrderIssue &&
                        (order.status === "submitted" ||
                          order.status === "preparing");
                      const issueDraft = issueDrafts[order.id] ?? {
                        issueType: order.issueType ?? "out_of_stock",
                        issueNote: "",
                      };

                      return (
                        <article
                          key={order.id}
                          className="rounded-box border border-base-300 bg-base-100 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h4 className="font-semibold">
                                Order #{order.id}
                              </h4>
                              <p className="text-sm font-medium text-primary">
                                Pickup {formatPickupNumber(order.id)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span
                                className={`badge ${getStatusBadgeClass(
                                  order.status,
                                )}`}
                              >
                                {order.status}
                              </span>
                              {urgent ? (
                                <span className="badge badge-error">
                                  Urgent {orderAgeMinutes}m
                                </span>
                              ) : null}
                              {order.status === "ready" ? (
                                <span className="badge badge-primary">
                                  Ready for pickup
                                </span>
                              ) : null}
                              {canUpdatePaymentStatus ? (
                                <button
                                  className="btn btn-sm btn-outline"
                                  onClick={() => printReceipt(order)}
                                >
                                  Print receipt
                                </button>
                              ) : null}
                              {canCancelThisOrder ? (
                                <button
                                  className="btn btn-sm btn-error btn-outline"
                                  disabled={
                                    cancelUpdatingOrderId === order.id
                                  }
                                  onClick={() => {
                                    void cancelOrder(order.id);
                                  }}
                                >
                                  {cancelUpdatingOrderId === order.id
                                    ? "Cancelling..."
                                    : "Void order"}
                                </button>
                              ) : null}
                              {primaryAction ? (
                                <button
                                  className="btn btn-sm btn-primary"
                                  disabled={
                                    statusUpdatingOrderId === order.id
                                  }
                                  onClick={() => {
                                    void updateOrderStatus(
                                      order.id,
                                      primaryAction.status,
                                    );
                                  }}
                                >
                                  {statusUpdatingOrderId === order.id
                                    ? "Updating..."
                                    : primaryAction.label}
                                </button>
                              ) : null}
                              {allowedStatuses.length > 0 ? (
                                <div className="join">
                                  <select
                                    className="select select-sm select-bordered join-item"
                                    value={selectedStatus}
                                    disabled={
                                      statusUpdatingOrderId === order.id
                                    }
                                    onChange={(event) => {
                                      setOrderStatusDrafts((currentDrafts) => ({
                                        ...currentDrafts,
                                        [order.id]: event.target
                                          .value as OrderStatus,
                                      }));
                                    }}
                                  >
                                    {allowedStatuses.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    className="btn btn-sm join-item"
                                    disabled={
                                      statusUpdatingOrderId === order.id
                                    }
                                    onClick={() => {
                                      void updateOrderStatus(
                                        order.id,
                                        selectedStatus,
                                      );
                                    }}
                                  >
                                    {statusUpdatingOrderId === order.id
                                      ? "Updating..."
                                      : "Update status"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-2 text-sm opacity-70">
                            Created at{" "}
                            {
                              (order as Order & { createdAtTaipei?: string })
                                .createdAtTaipei ?? order.createdAt
                            }
                          </p>
                          <div className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                            <span>
                              Source: {formatOrderSource(order.orderSource)}
                            </span>
                            {(order.orderSource === "walk_in" ||
                              order.orderSource === "phone") &&
                            order.guestName ? (
                              <span>Guest: {order.guestName}</span>
                            ) : null}
                            {order.guestPhone ? (
                              <span>Phone: {order.guestPhone}</span>
                            ) : null}
                            <span>Fulfillment: {order.fulfillmentType}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>Payment: {order.paymentMethod}</span>
                              <span
                                className={`badge ${
                                  order.paymentStatus === "paid"
                                    ? "badge-success"
                                    : "badge-warning"
                                }`}
                              >
                                {order.paymentStatus}
                              </span>
                              {canUpdatePaymentStatus &&
                              order.paymentStatus === "unpaid" &&
                              order.status !== "pending" ? (
                                <button
                                  className="btn btn-xs btn-outline"
                                  disabled={
                                    paymentUpdatingOrderId === order.id
                                  }
                                  onClick={() => {
                                    void markOrderPaid(order.id);
                                  }}
                                >
                                  {paymentUpdatingOrderId === order.id
                                    ? "Updating..."
                                    : "Mark paid"}
                                </button>
                              ) : null}
                            </div>
                            {order.pickupTime ? (
                              <span>
                                Pickup: {formatCheckoutDateTime(order.pickupTime)}
                              </span>
                            ) : null}
                            {order.paymentStatus === "unpaid" &&
                            (order.status === "ready" ||
                              order.status === "completed") ? (
                              <span className="text-warning">
                                Payment due before pickup.
                              </span>
                            ) : null}
                            {order.customerNote ? (
                              <span className="md:col-span-2">
                                Note: {order.customerNote}
                              </span>
                            ) : null}
                            {order.discountAmount > 0 || order.promoCode ? (
                              <span className="md:col-span-2">
                                Promo {order.promoCode ?? "-"}: subtotal $
                                {order.subtotal}, discount -$
                                {order.discountAmount}
                              </span>
                            ) : null}
                          </div>
                          {order.issueType ? (
                            <div className="alert alert-warning mt-3 items-start">
                              <div>
                                <div className="font-semibold">
                                  Issue: {order.issueType}
                                </div>
                                {order.issueNote ? (
                                  <div className="text-sm">
                                    Note: {order.issueNote}
                                  </div>
                                ) : null}
                                {order.issueReportedAt ? (
                                  <div className="text-sm opacity-70">
                                    Reported at:{" "}
                                    {formatCheckoutDateTime(
                                      order.issueReportedAt,
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              {canClearOrderIssue &&
                              order.status !== "pending" &&
                              order.status !== "completed" &&
                              order.status !== "cancelled" ? (
                                <button
                                  className="btn btn-sm btn-outline"
                                  disabled={issueUpdatingOrderId === order.id}
                                  onClick={() => {
                                    void clearOrderIssue(order.id);
                                  }}
                                >
                                  {issueUpdatingOrderId === order.id
                                    ? "Updating..."
                                    : "Clear issue"}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          {canSetIssueForOrder ? (
                            <div className="mt-3 rounded-box border border-base-300 bg-base-200 p-3">
                              <div className="mb-2 text-sm font-semibold">
                                Internal issue
                              </div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,220px)_1fr_auto]">
                                <select
                                  className="select select-sm select-bordered"
                                  value={issueDraft.issueType}
                                  disabled={issueUpdatingOrderId === order.id}
                                  onChange={(event) => {
                                    setIssueDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [order.id]: {
                                        ...issueDraft,
                                        issueType: event.target
                                          .value as OrderIssueType,
                                      },
                                    }));
                                  }}
                                >
                                  {orderIssueTypeOptions.map((issueType) => (
                                    <option key={issueType} value={issueType}>
                                      {issueType}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="input input-sm input-bordered"
                                  placeholder="Issue note"
                                  value={issueDraft.issueNote}
                                  disabled={issueUpdatingOrderId === order.id}
                                  onChange={(event) => {
                                    setIssueDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [order.id]: {
                                        ...issueDraft,
                                        issueNote: event.target.value,
                                      },
                                    }));
                                  }}
                                />
                                <button
                                  className="btn btn-sm btn-warning"
                                  disabled={issueUpdatingOrderId === order.id}
                                  onClick={() => {
                                    void setOrderIssue(order.id);
                                  }}
                                >
                                  {issueUpdatingOrderId === order.id
                                    ? "Saving..."
                                    : "Set issue"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                            {order.items.map((detail) => (
                              <li key={`${order.id}-${detail.item.id}`}>
                                {detail.item.name} x {detail.qty}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-right font-bold">
                            Total ${order.total}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {hasManagerTools && managerTab === "roleRequests" && isAdmin ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">Role request review</h2>
                  <p className="text-sm opacity-70">
                    Approve or reject staff and chef access requests.
                  </p>
                </div>
                <select
                  className="select select-bordered select-sm"
                  value={adminStatus}
                  onChange={(event) => {
                    setAdminStatus(event.target.value as RoleRequestStatus);
                  }}
                >
                  <option value="pending">pending</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                  <option value="all">all</option>
                </select>
              </div>
              {adminMessage ? (
                <div className="alert">
                  <span>{adminMessage}</span>
                </div>
              ) : null}
              <div className="rounded-box border border-base-300 bg-base-200 p-4">
                <h3 className="font-semibold">Direct role editor</h3>
                <p className="text-sm opacity-70">
                  This replaces the user roles. Keep customer checked if the
                  user should still act as a customer.
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  <input
                    className="input input-bordered input-sm"
                    placeholder="User ID"
                    value={adminRoleUserId}
                    onChange={(event) => setAdminRoleUserId(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-3">
                    {editableRoles.map((role) => (
                      <label
                        key={role}
                        className="label cursor-pointer justify-start gap-2 p-0"
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={adminRoleDraft.includes(role)}
                          onChange={(event) => {
                            setAdminRoleDraft((currentRoles) =>
                              event.target.checked
                                ? Array.from(new Set([...currentRoles, role]))
                                : currentRoles.filter(
                                    (currentRole) => currentRole !== role,
                                  ),
                            );
                          }}
                        />
                        <span className="label-text">{role}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    className="btn btn-sm btn-primary w-fit"
                    disabled={
                      adminRoleBusy ||
                      adminRoleUserId.trim() === "" ||
                      adminRoleDraft.length === 0
                    }
                    onClick={() => void submitAdminRoleUpdate()}
                  >
                    {adminRoleBusy ? "Updating..." : "Update roles"}
                  </button>
                </div>
              </div>
              {adminLoading ? (
                <div className="alert">
                  <span>Loading requests...</span>
                </div>
              ) : adminRequests.length === 0 ? (
                <div className="alert alert-info">
                  <span>No role requests found.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Reason</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminRequests.map((request) => (
                        <tr key={request.id}>
                          <td>{request.id}</td>
                          <td className="max-w-48 truncate">{request.userId}</td>
                          <td>{request.requestedRole}</td>
                          <td>
                            <span className="badge">{request.status}</span>
                          </td>
                          <td className="max-w-xs">{request.reason}</td>
                          <td>
                            {request.status === "pending" ? (
                              <div className="flex flex-col gap-2 min-w-56">
                                <input
                                  className="input input-bordered input-sm"
                                  placeholder="Optional note"
                                  value={adminReviewNotes[request.id] ?? ""}
                                  onChange={(event) => {
                                    setAdminReviewNotes((current) => ({
                                      ...current,
                                      [request.id]: event.target.value,
                                    }));
                                  }}
                                />
                                <div className="flex gap-2">
                                  <button
                                    className="btn btn-success btn-sm"
                                    disabled={adminReviewBusyId === request.id}
                                    onClick={() => {
                                      void reviewRoleRequest(
                                        request.id,
                                        "approved",
                                      );
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="btn btn-error btn-sm"
                                    disabled={adminReviewBusyId === request.id}
                                    onClick={() => {
                                      void reviewRoleRequest(
                                        request.id,
                                        "rejected",
                                      );
                                    }}
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm opacity-70">
                                {request.reviewNote || "Reviewed"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {hasManagerTools && managerTab === "auditLogs" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">Audit logs</h2>
                  <p className="text-sm opacity-70">
                    Review recent system operations by owner and admin users.
                  </p>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={auditLogsLoading}
                  onClick={() => void loadAuditLogs()}
                >
                  {auditLogsLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
              <div className="rounded-box border border-base-300 bg-base-200 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
                  <label className="form-control">
                    <span className="label-text">Action</span>
                    <select
                      className="select select-bordered select-sm"
                      value={auditLogActionFilter}
                      onChange={(event) =>
                        setAuditLogActionFilter(
                          event.target.value as "" | AuditLogAction,
                        )
                      }
                    >
                      <option value="">All actions</option>
                      {auditLogActionOptions.map((action) => (
                        <option key={action} value={action}>
                          {formatAuditAction(action)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text">Target type</span>
                    <select
                      className="select select-bordered select-sm"
                      value={auditLogTargetTypeFilter}
                      onChange={(event) =>
                        setAuditLogTargetTypeFilter(
                          event.target.value as "" | AuditLogTargetType,
                        )
                      }
                    >
                      <option value="">All targets</option>
                      {auditLogTargetTypeOptions.map((targetType) => (
                        <option key={targetType} value={targetType}>
                          {formatAuditTargetType(targetType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text">Date range</span>
                    <select
                      className="select select-bordered select-sm"
                      value={auditLogRange}
                      onChange={(event) =>
                        setAuditLogRange(event.target.value as AuditLogRange)
                      }
                    >
                      {analyticsRangeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text">Limit</span>
                    <select
                      className="select select-bordered select-sm"
                      value={auditLogLimit}
                      onChange={(event) => setAuditLogLimit(event.target.value)}
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text">Actor</span>
                    <input
                      className="input input-bordered input-sm"
                      placeholder="Name or user ID"
                      value={auditLogActorFilter}
                      onChange={(event) =>
                        setAuditLogActorFilter(event.target.value)
                      }
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text">Target ID</span>
                    <input
                      className="input input-bordered input-sm"
                      placeholder="Order, menu, user..."
                      value={auditLogTargetIdFilter}
                      onChange={(event) =>
                        setAuditLogTargetIdFilter(event.target.value)
                      }
                    />
                  </label>
                  <button
                    className="btn btn-sm btn-primary self-end"
                    disabled={auditLogsLoading}
                    onClick={() => void loadAuditLogs()}
                  >
                    Apply
                  </button>
                </div>
                {auditLogRange === "custom" ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="form-control">
                      <span className="label-text">Start date</span>
                      <input
                        className="input input-bordered input-sm"
                        type="date"
                        value={auditLogStartDate}
                        onChange={(event) =>
                          setAuditLogStartDate(event.target.value)
                        }
                      />
                    </label>
                    <label className="form-control">
                      <span className="label-text">End date</span>
                      <input
                        className="input input-bordered input-sm"
                        type="date"
                        value={auditLogEndDate}
                        onChange={(event) =>
                          setAuditLogEndDate(event.target.value)
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>
              {auditLogsMessage ? (
                <div className="alert alert-warning">
                  <span>{auditLogsMessage}</span>
                </div>
              ) : null}
              {auditLogsLoading ? (
                <div className="alert">
                  <span>Loading audit logs...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="alert alert-info">
                  <span>No audit logs found.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Actor</th>
                        <th>Action</th>
                        <th>Target</th>
                        <th>Message</th>
                        <th>Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap">
                            {formatCheckoutDateTime(log.createdAt)}
                          </td>
                          <td>
                            <div>{log.actorName ?? "-"}</div>
                            <div className="text-xs opacity-60">
                              {log.actorRoles.length > 0
                                ? log.actorRoles.join(", ")
                                : "No roles"}
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-outline">
                              {formatAuditAction(log.action)}
                            </span>
                            <div className="text-xs opacity-60">
                              {log.action}
                            </div>
                          </td>
                          <td>
                            <div>{formatAuditTargetType(log.targetType)}</div>
                            <div className="text-xs opacity-60">
                              {log.targetType}
                              {log.targetId ? ` / ${log.targetId}` : ""}
                            </div>
                          </td>
                          <td className="max-w-sm">{log.message}</td>
                          <td className="max-w-xs break-words text-xs">
                            {log.metadata ? (
                              <details>
                                <summary className="cursor-pointer">
                                  {formatAuditMetadata(log.metadata)}
                                </summary>
                                <pre className="mt-2 max-w-xs overflow-x-auto rounded bg-base-200 p-2 text-xs">
                                  {formatAuditMetadataDetail(log.metadata)}
                                </pre>
                              </details>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {hasManagerTools && managerTab === "analytics" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">Analytics</h2>
                  <p className="text-sm opacity-70">
                    Review category sales and top-selling menu items.
                  </p>
                  <p className="text-xs opacity-60">
                    Showing: {analyticsRangeLabel}
                  </p>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={analyticsLoading}
                  onClick={() => {
                    void loadAnalytics();
                  }}
                >
                  {analyticsLoading ? "Loading..." : "Refresh analytics"}
                </button>
              </div>
              <div className="rounded-box border border-base-300 bg-base-200 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="form-control w-full sm:w-48">
                    <span className="label-text">Date range</span>
                    <select
                      className="select select-bordered select-sm"
                      value={analyticsRange}
                      onChange={(event) =>
                        setAnalyticsRange(event.target.value as AnalyticsRange)
                      }
                    >
                      {analyticsRangeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {analyticsRange === "custom" ? (
                    <>
                      <label className="form-control w-full sm:w-44">
                        <span className="label-text">Start date</span>
                        <input
                          className="input input-bordered input-sm"
                          type="date"
                          value={analyticsStartDate}
                          onChange={(event) =>
                            setAnalyticsStartDate(event.target.value)
                          }
                        />
                      </label>
                      <label className="form-control w-full sm:w-44">
                        <span className="label-text">End date</span>
                        <input
                          className="input input-bordered input-sm"
                          type="date"
                          value={analyticsEndDate}
                          onChange={(event) =>
                            setAnalyticsEndDate(event.target.value)
                          }
                        />
                      </label>
                    </>
                  ) : null}
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={analyticsLoading}
                    onClick={applyAnalyticsDateRange}
                  >
                    Apply
                  </button>
                </div>
              </div>
              {analyticsMessage ? (
                <div className="alert alert-warning">
                  <span>{analyticsMessage}</span>
                </div>
              ) : null}
              {analyticsSummary ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">Total revenue</div>
                      <div className="stat-value text-success">
                        ${analyticsSummary.totalRevenue}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">Today revenue</div>
                      <div className="stat-value text-primary">
                        ${analyticsSummary.todayRevenue}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">Revenue orders</div>
                      <div className="stat-value">
                        {analyticsSummary.revenueOrderCount}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">Average order value</div>
                      <div className="stat-value">
                        ${analyticsSummary.averageOrderValue.toFixed(0)}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">Average rating</div>
                      <div className="stat-value text-warning">
                        {analyticsSummary.averageRating === null
                          ? "-"
                          : analyticsSummary.averageRating.toFixed(1)}
                      </div>
                      <div className="stat-desc">
                        {analyticsSummary.ratingsCount} ratings
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">Cancelled orders</div>
                      <div className="stat-value text-error">
                        {analyticsSummary.cancellationCount}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <div className="rounded-box border border-base-300 p-3">
                      <h3 className="mb-2 font-semibold">Payment methods</h3>
                      <p>Cash: {analyticsSummary.paymentMethods.cash}</p>
                      <p>Card: {analyticsSummary.paymentMethods.card}</p>
                      <p>Online: {analyticsSummary.paymentMethods.online}</p>
                    </div>
                    <div className="rounded-box border border-base-300 p-3">
                      <h3 className="mb-2 font-semibold">Payment statuses</h3>
                      <p>Paid: {analyticsSummary.paymentStatuses.paid}</p>
                      <p>Unpaid: {analyticsSummary.paymentStatuses.unpaid}</p>
                    </div>
                    <div className="rounded-box border border-base-300 p-3">
                      <h3 className="mb-2 font-semibold">Order statuses</h3>
                      <p>
                        Submitted: {analyticsSummary.orderStatuses.submitted}
                      </p>
                      <p>
                        Preparing: {analyticsSummary.orderStatuses.preparing}
                      </p>
                      <p>Ready: {analyticsSummary.orderStatuses.ready}</p>
                      <p>
                        Completed: {analyticsSummary.orderStatuses.completed}
                      </p>
                      <p>
                        Cancelled: {analyticsSummary.orderStatuses.cancelled}
                      </p>
                    </div>
                    <div className="rounded-box border border-base-300 p-3">
                      <h3 className="mb-2 font-semibold">Order sources</h3>
                      <p>Customer: {analyticsSummary.orderSources.customer}</p>
                      <p>Walk-in: {analyticsSummary.orderSources.walk_in}</p>
                      <p>Phone: {analyticsSummary.orderSources.phone}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="alert">
                  <span>
                    {analyticsLoading
                      ? "Loading summary..."
                      : "No summary data yet."}
                  </span>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">Trends</h3>
                  <p className="text-sm opacity-70">
                    Track daily revenue, peak ordering hours, ratings, and
                    cancellation rate for the selected range.
                  </p>
                </div>
                {analyticsTrends ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="stat rounded-box border border-base-300 bg-base-200">
                        <div className="stat-title">Cancellation rate</div>
                        <div className="stat-value text-error">
                          {(analyticsTrends.cancellationRate * 100).toFixed(1)}
                          %
                        </div>
                        <div className="stat-desc">
                          cancelled / formal orders
                        </div>
                      </div>
                      <div className="rounded-box border border-base-300 bg-base-200 p-4">
                        <h4 className="mb-2 font-semibold">
                          Rating distribution
                        </h4>
                        <div className="space-y-2">
                          {(["5", "4", "3", "2", "1"] as const).map(
                            (rating) => {
                              const count =
                                analyticsTrends.ratingDistribution[rating];
                              const maxRatingCount = Math.max(
                                0,
                                ...Object.values(
                                  analyticsTrends.ratingDistribution,
                                ),
                              );
                              return (
                                <div
                                  className="grid grid-cols-[64px_1fr_48px] items-center gap-2 text-sm"
                                  key={rating}
                                >
                                  <span>{rating} stars</span>
                                  <div className="h-2 rounded bg-base-300">
                                    <div
                                      className="h-2 rounded bg-warning"
                                      style={{
                                        width: getTrendBarWidth(
                                          count,
                                          maxRatingCount,
                                        ),
                                      }}
                                    />
                                  </div>
                                  <span className="text-right">{count}</span>
                                </div>
                              );
                            },
                          )}
                        </div>
                        <p className="mt-3 text-sm opacity-70">
                          Low rating count: {analyticsTrends.lowRatingCount}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div>
                        <h4 className="mb-2 font-semibold">
                          Daily revenue trend
                        </h4>
                        {analyticsTrends.dailyRevenue.length === 0 ? (
                          <div className="alert">
                            <span>No daily trend data</span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Revenue</th>
                                  <th>Orders</th>
                                  <th>Trend</th>
                                </tr>
                              </thead>
                              <tbody>
                                {analyticsTrends.dailyRevenue.map((row) => (
                                  <tr key={row.date}>
                                    <td>{row.date}</td>
                                    <td>${row.revenue}</td>
                                    <td>{row.orderCount}</td>
                                    <td className="min-w-36">
                                      <div className="h-2 rounded bg-base-300">
                                        <div
                                          className="h-2 rounded bg-success"
                                          style={{
                                            width: getTrendBarWidth(
                                              row.revenue,
                                              maxDailyRevenue,
                                            ),
                                          }}
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="mb-2 font-semibold">
                          Hourly order trend
                        </h4>
                        {activeHourlyRows === 0 ? (
                          <div className="alert">
                            <span>No hourly trend data</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {analyticsTrends.hourlyOrders.map((row) => (
                              <div
                                className="rounded-box border border-base-300 p-3"
                                key={row.hour}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">
                                    {formatTrendHour(row.hour)}
                                  </span>
                                  <span className="badge badge-outline">
                                    {row.orderCount} orders
                                  </span>
                                </div>
                                <div className="mt-2 h-2 rounded bg-base-300">
                                  <div
                                    className="h-2 rounded bg-primary"
                                    style={{
                                      width: getTrendBarWidth(
                                        row.orderCount,
                                        maxHourlyOrderCount,
                                      ),
                                    }}
                                  />
                                </div>
                                <p className="mt-2 text-sm opacity-70">
                                  Revenue: ${row.revenue}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="alert">
                    <span>
                      {analyticsLoading
                        ? "Loading trends..."
                        : "No trend data yet."}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">Operational insights</h3>
                  <p className="text-sm opacity-70">
                    Spot service issues, cancellation patterns, peak demand,
                    and payment/source mix for the selected range.
                  </p>
                </div>
                {analyticsInsights ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                      <div className="stat rounded-box border border-base-300 bg-base-200">
                        <div className="stat-title">Peak hour</div>
                        {analyticsInsights.peakHour.hour === null ? (
                          <>
                            <div className="stat-value text-base">-</div>
                            <div className="stat-desc">No peak hour data</div>
                          </>
                        ) : (
                          <>
                            <div className="stat-value text-primary">
                              {formatTrendHour(analyticsInsights.peakHour.hour)}
                            </div>
                            <div className="stat-desc">
                              {analyticsInsights.peakHour.orderCount} orders /
                              ${analyticsInsights.peakHour.revenue}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="rounded-box border border-base-300 bg-base-200 p-4">
                        <h4 className="mb-2 font-semibold">
                          Source comparison
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="table table-sm">
                            <thead>
                              <tr>
                                <th>Source</th>
                                <th>Orders</th>
                                <th>Revenue</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analyticsInsights.sourceComparison.map((row) => (
                                <tr key={row.source}>
                                  <td>
                                    {formatOrderSource(row.source)}
                                  </td>
                                  <td>{row.orderCount}</td>
                                  <td>${row.revenue}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="rounded-box border border-base-300 bg-base-200 p-4">
                        <h4 className="mb-2 font-semibold">
                          Payment methods
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="table table-sm">
                            <thead>
                              <tr>
                                <th>Method</th>
                                <th>Orders</th>
                                <th>Revenue</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analyticsInsights.paymentMethodComparison.map(
                                (row) => (
                                  <tr key={row.paymentMethod}>
                                    <td>{row.paymentMethod}</td>
                                    <td>{row.orderCount}</td>
                                    <td>${row.revenue}</td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div>
                        <h4 className="mb-2 font-semibold">
                          Low rating orders
                        </h4>
                        {analyticsInsights.lowRatingOrders.length === 0 ? (
                          <div className="alert">
                            <span>No low rating orders</span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Pickup</th>
                                  <th>Rating</th>
                                  <th>Comment</th>
                                  <th>Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {analyticsInsights.lowRatingOrders.map((row) => (
                                  <tr key={row.orderId}>
                                    <td>{row.pickupNumber}</td>
                                    <td>{row.rating}/5</td>
                                    <td>{row.comment || "-"}</td>
                                    <td>{formatCheckoutDateTime(row.date)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="mb-2 font-semibold">
                          Cancelled orders
                        </h4>
                        {analyticsInsights.cancelledOrders.length === 0 ? (
                          <div className="alert">
                            <span>No cancelled orders</span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Pickup</th>
                                  <th>Source</th>
                                  <th>Total</th>
                                  <th>Created</th>
                                  <th>Note</th>
                                </tr>
                              </thead>
                              <tbody>
                                {analyticsInsights.cancelledOrders.map((row) => (
                                  <tr key={row.orderId}>
                                    <td>{row.pickupNumber}</td>
                                    <td>
                                      {formatOrderSource(row.source)}
                                    </td>
                                    <td>${row.total}</td>
                                    <td>
                                      {formatCheckoutDateTime(row.createdAt)}
                                    </td>
                                    <td>{row.customerNote || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="alert">
                    <span>
                      {analyticsLoading
                        ? "Loading insights..."
                        : "No insight data yet."}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">Price sensitivity</h3>
                  <p className="text-sm opacity-70">
                    Compare quantity and revenue across historical snapshot
                    prices for the same menu item.
                  </p>
                </div>
                {priceSensitivity.length === 0 ? (
                  <div className="alert">
                    <span>No price sensitivity data yet.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Category</th>
                          <th>Current price</th>
                          <th>Total qty</th>
                          <th>Total revenue</th>
                          <th>Price points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceSensitivity.map((row) => (
                          <tr key={row.menuItemGroupId}>
                            <td>{row.name}</td>
                            <td>{row.category}</td>
                            <td>
                              {row.currentPrice === null
                                ? "-"
                                : `$${row.currentPrice}`}
                            </td>
                            <td>{row.totalQuantity}</td>
                            <td>${row.totalRevenue}</td>
                            <td>
                              <div className="flex flex-wrap gap-2">
                                {row.pricePoints.map((point) => (
                                  <span
                                    className="badge badge-outline"
                                    key={`${row.menuItemGroupId}-${point.price}`}
                                  >
                                    ${point.price}: {point.quantity} sold / $
                                    {point.revenue} / {point.orderCount} orders
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">A/B testing</h3>
                  <p className="text-sm opacity-70">
                    Compare revenue and order behavior across control and menu
                    variants.
                  </p>
                </div>
                {abTestAnalytics.length === 0 ? (
                  <div className="alert">
                    <span>No A/B test data yet.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Group</th>
                          <th>Orders</th>
                          <th>Quantity</th>
                          <th>Revenue</th>
                          <th>Average order value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {abTestAnalytics.map((row) => (
                          <tr key={row.group}>
                            <td>{formatAbTestGroup(row.group)}</td>
                            <td>{row.orderCount}</td>
                            <td>{row.quantity}</td>
                            <td>${row.revenue}</td>
                            <td>${row.averageOrderValue.toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {!analyticsLoading &&
              categorySales.length === 0 &&
              topItemSales.length === 0 ? (
                <div className="alert alert-info">
                  <span>No analytics data yet</span>
                </div>
              ) : null}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Category sales</h3>
                  {categorySales.length === 0 ? (
                    <div className="alert">
                      <span>No analytics data yet</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Quantity</th>
                            <th>Revenue</th>
                            <th>Orders</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categorySales.map((row) => (
                            <tr key={row.category}>
                              <td>{row.category}</td>
                              <td>{row.quantity}</td>
                              <td>${row.revenue}</td>
                              <td>{row.orderCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Top items</h3>
                  {topItemSales.length === 0 ? (
                    <div className="alert">
                      <span>No analytics data yet</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Quantity</th>
                            <th>Revenue</th>
                            <th>Orders</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topItemSales.map((row, index) => (
                            <tr key={`${row.itemId}-${row.name}-${row.category}`}>
                              <td>{index + 1}</td>
                              <td>{row.name}</td>
                              <td>{row.category}</td>
                              <td>{row.quantity}</td>
                              <td>${row.revenue}</td>
                              <td>{row.orderCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <h3 className="font-semibold mb-2">Customer ratings</h3>
                {ratedOrders.length === 0 ? (
                  <div className="alert">
                    <span>No ratings yet.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Pickup</th>
                          <th>Order</th>
                          <th>Rating</th>
                          <th>Comment</th>
                          <th>Rated at</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ratedOrders.map((order) => (
                          <tr key={order.id}>
                            <td>{formatPickupNumber(order.id)}</td>
                            <td>#{order.id}</td>
                            <td>{order.rating}/5</td>
                            <td>{order.ratingComment || "-"}</td>
                            <td>
                              {order.ratedAt
                                ? formatCheckoutDateTime(order.ratedAt)
                                : "-"}
                            </td>
                            <td>${order.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {hasManagerTools && managerTab === "menu" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <form
              className="card-body"
              onSubmit={(event) => {
                void submitMenuForm(event);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">Menu item editor</h2>
                  <p className="text-sm opacity-70">
                    Create or update menu items and connect them to primary
                    categories.
                  </p>
                </div>
                {editingMenuId ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={resetMenuForm}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  className="input input-bordered"
                  placeholder="Name"
                  value={menuForm.name}
                  onChange={(event) => updateMenuForm("name", event.target.value)}
                  required
                />
                <input
                  className="input input-bordered"
                  placeholder="Price"
                  type="number"
                  min={0}
                  step={1}
                  value={menuForm.price}
                  onChange={(event) => updateMenuForm("price", event.target.value)}
                  required
                />
                <input
                  className="input input-bordered"
                  placeholder="Category"
                  value={menuForm.category}
                  onChange={(event) =>
                    updateMenuForm("category", event.target.value)
                  }
                  required
                />
                <select
                  className="select select-bordered"
                  value={menuForm.primaryCategoryId}
                  onChange={(event) =>
                    updateMenuPrimaryCategory(event.target.value)
                  }
                >
                  <option value="">No primary category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <select
                  className="select select-bordered"
                  value={menuForm.abTestGroup}
                  onChange={(event) =>
                    updateMenuForm("abTestGroup", event.target.value)
                  }
                >
                  {abTestGroupOptions.map((option) => (
                    <option key={option.id || "none"} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input input-bordered md:col-span-2"
                  placeholder="Description"
                  value={menuForm.description}
                  onChange={(event) =>
                    updateMenuForm("description", event.target.value)
                  }
                  required
                />
                <input
                  className="input input-bordered"
                  placeholder="Image URL"
                  value={menuForm.image_url}
                  onChange={(event) =>
                    updateMenuForm("image_url", event.target.value)
                  }
                  required
                />
                {editingMenuId ? (
                  <input
                    className="input input-bordered md:col-span-2"
                    placeholder="Change reason"
                    value={menuForm.changeReason}
                    onChange={(event) =>
                      updateMenuForm("changeReason", event.target.value)
                    }
                  />
                ) : null}
              </div>
              {menuMessage ? (
                <div className="alert">
                  <span>{menuMessage}</span>
                </div>
              ) : null}
              <button className="btn btn-primary w-fit" disabled={menuBusy}>
                {menuBusy
                  ? "Saving..."
                  : editingMenuId
                    ? "Save changes"
                    : "Add item"}
              </button>
            </form>
          </section>
        ) : null}

        {hasManagerTools && managerTab === "categories" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">Category management</h2>
                  <p className="text-sm opacity-70">
                    Create, update, and deactivate menu categories.
                  </p>
                </div>
                {editingCategoryId ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={resetCategoryForm}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <form
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3"
                onSubmit={(event) => {
                  void submitCategoryForm(event);
                }}
              >
                <input
                  className="input input-bordered"
                  placeholder="Name"
                  value={categoryForm.name}
                  onChange={(event) =>
                    updateCategoryForm("name", event.target.value)
                  }
                  required
                />
                <input
                  className="input input-bordered"
                  placeholder="Slug"
                  value={categoryForm.slug}
                  onChange={(event) =>
                    updateCategoryForm("slug", event.target.value)
                  }
                  required
                />
                <input
                  className="input input-bordered"
                  placeholder="Description"
                  value={categoryForm.description}
                  onChange={(event) =>
                    updateCategoryForm("description", event.target.value)
                  }
                />
                <input
                  className="input input-bordered"
                  placeholder="Display order"
                  type="number"
                  step={1}
                  value={categoryForm.displayOrder}
                  onChange={(event) =>
                    updateCategoryForm("displayOrder", event.target.value)
                  }
                />
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={categoryForm.isActive}
                    onChange={(event) =>
                      updateCategoryForm("isActive", event.target.checked)
                    }
                  />
                  <span className="label-text">Active</span>
                </label>
                <button className="btn btn-primary w-fit" disabled={categoryBusy}>
                  {categoryBusy
                    ? "Saving..."
                    : editingCategoryId
                      ? "Save category"
                      : "Add category"}
                </button>
              </form>
              {categoryMessage ? (
                <div className="alert">
                  <span>{categoryMessage}</span>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(["active", "inactive", "all"] as const).map((status) => (
                  <button
                    key={status}
                    className={`btn btn-sm ${
                      categoryManagementStatusFilter === status
                        ? "btn-primary"
                        : "btn-outline"
                    }`}
                    onClick={() => setCategoryManagementStatusFilter(status)}
                  >
                    {status[0].toUpperCase()}
                    {status.slice(1)}
                  </button>
                ))}
              </div>
              {categoryManagementItems.length === 0 ? (
                <div className="alert alert-info">
                  <span>No categories match this filter.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Slug</th>
                        <th>Description</th>
                        <th>Order</th>
                        <th>Active</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryManagementItems.map((category) => (
                        <tr key={category.id}>
                          <td>{category.name}</td>
                          <td>{category.slug}</td>
                          <td>{category.description || ""}</td>
                          <td>{category.displayOrder}</td>
                          <td>{category.isActive ? "yes" : "no"}</td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => startEditCategory(category)}
                              >
                                Edit
                              </button>
                              {category.isActive ? (
                                <button
                                  className="btn btn-sm btn-error btn-outline"
                                  disabled={categoryBusy}
                                  onClick={() => {
                                    void deactivateCategory(category);
                                  }}
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm btn-success btn-outline"
                                  disabled={categoryBusy}
                                  onClick={() => {
                                    void reactivateCategory(category);
                                  }}
                                >
                                  Reactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {hasManagerTools && managerTab === "promotions" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">Promotion management</h2>
                  <p className="text-sm opacity-70">
                    Create, update, deactivate, and reactivate checkout promo
                    codes.
                  </p>
                </div>
                <select
                  className="select select-bordered select-sm"
                  value={promotionStatusFilter}
                  onChange={(event) => {
                    setPromotionStatusFilter(
                      event.target.value as PromotionStatusFilter,
                    );
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="all">All</option>
                </select>
              </div>

              {promotionMessage ? (
                <div className="alert">
                  <span>{promotionMessage}</span>
                </div>
              ) : null}

              <form
                className="rounded-box border border-base-300 bg-base-200 p-4"
                onSubmit={(event) => {
                  void submitPromotionForm(event);
                }}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {editingPromotionId ? "Edit promo code" : "Create promo code"}
                  </h3>
                  {editingPromotionId ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={resetPromotionForm}
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input
                    className="input input-bordered input-sm"
                    placeholder="Code"
                    value={promotionForm.code}
                    onChange={(event) =>
                      setPromotionForm((current) => ({
                        ...current,
                        code: event.target.value,
                      }))
                    }
                    required
                  />
                  <select
                    className="select select-bordered select-sm"
                    value={promotionForm.discountType}
                    onChange={(event) =>
                      setPromotionForm((current) => ({
                        ...current,
                        discountType: event.target.value as DiscountType,
                      }))
                    }
                  >
                    <option value="percent">Percent</option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                  <input
                    className="input input-bordered input-sm"
                    min={1}
                    max={
                      promotionForm.discountType === "percent" ? 100 : undefined
                    }
                    type="number"
                    value={promotionForm.discountValue}
                    onChange={(event) =>
                      setPromotionForm((current) => ({
                        ...current,
                        discountValue: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <button
                  className="btn btn-sm btn-primary mt-3"
                  disabled={promotionBusy}
                >
                  {promotionBusy
                    ? "Saving..."
                    : editingPromotionId
                      ? "Save promotion"
                      : "Create promotion"}
                </button>
              </form>

              {promotions.length === 0 ? (
                <div className="alert alert-info">
                  <span>No promotions found.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Discount</th>
                        <th>Status</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promotions.map((promotion) => (
                        <tr key={promotion.id}>
                          <td className="font-semibold">{promotion.code}</td>
                          <td>
                            {promotion.discountType === "percent"
                              ? `${promotion.discountValue}%`
                              : `$${promotion.discountValue}`}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                promotion.isActive
                                  ? "badge-success"
                                  : "badge-neutral"
                              }`}
                            >
                              {promotion.isActive ? "active" : "inactive"}
                            </span>
                          </td>
                          <td>{formatCheckoutDateTime(promotion.updatedAt)}</td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="btn btn-sm btn-outline"
                                disabled={promotionBusy}
                                onClick={() => startEditPromotion(promotion)}
                              >
                                Edit
                              </button>
                              {promotion.isActive ? (
                                <button
                                  className="btn btn-sm btn-error btn-outline"
                                  disabled={promotionBusy}
                                  onClick={() => {
                                    void setPromotionActive(promotion, false);
                                  }}
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm btn-success btn-outline"
                                  disabled={promotionBusy}
                                  onClick={() => {
                                    void setPromotionActive(promotion, true);
                                  }}
                                >
                                  Reactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}

        <section ref={menuSectionRef} className="scroll-mt-24">
          {items.length === 0 ? (
            <div className="alert alert-info">
              <span>No menu items yet.</span>
            </div>
          ) : (
            grouped.categories.map((category) => (
              <section key={category} className="mb-8">
              <h2 className="text-3xl font-bold mb-4 text-primary border-b-2 border-primary pb-2">
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(grouped.groupedItems[category] || []).map((item) => (
                  <div
                    key={item.id}
                    className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow"
                  >
                    <figure className="h-44 overflow-hidden bg-base-300">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src =
                            "https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=800&q=80";
                        }}
                      />
                    </figure>
                    <div className="card-body">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="card-title text-lg">{item.name}</h3>
                        <span className="badge badge-outline">
                          {formatSemanticVersion(item)}
                          <span className="ml-2 text-xs opacity-70">
                            Serial #{item.version}
                          </span>
                        </span>
                        {!item.is_available ? (
                          <span className="badge badge-error">Sold out</span>
                        ) : null}
                        {canManageMenu ? (
                          <span className="badge badge-secondary badge-outline">
                            A/B: {formatAbTestGroup(item.ab_test_group)}
                          </span>
                        ) : null}
                      </div>
                      {item.primary_category_name ? (
                        <span className="badge badge-primary w-fit">
                          Primary: {item.primary_category_name}
                        </span>
                      ) : null}
                      {item.categories && item.categories.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {item.categories.map((category) => (
                            <span
                              key={category.id}
                              className="badge badge-outline gap-1"
                            >
                              {category.name}
                              {canManageMenu ? (
                                <button
                                  className="ml-1 text-xs"
                                  aria-label={`Remove ${category.name}`}
                                  onClick={() => {
                                    void removeCategoryFromItem(item, category);
                                  }}
                                  disabled={menuBusy}
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {canManageMenu && item.change_reason ? (
                        <p className="text-xs opacity-70">
                          Last change: {item.change_reason}
                        </p>
                      ) : null}
                      {canManageMenu ? (
                        <p className="text-xs opacity-70">
                          Display order: {item.display_order}
                        </p>
                      ) : null}
                      <p className="text-sm opacity-80 line-clamp-2 min-h-[2.75rem]">
                        {item.description}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xl font-bold text-success">
                          ${item.price}
                        </span>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            void addToCart(item);
                          }}
                          disabled={
                            !user || !item.is_available || activeItemId === item.id
                          }
                        >
                          {!item.is_available
                            ? "Sold out"
                            : activeItemId === item.id
                              ? "Adding..."
                              : `Add${
                                cartQtyByItemId[item.id]
                                  ? ` (${cartQtyByItemId[item.id]})`
                                  : ""
                              }`}
                        </button>
                      </div>
                      {canManageMenu ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="form-control flex-1 min-w-32">
                              <span className="label-text mb-1">
                                Display order
                              </span>
                              <input
                                className="input input-bordered input-sm"
                                min={0}
                                step={1}
                                type="number"
                                value={
                                  displayOrderDrafts[item.id] ??
                                  String(item.display_order)
                                }
                                onChange={(event) => {
                                  setDisplayOrderDrafts((currentDrafts) => ({
                                    ...currentDrafts,
                                    [item.id]: event.target.value,
                                  }));
                                }}
                              />
                            </label>
                            <button
                              className="btn btn-sm btn-outline"
                              disabled={displayOrderUpdatingId === item.id}
                              onClick={() => {
                                void updateMenuItemDisplayOrder(item);
                              }}
                            >
                              {displayOrderUpdatingId === item.id
                                ? "Saving..."
                                : "Save order"}
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <select
                              className="select select-bordered select-sm flex-1"
                              value={selectedCategoryByItemId[item.id] ?? ""}
                              onChange={(event) => {
                                setSelectedCategoryByItemId((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }));
                              }}
                            >
                              <option value="">Select category</option>
                              {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn btn-sm btn-outline"
                              disabled={
                                menuBusy || !selectedCategoryByItemId[item.id]
                              }
                              onClick={() => {
                                void addCategoryToItem(item);
                              }}
                            >
                              Add category
                            </button>
                          </div>
                          <div className="card-actions justify-end">
                            <button
                              className="btn btn-sm btn-warning btn-outline"
                              onClick={() => {
                                void toggleMenuItemAvailability(item);
                              }}
                              disabled={menuBusy}
                            >
                              {item.is_available
                                ? "Mark sold out"
                                : "Mark available"}
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => startEditMenuItem(item)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => {
                                void loadMenuItemHistory(item);
                              }}
                              disabled={menuHistoryLoadingId === item.id}
                            >
                              {menuHistoryLoadingId === item.id
                                ? "Loading..."
                                : "View history"}
                            </button>
                            <button
                              className="btn btn-sm btn-error btn-outline"
                              onClick={() => {
                                void deleteMenuItem(item);
                              }}
                              disabled={menuBusy}
                            >
                              Delete
                            </button>
                          </div>
                          {menuHistoryByItemId[item.id] ? (
                            <details className="rounded-box border border-base-300 p-3">
                              <summary className="cursor-pointer font-medium">
                                Version history
                              </summary>
                              {menuHistoryByItemId[item.id].length === 0 ? (
                                <p className="mt-2 text-sm opacity-70">
                                  No version history.
                                </p>
                              ) : (
                                <div className="mt-2 overflow-x-auto">
                                  <table className="table table-sm">
                                    <thead>
                                      <tr>
                                        <th>Version</th>
                                        <th>Name</th>
                                        <th>Price</th>
                                        <th>A/B group</th>
                                        <th>Order</th>
                                        <th>Status</th>
                                        <th>Reason</th>
                                        <th>Changed by</th>
                                        <th>Previous</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {menuHistoryByItemId[item.id].map(
                                        (historyItem) => (
                                          <tr key={historyItem.id}>
                                            <td>
                                              {formatSemanticVersion(historyItem)}
                                              <div className="text-xs opacity-70">
                                                Serial {historyItem.version}
                                              </div>
                                            </td>
                                            <td>{historyItem.name}</td>
                                            <td>${historyItem.price}</td>
                                            <td>
                                              {formatAbTestGroup(
                                                historyItem.ab_test_group,
                                              )}
                                            </td>
                                            <td>{historyItem.display_order}</td>
                                            <td>
                                              {historyItem.is_available
                                                ? "Available"
                                                : "Sold out"}
                                            </td>
                                            <td>
                                              {historyItem.change_reason ||
                                                "-"}
                                            </td>
                                            <td>
                                              {historyItem.changed_by || "-"}
                                            </td>
                                            <td>
                                              {historyItem.previous_version_id ??
                                                "-"}
                                            </td>
                                          </tr>
                                        ),
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              </section>
            ))
          )}
        </section>

        {user && !canViewAllOrders ? (
          <section ref={ordersSectionRef} className="mt-10 scroll-mt-24">
            <h2 className="text-2xl font-bold mb-4">Order history</h2>
            {statusMessage ? (
              <div className="alert mb-4">
                <span>{statusMessage}</span>
              </div>
            ) : null}
            {historyLoading ? (
              <div className="alert">
                <span>Loading history...</span>
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="alert alert-info">
                <span>No orders yet.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {historyOrders.map((order) => {
                  const allowedStatuses = getNextAllowedStatuses(order);
                  const draftedStatus = orderStatusDrafts[order.id];
                  const selectedStatus =
                    draftedStatus && allowedStatuses.includes(draftedStatus)
                      ? draftedStatus
                      : allowedStatuses[0];
                  const canCancelOwnOrder =
                    order.status === "submitted" && order.userId === user.id;
                  const ratingDraft = ratingDrafts[order.id] ?? {
                    rating: order.rating ? String(order.rating) : "",
                    ratingComment: order.ratingComment ?? "",
                  };

                  return (
                    <article
                      key={order.id}
                      className="card bg-base-100 shadow-sm border border-base-300"
                    >
                      <div className="card-body p-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <h3 className="font-semibold">Order #{order.id}</h3>
                            <p className="text-sm font-medium text-primary">
                              Pickup number: {formatPickupNumber(order.id)}
                            </p>
                            {order.status === "ready" ? (
                              <p className="text-sm font-semibold text-primary">
                                Ready for pickup
                              </p>
                            ) : null}
                            {order.status === "completed" ? (
                              <p className="text-sm font-semibold text-success">
                                Picked up
                              </p>
                            ) : null}
                            {order.status === "cancelled" ? (
                              <p className="text-sm font-semibold text-error">
                                Cancelled
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span
                              className={`badge ${getStatusBadgeClass(
                                order.status,
                              )}`}
                            >
                              {order.status}
                            </span>
                            {canCancelOwnOrder ? (
                              <button
                                className="btn btn-sm btn-error btn-outline"
                                disabled={cancelUpdatingOrderId === order.id}
                                onClick={() => {
                                  void cancelOrder(order.id);
                                }}
                              >
                                {cancelUpdatingOrderId === order.id
                                  ? "Cancelling..."
                                  : "Cancel order"}
                              </button>
                            ) : null}
                            {allowedStatuses.length > 0 ? (
                              <div className="join">
                                <select
                                  className="select select-sm select-bordered join-item"
                                  value={selectedStatus}
                                  disabled={statusUpdatingOrderId === order.id}
                                  onChange={(event) => {
                                    setOrderStatusDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [order.id]: event.target
                                        .value as OrderStatus,
                                    }));
                                  }}
                                >
                                  {allowedStatuses.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="btn btn-sm join-item"
                                  disabled={statusUpdatingOrderId === order.id}
                                  onClick={() => {
                                    void updateOrderStatus(
                                      order.id,
                                      selectedStatus,
                                    );
                                  }}
                                >
                                  {statusUpdatingOrderId === order.id
                                    ? "Updating..."
                                    : "Update status"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <p className="text-sm opacity-70">
                          Created at{" "}
                          {
                            (order as Order & { createdAtTaipei?: string })
                              .createdAtTaipei ?? order.createdAt
                          }
                        </p>
                        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                          <span>Fulfillment: {order.fulfillmentType}</span>
                          <span>
                            Payment: {order.paymentMethod} /{" "}
                            {order.paymentStatus}
                          </span>
                          {order.pickupTime ? (
                            <span>
                              Pickup: {formatCheckoutDateTime(order.pickupTime)}
                            </span>
                          ) : null}
                          {order.customerNote ? (
                            <span className="md:col-span-2">
                              Note: {order.customerNote}
                            </span>
                          ) : null}
                          {order.discountAmount > 0 || order.promoCode ? (
                            <span className="md:col-span-2">
                              Promo {order.promoCode ?? "-"}: subtotal $
                              {order.subtotal}, discount -${order.discountAmount}
                            </span>
                          ) : null}
                        </div>
                        <ul className="text-sm list-disc pl-5 space-y-1">
                          {order.items.map((detail) => (
                            <li key={`${order.id}-${detail.item.id}`}>
                              {detail.item.name} x {detail.qty}
                            </li>
                          ))}
                        </ul>
                        {order.status === "completed" ? (
                          <div className="rounded-box border border-base-300 bg-base-200 p-3">
                            <div className="mb-2 text-sm font-semibold">
                              Your rating
                            </div>
                            {order.rating ? (
                              <p className="mb-2 text-sm">
                                Current rating: {order.rating}/5
                                {order.ratingComment
                                  ? ` - ${order.ratingComment}`
                                  : ""}
                                {order.ratedAt
                                  ? ` (${formatCheckoutDateTime(order.ratedAt)})`
                                  : ""}
                              </p>
                            ) : null}
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-[140px_1fr_auto]">
                              <select
                                className="select select-sm select-bordered"
                                value={ratingDraft.rating}
                                disabled={ratingUpdatingOrderId === order.id}
                                onChange={(event) => {
                                  setRatingDrafts((currentDrafts) => ({
                                    ...currentDrafts,
                                    [order.id]: {
                                      ...ratingDraft,
                                      rating: event.target.value,
                                    },
                                  }));
                                }}
                              >
                                <option value="">Rating</option>
                                {[1, 2, 3, 4, 5].map((rating) => (
                                  <option key={rating} value={rating}>
                                    {rating}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="input input-sm input-bordered"
                                placeholder="Optional comment"
                                value={ratingDraft.ratingComment}
                                disabled={ratingUpdatingOrderId === order.id}
                                onChange={(event) => {
                                  setRatingDrafts((currentDrafts) => ({
                                    ...currentDrafts,
                                    [order.id]: {
                                      ...ratingDraft,
                                      ratingComment: event.target.value,
                                    },
                                  }));
                                }}
                              />
                              <button
                                className="btn btn-sm btn-primary"
                                disabled={ratingUpdatingOrderId === order.id}
                                onClick={() => {
                                  void updateOrderRating(order.id);
                                }}
                              >
                                {ratingUpdatingOrderId === order.id
                                  ? "Saving..."
                                  : "Save rating"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <p className="font-bold text-right">
                          Total ${order.total}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}
      </main>

      {user && isCartOpen ? (
        <>
          <button
            className="fixed inset-0 bg-black/35"
            aria-label="close cart drawer"
            onClick={() => setIsCartOpen(false)}
          />
          <aside className="fixed right-0 top-0 h-full w-full max-w-md bg-base-100 shadow-2xl z-10 flex flex-col">
            <div className="p-4 border-b border-base-300 flex items-center justify-between">
              <h2 className="text-xl font-bold">Cart</h2>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setIsCartOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              {cartDetails.length === 0 ? (
                <div className="alert">
                  <span>Your cart is empty.</span>
                </div>
              ) : (
                <ul className="space-y-3">
                  {cartDetails.map((detail) => (
                    <li
                      key={detail.itemId}
                      className="p-3 rounded-lg bg-base-200 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{detail.item.name}</p>
                        <p className="text-sm opacity-70">
                          ${detail.item.price} x {detail.qty}
                        </p>
                        {detail.hasPriceChanged && detail.currentItem ? (
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className="badge badge-warning">
                              Price changed
                            </span>
                            <span>Snapshot: ${detail.item.price}</span>
                            <span>Current: ${detail.currentItem.price}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="font-bold">${detail.subtotal}</p>
                        <div className="join">
                          <button
                            className="btn btn-sm join-item"
                            aria-label={`Decrease ${detail.item.name}`}
                            disabled={cartBusyItemId === detail.itemId}
                            onClick={() => {
                              void updateCartItemQty(
                                detail.itemId,
                                detail.qty - 1,
                              );
                            }}
                          >
                            -
                          </button>
                          <span className="btn btn-sm join-item pointer-events-none min-w-12">
                            {detail.qty}
                          </span>
                          <button
                            className="btn btn-sm join-item"
                            aria-label={`Increase ${detail.item.name}`}
                            disabled={cartBusyItemId === detail.itemId}
                            onClick={() => {
                              void updateCartItemQty(
                                detail.itemId,
                                detail.qty + 1,
                              );
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-base-300 space-y-3">
              <div className="rounded-box border border-base-300 bg-base-100 p-3 space-y-3">
                <h3 className="font-semibold">Checkout details</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1">Fulfillment</span>
                    <select
                      className="select select-bordered select-sm"
                      value={checkoutForm.fulfillmentType}
                      onChange={(event) =>
                        setCheckoutForm((current) => ({
                          ...current,
                          fulfillmentType: event.target.value as FulfillmentType,
                        }))
                      }
                    >
                      <option value="takeout">Takeout</option>
                      <option value="dine_in">Dine in</option>
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1">Payment</span>
                    <select
                      className="select select-bordered select-sm"
                      value={checkoutForm.paymentMethod}
                      onChange={(event) =>
                        setCheckoutForm((current) => ({
                          ...current,
                          paymentMethod: event.target.value as PaymentMethod,
                        }))
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="online">Online</option>
                    </select>
                  </label>
                </div>
                <label className="form-control">
                  <span className="label-text mb-1">Pickup time</span>
                  <input
                    className="input input-bordered input-sm"
                    type="datetime-local"
                    value={checkoutForm.pickupTime}
                    onChange={(event) =>
                      setCheckoutForm((current) => ({
                        ...current,
                        pickupTime: event.target.value,
                      }))
                    }
                    />
                  </label>
                <label className="form-control">
                  <span className="label-text mb-1">Promo code</span>
                  <input
                    className="input input-bordered input-sm"
                    value={checkoutForm.promoCode}
                    onChange={(event) =>
                      setCheckoutForm((current) => ({
                        ...current,
                        promoCode: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1">Note</span>
                  <textarea
                    className="textarea textarea-bordered min-h-20"
                    maxLength={500}
                    value={checkoutForm.customerNote}
                    onChange={(event) =>
                      setCheckoutForm((current) => ({
                        ...current,
                        customerNote: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>Items</span>
                <span>{cartItemCount}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span>${cartTotal}</span>
              </div>
              <button
                className="btn btn-error btn-outline w-full"
                onClick={() => void clearCart()}
                disabled={cartDetails.length === 0 || isClearingCart}
              >
                {isClearingCart ? "Clearing..." : "Clear cart"}
              </button>
              <button
                className="btn btn-primary w-full"
                onClick={() => void submitOrder()}
                disabled={cartDetails.length === 0 || isSubmittingOrder}
              >
                {isSubmittingOrder ? "Submitting..." : "Submit order"}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
