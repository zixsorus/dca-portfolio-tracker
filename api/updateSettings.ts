import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { defineApi } from "./_lib/handler";

const vercelHandler: (req: VercelRequest, res: VercelResponse) => Promise<void> = defineApi(
  "updateSettings",
  async (args, { db }) => {
    await db.update(schema.settings).set({ ...args, updatedAt: new Date() }).where(eq(schema.settings.id, 1));
    return { ok: true };
  },
);

export default vercelHandler;
