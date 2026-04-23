import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client.ts";
import {
  authAccountsTable,
  authSessionsTable,
  authUsersTable,
} from "./db/schema.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Better Auth.`);
  }
  return value;
}

const baseURL = requireEnv("BETTER_AUTH_URL");
const secret = requireEnv("BETTER_AUTH_SECRET");
const googleClientId = requireEnv("GOOGLE_CLIENT_ID");
const googleClientSecret = requireEnv("GOOGLE_CLIENT_SECRET");

const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export const auth = betterAuth({
  baseURL,
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUsersTable,
      session: authSessionsTable,
      account: authAccountsTable,
    },
  }),
  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    },
  },
  ...(trustedOrigins.length > 0 ? { trustedOrigins } : {}),
});
