import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { apiUrl, createHostSession, stateDir } from "@await-arcade/api-client"

function readStateName(argv) {
  const index = argv.indexOf("--state-name")
  if (index === -1) return "await-arcade"
  const value = argv[index + 1]
  if (!value || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error(`Invalid --state-name: ${value ?? "(missing)"}`)
  }
  return value
}

const stateName = readStateName(process.argv.slice(2))
const hostStateDir = stateDir(stateName)
const hostApiUrl = apiUrl(hostStateDir)

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

const dataDir =
  process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR ??
  join(here, stateName === "await-arcade" ? ".data" : `.data-${stateName}`)
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
  baseUrl: hostApiUrl,
  stateDir: hostStateDir,
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
app.api("/api/ghost", (data) => session.ghost(data.ghostId), "POST")
app.api("/api/profile", () => session.profile(), "POST")
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
app.api("/api/auth/name", (data) => session.updateName(data.displayName), "POST")
app.api("/api/auth/name-available", (data) => session.nameAvailable(data.displayName), "POST")

mkdirSync(hostStateDir, { recursive: true, mode: 0o700 })
const attentionFile = join(hostStateDir, "agent-attention.json")
const attentionEvents = []
let attentionSeq = 0
let lastAttentionId = readJson(attentionFile, undefined)?.id
const attentionWaiters = new Set()

function matchingAttention(afterSeq, conversationId) {
  return attentionEvents.find(
    (entry) =>
      entry.seq > afterSeq &&
      (!conversationId || !entry.conversationId || entry.conversationId === conversationId),
  )
}

function checkAttentionFile() {
  const next = readJson(attentionFile, undefined)
  if (!next || typeof next.id !== "string" || next.id === lastAttentionId) return
  lastAttentionId = next.id
  attentionSeq += 1
  attentionEvents.push({
    seq: attentionSeq,
    conversationId: typeof next.conversationId === "string" ? next.conversationId : "",
    reason: next.reason === "prompt" ? "prompt" : "reply",
  })
  if (attentionEvents.length > 32) attentionEvents.shift()
  for (const notify of [...attentionWaiters]) notify()
}

try {
  const watcher = watch(hostStateDir, (_eventType, filename) => {
    if (!filename || filename === "agent-attention.json") checkAttentionFile()
  })
  watcher.unref?.()
} catch {
  // Best-effort file watching; if unavailable, long-polls just time out quietly.
}

app.api(
  "/api/attention",
  (data) => {
    checkAttentionFile()
    if (typeof data?.afterSeq !== "number" || !Number.isFinite(data.afterSeq)) {
      return { seq: attentionSeq }
    }
    const afterSeq = data.afterSeq
    const conversationId = typeof data?.conversationId === "string" ? data.conversationId : ""
    const immediate = matchingAttention(afterSeq, conversationId)
    if (immediate) {
      return { seq: immediate.seq, event: { reason: immediate.reason } }
    }

    return new Promise((resolve) => {
      let settled = false
      const cleanup = (notify, timer) => {
        if (settled) return false
        settled = true
        clearTimeout(timer)
        attentionWaiters.delete(notify)
        return true
      }
      const notify = () => {
        const hit = matchingAttention(afterSeq, conversationId)
        if (!hit) return
        if (cleanup(notify, timer)) {
          resolve({ seq: hit.seq, event: { reason: hit.reason } })
        }
      }
      const timer = setTimeout(() => {
        if (cleanup(notify, timer)) {
          resolve({ seq: Math.max(afterSeq, attentionSeq) })
        }
      }, 15_000)
      timer.unref?.()
      attentionWaiters.add(notify)
    })
  },
  "POST",
)

await app.run()
console.log(`[${stateName}] sidecar running`)
