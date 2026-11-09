import { describe, expect, it } from "vitest"
import { playTurn } from "@await-arcade/framework"
import { core, logicSolvable, type MineInput, type MineState } from "./core"
import { meta } from "./meta"

const mode = meta.modes[0]!

function neighbors(state: MineState, x: number, y: number): number[] {
  const result: number[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < state.width && ny < state.height) {
        result.push(ny * state.width + nx)
      }
    }
  }
  return result
}

function winningInputs(seed: number): MineInput[] {
  const first: MineInput = { type: "reveal", x: 0, y: 0 }
  const state = core.step(core.create(seed, mode), [first], 0)
  const inputs: MineInput[] = [first]

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.cells[y * state.width + x]!
      if (!cell.mine && !cell.revealed) inputs.push({ type: "reveal", x, y })
    }
  }

  return inputs
}

describe("mineflag core", () => {
  it("keeps the first click and its neighbors safe", () => {
    const state = core.step(core.create(99, mode), [{ type: "reveal", x: 4, y: 4 }], 0)
    const first = state.cells[4 * state.width + 4]!
    expect(first.mine).toBe(false)
    for (const index of neighbors(state, 4, 4)) {
      expect(state.cells[index]!.mine).toBe(false)
    }
  })

  it("is deterministic for the same seed and inputs", () => {
    const inputs = winningInputs(7)
    const left = playTurn(core, meta, { seed: 7, mode, inputs, durationMs: 12_345 })
    const right = playTurn(core, meta, { seed: 7, mode, inputs, durationMs: 12_345 })

    expect(core.serialize(left.state)).toEqual(core.serialize(right.state))
    expect(left.score.value).toBe(left.replay.inputs.length)
  })

  it("wins when every safe cell is revealed and verifies the replay", () => {
    const inputs = winningInputs(42)
    const result = playTurn(core, meta, { seed: 42, mode, inputs, durationMs: 20_000 })

    expect(result.state.phase).toBe("won")
    expect(result.score.ranked).toBe(true)
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(result.replay.inputs.length)
  })

  it("generates no-guess boards for every logic mode", () => {
    for (const mode of meta.modes.filter((item) => item.id.endsWith("-logic"))) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const state = core.create(seed, mode)
        const x = Math.floor(state.width / 2)
        const y = Math.floor(state.height / 2)
        core.step(state, [{ type: "reveal", x, y }], 0)

        expect(state.minesPlaced).toBe(true)
        expect(state.logicFallback).toBe(false)
        expect(logicSolvable(state)).toBe(true)
      }
    }
  })

  it("does not claim a guess board is solvable", () => {
    const mode = meta.modes.find((item) => item.id === "beginner-logic")!
    const state = core.create(1, mode)
    state.minesPlaced = true
    ;(state as unknown as { mineCount: number }).mineCount = 1
    state.cells = state.cells.map(() => ({
      mine: false,
      revealed: true,
      flagged: false,
      adjacent: 0,
    }))
    for (const at of [0, 1, 2]) state.cells[at]!.revealed = false
    state.cells[0]!.mine = true
    state.cells[10]!.adjacent = 1

    expect(logicSolvable(state)).toBe(false)
  })

  it("keeps logic boards solvable from a corner click", () => {
    const mode = meta.modes.find((item) => item.id === "beginner-logic")!
    for (let seed = 1; seed <= 5; seed += 1) {
      const state = core.create(seed, mode)
      core.step(state, [{ type: "reveal", x: 0, y: 0 }], 0)
      expect(logicSolvable(state)).toBe(true)
    }
  })

  it("verifies a winning replay on a logic board", () => {
    const mode = meta.modes.find((item) => item.id === "beginner-logic")!
    const seed = 42
    const first: MineInput = { type: "reveal", x: 4, y: 4 }
    const state = core.step(core.create(seed, mode), [first], 0)
    const inputs: MineInput[] = [first]

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const cell = state.cells[y * state.width + x]!
        if (!cell.mine && !cell.revealed) inputs.push({ type: "reveal", x, y })
      }
    }

    const result = playTurn(core, meta, { seed, mode, inputs })
    expect(result.state.phase).toBe("won")
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(result.replay.inputs.length)
  })

  it("does not reveal a flagged cell", () => {
    let state = core.create(3, mode)
    state = core.step(state, [{ type: "flag", x: 2, y: 2 }], 0)
    const flagged = state.cells[2 * state.width + 2]!
    expect(flagged.flagged).toBe(true)

    state = core.step(state, [{ type: "reveal", x: 2, y: 2 }], 0)
    expect(state.cells[2 * state.width + 2]!.revealed).toBe(false)
  })

  it("marks a mine hit as lost and unranked", () => {
    let state = core.step(core.create(5, mode), [{ type: "reveal", x: 0, y: 0 }], 0)
    const mine = state.cells.findIndex((cell) => cell.mine)
    expect(mine).toBeGreaterThanOrEqual(0)

    state = core.step(
      state,
      [{ type: "reveal", x: mine % state.width, y: Math.floor(mine / state.width) }],
      0,
    )

    expect(state.phase).toBe("lost")
    const score = core.score(state, { elapsedMs: 1_000, ticks: 1 })
    expect(score.ranked).toBe(false)
    expect(score.won).toBe(false)
  })
})
