// Single Vercel serverless function for the whole API surface.
//
// Vercel Hobby caps deployments at 12 serverless functions, and the app
// outgrew that (one file per action). Routing `/api/<action>` through one
// catch-all function removes the cap entirely while keeping the client
// contract in `client/src/api.ts` unchanged: it still POSTs to `/api/<action>`.
//
// Handlers live in `api/_actions/` (underscore-prefixed, so Vercel does not
// treat them as functions) and are registered in `api/_actions/index.ts`.
// Validation, status codes and error envelopes come from `runAction` in
// `api/_lib/handler.ts` — identical to the old per-file `defineApi` wrapper.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { actionHandlers } from "./_actions";
import { isActionName, runAction } from "./_lib/handler";

const vercelHandler = async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  if (!action || !isActionName(action)) {
    res.status(404).json({ ok: false, error: "ไม่พบ action ที่เรียกใช้" });
    return;
  }
  await runAction(action, actionHandlers[action], req, res);
};

export default vercelHandler;
