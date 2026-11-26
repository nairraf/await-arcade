import type { GameCore, Mode, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

/**
 * Crate Pusher — a compact Sokoban-shaped puzzle on a rectangular grid.
 *
 * Pure and deterministic: the only randomness is `createRng(seed >>> 0)`; the
 * only wall clock is the host's replay duration, which `score()` ignores.
 */

export type MoveDir = "up" | "down" | "left" | "right"
export type LossReason = "none" | "stuck"
export type CrateModeId = "easy" | "hard" | "endless"

/** Fixed cardinal scan order everywhere (BFS, pull enumeration, wall checks). */
export const DIRS: readonly MoveDir[] = ["up", "right", "down", "left"]
export const DX: Readonly<Record<MoveDir, number>> = { up: 0, right: 1, down: 0, left: -1 }
export const DY: Readonly<Record<MoveDir, number>> = { up: -1, right: 0, down: 1, left: 0 }
export const OPP: Readonly<Record<MoveDir, MoveDir>> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
}

export const MAX_SCORE = 999_999
export const WIN_FLOOR = 100
export const EASY_ROOMS = 3
export const HARD_ROOMS = 3
export const EASY_BASE = 500
export const HARD_BASE = 900
export const EASY_PAR_BONUS = 50
export const HARD_PAR_BONUS = 80
export const ENDLESS_STAGE_BONUS = 150
export const EFFICIENCY_EXPONENT = 1.5

export const MAX_GEN_ATTEMPTS = 64
export const OPTIMUM_MAX_NODES = 300_000

export type CrateInput = { readonly type: "move"; readonly dir: MoveDir }

export interface CrateState {
  readonly seed: number
  readonly modeId: CrateModeId
  readonly room: number
  readonly totalRooms: number | null
  readonly width: number
  readonly height: number
  readonly walls: readonly boolean[]
  readonly goals: readonly number[]
  readonly crates: readonly number[]
  readonly operator: number
  readonly par: number
  readonly roomMoves: number
  readonly movesUsed: number
  readonly bankedPoints: number
  readonly phase: Phase
  readonly lossReason: LossReason
}

export interface Point {
  /** 0-indexed column (`0 <= x < width`). */
  readonly x: number
  /** 0-indexed row (`0 <= y < height`). */
  readonly y: number
}

export interface MovePreview {
  readonly valid: boolean
  readonly dir: MoveDir
  readonly target: Point | null
  readonly pushedFrom: Point | null
  readonly pushedTo: Point | null
  readonly landsOnGoal: boolean
  readonly wouldWin: boolean
  readonly wouldStick: boolean
  readonly blockedReason: "none" | "oob" | "wall" | "blocked-push"
}

export interface MoveTrace {
  readonly dir: MoveDir
  readonly fromOp: Point
  readonly toOp: Point
  readonly pushedFrom: Point | null
  readonly pushedTo: Point | null
  readonly landedOnGoal: boolean
  readonly stuckCell: Point | null
  readonly solved: boolean
}

export interface ModeSpec {
  readonly id: "easy" | "hard"
  readonly width: number
  readonly height: number
  readonly goalCount: number
  readonly wallCount: number
  readonly targetPulls: number
  readonly minPar: number
  readonly modeBase: number
}

export interface GeneratedBoard {
  readonly width: number
  readonly height: number
  readonly modeId: "easy" | "hard"
  readonly walls: readonly boolean[]
  readonly goals: readonly number[]
  readonly initialCrates: readonly number[]
  readonly initialOperator: number
  readonly par: number
  readonly optimalSolution: readonly CrateInput[]
  readonly canonicalSolution: readonly CrateInput[]
}

const EASY_SPEC: ModeSpec = {
  id: "easy",
  width: 6,
  height: 6,
  goalCount: 2,
  wallCount: 6,
  targetPulls: 9,
  minPar: 10,
  modeBase: EASY_BASE,
}

