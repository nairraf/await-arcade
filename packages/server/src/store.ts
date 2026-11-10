import type { BoardEntry, Score } from "@await-arcade/contract"
import type { XpAward, XpAwardInput, XpRecord } from "./xp"
import { competitionRanks, levelFor } from "./xp"

export interface RunRecord {
  readonly runId: string
  readonly gameId: string
  readonly modeId: string
  readonly seed: number
  readonly playerId: string
  readonly createdAt: number
  readonly expiresAt: number
  /** Set for daily challenge runs; also the daily board id. */
  readonly challengeId?: string
  /** 1-based daily attempt number. */
  readonly attempt?: number
  /** Required first input for anchored dailies (Mineflag). */
  readonly anchor?: RunAnchor
}

export interface RunAnchor {
  readonly type: string
  readonly x: number
  readonly y: number
}

export interface GhostRecord {
  readonly ghostId: string
  readonly playerId: string
  readonly gameId: string
  readonly modeId: string
  readonly seed: number
  readonly anchor?: RunAnchor
  readonly createdAt: number
}

/** A player's public XP standing for board enrichment. */
export interface XpSummary {
  readonly rank: number
  readonly level: number
}

export type { BoardEntry }

export interface PlayerRecord {
  readonly playerId: string
  readonly providerId: string
  displayName: string
  /** Case-folded lookup key for display-name uniqueness. */
  nameKey?: string
  /** UTC day and count for the rename limit. */
  renameDay?: string
  renameCount?: number
  readonly createdAt: number
  updatedAt: number
  /** Cumulative arcade XP, kept in step with the daily XP records. */
  xp?: number
  xpUpdatedAt?: number
  readonly githubLogin?: string
  readonly avatarUrl?: string
}

/** Normalize a display name for case-insensitive uniqueness checks. */
export function nameKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US")
}

export interface SessionRecord {
  readonly sessionId: string
  readonly playerId: string
  readonly host: string
  refreshHash: string
  previousRefreshHash?: string
  previousRefreshValidUntil?: number
  refreshExpiresAt: number
  createdAt: number
  lastUsedAt: number
}

export interface AccessTokenRecord {
  readonly hash: string
  readonly playerId: string
  readonly sessionId: string
  readonly expiresAt: number
  readonly createdAt: number
}

export interface RotateSessionInput {
  readonly presentedHash: string
  readonly refreshHash: string
  readonly refreshExpiresAt: number
  readonly previousRefreshValidUntil: number
  readonly now: number
}

export interface AuthFlow {
  readonly flowId: string
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUri: string
  interval: number
  readonly expiresAt: number
  readonly host: string
  readonly createdAt: number
  lastPolledAt?: number
}

export interface StoreTx {
  getRun(runId: string): Promise<RunRecord | undefined>
  putRun(run: RunRecord): Promise<void>
  deleteRun(runId: string): Promise<void>
  getEntry(boardId: string, playerId: string): Promise<BoardEntry | undefined>
  putEntry(boardId: string, entry: BoardEntry): Promise<void>
  putGhost(ghost: GhostRecord): Promise<void>
  deleteGhost(ghostId: string): Promise<void>
  /**
   * Retain the best XP for this player/game/UTC day and return the XP delta
   * added to the player total.
   */
  recordXp(input: XpAwardInput): Promise<XpAward>
  getPlayer(playerId: string): Promise<PlayerRecord | undefined>
}

