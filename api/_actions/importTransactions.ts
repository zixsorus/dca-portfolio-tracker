import * as schema from "../../shared/schema";
import { transactionInputSchema, type ActionRequest } from "../../shared/actions";
import type { ApiHandler } from "../_lib/handler";

const MAX_BATCH = 200;
type StrictRow = ActionRequest<"addTransaction">;

export const handler: ApiHandler<"importTransactions"> = async (args, { db }) => {
  const items = args.items.slice(0, MAX_BATCH);

  // One lookup for every referenced asset (a plan holds tens of symbols at
  // most), so per-row failures can name the symbol the user picked.
  const assetRows = await db
    .select({ id: schema.assets.id, symbol: schema.assets.symbol })
    .from(schema.assets);
  const symbolById = new Map(assetRows.map((row) => [row.id, row.symbol]));

  const accepted: Array<{ index: number; value: StrictRow }> = [];
  const failed: Array<{ index: number; symbol: string; error: string }> = [];

  items.forEach((item, index) => {
    const symbol = symbolById.get(item.assetId) ?? "";
    // Partial success is the point here: a typo in one CSV line must not cost
    // the user the other 49 rows.
    const parsed = transactionInputSchema.safeParse(item);
    if (!parsed.success) {
      failed.push({ index, symbol, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    if (!symbol) {
      failed.push({ index, symbol, error: "ไม่พบหุ้นที่เลือก" });
      return;
    }
    accepted.push({ index, value: parsed.data });
  });

  if (accepted.length === 0) {
    return { ok: false, imported: 0, failed, error: "ไม่มีรายการที่บันทึกได้ กรุณาตรวจสอบข้อมูลอีกครั้ง" };
  }

  const [first, ...rest] = accepted;
  await db.batch([
    db.insert(schema.transactions).values(first!.value),
    ...rest.map((row) => db.insert(schema.transactions).values(row.value)),
  ]);

  return { ok: true, imported: accepted.length, failed };
};