const HARD_SPEC: ModeSpec = {
  id: "hard",
  width: 7,
  height: 7,
  goalCount: 3,
  wallCount: 10,
  targetPulls: 12,
  minPar: 15,
  modeBase: HARD_BASE,
}

export function normalizeModeId(mode: Pick<Mode, "id"> | string): CrateModeId {
  const id = typeof mode === "string" ? mode : mode.id
  if (id === "hard" || id === "endless") return id
  return "easy"
}

export function totalRoomsFor(modeId: CrateModeId): number | null {
  return modeId === "endless" ? null : modeId === "hard" ? HARD_ROOMS : EASY_ROOMS
}

export function boardModeFor(modeId: CrateModeId, room: number): "easy" | "hard" {
  if (modeId === "hard") return "hard"
  if (modeId === "endless" && room >= 3) return "hard"
  return "easy"
}

export function roomSeed(seed: number, room: number): number {
  const base = seed >>> 0
  return room <= 1 ? base : (base ^ Math.imul(room - 1, 0x9e3779b1)) >>> 0
}

export function specFor(mode: Pick<Mode, "id"> | string, room = 1): ModeSpec {
  const modeId = normalizeModeId(mode)
  return boardModeFor(modeId, room) === "hard" ? HARD_SPEC : EASY_SPEC
}

export function roomCeiling(modeId: CrateModeId, room: number, par: number): number {
  const hardBoard = boardModeFor(modeId, room) === "hard"
  const base = hardBoard ? HARD_BASE : EASY_BASE
  const perPar = hardBoard ? HARD_PAR_BONUS : EASY_PAR_BONUS
  const stageBonus = modeId === "endless" ? Math.max(0, room - 1) * ENDLESS_STAGE_BONUS : 0
  return base + par * perPar + stageBonus
}

export function roomScore(modeId: CrateModeId, room: number, par: number, moves: number): number {
  const ceiling = roomCeiling(modeId, room, par)
  if (moves <= par) return Math.min(MAX_SCORE, ceiling)
  const ratio = par / moves
  const scaled = Math.round(ceiling * ratio * Math.sqrt(ratio))
  return Math.min(MAX_SCORE, Math.max(WIN_FLOOR, scaled))
}

/** `index = y * width + x`, or `null` when the step leaves the board. */
export function stepPos(
  pos: number,
  dir: MoveDir,
  width: number,
  height: number,
): number | null {
  const nx = (pos % width) + DX[dir]
  const ny = Math.floor(pos / width) + DY[dir]
  if (nx < 0 || nx >= width || ny < 0 || ny >= height) return null
  return ny * width + nx
}

export function toPoint(pos: number, width: number): Point {
  return { x: pos % width, y: Math.floor(pos / width) }
}

export function isStaticBlocked(
  pos: number,
  dir: MoveDir,
  walls: readonly boolean[],
  width: number,
  height: number,
): boolean {
  const next = stepPos(pos, dir, width, height)
  return next === null || walls[next] === true
}

/** A non-goal cell blocked along both axes can never be pushed out again. */
export function isCornerCell(
  pos: number,
  walls: readonly boolean[],
  width: number,
  height: number,
): boolean {
  return (
    (isStaticBlocked(pos, "up", walls, width, height) ||
      isStaticBlocked(pos, "down", walls, width, height)) &&
    (isStaticBlocked(pos, "left", walls, width, height) ||
      isStaticBlocked(pos, "right", walls, width, height))
  )
}

export function findStuckCrate(
  crates: readonly number[],
  goals: readonly number[],
  walls: readonly boolean[],
  width: number,
  height: number,
): number {
  for (let index = 0; index < crates.length; index += 1) {
    const cell = crates[index]!
    if (goals.includes(cell)) continue
    if (isCornerCell(cell, walls, width, height)) return index
  }
  return -1
}

