import type { GameCore, Mode, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

/** Alphabet size. Symbols are rendered as the letters A–F by the view. */
export const SYMBOLS = 6
/** Attempts per run, win or lose. */
export const MAX_ATTEMPTS = 10
/** The rendered alphabet, indexed by symbol id. */
export const LETTERS = ["A", "B", "C", "D", "E", "F"] as const

export interface CodebreakerGuess {
  /** Symbol ids, left to right. */
  readonly symbols: readonly number[]
  readonly exact: number
  readonly near: number
}

export interface CodebreakerState {
  readonly seed: number
  readonly modeId: string
  readonly symbols: number
  readonly slots: number
  readonly maxAttempts: number
  /** Symbol ids, generated once from the seed. Never changes during a run. */
  readonly secret: readonly number[]
  /** Editable row. `null` means the slot is empty. */
  draft: Array<number | null>
  cursor: number
  /** Submitted rows are append-only and immutable. */
  guesses: CodebreakerGuess[]
  attemptsUsed: number
  phase: Phase
}

export type CodebreakerInput =
  | { readonly type: "slot"; readonly delta: number }
  | { readonly type: "cycle"; readonly delta: number }
  | { readonly type: "clear" }
  | { readonly type: "submit" }

function slotsFor(mode: Mode): number {
  return mode.id === "expert" ? 5 : 4
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size
}

function isStep(value: unknown): value is -1 | 1 {
  return value === 1 || value === -1
}

/**
 * Multiset intersection feedback. Exact matches are consumed first; `near`
 * only counts remaining occurrences of a symbol in the opposite row.
 *
 * Secret `A A B C`, guess `A C A A` -> exact 1, near 2.
 */
export function feedback(
  secret: readonly number[],
  guess: readonly number[],
): { readonly exact: number; readonly near: number } {
  const secretLeft = Array<number>(SYMBOLS).fill(0)
  const guessLeft = Array<number>(SYMBOLS).fill(0)
  let exact = 0

  for (let index = 0; index < secret.length; index += 1) {
    const want = secret[index]!
    const got = guess[index] ?? -1
    if (want === got) {
      exact += 1
    } else if (want >= 0 && want < SYMBOLS) {
      secretLeft[want] = (secretLeft[want] ?? 0) + 1
      if (got >= 0 && got < SYMBOLS) guessLeft[got] = (guessLeft[got] ?? 0) + 1
    }
  }

  let near = 0
  for (let symbol = 0; symbol < SYMBOLS; symbol += 1) {
    near += Math.min(secretLeft[symbol] ?? 0, guessLeft[symbol] ?? 0)
  }

  return { exact, near }
}

function moveCursor(state: CodebreakerState, delta: number): CodebreakerState {
  const cursor = wrap(state.cursor + delta, state.slots)
  if (cursor === state.cursor) return state
  return { ...state, cursor }
}

function cycleSlot(state: CodebreakerState, delta: number): CodebreakerState {
  const current = state.draft[state.cursor] ?? null
  /**
   * An empty slot starts at the first symbol in the direction of travel, so
   * `cycle +1` from empty gives A and `cycle -1` from empty gives E.
   */
  const next =
    current === null ? (delta > 0 ? 0 : SYMBOLS - 1) : wrap(current + delta, SYMBOLS)
  if (current === next) return state

  const draft = [...state.draft]
  draft[state.cursor] = next
  return { ...state, draft }
}

function clearSlot(state: CodebreakerState): CodebreakerState {
  if (state.draft[state.cursor] === null) return state
  const draft = [...state.draft]
  draft[state.cursor] = null
  return { ...state, draft }
}

function submitRow(state: CodebreakerState): CodebreakerState {
  if (state.draft.some((slot) => slot === null)) return state

  const symbols = state.draft.map((slot) => slot as number)
  const { exact, near } = feedback(state.secret, symbols)
  const attemptsUsed = state.attemptsUsed + 1
  let phase: Phase = state.phase

  if (exact === state.slots) phase = "won"
  else if (attemptsUsed >= state.maxAttempts) phase = "lost"

  return {
    ...state,
    draft: Array<number | null>(state.slots).fill(null),
    cursor: 0,
    guesses: [...state.guesses, { symbols, exact, near }],
    attemptsUsed,
    phase,
  }
}

function apply(state: CodebreakerState, input: CodebreakerInput): CodebreakerState {
  if (typeof input !== "object" || input === null) return state
  if (state.phase !== "playing") return state

  switch (input.type) {
    case "slot":
      return isStep(input.delta) ? moveCursor(state, input.delta) : state
    case "cycle":
      return isStep(input.delta) ? cycleSlot(state, input.delta) : state
    case "clear":
      return clearSlot(state)
    case "submit":
      return submitRow(state)
    default:
      return state
  }
}

export const core: GameCore<CodebreakerState, CodebreakerInput> = {
  create(seed, mode) {
    const slots = slotsFor(mode)
    const rng = createRng(seed)
    const secret = Array.from({ length: slots }, () => rng.int(0, SYMBOLS - 1))

    return {
      seed,
      modeId: mode.id,
      symbols: SYMBOLS,
      slots,
      maxAttempts: MAX_ATTEMPTS,
      secret,
      draft: Array<number | null>(slots).fill(null),
      cursor: 0,
      guesses: [],
      attemptsUsed: 0,
      phase: "playing",
    }
  },

  step(state, inputs) {
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

  score(state, _context: ScoreContext): Score {
    const solved = state.phase === "won"
    // Win on the first guess pays 1000; every later attempt costs 100.
    const value = solved ? (state.maxAttempts + 1 - state.attemptsUsed) * 100 : 0

    return {
      value: Math.max(0, Math.min(1000, value)),
      type: "higher",
      won: solved,
      // Finite puzzle: a loss is a complete run, but it is not leaderboard
      // eligible. Mirrors mineflag's `ranked: won` convention.
      ranked: solved,
      detail: {
        mode: state.modeId,
        slots: state.slots,
        attemptsUsed: state.attemptsUsed,
        solved,
      },
    }
  },

  serialize(state) {
    return {
      mode: state.modeId,
      symbols: state.symbols,
      slots: state.slots,
      maxAttempts: state.maxAttempts,
      secret: [...state.secret],
      draft: state.draft.map((slot) => (slot === null ? -1 : slot)),
      cursor: state.cursor,
      attemptsUsed: state.attemptsUsed,
      phase: state.phase,
      guesses: state.guesses.map((guess) => ({
        symbols: [...guess.symbols],
        exact: guess.exact,
        near: guess.near,
      })),
    }
  },
}
