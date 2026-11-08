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
  })
})
