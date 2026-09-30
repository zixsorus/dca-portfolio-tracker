// Next-round DCA allocation. Extracted from the inline `useMemo` block in
// `client/src/App.tsx` so the money maths is one testable function instead of
// a chain inside a component.
//
// The split formula is the original one, unchanged:
//   desiredTotal = portfolioValue + monthlyDca
//   need_i       = max(0, normalizedTarget_i * desiredTotal - value_i)
//   amount_i     = monthlyDca * need_i / sum(need)      (fallback: monthlyDca * normalizedTarget_i)
// i.e. aim at the *post-deposit* portfolio value, measure each holding's
// shortfall against it, then hand out the new money in proportion to that
// shortfall. Holdings already at or above target get need = 0 and are skipped.
//
// The only behavioural change is the rounding pass, which fixes money
// silently disappearing: amounts are rounded to satang, rows that round below
// 1 baht are dropped, and the leftover — including the dropped rows' share —
// is folded into the largest row so the slices always add up to `monthlyDca`.

export interface AllocationInput {
  symbol: string;
  /** Shortfall against the post-deposit target, in baht. */
  need: number;
  /** Target weight renormalised to sum to 1. */
  normalizedTarget: number;
}

export interface AllocationSlice {
  symbol: string;
  amount: number;
}

const SATANG = 100;

function round2(value: number): number {
  return Math.round(value * SATANG) / SATANG;
}

export function buildAllocation(inputs: AllocationInput[], monthlyDca: number): AllocationSlice[] {
  if (inputs.length === 0 || !(monthlyDca > 0)) return [];

  const needTotal = inputs.reduce((sum, row) => sum + Math.max(0, row.need), 0);
  const raw = inputs.map((row) => ({
    symbol: row.symbol,
    raw: needTotal > 0
      ? (monthlyDca * Math.max(0, row.need)) / needTotal
      : monthlyDca * row.normalizedTarget,
  }));

  const rounded = raw.map((row) => ({ symbol: row.symbol, amount: round2(row.raw) }));
  const kept = rounded.filter((row) => row.amount >= 1);

  // Every row rounds below 1 baht — the budget is too small to split, so
  // suggest putting the whole thing into the largest shortfall.
  if (kept.length === 0) {
    const biggest = raw.reduce((best, row) => (row.raw > best.raw ? row : best), raw[0]!);
    return [{ symbol: biggest.symbol, amount: round2(monthlyDca) }];
  }

  const assigned = kept.reduce((sum, row) => sum + row.amount, 0);
  const residual = round2(monthlyDca - assigned);
  const largest = kept.reduce((best, row) => (row.amount > best.amount ? row : best), kept[0]!);
  largest.amount = Math.max(1, round2(largest.amount + residual));

  return kept.sort((a, b) => b.amount - a.amount);
}
