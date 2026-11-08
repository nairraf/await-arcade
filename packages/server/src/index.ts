import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { randomBytes } from "node:crypto"
import type { Replay, Score, VerifiedResult } from "@await-arcade/contract"
import { verifyReplay } from "@await-arcade/framework"
import { AuthError, AuthService, type AuthConfig } from "./auth"
import { githubClientFromEnv, type GitHubClient } from "./github"
import { verifiers } from "./registry.generated"
import { MemoryStore, type AccessTokenRecord, type ArcadeStore, type PlayerRecord, type RunRecord } from "./store"

export interface ArcadeServerOptions {
  readonly store?: ArcadeStore
  readonly host?: string
  readonly github?: GitHubClient
  readonly auth?: AuthConfig
  /** When true, run issuance and submission require a signed-in player. */
  readonly requireAuth?: boolean
}

export interface ArcadeServer {
  readonly server: Server
  listen(port: number): Promise<number>
  close(): Promise<void>
}

const MAX_BODY = 1_000_000
const RUN_TTL_MS = 24 * 60 * 60 * 1000

function winner(a: Score, b: Score): boolean {
  return a.type === "lower" ? a.value < b.value : a.value > b.value
}

function boardKey(gameId: string, modeId: string): string {
  return `${gameId}:${modeId}:all`
}

function json(res: ServerResponse, status: number, body: unknown, cors = true): void {
  const payload = JSON.stringify(body)
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(payload)),
    "cache-control": "no-store",
    "access-control-allow-headers": "content-type, x-arcade-player, authorization",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  }
  if (cors) headers["access-control-allow-origin"] = "*"
  res.writeHead(status, headers)
  res.end(payload)
}

function noContent(res: ServerResponse): void {
  res.writeHead(204, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-arcade-player, authorization",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  })
  res.end()
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY) throw new Error("request body is too large")
    chunks.push(buffer)
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

// Player ids become Firestore document ids, so keep them to a safe alphabet.
const PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/

function playerId(value: unknown): string | undefined {
  const candidate = text(value)
  return candidate && PLAYER_ID.test(candidate) ? candidate : undefined
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean)
    const last = parts[parts.length - 1]
    if (last) return last
  }
  return req.socket.remoteAddress ?? "unknown"
}

