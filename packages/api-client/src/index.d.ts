import type { Replay, Score, SubmitResult } from "@await-arcade/contract"

export interface ArcadeClientOptions {
  readonly baseUrl: string
  readonly playerId: string
  readonly fetchImpl?: typeof fetch
}

export interface StartRun {
  readonly runId: string
  readonly seed: number
  readonly expiresAt?: number
}

export interface BoardEntry {
  readonly playerId: string
  readonly score: Score
  readonly achievedAt?: number
}

export interface Board {
  readonly entries: BoardEntry[]
}

export interface ArcadeClient {
  start(gameId: string, modeId: string): Promise<StartRun>
  submit(runId: string, replay: Replay): Promise<SubmitResult>
  board(gameId: string, modeId: string): Promise<Board>
  bestFor(gameId: string, modeId: string): Promise<Score | undefined>
  status(): Promise<{ readonly mode: "online"; readonly playerId: string }>
}

export declare function createArcadeClient(options: ArcadeClientOptions): ArcadeClient
