import type { SessionUser } from "../shared/contracts.ts";

export const DEMO_AUTH_ENABLED = process.env.DEMO_AUTH_ENABLED === "true";
export const DEMO_AUTH_COOKIE_NAME = "bf_demo_user";

const demoUsers: SessionUser[] = [
  {
    id: "demo-owner",
    email: "demo-owner@example.test",
    name: "Demo Owner",
    roles: ["customer", "owner"],
  },
  {
    id: "demo-admin",
    email: "demo-admin@example.test",
    name: "Demo Admin",
    roles: ["customer", "admin"],
  },
  {
    id: "demo-staff",
    email: "demo-staff@example.test",
    name: "Demo Staff",
    roles: ["customer", "staff"],
  },
  {
    id: "demo-chef",
    email: "demo-chef@example.test",
    name: "Demo Chef",
    roles: ["customer", "chef"],
  },
  {
    id: "demo-customer",
    email: "demo-customer@example.test",
    name: "Demo Customer",
    roles: ["customer"],
  },
];

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const cookiePair of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookiePair.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return null;
}

export function listDemoUsers(): SessionUser[] {
  return demoUsers.map((user) => ({ ...user, roles: [...user.roles] }));
}

export function getDemoUserById(userId: string): SessionUser | null {
  const user = demoUsers.find((demoUser) => demoUser.id === userId);
  return user ? { ...user, roles: [...user.roles] } : null;
}

export function getDemoUserFromCookie(request: Request): SessionUser | null {
  if (!DEMO_AUTH_ENABLED) return null;

  const userId = readCookie(request, DEMO_AUTH_COOKIE_NAME);
  return userId ? getDemoUserById(userId) : null;
}
