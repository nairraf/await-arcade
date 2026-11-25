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
  if (meta.score.unit === "moves" || meta.score.unit === "points") {
    return new Intl.NumberFormat().format(score.value)
  }
  if (meta.score.type === "lower") return formatDuration(score.value)
  return new Intl.NumberFormat().format(score.value)
}

export function scoreLabel(meta: GameMeta): string {
  if (meta.score.unit === "moves") return "Fewest moves"
  if (meta.score.type === "lower") return "Best time"
  return "High score"
}

/**
 * Depth reached, for endless-style games whose headline number means little on
 * its own. Lockstep reports `sector`, Brickstorm and Neon Cycles report `level`.
 */
export function depthLabel(score: Score): string {
  const sector = score.detail?.sector
  if (typeof sector === "number" && Number.isFinite(sector)) return `sector ${sector}`
  const level = score.detail?.level
  if (typeof level === "number" && Number.isFinite(level)) return `L${level}`
  return ""
}

/** Board-row score: the headline number plus where the run got to. */
export function formatBoardScore(score: Score, meta: GameMeta): string {
  const depth = depthLabel(score)
  const base = formatScore(score, meta)
  if (depth) return `${base} · ${depth}`
  const elapsed = score.detail?.elapsedMs
  if (
    (meta.id === "nonogram" || meta.id === "router" || meta.id === "tilechain") &&
    typeof elapsed === "number" &&
    Number.isFinite(elapsed) &&
    elapsed >= 0
  ) {
    return `${base} · ${formatDuration(elapsed)}`
  }
  return base
}

/** Compact daily Mineflag/Nonogram/Tilechain display: headline score, server time, attempt. */
export function formatDailyScore(score: Score, meta: GameMeta): string {
  const moves = score.detail?.moves
  const elapsed = score.detail?.elapsedMs
  const attempt = score.detail?.attempt
  const tryLabel = typeof attempt === "number" ? ` · try ${attempt}` : ""
  if (typeof moves === "number" && typeof elapsed === "number") {
    return `${moves} mv · ${formatDuration(elapsed)}${tryLabel}`
  }
  if (
    (meta.id === "nonogram" || meta.id === "router" || meta.id === "tilechain") &&
    typeof elapsed === "number" &&
    Number.isFinite(elapsed) &&
    elapsed >= 0
  ) {
    const depth = depthLabel(score)
    const depthPart = depth ? ` · ${depth}` : ""
    return `${formatScore(score, meta)}${depthPart} · ${formatDuration(elapsed)}${tryLabel}`
  }
  return formatBoardScore(score, meta)
}

/** Positive when `candidate` beats `previous`. */
export function compareScores(candidate: Score, previous: Score): number {
  const primary =
    candidate.type === "lower"
      ? previous.value - candidate.value
      : candidate.value - previous.value
  if (primary !== 0) return primary

  const left = candidate.detail?.rankKey
  const right = previous.detail?.rankKey
  if (typeof left === "string" && typeof right === "string" && left.length > 0 && right.length > 0) {
    return right < left ? -1 : right > left ? 1 : 0
  }
  return 0
}

export function isBetter(candidate: Score, previous: Score | undefined): boolean {
  if (!previous) return true
  return compareScores(candidate, previous) > 0
}
