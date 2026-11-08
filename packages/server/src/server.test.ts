import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { playRealtime, playTurn } from "@await-arcade/framework"
import { createArcadeServer, type ArcadeServer } from "./index"
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
    }

    expect(body.ok).toBe(true)
    expect(body.rank).toBe(1)
    expect(body.score.value).toBe(result.score.value)

    const board = (await fetch(`${base}/v1/boards/light-cycles/solo`).then((response) =>
      response.json(),
    )) as { entries: Array<{ playerId: string }> }

    expect(board.entries[0]?.playerId).toBe("tester")
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
    )) as { entry?: { playerId: string; score: { value: number } }; rank?: number }

    expect(mine.entry?.playerId).toBe("solo-player")
    expect(mine.entry?.score.value).toBe(result.score.value)
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
        score: { ranked: boolean; won: boolean }
      }
      expect(acceptedBody.ok).toBe(true)
      expect(acceptedBody.score.won).toBe(true)
      expect(acceptedBody.score.ranked).toBe(true)

      const board = (await fetch(
        `${root}/v1/challenges/${encodeURIComponent(info.challengeId)}/board`,
      ).then((response) => response.json())) as {
        entries: Array<{ playerId: string }>
      }
      expect(board.entries).toHaveLength(1)
      expect(board.entries[0]?.playerId).toBe("daily-anchor")
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
})
