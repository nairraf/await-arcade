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
  /** Whether runs in this mode are eligible for ranked leaderboards. Defaults to true. */
  readonly ranked?: boolean
  /** Groups modes that share a difficulty; the shell renders a variant selector. */
  readonly group?: string
  /** Variant id from GameMeta.variants, e.g. "random" or "logic". */
  readonly variant?: string
}

export interface GameVariant {
  readonly id: string
  readonly title: string
  /** One-line hint shown under the cartridge controls. */
  readonly description: string
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
 * A cartridge's visual accent. The shell owns the frame and typography; the game
 * owns its accent, so every cartridge feels like part of the same system.
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
  /** Optional secondary selector such as Random/Logic. Mode.variant picks one. */
  readonly variants?: readonly GameVariant[]
  readonly score: {
    readonly type: ScoreType
    readonly min: number
    readonly max: number
    /** Display unit for the value; defaults to time for lower and points for higher. */
    readonly unit?: "time" | "moves" | "points"
  }
  readonly leaderboard: "replay" | "bounds" | "none"
  readonly status: GamePublicationStatus
  readonly controls: readonly ControlHint[]
  readonly display: Display
  /** Optional cartridge accent; the shell provides the frame and typography. */
  readonly theme?: GameTheme
  /** Optional multi-line ASCII mark for the launcher card. */
  readonly glyph?: string
  /** Hard cap for ranked runs. The server rejects longer replays. */
  readonly maxDurationMs: number
  /** Maximum number of input events allowed in a replay; defaults to 10,000. */
  readonly maxInputs?: number
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
  /** Server-issued run id for ranked submissions; absent for local fallback. */
  readonly runId?: string
  readonly score: Score
  readonly replay: Replay<I>
}

