import type {
  AuthState,
  BoardEntry,
  DailyChallenge,
  GameEntry,
  GameHost,
  GhostRun,
  Mode,
  RunAnchor,
  RunResult,
  Score,
  SubmitResult,
} from "@await-arcade/contract"
import { createRunner, el, ensureStyle, type GameRunner } from "@await-arcade/framework"
import { openAuthModal } from "./auth-modal"
import { type BoardsState, renderBoardsView } from "./boards-view"
import { formatDailyScore, formatDuration, formatScore, isBetter, scoreLabel } from "./format"
import { LocalHost } from "./host"
import { styles } from "./styles"
import {
  countdownLabel,
  errorMessage,
  hudCell,
  modeGroups,
  modeInGroup,
  nextTheme,
  randomSeed,
  renderBoardRow,
  themeLabel,
  type ThemeMode,
} from "./ui"

export interface ArcadeOptions {
  readonly root: HTMLElement
  readonly games: readonly GameEntry[]
  readonly host?: GameHost
  readonly title?: string
  /** Set false when the host injects the styles itself (e.g. OpenCode's Style). */
  readonly injectStyles?: boolean
}

export interface Arcade {
  destroy(): void
  showLauncher(): void
}

interface ActiveGame {
  runner: GameRunner<any, any>
  cleanup: () => void
}

