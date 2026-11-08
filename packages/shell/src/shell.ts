import type {
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

  const host =
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
  topMeta.append(theme, sound)
  top.append(brand, topMeta)

  const main = el("main", "arcade-main")
  const foot = el("footer", "arcade-foot")
  foot.append(
    el("span", "", "Await Arcade v0.1 · local scores"),
    el("span", "", "Replay verification server: packages/server"),
  )

  root.append(top, main, foot)

  let active: ActiveGame | undefined

  const destroyActive = (): void => {
    if (!active) return
    active.cleanup()
    active.runner.stop()
    active = undefined
  }

  const showLauncher = (): void => {
    destroyActive()
    main.replaceChildren()

    const launcher = el("section", "arcade-launcher")
    const hero = el("div", "arcade-hero")
    hero.append(
      el("div", "arcade-kicker", "INSERT COIN · FREE PLAY"),
      el("h1", "arcade-hero-title", "Await Arcade"),
      el("p", "arcade-hero-sub", "A tiny arcade for the wait. Pick a game, chase a personal best, and come back for the daily seed once the backend is wired."),
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
      metaRow.append(
        el("span", "arcade-chip", `${scoreLabel(entry.meta)}: ${best ? formatScore(best, entry.meta) : "—"}`),
      )
      body.append(metaRow)

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

  const playGame = (entry: GameEntry, modeId: string): void => {
    destroyActive()
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
    head.append(back, titleWrap, actions)

    const score = hudCell(entry.meta.score.type === "lower" ? "Time" : "Score", "—")
    const bestCell = hudCell(scoreLabel(entry.meta), best ? formatScore(best, entry.meta) : "—")
    const time = hudCell(
      entry.meta.kind === "realtime" ? "Elapsed" : "Status",
      entry.meta.kind === "realtime" ? "0.0s" : "Playing",
    )
    const hud = el("div", "arcade-hud")
    hud.append(score.root, bestCell.root, time.root)

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

    const showOverlay = (build: () => HTMLElement): void => {
      overlay.replaceChildren(build())
      overlay.hidden = false
    }

    const hideOverlay = (): void => {
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

    runner = createRunner({
      meta: entry.meta,
      core: entry.core,
      view: entry.view,
      host,
      container: surface,
      mode,
      seed: randomSeed(),
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

    active = { runner, cleanup }
    surface.focus()
  }

  showLauncher()

  return {
    destroy() {
      destroyActive()
      root.classList.remove("arcade")
      root.replaceChildren()
    },
    showLauncher,
  }
}
