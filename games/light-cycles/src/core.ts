import type { GameCore, Mode, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

export type CycleDirection = 0 | 1 | 2 | 3
export type Turn = -1 | 0 | 1

export interface CycleBike {
  x: number
  y: number
  dir: CycleDirection
  alive: boolean
  trail: Set<number>
}

export interface CycleState {
  readonly width: number
  readonly height: number
  readonly seed: number
  readonly maxTicks: number
  readonly modeId: string
  bikes: CycleBike[]
  phase: Phase
  ticks: number
  boostTicks: number[]
  boostCooldown: number[]
}

export interface CycleInput {
  readonly player: 0 | 1
  readonly turn: Turn
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

const WIDTH = 60
const HEIGHT = 36
const MAX_TICKS = 3600
const BOOST_GAP = 6
const BOOST_TICKS = 12
const BOOST_COOLDOWN = 36

function turnDirection(direction: CycleDirection, turn: Turn): CycleDirection {
  return (((direction + turn + 4) % 4) as CycleDirection)
}

function nextCell(state: CycleState, bike: CycleBike): { x: number; y: number; index: number } {
  const delta = DIRECTIONS[bike.dir]!
  const x = bike.x + delta[0]
  const y = bike.y + delta[1]
  return { x, y, index: y * state.width + x }
}

function occupied(state: CycleState, index: number): boolean {
  return state.bikes.some((bike) => bike.trail.has(index))
}

function blockedCells(state: CycleState): Set<number> {
  const blocked = new Set<number>()
  for (const bike of state.bikes) {
    for (const index of bike.trail) blocked.add(index)
  }
  return blocked
}

/**
 * Count the free cells reachable from a candidate cell. This is the AI's
 * lookahead: it prefers open space over a move that survives one tick but
 * seals the rider into a pocket.
 */
function freeSpace(state: CycleState, start: number, blocked: Set<number>): number {
  if (blocked.has(start)) return 0

  const seen = new Set<number>([start])
  const stack = [start]
  let count = 0

  while (stack.length > 0) {
    const index = stack.pop()!
    count += 1
    const x = index % state.width
    const y = Math.floor(index / state.width)

    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue

      const next = ny * state.width + nx
      if (seen.has(next) || blocked.has(next)) continue
      seen.add(next)
      stack.push(next)
    }
  }

  return count
}

function playerEscape(
  state: CycleState,
  player: CycleBike,
  blocked: Set<number>,
): number {
  let best = 0

  for (const turn of [-1, 0, 1] as const) {
    const direction = turnDirection(player.dir, turn)
    const delta = DIRECTIONS[direction]!
    const x = player.x + delta[0]
    const y = player.y + delta[1]
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue

    const index = y * state.width + x
    if (blocked.has(index)) continue
    best = Math.max(best, freeSpace(state, index, blocked))
  }

  return best
}

function aiTurn(state: CycleState, player: 0 | 1): Turn {
  const bike = state.bikes[player]
  if (!bike || !bike.alive) return 0

  const target = state.bikes[player === 0 ? 1 : 0]
  const blocked = blockedCells(state)
  const rng = createRng((state.seed ^ Math.imul(state.ticks + 1, 0x9e3779b1)) >>> 0)
  const candidates: Array<{ turn: Turn; score: number }> = []

  // Aim at the player's next cell, not their current one, so the AI keeps
  // pace instead of trailing behind. If that cell is blocked or outside,
  // fall back to the player's head.
  const targetDelta = target ? DIRECTIONS[target.dir]! : [0, 0]
  const targetX = target ? target.x + targetDelta[0] : 0
  const targetY = target ? target.y + targetDelta[1] : 0
  const intercept =
    target &&
    targetX >= 0 &&
    targetY >= 0 &&
    targetX < state.width &&
    targetY < state.height
      ? { x: targetX, y: targetY }
      : target

  for (const turn of [-1, 0, 1] as const) {
    const direction = turnDirection(bike.dir, turn)
    const delta = DIRECTIONS[direction]!
    const x = bike.x + delta[0]
    const y = bike.y + delta[1]

    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue
    const index = y * state.width + x
    if (blocked.has(index)) continue

    const aiSpace = freeSpace(state, index, blocked)
    const after = new Set(blocked)
    after.add(index)

    // One-move prediction: assume the player takes their best legal reply,
    // then score the AI move by how little escape that reply leaves.
    const playerSpace = target ? playerEscape(state, target, after) : 0
    const distance = target ? Math.abs(x - target.x) + Math.abs(y - target.y) : 0
    const interceptDistance = intercept
      ? Math.abs(x - intercept.x) + Math.abs(y - intercept.y)
      : 0
    const chase = distance > 8 ? 1.6 : 1

    // Survival first; pursue the intercept, then cut off the reply; turning
    // costs momentum so the AI does not micro-turn while the player runs.
    const safety = aiSpace < 24 ? -400 : 0
    const turnPenalty = turn === 0 ? 0 : 60
    candidates.push({
      turn,
      score:
        aiSpace * 4 -
        playerSpace * 2 -
        interceptDistance * 8 * chase -
        distance * 2 -
        turnPenalty +
        safety +
        rng.next() * 2,
    })
  }

  if (candidates.length === 0) return 0
  candidates.sort((left, right) => right.score - left.score)
  return candidates[0]!.turn
}

export const core: GameCore<CycleState, CycleInput> = {
  create(seed, mode: Mode) {
    const player0: CycleBike = {
      x: 8,
      y: 18,
      dir: 1,
      alive: true,
      trail: new Set([18 * WIDTH + 8]),
    }

    const player1: CycleBike = {
      x: 51,
      y: 18,
      dir: 3,
      alive: true,
      trail: new Set([18 * WIDTH + 51]),
    }

    return {
      width: WIDTH,
      height: HEIGHT,
      seed,
      maxTicks: MAX_TICKS,
      modeId: mode.id,
      bikes: [player0, player1],
      phase: "playing",
      ticks: 0,
      boostTicks: [0, 0],
      boostCooldown: [0, 0],
    }
  },

  step(state, inputs) {
    if (state.phase !== "playing") return state

    state.ticks += 1
    const boosted = state.boostTicks.map((ticks) => ticks > 0)
    const turns: Turn[] = [0, 0]

    for (const input of inputs) {
      if (input.player === 0 || input.player === 1) turns[input.player] = input.turn
    }

    // Player 1 is the AI in solo mode; both riders are human in a duel.
    if (state.modeId !== "duel") turns[1] = aiTurn(state, 1)

    for (let player = 0; player < state.bikes.length; player += 1) {
      const bike = state.bikes[player]!
      if (!bike.alive) continue
      bike.dir = turnDirection(bike.dir, turns[player] ?? 0)
    }

    const next = state.bikes.map((bike) => (bike.alive ? nextCell(state, bike) : undefined))
    const nextCounts = new Map<number, number>()
    for (const cell of next) {
      if (!cell) continue
      nextCounts.set(cell.index, (nextCounts.get(cell.index) ?? 0) + 1)
    }

    for (let player = 0; player < state.bikes.length; player += 1) {
      const bike = state.bikes[player]!
      const cell = next[player]
      if (!bike.alive || !cell) continue

      const outside = cell.x < 0 || cell.y < 0 || cell.x >= state.width || cell.y >= state.height
      const hitTrail = !outside && occupied(state, cell.index)
      const headOn = nextCounts.get(cell.index)! > 1

      if (outside || hitTrail || headOn) bike.alive = false
    }

    for (let player = 0; player < state.bikes.length; player += 1) {
      const bike = state.bikes[player]!
      const cell = next[player]
      if (!bike.alive || !cell) continue
      bike.x = cell.x
      bike.y = cell.y
      bike.trail.add(cell.index)
    }

    // A boosted rider takes a second step after the normal move. If that cell
    // is blocked or outside, the boost simply fizzles for this tick.
    for (let player = 0; player < state.bikes.length; player += 1) {
      const bike = state.bikes[player]!
      if (boosted[player] && bike.alive) {
        const extra = nextCell(state, bike)
        const outside =
          extra.x < 0 ||
          extra.y < 0 ||
          extra.x >= state.width ||
          extra.y >= state.height
        if (!outside && !occupied(state, extra.index)) {
          bike.x = extra.x
          bike.y = extra.y
          bike.trail.add(extra.index)
        }
      }
      state.boostTicks[player] = Math.max(0, (state.boostTicks[player] ?? 0) - 1)
    }

    const human = state.bikes[0]!
    const other = state.bikes[1]!

    if (!human.alive && !other.alive) state.phase = "lost"
    else if (!human.alive) state.phase = "lost"
    else if (!other.alive) state.phase = "won"
    else if (state.ticks >= state.maxTicks) state.phase = "won"

    if (state.phase === "playing") {
      for (let player = 0; player < state.boostCooldown.length; player += 1) {
        state.boostCooldown[player] = Math.max(0, (state.boostCooldown[player] ?? 0) - 1)
      }

      const [trail0, trail1] = state.bikes.map((bike) => bike.trail.size)
      if (
        (trail0 ?? 0) + BOOST_GAP < (trail1 ?? 0) &&
        (state.boostCooldown[0] ?? 0) === 0 &&
        (state.boostTicks[0] ?? 0) === 0
      ) {
        state.boostTicks[0] = BOOST_TICKS
        state.boostCooldown[0] = BOOST_COOLDOWN
      } else if (
        (trail1 ?? 0) + BOOST_GAP < (trail0 ?? 0) &&
        (state.boostCooldown[1] ?? 0) === 0 &&
        (state.boostTicks[1] ?? 0) === 0
      ) {
        state.boostTicks[1] = BOOST_TICKS
        state.boostCooldown[1] = BOOST_COOLDOWN
      }
    }

    return state
  },

  phase(state) {
    return state.phase
  },

  score(state, _context: ScoreContext): Score {
    return {
      value: state.ticks,
      type: "higher",
      won: state.phase === "won",
      ranked: state.phase !== "playing",
      detail: {
        ticks: state.ticks,
        trail: state.bikes[0]?.trail.size ?? 0,
      },
    }
  },

  serialize(state) {
    return {
      w: state.width,
      h: state.height,
      t: state.ticks,
      p: state.phase,
      m: state.modeId,
      bo: state.boostTicks,
      bc: state.boostCooldown,
      b: state.bikes.map((bike) => ({
        x: bike.x,
        y: bike.y,
        d: bike.dir,
        a: bike.alive,
        t: Array.from(bike.trail).sort((left, right) => left - right),
      })),
    }
  },
}
