import type { GameCore, Mode, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

/** North connector bit (`0b0001`). */
export const NORTH = 1
/** East connector bit (`0b0010`). */
export const EAST = 2
/** South connector bit (`0b0100`). */
export const SOUTH = 4
/** West connector bit (`0b1000`). */
export const WEST = 8

/** Cardinal scan order used by generation and every analysis pass. */
export const DIRECTIONS = [NORTH, EAST, SOUTH, WEST] as const

export interface Point {
  readonly x: number
  readonly y: number
}

const DELTA: Readonly<Record<number, Point>> = {
  [NORTH]: { x: 0, y: -1 },
  [EAST]: { x: 1, y: 0 },
  [SOUTH]: { x: 0, y: 1 },
  [WEST]: { x: -1, y: 0 },
}

/** The edge that faces back across a connector. */
export function opposite(dir: number): number {
  return ((dir << 2) | (dir >> 2)) & 0b1111
}

/** One clockwise quarter turn. */
export function rotateCW(mask: number): number {
  return ((mask << 1) | (mask >> 3)) & 0b1111
}

/** One counter-clockwise quarter turn. */
export function rotateCCW(mask: number): number {
  return ((mask >> 1) | (mask << 3)) & 0b1111
}

/** Normalized clockwise rotation: positive `steps` is clockwise. */
export function rotateMask(mask: number, steps: number): number {
  const k = ((steps % 4) + 4) % 4
  return k === 0 ? mask : (((mask << k) | (mask >> (4 - k))) & 0b1111)
}

/**
 * Rotational period: a 4-way cross never changes (1), a straight is 180°
 * symmetric (2), and every other non-empty shape needs four turns (4).
 */
export function periodOf(mask: number): number {
  if (mask === 15) return 1
  if (mask === 5 || mask === 10) return 2
  return 4
}

export interface ModeSpec {
  readonly id: "easy" | "hard"
  readonly width: number
  readonly height: number
  readonly source: Point
  readonly minPar: number
}

export const EASY_SPEC: ModeSpec = {
  id: "easy",
  width: 5,
  height: 5,
  source: { x: 2, y: 2 },
  minPar: 12,
}

export const HARD_SPEC: ModeSpec = {
  id: "hard",
  width: 6,
  height: 6,
  source: { x: 3, y: 3 },
  minPar: 18,
}

/** Unknown mode ids fall back to Easy, matching `core.create` normalization. */
export function specFor(mode: Pick<Mode, "id"> | string): ModeSpec {
  const id = typeof mode === "string" ? mode : mode.id
  return id === "hard" ? HARD_SPEC : EASY_SPEC
}

export interface GeneratedBoard {
  readonly width: number
  readonly height: number
  readonly modeId: "easy" | "hard"
  readonly source: Point
  readonly solvedMasks: readonly number[]
  readonly initialMasks: readonly number[]
  readonly par: number
  readonly rotationBudget: number
}

export interface RouterState {
  readonly seed: number
  readonly modeId: string
  readonly width: number
  readonly height: number
  readonly source: Point
  readonly masks: readonly number[]
  readonly par: number
  readonly rotationBudget: number
  readonly rotationsUsed: number
  readonly phase: Phase
}

export type RouterInput = {
  readonly type: "rotate"
  readonly x: number
  readonly y: number
  readonly dir: 1 | -1
}

export interface CircuitAnalysis {
  /** BFS hops from the source; `-1` means unpowered. */
  readonly distances: readonly number[]
  readonly poweredCount: number
  readonly danglingCount: number
  readonly solved: boolean
}

/**
 * The one resolution path shared by `step`, `previewRotate`, `traceRotate`, and
 * generation. It scans every connector once for leaks, then floods power from
 * the source: a cell is solved only when every tile is powered and no pipe arm
 * points at the grid border or a neighbour's blank wall.
 */
export function analyzeCircuit(
  masks: readonly number[],
  width: number,
  height: number,
  source: Point,
): CircuitAnalysis {
  const cells = width * height
  let danglingCount = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mask = masks[y * width + x] ?? 0
      for (const dir of DIRECTIONS) {
        if ((mask & dir) === 0) continue
        const delta = DELTA[dir]!
        const nx = x + delta.x
        const ny = y + delta.y
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          danglingCount += 1
          continue
        }
        if (((masks[ny * width + nx] ?? 0) & opposite(dir)) === 0) danglingCount += 1
      }
    }
  }

  const distances = Array<number>(cells).fill(-1)
  const sourceIndex = source.y * width + source.x
  const queue: number[] = []
  let poweredCount = 0

  if (sourceIndex >= 0 && sourceIndex < cells) {
    distances[sourceIndex] = 0
    queue.push(sourceIndex)
    poweredCount = 1
  }

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head]!
    const x = index % width
    const y = Math.floor(index / width)
    const mask = masks[index] ?? 0
    for (const dir of DIRECTIONS) {
      if ((mask & dir) === 0) continue
      const delta = DELTA[dir]!
      const nx = x + delta.x
      const ny = y + delta.y
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const neighbor = ny * width + nx
      if (((masks[neighbor] ?? 0) & opposite(dir)) === 0) continue
      if (distances[neighbor] !== -1) continue
      distances[neighbor] = distances[index]! + 1
      poweredCount += 1
      queue.push(neighbor)
    }
  }

  return {
    distances,
    poweredCount,
    danglingCount,
    solved: poweredCount === cells && danglingCount === 0,
  }
}

