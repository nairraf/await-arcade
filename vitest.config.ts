import { defineConfig } from "vitest/config"
import { arcadeAliases } from "./vite.aliases"

export default defineConfig({
  resolve: { alias: arcadeAliases },
  test: {
    include: ["packages/**/*.test.ts", "games/**/*.test.ts", "tools/**/*.test.ts"],
    environment: "node",
  },
})
