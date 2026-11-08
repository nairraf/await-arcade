import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createArcadeClient } from "@await-arcade/api-client"
import { Api } from "./src/rpc.js"

/**
 * OpenCode server part.
 *
 * The renderer calls this over RPC. This half owns the API client, the player
 * identity, and the GitHub session; the renderer never sees a token.
 */
const QUEUE_KEY = "submit.queue"
const HOST = "opencode"

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

function authPath() {
  return join(stateDir(), `auth.${HOST}.json`)
}

function readAuth() {
  try {
    const value = JSON.parse(readFileSync(authPath(), "utf8"))
    return typeof value?.refreshToken === "string" && typeof value?.playerId === "string"
      ? value
      : undefined
  } catch {
    return undefined
  }
}

function writeAuth(value) {
  const dir = stateDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = authPath()
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 })
  try {
    renameSync(temp, file)
  } catch {
    rmSync(file, { force: true })
    renameSync(temp, file)
  }
}

function clearAuth() {
  rmSync(authPath(), { force: true })
}

function clearAuthIf(refreshToken) {
  const current = readAuth()
  if (current && current.refreshToken !== refreshToken) return false
  clearAuth()
  return true
}

function apiUrl() {
  if (process.env.AWAIT_ARCADE_API_URL) return process.env.AWAIT_ARCADE_API_URL
  try {
    const value = JSON.parse(readFileSync(join(stateDir(), "config.json"), "utf8"))
    if (typeof value?.apiUrl === "string" && value.apiUrl.length > 0) return value.apiUrl
  } catch {
    // No local config; fall back to the dev default.
  }
  return "http://127.0.0.1:8787"
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default {
  id: "await-arcade",
  async setup(ctx) {
    let playerId = await ctx.storage.get("playerId")
    if (typeof playerId !== "string" || !playerId) {
      playerId = randomUUID()
      await ctx.storage.set("playerId", playerId)
    }

    const baseUrl = apiUrl()
    let auth = readAuth()
    let accessToken
    let accessExpiresAt = 0

    const client = createArcadeClient({
      baseUrl,
      playerId,
      getToken: () => accessToken,
    })
    const readQueue = async () => (await ctx.storage.get(QUEUE_KEY)) ?? []

    const flush = async () => {
      const items = await readQueue()
      if (items.length === 0) return
      const remaining = []
      for (const item of items) {
        try {
          await client.submit(item.runId, item.replay)
        } catch (error) {
          if (!(error?.status >= 400 && error?.status < 500)) remaining.push(item)
        }
      }
      await ctx.storage.set(QUEUE_KEY, remaining)
    }

    const status = async () => ({
      signedIn: Boolean(auth),
      ...(auth
        ? {
            playerId: auth.playerId,
            displayName: auth.displayName,
            ...(auth.githubLogin ? { githubLogin: auth.githubLogin } : {}),
          }
        : {}),
      queued: (await readQueue()).length,
    })

    async function refresh() {
      if (!auth?.refreshToken) return false
      try {
        const result = await client.authRefresh(auth.refreshToken)
        auth = {
          host: HOST,
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
          // Another process may have rotated the token. Retry with backoff so a
          // slow winner can finish writing the state file before we give up.
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

    await ctx.rpc.register(Api, {
      start: async (input) => {
        await requireAuth()
        await flush()
        return client.start(input.gameId, input.modeId)
      },
      submit: async (input) => {
        await requireAuth()
        try {
          const result = await client.submit(input.runId, input.replay)
          await flush()
          return result
        } catch (error) {
          if (!(error?.status >= 400 && error?.status < 500)) {
            const items = await readQueue()
            items.push({ runId: input.runId, replay: input.replay, at: Date.now() })
            await ctx.storage.set(QUEUE_KEY, items.slice(-20))
          }
          throw error
        }
      },
      best: async (input) => {
        await ensureAuth()
        return { best: await client.bestFor(input.gameId, input.modeId) }
      },
      board: async (input) => {
        await ensureAuth()
        return client.board(input.gameId, input.modeId)
      },
      playerBest: async (input) => {
        await requireAuth()
        return client.playerBest(input.gameId, input.modeId)
      },
      status,
      authStatus: status,
      authStart: async () => client.authStart(HOST),
      authPoll: async (input) => {
        const result = await client.authPoll(input.flowId)
        if (result.status === "complete") {
          auth = {
            host: HOST,
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
      authSignOut: async () => {
        await ensureAuth()
        await client.authSignOut()
        auth = undefined
        accessToken = undefined
        clearAuth()
        return status()
      },
      deleteAccount: async () => {
        await ensureAuth()
        await client.deleteMe()
        auth = undefined
        accessToken = undefined
        clearAuth()
        return status()
      },
    })
  },
}
