import type {
  AgentAttentionReason,
  ArcadeProfile,
  BoardEntry,
  GameEntry,
  GameMeta,
  Mode,
  Score,
} from "@await-arcade/contract"
import { el } from "@await-arcade/framework"
import { formatScore } from "./format"

export type ThemeMode = "auto" | "light" | "dark"

export function themeLabel(mode: ThemeMode): string {
  return mode === "auto" ? "Auto" : mode === "light" ? "Light" : "Dark"
}

export function nextTheme(mode: ThemeMode): ThemeMode {
  return mode === "auto" ? "light" : mode === "light" ? "dark" : "auto"
}

export function autoPauseLabel(enabled: boolean): string {
  return enabled ? "Auto-pause: On" : "Auto-pause: Off"
}

export function pauseOverlayCopy(reason?: AgentAttentionReason): {
  readonly kicker: string
  readonly detail: string
} {
  if (reason === "reply") {
    return {
      kicker: "AGENT REPLIED",
      detail: "Your agent responded — clock stopped.",
    }
  }
  if (reason === "prompt") {
    return {
      kicker: "INPUT NEEDED",
      detail: "Your agent is waiting for your approval — clock stopped.",
    }
  }
  return {
    kicker: "PAUSED",
    detail: "The clock is stopped.",
  }
}

export function randomSeed(): number {
  const buffer = new Uint32Array(1)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer)
    return buffer[0]!
  }
  return Math.floor(Math.random() * 0xffffffff)
}

export function countdownLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
}

export function safeVerificationUri(value: string): string {
  try {
    const url = new URL(value)
    if (
      url.protocol === "https:" &&
      (url.hostname === "github.com" || url.hostname === "www.github.com")
    ) {
      return url.toString()
    }
  } catch {
    // Fall through to the canonical URL.
  }
  return "https://github.com/login/device"
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string" && error.length > 0) return error
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>
    for (const key of ["message", "error", "reason", "defect", "cause"]) {
      const value = record[key]
      if (typeof value === "string" && value.length > 0) return value
    }
    try {
      return JSON.stringify(error)
    } catch {
      return "Unknown error"
    }
  }
  return String(error)
}

export function hudCell(label: string, value: string): { root: HTMLElement; value: HTMLElement } {
  const root = el("div", "arcade-hud-cell")
  const valueNode = el("strong", "arcade-hud-value", value)
  root.append(el("span", "arcade-hud-label", label), valueNode)
  return { root, value: valueNode }
}

export interface ModeGroup {
  readonly key: string
  readonly title: string
  readonly modes: readonly Mode[]
}

export function modeGroups(entry: GameEntry): ModeGroup[] {
  const groups = new Map<string, Mode[]>()
  for (const mode of entry.meta.modes) {
    const key = mode.group ?? mode.id
    const list = groups.get(key) ?? []
    list.push(mode)
    groups.set(key, list)
  }

  const variants = entry.meta.variants ?? []
  return [...groups].map(([key, modes]) => {
    const primary =
      modes.find((mode) => !mode.variant || mode.variant === variants[0]?.id) ?? modes[0]!
    return { key, title: primary.title, modes }
  })
}

export function modeInGroup(
  entry: GameEntry,
  groupKey: string,
  variantId: string,
): Mode | undefined {
  const variants = entry.meta.variants ?? []
  const modes = entry.meta.modes.filter((mode) => (mode.group ?? mode.id) === groupKey)
  return (
    modes.find((mode) => (mode.variant ?? variants[0]?.id) === variantId) ?? modes[0]
  )
}

