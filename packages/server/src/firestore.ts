import { Firestore } from "@google-cloud/firestore"
import type { ArcadeStore, BoardEntry, RunRecord, StoreTx } from "./store"

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

  async createRun(run: RunRecord): Promise<void> {
    await this.runDoc(run.runId).set(run)
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const snapshot = await this.runDoc(runId).get()
    return snapshot.exists ? (snapshot.data() as RunRecord) : undefined
  }

  async transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (transaction) => {
      const runDoc = (runId: string) => this.runDoc(runId)
      const entryDoc = (boardId: string, playerId: string) => this.entryDoc(boardId, playerId)

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
}
