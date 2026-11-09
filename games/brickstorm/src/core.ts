import type { GameCore, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

export type BrickKind = "normal" | "save" | "explosive"

export interface BrickstormState {
  readonly width: number
  readonly height: number
  readonly seed: number
  paddleX: number
  readonly paddleWidth: number
  readonly paddleY: number
  ballX: number
  ballY: number
  vx: number
  vy: number
  left: boolean
  right: boolean
  targetX: number | undefined
  bricks: boolean[]
  kinds: BrickKind[]
  armor: number[]
  score: number
  hits: number
  saves: number
  blasts: number
  level: number
  levelBricks: number
  levelHits: number
  levelSaves: number
  ticks: number
  serveUntilTick: number
  ballLive: boolean
  speedLevel: number
  saveUntilTick: number
  relocated: number
  phase: Phase
}

export interface BrickstormInput {
  readonly left?: boolean
  readonly right?: boolean
  readonly target?: number
}

const WIDTH = 320
const HEIGHT = 240
const BALL = 4
const PADDLE_Y = HEIGHT - 18
const PADDLE_WIDTH = 58
const PADDLE_SPEED = 300
const MAX_TICKS = 36_000
const READY_TICKS = 3 * 60
const SAVE_TICKS = 5 * 60
const MAX_RELOCATIONS = 3
const MAX_SPEED_LEVEL = 3
const SPEED_STEP = 0.12
const LEVEL_SPEED_STEP = 0.1
const MAX_SPEED_FACTOR = 2.2
const MAX_GOLD = 12

export const BRICK_COLS = 8
export const BRICK_ROWS = 6
export const BRICK_TOP = 26
export const BRICK_HEIGHT = 11
export const BRICK_GAP = 4
export const BAND_GAP = 10
export const BRICK_LEFT = 12
export const BRICK_RIGHT = 12
export const BRICK_WIDTH =
  (WIDTH - BRICK_LEFT - BRICK_RIGHT - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS

// Unit-ish launch vectors made of exact binary fractions: 126² + 168² = 210².
const LAUNCH: ReadonlyArray<readonly [number, number]> = [
  [126, -168],
  [-126, -168],
  [168, -126],
  [-168, -126],
]

export function brickRect(index: number): { x: number; y: number; w: number; h: number } {
  const column = index % BRICK_COLS
  const row = Math.floor(index / BRICK_COLS)
  const band = Math.floor(row / 2)
  return {
    x: BRICK_LEFT + column * (BRICK_WIDTH + BRICK_GAP),
    y: BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP) + band * BAND_GAP,
    w: BRICK_WIDTH,
    h: BRICK_HEIGHT,
  }
}

function pointsForRow(row: number): number {
  return (BRICK_ROWS - row) * 10
}

function rowOf(index: number): number {
  return Math.floor(index / BRICK_COLS)
}

type LayoutId = "classic" | "ring" | "triangle" | "ellipse" | "diamond"

const LAYOUT_SEQUENCE: readonly LayoutId[] = [
  "classic",
  "ring",
  "triangle",
  "ellipse",
  "diamond",
]

function layoutForLevel(level: number): LayoutId {
  return LAYOUT_SEQUENCE[(Math.max(1, level) - 1) % LAYOUT_SEQUENCE.length]!
}

function layoutMask(layout: LayoutId): boolean[] {
  const mask: boolean[] = Array(BRICK_COLS * BRICK_ROWS).fill(false)
  let count = 0

  for (let row = 0; row < BRICK_ROWS; row += 1) {
    for (let column = 0; column < BRICK_COLS; column += 1) {
      let on = true
      const dx = (column - (BRICK_COLS - 1) / 2) / (BRICK_COLS / 2)
      const dy = (row - (BRICK_ROWS - 1) / 2) / (BRICK_ROWS / 2)
      const radius = Math.hypot(dx, dy)
      const diamond = Math.abs(dx) + Math.abs(dy)

      if (layout === "ring") {
        on = row === 0 || row === BRICK_ROWS - 1 || column === 0 || column === BRICK_COLS - 1
      } else if (layout === "triangle") {
        on = Math.abs(column - (BRICK_COLS - 1) / 2) <= row + 0.5
      } else if (layout === "ellipse") {
        on = radius >= 0.5 && radius <= 1.06
      } else if (layout === "diamond") {
        on = diamond >= 0.45 && diamond <= 1.08
      }

      if (!on) continue
      mask[row * BRICK_COLS + column] = true
      count += 1
    }
  }

  // Very small levels are not fun; fall back to the full wall.
  if (count < 20) return Array(BRICK_COLS * BRICK_ROWS).fill(true)
  return mask
}

function pickFrom(seed: number, candidates: readonly number[], count: number): number[] {
  if (candidates.length === 0 || count <= 0) return []
  return createRng(seed).shuffle([...candidates]).slice(0, count)
}

function takeOne(seed: number, candidates: readonly number[], used: Set<number>): number | undefined {
  const pool = candidates.filter((index) => !used.has(index))
  if (pool.length === 0) return undefined
  return createRng(seed).pick(pool)
}

function buildLevel(state: BrickstormState): void {
  const layout = layoutForLevel(state.level)
  const mask = layoutMask(layout)
  const cells = mask.flatMap((on, index) => (on ? [index] : []))
  const kinds: BrickKind[] = Array(BRICK_COLS * BRICK_ROWS).fill("normal")
  const armor: number[] = Array(BRICK_COLS * BRICK_ROWS).fill(0)
  const seed = (state.seed ^ Math.imul(state.level, 0x9e3779b1)) >>> 0
  const used = new Set<number>()

  const middle = cells.filter((index) => {
    const row = rowOf(index)
    return row === 2 || row === 3
  })
  const top = cells.filter((index) => rowOf(index) < 2)
  const bottom = cells.filter((index) => rowOf(index) >= 4)

  const save = takeOne(seed ^ 0x51ed270b, middle.length > 0 ? middle : cells, used)
  if (save !== undefined) {
    kinds[save] = "save"
    used.add(save)
  }

  const topExplosive = takeOne(seed ^ 0x1b873593, top.length > 0 ? top : cells, used)
  if (topExplosive !== undefined) {
    kinds[topExplosive] = "explosive"
    used.add(topExplosive)
  }

  const bottomExplosive = takeOne(seed ^ 0x85ebca6b, bottom.length > 0 ? bottom : cells, used)
  if (bottomExplosive !== undefined) {
    kinds[bottomExplosive] = "explosive"
    used.add(bottomExplosive)
  }

  const goldCount = Math.min(MAX_GOLD, 3 + (state.level - 1) * 2)
  const goldPool = cells.filter((index) => kinds[index] === "normal")
  for (const gold of pickFrom(seed ^ 0x27d4eb2f, goldPool, goldCount)) {
    armor[gold] = 3
  }

  state.bricks = mask
  state.kinds = kinds
  state.armor = armor
  state.levelBricks = cells.length
  state.levelHits = 0
  state.levelSaves = 0
  state.speedLevel = 0
  state.saveUntilTick = 0
  state.relocated = 0
  state.ballLive = false
  state.serveUntilTick = state.ticks + READY_TICKS
  state.ballX = state.paddleX
  state.ballY = state.paddleY - BALL
  state.vx = 0
  state.vy = 0
}

function advanceLevel(state: BrickstormState): void {
  state.score += state.level * 100
  state.level += 1
  buildLevel(state)
}

function launchBall(state: BrickstormState): void {
  state.ballX = state.paddleX
  state.ballY = state.paddleY - BALL
  const rng = createRng((state.seed ^ Math.imul(state.hits + 1, 0x9e3779b1)) >>> 0)
  const [vx, vy] = LAUNCH[rng.int(0, LAUNCH.length - 1)]!
  const factor = speedFactor(state)
  state.vx = vx * factor
  state.vy = vy * factor
  state.ballLive = true
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return value < min ? min : value > max ? max : value
}

export function speedFactor(state: BrickstormState): number {
  return Math.min(
    MAX_SPEED_FACTOR,
    1 + SPEED_STEP * state.speedLevel + LEVEL_SPEED_STEP * (state.level - 1),
  )
}

function updateSpeed(state: BrickstormState, scale: boolean): void {
  const next = Math.min(
    MAX_SPEED_LEVEL,
    Math.floor(state.levelHits / 12) + state.levelSaves,
  )
  if (next === state.speedLevel) return

  const prevFactor = speedFactor(state)
  state.speedLevel = next
  if (!scale || !state.ballLive) return

  const nextFactor = speedFactor(state)
  const ratio = nextFactor / prevFactor
  state.vx *= ratio
  state.vy *= ratio
}

function hitsBrick(state: BrickstormState, index: number): boolean {
  if (!state.bricks[index]) return false
  const rect = brickRect(index)
  return (
    state.ballX + BALL >= rect.x &&
    state.ballX - BALL <= rect.x + rect.w &&
    state.ballY + BALL >= rect.y &&
    state.ballY - BALL <= rect.y + rect.h
  )
}

function movePaddle(state: BrickstormState, dt: number): void {
  if (state.targetX !== undefined) {
    const half = state.paddleWidth / 2
    const target = clamp(state.targetX, half, state.width - half)
    const step = (PADDLE_SPEED * dt) / 1000
    const delta = target - state.paddleX
    state.paddleX += Math.abs(delta) <= step ? delta : Math.sign(delta) * step
  } else {
    const direction = (state.right ? 1 : 0) - (state.left ? 1 : 0)
    state.paddleX += (direction * (PADDLE_SPEED * dt)) / 1000
  }
  const half = state.paddleWidth / 2
  state.paddleX = clamp(state.paddleX, half, state.width - half)
}

function destroyBrick(state: BrickstormState, index: number, trigger: boolean): void {
  if (!state.bricks[index]) return

  const row = Math.floor(index / BRICK_COLS)
  const kind = state.kinds[index] ?? "normal"

  if ((state.armor[index] ?? 0) > 0) state.armor[index] = 0
  state.bricks[index] = false
  state.kinds[index] = "normal"
  state.score += pointsForRow(row)
  state.hits += 1
  state.levelHits += 1

  if (kind === "save" && trigger) {
    state.saves += 1
    state.levelSaves += 1
    state.saveUntilTick = Math.max(state.saveUntilTick, state.ticks + SAVE_TICKS)

    // Relocate the save brick to an empty middle-band cell, unless it was the
    // last brick or the relocation cap has been reached.
    const others = state.bricks.some((alive) => alive)
    if (others && state.relocated < MAX_RELOCATIONS) {
      const empty: number[] = []
      for (const candidateRow of [2, 3]) {
        for (let column = 0; column < BRICK_COLS; column += 1) {
          const candidate = candidateRow * BRICK_COLS + column
          if (!state.bricks[candidate]) empty.push(candidate)
        }
      }

      if (empty.length > 0) {
        const rng = createRng((state.seed ^ Math.imul(state.relocated + 1, 0x9e3779b1)) >>> 0)
        const next = rng.pick(empty)
        state.bricks[next] = true
        state.kinds[next] = "save"
        state.relocated += 1
      }
    }
  }

  if (kind === "explosive" && trigger) {
    state.blasts += 1
    const column = index % BRICK_COLS
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nextRow = row + dy
        const nextColumn = column + dx
        if (nextRow < 0 || nextRow >= BRICK_ROWS) continue
        if (nextColumn < 0 || nextColumn >= BRICK_COLS) continue
        destroyBrick(state, nextRow * BRICK_COLS + nextColumn, false)
      }
    }
  }

  updateSpeed(state, true)
}

