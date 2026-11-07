import {
  FRAMEWORK_VERSION,
  REPLAY_VERSION,
  type GameCore,
  type GameMeta,
  type InputEvent,
  type Mode,
  type Replay,
  type Score,
  type VerifiedResult,
} from "@await-arcade/contract"
import { stateHash } from "./utils"
import { verifyReplay } from "./verify"

export interface TurnScript<I> {
  readonly seed: number
  readonly mode: Mode
  readonly inputs: readonly I[]
  readonly durationMs?: number
}

export interface ScriptResult<S, I> {
  readonly state: S
  readonly score: Score
  readonly replay: Replay<I>
  readonly verified: VerifiedResult
}

export function playTurn<S, I>(
  core: GameCore<S, I>,
  meta: GameMeta,
  script: TurnScript<I>,
): ScriptResult<S, I> {
  let state = core.create(script.seed, script.mode)
  const events: InputEvent<I>[] = []

  for (let index = 0; index < script.inputs.length; index += 1) {
    const input = script.inputs[index]!
    events.push({ tick: index, input })
    state = core.step(state, [input], 0)
    if (core.phase(state) !== "playing") break
  }

  const durationMs = script.durationMs ?? 0
  const score = core.score(state, { elapsedMs: durationMs, ticks: events.length })
  const replay: Replay<I> = {
    version: REPLAY_VERSION,
    gameId: meta.id,
    gameVersion: meta.version,
    frameworkVersion: FRAMEWORK_VERSION,
    modeId: script.mode.id,
    seed: script.seed,
    kind: meta.kind,
    ...(meta.tickRate !== undefined ? { tickRate: meta.tickRate } : {}),
    durationMs,
    inputs: events,
    stateHash: stateHash(core.serialize(state)),
  }

  return { state, score, replay, verified: verifyReplay(core, meta, replay) }
}

export interface RealtimeScript<I> {
  readonly seed: number
  readonly mode: Mode
  readonly ticks: number
  readonly inputs: readonly InputEvent<I>[]
  readonly durationMs?: number
}

export function playRealtime<S, I>(
  core: GameCore<S, I>,
  meta: GameMeta,
  script: RealtimeScript<I>,
): ScriptResult<S, I> {
  const rate = meta.tickRate
  if (!rate || rate <= 0) throw new Error(`${meta.id}: realtime script needs a tickRate`)

  const dt = 1000 / rate
  let state = core.create(script.seed, script.mode)
  const events: InputEvent<I>[] = []
  let cursor = 0
  let tick = 0

  for (; tick < script.ticks; tick += 1) {
    const batch: I[] = []
    while (cursor < script.inputs.length && script.inputs[cursor]!.tick === tick) {
      const event = script.inputs[cursor]!
      batch.push(event.input)
      events.push(event)
      cursor += 1
    }

    state = core.step(state, batch, dt)
    if (core.phase(state) !== "playing") {
      tick += 1
      break
    }
  }

  const durationMs = script.durationMs ?? tick * dt
  const score = core.score(state, { elapsedMs: durationMs, ticks: tick })
  const replay: Replay<I> = {
    version: REPLAY_VERSION,
    gameId: meta.id,
    gameVersion: meta.version,
    frameworkVersion: FRAMEWORK_VERSION,
    modeId: script.mode.id,
    seed: script.seed,
    kind: meta.kind,
    tickRate: rate,
    durationMs,
    inputs: events,
    stateHash: stateHash(core.serialize(state)),
  }

  return { state, score, replay, verified: verifyReplay(core, meta, replay) }
}

export function expectDeterministic<S, I>(
  core: GameCore<S, I>,
  meta: GameMeta,
  replay: Replay<I>,
): boolean {
  const left = verifyReplay(core, meta, replay)
  const right = verifyReplay(core, meta, replay)

  return stateHash(left.state) === stateHash(right.state)
}