export function createArcade(options: ArcadeOptions): Arcade {
  if (options.injectStyles !== false) ensureStyle("arcade-shell-styles", styles)

  const root = options.root
  const title = options.title ?? "Await Arcade"
  const games = [...options.games]

  if (games.length === 0) throw new Error("Await Arcade: at least one game is required")

  const ids = new Set<string>()
  for (const entry of games) {
    if (ids.has(entry.meta.id)) throw new Error(`Await Arcade: duplicate game id "${entry.meta.id}"`)
    ids.add(entry.meta.id)
    if (entry.meta.modes.length === 0) throw new Error(`Await Arcade: ${entry.meta.id} has no modes`)
  }

  const host: GameHost =
    options.host ??
    new LocalHost({ prefix: "await-arcade", toastRoot: root })

  const modeFor = (entry: GameEntry): Mode => {
    const stored = host.storage.get<string>(`mode.${entry.meta.id}`)
    return entry.meta.modes.find((mode) => mode.id === stored) ?? entry.meta.modes[0]!
  }
  const rememberMode = (entry: GameEntry, modeId: string): void => {
    host.storage.set(`mode.${entry.meta.id}`, modeId)
  }

  if ("setToastRoot" in host && typeof (host as { setToastRoot?: unknown }).setToastRoot === "function") {
    ;(host as { setToastRoot(node: HTMLElement): void }).setToastRoot(root)
  }

  // A game version bump can change the scoring unit, so drop cached personal
  // bests for that game. Mineflag's first run under version keys also drops
  // its old millisecond bests from the time-scored rules.
  for (const entry of games) {
    const key = `game.version.${entry.meta.id}`
    const known = host.storage.get<string>(key)
    if (known === undefined) {
      host.storage.set(key, entry.meta.version)
      if (entry.meta.id === "mineflag") {
        for (const mode of entry.meta.modes) {
          host.storage.remove(`best.${entry.meta.id}.${mode.id}`)
        }
      }
    } else if (known !== entry.meta.version) {
      for (const mode of entry.meta.modes) {
        host.storage.remove(`best.${entry.meta.id}.${mode.id}`)
      }
      host.storage.set(key, entry.meta.version)
    }
  }

  const themeKey = "ui.theme"
  const storedTheme = host.storage.get<string>(themeKey)
  let themeMode: ThemeMode = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "auto"
  const applyTheme = (mode: ThemeMode): void => {
    themeMode = mode
    root.dataset.theme = mode
    host.storage.set(themeKey, mode)
  }
  applyTheme(themeMode)

  root.classList.add("arcade")
  root.replaceChildren()

  const top = el("header", "arcade-top")
  const brand = el("div", "arcade-brand")
  brand.append(
    el("span", "arcade-brand-mark", "AA"),
    el("span", "arcade-brand-text", title),
  )

  const topMeta = el("div", "arcade-top-meta")

  const homeButton = el("button", "arcade-btn arcade-btn-ghost", "Home")
  homeButton.type = "button"
  homeButton.hidden = true
  homeButton.title = "Back to the lobby"
  homeButton.addEventListener("click", () => {
    if (
      runInProgress &&
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm("Leave this run? The replay will not be submitted.")
    ) {
      return
    }
    showLauncher()
  })

  const authButton = el("button", "arcade-btn arcade-btn-ghost", "Sign in")
  authButton.type = "button"
  authButton.hidden = host.authState === undefined
  authButton.title = "Sign in with GitHub"
  authButton.addEventListener("click", () => openAuth())

  const theme = el("button", "arcade-btn arcade-btn-ghost", themeLabel(themeMode))
  theme.type = "button"
  theme.title = "Theme: auto, light, or dark"
  theme.addEventListener("click", () => {
    const next = nextTheme(themeMode)
    applyTheme(next)
    theme.textContent = themeLabel(next)
  })

  const sound = el("button", "arcade-btn arcade-btn-ghost", host.audio.muted() ? "Muted" : "Sound")
  sound.type = "button"
  sound.addEventListener("click", () => {
    const muted = host.audio.toggle()
    sound.textContent = muted ? "Muted" : "Sound"
  })

  const boardsButton = el("button", "arcade-btn arcade-btn-ghost", "Boards")
  boardsButton.type = "button"
  boardsButton.hidden = host.board === undefined
  boardsButton.title = "All-time leaderboards"
  boardsButton.addEventListener("click", () => {
    if (
      runInProgress &&
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm("Leave this run? The replay will not be submitted.")
    ) {
      return
    }
    void showBoards()
  })

  topMeta.append(homeButton, authButton, boardsButton, theme, sound)
  top.append(brand, topMeta)

  const main = el("main", "arcade-main")
  const online = host.board !== undefined
  const hostLabel =
    host.name === "local"
      ? "Local"
      : host.name === "opencode"
        ? "OpenCode"
        : host.name === "antigravity"
          ? "Antigravity"
          : host.name
  const foot = el("footer", "arcade-foot")
  foot.append(
    el("span", "", `Await Arcade v0.1 · ${online ? "online leaderboards" : "local scores"}`),
    el("span", "arcade-foot-host", `Host: ${hostLabel}`),
    el("span", "", "Replay-verified runs"),
  )

  root.append(top, main, foot)

  let authState: AuthState | undefined
  let closeAuth: (() => void) | undefined

  const applyAuth = (state: AuthState): void => {
    authState = state
    authButton.hidden = false
    authButton.textContent = state.signedIn
      ? (state.displayName ?? `@${state.githubLogin ?? "player"}`)
      : "Sign in"
    authButton.title = state.signedIn
      ? `Signed in as ${state.displayName ?? state.githubLogin ?? "player"}`
      : "Sign in with GitHub"
    if (main.querySelector(".arcade-boards")) {
      void showBoards(boardsState.gameId, boardsState.modeId, boardsState.daily)
    } else if (main.querySelector(".arcade-daily")) {
      dailyRefresh?.()
    }
  }

  const openAuth = (): void => {
    const close = openAuthModal({
      root,
      host,
      games,
      getAuthState: () => authState,
      applyAuth,
      onClosed: () => {
        closeAuth = undefined
      },
    })
    if (close) closeAuth = close
  }

  if (host.authState) {
    void host
      .authState()
      .then(applyAuth)
      .catch(() => undefined)
  }


  let active: ActiveGame | undefined
  let playGeneration = 0
  let runInProgress = false

  const destroyActive = (): void => {
    runInProgress = false
    if (!active) return
    active.cleanup()
    active.runner.stop()
    active = undefined
  }

  let dailyTimer: ReturnType<typeof setInterval> | undefined
  let dailyRefresh: (() => void) | undefined
  let lastDailyRefreshDate: string | undefined

  const clearDailyUi = (): void => {
    if (dailyTimer) clearInterval(dailyTimer)
    dailyTimer = undefined
    dailyRefresh = undefined
  }

  const dailyCard = (challenge: DailyChallenge): HTMLElement => {
    const entry = games.find((candidate) => candidate.meta.id === challenge.gameId)
    const mode = entry?.meta.modes.find((candidate) => candidate.id === challenge.modeId)
    if (!entry || !mode) {
      return el("div", "arcade-empty", "Today's featured cartridge is not installed.")
    }

    const section = el("section", "arcade-daily")
    section.style.setProperty("--game-accent-dark", entry.meta.theme?.accent ?? "#22d3ee")
    section.style.setProperty("--game-accent-2-dark", entry.meta.theme?.accent2 ?? "#f472b6")
    section.dataset.mode = entry.meta.theme?.mode ?? "neon"

    const body = el("div", "arcade-daily-body")
    body.append(
      el("div", "arcade-kicker", `DAILY CHALLENGE · ${challenge.date}`),
      el("h2", "arcade-daily-title", entry.meta.title),
      el(
        "p",
        "arcade-daily-sub",
        `${mode.title} · one fixed seed for everyone · best of three`,
      ),
    )
    if (entry.meta.id === "mineflag") {
      body.append(
        el("div", "arcade-mode-hint", "Daily rank: moves, then server time. Attempts are shown only."),
      )
    }

    const remaining = Math.max(0, challenge.attemptsLeft)
    const meta = el("div", "arcade-daily-meta")
    const attempts = el("div", "arcade-daily-attempts")
    attempts.append(el("span", "arcade-daily-label", "Attempts"))
    for (let index = 0; index < 3; index += 1) {
      attempts.append(
        el(
          "span",
          `arcade-daily-pip${index < challenge.attemptsUsed ? " arcade-daily-pip-used" : ""}`,
        ),
      )
    }
    attempts.append(el("span", "arcade-daily-count", `${remaining} left`))

    const serverOffset = (challenge.serverNow ?? Date.now()) - Date.now()
    const remainingMs = (): number => challenge.endsAt - (Date.now() + serverOffset)
    const resetValue = el(
      "span",
      "arcade-daily-reset-value",
      countdownLabel(remainingMs()),
    )
    const reset = el("div", "arcade-daily-reset")
    reset.append(el("span", "arcade-daily-label", "Resets in"), resetValue)
    meta.append(attempts, reset)
    body.append(meta)

    const actions = el("div", "arcade-daily-actions")
    const signedOut = authState !== undefined && !authState.signedIn
    const play = el(
      "button",
      "arcade-btn arcade-btn-primary",
      signedOut ? "Sign in to play" : remaining > 0 ? "Play daily" : "No attempts left",
    )
    play.type = "button"
    if (signedOut) {
      play.addEventListener("click", openAuth)
    } else {
      play.disabled = remaining <= 0
      play.addEventListener("click", () => {
        void playGame(entry, mode.id, challenge)
      })
    }

    const board = el("button", "arcade-btn", "Daily board")
    board.type = "button"
    board.addEventListener("click", () => {
      void showBoards(entry.meta.id, mode.id, challenge)
    })
    actions.append(play, board)

    section.append(body, actions)

    if (dailyTimer) clearInterval(dailyTimer)
    dailyTimer = setInterval(() => {
      const remaining = remainingMs()
      resetValue.textContent = countdownLabel(remaining)
      if (remaining <= 0 && lastDailyRefreshDate !== challenge.date) {
        lastDailyRefreshDate = challenge.date
        if (dailyTimer) clearInterval(dailyTimer)
        dailyTimer = undefined
        dailyRefresh?.()
      }
    }, 1000)

    return section
  }

  const loadDaily = async (slot: HTMLElement, generation: number): Promise<void> => {
    const fetchDaily = host.daily?.bind(host)
    if (!fetchDaily) return

    try {
      const challenge = await fetchDaily()
      if (generation !== playGeneration || !slot.isConnected) return
      const draw = (): void => {
        slot.replaceChildren(dailyCard(challenge))
      }
      dailyRefresh = () => {
        void loadDaily(slot, playGeneration)
      }
      draw()
    } catch (error) {
      if (generation !== playGeneration || !slot.isConnected) return
      if (dailyTimer) clearInterval(dailyTimer)
      dailyTimer = undefined
      const empty = el("div", "arcade-empty", `Daily challenge unavailable. ${errorMessage(error)}`)
      const retry = el("button", "arcade-btn", "Retry")
      retry.type = "button"
      retry.addEventListener("click", () => {
        void loadDaily(slot, playGeneration)
      })
      empty.append(retry)
      slot.replaceChildren(empty)
    }
  }

  const showLauncher = (): void => {
    playGeneration += 1
    const generation = playGeneration
    homeButton.hidden = true
    clearDailyUi()
    destroyActive()
    main.replaceChildren()

    const launcher = el("section", "arcade-launcher")
    const hero = el("div", "arcade-hero")
    hero.append(
      el("div", "arcade-kicker", "INSERT COIN · FREE PLAY"),
      el("h1", "arcade-hero-title", "Await Arcade"),
      el("p", "arcade-hero-sub", online ? "A tiny arcade for the wait. Pick a game, chase a personal best, and climb the shared board." : "A tiny arcade for the wait. Pick a game and chase a personal best."),
    )
    launcher.append(hero)

    if (host.daily) {
      const slot = el("div", "arcade-daily-slot")
      slot.append(el("div", "arcade-empty", "Loading the daily challenge…"))
      launcher.append(slot)
      void loadDaily(slot, generation)
    }

    const grid = el("div", "arcade-grid")

    for (const entry of games) {
      const defaultMode = modeFor(entry)
      if (!defaultMode) continue

      const best = host.best(entry.meta.id, defaultMode.id)
      const card = el("article", "arcade-card")
      card.tabIndex = 0
      card.setAttribute("role", "button")
      card.setAttribute("aria-label", `Play ${entry.meta.title}`)
      card.style.setProperty("--game-accent-dark", entry.meta.theme?.accent ?? "#22d3ee")
      card.style.setProperty("--game-accent-2-dark", entry.meta.theme?.accent2 ?? "#f472b6")
      card.dataset.mode = entry.meta.theme?.mode ?? "neon"

      const marquee = el("div", "arcade-card-marquee")
      const mark = el(
        "pre",
        `arcade-card-glyph${entry.meta.glyph ? " arcade-card-art" : ""}`,
        entry.meta.glyph ?? entry.meta.title.slice(0, 1).toUpperCase(),
      )
      mark.setAttribute("aria-hidden", "true")
      marquee.append(mark)

      const body = el("div", "arcade-card-body")
      const kicker = `${entry.meta.kind === "turn" ? "TURN-BASED" : "ACTION"}${entry.meta.status === "experimental" ? " · LABS" : ""}`
      body.append(el("div", "arcade-card-kicker", kicker))
      body.append(el("h2", "arcade-card-title", entry.meta.title))
      body.append(el("p", "arcade-card-desc", entry.meta.description))

      const metaRow = el("div", "arcade-card-meta")
      const modeCount = entry.meta.variants?.length
        ? `${new Set(entry.meta.modes.map((mode) => mode.group ?? mode.id)).size} difficulties`
        : `${entry.meta.modes.length} mode${entry.meta.modes.length === 1 ? "" : "s"}`
      metaRow.append(el("span", "arcade-chip", modeCount))
      metaRow.append(el("span", "arcade-chip arcade-chip-mode", defaultMode.title))
      const bestChip = el(
        "span",
        "arcade-chip",
        `${scoreLabel(entry.meta)}: ${best ? formatScore(best, entry.meta) : "—"}`,
      )
      metaRow.append(bestChip)
      body.append(metaRow)

      if (host.loadBest) {
        void host
          .loadBest(entry.meta.id, defaultMode.id)
          .then((remote) => {
            const local = host.best(entry.meta.id, defaultMode.id)
            const best = remote && (!local || isBetter(remote, local)) ? remote : local
            if (best && card.isConnected) {
              bestChip.textContent = `${scoreLabel(entry.meta)}: ${formatScore(best, entry.meta)}`
            }
          })
          .catch(() => {
            // Offline or signed out. The local chip stays.
          })
      }

      const actions = el("div", "arcade-card-actions")
      const play = el("button", "arcade-btn arcade-btn-primary", "Play")
      play.type = "button"
      play.addEventListener("click", (event) => {
        event.stopPropagation()
        playGame(entry, defaultMode.id)
      })
      actions.append(play)
      body.append(actions)

      card.append(marquee, body)
      card.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button")) return
        playGame(entry, defaultMode.id)
      })
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          playGame(entry, defaultMode.id)
        }
      })

      grid.append(card)
    }

    launcher.append(grid)
    main.append(launcher)
  }

  const boardsState: BoardsState = {
    gameId: games[0]!.meta.id,
    modeId: games[0]!.meta.modes[0]!.id,
    epoch: 0,
  }

  const showBoards = (
    gameId?: string,
    modeId?: string,
    daily?: DailyChallenge,
  ): Promise<void> =>
    renderBoardsView({
      main,
      host,
      games,
      state: boardsState,
      gameId,
      modeId,
      daily,
      isActive: (epoch, section) => epoch === boardsState.epoch && section.parentNode === main,
      onPrepare: () => {
        homeButton.hidden = false
        playGeneration += 1
        clearDailyUi()
        destroyActive()
      },
      onShowLauncher: showLauncher,
      onRememberMode: rememberMode,
      onPlayGame: (entry, modeId, challenge) => {
        void playGame(entry, modeId, challenge)
      },
      onStartPractice: (entry, item) => {
        void startPractice(entry, item)
      },
      onOpenAuth: openAuth,
      onNavigate: (nextGameId, nextModeId, nextDaily) => {
        void showBoards(nextGameId, nextModeId, nextDaily)
      },
    })

  const startPractice = async (
    entry: GameEntry,
    item: BoardEntry,
  ): Promise<void> => {
    if (!item.ghostId || !host.ghost) return
    try {
      const ghost = await host.ghost(item.ghostId)
      if (ghost.gameId !== entry.meta.id) {
        host.toast("That practice run belongs to another cartridge.")
        return
      }
      const mode =
        entry.meta.modes.find((candidate) => candidate.id === ghost.modeId) ??
        entry.meta.modes.find((candidate) => candidate.ranked !== false)
      if (!mode) return
      void playGame(entry, mode.id, undefined, ghost)
    } catch (error) {
      host.toast(errorMessage(error))
    }
  }

  const playGame = async (
    entry: GameEntry,
    modeId: string,
    daily?: DailyChallenge,
    ghost?: GhostRun,
  ): Promise<void> => {
    const generation = ++playGeneration
    homeButton.hidden = false
    clearDailyUi()
    destroyActive()
    main.replaceChildren()
    main.append(el("div", "arcade-empty", "Starting…"))

    const mode = entry.meta.modes.find((item) => item.id === modeId) ?? entry.meta.modes[0]
    if (!mode) return

    const isRankedMode = mode.ranked !== false && !ghost
    let session: {
      seed: number
      runId?: string
      anchor?: RunAnchor
      challengeId?: string
      attempt?: number
      attemptsLeft?: number
    }
    try {
      if (ghost) {
        session = { seed: ghost.seed, ...(ghost.anchor ? { anchor: ghost.anchor } : {}) }
      } else if (daily) {
        if (!host.startDaily) throw new Error("The daily challenge is not available.")
        const started = await host.startDaily(daily.challengeId)
        const anchor = started.anchor ?? daily.anchor
        session = {
          seed: started.seed,
          runId: started.runId,
          challengeId: started.challengeId,
          attempt: started.attempt,
          attemptsLeft: started.attemptsLeft,
          ...(anchor ? { anchor } : {}),
        }
      } else if (!isRankedMode) {
        session = { seed: randomSeed() }
      } else {
        session = host.start
          ? await host.start({ gameId: entry.meta.id, modeId: mode.id })
          : { seed: randomSeed() }
      }
    } catch (error) {
      if (generation !== playGeneration) return
      if (daily) {
        const message = errorMessage(error)
        host.toast(message)
        if (/sign in again/i.test(message) && host.authState) openAuth()
        showLauncher()
        return
      }
      host.toast(
        authState && !authState.signedIn
          ? "Playing locally. Sign in to rank."
          : "Online unavailable; playing locally.",
      )
      session = { seed: randomSeed() }
    }

    if (generation !== playGeneration) return
    main.replaceChildren()

    const isDaily = Boolean(daily)
    const best = ghost || isDaily || !isRankedMode ? undefined : host.best(entry.meta.id, mode.id)
    const bestLabel = ghost ? "Practice" : isDaily ? "Daily best" : scoreLabel(entry.meta)
    const section = el("section", "arcade-game")
    section.style.setProperty("--game-accent-dark", entry.meta.theme?.accent ?? "#22d3ee")
    section.style.setProperty("--game-accent-2-dark", entry.meta.theme?.accent2 ?? "#f472b6")
    section.dataset.mode = entry.meta.theme?.mode ?? "neon"

    const cartridge = el("div", "arcade-cartridge-marquee")
    const cartridgeBest = el(
      "div",
      "arcade-cartridge-score",
      ghost
        ? "Unranked · ghost practice"
        : !isRankedMode
          ? "Unranked"
          : `${bestLabel}: ${best ? formatScore(best, entry.meta) : "—"}`,
    )
    cartridge.append(
      el("span", "arcade-cartridge-badge", "AA"),
      ...(daily
        ? [el("span", "arcade-cartridge-badge arcade-cartridge-daily", `DAILY ${session.attempt ?? 1}/3`)]
        : []),
      ...(ghost
        ? [el("span", "arcade-cartridge-badge arcade-cartridge-daily", "PRACTICE")]
        : []),
      el("div", "arcade-cartridge-title", entry.meta.title),
      cartridgeBest,
    )

    const head = el("header", "arcade-game-head")
    const back = el("button", "arcade-btn arcade-btn-ghost", "← Lobby")
    back.title = "Back to the lobby"
    back.type = "button"
    back.addEventListener("click", () => {
      if (
        daily &&
        runInProgress &&
        typeof globalThis.confirm === "function" &&
        !globalThis.confirm("Leave the daily? This consumes the attempt.")
      ) {
        return
      }
      showLauncher()
    })

    const titleWrap = el("div", "arcade-game-title")
    titleWrap.append(el("p", "", entry.meta.description))

    const actions = el("div", "arcade-game-actions")
    const variants = entry.meta.variants ?? []
    let modeHint: HTMLElement | undefined
    const chooseMode = (modeId: string): void => {
      rememberMode(entry, modeId)
      playGame(entry, modeId)
    }

    if (variants.length > 0) {
      const groups = modeGroups(entry)
      const currentGroup = mode.group ?? mode.id
      const currentVariant = mode.variant ?? variants[0]!.id

      const groupSelect = el("select", "arcade-select")
      groupSelect.setAttribute("aria-label", "Difficulty")
      for (const group of groups) {
        const option = el("option", "", group.title)
        option.value = group.key
        groupSelect.append(option)
      }
      groupSelect.value = currentGroup
      groupSelect.disabled = Boolean(daily) || Boolean(ghost)

      const variantSelect = el("select", "arcade-select")
      variantSelect.setAttribute("aria-label", "Board type")
      for (const variant of variants) {
        const option = el("option", "", variant.title)
        option.value = variant.id
        variantSelect.append(option)
      }
      variantSelect.value = currentVariant
      variantSelect.disabled = Boolean(daily) || Boolean(ghost)

      groupSelect.addEventListener("change", () => {
        const next = modeInGroup(entry, groupSelect.value, variantSelect.value)
        if (next) chooseMode(next.id)
      })
      variantSelect.addEventListener("change", () => {
        const next = modeInGroup(entry, groupSelect.value, variantSelect.value)
        if (next) chooseMode(next.id)
      })

      modeHint = el(
        "div",
        "arcade-mode-hint",
        variants.find((variant) => variant.id === currentVariant)?.description ?? "",
      )
      actions.append(groupSelect, variantSelect)
    } else {
      const modeSelect = el("select", "arcade-select")
      modeSelect.setAttribute("aria-label", "Mode")
      for (const item of entry.meta.modes) {
        const option = el("option", "", item.title)
        option.value = item.id
        modeSelect.append(option)
      }
      modeSelect.value = mode.id
      modeSelect.disabled = Boolean(daily) || Boolean(ghost)
      modeSelect.addEventListener("change", () => chooseMode(modeSelect.value))
      actions.append(modeSelect)
    }

    const pause = el("button", "arcade-btn", "Pause")
    pause.type = "button"

    const restart = el("button", "arcade-btn", "Restart")
    restart.type = "button"

    const restartRun = (): void => {
      if (
        daily &&
        typeof globalThis.confirm === "function" &&
        !globalThis.confirm("Restart the daily? This consumes another attempt.")
      ) {
        return
      }
      void playGame(entry, mode.id, daily, ghost)
    }

    actions.append(pause, restart)
    let boardButton: HTMLButtonElement | undefined
    if (isRankedMode && (host.board || (isDaily && host.dailyBoard))) {
      boardButton = el("button", "arcade-btn", "Board")
      boardButton.type = "button"
      boardButton.addEventListener("click", () => {
        void showBoard()
      })
      actions.append(boardButton)
    }
    head.append(back, titleWrap, actions)

    const score = hudCell(
      entry.meta.score.unit === "moves"
        ? "Moves"
        : entry.meta.score.type === "lower"
          ? "Time"
          : "Score",
      "—",
    )
    const bestCell = hudCell(bestLabel, best ? formatScore(best, entry.meta) : "—")
    const time = hudCell(
      entry.meta.kind === "realtime" || entry.meta.id === "mineflag" ? "Elapsed" : "Status",
      entry.meta.kind === "realtime" || entry.meta.id === "mineflag" ? "0.0s" : "Playing",
    )
    const hud = el("div", "arcade-hud")
    hud.append(score.root, bestCell.root, time.root)

    if (host.loadBest && !isDaily && isRankedMode) {
      void host
        .loadBest(entry.meta.id, mode.id)
        .then((remote) => {
          if (generation !== playGeneration) return
          const local = host.best(entry.meta.id, mode.id)
          const best = remote && (!local || isBetter(remote, local)) ? remote : local
          if (!best) return
          const text = formatScore(best, entry.meta)
          bestCell.value.textContent = text
          cartridgeBest.textContent = `${scoreLabel(entry.meta)}: ${text}`
        })
        .catch(() => {
          // Offline; keep the cached best.
        })
    }

    if (daily && host.dailyBoard) {
      void host
        .dailyBoard(daily.challengeId)
        .then((entries) => {
          if (generation !== playGeneration) return
          const id = authState?.playerId
          const mine = id ? entries.find((item) => item.playerId === id) : undefined
          if (!mine) return
          const text = formatDailyScore(mine.score, entry.meta)
          bestCell.value.textContent = text
          cartridgeBest.textContent = `${bestLabel}: ${text}`
        })
        .catch(() => {
          // Offline or no previous daily run.
        })
    }

    const surface = el("div", "arcade-surface")
    surface.tabIndex = 0
    surface.setAttribute("aria-label", `${entry.meta.title} game surface`)

    const controls = el("footer", "arcade-controls")
    for (const control of entry.meta.controls) {
      const key = el("span", "arcade-key")
      key.append(el("b", "", control.keys), control.action)
      controls.append(key)
    }

    const overlay = el("div", "arcade-overlay")
    overlay.hidden = true

    section.append(
      cartridge,
      head,
      ...(modeHint ? [modeHint] : []),
      hud,
      surface,
      controls,
      overlay,
    )
    main.append(section)

    let overlayEpoch = 0
    let closeBoard: (() => void) | undefined

    const showOverlay = (build: () => HTMLElement): void => {
      overlayEpoch += 1
      closeBoard = undefined
      overlay.replaceChildren(build())
      overlay.hidden = false
    }

    const hideOverlay = (): void => {
      overlayEpoch += 1
      closeBoard = undefined
      overlay.hidden = true
      overlay.replaceChildren()
    }

    const overlayCard = (
      kicker: string,
      title: string,
      scoreText: string,
      detail: string,
      buttons: HTMLElement[],
    ): HTMLElement => {
      const card = el("div", "arcade-overlay-card")
      card.append(
        el("div", "arcade-overlay-kicker", kicker),
        el("h2", "arcade-overlay-title", title),
        el("div", "arcade-overlay-score", scoreText),
        el("div", "arcade-overlay-detail", detail),
      )
      const row = el("div", "arcade-overlay-actions")
      row.append(...buttons)
      card.append(row)
      return card
    }

    const button = (label: string, primary: boolean, run: () => void): HTMLButtonElement => {
      const node = el("button", `arcade-btn${primary ? " arcade-btn-primary" : ""}`, label)
      node.type = "button"
      node.addEventListener("click", run)
      return node
    }

    let runner!: GameRunner<any, any>
    let lastTicks = 0
    let boardPending = false
    let elapsedTimer: ReturnType<typeof setInterval> | undefined

    const showPaused = (): void => {
      showOverlay(() =>
        overlayCard(
          "PAUSED",
          entry.meta.title,
          formatScore(entry.core.score(runner.state(), { elapsedMs: runner.elapsedMs(), ticks: lastTicks }), entry.meta),
          "The clock is stopped.",
          [
            button("Resume", true, () => {
              runner.resume()
              hideOverlay()
              pause.textContent = "Pause"
            }),
            button("Restart", false, restartRun),
            button("Lobby", false, showLauncher),
          ],
        ),
      )
    }

    const togglePause = (): void => {
      if (!runner || pause.disabled) return
      if (runner.paused()) {
        runner.resume()
        hideOverlay()
        pause.textContent = "Pause"
      } else {
        runner.pause()
        pause.textContent = "Resume"
        showPaused()
      }
    }

    pause.addEventListener("click", togglePause)
    restart.addEventListener("click", restartRun)

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        if (closeBoard) {
          closeBoard()
          return
        }
        togglePause()
      }
    }
    document.addEventListener("keydown", onKey)

    const onVisibility = (): void => {
      if (!document.hidden) return
      if (runner && !runner.paused() && !pause.disabled) {
        runner.pause()
        pause.textContent = "Resume"
        showPaused()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    const cleanup = (): void => {
      if (elapsedTimer) {
        clearInterval(elapsedTimer)
        elapsedTimer = undefined
      }
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("visibilitychange", onVisibility)
    }

    const showGameOver = (
      result: RunResult<any>,
      submit: SubmitResult,
      previousBest: Score | undefined,
      practice = false,
    ): void => {
      pause.disabled = true
      pause.textContent = "Pause"
      if (boardButton) boardButton.disabled = true

      const currentKey = submit.score?.detail?.rankKey
      const bestKey = submit.best?.detail?.rankKey
      const improved = daily
        ? typeof currentKey === "string" && currentKey === bestKey
        : submit.best !== undefined && isBetter(submit.best, previousBest)
      const kicker = practice
        ? "PRACTICE · UNRANKED"
        : daily
          ? `DAILY ATTEMPT ${session.attempt ?? 1}/3`
          : !result.score.ranked
            ? "UNRANKED RUN"
            : improved
              ? "NEW BEST"
              : "RUN COMPLETE"
      const title = result.score.won ? "You win." : "Run over."
      const detailParts: string[] = []

      if (practice) {
        detailParts.push(
          "Ghost practice on the same seed. Unranked; no leaderboard entry or daily attempt used.",
        )
        detailParts.push(`Your practice score: ${formatScore(result.score, entry.meta)}.`)
      } else if (daily) detailParts.push(`Daily attempt ${session.attempt ?? 1} of 3.`)
      if (!practice) {
        if (!result.score.ranked) {
          detailParts.push("This run is not eligible for the leaderboard.")
        } else if (submit.ok) {
          detailParts.push(
            improved
              ? daily
                ? "Daily best saved."
                : "Personal best saved."
              : daily
                ? "Daily best stands."
                : "Personal best stands.",
          )
        } else detailParts.push(submit.reason ?? "Submission failed.")
      }

      if (submit.rank !== undefined) detailParts.push(`Rank #${submit.rank}`)
      if (submit.xp !== undefined && submit.xp > 0) detailParts.push(`+${submit.xp} XP`)
      if (daily && submit.score) {
        const detail = submit.score.detail ?? {}
        const elapsed = typeof detail.elapsedMs === "number" ? detail.elapsedMs : undefined
        const moves = typeof detail.moves === "number" ? detail.moves : undefined
        const attempt = typeof detail.attempt === "number" ? detail.attempt : (session.attempt ?? 1)
        if (elapsed !== undefined && moves !== undefined) {
          detailParts.push(
            `Attempt ${attempt} · server ${formatDuration(elapsed)} · ${moves} moves.`,
          )
        }
      } else if (!daily && entry.meta.id === "mineflag") {
        detailParts.push(`Time ${formatDuration(result.replay.durationMs)}.`)
      }
      if (submit.best) {
        const bestText = daily
          ? formatDailyScore(submit.best, entry.meta)
          : formatScore(submit.best, entry.meta)
        bestCell.value.textContent = bestText
        cartridgeBest.textContent = `${bestLabel}: ${bestText}`
      }

      const download = button("Download replay", false, () => {
        const blob = new Blob([JSON.stringify(result.replay, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `${entry.meta.id}-${result.modeId}-${Date.now()}.json`
        link.click()
        URL.revokeObjectURL(url)
      })

      const again = button("Play again", true, restartRun)
      if (daily && (session.attemptsLeft ?? 0) <= 0) {
        again.disabled = true
        again.textContent = "Daily attempts used"
      }
      const actions = [again, button("Lobby", false, showLauncher), download]
      if (practice) {
        actions.push(
          button("Leaderboard", false, () => {
            void showBoards(entry.meta.id, mode.id)
          }),
        )
      }
      if (daily) {
        actions.push(
          button("Daily board", false, () => {
            void showBoards(entry.meta.id, mode.id, daily)
          }),
        )
      }

      showOverlay(() =>
        overlayCard(
          kicker,
          title,
          formatScore(result.score, entry.meta),
          detailParts.join(" "),
          actions,
        ),
      )
    }

    const viewHost: GameHost = {
      name: host.name,
      storage: host.storage,
      audio: host.audio,
      best: (gameId, modeId) => host.best(gameId, modeId),
      submit: (run) => host.submit(run),
      toast: (message) => host.toast(message),
      ...(host.start ? { start: (input) => host.start!(input) } : {}),
      ...(host.loadBest ? { loadBest: (gameId, modeId) => host.loadBest!(gameId, modeId) } : {}),
      ...(host.board ? { board: (gameId, modeId) => host.board!(gameId, modeId) } : {}),
    }

    runner = createRunner({
      meta: entry.meta,
      core: entry.core,
      view: entry.view,
      host: viewHost,
      container: surface,
      mode,
      seed: session.seed,
      ...(session.runId !== undefined ? { runId: session.runId } : {}),
      ...(session.anchor ? { prelude: [session.anchor] } : {}),
      onTick(state, elapsedMs, ticks) {
        lastTicks = ticks
        const preview = entry.core.score(state, { elapsedMs, ticks })
        score.value.textContent = formatScore(preview, entry.meta)
        if (entry.meta.kind === "realtime" || entry.meta.id === "mineflag") {
          time.value.textContent = formatDuration(elapsedMs)
        } else {
          time.value.textContent = entry.core.phase(state) === "playing" ? "Playing" : "Finished"
        }
      },
      onEnd(result) {
        runInProgress = false
        if (elapsedTimer) {
          clearInterval(elapsedTimer)
          elapsedTimer = undefined
        }
        if (entry.meta.id === "mineflag") {
          time.value.textContent = formatDuration(result.replay.durationMs)
        } else if (entry.meta.kind === "turn") {
          time.value.textContent = result.score.won ? "Won" : "Lost"
        }
        const previousBest = ghost || isDaily || !isRankedMode ? undefined : host.best(entry.meta.id, mode.id)
        if (ghost) {
          showGameOver(result, { ok: false, reason: "" }, previousBest, true)
          return
        }
        if (!result.score.ranked) {
          showGameOver(
            result,
            { ok: false, reason: "This run is not eligible for the leaderboard." },
            previousBest,
          )
          return
        }
        void host
          .submit(result)
          .then((submit) => showGameOver(result, submit, previousBest))
          .catch((error: unknown) => {
            showGameOver(
              result,
              { ok: false, reason: errorMessage(error) },
              previousBest,
            )
          })
      },
    })

    const showBoard = async (): Promise<void> => {
      if (pause.disabled || boardPending) return
      const activeDaily = daily
      const fetchBoard = activeDaily && host.dailyBoard
        ? () => host.dailyBoard!(activeDaily.challengeId)
        : host.board ? () => host.board!(entry.meta.id, mode.id) : undefined
      if (!fetchBoard) return
      boardPending = true

      const wasRunning = !runner.paused()
      const wasPaused = runner.paused()
      if (wasRunning) {
        runner.pause()
        pause.textContent = "Resume"
      }

      const close = (): void => {
        boardPending = false
        if (wasRunning) {
          hideOverlay()
          runner.resume()
          pause.textContent = "Pause"
        } else if (wasPaused) {
          showPaused()
        } else {
          hideOverlay()
        }
      }

      const loadingClose = button("Resume", true, close)
      showOverlay(() => {
        const card = el("div", "arcade-overlay-card")
        card.setAttribute("role", "dialog")
        card.setAttribute("aria-modal", "true")
        card.setAttribute("aria-label", "Leaderboard")
        const actions = el("div", "arcade-overlay-actions")
        actions.append(loadingClose)
        card.append(
          el("div", "arcade-overlay-kicker", "LEADERBOARD"),
          el("h2", "arcade-overlay-title", "Loading…"),
          actions,
        )
        return card
      })
      closeBoard = close
      loadingClose.focus()
      const token = overlayEpoch

      try {
        const [entries, auth] = await Promise.all([
          fetchBoard(),
          host.authState ? host.authState().catch(() => undefined) : Promise.resolve(undefined),
        ])
        if (generation !== playGeneration || token !== overlayEpoch) return

        const currentId = auth?.playerId ?? authState?.playerId
        const card = el("div", "arcade-overlay-card arcade-board")
        card.setAttribute("role", "dialog")
        card.setAttribute("aria-modal", "true")
        const titleId = `arcade-board-title-${generation}`
        card.setAttribute("aria-labelledby", titleId)

        const heading = el("h2", "arcade-overlay-title", entry.meta.title)
        heading.id = titleId
        const kicker = activeDaily
          ? `LEADERBOARD · DAILY · ${activeDaily.date}`
          : "LEADERBOARD · ALL TIME"
        card.append(el("div", "arcade-overlay-kicker", kicker), heading)

        if (entries.length === 0) {
          card.append(el("div", "arcade-overlay-detail", "No ranked runs yet. Be the first."))
        } else {
          const list = el("div", "arcade-board-list")
          entries.forEach((item, index) => {
            list.append(
              renderBoardRow(
                item,
                index,
                entry.meta,
                currentId,
                "",
                activeDaily ? formatDailyScore : formatScore,
                host.ghost ? (ghostItem) => void startPractice(entry, ghostItem) : undefined,
              ),
            )
          })
          card.append(list)
        }

        const boardActions = el("div", "arcade-overlay-actions")
        const closeButton = button(wasRunning ? "Resume" : "Close", true, close)
        boardActions.append(
          closeButton,
          button("Play again", false, restartRun),
        )
        card.append(boardActions)
        showOverlay(() => card)
        closeBoard = close
        closeButton.focus()
      } catch (error) {
        if (generation !== playGeneration || token !== overlayEpoch) return
        const closeButton = button("Close", true, close)
        showOverlay(() =>
          overlayCard(
            "LEADERBOARD",
            "Offline",
            "—",
            errorMessage(error),
            [closeButton],
          ),
        )
        closeBoard = close
        closeButton.focus()
      } finally {
        boardPending = false
      }
    }

    if (entry.meta.id === "mineflag") {
      elapsedTimer = setInterval(() => {
        if (runner && entry.core.phase(runner.state()) === "playing") {
          time.value.textContent = formatDuration(runner.elapsedMs())
        }
      }, 1000)
    }

    active = { runner, cleanup }
    runInProgress = true
    surface.focus()
  }

  showLauncher()

  return {
    destroy() {
      playGeneration += 1
      boardsState.epoch += 1
      closeAuth?.()
      clearDailyUi()
      destroyActive()
      root.classList.remove("arcade")
      root.replaceChildren()
    },
    showLauncher,
  }
}
