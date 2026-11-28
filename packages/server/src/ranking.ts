import type { GameMeta, ScoreType } from "@await-arcade/contract"

/**
 * The subset of a game's ranking declaration the server acts on.
 *
 * `timed` means the board sorts by the stored rank key instead of the score
 * value; `value` says whether that primary value is the verifier's score or
 * the verified move count.
 */
export interface RankingPolicy {
  readonly value: "score" | "moves"
  readonly timed: boolean
}

export function rankingPolicy(meta: GameMeta, challengeId?: string): RankingPolicy {
  const ranking = meta.ranking
  return {
    value: ranking?.value ?? "score",
    timed:
      ranking?.tiebreak === "serverTime" &&
      (ranking.tiebreakScope !== "daily" || Boolean(challengeId)),
  }
}

/**
 * Ascending key for a server-timed board: the primary value first (higher
 * scores become a smaller penalty), then the server elapsed time. Both parts
 * are fixed-width so a lexical sort is a numeric sort.
 *
 * The six-digit primary is a storage invariant: a timed game's score range must
 * stay below 1,000,000 (the contract suite enforces it). Clamping here means a
 * future meta mistake ties at the cap instead of producing a mixed-width key
 * that sorts a worse run above a better one.
 */
export function rankKeyFor(
  type: ScoreType,
  max: number,
  value: number,
  elapsedMs: number,
): string {
  const raw = type === "lower" ? value : max - value
  const primary = Math.min(999_999, Math.max(0, Math.round(raw)))
  const elapsed = Math.min(9_999_999_999, Math.max(0, Math.round(elapsedMs)))
  return `${String(primary).padStart(6, "0")}|${String(elapsed).padStart(10, "0")}`
}