export interface ArcadeStore {
  createRun(run: RunRecord): Promise<void>
  getRun(runId: string): Promise<RunRecord | undefined>
  transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T>
  top(
    boardId: string,
    limit: number,
    scoreType: Score["type"],
    rankBy?: "score" | "rankKey",
  ): Promise<BoardEntry[]>
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
    rankBy?: "score" | "rankKey",
  ): Promise<number | undefined>
  ensurePlayer(providerId: string, player: PlayerRecord): Promise<PlayerRecord>
  getPlayer(playerId: string): Promise<PlayerRecord | undefined>
  /** Find another player whose normalized display name matches. */
  findPlayerByName(nameKey: string, exceptPlayerId?: string): Promise<PlayerRecord | undefined>
  /** Change the public arcade name and propagate it to existing board rows. */
  updatePlayerName(
    playerId: string,
    displayName: string,
    options?: { readonly dailyLimit?: number; readonly now?: number },
  ): Promise<PlayerRecord | "limited" | undefined>
  getGhost(ghostId: string): Promise<GhostRecord | undefined>
  deleteGhost(ghostId: string): Promise<void>
  /** All retained daily XP records for a player. */
  getXp(playerId: string): Promise<readonly XpRecord[]>
  /** 1-based competition rank by total XP, or undefined with no XP. */
  getXpRank(playerId: string, total?: number): Promise<number | undefined>
  /** Competition XP rank and level for board enrichment, keyed by player id. */
  getXpSummaries(playerIds?: readonly string[]): Promise<ReadonlyMap<string, XpSummary>>
  /** Daily attempts already consumed by this player. */
  getChallengeAttempts(challengeId: string, playerId: string): Promise<number>
  /**
   * Atomically consume one daily attempt. Returns the 1-based attempt number,
   * or undefined when the limit is already reached.
   */
  consumeChallengeAttempt(
    challengeId: string,
    playerId: string,
    limit: number,
    now: number,
  ): Promise<number | undefined>
  putSession(session: SessionRecord): Promise<void>
  getSession(sessionId: string): Promise<SessionRecord | undefined>
  findSessionByRefresh(hash: string): Promise<SessionRecord | undefined>
  /**
   * Compare-and-set rotation. Accepts the current refresh hash or the previous
   * one inside its grace window. Returns undefined when neither matches.
   */
  rotateSession(sessionId: string, input: RotateSessionInput): Promise<SessionRecord | undefined>
  deleteSession(sessionId: string): Promise<void>
  putAccessToken(token: AccessTokenRecord): Promise<void>
  getAccessToken(hash: string): Promise<AccessTokenRecord | undefined>
  deleteAccessTokensForSession(sessionId: string): Promise<void>
  putFlow(flow: AuthFlow): Promise<void>
  getFlow(flowId: string): Promise<AuthFlow | undefined>
  deleteFlow(flowId: string): Promise<void>
  deletePlayerData(
    playerId: string,
    providerId: string,
    boardIds?: readonly string[],
  ): Promise<void>
}

function beats(candidate: Score, other: Score, scoreType: Score["type"]): boolean {
  return scoreType === "lower" ? candidate.value < other.value : candidate.value > other.value
}

function attemptKey(challengeId: string, playerId: string): string {
  return `${challengeId}|${playerId}`
}

export class MemoryStore implements ArcadeStore {
  private readonly runs = new Map<string, RunRecord>()
  private readonly boards = new Map<string, Map<string, BoardEntry>>()
  private readonly players = new Map<string, PlayerRecord>()
  private readonly providers = new Map<string, string>()
  private readonly challengeAttempts = new Map<string, number>()
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly accessTokens = new Map<string, AccessTokenRecord>()
  private readonly flows = new Map<string, AuthFlow>()
  private readonly ghosts = new Map<string, GhostRecord>()
  private readonly xpRecords = new Map<string, XpRecord>()

  async createRun(run: RunRecord): Promise<void> {
    this.runs.set(run.runId, run)
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.runs.get(runId)
  }