export function profileNode(
  profile: ArcadeProfile,
  titleFor: (gameId: string) => string,
): HTMLElement {
  const wrap = el("div", "arcade-profile")
  const head = el("div", "arcade-profile-head")

  const level = el("div", "arcade-profile-level")
  level.append(
    el("div", "arcade-overlay-kicker", `LEVEL ${profile.level} · ${profile.levelTitle}`),
    el("div", "arcade-profile-xp", `${profile.totalXp} XP`),
  )

  const rankBadge = el("div", "arcade-profile-rank-badge")
  if (profile.rank) {
    const tier =
      profile.rank <= 3 ? (["gold", "silver", "bronze"] as const)[profile.rank - 1] : undefined
    rankBadge.classList.add(tier ? `arcade-profile-rank-${tier}` : "arcade-profile-rank-plain")
    rankBadge.title = `Arcade rank #${profile.rank}`
    rankBadge.append(
      el("span", "arcade-profile-rank-icon", tier ? "★" : "◆"),
      el("span", "arcade-profile-rank-value", `#${profile.rank}`),
      el("span", "arcade-profile-rank-label", "ARCADE RANK"),
    )
  } else {
    rankBadge.classList.add("arcade-profile-rank-plain")
    rankBadge.title = "No arcade rank yet"
    rankBadge.append(
      el("span", "arcade-profile-rank-icon", "◇"),
      el("span", "arcade-profile-rank-value", "—"),
      el("span", "arcade-profile-rank-label", "UNRANKED"),
    )
  }

  head.append(level, rankBadge)
  wrap.append(head)

  if (profile.nextLevelXp !== undefined) {
    const percent = Math.min(
      100,
      Math.round(
        ((profile.totalXp - profile.levelStartXp) /
          Math.max(1, profile.nextLevelXp - profile.levelStartXp)) *
          100,
      ),
    )
    const bar = el("div", "arcade-xp-bar")
    const fill = el("div", "arcade-xp-fill")
    fill.style.width = `${percent}%`
    bar.append(fill)
    wrap.append(
      bar,
      el(
        "div",
        "arcade-overlay-detail",
        `${Math.max(0, profile.nextLevelXp - profile.totalXp)} XP to level ${profile.level + 1}`,
      ),
    )
  } else {
    wrap.append(el("div", "arcade-overlay-detail", "Top level reached."))
  }

  if (profile.games.length > 0) {
    const games = el("div", "arcade-profile-games")
    for (const game of profile.games) {
      games.append(
        el("span", "arcade-profile-game", `${titleFor(game.gameId)} · ${game.xp} XP`),
      )
    }
    wrap.append(el("div", "arcade-overlay-kicker", "CARTRIDGES"), games)
  }

  if (profile.medals.length > 0) {
    const medals = el("div", "arcade-medals")
    for (const medal of profile.medals) {
      const chip = el("span", "arcade-medal", medal.title)
      chip.title = medal.description
      medals.append(chip)
    }
    wrap.append(el("div", "arcade-overlay-kicker", "MEDALS"), medals)
  } else {
    wrap.append(
      el("div", "arcade-overlay-detail", "No medals yet. Finish a ranked run to earn XP."),
    )
  }

  return wrap
}

const RANK_MEDALS = ["gold", "silver", "bronze"] as const

export function xpSummaryText(level?: number, rank?: number): string {
  const parts: string[] = []
  if (level !== undefined) parts.push(`LVL ${level}`)
  if (rank !== undefined) parts.push(`R${rank}`)
  return parts.join(" · ")
}

export function xpSummaryNote(level?: number, rank?: number): string {
  const text = xpSummaryText(level, rank)
  return text ? ` · ${text}` : ""
}

/** Render a rank as a top-three medal badge, or a plain #N for the rest. */
export function applyRank(node: HTMLElement, rank?: number): void {
  node.classList.remove(
    "arcade-rank-medal",
    "arcade-rank-gold",
    "arcade-rank-silver",
    "arcade-rank-bronze",
  )
  node.removeAttribute("aria-label")
  if (rank === undefined) {
    node.textContent = "—"
    node.removeAttribute("title")
    return
  }
  if (rank >= 1 && rank <= 3) {
    const medal = RANK_MEDALS[rank - 1]!
    node.classList.add("arcade-rank-medal", `arcade-rank-${medal}`)
    node.textContent = String(rank)
    node.setAttribute("aria-label", `Rank ${rank} · ${medal} medal`)
    node.title = `Rank ${rank} · ${medal} medal`
    return
  }
  node.textContent = `#${rank}`
  node.title = `Rank ${rank}`
}

export function renderBoardRow(
  item: BoardEntry,
  index: number,
  meta: GameMeta,
  currentId?: string,
  extraClass = "",
  format: (score: Score, meta: GameMeta) => string = formatScore,
  onPractice?: (item: BoardEntry) => void,
): HTMLElement {
  const isYou = Boolean(currentId && item.playerId === currentId)
  const row = el(
    "div",
    `arcade-board-row${extraClass ? ` ${extraClass}` : ""}${isYou ? " arcade-board-row-you" : ""}`,
  )
  const name = item.displayName || (isYou ? "You" : item.playerId.slice(0, 8))
  const player = el("div", "arcade-board-player")
  const nameNode = el("span", "arcade-board-name", name)
  player.append(nameNode)
  if (item.xpLevel !== undefined || item.xpRank !== undefined) {
    const xp = el(
      "span",
      `arcade-board-xp${item.xpRank !== undefined && item.xpRank <= 3 ? " arcade-board-xp-top" : ""}`,
      xpSummaryText(item.xpLevel, item.xpRank),
    )
    const titleParts: string[] = []
    if (item.xpLevel !== undefined) titleParts.push(`Level ${item.xpLevel}`)
    if (item.xpRank !== undefined) titleParts.push(`Arcade rank #${item.xpRank}`)
    xp.title = titleParts.join(" · ")
    player.append(xp)
  }
  player.title = isYou ? "You" : (item.displayName ? `${item.displayName} (${item.playerId})` : item.playerId)
  const rank = el("span", "arcade-board-rank")
  applyRank(rank, index + 1)
  row.append(
    rank,
    player,
    el("span", "arcade-board-score", format(item.score, meta)),
  )
  if (onPractice && item.ghostId) {
    const practice = el("button", "arcade-btn arcade-btn-ghost arcade-board-practice", "Practice")
    practice.type = "button"
    practice.title = "Replay this run's seed as unranked practice"
    practice.addEventListener("click", () => onPractice(item))
    row.append(practice)
  }
  return row
}
