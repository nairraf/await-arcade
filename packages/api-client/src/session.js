import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createArcadeClient } from "./index.js"

export function stateDir() {
  if (process.env.AWAIT_ARCADE_STATE_DIR) return process.env.AWAIT_ARCADE_STATE_DIR
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "await-arcade")
  }
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? homedir(), "await-arcade")
  }
  return join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "await-arcade")
}

export function apiUrl(dir = stateDir()) {
  if (process.env.AWAIT_ARCADE_API_URL) return process.env.AWAIT_ARCADE_API_URL
  try {
    const value = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"))
    if (typeof value?.apiUrl === "string" && value.apiUrl.length > 0) return value.apiUrl
  } catch {
    // No local config; fall back to the dev default.
  }
  return "http://127.0.0.1:8787"
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const RETRYABLE_AUTH_STATUS = new Set([500, 502, 503, 504])

async function retryAuth(run) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (!RETRYABLE_AUTH_STATUS.has(error?.status) || attempt === 3) throw error
      await sleep(400 * attempt)
    }
  }
  throw lastError
}

export function createHostSession(options) {
  const host = options.host
  const playerId = options.playerId
  const baseUrl = options.baseUrl ?? apiUrl()
  const baseDir = options.stateDir ?? stateDir()
  const authFile = join(baseDir, `auth.${host}.json`)

  function readAuth() {
    try {
      const value = JSON.parse(readFileSync(authFile, "utf8"))
      return typeof value?.refreshToken === "string" && typeof value?.playerId === "string"
        ? value
        : undefined
    } catch {
      return undefined
    }
  }

  function writeAuth(value) {
    mkdirSync(baseDir, { recursive: true, mode: 0o700 })
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

  const queueFile = join(baseDir, `queue.${host}.json`)
  const readQueue =
    options.readQueue ??
    (async () => {
      try {
        const raw = JSON.parse(readFileSync(queueFile, "utf8"))
        return Array.isArray(raw) ? raw : []
      } catch {
        return []
      }
    })
  const writeQueue =
    options.writeQueue ??
    (async (items) => {
      mkdirSync(baseDir, { recursive: true, mode: 0o700 })
      writeFileSync(queueFile, JSON.stringify(items, null, 2), { mode: 0o600 })
    })

  let auth = readAuth()
  let accessToken
  let accessExpiresAt = 0
  let refreshBlockedUntil = 0

  const client = createArcadeClient({
    baseUrl,
    playerId,
    getToken: () => accessToken,
    fetchImpl: options.fetchImpl,
  })

  const getActivePlayerId = () => auth?.playerId ?? playerId

  async function flush() {
    const items = await readQueue()
    if (items.length === 0) return

    const activeId = getActivePlayerId()
    const remaining = []
    for (const item of items) {
      if (item.playerId && item.playerId !== activeId) {
        remaining.push(item)
        continue
      }
      try {
        await client.submit(item.runId, item.replay)
      } catch (error) {
        if (!(error?.status >= 400 && error?.status < 500)) remaining.push(item)
      }
    }
    await writeQueue(remaining)
  }

  async function status() {
    const items = await readQueue()
    const activeId = getActivePlayerId()
    const matching = items.filter((item) => !item.playerId || item.playerId === activeId)
    return {
      signedIn: Boolean(auth),
      ...(auth
        ? {
            playerId: auth.playerId,
            displayName: auth.displayName,
            ...(auth.githubLogin ? { githubLogin: auth.githubLogin } : {}),
          }
        : {}),
      queued: matching.length,
    }
  }

  async function refresh() {
    if (!auth?.refreshToken) return false
    try {
      const result = await client.authRefresh(auth.refreshToken)
      auth = {
        host,
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
      refreshBlockedUntil = 0
      return true
    } catch (error) {
      if (error?.status === 429) {
        // The verifier is throttling refreshes. Back off instead of retrying on
        // every RPC call and exhausting the window further.
        refreshBlockedUntil = Date.now() + 30_000
        return false
      }
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
      } else if (error?.status === undefined || error.status >= 500) {
        refreshBlockedUntil = Date.now() + 5_000
      }
      return false
    }
  }

  let refreshing
  async function ensureAuth() {
    if (accessToken && accessExpiresAt > Date.now() + 60_000) return true
    if (Date.now() < refreshBlockedUntil) return false
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

  return {
    client,
    get auth() {
      return auth
    },
    get accessToken() {
      return accessToken
    },
    ensureAuth,
    requireAuth,
    refresh,
    flush,
    status,
    async start(gameId, modeId) {
      await requireAuth()
      await flush()
      return client.start(gameId, modeId)
    },
    async submit(runId, replay) {
      await requireAuth()
      try {
        const result = await client.submit(runId, replay)
        await flush()
        return result
      } catch (error) {
        if (error?.status === 422) {
          return { ok: false, reason: error.message }
        }
        if (!(error?.status >= 400 && error?.status < 500)) {
          const items = await readQueue()
          items.push({
            runId,
            replay,
            playerId: getActivePlayerId(),
            at: Date.now(),
          })
          await writeQueue(items.slice(-20))
          return {
            ok: false,
            queued: true,
            reason: "Offline — run queued for retry.",
          }
        }
        throw error
      }
    },
    async best(gameId, modeId) {
      await ensureAuth()
      return { best: await client.bestFor(gameId, modeId) }
    },
    async board(gameId, modeId) {
      await ensureAuth()
      return client.board(gameId, modeId)
    },
    async playerBest(gameId, modeId) {
      await requireAuth()
      return client.playerBest(gameId, modeId)
    },
    async daily() {
      await ensureAuth()
      return client.dailyToday()
    },
    async dailyStart(challengeId) {
      await requireAuth()
      return client.dailyStart(challengeId)
    },
    async dailyBoard(challengeId) {
      await ensureAuth()
      return client.dailyBoard(challengeId)
    },
    async ghost(ghostId) {
      await ensureAuth()
      return client.ghost(ghostId)
    },
    async profile() {
      await ensureAuth()
      return client.profile()
    },
    async authStart() {
      return retryAuth(() => client.authStart(host))
    },
    async authPoll(flowId) {
      const result = await retryAuth(() => client.authPoll(flowId))
      if (result.status === "complete") {
        auth = {
          host,
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
    async authSignOut() {
      await ensureAuth()
      await client.authSignOut()
      auth = undefined
      accessToken = undefined
      clearAuth()
      return status()
    },
    async deleteAccount() {
      await ensureAuth()
      await client.deleteMe()
      auth = undefined
      accessToken = undefined
      clearAuth()
      await writeQueue([])
      return status()
    },
    async updateName(displayName) {
      await requireAuth()
      if (!auth) throw new Error("sign-in required")
      const result = await client.updateMe(displayName)
      if (!result?.player?.displayName) throw new Error("name update failed")
      auth = { ...auth, displayName: result.player.displayName }
      writeAuth(auth)
      return status()
    },
    async nameAvailable(displayName) {
      await ensureAuth()
      return client.nameAvailable(displayName)
    },
  }
}
