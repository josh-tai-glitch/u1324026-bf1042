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
  Ingredient,
  InventoryImpact,
  MenuBundle,
  MenuItem,
  MenuItemAvailabilityImpact,
  MenuItemIngredient,
  Order,
  OrderIssueType,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PriceSensitivityItem,
  Promotion,
  QueueSummary,
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
  { id: "", label: "未設定測試分組" },
  { id: "control", label: "對照組" },
  { id: "variant_a", label: "測試 A 組" },
  { id: "variant_b", label: "測試 B 組" },
];
const orderQuickFilters = [
  { id: "active", label: "進行中" },
  { id: "ready_unpaid", label: "待付款取餐" },
  { id: "phone", label: "電話訂單" },
  { id: "open_issues", label: "有問題訂單" },
  { id: "promo", label: "優惠券訂單" },
] as const;
const orderBoardColumnStatuses: OrderStatus[] = [
  "submitted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];
const analyticsRangeOptions = [
  { id: "all", label: "全部" },
  { id: "today", label: "今天" },
  { id: "last7Days", label: "近 7 天" },
  { id: "thisMonth", label: "本月" },
  { id: "custom", label: "自訂" },
] as const;
const auditLogActionOptions: AuditLogAction[] = [
  "role_update",
  "role_request_review",
  "role_request_create",
  "menu_create",
  "menu_update",
  "menu_availability_update",
  "menu_display_order_update",
  "menu_ab_test_update",
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
  "order_submit",
  "order_rating_update",
  "order_issue_set",
  "order_issue_clear",
  "walk_in_order_create",
  "phone_order_create",
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
  role_update: "角色已更新",
  role_request_review: "權限申請已審核",
  role_request_create: "已送出權限申請",
  menu_create: "已新增餐點",
  menu_update: "已更新餐點",
  menu_availability_update: "已更新販售狀態",
  menu_display_order_update: "已更新顯示排序",
  menu_ab_test_update: "已更新測試分組",
  menu_delete: "已刪除餐點",
  category_create: "已新增分類",
  category_update: "已更新分類",
  category_delete: "已停用分類",
  promotion_create: "已新增優惠券",
  promotion_update: "已更新優惠券",
  promotion_delete: "已停用優惠券",
  menu_category_assign: "已指派分類",
  menu_category_remove: "已移除分類",
  order_status_update: "已更新訂單狀態",
  order_payment_update: "已更新付款狀態",
  order_cancel: "已取消訂單",
  order_submit: "已送出訂單",
  order_rating_update: "已更新評價",
  order_issue_set: "已標記訂單問題",
  order_issue_clear: "已清除訂單問題",
  walk_in_order_create: "已建立現場訂單",
  phone_order_create: "已建立電話訂單",
};
const auditLogTargetTypeLabels: Record<AuditLogTargetType, string> = {
  user: "使用者",
  role_request: "權限申請",
  menu_item: "餐點",
  category: "分類",
  promotion: "優惠券",
  menu_item_category: "餐點分類",
  order: "訂單",
};
const promotionRuntimeFilterOptions: Array<{
  id: PromotionRuntimeFilter;
  label: string;
}> = [
  { id: "all", label: "全部" },
  { id: "active_now", label: "目前可用" },
  { id: "scheduled", label: "尚未開始" },
  { id: "expired", label: "已過期" },
  { id: "usage_full", label: "使用額滿" },
  { id: "inactive", label: "已停用" },
];
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
  minOrderAmount: "0",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
};
const emptyCheckoutForm = {
  fulfillmentType: "takeout" as FulfillmentType,
  customerNote: "",
  pickupTime: "",
  paymentMethod: "cash" as PaymentMethod,
  promoCode: "",
  isGroupOrder: false,
  groupName: "",
  contactName: "",
  contactPhone: "",
};
const emptyGuestCheckoutForm = {
  guestName: "",
  guestPhone: "",
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
  isGroupOrder: false,
  groupName: "",
  contactName: "",
  contactPhone: "",
};
const emptyMenuBundleForm = {
  name: "",
  description: "",
  price: "",
  displayOrder: "0",
  isActive: true,
};
const defaultQueueSummary: QueueSummary = {
  kitchenQueue: 0,
  estimatedWaitMinutes: 5,
  busyLevel: "normal",
};
const defaultTastePreferenceChips = [
  "少冰",
  "去冰",
  "半糖",
  "無糖",
  "加辣",
  "不加辣",
  "不要洋蔥",
  "不要胡椒",
  "醬少",
  "醬多",
  "吐司不要切",
  "蛋全熟",
];
const tastePreferenceStorageKey = "bf_taste_preference_chips_v1";
const maxTastePreferenceChips = 20;
const maxTastePreferenceChipLength = 30;

type MenuForm = typeof emptyMenuForm;
type CategoryForm = typeof emptyCategoryForm;
type CheckoutForm = typeof emptyCheckoutForm;
type GuestCheckoutForm = typeof emptyGuestCheckoutForm;
type WalkInOrderForm = typeof emptyWalkInOrderForm;
type MenuBundleForm = typeof emptyMenuBundleForm;
type WalkInOrderItem = {
  itemId: number;
  qty: number;
  menuItemVersion?: number;
  memberName?: string | null;
  bundleId?: number | null;
  bundleName?: string | null;
};
type OrderIssueDraft = { issueType: OrderIssueType; issueNote: string };
type OrderRatingDraft = { rating: string; ratingComment: string };
type FrequentMenuItem = {
  currentItem: MenuItem;
  totalQuantity: number;
  orderCount: number;
  lastOrderedAt: string;
};
type BusyLevel = "normal" | "busy" | "very_busy";
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
type ToastType = "success" | "error" | "warning" | "info";
type ToastNotification = {
  id: number;
  type: ToastType;
  message: string;
};
type RoleRequestStatus = "pending" | "approved" | "rejected" | "all";
type ManagerTab =
  | "orders"
  | "analytics"
  | "menu"
  | "inventory"
  | "categories"
  | "promotions"
  | "roleRequests"
  | "auditLogs";
type MainView = "shop" | "account" | "manager";
type AnalyticsSubTab =
  | "overview"
  | "promotions"
  | "issues"
  | "items"
  | "sources"
  | "ratings";
type MenuSubTab = "items" | "bundles" | "list";
type InventorySubTab =
  | "ingredients"
  | "mapping"
  | "shortage"
  | "availability";
type OrdersSubTab = "orders" | "walkin" | "kitchen" | "issues";
type OrderQuickFilter = "" | (typeof orderQuickFilters)[number]["id"];
type CategoryStatusFilter = "active" | "inactive" | "all";
type PromotionStatusFilter = "active" | "inactive" | "all";
type PromotionRuntimeStatus =
  | "active_now"
  | "scheduled"
  | "expired"
  | "usage_full"
  | "inactive";
type PromotionRuntimeFilter = "all" | PromotionRuntimeStatus;
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

function sanitizeTastePreferenceChips(
  chips: unknown,
  options: { fallbackToDefault?: boolean } = {},
): string[] {
  if (!Array.isArray(chips)) return defaultTastePreferenceChips;

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const chip of chips) {
    if (typeof chip !== "string") continue;
    const trimmedChip = chip.trim().slice(0, maxTastePreferenceChipLength);
    if (!trimmedChip) continue;

    const normalizedChip = trimmedChip.toLocaleLowerCase();
    if (seen.has(normalizedChip)) continue;

    seen.add(normalizedChip);
    sanitized.push(trimmedChip);

    if (sanitized.length >= maxTastePreferenceChips) break;
  }

  return sanitized.length > 0 || !options.fallbackToDefault
    ? sanitized
    : defaultTastePreferenceChips;
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
  if (group === "control") return "對照組";
  if (group === "variant_a") return "測試 A 組";
  if (group === "variant_b") return "測試 B 組";
  return "未設定測試分組";
}

function formatOrderSource(source: Order["orderSource"]) {
  if (source === "walk_in") return "現場點餐";
  if (source === "phone") return "電話訂餐";
  if (source === "guest") return "訪客訂餐";
  return "會員訂餐";
}

function formatOrderStatus(status: OrderStatus) {
  if (status === "pending") return "購物車";
  if (status === "submitted") return "已送出";
  if (status === "preparing") return "製作中";
  if (status === "ready") return "可取餐";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return status;
}

function formatPaymentStatus(status: PaymentStatus) {
  return status === "paid" ? "已付款" : "未付款";
}

function formatPaymentMethod(method: PaymentMethod) {
  if (method === "cash") return "現金";
  if (method === "card") return "刷卡";
  return "線上付款";
}

function formatFulfillmentType(type: FulfillmentType) {
  return type === "dine_in" ? "內用" : "外帶";
}

function formatOrderIssueType(type: OrderIssueType) {
  if (type === "out_of_stock") return "原料不足";
  if (type === "need_customer_confirmation") return "需與顧客確認";
  if (type === "special_request_problem") return "特殊需求問題";
  return "其他";
}

function formatDemoUserLabel(demoUser: SessionUser) {
  if (demoUser.roles.includes("admin")) return "管理者";
  if (demoUser.roles.includes("owner")) return "老闆";
  if (demoUser.roles.includes("chef")) return "廚師";
  if (demoUser.roles.includes("staff")) return "店員";
  return "顧客";
}

function formatRoleLabel(role: Role) {
  if (role === "admin") return "管理者";
  if (role === "owner") return "老闆";
  if (role === "chef") return "廚師";
  if (role === "staff") return "店員";
  return "顧客";
}

function getPhoneLastFour(phone?: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits ? digits.slice(-4) : "";
}

