import { Firestore } from "@google-cloud/firestore"
import type {
  AccessTokenRecord,
  ArcadeStore,
  AuthFlow,
  BoardEntry,
  PlayerRecord,
  RotateSessionInput,
  RunRecord,
  SessionRecord,
  StoreTx,
} from "./store"

export interface FirestoreStoreOptions {
  readonly projectId?: string
  readonly databaseId?: string
}

export class FirestoreStore implements ArcadeStore {
  private readonly db: Firestore

  constructor(options: FirestoreStoreOptions = {}) {
    const config: { projectId?: string; databaseId?: string } = {}
    if (options.projectId) config.projectId = options.projectId
    if (options.databaseId) config.databaseId = options.databaseId
    this.db = new Firestore(config)
  }

  private runDoc(runId: string) {
    return this.db.collection("runs").doc(runId)
  }

  private entryDoc(boardId: string, playerId: string) {
    return this.db.collection("boards").doc(boardId).collection("entries").doc(playerId)
  }

  private boardDoc(boardId: string) {
    return this.db.collection("boards").doc(boardId)
  }

  async createRun(run: RunRecord): Promise<void> {
    await this.runDoc(run.runId).set({ ...run, expireAt: new Date(run.expiresAt) })
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const snapshot = await this.runDoc(runId).get()
    return snapshot.exists ? (snapshot.data() as RunRecord) : undefined
  }

