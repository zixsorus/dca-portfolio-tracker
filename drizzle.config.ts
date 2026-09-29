import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config — the standard way to manage schema changes.
 *
 *   $env:TURSO_DATABASE_URL="libsql://<db>.turso.io"   # PowerShell
 *   $env:TURSO_AUTH_TOKEN="<token>"
 *   npm run db:migrate    # apply drizzle/*.sql to the target DB
 *
 * For local file DBs: TURSO_DATABASE_URL=file:./local.db (no token needed).
 */
export default defineConfig({
  dialect: "turso",
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
