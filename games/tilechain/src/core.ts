import type { GameCore, Mode, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

/** Board width. `x` runs left to right. */
export const COLS = 7
/** Board height. `y = 0` is the ceiling, `y = 6` is the floor. */
export const ROWS = 7
/** Bottom-anchored starting height for each column. */
export const INIT_HEIGHTS = [2, 1, 2, 0, 2, 1, 2] as const
/** Every starting tile is >= 4, so the starting footprint can never clear. */
export const INIT_POOL = [4, 5, 6, 7] as const
/** Skirmish bag: numbers 1..7 plus one cracked tile. */
export const SKIRMISH_BAG: readonly Tile[] = [1, 2, 3, 4, 5, 6, 7, "cracked"]
/** Endless bag: numbers 1..7 plus two cracked tiles. */
export const ENDLESS_BAG: readonly Tile[] = [1, 2, 3, 4, 5, 6, 7, "cracked", "cracked"]
/** The board has 49 cells, so no cascade can need more waves than that. */
export const MAX_CASCADE_WAVES = 49

/** Skirmish win objective and hard drop cap. */
export const SKIRMISH_TARGET_CLEARS = 32
export const SKIRMISH_MAX_DROPS = 35
/** Every ten drops in Endless pushes a new cracked row from below. */
export const ENDLESS_DROPS_PER_DEPTH = 10

/** Hard score ceiling, mirrored by `meta.score.max`. */
export const MAX_SCORE = 999_999
export const SKIRMISH_WIN_BONUS = 200
export const SKIRMISH_DROP_BONUS = 25
export const ENDLESS_DEPTH_BONUS = 100

export type TileValue = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type Tile = TileValue | "cracked"
export type Cell = Tile | null

export interface TilechainState {
  readonly seed: number
  readonly modeId: string
  board: Cell[][]
  currentTile: Tile
  nextTile: Tile
  bagIndex: number
  bagPos: number
  dropsUsed: number
  clearedTiles: number
  crackedCleared: number
  chainPoints: number
  maxChain: number
  depth: number
  phase: Phase
}

export type TilechainInput = { readonly type: "drop"; readonly col: number }

interface Point {
  readonly x: number
  readonly y: number
}

function templateFor(modeId: string): readonly Tile[] {
  return modeId === "endless" ? ENDLESS_BAG : SKIRMISH_BAG
}

/**
 * Pure per-bag shuffle. Bag `n` depends only on `(seed, n, modeId)`, so a replay
 * redraws the identical tile order without storing undealt tiles in the state.
 */
export function bagAt(seed: number, bagIndex: number, modeId: string): readonly Tile[] {
  const mixed = (seed ^ Math.imul(bagIndex + 1, 0x9e3779b1)) >>> 0
  return createRng(mixed).shuffle(templateFor(modeId))
}

function cloneBoard(board: readonly (readonly Cell[])[]): Cell[][] {
  return board.map((row) => [...row])
}

function horizontalSize(board: readonly (readonly Cell[])[], x: number, y: number): number {
  let left = x
  let right = x
  while (left > 0 && typeof board[y]![left - 1] === "number") left -= 1
  while (right < COLS - 1 && typeof board[y]![right + 1] === "number") right += 1
  return right - left + 1
}

function verticalSize(board: readonly (readonly Cell[])[], x: number, y: number): number {
  let top = y
  let bottom = y
  while (top > 0 && typeof board[top - 1]![x] === "number") top -= 1
  while (bottom < ROWS - 1 && typeof board[bottom + 1]![x] === "number") bottom += 1
  return bottom - top + 1
}

function gravity(board: Cell[][]): Cell[][] {
  const next = cloneBoard(board)

  for (let x = 0; x < COLS; x += 1) {
    const column: Cell[] = []
    for (let y = 0; y < ROWS; y += 1) {
      const cell = next[y]![x]!
      if (cell !== null) column.push(cell)
    }

    const offset = ROWS - column.length
    for (let y = 0; y < ROWS; y += 1) {
      next[y]![x] = y < offset ? null : column[y - offset]!
    }
  }

  return next
}

function topRowFull(board: readonly (readonly Cell[])[]): boolean {
  return board[0]!.every((cell) => cell !== null)
}

function pushUp(board: readonly (readonly Cell[])[]): Cell[][] {
  const next = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null as Cell),
  )

  for (let y = 0; y < ROWS - 1; y += 1) {
    for (let x = 0; x < COLS; x += 1) next[y]![x] = board[y + 1]![x]!
  }
  for (let x = 0; x < COLS; x += 1) next[ROWS - 1]![x] = "cracked"

  return next
}

