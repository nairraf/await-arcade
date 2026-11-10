import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { randomBytes } from "node:crypto"
import type { BoardEntry, Replay, Score, VerifiedResult } from "@await-arcade/contract"
import { verifyReplay } from "@await-arcade/framework"
import { AuthError, AuthService, type AuthConfig } from "./auth"
import {
  DAILY_ATTEMPTS,
  challengeById,
  dailyChallenge,
  dailyConfigFromEnv,
  dailyDate,
  type DailyConfig,
} from "./challenges"
import { githubClientFromEnv, type GitHubClient } from "./github"
import { verifiers } from "./registry.generated"
import { gameXp, levelFor, medalsFor, totalXp, xpForRun } from "./xp"
import {
  MemoryStore,
  nameKey,
  type AccessTokenRecord,
  type ArcadeStore,
  type PlayerRecord,
  type RunAnchor,
  type RunRecord,
} from "./store"

export interface RateLimitsConfig {
  readonly runsPerMin?: number
  readonly submitsPerMin?: number
  readonly refreshesPer10Min?: number
  readonly pollsPerMin?: number
  readonly startsPer10Min?: number
  readonly namesPerMin?: number
  readonly profilePerMin?: number
}

export interface ArcadeServerOptions {
  readonly store?: ArcadeStore
  readonly host?: string
  readonly github?: GitHubClient
  readonly auth?: AuthConfig
  readonly daily?: DailyConfig
  /** When true, run issuance and submission require a signed-in player. */
  readonly requireAuth?: boolean
  readonly trustProxy?: boolean
  readonly rateLimits?: RateLimitsConfig
}

export interface ArcadeServer {
  readonly server: Server
  listen(port: number): Promise<number>
  close(): Promise<void>
}

const MAX_BODY = 2_500_000
const RUN_TTL_MS = 24 * 60 * 60 * 1000
/** Boards are public reads; a short shared cache keeps the free tier cheap. */
const BOARD_CACHE_CONTROL = "public, max-age=30, s-maxage=30"
const PLAYER_CACHE_CONTROL = "private, max-age=15"

function winner(a: Score, b: Score): boolean {
  return a.type === "lower" ? a.value < b.value : a.value > b.value
}

function boardKey(gameId: string, modeId: string): string {
  return `${gameId}:${modeId}:all`
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  cors = true,
  cacheControl = "no-store",
): void {
  const payload = JSON.stringify(body)
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(payload)),
    "cache-control": cacheControl,
    "access-control-allow-headers": "content-type, x-arcade-player, authorization",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  }
  if (cors) headers["access-control-allow-origin"] = "*"
  res.writeHead(status, headers)
  res.end(payload)
}

function noContent(res: ServerResponse, cors = false): void {
  const headers: Record<string, string> = {
    "access-control-allow-headers": "content-type, x-arcade-player, authorization",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  }
  if (cors) headers["access-control-allow-origin"] = "*"
  res.writeHead(204, headers)
  res.end()
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY) {
      req.destroy()
      throw new Error("request body is too large")
    }
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

const DISPLAY_NAME = /^[\p{L}\p{N} '._-]{1,24}$/u

function cleanDisplayName(value: unknown): string | undefined {
  const candidate = text(value)?.trim()
  if (!candidate || candidate.length > 24 || !DISPLAY_NAME.test(candidate)) return undefined
  return candidate
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

function decodeSegment(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

function matchesAnchor(
  event: { readonly tick: number; readonly input: unknown } | undefined,
  anchor: RunAnchor,
): boolean {
  if (!event || event.tick !== 0) return false
  const input = record(event.input)
  return input.type === anchor.type && input.x === anchor.x && input.y === anchor.y
}

function clientIp(req: IncomingMessage, trustProxy = false): string {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"]
    if (typeof forwarded === "string" && forwarded.length > 0) {
      const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean)
      const last = parts[parts.length - 1]
      if (last) return last
    }
  }
  return req.socket.remoteAddress ?? "unknown"
}

function createRateLimiter(windowMs: number, max: number, maxKeys = 1_000): (key: string) => boolean {
  const hits = new Map<string, number[]>()

  return (key: string): boolean => {
    const at = Date.now()
    const recent = (hits.get(key) ?? []).filter((time) => at - time < windowMs)
    if (recent.length >= max) {
      hits.set(key, recent)
      return false
    }
    recent.push(at)
    hits.set(key, recent)

    if (hits.size > maxKeys) {
      for (const [k, timestamps] of hits.entries()) {
        const active = timestamps.filter((t) => at - t < windowMs)
        if (active.length === 0) {
          hits.delete(k)
        } else {
          hits.set(k, active)
        }
      }
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value
        if (oldest) hits.delete(oldest)
      }
    }
    return true
  }
}

