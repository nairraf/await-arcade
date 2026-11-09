import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createHostSession } from "@await-arcade/api-client"

// Defaults so the sidecar can be run by hand for a quick check.
if (!process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT = "54962"
  process.env.ANTIGRAVITY_LS_ADDRESS = "127.0.0.1:0"
  process.env.ANTIGRAVITY_CSRF_TOKEN = randomUUID()
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

const session = createHostSession({
  host: "antigravity",
  playerId,
  readQueue: () => {
    const value = readJson(queueFile, [])
    return Array.isArray(value) ? value : []
  },
  writeQueue: (items) => {
    writeFileSync(queueFile, JSON.stringify(items, null, 2), { mode: 0o600 })
  },
})

app.api("/api/start", (data) => session.start(data.gameId, data.modeId), "POST")
app.api("/api/submit", (data) => session.submit(data.runId, data.replay), "POST")
app.api("/api/best", (data) => session.best(data.gameId, data.modeId), "POST")
app.api("/api/board", (data) => session.board(data.gameId, data.modeId), "POST")
app.api("/api/player-best", (data) => session.playerBest(data.gameId, data.modeId), "POST")
app.api("/api/daily", () => session.daily(), "POST")
app.api("/api/daily-start", async (data) => {
  try {
    return await session.dailyStart(data.challengeId)
  } catch (error) {
    if (String(error?.message ?? "").includes("sign-in")) {
      return { ok: false, error: "Sign in again to play the daily." }
    }
    throw error
  }
}, "POST")
app.api("/api/daily-board", (data) => session.dailyBoard(data.challengeId), "POST")
app.api(
  "/api/status",
  async () => {
    const st = await session.status()
    return { mode: "online", playerId, queued: st.queued }
  },
  "GET",
)

app.api("/api/auth/status", () => session.status(), "POST")
app.api("/api/auth/start", () => session.authStart(), "POST")
app.api("/api/auth/poll", (data) => session.authPoll(data.flowId), "POST")
app.api("/api/auth/signout", () => session.authSignOut(), "POST")
app.api("/api/auth/delete", () => session.deleteAccount(), "POST")

await app.run()
console.log("[await-arcade] sidecar running")
