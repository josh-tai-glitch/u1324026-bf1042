import type { Role, SessionUser } from "./contracts.ts";

const forbiddenResponse = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
    },
  });

export function hasRole(user: SessionUser | null | undefined, role: Role) {
  return Boolean(user?.roles.includes(role));
}

export function hasAnyRole(
  user: SessionUser | null | undefined,
  roles: readonly Role[],
) {
  return roles.some((role) => hasRole(user, role));
}

export function hasAllRoles(
  user: SessionUser | null | undefined,
  roles: readonly Role[],
) {
  return roles.every((role) => hasRole(user, role));
}

export function requireRole(user: SessionUser | null | undefined, role: Role) {
  if (!hasRole(user, role)) {
    throw forbiddenResponse();
  }
}

export function requireAnyRole(
  user: SessionUser | null | undefined,
  roles: readonly Role[],
) {
  if (!hasAnyRole(user, roles)) {
    throw forbiddenResponse();
  }
}

export function isResourceOwner(
  user: SessionUser | null | undefined,
  resourceUserId: string,
) {
  return user?.id === resourceUserId;
}

export function canAccessResource(
  user: SessionUser | null | undefined,
  resourceUserId: string,
  adminRoles: readonly Role[] = ["admin", "owner"],
) {
  return isResourceOwner(user, resourceUserId) || hasAnyRole(user, adminRoles);
}
