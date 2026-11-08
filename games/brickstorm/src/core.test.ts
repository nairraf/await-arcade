import { describe, expect, it } from "vitest"
import { playRealtime } from "@await-arcade/framework"
import {
  BRICK_COLS,
  BRICK_ROWS,
  brickRect,
  core,
  type BrickstormState,
} from "./core"
import { meta } from "./meta"

const DT = 1000 / 60
const mode = meta.modes[0]!

function setup(): BrickstormState {
  return core.create(11, mode)
}

function rowOf(index: number): number {
  return Math.floor(index / BRICK_COLS)
}

function hitBrick(state: BrickstormState, index: number): void {
  const rect = brickRect(index)
  state.ballX = rect.x + rect.w / 2
  state.ballY = rect.y + rect.h / 2
  state.vx = 0
  state.vy = 0
  core.step(state, [], DT)
}

describe("Brickstorm core", () => {
  it("is deterministic for a seed and places three special bricks", () => {
    const first = setup()
    const second = setup()

    expect(core.serialize(first)).toEqual(core.serialize(second))
    expect(first.kinds.filter((kind) => kind === "save")).toHaveLength(1)
    expect(first.kinds.filter((kind) => kind === "explosive")).toHaveLength(2)
    expect(first.bricks).toHaveLength(BRICK_COLS * BRICK_ROWS)
  })

  it("moves the paddle toward a pointer target", () => {
    const state = setup()
    const before = state.paddleX
    for (let tick = 0; tick < 20; tick += 1) core.step(state, [{ target: 20 }], DT)
    expect(state.paddleX).toBeLessThan(before)
  })

  it("breaks a normal brick and awards its row points", () => {
    const state = setup()
    const index = state.kinds.findIndex(
      (kind, at) => kind === "normal" && rowOf(at) === 0,
    )
    expect(index).toBeGreaterThanOrEqual(0)

    hitBrick(state, index)
    expect(state.bricks[index]).toBe(false)
    expect(state.score).toBe(60)
    expect(state.hits).toBe(1)
  })

  it("explodes the surrounding bricks", () => {
    const state = setup()
    const index = state.kinds.indexOf("explosive")
    expect(index).toBeGreaterThanOrEqual(0)

    const row = rowOf(index)
    const column = index % BRICK_COLS
    const neighbors: number[] = []
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nextRow = row + dy
        const nextColumn = column + dx
        if (nextRow < 0 || nextRow >= BRICK_ROWS) continue
        if (nextColumn < 0 || nextColumn >= BRICK_COLS) continue
        neighbors.push(nextRow * BRICK_COLS + nextColumn)
      }
    }

    hitBrick(state, index)
    expect(state.blasts).toBe(1)
    for (const neighbor of neighbors) expect(state.bricks[neighbor]).toBe(false)
  })

  it("grants a floor save and then expires", () => {
    const state = setup()
    const index = state.kinds.indexOf("save")
    expect(index).toBeGreaterThanOrEqual(0)

    hitBrick(state, index)
    expect(state.saves).toBe(1)
    expect(state.saveUntilTick).toBeGreaterThan(state.ticks)

    state.ballY = state.height + 10
    state.vy = 200
    state.vx = 0
    core.step(state, [], DT)
    expect(state.phase).toBe("playing")

    state.ticks = state.saveUntilTick + 1
    state.ballY = state.height + 10
    state.vy = 200
    state.vx = 0
    core.step(state, [], DT)
    expect(state.phase).toBe("lost")
  })

  it("wins when the last brick breaks", () => {
    const state = setup()
    state.bricks = state.bricks.map((_, index) => index === 0)
    state.kinds = state.kinds.map(() => "normal")
    hitBrick(state, 0)

    expect(state.phase).toBe("won")
    expect(core.score(state, { elapsedMs: 1_000, ticks: 60 }).ranked).toBe(true)
  })

  it("wins a tracked run and stays within the score bound", () => {
    const inputs: Array<{ tick: number; input: { target: number } }> = []
    let state = core.create(5, mode)

    for (let tick = 0; tick < 36_000 && state.phase === "playing"; tick += 1) {
      const input = { target: state.ballX }
      inputs.push({ tick, input })
      state = core.step(state, [input], DT)
    }

    expect(state.phase).toBe("won")
    expect(state.score).toBeLessThanOrEqual(meta.score.max)

    const result = playRealtime(core, meta, {
      seed: 5,
      mode,
      ticks: inputs.length,
      inputs,
    })
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(state.score)
  })

  it("verifies a realtime run that ends", () => {
    const result = playRealtime(core, meta, {
      seed: 21,
      mode,
      ticks: 20_000,
      inputs: [],
    })

    expect(result.state.phase).toBe("lost")
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(result.score.value)
  })
})
