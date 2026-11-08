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

  it("returns undefined for a player with no entry", async () => {
    const store = new MemoryStore()
    expect(await store.rank("board", "nobody", "higher")).toBeUndefined()
  })
})
