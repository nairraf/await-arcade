import type { GameCore, Phase, Score, ScoreContext } from "@await-arcade/contract"
import { createRng } from "@await-arcade/framework"

export interface TargetState {
  readonly width: number
  readonly height: number
  readonly seed: number
  target: number
  hits: number
  phase: Phase
}

export interface TargetInput {
  readonly index: number
}

const SIZE = 3
const TARGET_HITS = 5

function nextTarget(seed: number, hits: number): number {
  const rng = createRng((seed ^ Math.imul(hits + 1, 0x9e3779b1)) >>> 0)
  return rng.int(0, SIZE * SIZE - 1)
}

/**
 * A deliberately tiny reference game:
 * click the glowing target five times as fast as you can.
 *
 * The core is pure and deterministic. The target sequence is derived from the
 * seed and hit count, so the server can replay the run and derive the score.
 */
export const core: GameCore<TargetState, TargetInput> = {
  create(seed) {
    return {
      width: SIZE,
      height: SIZE,
      seed,
      target: nextTarget(seed, 0),
      hits: 0,
      phase: "playing",
    }
  },

  step(state, inputs) {
    for (const input of inputs) {
      if (state.phase !== "playing") break
      if (input.index !== state.target) continue

      state.hits += 1
      if (state.hits >= TARGET_HITS) state.phase = "won"
      else state.target = nextTarget(state.seed, state.hits)
    }
    return state
  },

  phase(state) {
    return state.phase
  },

  score(state, context: ScoreContext): Score {
    return {
      value: context.elapsedMs,
      type: "lower",
      won: state.phase === "won",
      ranked: state.phase === "won",
      detail: { hits: state.hits },
    }
  },

  serialize(state) {
    return {
      w: state.width,
      h: state.height,
      target: state.target,
      hits: state.hits,
      p: state.phase,
    }
  },
}