interface ResolvedMove {
  readonly valid: boolean
  readonly target: number | null
  readonly crateIdx: number
  readonly pushedFrom: number | null
  readonly pushedTo: number | null
  readonly nextOperator: number
  readonly nextCrates: readonly number[]
  readonly blockedReason: "none" | "oob" | "wall" | "blocked-push"
}

/** The single move/push resolution path shared by step, preview, and trace. */
function resolveMove(state: CrateState, dir: MoveDir): ResolvedMove {
  const target = stepPos(state.operator, dir, state.width, state.height)
  if (target === null) {
    return {
      valid: false,
      target: null,
      crateIdx: -1,
      pushedFrom: null,
      pushedTo: null,
      nextOperator: state.operator,
      nextCrates: state.crates,
      blockedReason: "oob",
    }
  }

  if (state.walls[target] === true) {
    return {
      valid: false,
      target,
      crateIdx: -1,
      pushedFrom: null,
      pushedTo: null,
      nextOperator: state.operator,
      nextCrates: state.crates,
      blockedReason: "wall",
    }
  }

  const crateIdx = state.crates.indexOf(target)
  if (crateIdx < 0) {
    return {
      valid: true,
      target,
      crateIdx: -1,
      pushedFrom: null,
      pushedTo: null,
      nextOperator: target,
      nextCrates: state.crates,
      blockedReason: "none",
    }
  }

  const behind = stepPos(target, dir, state.width, state.height)
  if (
    behind === null ||
    state.walls[behind] === true ||
    state.crates.includes(behind)
  ) {
    return {
      valid: false,
      target,
      crateIdx,
      pushedFrom: target,
      pushedTo: null,
      nextOperator: state.operator,
      nextCrates: state.crates,
      blockedReason: "blocked-push",
    }
  }

  const nextCrates = [...state.crates]
  nextCrates[crateIdx] = behind
  return {
    valid: true,
    target,
    crateIdx,
    pushedFrom: target,
    pushedTo: behind,
    nextOperator: target,
    nextCrates,
    blockedReason: "none",
  }
}

interface Outcome {
  readonly phase: Phase
  readonly lossReason: LossReason
  readonly roomCleared: boolean
  readonly wouldWin: boolean
  readonly stuckCell: number | null
}

function classify(
  nextCrates: readonly number[],
  state: CrateState,
): Outcome {
  const goalSet = new Set(state.goals)
  const roomCleared = nextCrates.every((cell) => goalSet.has(cell))
  if (roomCleared) {
    const finalWin = state.totalRooms !== null && state.room >= state.totalRooms
    return {
      phase: finalWin ? "won" : "playing",
      lossReason: "none",
      roomCleared: true,
      wouldWin: finalWin,
      stuckCell: null,
    }
  }

  const stuck = findStuckCrate(
    nextCrates,
    state.goals,
    state.walls,
    state.width,
    state.height,
  )
  if (stuck >= 0) {
    return {
      phase: "lost",
      lossReason: "stuck",
      roomCleared: false,
      wouldWin: false,
      stuckCell: nextCrates[stuck]!,
    }
  }

  return {
    phase: "playing",
    lossReason: "none",
    roomCleared: false,
    wouldWin: false,
    stuckCell: null,
  }
}

export function previewMove(state: CrateState, dir: MoveDir): MovePreview | null {
  if (state.phase !== "playing") return null
  if (!DIRS.includes(dir)) return null

  const resolved = resolveMove(state, dir)
  const outcome = resolved.valid ? classify(resolved.nextCrates, state) : null
  const landsOnGoal =
    resolved.valid &&
    resolved.pushedTo !== null &&
    state.goals.includes(resolved.pushedTo)

  return {
    valid: resolved.valid,
    dir,
    target: resolved.target === null ? null : toPoint(resolved.target, state.width),
    pushedFrom:
      resolved.pushedFrom === null ? null : toPoint(resolved.pushedFrom, state.width),
    pushedTo: resolved.pushedTo === null ? null : toPoint(resolved.pushedTo, state.width),
    landsOnGoal,
    wouldWin: outcome?.wouldWin === true,
    wouldStick: outcome?.stuckCell !== null && outcome?.stuckCell !== undefined,
    blockedReason: resolved.blockedReason,
  }
}

