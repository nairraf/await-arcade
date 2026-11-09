import type {
  AuthPoll,
  AuthState,
  BoardEntry,
  DailyChallenge,
  DeviceFlow,
  GameEntry,
  GameHost,
  GameMeta,
  Mode,
  RunAnchor,
  RunResult,
  Score,
  SubmitResult,
} from "@await-arcade/contract"
import { createRunner, el, ensureStyle, type GameRunner } from "@await-arcade/framework"
import { LocalHost } from "./host"
import { formatDuration, formatScore, isBetter, scoreLabel } from "./format"
import { styles } from "./styles"

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

type ThemeMode = "auto" | "light" | "dark"

function themeLabel(mode: ThemeMode): string {
  return mode === "auto" ? "Auto" : mode === "light" ? "Light" : "Dark"
}

function nextTheme(mode: ThemeMode): ThemeMode {
  return mode === "auto" ? "light" : mode === "light" ? "dark" : "auto"
}

function randomSeed(): number {
  const buffer = new Uint32Array(1)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer)
    return buffer[0]!
  }
  return Math.floor(Math.random() * 0xffffffff)
}

function countdownLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
}

function safeVerificationUri(value: string): string {
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

function errorMessage(error: unknown): string {
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

function hudCell(label: string, value: string): { root: HTMLElement; value: HTMLElement } {
  const root = el("div", "arcade-hud-cell")
  const valueNode = el("strong", "arcade-hud-value", value)
  root.append(el("span", "arcade-hud-label", label), valueNode)
  return { root, value: valueNode }
}

function renderBoardRow(
  item: BoardEntry,
  index: number,
  meta: GameMeta,
  currentId?: string,
  extraClass = "",
): HTMLElement {
  const isYou = Boolean(currentId && item.playerId === currentId)
  const row = el(
    "div",
    `arcade-board-row${extraClass ? ` ${extraClass}` : ""}${isYou ? " arcade-board-row-you" : ""}`,
  )
  const name = isYou ? "You" : (item.displayName || item.playerId.slice(0, 8))
  const player = el("span", "arcade-board-player", name)
  player.title = isYou ? "You" : (item.displayName ? `${item.displayName} (${item.playerId})` : item.playerId)
  row.append(
    el("span", "arcade-board-rank", `#${index + 1}`),
    player,
    el("span", "arcade-board-score", formatScore(item.score, meta)),
  )
  return row
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
  topMeta.append(el("span", "arcade-badge", host.name === "local" ? "LOCAL" : host.name.toUpperCase()))

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

  topMeta.append(authButton, boardsButton, theme, sound)
  top.append(brand, topMeta)

  const main = el("main", "arcade-main")
  const online = host.board !== undefined
  const foot = el("footer", "arcade-foot")
  foot.append(
    el("span", "", `Await Arcade v0.1 · ${online ? "online leaderboards" : "local scores"}`),
    el("span", "", "Replay-verified runs"),
  )

  root.append(top, main, foot)

  let authState: AuthState | undefined
  let closeAuth: (() => void) | undefined

  const applyAuth = (state: AuthState): void => {
    authState = state
    authButton.hidden = false
    authButton.textContent = state.signedIn
      ? `@${state.githubLogin ?? state.displayName ?? "player"}`
      : "Sign in"
    authButton.title = state.signedIn
      ? `Signed in as ${state.displayName ?? state.githubLogin ?? "player"}`
      : "Sign in with GitHub"
    if (main.querySelector(".arcade-boards")) {
      void showBoards(boardsGame, boardsMode, boardsDaily)
    } else if (main.querySelector(".arcade-daily")) {
      dailyRefresh?.()
    }
  }

  const openAuth = (): void => {
    if (!host.authState) return
    if (root.querySelector(".arcade-auth-backdrop")) return

    const backdrop = el("div", "arcade-auth-backdrop")
    const card = el("div", "arcade-overlay-card arcade-auth-card")
    backdrop.append(card)
    root.append(backdrop)

    let timer: ReturnType<typeof setInterval> | undefined
    const close = (): void => {
      if (timer) clearInterval(timer)
      timer = undefined
      closeAuth = undefined
      backdrop.remove()
    }
    closeAuth = close

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close()
    })

    const authAction = (label: string, primary: boolean, run: () => void): HTMLButtonElement => {
      const node = el("button", `arcade-btn${primary ? " arcade-btn-primary" : ""}`, label)
      node.type = "button"
      node.addEventListener("click", run)
      return node
    }

    const actionRow = (...buttons: HTMLButtonElement[]): HTMLElement => {
      const row = el("div", "arcade-overlay-actions")
      row.append(...buttons)
      return row
    }

    const renderSignedOut = (message?: string): void => {
      card.replaceChildren(
        el("div", "arcade-overlay-kicker", "ACCOUNT"),
        el("h2", "arcade-overlay-title", "Sign in to rank"),
        el(
          "div",
          "arcade-overlay-detail",
          message ??
            "Play as a guest, or sign in with GitHub to submit verified runs to the shared boards.",
        ),
        actionRow(
          authAction("Sign in with GitHub", true, () => {
            void startFlow()
          }),
          authAction("Close", false, close),
        ),
      )
    }

    const renderFlow = (flow: DeviceFlow): void => {
      const status = el("div", "arcade-overlay-detail", "Waiting for GitHub…")
      const verification = safeVerificationUri(flow.verificationUri)
      const link = el("a", "arcade-auth-link", verification)
      link.href = verification
      link.target = "_blank"
      link.rel = "noreferrer"

      const copy = authAction("Copy code", false, () => {
        void globalThis.navigator?.clipboard
          ?.writeText(flow.userCode)
          .then(() => host.toast("Code copied"))
          .catch(() => host.toast("Select the code above to copy it"))
      })

      const step = (
        number: string,
        title: string,
        detail: string,
        action: HTMLElement,
      ): HTMLElement => {
        const item = el("li", "arcade-auth-step")
        const body = el("div", "arcade-auth-step-body")
        body.append(
          el("div", "arcade-auth-step-title", title),
          el("div", "arcade-auth-step-detail", detail),
          action,
        )
        item.append(el("span", "arcade-auth-step-num", number), body)
        return item
      }

      const steps = el("ol", "arcade-auth-steps")
      steps.append(
        step("1", "Copy your code", "Use the button or select the code above.", copy),
        step("2", "Open GitHub and enter it", "Authorize Await Arcade once.", link),
      )

      card.replaceChildren(
        el("div", "arcade-overlay-kicker", "GITHUB DEVICE FLOW"),
        el("h2", "arcade-overlay-title", "Enter this code"),
        el("div", "arcade-auth-code", flow.userCode),
        steps,
        status,
        actionRow(authAction("Cancel", false, close)),
      )

      let interval = Math.max(1, flow.interval)
      let polling = false
      const schedule = (): void => {
        if (timer) clearInterval(timer)
        timer = setInterval(() => {
          void tick()
        }, interval * 1000)
      }
      const tick = async (): Promise<void> => {
        if (polling) return
        polling = true
        try {
          const result: AuthPoll = await host.authPoll!(flow.flowId)
          if (result.status === "complete") {
            applyAuth(result)
            close()
            host.toast("Signed in")
            return
          }
          if (result.interval && result.interval !== interval) {
            interval = Math.max(1, result.interval)
            schedule()
          }
        } catch (error) {
          if (timer) clearInterval(timer)
          timer = undefined
          status.textContent = errorMessage(error)
        } finally {
          polling = false
        }
      }

      schedule()
      void tick()
    }

    const startFlow = async (): Promise<void> => {
      try {
        const flow = await host.authStart!()
        renderFlow(flow)
      } catch (error) {
        renderSignedOut(errorMessage(error))
      }
    }

    const renderSignedIn = (state: AuthState): void => {
      card.replaceChildren(
        el("div", "arcade-overlay-kicker", "ACCOUNT"),
        el("h2", "arcade-overlay-title", state.displayName ?? "Signed in"),
        el(
          "div",
          "arcade-overlay-detail",
          `GitHub @${state.githubLogin ?? "player"}${state.queued ? ` · ${state.queued} queued` : ""}`,
        ),
        actionRow(
          authAction("Sign out", false, () => {
            void host
              .signOut!()
              .then((next) => {
                applyAuth(next)
                renderSignedOut("Signed out. Guest scores stay local.")
              })
              .catch((error: unknown) => {
                const message = errorMessage(error)
                if (authState?.signedIn) {
                  renderSignedIn(authState)
                  host.toast(message)
                } else {
                  renderSignedOut(message)
                }
              })
          }),
          authAction("Delete account", false, () => {
            const ok =
              typeof globalThis.confirm === "function"
                ? globalThis.confirm("Delete your player, sessions, and leaderboard entries?")
                : false
            if (!ok) return
            void host
              .deleteAccount!()
              .then((next) => {
                applyAuth(next)
                renderSignedOut("Account deleted.")
              })
              .catch((error: unknown) => {
                const message = errorMessage(error)
                if (authState?.signedIn) {
                  renderSignedIn(authState)
                  host.toast(message)
                } else {
                  renderSignedOut(message)
                }
              })
          }),
          authAction("Close", true, close),
        ),
      )
    }

    if (authState?.signedIn) {
      renderSignedIn(authState)
      return
    }

    renderSignedOut()
    void host
      .authState()
      .then((state) => {
        applyAuth(state)
        if (state.signedIn) renderSignedIn(state)
      })
      .catch(() => undefined)
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
      return el("div", "arcade-empty", "Today's featured cabinet is not installed.")
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
      metaRow.append(el("span", "arcade-chip", `${entry.meta.modes.length} mode${entry.meta.modes.length === 1 ? "" : "s"}`))
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

  let boardsGame = games[0]!.meta.id
  let boardsMode = games[0]!.meta.modes[0]!.id
  let boardsEpoch = 0
  let boardsDaily: DailyChallenge | undefined

  const showBoards = async (
    gameId?: string,
    modeId?: string,
    daily?: DailyChallenge,
  ): Promise<void> => {
    const loadBoard = host.board?.bind(host)
    if (!loadBoard) return

    playGeneration += 1
    clearDailyUi()
    boardsDaily = daily
    destroyActive()
    main.replaceChildren()

    const entry =
      games.find((candidate) => candidate.meta.id === (daily?.gameId ?? gameId)) ??
      games.find((candidate) => candidate.meta.id === boardsGame) ??
      games[0]!
    const rankedModes = entry.meta.modes.filter((candidate) => candidate.ranked !== false)
    const availableModes = rankedModes.length > 0 ? rankedModes : entry.meta.modes
    const mode =
      availableModes.find((candidate) => candidate.id === (daily?.modeId ?? modeId)) ??
      availableModes.find((candidate) => candidate.id === boardsMode) ??
      availableModes[0]!
    boardsGame = entry.meta.id
    boardsMode = mode.id

    const epoch = ++boardsEpoch
    const section = el("section", "arcade-boards")
    section.style.setProperty("--game-accent-dark", entry.meta.theme?.accent ?? "#22d3ee")
    section.style.setProperty("--game-accent-2-dark", entry.meta.theme?.accent2 ?? "#f472b6")
    section.dataset.mode = entry.meta.theme?.mode ?? "neon"

    const back = el("button", "arcade-btn arcade-btn-ghost", "← Lobby")
    back.type = "button"
    back.addEventListener("click", showLauncher)

    const heading = el("div", "arcade-boards-heading")
    heading.append(
      el(
        "div",
        "arcade-kicker",
        daily ? `DAILY · ${daily.date}` : "ALL TIME · TOP 50",
      ),
      el("h1", "arcade-hero-title", daily ? "Daily leaderboard" : "Leaderboards"),
      el(
        "p",
        "arcade-hero-sub",
        daily
          ? "One fixed seed, three attempts, best of three. Everyone plays the same board."
          : "Verified runs from every player. Pick a cabinet and mode.",
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
        void showBoards(entry.meta.id, mode.id)
      })

      const dailyTab = el(
        "button",
        `arcade-tab${daily ? " arcade-tab-active" : ""}`,
        "Daily",
      )
      dailyTab.type = "button"
      dailyTab.addEventListener("click", () => {
        const atEpoch = boardsEpoch
        const atGeneration = playGeneration
        void host
          .daily!()
          .then((challenge) => {
            if (atEpoch !== boardsEpoch || atGeneration !== playGeneration) return
            void showBoards(challenge.gameId, challenge.modeId, challenge)
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

    const modeSelect = el("select", "arcade-select")
    modeSelect.setAttribute("aria-label", "Mode")
    for (const candidate of availableModes) {
      const option = el("option", "", candidate.title)
      option.value = candidate.id
      modeSelect.append(option)
    }
    modeSelect.value = mode.id

    gameSelect.addEventListener("change", () => {
      const next = games.find((candidate) => candidate.meta.id === gameSelect.value)
      const nextRanked = next?.meta.modes.filter((candidate) => candidate.ranked !== false)
      const nextModeId = (nextRanked && nextRanked.length > 0 ? nextRanked[0] : next?.meta.modes[0])?.id
      void showBoards(gameSelect.value, nextModeId)
    })
    modeSelect.addEventListener("change", () => {
      void showBoards(entry.meta.id, modeSelect.value)
    })

    const play = el(
      "button",
      "arcade-btn arcade-btn-primary",
      daily ? "Play daily" : "Play",
    )
    play.type = "button"
    play.addEventListener("click", () => {
      if (daily) void playGame(entry, mode.id, daily)
      else {
        rememberMode(entry, mode.id)
        playGame(entry, mode.id)
      }
    })

    const refresh = el("button", "arcade-btn", "Refresh")
    refresh.type = "button"
    refresh.addEventListener("click", () => {
      void showBoards(entry.meta.id, mode.id, daily)
    })

    controls.append(gameSelect, modeSelect, play, refresh)

    const you = el("div", "arcade-boards-you")
    const youLabel = el("div", "arcade-boards-you-label", "YOUR RANK")
    const youRank = el("div", "arcade-boards-you-rank", "—")
    const youScore = el("div", "arcade-boards-you-score", "")
    you.append(youLabel, youRank, youScore)

    const list = el("div", "arcade-board-list arcade-boards-list")
    list.append(el("div", "arcade-empty", "Loading…"))

    section.append(head, tabs, controls, you, list)
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
      if (epoch !== boardsEpoch || section.parentNode !== main) return
      if (!Array.isArray(entries)) throw new Error("The host returned an invalid leaderboard.")

      const mine = mineResult.ok ? mineResult.value : undefined
      const playerId = mine?.playerId ?? auth?.playerId
      const dailyIndex =
        daily && playerId
          ? entries.findIndex((item) => item.playerId === playerId)
          : -1

      if (daily) {
        youLabel.textContent = auth?.signedIn
          ? `YOUR DAILY · @${auth.githubLogin ?? auth.displayName ?? "player"}`
          : "YOUR DAILY"
        if (dailyIndex >= 0) {
          const entryAt = entries[dailyIndex]!
          youRank.textContent = `#${dailyIndex + 1}`
          youScore.textContent = `${scoreLabel(entry.meta)}: ${formatScore(entryAt.score, entry.meta)}`
        } else if (auth && !auth.signedIn) {
          youRank.textContent = "—"
          youScore.textContent = "Sign in with GitHub to play the daily."
        } else {
          youRank.textContent = "—"
          youScore.textContent = `No daily run yet. ${freshDaily?.attemptsLeft ?? daily.attemptsLeft} of 3 attempts left.`
        }
      } else if (auth?.signedIn) {
        youLabel.textContent = `YOUR RANK · @${auth.githubLogin ?? auth.displayName ?? "player"}`
      }

      if (!daily) {
        if (!mineResult.ok) {
          youRank.textContent = "—"
          youScore.textContent = "Rank unavailable. Refresh to retry."
        } else if (mine?.rank !== undefined) {
          youRank.textContent = `#${mine.rank}`
          youScore.textContent = mine.score
            ? `${scoreLabel(entry.meta)}: ${formatScore(mine.score, entry.meta)}`
            : ""
        } else if (auth && !auth.signedIn) {
          youRank.textContent = "—"
          youScore.textContent = "Sign in with GitHub to rank on this board."
        } else {
          youRank.textContent = "—"
          youScore.textContent = "No ranked run yet. Play to set one."
        }
      }

      if (auth && !auth.signedIn) {
        const signIn = el("button", "arcade-btn arcade-btn-ghost arcade-boards-signin", "Sign in")
        signIn.type = "button"
        signIn.addEventListener("click", openAuth)
        you.append(signIn)
      }

      list.replaceChildren()
      if (entries.length === 0) {
        const empty = el(
          "div",
          "arcade-empty",
          daily ? "No daily runs yet. Be the first." : "No ranked runs yet. Be the first.",
        )
        const first = el("button", "arcade-btn arcade-btn-primary", "Play now")
        first.type = "button"
        first.addEventListener("click", () => {
          if (daily) void playGame(entry, mode.id, daily)
          else playGame(entry, mode.id)
        })
        empty.append(first)
        list.append(empty)
        return
      }

      entries.forEach((item, index) => {
        list.append(renderBoardRow(item, index, entry.meta, playerId, "arcade-boards-row"))
      })
    } catch (error) {
      if (epoch !== boardsEpoch || section.parentNode !== main) return
      const empty = el("div", "arcade-empty", errorMessage(error))
      const retry = el("button", "arcade-btn", "Retry")
      retry.type = "button"
      retry.addEventListener("click", () => {
        void showBoards(entry.meta.id, mode.id, daily)
      })
      empty.append(retry)
      list.replaceChildren(empty)
    }
  }

  const playGame = async (
    entry: GameEntry,
    modeId: string,
    daily?: DailyChallenge,
  ): Promise<void> => {
    const generation = ++playGeneration
    clearDailyUi()
    destroyActive()
    main.replaceChildren()
    main.append(el("div", "arcade-empty", "Starting…"))

    const mode = entry.meta.modes.find((item) => item.id === modeId) ?? entry.meta.modes[0]
    if (!mode) return

    const isRankedMode = mode.ranked !== false
    let session: {
      seed: number
      runId?: string
      anchor?: RunAnchor
      challengeId?: string
      attempt?: number
      attemptsLeft?: number
    }
    try {
      if (daily) {
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
        host.toast(errorMessage(error))
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
    const best = isDaily || !isRankedMode ? undefined : host.best(entry.meta.id, mode.id)
    const bestLabel = isDaily ? "Daily best" : scoreLabel(entry.meta)
    const section = el("section", "arcade-game")
    section.style.setProperty("--game-accent-dark", entry.meta.theme?.accent ?? "#22d3ee")
    section.style.setProperty("--game-accent-2-dark", entry.meta.theme?.accent2 ?? "#f472b6")
    section.dataset.mode = entry.meta.theme?.mode ?? "neon"

    const cabinet = el("div", "arcade-cabinet-marquee")
    const cabinetBest = el(
      "div",
      "arcade-cabinet-score",
      !isRankedMode
        ? "Unranked"
        : `${bestLabel}: ${best ? formatScore(best, entry.meta) : "—"}`,
    )
    cabinet.append(
      el("span", "arcade-cabinet-badge", "AA"),
      ...(daily
        ? [el("span", "arcade-cabinet-badge arcade-cabinet-daily", `DAILY ${session.attempt ?? 1}/3`)]
        : []),
      el("div", "arcade-cabinet-title", entry.meta.title),
      cabinetBest,
    )

    const head = el("header", "arcade-game-head")
    const back = el("button", "arcade-btn arcade-btn-ghost", "← Await Arcade")
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
    const modeSelect = el("select", "arcade-select")
    modeSelect.setAttribute("aria-label", "Mode")
    for (const item of entry.meta.modes) {
      const option = el("option", "", item.title)
      option.value = item.id
      modeSelect.append(option)
    }
    modeSelect.value = mode.id
    modeSelect.disabled = Boolean(daily)
    modeSelect.addEventListener("change", () => {
      rememberMode(entry, modeSelect.value)
      playGame(entry, modeSelect.value)
    })

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
      void playGame(entry, mode.id, daily)
    }

    actions.append(modeSelect, pause, restart)
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
      entry.meta.kind === "realtime" ? "Elapsed" : "Status",
      entry.meta.kind === "realtime" ? "0.0s" : "Playing",
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
          cabinetBest.textContent = `${scoreLabel(entry.meta)}: ${text}`
        })
        .catch(() => {
          // Offline; keep the cached best.
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

    section.append(cabinet, head, hud, surface, controls, overlay)
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
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("visibilitychange", onVisibility)
    }

    const showGameOver = (
      result: RunResult<any>,
      submit: SubmitResult,
      previousBest: Score | undefined,
    ): void => {
      pause.disabled = true
      pause.textContent = "Pause"
      if (boardButton) boardButton.disabled = true

      const improved = daily
        ? submit.best !== undefined && submit.best.value === result.score.value
        : submit.best !== undefined && isBetter(submit.best, previousBest)
      const kicker = daily
        ? `DAILY ATTEMPT ${session.attempt ?? 1}/3`
        : !result.score.ranked
          ? "UNRANKED RUN"
          : improved
            ? "NEW BEST"
            : "RUN COMPLETE"
      const title = result.score.won ? "You win." : "Run over."
      const detailParts: string[] = []

      if (daily) detailParts.push(`Daily attempt ${session.attempt ?? 1} of 3.`)
      if (!result.score.ranked) detailParts.push("This run is not eligible for the leaderboard.")
      else if (submit.ok) {
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

      if (submit.rank !== undefined) detailParts.push(`Rank #${submit.rank}`)
      if (submit.best) {
        bestCell.value.textContent = formatScore(submit.best, entry.meta)
        cabinetBest.textContent = `${bestLabel}: ${formatScore(submit.best, entry.meta)}`
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
        if (entry.meta.kind === "realtime") time.value.textContent = formatDuration(elapsedMs)
        else time.value.textContent = entry.core.phase(state) === "playing" ? "Playing" : "Finished"
      },
      onEnd(result) {
        runInProgress = false
        if (entry.meta.kind === "turn") time.value.textContent = result.score.won ? "Won" : "Lost"
        const previousBest = isDaily || !isRankedMode ? undefined : host.best(entry.meta.id, mode.id)
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
            list.append(renderBoardRow(item, index, entry.meta, currentId))
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

    active = { runner, cleanup }
    runInProgress = true
    surface.focus()
  }

  showLauncher()

  return {
    destroy() {
      playGeneration += 1
      closeAuth?.()
      clearDailyUi()
      destroyActive()
      root.classList.remove("arcade")
      root.replaceChildren()
    },
    showLauncher,
  }
}
