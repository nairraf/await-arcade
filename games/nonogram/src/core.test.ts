import { describe, expect, it } from "vitest"
import type { Replay } from "@await-arcade/contract"
import { playTurn, verifyReplay } from "@await-arcade/framework"
import {
  MARK_CROSSED,
  MARK_EMPTY,
  MARK_FILLED,
  MAX_CHECKS,
  core,
  type NonogramInput,
  type NonogramState,
} from "./core"
import {
  EMPTY,
  FALLBACK_BANK,
  FILLED,
  UNKNOWN,
  generate,
  propagateLine,
  solveGrid,
} from "./generate"
import { meta } from "./meta"
import fixture from "../replay.json"

const easy = meta.modes.find((mode) => mode.id === "easy")!
const hard = meta.modes.find((mode) => mode.id === "hard")!

function run(state: NonogramState, inputs: readonly NonogramInput[]): NonogramState {
  let next = state
  for (const input of inputs) {
    next = core.step(next, [input], 0)
    if (next.phase !== "playing") break
  }
  return next
}

/** Shortest wrapped cursor path from `from` to `target`. */
function moveTo(from: number, target: number, width: number, height: number): NonogramInput[] {
  const inputs: NonogramInput[] = []
  let cursor = from

  while (cursor !== target) {
    const x = cursor % width
    const y = Math.floor(cursor / width)
    const tx = target % width
    const ty = Math.floor(target / width)

    if (x !== tx) {
      const right = (tx - x + width) % width
      const left = width - right
      const nx = right <= left ? (x + 1) % width : (x - 1 + width) % width
      inputs.push({ type: "cursor", dx: right <= left ? 1 : -1, dy: 0 })
      cursor = y * width + nx
    } else {
      const down = (ty - y + height) % height
      const up = height - down
      const ny = down <= up ? (y + 1) % height : (y - 1 + height) % height
      inputs.push({ type: "cursor", dx: 0, dy: down <= up ? 1 : -1 })
      cursor = ny * width + x
    }
  }

  return inputs
}

/** Fill every solution cell, leaving everything else empty. */
function solutionInputs(state: NonogramState): NonogramInput[] {
  const inputs: NonogramInput[] = []
  let cursor = 0
  for (let index = 0; index < state.solution.length; index += 1) {
    if (state.solution[index] !== 1) continue
    inputs.push(...moveTo(cursor, index, state.width, state.height))
    cursor = index
    inputs.push({ type: "mark" })
  }
  return inputs
}

function wrongFillInputs(state: NonogramState): NonogramInput[] {
  const index = state.solution.findIndex((cell) => cell === 0)
  if (index < 0) throw new Error("test needs an empty solution cell")
  return [...moveTo(0, index, state.width, state.height), { type: "mark" }]
}

function solvedGrid(puzzle: {
  rowClues: readonly (readonly number[])[]
  colClues: readonly (readonly number[])[]
  solution: readonly number[]
}): number[] {
  const result = solveGrid(puzzle.rowClues, puzzle.colClues)
  expect(result.solved).toBe(true)
  expect(result.contradiction).toBe(false)
  return result.grid.map((cell) => (cell === FILLED ? 1 : 0))
}

describe("nonogram line solver", () => {
  it("deduces the overlap of a single long block", () => {
    expect(propagateLine([3], [UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN])).toEqual([
      UNKNOWN,
      UNKNOWN,
      FILLED,
      UNKNOWN,
      UNKNOWN,
    ])
  })

  it("leaves the classic two-block line ambiguous", () => {
    // Two one-cell blocks in four cells can sit at (0,2), (0,3), or (1,3):
    // no cell is forced, so the line stays entirely unknown.
    expect(propagateLine([1, 1], [UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN])).toEqual([
      UNKNOWN,
      UNKNOWN,
      UNKNOWN,
      UNKNOWN,
    ])

    // A 4x4 permutation matrix is the same ambiguity in two dimensions.
    const stalled = solveGrid(
      [[1], [1], [1], [1]],
      [[1], [1], [1], [1]],
    )
    expect(stalled.solved).toBe(false)
    expect(stalled.grid.every((cell) => cell === UNKNOWN)).toBe(true)
  })

  it("resolves a fully determined grid without guessing", () => {
    const solved = solveGrid(
      [[3], [3], [3]],
      [[3], [3], [3]],
    )
    expect(solved.solved).toBe(true)
    expect(solved.grid).toEqual(Array<number>(9).fill(FILLED))
  })

  it("reports contradictory clues instead of inventing a solution", () => {
    expect(propagateLine([3], [UNKNOWN, UNKNOWN])).toBeNull()

    const bad = solveGrid(
      [[2], [2]],
      [[1], [1]],
    )
    expect(bad.solved).toBe(false)
    expect(bad.contradiction).toBe(true)
  })

  it("keeps known cells that a partial placement agrees with", () => {
    expect(propagateLine([2], [FILLED, UNKNOWN, UNKNOWN, UNKNOWN])).toEqual([
      FILLED,
      FILLED,
      EMPTY,
      EMPTY,
    ])
  })
})

