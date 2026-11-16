import type { Mode } from "@await-arcade/contract"
import { core, dangerCells, type LockstepInput, type LockstepState } from "./src/core"

const DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const

function legalActions(state: LockstepState): LockstepInput[] {
  return [
    ...DIRECTIONS.map((dir): LockstepInput => ({ action: "move", dx: dir.dx, dy: dir.dy })),
    ...(state.pulseCooldown === 0 ? ([{ action: "pulse" }] as const) : []),
    { action: "wait" },
  ]
}

/** Survival-first heuristic: progress and HP up, enemy HP and exposure down. */
function scoreState(state: LockstepState): number {
  if (state.phase === "won") return 1_000_000
  if (state.phase === "lost") return -1_000_000
  const inDanger = dangerCells(state).some(
    (cell) => cell.x === state.player.x && cell.y === state.player.y,
  )
  const minDistance = state.enemies.length
    ? Math.min(
        ...state.enemies.map(
          (enemy) => Math.abs(enemy.x - state.player.x) + Math.abs(enemy.y - state.player.y),
        ),
      )
    : 0
  const totalEnemyHp = state.enemies.reduce((sum, enemy) => sum + enemy.hp, 0)
  return (
    state.hp * 250 +
    state.sector * 1_000 +
    state.points * 5 -
    totalEnemyHp * 180 -
    minDistance * 15 -
    (inDanger ? 140 : 0)
  )
}

/**
 * Dev-only harness, not part of the cartridge: a deterministic two-ply greedy
 * policy that can clear Skirmish. It backs both the unit tests and the
 * `replay.json` fixture so the committed replay and the tests exercise the same
 * policy. Never imported by `index.ts`.
 */
export function greedySolve(seed: number, mode: Mode, maxTurns = 100): LockstepInput[] {
  let state = core.create(seed, mode)
  const inputs: LockstepInput[] = []

  for (let turn = 0; turn < maxTurns && state.phase === "playing"; turn += 1) {
    let bestInput: LockstepInput = { action: "wait" }
    let bestRank = -Infinity

    for (const first of legalActions(state)) {
      const once = core.step(state, [first], 0)
      if (once === state) continue
      let rank = scoreState(once)
      if (once.phase === "playing") {
        let bestNext = -Infinity
        for (const second of legalActions(once)) {
          const twice = core.step(once, [second], 0)
          if (twice !== once) bestNext = Math.max(bestNext, scoreState(twice))
        }
        rank = bestNext
      }
      if (rank > bestRank) {
        bestRank = rank
        bestInput = first
      }
    }

    inputs.push(bestInput)
    state = core.step(state, [bestInput], 0)
  }

  return inputs
}
