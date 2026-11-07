import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { arcadeAliases } from "../../vite.aliases"

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    port: 5199,
    open: false,
  },
  resolve: {
    alias: arcadeAliases,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
