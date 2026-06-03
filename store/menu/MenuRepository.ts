import type { MenuItem, OrderItem } from "../../shared/contracts.ts";

export type MenuVersionValidationResult =
  | { ok: true }
  | {
      ok: false;
      itemName?: string;
      menuItemGroupId?: string;
      snapshotVersion?: number | null;
      currentVersion?: number | null;
    };

export class MenuRepository {
  getCurrentMenu(menu: ReadonlyArray<MenuItem>): MenuItem[] {
    return menu
      .filter((item) => item.is_current_version)
      .slice()
      .sort((a, b) => a.display_order - b.display_order || a.id - b.id);
  }

  getMenuItemVersionHistoryById(
    menu: ReadonlyArray<MenuItem>,
    menuId: number,
  ): MenuItem[] {
    const target = menu.find((item) => item.id === menuId);
    if (!target) return [];

    return menu
      .filter((item) => item.menu_item_group_id === target.menu_item_group_id)
      .slice()
      .sort((a, b) => b.version - a.version || b.id - a.id);
  }

  findCurrentVersionByGroupId(
    menu: ReadonlyArray<MenuItem>,
    groupId: string,
  ): MenuItem | undefined {
    return menu.find(
      (item) => item.menu_item_group_id === groupId && item.is_current_version,
    );
  }

  validateOrderItemVersions(
    menu: ReadonlyArray<MenuItem>,
    orderItems: ReadonlyArray<OrderItem>,
  ): MenuVersionValidationResult {
    for (const orderItem of orderItems) {
      const groupId =
        orderItem.menu_item_group_id ?? orderItem.item.menu_item_group_id;
      const snapshotVersion = orderItem.menu_item_version ?? orderItem.item.version ?? null;
      const currentItem = groupId
        ? this.findCurrentVersionByGroupId(menu, groupId)
        : menu.find(
            (item) =>
              item.id === orderItem.item.id && item.is_current_version,
          );

      if (!currentItem || currentItem.version !== snapshotVersion) {
        return {
          ok: false,
          itemName: orderItem.item.name,
          menuItemGroupId: groupId ?? undefined,
          snapshotVersion,
          currentVersion: currentItem?.version ?? null,
        };
      }
    }

    return { ok: true };
  }

  buildNextMenuItemVersion(input: {
    currentItem: MenuItem;
    nextId: number;
    changedBy?: string | null;
    changeReason?: string | null;
    changes: Partial<
      Pick<
        MenuItem,
        | "name"
        | "price"
        | "category"
        | "description"
        | "image_url"
        | "is_available"
      >
    >;
  }): MenuItem {
    const { currentItem, changes } = input;

    return {
      ...currentItem,
      ...changes,
      id: input.nextId,
      display_order: currentItem.display_order,
      version: currentItem.version + 1,
      menu_item_group_id: currentItem.menu_item_group_id,
      is_current_version: true,
      change_reason: input.changeReason?.trim() || "Menu item updated",
      changed_by: input.changedBy ?? null,
      previous_version_id: currentItem.id,
    };
  }
}

export const menuRepository = new MenuRepository();