export function traceMove(state: CrateState, dir: MoveDir): MoveTrace | null {
  if (state.phase !== "playing") return null
  if (!DIRS.includes(dir)) return null
  const preview = previewMove(state, dir)
  if (preview === null || !preview.valid) return null

  const resolved = resolveMove(state, dir)
  const outcome = classify(resolved.nextCrates, state)
  return {
    dir,
    fromOp: toPoint(state.operator, state.width),
    toOp: toPoint(resolved.nextOperator, state.width),
    pushedFrom: preview.pushedFrom,
    pushedTo: preview.pushedTo,
    landedOnGoal: preview.landsOnGoal,
    stuckCell: outcome.stuckCell === null ? null : toPoint(outcome.stuckCell, state.width),
    solved: outcome.wouldWin,
  }
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

function connectedOpenCount(
  walls: readonly boolean[],
  width: number,
  height: number,
): number {
  const total = width * height
  const start = walls.findIndex((wall) => !wall)
  if (start < 0) return 0

  const seen = new Uint8Array(total)
  const queue: number[] = [start]
  seen[start] = 1
  let count = 0

  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]!
    count += 1
    const x = cell % width
    const y = Math.floor(cell / width)
    if (y > 0) {
      const next = cell - width
      if (!walls[next] && !seen[next]) {
        seen[next] = 1
        queue.push(next)
      }
    }
    if (x < width - 1) {
      const next = cell + 1
      if (!walls[next] && !seen[next]) {
        seen[next] = 1
        queue.push(next)
      }
    }
    if (y < height - 1) {
      const next = cell + width
      if (!walls[next] && !seen[next]) {
        seen[next] = 1
        queue.push(next)
      }
    }
    if (x > 0) {
      const next = cell - 1
      if (!walls[next] && !seen[next]) {
        seen[next] = 1
        queue.push(next)
      }
    }
  }
  return count
}

/** Shortest walk from `from` to `target` over free cells, as forward `MoveDir`s. */
/** Walk from `from` to `target` using parents already computed by the Stage 4 BFS. */
function reconstructWalk(
  from: number,
  target: number,
  parentDir: readonly (MoveDir | null)[],
  width: number,
  height: number,
): MoveDir[] | null {
  const reversed: MoveDir[] = []
  let cursor = target
  while (cursor !== from) {
    const dir = parentDir[cursor]
    if (dir === null || dir === undefined) return null
    reversed.push(dir)
    const previous = stepPos(cursor, OPP[dir], width, height)
    if (previous === null) return null
    cursor = previous
  }
  return reversed.reverse()
}

interface RawState {
  readonly operator: number
  readonly crates: readonly number[]
}

/** Raw forward move/push rules without stuck detection. */
function rawStep(
  state: RawState,
  dir: MoveDir,
  walls: readonly boolean[],
  width: number,
  height: number,
): RawState | null {
  const target = stepPos(state.operator, dir, width, height)
  if (target === null || walls[target]) return null
  const crateIdx = state.crates.indexOf(target)
  if (crateIdx < 0) return { operator: target, crates: state.crates }

  const behind = stepPos(target, dir, width, height)
  if (behind === null || walls[behind] || state.crates.includes(behind)) return null
  const crates = [...state.crates]
  crates[crateIdx] = behind
  return { operator: target, crates }
}

function allOnGoals(crates: readonly number[], goalSet: ReadonlySet<number>): boolean {
  return crates.every((cell) => goalSet.has(cell))
}