const MAX_SCRAMBLE_ATTEMPTS = 32

interface FrontierEdge {
  readonly u: number
  readonly v: number
  readonly dir: number
}

/** Deterministic Prim tree, then a rotation scramble and its shortest-turn par. */
export function generateBoard(seed: number, mode: Pick<Mode, "id"> | string): GeneratedBoard {
  const spec = specFor(mode)
  const normalizedSeed = seed >>> 0
  const rng = createRng(normalizedSeed)
  const width = spec.width
  const height = spec.height
  const cells = width * height
  const source = { x: spec.source.x, y: spec.source.y }
  const sourceIndex = source.y * width + source.x

  const solvedMasks = Array<number>(cells).fill(0)
  const inTree = Array<boolean>(cells).fill(false)
  const degree = Array<number>(cells).fill(0)
  const frontier: FrontierEdge[] = []

  const pushNeighbors = (index: number): void => {
    const x = index % width
    const y = Math.floor(index / width)
    for (const dir of DIRECTIONS) {
      const delta = DELTA[dir]!
      const nx = x + delta.x
      const ny = y + delta.y
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const neighbor = ny * width + nx
      if (inTree[neighbor]) continue
      frontier.push({ u: index, v: neighbor, dir })
    }
  }

  inTree[sourceIndex] = true
  let visited = 1
  pushNeighbors(sourceIndex)

  while (visited < cells) {
    // Keep every edge to an unvisited cell; never swap-remove.
    const live = frontier.filter((edge) => !inTree[edge.v])
    if (live.length === 0) break

    // Suppress 4-way junctions so puzzles are not full of unrotatable crosses.
    const preferred = live.filter((edge) => degree[edge.u]! < 3)
    const pool = preferred.length > 0 ? preferred : live
    const edge = pool[rng.int(0, pool.length - 1)]!

    solvedMasks[edge.u] = solvedMasks[edge.u]! | edge.dir
    solvedMasks[edge.v] = solvedMasks[edge.v]! | opposite(edge.dir)
    degree[edge.u] = degree[edge.u]! + 1
    degree[edge.v] = degree[edge.v]! + 1
    inTree[edge.v] = true
    visited += 1

    // `pushNeighbors` re-filters on read, so keep the order-preserving list.
    frontier.length = 0
    frontier.push(...live)
    pushNeighbors(edge.v)
  }

  const scramble = (): { masks: number[]; par: number } => {
    const masks: number[] = []
    let par = 0
    for (let index = 0; index < cells; index += 1) {
      const period = periodOf(solvedMasks[index]!)
      const offset = period === 1 ? 0 : rng.int(0, period - 1)
      masks.push(rotateMask(solvedMasks[index]!, offset))
      par += Math.min(offset, period - offset)
    }
    return { masks, par }
  }

  let initial = scramble()
  for (let attempt = 1; attempt < MAX_SCRAMBLE_ATTEMPTS; attempt += 1) {
    if (
      !analyzeCircuit(initial.masks, width, height, source).solved &&
      initial.par >= spec.minPar
    ) {
      break
    }
    initial = scramble()
  }

  if (analyzeCircuit(initial.masks, width, height, source).solved || initial.par < spec.minPar) {
    // Deterministic fallback: exactly one clockwise turn on every movable tile.
    const masks: number[] = []
    let par = 0
    for (let index = 0; index < cells; index += 1) {
      const period = periodOf(solvedMasks[index]!)
      const offset = period === 1 ? 0 : 1
      masks.push(rotateMask(solvedMasks[index]!, offset))
      par += offset
    }
    initial = { masks, par }
  }

  const slack =
    spec.id === "easy"
      ? Math.max(8, Math.ceil(initial.par * 0.6))
      : Math.max(12, Math.ceil(initial.par * 1.0))
  const rotationBudget = initial.par + slack

  return {
    width,
    height,
    modeId: spec.id,
    source,
    solvedMasks,
    initialMasks: initial.masks,
    par: initial.par,
    rotationBudget,
  }
}

