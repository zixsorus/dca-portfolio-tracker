import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { defineApi } from "./_lib/handler";

const vercelHandler: (req: VercelRequest, res: VercelResponse) => Promise<void> = defineApi(
  "deleteAsset",
  async (args, { db }) => {
    const found = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.id, args.id)).limit(1);
    if (!found[0]) return { ok: false, error: "ไม่พบหุ้นที่ต้องการลบ" };
    await db.batch([
      db.delete(schema.transactions).where(eq(schema.transactions.assetId, args.id)),
      db.delete(schema.assets).where(eq(schema.assets.id, args.id)),
    ]);
    return { ok: true };
  },
);

export default vercelHandler;
