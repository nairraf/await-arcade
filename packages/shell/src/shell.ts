import type {
  AuthPoll,
  AuthState,
  DeviceFlow,
  GameEntry,
  GameHost,
  GameMeta,
  Mode,
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

function hudCell(label: string, value: string): { root: HTMLElement; value: HTMLElement } {
  const root = el("div", "arcade-hud-cell")
  const valueNode = el("strong", "arcade-hud-value", value)
  root.append(el("span", "arcade-hud-label", label), valueNode)
  return { root, value: valueNode }
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

  if ("setToastRoot" in host && typeof (host as { setToastRoot?: unknown }).setToastRoot === "function") {
    ;(host as { setToastRoot(node: HTMLElement): void }).setToastRoot(root)
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
  topMeta.append(authButton, theme, sound)
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

  const applyAuth = (state: AuthState): void => {
    authState = state
    authButton.hidden = false
    authButton.textContent = state.signedIn
      ? `@${state.githubLogin ?? state.displayName ?? "player"}`
      : "Sign in"
    authButton.title = state.signedIn
      ? `Signed in as ${state.displayName ?? state.githubLogin ?? "player"}`
      : "Sign in with GitHub"
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
      backdrop.remove()
    }

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

      card.replaceChildren(
        el("div", "arcade-overlay-kicker", "GITHUB DEVICE FLOW"),
        el("h2", "arcade-overlay-title", "Enter this code"),
        el("div", "arcade-auth-code", flow.userCode),
        el("div", "arcade-overlay-detail", "Open GitHub and enter the code to authorize Await Arcade."),
        link,
        status,
        actionRow(
          authAction("Copy code", false, () => {
            void globalThis.navigator?.clipboard
              ?.writeText(flow.userCode)
              .then(() => host.toast("Code copied"))
              .catch(() => undefined)
          }),
          authAction("Cancel", false, close),
        ),
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
          status.textContent = error instanceof Error ? error.message : String(error)
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
        renderSignedOut(error instanceof Error ? error.message : String(error))
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
                const message = error instanceof Error ? error.message : String(error)
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
                const message = error instanceof Error ? error.message : String(error)
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

  const destroyActive = (): void => {
    if (!active) return
    active.cleanup()
    active.runner.stop()
    active = undefined
  }

  const showLauncher = (): void => {
    playGeneration += 1
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

    const grid = el("div", "arcade-grid")

    for (const entry of games) {
      const defaultMode = entry.meta.modes[0]
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
      marquee.append(el("span", "arcade-card-glyph", entry.meta.title.slice(0, 1).toUpperCase()))

      const body = el("div", "arcade-card-body")
      const kicker = `${entry.meta.kind === "turn" ? "TURN-BASED" : "ACTION"}${entry.meta.status === "experimental" ? " · LABS" : ""}`
      body.append(el("div", "arcade-card-kicker", kicker))
      body.append(el("h2", "arcade-card-title", entry.meta.title))
      body.append(el("p", "arcade-card-desc", entry.meta.description))

      const metaRow = el("div", "arcade-card-meta")
      metaRow.append(el("span", "arcade-chip", `${entry.meta.modes.length} mode${entry.meta.modes.length === 1 ? "" : "s"}`))
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

  const playGame = async (entry: GameEntry, modeId: string): Promise<void> => {
    const generation = ++playGeneration
    destroyActive()
    main.replaceChildren()
    main.append(el("div", "arcade-empty", "Starting…"))

    let session: { seed: number; runId?: string }
    try {
      session = host.start ? await host.start({ gameId: entry.meta.id, modeId }) : { seed: randomSeed() }
    } catch {
      host.toast(
        authState && !authState.signedIn
          ? "Playing locally. Sign in to rank."
          : "Online unavailable; playing locally.",
      )
      session = { seed: randomSeed() }
    }

    if (generation !== playGeneration) return
    main.replaceChildren()

    const mode = entry.meta.modes.find((item) => item.id === modeId) ?? entry.meta.modes[0]
    if (!mode) return

    const best = host.best(entry.meta.id, mode.id)
    const section = el("section", "arcade-game")
    section.style.setProperty("--game-accent-dark", entry.meta.theme?.accent ?? "#22d3ee")
    section.style.setProperty("--game-accent-2-dark", entry.meta.theme?.accent2 ?? "#f472b6")
    section.dataset.mode = entry.meta.theme?.mode ?? "neon"

    const cabinet = el("div", "arcade-cabinet-marquee")
    const cabinetBest = el(
      "div",
      "arcade-cabinet-score",
      `${scoreLabel(entry.meta)}: ${best ? formatScore(best, entry.meta) : "—"}`,
    )
    cabinet.append(
      el("span", "arcade-cabinet-badge", "AA"),
      el("div", "arcade-cabinet-title", entry.meta.title),
      cabinetBest,
    )

    const head = el("header", "arcade-game-head")
    const back = el("button", "arcade-btn arcade-btn-ghost", "← Await Arcade")
    back.type = "button"
    back.addEventListener("click", showLauncher)

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
    modeSelect.addEventListener("change", () => playGame(entry, modeSelect.value))

    const pause = el("button", "arcade-btn", "Pause")
    pause.type = "button"

    const restart = el("button", "arcade-btn", "Restart")
    restart.type = "button"

    actions.append(modeSelect, pause, restart)
    let boardButton: HTMLButtonElement | undefined
    if (host.board) {
      boardButton = el("button", "arcade-btn", "Board")
      boardButton.type = "button"
      boardButton.addEventListener("click", () => {
        void showBoard()
      })
      actions.append(boardButton)
    }
    head.append(back, titleWrap, actions)

    const score = hudCell(entry.meta.score.type === "lower" ? "Time" : "Score", "—")
    const bestCell = hudCell(scoreLabel(entry.meta), best ? formatScore(best, entry.meta) : "—")
    const time = hudCell(
      entry.meta.kind === "realtime" ? "Elapsed" : "Status",
      entry.meta.kind === "realtime" ? "0.0s" : "Playing",
    )
    const hud = el("div", "arcade-hud")
    hud.append(score.root, bestCell.root, time.root)

    if (host.loadBest) {
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
            button("Restart", false, () => playGame(entry, mode.id)),
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
    restart.addEventListener("click", () => playGame(entry, mode.id))

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

      const improved = submit.best !== undefined && isBetter(submit.best, previousBest)
      const kicker = !result.score.ranked ? "UNRANKED RUN" : improved ? "NEW BEST" : "RUN COMPLETE"
      const title = result.score.won ? "You win." : "Run over."
      const detailParts: string[] = []

      if (!result.score.ranked) detailParts.push("This run is not eligible for the leaderboard.")
      else if (submit.ok) detailParts.push(improved ? "Personal best saved." : "Personal best stands.")
      else detailParts.push(submit.reason ?? "Submission failed.")

      if (submit.rank !== undefined) detailParts.push(`Rank #${submit.rank}`)
      if (submit.best) {
        bestCell.value.textContent = formatScore(submit.best, entry.meta)
        cabinetBest.textContent = `${scoreLabel(entry.meta)}: ${formatScore(submit.best, entry.meta)}`
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

      showOverlay(() =>
        overlayCard(
          kicker,
          title,
          formatScore(result.score, entry.meta),
          detailParts.join(" "),
          [
            button("Play again", true, () => playGame(entry, mode.id)),
            button("Lobby", false, showLauncher),
            download,
          ],
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
      onTick(state, elapsedMs, ticks) {
        lastTicks = ticks
        const preview = entry.core.score(state, { elapsedMs, ticks })
        score.value.textContent = formatScore(preview, entry.meta)
        if (entry.meta.kind === "realtime") time.value.textContent = formatDuration(elapsedMs)
        else time.value.textContent = entry.core.phase(state) === "playing" ? "Playing" : "Finished"
      },
      onEnd(result) {
        if (entry.meta.kind === "turn") time.value.textContent = result.score.won ? "Won" : "Lost"
        const previousBest = host.best(entry.meta.id, mode.id)
        void host
          .submit(result)
          .then((submit) => showGameOver(result, submit, previousBest))
          .catch((error: unknown) => {
            showGameOver(
              result,
              { ok: false, reason: error instanceof Error ? error.message : String(error) },
              previousBest,
            )
          })
      },
    })

    const showBoard = async (): Promise<void> => {
      if (pause.disabled || boardPending) return
      const board = host.board?.bind(host)
      if (!board) return
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
        const entries = await board(entry.meta.id, mode.id)
        if (generation !== playGeneration || token !== overlayEpoch) return

        const card = el("div", "arcade-overlay-card arcade-board")
        card.setAttribute("role", "dialog")
        card.setAttribute("aria-modal", "true")
        const titleId = `arcade-board-title-${generation}`
        card.setAttribute("aria-labelledby", titleId)

        const heading = el("h2", "arcade-overlay-title", entry.meta.title)
        heading.id = titleId
        card.append(el("div", "arcade-overlay-kicker", "LEADERBOARD · ALL TIME"), heading)

        if (entries.length === 0) {
          card.append(el("div", "arcade-overlay-detail", "No ranked runs yet. Be the first."))
        } else {
          const list = el("div", "arcade-board-list")
          entries.forEach((item, index) => {
            const row = el("div", "arcade-board-row")
            const player = el("span", "arcade-board-player", item.playerId)
            player.title = item.playerId
            row.append(
              el("span", "arcade-board-rank", `#${index + 1}`),
              player,
              el("span", "arcade-board-score", formatScore(item.score, entry.meta)),
            )
            list.append(row)
          })
          card.append(list)
        }

        const boardActions = el("div", "arcade-overlay-actions")
        const closeButton = button(wasRunning ? "Resume" : "Close", true, close)
        boardActions.append(
          closeButton,
          button("Play again", false, () => playGame(entry, mode.id)),
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
            error instanceof Error ? error.message : String(error),
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
    surface.focus()
  }

  showLauncher()

  return {
    destroy() {
      playGeneration += 1
      destroyActive()
      root.classList.remove("arcade")
      root.replaceChildren()
    },
    showLauncher,
  }
}
