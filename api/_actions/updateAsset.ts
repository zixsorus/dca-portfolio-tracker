import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"updateAsset"> = async (args, { db }) => {
  const symbol = args.symbol.toUpperCase();
  const duplicate = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.symbol, symbol)).limit(1);
  if (duplicate[0] && duplicate[0].id !== args.id) return { ok: false, error: "มีสัญลักษณ์หุ้นนี้แล้ว" };
  const { id, ...values } = args;
  await db.update(schema.assets).set({ ...values, symbol }).where(eq(schema.assets.id, id));
  return { ok: true };
};
