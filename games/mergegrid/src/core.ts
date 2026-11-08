import type { GameCore, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

export type Direction = "up" | "down" | "left" | "right"

export interface MergeState {
  readonly size: number
  readonly target: number
  readonly seed: number
  grid: number[]
  score: number
  moves: number
  spawns: number
  phase: Phase
}

export interface MergeInput {
  readonly direction: Direction
}

const SIZE = 4
const TARGET = 2048

const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"]

function lineIndexes(size: number, direction: Direction, line: number): number[] {
  const indexes: number[] = []
  for (let step = 0; step < size; step += 1) {
    if (direction === "left") indexes.push(line * size + step)
    else if (direction === "right") indexes.push(line * size + (size - 1 - step))
    else if (direction === "up") indexes.push(step * size + line)
    else indexes.push((size - 1 - step) * size + line)
  }
  return indexes
}

function compact(values: readonly number[]): number[] {
  return values.filter((value) => value !== 0)
}

function mergeLine(values: readonly number[]): { line: number[]; gained: number } {
  const source = compact(values)
  const merged: number[] = []
  let gained = 0

  for (let index = 0; index < source.length; index += 1) {
    const value = source[index]!
    if (value === source[index + 1]) {
      merged.push(value * 2)
      gained += value * 2
      index += 1
    } else {
      merged.push(value)
    }
  }

  return { line: merged, gained }
}

/** Spawn from the seed and spawn count, so the core needs no hidden RNG state. */
function spawn(state: MergeState): void {
  const empty: number[] = []
  for (let index = 0; index < state.grid.length; index += 1) {
    if (state.grid[index] === 0) empty.push(index)
  }
  if (empty.length === 0) return

  const rng = createRng((state.seed ^ Math.imul(state.spawns + 1, 0x9e3779b1)) >>> 0)
  const cell = rng.pick(empty)
  state.grid[cell] = rng.next() < 0.9 ? 2 : 4
  state.spawns += 1
}

function hasMoves(state: MergeState): boolean {
  for (let index = 0; index < state.grid.length; index += 1) {
    if (state.grid[index] === 0) return true
    const x = index % state.size
    const y = Math.floor(index / state.size)
    if (x + 1 < state.size && state.grid[index] === state.grid[index + 1]) return true
    if (y + 1 < state.size && state.grid[index] === state.grid[index + state.size]) return true
  }
  return false
}

function maxTile(state: MergeState): number {
  let max = 0
  for (const value of state.grid) {
    if (value > max) max = value
  }
  return max
}

function applyMove(state: MergeState, direction: Direction): void {
  if (state.phase !== "playing") return

  let changed = false
  for (let line = 0; line < state.size; line += 1) {
    const indexes = lineIndexes(state.size, direction, line)
    const before = indexes.map((index) => state.grid[index]!)
    const { line: merged, gained } = mergeLine(before)
    const after = [...merged, ...Array(state.size - merged.length).fill(0)]

    if (after.some((value, position) => value !== before[position])) changed = true
    indexes.forEach((index, position) => {
      state.grid[index] = after[position]!
    })
    state.score += gained
  }

  if (!changed) return

  state.moves += 1
  spawn(state)

  if (maxTile(state) >= state.target) state.phase = "won"
  else if (!hasMoves(state)) state.phase = "lost"
}

export const core: GameCore<MergeState, MergeInput> = {
  create(seed) {
    const state: MergeState = {
      size: SIZE,
      target: TARGET,
      seed,
      grid: Array(SIZE * SIZE).fill(0),
      score: 0,
      moves: 0,
      spawns: 0,
      phase: "playing",
    }
    spawn(state)
    spawn(state)
    return state
  },

  step(state, inputs) {
    for (const raw of inputs) {
      if (state.phase !== "playing") break
      if (typeof raw !== "object" || raw === null) continue
      const direction = (raw as MergeInput).direction
      if (!DIRECTIONS.includes(direction)) continue
      applyMove(state, direction)
    }
    return state
  },

  phase(state) {
    return state.phase
  },

  score(state, context: ScoreContext): Score {
    return {
      value: state.score,
      type: "higher",
      won: state.phase === "won",
      ranked: state.phase !== "playing",
      detail: {
        moves: state.moves,
        maxTile: maxTile(state),
        spawns: state.spawns,
        elapsedMs: context.elapsedMs,
      },
    }
  },

  serialize(state) {
    return {
      s: state.size,
      t: state.target,
      seed: state.seed,
      g: state.grid,
      score: state.score,
      m: state.moves,
      n: state.spawns,
      p: state.phase,
    }
  },
}