describe("nonogram generation", () => {
  it("is deterministic and seed-sensitive in both modes", () => {
    for (const mode of [easy, hard]) {
      const left = core.serialize(core.create(1234, mode))
      expect(core.serialize(core.create(1234, mode))).toEqual(left)
      expect(core.serialize(core.create(1235, mode))).not.toEqual(left)
    }

    expect(core.create(7, easy).width).toBe(6)
    expect(core.create(7, easy).height).toBe(6)
    expect(core.create(7, hard).width).toBe(10)
    expect(core.create(7, hard).height).toBe(10)
  })

  it("produces logic-solvable, unique puzzles for 40 seeds per mode", () => {
    for (const mode of [easy, hard]) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const puzzle = generate(seed, mode)
        expect(puzzle.width, `${mode.id} seed ${seed}`).toBe(mode.id === "easy" ? 6 : 10)
        expect(puzzle.rowClues).toHaveLength(puzzle.height)
        expect(puzzle.colClues).toHaveLength(puzzle.width)
        expect(solvedGrid(puzzle), `${mode.id} seed ${seed}`).toEqual([...puzzle.solution])

        const { width, height, solution } = puzzle
        const rowFilled = (y: number): boolean =>
          solution.slice(y * width, (y + 1) * width).some((cell) => cell === 1)
        const colFilled = (x: number): boolean =>
          Array.from({ length: height }, (_, y) => solution[y * width + x]).some((cell) => cell === 1)
        expect(rowFilled(0), `${mode.id} seed ${seed} top row`).toBe(true)
        expect(rowFilled(height - 1), `${mode.id} seed ${seed} bottom row`).toBe(true)
        expect(colFilled(0), `${mode.id} seed ${seed} left column`).toBe(true)
        expect(colFilled(width - 1), `${mode.id} seed ${seed} right column`).toBe(true)
      }
    }
  })

  it("falls back to a verified, solvable puzzle when the cap is exhausted", () => {
    for (const mode of [easy, hard]) {
      const puzzle = generate(20260419, mode, { candidateCap: 0 })
      expect(puzzle.width).toBe(mode.id === "easy" ? 6 : 10)
      expect(puzzle.height).toBe(mode.id === "easy" ? 6 : 10)
      expect(solvedGrid(puzzle)).toEqual([...puzzle.solution])
    }
  })

  it("verifies every fallback entry with the same solver", () => {
    for (const [id, bank] of Object.entries(FALLBACK_BANK)) {
      const width = id === "easy" ? 6 : 10
      const height = id === "easy" ? 6 : 10
      for (const solution of bank) {
        expect(solution).toHaveLength(width * height)
        const clues = solveGrid(
          Array.from({ length: height }, (_, y) => {
            const row = solution.slice(y * width, (y + 1) * width)
            const clue: number[] = []
            let run = 0
            for (const cell of row) {
              if (cell === 1) run += 1
              else if (run > 0) {
                clue.push(run)
                run = 0
              }
            }
            if (run > 0) clue.push(run)
            return clue
          }),
          Array.from({ length: width }, (_, x) => {
            const column = Array.from({ length: height }, (_, y) => solution[y * width + x] ?? 0)
            const clue: number[] = []
            let run = 0
            for (const cell of column) {
              if (cell === 1) run += 1
              else if (run > 0) {
                clue.push(run)
                run = 0
              }
            }
            if (run > 0) clue.push(run)
            return clue
          }),
        )
        expect(clues.solved).toBe(true)
        expect(clues.grid.map((cell) => (cell === FILLED ? 1 : 0))).toEqual([...solution])
      }
    }
  })
})

