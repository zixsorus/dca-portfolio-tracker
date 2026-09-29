import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../shared/schema";

function resolveDatabaseUrl(): string {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error(
      "TURSO_DATABASE_URL is not set — กรุณาตั้งค่า TURSO_DATABASE_URL (ใช้ file: URL ได้สำหรับ dev ท้องถิ่น)",
    );
  }
  return url;
}

const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

// Module-level singleton: one libsql client per serverless instance, reused
// across warm invocations. Works with remote Turso URLs (authToken) and with
// local `file:` URLs (no token needed) for dev.
const client = authToken
  ? createClient({ url: resolveDatabaseUrl(), authToken })
  : createClient({ url: resolveDatabaseUrl() });

export const db = drizzle(client, { schema });

export type Db = typeof db;
