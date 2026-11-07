import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"
import { arcadeAliases } from "../../vite.aliases"

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [gui({ entry: "src/gui.tsx", outFile: "gui-experimental.cjs" })],
  resolve: {
    alias: arcadeAliases,
  },
  build: {
    emptyOutDir: false,
  },
})