  async transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (transaction) => {
      const runDoc = (runId: string) => this.runDoc(runId)
      const entryDoc = (boardId: string, playerId: string) => this.entryDoc(boardId, playerId)
      const boardDoc = (boardId: string) => this.boardDoc(boardId)
      const playerDoc = (playerId: string) => this.playerDoc(playerId)

      const tx: StoreTx = {
        async getRun(runId) {
          const snapshot = await transaction.get(runDoc(runId))
          return snapshot.exists ? (snapshot.data() as RunRecord) : undefined
        },
        async putRun(run) {
          transaction.set(runDoc(run.runId), run)
        },
        async deleteRun(runId) {
          transaction.delete(runDoc(runId))
        },
        async getEntry(boardId, playerId) {
          const snapshot = await transaction.get(entryDoc(boardId, playerId))
          return snapshot.exists ? (snapshot.data() as BoardEntry) : undefined
        },
        async putEntry(boardId, entry) {
          transaction.set(entryDoc(boardId, entry.playerId), entry)
          // Keep a parent board document so deleting a player can enumerate boards.
          transaction.set(
            boardDoc(boardId),
            { updatedAt: Date.now() },
            { merge: true },
          )
        },
        async getPlayer(playerId) {
          const snapshot = await transaction.get(playerDoc(playerId))
          return snapshot.exists ? (snapshot.data() as PlayerRecord) : undefined
        },
      }

      return fn(tx)
    })
  }

  async top(boardId: string, limit: number, scoreType: "higher" | "lower"): Promise<BoardEntry[]> {
    const snapshot = await this.db
      .collection("boards")
      .doc(boardId)
      .collection("entries")
      .orderBy("score.value", scoreType === "lower" ? "asc" : "desc")
      .limit(limit)
      .get()

    return snapshot.docs.map((doc) => doc.data() as BoardEntry)
  }

  async getEntry(boardId: string, playerId: string): Promise<BoardEntry | undefined> {
    const snapshot = await this.entryDoc(boardId, playerId).get()
    return snapshot.exists ? (snapshot.data() as BoardEntry) : undefined
  }

  async rank(
    boardId: string,
    playerId: string,
    scoreType: "higher" | "lower",
    entry?: BoardEntry,
  ): Promise<number | undefined> {
    const mine = entry ?? (await this.getEntry(boardId, playerId))
    if (!mine) return undefined

    const snapshot = await this.db
      .collection("boards")
      .doc(boardId)
      .collection("entries")
      .where("score.value", scoreType === "lower" ? "<" : ">", mine.score.value)
      .count()
      .get()

    return snapshot.data().count + 1
  }

  private playerDoc(playerId: string) {
    return this.db.collection("players").doc(playerId)
  }

  async ensurePlayer(providerId: string, player: PlayerRecord): Promise<PlayerRecord> {
    const providerRef = this.db.collection("providers").doc(providerId)

    return this.db.runTransaction(async (transaction) => {
      const provider = await transaction.get(providerRef)
      if (provider.exists) {
        const playerRef = this.playerDoc(String(provider.get("playerId")))
        const existing = await transaction.get(playerRef)
        if (existing.exists) return existing.data() as PlayerRecord

        // Repair a provider link whose player document is missing.
        transaction.set(this.playerDoc(player.playerId), player)
        transaction.set(providerRef, { playerId: player.playerId, createdAt: player.createdAt })
        return player
      }

      transaction.set(this.playerDoc(player.playerId), player)
      transaction.set(providerRef, { playerId: player.playerId, createdAt: player.createdAt })
      return player
    })
  }

  async getPlayer(playerId: string): Promise<PlayerRecord | undefined> {
    const snapshot = await this.playerDoc(playerId).get()
    return snapshot.exists ? (snapshot.data() as PlayerRecord) : undefined
  }

  async putSession(session: SessionRecord): Promise<void> {
    await this.db
      .collection("sessions")
      .doc(session.sessionId)
      .set({ ...session, expireAt: new Date(session.refreshExpiresAt) })
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    const snapshot = await this.db.collection("sessions").doc(sessionId).get()
    return snapshot.exists ? (snapshot.data() as SessionRecord) : undefined
  }

  async findSessionByRefresh(hash: string): Promise<SessionRecord | undefined> {
    const current = await this.findSession("refreshHash", hash)
    if (current) return current
    return this.findSession("previousRefreshHash", hash)
  }

  private async findSession(field: "refreshHash" | "previousRefreshHash", hash: string) {
    const snapshot = await this.db.collection("sessions").where(field, "==", hash).limit(1).get()
    const doc = snapshot.docs[0]
    return doc ? (doc.data() as SessionRecord) : undefined
  }

  async rotateSession(
    sessionId: string,
    input: RotateSessionInput,
  ): Promise<SessionRecord | undefined> {
    const ref = this.db.collection("sessions").doc(sessionId)

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref)
      if (!snapshot.exists) return undefined

      const session = snapshot.data() as SessionRecord
      const isCurrent = session.refreshHash === input.presentedHash
      const isPrevious =
        session.previousRefreshHash === input.presentedHash &&
        session.previousRefreshValidUntil !== undefined &&
        input.now < session.previousRefreshValidUntil

      if (!isCurrent && !isPrevious) return undefined

      const next: SessionRecord = {
        ...session,
        refreshHash: input.refreshHash,
        refreshExpiresAt: input.refreshExpiresAt,
        lastUsedAt: input.now,
        previousRefreshHash: session.refreshHash,
        previousRefreshValidUntil: input.previousRefreshValidUntil,
      }
      transaction.set(ref, { ...next, expireAt: new Date(next.refreshExpiresAt) })
      return next
    })
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.collection("sessions").doc(sessionId).delete()
  }

  async putAccessToken(token: AccessTokenRecord): Promise<void> {
    await this.db
      .collection("accessTokens")
      .doc(token.hash)
      .set({ ...token, expireAt: new Date(token.expiresAt) })
  }

  async getAccessToken(hash: string): Promise<AccessTokenRecord | undefined> {
    const ref = this.db.collection("accessTokens").doc(hash)
    const snapshot = await ref.get()
    if (!snapshot.exists) return undefined

    const token = snapshot.data() as AccessTokenRecord
    if (token.expiresAt < Date.now()) {
      await ref.delete()
      return undefined
    }
    return token
  }

  async deleteAccessTokensForSession(sessionId: string): Promise<void> {
    const tokens = await this.db
      .collection("accessTokens")
      .where("sessionId", "==", sessionId)
      .get()
    if (tokens.empty) return

    const writer = this.db.bulkWriter()
    for (const token of tokens.docs) writer.delete(token.ref)
    await writer.close()
  }

  async putFlow(flow: AuthFlow): Promise<void> {
    await this.db
      .collection("authFlows")
      .doc(flow.flowId)
      .set({ ...flow, expireAt: new Date(flow.expiresAt) })
  }

  async getFlow(flowId: string): Promise<AuthFlow | undefined> {
    const snapshot = await this.db.collection("authFlows").doc(flowId).get()
    return snapshot.exists ? (snapshot.data() as AuthFlow) : undefined
  }

  async deleteFlow(flowId: string): Promise<void> {
    await this.db.collection("authFlows").doc(flowId).delete()
  }

  async deletePlayerData(
    playerId: string,
    providerId: string,
    boardIds: readonly string[] = [],
  ): Promise<void> {
    const writer = this.db.bulkWriter()
    writer.delete(this.playerDoc(playerId))
    writer.delete(this.db.collection("providers").doc(providerId))

    const [sessions, tokens, runs, boards] = await Promise.all([
      this.db.collection("sessions").where("playerId", "==", playerId).get(),
      this.db.collection("accessTokens").where("playerId", "==", playerId).get(),
      this.db.collection("runs").where("playerId", "==", playerId).get(),
      this.db.collection("boards").get(),
    ])

    for (const session of sessions.docs) writer.delete(session.ref)
    for (const token of tokens.docs) writer.delete(token.ref)
    for (const run of runs.docs) writer.delete(run.ref)

    const seen = new Set<string>()
    for (const boardId of boardIds) {
      seen.add(boardId)
      writer.delete(this.entryDoc(boardId, playerId))
    }
    for (const board of boards.docs) {
      if (seen.has(board.id)) continue
      writer.delete(board.ref.collection("entries").doc(playerId))
    }

    await writer.close()
  }
}
