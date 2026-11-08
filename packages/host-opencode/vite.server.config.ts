import { builtinModules } from "node:module"
import { defineConfig } from "vite"

const external = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]

export default defineConfig({
  build: {
    lib: {
      entry: "server.js",
      formats: ["es"],
      fileName: () => "server.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "node20",
    minify: false,
    rollupOptions: { external },
  },
})
