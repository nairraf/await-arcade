import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Antigravity's plugin:// page handler returns 500 for the external app.js
// bundle, while an inline module runs. Selos Pulse ships a single-file page for
// the same reason. Keep the source split; inline at build time.
const here = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(here, "index.html")
const appPath = join(here, "app.js")

const html = readFileSync(htmlPath, "utf8")
const app = readFileSync(appPath, "utf8")
const tag = /<script type="module" crossorigin src="\/app\.js"><\/script>/

const moduleTags = html.match(/<script\b[^>]*\btype="module"/gi) ?? []
if (moduleTags.length !== 1) {
  throw new Error(
    `Antigravity build: expected one module script before inlining, found ${moduleTags.length}`,
  )
}

if (!tag.test(html)) {
  throw new Error("Antigravity build: app.js script tag not found in index.html")
}

const inlined = html.replace(
  tag,
  () => `<script type="module">${app.replace(/<\/script/gi, "<\\/script")}</script>`,
)

if (/src="\/app\.js"/.test(inlined)) {
  throw new Error("Antigravity build: app.js script tag survived inlining")
}

writeFileSync(htmlPath, inlined)
console.log(`Inlined app.js into index.html (${inlined.length} bytes)`)
