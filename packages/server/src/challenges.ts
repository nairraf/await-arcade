import { createHmac } from "node:crypto"
import type { Mode, VerifierEntry } from "@await-arcade/contract"
import type { RunAnchor } from "./store"

export const DAILY_ATTEMPTS = 3

const DEFAULT_SECRET = "await-arcade-daily-dev"
const DAY_MS = 24 * 60 * 60 * 1000
const EPOCH = Date.UTC(2026, 0, 1)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CHALLENGE_ID = /^([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):daily:(\d{4}-\d{2}-\d{2})$/

export interface DailyConfig {
  readonly secret?: string
  /** Manual override in `gameId:modeId` form. */
  readonly featured?: string
  readonly now?: () => number
}

export interface DailyChallenge {
  readonly challengeId: string
  readonly date: string
  readonly gameId: string
  readonly modeId: string
  readonly seed: number
  /** UTC midnight when the next challenge starts. */
  readonly endsAt: number
  readonly anchor?: RunAnchor
}

export function dailyConfigFromEnv(): DailyConfig {
  const secret = process.env.AWAIT_ARCADE_DAILY_SECRET?.trim()
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AWAIT_ARCADE_DAILY_SECRET is required in production")
  }
  const featured = process.env.AWAIT_ARCADE_DAILY_FEATURED?.trim()
  return {
    ...(secret ? { secret } : {}),
    ...(featured ? { featured } : {}),
  }
}

/** The UTC date key for a timestamp. */
export function dailyDate(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

function endsAt(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) + DAY_MS
}

function dayIndex(date: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - EPOCH) / DAY_MS)
}

function secretFor(config: DailyConfig): string {
  return config.secret && config.secret.length > 0 ? config.secret : DEFAULT_SECRET
}

function seedFor(config: DailyConfig, gameId: string, date: string): number {
  const digest = createHmac("sha256", secretFor(config))
    .update(`${gameId}:${date}`)
    .digest()
  return digest.readUInt32LE(0)
}

function anchorFor(entry: VerifierEntry, mode: Mode, seed: number): RunAnchor | undefined {
  if (entry.meta.id !== "mineflag") return undefined

  // Reuse the core's own preset so the anchor follows the board dimensions.
  const state = entry.core.create(seed, mode) as { width?: unknown; height?: unknown }
  if (typeof state.width !== "number" || typeof state.height !== "number") return undefined
  return {
    type: "reveal",
    x: Math.floor(state.width / 2),
    y: Math.floor(state.height / 2),
  }
}

/** Build one challenge from an explicit game, mode, and date. */
export function challengeFor(
  verifiers: Record<string, VerifierEntry>,
  config: DailyConfig,
  gameId: string,
  modeId: string,
  date: string,
): DailyChallenge | undefined {
  if (!DATE.test(date)) return undefined
  const entry = verifiers[gameId]
  const mode = entry?.meta.modes.find((candidate) => candidate.id === modeId)
  if (!entry || !mode) return undefined

  const end = endsAt(date)
  if (!Number.isFinite(end)) return undefined

  const seed = seedFor(config, gameId, date)
  const anchor = anchorFor(entry, mode, seed)
  return {
    challengeId: `${gameId}:${modeId}:daily:${date}`,
    date,
    gameId,
    modeId,
    seed,
    endsAt: end,
    ...(anchor ? { anchor } : {}),
  }
}

/** Parse a board/challenge id without trusting it. */
export function challengeById(
  verifiers: Record<string, VerifierEntry>,
  config: DailyConfig,
  id: string,
): DailyChallenge | undefined {
  const match = CHALLENGE_ID.exec(id)
  if (!match?.[1] || !match[2] || !match[3]) return undefined
  return challengeFor(verifiers, config, match[1], match[2], match[3])
}

function overridePair(
  config: DailyConfig,
  verifiers: Record<string, VerifierEntry>,
): { gameId: string; modeId: string } | undefined {
  const featured = config.featured
  if (!featured) return undefined
  const separator = featured.indexOf(":")
  if (separator <= 0) return undefined
  const gameId = featured.slice(0, separator)
  const modeId = featured.slice(separator + 1)
  const mode = verifiers[gameId]?.meta.modes.find((candidate) => candidate.id === modeId)
  return mode ? { gameId, modeId } : undefined
}

/**
 * The featured challenge for a UTC date: a manual override when configured,
 * otherwise a deterministic rotation over every game/mode pair.
 */
export function dailyChallenge(
  verifiers: Record<string, VerifierEntry>,
  config: DailyConfig,
  date: string = dailyDate(config.now?.() ?? Date.now()),
): DailyChallenge | undefined {
  if (!DATE.test(date)) return undefined

  const override = overridePair(config, verifiers)
  if (override) {
    return challengeFor(verifiers, config, override.gameId, override.modeId, date)
  }

  const pairs: Array<{ gameId: string; modeId: string }> = []
  for (const entry of Object.values(verifiers).sort((left, right) =>
    left.meta.id.localeCompare(right.meta.id),
  )) {
    for (const mode of [...entry.meta.modes].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      pairs.push({ gameId: entry.meta.id, modeId: mode.id })
    }
  }
  if (pairs.length === 0) return undefined

  const position = ((dayIndex(date) % pairs.length) + pairs.length) % pairs.length
  const pair = pairs[position]!
  return challengeFor(verifiers, config, pair.gameId, pair.modeId, date)
}
