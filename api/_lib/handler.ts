import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  actionSchemas,
  type ActionName,
  type ActionRequest,
  type ActionResponse,
} from "../../shared/actions";
import { db, type Db } from "./db";

export interface ApiContext {
  db: Db;
}

type ApiHandler<A extends ActionName> = (
  args: ActionRequest<A>,
  ctx: ApiContext,
) => Promise<ActionResponse<A>>;

/**
 * Wrap a typed action handler into a Vercel serverless function:
 * - only POST (405 otherwise)
 * - zod-validates the JSON body against the action's request schema
 *   (400 + first issue message on failure)
 * - serializes thrown Errors as { ok: false, error: message }
 * - 500 on unexpected (non-Error) throws
 */
export function defineApi<A extends ActionName>(
  actionName: A,
  handler: ApiHandler<A>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    const parsed = actionSchemas[actionName].request.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    try {
      const result = await handler(parsed.data as ActionRequest<A>, { db });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof Error) {
        // getPortfolio's response shape has no ok/error envelope, so a
        // thrown error there is a real 500; other actions keep the original
        // convention of returning ok:false with the error message.
        res
          .status(actionName === "getPortfolio" ? 500 : 200)
          .json({ ok: false, error: err.message });
        return;
      }
      res.status(500).json({ ok: false, error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
    }
  };
}
