import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// Defaults so the sidecar can be run by hand for a quick check.
if (!process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT = "54962"
  process.env.ANTIGRAVITY_LS_ADDRESS = "127.0.0.1:0"
  process.env.ANTIGRAVITY_CSRF_TOKEN = "dev-csrf"
}

let sdk
try {
  sdk = await import("sidecar_sdk")
} catch {
  // Antigravity installs the SDK here on macOS. Adjust for another host.
  const fallback = join(homedir(), ".gemini/antigravity/lib/node_modules/sidecar_sdk/index.mjs")
  sdk = await import(pathToFileURL(fallback).href)
}

const { SidecarApp, Response } = sdk
const app = new SidecarApp()
const here = dirname(fileURLToPath(import.meta.url))

function page(path, file, contentType) {
  app.page(path, () => {
    const full = join(here, file)
    const body = existsSync(full) ? readFileSync(full) : ""
    return new Response(body, { contentType })
  })
}

page("/", "index.html", "text/html; charset=utf-8")
page("/app.js", "app.js", "application/javascript; charset=utf-8")
page("/app.css", "app.css", "text/css; charset=utf-8")

await app.run()
console.log("[await-arcade] sidecar running")
