import type { GameEntry, GameMeta, Score } from "@await-arcade/contract"
import { describe, expect, it } from "vitest"
import {
  compareScores,
  formatDailyScore,
  formatDuration,
  formatScore,
  isBetter,
  scoreLabel,
} from "./format"
import { normaliseBoard } from "./host"
import {
  countdownLabel,
  errorMessage,
  modeGroups,
  modeInGroup,
  nextTheme,
  safeVerificationUri,
  themeLabel,
  xpSummaryNote,
  xpSummaryText,
} from "./ui"

function makeMeta(
  overrides: {
    readonly modes?: GameMeta["modes"]
    readonly variants?: GameMeta["variants"]
    readonly score?: GameMeta["score"]
  } = {},
): GameMeta {
  return {
    id: "test-game",
    title: "Test Game",
    description: "Test description",
    author: "tester",
    version: "1.0.0",
    engines: { arcade: "^1.0.0" },
    kind: "turn",
    modes: overrides.modes ?? [{ id: "solo", title: "Solo" }],
    ...(overrides.variants ? { variants: overrides.variants } : {}),
    score: overrides.score ?? { type: "higher", min: 0, max: 1000, unit: "points" },
    leaderboard: "replay",
    status: "stable",
    controls: [],
    display: { surface: "dom", width: 320, height: 240 },
    maxDurationMs: 60_000,
  }
}

function makeEntry(meta: GameMeta): GameEntry {
  return {
    meta,
    core: {} as GameEntry["core"],
    view: () => ({ mount: () => undefined, render: () => undefined, destroy: () => undefined }),
  }
}

describe("shell ui helpers", () => {
  it("cycles theme labels and modes deterministically", () => {
    expect(themeLabel("auto")).toBe("Auto")
    expect(themeLabel("light")).toBe("Light")
    expect(themeLabel("dark")).toBe("Dark")

    expect(nextTheme("auto")).toBe("light")
    expect(nextTheme("light")).toBe("dark")
    expect(nextTheme("dark")).toBe("auto")
  })

  it("formats countdown labels and clamps negative values to zero", () => {
    expect(countdownLabel(-5000)).toBe("0h 00m 00s")
    expect(countdownLabel(0)).toBe("0h 00m 00s")
    expect(countdownLabel((2 * 3600 + 4 * 60 + 9) * 1000)).toBe("2h 04m 09s")
  })

  it("accepts only HTTPS GitHub device verification URLs", () => {
    expect(safeVerificationUri("https://github.com/login/device")).toBe(
      "https://github.com/login/device",
    )
    expect(safeVerificationUri("https://www.github.com/login/device?foo=bar")).toBe(
      "https://www.github.com/login/device?foo=bar",
    )
    expect(safeVerificationUri("http://github.com/login/device")).toBe(
      "https://github.com/login/device",
    )
    expect(safeVerificationUri("https://evil.example/phish")).toBe(
      "https://github.com/login/device",
    )
    expect(safeVerificationUri("javascript:alert(1)")).toBe(
      "https://github.com/login/device",
    )
  })

  it("extracts readable messages from mixed error shapes", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
    expect(errorMessage("plain failure")).toBe("plain failure")
    expect(errorMessage({ error: "rate limited" })).toBe("rate limited")
    expect(errorMessage({ reason: "invalid replay" })).toBe("invalid replay")
    expect(errorMessage({ code: 42 })).toBe('{"code":42}')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(errorMessage(circular)).toBe("Unknown error")
  })

  it("groups mode variants and selects matching mode in group", () => {
    const entry = makeEntry(
      makeMeta({
        variants: [
          { id: "random", title: "Random", description: "Standard board" },
          { id: "logic", title: "Logic", description: "No guessing" },
        ],
        modes: [
          { id: "beginner", title: "Beginner", group: "beginner", variant: "random" },
          { id: "beginner-logic", title: "Beginner (Logic)", group: "beginner", variant: "logic" },
          { id: "expert", title: "Expert", group: "expert", variant: "random" },
        ],
      }),
    )

    const groups = modeGroups(entry)
    expect(groups.map((group) => [group.key, group.title, group.modes.length])).toEqual([
      ["beginner", "Beginner", 2],
      ["expert", "Expert", 1],
    ])
    expect(modeInGroup(entry, "beginner", "logic")?.id).toBe("beginner-logic")
    expect(modeInGroup(entry, "expert", "logic")?.id).toBe("expert")
    expect(modeInGroup(entry, "missing", "random")).toBeUndefined()
  })

  it("formats compact XP summary strings", () => {
    expect(xpSummaryText()).toBe("")
    expect(xpSummaryText(4)).toBe("LVL 4")
    expect(xpSummaryText(undefined, 2)).toBe("R2")
    expect(xpSummaryText(4, 2)).toBe("LVL 4 · R2")
    expect(xpSummaryNote()).toBe("")
    expect(xpSummaryNote(4, 2)).toBe(" · LVL 4 · R2")
  })
})

