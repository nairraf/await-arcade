import type { GameCore, Mode, Phase, Score } from "@await-arcade/contract"
import { createRng, type Rng } from "@await-arcade/framework"

export interface Point {
  readonly x: number
  readonly y: number
}

export type EnemyKind = "striker" | "lancer" | "mortar"

export type EnemyIntent =
  | { readonly kind: "none" }
  | { readonly kind: "melee"; readonly dx: -1 | 0 | 1; readonly dy: -1 | 0 | 1 }
  | { readonly kind: "beam"; readonly dx: -1 | 0 | 1; readonly dy: -1 | 0 | 1 }
  | { readonly kind: "blast"; readonly target: Point }

export interface Enemy {
  readonly id: number
  readonly kind: EnemyKind
  x: number
  y: number
  hp: number
  readonly maxHp: number
  cooldown?: boolean
  intent: EnemyIntent
}

export interface LockstepState {
  readonly size: number
  readonly seed: number
  readonly modeId: string
  readonly targetSectors: number
  readonly walls: readonly Point[]
  player: Point
  hp: number
  readonly maxHp: number
  pulseCooldown: number
  sector: number
  turns: number
  /** Turn number when the current sector began; drives the clear-speed bonus. */
  sectorStartedAt: number
  kills: number
  crushes: number
  points: number
  lastLog: string
  enemies: Enemy[]
  nextEnemyId: number
  phase: Phase
}

export type LockstepInput =
  | { readonly action: "move"; readonly dx: number; readonly dy: number }
  | { readonly action: "pulse" }
  | { readonly action: "wait" }

const SIZE = 5
const MAX_HP = 3
const SKIRMISH_SECTORS = 5
/**
 * Set on activation, then decremented at the end of the same turn, so the real
 * lockout is two turns: 2 -> 1 -> ready. Kept as 3 so the value is still visible
 * on the HUD for the turn it was spent.
 */
const PULSE_COOLDOWN = 3
/** Turns a sector is "allowed" before its clear-speed bonus decays to zero. */
export const SECTOR_PAR = 6
/** Points per turn saved under par, so efficient sectors actually score. */
export const PAR_BONUS_PER_TURN = 12
/** Points per point of HP still standing when the last sector falls. */
const VICTORY_HP_BONUS = 40
/**
 * Hard score ceiling, mirrored by `meta.score.max`. Endless bonus growth is
 * unbounded (25 x sector per clear), so without a cap a long enough run would
 * one day be rejected by the verifier as "outside the declared bounds". Reaching
 * this needs roughly 1,300 sectors, far past the 10k input ceiling.
 */
export const MAX_SCORE = 999_999
const CARDINALS: readonly { readonly dx: -1 | 0 | 1; readonly dy: -1 | 0 | 1 }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
]

const DIAGONALS: readonly { readonly dx: -1 | 1; readonly dy: -1 | 1 }[] = [
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 1 },
]

