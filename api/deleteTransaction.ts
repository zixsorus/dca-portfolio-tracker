import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { defineApi } from "./_lib/handler";

const vercelHandler: (req: VercelRequest, res: VercelResponse) => Promise<void> = defineApi(
  "deleteTransaction",
  async (args, { db }) => {
    await db.delete(schema.transactions).where(eq(schema.transactions.id, args.id));
    return { ok: true };
  },
);

export default vercelHandler;