function moveBall(state: BrickstormState, dt: number): void {
  const seconds = dt / 1000
  state.ballX += state.vx * seconds
  state.ballY += state.vy * seconds

  if (state.ballX - BALL < 0) {
    state.ballX = BALL
    state.vx = Math.abs(state.vx)
  } else if (state.ballX + BALL > state.width) {
    state.ballX = state.width - BALL
    state.vx = -Math.abs(state.vx)
  }

  if (state.ballY - BALL < 0) {
    state.ballY = BALL
    state.vy = Math.abs(state.vy)
  }

  const paddleLeft = state.paddleX - state.paddleWidth / 2
  const paddleRight = state.paddleX + state.paddleWidth / 2
  if (
    state.vy > 0 &&
    state.ballY + BALL >= state.paddleY &&
    state.ballY - BALL <= state.paddleY + 8 &&
    state.ballX >= paddleLeft - BALL &&
    state.ballX <= paddleRight + BALL
  ) {
    state.ballY = state.paddleY - BALL
    const offset = clamp((state.ballX - state.paddleX) / (state.paddleWidth / 2), -1, 1)
    let vx = offset * 168
    if (Math.abs(vx) < 12) vx = offset < 0 || (offset === 0 && state.vx < 0) ? -12 : 12
    const factor = speedFactor(state)
    state.vx = vx * factor
    state.vy = -126 * factor
  }

  // A save keeps the ball alive for a few seconds; it bounces off the floor.
  if (state.ballY - BALL > state.height) {
    if (state.ticks <= state.saveUntilTick) {
      state.ballY = state.height - BALL
      state.vy = -Math.abs(state.vy)
    } else {
      state.phase = "lost"
      return
    }
  }

  for (let index = 0; index < state.bricks.length; index += 1) {
    if (!hitsBrick(state, index)) continue
    const armor = state.armor[index] ?? 0

    if (armor > 1) {
      state.armor[index] = armor - 1
      state.score += 5
    } else {
      if (armor === 1) state.armor[index] = 0
      destroyBrick(state, index, true)
    }

    state.vy = -state.vy
    break
  }
}

