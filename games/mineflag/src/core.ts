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

type Preset = { readonly width: number; readonly height: number; readonly mines: number }

function presetFor(mode: Mode): Preset {
  return PRESETS[mode.id as keyof typeof PRESETS] ?? PRESETS.beginner
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

function placeMines(state: MineState, safeX: number, safeY: number): void {
  const safe = new Set<number>([index(state, safeX, safeY)])
  for (const index of neighborIndexes(state, safeX, safeY)) safe.add(index)

  // If the safe zone leaves too few cells, fall back to protecting only the click.
  if (state.width * state.height - safe.size < state.mineCount) {
    safe.clear()
    safe.add(index(state, safeX, safeY))
  }

  const candidates: number[] = []
  for (let i = 0; i < state.cells.length; i += 1) {
    if (!safe.has(i)) candidates.push(i)
  }

  const rng = createRng(state.seed ^ 0x9e3779b9)
  const chosen = rng.shuffle(candidates).slice(0, state.mineCount)
  for (const index of chosen) {
    const cell = state.cells[index]
    if (cell) cell.mine = true
  }

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.cells[index(state, x, y)]
      if (!cell) continue
      cell.adjacent = neighborIndexes(state, x, y).filter((i) => state.cells[i]?.mine).length
    }
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
      minesPlaced: false,
      cells,
      phase: "playing",
      revealed: 0,
      flags: 0,
    }
  },

  step(state, inputs) {
    for (const input of inputs) {
      if (input.type === "reveal") reveal(state, input.x, input.y)
      else if (input.type === "flag") flag(state, input.x, input.y)
      else chord(state, input.x, input.y)
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
      ranked: state.phase === "won",
      detail: {
        width: state.width,
        height: state.height,
        mines: state.mineCount,
        moves: context.ticks,
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
