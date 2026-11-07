import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { randomBytes } from "node:crypto"
import type { Replay, Score, VerifiedResult } from "@await-arcade/contract"
import { verifyReplay } from "@await-arcade/framework"
import { verifiers } from "./registry.generated"

interface RunRecord {
  readonly runId: string
  readonly gameId: string
  readonly modeId: string
  readonly seed: number
  readonly playerId: string
  readonly createdAt: number
}

interface BoardEntry {
  readonly playerId: string
  readonly score: Score
  readonly achievedAt: number
}

export interface ArcadeServer {
  readonly server: Server
  listen(port: number): Promise<number>
  close(): Promise<void>
}

const MAX_BODY = 1_000_000
const RUN_TTL_MS = 10 * 60 * 1000

function winner(a: Score, b: Score): boolean {
  return a.type === "lower" ? a.value < b.value : a.value > b.value
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

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

export function createArcadeServer(): ArcadeServer {
  // These two maps are the entire persistence layer in the scaffold.
  // A Firestore-backed implementation needs: createRun, getRun, deleteRun,
  // getEntry, putEntry, and top.
  const runs = new Map<string, RunRecord>()
  const boards = new Map<string, Map<string, BoardEntry>>()

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

        const runId = randomBytes(12).toString("hex")
        const seed = randomBytes(4).readUInt32LE(0)
        const playerId = text(body.playerId) ?? text(req.headers["x-arcade-player"]) ?? "local"
        const createdAt = Date.now()

        runs.set(runId, { runId, gameId, modeId, seed, playerId, createdAt })

        json(res, 201, {
          runId,
          gameId,
          modeId,
          seed,
          playerId,
          expiresAt: createdAt + RUN_TTL_MS,
        })
        return
      }

      if (req.method === "POST" && parts[0] === "v1" && parts[1] === "runs" && parts[3] === "submit") {
        const runId = parts[2]
        if (!runId) {
          json(res, 400, { error: "runId is required" })
          return
        }

        const run = runs.get(runId)
        if (!run) {
          json(res, 404, { error: "run not found" })
          return
        }
        if (Date.now() - run.createdAt > RUN_TTL_MS) {
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

        const boardKey = `${run.gameId}:${run.modeId}:all`
        let board = boards.get(boardKey)
        if (!board) {
          board = new Map()
          boards.set(boardKey, board)
        }

        const previous = board.get(run.playerId)
        const best = !previous || winner(verified.score, previous.score) ? verified.score : previous.score
        board.set(run.playerId, {
          playerId: run.playerId,
          score: best,
          achievedAt: previous && best === previous.score ? previous.achievedAt : Date.now(),
        })

        const sorted = [...board.values()].sort((left, right) =>
          left.score.type === "lower" ? left.score.value - right.score.value : right.score.value - left.score.value,
        )
        const rank = sorted.findIndex((item) => item.playerId === run.playerId) + 1

        runs.delete(runId)
        json(res, 200, { ok: true, score: verified.score, best, rank })
        return
      }

      if (req.method === "GET" && parts[0] === "v1" && parts[1] === "boards" && parts[2] && parts[3]) {
        const boardKey = `${parts[2]}:${parts[3]}:all`
        const board = boards.get(boardKey)
        const entries = board
          ? [...board.values()]
              .sort((left, right) =>
                left.score.type === "lower"
                  ? left.score.value - right.score.value
                  : right.score.value - left.score.value,
              )
              .slice(0, 50)
          : []

        json(res, 200, {
          gameId: parts[2],
          modeId: parts[3],
          period: "all",
          entries,
        })
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
        server.listen(port, "127.0.0.1", () => {
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
