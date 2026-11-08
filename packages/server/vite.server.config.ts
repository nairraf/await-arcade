import { builtinModules } from "node:module"
import { defineConfig } from "vite"

const external = [
  "@google-cloud/firestore",
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]

export default defineConfig({
  build: {
    lib: {
      entry: "src/cloud.ts",
      formats: ["es"],
      fileName: () => "cloud.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "node22",
    minify: false,
    rollupOptions: { external },
  },
})