describe("nonogram rules and scoring", () => {
  it("wins on the first check and scores 1000", () => {
    const fresh = core.create(42, easy)
    const inputs = [...solutionInputs(fresh), { type: "check" } satisfies NonogramInput]
    const result = playTurn(core, meta, { seed: 42, mode: easy, inputs, durationMs: 30_000 })

    expect(result.state.phase).toBe("won")
    expect(result.state.checksUsed).toBe(1)
    expect(result.score).toMatchObject({
      value: 1000,
      type: "higher",
      won: true,
      ranked: true,
    })
    expect(result.score.detail).toMatchObject({
      mode: "easy",
      width: 6,
      height: 6,
      checksUsed: 1,
      solved: true,
      filled: fresh.solution.filter((cell) => cell === 1).length,
    })
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(1000)
  })

  it("costs 100 for one failed check before the winning check", () => {
    const fresh = core.create(50, easy)
    const inputs: NonogramInput[] = [
      { type: "check" },
      ...solutionInputs(fresh),
      { type: "check" },
    ]
    const result = playTurn(core, meta, { seed: 50, mode: easy, inputs, durationMs: 40_000 })

    expect(result.state.phase).toBe("won")
    expect(result.state.checksUsed).toBe(2)
    expect(result.score.value).toBe(900)
    expect(result.score.detail).toMatchObject({ checksUsed: 2, solved: true })
    expect(result.verified.ok).toBe(true)
  })

  it("wins on the tenth check after nine misses and scores the 100-point floor", () => {
    const fresh = core.create(51, hard)
    const inputs: NonogramInput[] = [
      ...Array.from({ length: MAX_CHECKS - 1 }, () => ({ type: "check" }) as NonogramInput),
      ...solutionInputs(fresh),
      { type: "check" },
    ]
    const result = playTurn(core, meta, { seed: 51, mode: hard, inputs, durationMs: 90_000 })

    expect(result.state.phase).toBe("won")
    expect(result.state.checksUsed).toBe(MAX_CHECKS)
    expect(result.score.value).toBe(100)
    expect(result.score.ranked).toBe(true)
    expect(result.score.detail).toMatchObject({
      mode: "hard",
      width: 10,
      height: 10,
      checksUsed: MAX_CHECKS,
      solved: true,
    })
    expect(result.verified.ok).toBe(true)
    expect(result.verified.score?.value).toBe(100)
  })

  it("consumes a failed check without exposing which cells were wrong", () => {
    const fresh = core.create(43, hard)
    let state = run(fresh, wrongFillInputs(fresh))
    expect(state.checksUsed).toBe(0)

    state = core.step(state, [{ type: "check" }], 0)
    expect(state.phase).toBe("playing")
    expect(state.checksUsed).toBe(1)

    const score = core.score(state, { elapsedMs: 0, ticks: 1 })
    expect(score.won).toBe(false)
    expect(score.ranked).toBe(false)
    expect(score.detail).toEqual({
      mode: "hard",
      width: 10,
      height: 10,
      checksUsed: 1,
      solved: false,
      filled: 1,
    })

    const serialized = core.serialize(state) as Record<string, unknown>
    expect(Object.keys(serialized).sort()).toEqual(
      [
        "checksUsed",
        "colClues",
        "cursor",
        "draft",
        "height",
        "mode",
        "phase",
        "rowClues",
        "solution",
        "width",
      ].sort(),
    )
    expect(JSON.stringify(serialized)).not.toContain("wrong")
    expect(JSON.stringify(serialized)).not.toContain("feedback")
  })

  it("loses after ten failed checks with no leaderboard eligibility", () => {
    let state = core.create(44, easy)
    for (let check = 0; check < MAX_CHECKS; check += 1) {
      state = core.step(state, [{ type: "check" }], 0)
    }

    expect(state.phase).toBe("lost")
    expect(state.checksUsed).toBe(MAX_CHECKS)
    const score = core.score(state, { elapsedMs: 0, ticks: MAX_CHECKS })
    expect(score).toMatchObject({ value: 0, won: false, ranked: false, type: "higher" })
    expect(score.detail).toMatchObject({ checksUsed: MAX_CHECKS, solved: false })

    const result = playTurn(core, meta, {
      seed: 44,
      mode: easy,
      inputs: Array.from({ length: MAX_CHECKS }, () => ({ type: "check" }) as NonogramInput),
      durationMs: 10_000,
    })
    expect(result.state.phase).toBe("lost")
    expect(result.verified.ok).toBe(false)
    expect(result.verified.reason).toContain("not eligible")
  })

  it("still wins when only empty solution cells are crossed", () => {
    const fresh = core.create(52, easy)
    const emptyIndex = fresh.solution.findIndex((cell) => cell === 0)
    if (emptyIndex < 0) throw new Error("test needs an empty solution cell")

    let state = run(fresh, solutionInputs(fresh))
    state = run(state, [
      ...moveTo(state.cursor, emptyIndex, state.width, state.height),
      { type: "mark" },
      { type: "mark" },
    ])
    expect(state.draft[emptyIndex]).toBe(MARK_CROSSED)

    state = core.step(state, [{ type: "check" }], 0)
    expect(state.phase).toBe("won")
    expect(state.checksUsed).toBe(1)
    expect(core.score(state, { elapsedMs: 0, ticks: 0 }).value).toBe(1000)
  })

  it("fails when a required solution cell is crossed", () => {
    const fresh = core.create(53, hard)
    const requiredIndex = fresh.solution.findIndex((cell) => cell === 1)
    if (requiredIndex < 0) throw new Error("test needs a filled solution cell")

    let state = run(fresh, solutionInputs(fresh))
    state = run(state, [
      ...moveTo(state.cursor, requiredIndex, state.width, state.height),
      { type: "mark" },
    ])
    expect(state.draft[requiredIndex]).toBe(MARK_CROSSED)

    state = core.step(state, [{ type: "check" }], 0)
    expect(state.phase).toBe("playing")
    expect(state.checksUsed).toBe(1)
    expect(core.score(state, { elapsedMs: 0, ticks: 0 })).toMatchObject({
      value: 0,
      won: false,
      ranked: false,
    })
  })

  it("stops a batch as soon as the winning check resolves", () => {
    const fresh = core.create(54, hard)
    const solved = run(fresh, solutionInputs(fresh))
    const before = core.serialize(solved) as { draft: number[] }

    const next = core.step(
      solved,
      [
        { type: "check" },
        { type: "mark" },
        { type: "cursor", dx: 1, dy: 0 },
      ],
      0,
    )

    expect(next.phase).toBe("won")
    expect(next.checksUsed).toBe(1)
    expect(next.draft).toEqual(before.draft)
    expect(next.cursor).toBe(solved.cursor)
  })

  it("cycles marks empty → filled → crossed → empty and ignores zero moves", () => {
    let state = core.create(45, easy)
    expect(state.cursor).toBe(0)
    expect(state.draft[0]).toBe(MARK_EMPTY)

    state = core.step(state, [{ type: "cursor", dx: -1, dy: 0 }], 0)
    expect(state.cursor).toBe(state.width - 1)
    state = core.step(state, [{ type: "cursor", dx: 1, dy: 0 }], 0)
    expect(state.cursor).toBe(0)
    state = core.step(state, [{ type: "cursor", dx: 0, dy: -1 }], 0)
    expect(state.cursor).toBe((state.height - 1) * state.width)
    state = core.step(state, [{ type: "cursor", dx: 0, dy: 1 }], 0)
    expect(state.cursor).toBe(0)

    const before = core.serialize(state)
    state = core.step(state, [{ type: "cursor", dx: 0, dy: 0 }], 0)
    expect(core.serialize(state)).toEqual(before)

    state = core.step(state, [{ type: "mark" }], 0)
    expect(state.draft[0]).toBe(MARK_FILLED)
    state = core.step(state, [{ type: "mark" }], 0)
    expect(state.draft[0]).toBe(MARK_CROSSED)
    state = core.step(state, [{ type: "mark" }], 0)
    expect(state.draft[0]).toBe(MARK_EMPTY)
    expect(state.draft.slice(1).every((mark) => mark === MARK_EMPTY)).toBe(true)
  })

  it("treats malformed, unknown, and non-finite inputs as no-ops", () => {
    const fresh = core.create(46, hard)
    const before = core.serialize(fresh)
    const bad: unknown[] = [
      null,
      undefined,
      0,
      "cursor",
      [],
      { type: "nope" },
      { type: "cursor", dx: Number.NaN, dy: 0 },
      { type: "cursor", dx: 0, dy: Number.POSITIVE_INFINITY },
      { type: "cursor", dx: -1, dy: Number.NEGATIVE_INFINITY },
      { type: "cursor", dx: 2, dy: 0 },
      { type: "cursor", dx: 0, dy: -2 },
      { type: "cursor", dx: 0, dy: 0 },
      { type: "cursor" },
      { type: "cursor", dx: "1", dy: 0 },
    ]

    let state = fresh
    for (const input of bad) {
      state = core.step(state, [input as NonogramInput], 0)
      expect(core.serialize(state)).toEqual(before)
    }

    state = core.step(fresh, null as unknown as NonogramInput[], 0)
    expect(core.serialize(state)).toEqual(before)
    state = core.step(fresh, "mark" as unknown as NonogramInput[], 0)
    expect(core.serialize(state)).toEqual(before)
  })

  it("accepts no input after a terminal phase", () => {
    const fresh = core.create(47, easy)
    const won = run(fresh, [...solutionInputs(fresh), { type: "check" }])
    expect(won.phase).toBe("won")
    const frozen = core.serialize(won)

    const after = core.step(
      won,
      [
        { type: "cursor", dx: 1, dy: 0 },
        { type: "mark" },
        { type: "check" },
      ],
      0,
    )
    expect(core.serialize(after)).toEqual(frozen)

    let lost = core.create(48, easy)
    for (let check = 0; check < MAX_CHECKS; check += 1) {
      lost = core.step(lost, [{ type: "check" }], 0)
    }
    const lostBefore = core.serialize(lost)
    lost = core.step(lost, [{ type: "mark" }, { type: "check" }], 0)
    expect(core.serialize(lost)).toEqual(lostBefore)
  })

  it("serializes every play-affecting field and round-trips it", () => {
    let state = core.create(49, hard)
    state = run(state, [...moveTo(0, 7, state.width, state.height), { type: "mark" }])
    state = core.step(state, [{ type: "check" }], 0)

    const serialized = core.serialize(state) as {
      mode: string
      width: number
      height: number
      solution: number[]
      rowClues: number[][]
      colClues: number[][]
      draft: number[]
      cursor: number
      checksUsed: number
      phase: NonogramState["phase"]
    }

    expect(serialized).toMatchObject({
      mode: "hard",
      width: 10,
      height: 10,
      cursor: 7,
      checksUsed: 1,
      phase: "playing",
    })
    expect(serialized.solution).toEqual([...state.solution])
    expect(serialized.rowClues).toEqual(state.rowClues.map((clue) => [...clue]))
    expect(serialized.colClues).toEqual(state.colClues.map((clue) => [...clue]))
    expect(serialized.draft).toEqual([...state.draft])

    const clone: NonogramState = {
      seed: state.seed,
      modeId: serialized.mode,
      width: serialized.width,
      height: serialized.height,
      solution: serialized.solution,
      rowClues: serialized.rowClues,
      colClues: serialized.colClues,
      draft: [...serialized.draft],
      cursor: serialized.cursor,
      checksUsed: serialized.checksUsed,
      phase: serialized.phase,
    }
    expect(core.serialize(clone)).toEqual(serialized)
  })

  it("declares the beta-3 score contract", () => {
    expect(meta.score).toEqual({ type: "higher", min: 0, max: 1000, unit: "points" })
    expect(meta.leaderboard).toBe("replay")
    expect(meta.kind).toBe("turn")
    expect(meta.version).toBe("1.0.0")
    expect(meta.modes.map((mode) => mode.id)).toEqual(["easy", "hard"])
    expect(meta.modes.every((mode) => mode.ranked !== false)).toBe(true)
    expect(meta.controls.map((control) => control.keys)).toContain("X / Cross")
    expect(meta.controls.map((control) => control.keys)).toContain("Enter / Check")
  })
})

describe("nonogram replay fixture", () => {
  it("verifies the committed 900-point two-check hard win", () => {
    const replay = fixture as unknown as Replay<NonogramInput>
    const result = verifyReplay(core, meta, replay)

    expect(result.ok).toBe(true)
    expect(result.score).toMatchObject({ value: 900, won: true, ranked: true })
    expect(result.score?.detail).toMatchObject({
      mode: "hard",
      width: 10,
      height: 10,
      checksUsed: 2,
      solved: true,
    })

    const state = result.state as {
      checksUsed: number
      phase: string
      width: number
      height: number
    }
    expect(state.phase).toBe("won")
    expect(state.checksUsed).toBe(2)
    expect(state.width).toBe(10)
    expect(state.height).toBe(10)
    expect(replay.modeId).toBe("hard")
    expect(replay.inputs.filter((event) => event.input.type === "check")).toHaveLength(2)
  })
})
