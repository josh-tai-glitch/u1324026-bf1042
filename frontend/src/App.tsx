import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import type {
  ApiDataResponse,
  Category,
  CategorySales,
  MenuItem,
  Order,
  Role,
  RoleRequest,
  SessionUser,
  TopItemSales,
} from "../../shared/contracts.ts";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const defaultRoles: Role[] = ["customer"];
const emptyMenuForm = {
  name: "",
  price: "",
  category: "",
  primaryCategoryId: "",
  description: "",
  image_url: "",
};
const emptyCategoryForm = {
  name: "",
  slug: "",
  description: "",
  displayOrder: "0",
  isActive: true,
};

type MenuForm = typeof emptyMenuForm;
type CategoryForm = typeof emptyCategoryForm;
type ApiErrorPayload = { error?: string; message?: string };
type RoleRequestStatus = "pending" | "approved" | "rejected" | "all";

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

export default function App() {
  // Auth / session state
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
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
  const [selectedCategoryByItemId, setSelectedCategoryByItemId] = useState<
    Record<number, string>
  >({});

  // Cart / order state
  const [orderId, setOrderId] = useState<number | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<Record<number, number>>(
    {},
  );
  const [cartTotal, setCartTotal] = useState(0);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartBusyItemId, setCartBusyItemId] = useState<number | null>(null);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

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

  // Analytics state
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [topItemSales, setTopItemSales] = useState<TopItemSales[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsMessage, setAnalyticsMessage] = useState("");

  const roles = user?.roles?.length ? user.roles : defaultRoles;
  const hasRole = useCallback((role: Role) => roles.includes(role), [roles]);
  const hasAnyRole = useCallback(
    (requiredRoles: Role[]) => requiredRoles.some((role) => hasRole(role)),
    [hasRole],
  );
  const canManageMenu = hasAnyRole(["owner", "admin"]);
  const canViewAllOrders = hasAnyRole(["staff", "chef", "owner", "admin"]);
  const isAdmin = hasRole("admin");

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

  function syncCartFromOrder(order: Order) {
    const nextQtyByItemId = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.qty;
        return acc;
      },
      {} as Record<number, number>,
    );

    setCartQtyByItemId(nextQtyByItemId);
    setCartTotal(order.total);
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
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

  const loadAnalytics = useCallback(async () => {
    if (!canManageMenu) return;

    setAnalyticsLoading(true);
    setAnalyticsMessage("");
    try {
      const [categoryResponse, topItemsResponse] = await Promise.all([
        fetch(buildApiUrl("/api/admin/analytics/category-sales"), {
          credentials: "include",
        }),
        fetch(buildApiUrl("/api/admin/analytics/top-items?limit=10"), {
          credentials: "include",
        }),
      ]);

      if (!categoryResponse.ok) {
        throw new Error(await readApiError(categoryResponse));
      }
      if (!topItemsResponse.ok) {
        throw new Error(await readApiError(topItemsResponse));
      }

      const categoryPayload =
        (await categoryResponse.json()) as ApiDataResponse<CategorySales[]>;
      const topItemsPayload =
        (await topItemsResponse.json()) as ApiDataResponse<TopItemSales[]>;

      setCategorySales(
        Array.isArray(categoryPayload?.data) ? categoryPayload.data : [],
      );
      setTopItemSales(
        Array.isArray(topItemsPayload?.data) ? topItemsPayload.data : [],
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
  }, [canManageMenu]);

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
      setAnalyticsMessage("");
    }
  }, [canManageMenu, loadAnalytics]);

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

    return { groupedItems, categories };
  }, [items]);

  const cartItemCount = useMemo(
    () => Object.values(cartQtyByItemId).reduce((sum, qty) => sum + qty, 0),
    [cartQtyByItemId],
  );

  const cartDetails = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));

    return Object.entries(cartQtyByItemId)
      .map(([itemIdText, qty]) => {
        const itemId = Number(itemIdText);
        const item = itemById.get(itemId);
        if (!item || qty <= 0) return null;

        return {
          itemId,
          qty,
          item,
          subtotal: item.price * qty,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [cartQtyByItemId, items]);

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
      throw new Error(await readApiError(response));
    }

    const payload = (await response.json()) as ApiDataResponse<Order>;
    const updatedOrder = payload?.data;

    if (!updatedOrder) {
      throw new Error("Update order failed: invalid payload");
    }

    return updatedOrder;
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

  async function handleLogout(): Promise<void> {
    try {
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

      setActionError("Unable to update cart.");
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
        cartError instanceof Error
          ? cartError.message
          : "Unable to update cart.",
      );
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
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        throw new Error(`Submit order failed: ${await readApiError(response)}`);
      }

      resetCartState();
      setIsCartOpen(false);
      await loadOrderHistory();
    } catch (submitError) {
      setActionError("Unable to submit order.");
      console.error(submitError);
    } finally {
      setIsSubmittingOrder(false);
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
        ...(menuForm.primaryCategoryId
          ? { primaryCategoryId: Number(menuForm.primaryCategoryId) }
          : editingMenuId
            ? { primaryCategoryId: null }
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

      await Promise.all([loadCategories(), loadMenu()]);
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

      await Promise.all([loadCategories(), loadMenu()]);
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
      <div className="navbar bg-base-100 shadow-lg flex-col items-stretch gap-2 md:flex-row md:items-center">
        <div className="flex-1 w-full md:w-auto">
          <a className="btn btn-ghost normal-case text-2xl">Breakfast Demo</a>
        </div>
        <div className="flex-none w-full md:w-auto">
          <div className="flex flex-wrap gap-2 items-center md:justify-end">
            <div className="badge badge-outline">
              {user ? user.name : "Not signed in"}
            </div>
            {user ? (
              <div className="flex flex-wrap gap-1">
                {roles.map((role) => (
                  <span key={role} className="badge badge-neutral">
                    {role}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="badge badge-primary">
              {items.length} items / {grouped.categories.length} categories
            </div>
            <div className="badge badge-secondary">Cart {cartItemCount}</div>
            <div className="badge badge-accent">${cartTotal}</div>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setIsCartOpen(true);
              }}
              disabled={!user}
            >
              Cart
            </button>
            {user ? (
              <button
                className="btn btn-sm"
                onClick={() => {
                  void handleLogout();
                }}
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <main className="container mx-auto p-6">
        {!user ? (
          <section className="max-w-xl mx-auto card bg-base-100 shadow-md mb-8">
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
            </div>
          </section>
        ) : null}

        {actionError ? (
          <div className="alert alert-warning mb-4">
            <span>{actionError}</span>
          </div>
        ) : null}

        {user ? (
          <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        {isAdmin ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="card-title">Role requests</h2>
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
              {adminLoading ? (
                <div className="alert">
                  <span>Loading requests...</span>
                </div>
              ) : adminRequests.length === 0 ? (
                <div className="alert alert-info">
                  <span>No role requests.</span>
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

        {canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="card-title">Analytics</h2>
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
              {analyticsMessage ? (
                <div className="alert alert-warning">
                  <span>{analyticsMessage}</span>
                </div>
              ) : null}
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
            </div>
          </section>
        ) : null}

        {canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <form
              className="card-body"
              onSubmit={(event) => {
                void submitMenuForm(event);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="card-title">
                  {editingMenuId ? "Edit menu item" : "Add menu item"}
                </h2>
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

        {canManageMenu ? (
          <section className="mb-8 card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="card-title">Category management</h2>
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
              {categories.length === 0 ? (
                <div className="alert alert-info">
                  <span>No active categories.</span>
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
                      {categories.map((category) => (
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
                              <button
                                className="btn btn-sm btn-error btn-outline"
                                disabled={categoryBusy}
                                onClick={() => {
                                  void deactivateCategory(category);
                                }}
                              >
                                Deactivate
                              </button>
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
                      <h3 className="card-title text-lg">{item.name}</h3>
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
                          disabled={!user || activeItemId === item.id}
                        >
                          {activeItemId === item.id
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
                              className="btn btn-sm btn-outline"
                              onClick={() => startEditMenuItem(item)}
                            >
                              Edit
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
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}

        {user ? (
          <section className="mt-10">
            <h2 className="text-2xl font-bold mb-4">
              {canViewAllOrders ? "All orders" : "Order history"}
            </h2>
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
                {historyOrders.map((order) => (
                  <article
                    key={order.id}
                    className="card bg-base-100 shadow-sm border border-base-300"
                  >
                    <div className="card-body p-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold">Order #{order.id}</h3>
                        <span className="badge badge-success">
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm opacity-70">
                        Created at{" "}
                        {
                          (order as Order & { createdAtTaipei?: string })
                            .createdAtTaipei ?? order.createdAt
                        }
                      </p>
                      <ul className="text-sm list-disc pl-5 space-y-1">
                        {order.items.map((detail) => (
                          <li key={`${order.id}-${detail.item.id}`}>
                            {detail.item.name} x {detail.qty}
                          </li>
                        ))}
                      </ul>
                      <p className="font-bold text-right">${order.total}</p>
                    </div>
                  </article>
                ))}
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
