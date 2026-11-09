import type { GameCore, Mode, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

export interface MineCell {
  mine: boolean
  revealed: boolean
  flagged: boolean
  adjacent: number
}

export interface MineState {
  readonly width: number
  readonly height: number
  readonly mineCount: number
  readonly seed: number
  readonly logic: boolean
  logicFallback: boolean
  minesPlaced: boolean
  cells: MineCell[]
  phase: Phase
  revealed: number
  flags: number
}

export type MineAction = "reveal" | "flag" | "chord"

export interface MineInput {
  readonly type: MineAction
  readonly x: number
  readonly y: number
}

const PRESETS = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
} as const

const LOGIC_ATTEMPTS = 2_000

type Preset = { readonly width: number; readonly height: number; readonly mines: number }

function presetFor(mode: Mode): Preset {
  const id = mode.id.endsWith("-logic") ? mode.id.slice(0, -6) : mode.id
  return PRESETS[id as keyof typeof PRESETS] ?? PRESETS.beginner
}

function index(state: MineState, x: number, y: number): number {
  return y * state.width + x
}

function inside(state: MineState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height
}

function neighborIndexes(state: MineState, x: number, y: number): number[] {
  const result: number[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (inside(state, nx, ny)) result.push(index(state, nx, ny))
    }
  }
  return result
}

function safeCells(state: MineState, safeX: number, safeY: number): Set<number> {
  const safe = new Set<number>([index(state, safeX, safeY)])
  for (const at of neighborIndexes(state, safeX, safeY)) safe.add(at)

  // If the safe zone leaves too few cells, fall back to protecting only the click.
  if (state.width * state.height - safe.size < state.mineCount) {
    safe.clear()
    safe.add(index(state, safeX, safeY))
  }
  return safe
}

function mineLayout(state: MineState, safe: Set<number>, salt: number): boolean[] {
  const candidates: number[] = []
  for (let i = 0; i < state.cells.length; i += 1) {
    if (!safe.has(i)) candidates.push(i)
  }

  const saltSeed = salt === 0 ? 0 : Math.imul(salt, 0x85ebca6b)
  const rng = createRng((state.seed ^ 0x9e3779b9 ^ saltSeed) >>> 0)
  const mines = Array(state.cells.length).fill(false) as boolean[]
  for (const at of rng.shuffle(candidates).slice(0, state.mineCount)) mines[at] = true
  return mines
}

function neighborsOf(width: number, height: number, at: number): number[] {
  const x = at % width
  const y = Math.floor(at / width)
  const result: number[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) result.push(ny * width + nx)
    }
  }
  return result
}

function revealFlood(width: number, height: number, cells: MineCell[], start: number): void {
  const stack = [start]
  while (stack.length > 0) {
    const at = stack.pop()!
    const cell = cells[at]
    if (!cell || cell.revealed || cell.flagged || cell.mine) continue
    cell.revealed = true
    if (cell.adjacent === 0) {
      for (const next of neighborsOf(width, height, at)) stack.push(next)
    }
  }
}

/**
 * Check whether the board can be finished without guessing. The solver only
 * uses forced single-cell moves, subset inference, and the global mine count;
 * it never peeks at a mine to choose a reveal.
 */