function inBounds(x: number, y: number, size = SIZE): boolean {
  return x >= 0 && y >= 0 && x < size && y < size
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function hasWall(walls: readonly Point[], x: number, y: number): boolean {
  return walls.some((wall) => wall.x === x && wall.y === y)
}

function enemyAt(enemies: readonly Enemy[], x: number, y: number): Enemy | undefined {
  return enemies.find((enemy) => enemy.x === x && enemy.y === y && enemy.hp > 0)
}

function unitStep(delta: number): -1 | 0 | 1 {
  if (delta > 0) return 1
  if (delta < 0) return -1
  return 0
}

function sign(value: number): -1 | 0 | 1 {
  return unitStep(value)
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function sectorRng(seed: number, sector: number, salt = 0): Rng {
  const mixed = (seed ^ Math.imul(sector + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0
  return createRng(mixed)
}

function isConnectedWithout(walls: readonly Point[], origin: Point): boolean {
  const seen = new Set<string>([`${origin.x},${origin.y}`])
  const queue: Point[] = [origin]
  let openCount = 0
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!hasWall(walls, x, y)) openCount += 1
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const dir of CARDINALS) {
      const nx = cur.x + dir.dx
      const ny = cur.y + dir.dy
      if (!inBounds(nx, ny) || hasWall(walls, nx, ny)) continue
      const key = `${nx},${ny}`
      if (seen.has(key)) continue
      seen.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  return seen.size === openCount
}

function rosterForSector(sector: number): readonly EnemyKind[] {
  if (sector === 1) return ["striker", "lancer"]
  if (sector === 2) return ["striker", "lancer", "mortar"]
  if (sector === 3) return ["striker", "lancer", "lancer", "mortar"]
  const base: EnemyKind[] = ["striker", "lancer", "mortar", "striker", "lancer"]
  if (sector <= 5) return base.slice(0, Math.min(5, 3 + Math.floor(sector / 2)))
  // Past the Skirmish roster Endless keeps escalating instead of repeating one
  // memorised layout: one extra body every other sector, capped by the board.
  const extra = Math.min(2, Math.floor((sector - 4) / 2))
  return [...base, ...(["mortar", "lancer"] as const).slice(0, extra)]
}

interface IntentCells {
  /** Every cell the overlay should mark for this enemy. */
  readonly path: readonly Point[]
  /** The cells that actually take damage when the telegraph resolves. */
  readonly impact: readonly Point[]
}

/**
 * Walk a beam cell by cell until it leaves the board, meets a pillar, or meets
 * an enemy. The player is transparent here so a beam aimed through the runner
 * still marks the tiles behind them — dodging backwards stays legible.
 */
function traceBeam(
  state: LockstepState,
  origin: Point,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
): readonly Point[] {
  if (dx === 0 && dy === 0) return []
  const cells: Point[] = []
  let cx = origin.x + dx
  let cy = origin.y + dy

  while (inBounds(cx, cy, state.size) && !hasWall(state.walls, cx, cy)) {
    const cell = { x: cx, y: cy }
    cells.push(cell)
    if (enemyAt(state.enemies, cx, cy)) break
    cx += dx
    cy += dy
  }

  return cells
}

/**
 * The one description of an enemy's telegraph: which cells the overlay marks,
 * and which of them take damage. `dangerCells()` reads `path`; turn resolution
 * reads `impact`. Keeping both in a single function is what stops the overlay
 * and the damage rule from drifting apart.
 */
function intentCells(state: LockstepState, enemy: Enemy): IntentCells {
  const intent = enemy.intent

  if (intent.kind === "melee") {
    const x = enemy.x + intent.dx
    const y = enemy.y + intent.dy
    const cells = inBounds(x, y, state.size) && !hasWall(state.walls, x, y) ? [{ x, y }] : []
    return { path: cells, impact: cells }
  }

  if (intent.kind === "beam") {
    const path = traceBeam(state, enemy, intent.dx, intent.dy)
    // Resolution stops at the first occupied cell along the path; the path
    // itself already stops at an enemy, so the player is the only extra case.
    const hit = path.find(
      (cell) => samePoint(cell, state.player) || enemyAt(state.enemies, cell.x, cell.y),
    )
    return { path, impact: hit ? [hit] : [] }
  }

  if (intent.kind === "blast") {
    const cells = [
      intent.target,
      ...DIAGONALS.map((dir) => ({ x: intent.target.x + dir.dx, y: intent.target.y + dir.dy })),
    ].filter((cell) => inBounds(cell.x, cell.y, state.size) && !hasWall(state.walls, cell.x, cell.y))
    return { path: cells, impact: cells }
  }

  return { path: [], impact: [] }
}

/**
 * Compute all grid cells currently threatened by living enemies' telegraphs.
 * Used by both turn resolution (enemy phase) and the UI danger overlay.
 */
export function dangerCells(state: LockstepState): Point[] {
  const seen = new Set<string>()
  const cells: Point[] = []
  const add = (x: number, y: number): void => {
    if (!inBounds(x, y, state.size) || hasWall(state.walls, x, y)) return
    const key = `${x},${y}`
    if (seen.has(key)) return
    seen.add(key)
    cells.push({ x, y })
  }

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue
    for (const cell of intentCells(state, enemy).path) add(cell.x, cell.y)
  }
  return cells
}

function hasLineOfSight(
  walls: readonly Point[],
  from: Point,
  to: Point,
): boolean {
  if (from.x !== to.x && from.y !== to.y) return false
  const dx = sign(to.x - from.x)
  const dy = sign(to.y - from.y)
  let cx = from.x + dx
  let cy = from.y + dy
  while (inBounds(cx, cy) && !(cx === to.x && cy === to.y)) {
    if (hasWall(walls, cx, cy)) return false
    cx += dx
    cy += dy
  }
  return true
}

function pickStepToward(state: LockstepState, enemy: Enemy, target: Point): Point | undefined {
  // 5x5 BFS so Strikers navigate smoothly around pillars without stalling.
  const queue: Array<{ x: number; y: number; first?: Point }> = [{ x: enemy.x, y: enemy.y }]
  const seen = new Set<string>([`${enemy.x},${enemy.y}`])

  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const dir of CARDINALS) {
      const nx = cur.x + dir.dx
      const ny = cur.y + dir.dy
      if (!inBounds(nx, ny) || hasWall(state.walls, nx, ny)) continue
      const key = `${nx},${ny}`
      if (seen.has(key)) continue
      const first = cur.first ?? { x: nx, y: ny }
      if (nx === target.x && ny === target.y) {
        // A blocked first step means this route is unusable, not that the unit
        // should give up: keep searching for a path that starts somewhere legal.
        if (samePoint(first, state.player) || enemyAt(state.enemies, first.x, first.y)) continue
        return first
      }
      if (enemyAt(state.enemies, nx, ny)) continue
      seen.add(key)
      queue.push({ x: nx, y: ny, first })
    }
  }
  return undefined
}

