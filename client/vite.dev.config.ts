import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

// Local dev only (`npm run dev` → scripts/dev.ts spawns vite with this config).
// The base config anchors root to client/; here we only add the dev server
// proxy so the browser's /api/* calls reach the local API dev server.
export default mergeConfig(
  base,
  defineConfig({
    server: {
      port: Number(process.env.VITE_PORT ?? 5173),
      proxy: {
        "/api": `http://localhost:${process.env.API_PORT ?? 3001}`,
      },
    },
  }),
);
