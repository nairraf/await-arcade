import {
  FRAMEWORK_VERSION,
  REPLAY_VERSION,
  type GameCore,
  type GameHost,
  type GameMeta,
  type GameView,
  type InputEvent,
  type Mode,
  type Replay,
  type RunResult,
  type ViewContext,
} from "@await-arcade/contract"
import { createSurface } from "./surface"
import { stateHash } from "./utils"

export interface RunnerOptions<S, I> {
  readonly meta: GameMeta
  readonly core: GameCore<S, I>
  readonly view: (ctx: ViewContext<S, I>) => GameView<S>
  readonly host: GameHost
  readonly container: HTMLElement
  readonly mode: Mode
  readonly seed: number
  readonly onEnd?: (result: RunResult<I>) => void
  readonly onTick?: (state: S, elapsedMs: number, ticks: number) => void
}

export interface GameRunner<S, I> {
  readonly meta: GameMeta
  readonly mode: Mode
  readonly seed: number
  pause(): void
  resume(): void
  paused(): boolean
  stop(): void
  state(): S
  elapsedMs(): number
  result(): RunResult<I> | undefined
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now()

const raf = (cb: FrameRequestCallback): number => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(cb)
  }
  return globalThis.setTimeout(() => cb(now()), 16) as unknown as number
}

const caf = (id: number): void => {
  if (id === 0) return
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(id)
  } else {
    globalThis.clearTimeout(id)
  }
}

export function createRunner<S, I>(options: RunnerOptions<S, I>): GameRunner<S, I> {
  const { meta, core, host, container, mode, seed, onEnd, onTick } = options
  const rate = meta.kind === "realtime" ? (meta.tickRate ?? 60) : 0
  const dt = rate > 0 ? 1000 / rate : 0

  if (meta.kind === "realtime" && dt <= 0) {
    throw new Error(`Await Arcade: ${meta.id} is realtime but has no tickRate`)
  }

  const surface = createSurface(container, meta.display)
  if (meta.display.surface === "dom") container.replaceChildren()

  let state = core.create(seed, mode)
  let tick = 0
  let sequence = 0
  let accumulator = 0
  let lastFrame = now()
  let startedAt = now()
  let pausedAt = 0
  let pausedTotal = 0
  let paused = false
  let stopped = false
  let finished = false
  let rafId = 0
  let lastResult: RunResult<I> | undefined
  const queue = new Map<number, I[]>()
  const record: InputEvent<I>[] = []

  const elapsed = (): number => {
    if (meta.kind === "realtime") return tick * dt
    return Math.max(0, now() - startedAt - pausedTotal)
  }

  const finish = (): void => {
    if (finished) return
    finished = true
    stopped = true
    caf(rafId)
    rafId = 0

    const durationMs = meta.kind === "realtime" ? tick * dt : elapsed()
    const ticks = meta.kind === "realtime" ? tick : sequence
    const score = core.score(state, { elapsedMs: durationMs, ticks })
    const replay: Replay<I> = {
      version: REPLAY_VERSION,
      gameId: meta.id,
      gameVersion: meta.version,
      frameworkVersion: FRAMEWORK_VERSION,
      modeId: mode.id,
      seed,
      kind: meta.kind,
      ...(meta.tickRate !== undefined ? { tickRate: meta.tickRate } : {}),
      durationMs,
      inputs: record,
      stateHash: stateHash(core.serialize(state)),
    }

    lastResult = { gameId: meta.id, modeId: mode.id, score, replay }
    view.render(state, 1)
    onTick?.(state, durationMs, ticks)
    onEnd?.(lastResult)
  }

  const dispatch = (input: I): void => {
    if (stopped || paused) return

    if (meta.kind === "realtime") {
      const at = tick + 1
      const batch = queue.get(at)
      if (batch) batch.push(input)
      else queue.set(at, [input])
      return
    }

    record.push({ tick: sequence, input })
    sequence += 1
    state = core.step(state, [input], 0)
    view.render(state, 1)
    const phase = core.phase(state)
    onTick?.(state, elapsed(), sequence)
    if (phase !== "playing") finish()
  }

  const context: ViewContext<S, I> = {
    host,
    meta,
    container,
    canvas: surface.canvas,
    ctx2d: surface.ctx2d,
    state: () => state,
    dispatch,
    size: () => surface.size(),
  }

  const view = options.view(context)

  const frame = (time: number): void => {
    if (stopped || paused) return

    const delta = Math.min(time - lastFrame, 250)
    lastFrame = time
    accumulator += delta

    while (accumulator >= dt && !stopped && !paused) {
      const batch = queue.get(tick) ?? []
      queue.delete(tick)

      for (const input of batch) record.push({ tick, input })

      state = core.step(state, batch, dt)
      tick += 1
      accumulator -= dt

      if (core.phase(state) !== "playing") {
        finish()
        return
      }
    }

    view.render(state, accumulator / dt)
    onTick?.(state, elapsed(), tick)
    rafId = raf(frame)
  }

  const onResize = (): void => {
    view.resize?.(surface.size())
    view.render(state, 1)
  }
  globalThis.addEventListener("resize", onResize)

  view.render(state, 1)
  view.resize?.(surface.size())
  onTick?.(state, elapsed(), 0)

  if (meta.kind === "realtime") {
    lastFrame = now()
    rafId = raf(frame)
  }

  return {
    meta,
    mode,
    seed,
    pause() {
      if (stopped || finished || paused) return
      paused = true
      if (meta.kind === "realtime") {
        caf(rafId)
        rafId = 0
      } else {
        pausedAt = now()
      }
    },
    resume() {
      if (stopped || finished || !paused) return
      paused = false
      if (meta.kind === "realtime") {
        lastFrame = now()
        rafId = raf(frame)
      } else {
        pausedTotal += now() - pausedAt
      }
    },
    paused: () => paused,
    stop() {
      stopped = true
      caf(rafId)
      rafId = 0
      globalThis.removeEventListener("resize", onResize)
      view.destroy()
      surface.dispose()
      container.replaceChildren()
    },
    state: () => state,
    elapsedMs: elapsed,
    result: () => lastResult,
  }
}