/**
 * Lancers can only fire along a row or column, so they have to reach a cell
 * with line of sight first. Stepping greedily toward the player has local
 * minima — one pillar between the two of them can bounce the lancer between
 * two cells forever — so BFS to the nearest firing position instead, and fall
 * back to walking toward the player if every firing position is boxed in.
 */
function pickLancerStep(state: LockstepState, enemy: Enemy): Point | undefined {
  const queue: Array<{ x: number; y: number; first?: Point }> = [{ x: enemy.x, y: enemy.y }]
  const seen = new Set<string>([`${enemy.x},${enemy.y}`])

  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const dir of CARDINALS) {
      const nx = cur.x + dir.dx
      const ny = cur.y + dir.dy
      if (!inBounds(nx, ny) || hasWall(state.walls, nx, ny)) continue
      const key = `${nx},${ny}`
      if (seen.has(key)) continue
      const cell = { x: nx, y: ny }
      if (samePoint(cell, state.player) || enemyAt(state.enemies, nx, ny)) continue
      const first = cur.first ?? cell
      if (hasLineOfSight(state.walls, cell, state.player)) return first
      seen.add(key)
      queue.push({ x: nx, y: ny, first })
    }
  }

  return pickStepToward(state, enemy, state.player)
}

function planEnemies(state: LockstepState): void {
  const ordered = [...state.enemies].sort((a, b) => a.id - b.id)
  for (const enemy of ordered) {
    if (enemy.hp <= 0) continue

    if (enemy.kind === "striker") {
      if (manhattan(enemy, state.player) === 1) {
        enemy.intent = {
          kind: "melee",
          dx: sign(state.player.x - enemy.x),
          dy: sign(state.player.y - enemy.y),
        }
        continue
      }
      const next = pickStepToward(state, enemy, state.player)
      if (next) {
        enemy.x = next.x
        enemy.y = next.y
      }
      if (manhattan(enemy, state.player) === 1) {
        enemy.intent = {
          kind: "melee",
          dx: sign(state.player.x - enemy.x),
          dy: sign(state.player.y - enemy.y),
        }
      } else {
        enemy.intent = { kind: "none" }
      }
      continue
    }

    if (enemy.kind === "lancer") {
      if (enemy.cooldown) {
        enemy.cooldown = false
        enemy.intent = { kind: "none" }
        const next = pickStepToward(state, enemy, state.player)
        if (next) {
          enemy.x = next.x
          enemy.y = next.y
        }
        continue
      }
      if (!hasLineOfSight(state.walls, enemy, state.player)) {
        const next = pickLancerStep(state, enemy)
        if (next) {
          enemy.x = next.x
          enemy.y = next.y
        }
      }
      if (hasLineOfSight(state.walls, enemy, state.player)) {
        enemy.intent = {
          kind: "beam",
          dx: sign(state.player.x - enemy.x),
          dy: sign(state.player.y - enemy.y),
        }
      } else {
        enemy.intent = { kind: "none" }
      }
      continue
    }

    // Mortar: siege turret that plants in place and locks an X-blast at the player.
    enemy.intent = {
      kind: "blast",
      target: { x: state.player.x, y: state.player.y },
    }
  }
}