function solveBoard(
  width: number,
  height: number,
  mineCount: number,
  source: readonly MineCell[],
): boolean {
  const total = width * height
  const cells = source.map((cell) => ({ ...cell }))
  const need = total - mineCount
  let guard = 0

  while (guard++ < total * 12) {
    let changed = false
    const constraints: Array<{ hidden: number[]; remaining: number }> = []

    for (let at = 0; at < total; at += 1) {
      const cell = cells[at]!
      if (!cell.revealed || cell.adjacent === 0) continue
      const hidden: number[] = []
      let nearbyFlags = 0
      for (const next of neighborsOf(width, height, at)) {
        const other = cells[next]!
        if (other.flagged) nearbyFlags += 1
        else if (!other.revealed) hidden.push(next)
      }
      constraints.push({ hidden, remaining: cell.adjacent - nearbyFlags })
    }

    const apply = (list: readonly number[], action: "reveal" | "flag"): void => {
      for (const at of list) {
        const cell = cells[at]!
        if (cell.revealed || cell.flagged) continue
        changed = true
        if (action === "flag") cell.flagged = true
        else revealFlood(width, height, cells, at)
      }
    }

    for (const constraint of constraints) {
      if (constraint.hidden.length === 0) continue
      if (constraint.remaining === 0) apply(constraint.hidden, "reveal")
      else if (constraint.remaining === constraint.hidden.length) {
        apply(constraint.hidden, "flag")
      }
    }

    // Subset inference: A's hidden set inside B's.
    for (let left = 0; left < constraints.length; left += 1) {
      const a = constraints[left]!
      if (a.hidden.length === 0) continue
      const setA = new Set(a.hidden)
      for (let right = 0; right < constraints.length; right += 1) {
        if (left === right) continue
        const b = constraints[right]!
        if (b.hidden.length <= a.hidden.length) continue
        if (!a.hidden.every((at) => b.hidden.includes(at))) continue
        const diff = b.hidden.filter((at) => !setA.has(at))
        if (diff.length === 0) continue
        const remaining = b.remaining - a.remaining
        if (remaining === 0) apply(diff, "reveal")
        else if (remaining === diff.length) apply(diff, "flag")
      }
    }

    const unresolved: number[] = []
    let flags = 0
    for (let at = 0; at < total; at += 1) {
      const cell = cells[at]!
      if (cell.flagged) flags += 1
      else if (!cell.revealed) unresolved.push(at)
    }
    const remainingMines = mineCount - flags
    if (remainingMines === 0) apply(unresolved, "reveal")
    else if (remainingMines === unresolved.length) apply(unresolved, "flag")

    const solved = cells.filter((cell) => cell.revealed && !cell.mine).length
    if (solved === need) return true
    if (!changed) break
  }

  return cells.filter((cell) => cell.revealed && !cell.mine).length === need
}

function candidateIsSolvable(state: MineState, mines: boolean[], first: number): boolean {
  const cells: MineCell[] = mines.map((mine) => ({
    mine,
    revealed: false,
    flagged: false,
    adjacent: 0,
  }))
  for (let at = 0; at < cells.length; at += 1) {
    cells[at]!.adjacent = neighborsOf(state.width, state.height, at).filter(
      (next) => cells[next]?.mine,
    ).length
  }
  revealFlood(state.width, state.height, cells, first)
  return solveBoard(state.width, state.height, state.mineCount, cells)
}

/** Exposed for tests: the board is still solvable from its current reveal. */
export function logicSolvable(state: MineState): boolean {
  if (!state.minesPlaced) return false
  return solveBoard(
    state.width,
    state.height,
    state.mineCount,
    state.cells.map((cell) => ({ ...cell })),
  )
}

function placeMines(state: MineState, safeX: number, safeY: number): void {
  const safe = safeCells(state, safeX, safeY)
  const first = index(state, safeX, safeY)

  if (state.logic) {
    for (let salt = 0; salt < LOGIC_ATTEMPTS; salt += 1) {
      const mines = mineLayout(state, safe, salt)
      if (candidateIsSolvable(state, mines, first)) {
        applyMines(state, mines)
        return
      }
    }
    // Extremely rare: no no-guess board was found. Keep the mode playable but
    // mark the run unranked instead of silently promising a logic board.
    state.logicFallback = true
  }

  applyMines(state, mineLayout(state, safe, 0))
}

function applyMines(state: MineState, mines: boolean[]): void {
  for (let at = 0; at < state.cells.length; at += 1) {
    state.cells[at]!.mine = mines[at] ?? false
  }
  for (let at = 0; at < state.cells.length; at += 1) {
    state.cells[at]!.adjacent = neighborsOf(state.width, state.height, at).filter(
      (next) => state.cells[next]?.mine,
    ).length
  }
  state.minesPlaced = true
}

