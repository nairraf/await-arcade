import type { BoardEntry, Replay, Score, SubmitResult } from "@await-arcade/contract"

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

export interface ArcadeClient {
  start(gameId: string, modeId: string): Promise<StartRun>
  submit(runId: string, replay: Replay): Promise<SubmitResult>
  board(gameId: string, modeId: string): Promise<Board>
  bestFor(gameId: string, modeId: string): Promise<Score | undefined>
  playerBest(
    gameId: string,
    modeId: string,
  ): Promise<{ readonly score?: Score; readonly rank?: number; readonly playerId?: string }>
  status(): Promise<{ readonly mode: "online"; readonly playerId: string }>
}

export declare function createArcadeClient(options: ArcadeClientOptions): ArcadeClient
