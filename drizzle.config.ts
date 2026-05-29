import { defineConfig } from "drizzle-kit";

const schemaName = process.env.PG_SCHEMA || "bf_v10";

if (schemaName === "public") {
  throw new Error(
    'PG_SCHEMA cannot be "public". Use a custom schema name such as "bf_v10".',
  );
}

const migrationUrl =
  process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "DATABASE_URL_MIGRATION or DATABASE_URL is required for drizzle-kit.",
  );
}

export default defineConfig({
  schema: ["./db/schema.ts", "./db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
  schemaFilter: [schemaName],
});