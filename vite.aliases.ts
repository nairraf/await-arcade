import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Keep aliases ordered from most specific to least specific.
 * The shell registry is a generated file, so it needs its own entry.
 */
export const arcadeAliases = [
  {
    find: /^@await-arcade\/shell\/registry$/,
    replacement: path.resolve(root, "packages/shell/src/registry.generated.ts"),
  },
  {
    find: /^@await-arcade\/game-([^/]+)$/,
    replacement: path.resolve(root, "games/$1/src/index.ts"),
  },
  {
    find: /^@await-arcade\/([^/]+)$/,
    replacement: path.resolve(root, "packages/$1/src/index.ts"),
  },
]
