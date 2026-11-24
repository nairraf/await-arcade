import { mkdirSync, writeFileSync } from "node:fs"
import { builtinModules } from "node:module"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const external = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]
const isDev = process.env.ARCADE_DEV === "1"
const outDir = isDev ? ".dev" : "dist"

export default defineConfig({
  plugins: isDev
    ? [
        {
          name: "dev-package-manifest",
          closeBundle() {
            const dir = fileURLToPath(new URL(outDir, import.meta.url))
            mkdirSync(dir, { recursive: true })
            writeFileSync(
              join(dir, "package.json"),
              `${JSON.stringify(
                {
                  name: "await-arcade-opencode-dev",
                  version: "0.1.0",
                  private: true,
                  type: "module",
                  exports: {
                    ".": "./server.js",
                    "./gui-experimental": "./gui-experimental.cjs",
                  },
                },
                null,
                2,
              )}\n`,
            )
          },
        },
      ]
    : [],
  build: {
    lib: {
      entry: "server.js",
      formats: ["es"],
      fileName: () => "server.js",
    },
    outDir,
    emptyOutDir: !isDev,
    target: "node20",
    minify: false,
    rollupOptions: { external },
  },
})
