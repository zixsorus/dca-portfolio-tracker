import { asc, eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"applyWeightPreset"> = async (args, { db }) => {
  const assetRows = await db.select({ id: schema.assets.id }).from(schema.assets).orderBy(asc(schema.assets.id));
  const savedIds = new Set(assetRows.map((asset) => asset.id));
  const submittedIds = new Set(args.items.map((item) => item.id));
  const total = args.items.reduce((sum, item) => sum + item.weight, 0);
  if (submittedIds.size !== args.items.length || submittedIds.size !== savedIds.size || args.items.some((item) => !savedIds.has(item.id))) {
    return { ok: false, error: "รายชื่อหุ้นเปลี่ยนไป กรุณาสร้างตัวอย่างพรีเซ็ตใหม่" };
  }
  if (Math.abs(total - 1) > 0.001) return { ok: false, error: "น้ำหนักรวมต้องเท่ากับ 100%" };
  const [firstItem, ...remainingItems] = args.items;
  if (!firstItem) return { ok: false, error: "ไม่มีน้ำหนักให้บันทึก" };
  await db.batch([
    db.update(schema.assets).set({ targetWeight: firstItem.weight }).where(eq(schema.assets.id, firstItem.id)),
    ...remainingItems.map((item) => db.update(schema.assets).set({ targetWeight: item.weight }).where(eq(schema.assets.id, item.id))),
  ]);
  return { ok: true };
};
