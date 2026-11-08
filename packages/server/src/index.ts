import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { randomBytes } from "node:crypto"
import type { Replay, Score, VerifiedResult } from "@await-arcade/contract"
import { verifyReplay } from "@await-arcade/framework"
import { verifiers } from "./registry.generated"
import { MemoryStore, type ArcadeStore, type RunRecord } from "./store"

export interface ArcadeServerOptions {
  readonly store?: ArcadeStore
  readonly host?: string
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

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-arcade-player, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  })
  res.end(payload)
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

export function createArcadeServer(options: ArcadeServerOptions = {}): ArcadeServer {
  const store = options.store ?? new MemoryStore()
  const bindHost = options.host ?? "127.0.0.1"

  const server = createHttpServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, x-arcade-player, authorization",
        "access-control-allow-methods": "GET, POST, OPTIONS",
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

        const requested =
          text(body.playerId) ?? text(req.headers["x-arcade-player"]) ?? "local"
        const player = playerId(requested)
        if (!player) {
          json(res, 400, { error: "invalid playerId" })
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
        const pid = playerId(decoded)
        if (!pid) {
          json(res, 400, { error: "invalid playerId" })
          return
        }

        // Identity is client-asserted until GitHub auth lands.
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