export function createArcadeServer(options: ArcadeServerOptions = {}): ArcadeServer {
  const store = options.store ?? new MemoryStore()

  /** Attach each entry's global arcade XP rank and level for the board UI. */
  async function withXp(entries: readonly BoardEntry[]): Promise<BoardEntry[]> {
    if (entries.length === 0) return []
    const summaries = await store.getXpSummaries(entries.map((entry) => entry.playerId))
    return entries.map((entry) => {
      const summary = summaries.get(entry.playerId)
      return summary
        ? { ...entry, xpRank: summary.rank, xpLevel: summary.level }
        : entry
    })
  }
  const bindHost = options.host ?? "127.0.0.1"
  const github = options.github ?? githubClientFromEnv()
  const auth = github ? new AuthService(store, github, options.auth) : undefined
  const requireAuth =
    options.requireAuth ??
    (process.env.AWAIT_ARCADE_REQUIRE_AUTH === "0" ? false : Boolean(github))
  const trustProxy = options.trustProxy ?? Boolean(process.env.K_SERVICE)
  const rl = options.rateLimits ?? {}

  const allowAuthStart = createRateLimiter(10 * 60_000, rl.startsPer10Min ?? 10)
  const allowAuthPoll = createRateLimiter(60_000, rl.pollsPerMin ?? 30)
  const allowAuthRefresh = createRateLimiter(10 * 60_000, rl.refreshesPer10Min ?? 60)
  const allowNameLookup = createRateLimiter(60_000, rl.namesPerMin ?? 60)
  const allowProfile = createRateLimiter(60_000, rl.profilePerMin ?? 30)
  const allowRunsIp = createRateLimiter(60_000, rl.runsPerMin ?? 30)
  const allowRunsPlayer = createRateLimiter(60_000, rl.runsPerMin ?? 30)
  const allowSubmitIp = createRateLimiter(60_000, rl.submitsPerMin ?? 20)
  const allowSubmitPlayer = createRateLimiter(60_000, rl.submitsPerMin ?? 20)

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

  const daily = options.daily ?? dailyConfigFromEnv()
  const dailyNow = (): number => daily.now?.() ?? Date.now()

  const resolvePlayer = async (
    identity: { readonly player: PlayerRecord } | undefined,
    requested: string | undefined,
  ): Promise<string | undefined> => {
    const player = identity?.player.playerId ?? playerId(requested)
    if (!player) return undefined

    if (!identity) {
      const existing = await store.getPlayer(player)
      if (existing) {
        if (!existing.providerId.startsWith("guest:")) {
          return undefined
        }
      } else {
        const at = Date.now()
        await store.ensurePlayer(`guest:${player}`, {
          playerId: player,
          providerId: `guest:${player}`,
          displayName: player,
          nameKey: nameKey(player),
          createdAt: at,
          updatedAt: at,
        })
      }
    }

    return player
  }

  const server = createHttpServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET, OPTIONS",
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
        const ip = clientIp(req, trustProxy)
        if (!allowAuthStart(ip)) throw new AuthError(429, "too many sign-in attempts")
        const body = record(await readBody(req))
        const requested = text(body.host)
        const host = requested === "opencode" || requested === "antigravity" ? requested : "unknown"
        json(res, 200, await auth.start(host), false)
        return
      }

      if (req.method === "POST" && url.pathname === "/v1/auth/github/poll") {
        if (!auth) throw new AuthError(503, "GitHub auth is not configured")
        const ip = clientIp(req, trustProxy)
        if (!allowAuthPoll(ip)) throw new AuthError(429, "too many poll attempts")
        const body = record(await readBody(req))
        const flowId = text(body.flowId)
        if (!flowId) throw new AuthError(400, "flowId is required")
        json(res, 200, await auth.poll(flowId), false)
        return
      }

      if (req.method === "POST" && url.pathname === "/v1/auth/refresh") {
        if (!auth) throw new AuthError(503, "GitHub auth is not configured")
        const ip = clientIp(req, trustProxy)
        if (!allowAuthRefresh(ip)) throw new AuthError(429, "too many refresh attempts")
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
        noContent(res, false)
        return
      }

      if (req.method === "GET" && url.pathname === "/v1/me/profile") {
        const identity = await authenticate(req)
        if (!identity) throw new AuthError(401, "sign in required")
        if (!allowProfile(identity.player.playerId)) {
          throw new AuthError(429, "too many profile requests")
        }
        const records = await store.getXp(identity.player.playerId)
        const total = totalXp(records)
        const level = levelFor(total)
        const rank = await store.getXpRank(identity.player.playerId, total)
        json(res, 200, {
          playerId: identity.player.playerId,
          displayName: identity.player.displayName,
          totalXp: total,
          level: level.level,
          levelTitle: level.title,
          levelStartXp: level.levelStartXp,
          ...(level.nextLevelXp !== undefined ? { nextLevelXp: level.nextLevelXp } : {}),
          ...(rank !== undefined ? { rank } : {}),
          medals: medalsFor(records),
          games: gameXp(records),
        }, false)
        return
      }

      if (req.method === "GET" && url.pathname === "/v1/me") {
        const identity = await authenticate(req)
        if (!identity) throw new AuthError(401, "sign in required")
        json(res, 200, { player: auth!.me(identity.player) }, false)
        return
      }

      if (
        req.method === "GET" &&
        parts.length === 3 &&
        parts[0] === "v1" &&
        parts[1] === "names"
      ) {
        const requested = decodeSegment(parts[2])
        const name = cleanDisplayName(requested)
        if (!name) {
          json(res, 400, { error: "invalid displayName" })
          return
        }
        if (!allowNameLookup(clientIp(req, trustProxy))) {
          throw new AuthError(429, "too many name lookups")
        }
        const identity = await authenticate(req)
        const owner = await store.findPlayerByName(nameKey(name))
        json(res, 200, {
          name,
          available: !owner || owner.playerId === identity?.player.playerId,
        }, false)
        return
      }

      if (req.method === "DELETE" && url.pathname === "/v1/me") {
        const identity = await authenticate(req)
        if (!identity) throw new AuthError(401, "sign in required")
        const boardIds = Object.values(verifiers).flatMap((entry) =>
          entry.meta.modes.map((mode) => boardKey(entry.meta.id, mode.id)),
        )
        await auth!.deleteAccount(identity.player, boardIds)
        noContent(res, false)
        return
      }

      if (req.method === "PATCH" && url.pathname === "/v1/me") {
        const identity = await authenticate(req)
        if (!identity) throw new AuthError(401, "sign in required")
        const body = record(await readBody(req))
        const name = cleanDisplayName(body.displayName)
        if (!name) {
          json(res, 400, {
            error: "displayName must be 1-24 letters, numbers, spaces, or ._-'",
          }, false)
          return
        }
        if (identity.player.displayName === name) {
          json(res, 200, { player: auth!.me(identity.player) }, false)
          return
        }
        const owner = await store.findPlayerByName(
          nameKey(name),
          identity.player.playerId,
        )
        if (owner) {
          json(res, 409, { error: "That arcade name is taken." }, false)
          return
        }
        const player = await auth!.updateDisplayName(identity.player, name, 2)
        if (player === "limited") {
          json(res, 429, {
            error: "You can change your arcade name twice per UTC day.",
          }, false)
          return
        }
        json(res, 200, { player }, false)
        return
      }

      if (req.method === "GET" && parts.length === 3 && parts[0] === "v1" && parts[1] === "challenges" && parts[2] === "today") {
        const challenge = dailyChallenge(verifiers, daily, dailyDate(dailyNow()))
        if (!challenge) {
          json(res, 503, { error: "no daily challenge available" })
          return
        }

        const identity = await authenticate(req)
        const requested =
          text(req.headers["x-arcade-player"]) ?? text(url.searchParams.get("player"))
        const player = identity?.player.playerId ?? playerId(requested)
        const attemptsUsed = player
          ? await store.getChallengeAttempts(challenge.challengeId, player)
          : 0

        json(res, 200, {
          ...challenge,
          period: "daily",
          attemptsUsed,
          attemptsLeft: Math.max(0, DAILY_ATTEMPTS - attemptsUsed),
          serverNow: Date.now(),
        })
        return
      }

      if (req.method === "POST" && url.pathname === "/v1/runs") {
        const ip = clientIp(req, trustProxy)
        if (!allowRunsIp(ip)) {
          json(res, 429, { error: "too many run requests" }, false)
          return
        }

        const body = record(await readBody(req))
        const gameId = text(body.gameId)
        const modeId = text(body.modeId)
        if (!gameId || !modeId) {
          json(res, 400, { error: "gameId and modeId are required" }, false)
          return
        }

        const entry = verifiers[gameId]
        if (!entry) {
          json(res, 404, { error: `unknown game: ${gameId}` }, false)
          return
        }
        const mode = entry.meta.modes.find((candidate) => candidate.id === modeId)
        if (!mode) {
          json(res, 404, { error: `unknown mode: ${modeId}` }, false)
          return
        }
        if (mode.ranked === false) {
          json(res, 400, { error: `mode is not eligible for ranked runs: ${modeId}` }, false)
          return
        }

        const identity = await authenticate(req)
        if (requireAuth && !identity) throw new AuthError(401, "sign in required")

        const requested =
          text(body.playerId) ?? text(req.headers["x-arcade-player"]) ?? "local"
        const player = await resolvePlayer(identity, requested)
        if (!player) {
          json(res, 400, { error: "invalid playerId" }, false)
          return
        }

        if (!allowRunsPlayer(player)) {
          json(res, 429, { error: "too many run requests" }, false)
          return
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
        }, false)
        return
      }

      if (
        req.method === "POST" &&
        parts.length === 4 &&
        parts[0] === "v1" &&
        parts[1] === "challenges" &&
        parts[3] === "runs"
      ) {
        const ip = clientIp(req, trustProxy)
        if (!allowRunsIp(ip)) {
          json(res, 429, { error: "too many run requests" }, false)
          return
        }

        const id = decodeSegment(parts[2])
        if (!id) {
          json(res, 400, { error: "invalid challenge id" }, false)
          return
        }

        const active = dailyChallenge(verifiers, daily, dailyDate(dailyNow()))
        if (!active || active.challengeId !== id) {
          json(res, 409, { error: "daily challenge is not active" }, false)
          return
        }

        const body = record(await readBody(req))
        const identity = await authenticate(req)
        if (requireAuth && !identity) throw new AuthError(401, "sign in required")

        const requested =
          text(body.playerId) ?? text(req.headers["x-arcade-player"]) ?? "local"
        const player = await resolvePlayer(identity, requested)
        if (!player) {
          json(res, 400, { error: "invalid playerId" }, false)
          return
        }

        if (!allowRunsPlayer(player)) {
          json(res, 429, { error: "too many run requests" }, false)
          return
        }

        const attempt = await store.consumeChallengeAttempt(
          active.challengeId,
          player,
          DAILY_ATTEMPTS,
          Date.now(),
        )
        if (attempt === undefined) {
          json(res, 429, {
            error: "no daily attempts left",
            attemptsUsed: DAILY_ATTEMPTS,
            attemptsLeft: 0,
          }, false)
          return
        }

        const createdAt = Date.now()
        const run: RunRecord = {
          runId: randomBytes(12).toString("hex"),
          gameId: active.gameId,
          modeId: active.modeId,
          seed: active.seed,
          playerId: player,
          createdAt,
          expiresAt: createdAt + RUN_TTL_MS,
          challengeId: active.challengeId,
          attempt,
          ...(active.anchor ? { anchor: active.anchor } : {}),
        }

        await store.createRun(run)
        json(res, 201, {
          runId: run.runId,
          gameId: run.gameId,
          modeId: run.modeId,
          seed: run.seed,
          playerId: run.playerId,
          expiresAt: run.expiresAt,
          challengeId: active.challengeId,
          attempt,
          attemptsLeft: DAILY_ATTEMPTS - attempt,
          ...(active.anchor ? { anchor: active.anchor } : {}),
        }, false)
        return
      }

      if (req.method === "POST" && parts[0] === "v1" && parts[1] === "runs" && parts[3] === "submit") {
        const runId = parts[2]
        if (!runId) {
          json(res, 400, { error: "runId is required" }, false)
          return
        }

        const ip = clientIp(req, trustProxy)
        if (!allowSubmitIp(ip)) {
          json(res, 429, { error: "too many submissions" }, false)
          return
        }

        const run = await store.getRun(runId)
        if (!run) {
          json(res, 404, { error: "run not found" }, false)
          return
        }

        const identity = await authenticate(req)
        if (requireAuth && !identity) throw new AuthError(401, "sign in required")
        if (identity && identity.player.playerId !== run.playerId) {
          throw new AuthError(403, "this run belongs to another player")
        }

        if (!allowSubmitPlayer(run.playerId)) {
          json(res, 429, { error: "too many submissions" }, false)
          return
        }

        if (Date.now() > run.expiresAt) {
          json(res, 410, { error: "run expired" }, false)
          return
        }

        const entry = verifiers[run.gameId]
        if (!entry) {
          json(res, 404, { error: `unknown game: ${run.gameId}` }, false)
          return
        }
        const modeDifficulty = entry.meta.modes.find((mode) => mode.id === run.modeId)?.difficulty

        const body = record(await readBody(req))
        const replay = body.replay
        if (typeof replay !== "object" || replay === null) {
          json(res, 400, { error: "replay is required" }, false)
          return
        }

        const candidate = replay as Replay
        if (
          candidate.gameId !== run.gameId ||
          candidate.modeId !== run.modeId ||
          candidate.seed !== run.seed
        ) {
          json(res, 422, { ok: false, reason: "replay does not match the issued run" }, false)
          return
        }
        if (!Array.isArray(candidate.inputs)) {
          json(res, 422, { ok: false, reason: "replay inputs are invalid" }, false)
          return
        }

        if (run.challengeId) {
          if (!run.challengeId.endsWith(`:${dailyDate(dailyNow())}`)) {
            json(res, 410, { error: "daily challenge has ended" }, false)
            return
          }
          if (run.anchor && !matchesAnchor(candidate.inputs[0], run.anchor)) {
            json(res, 422, {
              ok: false,
              reason: "daily replay must start at the anchor",
            }, false)
            return
          }
        }

        const verified: VerifiedResult = verifyReplay(entry.core, entry.meta, candidate)
        if (!verified.ok || !verified.score) {
          json(res, 422, {
            ok: false,
            reason: verified.reason ?? "replay did not verify",
            score: verified.score,
          }, false)
          return
        }

        const score = verified.score
        let dailyScore = score
        let dailyRankKey: string | undefined
        if (run.gameId === "mineflag" && run.challengeId) {
          const moves = verified.ticks ?? score.value
          const elapsedMs = Math.max(0, Date.now() - run.createdAt)
          const attempt = run.attempt ?? 1
          dailyRankKey = [
            String(moves).padStart(6, "0"),
            String(elapsedMs).padStart(10, "0"),
          ].join("|")
          dailyScore = {
            ...score,
            value: moves,
            type: "lower",
            detail: {
              ...(score.detail ?? {}),
              moves,
              elapsedMs,
              attempt,
              rankKey: dailyRankKey,
            },
          }
        }
        const key = run.challengeId ?? boardKey(run.gameId, run.modeId)

        const outcome = await store.transaction(async (tx) => {
          const current = await tx.getRun(runId)
          if (!current) return { missing: true as const }
          const player = await tx.getPlayer(run.playerId)
          if (!player) return { missingPlayer: true as const }

          // All reads must happen before any write in a Firestore transaction.
          const previous = await tx.getEntry(key, run.playerId)
          const xpAward = score.ranked
            ? await tx.recordXp({
                playerId: run.playerId,
                gameId: run.gameId,
                day: dailyDate(Date.now()),
                xp: xpForRun({
                  ...(modeDifficulty !== undefined ? { difficulty: modeDifficulty } : {}),
                  won: score.won,
                  daily: Boolean(run.challengeId),
                }),
                now: Date.now(),
              })
            : undefined

          const beatPrevious =
            !previous ||
            (dailyRankKey && previous.rankKey
              ? dailyRankKey < previous.rankKey
              : winner(dailyScore, previous.score))
          const best = beatPrevious ? dailyScore : previous.score
          const bestRankKey = beatPrevious ? dailyRankKey : previous.rankKey

          if (beatPrevious) {
            await tx.putEntry(key, {
              playerId: run.playerId,
              displayName: player.displayName,
              score: best,
              achievedAt: Date.now(),
              ghostId: runId,
              ...(bestRankKey ? { rankKey: bestRankKey } : {}),
            })
            await tx.putGhost({
              ghostId: runId,
              playerId: run.playerId,
              gameId: run.gameId,
              modeId: run.modeId,
              seed: run.seed,
              createdAt: Date.now(),
              ...(run.anchor ? { anchor: run.anchor } : {}),
            })
            if (previous?.ghostId && previous.ghostId !== runId) {
              await tx.deleteGhost(previous.ghostId)
            }
          } else if (previous && previous.displayName !== player.displayName) {
            await tx.putEntry(key, {
              ...previous,
              displayName: player.displayName,
            })
          }

          await tx.deleteRun(runId)
          return { missing: false as const, best, xp: xpAward }
        })

        if ("missingPlayer" in outcome) {
          json(res, 401, { error: "player no longer exists" }, false)
          return
        }

        if (outcome.missing) {
          json(res, 404, { error: "run not found" }, false)
          return
        }

        const rank = await store.rank(
          key,
          run.playerId,
          entry.meta.score.type,
          undefined,
          run.challengeId ? "rankKey" : "score",
        )

        json(res, 200, {
          ok: true,
          score: dailyScore,
          ...(outcome.best ? { best: outcome.best } : {}),
          ...(rank !== undefined ? { rank } : {}),
          ...(outcome.xp ? { xp: outcome.xp.awarded } : {}),
          ...(run.challengeId ? { challengeId: run.challengeId } : {}),
        }, false)
        return
      }

      if (
        req.method === "GET" &&
        parts.length === 4 &&
        parts[0] === "v1" &&
        parts[1] === "runs" &&
        parts[3] === "ghost"
      ) {
        const ghostId = decodeSegment(parts[2])
        if (!ghostId || !/^[a-f0-9]{24}$/.test(ghostId)) {
          json(res, 400, { error: "invalid ghostId" })
          return
        }
        const ghost = await store.getGhost(ghostId)
        if (!ghost) {
          json(res, 404, { error: "ghost not found" })
          return
        }
        json(res, 200, {
          ghostId: ghost.ghostId,
          gameId: ghost.gameId,
          modeId: ghost.modeId,
          seed: ghost.seed,
          ...(ghost.anchor ? { anchor: ghost.anchor } : {}),
        })
        return
      }

      if (
        req.method === "GET" &&
        parts.length === 4 &&
        parts[0] === "v1" &&
        parts[1] === "challenges" &&
        parts[3] === "board"
      ) {
        const id = decodeSegment(parts[2])
        const challenge = id ? challengeById(verifiers, daily, id) : undefined
        if (!challenge) {
          json(res, 404, { error: "unknown challenge" })
          return
        }

        const entry = verifiers[challenge.gameId]
        if (!entry) {
          json(res, 404, { error: `unknown game: ${challenge.gameId}` })
          return
        }
        const entries = await withXp(await store.top(
          challenge.challengeId,
          50,
          entry.meta.score.type,
          "rankKey",
        ))
        json(res, 200, { ...challenge, period: "daily", entries }, true, BOARD_CACHE_CONTROL)
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
        const mode = entry.meta.modes.find((candidate) => candidate.id === modeId)
        if (!mode) {
          json(res, 404, { error: `unknown mode: ${modeId}` }, false)
          return
        }
        if (mode.ranked === false) {
          json(res, 400, { error: `mode is not eligible for ranked runs: ${modeId}` }, false)
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
        const player = best ? await store.getPlayer(pid) : undefined
        const xpRank = player?.xp ? await store.getXpRank(pid, player.xp) : undefined
        const xpLevel = player?.xp ? levelFor(player.xp).level : undefined
        const enriched = best
          ? {
              ...best,
              ...(xpRank !== undefined ? { xpRank } : {}),
              ...(xpLevel !== undefined ? { xpLevel } : {}),
            }
          : undefined
        const rank = enriched
          ? await store.rank(key, pid, entry.meta.score.type, enriched)
          : undefined

        json(res, 200, {
          gameId,
          modeId,
          playerId: pid,
          ...(enriched ? { entry: enriched } : {}),
          ...(rank !== undefined ? { rank } : {}),
        }, true, decoded === "me" ? "no-store" : PLAYER_CACHE_CONTROL)
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
        const mode = entry.meta.modes.find((candidate) => candidate.id === modeId)
        if (!mode) {
          json(res, 404, { error: `unknown mode: ${modeId}` }, false)
          return
        }
        if (mode.ranked === false) {
          json(res, 400, { error: `mode is not eligible for ranked runs: ${modeId}` }, false)
          return
        }

        const entries = await withXp(
          await store.top(boardKey(gameId, modeId), 50, entry.meta.score.type),
        )
        json(res, 200, { gameId, modeId, period: "all", entries }, true, BOARD_CACHE_CONTROL)
        return
      }

      json(res, 404, { error: "not found" })
    } catch (error) {
      if (error instanceof AuthError) {
        json(res, error.status, { error: error.message }, false)
        return
      }
      if (error instanceof Error && error.message === "request body is too large") {
        json(res, 413, { error: error.message }, false)
        return
      }
      json(res, 500, { error: error instanceof Error ? error.message : String(error) }, false)
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
