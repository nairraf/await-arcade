import type { BoardEntry, Score } from "@await-arcade/contract"

export interface RunRecord {
  readonly runId: string
  readonly gameId: string
  readonly modeId: string
  readonly seed: number
  readonly playerId: string
  readonly createdAt: number
  readonly expiresAt: number
}

export type { BoardEntry }

export interface StoreTx {
  getRun(runId: string): Promise<RunRecord | undefined>
  putRun(run: RunRecord): Promise<void>
  deleteRun(runId: string): Promise<void>
  getEntry(boardId: string, playerId: string): Promise<BoardEntry | undefined>
  putEntry(boardId: string, entry: BoardEntry): Promise<void>
}

export interface ArcadeStore {
  createRun(run: RunRecord): Promise<void>
  getRun(runId: string): Promise<RunRecord | undefined>
  transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T>
  top(boardId: string, limit: number, scoreType: Score["type"]): Promise<BoardEntry[]>
  getEntry(boardId: string, playerId: string): Promise<BoardEntry | undefined>
  /**
   * 1-based competition rank, or undefined when the player has no entry.
   * Pass `entry` when the caller already read it to avoid a second fetch.
   */
  rank(
    boardId: string,
    playerId: string,
    scoreType: Score["type"],
    entry?: BoardEntry,
  ): Promise<number | undefined>
}

function beats(candidate: Score, other: Score, scoreType: Score["type"]): boolean {
  return scoreType === "lower" ? candidate.value < other.value : candidate.value > other.value
}

export class MemoryStore implements ArcadeStore {
  private readonly runs = new Map<string, RunRecord>()
  private readonly boards = new Map<string, Map<string, BoardEntry>>()

  async createRun(run: RunRecord): Promise<void> {
    this.runs.set(run.runId, run)
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.runs.get(runId)
  }

  async transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    const runs = this.runs
    const boards = this.boards
    const tx: StoreTx = {
      async getRun(runId) {
        return runs.get(runId)
      },
      async putRun(run) {
        runs.set(run.runId, run)
      },
      async deleteRun(runId) {
        runs.delete(runId)
      },
      async getEntry(boardId, playerId) {
        return boards.get(boardId)?.get(playerId)
      },
      async putEntry(boardId, entry) {
        const board = boards.get(boardId) ?? new Map<string, BoardEntry>()
        boards.set(boardId, board)
        board.set(entry.playerId, entry)
      },
    }
    return fn(tx)
  }

  async top(boardId: string, limit: number, scoreType: Score["type"]): Promise<BoardEntry[]> {
    const entries = [...(this.boards.get(boardId)?.values() ?? [])]
    entries.sort((left, right) =>
      scoreType === "lower"
        ? left.score.value - right.score.value
        : right.score.value - left.score.value,
    )
    return entries.slice(0, limit)
  }

  async getEntry(boardId: string, playerId: string): Promise<BoardEntry | undefined> {
    return this.boards.get(boardId)?.get(playerId)
  }

  async rank(
    boardId: string,
    playerId: string,
    scoreType: Score["type"],
    entry?: BoardEntry,
  ): Promise<number | undefined> {
    const mine = entry ?? (await this.getEntry(boardId, playerId))
    if (!mine) return undefined
    let better = 0
    for (const item of this.boards.get(boardId)?.values() ?? []) {
      if (item.playerId !== playerId && beats(item.score, mine.score, scoreType)) better += 1
    }
    return better + 1
  }
}