function buildSector(
  seed: number,
  sector: number,
  player: Point,
  nextEnemyIdStart: number,
): { walls: Point[]; enemies: Enemy[]; nextEnemyId: number } {
  const rng = sectorRng(seed, sector, 7)
  const wallCount = sector === 1 ? 2 : sector >= 7 ? 4 : 3
  const walls: Point[] = []

  const allCells: Point[] = []
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!samePoint({ x, y }, player)) allCells.push({ x, y })
    }
  }

  for (const candidate of rng.shuffle(allCells)) {
    if (walls.length >= wallCount) break
    const trial = [...walls, candidate]
    if (isConnectedWithout(trial, player)) walls.push(candidate)
  }

  const roster = rosterForSector(sector)
  const farCells = allCells.filter(
    (cell) => !hasWall(walls, cell.x, cell.y) && manhattan(cell, player) >= 2,
  )
  // The board always has room (25 cells, at most 4 pillars, 1 runner, 4 adjacent
  // cells, so 16 candidates for a roster of at most 7). Spawning short would hand
  // out a sector clear for free, so treat a shortage as a generator bug.
  if (farCells.length < roster.length) {
    throw new Error(
      `lockstep: sector ${sector} has ${farCells.length} spawn cells for ${roster.length} enemies`,
    )
  }
  const spawnCandidates = rng.shuffle(farCells).sort((left, right) => {
    const leftRing = manhattan(left, player) >= 3 ? 0 : 1
    const rightRing = manhattan(right, player) >= 3 ? 0 : 1
    return leftRing - rightRing
  })

  let nextId = nextEnemyIdStart
  const enemies: Enemy[] = []
  for (let index = 0; index < roster.length && index < spawnCandidates.length; index += 1) {
    const kind = roster[index]!
    const spot = spawnCandidates[index]!
    const maxHp = kind === "lancer" ? 2 : 1
    enemies.push({
      id: nextId,
      kind,
      x: spot.x,
      y: spot.y,
      hp: maxHp,
      maxHp,
      intent: { kind: "none" },
    })
    nextId += 1
  }

  return { walls, enemies, nextEnemyId: nextId }
}

function resolvePush(
  state: LockstepState,
  enemy: Enemy,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
  logs: string[],
): void {
  enemy.hp -= 1
  const tx = enemy.x + dx
  const ty = enemy.y + dy
  let crushed = false

  if (!inBounds(tx, ty) || hasWall(state.walls, tx, ty)) {
    enemy.hp -= 1
    crushed = true
    state.crushes += 1
    logs.push(`${labelFor(enemy.kind)} slammed into ${inBounds(tx, ty) ? "pillar" : "wall"}!`)
  } else {
    const blocker = enemyAt(state.enemies, tx, ty)
    if (blocker) {
      enemy.hp -= 1
      blocker.hp -= 1
      crushed = true
      state.crushes += 1
      logs.push(`${labelFor(enemy.kind)} collided with ${labelFor(blocker.kind)}!`)
      if (blocker.hp <= 0) {
        state.kills += 1
        state.points += 15
      }
    } else {
      enemy.x = tx
      enemy.y = ty
      logs.push(`Shoved ${labelFor(enemy.kind)}.`)
    }
  }

  if (enemy.hp <= 0) {
    state.kills += 1
    state.points += crushed ? 15 : 10
  }
}

function labelFor(kind: EnemyKind): string {
  return kind === "striker" ? "Striker" : kind === "lancer" ? "Lancer" : "Mortar"
}

function pruneDead(state: LockstepState): void {
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0)
}