function reveal(state: MineState, x: number, y: number): void {
  if (state.phase !== "playing" || !inside(state, x, y)) return

  const start = index(state, x, y)
  const first = state.cells[start]
  if (!first || first.revealed || first.flagged) return

  if (!state.minesPlaced) placeMines(state, x, y)

  if (first.mine) {
    state.phase = "lost"
    for (const cell of state.cells) {
      if (cell.mine) cell.revealed = true
    }
    return
  }

  const stack = [start]
  while (stack.length > 0) {
    const at = stack.pop()!
    const cell = state.cells[at]
    if (!cell || cell.revealed || cell.flagged || cell.mine) continue

    cell.revealed = true
    state.revealed += 1

    if (cell.adjacent === 0) {
      const cx = at % state.width
      const cy = Math.floor(at / state.width)
      for (const neighbor of neighborIndexes(state, cx, cy)) {
        const next = state.cells[neighbor]
        if (next && !next.revealed && !next.flagged && !next.mine) stack.push(neighbor)
      }
    }
  }

  if (state.revealed === state.width * state.height - state.mineCount) {
    state.phase = "won"
  }
}

function flag(state: MineState, x: number, y: number): void {
  if (state.phase !== "playing" || !inside(state, x, y)) return
  const cell = state.cells[index(state, x, y)]
  if (!cell || cell.revealed) return

  cell.flagged = !cell.flagged
  state.flags += cell.flagged ? 1 : -1
}

function chord(state: MineState, x: number, y: number): void {
  if (state.phase !== "playing" || !inside(state, x, y)) return
  const cell = state.cells[index(state, x, y)]
  if (!cell || !cell.revealed || cell.adjacent === 0) return

  const neighbors = neighborIndexes(state, x, y)
  const flags = neighbors.filter((i) => state.cells[i]?.flagged).length
  if (flags !== cell.adjacent) return

  for (const neighbor of neighbors) {
    const next = state.cells[neighbor]
    if (!next || next.flagged || next.revealed) continue
    reveal(state, neighbor % state.width, Math.floor(neighbor / state.width))
    if (state.phase !== "playing") return
  }
}

export const core: GameCore<MineState, MineInput> = {
  create(seed, mode) {
    const preset = presetFor(mode)
    const cells: MineCell[] = Array.from(
      { length: preset.width * preset.height },
      () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 }),
    )

    return {
      width: preset.width,
      height: preset.height,
      mineCount: preset.mines,
      seed,
      logic: mode.id.endsWith("-logic"),
      logicFallback: false,
      minesPlaced: false,
      cells,
      phase: "playing",
      revealed: 0,
      flags: 0,
    }
  },

  step(state, inputs) {
    for (const input of inputs) {
      if (typeof input !== "object" || input === null) continue
      if (!Number.isInteger(input.x) || !Number.isInteger(input.y)) continue
      if (input.type === "reveal") reveal(state, input.x, input.y)
      else if (input.type === "flag") flag(state, input.x, input.y)
      else if (input.type === "chord") chord(state, input.x, input.y)
      if (state.phase !== "playing") break
    }
    return state
  },

  phase(state) {
    return state.phase
  },

  score(state, context: ScoreContext): Score {
    return {
      // Wall time is client-supplied in a turn replay, so rank the verified
      // move count instead. Every input is already in the replayed log.
      value: context.ticks,
      type: "lower",
      won: state.phase === "won",
      ranked: state.phase === "won" && !state.logicFallback,
      detail: {
        width: state.width,
        height: state.height,
        mines: state.mineCount,
        moves: context.ticks,
        logic: state.logic,
        logicFallback: state.logicFallback,
        revealed: state.revealed,
        flags: state.flags,
      },
    }
  },

  serialize(state) {
    return {
      w: state.width,
      h: state.height,
      m: state.mineCount,
      lg: state.logic ? 1 : 0,
      lf: state.logicFallback ? 1 : 0,
      p: state.phase,
      r: state.revealed,
      f: state.flags,
      c: state.cells.map(
        (cell) =>
          (cell.mine ? 1 : 0) |
          (cell.revealed ? 2 : 0) |
          (cell.flagged ? 4 : 0) |
          (cell.adjacent << 3),
      ),
    }
  },
}