describe("shell format and board normalisation helpers", () => {
  it("formats durations, scores, labels, and daily scores", () => {
    expect(formatDuration(-1)).toBe("—")
    expect(formatDuration(Number.NaN)).toBe("—")
    expect(formatDuration(850)).toBe("0.8s")
    expect(formatDuration(12_340)).toBe("12.3s")
    expect(formatDuration(65_000)).toBe("1:05")

    const timeMeta = makeMeta({ score: { type: "lower", min: 0, max: 999999 } })
    const movesMeta = makeMeta({ score: { type: "lower", min: 1, max: 999, unit: "moves" } })
    const pointsMeta = makeMeta({ score: { type: "higher", min: 0, max: 999999, unit: "points" } })

    expect(scoreLabel(timeMeta)).toBe("Best time")
    expect(scoreLabel(movesMeta)).toBe("Fewest moves")
    expect(scoreLabel(pointsMeta)).toBe("High score")

    expect(formatScore({ value: 12_300, type: "lower", won: true, ranked: true }, timeMeta)).toBe(
      "12.3s",
    )
    expect(
      formatDailyScore(
        {
          value: 18,
          type: "lower",
          won: true,
          ranked: true,
          detail: { moves: 18, elapsedMs: 12_500, attempt: 2 },
        },
        movesMeta,
      ),
    ).toBe("18 mv · 12.5s · try 2")
  })

  it("compares lower-is-better and higher-is-better scores accurately", () => {
    const fast: Score = { value: 100, type: "lower", won: true, ranked: true }
    const slow: Score = { value: 250, type: "lower", won: true, ranked: true }
    expect(compareScores(fast, slow)).toBeGreaterThan(0)
    expect(isBetter(fast, slow)).toBe(true)
    expect(isBetter(slow, fast)).toBe(false)
    expect(isBetter(slow, undefined)).toBe(true)

    const high: Score = { value: 500, type: "higher", won: true, ranked: true }
    const low: Score = { value: 300, type: "higher", won: true, ranked: true }
    expect(compareScores(high, low)).toBe(200)
    expect(isBetter(high, low)).toBe(true)
    expect(isBetter(low, high)).toBe(false)
  })

  it("filters malformed entries and sanitizes fields in normaliseBoard", () => {
    const valid = {
      playerId: "p1",
      displayName: "Ian",
      achievedAt: 1700000000,
      ghostId: "run1",
      xpRank: 1,
      xpLevel: 5,
      score: {
        value: 42,
        type: "higher",
        won: true,
        ranked: true,
        detail: { streak: 3, nested: { ignore: true }, label: "ok", perfect: true },
      },
    }
    const invalidEntries = [
      null,
      { playerId: 123, score: { value: 1, type: "higher" } },
      { playerId: "p2", score: { value: "1", type: "higher" } },
      { playerId: "p3", score: { value: 10, type: "bogus" } },
    ]
    const normalised = normaliseBoard([valid, ...invalidEntries, {
      playerId: "p4",
      xpRank: 0,
      xpLevel: -1,
      score: { value: 10, type: "lower", ranked: false },
    }])

    expect(normalised).toHaveLength(2)
    expect(normalised[0]).toEqual({
      playerId: "p1",
      displayName: "Ian",
      achievedAt: 1700000000,
      ghostId: "run1",
      xpRank: 1,
      xpLevel: 5,
      score: {
        value: 42,
        type: "higher",
        won: true,
        ranked: true,
        detail: { streak: 3, label: "ok", perfect: true },
      },
    })
    expect(normalised[1]).toEqual({
      playerId: "p4",
      achievedAt: 0,
      score: {
        value: 10,
        type: "lower",
        won: false,
        ranked: false,
      },
    })
  })
})
