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
  level: number
  roundStartTick: number
  levelReadyUntilTick: number
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
const OPENING_TICKS = 30
const LEVEL_READY_TICKS = 18
const LEVEL_BONUS = 120

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

function spawnBikes(level: number): CycleBike[] {
  const patterns: ReadonlyArray<ReadonlyArray<readonly [number, number, CycleDirection]>> = [
    [
      [8, 18, 1],
      [51, 18, 3],
    ],
    [
      [15, 6, 2],
      [45, 29, 0],
    ],
    [
      [8, 8, 1],
      [51, 27, 3],
    ],
    [
      [15, 29, 0],
      [45, 6, 2],
    ],
  ]
  const pattern = patterns[(Math.max(1, level) - 1) % patterns.length]!
  return pattern.map(([x, y, dir]) => ({
    x,
    y,
    dir,
    alive: true,
    trail: new Set([y * WIDTH + x]),
  }))
}

function strideFor(state: CycleState): number {
  if (state.modeId === "duel") return 1
  return state.level >= 3 ? 2 : 1
}

function pathFor(
  state: CycleState,
  bike: CycleBike,
  turn: Turn,
  stride: number,
): Array<{ x: number; y: number; index: number; outside: boolean }> {
  const direction = turnDirection(bike.dir, turn)
  const delta = DIRECTIONS[direction]!
  let x = bike.x
  let y = bike.y
  const path: Array<{ x: number; y: number; index: number; outside: boolean }> = []

  for (let step = 0; step < stride; step += 1) {
    x += delta[0]
    y += delta[1]
    const outside = x < 0 || y < 0 || x >= state.width || y >= state.height
    path.push({ x, y, index: y * state.width + x, outside })
  }

  return path
}

function resetRound(state: CycleState): void {
  state.bikes = spawnBikes(state.level)
  state.boostTicks = [0, 0]
  state.boostCooldown = [0, 0]
  state.roundStartTick = state.ticks
  state.levelReadyUntilTick = state.ticks + LEVEL_READY_TICKS
}

/**
 * Count the free cells reachable from a candidate cell. This is the AI's
 * lookahead: it prefers open space over a move that survives one tick but
 * seals the rider into a pocket.
 */
function edgeDistance(state: CycleState, start: number, blocked: Set<number>): number {
  if (blocked.has(start)) return Number.POSITIVE_INFINITY

  const size = state.width * state.height
  const seen = new Uint8Array(size)
  const depth = new Int32Array(size)
  const queue: number[] = [start]
  seen[start] = 1

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head]!
    const x = index % state.width
    const y = Math.floor(index / state.width)
    if (x === 0 || y === 0 || x === state.width - 1 || y === state.height - 1) {
      return depth[index]!
    }

    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue

      const next = ny * state.width + nx
      if (seen[next] || blocked.has(next)) continue
      seen[next] = 1
      depth[next] = depth[index]! + 1
      queue.push(next)
    }
  }

  return Number.POSITIVE_INFINITY
}

function freeSpaceInfo(
  state: CycleState,
  start: number,
  blocked: Set<number>,
): { count: number; edge: boolean } {
  if (blocked.has(start)) return { count: 0, edge: false }

  const size = state.width * state.height
  const seen = new Uint8Array(size)
  const stack: number[] = [start]
  seen[start] = 1
  let count = 0
  let edge = false

  while (stack.length > 0) {
    const index = stack.pop()!
    count += 1
    const x = index % state.width
    const y = Math.floor(index / state.width)
    if (x === 0 || y === 0 || x === state.width - 1 || y === state.height - 1) edge = true

    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue

      const next = ny * state.width + nx
      if (seen[next] || blocked.has(next)) continue
      seen[next] = 1
      stack.push(next)
    }
  }

  return { count, edge }
}

function freeSpace(state: CycleState, start: number, blocked: Set<number>): number {
  return freeSpaceInfo(state, start, blocked).count
}

