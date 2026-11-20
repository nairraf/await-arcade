import type { GameCore, Mode, Phase, Score } from "@await-arcade/contract"
import { generate } from "./generate"

/** The player's mark on a cell. */
export const MARK_EMPTY = 0
export const MARK_FILLED = 1
export const MARK_CROSSED = 2

export type NonogramMark =
  | typeof MARK_EMPTY
  | typeof MARK_FILLED
  | typeof MARK_CROSSED

/** A check is the only way to find out whether the board is right. */
export const MAX_CHECKS = 10

export interface NonogramState {
  readonly seed: number
  readonly modeId: string
  readonly width: number
  readonly height: number
  /** Row-major solution, `1` for filled and `0` for empty. */
  readonly solution: readonly number[]
  /** Run lengths beside each row, top to bottom. */
  readonly rowClues: readonly (readonly number[])[]
  /** Run lengths above each column, left to right. */
  readonly colClues: readonly (readonly number[])[]
  /**
   * Row-major player marks using `MARK_EMPTY`, `MARK_FILLED`, and
   * `MARK_CROSSED`. Crosses are an aid and never satisfy the solution.
   */
  draft: number[]
  /** Checks consumed, including the check that won the run. */
  checksUsed: number
  phase: Phase
}

export type NonogramInput =
  | {
      readonly type: "set"
      readonly x: number
      readonly y: number
      readonly mark: NonogramMark
    }
  | { readonly type: "clear" }
  | { readonly type: "check" }

function isMark(value: unknown): value is NonogramMark {
  return value === MARK_EMPTY || value === MARK_FILLED || value === MARK_CROSSED
}

function setCell(
  state: NonogramState,
  x: number,
  y: number,
  mark: NonogramMark,
): NonogramState {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    x >= state.width ||
    y < 0 ||
    y >= state.height ||
    !isMark(mark)
  ) {
    return state
  }

  const at = y * state.width + x
  if (state.draft[at] === mark) return state

  const draft = [...state.draft]
  draft[at] = mark
  return { ...state, draft }
}

function clearDraft(state: NonogramState): NonogramState {
  if (state.draft.every((mark) => mark === MARK_EMPTY)) return state
  return {
    ...state,
    draft: Array<number>(state.width * state.height).fill(MARK_EMPTY),
  }
}

function isSolved(state: NonogramState): boolean {
  for (let at = 0; at < state.solution.length; at += 1) {
    const shouldFill = state.solution[at] === 1
    const isFilled = state.draft[at] === MARK_FILLED
    if (shouldFill !== isFilled) return false
  }
  return true
}

function checkBoard(state: NonogramState): NonogramState {
  // The winning check still counts as the one check consumed; the first check
  // is free in the score curve.
  const checksUsed = state.checksUsed + 1

  if (isSolved(state)) {
    return { ...state, checksUsed, phase: "won" }
  }

  return {
    ...state,
    checksUsed,
    phase: checksUsed >= MAX_CHECKS ? "lost" : "playing",
  }
}

function apply(state: NonogramState, input: NonogramInput): NonogramState {
  if (typeof input !== "object" || input === null) return state
  if (state.phase !== "playing") return state

  switch (input.type) {
    case "set":
      return setCell(state, input.x, input.y, input.mark)
    case "clear":
      return clearDraft(state)
    case "check":
      return checkBoard(state)
    default:
      return state
  }
}

export const core: GameCore<NonogramState, NonogramInput> = {
  create(seed, mode: Mode): NonogramState {
    const puzzle = generate(seed, mode)

    return {
      seed,
      modeId: mode.id,
      width: puzzle.width,
      height: puzzle.height,
      solution: puzzle.solution,
      rowClues: puzzle.rowClues,
      colClues: puzzle.colClues,
      draft: Array<number>(puzzle.width * puzzle.height).fill(MARK_EMPTY),
      checksUsed: 0,
      phase: "playing",
    }
  },

  step(state, inputs) {
    if (!Array.isArray(inputs)) return state
    let next = state
    for (const input of inputs) {
      next = apply(next, input)
      if (next.phase !== "playing") break
    }
    return next
  },

  phase(state) {
    return state.phase
  },

  score(state): Score {
    const solved = state.phase === "won"
    // `checksUsed` includes the winning check. The first check is free, so only
    // the checks after it cost points: a clean solve is 1000, one failed check
    // then a win is 900, and nine misses then a win hits the 100-point floor.
    const failedChecks = Math.max(0, state.checksUsed - 1)
    const value = solved ? Math.min(1000, Math.max(100, 1000 - 100 * failedChecks)) : 0
    let filled = 0
    for (const mark of state.draft) {
      if (mark === MARK_FILLED) filled += 1
    }

    return {
      value,
      type: "higher",
      won: solved,
      ranked: solved,
      detail: {
        mode: state.modeId,
        width: state.width,
        height: state.height,
        checksUsed: state.checksUsed,
        solved,
        filled,
      },
    }
  },

  serialize(state) {
    return {
      mode: state.modeId,
      width: state.width,
      height: state.height,
      solution: [...state.solution],
      rowClues: state.rowClues.map((clue) => [...clue]),
      colClues: state.colClues.map((clue) => [...clue]),
      draft: [...state.draft],
      checksUsed: state.checksUsed,
      phase: state.phase,
    }
  },
}
