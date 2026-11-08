import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
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

function stateDir() {
  if (process.env.AWAIT_ARCADE_STATE_DIR) return process.env.AWAIT_ARCADE_STATE_DIR
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "await-arcade")
  }
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? homedir(), "await-arcade")
  }
  return join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "await-arcade")
}

const authFile = join(stateDir(), "auth.antigravity.json")

function apiUrl() {
  if (process.env.AWAIT_ARCADE_API_URL) return process.env.AWAIT_ARCADE_API_URL
  const config = readJson(join(stateDir(), "config.json"), undefined)
  if (typeof config?.apiUrl === "string" && config.apiUrl.length > 0) return config.apiUrl
  return "http://127.0.0.1:8787"
}

function readAuth() {
  const value = readJson(authFile, undefined)
  return typeof value?.refreshToken === "string" && typeof value?.playerId === "string"
    ? value
    : undefined
}

function writeAuth(value) {
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 })
  const temp = `${authFile}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 })
  try {
    renameSync(temp, authFile)
  } catch {
    rmSync(authFile, { force: true })
    renameSync(temp, authFile)
  }
}

function clearAuth() {
  rmSync(authFile, { force: true })
}

function clearAuthIf(refreshToken) {
  const current = readAuth()
  if (current && current.refreshToken !== refreshToken) return false
  clearAuth()
  return true
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let auth = readAuth()
let accessToken
let accessExpiresAt = 0

const client = createArcadeClient({
  baseUrl: apiUrl(),
  playerId,
  getToken: () => accessToken,
})

const status = async () => ({
  signedIn: Boolean(auth),
  ...(auth
    ? {
        playerId: auth.playerId,
        displayName: auth.displayName,
        ...(auth.githubLogin ? { githubLogin: auth.githubLogin } : {}),
      }
    : {}),
  queued: readQueue().length,
})

async function refresh() {
  if (!auth?.refreshToken) return false
  try {
    const result = await client.authRefresh(auth.refreshToken)
    auth = {
      host: "antigravity",
      playerId: result.player.playerId,
      displayName: result.player.displayName,
      ...(result.player.githubLogin ? { githubLogin: result.player.githubLogin } : {}),
      refreshToken: result.refreshToken,
      createdAt: auth.createdAt ?? Date.now(),
      lastUsedAt: Date.now(),
    }
    writeAuth(auth)
    accessToken = result.accessToken
    accessExpiresAt = result.expiresAt
    return true
  } catch (error) {
    if (error?.status === 401) {
      const rejected = auth.refreshToken
      for (const delay of [250, 500, 1_000, 2_000]) {
        await sleep(delay)
        const latest = readAuth()
        if (latest && latest.refreshToken !== rejected) {
          auth = latest
          return refresh()
        }
      }

      if (!clearAuthIf(rejected)) {
        auth = readAuth()
        return refresh()
      }
      auth = undefined
      accessToken = undefined
    }
    return false
  }
}

let refreshing
async function ensureAuth() {
  if (accessToken && accessExpiresAt > Date.now() + 60_000) return true
  if (!auth?.refreshToken) return false
  if (!refreshing) {
    refreshing = refresh().finally(() => {
      refreshing = undefined
    })
  }
  return refreshing
}

async function requireAuth() {
  if (!auth) return
  if (!(await ensureAuth())) throw new Error("sign-in expired; sign in again")
}

void ensureAuth()

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
    await requireAuth()
    await flush()
    return client.start(data.gameId, data.modeId)
  },
  "POST",
)

app.api(
  "/api/submit",
  async (data) => {
    await requireAuth()
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

app.api("/api/best", async (data) => {
  await ensureAuth()
  return { best: await client.bestFor(data.gameId, data.modeId) }
}, "POST")
app.api("/api/board", async (data) => {
  await ensureAuth()
  return client.board(data.gameId, data.modeId)
}, "POST")
app.api("/api/status", async () => ({ mode: "online", playerId, queued: readQueue().length }), "GET")

app.api("/api/auth/status", async () => status(), "POST")
app.api("/api/auth/start", async () => client.authStart("antigravity"), "POST")
app.api(
  "/api/auth/poll",
  async (data) => {
    const result = await client.authPoll(data.flowId)
    if (result.status === "complete") {
      auth = {
        host: "antigravity",
        playerId: result.player.playerId,
        displayName: result.player.displayName,
        ...(result.player.githubLogin ? { githubLogin: result.player.githubLogin } : {}),
        refreshToken: result.refreshToken,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      }
      writeAuth(auth)
      accessToken = result.accessToken
      accessExpiresAt = result.expiresAt
      return { status: "complete", ...(await status()) }
    }
    return { status: "pending", interval: result.interval }
  },
  "POST",
)
app.api(
  "/api/auth/signout",
  async () => {
    await ensureAuth()
    await client.authSignOut()
    auth = undefined
    accessToken = undefined
    clearAuth()
    return status()
  },
  "POST",
)
app.api(
  "/api/auth/delete",
  async () => {
    await ensureAuth()
    await client.deleteMe()
    auth = undefined
    accessToken = undefined
    clearAuth()
    return status()
  },
  "POST",
)

await app.run()
console.log("[await-arcade] sidecar running")
