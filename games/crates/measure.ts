/**
 * F10 difficulty measurement for Crate Pusher.
 *
 * Run with `npx tsx games/crates/measure.ts`.
 *
 * Deterministic simulation over 250 consecutive seeds (1..250) per mode:
 *  - `random`  — uniform choice over currently valid moves (gated < 5%)
 *  - `bfs2k`   — bounded-lookahead BFS, 2,000 popped nodes (reported only)
 * plus construction gates: every generated board's `optimalSolution` wins in
 * exactly `par` moves, and `moveBudget >= ceil(1.6 * par)`.
 *
 * Exits non-zero if any gate fails.
 */
import { createRng } from "../../packages/framework/src/rng"
import {
  DIRS,
  FALLBACK_EASY,
  FALLBACK_HARD,
  core,
  generateBoard,
  previewMove,
  type CrateInput,
  type CrateState,
  type MoveDir,
} from "./src/core"
import { meta } from "./src/meta"

const SEED_START = 1
const SEED_COUNT = 250
const RANDOM_GATE = 0.05
const MAX_EXPANDED_NODES = 2_000

const MODE_IDS = ["easy", "hard"] as const
type ModeId = (typeof MODE_IDS)[number]

function move(dir: MoveDir): CrateInput {
  return { type: "move", dir }
}

function appliesOptimal(seed: number, modeId: ModeId): { ok: boolean; movesUsed: number; par: number } {
  const board = generateBoard(seed, modeId)
  const mode = meta.modes.find((candidate) => candidate.id === modeId)!
  let state = core.create(seed, mode)
  let used = 0
  for (const input of board.optimalSolution) {
    const next = core.step(state, [input], 0)
    if (next.movesUsed !== state.movesUsed) used += 1
    state = next
    if (state.phase !== "playing") break
  }
  return {
    ok:
      state.phase === "won" &&
      used === board.par &&
      board.optimalSolution.length === board.par,
    movesUsed: used,
    par: board.par,
  }
}

function randomWon(seed: number, modeId: ModeId): boolean {
  const mode = meta.modes.find((candidate) => candidate.id === modeId)!
  const policyRng = createRng(
    (seed ^ (modeId === "hard" ? 0x85ebca6b : 0x9e3779b9)) >>> 0,
  )
  let state = core.create(seed, mode)
  let guard = 0
  while (state.phase === "playing" && guard < 10_000) {
    guard += 1
    const valid = DIRS.filter((dir) => previewMove(state, dir)?.valid === true)
    if (valid.length === 0) break
    const dir = valid[policyRng.int(0, valid.length - 1)]!
    state = core.step(state, [move(dir)], 0)
  }
  return state.phase === "won"
}

function stateKey(state: CrateState): number {
  const total = state.width * state.height
  const first = state.crates[0]!
  const second = state.crates[1]!
  const min = first < second ? first : second
  const max = first < second ? second : first
  return (state.operator * total + min) * total + max
}

function bfs2kWon(seed: number, modeId: ModeId): boolean {
  const mode = meta.modes.find((candidate) => candidate.id === modeId)!
  const start = core.create(seed, mode)
  const visited = new Set<number>([stateKey(start)])
  const queue: Array<{ readonly state: CrateState; readonly moves: number }> = [
    { state: start, moves: 0 },
  ]
  let popped = 0
  let head = 0

  while (head < queue.length && popped < MAX_EXPANDED_NODES) {
    const current = queue[head]!
    head += 1
    popped += 1
    if (current.moves >= current.state.moveBudget) continue

    for (const dir of DIRS) {
      const next = core.step(current.state, [move(dir)], 0)
      if (next.phase === "won") return true
      if (next.phase === "lost") continue
      const key = stateKey(next)
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ state: next, moves: current.moves + 1 })
    }
  }
  return false
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return sorted[index]!
}

