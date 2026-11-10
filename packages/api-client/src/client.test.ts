import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { playRealtime } from "@await-arcade/framework"
import { createArcadeServer, type ArcadeServer } from "../../server/src/index"
import { verifiers } from "../../server/src/registry.generated"
import { createArcadeClient } from "./index.js"

let server: ArcadeServer
let baseUrl = ""

beforeAll(async () => {
  server = createArcadeServer()
  const port = await server.listen(0)
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await server.close()
})

describe("api client", () => {
  it("starts a run, submits a replay, and reads the best", async () => {
    const client = createArcadeClient({ baseUrl, playerId: "api-test" })
    const started = await client.start("light-cycles", "solo")
    const entry = verifiers["light-cycles"]!

    const result = playRealtime(entry.core, entry.meta, {
      seed: started.seed,
      mode: entry.meta.modes[0]!,
      ticks: 4000,
      inputs: [],
    })

    const submitted = await client.submit(started.runId, result.replay)
    expect(submitted.ok).toBe(true)

    const best = await client.bestFor("light-cycles", "solo")
    expect(best?.value).toBe(result.score.value)

    const mine = await client.playerBest("light-cycles", "solo")
    expect(mine.playerId).toBe("api-test")
    expect(mine.rank).toBe(1)
    expect(mine.score?.value).toBe(result.score.value)
  })

  it("reads and starts the daily challenge", async () => {
    const client = createArcadeClient({ baseUrl, playerId: "api-daily" })
    const today = await client.dailyToday()
    expect(today.gameId).toBeTruthy()
    expect(today.modeId).toBeTruthy()
    expect(today.attemptsLeft).toBe(3)

    const started = await client.dailyStart(today.challengeId)
    expect(started.seed).toBe(today.seed)
    expect(started.attempt).toBe(1)
    expect(started.attemptsLeft).toBe(2)

    const board = await client.dailyBoard(today.challengeId)
    expect(Array.isArray(board.entries)).toBe(true)
    expect(board.challengeId).toBe(today.challengeId)
  })
})
