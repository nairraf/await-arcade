import { describe, expect, it } from "vitest"
import { gameXp, levelFor, medalsFor, totalXp, xpForRun, type XpRecord } from "./xp"

function record(
  gameId: string,
  day: string,
  xp: number,
  updatedAt = 0,
): XpRecord {
  return { playerId: "player", gameId, day, xp, updatedAt }
}

describe("xpForRun", () => {
  it("scales with difficulty and a win", () => {
    expect(xpForRun({ difficulty: 1, won: false })).toBe(20)
    expect(xpForRun({ difficulty: 1, won: true })).toBe(60)
    expect(xpForRun({ difficulty: 5, won: true })).toBe(300)
  })

  it("clamps difficulty and the awarded value", () => {
    expect(xpForRun({ difficulty: 0, won: false })).toBe(20)
    expect(xpForRun({ difficulty: 99, won: true, daily: true })).toBe(300)
  })

  it("adds the daily featured bonus", () => {
    expect(xpForRun({ difficulty: 2, won: false, daily: true })).toBe(60)
  })
})

describe("levelFor", () => {
  it("maps XP to levels and the next threshold", () => {
    expect(levelFor(0)).toEqual({
      level: 1,
      title: "Rookie",
      levelStartXp: 0,
      nextLevelXp: 250,
    })
    expect(levelFor(250)).toEqual({
      level: 2,
      title: "Regular",
      levelStartXp: 250,
      nextLevelXp: 750,
    })
    expect(levelFor(10_000)).toEqual({
      level: 7,
      title: "Arcade Immortal",
      levelStartXp: 10_000,
    })
  })
})

describe("XP totals and medals", () => {
  it("sums daily bests and groups them by game", () => {
    const records = [record("mineflag", "2026-11-08", 100), record("mineflag", "2026-11-09", 50), record("brickstorm", "2026-11-09", 60)]
    expect(totalXp(records)).toBe(210)
    expect(gameXp(records)).toEqual([
      { gameId: "mineflag", xp: 150 },
      { gameId: "brickstorm", xp: 60 },
    ])
  })

  it("awards first-run and threshold medals", () => {
    const medals = medalsFor([
      record("mineflag", "2026-11-08", 100, 1000),
      record("mineflag", "2026-11-09", 50, 2000),
    ])
    expect(medals.map((medal) => medal.id)).toContain("first-run")
    expect(medals.map((medal) => medal.id)).toContain("spark")
    expect(medals.find((medal) => medal.id === "spark")?.earnedAt).toBe(1000)
  })

  it("awards devotion and polymath medals", () => {
    const records = [
      record("mineflag", "2026-11-01", 10, 1),
      record("brickstorm", "2026-11-02", 10, 2),
      record("light-cycles", "2026-11-03", 10, 3),
      record("mergegrid", "2026-11-04", 10, 4),
      record("mineflag", "2026-11-05", 10, 5),
      record("brickstorm", "2026-11-06", 10, 6),
      record("light-cycles", "2026-11-07", 10, 7),
    ]
    const ids = medalsFor(records).map((medal) => medal.id)
    expect(ids).toContain("devotee")
    expect(ids).toContain("polymath")
  })

  it("returns no medals for a player with no XP", () => {
    expect(medalsFor([])).toEqual([])
  })
})
