import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { playRealtime } from "@await-arcade/framework"
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
