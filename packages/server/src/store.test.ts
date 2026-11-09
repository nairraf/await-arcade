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

  it("orders and ranks daily entries by attempt, time, then moves", async () => {
    const store = new MemoryStore()
    const daily = (playerId: string, rankKey: string): BoardEntry => ({
      ...entry(playerId, 1, "lower"),
      rankKey,
    })

    await store.transaction(async (tx) => {
      await tx.putEntry("daily", daily("second-try", "02|0000000500|000100"))
      await tx.putEntry("daily", daily("slow", "01|0000001000|000200"))
      await tx.putEntry("daily", daily("more-moves", "01|0000000800|000300"))
      await tx.putEntry("daily", daily("fewer-moves", "01|0000000800|000200"))
    })

    const top = await store.top("daily", 10, "lower", "rankKey")
    expect(top.map((item) => item.playerId)).toEqual([
      "fewer-moves",
      "more-moves",
      "slow",
      "second-try",
    ])
    expect(await store.rank("daily", "second-try", "lower", undefined, "rankKey")).toBe(4)
  })

  it("returns undefined for a player with no entry", async () => {
    const store = new MemoryStore()
    expect(await store.rank("board", "nobody", "higher")).toBeUndefined()
  })
})