interface CascadeResult {
  readonly board: Cell[][]
  readonly waves: number
  readonly cleared: number
  readonly cracked: number
  readonly points: number
  readonly trace: CascadeWave[]
}

/** One wave of a cascade, captured before removal and gravity. */
export interface CascadeWave {
  readonly board: Cell[][]
  readonly clears: readonly Point[]
  readonly cracked: readonly Point[]
}

/**
 * Simultaneous per-wave resolution:
 *   evaluate numbered groups on one snapshot -> collect orthogonal cracked
 *   collateral -> remove both together -> settle gravity -> evaluate again.
 *
 * Every active wave removes at least one tile and gravity adds none, so the
 * 49-wave cap can never be reached by a legal board; it exists as a guard.
 */
interface WaveClear {
  readonly numbered: Point[]
  readonly cracked: Point[]
}

/**
 * The first wave of a cascade: every numbered tile whose value equals its run
 * length on the row or column, plus the cracked tiles orthogonally adjacent to
 * one of them. Pure — it reads a snapshot and returns coordinates.
 */
function firstWaveClears(board: readonly (readonly Cell[])[]): WaveClear {
  const clearCoords: Point[] = []
  const clearKeys = new Set<string>()

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = board[y]![x]!
      if (typeof cell !== "number") continue

      // Both sizes come from the same snapshot, so scan order is irrelevant.
      if (horizontalSize(board, x, y) === cell || verticalSize(board, x, y) === cell) {
        clearKeys.add(`${x},${y}`)
        clearCoords.push({ x, y })
      }
    }
  }

  const crackedCoords: Point[] = []
  if (clearCoords.length === 0) return { numbered: clearCoords, cracked: crackedCoords }

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (board[y]![x] !== "cracked") continue

      // Cracked tiles only die to an adjacent clearing numbered tile; a removed
      // cracked tile never propagates to another cracked tile.
      const adjacent =
        clearKeys.has(`${x},${y - 1}`) ||
        clearKeys.has(`${x},${y + 1}`) ||
        clearKeys.has(`${x - 1},${y}`) ||
        clearKeys.has(`${x + 1},${y}`)

      if (adjacent) crackedCoords.push({ x, y })
    }
  }

  return { numbered: clearCoords, cracked: crackedCoords }
}

function runCascade(start: readonly (readonly Cell[])[], captureTrace: boolean): CascadeResult {
  let board = cloneBoard(start)
  let waves = 0
  let cleared = 0
  let cracked = 0
  let points = 0
  const trace: CascadeWave[] = []

  while (waves < MAX_CASCADE_WAVES) {
    const wave = firstWaveClears(board)
    if (wave.numbered.length === 0) break

    if (captureTrace) {
      trace.push({
        board: cloneBoard(board),
        clears: wave.numbered,
        cracked: wave.cracked,
      })
    }

    waves += 1
    const removed = new Set<string>(
      [...wave.numbered, ...wave.cracked].map((point) => `${point.x},${point.y}`),
    )
    for (const point of [...wave.numbered, ...wave.cracked]) {
      if (removed.has(`${point.x},${point.y}`)) board[point.y]![point.x] = null
    }

    const k = wave.numbered.length + wave.cracked.length
    cleared += k
    cracked += wave.cracked.length
    points += 10 * waves * waves * k

    board = gravity(board)
  }

  return { board, waves, cleared, cracked, points, trace }
}

