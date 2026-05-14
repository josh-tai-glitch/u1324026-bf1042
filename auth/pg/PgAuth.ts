import { asc } from "drizzle-orm";
import type { SessionUser, User } from "../../shared/contracts.ts";
import type { Auth, LoginErrorCode } from "../Auth.ts";
import { db } from "../../db/client.ts";
import { usersTable } from "../../db/schema.ts";
import { toSessionUser } from "../user-mapper.ts";

export class PgAuth implements Auth {
  private users: User[] = [];

  async init(): Promise<void> {
    // 在 init() 時將 users 從 DB 載入記憶體
    // 後續 login() / getUserById() 皆為同步查詢，backend.ts 零改動
    const rows = await db.select().from(usersTable).orderBy(asc(usersTable.id));

    this.users = rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      password: row.password,
    }));
  }

  login(input: {
    email: string;
    password: string;
  }): { ok: true; user: SessionUser } | { ok: false; code: LoginErrorCode } {
    const matched = this.users.find(
      (u) => u.email === input.email && u.password === input.password,
    );

    if (!matched) return { ok: false, code: "INVALID_CREDENTIALS" };

    return {
      ok: true,
      user: toSessionUser(matched),
    };
  }

  getUserById(userId: string): SessionUser | undefined {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return undefined;

    return toSessionUser(user);
  }
}
