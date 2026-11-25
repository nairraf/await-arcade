import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { playRealtime, playTurn } from "@await-arcade/framework"
import { greedySolve } from "../../../games/lockstep/solver"
import { failedCheckPenaltyFor } from "../../../games/nonogram/src/core"
import {
  generateBoard as generateRouterBoard,
  periodOf as routerPeriodOf,
  rotateMask as rotateRouterMask,
} from "../../../games/router/src/core"
import type { RouterInput } from "../../../games/router/src/core"
import { COLS, core as tilechainCore } from "../../../games/tilechain/src/core"
import type { TilechainInput } from "../../../games/tilechain/src/core"
import { meta as tilechainMeta } from "../../../games/tilechain/src/meta"
import { createArcadeServer, type ArcadeServer } from "./index"
import { MemoryStore } from "./store"
import { verifiers } from "./registry.generated"

let server: ArcadeServer
let base = ""

beforeAll(async () => {
  server = createArcadeServer()
  const port = await server.listen(0)
  base = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await server.close()
})

async function startRun(gameId: string, modeId: string, playerId: string) {
  const response = await fetch(`${base}/v1/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId, modeId, playerId }),
  })
  expect(response.status).toBe(201)
  return (await response.json()) as { runId: string; seed: number }
}

describe("verifier server", () => {
  it("verifies a seeded replay and ranks it", async () => {
    const run = await startRun("light-cycles", "solo", "tester")
    const entry = verifiers["light-cycles"]!
    const result = playRealtime(entry.core, entry.meta, {
      seed: run.seed,
      mode: entry.meta.modes[0]!,
      ticks: 4000,
      inputs: [],
    })

    const submit = await fetch(`${base}/v1/runs/${run.runId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replay: result.replay }),
    })

    expect(submit.status).toBe(200)
    const body = (await submit.json()) as {
      ok: boolean
      rank: number
      score: { value: number }
      xp: number
    }

    expect(body.ok).toBe(true)
    expect(body.rank).toBe(1)
    expect(body.score.value).toBe(result.score.value)
    expect(body.xp).toBeGreaterThan(0)

    const boardResponse = await fetch(`${base}/v1/boards/light-cycles/solo`)
    expect(boardResponse.headers.get("cache-control")).toContain("max-age=30")
    const board = (await boardResponse.json()) as {
      entries: Array<{ playerId: string; xpRank?: number; xpLevel?: number }>
    }

    expect(board.entries[0]?.playerId).toBe("tester")
    expect(board.entries[0]?.xpRank).toBeGreaterThan(0)
    expect(board.entries[0]?.xpLevel).toBe(1)
  })

  it("returns a player's best and rank", async () => {
    const run = await startRun("light-cycles", "solo", "solo-player")
    const entry = verifiers["light-cycles"]!
    const result = playRealtime(entry.core, entry.meta, {
      seed: run.seed,
      mode: entry.meta.modes[0]!,
      ticks: 4000,
      inputs: [],
    })

    await fetch(`${base}/v1/runs/${run.runId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replay: result.replay }),
    })

    const mine = (await fetch(`${base}/v1/boards/light-cycles/solo/player/solo-player`).then(
      (response) => response.json(),
    )) as {
      entry?: { playerId: string; score: { value: number }; xpRank?: number; xpLevel?: number }
      rank?: number
    }

    expect(mine.entry?.playerId).toBe("solo-player")
    expect(mine.entry?.score.value).toBe(result.score.value)
    expect(mine.entry?.xpRank).toBeGreaterThan(0)
    expect(mine.entry?.xpLevel).toBe(1)
    expect(mine.rank).toBeGreaterThan(0)

    const missing = (await fetch(`${base}/v1/boards/light-cycles/solo/player/nobody`).then(
      (response) => response.json(),
    )) as { entry?: unknown; rank?: number }

    expect(missing.entry).toBeUndefined()
    expect(missing.rank).toBeUndefined()
  })

  it("keeps rank consistent when a later run scores worse", async () => {
    const entry = verifiers["light-cycles"]!
    const played: Array<{ runId: string; value: number; replay: unknown }> = []

    for (let index = 0; index < 2; index += 1) {
      const run = await startRun("light-cycles", "solo", "rank-consistency")
      const result = playRealtime(entry.core, entry.meta, {
        seed: run.seed,
        mode: entry.meta.modes[0]!,
        ticks: 4000,
        inputs: [],
      })
      played.push({ runId: run.runId, value: result.score.value, replay: result.replay })
    }

    played.sort((left, right) => right.value - left.value)
    const ranks: number[] = []

    for (const item of played) {
      const body = (await fetch(`${base}/v1/runs/${item.runId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replay: item.replay }),
      }).then((response) => response.json())) as { rank: number }
      ranks.push(body.rank)
    }

    const mine = (await fetch(`${base}/v1/boards/light-cycles/solo/player/rank-consistency`).then(
      (response) => response.json(),
    )) as { entry: { score: { value: number } }; rank: number }

    expect(mine.entry.score.value).toBe(played[0]!.value)
    expect(ranks[0]).toBe(mine.rank)
    expect(ranks[1]).toBe(mine.rank)
  })

  it("rejects malformed board paths", async () => {
    const slash = await fetch(`${base}/v1/boards/light-cycles/solo/player/a%2Fb`)
    expect(slash.status).toBe(400)

    const escape = await fetch(`${base}/v1/boards/light-cycles/solo/player/%E0%A4%A`)
    expect(escape.status).toBe(400)

    const noId = await fetch(`${base}/v1/boards/light-cycles/solo/player`)
    expect(noId.status).toBe(404)

    const unknownMode = await fetch(`${base}/v1/boards/light-cycles/nope`)
    expect(unknownMode.status).toBe(404)
  })

  it("rejects a replay from a different seeded run", async () => {
    const run = await startRun("light-cycles", "solo", "other")
    const entry = verifiers["light-cycles"]!
    const result = playRealtime(entry.core, entry.meta, {
      seed: run.seed + 1,
      mode: entry.meta.modes[0]!,
      ticks: 4000,
      inputs: [],
    })

    const submit = await fetch(`${base}/v1/runs/${run.runId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replay: result.replay }),
    })

    expect(submit.status).toBe(422)
  })
})

const FIXED_NOW = Date.UTC(2026, 10, 8, 12)
const FIXED_DATE = "2026-11-08"

async function dailyServer(featured: string): Promise<{ server: ArcadeServer; base: string }> {
  const server = createArcadeServer({
    daily: { secret: "test-secret", featured, now: () => FIXED_NOW },
  })
  const port = await server.listen(0)
  return { server, base: `http://127.0.0.1:${port}` }
}

async function dailyInfo(base: string, playerId?: string) {
  const response = await fetch(
    `${base}/v1/challenges/today`,
    playerId ? { headers: { "x-arcade-player": playerId } } : undefined,
  )
  expect(response.status).toBe(200)
  return (await response.json()) as {
    challengeId: string
    gameId: string
    modeId: string
    seed: number
    attemptsLeft: number
    anchor?: { type: string; x: number; y: number }
  }
}

async function dailyStart(base: string, challengeId: string, playerId: string) {
  return fetch(`${base}/v1/challenges/${encodeURIComponent(challengeId)}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId }),
  })
}

async function submitReplay(base: string, runId: string, replay: unknown) {
  return fetch(`${base}/v1/runs/${runId}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replay }),
  })
}

