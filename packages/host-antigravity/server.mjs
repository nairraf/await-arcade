import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createArcadeClient } from "@await-arcade/api-client"

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

const dataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR ?? join(here, ".data")
mkdirSync(dataDir, { recursive: true, mode: 0o700 })

const playerFile = join(dataDir, "player.json")
const queueFile = join(dataDir, "queue.json")

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return fallback
  }
}

let player = readJson(playerFile, undefined)
if (!player?.playerId) {
  player = { playerId: randomUUID() }
  writeFileSync(playerFile, JSON.stringify(player, null, 2), { mode: 0o600 })
}
const playerId = player.playerId

const readQueue = () => {
  const value = readJson(queueFile, [])
  return Array.isArray(value) ? value : []
}

const writeQueue = (items) => {
  writeFileSync(queueFile, JSON.stringify(items, null, 2), { mode: 0o600 })
}

const client = createArcadeClient({
  baseUrl: process.env.AWAIT_ARCADE_API_URL ?? "http://127.0.0.1:8787",
  playerId,
})

async function flush() {
  const items = readQueue()
  if (items.length === 0) return

  const remaining = []
  for (const item of items) {
    try {
      await client.submit(item.runId, item.replay)
    } catch (error) {
      if (!(error?.status >= 400 && error?.status < 500)) remaining.push(item)
    }
  }
  writeQueue(remaining)
}

app.api(
  "/api/start",
  async (data) => {
    await flush()
    return client.start(data.gameId, data.modeId)
  },
  "POST",
)

app.api(
  "/api/submit",
  async (data) => {
    try {
      const result = await client.submit(data.runId, data.replay)
      await flush()
      return result
    } catch (error) {
      if (!(error?.status >= 400 && error?.status < 500)) {
        const items = readQueue()
        items.push({ runId: data.runId, replay: data.replay, at: Date.now() })
        writeQueue(items.slice(-20))
      }
      throw error
    }
  },
  "POST",
)

app.api("/api/best", async (data) => ({ best: await client.bestFor(data.gameId, data.modeId) }), "POST")
app.api("/api/board", async (data) => client.board(data.gameId, data.modeId), "POST")
app.api("/api/status", async () => ({ mode: "online", playerId, queued: readQueue().length }), "GET")

await app.run()
console.log("[await-arcade] sidecar running")
