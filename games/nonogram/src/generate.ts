import type { Mode } from "@await-arcade/contract"
import { createRng, type Rng } from "@await-arcade/framework"

/** A solver cell that has not been deduced yet. */
export const UNKNOWN = 0
/** A solver cell that every legal line placement fills. */
export const FILLED = 1
/** A solver cell that every legal line placement leaves empty. */
export const EMPTY = 2

/** Hard cap on candidate grids tried before the pre-verified bank is used. */
export const CANDIDATE_CAP = 200

export interface ModeSpec {
  readonly width: number
  readonly height: number
  /** Target fraction of filled cells when drawing a candidate. */
  readonly density: number
}

export interface GeneratedPuzzle {
  readonly width: number
  readonly height: number
  /** Row-major solution, `1` for filled and `0` for empty. */
  readonly solution: readonly number[]
  readonly rowClues: readonly (readonly number[])[]
  readonly colClues: readonly (readonly number[])[]
}

export interface GenerateOptions {
  /** Injection point for tests; production always uses `CANDIDATE_CAP`. */
  readonly candidateCap?: number
}

export interface SolveResult {
  /** True when line propagation determined every cell without backtracking. */
  readonly solved: boolean
  /** Row-major grid using `UNKNOWN`, `FILLED`, and `EMPTY`. */
  readonly grid: readonly number[]
  readonly iterations: number
  /** True when a line had no placement consistent with its clue and cells. */
  readonly contradiction: boolean
}

const MODE_SPECS: Readonly<Record<string, ModeSpec>> = {
  easy: { width: 6, height: 6, density: 0.55 },
  hard: { width: 10, height: 10, density: 0.5 },
}

/**
 * Pre-verified fallback puzzles, one per mode. The test suite runs the same
 * line solver over each and asserts it resolves to the stored solution.
 */
export const FALLBACK_BANK: Readonly<Record<string, readonly (readonly number[])[]>> = {
  easy: [
    [
      1, 0, 0, 0, 0, 0,
      1, 1, 0, 0, 0, 0,
      1, 1, 1, 0, 0, 0,
      1, 1, 1, 1, 0, 0,
      1, 1, 1, 1, 1, 0,
      1, 1, 1, 1, 1, 1,
    ],
  ],
  hard: [
    [
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
    ],
  ],
}

export function specFor(mode: Pick<Mode, "id"> | string): ModeSpec {
  const id = typeof mode === "string" ? mode : mode.id
  return MODE_SPECS[id] ?? MODE_SPECS.easy!
}

/**
 * Turn a row-major solution into the run lengths shown beside each row and
 * above each column. Empty lines get `[]`.
 */
export function cluesFor(
  solution: readonly number[],
  width: number,
  height: number,
): { readonly rows: number[][]; readonly cols: number[][] } {
  const rows: number[][] = []
  const cols: number[][] = []

  for (let y = 0; y < height; y += 1) {
    const clue: number[] = []
    let run = 0
    for (let x = 0; x < width; x += 1) {
      if (solution[y * width + x] === 1) {
        run += 1
      } else if (run > 0) {
        clue.push(run)
        run = 0
      }
    }
    if (run > 0) clue.push(run)
    rows.push(clue)
  }

  for (let x = 0; x < width; x += 1) {
    const clue: number[] = []
    let run = 0
    for (let y = 0; y < height; y += 1) {
      if (solution[y * width + x] === 1) {
        run += 1
      } else if (run > 0) {
        clue.push(run)
        run = 0
      }
    }
    if (run > 0) clue.push(run)
    cols.push(clue)
  }

  return { rows, cols }
}

/**
 * Every legal placement of a line's blocks given the cells already known.
 * A placement records the start index of each block. Known `FILLED` cells
 * must be covered, and known `EMPTY` cells must stay uncovered; the mandatory
 * gap between blocks may not contain a known `FILLED` cell.
 */
