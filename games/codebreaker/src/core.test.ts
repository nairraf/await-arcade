import { describe, expect, it } from "vitest"
import type { Replay } from "@await-arcade/contract"
import { playTurn, verifyReplay } from "@await-arcade/framework"
import {
  MAX_ATTEMPTS,
  SYMBOLS,
  core,
  feedback,
  type CodebreakerInput,
  type CodebreakerState,
} from "./core"
import { meta } from "./meta"
import fixture from "../replay.json"

const classic = meta.modes.find((mode) => mode.id === "classic")!
const expert = meta.modes.find((mode) => mode.id === "expert")!

/** Build one complete guess from the empty draft, ending with submit. */
function guessInputs(slots: number, guess: readonly number[]): CodebreakerInput[] {
  const inputs: CodebreakerInput[] = []
  let cursor = 0

  for (let index = 0; index < guess.length; index += 1) {
    while (cursor !== index) {
      inputs.push({ type: "slot", delta: 1 })
      cursor = (cursor + 1) % slots
    }

    const target = guess[index]!
    const up = target + 1
    const down = 1 + (SYMBOLS - 1 - target)
    if (up <= down) {
      for (let step = 0; step < up; step += 1) inputs.push({ type: "cycle", delta: 1 })
    } else {
      for (let step = 0; step < down; step += 1) inputs.push({ type: "cycle", delta: -1 })
    }
  }

  inputs.push({ type: "submit" })
  return inputs
}

function run(state: CodebreakerState, inputs: readonly CodebreakerInput[]): CodebreakerState {
  let next = state
  for (const input of inputs) {
    next = core.step(next, [input], 0)
    if (next.phase !== "playing") break
  }
  return next
}

/** A row that differs in every slot from the secret, so it can never win. */
function wrongGuess(secret: readonly number[], slots: number): number[] {
  return Array.from({ length: slots }, (_, index) => ((secret[index] ?? 0) + 1) % SYMBOLS)
}

function losingInputs(secret: readonly number[], slots: number): CodebreakerInput[] {
  const inputs: CodebreakerInput[] = []
  const wrong = wrongGuess(secret, slots)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    inputs.push(...guessInputs(slots, wrong))
  }
  return inputs
}

describe("codebreaker feedback", () => {
  it("counts exact hits before near misses on repeated symbols", () => {
    expect(feedback([0, 0, 1, 2], [0, 2, 0, 0])).toEqual({ exact: 1, near: 2 })
    expect(feedback([0, 0, 1, 2], [0, 0, 2, 1])).toEqual({ exact: 2, near: 2 })
    expect(feedback([3, 3, 3, 3], [3, 0, 3, 0])).toEqual({ exact: 2, near: 0 })
    expect(feedback([0, 0, 0, 0], [1, 1, 1, 0])).toEqual({ exact: 1, near: 0 })
    expect(feedback([0, 1, 0, 1], [1, 0, 1, 0])).toEqual({ exact: 0, near: 4 })
  })

  it("handles the all-exact and no-overlap extremes", () => {
    expect(feedback([4, 3, 2, 1], [4, 3, 2, 1])).toEqual({ exact: 4, near: 0 })
    expect(feedback([0, 0, 0, 0], [1, 1, 1, 1])).toEqual({ exact: 0, near: 0 })
  })
})