interface ModeReport {
  readonly modeId: ModeId
  readonly seeds: number
  readonly generationFailures: number
  readonly fallbackUses: number
  readonly minPar: number
  readonly medianPar: number
  readonly p90Par: number
  readonly maxPar: number
  readonly optimalRate: number
  readonly budgetRatioOk: number
  readonly randomRate: number
  readonly bfs2kRate: number
}

function measureMode(modeId: ModeId): ModeReport {
  const pars: number[] = []
  let failures = 0
  let fallbackUses = 0
  let optimalPass = 0
  let budgetPass = 0
  let randomWins = 0
  let bfsWins = 0

  for (let offset = 0; offset < SEED_COUNT; offset += 1) {
    const seed = SEED_START + offset
    const board = generateBoard(seed, modeId)
    pars.push(board.par)

    // A fallback board means the generator exhausted its attempts for this seed.
    if (board === FALLBACK_EASY || board === FALLBACK_HARD) {
      fallbackUses += 1
      failures += 1
    }

    const optimum = appliesOptimal(seed, modeId)
    if (optimum.ok) optimalPass += 1
    else failures += 1

    if (board.moveBudget >= Math.ceil(1.6 * board.par)) budgetPass += 1
    else failures += 1

    if (randomWon(seed, modeId)) randomWins += 1
    if (bfs2kWon(seed, modeId)) bfsWins += 1
  }

  pars.sort((a, b) => a - b)
  return {
    modeId,
    seeds: SEED_COUNT,
    generationFailures: failures,
    fallbackUses,
    minPar: pars[0] ?? 0,
    medianPar: percentile(pars, 0.5),
    p90Par: percentile(pars, 0.9),
    maxPar: pars[pars.length - 1] ?? 0,
    optimalRate: optimalPass / SEED_COUNT,
    budgetRatioOk: budgetPass / SEED_COUNT,
    randomRate: randomWins / SEED_COUNT,
    bfs2kRate: bfsWins / SEED_COUNT,
  }
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

const reports: ModeReport[] = MODE_IDS.map(measureMode)

console.log("Crate Pusher — F10 difficulty measurement")
console.log(`seeds ${SEED_START}..${SEED_START + SEED_COUNT - 1} per mode`)
console.log("")
for (const report of reports) {
  console.log(`${report.modeId}:`)
  console.log(`  seeds                 ${report.seeds}`)
  console.log(`  generation failures   ${report.generationFailures}`)
  console.log(`  fallback boards       ${report.fallbackUses}`)
  console.log(
    `  par min/median/p90/max ${report.minPar} / ${report.medianPar} / ${report.p90Par} / ${report.maxPar}`,
  )
  console.log(`  optimalSolution @ par  ${percent(report.optimalRate)}`)
  console.log(`  budget >= 1.6 × par    ${percent(report.budgetRatioOk)}`)
  console.log(`  random solve rate      ${percent(report.randomRate)} (gate < 5%)`)
  console.log(`  bfs2k solve rate       ${percent(report.bfs2kRate)} (reported)`)
  console.log("")
}

const gateFailures: string[] = []
for (const report of reports) {
  if (report.generationFailures !== 0) {
    gateFailures.push(`${report.modeId}: ${report.generationFailures} generation gate failure(s)`)
  }
  if (report.optimalRate !== 1) {
    gateFailures.push(`${report.modeId}: optimalSolution solved ${percent(report.optimalRate)} of seeds`)
  }
  if (report.budgetRatioOk !== 1) {
    gateFailures.push(`${report.modeId}: budget ratio held on ${percent(report.budgetRatioOk)} of seeds`)
  }
  if (!(report.randomRate < RANDOM_GATE)) {
    gateFailures.push(`${report.modeId}: random solve rate ${percent(report.randomRate)} is not below 5%`)
  }
}

if (gateFailures.length > 0) {
  console.error("F10 GATES FAILED")
  for (const failure of gateFailures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log("F10 gates passed.")
}