export default function App() {
  // Auth / session state
  const [user, setUser] = useState<SessionUser | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const toastIdRef = useRef(0);
  const [authError, setAuthError] = useState("");
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [demoUsers, setDemoUsers] = useState<SessionUser[]>([]);
  const [demoAuthAvailable, setDemoAuthAvailable] = useState(false);
  const [demoAuthError, setDemoAuthError] = useState("");
  const [demoLoginLoading, setDemoLoginLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mainView, setMainView] = useState<MainView>("shop");

  // Menu / category state
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuBundles, setMenuBundles] = useState<MenuBundle[]>([]);
  const [menuBundleManagementItems, setMenuBundleManagementItems] = useState<
    MenuBundle[]
  >([]);
  const [menuBundleForm, setMenuBundleForm] =
    useState<MenuBundleForm>(emptyMenuBundleForm);
  const [editingMenuBundleId, setEditingMenuBundleId] = useState<number | null>(
    null,
  );
  const [menuBundleMessage, setMenuBundleMessage] = useState("");
  const [menuBundleBusy, setMenuBundleBusy] = useState(false);
  const [menuBundleSelectedItemId, setMenuBundleSelectedItemId] = useState("");
  const [menuBundleSelectedQty, setMenuBundleSelectedQty] = useState("1");
  const [menuBundleDraftItems, setMenuBundleDraftItems] = useState<
    Array<{ menuItemId: number; qty: number }>
  >([]);
  const [menuSubTab, setMenuSubTab] = useState<MenuSubTab>("items");
  const [menuListPage, setMenuListPage] = useState(1);
  const [menuForm, setMenuForm] = useState<MenuForm>(emptyMenuForm);
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);
  const [menuMessage, setMenuMessage] = useState("");
  const [menuBusy, setMenuBusy] = useState(false);
  const [recentlyUpdatedMenuItemId, setRecentlyUpdatedMenuItemId] = useState<
    number | null
  >(null);
  const [categoryForm, setCategoryForm] =
    useState<CategoryForm>(emptyCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );
  const [categoryMessage, setCategoryMessage] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [recentlyUpdatedCategoryId, setRecentlyUpdatedCategoryId] = useState<
    number | null
  >(null);
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
  const [promotionRuntimeFilter, setPromotionRuntimeFilter] =
    useState<PromotionRuntimeFilter>("all");
  const [promotionManagementPage, setPromotionManagementPage] = useState(1);
  const [promotionMessage, setPromotionMessage] = useState("");
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [recentlyUpdatedPromotionId, setRecentlyUpdatedPromotionId] = useState<
    number | null
  >(null);
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
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [inventoryImpacts, setInventoryImpacts] = useState<InventoryImpact[]>(
    [],
  );
  const [menuItemAvailabilityImpacts, setMenuItemAvailabilityImpacts] =
    useState<MenuItemAvailabilityImpact[]>([]);
  const [selectedInventoryMenuItemId, setSelectedInventoryMenuItemId] =
    useState("");
  const [inventorySubTab, setInventorySubTab] =
    useState<InventorySubTab>("ingredients");
  const [ingredientPage, setIngredientPage] = useState(1);
  const [menuItemIngredientLinks, setMenuItemIngredientLinks] = useState<
    MenuItemIngredient[]
  >([]);
  const [ingredientForm, setIngredientForm] = useState({
    name: "",
    unit: "unit",
    currentStock: "0",
    safetyStock: "0",
  });
  const [editingIngredientId, setEditingIngredientId] = useState<number | null>(
    null,
  );
  const [ingredientDraftId, setIngredientDraftId] = useState("");
  const [ingredientDraftQty, setIngredientDraftQty] = useState("1");
  const [inventoryMessage, setInventoryMessage] = useState("");
  const [inventoryBusy, setInventoryBusy] = useState(false);

  // Cart / order state
  const [orderId, setOrderId] = useState<number | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [queueSummary, setQueueSummary] =
    useState<QueueSummary>(defaultQueueSummary);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<Record<number, number>>(
    {},
  );
  const [cartItemSnapshotsById, setCartItemSnapshotsById] = useState<
    Record<number, MenuItem>
  >({});
  const [cartMemberNameByItemId, setCartMemberNameByItemId] = useState<
    Record<number, string>
  >({});
  const [cartBundleByItemId, setCartBundleByItemId] = useState<
    Record<number, { bundleId: number; bundleName: string; bundlePrice?: number }>
  >({});
  const [cartTotal, setCartTotal] = useState(0);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [isRefreshingCartVersion, setIsRefreshingCartVersion] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartBusyItemId, setCartBusyItemId] = useState<number | null>(null);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [reorderingOrderId, setReorderingOrderId] = useState<number | null>(
    null,
  );
  const [reorderMessage, setReorderMessage] = useState("");
  const [checkoutForm, setCheckoutForm] =
    useState<CheckoutForm>(emptyCheckoutForm);
  const [guestCheckoutForm, setGuestCheckoutForm] =
    useState<GuestCheckoutForm>(emptyGuestCheckoutForm);
  const [lastGuestOrder, setLastGuestOrder] = useState<Order | null>(null);
  const [guestLookupForm, setGuestLookupForm] = useState({
    pickupNumber: "",
    guestPhone: "",
  });
  const [guestLookupOrder, setGuestLookupOrder] = useState<Order | null>(null);
  const [guestLookupLoading, setGuestLookupLoading] = useState(false);
  const [guestLookupMessage, setGuestLookupMessage] = useState("");
  const [walkInOrderForm, setWalkInOrderForm] =
    useState<WalkInOrderForm>(emptyWalkInOrderForm);
  const [tastePreferenceChips, setTastePreferenceChips] = useState<string[]>(
    () => {
      try {
        const storedChips = window.localStorage.getItem(
          tastePreferenceStorageKey,
        );
        return storedChips
          ? sanitizeTastePreferenceChips(JSON.parse(storedChips))
          : defaultTastePreferenceChips;
      } catch {
        return defaultTastePreferenceChips;
      }
    },
  );
  const [newTastePreferenceChip, setNewTastePreferenceChip] = useState("");
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
  const [recentlyUpdatedOrderId, setRecentlyUpdatedOrderId] = useState<
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
  const [orderSearchText, setOrderSearchText] = useState("");
  const [orderSourceFilter, setOrderSourceFilter] = useState<
    "" | OrderSource
  >("");
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<
    "" | PaymentStatus
  >("");
  const [orderIssueFilter, setOrderIssueFilter] = useState<
    "" | "has_issue" | "no_issue"
  >("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<
    "" | OrderStatus
  >("");
  const [orderQuickFilter, setOrderQuickFilter] =
    useState<OrderQuickFilter>("");
  const [ordersViewMode, setOrdersViewMode] = useState<
    "list" | "board" | "kitchen"
  >("list");
  const [orderPage, setOrderPage] = useState(1);
  const orderPageSize = 10;
  const [ordersSubTab, setOrdersSubTab] = useState<OrdersSubTab>("orders");

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
  const [recentlyUpdatedRoleRequestId, setRecentlyUpdatedRoleRequestId] =
    useState<number | null>(null);
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
  const [analyticsSubTab, setAnalyticsSubTab] =
    useState<AnalyticsSubTab>("overview");
  const [promotionPerformancePage, setPromotionPerformancePage] = useState(1);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsMessage, setAuditLogsMessage] = useState("");
  const [operationAuditLogs, setOperationAuditLogs] = useState<AuditLog[]>([]);
  const [operationAuditLogsLoading, setOperationAuditLogsLoading] =
    useState(false);
  const [operationAuditLogsMessage, setOperationAuditLogsMessage] =
    useState("");
  const [auditLogActionFilter, setAuditLogActionFilter] = useState<
    "" | AuditLogAction
  >("");
  const [auditLogTargetTypeFilter, setAuditLogTargetTypeFilter] = useState<
    "" | AuditLogTargetType
  >("");
  const [auditLogLimit, setAuditLogLimit] = useState("20");
  const [auditLogPage, setAuditLogPage] = useState(1);
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
  const canViewInventory = hasAnyRole(["staff", "chef", "owner", "admin"]);
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
      { id: "orders" as const, label: "訂單處理", visible: canViewAllOrders },
      { id: "analytics" as const, label: "營運分析", visible: canManageMenu },
      { id: "menu" as const, label: "菜單管理", visible: canManageMenu },
      {
        id: "inventory" as const,
          label: "庫存管理",
          visible: canViewInventory,
      },
      {
        id: "categories" as const,
          label: "分類管理",
          visible: canManageMenu,
      },
      {
        id: "promotions" as const,
          label: "優惠券管理",
          visible: canManageMenu,
      },
      {
        id: "auditLogs" as const,
          label: "操作紀錄",
          visible: canManageMenu,
      },
      { id: "roleRequests" as const, label: "權限管理", visible: isAdmin },
      ].filter((tab) => tab.visible),
    [canManageMenu, canViewAllOrders, canViewInventory, isAdmin],
  );
  const hasManagerTools = managerTabs.length > 0;

  useEffect(() => {
    if (mainView === "manager" && !hasManagerTools) {
      setMainView("shop");
    }
  }, [hasManagerTools, mainView]);

  function showToast(type: ToastType, message: string): void {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;

    setToasts((currentToasts) =>
      [...currentToasts, { id, type, message }].slice(-4),
    );

    window.setTimeout(() => {
      setToasts((currentToasts) =>
        currentToasts.filter((toast) => toast.id !== id),
      );
    }, 4500);
  }

  function dismissToast(id: number): void {
    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== id),
    );
  }

  function notifySuccess(message: string): void {
    showToast("success", message);
  }

  function notifyError(message: string): void {
    showToast("error", message);
  }

  function notifyWarning(message: string): void {
    showToast("warning", message);
  }

  function notifyInfo(message: string): void {
    showToast("info", message);
  }

  function getCheckoutErrorToastMessage(message: string): string {
    const normalizedMessage = message.toLowerCase();
    if (
      normalizedMessage.includes("minimum") ||
      normalizedMessage.includes("min order")
    ) {
      return "This promo requires a higher order subtotal.";
    }
    if (normalizedMessage.includes("not active yet")) {
      return "This promo is not active yet.";
    }
    if (normalizedMessage.includes("expired")) {
      return "This promo has expired.";
    }
    if (normalizedMessage.includes("usage limit")) {
      return "This promo has reached its usage limit.";
    }
    if (
      normalizedMessage.includes("promotion") ||
      normalizedMessage.includes("promo") ||
      normalizedMessage.includes("code") ||
      normalizedMessage.includes("inactive")
    ) {
      return "Promo code could not be applied. Please check the code and try again.";
    }

    if (
      normalizedMessage.includes("pickup") ||
      normalizedMessage.includes("date") ||
      normalizedMessage.includes("time")
    ) {
      return "Pickup time is invalid. Please choose a valid date and time.";
    }

    return message;
  }

  function getMenuErrorToastMessage(message: string): string {
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes("image") || normalizedMessage.includes("url")) {
      return "Image URL must start with /, http://, or https://.";
    }
    if (normalizedMessage.includes("price")) {
      return "Price must be a valid whole number.";
    }
    if (
      normalizedMessage.includes("change reason") ||
      normalizedMessage.includes("reason")
    ) {
      return "Change reason is too long or invalid.";
    }
    return message;
  }

  function getPromotionErrorToastMessage(message: string): string {
    const normalizedMessage = message.toLowerCase();
    if (
      normalizedMessage.includes("duplicate") ||
      normalizedMessage.includes("unique") ||
      normalizedMessage.includes("already exists")
    ) {
      return "Promo code already exists. Please use a different code.";
    }
    if (normalizedMessage.includes("end time")) {
      return "Promotion end time must be after start time.";
    }
    if (normalizedMessage.includes("usage")) {
      return "Usage limit must be a positive number.";
    }
    if (normalizedMessage.includes("minimum") || normalizedMessage.includes("min")) {
      return "Minimum order amount must be zero or more.";
    }
    return message;
  }

  function getPromotionRuntimeStatus(
    promotion: Promotion,
    usedCount: number,
    now = new Date(),
  ): PromotionRuntimeStatus {
    const startsAt = promotion.startsAt ? Date.parse(promotion.startsAt) : null;
    const endsAt = promotion.endsAt ? Date.parse(promotion.endsAt) : null;

    if (!promotion.isActive) return "inactive";
    if (startsAt !== null && Number.isFinite(startsAt) && now.getTime() < startsAt) {
      return "scheduled";
    }
    if (endsAt !== null && Number.isFinite(endsAt) && now.getTime() > endsAt) {
      return "expired";
    }
    if (promotion.usageLimit !== null && usedCount >= promotion.usageLimit) {
      return "usage_full";
    }
    return "active_now";
  }

  function getPromotionRuntimeStatusLabel(
    status: PromotionRuntimeStatus,
  ): string {
    switch (status) {
      case "active_now":
        return "目前可用";
      case "scheduled":
        return "尚未開始";
      case "expired":
        return "已過期";
      case "usage_full":
        return "已達上限";
      case "inactive":
        return "停用中";
    }
  }

  function getPromotionRuntimeStatusBadgeClass(
    status: PromotionRuntimeStatus,
  ): string {
    switch (status) {
      case "active_now":
        return "badge-success";
      case "scheduled":
        return "badge-info";
      case "expired":
        return "badge-warning";
      case "usage_full":
        return "badge-error";
      case "inactive":
        return "badge-neutral";
    }
  }

  function formatPromotionRuleSummary(
    promotion: Promotion,
    usedCount: number,
  ): string[] {
    const runtimeStatus = getPromotionRuntimeStatus(promotion, usedCount);
    const discount =
      promotion.discountType === "percent"
        ? `${promotion.discountValue}% 折扣`
        : `折抵 $${promotion.discountValue}`;

    return [
      discount,
      promotion.minOrderAmount > 0
        ? `最低消費：$${promotion.minOrderAmount}`
        : "無最低消費",
      promotion.startsAt
        ? `開始：${formatCheckoutDateTime(promotion.startsAt)}`
        : "立即生效",
      promotion.endsAt
        ? `結束：${formatCheckoutDateTime(promotion.endsAt)}`
        : "無結束時間",
      promotion.usageLimit
        ? `使用次數：${usedCount} / ${promotion.usageLimit}`
        : `使用次數：${usedCount} / 無限制`,
      getPromotionRuntimeStatusLabel(runtimeStatus),
    ];
  }

  function isInvalidCustomDateRange(
    range: AnalyticsRange | AuditLogRange,
    startDate: string,
    endDate: string,
  ): boolean {
    if (range !== "custom" || !startDate || !endDate) return false;
    return new Date(startDate).getTime() > new Date(endDate).getTime();
  }

  function getToastAlertClass(type: ToastType): string {
    switch (type) {
      case "success":
        return "alert-success";
      case "error":
        return "alert-error";
      case "warning":
        return "alert-warning";
      case "info":
        return "alert-info";
      default:
        return "";
    }
  }

  function isKitchenQueueOrder(order: Order): boolean {
    return order.status === "submitted" || order.status === "preparing";
  }

  const activeQueueOrders = historyOrders.filter(isKitchenQueueOrder);
  const kitchenQueueOrders = activeQueueOrders;
  const activeOrders = activeQueueOrders.length;
  const estimatedWaitMinutes = queueSummary.estimatedWaitMinutes;
  const busyLevel = queueSummary.busyLevel;
  const unpaidOrders = historyOrders.filter(
    (order) =>
      order.paymentStatus === "unpaid" &&
      order.status !== "pending" &&
      order.status !== "cancelled",
  ).length;
  const phoneOrdersToday = historyOrders.filter(
    (order) => order.orderSource === "phone" && isOrderCreatedToday(order),
  ).length;
  const walkInOrdersToday = historyOrders.filter(
    (order) => order.orderSource === "walk_in" && isOrderCreatedToday(order),
  ).length;
  const promoOrdersToday = historyOrders.filter(
    (order) =>
      (Boolean(order.promoCode) || order.discountAmount > 0) &&
      isOrderCreatedToday(order),
  ).length;
  const ordersWithIssue = historyOrders.filter(
    (order) =>
      order.issueType !== null &&
      order.status !== "completed" &&
      order.status !== "cancelled",
  ).length;
  const promotionUsageCounts = useMemo(() => {
    const usageCounts: Record<string, number> = {};
    for (const order of historyOrders) {
      if (order.status === "pending" || order.status === "cancelled") continue;
      if (!order.promoCode) continue;
      const normalizedCode = order.promoCode.trim().toUpperCase();
      usageCounts[normalizedCode] = (usageCounts[normalizedCode] ?? 0) + 1;
    }
    return usageCounts;
  }, [historyOrders]);
  const filteredPromotions = useMemo(
    () =>
      promotions.filter((promotion) => {
        if (promotionRuntimeFilter === "all") return true;
        const usedCount =
          promotionUsageCounts[promotion.code.trim().toUpperCase()] ?? 0;
        return (
          getPromotionRuntimeStatus(promotion, usedCount) ===
          promotionRuntimeFilter
        );
      }),
    [promotionRuntimeFilter, promotionUsageCounts, promotions],
  );
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
  const appliedAnalyticsFilters = {
    range: appliedAnalyticsRange,
    startDate: appliedAnalyticsStartDate,
    endDate: appliedAnalyticsEndDate,
  };
  const analyticsRangeOrders = historyOrders.filter((order) =>
    isOrderInAnalyticsDateRange(order.submittedAt ?? order.createdAt, {
      range: appliedAnalyticsRange,
      startDate: appliedAnalyticsStartDate,
      endDate: appliedAnalyticsEndDate,
    }),
  );
  const formalAnalyticsOrders = analyticsRangeOrders.filter(
    (order) => order.status !== "pending",
  );
  const revenueAnalyticsOrders = formalAnalyticsOrders.filter(
    (order) => order.status !== "cancelled",
  );
  const promotionPerformanceRows = useMemo(() => {
    const rowsByCode = new Map<
      string,
      {
        code: string;
        isActive: boolean | null;
        usedOrders: number;
        totalSubtotal: number;
        totalDiscount: number;
        totalRevenue: number;
        averageOrderValue: number;
        lastUsedAt: string | null;
        minOrderAmount: number | null;
        startsAt: string | null;
        endsAt: string | null;
        usageLimit: number | null;
      }
    >();

    for (const promotion of promotions) {
      rowsByCode.set(promotion.code.toUpperCase(), {
        code: promotion.code,
        isActive: promotion.isActive,
        usedOrders: 0,
        totalSubtotal: 0,
        totalDiscount: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        lastUsedAt: null,
        minOrderAmount: promotion.minOrderAmount,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
        usageLimit: promotion.usageLimit,
      });
    }

    for (const order of revenueAnalyticsOrders) {
      if (!order.promoCode && order.discountAmount <= 0) continue;
      const normalizedCode = (order.promoCode ?? "UNKNOWN")
        .trim()
        .toUpperCase();
      const existing = rowsByCode.get(normalizedCode);
      const row =
        existing ??
        {
          code: normalizedCode,
          isActive: null,
          usedOrders: 0,
          totalSubtotal: 0,
          totalDiscount: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          lastUsedAt: null,
          minOrderAmount: null,
          startsAt: null,
          endsAt: null,
          usageLimit: null,
        };

      row.usedOrders += 1;
      row.totalSubtotal += order.subtotal;
      row.totalDiscount += order.discountAmount;
      row.totalRevenue += order.total;
      const usedAt = order.submittedAt ?? order.createdAt;
      if (
        !row.lastUsedAt ||
        new Date(usedAt).getTime() > new Date(row.lastUsedAt).getTime()
      ) {
        row.lastUsedAt = usedAt;
      }
      rowsByCode.set(normalizedCode, row);
    }

    return Array.from(rowsByCode.values())
      .map((row) => ({
        ...row,
        averageOrderValue:
          row.usedOrders > 0 ? row.totalRevenue / row.usedOrders : 0,
      }))
      .sort((left, right) => {
        if (right.usedOrders !== left.usedOrders) {
          return right.usedOrders - left.usedOrders;
        }
        return left.code.localeCompare(right.code);
      });
  }, [promotions, revenueAnalyticsOrders]);
  const tablePageSize = 10;
  const promotionPerformancePageCount = Math.max(
    1,
    Math.ceil(promotionPerformanceRows.length / tablePageSize),
  );
  const currentPromotionPerformancePage = Math.min(
    promotionPerformancePage,
    promotionPerformancePageCount,
  );
  const paginatedPromotionPerformanceRows = promotionPerformanceRows.slice(
    (currentPromotionPerformancePage - 1) * tablePageSize,
    currentPromotionPerformancePage * tablePageSize,
  );
  const promotionManagementPageCount = Math.max(
    1,
    Math.ceil(filteredPromotions.length / tablePageSize),
  );
  const currentPromotionManagementPage = Math.min(
    promotionManagementPage,
    promotionManagementPageCount,
  );
  const paginatedFilteredPromotions = filteredPromotions.slice(
    (currentPromotionManagementPage - 1) * tablePageSize,
    currentPromotionManagementPage * tablePageSize,
  );
  const menuListPageSize = 10;
  const menuListPageCount = Math.max(
    1,
    Math.ceil(items.length / menuListPageSize),
  );
  const currentMenuListPage = Math.min(menuListPage, menuListPageCount);
  const paginatedMenuItems = items.slice(
    (currentMenuListPage - 1) * menuListPageSize,
    currentMenuListPage * menuListPageSize,
  );
  const auditLogPageSize = 10;
  const auditLogPageCount = Math.max(
    1,
    Math.ceil(auditLogs.length / auditLogPageSize),
  );
  const currentAuditLogPage = Math.min(auditLogPage, auditLogPageCount);
  const paginatedAuditLogs = auditLogs.slice(
    (currentAuditLogPage - 1) * auditLogPageSize,
    currentAuditLogPage * auditLogPageSize,
  );
  const ingredientPageCount = Math.max(
    1,
    Math.ceil(ingredients.length / tablePageSize),
  );
  const currentIngredientPage = Math.min(ingredientPage, ingredientPageCount);
  const paginatedIngredients = ingredients.slice(
    (currentIngredientPage - 1) * tablePageSize,
    currentIngredientPage * tablePageSize,
  );
  const issueOrders = formalAnalyticsOrders.filter(
    (order) => order.issueType !== null,
  );
  const openIssueOrders = issueOrders.filter(
    (order) => order.status !== "completed" && order.status !== "cancelled",
  );
  const resolvedIssueOrders = issueOrders.filter(
    (order) =>
      order.status === "completed" ||
      Boolean((order as Order & { issueClearedAt?: string | null }).issueClearedAt),
  );
  const issueSummary = {
    totalIssueOrders: issueOrders.length,
    openIssueOrders: openIssueOrders.length,
    resolvedIssueOrders: resolvedIssueOrders.length,
    issueRate:
      formalAnalyticsOrders.length > 0
        ? issueOrders.length / formalAnalyticsOrders.length
        : 0,
  };
  const issueTypeRows = orderIssueTypeOptions
    .map((issueType) => {
      const ordersForType = issueOrders.filter(
        (order) => order.issueType === issueType,
      );
      return {
        issueType,
        count: ordersForType.length,
        openCount: ordersForType.filter(
          (order) =>
            order.status !== "completed" && order.status !== "cancelled",
        ).length,
        completedCount: ordersForType.filter(
          (order) => order.status === "completed",
        ).length,
        cancelledCount: ordersForType.filter(
          (order) => order.status === "cancelled",
        ).length,
      };
    })
    .filter((row) => row.count > 0);
  const issueSourceRows = ([
    "customer",
    "walk_in",
    "phone",
    "guest",
  ] as OrderSource[])
    .map((source) => {
      const sourceOrders = formalAnalyticsOrders.filter(
        (order) => order.orderSource === source,
      );
      const sourceIssueOrders = sourceOrders.filter(
        (order) => order.issueType !== null,
      );
      return {
        source,
        issueOrders: sourceIssueOrders.length,
        totalOrders: sourceOrders.length,
        issueRate:
          sourceOrders.length > 0
            ? sourceIssueOrders.length / sourceOrders.length
            : 0,
      };
    })
    .filter((row) => row.totalOrders > 0 || row.issueOrders > 0);
  const staffOperationRows = useMemo(() => {
    const staffRoles: Role[] = ["staff", "chef", "owner", "admin"];
    const managerActions: AuditLogAction[] = [
      "walk_in_order_create",
      "phone_order_create",
      "order_payment_update",
      "order_status_update",
      "order_issue_set",
      "order_issue_clear",
      "menu_create",
      "menu_update",
      "menu_availability_update",
      "menu_display_order_update",
      "menu_ab_test_update",
      "menu_delete",
      "menu_category_assign",
      "menu_category_remove",
      "category_create",
      "category_update",
      "category_delete",
      "promotion_create",
      "promotion_update",
      "promotion_delete",
      "role_update",
      "role_request_review",
      "role_request_create",
    ];
    const menuChangeActions: AuditLogAction[] = [
      "menu_create",
      "menu_update",
      "menu_availability_update",
      "menu_display_order_update",
      "menu_ab_test_update",
      "menu_delete",
      "menu_category_assign",
      "menu_category_remove",
      "category_create",
      "category_update",
      "category_delete",
    ];
    const promotionChangeActions: AuditLogAction[] = [
      "promotion_create",
      "promotion_update",
      "promotion_delete",
    ];
    const rowsByActor = new Map<
      string,
      {
        actorLabel: string;
        staffOrdersCreated: number;
        phoneOrdersCreated: number;
        paymentsUpdated: number;
        statusesUpdated: number;
        issuesHandled: number;
        menuChanges: number;
        promotionChanges: number;
        roleChanges: number;
        totalActions: number;
        lastActionAt: string | null;
      }
    >();

    for (const log of operationAuditLogs) {
      if (
        !isOrderInAnalyticsDateRange(log.createdAt, appliedAnalyticsFilters)
      ) {
        continue;
      }
      if (
        !log.actorRoles.some((role) => staffRoles.includes(role)) &&
        !managerActions.includes(log.action)
      ) {
        continue;
      }

      const actorKey = log.actorUserId ?? log.actorName ?? "unknown";
      const row =
        rowsByActor.get(actorKey) ??
        {
          actorLabel: log.actorName || log.actorUserId || "Unknown",
          staffOrdersCreated: 0,
          phoneOrdersCreated: 0,
          paymentsUpdated: 0,
          statusesUpdated: 0,
          issuesHandled: 0,
          menuChanges: 0,
          promotionChanges: 0,
          roleChanges: 0,
          totalActions: 0,
          lastActionAt: null,
        };

      row.totalActions += 1;
      if (
        log.action === "walk_in_order_create" ||
        log.action === "phone_order_create"
      ) {
        row.staffOrdersCreated += 1;
      }
      if (log.action === "phone_order_create") row.phoneOrdersCreated += 1;
      if (log.action === "order_payment_update") row.paymentsUpdated += 1;
      if (log.action === "order_status_update") row.statusesUpdated += 1;
      if (
        log.action === "order_issue_set" ||
        log.action === "order_issue_clear"
      ) {
        row.issuesHandled += 1;
      }
      if (menuChangeActions.includes(log.action)) row.menuChanges += 1;
      if (promotionChangeActions.includes(log.action)) {
        row.promotionChanges += 1;
      }
      if (
        log.action === "role_update" ||
        log.action === "role_request_review" ||
        log.action === "role_request_create"
      ) {
        row.roleChanges += 1;
      }
      if (
        !row.lastActionAt ||
        new Date(log.createdAt).getTime() >
          new Date(row.lastActionAt).getTime()
      ) {
        row.lastActionAt = log.createdAt;
      }
      rowsByActor.set(actorKey, row);
    }

    return Array.from(rowsByActor.values()).sort(
      (left, right) => right.totalActions - left.totalActions,
    );
  }, [
    appliedAnalyticsEndDate,
    appliedAnalyticsRange,
    appliedAnalyticsStartDate,
    operationAuditLogs,
  ]);

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
  const managerVisibleOrders = useMemo(() => {
    const search = orderSearchText.trim().toLowerCase();
    const searchDigits = search.replace(/\D/g, "");
    const activeStatuses: OrderStatus[] = ["submitted", "preparing", "ready"];

    function matchesSearch(order: Order): boolean {
      if (!search) return true;

      const pickupNumber = formatPickupNumber(order.id).toLowerCase();
      const pickupDigits = pickupNumber.replace(/\D/g, "");
      const guestPhoneDigits = (order.guestPhone ?? "").replace(/\D/g, "");
      const searchableValues = [
        String(order.id),
        pickupNumber,
        pickupDigits,
        order.guestName ?? "",
        order.promoCode ?? "",
      ].map((value) => value.toLowerCase());

      return (
        searchableValues.some((value) => value.includes(search)) ||
        (searchDigits.length > 0 &&
          guestPhoneDigits.endsWith(searchDigits)) ||
        order.items.some((detail) =>
          detail.item.name.toLowerCase().includes(search),
        )
      );
    }

    function matchesQuickFilter(order: Order): boolean {
      switch (orderQuickFilter) {
        case "active":
          return activeStatuses.includes(order.status);
        case "ready_unpaid":
          return (
            order.status === "ready" && order.paymentStatus === "unpaid"
          );
        case "phone":
          return order.orderSource === "phone";
        case "open_issues":
          return (
            order.issueType !== null &&
            order.status !== "completed" &&
            order.status !== "cancelled"
          );
        case "promo":
          return Boolean(order.promoCode) || order.discountAmount > 0;
        default:
          return true;
      }
    }

    const statusPriority: Partial<Record<OrderStatus, number>> = {
      submitted: 0,
      preparing: 1,
      ready: 2,
      pending: 3,
      completed: 4,
      cancelled: 5,
    };

    return historyOrders
      .filter(matchesSearch)
      .filter((order) =>
        orderStatusFilter ? order.status === orderStatusFilter : true,
      )
      .filter((order) =>
        orderSourceFilter ? order.orderSource === orderSourceFilter : true,
      )
      .filter((order) =>
        orderPaymentFilter
          ? order.paymentStatus === orderPaymentFilter
          : true,
      )
      .filter((order) => {
        if (orderIssueFilter === "has_issue") return order.issueType !== null;
        if (orderIssueFilter === "no_issue") return order.issueType === null;
        return true;
      })
      .filter(matchesQuickFilter)
      .slice()
      .sort((left, right) => {
        const statusDiff =
          (statusPriority[left.status] ?? 99) -
          (statusPriority[right.status] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        return (
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
        );
      });
  }, [
    historyOrders,
    orderIssueFilter,
    orderPaymentFilter,
    orderQuickFilter,
    orderSearchText,
    orderSourceFilter,
    orderStatusFilter,
  ]);

  const managerOrderPageCount = Math.max(
    1,
    Math.ceil(managerVisibleOrders.length / orderPageSize),
  );
  const currentManagerOrderPage = Math.min(orderPage, managerOrderPageCount);
  const paginatedManagerVisibleOrders = useMemo(() => {
    const startIndex = (currentManagerOrderPage - 1) * orderPageSize;
    return managerVisibleOrders.slice(startIndex, startIndex + orderPageSize);
  }, [currentManagerOrderPage, managerVisibleOrders, orderPageSize]);

  useEffect(() => {
    setOrderPage(1);
  }, [
    orderIssueFilter,
    orderPaymentFilter,
    orderQuickFilter,
    orderSearchText,
    orderSourceFilter,
    orderStatusFilter,
    ordersViewMode,
  ]);

  useEffect(() => {
    if (orderPage > managerOrderPageCount) {
      setOrderPage(managerOrderPageCount);
    }
  }, [managerOrderPageCount, orderPage]);

  useEffect(() => {
    setPromotionPerformancePage(1);
  }, [appliedAnalyticsRange, appliedAnalyticsStartDate, appliedAnalyticsEndDate]);

  useEffect(() => {
    setPromotionManagementPage(1);
  }, [promotionRuntimeFilter, promotionStatusFilter]);

  useEffect(() => {
    setAuditLogPage(1);
  }, [auditLogs, auditLogActionFilter, auditLogTargetTypeFilter]);

  useEffect(() => {
    if (promotionPerformancePage > promotionPerformancePageCount) {
      setPromotionPerformancePage(promotionPerformancePageCount);
    }
  }, [promotionPerformancePage, promotionPerformancePageCount]);

  useEffect(() => {
    if (promotionManagementPage > promotionManagementPageCount) {
      setPromotionManagementPage(promotionManagementPageCount);
    }
  }, [promotionManagementPage, promotionManagementPageCount]);

  useEffect(() => {
    if (auditLogPage > auditLogPageCount) {
      setAuditLogPage(auditLogPageCount);
    }
  }, [auditLogPage, auditLogPageCount]);

  useEffect(() => {
    if (ingredientPage > ingredientPageCount) {
      setIngredientPage(ingredientPageCount);
    }
  }, [ingredientPage, ingredientPageCount]);

  useEffect(() => {
    if (menuListPage > menuListPageCount) {
      setMenuListPage(menuListPageCount);
    }
  }, [menuListPage, menuListPageCount]);

  const kitchenDisplayOrders = useMemo(() => {
    const search = orderSearchText.trim().toLowerCase();
    const searchDigits = search.replace(/\D/g, "");

    function matchesSearch(order: Order): boolean {
      if (!search) return true;
      const pickupNumber = formatPickupNumber(order.id).toLowerCase();
      const pickupDigits = pickupNumber.replace(/\D/g, "");
      const guestPhoneDigits = (order.guestPhone ?? "").replace(/\D/g, "");
      const searchableValues = [
        String(order.id),
        pickupNumber,
        pickupDigits,
        order.guestName ?? "",
      ].map((value) => value.toLowerCase());

      return (
        searchableValues.some((value) => value.includes(search)) ||
        (searchDigits.length > 0 && guestPhoneDigits.endsWith(searchDigits)) ||
        order.items.some((detail) =>
          detail.item.name.toLowerCase().includes(search),
        )
      );
    }

    function priorityScore(order: Order): number {
      const pickupTime = order.pickupTime
        ? new Date(order.pickupTime).getTime()
        : Number.POSITIVE_INFINITY;
      const ageMinutes = getOrderAgeMinutes(order);
      const statusWeight = order.status === "submitted" ? 0 : 1;
      return pickupTime + statusWeight * 1_000 - ageMinutes * 60_000;
    }

    return historyOrders
      .filter(
        (order) => order.status === "submitted" || order.status === "preparing",
      )
      .filter(matchesSearch)
      .slice()
      .sort((left, right) => {
        const leftPickup = left.pickupTime
          ? new Date(left.pickupTime).getTime()
          : Number.POSITIVE_INFINITY;
        const rightPickup = right.pickupTime
          ? new Date(right.pickupTime).getTime()
          : Number.POSITIVE_INFINITY;
        if (leftPickup !== rightPickup) return leftPickup - rightPickup;

        const priorityDiff = priorityScore(left) - priorityScore(right);
        if (priorityDiff !== 0) return priorityDiff;

        return getOrderQueueTime(left) - getOrderQueueTime(right);
      });
  }, [historyOrders, orderSearchText]);

  const kitchenItemSummary = useMemo(() => {
    const rowsByKey = new Map<
      string,
      {
        name: string;
        totalQty: number;
        orderIds: Set<number>;
        sources: Set<OrderSource>;
        earliestTime: string;
      }
    >();

    for (const order of kitchenDisplayOrders) {
      const orderTime = order.pickupTime ?? order.submittedAt ?? order.createdAt;
      for (const detail of order.items) {
        const groupId =
          detail.menu_item_group_id ?? detail.item.menu_item_group_id ?? null;
        const key = groupId ? `group:${groupId}` : `item:${detail.item.id}`;
        const row =
          rowsByKey.get(key) ??
          {
            name: detail.item.name,
            totalQty: 0,
            orderIds: new Set<number>(),
            sources: new Set<OrderSource>(),
            earliestTime: orderTime,
          };

        row.totalQty += detail.qty;
        row.orderIds.add(order.id);
        row.sources.add(order.orderSource);
        if (
          new Date(orderTime).getTime() < new Date(row.earliestTime).getTime()
        ) {
          row.earliestTime = orderTime;
        }
        rowsByKey.set(key, row);
      }
    }

    return Array.from(rowsByKey.values()).sort((left, right) => {
      if (right.totalQty !== left.totalQty) return right.totalQty - left.totalQty;
      return (
        new Date(left.earliestTime).getTime() -
        new Date(right.earliestTime).getTime()
      );
    });
  }, [kitchenDisplayOrders]);

  const urgentKitchenOrders = kitchenDisplayOrders.filter(isUrgentOrder).length;
  const totalKitchenItemsWaiting = kitchenDisplayOrders.reduce(
    (sum, order) =>
      sum + order.items.reduce((itemSum, detail) => itemSum + detail.qty, 0),
    0,
  );

  function applyOrderQuickFilter(filter: OrderQuickFilter): void {
    setOrderQuickFilter(filter);
    notifyInfo("Order quick filter applied.");
  }

  function clearOrderFilters(): void {
    setOrderSearchText("");
    setOrderSourceFilter("");
    setOrderPaymentFilter("");
    setOrderIssueFilter("");
    setOrderStatusFilter("");
    setOrderQuickFilter("");
    notifyInfo("Order filters cleared.");
  }

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
      return { label: "開始製作", status: "preparing" };
    }

    if (order.status === "preparing" && allowedStatuses.includes("ready")) {
      return { label: "標記可取餐", status: "ready" };
    }

    if (order.status === "ready" && allowedStatuses.includes("completed")) {
      return { label: "完成取餐", status: "completed" };
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

  function isOrderCreatedToday(order: Order): boolean {
    const createdAt = new Date(order.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;
    return createdAt.toDateString() === new Date().toDateString();
  }

  function formatReceiptText(order: Order): string {
    const lines = [
      "早餐店收據",
      "======================",
      `取餐編號：${formatPickupNumber(order.id)}`,
      `訂單編號：${order.id}`,
      `訂單來源：${formatOrderSource(order.orderSource)}`,
    ];

    if (order.guestName) {
      lines.push(`顧客姓名：${order.guestName}`);
    }
    if (order.guestPhone) {
      lines.push(`電話：${order.guestPhone}`);
    }
    if (order.isGroupOrder) {
      lines.push(`團體訂單：${order.groupName || "是"}`);
      if (order.contactName) lines.push(`聯絡人：${order.contactName}`);
      if (order.contactPhone) lines.push(`聯絡電話：${order.contactPhone}`);
    }

    lines.push(
      `狀態：${formatOrderStatus(order.status)}`,
      `取餐方式：${formatFulfillmentType(order.fulfillmentType)}`,
    );

    if (order.pickupTime) {
      lines.push(`取餐時間：${formatCheckoutDateTime(order.pickupTime)}`);
    }

    lines.push(
      `付款：${formatPaymentMethod(order.paymentMethod)} / ${formatPaymentStatus(order.paymentStatus)}`,
    );

    if (order.customerNote) {
      lines.push(`備註：${order.customerNote}`);
    }

    lines.push("", "餐點：");
    for (const detail of order.items) {
      const itemLineParts = [`${detail.item.name} x ${detail.qty}`];
      if (detail.memberName) itemLineParts.push(`成員：${detail.memberName}`);
      if (detail.bundleName) itemLineParts.push(`套餐：${detail.bundleName}`);
      lines.push(
        `${itemLineParts.join(" / ")} = $${detail.item.price * detail.qty}`,
      );
    }

    if (order.discountAmount > 0 || order.promoCode) {
      lines.push(
        "",
        `小計：$${order.subtotal}`,
        `優惠碼：${order.promoCode ?? "-"}`,
        `折扣：-$${order.discountAmount}`,
      );
    }

    lines.push("", `總金額：$${order.total}`);
    return lines.join("\n");
  }

  function printReceipt(order: Order): void {
    const receiptText = formatReceiptText(order);
    const printWindow = window.open("", "_blank", "width=420,height=640");

    if (!printWindow) {
      setStatusMessage("Unable to open print window.");
      notifyError("Unable to open print window.");
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
    notifyInfo("Receipt opened for printing.");
  }

  function getOrderAgeMinutes(order: Order): number {
    const date = new Date(order.submittedAt ?? order.createdAt);
    if (Number.isNaN(date.getTime())) return 0;
    return Math.floor((Date.now() - date.getTime()) / 60000);
  }

  function estimateWaitMinutes(orderCount: number): number {
    return Math.min(45, 5 + orderCount * 3);
  }

  function getBusyLevel(orderCount: number): BusyLevel {
    if (orderCount >= 6) return "very_busy";
    if (orderCount >= 3) return "busy";
    return "normal";
  }

  function getBusyLevelLabel(level: BusyLevel): string {
    if (level === "very_busy") return "非常忙碌";
    if (level === "busy") return "忙碌";
    return "正常";
  }

  function getBusyLevelBadgeClass(level: BusyLevel): string {
    if (level === "very_busy") return "badge-error";
    if (level === "busy") return "badge-warning";
    return "badge-success";
  }

  function getBusyLevelMessage(level: BusyLevel): string {
    if (level === "very_busy") {
      return "目前訂單較多，取餐可能需要多等一點時間。";
    }
    if (level === "busy") {
      return "廚房目前較忙，建議可選擇稍晚的取餐時間。";
    }
    return "目前出餐狀況正常。";
  }

  function getOrderQueueTime(order: Order): number {
    const date = new Date(order.submittedAt ?? order.createdAt);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function getQueueAheadCount(order: Order): number {
    const orderTime = getOrderQueueTime(order);
    return activeQueueOrders.filter(
      (queueOrder) =>
        queueOrder.id !== order.id && getOrderQueueTime(queueOrder) < orderTime,
    ).length;
  }

  function getCustomerOrderProgressLabel(order: Order): string {
    if (order.status === "ready") return "Ready for pickup";
    if (order.status === "completed") return "Completed";
    if (order.status === "cancelled") return "Cancelled";
    if (order.status === "preparing") return "Being prepared";
    if (order.status === "submitted") return "Waiting for kitchen";
    return order.status;
  }

  function getReadyAgeMinutes(order: Order): number | null {
    if (order.status !== "ready") return null;
    const orderWithTiming = order as Order & {
      readyAt?: string | null;
      updatedAt?: string | null;
    };
    const date = new Date(
      orderWithTiming.readyAt ??
        orderWithTiming.updatedAt ??
        order.submittedAt ??
        order.createdAt,
    );
    if (Number.isNaN(date.getTime())) return 0;
    return Math.floor((Date.now() - date.getTime()) / 60000);
  }

  function isReadyPickupOverdue(order: Order): boolean {
    const readyAgeMinutes = getReadyAgeMinutes(order);
    return readyAgeMinutes !== null && readyAgeMinutes > 10;
  }

  function getManagerOrderFlowHint(order: Order): string {
    if (order.status === "submitted") return "Waiting for kitchen";
    if (order.status === "preparing") return "Being prepared";
    if (order.status === "ready") return "Ready for pickup";
    return "";
  }

  function getKitchenPriorityLabel(order: Order): "normal" | "soon" | "urgent" {
    const pickupTime = order.pickupTime ? new Date(order.pickupTime) : null;
    const pickupMs = pickupTime?.getTime() ?? Number.NaN;
    const minutesUntilPickup = Number.isNaN(pickupMs)
      ? Number.POSITIVE_INFINITY
      : Math.floor((pickupMs - Date.now()) / 60000);

    if (getOrderAgeMinutes(order) > 10 || minutesUntilPickup < 0) {
      return "urgent";
    }
    if (minutesUntilPickup <= 10) {
      return "soon";
    }
    return "normal";
  }

  function getKitchenPriorityBadgeClass(
    priority: "normal" | "soon" | "urgent",
  ): string {
    if (priority === "urgent") return "badge-error";
    if (priority === "soon") return "badge-warning";
    return "badge-outline";
  }

  function formatKitchenPriority(priority: "normal" | "soon" | "urgent") {
    if (priority === "urgent") return "緊急";
    if (priority === "soon") return "Due soon";
    return "Normal";
  }

  function isUrgentOrder(order: Order): boolean {
    return (
      (order.status === "submitted" || order.status === "preparing") &&
      getOrderAgeMinutes(order) > 10
    );
  }

  function highlightOrder(orderId: number): void {
    setRecentlyUpdatedOrderId(orderId);
    window.setTimeout(() => {
      setRecentlyUpdatedOrderId((currentId) =>
        currentId === orderId ? null : currentId,
      );
    }, 3500);
  }

  function highlightMenuItem(itemId: number): void {
    setRecentlyUpdatedMenuItemId(itemId);
    window.setTimeout(() => {
      setRecentlyUpdatedMenuItemId((currentId) =>
        currentId === itemId ? null : currentId,
      );
    }, 3500);
  }

  function highlightCategory(categoryId: number): void {
    setRecentlyUpdatedCategoryId(categoryId);
    window.setTimeout(() => {
      setRecentlyUpdatedCategoryId((currentId) =>
        currentId === categoryId ? null : currentId,
      );
    }, 3500);
  }

  function highlightPromotion(promotionId: number): void {
    setRecentlyUpdatedPromotionId(promotionId);
    window.setTimeout(() => {
      setRecentlyUpdatedPromotionId((currentId) =>
        currentId === promotionId ? null : currentId,
      );
    }, 3500);
  }

  function highlightRoleRequest(requestId: number): void {
    setRecentlyUpdatedRoleRequestId(requestId);
    window.setTimeout(() => {
      setRecentlyUpdatedRoleRequestId((currentId) =>
        currentId === requestId ? null : currentId,
      );
    }, 3500);
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

  const loadInventory = useCallback(async () => {
    const [ingredientsResponse, impactsResponse] = await Promise.all([
      fetch(buildApiUrl("/api/ingredients"), { credentials: "include" }),
      fetch(buildApiUrl("/api/inventory/impacts"), { credentials: "include" }),
    ]);
    if (!ingredientsResponse.ok) {
      throw new Error(await readApiError(ingredientsResponse));
    }
    if (!impactsResponse.ok) {
      throw new Error(await readApiError(impactsResponse));
    }

    const ingredientsPayload =
      (await ingredientsResponse.json()) as ApiDataResponse<Ingredient[]>;
    const impactsPayload = (await impactsResponse.json()) as ApiDataResponse<{
      ingredients: InventoryImpact[];
      menuItems: MenuItemAvailabilityImpact[];
    }>;
    setIngredients(
      Array.isArray(ingredientsPayload?.data) ? ingredientsPayload.data : [],
    );
    setInventoryImpacts(
      Array.isArray(impactsPayload?.data?.ingredients)
        ? impactsPayload.data.ingredients
        : [],
    );
    setMenuItemAvailabilityImpacts(
      Array.isArray(impactsPayload?.data?.menuItems)
        ? impactsPayload.data.menuItems
        : [],
    );
  }, []);

  const loadMenuItemIngredients = useCallback(async (menuItemId: number) => {
    const response = await fetch(
      buildApiUrl(`/api/menu/${menuItemId}/ingredients`),
      { credentials: "include" },
    );
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    const payload =
      (await response.json()) as ApiDataResponse<MenuItemIngredient[]>;
    setMenuItemIngredientLinks(
      Array.isArray(payload?.data) ? payload.data : [],
    );
  }, []);

  const loadMenuBundles = useCallback(
    async (options: { includeInactive?: boolean } = {}) => {
      const response = await fetch(
        buildApiUrl(
          options.includeInactive ? "/api/admin/menu-bundles" : "/api/menu-bundles",
        ),
        options.includeInactive ? { credentials: "include" } : undefined,
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<MenuBundle[]>;
      const bundles = Array.isArray(payload?.data) ? payload.data : [];
      if (options.includeInactive) {
        setMenuBundleManagementItems(bundles);
      } else {
        setMenuBundles(bundles);
      }
    },
    [],
  );

  const loadQueueSummary = useCallback(async () => {
    const response = await fetch(buildApiUrl("/api/orders/queue-summary"));
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const payload = (await response.json()) as ApiDataResponse<QueueSummary>;
    setQueueSummary(payload?.data ?? defaultQueueSummary);
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
    setCartMemberNameByItemId(
      order.items.reduce(
        (acc, orderItem) => {
          if (orderItem.memberName) {
            acc[orderItem.item.id] = orderItem.memberName;
          }
          return acc;
        },
        {} as Record<number, string>,
      ),
    );
    setCartBundleByItemId(
      order.items.reduce(
        (acc, orderItem) => {
          if (orderItem.bundleId && orderItem.bundleName) {
            const bundle = menuBundles.find(
              (candidate) => candidate.id === orderItem.bundleId,
            );
            acc[orderItem.item.id] = {
              bundleId: orderItem.bundleId,
              bundleName: orderItem.bundleName,
              bundlePrice: bundle?.price,
            };
          }
          return acc;
        },
        {} as Record<
          number,
          { bundleId: number; bundleName: string; bundlePrice?: number }
        >,
      ),
    );
    setCartTotal(order.total);
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
    setCartItemSnapshotsById({});
    setCartMemberNameByItemId({});
    setCartBundleByItemId({});
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
      await loadQueueSummary();
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

  const loadOperationAuditLogs = useCallback(
    async (
      filters?: AnalyticsDateFilters,
      options: { notify?: boolean } = {},
    ) => {
      if (!canManageMenu) return false;

      const activeFilters = filters ?? {
        range: appliedAnalyticsRange,
        startDate: appliedAnalyticsStartDate,
        endDate: appliedAnalyticsEndDate,
      };
      const params = new URLSearchParams({
        limit: "200",
        range: activeFilters.range,
      });
      if (activeFilters.range === "custom") {
        if (activeFilters.startDate) {
          params.set("startDate", activeFilters.startDate);
        }
        if (activeFilters.endDate) params.set("endDate", activeFilters.endDate);
      }

      setOperationAuditLogsLoading(true);
      setOperationAuditLogsMessage("");
      try {
        const response = await fetch(
          buildApiUrl(`/api/admin/audit-logs?${params.toString()}`),
          { credentials: "include" },
        );

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const payload = (await response.json()) as ApiDataResponse<AuditLog[]>;
        setOperationAuditLogs(
          Array.isArray(payload?.data) ? payload.data : [],
        );
        if (options.notify) notifyInfo("Operation logs refreshed.");
        return true;
      } catch (operationError) {
        const message =
          operationError instanceof Error
            ? operationError.message
            : "Unable to load operation logs.";
        setOperationAuditLogsMessage(message);
        notifyError(message);
        return false;
      } finally {
        setOperationAuditLogsLoading(false);
      }
    },
    [
      appliedAnalyticsEndDate,
      appliedAnalyticsRange,
      appliedAnalyticsStartDate,
      canManageMenu,
    ],
  );

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
      await loadOperationAuditLogs(activeFilters);
      return true;
    } catch (analyticsError) {
      const message =
        analyticsError instanceof Error
          ? analyticsError.message
          : "Unable to load analytics.";
      setAnalyticsMessage(message);
      notifyError(message);
      return false;
    } finally {
      setAnalyticsLoading(false);
    }
  }, [
    appliedAnalyticsEndDate,
    appliedAnalyticsRange,
    appliedAnalyticsStartDate,
    canManageMenu,
    loadOperationAuditLogs,
  ]);

  function applyAnalyticsDateRange() {
    if (
      isInvalidCustomDateRange(
        analyticsRange,
        analyticsStartDate,
        analyticsEndDate,
      )
    ) {
      setAnalyticsMessage("Choose a valid analytics date range.");
      notifyWarning("Choose a valid analytics date range.");
      return;
    }

    const nextFilters = {
      range: analyticsRange,
      startDate: analyticsStartDate,
      endDate: analyticsEndDate,
    };

    setAppliedAnalyticsRange(nextFilters.range);
    setAppliedAnalyticsStartDate(nextFilters.startDate);
    setAppliedAnalyticsEndDate(nextFilters.endDate);

    void loadAnalytics(nextFilters).then((updated) => {
      if (!updated) return;
      notifyInfo(
        nextFilters.range === "custom"
          ? "Analytics updated for selected date range."
          : `Analytics updated for ${formatAnalyticsRangeLabel(nextFilters)}.`,
      );
    });
  }

  function refreshAnalyticsWithToast(): void {
    void loadAnalytics().then((updated) => {
      if (updated) notifyInfo("Analytics updated.");
    });
  }

  // Audit log loading helpers
  const loadAuditLogs = useCallback(async () => {
    if (!canManageMenu) return;

    const params = new URLSearchParams({ limit: auditLogLimit || "20" });
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
      return true;
    } catch (auditError) {
      const message =
        auditError instanceof Error
          ? auditError.message
          : "Unable to load audit logs.";
      setAuditLogsMessage(message);
      notifyError(message);
      return false;
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

  function refreshAuditLogsWithToast(): void {
    if (
      isInvalidCustomDateRange(
        auditLogRange,
        auditLogStartDate,
        auditLogEndDate,
      )
    ) {
      setAuditLogsMessage("Choose a valid audit log date range.");
      notifyWarning("Choose a valid audit log date range.");
      return;
    }

    void loadAuditLogs().then((updated) => {
      if (updated) notifyInfo("Audit logs updated.");
    });
  }

  function resetAuditLogFilters(): void {
    setAuditLogActionFilter("");
    setAuditLogTargetTypeFilter("");
    setAuditLogLimit("20");
    setAuditLogRange("all");
    setAuditLogStartDate("");
    setAuditLogEndDate("");
    setAuditLogActorFilter("");
    setAuditLogTargetIdFilter("");
    notifyInfo("Audit log filters reset.");
  }

  // Effects
  useEffect(() => {
    try {
      window.localStorage.setItem(
        tastePreferenceStorageKey,
        JSON.stringify(sanitizeTastePreferenceChips(tastePreferenceChips)),
      );
    } catch {
      // Local storage is an enhancement only; ordering still works without it.
    }
  }, [tastePreferenceChips]);

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
        await Promise.all([
          loadMenu(),
          loadCategories(),
          loadMenuBundles(),
          loadQueueSummary(),
        ]);
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
  }, [loadCategories, loadMenu, loadMenuBundles, loadQueueSummary]);

  useEffect(() => {
    if (!user) {
      setHistoryOrders([]);
      setOrderId(null);
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
    if (canManageMenu && managerTab === "menu") {
      void loadMenuBundles({ includeInactive: true }).catch((bundleError) => {
        setMenuBundleMessage(
          bundleError instanceof Error
            ? bundleError.message
            : "Unable to load bundles.",
        );
      });
    } else if (!canManageMenu) {
      setMenuBundleManagementItems([]);
    }
  }, [canManageMenu, managerTab, loadMenuBundles]);

  useEffect(() => {
    if (canViewInventory && managerTab === "inventory") {
      void loadInventory().catch((inventoryError) => {
        setInventoryMessage(
          inventoryError instanceof Error
            ? inventoryError.message
            : "Unable to load inventory.",
        );
      });
    } else if (!canViewInventory) {
      setIngredients([]);
      setInventoryImpacts([]);
      setMenuItemAvailabilityImpacts([]);
      setMenuItemIngredientLinks([]);
    }
  }, [canViewInventory, managerTab, loadInventory]);

  useEffect(() => {
    const menuItemId = Number(selectedInventoryMenuItemId);
    if (!canViewInventory || !menuItemId) {
      setMenuItemIngredientLinks([]);
      return;
    }
    void loadMenuItemIngredients(menuItemId).catch((inventoryError) => {
      setInventoryMessage(
        inventoryError instanceof Error
          ? inventoryError.message
          : "Unable to load menu item ingredients.",
      );
    });
  }, [canViewInventory, selectedInventoryMenuItemId, loadMenuItemIngredients]);

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

  const frequentItems = useMemo<FrequentMenuItem[]>(() => {
    const currentItemById = new Map(items.map((item) => [item.id, item]));
    const currentItemByGroupId = new Map<string, MenuItem>();
    for (const item of items) {
      if (item.menu_item_group_id) {
        currentItemByGroupId.set(item.menu_item_group_id, item);
      }
    }

    const statsByKey = new Map<
      string,
      {
        groupId: string | null;
        itemId: number;
        totalQuantity: number;
        orderIds: Set<number>;
        lastOrderedAt: string;
      }
    >();

    for (const order of historyOrders) {
      if (order.status === "pending" || order.status === "cancelled") continue;
      const orderedAt = order.submittedAt ?? order.createdAt;

      for (const detail of order.items) {
        const groupId =
          detail.menu_item_group_id ?? detail.item.menu_item_group_id ?? null;
        const key = groupId ? `group:${groupId}` : `item:${detail.item.id}`;
        const existing = statsByKey.get(key);
        const stat =
          existing ??
          {
            groupId,
            itemId: detail.item.id,
            totalQuantity: 0,
            orderIds: new Set<number>(),
            lastOrderedAt: orderedAt,
          };

        stat.totalQuantity += detail.qty;
        stat.orderIds.add(order.id);
        if (
          new Date(orderedAt).getTime() >
          new Date(stat.lastOrderedAt).getTime()
        ) {
          stat.lastOrderedAt = orderedAt;
        }
        statsByKey.set(key, stat);
      }
    }

    return Array.from(statsByKey.values())
      .map((stat) => {
        const currentItem =
          (stat.groupId ? currentItemByGroupId.get(stat.groupId) : undefined) ??
          currentItemById.get(stat.itemId);
        if (!currentItem?.is_available) return null;
        return {
          currentItem,
          totalQuantity: stat.totalQuantity,
          orderCount: stat.orderIds.size,
          lastOrderedAt: stat.lastOrderedAt,
        };
      })
      .filter((entry): entry is FrequentMenuItem => entry !== null)
      .sort((left, right) => {
        if (right.totalQuantity !== left.totalQuantity) {
          return right.totalQuantity - left.totalQuantity;
        }
        if (right.orderCount !== left.orderCount) {
          return right.orderCount - left.orderCount;
        }
        return (
          new Date(right.lastOrderedAt).getTime() -
          new Date(left.lastOrderedAt).getTime()
        );
      })
      .slice(0, 5);
  }, [historyOrders, items]);

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
          memberName: cartMemberNameByItemId[itemId] ?? "",
          bundle: cartBundleByItemId[itemId] ?? null,
          subtotal: item.price * qty,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [
    cartBundleByItemId,
    cartItemSnapshotsById,
    cartMemberNameByItemId,
    cartQtyByItemId,
    items,
  ]);

  const cartSubtotal = useMemo(() => {
    const bundleGroups = new Map<number, typeof cartDetails>();
    let subtotal = 0;

    for (const detail of cartDetails) {
      if (!detail.bundle) {
        subtotal += detail.subtotal;
        continue;
      }
      const group = bundleGroups.get(detail.bundle.bundleId) ?? [];
      group.push(detail);
      bundleGroups.set(detail.bundle.bundleId, group);
    }

    for (const [bundleId, details] of bundleGroups.entries()) {
      const bundle = menuBundles.find((candidate) => candidate.id === bundleId);
      if (!bundle) {
        subtotal += details.reduce((sum, detail) => sum + detail.subtotal, 0);
        continue;
      }

      const multiplier = Math.min(
        ...bundle.items.map((bundleItem) => {
          const detail = details.find(
            (candidate) => candidate.itemId === bundleItem.menuItemId,
          );
          return detail ? Math.floor(detail.qty / bundleItem.qty) : 0;
        }),
      );

      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        subtotal += details.reduce((sum, detail) => sum + detail.subtotal, 0);
        continue;
      }

      subtotal += bundle.price * multiplier;
      for (const detail of details) {
        const bundleItem = bundle.items.find(
          (candidate) => candidate.menuItemId === detail.itemId,
        );
        const bundledQty = (bundleItem?.qty ?? 0) * multiplier;
        const remainingQty = Math.max(0, detail.qty - bundledQty);
        subtotal += remainingQty * detail.item.price;
      }
    }

    return subtotal;
  }, [cartDetails, menuBundles]);

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

  const walkInOrderTotal = useMemo(() => {
    const bundleGroups = new Map<number, typeof walkInOrderDetails>();
    let subtotal = 0;

    for (const detail of walkInOrderDetails) {
      if (!detail.bundleId) {
        subtotal += detail.subtotal;
        continue;
      }
      const group = bundleGroups.get(detail.bundleId) ?? [];
      group.push(detail);
      bundleGroups.set(detail.bundleId, group);
    }

    for (const [bundleId, details] of bundleGroups.entries()) {
      const bundle = menuBundles.find((candidate) => candidate.id === bundleId);
      if (!bundle) {
        subtotal += details.reduce((sum, detail) => sum + detail.subtotal, 0);
        continue;
      }

      const multiplier = Math.min(
        ...bundle.items.map((bundleItem) => {
          const detail = details.find(
            (candidate) => candidate.itemId === bundleItem.menuItemId,
          );
          return detail ? Math.floor(detail.qty / bundleItem.qty) : 0;
        }),
      );

      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        subtotal += details.reduce((sum, detail) => sum + detail.subtotal, 0);
        continue;
      }

      subtotal += bundle.price * multiplier;
      for (const detail of details) {
        const bundleItem = bundle.items.find(
          (candidate) => candidate.menuItemId === detail.itemId,
        );
        const bundledQty = (bundleItem?.qty ?? 0) * multiplier;
        const remainingQty = Math.max(0, detail.qty - bundledQty);
        subtotal += remainingQty * detail.item.price;
      }
    }

    return subtotal;
  }, [menuBundles, walkInOrderDetails]);

  const menuItemAvailabilityImpactById = useMemo(
    () =>
      new Map(
        menuItemAvailabilityImpacts.map((impact) => [
          impact.menuItemId,
          impact,
        ]),
      ),
    [menuItemAvailabilityImpacts],
  );

  function appendNoteText(current: string, addition: string): string {
    const trimmedCurrent = current.trim();
    const trimmedAddition = addition.trim();
    if (!trimmedAddition) return trimmedCurrent;
    if (!trimmedCurrent) return trimmedAddition;
    if (trimmedCurrent.includes(trimmedAddition)) return trimmedCurrent;
    return `${trimmedCurrent}；${trimmedAddition}`;
  }

  function applyTastePreferenceChip(target: "checkout" | "staff", chip: string): void {
    const currentNote =
      target === "checkout"
        ? checkoutForm.customerNote
        : walkInOrderForm.customerNote;
    const nextNote = appendNoteText(currentNote, chip);

    if (nextNote === currentNote.trim()) {
      notifyInfo("Preference already added.");
      return;
    }

    if (target === "checkout") {
      setCheckoutForm((current) => ({
        ...current,
        customerNote: nextNote,
      }));
    } else {
      setWalkInOrderForm((current) => ({
        ...current,
        customerNote: nextNote,
      }));
    }

    notifyInfo(`Added ${chip} to note.`);
  }

  function addTastePreferenceChip(): void {
    const trimmedChip = newTastePreferenceChip
      .trim()
      .slice(0, maxTastePreferenceChipLength);

    if (!trimmedChip) {
      notifyWarning("Enter a shortcut first.");
      return;
    }

    const normalizedChip = trimmedChip.toLocaleLowerCase();
    const alreadyExists = tastePreferenceChips.some(
      (chip) => chip.toLocaleLowerCase() === normalizedChip,
    );

    if (alreadyExists) {
      notifyWarning("This shortcut already exists.");
      return;
    }

    if (tastePreferenceChips.length >= maxTastePreferenceChips) {
      notifyWarning("Shortcut limit reached.");
      return;
    }

    setTastePreferenceChips((currentChips) =>
      sanitizeTastePreferenceChips([...currentChips, trimmedChip]),
    );
    setNewTastePreferenceChip("");
    notifySuccess("Preference shortcut added.");
  }

  function removeTastePreferenceChip(chipToRemove: string): void {
    setTastePreferenceChips((currentChips) =>
      sanitizeTastePreferenceChips(
        currentChips.filter((chip) => chip !== chipToRemove),
      ),
    );
    notifyInfo("Preference shortcut removed.");
  }

  function resetTastePreferenceChips(): void {
    setTastePreferenceChips(defaultTastePreferenceChips);
    setNewTastePreferenceChip("");
    notifyInfo("Preference shortcuts reset.");
  }

  function renderTastePreferencePanel(
    target: "checkout" | "staff",
    options: { collapsed?: boolean; compact?: boolean } = {},
  ) {
    const visibleChips = options.compact
      ? tastePreferenceChips.slice(0, 6)
      : tastePreferenceChips;
    const hiddenChips = options.compact ? tastePreferenceChips.slice(6) : [];
    const chipGapClass = options.compact ? "gap-1" : "gap-1.5";
    const panelPaddingClass = options.compact ? "p-2" : "p-3";
    const textSizeClass = options.compact ? "text-xs" : "text-sm";
    const chipButtons = (chips: string[], showRemove: boolean) => (
      <div className={`flex flex-wrap ${chipGapClass}`}>
        {chips.map((chip) => (
          <span key={chip} className="inline-flex items-center gap-1">
            <button
              className="btn btn-xs btn-outline"
              type="button"
              onClick={() => applyTastePreferenceChip(target, chip)}
            >
              {chip}
            </button>
            {showRemove ? (
              <button
                className="btn btn-xs btn-ghost px-1"
                type="button"
                aria-label={`Remove ${chip}`}
                onClick={() => removeTastePreferenceChip(chip)}
              >
                x
              </button>
            ) : null}
          </span>
        ))}
      </div>
    );
    const manageShortcuts = (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            className="input input-bordered input-xs min-w-40 flex-1"
            maxLength={maxTastePreferenceChipLength}
            placeholder="新增快速備註，例如：不加美乃滋"
            value={newTastePreferenceChip}
            onChange={(event) => setNewTastePreferenceChip(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTastePreferenceChip();
              }
            }}
          />
          <button
            className="btn btn-xs btn-outline"
            type="button"
            onClick={addTastePreferenceChip}
          >
            Add
          </button>
          <button
            className="btn btn-xs btn-ghost"
            type="button"
            onClick={resetTastePreferenceChips}
          >
            重設預設
          </button>
        </div>
        {options.compact ? (
          <div className={`flex flex-wrap ${chipGapClass}`}>
            {tastePreferenceChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center gap-1 rounded-box bg-base-100 px-2 py-1"
              >
                <span>{chip}</span>
                <button
                  className="btn btn-xs btn-ghost min-h-0 h-5 px-1"
                  type="button"
                  aria-label={`Remove ${chip}`}
                  onClick={() => removeTastePreferenceChip(chip)}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
    const content = (
      <div className={`${options.compact ? "space-y-1.5" : "space-y-2"}`}>
        <p className="text-xs opacity-70">
          點選快速備註可加入訂單備註。這些設定只會保存在這台瀏覽器。
        </p>
        {visibleChips.length > 0 ? (
          chipButtons(visibleChips, !options.compact)
        ) : (
          <p className="text-xs opacity-60">No shortcuts yet.</p>
        )}
        {options.compact && hiddenChips.length > 0 ? (
          <details className="rounded-box bg-base-100 px-2 py-1">
            <summary className="cursor-pointer text-xs font-semibold">
              更多快速備註
            </summary>
            <div className="mt-2">{chipButtons(hiddenChips, false)}</div>
          </details>
        ) : null}
        {options.compact ? (
          <details className="rounded-box bg-base-100 px-2 py-1">
            <summary className="cursor-pointer text-xs font-semibold">
              管理快速備註
            </summary>
            <div className="mt-2">{manageShortcuts}</div>
          </details>
        ) : (
          manageShortcuts
        )}
      </div>
    );

    if (options.collapsed) {
      return (
        <details
          className={`rounded-box border border-base-300 bg-base-200 ${panelPaddingClass} ${textSizeClass}`}
        >
          <summary className="cursor-pointer font-semibold">
            口味偏好{" "}
            {options.compact ? (
              <span className="ml-1 font-normal opacity-60">快速備註</span>
            ) : null}
          </summary>
          <div className={options.compact ? "mt-1.5" : "mt-2"}>{content}</div>
        </details>
      );
    }

    return (
      <div
        className={`rounded-box border border-base-300 bg-base-200 ${panelPaddingClass} ${textSizeClass}`}
      >
        <h4 className="text-sm font-semibold">口味偏好</h4>
        {content}
      </div>
    );
  }

  function renderPromotionEligibilityHint(
    promoCode: string,
    subtotal: number,
    options: { compact?: boolean } = {},
  ) {
    const normalizedCode = promoCode.trim().toUpperCase();
    if (!normalizedCode) return null;

    const promotion = promotions.find(
      (candidate) => candidate.code.trim().toUpperCase() === normalizedCode,
    );

    if (!promotion) {
      return (
        <div className={`${options.compact ? "mt-1" : "mt-2"} text-xs text-warning`}>
          Promo code will be checked when you submit.
        </div>
      );
    }

    const usedCount = promotionUsageCounts[promotion.code.trim().toUpperCase()] ?? 0;
    const runtimeStatus = getPromotionRuntimeStatus(promotion, usedCount);
    const ruleSummary = formatPromotionRuleSummary(promotion, usedCount);
    const missingMinimum = Math.max(0, promotion.minOrderAmount - subtotal);
    const hasBlockingRule =
      missingMinimum > 0 ||
      runtimeStatus === "scheduled" ||
      runtimeStatus === "expired" ||
      runtimeStatus === "usage_full" ||
      runtimeStatus === "inactive";

    let helperText = "This promo looks available for this cart.";
    if (missingMinimum > 0) {
      helperText = `Add $${missingMinimum} more to use this promo.`;
    } else if (runtimeStatus === "scheduled") {
      helperText = "This promo has not started yet.";
    } else if (runtimeStatus === "expired") {
      helperText = "This promo has expired.";
    } else if (runtimeStatus === "usage_full") {
      helperText = "This promo has reached its usage limit.";
    } else if (runtimeStatus === "inactive") {
      helperText = "This promo is inactive.";
    }

    return (
      <div
        className={`${options.compact ? "mt-1 p-2" : "mt-2 p-3"} rounded-box border text-xs ${
          hasBlockingRule
            ? "border-warning bg-warning/10"
            : "border-success bg-success/10"
        }`}
      >
        <div className={`${options.compact ? "" : "mb-2"} flex flex-wrap items-center gap-2`}>
          <span
            className={`badge badge-sm ${getPromotionRuntimeStatusBadgeClass(
              runtimeStatus,
            )}`}
          >
            {getPromotionRuntimeStatusLabel(runtimeStatus)}
          </span>
          <span className={hasBlockingRule ? "text-warning" : "text-success"}>
            {helperText}
          </span>
        </div>
        {options.compact ? (
          <details className="mt-1">
            <summary className="cursor-pointer opacity-70">
              View promo rules
            </summary>
            <ul className="mt-1 list-disc space-y-1 pl-4 opacity-80">
              {ruleSummary.map((summary) => (
                <li key={summary}>{summary}</li>
              ))}
            </ul>
          </details>
        ) : (
          <ul className="list-disc space-y-1 pl-4 opacity-80">
            {ruleSummary.map((summary) => (
              <li key={summary}>{summary}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

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
      if (user) {
        await Promise.all([loadMenu(), loadCurrentOrder()]);
      } else {
        await loadMenu();
      }
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
    } catch (signInError) {
      const message = "Google 登入失敗，請稍後再試，或使用測試帳號登入。";
      setAuthError(message);
      notifyError(message);
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
      notifySuccess("Demo login successful.");
    } catch (demoError) {
      const message =
        demoError instanceof Error ? demoError.message : "Demo login failed.";
      setDemoAuthError(message);
      notifyError(message);
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
      notifyInfo("Signed out.");
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
        const message = `Sign out failed: ${await readApiError(res)}`;
        setActionError(message);
        notifyError("Sign out failed. Please try again.");
        return;
      }
    } catch {
      setActionError("Sign out failed. Please try again.");
      notifyError("Sign out failed. Please try again.");
      return;
    }
    setUser(null);
    setAuthError("");
    setActionError("");
    setRoleRequestMessage("");
    setAdminRequests([]);
    resetCartState();
    notifyInfo("Signed out.");
  }

  async function addToCart(
    item: MenuItem,
    successMessage?: string,
  ): Promise<void> {
    setActionError("");
    setActiveItemId(item.id);

    try {
      if (!user) {
        if (!item.is_available) {
          throw new Error("This item is sold out.");
        }

        const currentQty = cartQtyByItemId[item.id] ?? 0;
        const nextQty = Math.min(99, currentQty + 1);
        if (nextQty === currentQty) {
          throw new Error("Cart quantity is already at the maximum.");
        }

        setCartQtyByItemId((current) => ({
          ...current,
          [item.id]: nextQty,
        }));
        setCartItemSnapshotsById((current) => ({
          ...current,
          [item.id]: item,
        }));
        setLastGuestOrder(null);
        setIsCartOpen(true);
        notifySuccess(
          successMessage ?? `Added ${item.name} to cart. Cart quantity: ${nextQty}.`,
        );
        return;
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
        notifySuccess(
          successMessage ?? `Added ${item.name} to cart. Cart quantity: ${nextQty}.`,
        );
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
          notifySuccess(
            successMessage ??
              `Added ${item.name} to cart. Cart quantity: ${retryQty}.`,
          );
          return;
        }

        throw firstTryError;
      }
    } catch (cartError) {
      if (
        cartError instanceof Error &&
        cartError.message.startsWith("Auth expired:")
      ) {
        notifyError("Your session expired. Please sign in again.");
        return;
      }

      const message =
        cartError instanceof Error ? cartError.message : "Unable to update cart.";
      if (isMenuVersionChangedMessage(message)) {
        await refreshMenuAndCurrentOrderAfterVersionConflict(message);
        notifyWarning("Menu changed. Please refresh your cart.");
      } else {
        setActionError(message);
        notifyError(message);
      }
      console.error(cartError);
    } finally {
      setActiveItemId(null);
    }
  }

  async function updateCartItemQty(itemId: number, qty: number): Promise<void> {
    setActionError("");
    setCartBusyItemId(itemId);
    try {
      if (!user) {
        const currentQty = cartQtyByItemId[itemId] ?? 0;
        const nextQty = Math.max(0, Math.min(99, qty));
        const currentItem =
          items.find((item) => item.id === itemId) ??
          cartItemSnapshotsById[itemId];

        if (!currentItem) {
          throw new Error("Menu item not found.");
        }

        if (!currentItem.is_available && nextQty > currentQty) {
          throw new Error("This item is sold out.");
        }

        if (nextQty === 0) {
          setCartQtyByItemId((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          setCartItemSnapshotsById((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          setCartMemberNameByItemId((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          setCartBundleByItemId((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          notifySuccess("Item removed from cart.");
          return;
        }

        setCartQtyByItemId((current) => ({
          ...current,
          [itemId]: nextQty,
        }));
        setCartItemSnapshotsById((current) => ({
          ...current,
          [itemId]: currentItem,
        }));
        notifySuccess("Cart quantity updated.");
        return;
      }

      const targetOrderId = await ensureOrder();
      const updatedOrder = await patchOrderItemQty(
        targetOrderId,
        itemId,
        Math.max(0, qty),
      );
      syncCartFromOrder(updatedOrder);
      notifySuccess(qty > 0 ? "Cart quantity updated." : "Item removed from cart.");
    } catch (cartError) {
      if (
        cartError instanceof Error &&
        cartError.message.startsWith("Auth expired:")
      ) {
        notifyError("Your session expired. Please sign in again.");
        return;
      }

      const message =
        cartError instanceof Error ? cartError.message : "Unable to update cart.";
      setActionError(message);
      if (
        cartError instanceof Error &&
        isMenuVersionChangedMessage(cartError.message)
      ) {
        await refreshMenuAndCurrentOrderAfterVersionConflict(cartError.message);
        notifyWarning("Menu changed. Please refresh your cart.");
      } else {
        notifyError(message);
      }
      console.error(cartError);
    } finally {
      setCartBusyItemId(null);
    }
  }

  async function reorderPreviousOrder(order: Order): Promise<void> {
    if (!user) {
      notifyWarning("Please sign in first.");
      return;
    }

    if (order.items.length === 0) {
      notifyWarning("This order has no items to reorder.");
      return;
    }

    setReorderingOrderId(order.id);
    setReorderMessage("");
    setActionError("");

    try {
      const currentItemById = new Map(items.map((item) => [item.id, item]));
      const currentItemByGroupId = new Map<string, MenuItem>();
      for (const item of items) {
        if (item.menu_item_group_id) {
          currentItemByGroupId.set(item.menu_item_group_id, item);
        }
      }

      const targetOrderId = await ensureOrder();
      const nextQtyByItemId = new Map<number, number>(
        Object.entries(cartQtyByItemId).map(([itemId, qty]) => [
          Number(itemId),
          qty,
        ]),
      );
      const addedItems: string[] = [];
      const skippedItems: string[] = [];
      const priceChangedItems: string[] = [];

      for (const detail of order.items) {
        const groupId =
          detail.menu_item_group_id ?? detail.item.menu_item_group_id ?? null;
        const currentItem =
          (groupId ? currentItemByGroupId.get(groupId) : undefined) ??
          currentItemById.get(detail.item.id);

        if (!currentItem) {
          skippedItems.push(`${detail.item.name} is no longer on the menu.`);
          continue;
        }

        if (!currentItem.is_available) {
          skippedItems.push(`${currentItem.name} is sold out.`);
          continue;
        }

        const requestedQty = Math.max(1, Math.min(99, detail.qty));
        const currentQty = nextQtyByItemId.get(currentItem.id) ?? 0;
        const nextQty = Math.min(99, currentQty + requestedQty);
        const addedQty = nextQty - currentQty;

        if (addedQty <= 0) {
          skippedItems.push(`${currentItem.name} is already at the maximum quantity.`);
          continue;
        }

        if (currentItem.price !== detail.item.price) {
          priceChangedItems.push(
            `${currentItem.name}: $${detail.item.price} -> $${currentItem.price}`,
          );
        }

        if (addedQty < requestedQty) {
          skippedItems.push(`${currentItem.name} quantity was capped at 99.`);
        }

        try {
          const updatedOrder = await patchOrderItemQty(
            targetOrderId,
            currentItem.id,
            nextQty,
          );
          syncCartFromOrder(updatedOrder);
          nextQtyByItemId.set(currentItem.id, nextQty);
          addedItems.push(`${currentItem.name} x ${addedQty}`);
        } catch (reorderItemError) {
          const message =
            reorderItemError instanceof Error
              ? reorderItemError.message
              : "Unable to reorder item.";
          if (isMenuVersionChangedMessage(message)) {
            await refreshMenuAndCurrentOrderAfterVersionConflict(message);
            notifyWarning("Menu changed. Please refresh your cart.");
          }
          throw reorderItemError;
        }
      }

      await loadCurrentOrder();

      const summaryParts: string[] = [];
      if (addedItems.length > 0) {
        summaryParts.push(
          `Added ${addedItems.length} item(s) from order ${formatPickupNumber(
            order.id,
          )} to your cart.`,
        );
      }
      if (skippedItems.length > 0) {
        summaryParts.push(`Skipped: ${skippedItems.join(" ")}`);
      }
      if (priceChangedItems.length > 0) {
        summaryParts.push(`Price changed: ${priceChangedItems.join(" ")}`);
      }
      setReorderMessage(summaryParts.join("\n"));

      if (addedItems.length > 0) {
        setIsCartOpen(true);
        notifySuccess(`Reordered ${addedItems.length} item(s).`);
      } else {
        notifyWarning("No items could be reordered. Please choose from the current menu.");
      }
      if (priceChangedItems.length > 0) {
        notifyWarning("Some reordered items have current menu prices.");
      }
      if (skippedItems.length > 0) {
        notifyWarning("Some items could not be reordered.");
      }
    } catch (reorderError) {
      const message =
        reorderError instanceof Error
          ? reorderError.message
          : "Unable to reorder this order.";
      if (isMenuVersionChangedMessage(message)) {
        setActionError(message);
      } else {
        setActionError(message);
        notifyError(message);
      }
      console.error(reorderError);
    } finally {
      setReorderingOrderId(null);
    }
  }

  async function clearCart(): Promise<void> {
    if (cartDetails.length === 0) return;
    if (!window.confirm("Clear all items from cart?")) return;

    setActionError("");
    setIsClearingCart(true);

    try {
      if (!user) {
        setCartQtyByItemId({});
        setCartItemSnapshotsById({});
        setCartMemberNameByItemId({});
        setCartBundleByItemId({});
        setCartTotal(0);
        notifySuccess("Cart cleared.");
        return;
      }

      if (orderId === null) return;

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
      setCartMemberNameByItemId({});
      setCartBundleByItemId({});
      setCartTotal(0);
      notifySuccess("Cart cleared.");
    } catch (clearError) {
      const message =
        clearError instanceof Error ? clearError.message : "Unable to clear cart.";
      setActionError(message);
      notifyError(message);
      console.error(clearError);
    } finally {
      setIsClearingCart(false);
    }
  }

  async function submitGuestOrder(): Promise<void> {
    if (cartDetails.length === 0) return;

    const guestName = guestCheckoutForm.guestName.trim();
    const guestPhone = guestCheckoutForm.guestPhone.trim();
    if (!guestName) {
      setActionError("Guest name is required.");
      notifyWarning("Enter a guest name before checkout.");
      return;
    }
    if (!guestPhone) {
      setActionError("Guest phone is required.");
      notifyWarning("Enter a guest phone number before checkout.");
      return;
    }

    setActionError("");
    setIsSubmittingOrder(true);

    try {
      const response = await fetch(buildApiUrl("/api/orders/guest"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName,
          guestPhone,
          items: cartDetails.map((detail) => ({
            itemId: detail.itemId,
            qty: detail.qty,
            menuItemVersion: detail.item.version,
            memberName: detail.memberName.trim() || null,
            bundleId: detail.bundle?.bundleId ?? null,
            bundleName: detail.bundle?.bundleName ?? null,
          })),
          fulfillmentType: checkoutForm.fulfillmentType,
          customerNote: checkoutForm.customerNote.trim() || null,
          pickupTime: checkoutForm.pickupTime
            ? new Date(checkoutForm.pickupTime).toISOString()
            : null,
          paymentMethod: checkoutForm.paymentMethod,
          promoCode: checkoutForm.promoCode.trim() || null,
          isGroupOrder: checkoutForm.isGroupOrder,
          groupName: checkoutForm.groupName.trim() || null,
          contactName: checkoutForm.contactName.trim() || null,
          contactPhone: checkoutForm.contactPhone.trim() || null,
        }),
      });

      if (!response.ok) {
        const details = await readApiErrorDetails(response);
        throw new Error(`Submit guest order failed: ${formatApiErrorDetails(details)}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const submittedOrder = payload?.data;
      if (!submittedOrder) {
        throw new Error("Submit guest order failed: invalid payload");
      }

      resetCartState();
      setCheckoutForm(emptyCheckoutForm);
      setGuestCheckoutForm(emptyGuestCheckoutForm);
      setLastGuestOrder(submittedOrder);
      await loadQueueSummary();
      setStatusMessage(
        `訪客訂單已送出。取餐編號：${formatPickupNumber(
          submittedOrder.id,
        )}.`,
      );
      notifySuccess(
        `訪客訂單已送出。取餐編號：${formatPickupNumber(
          submittedOrder.id,
        )}.`,
      );
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit guest order.";
      if (isMenuVersionChangedMessage(message)) {
        await refreshMenuAndCurrentOrderAfterVersionConflict(message);
        notifyWarning("Menu changed. Please refresh your cart.");
      } else {
        setActionError(message);
        notifyError(getCheckoutErrorToastMessage(message));
      }
      console.error(submitError);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function lookupGuestOrder(
    override?: { pickupNumber: string; guestPhone: string },
  ): Promise<void> {
    const pickupNumber = (override?.pickupNumber ?? guestLookupForm.pickupNumber).trim();
    const guestPhone = (override?.guestPhone ?? guestLookupForm.guestPhone).trim();

    if (!pickupNumber || !guestPhone) {
      setGuestLookupMessage("請輸入取餐編號與電話號碼。");
      notifyWarning("請輸入取餐編號與電話號碼。");
      return;
    }

    setGuestLookupLoading(true);
    setGuestLookupMessage("");

    try {
      const response = await fetch(buildApiUrl("/api/orders/guest/lookup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupNumber, guestPhone }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const order = payload?.data;
      if (!order) {
        throw new Error("Guest order lookup failed: invalid payload");
      }

      setGuestLookupOrder(order);
      setGuestLookupMessage("");
      notifySuccess("已找到訪客訂單。");
    } catch (lookupError) {
      const message =
        "查無訪客訂單，請確認取餐編號與電話號碼。";
      setGuestLookupOrder(null);
      setGuestLookupMessage(message);
      notifyError(message);
      console.error(lookupError);
    } finally {
      setGuestLookupLoading(false);
    }
  }

  async function submitOrder(): Promise<void> {
    if (cartDetails.length === 0) return;
    if (!user) {
      await submitGuestOrder();
      return;
    }
    if (orderId === null) return;

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
            isGroupOrder: checkoutForm.isGroupOrder,
            groupName: checkoutForm.groupName.trim() || null,
            contactName: checkoutForm.contactName.trim() || null,
            contactPhone: checkoutForm.contactPhone.trim() || null,
            itemCustomizations: cartDetails.map((detail) => ({
              itemId: detail.itemId,
              memberName: detail.memberName.trim() || null,
              bundleId: detail.bundle?.bundleId ?? null,
              bundleName: detail.bundle?.bundleName ?? null,
            })),
          }),
        },
      );

      if (!response.ok) {
        const details = await readApiErrorDetails(response);
        throw new Error(`Submit order failed: ${formatApiErrorDetails(details)}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const submittedOrder = payload?.data;
      resetCartState();
      setCheckoutForm(emptyCheckoutForm);
      setIsCartOpen(false);
      await loadOrderHistory();
      setStatusMessage(
        "訂單已送出，請到我的訂單查看取餐編號、付款狀態與收據。",
      );
      notifySuccess(
        submittedOrder
          ? `訂單已送出。取餐編號：${formatPickupNumber(
              submittedOrder.id,
            )}.`
          : "訂單已送出，請到我的訂單查看取餐編號與收據。",
      );
      ordersSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit order.";
      if (isMenuVersionChangedMessage(message)) {
        await refreshMenuAndCurrentOrderAfterVersionConflict(message);
        notifyWarning("菜單已更新，請重新整理購物車。");
      } else {
        setActionError(message);
        notifyError(getCheckoutErrorToastMessage(message));
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
      highlightOrder(updatedOrder.id);
      notifySuccess(
        `Order ${formatPickupNumber(updatedOrder.id)} moved to ${
          updatedOrder.status
        }.`,
      );
      await loadQueueSummary();

      if (canManageMenu) {
        await loadAnalytics();
      }
    } catch (statusError) {
      const message =
        statusError instanceof Error
          ? statusError.message
          : "Unable to update order status.";
      setStatusMessage(message);
      notifyError(message);
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
      highlightOrder(updatedOrder.id);
      notifySuccess(`Order ${formatPickupNumber(updatedOrder.id)} marked as paid.`);
    } catch (paymentError) {
      const message =
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to update payment status.";
      setStatusMessage(message);
      notifyError(message);
    } finally {
      setPaymentUpdatingOrderId(null);
    }
  }

  async function cancelOrder(
    targetOrderId: number,
    context: "customer" | "manager" = "customer",
  ): Promise<void> {
    if (
      context === "manager" &&
      !window.confirm(
        `確定要作廢訂單 ${formatPickupNumber(targetOrderId)} 嗎？此操作無法復原。`,
      )
    ) {
      return;
    }

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
      highlightOrder(updatedOrder.id);
      notifySuccess(
        context === "manager"
          ? `Order ${formatPickupNumber(updatedOrder.id)} voided.`
          : `Order ${formatPickupNumber(updatedOrder.id)} cancelled.`,
      );
      await loadQueueSummary();

      if (canManageMenu) {
        await loadAnalytics();
      }
    } catch (cancelError) {
      const message =
        cancelError instanceof Error
          ? cancelError.message
          : "Unable to cancel order.";
      setStatusMessage(message);
      notifyError(message);
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
      highlightOrder(updatedOrder.id);
      notifySuccess(`Issue added to order ${formatPickupNumber(updatedOrder.id)}.`);
    } catch (issueError) {
      const message =
        issueError instanceof Error
          ? issueError.message
          : "Unable to update order issue.";
      setStatusMessage(message);
      notifyError(message);
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
      highlightOrder(updatedOrder.id);
      notifySuccess(
        `Issue cleared for order ${formatPickupNumber(updatedOrder.id)}.`,
      );
    } catch (issueError) {
      const message =
        issueError instanceof Error
          ? issueError.message
          : "Unable to clear order issue.";
      setStatusMessage(message);
      notifyError(message);
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
      notifyWarning("Choose a rating from 1 to 5.");
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
      notifySuccess("Rating saved.");
    } catch (ratingError) {
      const message =
        ratingError instanceof Error
          ? ratingError.message
          : "Unable to update rating.";
      setStatusMessage(message);
      notifyError(message);
    } finally {
      setRatingUpdatingOrderId(null);
    }
  }

  function addWalkInItem() {
    const itemId = Number(walkInSelectedItemId);
    const qty = Number(walkInQty);
    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      setStatusMessage("Select a menu item and quantity first.");
      notifyWarning("Select a menu item and quantity first.");
      return;
    }
    const selectedItem = items.find((item) => item.id === itemId);
    if (!selectedItem?.is_available) {
      setStatusMessage("This item is sold out.");
      notifyWarning("This item is sold out.");
      return;
    }

    const existingItem = walkInOrderItems.find((item) => item.itemId === itemId);
    setWalkInOrderItems((currentItems) => {
      const existing = currentItems.find((item) => item.itemId === itemId);
      if (existing) {
        return currentItems.map((item) =>
          item.itemId === itemId ? { ...item, qty: item.qty + qty } : item,
        );
      }
      return [
        ...currentItems,
        { itemId, qty, menuItemVersion: selectedItem.version },
      ];
    });
    notifyInfo(
      existingItem
        ? `Updated ${selectedItem.name} quantity in staff order.`
        : `Added ${selectedItem.name} to staff order.`,
    );
    setWalkInSelectedItemId("");
    setWalkInQty("1");
  }

  function removeWalkInItem(itemId: number) {
    setWalkInOrderItems((currentItems) =>
      currentItems.filter((item) => item.itemId !== itemId),
    );
    notifyInfo("Removed item from staff order.");
  }

  function addWalkInBundle(bundle: MenuBundle) {
    const availableItems = bundle.items.filter((entry) => entry.item?.is_available);
    if (availableItems.length === 0) {
      setStatusMessage("This bundle has no available items.");
      notifyWarning("This bundle has no available items.");
      return;
    }

    setWalkInOrderItems((currentItems) => {
      const nextItems = [...currentItems];
      for (const entry of availableItems) {
        if (!entry.item) continue;
        const existingIndex = nextItems.findIndex(
          (item) => item.itemId === entry.menuItemId,
        );
        if (existingIndex >= 0) {
          nextItems[existingIndex] = {
            ...nextItems[existingIndex],
            qty: Math.min(99, nextItems[existingIndex].qty + entry.qty),
            bundleId: bundle.id,
            bundleName: bundle.name,
          };
        } else {
          nextItems.push({
            itemId: entry.menuItemId,
            qty: entry.qty,
            menuItemVersion: entry.item.version,
            bundleId: bundle.id,
            bundleName: bundle.name,
          });
        }
      }
      return nextItems;
    });
    notifyInfo(`Added ${bundle.name} to staff order.`);
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
          isGroupOrder: walkInOrderForm.isGroupOrder,
          groupName: walkInOrderForm.groupName.trim() || null,
          contactName: walkInOrderForm.contactName.trim() || null,
          contactPhone: walkInOrderForm.contactPhone.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const createdOrder = payload?.data;
      await loadOrderHistory();
      setWalkInOrderForm(emptyWalkInOrderForm);
      setWalkInOrderItems([]);
      setWalkInSelectedItemId("");
      setWalkInQty("1");
      const createdPickupNumber = createdOrder
        ? ` ${formatPickupNumber(createdOrder.id)}`
        : "";
      setStatusMessage(
        walkInOrderForm.orderSource === "phone"
          ? `Phone order${createdPickupNumber} created. Track it in Orders board and call the guest if pickup time changes.`
          : `Walk-in order${createdPickupNumber} created. Track it in Orders board.`,
      );
      if (createdOrder) {
        highlightOrder(createdOrder.id);
      }
      notifySuccess(
        walkInOrderForm.orderSource === "phone"
          ? `Phone order${createdPickupNumber} created.`
          : `Walk-in order${createdPickupNumber} created.`,
      );
    } catch (walkInError) {
      const message =
        walkInError instanceof Error
          ? walkInError.message
          : "Unable to create walk-in order.";
      if (isMenuVersionChangedMessage(message)) {
        await refreshMenuAfterWalkInVersionConflict(message);
        notifyWarning("Menu changed. Please refresh menu.");
      } else {
        setStatusMessage(message);
        notifyError(
          message.toLowerCase().includes("phone")
            ? "電話號碼格式不正確，可使用數字、空格、+、- 或括號。"
            : getCheckoutErrorToastMessage(message),
        );
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
      const history = Array.isArray(payload?.data) ? payload.data : [];
      setMenuHistoryByItemId((currentHistory) => ({
        ...currentHistory,
        [item.id]: history,
      }));
      if (history.length > 0) {
        notifyInfo(`Loaded version history for ${item.name}.`);
      }
    } catch (historyError) {
      const message =
        historyError instanceof Error
          ? historyError.message
          : "Unable to load menu history.";
      setMenuMessage(message);
      notifyError(message);
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
      notifyWarning("Display order must be a non-negative number.");
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
      highlightMenuItem(updated.id);
      notifySuccess("Display order updated.");
    } catch (displayOrderError) {
      const message =
        displayOrderError instanceof Error
          ? displayOrderError.message
          : "Unable to update display order.";
      setMenuMessage(message);
      notifyError(message);
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

  function getInventoryStatusLabel(status: InventoryImpact["status"]) {
    if (status === "out_of_stock") return "已缺料";
    if (status === "low_stock") return "庫存偏低";
    return "正常";
  }

  function getInventoryStatusBadgeClass(status: InventoryImpact["status"]) {
    if (status === "out_of_stock") return "badge badge-error";
    if (status === "low_stock") return "badge badge-warning";
    return "badge badge-success";
  }

  function startEditIngredient(ingredient: Ingredient) {
    setEditingIngredientId(ingredient.id);
    setIngredientForm({
      name: ingredient.name,
      unit: ingredient.unit,
      currentStock: String(ingredient.currentStock),
      safetyStock: String(ingredient.safetyStock),
    });
    setInventoryMessage("");
  }

  function resetIngredientForm() {
    setEditingIngredientId(null);
    setIngredientForm({
      name: "",
      unit: "unit",
      currentStock: "0",
      safetyStock: "0",
    });
  }

  async function submitIngredientForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageMenu) return;
    setInventoryBusy(true);
    setInventoryMessage("");
    try {
      const response = await fetch(
        buildApiUrl(
          editingIngredientId
            ? `/api/ingredients/${editingIngredientId}`
            : "/api/ingredients",
        ),
        {
          method: editingIngredientId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: ingredientForm.name.trim(),
            unit: ingredientForm.unit.trim() || "unit",
            currentStock: Number(ingredientForm.currentStock || 0),
            safetyStock: Number(ingredientForm.safetyStock || 0),
          }),
        },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      setInventoryMessage(
        editingIngredientId ? "Ingredient updated." : "Ingredient created.",
      );
      notifySuccess(
        editingIngredientId ? "Ingredient updated." : "Ingredient created.",
      );
      resetIngredientForm();
      await Promise.all([loadInventory(), loadAnalytics()]);
    } catch (ingredientError) {
      const message =
        ingredientError instanceof Error
          ? ingredientError.message
          : "Ingredient update failed.";
      setInventoryMessage(message);
      notifyError(message);
    } finally {
      setInventoryBusy(false);
    }
  }

  async function adjustIngredientStock(ingredient: Ingredient, delta: number) {
    setInventoryBusy(true);
    setInventoryMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/ingredients/${ingredient.id}/stock`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ delta }),
        },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      setInventoryMessage("Stock adjusted.");
      notifySuccess("Stock adjusted.");
      await Promise.all([loadInventory(), loadAnalytics()]);
    } catch (stockError) {
      const message =
        stockError instanceof Error ? stockError.message : "Stock update failed.";
      setInventoryMessage(message);
      notifyError(message);
    } finally {
      setInventoryBusy(false);
    }
  }

  function addIngredientMappingDraft() {
    const ingredientId = Number(ingredientDraftId);
    const quantityPerItem = Number(ingredientDraftQty);
    if (!ingredientId || !Number.isInteger(quantityPerItem) || quantityPerItem <= 0) {
      setInventoryMessage("Select an ingredient and quantity first.");
      return;
    }
    const ingredient = ingredients.find((candidate) => candidate.id === ingredientId);
    if (!ingredient) return;
    setMenuItemIngredientLinks((currentLinks) => {
      const existingIndex = currentLinks.findIndex(
        (link) => link.ingredientId === ingredientId,
      );
      if (existingIndex === -1) {
        return [
          ...currentLinks,
          {
            menuItemId: Number(selectedInventoryMenuItemId),
            ingredientId,
            quantityPerItem,
            ingredient,
          },
        ];
      }
      return currentLinks.map((link, index) =>
        index === existingIndex
          ? { ...link, quantityPerItem, ingredient }
          : link,
      );
    });
    setIngredientDraftId("");
    setIngredientDraftQty("1");
  }

  function removeIngredientMappingDraft(ingredientId: number) {
    setMenuItemIngredientLinks((currentLinks) =>
      currentLinks.filter((link) => link.ingredientId !== ingredientId),
    );
  }

  async function saveMenuItemIngredientMapping() {
    if (!canManageMenu) return;
    const menuItemId = Number(selectedInventoryMenuItemId);
    if (!menuItemId) {
      setInventoryMessage("Select a menu item first.");
      return;
    }
    setInventoryBusy(true);
    setInventoryMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/menu/${menuItemId}/ingredients`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ingredients: menuItemIngredientLinks.map((link) => ({
              ingredientId: link.ingredientId,
              quantityPerItem: link.quantityPerItem,
            })),
          }),
        },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      setInventoryMessage("Menu item ingredients saved.");
      notifySuccess("Menu item ingredients saved.");
      await Promise.all([loadInventory(), loadMenu()]);
    } catch (mappingError) {
      const message =
        mappingError instanceof Error
          ? mappingError.message
          : "Ingredient mapping failed.";
      setInventoryMessage(message);
      notifyError(message);
    } finally {
      setInventoryBusy(false);
    }
  }

  async function syncInventoryAvailability() {
    if (!canManageMenu) return;
    if (
      !window.confirm(
        "要同步下架缺料餐點嗎？系統只會下架無法製作的餐點，不會自動恢復販售。",
      )
    ) {
      return;
    }
    setInventoryBusy(true);
    setInventoryMessage("");
    try {
      const response = await fetch(
        buildApiUrl("/api/inventory/sync-menu-availability"),
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      const payload = (await response.json()) as ApiDataResponse<{
        disabledCount: number;
        restoredCount: number;
      }>;
      setInventoryMessage(
        `同步完成。已下架 ${payload.data.disabledCount} 項餐點；補貨後需手動恢復販售。`,
      );
      notifySuccess("缺料同步完成。");
      await Promise.all([loadInventory(), loadMenu(), loadAnalytics()]);
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : "Inventory sync failed.";
      setInventoryMessage(message);
      notifyError(message);
    } finally {
      setInventoryBusy(false);
    }
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

      const payload = (await response.json()) as ApiDataResponse<MenuItem>;
      const savedItem = payload?.data;
      await Promise.all([loadMenu(), loadCategories()]);
      resetMenuForm();
      setMenuMessage(editingMenuId ? "Menu item updated." : "Menu item added.");
      if (savedItem) {
        highlightMenuItem(savedItem.id);
      }
      notifySuccess(
        editingMenuId
          ? `Menu item ${savedItem?.name ?? body.name} updated.`
          : `Menu item ${savedItem?.name ?? body.name} created.`,
      );
    } catch (menuError) {
      const message =
        menuError instanceof Error ? menuError.message : "Menu update failed.";
      setMenuMessage(message);
      notifyError(getMenuErrorToastMessage(message));
    } finally {
      setMenuBusy(false);
    }
  }

  async function deleteMenuItem(item: MenuItem) {
    if (!canManageMenu) return;
    if (
      !window.confirm(
        `Delete menu item "${item.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }

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
      notifySuccess(`Menu item ${item.name} deleted.`);
      if (editingMenuId === item.id) resetMenuForm();
    } catch (menuError) {
      const message =
        menuError instanceof Error ? menuError.message : "Delete failed.";
      setMenuMessage(message);
      notifyError(message);
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

      const payload = (await response.json()) as ApiDataResponse<MenuItem>;
      const updatedItem = payload?.data;
      await loadMenu();
      setMenuMessage(
        item.is_available ? "Menu item marked sold out." : "Menu item available.",
      );
      if (updatedItem) {
        highlightMenuItem(updatedItem.id);
      }
      notifySuccess(
        item.is_available
          ? "Menu item marked sold out."
          : "Menu item marked available.",
      );
    } catch (menuError) {
      const message =
        menuError instanceof Error
          ? menuError.message
          : "Availability update failed.";
      setMenuMessage(message);
      notifyError(message);
    } finally {
      setMenuBusy(false);
    }
  }

  function resetMenuBundleForm() {
    setEditingMenuBundleId(null);
    setMenuBundleForm(emptyMenuBundleForm);
    setMenuBundleDraftItems([]);
    setMenuBundleSelectedItemId("");
    setMenuBundleSelectedQty("1");
  }

  function startEditMenuBundle(bundle: MenuBundle) {
    setEditingMenuBundleId(bundle.id);
    setMenuBundleMessage("");
    setMenuBundleForm({
      name: bundle.name,
      description: bundle.description,
      price: String(bundle.price),
      displayOrder: String(bundle.displayOrder),
      isActive: bundle.isActive,
    });
    setMenuBundleDraftItems(
      bundle.items.map((entry) => ({
        menuItemId: entry.menuItemId,
        qty: entry.qty,
      })),
    );
  }

  function addMenuBundleDraftItem() {
    const menuItemId = Number(menuBundleSelectedItemId);
    const qty = Number(menuBundleSelectedQty);
    if (!menuItemId || !Number.isInteger(qty) || qty <= 0) {
      setMenuBundleMessage("Select a menu item and quantity first.");
      return;
    }

    setMenuBundleDraftItems((currentItems) => {
      const existing = currentItems.find((item) => item.menuItemId === menuItemId);
      if (existing) {
        return currentItems.map((item) =>
          item.menuItemId === menuItemId
            ? { ...item, qty: Math.min(99, item.qty + qty) }
            : item,
        );
      }
      return [...currentItems, { menuItemId, qty: Math.min(99, qty) }];
    });
    setMenuBundleSelectedItemId("");
    setMenuBundleSelectedQty("1");
  }

  function removeMenuBundleDraftItem(menuItemId: number) {
    setMenuBundleDraftItems((currentItems) =>
      currentItems.filter((item) => item.menuItemId !== menuItemId),
    );
  }

  async function submitMenuBundleForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageMenu) return;
    if (menuBundleDraftItems.length === 0) {
      setMenuBundleMessage("Add at least one menu item to the bundle.");
      notifyWarning("Add at least one menu item to the bundle.");
      return;
    }

    setMenuBundleBusy(true);
    setMenuBundleMessage("");
    try {
      const body = {
        name: menuBundleForm.name.trim(),
        description: menuBundleForm.description.trim(),
        price: Number(menuBundleForm.price),
        displayOrder: Number(menuBundleForm.displayOrder),
        isActive: menuBundleForm.isActive,
        items: menuBundleDraftItems,
      };
      const response = await fetch(
        buildApiUrl(
          editingMenuBundleId
            ? `/api/admin/menu-bundles/${editingMenuBundleId}`
            : "/api/admin/menu-bundles",
        ),
        {
          method: editingMenuBundleId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await Promise.all([
        loadMenuBundles(),
        loadMenuBundles({ includeInactive: true }),
      ]);
      setMenuBundleMessage(
        editingMenuBundleId ? "Bundle updated." : "Bundle created.",
      );
      notifySuccess(
        editingMenuBundleId
          ? `Bundle ${body.name} updated.`
          : `Bundle ${body.name} created.`,
      );
      resetMenuBundleForm();
    } catch (bundleError) {
      const message =
        bundleError instanceof Error ? bundleError.message : "Bundle update failed.";
      setMenuBundleMessage(message);
      notifyError(message);
    } finally {
      setMenuBundleBusy(false);
    }
  }

  async function setMenuBundleActive(bundle: MenuBundle, isActive: boolean) {
    if (!canManageMenu) return;

    setMenuBundleBusy(true);
    setMenuBundleMessage("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/menu-bundles/${bundle.id}`),
        {
          method: isActive ? "PATCH" : "DELETE",
          headers: isActive ? { "Content-Type": "application/json" } : undefined,
          credentials: "include",
          body: isActive ? JSON.stringify({ isActive: true }) : undefined,
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await Promise.all([
        loadMenuBundles(),
        loadMenuBundles({ includeInactive: true }),
      ]);
      setMenuBundleMessage(
        isActive ? "Bundle reactivated." : "Bundle deactivated.",
      );
      notifySuccess(
        isActive
          ? `Bundle ${bundle.name} reactivated.`
          : `Bundle ${bundle.name} deactivated.`,
      );
    } catch (bundleError) {
      const message =
        bundleError instanceof Error
          ? bundleError.message
          : "Bundle status update failed.";
      setMenuBundleMessage(message);
      notifyError(message);
    } finally {
      setMenuBundleBusy(false);
    }
  }

  async function addBundleToCart(bundle: MenuBundle): Promise<void> {
    const availableItems = bundle.items.filter((entry) => entry.item?.is_available);
    if (availableItems.length === 0) {
      setActionError("This bundle has no available items.");
      notifyWarning("This bundle has no available items.");
      return;
    }

    const nextBundleMapPatch = Object.fromEntries(
      availableItems.map((entry) => [
        entry.menuItemId,
        {
          bundleId: bundle.id,
          bundleName: bundle.name,
          bundlePrice: bundle.price,
        },
      ]),
    ) as Record<
      number,
      { bundleId: number; bundleName: string; bundlePrice: number }
    >;

    for (const entry of availableItems) {
      if (!entry.item) continue;
      for (let count = 0; count < entry.qty; count += 1) {
        await addToCart(entry.item, `Added ${bundle.name} to cart.`);
      }
    }
    setCartBundleByItemId((current) => ({
      ...current,
      ...nextBundleMapPatch,
    }));
    setIsCartOpen(true);
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

      const payload = (await response.json()) as ApiDataResponse<Category>;
      const savedCategory = payload?.data;
      await Promise.all([
        loadCategories(),
        loadCategoryManagementItems(categoryManagementStatusFilter),
        loadMenu(),
      ]);
      resetCategoryForm();
      setCategoryMessage(
        editingCategoryId ? "Category updated." : "Category created.",
      );
      if (savedCategory) {
        highlightCategory(savedCategory.id);
      }
      notifySuccess(
        editingCategoryId
          ? `Category ${savedCategory?.name ?? body.name} updated.`
          : `Category ${savedCategory?.name ?? body.name} created.`,
      );
    } catch (categoryError) {
      const message =
        categoryError instanceof Error
          ? categoryError.message
          : "Category update failed.";
      setCategoryMessage(message);
      notifyError(message);
    } finally {
      setCategoryBusy(false);
    }
  }

  async function deactivateCategory(category: Category) {
    if (!canManageMenu) return;
    if (
      !window.confirm(
        `Deactivate category "${category.name}"? Items may still keep historical category data.`,
      )
    ) {
      return;
    }

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
      highlightCategory(category.id);
      notifySuccess(`Category ${category.name} deactivated.`);
      if (editingCategoryId === category.id) resetCategoryForm();
    } catch (categoryError) {
      const message =
        categoryError instanceof Error
          ? categoryError.message
          : "Category deactivate failed.";
      setCategoryMessage(message);
      notifyError(message);
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
      highlightCategory(category.id);
      notifySuccess(`Category ${category.name} reactivated.`);
      if (editingCategoryId === category.id) resetCategoryForm();
    } catch (categoryError) {
      const message =
        categoryError instanceof Error
          ? categoryError.message
          : "Category reactivate failed.";
      setCategoryMessage(message);
      notifyError(message);
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
      minOrderAmount: String(promotion.minOrderAmount ?? 0),
      startsAt: promotion.startsAt ? promotion.startsAt.slice(0, 16) : "",
      endsAt: promotion.endsAt ? promotion.endsAt.slice(0, 16) : "",
      usageLimit: promotion.usageLimit ? String(promotion.usageLimit) : "",
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
      notifyError("Discount value must be a positive number.");
      return;
    }
    if (
      promotionForm.discountType === "percent" &&
      (discountValue < 1 || discountValue > 100)
    ) {
      setPromotionMessage("Percent discount must be between 1 and 100.");
      notifyError("Percent discount must be between 1 and 100.");
      return;
    }

    const minOrderAmount = Number.parseInt(promotionForm.minOrderAmount, 10);
    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
      setPromotionMessage("Minimum order amount must be zero or more.");
      notifyError("Minimum order amount must be zero or more.");
      return;
    }

    const usageLimit = promotionForm.usageLimit
      ? Number.parseInt(promotionForm.usageLimit, 10)
      : null;
    if (
      promotionForm.usageLimit &&
      (!Number.isFinite(usageLimit) || usageLimit === null || usageLimit < 1)
    ) {
      setPromotionMessage("Usage limit must be a positive number.");
      notifyError("Usage limit must be a positive number.");
      return;
    }

    if (
      promotionForm.startsAt &&
      promotionForm.endsAt &&
      Date.parse(promotionForm.startsAt) > Date.parse(promotionForm.endsAt)
    ) {
      setPromotionMessage("Promotion end time must be after start time.");
      notifyWarning("Promotion end time must be after start time.");
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
            minOrderAmount,
            startsAt: promotionForm.startsAt
              ? new Date(promotionForm.startsAt).toISOString()
              : null,
            endsAt: promotionForm.endsAt
              ? new Date(promotionForm.endsAt).toISOString()
              : null,
            usageLimit,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as ApiDataResponse<Promotion>;
      const savedPromotion = payload?.data;
      await loadPromotions(promotionStatusFilter);
      resetPromotionForm();
      setPromotionMessage(
        editingPromotionId ? "Promotion updated." : "Promotion created.",
      );
      if (savedPromotion) {
        highlightPromotion(savedPromotion.id);
      }
      notifySuccess(
        editingPromotionId
          ? `Promo code ${savedPromotion?.code ?? promotionForm.code} updated.`
          : `Promo code ${savedPromotion?.code ?? promotionForm.code} created.`,
      );
    } catch (promotionError) {
      const message =
        promotionError instanceof Error
          ? promotionError.message
          : "Promotion save failed.";
      setPromotionMessage(message);
      notifyError(getPromotionErrorToastMessage(message));
    } finally {
      setPromotionBusy(false);
    }
  }

  async function setPromotionActive(promotion: Promotion, isActive: boolean) {
    if (!canManageMenu) return;
    if (
      !isActive &&
      !window.confirm(
        `Deactivate promo code ${promotion.code}? Customers will no longer be able to use it.`,
      )
    ) {
      return;
    }

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

      const payload = (await response.json()) as ApiDataResponse<Promotion>;
      const updatedPromotion = payload?.data;
      await loadPromotions(promotionStatusFilter);
      setPromotionMessage(
        isActive ? "Promotion reactivated." : "Promotion deactivated.",
      );
      highlightPromotion(updatedPromotion?.id ?? promotion.id);
      notifySuccess(
        isActive
          ? `Promo code ${promotion.code} reactivated.`
          : `Promo code ${promotion.code} deactivated.`,
      );
      if (editingPromotionId === promotion.id && !isActive) resetPromotionForm();
    } catch (promotionError) {
      const message =
        promotionError instanceof Error
          ? promotionError.message
          : "Promotion update failed.";
      setPromotionMessage(message);
      notifyError(getPromotionErrorToastMessage(message));
    } finally {
      setPromotionBusy(false);
    }
  }

  async function addCategoryToItem(item: MenuItem) {
    if (!canManageMenu) return;
    const categoryId = Number(selectedCategoryByItemId[item.id]);
    if (!categoryId) {
      setMenuMessage("Select a category first.");
      notifyWarning("Select a category first.");
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
      highlightMenuItem(item.id);
      notifySuccess("Category assigned to menu item.");
    } catch (assignError) {
      const message =
        assignError instanceof Error
          ? assignError.message
          : "Category assignment failed.";
      setMenuMessage(message);
      notifyError(message);
    } finally {
      setMenuBusy(false);
    }
  }

  async function removeCategoryFromItem(item: MenuItem, category: Category) {
    if (!canManageMenu) return;
    if (!window.confirm("Remove this category from the menu item?")) return;

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
      highlightMenuItem(item.id);
      notifySuccess("Category removed from menu item.");
    } catch (removeError) {
      const message =
        removeError instanceof Error
          ? removeError.message
          : "Category removal failed.";
      setMenuMessage(message);
      notifyError(message);
    } finally {
      setMenuBusy(false);
    }
  }

  async function submitRoleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (roleRequestReason.trim().length === 0) {
      setRoleRequestMessage("Please explain why you need this role.");
      notifyWarning("Please explain why you need this role.");
      return;
    }

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
      notifySuccess("Role request submitted.");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Role request failed.";
      const isPendingRequestError =
        message.toLowerCase().includes("pending") ||
        message.toLowerCase().includes("duplicate");
      setRoleRequestMessage(message);
      if (isPendingRequestError) {
        notifyWarning("You already have a pending role request.");
      } else {
        notifyError(message);
      }
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
      highlightRoleRequest(requestId);
      notifySuccess(
        status === "approved"
          ? "Role request approved."
          : "Role request rejected.",
      );
    } catch (reviewError) {
      const message =
        reviewError instanceof Error ? reviewError.message : "Review failed.";
      setAdminMessage(message);
      notifyError(message);
    } finally {
      setAdminReviewBusyId(null);
    }
  }

  async function submitAdminRoleUpdate() {
    if (!isAdmin) return;
    const userId = adminRoleUserId.trim();
    if (!userId || adminRoleDraft.length === 0) {
      setAdminMessage("Select a user before updating roles.");
      notifyWarning("Select a user before updating roles.");
      return;
    }

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
      notifySuccess("User roles updated.");
    } catch (roleError) {
      const message =
        roleError instanceof Error ? roleError.message : "Role update failed.";
      setAdminMessage(message);
      notifyError(message);
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
      {toasts.length > 0 ? (
        <div className="toast toast-top toast-end z-50 max-w-[min(92vw,28rem)]">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`alert ${getToastAlertClass(toast.type)} shadow-lg`}
              role={
                toast.type === "error" || toast.type === "warning"
                  ? "alert"
                  : "status"
              }
            >
              <span className="text-sm">{toast.message}</span>
              <button
                className="btn btn-ghost btn-xs"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(toast.id)}
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}
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
                <button
                  onClick={() => {
                    setMainView("shop");
                    window.setTimeout(() => scrollToSection(menuSectionRef), 0);
                  }}
                >
                  菜單
                </button>
              </li>
              <li>
                <button onClick={() => setIsCartOpen(true)}>購物車</button>
              </li>
              {user && !canViewAllOrders ? (
                <li>
                  <button
                    onClick={() => {
                      setMainView("account");
                      window.setTimeout(() => scrollToSection(ordersSectionRef), 0);
                    }}
                  >
                    我的訂單
                  </button>
                </li>
              ) : null}
              {hasManagerTools ? (
                <li>
                  <button
                    onClick={() => {
                      setMainView("manager");
                      window.setTimeout(() => scrollToSection(managerSectionRef), 0);
                    }}
                  >
                    後台管理
                  </button>
                </li>
              ) : null}
              <li>
                <button
                  onClick={() => {
                    setMainView("account");
                    window.setTimeout(() => scrollToSection(accountSectionRef), 0);
                  }}
                >
                  {user ? "帳號" : "登入"}
                </button>
              </li>
            </ul>
          </div>
          <button
            className="btn btn-ghost text-xl normal-case"
            onClick={() => {
              setMainView("shop");
              window.setTimeout(() => scrollToSection(menuSectionRef), 0);
            }}
          >
            早餐店訂餐系統
          </button>
        </div>

        <div className="navbar-center hidden lg:flex">
          <div className="join">
            <button
              className="btn btn-sm join-item"
              onClick={() => {
                setMainView("shop");
                window.setTimeout(() => scrollToSection(menuSectionRef), 0);
              }}
            >
              菜單
            </button>
            <button
              className="btn btn-sm join-item"
              onClick={() => setIsCartOpen(true)}
            >
              購物車
            </button>
            {user && !canViewAllOrders ? (
              <button
                className="btn btn-sm join-item"
                onClick={() => {
                  setMainView("account");
                  window.setTimeout(() => scrollToSection(ordersSectionRef), 0);
                }}
              >
                我的訂單
              </button>
            ) : null}
            {hasManagerTools ? (
              <button
                className="btn btn-sm join-item"
                onClick={() => {
                  setMainView("manager");
                  window.setTimeout(() => scrollToSection(managerSectionRef), 0);
                }}
              >
                後台管理
              </button>
            ) : null}
            <button
              className="btn btn-sm join-item"
              onClick={() => {
                setMainView("account");
                window.setTimeout(() => scrollToSection(accountSectionRef), 0);
              }}
            >
              {user ? "帳號" : "登入"}
            </button>
          </div>
        </div>

        <div className="navbar-end gap-2">
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <span className="badge badge-primary">
              {items.length} 項餐點 / {grouped.categories.length} 個分類
            </span>
            <span className="badge badge-secondary">購物車 {cartItemCount}</span>
            <span className="badge badge-accent">${cartSubtotal}</span>
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
                      {formatRoleLabel(role)}
                    </span>
                  ))}
                </div>
                <button
                  className="btn btn-sm btn-block mt-4"
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  登出
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <main className="container mx-auto p-6">
        {mainView === "shop" ? (
        <section className="mb-6 rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
          <h1 className="text-3xl font-bold">早餐店訂餐系統</h1>
          <p className="mt-2 text-sm opacity-80">
            可以直接線上點餐，也可以不用登入，以訪客身分留下姓名與電話完成訂單。
          </p>
          <p className="mt-2 text-sm text-info">
            登入會員可查看歷史訂單；店員、廚師與老闆登入後可使用後台管理功能。
          </p>
        </section>
        ) : null}

        {!user && (mainView === "shop" || mainView === "account") ? (
          <div
            className={
              mainView === "shop"
                ? "mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2"
                : "mx-auto mb-8 max-w-xl"
            }
          >
            <section
              ref={accountSectionRef}
              className="card bg-base-100 shadow-md scroll-mt-24"
            >
            <div className="card-body">
              <h2 className="card-title">登入會員</h2>
              <p className="text-sm opacity-70">
                您可以用訪客身分點餐，只需要留下姓名與電話；登入後可查看歷史訂單。
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
                {isGoogleSigningIn ? "正在開啟 Google..." : "使用 Google 登入"}
              </button>
              {demoAuthAvailable || demoUsers.length > 0 ? (
                <div className="mt-4 rounded-box border border-base-300 bg-base-200 p-3">
                  <div className="mb-2">
                    <h3 className="font-semibold">測試用帳號</h3>
                    <p className="text-xs opacity-70">
                      展示或本機測試時可快速切換不同角色，不一定要使用 Google 登入。
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
                          ? "登入中..."
                          : formatDemoUserLabel(demoUser)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {!demoAuthAvailable && demoAuthError ? (
                <p className="text-xs opacity-60">
                  測試用帳號目前無法載入：{demoAuthError}
                </p>
              ) : null}
            </div>
            </section>
            {mainView === "shop" ? (
            <section className="card bg-base-100 shadow-md">
              <div className="card-body">
                <h2 className="card-title">訪客訂單查詢</h2>
                <p className="text-sm opacity-70">
                  用取餐號碼與電話查詢訪客訂單。
                </p>
                <p className="text-xs opacity-60">
                  請輸入收據上的取餐號碼，以及下單時留下的完整電話。
                </p>
                {!lastGuestOrder ? (
                  <p className="text-xs opacity-60">
                    送出訪客訂單後，可使用「查詢上一筆訪客訂單」快速查看狀態。
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1">取餐編號</span>
                    <input
                      className="input input-bordered input-sm"
                      value={guestLookupForm.pickupNumber}
                      onChange={(event) => {
                        setGuestLookupForm((current) => ({
                          ...current,
                          pickupNumber: event.target.value,
                        }));
                        setGuestLookupMessage("");
                      }}
                      placeholder="#0007"
                      maxLength={20}
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1">電話號碼</span>
                    <input
                      className="input input-bordered input-sm"
                      value={guestLookupForm.guestPhone}
                      onChange={(event) => {
                        setGuestLookupForm((current) => ({
                          ...current,
                          guestPhone: event.target.value,
                        }));
                        setGuestLookupMessage("");
                      }}
                      placeholder="0912-345-678"
                      maxLength={30}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={guestLookupLoading}
                    onClick={() => {
                      void lookupGuestOrder();
                    }}
                  >
                    {guestLookupLoading ? "查詢中..." : "查詢訂單"}
                  </button>
                  {lastGuestOrder ? (
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={guestLookupLoading}
                      onClick={() => {
                        const nextForm = {
                          pickupNumber: formatPickupNumber(lastGuestOrder.id),
                          guestPhone: lastGuestOrder.guestPhone ?? "",
                        };
                        setGuestLookupForm(nextForm);
                        void lookupGuestOrder(nextForm);
                      }}
                    >
                      查詢上一筆訪客訂單
                    </button>
                  ) : null}
                </div>
                {guestLookupMessage ? (
                  <div className="alert alert-warning py-2 text-sm">
                    <span>{guestLookupMessage}</span>
                  </div>
                ) : null}
                {!guestLookupMessage && !guestLookupOrder ? (
                  <p className="text-xs opacity-60">
                    只能查詢訪客訂單；登入會員、現場與電話訂單請由店員協助查詢。
                  </p>
                ) : null}
                {guestLookupOrder ? (
                  <div className="rounded-box border border-base-300 bg-base-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm opacity-70">取餐編號</p>
                        <p className="text-2xl font-bold text-primary">
                          {formatPickupNumber(guestLookupOrder.id)}
                        </p>
                      </div>
                      <span
                        className={`badge ${getStatusBadgeClass(
                          guestLookupOrder.status,
                        )}`}
                      >
                        {formatOrderStatus(guestLookupOrder.status)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <p>
                        付款：{formatPaymentMethod(guestLookupOrder.paymentMethod)} /{" "}
                        {formatPaymentStatus(guestLookupOrder.paymentStatus)}
                      </p>
                      <p>取餐方式：{formatFulfillmentType(guestLookupOrder.fulfillmentType)}</p>
                      <p>
                        取餐時間：{" "}
                        {guestLookupOrder.pickupTime
                          ? formatCheckoutDateTime(guestLookupOrder.pickupTime)
                          : "依現場安排"}
                      </p>
                      <p>總金額：${guestLookupOrder.total}</p>
                      {guestLookupOrder.isGroupOrder ? (
                        <p>
                          團體：{guestLookupOrder.groupName || "團體訂單"}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-3 rounded-box bg-base-100 p-2">
                      <p className="mb-1 font-semibold">餐點</p>
                      <ul className="space-y-1 text-sm">
                        {guestLookupOrder.items.map((detail) => (
                          <li
                            key={`${detail.item.id}-${detail.menu_item_version ?? "snapshot"}`}
                            className="flex justify-between gap-2"
                          >
                            <span>
                              {detail.item.name} x {detail.qty}
                              {detail.memberName
                                ? ` / ${detail.memberName}`
                                : ""}
                              {detail.bundleName
                                ? ` / 套餐：${detail.bundleName}`
                                : ""}
                            </span>
                            <span>${detail.item.price * detail.qty}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {guestLookupOrder.discountAmount > 0 ||
                    guestLookupOrder.promoCode ? (
                      <p className="mt-2 text-sm">
                        優惠碼：{guestLookupOrder.promoCode ?? "-"} / 折扣 $
                        {guestLookupOrder.discountAmount}
                      </p>
                    ) : null}
                    {guestLookupOrder.customerNote ? (
                      <p className="mt-2 text-sm">
                        備註：{guestLookupOrder.customerNote}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm font-medium">
                      {getCustomerOrderProgressLabel(guestLookupOrder)}
                    </p>
                    {["submitted", "preparing"].includes(
                      guestLookupOrder.status,
                    ) ? (
                      <p className="text-sm opacity-70">
                        前方約有 {getQueueAheadCount(guestLookupOrder)} 筆訂單。
                        預估等待：{" "}
                        {estimateWaitMinutes(getQueueAheadCount(guestLookupOrder))} 分鐘。
                      </p>
                    ) : null}
                    {guestLookupOrder.status === "ready" &&
                    guestLookupOrder.paymentStatus === "unpaid" ? (
                      <div className="alert alert-warning mt-3 py-2 text-sm">
                        <span>取餐前請先完成付款。</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
            ) : null}
          </div>
        ) : null}

        {actionError ? (
          <div className="alert alert-warning mb-4">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span>{actionError}</span>
                {isMenuVersionChangedMessage(actionError) ? (
                  <p className="mt-1 text-sm">
                    菜單已更新，請重新確認購物車後再送出。
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
                  {isRefreshingCartVersion ? "重新整理中..." : "重新整理購物車"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!user && lastGuestOrder ? (
          <section className="mb-8 rounded-box border border-success/40 bg-success/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">訪客訂單已送出</h2>
                <p className="text-2xl font-bold text-success">
                  取餐編號：{formatPickupNumber(lastGuestOrder.id)}
                </p>
                <p className="text-sm opacity-75">
                  請記下取餐編號。店員可能會用電話末四碼{" "}
                  {getPhoneLastFour(lastGuestOrder.guestPhone) || "您的紀錄"}
                  協助核對訂單。
                </p>
              </div>
              <div className="text-sm">
                <p>狀態：{formatOrderStatus(lastGuestOrder.status)}</p>
                <p>
                  付款：{formatPaymentMethod(lastGuestOrder.paymentMethod)} /{" "}
                  {formatPaymentStatus(lastGuestOrder.paymentStatus)}
                </p>
                <p>總金額：${lastGuestOrder.total}</p>
                <button
                  className="btn btn-sm btn-outline mt-2"
                  disabled={guestLookupLoading}
                  onClick={() => {
                    const nextForm = {
                      pickupNumber: formatPickupNumber(lastGuestOrder.id),
                      guestPhone: lastGuestOrder.guestPhone ?? "",
                    };
                    setGuestLookupForm(nextForm);
                    void lookupGuestOrder(nextForm);
                  }}
                >
                  查詢最新狀態
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {user && mainView === "account" ? (
          <section
            ref={accountSectionRef}
            className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-24"
          >
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body">
                <h2 className="card-title">我的帳號</h2>
                <p className="text-sm opacity-70">{user.email}</p>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <span key={role} className="badge badge-outline">
                      {formatRoleLabel(role)}
                    </span>
                  ))}
                </div>
                <p className="text-xs opacity-60">
                  {roles.length === 1 && roles.includes("customer")
                    ? "目前是顧客身份。"
                    : "你的帳號具有後台權限。"}
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
                <h2 className="card-title">申請身份權限</h2>
                <div className="form-control">
                  <label className="label" htmlFor="role-request-role">
                    <span className="label-text">申請身份</span>
                  </label>
                  <select
                    id="role-request-role"
                    className="select select-bordered"
                    value={roleRequestRole}
                    onChange={(event) => {
                      setRoleRequestRole(event.target.value as "staff" | "chef");
                    }}
                  >
                    <option value="staff">店員</option>
                    <option value="chef">廚師</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label" htmlFor="role-request-reason">
                    <span className="label-text">申請原因</span>
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
                  {roleRequestBusy ? "送出中..." : "送出申請"}
                </button>
              </div>
            </form>
            {menuSubTab === "list" ? (
              <div className="card border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body">
                  <div>
                    <h2 className="card-title">菜單列表</h2>
                    <p className="text-sm opacity-70">
                      查看目前菜單餐點、販售狀態、價格與排序。
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>餐點</th>
                          <th>分類</th>
                          <th>價格</th>
                          <th>狀態</th>
                          <th>菜單版本</th>
                          <th>顯示排序</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedMenuItems.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div className="font-semibold">{item.name}</div>
                              <div className="text-xs opacity-60">
                                {item.description}
                              </div>
                            </td>
                            <td>
                              {item.primary_category_name ||
                                item.category ||
                                "未分類"}
                            </td>
                            <td>${item.price}</td>
                            <td>
                              <span
                                className={`badge ${
                                  item.is_available
                                    ? "badge-success"
                                    : "badge-error"
                                }`}
                              >
                                {item.is_available ? "販售中" : "已售完"}
                              </span>
                            </td>
                            <td>{formatSemanticVersion(item)}</td>
                            <td>{item.display_order}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span>
                      第 {currentMenuListPage} / {menuListPageCount} 頁，共{" "}
                      {items.length} 筆
                    </span>
                    <div className="join">
                      <button
                        className="btn btn-sm join-item"
                        disabled={currentMenuListPage <= 1}
                        onClick={() =>
                          setMenuListPage((page) => Math.max(1, page - 1))
                        }
                      >
                        上一頁
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        disabled={currentMenuListPage >= menuListPageCount}
                        onClick={() =>
                          setMenuListPage((page) =>
                            Math.min(menuListPageCount, page + 1),
                          )
                        }
                      >
                        下一頁
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {hasManagerTools && mainView === "manager" ? (
          <section
            ref={managerSectionRef}
            className="mb-8 scroll-mt-24 rounded-box border border-base-300 bg-base-100 shadow-md"
          >
            <div className="border-b border-base-300 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">後台管理</h2>
                  <p className="text-sm opacity-70">
                    依照您的角色處理訂單、菜單、庫存與營運資料。
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
                  <h3 className="text-xl font-bold">訂單處理</h3>
                  <p className="text-sm opacity-70">
                    查看顧客訂單、更新製作狀態與付款狀態。
                  </p>
                </div>
                <div className="mb-4">
                  <h4 className="mb-2 font-semibold">
                    今日營運摘要
                  </h4>
                  <p className="mb-3 text-sm opacity-70">
                    快速掌握廚房排隊、櫃台付款、電話訂單、優惠券與問題訂單。
                  </p>
                </div>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-9">
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">進行中訂單</div>
                    <div className="stat-value text-info">{activeOrders}</div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">未付款訂單</div>
                    <div className="stat-value text-warning">{unpaidOrders}</div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">今日電話單</div>
                    <div className="stat-value text-primary">
                      {phoneOrdersToday}
                    </div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">今日現場單</div>
                    <div className="stat-value">{walkInOrdersToday}</div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">今日優惠券單</div>
                    <div className="stat-value text-success">
                      {promoOrdersToday}
                    </div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">待處理問題</div>
                    <div className="stat-value text-error">
                      {ordersWithIssue}
                    </div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">廚房排隊中</div>
                    <div className="stat-value text-info">
                      {queueSummary.kitchenQueue}
                    </div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">預估等待時間</div>
                    <div className="stat-value text-primary">
                      {estimatedWaitMinutes}m
                    </div>
                  </div>
                  <div className="stat rounded-box border border-base-300 bg-base-200">
                    <div className="stat-title">忙碌程度</div>
                    <div
                      className={`stat-value text-2xl ${
                        busyLevel === "very_busy"
                          ? "text-error"
                          : busyLevel === "busy"
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {getBusyLevelLabel(busyLevel)}
                    </div>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap gap-2 rounded-box border border-base-300 bg-base-200 p-2">
                  {[
                    { id: "orders" as const, label: "訂單列表" },
                    { id: "walkin" as const, label: "現場 / 電話點餐" },
                    { id: "kitchen" as const, label: "廚房看板" },
                    { id: "issues" as const, label: "訂單問題" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      className={`btn btn-sm ${
                        ordersSubTab === tab.id ? "btn-primary" : "btn-ghost"
                      }`}
                      onClick={() => {
                        setOrdersSubTab(tab.id);
                        if (tab.id === "kitchen") setOrdersViewMode("kitchen");
                        if (tab.id === "orders") setOrdersViewMode("list");
                        if (tab.id === "issues") setOrderIssueFilter("has_issue");
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {ordersSubTab === "walkin" && canCreateWalkInOrder ? (
                  <div className="mb-4 rounded-box border border-base-300 bg-base-200 p-4">
                    <div className="mb-3">
                      <h4 className="font-semibold">櫃台代客點餐</h4>
                      <p className="text-sm opacity-70">
                        建立現場或電話訂單，不需要顧客登入。
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
                        <option value="walk_in">現場點餐</option>
                        <option value="phone">電話訂餐</option>
                      </select>
                      <input
                        className="input input-bordered input-sm"
                        placeholder="顧客姓名"
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
                        placeholder="電話訂單聯絡電話"
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
                        <option value="takeout">外帶</option>
                        <option value="dine_in">內用</option>
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
                        <option value="cash">現金</option>
                        <option value="card">刷卡</option>
                        <option value="online">線上付款</option>
                      </select>
                      <input
                        className="input input-bordered input-sm"
                        placeholder="優惠碼"
                        value={walkInOrderForm.promoCode}
                        onChange={(event) =>
                          setWalkInOrderForm((current) => ({
                            ...current,
                            promoCode: event.target.value,
                          }))
                        }
                      />
                      <div className="lg:col-span-4">
                        {renderPromotionEligibilityHint(
                          walkInOrderForm.promoCode,
                          walkInOrderTotal,
                        )}
                      </div>
                    </div>
                    <div className="mt-3 rounded-box border border-base-300 bg-base-100 p-3">
                      <label className="label cursor-pointer justify-start gap-2 p-0">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={walkInOrderForm.isGroupOrder}
                          onChange={(event) =>
                            setWalkInOrderForm((current) => ({
                              ...current,
                              isGroupOrder: event.target.checked,
                            }))
                          }
                        />
                        <span className="label-text">團體訂單</span>
                      </label>
                      {walkInOrderForm.isGroupOrder ? (
                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                          <input
                            className="input input-bordered input-sm"
                            placeholder="團體名稱"
                            maxLength={80}
                            value={walkInOrderForm.groupName}
                            onChange={(event) =>
                              setWalkInOrderForm((current) => ({
                                ...current,
                                groupName: event.target.value,
                              }))
                            }
                          />
                          <input
                            className="input input-bordered input-sm"
                            placeholder="聯絡人"
                            maxLength={80}
                            value={walkInOrderForm.contactName}
                            onChange={(event) =>
                              setWalkInOrderForm((current) => ({
                                ...current,
                                contactName: event.target.value,
                              }))
                            }
                          />
                          <input
                            className="input input-bordered input-sm"
                            placeholder="聯絡電話"
                            maxLength={30}
                            value={walkInOrderForm.contactPhone}
                            onChange={(event) =>
                              setWalkInOrderForm((current) => ({
                                ...current,
                                contactPhone: event.target.value,
                              }))
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                    <textarea
                      className="textarea textarea-bordered mt-3 min-h-20 w-full"
                      placeholder="顧客備註"
                      value={walkInOrderForm.customerNote}
                      onChange={(event) =>
                        setWalkInOrderForm((current) => ({
                          ...current,
                          customerNote: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-3">
                      {renderTastePreferencePanel("staff")}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select
                        className="select select-bordered select-sm min-w-48 flex-1"
                        value={walkInSelectedItemId}
                        onChange={(event) =>
                          setWalkInSelectedItemId(event.target.value)
                        }
                      >
                        <option value="">選擇餐點</option>
                        {items.map((item) => (
                          <option
                            key={item.id}
                            value={item.id}
                            disabled={!item.is_available}
                          >
                            {item.name} - ${item.price}
                            {item.is_available ? "" : " - 已售完"}
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
                        加入餐點
                      </button>
                    </div>
                    {menuBundles.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {menuBundles.map((bundle) => (
                          <button
                            key={bundle.id}
                            className="btn btn-xs btn-outline"
                            type="button"
                            onClick={() => addWalkInBundle(bundle)}
                          >
                            加入套餐：{bundle.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {walkInOrderDetails.length > 0 ? (
                      <div className="mt-3 overflow-x-auto">
                        <table className="table table-sm">
                          <tbody>
                            {walkInOrderDetails.map((detail) => (
                              <tr key={detail.itemId}>
                                <td>
                                  <div>{detail.item.name}</div>
                                  {detail.bundleName ? (
                                    <span className="badge badge-secondary badge-xs">
                                      套餐：{detail.bundleName}
                                    </span>
                                  ) : null}
                                  {walkInOrderForm.isGroupOrder ? (
                                    <input
                                      className="input input-bordered input-xs mt-1 w-full"
                                      placeholder="成員姓名"
                                      maxLength={80}
                                      value={detail.memberName ?? ""}
                                      onChange={(event) => {
                                        setWalkInOrderItems((currentItems) =>
                                          currentItems.map((item) =>
                                            item.itemId === detail.itemId
                                              ? {
                                                  ...item,
                                                  memberName:
                                                    event.target.value,
                                                }
                                              : item,
                                          ),
                                        );
                                      }}
                                    />
                                  ) : null}
                                </td>
                                <td>x {detail.qty}</td>
                                <td>${detail.subtotal}</td>
                                <td className="text-right">
                                  <button
                                    className="btn btn-xs btn-ghost"
                                    onClick={() =>
                                      removeWalkInItem(detail.itemId)
                                    }
                                  >
                                    移除
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
                        代客點餐總金額：${walkInOrderTotal}
                      </span>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={walkInBusy || walkInOrderItems.length === 0}
                        onClick={() => void submitWalkInOrder()}
                      >
                        {walkInBusy ? "建立中..." : "送出代客訂單"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {ordersSubTab !== "walkin" ? (
                <>
                <div className="mb-4 rounded-box border border-base-300 bg-base-200 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">
                        {ordersSubTab === "kitchen"
                          ? "廚房看板"
                          : ordersSubTab === "issues"
                            ? "訂單問題"
                            : "查找訂單"}
                      </h4>
                      <p className="text-sm opacity-70">
                        使用搜尋、篩選與檢視模式快速處理訂單。
                      </p>
                    </div>
                    <div className="join">
                      <button
                        className={`btn btn-sm join-item ${
                          ordersViewMode === "list" ? "btn-primary" : ""
                        }`}
                        onClick={() => setOrdersViewMode("list")}
                      >
                        列表
                      </button>
                      <button
                        className={`btn btn-sm join-item ${
                          ordersViewMode === "board" ? "btn-primary" : ""
                        }`}
                        onClick={() => setOrdersViewMode("board")}
                      >
                        看板
                      </button>
                      <button
                        className={`btn btn-sm join-item ${
                          ordersViewMode === "kitchen" ? "btn-primary" : ""
                        }`}
                        onClick={() => setOrdersViewMode("kitchen")}
                      >
                        廚房看板
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
                    <label className="form-control lg:col-span-2">
                      <span className="label-text">搜尋</span>
                      <input
                        className="input input-bordered input-sm"
                        placeholder="取餐號、姓名、電話、優惠碼、餐點..."
                        value={orderSearchText}
                        onChange={(event) =>
                          setOrderSearchText(event.target.value)
                        }
                      />
                    </label>
                    <label className="form-control">
                      <span className="label-text">Source</span>
                      <select
                        className="select select-bordered select-sm"
                        value={orderSourceFilter}
                        onChange={(event) =>
                          setOrderSourceFilter(
                            event.target.value as "" | OrderSource,
                          )
                        }
                      >
                        <option value="">全部來源</option>
                        <option value="customer">會員訂餐</option>
                        <option value="walk_in">現場點餐</option>
                        <option value="phone">電話訂餐</option>
                        <option value="guest">訪客訂餐</option>
                      </select>
                    </label>
                    <label className="form-control">
                      <span className="label-text">Payment</span>
                      <select
                        className="select select-bordered select-sm"
                        value={orderPaymentFilter}
                        onChange={(event) =>
                          setOrderPaymentFilter(
                            event.target.value as "" | PaymentStatus,
                          )
                        }
                      >
                        <option value="">全部付款狀態</option>
                        <option value="unpaid">未付款</option>
                        <option value="paid">已付款</option>
                      </select>
                    </label>
                    <label className="form-control">
                      <span className="label-text">問題</span>
                      <select
                        className="select select-bordered select-sm"
                        value={orderIssueFilter}
                        onChange={(event) =>
                          setOrderIssueFilter(
                            event.target.value as
                              | ""
                              | "has_issue"
                              | "no_issue",
                          )
                        }
                      >
                        <option value="">全部問題狀態</option>
                        <option value="has_issue">有問題</option>
                        <option value="no_issue">無問題</option>
                      </select>
                    </label>
                    <label className="form-control">
                      <span className="label-text">訂單狀態</span>
                      <select
                        className="select select-bordered select-sm"
                        value={orderStatusFilter}
                        onChange={(event) =>
                          setOrderStatusFilter(
                            event.target.value as "" | OrderStatus,
                          )
                        }
                      >
                        <option value="">全部狀態</option>
                        {orderBoardColumnStatuses.concat("pending").map((status) => (
                          <option key={status} value={status}>
                            {formatOrderStatus(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {orderQuickFilters.map((filter) => (
                      <button
                        key={filter.id}
                        className={`btn btn-xs ${
                          orderQuickFilter === filter.id
                            ? "btn-primary"
                            : "btn-outline"
                        }`}
                        onClick={() => applyOrderQuickFilter(filter.id)}
                      >
                        {filter.label}
                      </button>
                    ))}
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={clearOrderFilters}
                    >
                      清除篩選
                    </button>
                    <span className="text-xs opacity-60">
                      顯示 {paginatedManagerVisibleOrders.length} /{" "}
                      {managerVisibleOrders.length} 筆符合條件訂單，共{" "}
                      {historyOrders.length} 筆。
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 bg-base-100 p-2 text-sm">
                    <span>
                      第 {currentManagerOrderPage} / {managerOrderPageCount} 頁
                    </span>
                    <div className="join">
                      <button
                        className="btn btn-sm join-item"
                        disabled={currentManagerOrderPage <= 1}
                        onClick={() =>
                          setOrderPage((page) => Math.max(1, page - 1))
                        }
                      >
                        上一頁
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        disabled={currentManagerOrderPage >= managerOrderPageCount}
                        onClick={() =>
                          setOrderPage((page) =>
                            Math.min(managerOrderPageCount, page + 1),
                          )
                        }
                      >
                        下一頁
                      </button>
                    </div>
                  </div>
                </div>
                {statusMessage ? (
                  <div className="alert mb-4">
                    <span>{statusMessage}</span>
                  </div>
                ) : null}
                {historyLoading ? (
                  <div className="alert">
                    <span>訂單載入中...</span>
                  </div>
                ) : historyOrders.length === 0 ? (
                  <div className="alert alert-info">
                    <span>No orders yet.</span>
                  </div>
                ) : ordersViewMode === "kitchen" ? (
                  <div className="space-y-4">
                    <section className="rounded-box border border-base-300 bg-base-200 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="font-semibold">Kitchen display</h4>
                          <p className="text-sm opacity-70">
                            Focused view for submitted and preparing orders.
                          </p>
                        </div>
                        <span
                          className={`badge ${getBusyLevelBadgeClass(busyLevel)}`}
                        >
                          {getBusyLevelLabel(busyLevel)}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="stat rounded-box border border-base-300 bg-base-100">
                          <div className="stat-title">Kitchen queue</div>
                          <div className="stat-value text-info">
                            {queueSummary.kitchenQueue}
                          </div>
                        </div>
                        <div className="stat rounded-box border border-base-300 bg-base-100">
                          <div className="stat-title">Estimated wait</div>
                          <div className="stat-value text-primary">
                            {estimatedWaitMinutes}m
                          </div>
                        </div>
                        <div className="stat rounded-box border border-base-300 bg-base-100">
                          <div className="stat-title">緊急訂單</div>
                          <div className="stat-value text-error">
                            {urgentKitchenOrders}
                          </div>
                        </div>
                        <div className="stat rounded-box border border-base-300 bg-base-100">
                          <div className="stat-title">Items waiting</div>
                          <div className="stat-value">
                            {totalKitchenItemsWaiting}
                          </div>
                        </div>
                        <div className="stat rounded-box border border-base-300 bg-base-100">
                          <div className="stat-title">Busy level</div>
                          <div
                            className={`stat-value text-2xl ${
                              busyLevel === "very_busy"
                                ? "text-error"
                                : busyLevel === "busy"
                                  ? "text-warning"
                                  : "text-success"
                            }`}
                          >
                            {getBusyLevelLabel(busyLevel)}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-box border border-base-300 bg-base-100 p-4">
                      <h4 className="mb-3 font-semibold">Items to prepare</h4>
                      {kitchenItemSummary.length === 0 ? (
                        <div className="rounded-box border border-dashed border-base-300 p-3 text-sm opacity-60">
                          No items waiting.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {kitchenItemSummary.map((row) => (
                            <div
                              key={row.name}
                              className="rounded-box border border-base-300 bg-base-200 p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold">{row.name}</span>
                                <span className="badge badge-primary">
                                  x {row.totalQty}
                                </span>
                              </div>
                              <p className="mt-1 text-xs opacity-70">
                                {row.orderIds.size} order(s) /{" "}
                                {Array.from(row.sources)
                                  .map(formatOrderSource)
                                  .join(", ")}
                              </p>
                              <p className="text-xs opacity-60">
                                Earliest: {formatCheckoutDateTime(row.earliestTime)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {kitchenDisplayOrders.length === 0 ? (
                      <div className="alert alert-info">
                        <div>
                          <div>No active kitchen orders.</div>
                          <div className="text-sm">
                            Submitted and preparing orders will appear here.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        {kitchenDisplayOrders.map((order) => {
                          const primaryAction = getPrimaryOrderAction(order);
                          const priority = getKitchenPriorityLabel(order);
                          const urgent = isUrgentOrder(order);
                          const orderAgeMinutes = getOrderAgeMinutes(order);
                          return (
                            <article
                              key={order.id}
                              className={`rounded-box border bg-base-100 p-5 shadow-sm transition ${
                                order.id === recentlyUpdatedOrderId
                                  ? "border-primary ring-2 ring-primary bg-primary/5"
                                  : priority === "urgent"
                                    ? "border-error"
                                    : "border-base-300"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="text-3xl font-bold text-primary">
                                    {formatPickupNumber(order.id)}
                                  </div>
                                  <p className="text-sm opacity-70">
                                    Order #{order.id} /{" "}
                                    {formatOrderSource(order.orderSource)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap justify-end gap-2">
                                  <span
                                    className={`badge ${getStatusBadgeClass(
                                      order.status,
                                    )}`}
                                  >
                                    {formatOrderStatus(order.status)}
                                  </span>
                                  <span
                                    className={`badge ${getKitchenPriorityBadgeClass(
                                      priority,
                                    )}`}
                                  >
                                    {formatKitchenPriority(priority)}
                                  </span>
                                  <span className="badge badge-outline">
                                    等待 {orderAgeMinutes} 分
                                  </span>
                                  {urgent ? (
                                    <span className="badge badge-error">
                                      緊急
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                                <span>
                                  來源：{formatOrderSource(order.orderSource)}
                                </span>
                                {order.isGroupOrder ? (
                                  <span>
                                    Group: {order.groupName || "Group order"}
                                  </span>
                                ) : null}
                                <span>付款：{formatPaymentStatus(order.paymentStatus)}</span>
                                {order.pickupTime ? (
                                  <span>
                                    取餐時間：{" "}
                                    {formatCheckoutDateTime(order.pickupTime)}
                                  </span>
                                ) : (
                                  <span>取餐時間：盡快安排</span>
                                )}
                                {order.guestName ? (
                                  <span>顧客：{order.guestName}</span>
                                ) : null}
                                {order.customerNote ? (
                                  <span className="md:col-span-2">
                                    備註：{order.customerNote}
                                  </span>
                                ) : null}
                              </div>

                              {order.issueType ? (
                                <div className="alert alert-warning mt-3 py-2">
                                  <span>
                                    問題：{order.issueType}
                                    {order.issueNote
                                      ? ` / ${order.issueNote}`
                                      : ""}
                                  </span>
                                </div>
                              ) : null}

                              <ul className="mt-4 space-y-2">
                                {order.items.map((detail) => (
                                  <li
                                    key={`${order.id}-${detail.item.id}`}
                                    className="flex items-center justify-between rounded-box bg-base-200 px-3 py-2 text-lg"
                                  >
                                    <span className="font-semibold">
                                      {detail.item.name}
                                    </span>
                                    <span className="badge badge-primary text-base">
                                      x {detail.qty}
                                    </span>
                                  </li>
                                ))}
                              </ul>

                              {primaryAction ? (
                                <button
                                  className="btn btn-primary mt-4 w-full"
                                  disabled={statusUpdatingOrderId === order.id}
                                  onClick={() => {
                                    void updateOrderStatus(
                                      order.id,
                                      primaryAction.status,
                                    );
                                  }}
                                >
                                  {statusUpdatingOrderId === order.id
                                    ? "更新中..."
                                    : primaryAction.label}
                                </button>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : managerVisibleOrders.length === 0 ? (
                  <div className="alert alert-info">
                    <span>目前沒有符合篩選條件的訂單。</span>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={clearOrderFilters}
                    >
                      清除篩選
                    </button>
                  </div>
                ) : ordersViewMode === "board" ? (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
                    {orderBoardColumnStatuses.map((status) => {
                      const columnOrders = paginatedManagerVisibleOrders.filter(
                        (order) => order.status === status,
                      );
                      return (
                        <section
                          className="rounded-box border border-base-300 bg-base-200 p-3"
                          key={status}
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="font-semibold">
                              {formatOrderStatus(status)}
                            </h4>
                            <span className="badge badge-outline">
                              {columnOrders.length}
                            </span>
                          </div>
                          {columnOrders.length === 0 ? (
                            <div className="rounded-box border border-dashed border-base-300 bg-base-100 p-3 text-sm opacity-60">
                              No orders
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {columnOrders.map((order) => {
                                const primaryAction =
                                  getPrimaryOrderAction(order);
                                const urgent = isUrgentOrder(order);
                                const orderAgeMinutes =
                                  getOrderAgeMinutes(order);
                                const readyAgeMinutes =
                                  getReadyAgeMinutes(order);
                                const readyPickupOverdue =
                                  isReadyPickupOverdue(order);
                                const managerFlowHint =
                                  getManagerOrderFlowHint(order);
                                const canCancelThisOrder =
                                  canCancelManagerOrder &&
                                  (order.status === "submitted" ||
                                    order.status === "preparing" ||
                                    order.status === "ready");
                                return (
                                  <article
                                    className={`rounded-box border bg-base-100 p-3 text-sm transition ${
                                      order.id === recentlyUpdatedOrderId
                                        ? "border-primary ring-2 ring-primary bg-primary/5"
                                        : "border-base-300"
                                    }`}
                                    key={order.id}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="font-semibold">
                                          Pickup{" "}
                                          {formatPickupNumber(order.id)}
                                        </div>
                                        <div className="text-xs opacity-70">
                                          Order #{order.id}
                                        </div>
                                      </div>
                                      <span
                                        className={`badge badge-sm ${getStatusBadgeClass(
                                          order.status,
                                        )}`}
                                      >
                                        {formatOrderStatus(order.status)}
                                      </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {urgent ? (
                                        <span className="badge badge-error badge-sm">
                                          緊急 {orderAgeMinutes} 分
                                        </span>
                                      ) : null}
                                      {managerFlowHint ? (
                                        <span className="badge badge-outline badge-sm">
                                          {managerFlowHint}
                                        </span>
                                      ) : null}
                                      {readyPickupOverdue ? (
                                        <span className="badge badge-error badge-sm">
                                          取餐逾時
                                          {readyAgeMinutes !== null
                                            ? ` ${readyAgeMinutes}m`
                                            : ""}
                                        </span>
                                      ) : null}
                                      {order.orderSource === "phone" ? (
                                        <span className="badge badge-info badge-sm">
                                          Phone
                                        </span>
                                      ) : null}
                                      {order.issueType ? (
                                        <span className="badge badge-warning badge-sm">
                                          Issue
                                        </span>
                                      ) : null}
                                      {order.promoCode ||
                                      order.discountAmount > 0 ? (
                                        <span className="badge badge-success badge-sm">
                                          Promo
                                        </span>
                                      ) : null}
                                      <span
                                        className={`badge badge-sm ${
                                          order.paymentStatus === "paid"
                                            ? "badge-success"
                                            : "badge-warning"
                                        }`}
                                      >
                                        {formatPaymentStatus(order.paymentStatus)}
                                      </span>
                                    </div>
                                    {order.guestName ? (
                                      <p className="mt-2 text-xs opacity-70">
                                        顧客：{order.guestName}
                                      </p>
                                    ) : null}
                                    {readyPickupOverdue ? (
                                      <p className="mt-2 text-xs font-medium text-error">
                                        取餐已逾時。
                                      </p>
                                    ) : null}
                                    {order.status === "ready" &&
                                    order.paymentStatus === "unpaid" ? (
                                      <p className="mt-1 text-xs text-warning">
                                        取餐前請確認付款。
                                      </p>
                                    ) : null}
                                    {order.status === "ready" &&
                                    order.orderSource === "phone" &&
                                    order.guestPhone ? (
                                      <p className="mt-1 text-xs text-info">
                                        請通知顧客取餐。
                                      </p>
                                    ) : null}
                                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                                      {order.items.slice(0, 3).map((detail) => (
                                        <li
                                          key={`${order.id}-${detail.item.id}`}
                                        >
                                          {detail.item.name} x {detail.qty}
                                          {detail.memberName
                                            ? ` / ${detail.memberName}`
                                            : ""}
                                          {detail.bundleName
                                            ? ` / 套餐：${detail.bundleName}`
                                            : ""}
                                        </li>
                                      ))}
                                      {order.items.length > 3 ? (
                                        <li>
                                          +{order.items.length - 3} more items
                                        </li>
                                      ) : null}
                                    </ul>
                                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-semibold">
                                        ${order.total}
                                      </span>
                                      <button
                                        className="btn btn-xs btn-outline"
                                        onClick={() => printReceipt(order)}
                                      >
                                        收據
                                      </button>
                                    </div>
                                    {order.paymentStatus === "unpaid" &&
                                    order.status !== "pending" &&
                                    canUpdatePaymentStatus ? (
                                      <button
                                        className="btn btn-xs btn-outline mt-2 w-full"
                                        disabled={
                                          paymentUpdatingOrderId === order.id
                                        }
                                        onClick={() => {
                                          void markOrderPaid(order.id);
                                        }}
                                      >
                                        {paymentUpdatingOrderId === order.id
                                          ? "更新中..."
                                          : "標記已付款"}
                                      </button>
                                    ) : null}
                                    {primaryAction ? (
                                      <button
                                        className="btn btn-xs btn-primary mt-2 w-full"
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
                                          ? "更新中..."
                                          : primaryAction.label}
                                      </button>
                                    ) : null}
                                    {canCancelThisOrder ? (
                                      <button
                                        className="btn btn-xs btn-error btn-outline mt-2 w-full"
                                        disabled={
                                          cancelUpdatingOrderId === order.id
                                        }
                                        onClick={() => {
                                          void cancelOrder(order.id, "manager");
                                        }}
                                      >
                                        {cancelUpdatingOrderId === order.id
                                          ? "Cancelling..."
                                          : "Void order"}
                                      </button>
                                    ) : null}
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paginatedManagerVisibleOrders.map((order) => {
                      const allowedStatuses = getNextAllowedStatuses(order);
                      const primaryAction = getPrimaryOrderAction(order);
                      const urgent = isUrgentOrder(order);
                      const orderAgeMinutes = getOrderAgeMinutes(order);
                      const readyAgeMinutes = getReadyAgeMinutes(order);
                      const readyPickupOverdue = isReadyPickupOverdue(order);
                      const managerFlowHint = getManagerOrderFlowHint(order);
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
                      const hasOrderOperationHints =
                        (order.orderSource === "phone" &&
                          Boolean(order.guestPhone)) ||
                        (order.issueType !== null &&
                          order.status !== "completed" &&
                          order.status !== "cancelled") ||
                        Boolean(order.promoCode) ||
                        order.discountAmount > 0;

                      return (
                        <article
                          key={order.id}
                          className={`rounded-box border bg-base-100 p-4 transition ${
                            order.id === recentlyUpdatedOrderId
                              ? "border-primary ring-2 ring-primary bg-primary/5"
                              : "border-base-300"
                          }`}
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
                                {formatOrderStatus(order.status)}
                              </span>
                              {urgent ? (
                                <span className="badge badge-error">
                                  緊急 {orderAgeMinutes} 分
                                </span>
                              ) : null}
                              {managerFlowHint ? (
                                <span className="badge badge-outline">
                                  {managerFlowHint}
                                </span>
                              ) : null}
                              {readyPickupOverdue ? (
                                <span className="badge badge-error">
                                  取餐逾時
                                  {readyAgeMinutes !== null
                                    ? ` ${readyAgeMinutes}m`
                                    : ""}
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
                                    void cancelOrder(order.id, "manager");
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
                                    ? "更新中..."
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
                                      {formatOrderStatus(status)}
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
                                      ? "更新中..."
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
                              來源：{formatOrderSource(order.orderSource)}
                            </span>
                            {order.isGroupOrder ? (
                              <span>
                                Group: {order.groupName || "Group order"}
                              </span>
                            ) : null}
                            {(order.orderSource === "walk_in" ||
                              order.orderSource === "phone") &&
                            order.guestName ? (
                              <span>顧客：{order.guestName}</span>
                            ) : null}
                            {order.guestPhone ? (
                              <span>Phone: {order.guestPhone}</span>
                            ) : null}
                            <span>取餐方式：{formatFulfillmentType(order.fulfillmentType)}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>Payment: {order.paymentMethod}</span>
                              <span
                                className={`badge ${
                                  order.paymentStatus === "paid"
                                    ? "badge-success"
                                    : "badge-warning"
                                }`}
                              >
                                {formatPaymentStatus(order.paymentStatus)}
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
                                    ? "更新中..."
                                    : "標記已付款"}
                                </button>
                              ) : null}
                            </div>
                            {order.pickupTime ? (
                              <span>
                                取餐時間：{formatCheckoutDateTime(order.pickupTime)}
                              </span>
                            ) : null}
                            {order.paymentStatus === "unpaid" &&
                            (order.status === "ready" ||
                              order.status === "completed") ? (
                              <span className="text-warning">
                                取餐前請收款。
                              </span>
                            ) : null}
                            {readyPickupOverdue ? (
                              <span className="text-error">
                                取餐已逾時。
                              </span>
                            ) : null}
                            {order.status === "ready" &&
                            order.paymentStatus === "unpaid" ? (
                              <span className="text-warning">
                                取餐前請確認付款。
                              </span>
                            ) : null}
                            {order.status === "ready" &&
                            order.orderSource === "phone" &&
                            order.guestPhone ? (
                              <span className="text-info">
                                請通知顧客取餐。
                              </span>
                            ) : null}
                            {order.customerNote ? (
                              <span className="md:col-span-2">
                                備註：{order.customerNote}
                              </span>
                            ) : null}
                            {order.discountAmount > 0 || order.promoCode ? (
                              <span className="md:col-span-2">
                                優惠碼 {order.promoCode ?? "-"}：原始金額 $
                                {order.subtotal}，折扣 -$
                                {order.discountAmount}
                              </span>
                            ) : null}
                          </div>
                          {hasOrderOperationHints ? (
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              {order.orderSource === "phone" &&
                              order.guestPhone ? (
                                <span className="rounded-box border border-base-300 px-2 py-1">
                                  電話訂單：若取餐時間變動，請通知顧客。
                                </span>
                              ) : null}
                              {order.issueType !== null &&
                              order.status !== "completed" &&
                              order.status !== "cancelled" ? (
                                <span className="rounded-box border border-warning px-2 py-1 text-warning">
                                  Resolve issue before completion.
                                </span>
                              ) : null}
                              {order.promoCode || order.discountAmount > 0 ? (
                                <span className="rounded-box border border-success px-2 py-1 text-success">
                                  Discount applied in receipt and analytics
                                  total.
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {order.issueType ? (
                            <div className="alert alert-warning mt-3 items-start">
                              <div>
                                <div className="font-semibold">
                                  問題：{order.issueType}
                                </div>
                                {order.issueNote ? (
                                  <div className="text-sm">
                                    備註：{order.issueNote}
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
                                    ? "更新中..."
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
                                  placeholder="問題備註"
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
                                    ? "儲存中..."
                                    : "標記問題"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                            {order.items.map((detail) => (
                              <li key={`${order.id}-${detail.item.id}`}>
                                {detail.item.name} x {detail.qty}
                                {detail.memberName
                                  ? ` / ${detail.memberName}`
                                  : ""}
                                {detail.bundleName
                                  ? ` / 套餐：${detail.bundleName}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-right font-bold">
                            總金額 ${order.total}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
                </>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {hasManagerTools && mainView === "manager" && managerTab === "roleRequests" && isAdmin ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">權限申請審核</h2>
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
                  <option value="pending">待審核</option>
                  <option value="approved">已核准</option>
                  <option value="rejected">已拒絕</option>
                  <option value="all">全部</option>
                </select>
              </div>
              {adminMessage ? (
                <div className="alert">
                  <span>{adminMessage}</span>
                </div>
              ) : null}
              <div className="rounded-box border border-base-300 bg-base-200 p-4">
                <h3 className="font-semibold">直接調整使用者角色</h3>
                <p className="text-sm opacity-70">
                  這會直接覆蓋使用者角色；如果該使用者仍需以顧客身份點餐，請保留「顧客」。
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  <input
                    className="input input-bordered input-sm"
                    placeholder="使用者 ID"
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
                        <span className="label-text">{formatRoleLabel(role)}</span>
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
                    {adminRoleBusy ? "更新中..." : "更新角色"}
                  </button>
                </div>
              </div>
              {adminLoading ? (
                <div className="alert">
                  <span>權限申請載入中...</span>
                </div>
              ) : adminRequests.length === 0 ? (
                <div className="alert alert-info">
                  <span>目前沒有權限申請。</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>使用者</th>
                        <th>申請角色</th>
                        <th>狀態</th>
                        <th>原因</th>
                        <th>審核</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminRequests.map((request) => (
                        <tr
                          className={
                            request.id === recentlyUpdatedRoleRequestId
                              ? "bg-primary/10"
                              : ""
                          }
                          key={request.id}
                        >
                          <td>{request.id}</td>
                          <td className="max-w-48 truncate">{request.userId}</td>
                          <td>{formatRoleLabel(request.requestedRole)}</td>
                          <td>
                            <span className="badge">
                              {request.status === "pending"
                                ? "待審核"
                                : request.status === "approved"
                                  ? "已核准"
                                  : "已拒絕"}
                            </span>
                          </td>
                          <td className="max-w-xs">{request.reason}</td>
                          <td>
                            {request.status === "pending" ? (
                              <div className="flex flex-col gap-2 min-w-56">
                                <input
                                  className="input input-bordered input-sm"
                                  placeholder="審核備註（可不填）"
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
                                    核准
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
                                    拒絕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm opacity-70">
                                {request.reviewNote || "已審核"}
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

        {hasManagerTools && mainView === "manager" && managerTab === "auditLogs" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">操作紀錄</h2>
                  <p className="text-sm opacity-70">
                    查看老闆與管理者近期的重要系統操作。
                  </p>
                  <p className="text-xs opacity-60">
                    查看管理者與員工的重要操作紀錄，例如菜單、權限、優惠券、付款、問題回報與電話訂單。
                  </p>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={auditLogsLoading}
                  onClick={refreshAuditLogsWithToast}
                >
                  {auditLogsLoading ? "載入中..." : "重新整理"}
                </button>
              </div>
              <div className="rounded-box border border-base-300 bg-base-200 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
                  <label className="form-control">
                    <span className="label-text">操作類型</span>
                    <select
                      className="select select-bordered select-sm"
                      value={auditLogActionFilter}
                      onChange={(event) =>
                        setAuditLogActionFilter(
                          event.target.value as "" | AuditLogAction,
                        )
                      }
                    >
                      <option value="">全部操作</option>
                      {auditLogActionOptions.map((action) => (
                        <option key={action} value={action}>
                          {formatAuditAction(action)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text">目標類型</span>
                    <select
                      className="select select-bordered select-sm"
                      value={auditLogTargetTypeFilter}
                      onChange={(event) =>
                        setAuditLogTargetTypeFilter(
                          event.target.value as "" | AuditLogTargetType,
                        )
                      }
                    >
                      <option value="">全部目標</option>
                      {auditLogTargetTypeOptions.map((targetType) => (
                        <option key={targetType} value={targetType}>
                          {formatAuditTargetType(targetType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text">日期範圍</span>
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
                    <span className="label-text">筆數</span>
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
                    <span className="label-text">操作人</span>
                    <input
                      className="input input-bordered input-sm"
                      placeholder="姓名或使用者 ID"
                      value={auditLogActorFilter}
                      onChange={(event) =>
                        setAuditLogActorFilter(event.target.value)
                      }
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text">目標 ID</span>
                    <input
                      className="input input-bordered input-sm"
                      placeholder="訂單、菜單、使用者..."
                      value={auditLogTargetIdFilter}
                      onChange={(event) =>
                        setAuditLogTargetIdFilter(event.target.value)
                      }
                    />
                  </label>
                  <button
                    className="btn btn-sm btn-primary self-end"
                    disabled={auditLogsLoading}
                    onClick={refreshAuditLogsWithToast}
                  >
                    套用
                  </button>
                  <button
                    className="btn btn-sm btn-ghost self-end"
                    disabled={auditLogsLoading}
                    onClick={resetAuditLogFilters}
                  >
                    重設篩選
                  </button>
                </div>
                {auditLogRange === "custom" ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="form-control">
                      <span className="label-text">開始日期</span>
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
                      <span className="label-text">結束日期</span>
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
                  <span>操作紀錄載入中...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="alert alert-info">
                  <span>沒有符合條件的操作紀錄。</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>時間</th>
                        <th>操作人</th>
                        <th>操作</th>
                        <th>目標</th>
                        <th>訊息</th>
                        <th>詳細資料</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAuditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap">
                            {formatCheckoutDateTime(log.createdAt)}
                          </td>
                          <td>
                            <div>{log.actorName ?? "-"}</div>
                            <div className="text-xs opacity-60">
                              {log.actorRoles.length > 0
                                ? log.actorRoles.map(formatRoleLabel).join(", ")
                                : "無角色"}
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
                                  查看詳細資料
                                </summary>
                                <p className="mt-2 text-xs opacity-70">
                                  {formatAuditMetadata(log.metadata)}
                                </p>
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
              {auditLogs.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>
                    第 {currentAuditLogPage} / {auditLogPageCount} 頁，共{" "}
                    {auditLogs.length} 筆
                  </span>
                  <div className="join">
                    <button
                      className="btn btn-sm join-item"
                      disabled={currentAuditLogPage <= 1}
                      onClick={() =>
                        setAuditLogPage((page) => Math.max(1, page - 1))
                      }
                    >
                      上一頁
                    </button>
                    <button
                      className="btn btn-sm join-item"
                      disabled={currentAuditLogPage >= auditLogPageCount}
                      onClick={() =>
                        setAuditLogPage((page) =>
                          Math.min(auditLogPageCount, page + 1),
                        )
                      }
                    >
                      下一頁
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {hasManagerTools && mainView === "manager" && managerTab === "analytics" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">營運分析</h2>
                  <p className="text-sm opacity-70">
                    查看訂單數、營收、熱銷商品、優惠券使用與顧客評價。
                  </p>
                  <p className="text-xs opacity-60">
                    顯示範圍：{analyticsRangeLabel}
                  </p>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={analyticsLoading}
                  onClick={refreshAnalyticsWithToast}
                >
                  {analyticsLoading ? "載入中..." : "重新整理分析"}
                </button>
              </div>
              <div className="rounded-box border border-base-300 bg-base-200 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="form-control w-full sm:w-48">
                    <span className="label-text">日期範圍</span>
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
                        <span className="label-text">開始日期</span>
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
                        <span className="label-text">結束日期</span>
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
                    套用
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 rounded-box border border-base-300 bg-base-200 p-2">
                {[
                  { id: "overview" as const, label: "營運總覽" },
                  { id: "promotions" as const, label: "優惠券成效" },
                  { id: "issues" as const, label: "問題分析" },
                  { id: "items" as const, label: "熱銷商品" },
                  { id: "sources" as const, label: "訂單來源" },
                  { id: "ratings" as const, label: "顧客評價" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`btn btn-sm ${
                      analyticsSubTab === tab.id ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => setAnalyticsSubTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <details
                className={`collapse collapse-arrow border border-base-300 bg-base-100 ${
                  analyticsSubTab === "overview" ? "" : "hidden"
                }`}
              >
                <summary className="collapse-title font-semibold">
                  資料說明與指標定義
                </summary>
                <div className="collapse-content text-sm">
                  <ul className="list-disc space-y-1 pl-5 opacity-75">
                    <li>營收採用折扣後的訂單總金額。</li>
                    <li>
                      訂單來源比較包含會員、現場、電話與訪客訂單。
                    </li>
                    <li>測試分組分析使用訂單送出當下的快照分組。</li>
                    <li>價格敏感度使用訂單餐點快照價格。</li>
                    <li>已取消訂單不列入營收指標。</li>
                  </ul>
                </div>
              </details>
              {analyticsMessage ? (
                <div className="alert alert-warning">
                  <span>{analyticsMessage}</span>
                </div>
              ) : null}
              {analyticsSummary ? (
                <div
                  className={`space-y-4 ${
                    analyticsSubTab === "overview" ? "" : "hidden"
                  }`}
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">總營收</div>
                      <div className="stat-value text-success">
                        ${analyticsSummary.totalRevenue}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">今日營收</div>
                      <div className="stat-value text-primary">
                        ${analyticsSummary.todayRevenue}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">營收訂單</div>
                      <div className="stat-value">
                        {analyticsSummary.revenueOrderCount}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">平均客單價</div>
                      <div className="stat-value">
                        ${analyticsSummary.averageOrderValue.toFixed(0)}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">平均評價</div>
                      <div className="stat-value text-warning">
                        {analyticsSummary.averageRating === null
                          ? "-"
                          : analyticsSummary.averageRating.toFixed(1)}
                      </div>
                      <div className="stat-desc">
                        {analyticsSummary.ratingsCount} 筆評價
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">取消訂單</div>
                      <div className="stat-value text-error">
                        {analyticsSummary.cancellationCount}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">團體訂單</div>
                      <div className="stat-value text-info">
                        {analyticsSummary.groupOrders}
                      </div>
                      <div className="stat-desc">
                        營收 ${analyticsSummary.groupRevenue}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">套餐訂單</div>
                      <div className="stat-value text-secondary">
                        {analyticsSummary.bundleOrders}
                      </div>
                      <div className="stat-desc">
                        套餐金額 ${analyticsSummary.bundleRevenue}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">啟用原料</div>
                      <div className="stat-value text-primary">
                        {analyticsSummary.activeIngredientCount}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">低庫存 / 缺料</div>
                      <div className="stat-value text-warning">
                        {analyticsSummary.lowStockIngredientCount} /{" "}
                        {analyticsSummary.outOfStockIngredientCount}
                      </div>
                    </div>
                    <div className="stat rounded-box border border-base-300 bg-base-200">
                      <div className="stat-title">受影響餐點</div>
                      <div className="stat-value text-error">
                        {analyticsSummary.affectedMenuItemCount}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <div className="rounded-box border border-base-300 p-3">
                      <h3 className="mb-2 font-semibold">付款方式</h3>
                      <p>現金：{analyticsSummary.paymentMethods.cash}</p>
                      <p>刷卡：{analyticsSummary.paymentMethods.card}</p>
                      <p>線上付款：{analyticsSummary.paymentMethods.online}</p>
                    </div>
                    <div className="rounded-box border border-base-300 p-3">
                      <h3 className="mb-2 font-semibold">付款狀態</h3>
                      <p>已付款：{analyticsSummary.paymentStatuses.paid}</p>
                      <p>未付款：{analyticsSummary.paymentStatuses.unpaid}</p>
                    </div>
                    <div className="rounded-box border border-base-300 p-3">
                      <h3 className="mb-2 font-semibold">訂單狀態</h3>
                      <p>
                        已送出：{analyticsSummary.orderStatuses.submitted}
                      </p>
                      <p>
                        製作中：{analyticsSummary.orderStatuses.preparing}
                      </p>
                      <p>可取餐：{analyticsSummary.orderStatuses.ready}</p>
                      <p>
                        已完成：{analyticsSummary.orderStatuses.completed}
                      </p>
                      <p>
                        已取消：{analyticsSummary.orderStatuses.cancelled}
                      </p>
                    </div>
                    <div className="rounded-box border border-base-300 p-3">
                      <h3 className="mb-2 font-semibold">訂單來源</h3>
                      <p>會員：{analyticsSummary.orderSources.customer}</p>
                      <p>現場：{analyticsSummary.orderSources.walk_in}</p>
                      <p>電話：{analyticsSummary.orderSources.phone}</p>
                      <p>訪客：{analyticsSummary.orderSources.guest}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="alert">
                  <span>
                    {analyticsLoading
                      ? "營運摘要載入中..."
                      : "目前沒有營運摘要資料。"}
                  </span>
                </div>
              )}
              <div
                className={`space-y-4 rounded-box border border-base-300 bg-base-100 p-4 ${
                  analyticsSubTab === "overview" ? "" : "hidden"
                }`}
              >
                <div>
                  <h3 className="font-semibold">營運趨勢</h3>
                  <p className="text-sm opacity-70">
                    查看所選期間的每日營收、尖峰時段、評價與取消率。
                  </p>
                </div>
                {analyticsTrends ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="stat rounded-box border border-base-300 bg-base-200">
                        <div className="stat-title">取消率</div>
                        <div className="stat-value text-error">
                          {(analyticsTrends.cancellationRate * 100).toFixed(1)}
                          %
                        </div>
                        <div className="stat-desc">
                          已取消 / 正式訂單
                        </div>
                      </div>
                      <div className="rounded-box border border-base-300 bg-base-200 p-4">
                        <h4 className="mb-2 font-semibold">
                          評價分布
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
                                  <span>{rating} 星</span>
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
                          低分評價：{analyticsTrends.lowRatingCount}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div>
                        <h4 className="mb-2 font-semibold">
                          每日營收趨勢
                        </h4>
                        {analyticsTrends.dailyRevenue.length === 0 ? (
                          <div className="alert">
                            <span>目前沒有每日趨勢資料。</span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>日期</th>
                                  <th>營收</th>
                                  <th>訂單</th>
                                  <th>趨勢</th>
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
                          時段訂單趨勢
                        </h4>
                        {activeHourlyRows === 0 ? (
                          <div className="alert">
                            <span>目前沒有時段趨勢資料。</span>
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
                                    {row.orderCount} 筆
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
                                  營收：${row.revenue}
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
                        ? "趨勢資料載入中..."
                        : "目前沒有趨勢資料。"}
                    </span>
                  </div>
                )}
              </div>
              <div
                className={`space-y-4 rounded-box border border-base-300 bg-base-100 p-4 ${
                  analyticsSubTab === "sources" ? "" : "hidden"
                }`}
              >
                <div>
                  <h3 className="font-semibold">營運洞察</h3>
                  <p className="text-sm opacity-70">
                    查看尖峰時段、訂單來源與付款方式，掌握營運組成。
                  </p>
                </div>
                {analyticsInsights ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                      <div className="stat rounded-box border border-base-300 bg-base-200">
                        <div className="stat-title">尖峰時段</div>
                        {analyticsInsights.peakHour.hour === null ? (
                          <>
                            <div className="stat-value text-base">-</div>
                            <div className="stat-desc">目前沒有尖峰資料</div>
                          </>
                        ) : (
                          <>
                            <div className="stat-value text-primary">
                              {formatTrendHour(analyticsInsights.peakHour.hour)}
                            </div>
                            <div className="stat-desc">
                              {analyticsInsights.peakHour.orderCount} 筆 /
                              ${analyticsInsights.peakHour.revenue}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="rounded-box border border-base-300 bg-base-200 p-4">
                        <h4 className="mb-2 font-semibold">
                          訂單來源比較
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="table table-sm">
                            <thead>
                              <tr>
                                <th>來源</th>
                                <th>訂單</th>
                                <th>營收</th>
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
                          付款方式
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="table table-sm">
                            <thead>
                              <tr>
                                <th>方式</th>
                                <th>訂單</th>
                                <th>營收</th>
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
                        : "目前沒有洞察資料。"}
                    </span>
                  </div>
                )}
              </div>
              <div
                className={`space-y-4 rounded-box border border-base-300 bg-base-100 p-4 ${
                  analyticsSubTab === "promotions" ? "" : "hidden"
                }`}
              >
                <div>
                  <h3 className="text-xl font-bold">優惠券成效</h3>
                  <p className="text-sm opacity-70">
                    比較優惠碼使用次數、折扣金額與實際營收。
                  </p>
                </div>
                {promotionPerformanceRows.length === 0 ? (
                  <div className="alert">
                    <span>此範圍目前沒有優惠券使用資料。</span>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>優惠碼</th>
                            <th>狀態</th>
                            <th>有效狀態</th>
                            <th>使用訂單</th>
                            <th>最低消費</th>
                            <th>使用上限</th>
                            <th>有效期間</th>
                            <th>原始金額</th>
                            <th>折扣</th>
                            <th>實收金額</th>
                            <th>平均客單價</th>
                            <th>最後使用</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedPromotionPerformanceRows.map((row) => {
                          const promotion = promotions.find(
                            (candidate) =>
                              candidate.code.trim().toUpperCase() === row.code,
                          );
                          const runtimeStatus = promotion
                            ? getPromotionRuntimeStatus(promotion, row.usedOrders)
                            : null;

                          return (
                          <tr key={row.code}>
                            <td className="font-semibold">{row.code}</td>
                            <td>
                              <span
                                className={`badge ${
                                  row.isActive === null
                                    ? "badge-neutral"
                                    : row.isActive
                                      ? "badge-success"
                                      : "badge-warning"
                                }`}
                              >
                                  {row.isActive === null
                                    ? "未知"
                                    : row.isActive
                                      ? "啟用中"
                                      : "停用中"}
                              </span>
                            </td>
                            <td>
                              {runtimeStatus ? (
                                <span
                                  className={`badge ${getPromotionRuntimeStatusBadgeClass(
                                    runtimeStatus,
                                  )}`}
                                >
                                  {getPromotionRuntimeStatusLabel(runtimeStatus)}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td>{row.usedOrders}</td>
                            <td>
                              {row.minOrderAmount === null
                                ? "-"
                                : `$${row.minOrderAmount}`}
                            </td>
                            <td>
                              {row.usageLimit === null
                                ? "無限制"
                                : `${row.usedOrders} / ${row.usageLimit}`}
                            </td>
                            <td>
                              <div className="text-xs">
                                <div>
                                  {row.startsAt
                                    ? formatCheckoutDateTime(row.startsAt)
                                    : "立即生效"}
                                </div>
                                <div>
                                  {row.endsAt
                                    ? formatCheckoutDateTime(row.endsAt)
                                    : "無結束時間"}
                                </div>
                              </div>
                            </td>
                            <td>${row.totalSubtotal}</td>
                            <td>${row.totalDiscount}</td>
                            <td>${row.totalRevenue}</td>
                            <td>${row.averageOrderValue.toFixed(0)}</td>
                            <td>
                              {row.lastUsedAt
                                ? formatCheckoutDateTime(row.lastUsedAt)
                                : "-"}
                            </td>
                          </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span>
                        第 {currentPromotionPerformancePage} /{" "}
                        {promotionPerformancePageCount} 頁，共{" "}
                        {promotionPerformanceRows.length} 筆
                      </span>
                      <div className="join">
                        <button
                          className="btn btn-sm join-item"
                          disabled={currentPromotionPerformancePage <= 1}
                          onClick={() =>
                            setPromotionPerformancePage((page) =>
                              Math.max(1, page - 1),
                            )
                          }
                        >
                          上一頁
                        </button>
                        <button
                          className="btn btn-sm join-item"
                          disabled={
                            currentPromotionPerformancePage >=
                            promotionPerformancePageCount
                          }
                          onClick={() =>
                            setPromotionPerformancePage((page) =>
                              Math.min(promotionPerformancePageCount, page + 1),
                            )
                          }
                        >
                          下一頁
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div
                className={`space-y-4 rounded-box border border-base-300 bg-base-100 p-4 ${
                  analyticsSubTab === "issues" ? "" : "hidden"
                }`}
              >
                <div>
                  <h3 className="text-xl font-bold">問題分析</h3>
                  <p className="text-sm opacity-70">
                    查看廚房與櫃台回報問題的數量與比例。
                  </p>
                </div>
                {issueSummary.totalIssueOrders === 0 ? (
                  <div className="alert">
                    <span>此範圍目前沒有問題訂單資料。</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div className="stat rounded-box border border-base-300 bg-base-200">
                        <div className="stat-title">問題訂單</div>
                        <div className="stat-value">
                          {issueSummary.totalIssueOrders}
                        </div>
                      </div>
                      <div className="stat rounded-box border border-base-300 bg-base-200">
                        <div className="stat-title">未處理問題</div>
                        <div className="stat-value text-warning">
                          {issueSummary.openIssueOrders}
                        </div>
                      </div>
                      <div className="stat rounded-box border border-base-300 bg-base-200">
                        <div className="stat-title">已解決問題</div>
                        <div className="stat-value text-success">
                          {issueSummary.resolvedIssueOrders}
                        </div>
                      </div>
                      <div className="stat rounded-box border border-base-300 bg-base-200">
                        <div className="stat-title">問題比例</div>
                        <div className="stat-value text-error">
                          {(issueSummary.issueRate * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className="overflow-x-auto">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>問題類型</th>
                              <th>數量</th>
                              <th>未處理</th>
                              <th>已完成</th>
                              <th>已取消</th>
                            </tr>
                          </thead>
                          <tbody>
                            {issueTypeRows.map((row) => (
                              <tr key={row.issueType}>
                                <td>{row.issueType}</td>
                                <td>{row.count}</td>
                                <td>{row.openCount}</td>
                                <td>{row.completedCount}</td>
                                <td>{row.cancelledCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>來源</th>
                              <th>問題訂單</th>
                              <th>總訂單</th>
                              <th>問題比例</th>
                            </tr>
                          </thead>
                          <tbody>
                            {issueSourceRows.map((row) => (
                              <tr key={row.source}>
                                <td>{formatOrderSource(row.source)}</td>
                                <td>{row.issueOrders}</td>
                                <td>{row.totalOrders}</td>
                                <td>{(row.issueRate * 100).toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <details
                className={`collapse collapse-arrow border border-base-300 bg-base-100 ${
                  analyticsSubTab === "sources" ? "" : "hidden"
                }`}
              >
                <summary className="collapse-title font-semibold">
                  員工操作摘要
                </summary>
                <div className="collapse-content space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm opacity-70">
                      此摘要來自操作紀錄，可查看員工與管理者近期完成的後台操作。
                    </p>
                    <button
                      className="btn btn-sm btn-outline"
                      disabled={operationAuditLogsLoading}
                      onClick={() => {
                        void loadOperationAuditLogs(undefined, {
                          notify: true,
                        });
                      }}
                    >
                      {operationAuditLogsLoading
                        ? "載入中..."
                        : "重新整理操作紀錄"}
                    </button>
                  </div>
                  {operationAuditLogsLoading ? (
                    <div className="alert">
                      <span>員工操作資料載入中...</span>
                    </div>
                  ) : operationAuditLogsMessage ? (
                    <div className="alert alert-warning">
                      <span>{operationAuditLogsMessage}</span>
                    </div>
                  ) : operationAuditLogs.length === 0 ? (
                    <div className="alert alert-info">
                      <span>尚未載入員工操作紀錄。</span>
                    </div>
                  ) : staffOperationRows.length === 0 ? (
                    <div className="alert alert-info">
                      <span>此範圍沒有員工操作資料。</span>
                    </div>
                  ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>操作人</th>
                          <th>總操作</th>
                          <th>現場單</th>
                          <th>電話單</th>
                          <th>付款</th>
                          <th>狀態更新</th>
                          <th>問題處理</th>
                          <th>菜單變更</th>
                          <th>優惠券</th>
                          <th>權限變更</th>
                          <th>最後操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffOperationRows.map((row) => (
                          <tr key={row.actorLabel}>
                            <td>{row.actorLabel}</td>
                            <td>{row.totalActions}</td>
                            <td>{row.staffOrdersCreated}</td>
                            <td>{row.phoneOrdersCreated}</td>
                            <td>{row.paymentsUpdated}</td>
                            <td>{row.statusesUpdated}</td>
                            <td>{row.issuesHandled}</td>
                            <td>{row.menuChanges}</td>
                            <td>{row.promotionChanges}</td>
                            <td>{row.roleChanges}</td>
                            <td>
                              {row.lastActionAt
                                ? formatCheckoutDateTime(row.lastActionAt)
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              </details>
              <details
                className={`collapse collapse-arrow border border-base-300 bg-base-100 ${
                  analyticsSubTab === "items" ? "" : "hidden"
                }`}
              >
                <summary className="collapse-title font-semibold">
                  價格敏感度
                </summary>
                <div className="collapse-content space-y-4">
                  <p className="text-sm opacity-70">
                    比較同一餐點在不同歷史價格下的銷量與營收。
                  </p>
                {priceSensitivity.length === 0 ? (
                  <div className="alert">
                    <span>此範圍沒有價格敏感度資料。</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>餐點</th>
                          <th>分類</th>
                          <th>目前價格</th>
                          <th>總數量</th>
                          <th>總營收</th>
                          <th>價格紀錄</th>
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
                                    ${point.price}：售出 {point.quantity} / $
                                    {point.revenue} / {point.orderCount} 筆
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
              </details>
              <details
                className={`collapse collapse-arrow border border-base-300 bg-base-100 ${
                  analyticsSubTab === "sources" ? "" : "hidden"
                }`}
              >
                <summary className="collapse-title font-semibold">
                  測試分組分析
                </summary>
                <div className="collapse-content space-y-4">
                  <p className="text-sm opacity-70">
                    比較控制組與不同菜單測試分組的訂單與營收。
                  </p>
                {abTestAnalytics.length === 0 ? (
                  <div className="alert">
                    <span>此範圍沒有測試分組資料。</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>分組</th>
                          <th>訂單</th>
                          <th>數量</th>
                          <th>營收</th>
                          <th>平均客單價</th>
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
              </details>
              {!analyticsLoading &&
              categorySales.length === 0 &&
              topItemSales.length === 0 ? (
                <div className="alert alert-info">
                  <span>此範圍沒有分類或熱銷商品資料。</span>
                </div>
              ) : null}
              <details
                className={`collapse collapse-arrow border border-base-300 bg-base-100 ${
                  analyticsSubTab === "items" ? "" : "hidden"
                }`}
              >
                <summary className="collapse-title font-semibold">
                  熱銷商品與分類銷售
                </summary>
                <div className="collapse-content grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">分類銷售</h3>
                  {categorySales.length === 0 ? (
                    <div className="alert">
                      <span>此範圍沒有分類銷售資料。</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>分類</th>
                            <th>數量</th>
                            <th>營收</th>
                            <th>訂單</th>
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
                    <h3 className="font-semibold mb-2">熱銷商品</h3>
                  {topItemSales.length === 0 ? (
                    <div className="alert">
                      <span>目前沒有熱銷商品資料。</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>排名</th>
                            <th>名稱</th>
                            <th>分類</th>
                            <th>數量</th>
                            <th>營收</th>
                            <th>訂單</th>
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
              </details>
              <div className={`mt-4 ${analyticsSubTab === "ratings" ? "" : "hidden"}`}>
                <h3 className="text-xl font-bold mb-2">顧客評價</h3>
                {ratedOrders.length === 0 ? (
                  <div className="alert">
                    <span>目前沒有顧客評價。</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>取餐號</th>
                          <th>訂單</th>
                          <th>評分</th>
                          <th>留言</th>
                          <th>評價時間</th>
                          <th>總金額</th>
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

        {hasManagerTools && mainView === "manager" && managerTab === "menu" && canManageMenu ? (
          <section className="mb-8 space-y-4">
            <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
              <h2 className="text-2xl font-bold">菜單管理</h2>
              <p className="text-sm opacity-70">
                新增、編輯、停售餐點，並管理套餐組合。
              </p>
              <div className="mt-3 flex flex-wrap gap-2 rounded-box border border-base-300 bg-base-200 p-2">
                {[
                  { id: "items" as const, label: "餐點管理" },
                  { id: "bundles" as const, label: "套餐管理" },
                  { id: "list" as const, label: "菜單列表" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`btn btn-sm ${
                      menuSubTab === tab.id ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => setMenuSubTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <form
              className={`card bg-base-100 shadow-sm border border-base-300 ${
                menuSubTab === "items" ? "" : "hidden"
              }`}
              onSubmit={(event) => {
                void submitMenuForm(event);
              }}
            >
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">餐點管理</h2>
                  <p className="text-sm opacity-70">
                    新增或修改餐點，並設定分類與顯示資訊。
                  </p>
                </div>
                {editingMenuId ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={resetMenuForm}
                  >
                    取消編輯
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  className="input input-bordered"
                  placeholder="餐點名稱"
                  value={menuForm.name}
                  onChange={(event) => updateMenuForm("name", event.target.value)}
                  required
                />
                <input
                  className="input input-bordered"
                  placeholder="價格"
                  type="number"
                  min={0}
                  step={1}
                  value={menuForm.price}
                  onChange={(event) => updateMenuForm("price", event.target.value)}
                  required
                />
                <input
                  className="input input-bordered"
                  placeholder="分類"
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
                  <option value="">未設定主要分類</option>
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
                  placeholder="餐點描述"
                  value={menuForm.description}
                  onChange={(event) =>
                    updateMenuForm("description", event.target.value)
                  }
                  required
                />
                <input
                  className="input input-bordered"
                  placeholder="圖片網址"
                  value={menuForm.image_url}
                  onChange={(event) =>
                    updateMenuForm("image_url", event.target.value)
                  }
                  required
                />
                {editingMenuId ? (
                  <input
                    className="input input-bordered md:col-span-2"
                    placeholder="變更原因"
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
                  ? "儲存中..."
                  : editingMenuId
                    ? "儲存變更"
                    : "新增餐點"}
              </button>
              </div>
            </form>
            <form
              className={`card bg-base-100 shadow-sm border border-base-300 ${
                menuSubTab === "bundles" ? "" : "hidden"
              }`}
              onSubmit={(event) => {
                void submitMenuBundleForm(event);
              }}
            >
              <div className="card-body">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="card-title">套餐管理</h2>
                    <p className="text-sm opacity-70">
                      建立套餐組合，顧客點套餐時會自動帶入套餐內餐點。
                    </p>
                  </div>
                  {editingMenuBundleId ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={resetMenuBundleForm}
                    >
                      取消編輯
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <input
                    className="input input-bordered input-sm"
                    placeholder="套餐名稱"
                    value={menuBundleForm.name}
                    onChange={(event) =>
                      setMenuBundleForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                  />
                  <input
                    className="input input-bordered input-sm"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    type="text"
                    placeholder="套餐價格"
                    value={menuBundleForm.price}
                    onChange={(event) =>
                      setMenuBundleForm((current) => ({
                        ...current,
                        price: event.target.value.replace(/\D/g, ""),
                      }))
                    }
                    required
                  />
                  <input
                    className="input input-bordered input-sm"
                    min={0}
                    step={1}
                    type="number"
                    placeholder="顯示排序"
                    value={menuBundleForm.displayOrder}
                    onChange={(event) =>
                      setMenuBundleForm((current) => ({
                        ...current,
                        displayOrder: event.target.value,
                      }))
                    }
                  />
                  <label className="label cursor-pointer justify-start gap-2 p-0">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={menuBundleForm.isActive}
                      onChange={(event) =>
                        setMenuBundleForm((current) => ({
                          ...current,
                          isActive: event.target.checked,
                        }))
                      }
                    />
                    <span className="label-text">啟用中</span>
                  </label>
                  <input
                    className="input input-bordered input-sm md:col-span-2 lg:col-span-4"
                    placeholder="套餐描述"
                    value={menuBundleForm.description}
                    onChange={(event) =>
                      setMenuBundleForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="select select-bordered select-sm min-w-52 flex-1"
                    value={menuBundleSelectedItemId}
                    onChange={(event) =>
                      setMenuBundleSelectedItemId(event.target.value)
                    }
                  >
                    <option value="">選擇餐點</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} - ${item.price}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input input-bordered input-sm w-24"
                    min={1}
                    max={99}
                    step={1}
                    type="number"
                    value={menuBundleSelectedQty}
                    onChange={(event) =>
                      setMenuBundleSelectedQty(event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={addMenuBundleDraftItem}
                  >
                    加入餐點
                  </button>
                </div>
                {menuBundleDraftItems.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <tbody>
                        {menuBundleDraftItems.map((entry) => {
                          const item = items.find(
                            (menuItem) => menuItem.id === entry.menuItemId,
                          );
                          return (
                            <tr key={entry.menuItemId}>
                              <td>{item?.name ?? `餐點 #${entry.menuItemId}`}</td>
                              <td>x {entry.qty}</td>
                              <td className="text-right">
                                <button
                                  type="button"
                                  className="btn btn-xs btn-ghost"
                                  onClick={() =>
                                    removeMenuBundleDraftItem(entry.menuItemId)
                                  }
                                >
                                  移除
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {menuBundleMessage ? (
                  <div className="alert">
                    <span>{menuBundleMessage}</span>
                  </div>
                ) : null}
                <button
                  className="btn btn-sm btn-primary w-fit"
                  disabled={menuBundleBusy}
                >
                  {menuBundleBusy
                    ? "儲存中..."
                    : editingMenuBundleId
                      ? "儲存套餐"
                      : "新增套餐"}
                </button>
                {menuBundleManagementItems.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>套餐</th>
                          <th>內容</th>
                          <th>價格</th>
                          <th>狀態</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {menuBundleManagementItems.map((bundle) => (
                          <tr key={bundle.id}>
                            <td>
                              <div className="font-semibold">{bundle.name}</div>
                              <div className="text-xs opacity-70">
                                {bundle.description}
                              </div>
                            </td>
                            <td>
                              {bundle.items
                                .map(
                                  (entry) =>
                                    `${entry.item?.name ?? `#${entry.menuItemId}`} x ${entry.qty}`,
                                )
                                .join(", ")}
                            </td>
                            <td>${bundle.price}</td>
                            <td>
                              <span
                                className={`badge ${
                                  bundle.isActive
                                    ? "badge-success"
                                    : "badge-neutral"
                                }`}
                              >
                                {bundle.isActive ? "啟用中" : "停用中"}
                              </span>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline"
                                  disabled={menuBundleBusy}
                                  onClick={() => startEditMenuBundle(bundle)}
                                >
                                  編輯
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-xs btn-outline ${
                                    bundle.isActive ? "btn-error" : "btn-success"
                                  }`}
                                  disabled={menuBundleBusy}
                                  onClick={() => {
                                    void setMenuBundleActive(
                                      bundle,
                                      !bundle.isActive,
                                    );
                                  }}
                                >
                                  {bundle.isActive ? "停用" : "重新啟用"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </form>
          </section>
        ) : null}

        {hasManagerTools && mainView === "manager" && managerTab === "inventory" && canViewInventory ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="card-title">庫存管理</h2>
                  <p className="text-sm opacity-70">
                    管理原料庫存，並查看缺料會影響哪些餐點。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    disabled={inventoryBusy}
                    onClick={() => {
                      void loadInventory();
                    }}
                  >
                    重新整理
                  </button>
                  {canManageMenu ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-warning"
                      disabled={inventoryBusy}
                      onClick={() => {
                        void syncInventoryAvailability();
                      }}
                    >
                      同步下架缺料商品
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="stat rounded-box border border-base-300 bg-base-200">
                  <div className="stat-title">啟用原料</div>
                  <div className="stat-value text-primary">
                    {ingredients.filter((ingredient) => ingredient.isActive).length}
                  </div>
                </div>
                <div className="stat rounded-box border border-base-300 bg-base-200">
                  <div className="stat-title">庫存偏低</div>
                  <div className="stat-value text-warning">
                    {
                      inventoryImpacts.filter(
                        (impact) => impact.status === "low_stock",
                      ).length
                    }
                  </div>
                </div>
                <div className="stat rounded-box border border-base-300 bg-base-200">
                  <div className="stat-title">已缺料</div>
                  <div className="stat-value text-error">
                    {
                      inventoryImpacts.filter(
                        (impact) => impact.status === "out_of_stock",
                      ).length
                    }
                  </div>
                </div>
                <div className="stat rounded-box border border-base-300 bg-base-200">
                  <div className="stat-title">受影響餐點</div>
                  <div className="stat-value">
                    {
                      new Set(
                        inventoryImpacts
                          .filter((impact) => impact.status !== "normal")
                          .flatMap((impact) =>
                            impact.affectedMenuItems.map((item) => item.id),
                          ),
                      ).size
                    }
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 rounded-box border border-base-300 bg-base-200 p-2">
                {[
                  { id: "ingredients" as const, label: "原料管理" },
                  { id: "mapping" as const, label: "餐點原料設定" },
                  { id: "shortage" as const, label: "缺料影響" },
                  { id: "availability" as const, label: "可售狀態" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`btn btn-sm ${
                      inventorySubTab === tab.id ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => setInventorySubTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {inventoryMessage ? (
                <div className="alert">
                  <span>{inventoryMessage}</span>
                </div>
              ) : null}

              {canManageMenu ? (
                <form
                  className={`rounded-box border border-base-300 bg-base-200 p-3 ${
                    inventorySubTab === "ingredients" ? "" : "hidden"
                  }`}
                  onSubmit={(event) => {
                    void submitIngredientForm(event);
                  }}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">
                      {editingIngredientId ? "編輯原料" : "新增原料"}
                    </h3>
                    {editingIngredientId ? (
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={resetIngredientForm}
                      >
                        取消編輯
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <input
                      className="input input-bordered input-sm"
                      placeholder="原料名稱"
                      value={ingredientForm.name}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                    <input
                      className="input input-bordered input-sm"
                      placeholder="單位"
                      value={ingredientForm.unit}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          unit: event.target.value,
                        }))
                      }
                      required
                    />
                    <input
                      className="input input-bordered input-sm"
                      type="number"
                      min={0}
                      value={ingredientForm.currentStock}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          currentStock: event.target.value,
                        }))
                      }
                    />
                    <input
                      className="input input-bordered input-sm"
                      type="number"
                      min={0}
                      value={ingredientForm.safetyStock}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          safetyStock: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    className="btn btn-sm btn-primary mt-3"
                    disabled={inventoryBusy}
                  >
                    {inventoryBusy
                      ? "儲存中..."
                      : editingIngredientId
                        ? "儲存原料"
                        : "新增原料"}
                  </button>
                </form>
              ) : null}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div
                  className={`rounded-box border border-base-300 p-3 ${
                    inventorySubTab === "ingredients" ? "" : "hidden"
                  }`}
                >
                  <h3 className="mb-2 font-semibold">原料管理</h3>
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>原料</th>
                          <th>庫存</th>
                          <th>狀態</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedIngredients.map((ingredient) => {
                          const impact = inventoryImpacts.find(
                            (candidate) =>
                              candidate.ingredientId === ingredient.id,
                          );
                          const status = impact?.status ?? "normal";
                          return (
                            <tr key={ingredient.id}>
                              <td>
                                <div className="font-semibold">
                                  {ingredient.name}
                                </div>
                                <div className="text-xs opacity-70">
                                  安全庫存：{ingredient.safetyStock}{" "}
                                  {ingredient.unit}
                                </div>
                              </td>
                              <td>
                                {ingredient.currentStock} {ingredient.unit}
                              </td>
                              <td>
                                <span className={getInventoryStatusBadgeClass(status)}>
                                  {getInventoryStatusLabel(status)}
                                </span>
                              </td>
                              <td>
                                <div className="flex flex-wrap gap-1">
                                  {canManageMenu ? (
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-outline"
                                      disabled={inventoryBusy}
                                      onClick={() => startEditIngredient(ingredient)}
                                    >
                                      編輯
                                    </button>
                                  ) : null}
                                  {canUpdatePaymentStatus ? (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-xs btn-outline"
                                        disabled={inventoryBusy}
                                        onClick={() => {
                                          void adjustIngredientStock(
                                            ingredient,
                                            -1,
                                          );
                                        }}
                                      >
                                        -1
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-xs btn-outline"
                                        disabled={inventoryBusy}
                                        onClick={() => {
                                          void adjustIngredientStock(
                                            ingredient,
                                            1,
                                          );
                                        }}
                                      >
                                        +1
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {ingredients.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-center opacity-60">
                              目前沒有原料。
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span>
                      第 {currentIngredientPage} / {ingredientPageCount} 頁，共{" "}
                      {ingredients.length} 筆
                    </span>
                    <div className="join">
                      <button
                        className="btn btn-sm join-item"
                        disabled={currentIngredientPage <= 1}
                        onClick={() =>
                          setIngredientPage((page) => Math.max(1, page - 1))
                        }
                      >
                        上一頁
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        disabled={currentIngredientPage >= ingredientPageCount}
                        onClick={() =>
                          setIngredientPage((page) =>
                            Math.min(ingredientPageCount, page + 1),
                          )
                        }
                      >
                        下一頁
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  className={`rounded-box border border-base-300 p-3 ${
                    inventorySubTab === "mapping" ? "" : "hidden"
                  }`}
                >
                  <h3 className="mb-2 font-semibold">
                    餐點原料設定
                  </h3>
                  <select
                    className="select select-bordered select-sm mb-3 w-full"
                    value={selectedInventoryMenuItemId}
                    onChange={(event) =>
                      setSelectedInventoryMenuItemId(event.target.value)
                    }
                  >
                    <option value="">選擇餐點</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {selectedInventoryMenuItemId ? (
                    <>
                      {canManageMenu ? (
                        <div className="mb-3 flex flex-wrap gap-2">
                          <select
                            className="select select-bordered select-sm min-w-52 flex-1"
                            value={ingredientDraftId}
                            onChange={(event) =>
                              setIngredientDraftId(event.target.value)
                            }
                          >
                            <option value="">選擇原料</option>
                            {ingredients
                              .filter((ingredient) => ingredient.isActive)
                              .map((ingredient) => (
                                <option key={ingredient.id} value={ingredient.id}>
                                  {ingredient.name}
                                </option>
                              ))}
                          </select>
                          <input
                            className="input input-bordered input-sm w-24"
                            type="number"
                            min={1}
                            value={ingredientDraftQty}
                            onChange={(event) =>
                              setIngredientDraftQty(event.target.value)
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={addIngredientMappingDraft}
                          >
                            加入
                          </button>
                        </div>
                      ) : null}
                      <div className="overflow-x-auto">
                        <table className="table table-sm">
                          <tbody>
                            {menuItemIngredientLinks.map((link) => (
                              <tr key={link.ingredientId}>
                                <td>
                                  {link.ingredient?.name ??
                                    `原料 #${link.ingredientId}`}
                                </td>
                                <td>
                                  x {link.quantityPerItem}{" "}
                                  {link.ingredient?.unit ?? "unit"}
                                </td>
                                <td className="text-right">
                                  {canManageMenu ? (
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-ghost"
                                      onClick={() =>
                                        removeIngredientMappingDraft(
                                          link.ingredientId,
                                        )
                                      }
                                    >
                                      移除
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                            {menuItemIngredientLinks.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="text-center opacity-60">
                                  此餐點尚未設定原料。
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                      {canManageMenu ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary mt-3"
                          disabled={inventoryBusy}
                          onClick={() => {
                            void saveMenuItemIngredientMapping();
                          }}
                        >
                          儲存原料設定
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm opacity-70">
                      請選擇餐點以查看或編輯原料用量。
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div
                  className={`rounded-box border border-base-300 p-3 ${
                    inventorySubTab === "shortage" ? "" : "hidden"
                  }`}
                >
                  <h3 className="mb-2 font-semibold">缺料影響</h3>
                  <div className="space-y-2">
                    {inventoryImpacts
                      .filter((impact) => impact.status !== "normal")
                      .map((impact) => (
                        <div
                          key={impact.ingredientId}
                          className="rounded-box border border-base-300 bg-base-200 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {impact.ingredientName}
                            </span>
                            <span className={getInventoryStatusBadgeClass(impact.status)}>
                              {getInventoryStatusLabel(impact.status)}
                            </span>
                            <span className="text-sm opacity-70">
                              {impact.currentStock} / 安全庫存{" "}
                              {impact.safetyStock} {impact.unit}
                            </span>
                          </div>
                          <p className="mt-1 text-xs opacity-70">
                            受影響餐點：{" "}
                            {impact.affectedMenuItems.length > 0
                              ? impact.affectedMenuItems
                                  .map((item) => item.name)
                                  .join(", ")
                              : "無"}
                          </p>
                        </div>
                      ))}
                    {inventoryImpacts.every(
                      (impact) => impact.status === "normal",
                    ) ? (
                      <p className="text-sm opacity-70">
                        目前沒有低庫存或缺料原料。
                      </p>
                    ) : null}
                  </div>
                </div>

                <div
                  className={`rounded-box border border-base-300 p-3 ${
                    inventorySubTab === "availability" ? "" : "hidden"
                  }`}
                >
                  <h3 className="mb-2 font-semibold">餐點可售影響</h3>
                  <div className="space-y-2">
                    {menuItemAvailabilityImpacts
                      .filter(
                        (impact) =>
                          !impact.canPrepare ||
                          impact.lowStockIngredients.length > 0,
                      )
                      .map((impact) => (
                        <div
                          key={impact.menuItemId}
                          className="rounded-box border border-base-300 bg-base-200 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {impact.menuItemName}
                            </span>
                            <span
                              className={`badge ${
                                impact.canPrepare
                                  ? "badge-warning"
                                  : "badge-error"
                              }`}
                            >
                              {impact.canPrepare
                                ? "庫存偏低提醒"
                                : "原料不足"}
                            </span>
                            {!impact.isAvailable ? (
                              <span className="badge badge-neutral">
                                暫停販售
                              </span>
                            ) : null}
                          </div>
                          {impact.missingIngredients.length > 0 ? (
                            <p className="mt-1 text-xs">
                              缺少：{" "}
                              {impact.missingIngredients
                                .map(
                                  (ingredient) =>
                                    `${ingredient.ingredientName} (${ingredient.currentStock}/${ingredient.requiredQty} ${ingredient.unit})`,
                                )
                                .join(", ")}
                            </p>
                          ) : null}
                          {impact.lowStockIngredients.length > 0 ? (
                            <p className="mt-1 text-xs opacity-70">
                              偏低：{" "}
                              {impact.lowStockIngredients
                                .map(
                                  (ingredient) =>
                                    `${ingredient.ingredientName} (${ingredient.currentStock} ${ingredient.unit})`,
                                )
                                .join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    {menuItemAvailabilityImpacts.every(
                      (impact) =>
                        impact.canPrepare &&
                        impact.lowStockIngredients.length === 0,
                    ) ? (
                      <p className="text-sm opacity-70">
                        No menu item shortage impact.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="alert alert-warning">
                <span>
                  系統可將無法製作的餐點自動下架；補貨後不會自動恢復販售，需由老闆或管理者手動重新上架。
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {hasManagerTools && mainView === "manager" && managerTab === "categories" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">分類管理</h2>
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
                        <tr
                          key={category.id}
                          className={
                            category.id === recentlyUpdatedCategoryId
                              ? "bg-primary/10"
                              : ""
                          }
                        >
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

        {hasManagerTools && mainView === "manager" && managerTab === "promotions" && canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title">優惠券管理</h2>
                  <p className="text-sm opacity-70">
                    建立、修改、停用與重新啟用結帳優惠碼。
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
                  <option value="active">啟用中</option>
                  <option value="inactive">停用中</option>
                  <option value="all">全部</option>
                </select>
              </div>
              <div className="alert alert-info items-start">
                <span>
                  優惠碼可用於顧客結帳、現場點餐與電話訂餐；折扣會顯示在收據並計入營運分析。
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {promotionRuntimeFilterOptions.map((filter) => (
                  <button
                    key={filter.id}
                    className={`btn btn-xs ${
                      promotionRuntimeFilter === filter.id
                        ? "btn-primary"
                        : "btn-outline"
                    }`}
                    onClick={() => {
                      setPromotionRuntimeFilter(filter.id);
                      if (filter.id !== "all") {
                        notifyInfo("已套用優惠券篩選。");
                      }
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
                {promotionRuntimeFilter !== "all" ? (
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => {
                      setPromotionRuntimeFilter("all");
                      notifyInfo("已清除優惠券篩選。");
                    }}
                  >
                    清除篩選
                  </button>
                ) : null}
                {promotionRuntimeFilter !== "all" ? (
                  <span className="text-xs opacity-60">
                    依可用狀態篩選優惠券。
                  </span>
                ) : null}
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
                    {editingPromotionId ? "編輯優惠碼" : "新增優惠碼"}
                  </h3>
                  {editingPromotionId ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={resetPromotionForm}
                    >
                      取消編輯
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input
                    className="input input-bordered input-sm"
                    placeholder="優惠碼"
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
                    <option value="percent">百分比折扣</option>
                    <option value="fixed">固定金額折扣</option>
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
                  <input
                    className="input input-bordered input-sm"
                    min={0}
                    placeholder="最低消費金額"
                    type="number"
                    value={promotionForm.minOrderAmount}
                    onChange={(event) =>
                      setPromotionForm((current) => ({
                        ...current,
                        minOrderAmount: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="input input-bordered input-sm"
                    type="datetime-local"
                    value={promotionForm.startsAt}
                    onChange={(event) =>
                      setPromotionForm((current) => ({
                        ...current,
                        startsAt: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="input input-bordered input-sm"
                    type="datetime-local"
                    value={promotionForm.endsAt}
                    onChange={(event) =>
                      setPromotionForm((current) => ({
                        ...current,
                        endsAt: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="input input-bordered input-sm"
                    min={1}
                    placeholder="使用次數上限"
                    type="number"
                    value={promotionForm.usageLimit}
                    onChange={(event) =>
                      setPromotionForm((current) => ({
                        ...current,
                        usageLimit: event.target.value,
                      }))
                    }
                  />
                </div>
                <button
                  className="btn btn-sm btn-primary mt-3"
                  disabled={promotionBusy}
                >
                  {promotionBusy
                    ? "儲存中..."
                    : editingPromotionId
                      ? "儲存優惠碼"
                      : "新增優惠碼"}
                </button>
              </form>

              {promotions.length === 0 ? (
                <div className="alert alert-info">
                  <span>目前沒有優惠券。</span>
                </div>
              ) : filteredPromotions.length === 0 ? (
                <div className="alert alert-info">
                  <span>沒有符合篩選條件的優惠券。</span>
                </div>
              ) : (
                <>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>優惠碼</th>
                        <th>折扣</th>
                        <th>可用狀態</th>
                        <th>最低消費</th>
                        <th>有效期間</th>
                        <th>啟用狀態</th>
                        <th>使用次數</th>
                        <th>更新時間</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                        {paginatedFilteredPromotions.map((promotion) => {
                        const usedCount =
                          promotionUsageCounts[
                            promotion.code.trim().toUpperCase()
                          ] ?? 0;
                        const runtimeStatus = getPromotionRuntimeStatus(
                          promotion,
                          usedCount,
                        );
                        const ruleSummary = formatPromotionRuleSummary(
                          promotion,
                          usedCount,
                        );

                        return (
                        <tr
                          key={promotion.id}
                          className={`${
                            promotion.id === recentlyUpdatedPromotionId
                              ? "bg-primary/10"
                              : ""
                          } ${
                            runtimeStatus === "usage_full"
                              ? "border-l-4 border-error"
                              : runtimeStatus === "expired"
                                ? "opacity-70"
                                : ""
                          }`}
                        >
                          <td className="font-semibold">{promotion.code}</td>
                          <td>
                            {promotion.discountType === "percent"
                              ? `${promotion.discountValue}%`
                              : `$${promotion.discountValue}`}
                          </td>
                          <td>${promotion.minOrderAmount}</td>
                          <td>
                            <div className="text-sm">
                              <div>
                                開始：{" "}
                                {promotion.startsAt
                                  ? formatCheckoutDateTime(promotion.startsAt)
                                  : "立即生效"}
                              </div>
                              <div>
                                結束：{" "}
                                {promotion.endsAt
                                  ? formatCheckoutDateTime(promotion.endsAt)
                                  : "無結束時間"}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`badge ${getPromotionRuntimeStatusBadgeClass(
                                runtimeStatus,
                              )}`}
                            >
                              {getPromotionRuntimeStatusLabel(runtimeStatus)}
                            </span>
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs opacity-70">
                              {ruleSummary.map((summary) => (
                                <li key={summary}>{summary}</li>
                              ))}
                            </ul>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                promotion.isActive
                                  ? "badge-success"
                                  : "badge-neutral"
                              }`}
                            >
                              {promotion.isActive ? "啟用中" : "停用中"}
                            </span>
                          </td>
                          <td>
                            <span
                              className={
                                runtimeStatus === "usage_full"
                                  ? "font-semibold text-error"
                                  : ""
                              }
                            >
                              {promotion.usageLimit
                                ? `已使用 ${usedCount} / ${promotion.usageLimit}`
                                : `已使用 ${usedCount} / 無上限`}
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
                                編輯
                              </button>
                              {promotion.isActive ? (
                                <button
                                  className="btn btn-sm btn-error btn-outline"
                                  disabled={promotionBusy}
                                  onClick={() => {
                                    void setPromotionActive(promotion, false);
                                  }}
                                >
                                  停用
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm btn-success btn-outline"
                                  disabled={promotionBusy}
                                  onClick={() => {
                                    void setPromotionActive(promotion, true);
                                  }}
                                >
                                  重新啟用
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredPromotions.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span>
                      第 {currentPromotionManagementPage} /{" "}
                      {promotionManagementPageCount} 頁，共{" "}
                      {filteredPromotions.length} 筆
                    </span>
                    <div className="join">
                      <button
                        className="btn btn-sm join-item"
                        disabled={currentPromotionManagementPage <= 1}
                        onClick={() =>
                          setPromotionManagementPage((page) =>
                            Math.max(1, page - 1),
                          )
                        }
                      >
                        上一頁
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        disabled={
                          currentPromotionManagementPage >=
                          promotionManagementPageCount
                        }
                        onClick={() =>
                          setPromotionManagementPage((page) =>
                            Math.min(promotionManagementPageCount, page + 1),
                          )
                        }
                      >
                        下一頁
                      </button>
                    </div>
                  </div>
                ) : null}
                </>
              )}
            </div>
          </section>
        ) : null}

        {mainView === "shop" ? (
        <section ref={menuSectionRef} className="scroll-mt-24">
          {items.length === 0 ? (
            <div className="alert alert-info">
              <span>目前還沒有可顯示的餐點。</span>
            </div>
          ) : (
            <>
              <section className="mb-8 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
                <div>
                  <h2 className="text-xl font-bold">目前預估等待時間</h2>
                  <p className="text-sm opacity-70">
                    依目前全店廚房排隊狀況估算，實際時間以現場為準。
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-box border border-base-300 bg-base-200 p-3">
                    <p className="text-xs opacity-70">廚房排隊</p>
                    <p className="text-lg font-bold">
                      {queueSummary.kitchenQueue} 筆
                    </p>
                  </div>
                  <div className="rounded-box border border-base-300 bg-base-200 p-3">
                    <p className="text-xs opacity-70">預估等待</p>
                    <p className="text-lg font-bold">
                      {estimatedWaitMinutes} 分鐘
                    </p>
                  </div>
                  <div className="rounded-box border border-base-300 bg-base-200 p-3">
                    <p className="text-xs opacity-70">忙碌程度</p>
                    <span className={`badge ${getBusyLevelBadgeClass(busyLevel)}`}>
                      {getBusyLevelLabel(busyLevel)}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm opacity-80">
                  {getBusyLevelMessage(busyLevel)}
                </p>
              </section>
              {menuBundles.length > 0 ? (
                <section className="mb-8 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-xl font-bold">早餐套餐組合</h2>
                    <p className="text-sm opacity-70">
                      選擇套餐後，系統會把套餐內餐點一起加入購物車。
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {menuBundles.map((bundle) => (
                      <article
                        key={bundle.id}
                        className="rounded-box border border-base-300 bg-base-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">{bundle.name}</h3>
                            {bundle.description ? (
                              <p className="text-sm opacity-70">
                                {bundle.description}
                              </p>
                            ) : null}
                          </div>
                          <span className="font-bold text-success">
                            ${bundle.price}
                          </span>
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                          {bundle.items.map((entry) => (
                            <li key={`${bundle.id}-${entry.menuItemId}`}>
                              {entry.item?.name ?? `Item #${entry.menuItemId}`} x{" "}
                              {entry.qty}
                              {entry.item && !entry.item.is_available
                                ? " (sold out)"
                                : ""}
                            </li>
                          ))}
                        </ul>
                        <button
                          className="btn btn-sm btn-primary mt-3 w-full"
                          disabled={
                            bundle.items.every((entry) => !entry.item?.is_available)
                          }
                          onClick={() => {
                            void addBundleToCart(bundle);
                          }}
                        >
                          加入套餐
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              {user && frequentItems.length > 0 ? (
                <section className="mb-8 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-bold">Frequently ordered</h2>
                      <p className="text-sm opacity-70">
                        Quick picks from your previous completed and active orders.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {frequentItems.map((entry) => (
                      <div
                        key={entry.currentItem.id}
                        className="rounded-box border border-base-300 bg-base-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">
                              {entry.currentItem.name}
                            </h3>
                            <p className="text-sm opacity-70">
                              Ordered {entry.orderCount} time(s), total qty{" "}
                              {entry.totalQuantity}
                            </p>
                            <p className="text-xs opacity-60">
                              Last ordered{" "}
                              {formatCheckoutDateTime(entry.lastOrderedAt)}
                            </p>
                          </div>
                          <span className="font-bold text-success">
                            ${entry.currentItem.price}
                          </span>
                        </div>
                        <button
                          className="btn btn-sm btn-outline mt-3 w-full"
                          disabled={activeItemId === entry.currentItem.id}
                          onClick={() => {
                            void addToCart(
                              entry.currentItem,
                              `Added ${entry.currentItem.name} from frequent items.`,
                            );
                          }}
                        >
                          {activeItemId === entry.currentItem.id
                            ? "加入中..."
                            : "加入"}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {grouped.categories.map((category) => (
              <section key={category} className="mb-8">
              <h2 className="text-3xl font-bold mb-4 text-primary border-b-2 border-primary pb-2">
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(grouped.groupedItems[category] || []).map((item) => (
                  <div
                    key={item.id}
                    className={`card bg-base-100 shadow-md hover:shadow-lg transition ${
                      item.id === recentlyUpdatedMenuItemId
                        ? "border border-primary ring-2 ring-primary bg-primary/5"
                        : ""
                    }`}
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
                    <div className="card-body p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="card-title text-lg">{item.name}</h3>
                        {!item.is_available ? (
                          <span className="badge badge-error">已售完</span>
                        ) : null}
                        {menuItemAvailabilityImpactById.get(item.id)
                          ?.missingIngredients.length ? (
                          <span className="badge badge-error">
                            原料不足
                          </span>
                        ) : menuItemAvailabilityImpactById.get(item.id)
                            ?.lowStockIngredients.length ? (
                          <span className="badge badge-warning">庫存偏低</span>
                        ) : null}
                      </div>
                      {item.primary_category_name ? (
                        <span className="badge badge-primary w-fit">
                          {item.primary_category_name}
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
                          菜單版本：{formatSemanticVersion(item)} · 版本編號：#
                          {item.version} · 測試分組：{formatAbTestGroup(item.ab_test_group)}
                          · 顯示排序：{item.display_order}
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
                            !item.is_available || activeItemId === item.id
                          }
                        >
                          {!item.is_available
                            ? "已售完"
                            : activeItemId === item.id
                              ? "加入中..."
                              : `加入${
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
                              <option value="">選擇分類</option>
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
                              加入分類
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
                                ? "標記售完"
                                : "恢復販售"}
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => startEditMenuItem(item)}
                            >
                              編輯
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => {
                                void loadMenuItemHistory(item);
                              }}
                              disabled={menuHistoryLoadingId === item.id}
                            >
                              {menuHistoryLoadingId === item.id
                                ? "載入中..."
                                : "查看版本"}
                            </button>
                            <button
                              className="btn btn-sm btn-error btn-outline"
                              onClick={() => {
                                void deleteMenuItem(item);
                              }}
                              disabled={menuBusy}
                            >
                              刪除
                            </button>
                          </div>
                          {menuHistoryByItemId[item.id] ? (
                            <details className="rounded-box border border-base-300 p-3">
                              <summary className="cursor-pointer font-medium">
                                菜單版本紀錄
                              </summary>
                              {menuHistoryByItemId[item.id].length === 0 ? (
                                <p className="mt-2 text-sm opacity-70">
                                  目前沒有版本紀錄。
                                </p>
                              ) : (
                                <div className="mt-2 overflow-x-auto">
                                  <table className="table table-sm">
                                    <thead>
                                      <tr>
                                        <th>版本</th>
                                        <th>名稱</th>
                                        <th>價格</th>
                                        <th>測試分組</th>
                                        <th>排序</th>
                                        <th>狀態</th>
                                        <th>變更原因</th>
                                        <th>變更者</th>
                                        <th>上一版</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {menuHistoryByItemId[item.id].map(
                                        (historyItem) => (
                                          <tr key={historyItem.id}>
                                            <td>
                                              {formatSemanticVersion(historyItem)}
                                              <div className="text-xs opacity-70">
                                                版本編號 {historyItem.version}
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
                                                ? "販售中"
                                                : "已售完"}
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
              ))}
            </>
          )}
        </section>
        ) : null}

        {user && !canViewAllOrders && mainView === "account" ? (
          <section ref={ordersSectionRef} className="mt-10 scroll-mt-24">
            <h2 className="text-2xl font-bold mb-4">我的訂單</h2>
            {statusMessage ? (
              <div className="alert mb-4">
                <span>{statusMessage}</span>
              </div>
            ) : null}
            {reorderMessage ? (
              <div className="alert alert-info mb-4 whitespace-pre-line">
                <span>{reorderMessage}</span>
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
                  const isCustomerActiveOrder = [
                    "submitted",
                    "preparing",
                    "ready",
                  ].includes(order.status);
                  const queueAheadCount = isCustomerActiveOrder
                    ? getQueueAheadCount(order)
                    : 0;
                  const customerEstimatedWait = estimateWaitMinutes(queueAheadCount);
                  const customerProgressLabel =
                    getCustomerOrderProgressLabel(order);
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
                              取餐編號：{formatPickupNumber(order.id)}
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
                            {isCustomerActiveOrder ? (
                              <p className="text-sm opacity-80">
                                {customerProgressLabel}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span
                              className={`badge ${getStatusBadgeClass(
                                order.status,
                              )}`}
                            >
                              {formatOrderStatus(order.status)}
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
                            {order.status !== "pending" &&
                            order.items.length > 0 ? (
                              <button
                                className="btn btn-sm btn-outline"
                                disabled={reorderingOrderId === order.id}
                                onClick={() => {
                                  void reorderPreviousOrder(order);
                                }}
                              >
                                {reorderingOrderId === order.id
                                  ? "加入中..."
                                  : "再點一次"}
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
                                      {formatOrderStatus(status)}
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
                        {isCustomerActiveOrder ? (
                          <div className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                            <span>Ahead of you: {queueAheadCount} order(s)</span>
                            {order.status === "ready" ? (
                              <span className="font-semibold text-primary">
                                Ready for pickup
                              </span>
                            ) : (
                              <span>
                                預估等待：{customerEstimatedWait} 分鐘
                              </span>
                            )}
                          </div>
                        ) : order.status === "completed" ||
                          order.status === "cancelled" ? (
                          <p className="mt-2 text-sm opacity-80">
                            {customerProgressLabel}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                          <span>取餐方式：{formatFulfillmentType(order.fulfillmentType)}</span>
                          <span>
                            付款：{formatPaymentMethod(order.paymentMethod)} /{" "}
                            {formatPaymentStatus(order.paymentStatus)}
                          </span>
                          {order.pickupTime ? (
                            <span>
                              取餐時間：{formatCheckoutDateTime(order.pickupTime)}
                            </span>
                          ) : null}
                          {order.customerNote ? (
                            <span className="md:col-span-2">
                              備註：{order.customerNote}
                            </span>
                          ) : null}
                          {order.discountAmount > 0 || order.promoCode ? (
                            <span className="md:col-span-2">
                              優惠碼 {order.promoCode ?? "-"}：原始金額 $
                              {order.subtotal}，折扣 -${order.discountAmount}
                            </span>
                          ) : null}
                        </div>
                        <ul className="text-sm list-disc pl-5 space-y-1">
                          {order.items.map((detail) => (
                            <li key={`${order.id}-${detail.item.id}`}>
                              {detail.item.name} x {detail.qty}
                              {detail.memberName
                                ? ` / ${detail.memberName}`
                                : ""}
                              {detail.bundleName
                                ? ` / 套餐：${detail.bundleName}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                        {order.status === "completed" ? (
                          <div className="rounded-box border border-base-300 bg-base-200 p-3">
                            <div className="mb-2 text-sm font-semibold">
                              我的評價
                            </div>
                            {order.rating ? (
                              <p className="mb-2 text-sm">
                                目前評分：{order.rating}/5
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
                                <option value="">評分</option>
                                {[1, 2, 3, 4, 5].map((rating) => (
                                  <option key={rating} value={rating}>
                                    {rating}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="input input-sm input-bordered"
                                placeholder="評價留言（可不填）"
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
                                  ? "儲存中..."
                                  : "儲存評價"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <p className="font-bold text-right">
                          總金額 ${order.total}
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

      {isCartOpen ? (
        <>
          <button
            className="fixed inset-0 bg-black/35"
            aria-label="close cart drawer"
            onClick={() => setIsCartOpen(false)}
          />
          <aside className="fixed right-0 top-0 h-full w-full max-w-2xl bg-base-100 shadow-2xl z-10 flex flex-col">
            <div className="p-4 border-b border-base-300 flex items-center justify-between">
              <h2 className="text-xl font-bold">購物車</h2>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setIsCartOpen(false)}
              >
                關閉
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 border-b border-base-300 bg-base-200 p-3 text-center text-sm">
              <div>
                <p className="text-xs opacity-70">餐點數量</p>
                <p className="font-bold">{cartItemCount}</p>
              </div>
              <div>
                <p className="text-xs opacity-70">總金額</p>
                <p className="font-bold">${cartSubtotal}</p>
              </div>
              <div>
                <p className="text-xs opacity-70">預估等待</p>
                <p className="font-bold">{estimatedWaitMinutes} 分鐘</p>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              <h3 className="mb-2 font-semibold">購物車餐點</h3>
              {cartDetails.length === 0 ? (
                <div className="alert">
                  <span>購物車目前是空的。</span>
                </div>
              ) : (
                <ul className="max-h-56 space-y-3 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2">
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
                        {detail.bundle ? (
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className="badge badge-secondary badge-sm">
                              套餐：{detail.bundle.bundleName}
                            </span>
                            {detail.bundle.bundlePrice !== undefined ? (
                              <span>
                                套餐價：${detail.bundle.bundlePrice}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {detail.hasPriceChanged && detail.currentItem ? (
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className="badge badge-warning">
                              價格已變更
                            </span>
                            <span>下單時：${detail.item.price}</span>
                            <span>目前：${detail.currentItem.price}</span>
                          </div>
                        ) : null}
                        {checkoutForm.isGroupOrder ? (
                          <input
                            className="input input-bordered input-xs mt-2 w-full"
                            placeholder="成員姓名"
                            value={detail.memberName}
                            maxLength={80}
                            onChange={(event) => {
                              setCartMemberNameByItemId((current) => ({
                                ...current,
                                [detail.itemId]: event.target.value,
                              }));
                            }}
                          />
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

            <div className="max-h-[60vh] overflow-y-auto border-t border-base-300 p-4 space-y-3">
              <div className="rounded-box border border-base-300 bg-base-100 p-3 space-y-3">
                <h3 className="font-semibold">
                  {user ? "訂單資訊" : "訪客訂餐"}
                </h3>
                {!user ? (
                  <div className="rounded-box border border-info/40 bg-info/10 p-2 text-xs">
                    <p className="font-medium">訪客訂餐</p>
                    <p className="opacity-75">
                      請留下姓名與電話，方便店員核對取餐；登入後可保存訂單紀錄。
                    </p>
                  </div>
                ) : null}
                <div
                  className={`alert ${
                    busyLevel === "normal" ? "alert-info" : "alert-warning"
                  } py-2 text-sm`}
                >
                  <span>
                    預估等待：{estimatedWaitMinutes} 分鐘。前方約有{" "}
                    {queueSummary.kitchenQueue} 筆訂單。
                    {busyLevel === "normal"
                      ? ""
                      : " 廚房目前較忙，送出前請確認取餐時間。"}
                  </span>
                </div>
                <div className="divider my-1">訂餐資料</div>
                <div className="rounded-box border border-base-300 bg-base-200 p-2 text-sm">
                  <label className="label cursor-pointer justify-start gap-2 p-0">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={checkoutForm.isGroupOrder}
                      onChange={(event) =>
                        setCheckoutForm((current) => ({
                          ...current,
                          isGroupOrder: event.target.checked,
                        }))
                      }
                    />
                    <span className="label-text">團體訂單</span>
                  </label>
                  {checkoutForm.isGroupOrder ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        className="input input-bordered input-sm"
                        placeholder="團體名稱"
                        value={checkoutForm.groupName}
                        maxLength={80}
                        onChange={(event) =>
                          setCheckoutForm((current) => ({
                            ...current,
                            groupName: event.target.value,
                          }))
                        }
                      />
                      <input
                        className="input input-bordered input-sm"
                        placeholder="聯絡人"
                        value={checkoutForm.contactName}
                        maxLength={80}
                        onChange={(event) =>
                          setCheckoutForm((current) => ({
                            ...current,
                            contactName: event.target.value,
                          }))
                        }
                      />
                      <input
                        className="input input-bordered input-sm sm:col-span-2"
                        placeholder="聯絡電話"
                        value={checkoutForm.contactPhone}
                        maxLength={30}
                        onChange={(event) =>
                          setCheckoutForm((current) => ({
                            ...current,
                            contactPhone: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
                {!user ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="form-control">
                      <span className="label-text mb-1">訪客姓名</span>
                      <input
                        className="input input-bordered input-sm"
                        value={guestCheckoutForm.guestName}
                        onChange={(event) =>
                          setGuestCheckoutForm((current) => ({
                            ...current,
                            guestName: event.target.value,
                          }))
                        }
                        maxLength={80}
                        placeholder="必填"
                      />
                    </label>
                    <label className="form-control">
                      <span className="label-text mb-1">電話</span>
                      <input
                        className="input input-bordered input-sm"
                        value={guestCheckoutForm.guestPhone}
                        onChange={(event) =>
                          setGuestCheckoutForm((current) => ({
                            ...current,
                            guestPhone: event.target.value,
                          }))
                        }
                        maxLength={30}
                        placeholder="必填"
                      />
                    </label>
                  </div>
                ) : null}
                <div className="divider my-1">取餐與付款</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1">取餐方式</span>
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
                      <option value="takeout">外帶</option>
                      <option value="dine_in">內用</option>
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1">付款方式</span>
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
                      <option value="cash">現金</option>
                      <option value="card">刷卡</option>
                      <option value="online">線上付款</option>
                    </select>
                  </label>
                </div>
                <label className="form-control">
                  <span className="label-text mb-1">取餐時間</span>
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
                  <span className="mt-1 text-xs opacity-60">
                    可不填，現場會依目前等待時間安排。
                  </span>
                  </label>
                <div className="divider my-1">優惠碼與備註</div>
                <label className="form-control">
                  <span className="label-text mb-1">優惠碼</span>
                  <input
                    className="input input-bordered input-sm"
                    value={checkoutForm.promoCode}
                    onChange={(event) =>
                      setCheckoutForm((current) => ({
                        ...current,
                        promoCode: event.target.value,
                      }))
                    }
                    placeholder="選填"
                  />
                  {renderPromotionEligibilityHint(
                    checkoutForm.promoCode,
                    cartSubtotal,
                    { compact: true },
                  )}
                </label>
                <label className="form-control">
                  <span className="label-text mb-1">備註</span>
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
                {renderTastePreferencePanel("checkout", {
                  collapsed: true,
                  compact: true,
                })}
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>餐點數量</span>
                <span>{cartItemCount}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold">
                <span>總金額</span>
                <span>${cartSubtotal}</span>
              </div>
              <button
                className="btn btn-error btn-outline w-full"
                onClick={() => void clearCart()}
                disabled={cartDetails.length === 0 || isClearingCart}
              >
                {isClearingCart ? "清空中..." : "清空購物車"}
              </button>
              <button
                className="btn btn-primary w-full"
                onClick={() => void submitOrder()}
                disabled={cartDetails.length === 0 || isSubmittingOrder}
              >
                {isSubmittingOrder
                  ? "送出中..."
                  : user
                    ? "送出訂單"
                    : "送出訪客訂單"}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
