import type { SessionUser, User } from "../shared/contracts.ts";

export function toSessionUser(
  user: Pick<User, "id" | "email" | "name"> & Partial<Pick<User, "roles">>,
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles ?? ["customer"],
  };
}