export const core: GameCore<BrickstormState, BrickstormInput> = {
  create(seed) {
    const state: BrickstormState = {
      width: WIDTH,
      height: HEIGHT,
      seed,
      paddleX: WIDTH / 2,
      paddleWidth: PADDLE_WIDTH,
      paddleY: PADDLE_Y,
      ballX: WIDTH / 2,
      ballY: PADDLE_Y - BALL,
      vx: 0,
      vy: 0,
      left: false,
      right: false,
      targetX: undefined,
      bricks: [],
      kinds: [],
      armor: [],
      score: 0,
      hits: 0,
      saves: 0,
      blasts: 0,
      level: 1,
      levelBricks: 0,
      levelHits: 0,
      levelSaves: 0,
      ticks: 0,
      serveUntilTick: READY_TICKS,
      ballLive: false,
      speedLevel: 0,
      saveUntilTick: 0,
      relocated: 0,
      phase: "playing",
    }
    buildLevel(state)
    return state
  },

  step(state, inputs, dt) {
    for (const raw of inputs) {
      if (typeof raw !== "object" || raw === null) continue
      const input = raw as BrickstormInput
      if (typeof input.left === "boolean") {
        state.left = input.left
        state.targetX = undefined
      }
      if (typeof input.right === "boolean") {
        state.right = input.right
        state.targetX = undefined
      }
      if (typeof input.target === "number" && Number.isFinite(input.target)) {
        state.targetX = input.target
        state.left = false
        state.right = false
      }
    }

    if (state.phase !== "playing") return state

    state.ticks += 1
    if (state.ticks >= MAX_TICKS) {
      state.phase = "lost"
      return state
    }

    // The wall is cleared: rebuild it at the next level and keep the run alive.
    if (!state.bricks.some(Boolean)) {
      advanceLevel(state)
      return state
    }

    movePaddle(state, dt)

    if (!state.ballLive) {
      if (state.ticks >= state.serveUntilTick) {
        launchBall(state)
      } else {
        state.ballX = state.paddleX
        state.ballY = state.paddleY - BALL
        return state
      }
    }

    moveBall(state, dt)
    return state
  },

  phase(state) {
    return state.phase
  },

  score(state, context: ScoreContext): Score {
    return {
      value: state.score,
      type: "higher",
      won: false,
      ranked: state.phase !== "playing",
      detail: {
        level: state.level,
        bricks: state.levelHits,
        maxBricks: state.levelBricks + state.relocated,
        totalBricks: state.hits,
        saves: state.saves,
        blasts: state.blasts,
        speed: speedFactor(state),
        elapsedMs: context.elapsedMs,
      },
    }
  },

  serialize(state) {
    return {
      w: state.width,
      h: state.height,
      seed: state.seed,
      px: state.paddleX,
      bx: state.ballX,
      by: state.ballY,
      vx: state.vx,
      vy: state.vy,
      l: state.left,
      r: state.right,
      t: state.targetX ?? null,
      live: state.ballLive,
      ready: state.serveUntilTick,
      b: state.bricks,
      k: state.kinds,
      a: state.armor,
      s: state.score,
      n: state.hits,
      sv: state.saves,
      bl: state.blasts,
      lv: state.level,
      lb: state.levelBricks,
      lh: state.levelHits,
      ls: state.levelSaves,
      sp: state.speedLevel,
      c: state.ticks,
      u: state.saveUntilTick,
      q: state.relocated,
      p: state.phase,
    }
  },
}
