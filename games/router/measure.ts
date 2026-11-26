/**
 * F10 difficulty harness for Circuit Router.
 *
 * Runs 250 consecutive seeds per mode under a uniform-random policy and a
 * naive-greedy policy, then prints solve rates and rotation efficiency. The
 * policies are deterministic: the random policy's RNG is keyed by
 * `(seed ^ mode salt)`, and the greedy policy breaks every tie by row-major
 * index then clockwise direction.
 */
import { createRng } from "@await-arcade/framework"
import {
  analyzeCircuit,
  core,
  periodOf,
  previewRotate,
  type Point,
  type RouterState,
} from "./src/core"
import { meta } from "./src/meta"

const SEED_COUNT = 250

type ModeId = "easy" | "hard"

interface RunOutcome {
  readonly won: boolean
  readonly rotationsUsed: number
  readonly par: number
  readonly poweredRatio: number
}

interface PolicyMetrics {
  readonly solved: number
  readonly solveRate: number
  readonly meanRatio: number
  readonly medianRatio: number
  readonly meanOverPar: number
  readonly medianOverPar: number
  readonly meanLostPowered: number
}

function modeFor(modeId: ModeId) {
  const mode = meta.modes.find((item) => item.id === modeId)
  if (!mode) throw new Error(`unknown mode ${modeId}`)
  return mode
}

function periodAt(state: RouterState, index: number): number {
  return periodOf(state.masks[index]!)
}

function pointFor(state: RouterState, index: number): Point {
  return { x: index % state.width, y: Math.floor(index / state.width) }
}

function opposite(dir: number): number {
  return ((dir << 2) | (dir >> 2)) & 0b1111
}

function cellHasDangling(state: RouterState, index: number): boolean {
  const { x, y } = pointFor(state, index)
  const mask = state.masks[index]!
  for (const dir of [1, 2, 4, 8]) {
    if ((mask & dir) === 0) continue
    const nx = x + (dir === 2 ? 1 : dir === 8 ? -1 : 0)
    const ny = y + (dir === 4 ? 1 : dir === 1 ? -1 : 0)
    if (nx < 0 || nx >= state.width || ny < 0 || ny >= state.height) return true
    if ((state.masks[ny * state.width + nx]! & opposite(dir)) === 0) return true
  }
  return false
}

function rotate(state: RouterState, index: number, dir: 1 | -1): RouterState {
  const point = pointFor(state, index)
  return core.step(state, [{ type: "rotate", x: point.x, y: point.y, dir }], 0)
}

function finish(state: RouterState, parity: number): RunOutcome {
  const analysis = analyzeCircuit(state.masks, state.width, state.height, state.source)
  return {
    won: state.phase === "won",
    rotationsUsed: state.rotationsUsed,
    par: parity,
    poweredRatio: analysis.poweredCount / (state.width * state.height),
  }
}

function randomPolicy(modeId: ModeId, seed: number): RunOutcome {
  const mode = modeFor(modeId)
  const salt = modeId === "hard" ? 0x85ebca6b : 0x9e3779b9
  const policyRng = createRng((seed ^ salt) >>> 0)
  let state = core.create(seed, mode)
  const movable: number[] = []
  for (let index = 0; index < state.masks.length; index += 1) {
    if (periodAt(state, index) > 1) movable.push(index)
  }

  let guard = 0
  while (state.phase === "playing" && guard < 5_000) {
    const index = movable[policyRng.int(0, movable.length - 1)]!
    const dir: 1 | -1 = policyRng.int(0, 1) === 0 ? 1 : -1
    state = rotate(state, index, dir)
    guard += 1
  }

  return finish(state, state.par)
}

interface Candidate {
  readonly index: number
  readonly dir: 1 | -1
  /** One committed input is one quarter turn. */
  readonly turns: number
  readonly masks: readonly number[]
  readonly danglingCount: number
  readonly poweredCount: number
  readonly solved: boolean
}

function candidateKey(candidate: Candidate): string {
  return candidate.masks.join(",")
}

/** The brief's ordering: dangling, powered, turns, index, clockwise. */
function betterCandidate(candidate: Candidate, incumbent: Candidate): boolean {
  if (candidate.danglingCount !== incumbent.danglingCount) {
    return candidate.danglingCount < incumbent.danglingCount
  }
  if (candidate.poweredCount !== incumbent.poweredCount) {
    return candidate.poweredCount > incumbent.poweredCount
  }
  if (candidate.turns !== incumbent.turns) return candidate.turns < incumbent.turns
  if (candidate.index !== incumbent.index) return candidate.index < incumbent.index
  return candidate.dir === 1 && incumbent.dir === -1
}

