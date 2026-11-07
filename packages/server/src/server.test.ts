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
