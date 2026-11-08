/**
 * The Await Arcade game contract.
 *
 * Everything in this file is host-agnostic and dependency-free. Games import
 * these types; the framework implements the runner and verifier; the shell and
 * the server consume the metadata.
 *
 * The most important rule: `core` is pure and deterministic. `view` is the only
 * place that touches the DOM, canvas, audio, or host services.
 */

export const FRAMEWORK_VERSION = "0.1.0"
export const REPLAY_VERSION = 1 as const

export type GameKind = "turn" | "realtime"
export type Surface = "dom" | "canvas"
export type ScoreType = "higher" | "lower"
export type GamePublicationStatus = "stable" | "experimental"
export type Phase = "playing" | "won" | "lost"

export interface Mode {
  readonly id: string
  readonly title: string
  readonly description?: string
  /** 1 = easiest. Used by the shell and the arcade XP formula. */
  readonly difficulty?: number
}

export interface ControlHint {
  /** Human-readable keys, e.g. "Arrows + Space". */
  readonly keys: string
  readonly action: string
}

export interface ScoreDetail {
  readonly [key: string]: number | string | boolean
}

export interface Score {
  /** The value written to the leaderboard. */
  readonly value: number
  readonly type: ScoreType
  /** Did the player win this run? For score-attack games this may be false. */
  readonly won: boolean
  /** Is this run eligible for the leaderboard? */
  readonly ranked: boolean
  readonly detail?: ScoreDetail
}

export interface ScoreContext {
  /** Wall time of the run, in milliseconds. */
  readonly elapsedMs: number
  /** Simulation ticks for realtime games; move count for turn games. */
  readonly ticks: number
}

export interface SurfaceSize {
  readonly width: number
  readonly height: number
  readonly dpr: number
}

export interface Display {
  readonly surface: Surface
  /** Logical canvas size, or the maximum DOM board dimensions. */
  readonly width: number
  readonly height: number
  readonly pixelated?: boolean
}

/**
 * A cabinet's visual accent. The shell owns the frame and typography; the game
 * owns its accent, so every cabinet feels like part of the same system.
 */
export interface GameTheme {
  readonly accent: string
  readonly accent2: string
  readonly mode: "neon" | "terminal" | "paper"
}

export interface GameMeta {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly author: string
  readonly version: string
  /** Semver range of the arcade framework this game targets. */
  readonly engines: { readonly arcade: string }
  readonly kind: GameKind
  /** Required for realtime games. The runner steps exactly at this rate. */
  readonly tickRate?: number
  readonly modes: readonly Mode[]
  readonly score: {
    readonly type: ScoreType
    readonly min: number
    readonly max: number
  }
  readonly leaderboard: "replay" | "bounds" | "none"
  readonly status: GamePublicationStatus
  readonly controls: readonly ControlHint[]
  readonly display: Display
  /** Optional cabinet accent; the shell provides the frame and typography. */
  readonly theme?: GameTheme
  /** Hard cap for ranked runs. The server rejects longer replays. */
  readonly maxDurationMs: number
  readonly tags?: readonly string[]
}

export interface InputEvent<I = unknown> {
  /** Simulation tick for realtime games, move sequence for turn games. */
  readonly tick: number
  readonly input: I
}

export interface Replay<I = unknown> {
  readonly version: typeof REPLAY_VERSION
  readonly gameId: string
  readonly gameVersion: string
  readonly frameworkVersion: string
  readonly modeId: string
  readonly seed: number
  readonly kind: GameKind
  readonly tickRate?: number
  readonly durationMs: number
  readonly inputs: readonly InputEvent<I>[]
  /** Optional client-side state hash, used to spot divergence early. */
  readonly stateHash?: string
}

export interface VerifiedResult {
  readonly ok: boolean
  readonly reason?: string
  readonly score?: Score
  readonly state?: unknown
  readonly ticks?: number
  readonly elapsedMs?: number
}

export interface RunResult<I = unknown> {
  readonly gameId: string
  readonly modeId: string
  readonly score: Score
  readonly replay: Replay<I>
}

export interface SubmitResult {
  readonly ok: boolean
  readonly best?: Score
  readonly rank?: number
  readonly reason?: string
}

/**
 * The pure game half. The server imports only this (plus metadata), never the
 * view. Keep it free of DOM, network, wall-clock time, and unseeded randomness.
 */
export interface GameCore<S, I> {
  create(seed: number, mode: Mode): S
  /**
   * Apply inputs for one step.
   * - turn games: called once per dispatched input with `dt = 0`.
   * - realtime games: called every fixed tick with `dt = 1000 / tickRate`.
   */
  step(state: S, inputs: readonly I[], dt: number): S
  phase(state: S): Phase
  score(state: S, context: ScoreContext): Score
  /** Compact, deterministic representation for saves and hashes. */
  serialize(state: S): unknown
}

export interface ViewContext<S, I> {
  readonly host: GameHost
  readonly meta: GameMeta
  readonly container: HTMLElement
  /** Present only when `meta.display.surface === "canvas"`. */
  readonly canvas: HTMLCanvasElement | null
  readonly ctx2d: CanvasRenderingContext2D | null
  state(): S
  /** The only input channel. The runner records it for replay. */
  dispatch(input: I): void
  size(): SurfaceSize
}

export interface GameView<S> {
  render(state: S, alpha: number): void
  resize?(size: SurfaceSize): void
  destroy(): void
}

export interface GameModule<S, I> {
  readonly meta: GameMeta
  readonly core: GameCore<S, I>
  readonly view: (ctx: ViewContext<S, I>) => GameView<S>
}

/**
 * What the shell registry needs: metadata + a view factory.
 *
 * `any` is intentional here. Games are strongly typed internally, but the
 * registry is a heterogeneous list; the shell only knows that a view accepts
 * a context and renders. The boundary is the contract, not the registry type.
 */
export interface GameEntry {
  readonly meta: GameMeta
  readonly core: GameCore<any, any>
  readonly view: (ctx: ViewContext<any, any>) => GameView<any>
}

/** What the server registry needs: metadata + the pure core. */
export interface VerifierEntry {
  readonly meta: GameMeta
  readonly core: GameCore<any, any>
}

export interface GameStorage {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  remove(key: string): void
}

export interface AudioBus {
  play(name: string): void
  muted(): boolean
  toggle(): boolean
}

/**
 * The capability boundary. Games never get auth tokens or raw network access;
 * the shell owns identity, submission, and anti-cheat.
 */
export interface GameHost {
  readonly name: string
  best(gameId: string, modeId: string): Score | undefined
  submit(run: RunResult): Promise<SubmitResult>
  readonly storage: GameStorage
  readonly audio: AudioBus
  toast(message: string): void
}
