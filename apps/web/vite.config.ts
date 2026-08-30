import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  assetsInclude: ["**/*.wasm"],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    target: "es2022",
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  publicDir: "public",
  resolve: {
    alias: {
      "@time/core": resolve(rootDir, "../../packages/time_core/src"),
    },
  },
  root: ".",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
})