/** First win along `inputs` under raw rules, or `null` if it never wins. */
function simulateRaw(
  operator: number,
  crates: readonly number[],
  inputs: readonly CrateInput[],
  walls: readonly boolean[],
  goals: readonly number[],
  width: number,
  height: number,
): { readonly moves: number } | null {
  const goalSet = new Set(goals)
  let state: RawState = { operator, crates }
  if (allOnGoals(crates, goalSet)) return { moves: 0 }

  for (let index = 0; index < inputs.length; index += 1) {
    const next = rawStep(state, inputs[index]!.dir, walls, width, height)
    if (next === null) return null
    state = next
    if (allOnGoals(state.crates, goalSet)) return { moves: index + 1 }
  }
  return null
}

interface Optimum {
  readonly par: number
  readonly solution: readonly MoveDir[]
}

function packStateKey(operator: number, crates: readonly number[], total: number): number {
  const sorted = [...crates].sort((a, b) => a - b)
  let key = operator
  for (const cell of sorted) key = key * total + cell
  return key
}

/**
 * Exhaustive BFS optimal `par` from the scrambled start under raw rules.
 * Rejects only when the popped-node cap is exceeded or no solution exists.
 */
function solveOptimum(
  operator: number,
  crates: readonly number[],
  walls: readonly boolean[],
  goals: readonly number[],
  width: number,
  height: number,
): Optimum | null {
  const total = width * height
  const goalSet = new Set(goals)
  const startKey = packStateKey(operator, crates, total)

  const visited = new Set<number>([startKey])
  const parent = new Map<number, { readonly previous: number; readonly dir: MoveDir }>()
  const queue: Array<{ readonly operator: number; readonly crates: readonly number[]; readonly moves: number; readonly key: number }> = [
    { operator, crates, moves: 0, key: startKey },
  ]
  let popped = 0
  let head = 0

  while (head < queue.length) {
    if (popped >= OPTIMUM_MAX_NODES) return null
    const current = queue[head]!
    head += 1
    popped += 1

    for (const dir of DIRS) {
      const next = rawStep(current, dir, walls, width, height)
      if (next === null) continue

      // Dead states: a non-goal crate in a static corner can never move again.
      let dead = false
      for (const cell of next.crates) {
        if (!goalSet.has(cell) && isCornerCell(cell, walls, width, height)) {
          dead = true
          break
        }
      }
      if (dead) continue

      const key = packStateKey(next.operator, next.crates, total)
      if (visited.has(key)) continue
      visited.add(key)
      parent.set(key, { previous: current.key, dir })

      if (allOnGoals(next.crates, goalSet)) {
        const reversed: MoveDir[] = [dir]
        let cursor = current.key
        while (cursor !== startKey) {
          const step = parent.get(cursor)
          if (!step) return null
          reversed.push(step.dir)
          cursor = step.previous
        }
        return { par: current.moves + 1, solution: reversed.reverse() }
      }

      queue.push({ operator: next.operator, crates: next.crates, moves: current.moves + 1, key })
    }
  }

  return null
}

interface Pull {
  readonly crateIdx: number
  readonly dir: MoveDir
  readonly t: number
  readonly o: number
}