function resolveEnemyTelegraphs(state: LockstepState, logs: string[]): void {
  const ordered = [...state.enemies].sort((a, b) => a.id - b.id)

  // Snapshot every impact before any damage lands. Applying damage cell by cell
  // would let an earlier kill clear a blocker and send a later beam straight
  // through a tile the overlay never marked, which breaks the one promise the
  // game makes: what is marked is what hits.
  const impacts = new Map<number, readonly Point[]>()
  for (const enemy of ordered) {
    if (enemy.hp <= 0) continue
    impacts.set(enemy.id, intentCells(state, enemy).impact)
  }

  const hitAt = (x: number, y: number, attacker: Enemy): void => {
    if (samePoint(state.player, { x, y })) {
      state.hp -= 1
      logs.push(`Hit by ${labelFor(attacker.kind)} (-1 HP).`)
      return
    }
    const target = enemyAt(state.enemies, x, y)
    if (target && target.id !== attacker.id) {
      target.hp -= 1
      if (target.hp <= 0) {
        state.kills += 1
        state.points += 15
        logs.push(`${labelFor(attacker.kind)} eliminated ${labelFor(target.kind)}!`)
      } else {
        logs.push(`${labelFor(attacker.kind)} grazed ${labelFor(target.kind)}.`)
      }
    }
  }

  for (const enemy of ordered) {
    if (enemy.hp <= 0) continue
    for (const cell of impacts.get(enemy.id) ?? []) {
      hitAt(cell.x, cell.y, enemy)
      // Stop the phase on death so the killing blow stays the log line.
      if (state.hp <= 0) break
    }
    if (enemy.intent.kind === "beam") enemy.cooldown = true
    enemy.intent = { kind: "none" }
    if (state.hp <= 0) break
  }

  // A run that ended mid-phase leaves later enemies holding a telegraph they
  // never got to fire; clear them so the final frame and the state hash are clean.
  for (const enemy of state.enemies) enemy.intent = { kind: "none" }

  pruneDead(state)
}

function advanceSector(state: LockstepState): LockstepState {
  const sectorBonus = state.sector * 25
  const sectorTurns = state.turns - state.sectorStartedAt
  const parBonus = Math.max(0, SECTOR_PAR - sectorTurns) * PAR_BONUS_PER_TURN
  const points = state.points + sectorBonus + parBonus
  const bonusNote = parBonus > 0 ? `, +${parBonus} speed` : ""

  if (state.targetSectors > 0 && state.sector >= state.targetSectors) {
    const victoryBonus = 50 + state.hp * VICTORY_HP_BONUS
    return {
      ...state,
      points: points + victoryBonus,
      phase: "won",
      lastLog: `All ${state.targetSectors} sectors cleared! (+${sectorBonus + parBonus + victoryBonus} bonus)`,
    }
  }

  const nextSector = state.sector + 1
  const healed = state.hp < state.maxHp ? 1 : 0
  const built = buildSector(state.seed, nextSector, state.player, state.nextEnemyId)
  const next: LockstepState = {
    ...state,
    walls: built.walls,
    enemies: built.enemies,
    nextEnemyId: built.nextEnemyId,
    sector: nextSector,
    hp: Math.min(state.maxHp, state.hp + healed),
    points,
    sectorStartedAt: state.turns,
    pulseCooldown: Math.max(0, state.pulseCooldown - 1),
    lastLog: `Sector ${state.sector} cleared (+${sectorBonus} pts${bonusNote}${healed ? ", +1 HP" : ""}).`,
  }
  planEnemies(next)
  return next
}

