import { describe, expect, it } from "vitest"
import { playRealtime } from "@await-arcade/framework"
import { core, type BreakoutState } from "./core"
import { meta } from "./meta"

const DT = 1000 / 60

function setup(): BreakoutState {
  return core.create(11, meta.modes[0]!)
}

describe("Breakout core", () => {
  it("is deterministic for a seed", () => {
    const first = setup()
    const second = setup()
    expect(core.serialize(first)).toEqual(core.serialize(second))
  })

  it("moves the paddle toward a pointer target", () => {
    const state = setup()
    const before = state.paddleX
    for (let tick = 0; tick < 20; tick += 1) {
      core.step(state, [{ target: 20 }], DT)
    }
    expect(state.paddleX).toBeLessThan(before)
  })

  it("breaks a brick and awards row points", () => {
    const state = setup()
    state.ballX = 12 + 18
    state.ballY = 26
    state.vx = 0
    state.vy = 200

    core.step(state, [], DT)
    expect(state.bricks[0]).toBe(false)
    expect(state.score).toBe(50)
    expect(state.hits).toBe(1)
  })

  it("wins when the last brick breaks", () => {
    const state = setup()
    state.bricks = state.bricks.map((_, index) => index === 0)
    state.ballX = 30
    state.ballY = 26
    state.vx = 0
    state.vy = 200

    core.step(state, [], DT)
    expect(state.phase).toBe("won")
    expect(core.score(state, { elapsedMs: 1_000, ticks: 60 }).ranked).toBe(true)
  })

  it("loses when the ball leaves the field", () => {
    const state = setup()
    state.ballY = state.height + 10
    state.vy = 200
    core.step(state, [], DT)
    expect(state.phase).toBe("lost")
  })

  it("ignores malformed inputs", () => {
    const state = setup()
    core.step(
      state,
      [
        null as unknown as { target: number },
        { target: Number.NaN },
        { target: Number.POSITIVE_INFINITY },
        { left: "yes" as unknown as boolean },
      ],
      DT,
    )
    expect(Number.isFinite(state.paddleX)).toBe(true)
    expect(Number.isFinite(state.ballX)).toBe(true)
    expect(Number.isFinite(state.ballY)).toBe(true)
  })

  it("wins at 1200 when the paddle tracks the ball", () => {
    const mode = meta.modes[0]!
    const inputs: Array<{ tick: number; input: { target: number } }> = []
    let state = core.create(5, mode)

    for (let tick = 0; tick < 36_000 && state.phase === "playing"; tick += 1) {
      const input = { target: state.ballX }
      inputs.push({ tick, input })
      state = core.step(state, [input], DT)
    }

    expect(state.phase).toBe("won")
    expect(state.score).toBe(meta.score.max)

    const result = playRealtime(core, meta, {
      seed: 5,
      mode,
      ticks: inputs.length,
      inputs,
    })
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(1_200)
  })

  it("verifies a realtime run", () => {
    const result = playRealtime(core, meta, {
      seed: 21,
      mode: meta.modes[0]!,
      ticks: 20_000,
      inputs: [],
    })

    expect(result.state.phase).toBe("lost")
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(result.score.value)
  })
})