export function generateBoard(
  seed: number,
  mode: Pick<Mode, "id"> | string,
  options: { readonly maxAttempts?: number } = {},
): GeneratedBoard {
  const spec = specFor(mode)
  const normalizedSeed = seed >>> 0
  const maxAttempts = options.maxAttempts ?? MAX_GEN_ATTEMPTS
  const rng = createRng(normalizedSeed)
  const total = spec.width * spec.height

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // Stage 1 — static walls.
    const walls = new Array<boolean>(total).fill(false)
    const openPool: number[] = Array.from({ length: total }, (_, index) => index)
    for (let k = 0; k < spec.wallCount; k += 1) {
      const pick = rng.int(0, openPool.length - 1)
      const cell = openPool.splice(pick, 1)[0]!
      walls[cell] = true
    }
    if (connectedOpenCount(walls, spec.width, spec.height) !== total - spec.wallCount) {
      continue
    }

    // Stage 2 — goals with a two-cell approach on at least one axis.
    const pullableGoals = openPool.filter((goal) => {
      for (const dir of DIRS) {
        const c1 = stepPos(goal, dir, spec.width, spec.height)
        if (c1 === null || walls[c1]) continue
        const c2 = stepPos(c1, dir, spec.width, spec.height)
        if (c2 === null || walls[c2]) continue
        return true
      }
      return false
    })
    if (pullableGoals.length < spec.goalCount) continue

    const goalPool = [...pullableGoals]
    const goals: number[] = []
    for (let k = 0; k < spec.goalCount; k += 1) {
      const pick = rng.int(0, goalPool.length - 1)
      goals.push(goalPool.splice(pick, 1)[0]!)
    }
    goals.sort((a, b) => a - b)
    const goalSet = new Set(goals)

    // Stage 3 — solved-state operator start.
    const crates: number[] = [...goals]
    const operatorPool = openPool.filter((cell) => !goalSet.has(cell))
    if (operatorPool.length === 0) continue
    let operator = operatorPool[rng.int(0, operatorPool.length - 1)]!

    // Stage 4 — reverse pull scramble.
    const reverseSteps: MoveDir[] = []
    let lastPull: { readonly crateIdx: number; readonly dir: MoveDir } | null = null
    let pullsDone = 0

    for (let p = 0; p < spec.targetPulls; p += 1) {
      const crateSet = new Set(crates)

      // BFS over free cells from the operator, fixed up/right/down/left order.
      const dist = new Int32Array(total).fill(-1)
      const parentDir = new Array<MoveDir | null>(total).fill(null)
      const queue: number[] = [operator]
      dist[operator] = 0
      for (let head = 0; head < queue.length; head += 1) {
        const cell = queue[head]!
        for (const dir of DIRS) {
          const next = stepPos(cell, dir, spec.width, spec.height)
          if (next === null || walls[next]) continue
          if (crateSet.has(next)) continue
          if ((dist[next] ?? -1) >= 0) continue
          dist[next] = dist[cell]! + 1
          parentDir[next] = dir
          queue.push(next)
        }
      }

      const legal: Pull[] = []
      for (let ci = 0; ci < crates.length; ci += 1) {
        const b = crates[ci]!
        for (const dir of DIRS) {
          const t = stepPos(b, dir, spec.width, spec.height)
          if (t === null || walls[t] || crateSet.has(t) || (dist[t] ?? -1) < 0) continue
          const o = stepPos(t, dir, spec.width, spec.height)
          if (o === null || walls[o] || crateSet.has(o)) continue
          legal.push({ crateIdx: ci, dir, t, o })
        }
      }

      let pool = legal
      if (lastPull !== null) {
        const nonBack = legal.filter(
          (move) => !(move.crateIdx === lastPull!.crateIdx && move.dir === OPP[lastPull!.dir]),
        )
        if (nonBack.length > 0) pool = nonBack
      }
      if (pool.length === 0) break

      const chosen = pool[rng.int(0, pool.length - 1)]!

      if (pullsDone > 0) {
        const path = reconstructWalk(
          operator,
          chosen.t,
          parentDir,
          spec.width,
          spec.height,
        )
        if (path === null) break
        reverseSteps.push(...path)
      }
      reverseSteps.push(chosen.dir)

      crates[chosen.crateIdx] = chosen.t
      operator = chosen.o
      lastPull = { crateIdx: chosen.crateIdx, dir: chosen.dir }
      pullsDone += 1
    }

    // Stage 5 — acceptance, canonical solution, true optimal par.
    if (pullsDone < spec.targetPulls) continue
    if (crates.some((cell) => goalSet.has(cell))) continue

    const initialCrates = [...crates].sort((a, b) => a - b)
    const rawForward: CrateInput[] = reverseSteps
      .slice()
      .reverse()
      .map((dir) => ({ type: "move", dir: OPP[dir] }))

    const canonical = simulateRaw(
      operator,
      initialCrates,
      rawForward,
      walls,
      goals,
      spec.width,
      spec.height,
    )
    if (canonical === null) continue
    const canonicalSolution = rawForward.slice(0, canonical.moves)
    if (canonicalSolution.length === 0) continue

    const optimum = solveOptimum(
      operator,
      initialCrates,
      walls,
      goals,
      spec.width,
      spec.height,
    )
    if (optimum === null) continue
    if (optimum.par < spec.minPar) continue
    if (optimum.par > canonicalSolution.length) continue

    const optimalSolution: CrateInput[] = optimum.solution.map((dir) => ({
      type: "move",
      dir,
    }))

    return {
      width: spec.width,
      height: spec.height,
      modeId: spec.id,
      walls,
      goals,
      initialCrates,
      initialOperator: operator,
      par: optimum.par,
      optimalSolution,
      canonicalSolution,
    }
  }

  return spec.id === "hard" ? FALLBACK_HARD : FALLBACK_EASY
}

