import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"
import { arcadeAliases } from "../../vite.aliases"

const isDev = process.env.ARCADE_DEV === "1"

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    gui({
      entry: "src/gui.tsx",
      outFile: isDev ? ".dev/gui-experimental.cjs" : "gui-experimental.cjs",
    }),
  ],
  define: {
    __ARCADE_DEV__: JSON.stringify(isDev),
  },
  resolve: {
    alias: arcadeAliases,
  },
  build: {
    emptyOutDir: false,
  },
})
