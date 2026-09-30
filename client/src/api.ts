// Fetch-based REST client for the Vercel serverless API.
// Each method POSTs its args as JSON to `/api/<action>` and returns the
// parsed response, throwing an `Error` carrying the server's `error`
// message when the request fails (HTTP non-OK or invalid JSON).
//
// Types come straight from `shared/actions.ts` — `import type` is type-only
// by design: the client bundle never pulls in any server runtime. With
// `verbatimModuleSyntax: true`, dropping `type` is a compile error.

import type {
  ActionName,
  ActionRequest,
  ActionResponse,
} from "../../shared/actions";

async function callAction<A extends ActionName>(
  action: A,
  args: ActionRequest<A>,
): Promise<ActionResponse<A>> {
  let res: Response;
  try {
    res = await fetch(`/api/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body (proxy error page, etc.) — fall through to the status check.
  }

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `เรียก API ล้มเหลว (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data as ActionResponse<A>;
}

export const api = {
  getPortfolio: (args: ActionRequest<"getPortfolio">): Promise<ActionResponse<"getPortfolio">> =>
    callAction("getPortfolio", args),
  updateSettings: (args: ActionRequest<"updateSettings">): Promise<ActionResponse<"updateSettings">> =>
    callAction("updateSettings", args),
  refreshMarketPrices: (args: ActionRequest<"refreshMarketPrices">): Promise<ActionResponse<"refreshMarketPrices">> =>
    callAction("refreshMarketPrices", args),
  previewWeightPreset: (args: ActionRequest<"previewWeightPreset">): Promise<ActionResponse<"previewWeightPreset">> =>
    callAction("previewWeightPreset", args),
  applyWeightPreset: (args: ActionRequest<"applyWeightPreset">): Promise<ActionResponse<"applyWeightPreset">> =>
    callAction("applyWeightPreset", args),
  addAsset: (args: ActionRequest<"addAsset">): Promise<ActionResponse<"addAsset">> =>
    callAction("addAsset", args),
  updateAsset: (args: ActionRequest<"updateAsset">): Promise<ActionResponse<"updateAsset">> =>
    callAction("updateAsset", args),
  deleteAsset: (args: ActionRequest<"deleteAsset">): Promise<ActionResponse<"deleteAsset">> =>
    callAction("deleteAsset", args),
  addTransaction: (args: ActionRequest<"addTransaction">): Promise<ActionResponse<"addTransaction">> =>
    callAction("addTransaction", args),
  updateTransaction: (args: ActionRequest<"updateTransaction">): Promise<ActionResponse<"updateTransaction">> =>
    callAction("updateTransaction", args),
  deleteTransaction: (args: ActionRequest<"deleteTransaction">): Promise<ActionResponse<"deleteTransaction">> =>
    callAction("deleteTransaction", args),
  importTransactions: (args: ActionRequest<"importTransactions">): Promise<ActionResponse<"importTransactions">> =>
    callAction("importTransactions", args),
  importBackup: (args: ActionRequest<"importBackup">): Promise<ActionResponse<"importBackup">> =>
    callAction("importBackup", args),
  getPriceHistory: (args: ActionRequest<"getPriceHistory">): Promise<ActionResponse<"getPriceHistory">> =>
    callAction("getPriceHistory", args),
  backfillPriceHistory: (args: ActionRequest<"backfillPriceHistory">): Promise<ActionResponse<"backfillPriceHistory">> =>
    callAction("backfillPriceHistory", args),
};

// Type helpers kept compatible with the previous SDK client so existing
// client code keeps compiling unchanged:
//
//     import { api, type ApiResponse } from "./api";
//     type Portfolio = ApiResponse<typeof api, "getPortfolio">;
//     (input: Parameters<typeof api.addTransaction>[0]) => api.addTransaction(input);
export type ApiRequest<TApi, TAction extends keyof TApi> = Parameters<
  Extract<TApi[TAction], (...args: never[]) => unknown>
>[0];

export type ApiResponse<TApi, TAction extends keyof TApi> = Awaited<
  ReturnType<Extract<TApi[TAction], (...args: never[]) => unknown>>
>;
