import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"deleteAsset"> = async (args, { db }) => {
  const found = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.id, args.id)).limit(1);
  if (!found[0]) return { ok: false, error: "ไม่พบหุ้นที่ต้องการลบ" };
  await db.batch([
    db.delete(schema.transactions).where(eq(schema.transactions.assetId, args.id)),
    db.delete(schema.priceHistory).where(eq(schema.priceHistory.assetId, args.id)),
    db.delete(schema.assets).where(eq(schema.assets.id, args.id)),
  ]);
  return { ok: true };
};