export interface SubmitResult {
  readonly ok: boolean
  /** The verified run's score. Daily Mineflag returns the weighted daily score here. */
  readonly score?: Score
  readonly best?: Score
  readonly rank?: number
  /** Arcade XP newly awarded for this run (best per game per UTC day). */
  readonly xp?: number
  /** Set when the host queued an offline submission instead of completing it. */
  readonly queued?: boolean
  readonly reason?: string
  /** Set for daily runs so hosts keep the daily best out of the all-time cache. */
  readonly challengeId?: string
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
  readonly host: ViewHost
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

/** A scored entry on a hosted board. */
export interface BoardEntry {
  readonly playerId: string
  readonly score: Score
  readonly achievedAt: number
  readonly displayName?: string
  /** Hidden ascending sort key for daily boards: moves|time. */
  readonly rankKey?: string
  /** Run id whose seed/mode/anchor can be replayed as unranked practice. */
  readonly ghostId?: string
  /** Competition rank by total arcade XP, enriched when a board is read. */
  readonly xpRank?: number
}

export interface GhostRun {
  readonly ghostId: string
  readonly gameId: string
  readonly modeId: string
  readonly seed: number
  readonly anchor?: RunAnchor
}

/** A medal earned from cumulative arcade play. */
export interface ArcadeMedal {
  readonly id: string
  readonly title: string
  readonly description: string
  /** When the medal condition was first reached, if known. */
  readonly earnedAt?: number
}

/** Per-cartridge XP totals, summed from the best run per UTC day. */
export interface ArcadeGameXp {
  readonly gameId: string
  readonly xp: number
}

/** The player's arcade progression, shown in the account panel. */
export interface ArcadeProfile {
  readonly playerId: string
  readonly displayName?: string
  readonly totalXp: number
  readonly level: number
  readonly levelTitle: string
  /** XP at which the current level began. */
  readonly levelStartXp: number
  /** Absolute XP needed for the next level; absent at the top level. */
  readonly nextLevelXp?: number
  /** Competition rank by total XP, when the player has earned any. */
  readonly rank?: number
  readonly medals: readonly ArcadeMedal[]
  readonly games: readonly ArcadeGameXp[]
}

/** The required first input for an anchored daily (Mineflag). */
export interface RunAnchor {
  readonly type: string
  readonly x: number
  readonly y: number
}

export interface DailyChallenge {
  readonly challengeId: string
  readonly date: string
  readonly gameId: string
  readonly modeId: string
  readonly seed: number
  /** UTC midnight when the next challenge starts. */
  readonly endsAt: number
  readonly anchor?: RunAnchor
  readonly attemptsUsed: number
  readonly attemptsLeft: number
  readonly period?: string
  readonly serverNow?: number
}

export interface DailyStart {
  readonly runId: string
  readonly seed: number
  readonly expiresAt?: number
  readonly challengeId: string
  readonly attempt: number
  readonly attemptsLeft: number
  readonly anchor?: RunAnchor
}

export interface AuthState {
  readonly signedIn: boolean
  readonly playerId?: string
  readonly displayName?: string
  readonly githubLogin?: string
  readonly queued?: number
}

export interface DeviceFlow {
  readonly flowId: string
  readonly userCode: string
  readonly verificationUri: string
  readonly interval: number
  readonly expiresAt: number
}

export type AuthPoll =
  | { readonly status: "pending"; readonly interval?: number }
  | ({ readonly status: "complete" } & AuthState)

/**
 * The capability boundary. Games never get auth tokens or raw network access;
 * the shell owns identity, submission, and anti-cheat.
 */
export interface GameHost {
  readonly name: string
  best(gameId: string, modeId: string): Score | undefined
  submit(run: RunResult): Promise<SubmitResult>
  /**
   * Ask the host for a run. A hosted host returns a server-issued seed and run
   * id; a local host omits this and the shell uses a local random seed.
   */
  start?(input: { readonly gameId: string; readonly modeId: string }): Promise<{
    readonly seed: number
    readonly runId?: string
  }>
  /**
   * Refresh the personal best from the hosted board. Local hosts omit this.
   * The returned score may be worse than the local cache; callers should merge.
   */
  loadBest?(gameId: string, modeId: string): Promise<Score | undefined>
  /** Top entries from the hosted board. Local hosts omit this. */
  board?(gameId: string, modeId: string): Promise<readonly BoardEntry[]>
  /** The current player's board entry and rank, when signed in or identified. */
  playerBest?(
    gameId: string,
    modeId: string,
  ): Promise<{
    readonly score?: Score
    readonly rank?: number
    readonly playerId?: string
    readonly xpRank?: number
  }>
  /** Today's featured challenge, when the host supports the daily ladder. */
  daily?(): Promise<DailyChallenge>
  /** Start a daily attempt. Consumes one of the three attempts. */
  startDaily?(challengeId: string): Promise<DailyStart>
  /** The daily board for a challenge id. */
  dailyBoard?(challengeId: string): Promise<readonly BoardEntry[]>
  /** Resolve a verified best run as an unranked practice descriptor. */
  ghost?(ghostId: string): Promise<GhostRun>
  /** The signed-in player's arcade XP, medals, and arcade rank. */
  profile?(): Promise<ArcadeProfile>
  /** Sign-in and account capabilities. Local hosts omit these. */
  authState?(): Promise<AuthState>
  authStart?(): Promise<DeviceFlow>
  authPoll?(flowId: string): Promise<AuthPoll>
  signOut?(): Promise<AuthState>
  deleteAccount?(): Promise<AuthState>
  /** Change the public arcade name shown on leaderboards. */
  updateName?(displayName: string): Promise<AuthState>
  /** Check whether an arcade name is free (case-insensitive). */
  nameAvailable?(displayName: string): Promise<{ readonly name?: string; readonly available: boolean }>
  readonly storage: GameStorage
  readonly audio: AudioBus
  toast(message: string): void
}

/**
 * What game views get: play and presentation only. Account mutation stays with
 * the shell so a cartridge cannot delete a player or revoke a session.
 */
export type ViewHost = Pick<
  GameHost,
  "name" | "best" | "submit" | "start" | "loadBest" | "board" | "storage" | "audio" | "toast"
>
