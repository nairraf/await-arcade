import { describe, expect, it } from "vitest"
import { MemoryStore, type BoardEntry } from "./store"

function entry(playerId: string, value: number, type: "higher" | "lower" = "higher"): BoardEntry {
  return {
    playerId,
    achievedAt: 0,
    score: { value, type, won: false, ranked: true },
  }
}

describe("MemoryStore.rank", () => {
  it("shares rank on ties and counts strictly better scores", async () => {
    const store = new MemoryStore()
    await store.transaction(async (tx) => {
      await tx.putEntry("board", entry("a", 10))
      await tx.putEntry("board", entry("b", 10))
      await tx.putEntry("board", entry("c", 20))
    })

    expect(await store.rank("board", "a", "higher")).toBe(2)
    expect(await store.rank("board", "b", "higher")).toBe(2)
    expect(await store.rank("board", "c", "higher")).toBe(1)
  })

  it("ranks lower-is-better scores", async () => {
    const store = new MemoryStore()
    await store.transaction(async (tx) => {
      await tx.putEntry("board", entry("slow", 30, "lower"))
      await tx.putEntry("board", entry("fast", 10, "lower"))
    })

    expect(await store.rank("board", "slow", "lower")).toBe(2)
    expect(await store.rank("board", "fast", "lower")).toBe(1)
  })

  it("orders and ranks daily entries by moves, then time", async () => {
    const store = new MemoryStore()
    const daily = (playerId: string, rankKey: string): BoardEntry => ({
      ...entry(playerId, 1, "lower"),
      rankKey,
    })

    await store.transaction(async (tx) => {
      await tx.putEntry("daily", daily("second-try", "000100|0000000500"))
      await tx.putEntry("daily", daily("slow", "000200|0000001000"))
      await tx.putEntry("daily", daily("more-moves", "000300|0000000800"))
      await tx.putEntry("daily", daily("fewer-moves", "000200|0000000800"))
    })

    const top = await store.top("daily", 10, "lower", "rankKey")
    expect(top.map((item) => item.playerId)).toEqual([
      "second-try",
      "fewer-moves",
      "slow",
      "more-moves",
    ])
    expect(await store.rank("daily", "second-try", "lower", undefined, "rankKey")).toBe(1)
  })

  it("returns undefined for a player with no entry", async () => {
    const store = new MemoryStore()
    expect(await store.rank("board", "nobody", "higher")).toBeUndefined()
  })

  it("computes competition XP ranks for board enrichment", async () => {
    const store = new MemoryStore()
    const now = Date.now()
    for (const [playerId, xp] of [
      ["low", 20],
      ["high", 300],
      ["tie-a", 60],
      ["tie-b", 60],
      ["zero", 0],
    ] as const) {
      await store.ensurePlayer(`github:${playerId}`, {
        playerId,
        providerId: `github:${playerId}`,
        displayName: playerId,
        createdAt: now,
        updatedAt: now,
        xp,
      })
    }

    const summaries = await store.getXpSummaries(["high", "tie-a", "low", "zero", "nobody"])
    expect(summaries.get("high")?.rank).toBe(1)
    expect(summaries.get("high")?.level).toBe(2)
    expect(summaries.get("tie-a")?.rank).toBe(2)
    expect(summaries.get("tie-a")?.level).toBe(1)
    expect(summaries.get("low")?.rank).toBe(4)
    expect(summaries.has("zero")).toBe(false)
    expect(summaries.has("nobody")).toBe(false)
  })

  it("stores ghosts and removes them when the player is deleted", async () => {
    const store = new MemoryStore()
    await store.transaction(async (tx) => {
      await tx.putGhost({
        ghostId: "run-1",
        playerId: "ghost-player",
        gameId: "mineflag",
        modeId: "expert",
        seed: 42,
        createdAt: 0,
      })
    })

    expect((await store.getGhost("run-1"))?.seed).toBe(42)
    await store.deleteGhost("run-1")
    expect(await store.getGhost("run-1")).toBeUndefined()

    await store.transaction(async (tx) => {
      await tx.putGhost({
        ghostId: "run-2",
        playerId: "ghost-player",
        gameId: "mineflag",
        modeId: "expert",
        seed: 43,
        createdAt: 0,
      })
    })
    await store.deletePlayerData("ghost-player", "github:1")
    expect(await store.getGhost("run-2")).toBeUndefined()
  })
})
