import { describe, expect, it } from "vitest"
import { playRealtime } from "@await-arcade/framework"
import { core } from "./core"
import { meta } from "./meta"

const solo = meta.modes[0]!

describe("neon cycles core", () => {
  it("is deterministic for the same seed and inputs", () => {
    const left = playRealtime(core, meta, { seed: 7, mode: solo, ticks: 60, inputs: [] })
    const right = playRealtime(core, meta, { seed: 7, mode: solo, ticks: 60, inputs: [] })

    expect(core.serialize(left.state)).toEqual(core.serialize(right.state))
  })

  it("ends and verifies a completed run", () => {
    const result = playRealtime(core, meta, { seed: 123, mode: solo, ticks: 4000, inputs: [] })

    expect(result.state.phase).not.toBe("playing")
    expect(result.score.ranked).toBe(true)
    expect(result.verified.ok).toBe(true)
    expect(result.score.value).toBeGreaterThan(0)
  })

  it("keeps the AI alive when the player does nothing", () => {
    const result = playRealtime(core, meta, { seed: 123, mode: solo, ticks: 4000, inputs: [] })

    expect(result.state.phase).toBe("lost")
    expect(result.state.bikes[1]!.alive).toBe(true)
  })

  it("moves two cells while boosted", () => {
    const state = core.create(1, solo)
    state.boostTicks[0] = 5
    core.step(state, [], 1000 / 60)

    // Player 0 starts at x=8 facing right.
    expect(state.bikes[0]!.x).toBe(10)
    expect(state.bikes[0]!.trail.size).toBe(3)
  })

  it("grants a catch-up boost to the trailing rider", () => {
    const state = core.create(1, solo)
    for (let index = 100; index < 108; index += 1) state.bikes[1]!.trail.add(index)

    core.step(state, [], 1000 / 60)
    expect(state.boostTicks[0]).toBeGreaterThan(0)
  })

  it("grows the trail as the bikes move", () => {
    const result = playRealtime(core, meta, { seed: 1, mode: solo, ticks: 5, inputs: [] })

    expect(result.state.bikes[0]!.trail.size).toBeGreaterThan(1)
  })

  it("turns relative to the current direction", () => {
    const result = playRealtime(core, meta, {
      seed: 1,
      mode: solo,
      ticks: 1,
      inputs: [{ tick: 0, input: { player: 0, turn: -1 } }],
    })

    // Player 0 starts at (8, 18) facing right; a left turn moves it up.
    expect(result.state.bikes[0]!.y).toBe(17)
  })
})