function playerReplyPaths(
  state: CycleState,
  player: CycleBike,
  blocked: Set<number>,
  stride: number,
): Array<Array<{ x: number; y: number; index: number; outside: boolean }>> {
  const paths: Array<Array<{ x: number; y: number; index: number; outside: boolean }>> = []

  for (const turn of [-1, 0, 1] as const) {
    const path = pathFor(state, player, turn, stride)
    if (path.some((cell) => cell.outside || blocked.has(cell.index))) continue
    paths.push(path)
  }

  return paths
}

function aiTurn(state: CycleState, player: 0 | 1): Turn {
  const bike = state.bikes[player]
  if (!bike || !bike.alive) return 0

  const target = state.bikes[player === 0 ? 1 : 0]
  const blocked = blockedCells(state)
  const rng = createRng((state.seed ^ Math.imul(state.ticks + 1, 0x9e3779b1)) >>> 0)
  const stride = strideFor(state)
  const skill = Math.max(0, Math.min(6, state.level) - 1)
  const openingTicks = Math.max(0, OPENING_TICKS - skill * 8)
  const opening = state.ticks - state.roundStartTick <= openingTicks
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
    const path = pathFor(state, bike, turn, stride)
    if (path.some((cell) => cell.outside || blocked.has(cell.index))) continue
    const last = path[path.length - 1]!
    const after = new Set(blocked)
    for (const cell of path) after.add(cell.index)

    // The final cell is part of the new trail, but it is the start of the
    // space search, so remove it from the blocked copy.
    const spaceBlocked = new Set(after)
    spaceBlocked.delete(last.index)
    const aiSpace = freeSpaceInfo(state, last.index, spaceBlocked)

    // Worst-case reply: the player's legal moves include the one that seals
    // the AI's pocket. Evaluate the AI's space and exit after each reply.
    const replies = target ? playerReplyPaths(state, target, after, stride) : []
    let worstSpace = aiSpace.count
    let worstEdge = aiSpace.edge
    let worstExit = edgeDistance(state, last.index, spaceBlocked)
    let playerSpace = 0

    for (const reply of replies) {
      const afterPlayer = new Set(after)
      for (const cell of reply) afterPlayer.add(cell.index)
      const blockedForSpace = new Set(afterPlayer)
      blockedForSpace.delete(last.index)
      const info = freeSpaceInfo(state, last.index, blockedForSpace)
      worstSpace = Math.min(worstSpace, info.count)
      if (!info.edge) worstEdge = false
      worstExit = Math.max(worstExit, edgeDistance(state, last.index, blockedForSpace))

      const lastReply = reply[reply.length - 1]!
      const replyBlocked = new Set(afterPlayer)
      replyBlocked.delete(lastReply.index)
      playerSpace = Math.max(
        playerSpace,
        freeSpace(state, lastReply.index, replyBlocked),
      )
    }

    const distance = target ? Math.abs(last.x - target.x) + Math.abs(last.y - target.y) : 0
    const interceptDistance = intercept
      ? Math.abs(last.x - intercept.x) + Math.abs(last.y - intercept.y)
      : 0
    const chase = distance > 8 ? 1.6 + skill * 0.15 : 1

    // Survival first; treat a pocket that does not touch the border as a trap,
    // keep a short route to the open edge, then pursue and cut off. During the
    // opening the AI refuses to chase and backs away instead, so the player
    // has to commit first. Higher levels shorten the retreat, chase harder,
    // and weight the player's escape space more heavily.
    const danger = worstExit > 8 ? 0.2 : 1
    const safetyThreshold = Math.max(12, 24 - skill * 3)
    const safety = worstSpace < safetyThreshold || !worstEdge ? -400 : 0
    const trapWeight = 150 + skill * 25
    const trap = Number.isFinite(worstExit) ? worstExit * trapWeight : 3_000
    const turnPenalty = opening ? 0 : Math.max(10, 60 - skill * 12)
    const openingBonus = opening ? distance * 24 : 0
    const attack = opening ? 0 : 1
    const playerSpaceWeight = 2 + skill * 0.6
    const interceptWeight = 8 + skill * 2

    candidates.push({
      turn,
      score:
        worstSpace * 4 -
        playerSpace * playerSpaceWeight * attack -
        interceptDistance * interceptWeight * chase * danger * attack -
        distance * 2 * danger * attack -
        trap -
        turnPenalty +
        openingBonus +
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
    return {
      width: WIDTH,
      height: HEIGHT,
      seed,
      maxTicks: MAX_TICKS,
      modeId: mode.id,
      bikes: spawnBikes(1),
      phase: "playing",
      ticks: 0,
      boostTicks: [0, 0],
      boostCooldown: [0, 0],
      level: 1,
      roundStartTick: 0,
      levelReadyUntilTick: 0,
    }
  },

  step(state, inputs) {
    if (state.phase !== "playing") return state

    state.ticks += 1
    if (state.ticks >= state.maxTicks) {
      state.phase = "lost"
      return state
    }
    if (state.ticks < state.levelReadyUntilTick) return state

    const boosted = state.boostTicks.map((ticks) => ticks > 0)
    const turns: Turn[] = [0, 0]

    for (const input of inputs) {
      if (
        typeof input === "object" &&
        input !== null &&
        (input.player === 0 || input.player === 1) &&
        (input.turn === -1 || input.turn === 0 || input.turn === 1)
      ) {
        turns[input.player] = input.turn
      }
    }

    // Player 1 is the AI in solo mode; both riders are human in a duel.
    if (state.modeId !== "duel") turns[1] = aiTurn(state, 1)

    for (let player = 0; player < state.bikes.length; player += 1) {
      const bike = state.bikes[player]!
      if (!bike.alive) continue
      bike.dir = turnDirection(bike.dir, turns[player] ?? 0)
    }

    const stride = strideFor(state)
    const paths = state.bikes.map((bike) =>
      bike.alive ? pathFor(state, bike, 0, stride) : [],
    )
    const counts = new Map<number, number>()
    for (const path of paths) {
      for (const cell of path) {
        if (cell.outside) continue
        counts.set(cell.index, (counts.get(cell.index) ?? 0) + 1)
      }
    }

    for (let player = 0; player < state.bikes.length; player += 1) {
      const bike = state.bikes[player]!
      const path = paths[player]!
      if (!bike.alive) continue

      const blocked = path.some((cell) => cell.outside || occupied(state, cell.index))
      const headOn = path.some((cell) => !cell.outside && (counts.get(cell.index) ?? 0) > 1)
      if (blocked || headOn) bike.alive = false
    }

    for (let player = 0; player < state.bikes.length; player += 1) {
      const bike = state.bikes[player]!
      const path = paths[player]!
      if (!bike.alive) continue
      for (const cell of path) {
        bike.x = cell.x
        bike.y = cell.y
        bike.trail.add(cell.index)
      }
    }

    // A boosted rider takes an extra step after the normal move. If that cell
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

    if (state.modeId === "duel") {
      if (!human.alive) state.phase = "lost"
      else if (!other.alive) state.phase = "won"
    } else if (!human.alive) {
      state.phase = "lost"
    } else if (!other.alive) {
      // The AI died: clear the board and start the next level.
      state.level += 1
      resetRound(state)
    }

    if (state.phase === "playing" && state.ticks >= state.levelReadyUntilTick) {
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
      value: state.ticks + Math.max(0, state.level - 1) * LEVEL_BONUS,
      type: "higher",
      won: state.modeId === "duel" && state.phase === "won",
      ranked: state.phase !== "playing" && state.modeId !== "duel",
      detail: {
        ticks: state.ticks,
        level: state.level,
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
      lv: state.level,
      rs: state.roundStartTick,
      lr: state.levelReadyUntilTick,
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