/**
 * Deterministic greedy endless line: take the drop with the largest immediate
 * chain payout until the stack eventually overflows. The same seed therefore
 * produces the same value on every replay, which is what lets the daily test
 * isolate elapsed time as the sole tiebreak.
 */
function tilechainEndlessInputs(seed: number): TilechainInput[] {
  const mode = tilechainMeta.modes.find((candidate) => candidate.id === "endless")!
  let state = tilechainCore.create(seed, mode)
  const inputs: TilechainInput[] = []

  while (tilechainCore.phase(state) === "playing" && inputs.length < 200) {
    let bestCol = -1
    let bestGain = Number.NEGATIVE_INFINITY

    for (let col = 0; col < COLS; col += 1) {
      if (state.board[0]![col] !== null) continue
      const next = tilechainCore.step(state, [{ type: "drop", col }], 0)
      const gain = next.chainPoints - state.chainPoints
      if (gain > bestGain) {
        bestGain = gain
        bestCol = col
      }
    }

    if (bestCol < 0) break
    const input: TilechainInput = { type: "drop", col: bestCol }
    inputs.push(input)
    state = tilechainCore.step(state, [input], 0)
  }

  return inputs
}

describe("daily challenge", () => {
  it("uses one fixed seed and rejects a fourth attempt", async () => {
    const info = await dailyInfo(base, "daily-attempts")
    expect(info.attemptsLeft).toBe(3)

    const seeds: number[] = []
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await dailyStart(base, info.challengeId, "daily-attempts")
      expect(response.status).toBe(201)
      const body = (await response.json()) as { seed: number; attemptsLeft: number }
      seeds.push(body.seed)
      expect(body.attemptsLeft).toBe(3 - attempt)
    }

    expect(new Set(seeds)).toEqual(new Set([info.seed]))

    const fourth = await dailyStart(base, info.challengeId, "daily-attempts")
    expect(fourth.status).toBe(429)
    const after = await dailyInfo(base, "daily-attempts")
    expect(after.attemptsLeft).toBe(0)
  })

  it("keeps the best of three on a separate daily board", async () => {
    const { server: local, base: root } = await dailyServer("light-cycles:solo")
    try {
      const info = await dailyInfo(root, "daily-best")
      expect(info.gameId).toBe("light-cycles")
      expect(info.modeId).toBe("solo")

      const entry = verifiers["light-cycles"]!
      const mode = entry.meta.modes.find((candidate) => candidate.id === "solo")!
      const played: Array<{ runId: string; value: number; replay: unknown }> = []

      for (const inputs of [
        [],
        [{ tick: 5, input: { player: 0 as const, turn: 1 as const } }],
      ]) {
        const response = await dailyStart(root, info.challengeId, "daily-best")
        expect(response.status).toBe(201)
        const started = (await response.json()) as { runId: string; seed: number }
        const result = playRealtime(entry.core, entry.meta, {
          seed: started.seed,
          mode,
          ticks: 4000,
          inputs,
        })
        played.push({ runId: started.runId, value: result.score.value, replay: result.replay })
      }

      played.sort((left, right) => right.value - left.value)
      for (const item of played) {
        const submitted = await submitReplay(root, item.runId, item.replay)
        expect(submitted.status).toBe(200)
        const body = (await submitted.json()) as { challengeId?: string }
        expect(body.challengeId).toBe(info.challengeId)
      }

      const board = (await fetch(
        `${root}/v1/challenges/${encodeURIComponent(info.challengeId)}/board`,
      ).then((response) => response.json())) as {
        entries: Array<{ playerId: string; score: { value: number } }>
      }

      expect(board.entries).toHaveLength(1)
      expect(board.entries[0]?.playerId).toBe("daily-best")
      expect(board.entries[0]?.score.value).toBe(played[0]!.value)

      const allTime = (await fetch(`${root}/v1/boards/light-cycles/solo`).then((response) =>
        response.json(),
      )) as { entries: unknown[] }
      expect(allTime.entries).toHaveLength(0)

      const after = await dailyInfo(root, "daily-best")
      expect(after.attemptsLeft).toBe(1)
    } finally {
      await local.close()
    }
  })

  it("requires the daily Minesweeper anchor as the first input", async () => {    const { server: local, base: root } = await dailyServer("mineflag:beginner")
    try {
      const info = await dailyInfo(root, "daily-anchor")
      expect(info.challengeId).toBe(`mineflag:beginner:daily:${FIXED_DATE}`)
      expect(info.anchor).toEqual({ type: "reveal", x: 4, y: 4 })

      const entry = verifiers["mineflag"]!
      const mode = entry.meta.modes.find((candidate) => candidate.id === "beginner")!
      const response = await dailyStart(root, info.challengeId, "daily-anchor")
      expect(response.status).toBe(201)
      const started = (await response.json()) as { runId: string; seed: number }

      const offAnchor = playTurn(entry.core, entry.meta, {
        seed: started.seed,
        mode,
        inputs: [{ type: "reveal", x: 0, y: 0 }],
      })
      const rejected = await submitReplay(root, started.runId, offAnchor.replay)
      expect(rejected.status).toBe(422)
      expect(((await rejected.json()) as { reason: string }).reason).toContain("anchor")

      // Reveal every safe cell from the anchor so the replay is a complete win.
      const anchor = info.anchor as { type: "reveal"; x: number; y: number }
      let probe = entry.core.step(
        entry.core.create(started.seed, mode),
        [anchor],
        0,
      ) as {
        width: number
        height: number
        cells: Array<{ mine: boolean; revealed: boolean }>
      }
      const inputs: Array<{ type: "reveal"; x: number; y: number }> = [anchor]
      for (let index = 0; index < probe.width * probe.height; index += 1) {
        if (entry.core.phase(probe) !== "playing") break
        const cell = probe.cells[index]
        if (!cell || cell.mine || cell.revealed) continue
        const input: { type: "reveal"; x: number; y: number } = {
          type: "reveal",
          x: index % probe.width,
          y: Math.floor(index / probe.width),
        }
        inputs.push(input)
        probe = entry.core.step(probe, [input], 0) as typeof probe
      }

      const onAnchor = playTurn(entry.core, entry.meta, {
        seed: started.seed,
        mode,
        inputs,
      })
      const accepted = await submitReplay(root, started.runId, onAnchor.replay)
      expect(accepted.status).toBe(200)
      const acceptedBody = (await accepted.json()) as {
        ok: boolean
        score: {
          ranked: boolean
          won: boolean
          value: number
          detail?: Record<string, number | string | boolean>
        }
      }
      expect(acceptedBody.ok).toBe(true)
      expect(acceptedBody.score.won).toBe(true)
      expect(acceptedBody.score.ranked).toBe(true)

      const moves = onAnchor.replay.inputs.length
      const detail = acceptedBody.score.detail ?? {}
      expect(detail.moves).toBe(moves)
      expect(detail.attempt).toBe(1)
      expect(typeof detail.elapsedMs).toBe("number")
      const expectedRankKey = [
        String(moves).padStart(6, "0"),
        String(detail.elapsedMs).padStart(10, "0"),
      ].join("|")
      expect(detail.rankKey).toBe(expectedRankKey)
      expect(acceptedBody.score.value).toBe(moves)

      const board = (await fetch(
        `${root}/v1/challenges/${encodeURIComponent(info.challengeId)}/board`,
      ).then((response) => response.json())) as {
        entries: Array<{ playerId: string; score: { value: number }; rankKey?: string }>
      }
      expect(board.entries).toHaveLength(1)
      expect(board.entries[0]?.playerId).toBe("daily-anchor")
      expect(board.entries[0]?.score.value).toBe(moves)
      expect(board.entries[0]?.rankKey).toBe(expectedRankKey)
    } finally {
      await local.close()
    }
  })

  it("rejects an unranked Mineflag loss and leaves the board empty", async () => {
    const run = await startRun("mineflag", "beginner", "unranked-loss")
    const entry = verifiers["mineflag"]!
    const mode = entry.meta.modes.find((candidate) => candidate.id === "beginner")!
    const first = { type: "reveal", x: 0, y: 0 }
    const state = entry.core.step(entry.core.create(run.seed, mode), [first], 0) as {
      width: number
      cells: Array<{ mine: boolean }>
    }
    const mine = state.cells.findIndex((cell) => cell.mine)
    expect(mine).toBeGreaterThanOrEqual(0)
    const second = {
      type: "reveal",
      x: mine % state.width,
      y: Math.floor(mine / state.width),
    }
    const result = playTurn(entry.core, entry.meta, {
      seed: run.seed,
      mode,
      inputs: [first, second],
    })
    expect(result.state.phase).toBe("lost")

    const response = await submitReplay(base, run.runId, result.replay)
    expect(response.status).toBe(422)
    const body = (await response.json()) as {
      ok: boolean
      score: { ranked: boolean }
    }
    expect(body.ok).toBe(false)
    expect(body.score.ranked).toBe(false)

    const mineBest = (await fetch(
      `${base}/v1/boards/mineflag/beginner/player/unranked-loss`,
    ).then((response) => response.json())) as { entry?: unknown }
    expect(mineBest.entry).toBeUndefined()
  })

  it("rejects a daily submission after the UTC date rolls over", async () => {
    let now = FIXED_NOW
    const local = createArcadeServer({
      daily: { secret: "test-secret", featured: "light-cycles:solo", now: () => now },
    })
    const port = await local.listen(0)
    const root = `http://127.0.0.1:${port}`
    try {
      const info = await dailyInfo(root, "rollover")
      const response = await dailyStart(root, info.challengeId, "rollover")
      expect(response.status).toBe(201)
      const started = (await response.json()) as { runId: string; seed: number }

      const entry = verifiers["light-cycles"]!
      const result = playRealtime(entry.core, entry.meta, {
        seed: started.seed,
        mode: entry.meta.modes[0]!,
        ticks: 4000,
        inputs: [],
      })

      now += 24 * 60 * 60 * 1000
      const submit = await submitReplay(root, started.runId, result.replay)
      expect(submit.status).toBe(410)
    } finally {
      await local.close()
    }
  })

  it("rejects run creation for unranked modes (duel)", async () => {
    const response = await fetch(`${base}/v1/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId: "light-cycles", modeId: "duel", playerId: "tester-duel" }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain("mode is not eligible for ranked runs")
  })

  it("rejects oversized input arrays and malformed input shapes with 422", async () => {
    const run = await startRun("light-cycles", "solo", "malformed-tester")
    const entry = verifiers["light-cycles"]!
    const validResult = playRealtime(entry.core, entry.meta, {
      seed: run.seed,
      mode: entry.meta.modes[0]!,
      ticks: 4000,
      inputs: [],
    })

    // Oversized inputs array (> 10,000 inputs) within body limit
    const oversizedReplay = {
      ...validResult.replay,
      inputs: Array.from({ length: 10_001 }, () => ({
        tick: 0,
        input: 0,
      })),
    }
    const oversizedRes = await submitReplay(base, run.runId, oversizedReplay)
    expect(oversizedRes.status).toBe(422)

    // Tick batch with more than 8 inputs in realtime game
    const excessiveTickReplay = {
      ...validResult.replay,
      inputs: Array.from({ length: 9 }, () => ({
        tick: 0,
        input: { player: 0, turn: 0 },
      })),
    }
    const excessiveTickRes = await submitReplay(base, run.runId, excessiveTickReplay)
    expect(excessiveTickRes.status).toBe(422)

    // Malformed input payloads (e.g. input is null or non-integer coordinates in mineflag)
    // assert 422, never 500
    const mineRun = await startRun("mineflag", "beginner", "malformed-mine-tester")
    const malformedMineRes = await submitReplay(base, mineRun.runId, {
      version: 1,
      gameId: "mineflag",
      gameVersion: "1.1.0",
      frameworkVersion: "0.1.0",
      kind: "turn",
      modeId: "beginner",
      seed: mineRun.seed,
      durationMs: 1000,
      inputs: [{ tick: 0, input: null }],
    })
    expect(malformedMineRes.status).toBe(422)
    expect(malformedMineRes.status).not.toBe(500)

    const nonIntegerMineRes = await submitReplay(base, mineRun.runId, {
      version: 1,
      gameId: "mineflag",
      gameVersion: "1.1.0",
      frameworkVersion: "0.1.0",
      kind: "turn",
      modeId: "beginner",
      seed: mineRun.seed,
      durationMs: 1000,
      inputs: [{ tick: 0, input: { type: "reveal", x: 1.5, y: 1.5 } }],
    })
    expect(nonIntegerMineRes.status).toBe(422)
    expect(nonIntegerMineRes.status).not.toBe(500)

    // In light-cycles, malformed turn 0.5 previously crashed nextCell with 500
    const cyclesMalformedRes = await submitReplay(base, run.runId, {
      ...validResult.replay,
      inputs: [{ tick: 0, input: { player: 0, turn: 0.5 } }],
    })
    // Either fails verification (state hash mismatch -> 422) or verifies (422/200), but never crashes with 500
    expect(cyclesMalformedRes.status).not.toBe(500)
  })

  it("omits wildcard CORS on mutating routes but keeps it on public GET", async () => {
    const getGames = await fetch(`${base}/v1/games`)
    expect(getGames.headers.get("access-control-allow-origin")).toBe("*")

    const postRun = await fetch(`${base}/v1/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId: "light-cycles", modeId: "solo", playerId: "cors-tester" }),
    })
    expect(postRun.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("denormalizes displayName onto BoardEntry", async () => {
    const run = await startRun("light-cycles", "solo", "display-tester")
    const entry = verifiers["light-cycles"]!
    const result = playRealtime(entry.core, entry.meta, {
      seed: run.seed,
      mode: entry.meta.modes[0]!,
      ticks: 4000,
      inputs: [],
    })

    const submit = await submitReplay(base, run.runId, result.replay)
    expect(submit.status).toBe(200)

    const board = (await fetch(`${base}/v1/boards/light-cycles/solo`).then((r) =>
      r.json(),
    )) as { entries: Array<{ playerId: string; displayName?: string }> }

    const userEntry = board.entries.find((e) => e.playerId === "display-tester")
    expect(userEntry).toBeDefined()
    expect(userEntry?.displayName).toBe("display-tester")
  })

  it("rejects unauthenticated requests trying to use an existing registered user's playerId", async () => {
    const store = new MemoryStore()
    const at = Date.now()
    await store.ensurePlayer("github:999", {
      playerId: "registered-uuid",
      providerId: "github:999",
      displayName: "Registered Octocat",
      createdAt: at,
      updatedAt: at,
    })
    const local = createArcadeServer({ store, requireAuth: false })
    const port = await local.listen(0)
    const root = `http://127.0.0.1:${port}`
    try {
      const res = await fetch(`${root}/v1/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: "light-cycles", modeId: "solo", playerId: "registered-uuid" }),
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe("invalid playerId")
    } finally {
      await local.close()
    }
  })

  it("enforces rate limits on run creation", async () => {
    const local = createArcadeServer({
      rateLimits: { runsPerMin: 2 },
    })
    const port = await local.listen(0)
    const root = `http://127.0.0.1:${port}`
    try {
      const makeRun = (id: string) =>
        fetch(`${root}/v1/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameId: "light-cycles", modeId: "solo", playerId: id }),
        })

      const r1 = await makeRun("p1")
      expect(r1.status).toBe(201)
      const r2 = await makeRun("p2")
      expect(r2.status).toBe(201)
      const r3 = await makeRun("p3")
      expect(r3.status).toBe(429)
    } finally {
      await local.close()
    }
  })

  it("enforces submit rate limits by IP before getRun and by player after auth", async () => {
    let getRunCalls = 0
    const store = new MemoryStore()
    const originalGetRun = store.getRun.bind(store)
    store.getRun = async (id: string) => {
      getRunCalls += 1
      return originalGetRun(id)
    }

    const local = createArcadeServer({
      store,
      rateLimits: { submitsPerMin: 2 },
    })
    const port = await local.listen(0)
    const root = `http://127.0.0.1:${port}`
    try {
      // 1. Submit IP rate-limit triggers before store.getRun
      const submitBogus = () =>
        fetch(`${root}/v1/runs/bogus-run-id/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ replay: {} }),
        })

      const res1 = await submitBogus()
      expect(res1.status).toBe(404)
      expect(getRunCalls).toBe(1)

      const res2 = await submitBogus()
      expect(res2.status).toBe(404)
      expect(getRunCalls).toBe(2)

      const res3 = await submitBogus()
      expect(res3.status).toBe(429)
      // getRunCalls must NOT increase because allowSubmitIp rejected the request before store.getRun
      expect(getRunCalls).toBe(2)
    } finally {
      await local.close()
    }
  })

  it("exposes a verified best as an unranked ghost", async () => {
    const run = await startRun("light-cycles", "solo", "ghost-player")
    const entry = verifiers["light-cycles"]!
    const result = playRealtime(entry.core, entry.meta, {
      seed: run.seed,
      mode: entry.meta.modes[0]!,
      ticks: 4000,
      inputs: [],
    })

    await fetch(`${base}/v1/runs/${run.runId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replay: result.replay }),
    })

    const board = (await fetch(`${base}/v1/boards/light-cycles/solo`).then((response) =>
      response.json(),
    )) as { entries: Array<{ playerId: string; ghostId?: string }> }
    const mine = board.entries.find((item) => item.playerId === "ghost-player")
    expect(mine?.ghostId).toBe(run.runId)

    const ghost = (await fetch(`${base}/v1/runs/${run.runId}/ghost`).then((response) =>
      response.json(),
    )) as { ghostId: string; gameId: string; modeId: string; seed: number }
    expect(ghost.ghostId).toBe(run.runId)
    expect(ghost.gameId).toBe("light-cycles")
    expect(ghost.modeId).toBe("solo")
    expect(ghost.seed).toBe(run.seed)

    const missing = await fetch(`${base}/v1/runs/000000000000000000000000/ghost`)
    expect(missing.status).toBe(404)

    const invalid = await fetch(`${base}/v1/runs/not-a-run-id/ghost`)
    expect(invalid.status).toBe(400)
  })

  it("answers OPTIONS preflight with allowed auth/player headers and omits CORS on POST errors", async () => {
    const preflight = await fetch(`${base}/v1/me`, { method: "OPTIONS" })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*")
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS")
    const allowHeaders = preflight.headers.get("access-control-allow-headers") ?? ""
    expect(allowHeaders).toContain("content-type")
    expect(allowHeaders).toContain("x-arcade-player")
    expect(allowHeaders).toContain("authorization")

    const unauthPatch = await fetch(`${base}/v1/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "tester" }),
    })
    expect(unauthPatch.status).toBe(401)
    expect(unauthPatch.headers.get("access-control-allow-origin")).toBeNull()
    expect(unauthPatch.headers.get("access-control-allow-headers")).toBeNull()
    expect(unauthPatch.headers.get("access-control-allow-methods")).toBeNull()
  })

  it("returns 400 invalid JSON body for malformed JSON without wildcard CORS", async () => {
    const res = await fetch(`${base}/v1/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    })
    expect(res.status).toBe(400)
    expect(res.headers.get("access-control-allow-origin")).toBeNull()
    const body = (await res.json()) as { error: string }
    expect(body).toEqual({ error: "invalid JSON body" })
  })

  it("sanitizes unhandled 500 errors instead of leaking internal error messages", async () => {
    const failingStore = new MemoryStore()
    failingStore.top = async () => {
      throw new Error("secret firestore connection string leaked")
    }
    const failingServer = createArcadeServer({ store: failingStore })
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const port = await failingServer.listen(0)
      const res = await fetch(`http://127.0.0.1:${port}/v1/boards/light-cycles/solo`)
      expect(res.status).toBe(500)
      expect(res.headers.get("access-control-allow-origin")).toBeNull()
      const body = (await res.json()) as { error: string }
      expect(body).toEqual({ error: "internal server error" })
      expect(consoleSpy).toHaveBeenCalled()
    } finally {
      consoleSpy.mockRestore()
      await failingServer.close()
    }
  })

  it("ranks nonogram runs by complexity, precision, and server elapsed time", async () => {
    let now = Date.UTC(2026, 10, 19, 12, 0, 0)
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now)
    const local = createArcadeServer({
      daily: { secret: "test-secret", featured: "nonogram:easy", now: () => now },
    })
    const port = await local.listen(0)
    const root = `http://127.0.0.1:${port}`

    const start = async (playerId: string) => {
      const res = await fetch(`${root}/v1/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: "nonogram", modeId: "easy", playerId }),
      })
      expect(res.status).toBe(201)
      return (await res.json()) as { runId: string; seed: number }
    }

    const entry = verifiers["nonogram"]!
    const easyMode = entry.meta.modes.find((candidate) => candidate.id === "easy")!

    const buildInputs = (seed: number, failFirstCheck: boolean) => {
      const state = entry.core.create(seed, easyMode) as {
        width: number
        solution: readonly number[]
      }
      const inputs: Array<
        { type: "set"; x: number; y: number; mark: 1 } | { type: "check" }
      > = []
      if (failFirstCheck) inputs.push({ type: "check" })
      for (let index = 0; index < state.solution.length; index += 1) {
        if (state.solution[index] !== 1) continue
        inputs.push({
          type: "set",
          x: index % state.width,
          y: Math.floor(index / state.width),
          mark: 1,
        })
      }
      inputs.push({ type: "check" })
      return inputs
    }

    const expectedFor = (seed: number, failFirstCheck: boolean, elapsedMs: number) => {
      const state = entry.core.create(seed, easyMode) as { complexity: number }
      const baseScore =
        state.complexity - (failFirstCheck ? failedCheckPenaltyFor("easy") : 0)
      // The value is replay-derived only; elapsed time is a rank-key tiebreak.
      const value = Math.min(entry.meta.score.max, baseScore)
      const penalty = Math.max(0, entry.meta.score.max - value)
      const rankKey = `${String(penalty).padStart(6, "0")}|${String(elapsedMs).padStart(10, "0")}`
      return { baseScore, value, rankKey }
    }

    try {
      // All-time board: ignores spoofed client durationMs (0ms) and computes from server time.
      const r1 = await start("all-one")
      const r2 = await start("all-two")
      now += 15_000
      const s1 = await submitReplay(
        root,
        r1.runId,
        playTurn(entry.core, entry.meta, {
          seed: r1.seed,
          mode: easyMode,
          inputs: buildInputs(r1.seed, false),
          durationMs: 0,
        }).replay,
      )
      expect(s1.status).toBe(200)
      const b1 = (await s1.json()) as {
        score: { value: number; detail?: Record<string, unknown> }
      }
      const exp1 = expectedFor(r1.seed, false, 15_000)
      expect(b1.score.value).toBe(exp1.value)
      expect(b1.score.detail?.baseScore).toBe(exp1.baseScore)
      expect(b1.score.detail?.elapsedMs).toBe(15_000)
      expect(b1.score.detail?.rankKey).toBe(exp1.rankKey)

      now += 25_000
      const s2 = await submitReplay(
        root,
        r2.runId,
        playTurn(entry.core, entry.meta, {
          seed: r2.seed,
          mode: easyMode,
          inputs: buildInputs(r2.seed, true),
          durationMs: 0,
        }).replay,
      )
      expect(s2.status).toBe(200)
      const b2 = (await s2.json()) as {
        score: { value: number; detail?: Record<string, unknown> }
      }
      const exp2 = expectedFor(r2.seed, true, 40_000)
      expect(b2.score.value).toBe(exp2.value)
      expect(b2.score.detail?.rankKey).toBe(exp2.rankKey)

      const allBoard = (await fetch(`${root}/v1/boards/nonogram/easy`).then((res) =>
        res.json(),
      )) as {
        entries: Array<{ playerId: string; score: { value: number }; rankKey?: string }>
      }
      expect(allBoard.entries).toHaveLength(2)
      const sorted = [...allBoard.entries].sort((a, b) =>
        (a.rankKey ?? "").localeCompare(b.rankKey ?? ""),
      )
      expect(allBoard.entries.map((item) => item.playerId)).toEqual(
        sorted.map((item) => item.playerId),
      )

      const topId = allBoard.entries[0]!.playerId
      const topRank = (await fetch(
        `${root}/v1/boards/nonogram/easy/player/${topId}`,
      ).then((res) => res.json())) as { rank?: number }
      expect(topRank.rank).toBe(1)

      // Daily board: shared seed guarantees deterministic ordering across runs.
      const info = await dailyInfo(root)
      const fastMissRun = await dailyStart(root, info.challengeId, "fast-miss").then((r) =>
        r.json(),
      ) as { runId: string; seed: number }
      const slowCleanRun = await dailyStart(root, info.challengeId, "slow-clean").then((r) =>
        r.json(),
      ) as { runId: string; seed: number }
      const fastCleanRun = await dailyStart(root, info.challengeId, "fast-clean").then((r) =>
        r.json(),
      ) as { runId: string; seed: number }

      now += 5_000
      await submitReplay(
        root,
        fastMissRun.runId,
        playTurn(entry.core, entry.meta, {
          seed: fastMissRun.seed,
          mode: easyMode,
          inputs: buildInputs(fastMissRun.seed, true),
        }).replay,
      )

      now += 5_000
      await submitReplay(
        root,
        fastCleanRun.runId,
        playTurn(entry.core, entry.meta, {
          seed: fastCleanRun.seed,
          mode: easyMode,
          inputs: buildInputs(fastCleanRun.seed, false),
        }).replay,
      )

      now += 60_000
      await submitReplay(
        root,
        slowCleanRun.runId,
        playTurn(entry.core, entry.meta, {
          seed: slowCleanRun.seed,
          mode: easyMode,
          inputs: buildInputs(slowCleanRun.seed, false),
        }).replay,
      )

      const dailyBoard = (await fetch(
        `${root}/v1/challenges/${encodeURIComponent(info.challengeId)}/board`,
      ).then((res) => res.json())) as {
        entries: Array<{ playerId: string; score: { value: number } }>
      }
      expect(dailyBoard.entries.map((item) => item.playerId)).toEqual([
        "fast-clean",
        "slow-clean",
        "fast-miss",
      ])

      // A faster clean attempt replaces slow-clean's daily best and moves to #1.
      const rematch = (await dailyStart(root, info.challengeId, "slow-clean").then((r) =>
        r.json(),
      )) as { runId: string; seed: number }
      now += 4_000
      const rematchRes = await submitReplay(
        root,
        rematch.runId,
        playTurn(entry.core, entry.meta, {
          seed: rematch.seed,
          mode: easyMode,
          inputs: buildInputs(rematch.seed, false),
        }).replay,
      )
      const rematchBody = (await rematchRes.json()) as {
        rank: number
        best?: { detail?: Record<string, unknown> }
      }
      expect(rematchBody.rank).toBe(1)
      expect(rematchBody.best?.detail?.elapsedMs).toBe(4_000)

      // A slower attempt does not overwrite slow-clean's 4s personal best.
      const slowerRun = (await dailyStart(root, info.challengeId, "slow-clean").then((r) =>
        r.json(),
      )) as { runId: string; seed: number }
      now += 20_000
      const slowerRes = await submitReplay(
        root,
        slowerRun.runId,
        playTurn(entry.core, entry.meta, {
          seed: slowerRun.seed,
          mode: easyMode,
          inputs: buildInputs(slowerRun.seed, false),
        }).replay,
      )
      const slowerBody = (await slowerRes.json()) as {
        rank: number
        best?: { detail?: Record<string, unknown> }
      }
      expect(slowerBody.rank).toBe(1)
      expect(slowerBody.best?.detail?.elapsedMs).toBe(4_000)
    } finally {
      nowSpy.mockRestore()
      await local.close()
    }
  })

  it("ranks tilechain submissions with the elapsed-time tiebreak", async () => {
    let now = Date.UTC(2026, 10, 8, 12, 0, 0)
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now)
    const local = createArcadeServer({
      daily: { secret: "test-secret", featured: "tilechain:endless", now: () => now },
    })
    const port = await local.listen(0)
    const root = `http://127.0.0.1:${port}`

    try {
      const info = await dailyInfo(root)
      expect(info.gameId).toBe("tilechain")
      expect(info.modeId).toBe("endless")

      const entry = verifiers["tilechain"]!
      const mode = entry.meta.modes.find((candidate) => candidate.id === "endless")!
      const inputs = tilechainEndlessInputs(info.seed)
      const played = playTurn(entry.core, entry.meta, {
        seed: info.seed,
        mode,
        inputs,
        durationMs: 0,
      })

      // Endless only ends on a loss, and a scored loss still ranks.
      expect(played.state.phase).toBe("lost")
      expect(played.score.won).toBe(false)
      expect(played.score.ranked).toBe(true)
      expect(played.score.value).toBeGreaterThan(0)

      const fast = (await dailyStart(root, info.challengeId, "tilechain-fast").then((res) =>
        res.json(),
      )) as { runId: string; seed: number }
      const slow = (await dailyStart(root, info.challengeId, "tilechain-slow").then((res) =>
        res.json(),
      )) as { runId: string; seed: number }
      expect(fast.seed).toBe(info.seed)
      expect(slow.seed).toBe(info.seed)

      const penalty = Math.max(0, entry.meta.score.max - played.score.value)
      const keyFor = (elapsedMs: number) =>
        `${String(penalty).padStart(6, "0")}|${String(elapsedMs).padStart(10, "0")}`

      now += 5_000
      const fastRes = await submitReplay(root, fast.runId, played.replay)
      expect(fastRes.status).toBe(200)
      const fastBody = (await fastRes.json()) as {
        ok: boolean
        rank: number
        score: {
          value: number
          won: boolean
          ranked: boolean
          detail?: Record<string, number | string | boolean>
        }
      }
      expect(fastBody.ok).toBe(true)
      expect(fastBody.rank).toBe(1)
      expect(fastBody.score.value).toBe(played.score.value)
      expect(fastBody.score.won).toBe(false)
      expect(fastBody.score.ranked).toBe(true)
      expect(fastBody.score.detail?.elapsedMs).toBe(5_000)
      expect(fastBody.score.detail?.rankKey).toBe(keyFor(5_000))

      now += 10_000
      const slowRes = await submitReplay(root, slow.runId, played.replay)
      expect(slowRes.status).toBe(200)
      const slowBody = (await slowRes.json()) as {
        ok: boolean
        rank: number
        score: {
          value: number
          detail?: Record<string, number | string | boolean>
        }
      }
      expect(slowBody.ok).toBe(true)
      expect(slowBody.rank).toBe(2)
      expect(slowBody.score.value).toBe(played.score.value)
      expect(slowBody.score.detail?.elapsedMs).toBe(15_000)
      expect(slowBody.score.detail?.rankKey).toBe(keyFor(15_000))

      // Equal replay-derived value, so the smaller elapsed time wins the board.
      const board = (await fetch(
        `${root}/v1/challenges/${encodeURIComponent(info.challengeId)}/board`,
      ).then((res) => res.json())) as {
        entries: Array<{ playerId: string; score: { value: number }; rankKey?: string }>
      }
      expect(board.entries.map((item) => item.playerId)).toEqual([
        "tilechain-fast",
        "tilechain-slow",
      ])
      expect(board.entries.map((item) => item.rankKey)).toEqual([
        keyFor(5_000),
        keyFor(15_000),
      ])
      expect(board.entries.every((item) => item.score.value === played.score.value)).toBe(true)
    } finally {
      nowSpy.mockRestore()
      await local.close()
    }
  })

  it("ranks router submissions by score with the elapsed-time tiebreak", async () => {
    let now = Date.UTC(2026, 10, 20, 12, 0, 0)
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now)
    const local = createArcadeServer()
    const port = await local.listen(0)
    const root = `http://127.0.0.1:${port}`

    try {
      const entry = verifiers["router"]!
      const mode = entry.meta.modes.find((candidate) => candidate.id === "easy")!

      const routerInputs = (seed: number): RouterInput[] => {
        const generated = generateRouterBoard(seed, mode)
        const inputs: RouterInput[] = []
        for (let index = 0; index < generated.initialMasks.length; index += 1) {
          const solved = generated.solvedMasks[index]!
          const initial = generated.initialMasks[index]!
          const period = routerPeriodOf(solved)
          if (period === 1) continue
          const offset = [0, 1, 2, 3].find(
            (steps) => rotateRouterMask(solved, steps) === initial,
          )!
          const dirs: ReadonlyArray<1 | -1> =
            offset === 0 ? [] : offset === 1 ? [-1] : offset === 2 ? [1, 1] : [1]
          for (const dir of dirs) {
            inputs.push({
              type: "rotate",
              x: index % generated.width,
              y: Math.floor(index / generated.width),
              dir,
            })
          }
        }
        return inputs
      }

      const start = async (playerId: string) => {
        const response = await fetch(`${root}/v1/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameId: "router", modeId: "easy", playerId }),
        })
        expect(response.status).toBe(201)
        return (await response.json()) as { runId: string; seed: number }
      }

      const fastRun = await start("router-fast")
      const slowRun = await start("router-slow")
      const fastPlayed = playTurn(entry.core, entry.meta, {
        seed: fastRun.seed,
        mode,
        inputs: routerInputs(fastRun.seed),
        durationMs: 0,
      })
      const slowPlayed = playTurn(entry.core, entry.meta, {
        seed: slowRun.seed,
        mode,
        inputs: routerInputs(slowRun.seed),
        durationMs: 0,
      })

      expect(fastPlayed.state.phase).toBe("won")
      expect(slowPlayed.state.phase).toBe("won")
      expect(fastPlayed.score.value).toBe(2500)
      expect(slowPlayed.score.value).toBe(2500)

      const penalty = Math.max(0, entry.meta.score.max - fastPlayed.score.value)
      const keyFor = (elapsedMs: number) =>
        `${String(penalty).padStart(6, "0")}|${String(elapsedMs).padStart(10, "0")}`

      now += 5_000
      const fastRes = await submitReplay(root, fastRun.runId, fastPlayed.replay)
      expect(fastRes.status).toBe(200)
      const fastBody = (await fastRes.json()) as {
        ok: boolean
        rank: number
        score: { value: number; detail?: Record<string, number | string | boolean> }
      }
      expect(fastBody.ok).toBe(true)
      expect(fastBody.rank).toBe(1)
      expect(fastBody.score.value).toBe(2500)
      expect(fastBody.score.detail?.elapsedMs).toBe(5_000)
      expect(fastBody.score.detail?.rankKey).toBe(keyFor(5_000))

      now += 10_000
      const slowRes = await submitReplay(root, slowRun.runId, slowPlayed.replay)
      expect(slowRes.status).toBe(200)
      const slowBody = (await slowRes.json()) as {
        ok: boolean
        rank: number
        score: { value: number; detail?: Record<string, number | string | boolean> }
      }
      expect(slowBody.ok).toBe(true)
      expect(slowBody.rank).toBe(2)
      expect(slowBody.score.value).toBe(2500)
      expect(slowBody.score.detail?.elapsedMs).toBe(15_000)
      expect(slowBody.score.detail?.rankKey).toBe(keyFor(15_000))

      const board = (await fetch(`${root}/v1/boards/router/easy`).then((res) =>
        res.json(),
      )) as {
        entries: Array<{ playerId: string; score: { value: number }; rankKey?: string }>
      }
      expect(board.entries.map((item) => item.playerId)).toEqual(["router-fast", "router-slow"])
      expect(board.entries.map((item) => item.rankKey)).toEqual([
        keyFor(5_000),
        keyFor(15_000),
      ])
      expect(board.entries.every((item) => item.score.value === 2500)).toBe(true)
    } finally {
      nowSpy.mockRestore()
      await local.close()
    }
  })

  it("ranks lockstep daily boards by score instead of rankKey", async () => {
    const store = new MemoryStore()
    const topSpy = vi.spyOn(store, "top")
    const rankSpy = vi.spyOn(store, "rank")
    const local = createArcadeServer({
      store,
      daily: { secret: "test-secret", featured: "lockstep:skirmish", now: () => FIXED_NOW },
    })
    const port = await local.listen(0)
    const root = `http://127.0.0.1:${port}`

    try {
      const info = await dailyInfo(root)
      expect(info.gameId).toBe("lockstep")
      const entry = verifiers["lockstep"]!
      const mode = entry.meta.modes.find((candidate) => candidate.id === "skirmish")!

      const started = (await dailyStart(root, info.challengeId, "lockstep-daily").then((r) =>
        r.json(),
      )) as { runId: string; seed: number }
      const inputs = [
        ...greedySolve(started.seed, mode, 120),
        ...Array.from({ length: 60 }, () => ({ action: "wait" as const })),
      ]
      const result = playTurn(entry.core, entry.meta, {
        seed: started.seed,
        mode,
        inputs,
        durationMs: 20_000,
      })
      expect(result.score.ranked).toBe(true)

      const submitRes = await submitReplay(root, started.runId, result.replay)
      expect(submitRes.status).toBe(200)
      const submitBody = (await submitRes.json()) as { ok: boolean; rank?: number }
      expect(submitBody.ok).toBe(true)
      expect(submitBody.rank).toBe(1)

      const boardRes = await fetch(
        `${root}/v1/challenges/${encodeURIComponent(info.challengeId)}/board`,
      )
      expect(boardRes.status).toBe(200)
      const board = (await boardRes.json()) as {
        entries: Array<{ playerId: string; score: { value: number }; rankKey?: string }>
      }
      expect(board.entries).toHaveLength(1)
      expect(board.entries[0]?.playerId).toBe("lockstep-daily")
      expect(board.entries[0]?.score.value).toBe(result.score.value)
      expect(board.entries[0]?.rankKey).toBeUndefined()

      expect(rankSpy).toHaveBeenLastCalledWith(
        info.challengeId,
        "lockstep-daily",
        "higher",
        undefined,
        "score",
      )
      expect(topSpy).toHaveBeenLastCalledWith(info.challengeId, 50, "higher", "score")
    } finally {
      await local.close()
    }
  })
})
