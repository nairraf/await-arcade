import type {
  BoardEntry,
  DailyChallenge,
  GameEntry,
  GameHost,
  Mode,
} from "@await-arcade/contract"
import { el } from "@await-arcade/framework"
import { formatBoardScore, formatDailyScore, scoreLabel } from "./format"
import { applyRank, errorMessage, renderBoardRow, xpSummaryNote } from "./ui"

export interface BoardsState {
  gameId: string
  modeId: string
  epoch: number
  daily?: DailyChallenge | undefined
}

export interface ShowBoardsOptions {
  readonly main: HTMLElement
  readonly host: GameHost
  readonly games: readonly GameEntry[]
  readonly state: BoardsState
  readonly gameId?: string | undefined
  readonly modeId?: string | undefined
  readonly daily?: DailyChallenge | undefined
  readonly isActive: (epoch: number, section: HTMLElement) => boolean
  readonly onPrepare: () => void
  readonly onShowLauncher: () => void
  readonly onRememberMode: (entry: GameEntry, modeId: string) => void
  readonly onPlayGame: (entry: GameEntry, modeId: string, daily?: DailyChallenge) => void
  readonly onStartPractice: (entry: GameEntry, item: BoardEntry) => void
  readonly onOpenAuth: () => void
  readonly onNavigate: (gameId?: string, modeId?: string, daily?: DailyChallenge) => void
}

