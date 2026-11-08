import { FRAMEWORK_VERSION, REPLAY_VERSION } from "@await-arcade/contract"
import type {
  GameCore,
  GameMeta,
  InputEvent,
  Replay,
  Score,
  VerifiedResult,
} from "@await-arcade/contract"
import { stateHash } from "./utils"

/**
 * Re-run a replay against the pure core and derive the score server-side.
 *
 * This is the whole anti-cheat story for replayable games: the client sends
 * inputs, never a trusted score.
 */
export function verifyReplay<S, I>(
  core: GameCore<S, I>,
  meta: GameMeta,
  replay: Replay<I>,
): VerifiedResult {
  const fail = (reason: string): VerifiedResult => ({ ok: false, reason })

  if (replay.version !== REPLAY_VERSION) return fail(`unsupported replay version: ${replay.version}`)
  if (replay.gameId !== meta.id) return fail(`wrong game: ${replay.gameId}`)
  if (replay.gameVersion !== meta.version) return fail(`wrong game version: ${replay.gameVersion}`)
  if (replay.frameworkVersion !== FRAMEWORK_VERSION) {
    return fail(`wrong framework version: ${replay.frameworkVersion}`)
  }
  if (replay.kind !== meta.kind) return fail(`wrong game kind: ${replay.kind}`)

  const mode = meta.modes.find((item) => item.id === replay.modeId)
  if (!mode) return fail(`unknown mode: ${replay.modeId}`)

  if (!Number.isFinite(replay.seed)) return fail("replay seed is not a finite number")
  if (!Number.isFinite(replay.durationMs) || replay.durationMs < 0) {
    return fail("replay duration is invalid")
  }
  if (replay.durationMs > meta.maxDurationMs) return fail("replay exceeds the maximum duration")

  if (!Array.isArray(replay.inputs)) return fail("replay inputs are not an array")

  let previousTick = -1
  for (const event of replay.inputs) {
    if (typeof event !== "object" || event === null) return fail("invalid input event")
    if (!Number.isInteger(event.tick) || event.tick < 0) return fail("invalid input tick")
    if (event.tick < previousTick) return fail("inputs are out of order")
    previousTick = event.tick
  }

  let state = core.create(replay.seed, mode)
  let tick = 0
  let cursor = 0
  const inputs: readonly InputEvent<I>[] = replay.inputs

  if (meta.kind === "realtime") {
    const rate = meta.tickRate
    if (!rate || rate <= 0) return fail("realtime game has no tick rate")

    const dt = 1000 / rate
    const steps = Math.round(replay.durationMs / dt)
    if (steps < 0) return fail("replay duration is invalid")
    if (Math.abs(steps * dt - replay.durationMs) > 1e-6) {
      return fail("replay duration does not align to the tick rate")
    }

    const last = inputs.length > 0 ? inputs[inputs.length - 1]!.tick : -1
    if (last >= steps) return fail("input tick is beyond the replay duration")

    for (tick = 0; tick < steps; tick += 1) {
      const batch: I[] = []
      while (cursor < inputs.length && inputs[cursor]!.tick === tick) {
        batch.push(inputs[cursor]!.input)
        cursor += 1
      }

      state = core.step(state, batch, dt)
      if (core.phase(state) !== "playing") break
    }
  } else {
    for (const event of inputs) {
      state = core.step(state, [event.input], 0)
      tick += 1
      if (core.phase(state) !== "playing") break
    }
  }

  if (core.phase(state) === "playing") {
    return fail("replay ended while the game was still running")
  }

  const computed = stateHash(core.serialize(state))
  if (replay.stateHash !== undefined && replay.stateHash !== computed) {
    return fail("state hash mismatch")
  }

  const elapsedMs = replay.durationMs
  const score: Score = core.score(state, { elapsedMs, ticks: tick })

  if (score.type !== meta.score.type) return fail("score type does not match game metadata")
  if (!score.ranked) {
    return {
      ok: false,
      reason: "run is not eligible for the leaderboard",
      score,
      state: core.serialize(state),
      ticks: tick,
      elapsedMs,
    }
  }
  if (!Number.isFinite(score.value) || score.value < meta.score.min || score.value > meta.score.max) {
    return {
      ok: false,
      reason: "score is outside the declared bounds",
      score,
      state: core.serialize(state),
      ticks: tick,
      elapsedMs,
    }
  }

  return {
    ok: true,
    score,
    state: core.serialize(state),
    ticks: tick,
    elapsedMs,
  }
}
