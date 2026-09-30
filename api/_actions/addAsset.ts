import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"addAsset"> = async (args, { db }) => {
  const symbol = args.symbol.toUpperCase();
  const existing = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.symbol, symbol)).limit(1);
  if (existing[0]) return { ok: false, error: "มีสัญลักษณ์หุ้นนี้แล้ว" };
  await db.insert(schema.assets).values({ ...args, symbol });
  return { ok: true };
};