function landingRowFor(board: readonly (readonly Cell[])[], col: number): number {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1
  if (board[0]![col] !== null) return -1
  let landing = ROWS - 1
  while (landing >= 0 && board[landing]![col] !== null) landing -= 1
  return landing
}

/** What a drop into `col` would do right now, for teaching overlays. Pure. */
export interface DropPreview {
  /** Row the current tile would land on. */
  readonly landing: number
  /** Numbered tiles that would clear in the first wave, including the dropped one. */
  readonly clears: readonly Point[]
  /** Cracked tiles broken as collateral of that first wave. */
  readonly cracked: readonly Point[]
}

export function previewDrop(state: TilechainState, col: number): DropPreview | null {
  if (state.phase !== "playing") return null
  const landing = landingRowFor(state.board, col)
  if (landing < 0) return null

  const board = cloneBoard(state.board)
  board[landing]![col] = state.currentTile
  const wave = firstWaveClears(board)
  return { landing, clears: wave.numbered, cracked: wave.cracked }
}

/** Step-by-step cascade frames for animating a drop in the view. Pure. */
export interface DropTrace {
  readonly landing: number
  readonly waves: readonly CascadeWave[]
}

export function traceDrop(state: TilechainState, col: number): DropTrace | null {
  if (state.phase !== "playing") return null
  const landing = landingRowFor(state.board, col)
  if (landing < 0) return null

  const board = cloneBoard(state.board)
  board[landing]![col] = state.currentTile
  const cascade = runCascade(board, true)
  return { landing, waves: cascade.trace }
}

function applyDrop(state: TilechainState, col: number): TilechainState {
  if (state.phase !== "playing") return state
  // A full column is a no-op: it must not consume the current tile or a drop.
  const landing = landingRowFor(state.board, col)
  if (landing < 0) return state

  const board = cloneBoard(state.board)
  board[landing]![col] = state.currentTile

  const cascade = runCascade(board, false)
  let nextBoard = cascade.board

  const dropsUsed = state.dropsUsed + 1
  const clearedTiles = state.clearedTiles + cascade.cleared
  const crackedCleared = state.crackedCleared + cascade.cracked
  const chainPoints = state.chainPoints + cascade.points
  const maxChain = Math.max(state.maxChain, cascade.waves)

  let bagIndex = state.bagIndex
  let bagPos = state.bagPos
  const nextTile = bagAt(state.seed, bagIndex, state.modeId)[bagPos]!
  bagPos += 1
  if (bagPos >= templateFor(state.modeId).length) {
    bagIndex += 1
    bagPos = 0
  }

  let depth = state.depth
  let phase: Phase = "playing"

  if (state.modeId === "endless") {
    if (dropsUsed > 0 && dropsUsed % ENDLESS_DROPS_PER_DEPTH === 0) {
      // Pushing every column up by one overflows any column already at row 0.
      if (nextBoard[0]!.some((cell) => cell !== null)) {
        phase = "lost"
      } else {
        nextBoard = pushUp(nextBoard)
        depth += 1
      }
    }

    // A successful push can itself fill the new top row when every column was
    // already at height six. That board has no legal drop left, so the run is
    // over rather than soft-locked in "playing".
    if (phase === "playing" && topRowFull(nextBoard)) phase = "lost"
  } else if (clearedTiles >= SKIRMISH_TARGET_CLEARS) {
    // The clear objective wins even if the same drop also filled the top row.
    phase = "won"
  } else if (dropsUsed >= SKIRMISH_MAX_DROPS || topRowFull(nextBoard)) {
    phase = "lost"
  }

  return {
    ...state,
    board: nextBoard,
    currentTile: state.nextTile,
    nextTile,
    bagIndex,
    bagPos,
    dropsUsed,
    clearedTiles,
    crackedCleared,
    chainPoints,
    maxChain,
    depth,
    phase,
  }
}

