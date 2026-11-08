import type { GameCore, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

export interface BreakoutState {
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
  score: number
  hits: number
  ticks: number
  phase: Phase
}

export interface BreakoutInput {
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
const BALL_SPEED = 210
const COLS = 8
const ROWS = 5
const BRICK_TOP = 30
const BRICK_HEIGHT = 12
const BRICK_GAP = 4
const BRICK_LEFT = 12
const BRICK_RIGHT = 12
const MAX_TICKS = 36_000

// Unit-ish launch vectors made of exact binary fractions: 126² + 168² = 210².
const LAUNCH: ReadonlyArray<readonly [number, number]> = [
  [126, -168],
  [-126, -168],
  [168, -126],
  [-168, -126],
]

function brickRow(index: number): number {
  return Math.floor(index / COLS)
}

function brickRect(index: number): { x: number; y: number; w: number; h: number } {
  const column = index % COLS
  const row = brickRow(index)
  const width = (WIDTH - BRICK_LEFT - BRICK_RIGHT - BRICK_GAP * (COLS - 1)) / COLS
  return {
    x: BRICK_LEFT + column * (width + BRICK_GAP),
    y: BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
    w: width,
    h: BRICK_HEIGHT,
  }
}

function pointsForRow(row: number): number {
  return (ROWS - row) * 10
}

function resetBall(state: BreakoutState): void {
  state.ballX = state.width / 2
  state.ballY = state.height * 0.62
  const rng = createRng((state.seed ^ Math.imul(state.hits + 1, 0x9e3779b1)) >>> 0)
  const [vx, vy] = LAUNCH[rng.int(0, LAUNCH.length - 1)]!
  state.vx = vx
  state.vy = vy
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return value < min ? min : value > max ? max : value
}

function hitsBrick(state: BreakoutState, index: number): boolean {
  if (!state.bricks[index]) return false
  const rect = brickRect(index)
  return (
    state.ballX + BALL >= rect.x &&
    state.ballX - BALL <= rect.x + rect.w &&
    state.ballY + BALL >= rect.y &&
    state.ballY - BALL <= rect.y + rect.h
  )
}

function movePaddle(state: BreakoutState, dt: number): void {
  if (state.targetX !== undefined) {
    const half = state.paddleWidth / 2
    const target = clamp(state.targetX, half, state.width - half)
    const step = (PADDLE_SPEED * dt) / 1000
    const delta = target - state.paddleX
    state.paddleX += Math.abs(delta) <= step ? delta : Math.sign(delta) * step
  } else {
    const direction = (state.right ? 1 : 0) - (state.left ? 1 : 0)
    state.paddleX += direction * (PADDLE_SPEED * dt) / 1000
  }
  const half = state.paddleWidth / 2
  state.paddleX = clamp(state.paddleX, half, state.width - half)
}

function moveBall(state: BreakoutState, dt: number): void {
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
    state.vx = vx
    state.vy = -126
  }

  for (let index = 0; index < state.bricks.length; index += 1) {
    if (!hitsBrick(state, index)) continue
    state.bricks[index] = false
    state.score += pointsForRow(brickRow(index))
    state.hits += 1
    state.vy = -state.vy
    break
  }

  if (state.bricks.every((alive) => !alive)) state.phase = "won"
  else if (state.ballY - BALL > state.height) state.phase = "lost"
}

export const core: GameCore<BreakoutState, BreakoutInput> = {
  create(seed) {
    const state: BreakoutState = {
      width: WIDTH,
      height: HEIGHT,
      seed,
      paddleX: WIDTH / 2,
      paddleWidth: PADDLE_WIDTH,
      paddleY: PADDLE_Y,
      ballX: WIDTH / 2,
      ballY: HEIGHT * 0.62,
      vx: 0,
      vy: -BALL_SPEED,
      left: false,
      right: false,
      targetX: undefined,
      bricks: Array(COLS * ROWS).fill(true),
      score: 0,
      hits: 0,
      ticks: 0,
      phase: "playing",
    }
    resetBall(state)
    return state
  },

  step(state, inputs, dt) {
    for (const raw of inputs) {
      if (typeof raw !== "object" || raw === null) continue
      const input = raw as BreakoutInput
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

    movePaddle(state, dt)
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
      won: state.phase === "won",
      ranked: state.phase !== "playing",
      detail: {
        bricks: state.hits,
        maxBricks: COLS * ROWS,
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
      b: state.bricks,
      s: state.score,
      n: state.hits,
      k: state.ticks,
      p: state.phase,
    }
  },
}
