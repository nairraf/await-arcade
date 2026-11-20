import type { GameCore, Mode, Phase, Score, ScoreContext } from "@await-arcade/contract"
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
export const MAX_SCORE = 10_000
export const WIN_FLOOR = 100
export const FAILED_CHECK_PENALTY = 250
export const UNDONE_FILL_PENALTY = 25
export const CLEAR_BOARD_PENALTY = 100

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
  /** Deterministic base ceiling derived from board size, solver depth, and clue runs. */
  readonly complexity: number
  /**
   * Row-major player marks using `MARK_EMPTY`, `MARK_FILLED`, and
   * `MARK_CROSSED`. Crosses are an aid and never satisfy the solution.
   */
  draft: number[]
  /** Checks consumed, including the check that won the run. */
  checksUsed: number
  /** Number of filled cells erased or overwritten before solving. */
  undoneFills: number
  /** Number of non-empty board wipes via Clear board. */
  clearsUsed: number
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

export function complexityFor(
  width: number,
  height: number,
  rowClues: readonly (readonly number[])[],
  colClues: readonly (readonly number[])[],
  iterations: number,
): number {
  const cells = width * height
  let totalRuns = 0
  for (const clue of rowClues) totalRuns += clue.length
  for (const clue of colClues) totalRuns += clue.length
  const iterWeight = cells >= 100 ? 160 : 120
  return cells * 15 + Math.max(1, iterations) * iterWeight + totalRuns * 25
}

export function parDurationMs(modeId: string): number {
  return modeId === "hard" ? 900_000 : 180_000
}

export function timeBonusFor(baseScore: number, modeId: string, elapsedMs: number): number {
  if (baseScore <= 0) return 0
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const parMs = parDurationMs(modeId)
  return Math.round(baseScore * 0.25 * (parMs / (parMs + safeElapsed)))
}

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
  const previous = state.draft[at]
  if (previous === mark) return state

  const draft = [...state.draft]
  draft[at] = mark
  const undone = previous === MARK_FILLED && mark !== MARK_FILLED ? 1 : 0
  return {
    ...state,
    draft,
    undoneFills: state.undoneFills + undone,
  }
}

function clearDraft(state: NonogramState): NonogramState {
  if (state.draft.every((mark) => mark === MARK_EMPTY)) return state
  let clearedFills = 0
  for (const mark of state.draft) {
    if (mark === MARK_FILLED) clearedFills += 1
  }
  return {
    ...state,
    draft: Array<number>(state.width * state.height).fill(MARK_EMPTY),
    undoneFills: state.undoneFills + clearedFills,
    clearsUsed: state.clearsUsed + 1,
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
  // is free in the precision score curve.
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
    const complexity = complexityFor(
      puzzle.width,
      puzzle.height,
      puzzle.rowClues,
      puzzle.colClues,
      puzzle.iterations,
    )

    return {
      seed,
      modeId: mode.id,
      width: puzzle.width,
      height: puzzle.height,
      solution: puzzle.solution,
      rowClues: puzzle.rowClues,
      colClues: puzzle.colClues,
      complexity,
      draft: Array<number>(puzzle.width * puzzle.height).fill(MARK_EMPTY),
      checksUsed: 0,
      undoneFills: 0,
      clearsUsed: 0,
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

  score(state, context: ScoreContext): Score {
    const solved = state.phase === "won"
    const failedChecks = solved ? Math.max(0, state.checksUsed - 1) : state.checksUsed
    const rawBase =
      state.complexity -
      failedChecks * FAILED_CHECK_PENALTY -
      state.undoneFills * UNDONE_FILL_PENALTY -
      state.clearsUsed * CLEAR_BOARD_PENALTY
    const baseScore = solved ? Math.min(MAX_SCORE, Math.max(WIN_FLOOR, rawBase)) : 0
    const timeBonus = solved ? timeBonusFor(baseScore, state.modeId, context.elapsedMs) : 0
    const value = solved ? Math.min(MAX_SCORE, baseScore + timeBonus) : 0

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
        complexity: state.complexity,
        baseScore,
        timeBonus,
        checksUsed: state.checksUsed,
        undoneFills: state.undoneFills,
        clearsUsed: state.clearsUsed,
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
      complexity: state.complexity,
      draft: [...state.draft],
      checksUsed: state.checksUsed,
      undoneFills: state.undoneFills,
      clearsUsed: state.clearsUsed,
      phase: state.phase,
    }
  },
}