export async function renderBoardsView(options: ShowBoardsOptions): Promise<void> {
  const {
    main,
    host,
    games,
    state,
    gameId,
    modeId,
    daily,
    isActive,
    onPrepare,
    onShowLauncher,
    onRememberMode,
    onPlayGame,
    onStartPractice,
    onOpenAuth,
    onNavigate,
  } = options

  const loadBoard = host.board?.bind(host)
  if (!loadBoard) return

  onPrepare()
  state.daily = daily
  main.replaceChildren()

  const entry =
    games.find((candidate) => candidate.meta.id === (daily?.gameId ?? gameId)) ??
    games.find((candidate) => candidate.meta.id === state.gameId) ??
    games[0]!
  const rankedModes = entry.meta.modes.filter((candidate) => candidate.ranked !== false)
  const availableModes = rankedModes.length > 0 ? rankedModes : entry.meta.modes
  const mode =
    availableModes.find((candidate) => candidate.id === (daily?.modeId ?? modeId)) ??
    availableModes.find((candidate) => candidate.id === state.modeId) ??
    availableModes[0]!
  state.gameId = entry.meta.id
  state.modeId = mode.id

  const epoch = ++state.epoch
  const section = el("section", "arcade-boards")
  section.style.setProperty("--game-accent-dark", entry.meta.theme?.accent ?? "#22d3ee")
  section.style.setProperty("--game-accent-2-dark", entry.meta.theme?.accent2 ?? "#f472b6")
  section.dataset.mode = entry.meta.theme?.mode ?? "neon"

  const back = el("button", "arcade-btn arcade-btn-ghost", "← Lobby")
  back.type = "button"
  back.addEventListener("click", onShowLauncher)

  const heading = el("div", "arcade-boards-heading")
  heading.append(
    el(
      "div",
      "arcade-kicker",
      daily
        ? `DAILY · ${daily.date}`
        : host.name === "local"
          ? "LOCAL · THIS MACHINE"
          : "ALL TIME · TOP 50",
    ),
    el("h1", "arcade-hero-title", daily ? "Daily leaderboard" : "Leaderboards"),
    el(
      "p",
      "arcade-hero-sub",
      daily
        ? "One fixed seed, three attempts, best of three. Everyone plays the same board."
        : host.name === "local"
          ? "Your local scores on this machine. Ranked boards need a signed-in host app."
          : "Verified runs from every player. Pick a cartridge and mode.",
    ),
  )
  const head = el("header", "arcade-boards-head")
  head.append(back, heading)

  const tabs = el("div", "arcade-boards-tabs")
  if (host.daily) {
    const allTime = el(
      "button",
      `arcade-tab${daily ? "" : " arcade-tab-active"}`,
      "All time",
    )
    allTime.type = "button"
    allTime.addEventListener("click", () => {
      onNavigate(entry.meta.id, mode.id)
    })

    const dailyTab = el(
      "button",
      `arcade-tab${daily ? " arcade-tab-active" : ""}`,
      "Daily",
    )
    dailyTab.type = "button"
    dailyTab.addEventListener("click", () => {
      const atEpoch = state.epoch
      void host
        .daily!()
        .then((challenge) => {
          if (!isActive(atEpoch, section)) return
          onNavigate(challenge.gameId, challenge.modeId, challenge)
        })
        .catch((error: unknown) => {
          host.toast(errorMessage(error))
        })
    })
    tabs.append(allTime, dailyTab)
  }

  const controls = el("div", "arcade-boards-controls")
  const gameSelect = el("select", "arcade-select")
  gameSelect.setAttribute("aria-label", "Game")
  for (const candidate of games) {
    const option = el("option", "", candidate.meta.title)
    option.value = candidate.meta.id
    gameSelect.append(option)
  }
  gameSelect.value = entry.meta.id
  gameSelect.disabled = Boolean(daily)
  gameSelect.addEventListener("change", () => {
    const next = games.find((candidate) => candidate.meta.id === gameSelect.value)
    const nextRanked = next?.meta.modes.filter((candidate) => candidate.ranked !== false)
    const nextModeId = (nextRanked && nextRanked.length > 0 ? nextRanked[0] : next?.meta.modes[0])?.id
    onNavigate(gameSelect.value, nextModeId)
  })

  const variants = entry.meta.variants ?? []
  let modeHint: HTMLElement | undefined

  if (variants.length > 0) {
    const groups = new Map<string, Mode[]>()
    for (const candidate of availableModes) {
      const key = candidate.group ?? candidate.id
      const list = groups.get(key) ?? []
      list.push(candidate)
      groups.set(key, list)
    }
    const currentGroup = mode.group ?? mode.id
    const currentVariant = mode.variant ?? variants[0]!.id

    const groupSelect = el("select", "arcade-select")
    groupSelect.setAttribute("aria-label", "Difficulty")
    for (const [key, list] of groups) {
      const primary =
        list.find((candidate) => candidate.variant === variants[0]?.id) ?? list[0]!
      const option = el("option", "", primary.title)
      option.value = key
      groupSelect.append(option)
    }
    groupSelect.value = currentGroup
    groupSelect.disabled = Boolean(daily)

    const variantSelect = el("select", "arcade-select")
    variantSelect.setAttribute("aria-label", "Board type")
    for (const variant of variants) {
      const option = el("option", "", variant.title)
      option.value = variant.id
      variantSelect.append(option)
    }
    variantSelect.value = currentVariant
    variantSelect.disabled = Boolean(daily)

    const choose = (groupKey: string, variantId: string): void => {
      const list = groups.get(groupKey) ?? []
      const next =
        list.find((candidate) => (candidate.variant ?? variants[0]!.id) === variantId) ??
        list[0]
      if (next) onNavigate(entry.meta.id, next.id, daily)
    }
    groupSelect.addEventListener("change", () => {
      choose(groupSelect.value, variantSelect.value)
    })
    variantSelect.addEventListener("change", () => {
      choose(groupSelect.value, variantSelect.value)
    })

    modeHint = el(
      "div",
      "arcade-mode-hint",
      variants.find((variant) => variant.id === currentVariant)?.description ?? "",
    )
    controls.append(gameSelect, groupSelect, variantSelect)
  } else {
    const modeSelect = el("select", "arcade-select")
    modeSelect.setAttribute("aria-label", "Mode")
    for (const candidate of availableModes) {
      const option = el("option", "", candidate.title)
      option.value = candidate.id
      modeSelect.append(option)
    }
    modeSelect.value = mode.id
    modeSelect.disabled = Boolean(daily)
    modeSelect.addEventListener("change", () => {
      onNavigate(entry.meta.id, modeSelect.value)
    })
    controls.append(gameSelect, modeSelect)
  }

  const play = el(
    "button",
    "arcade-btn arcade-btn-primary",
    daily ? "Play daily" : "Play",
  )
  play.type = "button"
  play.addEventListener("click", () => {
    if (daily) onPlayGame(entry, mode.id, daily)
    else {
      onRememberMode(entry, mode.id)
      onPlayGame(entry, mode.id)
    }
  })

  const refresh = el("button", "arcade-btn", "Refresh")
  refresh.type = "button"
  refresh.addEventListener("click", () => {
    onNavigate(entry.meta.id, mode.id, daily)
  })

  controls.append(play, refresh)

  const scoringHintText =
    daily && entry.meta.id === "mineflag"
      ? "Daily rank: moves, then server time. Attempts are shown only."
      : entry.meta.id === "nonogram" ||
          entry.meta.id === "router" ||
          entry.meta.id === "tilechain"
        ? daily
          ? "Daily rank: score, then server time. Attempts are shown only."
          : "Rank: score, then server time."
        : undefined
  const scoringHint = scoringHintText
    ? el("div", "arcade-mode-hint", scoringHintText)
    : undefined

  const you = el("div", "arcade-boards-you")
  // Local hosts report no rank, so the "your rank" card would only ever say "—".
  you.hidden = host.playerBest === undefined
  const youLabel = el("div", "arcade-boards-you-label", "YOUR RANK")
  const youRank = el("div", "arcade-boards-you-rank", "—")
  const youScore = el("div", "arcade-boards-you-score", "")
  you.append(youLabel, youRank, youScore)

  const list = el("div", "arcade-board-list arcade-boards-list")
  list.append(el("div", "arcade-empty", "Loading…"))

  section.append(
    head,
    tabs,
    controls,
    ...(modeHint ? [modeHint] : []),
    ...(scoringHint ? [scoringHint] : []),
    you,
    list,
  )
  main.append(section)

  try {
    const loadEntries =
      daily && host.dailyBoard
        ? host.dailyBoard(daily.challengeId)
        : loadBoard(entry.meta.id, mode.id)
    const [entries, mineResult, auth, freshDaily] = await Promise.all([
      loadEntries,
      !daily && host.playerBest
        ? host.playerBest(entry.meta.id, mode.id).then(
            (value) => ({ ok: true as const, value }),
            () => ({ ok: false as const }),
          )
        : Promise.resolve({ ok: true as const, value: undefined }),
      host.authState ? host.authState().catch(() => undefined) : Promise.resolve(undefined),
      daily && host.daily ? host.daily().catch(() => undefined) : Promise.resolve(undefined),
    ])
    if (!isActive(epoch, section)) return
    if (!Array.isArray(entries)) throw new Error("The host returned an invalid leaderboard.")

    const mine = mineResult.ok ? mineResult.value : undefined
    const playerId = mine?.playerId ?? auth?.playerId
    const dailyIndex =
      daily && playerId
        ? entries.findIndex((item) => item.playerId === playerId)
        : -1

    if (daily) {
      youLabel.textContent = auth?.signedIn
        ? `YOUR DAILY · ${auth.displayName ?? `@${auth.githubLogin ?? "player"}`}`
        : "YOUR DAILY"
      if (dailyIndex >= 0) {
        const entryAt = entries[dailyIndex]!
        applyRank(youRank, dailyIndex + 1)
        youScore.textContent = `${formatDailyScore(entryAt.score, entry.meta)}${xpSummaryNote(entryAt.xpLevel, entryAt.xpRank)}`
      } else if (auth && !auth.signedIn) {
        applyRank(youRank)
        youScore.textContent = "Sign in with GitHub to play the daily."
      } else {
        applyRank(youRank)
        youScore.textContent = `No daily run yet. ${freshDaily?.attemptsLeft ?? daily.attemptsLeft} of 3 attempts left.`
      }
    } else if (auth?.signedIn) {
      youLabel.textContent = `YOUR RANK · ${auth.displayName ?? `@${auth.githubLogin ?? "player"}`}`
    }

    if (!daily) {
      if (!mineResult.ok) {
        applyRank(youRank)
        youScore.textContent = "Rank unavailable. Refresh to retry."
      } else if (mine?.rank !== undefined) {
        applyRank(youRank, mine.rank)
        youScore.textContent = mine.score
          ? `${scoreLabel(entry.meta)}: ${formatBoardScore(mine.score, entry.meta)}${xpSummaryNote(mine.xpLevel, mine.xpRank)}`
          : ""
      } else if (auth && !auth.signedIn) {
        applyRank(youRank)
        youScore.textContent = "Sign in with GitHub to rank on this board."
      } else {
        applyRank(youRank)
        youScore.textContent = "No ranked run yet. Play to set one."
      }
    }

    if (auth && !auth.signedIn) {
      const signIn = el("button", "arcade-btn arcade-btn-ghost arcade-boards-signin", "Sign in")
      signIn.type = "button"
      signIn.addEventListener("click", onOpenAuth)
      you.append(signIn)
    }

    list.replaceChildren()
    if (entries.length === 0) {
      const empty = el(
        "div",
        "arcade-empty",
        daily
          ? "No daily runs yet. Be the first."
          : host.name === "local"
            ? "No local score yet for this cartridge. Play a run and it lands here."
            : "No ranked runs yet. Be the first.",
      )
      const first = el("button", "arcade-btn arcade-btn-primary", "Play now")
      first.type = "button"
      first.addEventListener("click", () => {
        if (daily) onPlayGame(entry, mode.id, daily)
        else onPlayGame(entry, mode.id)
      })
      empty.append(first)
      list.append(empty)
      return
    }

    entries.forEach((item, index) => {
      list.append(
        renderBoardRow(
          item,
          index,
          entry.meta,
          playerId,
          "arcade-boards-row",
          daily ? formatDailyScore : formatBoardScore,
          host.ghost ? (ghostItem) => onStartPractice(entry, ghostItem) : undefined,
        ),
      )
    })
  } catch (error) {
    if (!isActive(epoch, section)) return
    const empty = el("div", "arcade-empty", errorMessage(error))
    const retry = el("button", "arcade-btn", "Retry")
    retry.type = "button"
    retry.addEventListener("click", () => {
      onNavigate(entry.meta.id, mode.id, daily)
    })
    empty.append(retry)
    list.replaceChildren(empty)
  }
}