export interface RotatePreview {
  readonly valid: boolean
  readonly x: number
  readonly y: number
  readonly dir: 1 | -1
  readonly nextMask: number
  readonly newlyPowered: readonly Point[]
  readonly lostPower: readonly Point[]
  readonly poweredCount: number
  readonly danglingCount: number
  readonly solved: boolean
}

export interface RotateTrace {
  readonly rotated: Point
  readonly nextMask: number
  readonly lost: readonly Point[]
  readonly waves: readonly (readonly Point[])[]
  readonly poweredCount: number
  readonly danglingCount: number
  readonly solved: boolean
}

function point(index: number, width: number): Point {
  return { x: index % width, y: Math.floor(index / width) }
}

function inBounds(state: RouterState, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < state.width &&
    y >= 0 &&
    y < state.height
  )
}

function validDir(dir: number): dir is 1 | -1 {
  return dir === 1 || dir === -1
}

/** What a quarter turn would do, using the same `analyzeCircuit` as `step`. */
export function previewRotate(
  state: RouterState,
  x: number,
  y: number,
  dir: 1 | -1 = 1,
): RotatePreview | null {
  if (state.phase !== "playing") return null
  if (!inBounds(state, x, y) || !validDir(dir)) return null

  const index = y * state.width + x
  const mask = state.masks[index]!
  const before = analyzeCircuit(state.masks, state.width, state.height, state.source)

  if (mask === 15) {
    return {
      valid: false,
      x,
      y,
      dir,
      nextMask: 15,
      newlyPowered: [],
      lostPower: [],
      poweredCount: before.poweredCount,
      danglingCount: before.danglingCount,
      solved: false,
    }
  }

  const nextMasks = [...state.masks]
  nextMasks[index] = rotateMask(mask, dir)
  const after = analyzeCircuit(nextMasks, state.width, state.height, state.source)

  const newlyPowered: Point[] = []
  const lostPower: Point[] = []
  for (let at = 0; at < after.distances.length; at += 1) {
    if (before.distances[at] === -1 && after.distances[at]! >= 0) {
      newlyPowered.push(point(at, state.width))
    } else if (before.distances[at]! >= 0 && after.distances[at] === -1) {
      lostPower.push(point(at, state.width))
    }
  }

  return {
    valid: true,
    x,
    y,
    dir,
    nextMask: nextMasks[index]!,
    newlyPowered,
    lostPower,
    poweredCount: after.poweredCount,
    danglingCount: after.danglingCount,
    solved: after.solved,
  }
}

/** Per-wave power propagation for the view's 160 ms surge animation. */
export function traceRotate(
  state: RouterState,
  x: number,
  y: number,
  dir: 1 | -1 = 1,
): RotateTrace | null {
  if (state.phase !== "playing") return null
  if (!inBounds(state, x, y) || !validDir(dir)) return null

  const index = y * state.width + x
  const mask = state.masks[index]!
  if (mask === 15) return null

  const before = analyzeCircuit(state.masks, state.width, state.height, state.source)
  const nextMasks = [...state.masks]
  nextMasks[index] = rotateMask(mask, dir)
  const after = analyzeCircuit(nextMasks, state.width, state.height, state.source)

  const newlyPowered: number[] = []
  const lost: Point[] = []
  for (let at = 0; at < after.distances.length; at += 1) {
    if (before.distances[at] === -1 && after.distances[at]! >= 0) {
      newlyPowered.push(at)
    } else if (before.distances[at]! >= 0 && after.distances[at] === -1) {
      lost.push(point(at, state.width))
    }
  }

  const buckets: Point[][] = [[], [], [], [], []]
  if (newlyPowered.length > 0) {
    const minNewDist = Math.min(...newlyPowered.map((at) => after.distances[at]!))
    const maxRelDist = Math.max(...newlyPowered.map((at) => after.distances[at]! - minNewDist))
    for (const at of newlyPowered) {
      const rel = after.distances[at]! - minNewDist
      const bucket =
        maxRelDist < 5 ? rel : Math.min(4, Math.floor((rel * 5) / (maxRelDist + 1)))
      buckets[bucket]!.push(point(at, state.width))
    }
  }

  return {
    rotated: { x, y },
    nextMask: nextMasks[index]!,
    lost,
    waves: buckets.filter((wave) => wave.length > 0),
    poweredCount: after.poweredCount,
    danglingCount: after.danglingCount,
    solved: after.solved,
  }
}

