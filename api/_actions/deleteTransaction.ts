import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"deleteTransaction"> = async (args, { db }) => {
  // Existence check: deleting a row that is not there should say so instead of
  // silently reporting success.
  const existing = await db
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(eq(schema.transactions.id, args.id))
    .limit(1);
  if (!existing[0]) return { ok: false, error: "ไม่พบรายการที่ต้องการลบ" };
  await db.delete(schema.transactions).where(eq(schema.transactions.id, args.id));
  return { ok: true };
};