  async transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    const runs = this.runs
    const boards = this.boards
    const players = this.players
    const ghosts = this.ghosts
    const xpRecords = this.xpRecords
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
      async putGhost(ghost) {
        ghosts.set(ghost.ghostId, ghost)
      },
      async deleteGhost(ghostId) {
        ghosts.delete(ghostId)
      },
      async recordXp(input) {
        const key = `${input.playerId}|${input.gameId}|${input.day}`
        const existing = xpRecords.get(key)
        if (existing && existing.xp >= input.xp) {
          return {
            total: players.get(input.playerId)?.xp ?? 0,
            awarded: 0,
            dailyBest: existing.xp,
          }
        }
        const delta = input.xp - (existing?.xp ?? 0)
        xpRecords.set(key, {
          playerId: input.playerId,
          gameId: input.gameId,
          day: input.day,
          xp: input.xp,
          updatedAt: input.now,
        })
        const player = players.get(input.playerId)
        if (player) {
          player.xp = (player.xp ?? 0) + delta
          player.xpUpdatedAt = input.now
          player.updatedAt = input.now
        }
        return {
          total: player?.xp ?? delta,
          awarded: delta,
          dailyBest: input.xp,
        }
      },
      async getPlayer(playerId) {
        return players.get(playerId)
      },
    }
    return fn(tx)
  }

  async top(
    boardId: string,
    limit: number,
    scoreType: Score["type"],
    rankBy: "score" | "rankKey" = "score",
  ): Promise<BoardEntry[]> {
    const entries = [...(this.boards.get(boardId)?.values() ?? [])]
    if (rankBy === "rankKey") {
      entries.sort((left, right) => (left.rankKey ?? "").localeCompare(right.rankKey ?? ""))
    } else {
      entries.sort((left, right) =>
        scoreType === "lower"
          ? left.score.value - right.score.value
          : right.score.value - left.score.value,
      )
    }
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
    rankBy: "score" | "rankKey" = "score",
  ): Promise<number | undefined> {
    const mine = entry ?? (await this.getEntry(boardId, playerId))
    if (!mine) return undefined
    let better = 0
    for (const item of this.boards.get(boardId)?.values() ?? []) {
      if (item.playerId === playerId) continue
      if (rankBy === "rankKey") {
        if (mine.rankKey && item.rankKey && item.rankKey < mine.rankKey) better += 1
      } else if (beats(item.score, mine.score, scoreType)) {
        better += 1
      }
    }
    return better + 1
  }

  async getGhost(ghostId: string): Promise<GhostRecord | undefined> {
    return this.ghosts.get(ghostId)
  }

  async deleteGhost(ghostId: string): Promise<void> {
    this.ghosts.delete(ghostId)
  }

  async getXp(playerId: string): Promise<readonly XpRecord[]> {
    return [...this.xpRecords.values()].filter((record) => record.playerId === playerId)
  }

  async getXpRank(playerId: string, total?: number): Promise<number | undefined> {
    const player = this.players.get(playerId)
    const mine = total ?? player?.xp
    if (!mine) return undefined
    let better = 0
    for (const other of this.players.values()) {
      if (other.playerId !== playerId && (other.xp ?? 0) > mine) better += 1
    }
    return better + 1
  }

  async getXpSummaries(playerIds?: readonly string[]): Promise<ReadonlyMap<string, XpSummary>> {
    const players = [...this.players.values()].map((player) => ({
      playerId: player.playerId,
      xp: player.xp ?? 0,
    }))
    const wanted = playerIds ? new Set(playerIds) : undefined
    const ranks = competitionRanks(players, wanted)
    const summaries = new Map<string, XpSummary>()
    for (const player of players) {
      if (player.xp <= 0 || (wanted && !wanted.has(player.playerId))) continue
      const rank = ranks.get(player.playerId)
      if (rank === undefined) continue
      summaries.set(player.playerId, { rank, level: levelFor(player.xp).level })
    }
    return summaries
  }

  async ensurePlayer(providerId: string, player: PlayerRecord): Promise<PlayerRecord> {
    if (!player.nameKey) player.nameKey = nameKey(player.displayName)
    const existingId = this.providers.get(providerId)
    if (existingId) {
      const existing = this.players.get(existingId)
      if (existing) {
        if (!existing.nameKey) existing.nameKey = nameKey(existing.displayName)
        return existing
      }
      this.players.set(player.playerId, player)
      this.providers.set(providerId, player.playerId)
      return player
    }
    this.players.set(player.playerId, player)
    this.providers.set(providerId, player.playerId)
    return player
  }

  async getPlayer(playerId: string): Promise<PlayerRecord | undefined> {
    return this.players.get(playerId)
  }

  async findPlayerByName(
    key: string,
    exceptPlayerId?: string,
  ): Promise<PlayerRecord | undefined> {
    for (const player of this.players.values()) {
      if (player.playerId !== exceptPlayerId && nameKey(player.displayName) === key) {
        return player
      }
    }
    return undefined
  }

  async updatePlayerName(
    playerId: string,
    displayName: string,
    options: { readonly dailyLimit?: number; readonly now?: number } = {},
  ): Promise<PlayerRecord | "limited" | undefined> {
    const player = this.players.get(playerId)
    if (!player) return undefined
    const now = options.now ?? Date.now()
    const day = new Date(now).toISOString().slice(0, 10)
    const used = player.renameDay === day ? (player.renameCount ?? 0) : 0
    if (options.dailyLimit !== undefined && used >= options.dailyLimit) return "limited"

    player.displayName = displayName
    player.nameKey = nameKey(displayName)
    player.renameDay = day
    player.renameCount = used + 1
    player.updatedAt = now
    for (const board of this.boards.values()) {
      const entry = board.get(playerId)
      if (entry) board.set(playerId, { ...entry, displayName })
    }
    return player
  }

  async getChallengeAttempts(challengeId: string, playerId: string): Promise<number> {
    return this.challengeAttempts.get(attemptKey(challengeId, playerId)) ?? 0
  }

  async consumeChallengeAttempt(
    challengeId: string,
    playerId: string,
    limit: number,
    _now: number,
  ): Promise<number | undefined> {
    const key = attemptKey(challengeId, playerId)
    const used = this.challengeAttempts.get(key) ?? 0
    if (used >= limit) return undefined
    const next = used + 1
    this.challengeAttempts.set(key, next)
    return next
  }

  async putSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, session)
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    return this.sessions.get(sessionId)
  }

  async findSessionByRefresh(hash: string): Promise<SessionRecord | undefined> {
    for (const session of this.sessions.values()) {
      if (session.refreshHash === hash || session.previousRefreshHash === hash) return session
    }
    return undefined
  }

  async rotateSession(
    sessionId: string,
    input: RotateSessionInput,
  ): Promise<SessionRecord | undefined> {
    const session = this.sessions.get(sessionId)
    if (!session) return undefined

    const isCurrent = session.refreshHash === input.presentedHash
    const isPrevious =
      session.previousRefreshHash === input.presentedHash &&
      session.previousRefreshValidUntil !== undefined &&
      input.now < session.previousRefreshValidUntil

    if (!isCurrent && !isPrevious) return undefined

    session.previousRefreshHash = session.refreshHash
    session.previousRefreshValidUntil = input.previousRefreshValidUntil
    session.refreshHash = input.refreshHash
    session.refreshExpiresAt = input.refreshExpiresAt
    session.lastUsedAt = input.now
    return session
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async putAccessToken(token: AccessTokenRecord): Promise<void> {
    this.accessTokens.set(token.hash, token)
  }

  async getAccessToken(hash: string): Promise<AccessTokenRecord | undefined> {
    const token = this.accessTokens.get(hash)
    if (!token) return undefined
    if (token.expiresAt < Date.now()) {
      this.accessTokens.delete(hash)
      return undefined
    }
    return token
  }

  async deleteAccessTokensForSession(sessionId: string): Promise<void> {
    for (const [hash, token] of this.accessTokens) {
      if (token.sessionId === sessionId) this.accessTokens.delete(hash)
    }
  }

  async putFlow(flow: AuthFlow): Promise<void> {
    this.flows.set(flow.flowId, flow)
  }

  async getFlow(flowId: string): Promise<AuthFlow | undefined> {
    return this.flows.get(flowId)
  }

  async deleteFlow(flowId: string): Promise<void> {
    this.flows.delete(flowId)
  }

  async deletePlayerData(
    playerId: string,
    providerId: string,
    _boardIds?: readonly string[],
  ): Promise<void> {
    this.players.delete(playerId)
    this.providers.delete(providerId)
    for (const [id, session] of this.sessions) {
      if (session.playerId === playerId) this.sessions.delete(id)
    }
    for (const [hash, token] of this.accessTokens) {
      if (token.playerId === playerId) this.accessTokens.delete(hash)
    }
    for (const board of this.boards.values()) board.delete(playerId)
    for (const [ghostId, ghost] of this.ghosts) {
      if (ghost.playerId === playerId) this.ghosts.delete(ghostId)
    }
    for (const [key, record] of this.xpRecords) {
      if (record.playerId === playerId) this.xpRecords.delete(key)
    }
    for (const [key] of this.challengeAttempts) {
      if (key.endsWith(`|${playerId}`)) this.challengeAttempts.delete(key)
    }
    for (const [id, run] of this.runs) {
      if (run.playerId === playerId) this.runs.delete(id)
    }
  }
}
