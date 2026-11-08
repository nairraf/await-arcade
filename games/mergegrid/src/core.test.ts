import { describe, expect, it } from "vitest"
import { playTurn } from "@await-arcade/framework"
import { core, type Direction, type MergeInput, type MergeState } from "./core"
import { meta } from "./meta"

function seedBoard(state: MergeState, values: number[]): void {
  state.grid = values
}

describe("2048 core", () => {
  it("starts with two tiles and is deterministic", () => {
    const mode = meta.modes[0]!
    const first = core.create(7, mode)
    const second = core.create(7, mode)

    expect(first.grid.filter((value) => value !== 0)).toHaveLength(2)
    expect(core.serialize(first)).toEqual(core.serialize(second))
  })

  it("merges a pair once and adds to the score", () => {
    const state = core.create(1, meta.modes[0]!)
    seedBoard(state, [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

    const next = core.step(state, [{ direction: "left" }], 0)
    expect(next.grid[0]).toBe(4)
    expect(next.grid[1]).toBe(0)
    expect(next.score).toBeGreaterThanOrEqual(4)
    expect(next.moves).toBe(1)
  })

  it("does not spawn or count an illegal move", () => {
    const state = core.create(1, meta.modes[0]!)
    seedBoard(state, [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const spawnsBefore = state.spawns
    const movesBefore = state.moves

    core.step(state, [{ direction: "left" }], 0)
    expect(state.spawns).toBe(spawnsBefore)
    expect(state.moves).toBe(movesBefore)
  })

  it("wins when a merge reaches 2048", () => {
    const state = core.create(1, meta.modes[0]!)
    seedBoard(state, [1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

    const next = core.step(state, [{ direction: "left" }], 0)
    expect(next.grid[0]).toBe(2048)
    expect(next.phase).toBe("won")
    expect(core.score(next, { elapsedMs: 1_000, ticks: 1 }).ranked).toBe(true)
  })

  it("verifies a full scripted game", () => {
    const mode = meta.modes[0]!
    const cycle: Direction[] = ["left", "up", "right", "down"]
    const inputs: MergeInput[] = []
    let state = core.create(123, mode)

    for (let move = 0; move < 20_000 && state.phase === "playing"; move += 1) {
      const input = { direction: cycle[move % cycle.length]! }
      inputs.push(input)
      state = core.step(state, [input], 0)
    }

    expect(state.phase).not.toBe("playing")
    expect(state.phase).toBe("lost")

    const result = playTurn(core, meta, {
      seed: 123,
      mode,
      inputs,
      durationMs: 60_000,
    })

    expect(result.verified.ok).toBe(true)
    expect(result.score.value).toBe(state.score)
    expect(result.verified.score?.value).toBe(state.score)
  })
})
