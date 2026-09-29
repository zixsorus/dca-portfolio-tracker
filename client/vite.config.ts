import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // The npm script runs `vite build -c client/vite.config.ts` from the repo
  // root, where Vite's default root (process.cwd()) would be wrong. Anchor
  // the project root to this config's directory so `client/index.html` is
  // the entry and `dist/` lands inside `client/`.
  root: configDir,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(configDir, "dist"),
    emptyOutDir: true,
  },
});
