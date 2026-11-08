import type {
  BoardEntry,
  DailyChallenge,
  DailyStart,
  Replay,
  Score,
  SubmitResult,
} from "@await-arcade/contract"

export type { BoardEntry }

export interface ArcadeClientOptions {
  readonly baseUrl: string
  readonly playerId: string
  readonly fetchImpl?: typeof fetch
  readonly getToken?: () => string | undefined
}

export interface StartRun {
  readonly runId: string
  readonly seed: number
  readonly expiresAt?: number
}

export interface Board {
  readonly entries: BoardEntry[]
  readonly period?: string
}

export interface DailyBoard extends Board {
  readonly challengeId: string
  readonly gameId: string
  readonly modeId: string
  readonly date: string
}

export interface ArcadeClient {
  start(gameId: string, modeId: string): Promise<StartRun>
  submit(runId: string, replay: Replay): Promise<SubmitResult>
  board(gameId: string, modeId: string): Promise<Board>
  bestFor(gameId: string, modeId: string): Promise<Score | undefined>
  playerBest(
    gameId: string,
    modeId: string,
  ): Promise<{ readonly score?: Score; readonly rank?: number; readonly playerId?: string }>
  dailyToday(): Promise<DailyChallenge>
  dailyStart(challengeId: string): Promise<DailyStart>
  dailyBoard(challengeId: string): Promise<DailyBoard>
  status(): Promise<{ readonly mode: "online"; readonly playerId: string }>
}

export interface HostSessionOptions {
  readonly host: string
  readonly playerId: string
  readonly baseUrl?: string
  readonly stateDir?: string
  readonly fetchImpl?: typeof fetch
  readonly readQueue?: () => Promise<any[]> | any[]
  readonly writeQueue?: (items: any[]) => Promise<void> | void
}

export interface HostSession {
  readonly client: ArcadeClient
  readonly auth: unknown
  readonly accessToken: string | undefined
  ensureAuth(): Promise<boolean>
  requireAuth(): Promise<void>
  refresh(): Promise<boolean>
  flush(): Promise<void>
  status(): Promise<Record<string, unknown>>
  start(gameId: string, modeId: string): Promise<StartRun>
  submit(runId: string, replay: Replay): Promise<SubmitResult>
  best(gameId: string, modeId: string): Promise<{ best: Score | undefined }>
  board(gameId: string, modeId: string): Promise<Board>
  playerBest(gameId: string, modeId: string): Promise<{ readonly score?: Score; readonly rank?: number; readonly playerId?: string }>
  daily(): Promise<DailyChallenge>
  dailyStart(challengeId: string): Promise<DailyStart>
  dailyBoard(challengeId: string): Promise<DailyBoard>
  authStart(): Promise<unknown>
  authPoll(flowId: string): Promise<unknown>
  authSignOut(): Promise<Record<string, unknown>>
  deleteAccount(): Promise<Record<string, unknown>>
}

export declare function stateDir(): string
export declare function apiUrl(dir?: string): string
export declare function createHostSession(options: HostSessionOptions): HostSession
export declare function createArcadeClient(options: ArcadeClientOptions): ArcadeClient
