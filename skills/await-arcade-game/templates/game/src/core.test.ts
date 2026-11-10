import { describe, expect, it } from "vitest"
import { playTurn } from "@await-arcade/framework"
import { core } from "./core"
import { meta } from "./meta"

describe("template game", () => {
  it("wins after five target hits and verifies the replay", () => {
    const mode = meta.modes[0]!
    const inputs: Array<{ index: number }> = []
    let state = core.create(1, mode)

    for (let hit = 0; hit < 5; hit += 1) {
      inputs.push({ index: state.target })
      state = core.step(state, [inputs[inputs.length - 1]!], 0)
    }

    expect(state.phase).toBe("won")

    const result = playTurn(core, meta, { seed: 1, mode, inputs, durationMs: 1_000 })
    expect(result.verified.ok).toBe(true)
    expect(result.score.value).toBe(inputs.length)
  })
})
