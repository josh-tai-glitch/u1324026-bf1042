import { describe, expect, test } from "bun:test";
import {
  auditLogActionSchema,
  auditLogSchema,
} from "../shared/contracts.ts";

describe("audit log contracts", () => {
  test("accepts new order audit actions", () => {
    expect(auditLogActionSchema.parse("order_submit")).toBe("order_submit");
    expect(auditLogActionSchema.parse("order_rating_update")).toBe(
      "order_rating_update",
    );
  });

  test("accepts new role and staff order audit actions", () => {
    expect(auditLogActionSchema.parse("role_request_create")).toBe(
      "role_request_create",
    );
    expect(auditLogActionSchema.parse("phone_order_create")).toBe(
      "phone_order_create",
    );
  });

  test("accepts new menu audit actions", () => {
    expect(auditLogActionSchema.parse("menu_display_order_update")).toBe(
      "menu_display_order_update",
    );
    expect(auditLogActionSchema.parse("menu_ab_test_update")).toBe(
      "menu_ab_test_update",
    );
    expect(auditLogActionSchema.parse("menu_availability_update")).toBe(
      "menu_availability_update",
    );
  });

  test("parses a sample audit log with a new action", () => {
    const parsed = auditLogSchema.parse({
      id: 1,
      actorUserId: "admin-user",
      actorName: "Admin User",
      actorRoles: ["admin"],
      action: "order_submit",
      targetType: "order",
      targetId: "42",
      message: "Order #42 submitted by customer",
      metadata: null,
      createdAt: new Date().toISOString(),
    });

    expect(parsed.action).toBe("order_submit");
    expect(parsed.metadata).toBeNull();
  });
});
