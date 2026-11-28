import type { GameMeta, Score } from "@await-arcade/contract"
import { describe, expect, it } from "vitest"
import { formatBoardScore, formatDailyScore } from "./format"
import {
  hasTurnClock,
  rankingHint,
  ranksByMoves,
  showsClock,
  showsServerTime,
} from "./ranking"
import { games } from "./registry.generated"

function makeMeta(overrides: Partial<GameMeta> = {}): GameMeta {
  return {
    id: "test-game",
    title: "Test Game",
    description: "Test description",
    author: "tester",
    version: "1.0.0",
    engines: { arcade: "^0.1.0" },
    kind: "turn",
    modes: [{ id: "solo", title: "Solo" }],
    score: { type: "higher", min: 0, max: 10_000, unit: "points" },
    leaderboard: "replay",
    status: "stable",
    controls: [],
    display: { surface: "dom", width: 320, height: 240 },
    maxDurationMs: 60_000,
    ...overrides,
  }
}

const timedPuzzle = makeMeta({ ranking: { tiebreak: "serverTime" } })
const dailyMoves = makeMeta({
  score: { type: "lower", min: 0, max: 100_000, unit: "moves" },
  ranking: { value: "moves", tiebreak: "serverTime", tiebreakScope: "daily" },
  clock: "elapsed",
})
const plain = makeMeta()

function makeScore(value: number, detail: Score["detail"] = {}): Score {
  return { value, type: "higher", won: true, ranked: true, detail }
}

describe("ranking capabilities", () => {
  it("derives clock visibility from the game kind and clock opt-in", () => {
    expect(showsClock(plain)).toBe(false)
    expect(hasTurnClock(plain)).toBe(false)

    expect(showsClock(dailyMoves)).toBe(true)
    expect(hasTurnClock(dailyMoves)).toBe(true)

    const realtime = makeMeta({ kind: "realtime", tickRate: 60 })
    expect(showsClock(realtime)).toBe(true)
    expect(hasTurnClock(realtime)).toBe(false)
  })

  it("knows when the board is ordered by moves", () => {
    expect(ranksByMoves(dailyMoves)).toBe(true)
    expect(ranksByMoves(timedPuzzle)).toBe(false)
    expect(ranksByMoves(plain)).toBe(false)
  })

  it("scopes the server-time tiebreak to the declared boards", () => {
    expect(showsServerTime(timedPuzzle, false)).toBe(true)
    expect(showsServerTime(timedPuzzle, true)).toBe(true)

    expect(showsServerTime(dailyMoves, false)).toBe(false)
    expect(showsServerTime(dailyMoves, true)).toBe(true)

    expect(showsServerTime(plain, false)).toBe(false)
    expect(showsServerTime(plain, true)).toBe(false)
  })

  it("writes the ranking hint from the same capabilities", () => {
    expect(rankingHint(timedPuzzle, false)).toBe("Rank: score, then server time.")
    expect(rankingHint(timedPuzzle, true)).toBe(
      "Daily rank: score, then server time. Attempts are shown only.",
    )
    expect(rankingHint(dailyMoves, false)).toBeUndefined()
    expect(rankingHint(dailyMoves, true)).toBe(
      "Daily rank: moves, then server time. Attempts are shown only.",
    )
    expect(rankingHint(plain, true)).toBeUndefined()
  })

  it("shows server time only on the boards that rank by it", () => {
    const puzzle = makeScore(1500, { elapsedMs: 5000 })
    expect(formatBoardScore(puzzle, timedPuzzle)).toContain("5.0s")
    expect(formatDailyScore(puzzle, timedPuzzle)).toContain("5.0s")

    const moves = makeScore(42, { moves: 42, elapsedMs: 5000, attempt: 2 })
    expect(formatBoardScore(moves, dailyMoves)).toBe("42")
    expect(formatDailyScore(moves, dailyMoves)).toBe("42 mv · 5.0s · try 2")

    expect(formatBoardScore(makeScore(42, { elapsedMs: 5000 }), plain)).toBe("42")
  })

  it("keeps the shipped cartridge declarations", () => {
    const byId = new Map(games.map(({ meta }) => [meta.id, meta]))
    const meta = (id: string): GameMeta => {
      const found = byId.get(id)
      if (!found) throw new Error(`missing game ${id}`)
      return found
    }

    expect(hasTurnClock(meta("nonogram"))).toBe(true)
    expect(showsServerTime(meta("nonogram"), false)).toBe(true)
    expect(hasTurnClock(meta("mineflag"))).toBe(true)
    expect(ranksByMoves(meta("mineflag"))).toBe(true)
    expect(showsServerTime(meta("mineflag"), false)).toBe(false)
    expect(showsServerTime(meta("mineflag"), true)).toBe(true)

    for (const id of ["router", "tilechain", "crates"]) {
      expect(showsServerTime(meta(id), false), `${id} all-time`).toBe(true)
      expect(showsServerTime(meta(id), true), `${id} daily`).toBe(true)
    }

    for (const id of ["brickstorm", "codebreaker", "light-cycles", "lockstep", "mergegrid"]) {
      expect(showsServerTime(meta(id), false), `${id} all-time`).toBe(false)
      expect(ranksByMoves(meta(id)), `${id} primary`).toBe(false)
    }

    expect(showsClock(meta("brickstorm"))).toBe(true)
    expect(hasTurnClock(meta("brickstorm"))).toBe(false)
    expect(showsClock(meta("lockstep"))).toBe(false)
  })
})
