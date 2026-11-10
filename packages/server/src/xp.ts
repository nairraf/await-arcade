import type { ArcadeGameXp, ArcadeMedal } from "@await-arcade/contract"

/** One player's best XP for a single game on a single UTC day. */
export interface XpRecord {
  readonly playerId: string
  readonly gameId: string
  /** UTC day, YYYY-MM-DD. */
  readonly day: string
  readonly xp: number
  readonly updatedAt: number
}

export interface XpAwardInput {
  readonly playerId: string
  readonly gameId: string
  readonly day: string
  readonly xp: number
  readonly now: number
}

export interface XpAward {
  readonly total: number
  readonly awarded: number
  readonly dailyBest: number
}

const MIN_XP = 1
const MAX_XP = 300

/**
 * base(difficulty) x performance, clamped. Difficulty is 1-5; a win is worth
 * three times a completed run, and the daily carries a 1.5x featured bonus.
 */
export function xpForRun(input: {
  readonly difficulty?: number
  readonly won: boolean
  readonly daily?: boolean
}): number {
  const difficulty = Math.min(5, Math.max(1, Math.floor(input.difficulty ?? 1)))
  const base = difficulty * 20
  const performance = input.won ? 3 : 1
  const bonus = input.daily ? 1.5 : 1
  return Math.max(MIN_XP, Math.min(MAX_XP, Math.round(base * performance * bonus)))
}

interface Level {
  readonly at: number
  readonly title: string
}

const LEVELS: readonly Level[] = [
  { at: 0, title: "Rookie" },
  { at: 250, title: "Regular" },
  { at: 750, title: "Contender" },
  { at: 1500, title: "Veteran" },
  { at: 3000, title: "Champion" },
  { at: 6000, title: "Legend" },
  { at: 10000, title: "Arcade Immortal" },
]

export function levelFor(totalXp: number): {
  level: number
  title: string
  levelStartXp: number
  nextLevelXp?: number
} {
  let index = 0
  for (let cursor = 0; cursor < LEVELS.length; cursor += 1) {
    if (totalXp >= LEVELS[cursor]!.at) index = cursor
  }
  const next = LEVELS[index + 1]
  return {
    level: index + 1,
    title: LEVELS[index]!.title,
    levelStartXp: LEVELS[index]!.at,
    ...(next ? { nextLevelXp: next.at } : {}),
  }
}

export function totalXp(records: readonly XpRecord[]): number {
  return records.reduce((sum, record) => sum + record.xp, 0)
}

export function gameXp(records: readonly XpRecord[]): ArcadeGameXp[] {
  const totals = new Map<string, number>()
  for (const record of records) {
    totals.set(record.gameId, (totals.get(record.gameId) ?? 0) + record.xp)
  }
  return [...totals]
    .map(([gameId, xp]) => ({ gameId, xp }))
    .sort((left, right) => right.xp - left.xp || left.gameId.localeCompare(right.gameId))
}

/**
 * Derive medals from the retained daily records. This keeps medals consistent
 * with the records and avoids a separate mutable medal store.
 */
export function medalsFor(records: readonly XpRecord[]): ArcadeMedal[] {
  if (records.length === 0) return []

  const medals: ArcadeMedal[] = []
  const firstAt = Math.min(...records.map((record) => record.updatedAt))
  medals.push({
    id: "first-run",
    title: "First Credit",
    description: "Earn arcade XP in any cabinet.",
    ...(Number.isFinite(firstAt) ? { earnedAt: firstAt } : {}),
  })

  const byDay = new Map<string, { xp: number; at: number }>()
  for (const record of records) {
    const day = byDay.get(record.day) ?? { xp: 0, at: 0 }
    day.xp += record.xp
    day.at = Math.max(day.at, record.updatedAt)
    byDay.set(record.day, day)
  }
  const days = [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right))

  const thresholds: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly description: string
    readonly at: number
  }> = [
    { id: "spark", title: "Spark", description: "Reach 100 total XP.", at: 100 },
    { id: "silver", title: "Silver Cabinet", description: "Reach 500 total XP.", at: 500 },
    { id: "gold", title: "Gold Cabinet", description: "Reach 1,500 total XP.", at: 1500 },
    { id: "legend", title: "House Legend", description: "Reach 3,000 total XP.", at: 3000 },
  ]

  let running = 0
  let thresholdIndex = 0
  let devoteeAt: number | undefined
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index]!
    running += day[1].xp
    while (thresholdIndex < thresholds.length && running >= thresholds[thresholdIndex]!.at) {
      const threshold = thresholds[thresholdIndex]!
      medals.push({
        id: threshold.id,
        title: threshold.title,
        description: threshold.description,
        earnedAt: day[1].at,
      })
      thresholdIndex += 1
    }
    if (index === 6) devoteeAt = day[1].at
  }
  if (devoteeAt !== undefined) {
    medals.push({
      id: "devotee",
      title: "Daily Devotee",
      description: "Earn XP on seven different UTC days.",
      earnedAt: devoteeAt,
    })
  }

  const seenGames = new Set<string>()
  let polymathAt: number | undefined
  const byTime = [...records].sort((left, right) => left.updatedAt - right.updatedAt)
  for (const record of byTime) {
    seenGames.add(record.gameId)
    if (seenGames.size === 4) {
      polymathAt = record.updatedAt
      break
    }
  }
  if (polymathAt !== undefined) {
    medals.push({
      id: "polymath",
      title: "Polymath",
      description: "Earn XP in all four launch cabinets.",
      earnedAt: polymathAt,
    })
  }

  return medals
}
