import { builtinModules } from "node:module"
import { defineConfig } from "vite"

const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  "sidecar_sdk",
]

export default defineConfig({
  build: {
    lib: {
      entry: "server.mjs",
      formats: ["es"],
      fileName: () => "server.mjs",
    },
    outDir: "dist-server",
    emptyOutDir: true,
    target: "node20",
    minify: false,
    rollupOptions: { external },
  },
})
