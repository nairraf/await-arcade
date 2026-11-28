import type { GameMeta } from "@await-arcade/contract"

/** Realtime games always show the clock; turn games opt in. */
export function showsClock(meta: GameMeta): boolean {
  return meta.kind === "realtime" || meta.clock === "elapsed"
}

/** A turn game that ticks a live elapsed clock (realtime clocks come from ticks). */
export function hasTurnClock(meta: GameMeta): boolean {
  return meta.kind === "turn" && meta.clock === "elapsed"
}

/** Whether the board is ordered by verified moves rather than score. */
export function ranksByMoves(meta: GameMeta): boolean {
  return meta.ranking?.value === "moves"
}

/** Whether server elapsed time is part of this board's ordering and display. */
export function showsServerTime(meta: GameMeta, daily: boolean): boolean {
  const ranking = meta.ranking
  if (ranking?.tiebreak !== "serverTime") return false
  return ranking.tiebreakScope !== "daily" || daily
}

/** Copy for the daily tile, game header, and leaderboard hub. */
export function rankingHint(meta: GameMeta, daily: boolean): string | undefined {
  if (!showsServerTime(meta, daily)) return undefined
  const primary = ranksByMoves(meta) ? "moves" : "score"
  return daily
    ? `Daily rank: ${primary}, then server time. Attempts are shown only.`
    : `Rank: ${primary}, then server time.`
}