/** Hard score ceiling, mirrored by `meta.score.max`. */
export const MAX_SCORE = 10_000
export const WIN_FLOOR = 100
export const OVER_PAR_PENALTY = 50

/** Base score for a completed circuit. */
export function modeBase(modeId: string): number {
  return modeId === "hard" ? 5_000 : 2_500
}

/** The live `Est.` number: base minus 50 per turn over par, 0 after a loss. */
export function projectedScore(state: RouterState): number {
  if (state.phase === "lost") return 0
  const overPar = Math.max(0, state.rotationsUsed - state.par)
  return Math.min(MAX_SCORE, Math.max(WIN_FLOOR, modeBase(state.modeId) - overPar * OVER_PAR_PENALTY))
}

export const core: GameCore<RouterState, RouterInput> = {
  create(seed, mode: Mode): RouterState {
    const generated = generateBoard(seed, mode)
    return {
      seed: seed >>> 0,
      modeId: generated.modeId,
      width: generated.width,
      height: generated.height,
      source: { ...generated.source },
      masks: [...generated.initialMasks],
      par: generated.par,
      rotationBudget: generated.rotationBudget,
      rotationsUsed: 0,
      phase: "playing",
    }
  },

  step(state, inputs, _dt) {
    if (!Array.isArray(inputs)) return state

    let next = state
    for (const input of inputs) {
      if (next.phase !== "playing") break
      if (typeof input !== "object" || input === null) continue

      const candidate = input as {
        readonly type?: unknown
        readonly x?: unknown
        readonly y?: unknown
        readonly dir?: unknown
      }
      if (candidate.type !== "rotate") continue
      if (typeof candidate.x !== "number" || typeof candidate.y !== "number") continue
      if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) continue
      if (candidate.x < 0 || candidate.x >= next.width) continue
      if (candidate.y < 0 || candidate.y >= next.height) continue
      if (candidate.dir !== 1 && candidate.dir !== -1) continue

      const index = candidate.y * next.width + candidate.x
      const mask = next.masks[index]!
      const rotated = rotateMask(mask, candidate.dir)
      // Symmetric tiles (notably the 4-way cross) cost nothing.
      if (rotated === mask) continue

      const masks = [...next.masks]
      masks[index] = rotated
      const rotationsUsed = next.rotationsUsed + 1
      const analysis = analyzeCircuit(masks, next.width, next.height, next.source)
      const phase: Phase = analysis.solved
        ? "won"
        : rotationsUsed >= next.rotationBudget
          ? "lost"
          : "playing"

      next = { ...next, masks, rotationsUsed, phase }
    }

    return next
  },

  phase(state) {
    return state.phase
  },

  score(state, _context: ScoreContext): Score {
    const won = state.phase === "won"
    const overPar = Math.max(0, state.rotationsUsed - state.par)
    const analysis = analyzeCircuit(state.masks, state.width, state.height, state.source)

    return {
      value: won ? projectedScore(state) : 0,
      type: "higher",
      won,
      ranked: won,
      detail: {
        mode: state.modeId,
        width: state.width,
        height: state.height,
        par: state.par,
        rotationsUsed: state.rotationsUsed,
        rotationBudget: state.rotationBudget,
        overPar,
        poweredCount: analysis.poweredCount,
        totalCells: state.width * state.height,
        baseScore: modeBase(state.modeId),
        won,
      },
    }
  },

  serialize(state) {
    return {
      seed: state.seed,
      mode: state.modeId,
      width: state.width,
      height: state.height,
      source: { x: state.source.x, y: state.source.y },
      masks: [...state.masks],
      par: state.par,
      rotationBudget: state.rotationBudget,
      rotationsUsed: state.rotationsUsed,
      phase: state.phase,
    }
  },
}