function stepOne(current: LockstepState, input: LockstepInput): LockstepState {
  if (current.phase !== "playing") return current

  // Work on a deep clone so callers holding previous snapshots stay isolated.
  const state: LockstepState = {
    ...current,
    walls: current.walls.map((w) => ({ ...w })),
    player: { ...current.player },
    enemies: current.enemies.map((e) => ({
      ...e,
      intent: e.intent.kind === "blast" ? { kind: "blast", target: { ...e.intent.target } } : { ...e.intent },
    })),
  }

  const logs: string[] = []
  let acted = false

  if (input.action === "move") {
    const dx = Number(input.dx)
    const dy = Number(input.dy)
    if (
      (dx === -1 || dx === 0 || dx === 1) &&
      (dy === -1 || dy === 0 || dy === 1) &&
      Math.abs(dx) + Math.abs(dy) === 1
    ) {
      const nx = state.player.x + dx
      const ny = state.player.y + dy
      if (inBounds(nx, ny) && !hasWall(state.walls, nx, ny)) {
        const blocker = enemyAt(state.enemies, nx, ny)
        if (blocker) {
          resolvePush(state, blocker, dx, dy, logs)
        } else {
          state.player = { x: nx, y: ny }
          logs.push("Repositioned.")
        }
        acted = true
      }
    }
  } else if (input.action === "pulse") {
    if (state.pulseCooldown === 0) {
      const targets = CARDINALS.map((dir) => ({
        dir,
        enemy: enemyAt(state.enemies, state.player.x + dir.dx, state.player.y + dir.dy),
      }))
      let hits = 0
      for (const item of targets) {
        if (!item.enemy || item.enemy.hp <= 0) continue
        resolvePush(state, item.enemy, item.dir.dx, item.dir.dy, logs)
        hits += 1
      }
      if (hits === 0) logs.push("Pulse discharged into empty space.")
      state.pulseCooldown = PULSE_COOLDOWN
      acted = true
    }
  } else if (input.action === "wait") {
    logs.push("Held position.")
    acted = true
  }

  if (!acted) return current

  pruneDead(state)
  state.turns += 1

  if (state.enemies.length === 0) {
    return advanceSector(state)
  }

  resolveEnemyTelegraphs(state, logs)

  if (state.hp <= 0) {
    state.hp = 0
    state.phase = "lost"
    state.lastLog = logs[logs.length - 1] ?? "Runner destroyed."
    return state
  }

  if (state.enemies.length === 0) {
    return advanceSector(state)
  }

  planEnemies(state)
  state.pulseCooldown = Math.max(0, state.pulseCooldown - 1)
  state.lastLog = logs.join(" ")
  return state
}

export const core: GameCore<LockstepState, LockstepInput> = {
  create(seed: number, mode: Mode): LockstepState {
    const player: Point = { x: 2, y: 2 }
    const built = buildSector(seed, 1, player, 1)
    const state: LockstepState = {
      size: SIZE,
      seed,
      modeId: mode.id,
      targetSectors: mode.id === "endless" ? 0 : SKIRMISH_SECTORS,
      walls: built.walls,
      player,
      hp: MAX_HP,
      maxHp: MAX_HP,
      pulseCooldown: 0,
      sector: 1,
      turns: 0,
      sectorStartedAt: 0,
      kills: 0,
      crushes: 0,
      points: 0,
      lastLog: "Telegraphs locked. Move, shove, or pulse.",
      enemies: built.enemies,
      nextEnemyId: built.nextEnemyId,
      phase: "playing",
    }
    planEnemies(state)
    return state
  },

  step(state, inputs) {
    let next = state
    for (const input of inputs) {
      if (next.phase !== "playing") break
      next = stepOne(next, input)
    }
    return next
  },

  phase(state) {
    return state.phase
  },

  score(state): Score {
    return {
      value: Math.min(state.points, MAX_SCORE),
      type: "higher",
      won: state.phase === "won",
      ranked: state.phase !== "playing" && state.points > 0,
      detail: {
        mode: state.modeId,
        sector: state.sector,
        kills: state.kills,
        crushes: state.crushes,
        turns: state.turns,
        hp: state.hp,
      },
    }
  },

  serialize(state) {
    return {
      seed: state.seed,
      size: state.size,
      modeId: state.modeId,
      targetSectors: state.targetSectors,
      sector: state.sector,
      turns: state.turns,
      sectorStartedAt: state.sectorStartedAt,
      hp: state.hp,
      maxHp: state.maxHp,
      pulseCooldown: state.pulseCooldown,
      points: state.points,
      kills: state.kills,
      crushes: state.crushes,
      phase: state.phase,
      nextEnemyId: state.nextEnemyId,
      player: { x: state.player.x, y: state.player.y },
      walls: [...state.walls].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x)),
      enemies: [...state.enemies]
        .sort((a, b) => a.id - b.id)
        .map((enemy) => ({
          id: enemy.id,
          kind: enemy.kind,
          x: enemy.x,
          y: enemy.y,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          cooldown: Boolean(enemy.cooldown),
          intent:
            enemy.intent.kind === "blast"
              ? { kind: "blast" as const, target: { x: enemy.intent.target.x, y: enemy.intent.target.y } }
              : { ...enemy.intent },
        })),
    }
  },
}
