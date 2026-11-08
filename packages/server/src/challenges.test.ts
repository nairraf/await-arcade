import { describe, expect, it } from "vitest"
import {
  challengeById,
  challengeFor,
  dailyChallenge,
  dailyDate,
} from "./challenges"
import { verifiers } from "./registry.generated"

const config = { secret: "test-secret" }
const date = "2026-11-08"

describe("daily challenge schedule", () => {
  it("derives a stable seed from the game and UTC date", () => {
    const solo = challengeFor(verifiers, config, "light-cycles", "solo", date)!
    const duel = challengeFor(verifiers, config, "light-cycles", "duel", date)!
    const mine = challengeFor(verifiers, config, "mineflag", "beginner", date)!
    const next = challengeFor(verifiers, config, "light-cycles", "solo", "2026-11-09")!

    expect(solo.seed).toBe(duel.seed)
    expect(solo.seed).not.toBe(mine.seed)
    expect(solo.seed).not.toBe(next.seed)
  })

  it("reproduces the same featured challenge from its id", () => {
    const challenge = dailyChallenge(verifiers, config, date)!
    expect(dailyChallenge(verifiers, config, date)).toEqual(challenge)
    expect(challengeById(verifiers, config, challenge.challengeId)).toEqual(challenge)
    expect(dailyDate(Date.UTC(2026, 10, 8, 23, 59))).toBe(date)
  })

  it("honours a featured override and derives the Mineflag anchor", () => {
    const challenge = dailyChallenge(
      verifiers,
      { ...config, featured: "mineflag:beginner" },
      date,
    )!

    expect(challenge.gameId).toBe("mineflag")
    expect(challenge.modeId).toBe("beginner")
    expect(challenge.anchor).toEqual({ type: "reveal", x: 4, y: 4 })
  })

  it("rejects malformed ids, dates, and game/mode pairs", () => {
    expect(challengeById(verifiers, config, "nope")).toBeUndefined()
    expect(
      challengeById(verifiers, config, "mineflag:beginner:daily:2026-13-99"),
    ).toBeUndefined()
    expect(challengeFor(verifiers, config, "mineflag", "nope", date)).toBeUndefined()
    expect(challengeFor(verifiers, config, "light-cycles", "solo", "nope")).toBeUndefined()
  })
})