function applyCandidate(
  state: RouterState,
  candidate: Candidate,
  visited: Set<string>,
): RouterState {
  let next = state
  for (let step = 0; step < candidate.turns; step += 1) {
    if (next.phase !== "playing") break
    next = rotate(next, candidate.index, candidate.dir)
    visited.add(next.masks.join(","))
  }
  return next
}

function escapeCell(state: RouterState): number {
  for (let index = 0; index < state.masks.length; index += 1) {
    if (periodAt(state, index) > 1 && cellHasDangling(state, index)) return index
  }
  return -1
}

function greedyPolicy(modeId: ModeId, seed: number): RunOutcome {
  const mode = modeFor(modeId)
  let state = core.create(seed, mode)
  const visited = new Set<string>()
  visited.add(state.masks.join(","))
  let guard = 0

  while (state.phase === "playing" && guard < 5_000) {
    const current = analyzeCircuit(state.masks, state.width, state.height, state.source)
    const candidates: Candidate[] = []

    // One-turn, player-legal rotations only: every movable tile × {CW, CCW}.
    for (let index = 0; index < state.masks.length; index += 1) {
      if (periodAt(state, index) <= 1) continue
      const point = pointFor(state, index)
      for (const dir of [1, -1] as const) {
        const preview = previewRotate(state, point.x, point.y, dir)
        if (!preview?.valid) continue
        const masks = [...state.masks]
        masks[index] = preview.nextMask
        candidates.push({
          index,
          dir,
          turns: 1,
          masks,
          danglingCount: preview.danglingCount,
          poweredCount: preview.poweredCount,
          solved: preview.solved,
        })
      }
    }

    if (candidates.length === 0) break

    let best = candidates[0]!
    for (const candidate of candidates) {
      if (betterCandidate(candidate, best)) best = candidate
    }

    const improves =
      best.danglingCount < current.danglingCount ||
      (best.danglingCount === current.danglingCount && best.poweredCount > current.poweredCount)

    // The best candidate already minimizes dangling, so if it does not
    // improve there is no dangling-reducing move to fall back to.
    let chosen: Candidate | null = improves ? best : null

    // Anti-cycle: when a state repeats, take the best candidate that has not
    // been visited yet before falling back to the escape turn.
    if (chosen === null || visited.has(candidateKey(chosen))) {
      let unvisited: Candidate | null = null
      for (const candidate of candidates) {
        if (visited.has(candidateKey(candidate))) continue
        if (unvisited === null || betterCandidate(candidate, unvisited)) unvisited = candidate
      }
      if (unvisited) chosen = unvisited
    }

    if (chosen) {
      guard += chosen.turns
      state = applyCandidate(state, chosen, visited)
      continue
    }

    const escape = escapeCell(state)
    if (escape < 0) break
    state = rotate(state, escape, 1)
    visited.add(state.masks.join(","))
    guard += 1
  }

  return finish(state, state.par)
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function summarise(outcomes: readonly RunOutcome[]): PolicyMetrics {
  const solved = outcomes.filter((outcome) => outcome.won)
  const lost = outcomes.filter((outcome) => !outcome.won)
  const ratios = solved.map((outcome) => outcome.rotationsUsed / outcome.par)
  const overPar = solved.map((outcome) => outcome.rotationsUsed - outcome.par)
  return {
    solved: solved.length,
    solveRate: solved.length / outcomes.length,
    meanRatio: mean(ratios),
    medianRatio: median(ratios),
    meanOverPar: mean(overPar),
    medianOverPar: median(overPar),
    meanLostPowered: mean(lost.map((outcome) => outcome.poweredRatio)),
  }
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function runPolicy(
  label: string,
  policy: (modeId: ModeId, seed: number) => RunOutcome,
): void {
  for (const modeId of ["easy", "hard"] as const) {
    const outcomes: RunOutcome[] = []
    for (let seed = 1; seed <= SEED_COUNT; seed += 1) outcomes.push(policy(modeId, seed))
    const metrics = summarise(outcomes)
    console.log(
      `${modeId.padEnd(4)} ${label.padEnd(6)} solve ${String(metrics.solved).padStart(3)}/${SEED_COUNT} (${pct(
        metrics.solveRate,
      )}) · ratio mean ${metrics.meanRatio.toFixed(2)} median ${metrics.medianRatio.toFixed(
        2,
      )} · over-par mean ${metrics.meanOverPar.toFixed(2)} median ${metrics.medianOverPar.toFixed(
        2,
      )} · lost powered ${pct(metrics.meanLostPowered)}`,
    )
  }
}

console.log(`Circuit Router F10 — ${SEED_COUNT} seeds per mode`)
runPolicy("random", randomPolicy)
runPolicy("greedy", greedyPolicy)
