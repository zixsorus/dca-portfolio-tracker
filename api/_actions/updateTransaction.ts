import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"updateTransaction"> = async (args, { db }) => {
  const existing = await db
    .select({ id: schema.transactions.id, assetId: schema.transactions.assetId })
    .from(schema.transactions)
    .where(eq(schema.transactions.id, args.id))
    .limit(1);
  if (!existing[0]) return { ok: false, error: "ไม่พบรายการที่ต้องการแก้ไข" };
  if (existing[0].assetId !== args.assetId) {
    const asset = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.id, args.assetId)).limit(1);
    if (!asset[0]) return { ok: false, error: "ไม่พบหุ้นที่เลือก" };
  }
  const { id, ...values } = args;
  await db.update(schema.transactions).set(values).where(eq(schema.transactions.id, id));
  return { ok: true };
};