export const core: GameCore<TilechainState, TilechainInput> = {
  create(seed, mode: Mode): TilechainState {
    const normalizedSeed = seed >>> 0
    const initRng = createRng(normalizedSeed)
    const board = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => null as Cell),
    )

    for (let x = 0; x < COLS; x += 1) {
      const height = INIT_HEIGHTS[x]!
      for (let i = 0; i < height; i += 1) {
        board[ROWS - 1 - i]![x] = initRng.pick(INIT_POOL)
      }
    }

    const bag0 = bagAt(normalizedSeed, 0, mode.id)

    return {
      seed: normalizedSeed,
      modeId: mode.id,
      board,
      currentTile: bag0[0]!,
      nextTile: bag0[1]!,
      bagIndex: 0,
      bagPos: 2,
      dropsUsed: 0,
      clearedTiles: 0,
      crackedCleared: 0,
      chainPoints: 0,
      maxChain: 0,
      depth: 1,
      phase: "playing",
    }
  },

  step(state, inputs, _dt) {
    if (!Array.isArray(inputs)) return state

    let next = state
    for (const input of inputs) {
      if (next.phase !== "playing") break
      if (typeof input !== "object" || input === null) continue

      const candidate = input as { readonly type?: unknown; readonly col?: unknown }
      if (candidate.type !== "drop") continue

      const col = candidate.col
      if (
        typeof col !== "number" ||
        !Number.isInteger(col) ||
        col < 0 ||
        col >= COLS
      ) {
        continue
      }

      next = applyDrop(next, col)
    }

    return next
  },

  phase(state) {
    return state.phase
  },

  score(state, _context: ScoreContext): Score {
    const won = state.modeId !== "endless" && state.phase === "won"
    let value = 0
    let ranked = false

    if (state.modeId === "endless") {
      const ended = state.phase === "lost"
      const raw = state.chainPoints + Math.max(0, state.depth - 1) * ENDLESS_DEPTH_BONUS
      value = Math.min(MAX_SCORE, Math.max(0, raw))
      // A zero-point instant loss is not a leaderboard run; any scored run is.
      ranked = ended && value > 0
    } else if (won) {
      const raw =
        state.chainPoints +
        Math.max(0, SKIRMISH_MAX_DROPS - state.dropsUsed) * SKIRMISH_DROP_BONUS +
        SKIRMISH_WIN_BONUS
      value = Math.min(MAX_SCORE, Math.max(1, raw))
      ranked = true
    } else {
      // Show earned chain points live and on unranked losses instead of wiping to 0.
      value = Math.min(MAX_SCORE, Math.max(0, state.chainPoints))
    }

    return {
      value,
      type: "higher",
      won,
      ranked,
      detail: {
        mode: state.modeId,
        clearedTiles: state.clearedTiles,
        crackedCleared: state.crackedCleared,
        dropsUsed: state.dropsUsed,
        depth: state.depth,
        ...(state.modeId === "endless" ? { level: state.depth } : {}),
        maxChain: state.maxChain,
        chainPoints: state.chainPoints,
        won,
      },
    }
  },

  serialize(state) {
    return {
      mode: state.modeId,
      seed: state.seed,
      board: state.board.map((row) => row.map((cell) => cell)),
      currentTile: state.currentTile,
      nextTile: state.nextTile,
      bagIndex: state.bagIndex,
      bagPos: state.bagPos,
      dropsUsed: state.dropsUsed,
      clearedTiles: state.clearedTiles,
      crackedCleared: state.crackedCleared,
      chainPoints: state.chainPoints,
      maxChain: state.maxChain,
      depth: state.depth,
      phase: state.phase,
    }
  },
}
