import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { defineApi } from "./_lib/handler";

const vercelHandler: (req: VercelRequest, res: VercelResponse) => Promise<void> = defineApi(
  "updateSettings",
  async (args, { db }) => {
    // Upsert: a fresh database has no settings row yet (empty schema), so
    // insert it on first save instead of updating zero rows.
    const existing = await db
      .select({ id: schema.settings.id })
      .from(schema.settings)
      .where(eq(schema.settings.id, 1));
    if (existing.length === 0) {
      await db.insert(schema.settings).values({ id: 1, ...args, updatedAt: new Date() });
    } else {
      await db.update(schema.settings).set({ ...args, updatedAt: new Date() }).where(eq(schema.settings.id, 1));
    }
    return { ok: true };
  },
);

export default vercelHandler;