export function placementsForLine(
  clue: readonly number[],
  line: readonly number[],
): number[][] {
  const length = line.length
  const blocks = clue.filter((block) => block > 0)
  const placements: number[][] = []

  if (blocks.length === 0) {
    return line.some((cell) => cell === FILLED) ? [] : [[]]
  }

  // suffix[i] is the shortest legal span from block i's start to the end of
  // the line, including the one-cell gaps between the remaining blocks.
  const suffix = new Array<number>(blocks.length + 1).fill(0)
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    suffix[index] = blocks[index]! + (index < blocks.length - 1 ? 1 : 0) + suffix[index + 1]!
  }

  const starts = new Array<number>(blocks.length).fill(0)

  const recurse = (blockIndex: number, minStart: number): void => {
    if (blockIndex === blocks.length) {
      // Every known filled cell must be covered by one of the blocks.
      let cursor = 0
      for (let index = 0; index < blocks.length; index += 1) {
        const start = starts[index]!
        for (let at = cursor; at < start; at += 1) {
          if (line[at] === FILLED) return
        }
        cursor = start + blocks[index]!
      }
      for (let at = cursor; at < length; at += 1) {
        if (line[at] === FILLED) return
      }
      placements.push([...starts])
      return
    }

    const block = blocks[blockIndex]!
    const maxStart = length - suffix[blockIndex]!
    for (let start = minStart; start <= maxStart; start += 1) {
      let blocked = false
      for (let at = start; at < start + block; at += 1) {
        if (line[at] === EMPTY) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      // The cell immediately before this block is its separating gap (or the
      // start of the line); it can never be filled. Same for the cell after.
      if (start > 0 && line[start - 1] === FILLED) continue
      if (start + block < length && line[start + block] === FILLED) continue

      starts[blockIndex] = start
      recurse(blockIndex + 1, start + block + 1)
    }
  }

  recurse(0, 0)
  return placements
}

/**
 * One line-propagation pass. Returns the strongest set of cell states implied
 * by the clue, or `null` when no placement is consistent with the clue.
 *
 * A cell is `FILLED` when it is covered by every legal placement and `EMPTY`
 * when it is covered by none. Everything else stays `UNKNOWN`.
 */
export function propagateLine(
  clue: readonly number[],
  line: readonly number[],
): number[] | null {
  const placements = placementsForLine(clue, line)
  if (placements.length === 0) return null

  const blocks = clue.filter((block) => block > 0)
  const covered = new Array<number>(line.length).fill(0)
  for (const starts of placements) {
    for (let index = 0; index < blocks.length; index += 1) {
      const start = starts[index]!
      for (let at = start; at < start + blocks[index]!; at += 1) {
        covered[at] = (covered[at] ?? 0) + 1
      }
    }
  }

  const next = [...line]
  for (let at = 0; at < line.length; at += 1) {
    if ((covered[at] ?? 0) === placements.length) next[at] = FILLED
    else if ((covered[at] ?? 0) === 0) next[at] = EMPTY
    else next[at] = UNKNOWN
  }
  return next
}

/**
 * Line-propagation solver. Alternates row and column passes until the grid
 * stops changing. It never guesses: `solved` is false when deduction stalls
 * or the clues contradict each other.
 */
export function solveGrid(
  rowClues: readonly (readonly number[])[],
  colClues: readonly (readonly number[])[],
): SolveResult {
  const height = rowClues.length
  const width = colClues.length
  const grid = new Array<number>(width * height).fill(UNKNOWN)
  // Every non-final pass must determine at least one new cell, so this bound
  // cannot be reached without a contradiction; it only guards against bugs.
  const maxPasses = width * height + 2
  let iterations = 0
  let changed = true

  while (changed && iterations < maxPasses) {
    changed = false
    iterations += 1

    for (let y = 0; y < height; y += 1) {
      const line = grid.slice(y * width, (y + 1) * width)
      const next = propagateLine(rowClues[y] ?? [], line)
      if (next === null) {
        return { solved: false, grid, iterations, contradiction: true }
      }
      for (let x = 0; x < width; x += 1) {
        const at = y * width + x
        if (next[x] !== grid[at]) {
          grid[at] = next[x]!
          changed = true
        }
      }
    }

    for (let x = 0; x < width; x += 1) {
      const line: number[] = []
      for (let y = 0; y < height; y += 1) line.push(grid[y * width + x]!)
      const next = propagateLine(colClues[x] ?? [], line)
      if (next === null) {
        return { solved: false, grid, iterations, contradiction: true }
      }
      for (let y = 0; y < height; y += 1) {
        const at = y * width + x
        if (next[y] !== grid[at]) {
          grid[at] = next[y]!
          changed = true
        }
      }
    }
  }

  return {
    solved: grid.every((cell) => cell !== UNKNOWN),
    grid,
    iterations,
    contradiction: false,
  }
}