export function createArcadeServer(options: ArcadeServerOptions = {}): ArcadeServer {
  const store = options.store ?? new MemoryStore()
  const bindHost = options.host ?? "127.0.0.1"
  const github = options.github ?? githubClientFromEnv()
  const auth = github ? new AuthService(store, github, options.auth) : undefined
  const requireAuth =
    options.requireAuth ??
    (process.env.AWAIT_ARCADE_REQUIRE_AUTH === "0" ? false : Boolean(github))

  const authenticate = async (
    req: IncomingMessage,
  ): Promise<{ player: PlayerRecord; token: AccessTokenRecord } | undefined> => {
    const header = req.headers.authorization
    if (!header) return undefined

    const match = /^Bearer\s+(.+)$/i.exec(header)
    if (!match?.[1]) throw new AuthError(401, "invalid authorization header")
    if (!auth) throw new AuthError(503, "GitHub auth is not configured")

    return auth.authenticate(match[1])
  }

  const authStarts = new Map<string, number[]>()
  const allowAuthStart = (ip: string): boolean => {
    const at = Date.now()
    const recent = (authStarts.get(ip) ?? []).filter((time) => at - time < 10 * 60_000)
    if (recent.length >= 10) {
      authStarts.set(ip, recent)
      return false
    }
    recent.push(at)
    authStarts.set(ip, recent)
    if (authStarts.size > 1_000) {
      const oldest = authStarts.keys().next().value
      if (oldest) authStarts.delete(oldest)
    }
    return true
  }

  const server = createHttpServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, x-arcade-player, authorization",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      })
      res.end()
      return
    }

    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      const parts = url.pathname.split("/").filter(Boolean)

      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, { ok: true })
        return
      }

      if (req.method === "GET" && url.pathname === "/v1/games") {
        json(res, 200, {
          games: Object.values(verifiers).map((entry) => ({
            id: entry.meta.id,
            title: entry.meta.title,
            description: entry.meta.description,
            kind: entry.meta.kind,
            status: entry.meta.status,
            modes: entry.meta.modes,
            score: entry.meta.score,
          })),
        })
        return
      }

      if (req.method === "POST" && url.pathname === "/v1/auth/github/start") {
        if (!auth) throw new AuthError(503, "GitHub auth is not configured")
        const ip = clientIp(req)
        if (!allowAuthStart(ip)) throw new AuthError(429, "too many sign-in attempts")
        const body = record(await readBody(req))
        const requested = text(body.host)
        const host = requested === "opencode" || requested === "antigravity" ? requested : "unknown"
        json(res, 200, await auth.start(host), false)
        return
      }

      if (req.method === "POST" && url.pathname === "/v1/auth/github/poll") {
        if (!auth) throw new AuthError(503, "GitHub auth is not configured")
        const body = record(await readBody(req))
        const flowId = text(body.flowId)
        if (!flowId) throw new AuthError(400, "flowId is required")
        json(res, 200, await auth.poll(flowId), false)
        return
      }

      if (req.method === "POST" && url.pathname === "/v1/auth/refresh") {
        if (!auth) throw new AuthError(503, "GitHub auth is not configured")
        const body = record(await readBody(req))
        const refreshToken = text(body.refreshToken)
        if (!refreshToken) throw new AuthError(400, "refreshToken is required")
        json(res, 200, await auth.refresh(refreshToken), false)
        return
      }

      if (req.method === "POST" && url.pathname === "/v1/auth/signout") {
        const identity = await authenticate(req)
        if (!identity) throw new AuthError(401, "sign in required")
        await auth!.signOut(identity.token)
        noContent(res)
        return
      }

      if (req.method === "GET" && url.pathname === "/v1/me") {
        const identity = await authenticate(req)
        if (!identity) throw new AuthError(401, "sign in required")
        json(res, 200, { player: auth!.me(identity.player) }, false)
        return
      }

      if (req.method === "DELETE" && url.pathname === "/v1/me") {
        const identity = await authenticate(req)
        if (!identity) throw new AuthError(401, "sign in required")
        const boardIds = Object.values(verifiers).flatMap((entry) =>
          entry.meta.modes.map((mode) => boardKey(entry.meta.id, mode.id)),
        )
        await auth!.deleteAccount(identity.player, boardIds)
        noContent(res)
        return
      }

      if (req.method === "POST" && url.pathname === "/v1/runs") {
        const body = record(await readBody(req))
        const gameId = text(body.gameId)
        const modeId = text(body.modeId)
        if (!gameId || !modeId) {
          json(res, 400, { error: "gameId and modeId are required" })
          return
        }

        const entry = verifiers[gameId]
        if (!entry) {
          json(res, 404, { error: `unknown game: ${gameId}` })
          return
        }
        if (!entry.meta.modes.some((mode) => mode.id === modeId)) {
          json(res, 404, { error: `unknown mode: ${modeId}` })
          return
        }

        const identity = await authenticate(req)
        if (requireAuth && !identity) throw new AuthError(401, "sign in required")

        const requested =
          text(body.playerId) ?? text(req.headers["x-arcade-player"]) ?? "local"
        const player = identity?.player.playerId ?? playerId(requested)
        if (!player) {
          json(res, 400, { error: "invalid playerId" })
          return
        }

        if (!identity) {
          const existing = await store.getPlayer(player)
          if (!existing) {
            const at = Date.now()
            await store.ensurePlayer(`guest:${player}`, {
              playerId: player,
              providerId: `guest:${player}`,
              displayName: player,
              createdAt: at,
              updatedAt: at,
            })
          }
        }

        const createdAt = Date.now()
        const run: RunRecord = {
          runId: randomBytes(12).toString("hex"),
          gameId,
          modeId,
          seed: randomBytes(4).readUInt32LE(0),
          playerId: player,
          createdAt,
          expiresAt: createdAt + RUN_TTL_MS,
        }

        await store.createRun(run)
        json(res, 201, {
          runId: run.runId,
          gameId: run.gameId,
          modeId: run.modeId,
          seed: run.seed,
          playerId: run.playerId,
          expiresAt: run.expiresAt,
        })
        return
      }

      if (req.method === "POST" && parts[0] === "v1" && parts[1] === "runs" && parts[3] === "submit") {
        const runId = parts[2]
        if (!runId) {
          json(res, 400, { error: "runId is required" })
          return
        }

        const run = await store.getRun(runId)
        if (!run) {
          json(res, 404, { error: "run not found" })
          return
        }

        const identity = await authenticate(req)
        if (requireAuth && !identity) throw new AuthError(401, "sign in required")
        if (identity && identity.player.playerId !== run.playerId) {
          throw new AuthError(403, "this run belongs to another player")
        }

        if (Date.now() > run.expiresAt) {
          json(res, 410, { error: "run expired" })
          return
        }

        const entry = verifiers[run.gameId]
        if (!entry) {
          json(res, 404, { error: `unknown game: ${run.gameId}` })
          return
        }

        const body = record(await readBody(req))
        const replay = body.replay
        if (typeof replay !== "object" || replay === null) {
          json(res, 400, { error: "replay is required" })
          return
        }

        const candidate = replay as Replay
        if (
          candidate.gameId !== run.gameId ||
          candidate.modeId !== run.modeId ||
          candidate.seed !== run.seed
        ) {
          json(res, 422, { ok: false, reason: "replay does not match the issued run" })
          return
        }

        const verified: VerifiedResult = verifyReplay(entry.core, entry.meta, candidate)
        if (!verified.ok || !verified.score) {
          json(res, 422, {
            ok: false,
            reason: verified.reason ?? "replay did not verify",
            score: verified.score,
          })
          return
        }

        const score = verified.score
        const key = boardKey(run.gameId, run.modeId)

        const outcome = await store.transaction(async (tx) => {
          const current = await tx.getRun(runId)
          if (!current) return { missing: true as const }
          if (!(await tx.getPlayer(run.playerId))) return { missingPlayer: true as const }

          const previous = await tx.getEntry(key, run.playerId)
          const best = !previous || winner(score, previous.score) ? score : previous.score

          if (!previous || best === score) {
            await tx.putEntry(key, {
              playerId: run.playerId,
              score: best,
              achievedAt: Date.now(),
            })
          }

          await tx.deleteRun(runId)
          return { missing: false as const, best }
        })

        if ("missingPlayer" in outcome) {
          json(res, 401, { error: "player no longer exists" })
          return
        }

        if (outcome.missing) {
          json(res, 404, { error: "run not found" })
          return
        }

        const rank = await store.rank(key, run.playerId, entry.meta.score.type)

        json(res, 200, {
          ok: true,
          score,
          best: outcome.best,
          ...(rank !== undefined ? { rank } : {}),
        })
        return
      }

      if (
        req.method === "GET" &&
        parts.length === 6 &&
        parts[0] === "v1" &&
        parts[1] === "boards" &&
        parts[2] &&
        parts[3] &&
        parts[4] === "player" &&
        parts[5]
      ) {
        const gameId = parts[2]
        const modeId = parts[3]
        const entry = verifiers[gameId]
        if (!entry) {
          json(res, 404, { error: `unknown game: ${gameId}` })
          return
        }
        if (!entry.meta.modes.some((mode) => mode.id === modeId)) {
          json(res, 404, { error: `unknown mode: ${modeId}` })
          return
        }

        let decoded: string
        try {
          decoded = decodeURIComponent(parts[5])
        } catch {
          json(res, 400, { error: "invalid playerId" })
          return
        }
        let pid: string | undefined
        if (decoded === "me") {
          const identity = await authenticate(req)
          if (!identity) throw new AuthError(401, "sign in required")
          pid = identity.player.playerId
        } else {
          pid = playerId(decoded)
        }
        if (!pid) {
          json(res, 400, { error: "invalid playerId" })
          return
        }

        const key = boardKey(gameId, modeId)
        const best = await store.getEntry(key, pid)
        const rank = best ? await store.rank(key, pid, entry.meta.score.type, best) : undefined

        json(res, 200, {
          gameId,
          modeId,
          playerId: pid,
          ...(best ? { entry: best } : {}),
          ...(rank !== undefined ? { rank } : {}),
        })
        return
      }

      if (
        req.method === "GET" &&
        parts.length === 4 &&
        parts[0] === "v1" &&
        parts[1] === "boards" &&
        parts[2] &&
        parts[3]
      ) {
        const gameId = parts[2]
        const modeId = parts[3]
        const entry = verifiers[gameId]
        if (!entry) {
          json(res, 404, { error: `unknown game: ${gameId}` })
          return
        }
        if (!entry.meta.modes.some((mode) => mode.id === modeId)) {
          json(res, 404, { error: `unknown mode: ${modeId}` })
          return
        }

        const entries = await store.top(boardKey(gameId, modeId), 50, entry.meta.score.type)
        json(res, 200, { gameId, modeId, period: "all", entries })
        return
      }

      json(res, 404, { error: "not found" })
    } catch (error) {
      if (error instanceof AuthError) {
        json(res, error.status, { error: error.message })
        return
      }
      json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  return {
    server,
    listen(port: number) {
      return new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(port, bindHost, () => {
          const address = server.address()
          resolve(typeof address === "object" && address ? address.port : port)
        })
      })
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