/**
 * Pinned deterministic fallbacks, copied from verified seed 1 outputs.
 * `create()` can always build a board, even with `maxAttempts: 0`.
 */
export const FALLBACK_EASY: GeneratedBoard = {
  width: 6,
  height: 6,
  modeId: "easy",
  walls: [
    true, false, false, false, false, false,
    false, false, false, true, false, false,
    false, false, false, false, false, false,
    true, false, false, false, true, false,
    false, false, false, false, false, false,
    false, false, false, true, false, true,
  ],
  goals: [21, 25],
  initialCrates: [14, 28],
  initialOperator: 20,
  par: 17,
  optimalSolution: [
    { type: "move", dir: "left" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "up" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
  ],
  canonicalSolution: [
    { type: "move", dir: "up" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "up" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "up" },
    { type: "move", dir: "left" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "left" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "up" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
  ],
}

export const FALLBACK_HARD: GeneratedBoard = {
  width: 7,
  height: 7,
  modeId: "hard",
  walls: [
    true, false, false, false, false, false, false,
    false, true, true, false, false, true, false,
    false, false, false, false, false, false, false,
    false, false, false, true, false, true, false,
    false, false, false, false, false, false, false,
    false, false, false, false, true, false, true,
    false, false, false, false, true, false, true,
  ],
  goals: [2, 17, 47],
  initialCrates: [18, 32, 40],
  initialOperator: 11,
  par: 32,
  optimalSolution: [
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "down" },
    { type: "move", dir: "up" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "left" },
    { type: "move", dir: "up" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
  ],
  canonicalSolution: [
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "right" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "down" },
    { type: "move", dir: "left" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "left" },
    { type: "move", dir: "up" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "right" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "up" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "left" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "down" },
    { type: "move", dir: "right" },
    { type: "move", dir: "down" },
  ],
}

/* ------------------------------------------------------------------ */
/* Core                                                                */
/* ------------------------------------------------------------------ */

function applyMove(state: CrateState, dir: MoveDir): CrateState {
  const resolved = resolveMove(state, dir)
  if (!resolved.valid) return state

  const nextRoomMoves = state.roomMoves + 1
  const nextMovesUsed = state.movesUsed + 1
  const outcome = classify(resolved.nextCrates, state)

  if (outcome.roomCleared) {
    const earned = roomScore(state.modeId, state.room, state.par, nextRoomMoves)
    const nextBanked = Math.min(MAX_SCORE, state.bankedPoints + earned)

    if (outcome.wouldWin) {
      return {
        ...state,
        crates: [...resolved.nextCrates],
        operator: resolved.nextOperator,
        roomMoves: nextRoomMoves,
        movesUsed: nextMovesUsed,
        bankedPoints: nextBanked,
        phase: "won",
        lossReason: "none",
      }
    }

    const nextRoom = state.room + 1
    const nextBoard = generateBoard(
      roomSeed(state.seed, nextRoom),
      boardModeFor(state.modeId, nextRoom),
    )
    return {
      ...state,
      room: nextRoom,
      width: nextBoard.width,
      height: nextBoard.height,
      walls: [...nextBoard.walls],
      goals: [...nextBoard.goals],
      crates: [...nextBoard.initialCrates],
      operator: nextBoard.initialOperator,
      par: nextBoard.par,
      roomMoves: 0,
      movesUsed: nextMovesUsed,
      bankedPoints: nextBanked,
      phase: "playing",
      lossReason: "none",
    }
  }

  return {
    ...state,
    crates: [...resolved.nextCrates],
    operator: resolved.nextOperator,
    roomMoves: nextRoomMoves,
    movesUsed: nextMovesUsed,
    phase: outcome.phase,
    lossReason: outcome.lossReason,
  }
}

export const core: GameCore<CrateState, CrateInput> = {
  create(seed, mode: Mode): CrateState {
    const modeId = normalizeModeId(mode)
    const normalizedSeed = seed >>> 0
    const generated = generateBoard(roomSeed(normalizedSeed, 1), boardModeFor(modeId, 1))
    return {
      seed: normalizedSeed,
      modeId,
      room: 1,
      totalRooms: totalRoomsFor(modeId),
      width: generated.width,
      height: generated.height,
      walls: [...generated.walls],
      goals: [...generated.goals],
      crates: [...generated.initialCrates],
      operator: generated.initialOperator,
      par: generated.par,
      roomMoves: 0,
      movesUsed: 0,
      bankedPoints: 0,
      phase: "playing",
      lossReason: "none",
    }
  },

  step(state, inputs, _dt) {
    if (!Array.isArray(inputs)) return state

    let next = state
    for (const input of inputs) {
      if (next.phase !== "playing") break
      if (typeof input !== "object" || input === null) continue

      const candidate = input as { readonly type?: unknown; readonly dir?: unknown }
      if (candidate.type !== "move") continue
      const dir = candidate.dir
      if (typeof dir !== "string" || !DIRS.includes(dir as MoveDir)) continue

      next = applyMove(next, dir as MoveDir)
    }

    return next
  },

  phase(state) {
    return state.phase
  },

  score(state, _context: ScoreContext): Score {
    const overPar = Math.max(0, state.roomMoves - state.par)
    const liveRoom =
      state.phase === "playing"
        ? roomScore(state.modeId, state.room, state.par, Math.max(state.par, state.roomMoves))
        : 0

    const goalSet = new Set(state.goals)
    const cratesOnGoals = state.crates.filter((cell) => goalSet.has(cell)).length
    const won = state.modeId !== "endless" && state.phase === "won"
    const value = Math.min(MAX_SCORE, Math.max(0, state.bankedPoints + liveRoom))
    const ranked =
      state.modeId === "endless" ? state.phase === "lost" && state.bankedPoints > 0 : won

    return {
      value,
      type: "higher",
      won,
      ranked,
      detail: {
        mode: state.modeId,
        room: state.room,
        totalRooms: state.totalRooms ?? 0,
        ...(state.modeId === "endless" ? { level: state.room } : {}),
        width: state.width,
        height: state.height,
        par: state.par,
        roomMoves: state.roomMoves,
        movesUsed: state.movesUsed,
        overPar,
        cratesOnGoals,
        totalCrates: state.goals.length,
        bankedPoints: state.bankedPoints,
        roomCeiling: roomCeiling(state.modeId, state.room, state.par),
        lossReason: state.lossReason,
        won,
      },
    }
  },

  serialize(state) {
    return {
      mode: state.modeId,
      seed: state.seed,
      room: state.room,
      totalRooms: state.totalRooms,
      width: state.width,
      height: state.height,
      walls: [...state.walls],
      goals: [...state.goals],
      crates: [...state.crates],
      operator: state.operator,
      par: state.par,
      roomMoves: state.roomMoves,
      movesUsed: state.movesUsed,
      bankedPoints: state.bankedPoints,
      phase: state.phase,
      lossReason: state.lossReason,
    }
  },
}
