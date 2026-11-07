import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { arcadeAliases } from "../../vite.aliases"

const here = fileURLToPath(new URL(".", import.meta.url))
const web = fileURLToPath(new URL("./web", import.meta.url))
const entry = fileURLToPath(new URL("./web/index.html", import.meta.url))

export default defineConfig({
  root: web,
  base: "/",
  resolve: {
    alias: arcadeAliases,
  },
  build: {
    outDir: here,
    emptyOutDir: false,
    rollupOptions: {
      input: entry,
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "app-[name].js",
        assetFileNames: "app.[ext]",
      },
    },
  },
})