describe("codebreaker core", () => {
  it("builds a seeded secret with the mode's slot count", () => {
    const four = core.create(7, classic)
    const five = core.create(7, expert)

    expect(four.slots).toBe(4)
    expect(five.slots).toBe(5)
    expect(four.secret).toHaveLength(4)
    expect(five.secret).toHaveLength(5)
    for (const symbol of [...four.secret, ...five.secret]) {
      expect(symbol).toBeGreaterThanOrEqual(0)
      expect(symbol).toBeLessThan(SYMBOLS)
    }
  })

  it("derives the secret from the seed and repeats it exactly", () => {
    const left = core.serialize(core.create(1234, classic))
    const right = core.serialize(core.create(1234, classic))
    expect(left).toEqual(right)
    expect(core.serialize(core.create(1235, classic))).not.toEqual(left)
  })

  it("wraps the slot cursor and cycles symbols in both directions", () => {
    let state = core.create(1, classic)
    expect(state.cursor).toBe(0)

    state = core.step(state, [{ type: "slot", delta: -1 }], 0)
    expect(state.cursor).toBe(state.slots - 1)
    state = core.step(state, [{ type: "slot", delta: 1 }], 0)
    expect(state.cursor).toBe(0)

    state = core.step(state, [{ type: "cycle", delta: -1 }], 0)
    expect(state.draft[0]).toBe(SYMBOLS - 1)
    state = core.step(state, [{ type: "cycle", delta: 1 }], 0)
    expect(state.draft[0]).toBe(0)
    state = core.step(state, [{ type: "cycle", delta: -1 }], 0)
    expect(state.draft[0]).toBe(SYMBOLS - 1)
  })

  it("seeds an empty slot with A going forward and E going backward", () => {
    const forward = core.step(core.create(10, classic), [{ type: "cycle", delta: 1 }], 0)
    expect(forward.draft[0]).toBe(0)

    const backward = core.step(core.create(10, classic), [{ type: "cycle", delta: -1 }], 0)
    expect(backward.draft[0]).toBe(SYMBOLS - 1)
  })

  it("clears only the active slot", () => {
    let state = core.create(2, classic)
    state = core.step(
      state,
      [
        { type: "cycle", delta: 1 },
        { type: "slot", delta: 1 },
        { type: "cycle", delta: 1 },
      ],
      0,
    )
    expect(state.draft).toEqual([0, 0, null, null])

    state = core.step(state, [{ type: "clear" }], 0)
    expect(state.draft).toEqual([0, null, null, null])

    const before = core.serialize(state)
    state = core.step(state, [{ type: "clear" }], 0)
    expect(core.serialize(state)).toEqual(before)
  })

  it("treats submit on an incomplete row as a no-op", () => {
    const fresh = core.create(3, classic)
    let state = core.step(fresh, [{ type: "cycle", delta: 1 }], 0)
    const before = core.serialize(state)

    state = core.step(state, [{ type: "submit" }], 0)
    expect(core.serialize(state)).toEqual(before)
    expect(state.attemptsUsed).toBe(0)
    expect(state.guesses).toHaveLength(0)
  })

  it("ignores unknown actions and invalid deltas", () => {
    const fresh = core.create(4, classic)
    const before = core.serialize(fresh)

    let state = core.step(fresh, [{ type: "nope" } as unknown as CodebreakerInput], 0)
    state = core.step(state, [{ type: "slot", delta: 2 }], 0)
    state = core.step(state, [{ type: "cycle", delta: 0 }], 0)
    state = core.step(state, [null as unknown as CodebreakerInput], 0)

    expect(core.serialize(state)).toEqual(before)
  })

  it("submits a filled row, records feedback, and clears the draft", () => {
    const fresh = core.create(5, classic)
    const state = run(fresh, guessInputs(fresh.slots, fresh.secret))

    expect(state.attemptsUsed).toBe(1)
    expect(state.guesses).toHaveLength(1)
    expect(state.guesses[0]!.exact).toBe(fresh.slots)
    expect(state.guesses[0]!.near).toBe(0)
    expect(state.draft).toEqual([null, null, null, null])
    expect(state.cursor).toBe(0)
    expect(state.phase).toBe("won")
  })

  it("keeps submitted guesses immutable", () => {
    const fresh = core.create(6, classic)
    const wrong = wrongGuess(fresh.secret, fresh.slots)
    let state = run(fresh, guessInputs(fresh.slots, wrong))
    const first = state.guesses[0]!

    state = run(state, guessInputs(fresh.slots, fresh.secret))
    expect(state.guesses).toHaveLength(2)
    expect(state.guesses[0]).toEqual(first)
    expect(state.guesses[1]!.exact).toBe(fresh.slots)
  })

  it("does not mutate the state passed to step", () => {
    const fresh = core.create(6, classic)
    const wrong = wrongGuess(fresh.secret, fresh.slots)
    const state = run(fresh, guessInputs(fresh.slots, wrong))

    const draft = [...state.draft]
    const guesses = JSON.stringify(state.guesses)
    const before = JSON.stringify(core.serialize(state))

    const next = core.step(state, guessInputs(fresh.slots, fresh.secret), 0)

    expect(state.draft).toEqual(draft)
    expect(JSON.stringify(state.guesses)).toBe(guesses)
    expect(state.guesses).toHaveLength(1)
    expect(state.attemptsUsed).toBe(1)
    expect(state.cursor).toBe(0)
    expect(state.phase).toBe("playing")
    expect(JSON.stringify(core.serialize(state))).toBe(before)

    expect(next.draft).not.toBe(state.draft)
    expect(next.guesses).not.toBe(state.guesses)
    expect(next.phase).toBe("won")
  })

  it("does not accept input after the run ends", () => {
    const fresh = core.create(8, classic)
    const won = run(fresh, guessInputs(fresh.slots, fresh.secret))
    const frozen = core.serialize(won)

    const after = core.step(
      won,
      [
        { type: "slot", delta: 1 },
        { type: "cycle", delta: 1 },
        { type: "clear" },
        { type: "submit" },
      ],
      0,
    )
    expect(core.serialize(after)).toEqual(frozen)
    expect(core.phase(won)).toBe("won")
  })

  it("loses on the tenth failed attempt", () => {
    const fresh = core.create(9, classic)
    const wrong = wrongGuess(fresh.secret, fresh.slots)
    const nine: CodebreakerInput[] = []
    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
      nine.push(...guessInputs(fresh.slots, wrong))
    }

    let state = run(fresh, nine)
    expect(state.phase).toBe("playing")
    expect(state.attemptsUsed).toBe(MAX_ATTEMPTS - 1)

    state = run(state, guessInputs(fresh.slots, wrong))
    expect(state.phase).toBe("lost")
    expect(state.attemptsUsed).toBe(MAX_ATTEMPTS)
    expect(state.guesses).toHaveLength(MAX_ATTEMPTS)

    const frozen = core.serialize(state)
    state = core.step(state, [{ type: "submit" }], 0)
    expect(core.serialize(state)).toEqual(frozen)
  })

  it("halts a multi-input step as soon as the run resolves", () => {
    const fresh = core.create(10, classic)
    const trailing: CodebreakerInput = { type: "cycle", delta: 1 }

    const won = core.step(fresh, [...guessInputs(fresh.slots, fresh.secret), trailing], 0)
    expect(won.phase).toBe("won")
    expect(won.guesses).toHaveLength(1)
    expect(won.draft).toEqual([null, null, null, null])

    const lost = core.step(fresh, [...losingInputs(fresh.secret, fresh.slots), trailing], 0)
    expect(lost.phase).toBe("lost")
    expect(lost.guesses).toHaveLength(MAX_ATTEMPTS)
    expect(lost.draft).toEqual([null, null, null, null])
  })
})

