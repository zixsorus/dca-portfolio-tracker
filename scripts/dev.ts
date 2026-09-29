#!/usr/bin/env tsx
/**
 * scripts/dev.ts — `npm run dev`
 *
 * Runs the whole app locally without Vercel CLI:
 *  - API dev server on http://localhost:3001 (loads api/<action>.ts directly,
 *    adapting Node req/res to the Vercel handler signature)
 *  - Vite dev server on http://localhost:5173 with /api proxied to :3001
 *
 * Database: uses TURSO_DATABASE_URL when set, otherwise a local SQLite file
 * at ./local.db — created on first run and seeded from your portfolio data
 * when the original app.db is found (read-only, never modified), otherwise
 * created with the migration default data.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORK_DIR = resolve(SCRIPT_DIR, "..");
const API_PORT = Number(process.env.API_PORT ?? 3001);
const VITE_PORT = Number(process.env.VITE_PORT ?? 5173);

const ACTIONS = [
  "getPortfolio",
  "updateSettings",
  "refreshMarketPrices",
  "previewWeightPreset",
  "applyWeightPreset",
  "addAsset",
  "updateAsset",
  "deleteAsset",
  "addTransaction",
  "deleteTransaction",
] as const;

/** Minimal .env loader (KEY=VALUE, ignores comments/blanks, no quotes handling needed). */
function loadDotEnv(): void {
  const envPath = join(WORK_DIR, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

/** Ensure we have a database for local dev; auto-seed on first run when possible. */
function ensureDatabase(): void {
  if (process.env.TURSO_DATABASE_URL) return;
  const localDb = join(WORK_DIR, "local.db");
  process.env.TURSO_DATABASE_URL = `file:${localDb}`;
  if (existsSync(localDb)) return;

  const hatchDb = join(homedir(), "workspace", "ts-spaces", "dca-portfolio-tracker", "app.db");
  const seedArgs =
    existsSync(hatchDb)
      ? ["--source", hatchDb, "--target", `file:${localDb}`]
      : ["--migrate-only", "--target", `file:${localDb}`];
  if (existsSync(hatchDb)) {
    console.log("[dev] creating ./local.db from your portfolio data (first run)…");
  } else {
    console.log("[dev] creating ./local.db with default data (first run)…");
  }
  execFileSync(
    process.execPath,
    [join(SCRIPT_DIR, "seed-from-sqlite.mjs"), ...seedArgs],
    { cwd: WORK_DIR, stdio: "inherit" },
  );
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolveBody({});
      try {
        resolveBody(JSON.parse(raw));
      } catch {
        resolveBody({});
      }
    });
    req.on("error", () => resolveBody({}));
  });
}

type VercelLikeHandler = (
  req: IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> },
  res: ServerResponse & {
    status: (code: number) => ServerResponse;
    json: (obj: unknown) => ServerResponse;
  },
) => Promise<void> | void;

async function main(): Promise<void> {
  loadDotEnv();
  ensureDatabase();

  // Preload all action handlers AFTER env setup (api/_lib/db.ts reads env at import).
  const handlers = new Map<string, VercelLikeHandler>();
  for (const name of ACTIONS) {
    const mod = await import(pathToFileURL(join(WORK_DIR, "api", `${name}.ts`)).href);
    handlers.set(name, mod.default as VercelLikeHandler);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = /^\/api\/([A-Za-z]+)$/.exec(url.pathname);
    const handler = match ? handlers.get(match[1]) : undefined;
    if (!handler) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
      return;
    }

    const body = await readJsonBody(req);
    const vReq = req as IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };
    vReq.body = body;
    vReq.query = Object.fromEntries(url.searchParams.entries());

    const vRes = res as ServerResponse & {
      status: (code: number) => ServerResponse;
      json: (obj: unknown) => ServerResponse;
    };
    vRes.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    vRes.json = (obj: unknown) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };

    try {
      await handler(vReq, vRes);
    } catch (err) {
      console.error(`[api] ${match![1]} crashed:`, err);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" }));
      }
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.on("error", reject);
    server.listen(API_PORT, "127.0.0.1", () => resolveListen());
  });
  console.log(`[dev] API   → http://localhost:${API_PORT}/api/<action>`);

  // Run the vite CLI through node directly (not node_modules/.bin/vite,
  // which is a .cmd shim on Windows that spawn() cannot execute).
  const viteCli = join(WORK_DIR, "node_modules", "vite", "bin", "vite.js");
  const vite = spawn(process.execPath, [viteCli, "-c", "client/vite.dev.config.ts"], {
    cwd: WORK_DIR,
    stdio: "inherit",
    env: { ...process.env, VITE_PORT: String(VITE_PORT) },
  });

  const shutdown = () => {
    vite.kill("SIGINT");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  vite.on("exit", (code) => {
    console.log(`[dev] vite exited (${code}), shutting down`);
    server.close(() => process.exit(code ?? 0));
  });

  console.log(`[dev] App   → http://localhost:${VITE_PORT}`);
  console.log(`[dev] press Ctrl+C to stop`);
}

main().catch((err) => {
  console.error("[dev] failed to start:", err);
  process.exit(1);
});
