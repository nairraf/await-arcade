import type { GameMeta, Score } from "@await-arcade/contract"

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`

  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function formatScore(score: Score, meta: GameMeta): string {
  if (meta.score.type === "lower") return formatDuration(score.value)
  return new Intl.NumberFormat().format(score.value)
}

export function scoreLabel(meta: GameMeta): string {
  return meta.score.type === "lower" ? "Best time" : "High score"
}

/** Positive when `candidate` beats `previous`. */
export function compareScores(candidate: Score, previous: Score): number {
  return candidate.type === "lower"
    ? previous.value - candidate.value
    : candidate.value - previous.value
}

export function isBetter(candidate: Score, previous: Score | undefined): boolean {
  if (!previous) return true
  return compareScores(candidate, previous) > 0
}
