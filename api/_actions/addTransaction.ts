import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"addTransaction"> = async (args, { db }) => {
  const found = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.id, args.assetId)).limit(1);
  if (!found[0]) return { ok: false, error: "ไม่พบหุ้นที่เลือก" };
  await db.insert(schema.transactions).values(args);
  return { ok: true };
};