function isInteresting(
  candidate: readonly number[],
  width: number,
  height: number,
): boolean {
  let filled = 0
  for (const cell of candidate) {
    if (cell === 1) filled += 1
  }
  if (filled === 0 || filled === width * height) return false

  const rowFilled = (y: number): boolean => {
    for (let x = 0; x < width; x += 1) {
      if (candidate[y * width + x] === 1) return true
    }
    return false
  }
  const colFilled = (x: number): boolean => {
    for (let y = 0; y < height; y += 1) {
      if (candidate[y * width + x] === 1) return true
    }
    return false
  }

  return (
    rowFilled(0) &&
    rowFilled(height - 1) &&
    colFilled(0) &&
    colFilled(width - 1)
  )
}

function drawCandidate(rng: Rng, spec: ModeSpec): number[] | null {
  const candidate = new Array<number>(spec.width * spec.height)
  for (let at = 0; at < candidate.length; at += 1) {
    candidate[at] = rng.next() < spec.density ? 1 : 0
  }
  return isInteresting(candidate, spec.width, spec.height) ? candidate : null
}

function sameGrid(grid: readonly number[], solution: readonly number[]): boolean {
  for (let at = 0; at < solution.length; at += 1) {
    const deduced = grid[at] === FILLED ? 1 : 0
    if (deduced !== (solution[at] ?? 0)) return false
  }
  return true
}

function puzzleFrom(
  spec: ModeSpec,
  solution: readonly number[],
): GeneratedPuzzle {
  const clues = cluesFor(solution, spec.width, spec.height)
  return {
    width: spec.width,
    height: spec.height,
    solution: [...solution],
    rowClues: clues.rows,
    colClues: clues.cols,
  }
}

/**
 * Build a puzzle that line propagation can solve without guessing, and whose
 * propagated solution matches the grid that produced the clues. Candidates
 * come from one seeded stream, so the same seed and mode always yield the same
 * puzzle. After `candidateCap` rejections the deterministic fallback bank is
 * used; this function never throws and never loops without a bound.
 */
export function generate(
  seed: number,
  mode: Pick<Mode, "id"> | string,
  options: GenerateOptions = {},
): GeneratedPuzzle {
  const spec = specFor(mode)
  const requested = options.candidateCap ?? CANDIDATE_CAP
  const cap = Math.min(
    CANDIDATE_CAP,
    Math.max(0, Number.isFinite(requested) ? Math.floor(requested) : 0),
  )
  const rng = createRng(seed)

  for (let attempt = 0; attempt < cap; attempt += 1) {
    const candidate = drawCandidate(rng, spec)
    if (candidate === null) continue

    const clues = cluesFor(candidate, spec.width, spec.height)
    const solved = solveGrid(clues.rows, clues.cols)
    if (!solved.solved || !sameGrid(solved.grid, candidate)) continue

    return puzzleFrom(spec, candidate)
  }

  const id = typeof mode === "string" ? mode : mode.id
  const bank = FALLBACK_BANK[id] ?? FALLBACK_BANK.easy!
  // Pick from the end of the same stream, keeping the fallback deterministic.
  const fallback = bank[rng.int(0, bank.length - 1)]!
  return puzzleFrom(spec, fallback)
}
