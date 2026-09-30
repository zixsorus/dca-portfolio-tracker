// The single Vercel serverless function for the whole API surface.
//
// Vercel Hobby caps deployments at 12 serverless functions, and the app
// outgrew that (one file per action). Serving every action from one function
// removes the cap entirely while keeping the client contract in
// `client/src/api.ts` unchanged: it still POSTs to `/api/<action>`.
//
// The file is deliberately named `handler.ts` rather than `[action].ts`.
// Vercel's standalone `/api` directory maps files to routes by *file path*
// only — square-bracket dynamic segments are a Next.js feature, so
// `api/[action].ts` deploys to a literal `/api/%5Baction%5D` path and every
// real request 404s. Instead `vercel.json` rewrites `/api/<action>` to
// `/api/handler/<action>`, which is plain documented path-param rewrites.
//
// Handlers live in `api/_actions/` (underscore-prefixed, so Vercel does not
// treat them as functions) and are registered in `api/_actions/index.ts`.
// Validation, status codes and error envelopes come from `runAction` in
// `api/_lib/handler.ts` — identical to the old per-file `defineApi` wrapper.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { actionHandlers } from "./_actions";
import { isActionName, runAction } from "./_lib/handler";
import type { ActionName } from "../shared/actions";

/**
 * Works out which action was requested. The rewrite puts the action in the
 * last path segment (`/api/handler/getPortfolio`); the query form
 * (`/api/handler?action=getPortfolio`) is accepted too so the function keeps
 * working if the destination in `vercel.json` is ever changed to that form.
 * Whichever resolves to a real action wins, and an unknown name is a 404
 * rather than a 500.
 */
function resolveAction(req: VercelRequest): ActionName | null {
  const fromQuery = req.query.action;
  if (typeof fromQuery === "string" && isActionName(fromQuery)) return fromQuery;

  const segments = (req.url ?? "").split("?")[0]!.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (last !== undefined && isActionName(last)) return last;

  return null;
}

const vercelHandler = async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  const action = resolveAction(req);
  if (!action) {
    res.status(404).json({ ok: false, error: "ไม่พบ action ที่เรียกใช้" });
    return;
  }
  await runAction(action, actionHandlers[action], req, res);
};

export default vercelHandler;