describe("codebreaker scoring and replays", () => {
  it("scores a first-guess win at the 1000-point ceiling", () => {
    const fresh = core.create(42, classic)
    const inputs = guessInputs(fresh.slots, fresh.secret)
    const result = playTurn(core, meta, { seed: 42, mode: classic, inputs, durationMs: 5_000 })

    expect(result.state.phase).toBe("won")
    expect(result.score).toMatchObject({
      value: 1000,
      type: "higher",
      won: true,
      ranked: true,
    })
    expect(result.score.detail).toMatchObject({
      mode: "classic",
      slots: 4,
      attemptsUsed: 1,
      solved: true,
    })
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(1000)
  })

  it("decays the score by 100 per extra attempt", () => {
    const fresh = core.create(43, expert)
    const wrong = wrongGuess(fresh.secret, fresh.slots)
    const inputs = [
      ...guessInputs(fresh.slots, wrong),
      ...guessInputs(fresh.slots, wrong),
      ...guessInputs(fresh.slots, fresh.secret),
    ]
    const result = playTurn(core, meta, { seed: 43, mode: expert, inputs, durationMs: 9_000 })

    expect(result.state.phase).toBe("won")
    expect(result.state.attemptsUsed).toBe(3)
    expect(result.score.value).toBe(800)
    expect(result.score.ranked).toBe(true)
    expect(result.verified.ok).toBe(true)
    expect(result.score.detail).toMatchObject({ mode: "expert", slots: 5, attemptsUsed: 3, solved: true })
  })

  it("still wins when the code lands on the final attempt", () => {
    const fresh = core.create(45, classic)
    const wrong = wrongGuess(fresh.secret, fresh.slots)
    const inputs: CodebreakerInput[] = []
    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
      inputs.push(...guessInputs(fresh.slots, wrong))
    }
    inputs.push(...guessInputs(fresh.slots, fresh.secret))

    const result = playTurn(core, meta, { seed: 45, mode: classic, inputs, durationMs: 60_000 })
    expect(result.state.phase).toBe("won")
    expect(result.state.attemptsUsed).toBe(MAX_ATTEMPTS)
    expect(result.score.value).toBe(100)
    expect(result.verified.ok).toBe(true)
  })

  it("scores a loss at zero and leaves the run unranked", () => {
    const fresh = core.create(44, classic)
    const inputs = losingInputs(fresh.secret, fresh.slots)
    const result = playTurn(core, meta, { seed: 44, mode: classic, inputs, durationMs: 30_000 })

    expect(result.state.phase).toBe("lost")
    expect(result.state.attemptsUsed).toBe(MAX_ATTEMPTS)
    expect(result.score).toMatchObject({ value: 0, type: "higher", won: false, ranked: false })
    expect(result.score.detail).toMatchObject({ mode: "classic", slots: 4, attemptsUsed: 10, solved: false })
    expect(result.verified.ok).toBe(false)
    expect(result.verified.reason).toContain("not eligible")
  })

  it("declares a bounded score curve in metadata", () => {
    expect(meta.score).toEqual({ type: "higher", min: 0, max: 1000, unit: "points" })
    expect(meta.modes.map((mode) => mode.id)).toEqual(["classic", "expert"])
  })

  it("is byte-identical for the same seed and inputs", () => {
    const fresh = core.create(77, expert)
    const inputs = [
      ...guessInputs(fresh.slots, wrongGuess(fresh.secret, fresh.slots)),
      ...guessInputs(fresh.slots, fresh.secret),
    ]

    const left = playTurn(core, meta, { seed: 77, mode: expert, inputs, durationMs: 12_000 })
    const right = playTurn(core, meta, { seed: 77, mode: expert, inputs, durationMs: 12_000 })

    expect(JSON.stringify(core.serialize(left.state))).toBe(JSON.stringify(core.serialize(right.state)))
    expect(left.replay.stateHash).toBe(right.replay.stateHash)
    expect(left.score).toEqual(right.score)
  })

  it("verifies the recorded replay fixture", () => {
    const replay = fixture as unknown as Replay<CodebreakerInput>
    const result = verifyReplay(core, meta, replay)

    expect(result.ok).toBe(true)
    expect(result.score?.won).toBe(true)
    expect(result.score?.ranked).toBe(true)
    expect(result.score?.value).toBeGreaterThanOrEqual(meta.score.min)
    expect(result.score?.value).toBeLessThanOrEqual(meta.score.max)
  })
})
