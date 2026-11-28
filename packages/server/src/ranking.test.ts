import type { GameMeta } from "@await-arcade/contract"
import { describe, expect, it } from "vitest"
import { rankingPolicy, rankKeyFor } from "./ranking"
import { verifiers } from "./registry.generated"

function metaFor(gameId: string): GameMeta {
  const entry = verifiers[gameId]
  if (!entry) throw new Error(`missing game ${gameId}`)
  return entry.meta
}

describe("ranking policy", () => {
  it("orders the puzzle boards by server time", () => {
    for (const gameId of ["nonogram", "router", "tilechain", "crates"]) {
      expect(rankingPolicy(metaFor(gameId))).toEqual({ value: "score", timed: true })
      expect(rankingPolicy(metaFor(gameId), "2026-11-27")).toEqual({
        value: "score",
        timed: true,
      })
    }
  })

  it("limits Mineflag's time tiebreak to daily boards", () => {
    expect(rankingPolicy(metaFor("mineflag"))).toEqual({ value: "moves", timed: false })
    expect(rankingPolicy(metaFor("mineflag"), "2026-11-27")).toEqual({
      value: "moves",
      timed: true,
    })
  })

  it("leaves ordinary boards on plain score order", () => {
    for (const gameId of ["brickstorm", "codebreaker", "light-cycles", "lockstep", "mergegrid"]) {
      expect(rankingPolicy(metaFor(gameId))).toEqual({ value: "score", timed: false })
      expect(rankingPolicy(metaFor(gameId), "2026-11-27")).toEqual({
        value: "score",
        timed: false,
      })
    }
  })
})

describe("server rank key", () => {
  it("turns higher scores into an ascending penalty", () => {
    expect(rankKeyFor("higher", 10_000, 9_500, 5_000)).toBe("000500|0000005000")
    expect(rankKeyFor("higher", 10_000, 9_500, 12_000)).toBe("000500|0000012000")
  })

  it("keeps lower scores ascending", () => {
    expect(rankKeyFor("lower", 100_000, 42, 5_000)).toBe("000042|0000005000")
  })

  it("clamps and rounds the elapsed time", () => {
    expect(rankKeyFor("higher", 100, 100, -50)).toBe("000000|0000000000")
    expect(rankKeyFor("higher", 100, 100, 12_345_678_901)).toBe("000000|9999999999")
    expect(rankKeyFor("higher", 100, 100, 999.6)).toBe("000000|0000001000")
  })

  it("clamps the primary into the fixed six-digit field", () => {
    expect(rankKeyFor("lower", 2_000_000, 2_000_000, 0)).toBe("999999|0000000000")
    expect(rankKeyFor("higher", 2_000_000, 2_000_000, 0)).toBe("000000|0000000000")
    expect(rankKeyFor("higher", 1_000_000, 1, 0)).toBe("999999|0000000000")
  })

  it("sorts an earlier run first at the same value", () => {
    const fast = rankKeyFor("higher", 10_000, 9_500, 5_000)
    const slow = rankKeyFor("higher", 10_000, 9_500, 15_000)
    expect(fast < slow).toBe(true)
    expect(rankKeyFor("lower", 100_000, 42, 5_000) < rankKeyFor("lower", 100_000, 43, 5_000)).toBe(
      true,
    )
  })
})
