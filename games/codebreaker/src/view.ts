import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import {
  LETTERS,
  SYMBOLS,
  type CodebreakerGuess,
  type CodebreakerInput,
  type CodebreakerState,
} from "./core"

const css = `
.cb-wrap {
  --cb-tile-max: 46px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  outline: none;
  user-select: none;
  touch-action: manipulation;
}

.cb-wrap:focus-visible {
  outline: 2px solid var(--game-accent, #a78bfa);
  outline-offset: 3px;
  border-radius: 6px;
}

.cb-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.cb-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.2));
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cb-stat.is-code {
  color: var(--game-accent, #a78bfa);
  border-color: color-mix(in srgb, var(--game-accent, #a78bfa) 38%, transparent);
}

.cb-stat.is-last {
  color: var(--arcade-fg, #e6edf3);
}

.cb-board {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
}

.cb-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 0;
  padding: 3px;
  border: 1px solid transparent;
  border-radius: 8px;
}

.cb-row.is-active {
  border-color: color-mix(in srgb, var(--game-accent, #a78bfa) 35%, transparent);
  background: color-mix(in srgb, var(--game-accent, #a78bfa) 7%, transparent);
}

.cb-row[hidden] {
  display: none;
}

.cb-index {
  flex: 0 0 16px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.cb-row.is-active .cb-index {
  color: var(--game-accent, #a78bfa);
}

.cb-tiles {
  display: grid;
  grid-template-columns: repeat(var(--cb-slots, 4), minmax(0, 1fr));
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.cb-tile {
  appearance: none;
  display: grid;
  place-items: center;
  position: relative;
  width: 100%;
  max-width: var(--cb-tile-max);
  aspect-ratio: 1;
  justify-self: center;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.25));
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 5%, transparent);
  color: var(--arcade-muted, #8b98a9);
  font: inherit;
  font-size: clamp(15px, 4.6vw, 21px);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

button.cb-tile {
  cursor: pointer;
  transition: border-color 100ms ease, background 100ms ease, transform 70ms ease;
}

button.cb-tile:active {
  transform: scale(0.95);
}

button.cb-tile:disabled {
  cursor: default;
  opacity: 1;
}

.cb-tile.is-filled {
  border-color: color-mix(in srgb, var(--cb-symbol, var(--arcade-fg, #e6edf3)) 55%, transparent);
  background: color-mix(in srgb, var(--cb-symbol, var(--arcade-fg, #e6edf3)) 13%, transparent);
  color: var(--cb-symbol, var(--arcade-fg, #e6edf3));
}

.cb-tile.is-cursor {
  border-color: var(--game-accent, #a78bfa);
  box-shadow:
    0 0 0 1px var(--game-accent, #a78bfa),
    0 0 14px color-mix(in srgb, var(--game-accent, #a78bfa) 30%, transparent);
}

.cb-tile.is-cursor::after {
  content: "";
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 12px;
  height: 2px;
  border-radius: 2px;
  background: var(--game-accent, #a78bfa);
  transform: translateX(-50%);
}

.cb-tile.is-reveal {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--game-accent-2, #fbbf24) 60%, transparent);
  color: var(--cb-symbol, var(--arcade-fg, #e6edf3));
}

.cb-feedback {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 4px;
  min-width: 62px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cb-pip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.cb-pip.is-exact {
  color: var(--game-accent, #a78bfa);
}

.cb-pip.is-near {
  color: var(--game-accent-2, #fbbf24);
}

.cb-draft-count {
  color: var(--arcade-muted, #8b98a9);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cb-history {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 4px;
  border-top: 1px dashed var(--arcade-line, rgba(148, 163, 184, 0.2));
}

.cb-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
}

.cb-btn {
  appearance: none;
  padding: 5px 9px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.25));
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 7%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}

.cb-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--game-accent, #a78bfa) 55%, transparent);
  background: color-mix(in srgb, var(--game-accent, #a78bfa) 14%, transparent);
}

.cb-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.cb-btn.is-primary {
  border-color: color-mix(in srgb, var(--game-accent, #a78bfa) 60%, transparent);
  color: var(--game-accent, #a78bfa);
}

.cb-hint {
  margin: 0;
  text-align: center;
  color: var(--arcade-muted, #8b98a9);
  font-size: 9.5px;
  line-height: 1.4;
  opacity: 0.9;
}

.cb-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.cb-sym-a { --cb-symbol: #2dd4bf; }
.cb-sym-b { --cb-symbol: #fbbf24; }
.cb-sym-c { --cb-symbol: #f472b6; }
.cb-sym-d { --cb-symbol: #60a5fa; }
.cb-sym-e { --cb-symbol: #4ade80; }

.arcade[data-theme="light"] .cb-sym-a { --cb-symbol: #0f766e; }
.arcade[data-theme="light"] .cb-sym-b { --cb-symbol: #b45309; }
.arcade[data-theme="light"] .cb-sym-c { --cb-symbol: #be185d; }
.arcade[data-theme="light"] .cb-sym-d { --cb-symbol: #1d4ed8; }
.arcade[data-theme="light"] .cb-sym-e { --cb-symbol: #15803d; }

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] .cb-sym-a { --cb-symbol: #0f766e; }
  .arcade[data-theme="auto"] .cb-sym-b { --cb-symbol: #b45309; }
  .arcade[data-theme="auto"] .cb-sym-c { --cb-symbol: #be185d; }
  .arcade[data-theme="auto"] .cb-sym-d { --cb-symbol: #1d4ed8; }
  .arcade[data-theme="auto"] .cb-sym-e { --cb-symbol: #15803d; }
}

@media (max-width: 360px) {
  .cb-feedback {
    min-width: 48px;
    font-size: 8.5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cb-tile,
  .cb-btn {
    transition: none;
  }
}
`

function letterFor(symbol: number | null): string {
  if (symbol === null || symbol < 0 || symbol >= SYMBOLS) return ""
  return LETTERS[symbol] ?? ""
}

function symbolClass(symbol: number | null): string {
  const letter = letterFor(symbol).toLowerCase()
  return letter ? `cb-sym-${letter}` : ""
}

function codeText(secret: readonly number[]): string {
  return secret.map((symbol) => letterFor(symbol)).join(" ")
}

function feedbackLabel(guess: CodebreakerGuess): string {
  return `${guess.exact} exact, ${guess.near} near`
}

function shortestCycles(
  current: number | null,
  target: number,
): { readonly delta: 1 | -1; readonly count: number } {
  if (current === null) {
    const up = target + 1
    const down = 1 + (SYMBOLS - 1 - target)
    return up <= down ? { delta: 1, count: up } : { delta: -1, count: down }
  }

  const up = (target - current + SYMBOLS) % SYMBOLS
  const down = (current - target + SYMBOLS) % SYMBOLS
  return up <= down ? { delta: 1, count: up } : { delta: -1, count: down }
}

export function view(ctx: ViewContext<CodebreakerState, CodebreakerInput>): GameView<CodebreakerState> {
  ensureStyle("arcade-game-codebreaker", css)

  const wrap = el("div", "cb-wrap")
  wrap.tabIndex = 0
  wrap.setAttribute("role", "application")
  wrap.setAttribute("aria-roledescription", "codebreaker board")
  wrap.setAttribute(
    "aria-label",
    "Codebreaker. Left and right arrows select a slot. Up and down arrows cycle its symbol. Letters A through E set a symbol. Enter submits. Backspace clears the slot.",
  )

  const bar = el("div", "cb-bar")
  const attemptsStat = el("span", "cb-stat")
  const slotsStat = el("span", "cb-stat is-code")
  const lastStat = el("span", "cb-stat is-last")
  bar.append(attemptsStat, slotsStat, lastStat)

  const board = el("div", "cb-board")
  const activeRow = el("div", "cb-row is-active")
  const activeIndex = el("span", "cb-index", ">")
  activeIndex.setAttribute("aria-hidden", "true")
  const activeTiles = el("div", "cb-tiles")
  const activeFeedback = el("div", "cb-feedback")
  const activeCount = el("span", "cb-draft-count")
  activeFeedback.append(activeCount)
  activeRow.append(activeIndex, activeTiles, activeFeedback)

  const history = el("div", "cb-history")
  history.setAttribute("role", "list")
  history.setAttribute("aria-label", "Previous guesses")

  board.append(activeRow, history)

  const controls = el("div", "cb-controls")
  const slotPrev = el("button", "cb-btn", "◀ Slot")
  const symbolPrev = el("button", "cb-btn", "Symbol −")
  const symbolNext = el("button", "cb-btn", "Symbol +")
  const slotNext = el("button", "cb-btn", "Slot ▶")
  const clearBtn = el("button", "cb-btn", "Clear")
  const submitBtn = el("button", "cb-btn is-primary", "Submit")
  const controlButtons = [slotPrev, symbolPrev, symbolNext, slotNext, clearBtn, submitBtn]
  for (const button of controlButtons) {
    button.type = "button"
    button.dataset.cbControl = "true"
  }
  slotPrev.setAttribute("aria-label", "Select the previous slot")
  symbolPrev.setAttribute("aria-label", "Cycle the symbol backward")
  symbolNext.setAttribute("aria-label", "Cycle the symbol forward")
  slotNext.setAttribute("aria-label", "Select the next slot")
  clearBtn.setAttribute("aria-label", "Clear the active slot")
  submitBtn.setAttribute("aria-label", "Submit the guess")
  controls.append(slotPrev, symbolPrev, symbolNext, slotNext, clearBtn, submitBtn)

  const hint = el(
    "p",
    "cb-hint",
    "← → slot · ↑ ↓ symbol · A–E set · Enter submit · Backspace clear",
  )
  const live = el("div", "cb-sr")
  live.setAttribute("aria-live", "polite")
  live.setAttribute("aria-atomic", "true")

  wrap.append(bar, board, controls, hint, live)
  ctx.container.append(wrap)

  let builtSlots = 0
  let activeCells: HTMLButtonElement[] = []
  let historyCount = 0
  let lastAnnouncedAttempts = 0
  let lastAnnouncedPhase = "playing"

  const dispatch = (input: CodebreakerInput): void => {
    if (ctx.state().phase !== "playing") return
    ctx.dispatch(input)
  }

  const selectSlot = (index: number): void => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    if (index === state.cursor) return
    const plus = (index - state.cursor + state.slots) % state.slots
    const minus = state.slots - plus
    if (plus <= minus) {
      for (let count = 0; count < plus; count += 1) dispatch({ type: "slot", delta: 1 })
    } else {
      for (let count = 0; count < minus; count += 1) dispatch({ type: "slot", delta: -1 })
    }
  }

  const buildActive = (slots: number): void => {
    builtSlots = slots
    activeCells = []
    activeTiles.replaceChildren()
    activeTiles.style.setProperty("--cb-slots", String(slots))

    for (let index = 0; index < slots; index += 1) {
      const cell = el("button", "cb-tile")
      cell.type = "button"
      cell.addEventListener("click", () => {
        const state = ctx.state()
        if (state.phase !== "playing") return
        if (state.cursor === index) dispatch({ type: "cycle", delta: 1 })
        else selectSlot(index)
      })
      activeTiles.append(cell)
      activeCells.push(cell)
    }
  }

  const buildHistoryRow = (guess: CodebreakerGuess, attempt: number): HTMLElement => {
    const row = el("div", "cb-row is-past")
    row.setAttribute("role", "listitem")
    row.setAttribute("aria-label", `Attempt ${attempt}: ${codeText(guess.symbols)}. ${feedbackLabel(guess)}.`)

    const index = el("span", "cb-index", String(attempt))
    index.setAttribute("aria-hidden", "true")

    const tiles = el("div", "cb-tiles")
    tiles.style.setProperty("--cb-slots", String(guess.symbols.length))
    for (const symbol of guess.symbols) {
      const tile = el("span", `cb-tile is-filled ${symbolClass(symbol)}`, letterFor(symbol))
      tile.setAttribute("aria-hidden", "true")
      tiles.append(tile)
    }

    const feedback = el("div", "cb-feedback")
    feedback.setAttribute("aria-hidden", "true")
    const exact = el("span", "cb-pip is-exact", `● ${guess.exact}`)
    const near = el("span", "cb-pip is-near", `○ ${guess.near}`)
    feedback.append(exact, near)

    row.append(index, tiles, feedback)
    return row
  }

  const setSymbol = (target: number): void => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    const current = state.draft[state.cursor] ?? null
    const { delta, count } = shortestCycles(current, target)
    for (let step = 0; step < count; step += 1) dispatch({ type: "cycle", delta })
  }

  const isControl = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && target.closest("[data-cb-control]") !== null

  const onKeyDown = (event: KeyboardEvent): void => {
    // Leave browser and shell shortcuts alone: Ctrl/Cmd+A must select, not set
    // symbol A, and Alt+Arrow must navigate, not move the slot cursor.
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const key = event.key
    const letter = key.length === 1 && /[a-eA-E]/.test(key)
    const handled =
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "Enter" ||
      key === "Backspace" ||
      key === "Delete" ||
      letter

    if (!handled) return
    // Enter on a focused control button is that button's own activation.
    if (key === "Enter" && isControl(event.target)) return

    // Claim the key even on repeat so held arrows never scroll the shell and a
    // held Backspace can never navigate away, but dispatch only once.
    event.preventDefault()
    if (event.repeat) return

    if (key === "ArrowLeft" || key === "ArrowRight") {
      dispatch({ type: "slot", delta: key === "ArrowLeft" ? -1 : 1 })
      return
    }

    if (key === "ArrowUp" || key === "ArrowDown") {
      dispatch({ type: "cycle", delta: key === "ArrowUp" ? 1 : -1 })
      return
    }

    if (letter) {
      const upper = key.toUpperCase()
      setSymbol(upper.charCodeAt(0) - 65)
      return
    }

    if (key === "Enter") {
      dispatch({ type: "submit" })
      return
    }

    if (key === "Backspace" || key === "Delete") {
      dispatch({ type: "clear" })
    }
  }

  wrap.addEventListener("pointerdown", (event) => {
    if (isControl(event.target)) return
    wrap.focus()
  })
  ctx.container.addEventListener("keydown", onKeyDown)

  slotPrev.addEventListener("click", () => dispatch({ type: "slot", delta: -1 }))
  slotNext.addEventListener("click", () => dispatch({ type: "slot", delta: 1 }))
  symbolPrev.addEventListener("click", () => dispatch({ type: "cycle", delta: -1 }))
  symbolNext.addEventListener("click", () => dispatch({ type: "cycle", delta: 1 }))
  clearBtn.addEventListener("click", () => dispatch({ type: "clear" }))
  submitBtn.addEventListener("click", () => dispatch({ type: "submit" }))

  // A pointer click activates the control, then hands focus back to the board
  // so the next Enter submits instead of re-activating that button. Keyboard
  // activation (Enter/Space on a tabbed-to control) keeps native focus.
  for (const button of controlButtons) {
    button.addEventListener("pointerup", () => wrap.focus())
  }

  const render = (state: CodebreakerState): void => {
    if (state.slots !== builtSlots) buildActive(state.slots)

    const playing = state.phase === "playing"
    const attempt = Math.min(state.attemptsUsed + (playing ? 1 : 0), state.maxAttempts)

    attemptsStat.textContent = `Attempt ${attempt}/${state.maxAttempts}`
    slotsStat.textContent = `Code ${state.slots}`

    const last = state.guesses[state.guesses.length - 1]
    if (state.phase === "won") lastStat.textContent = "Cracked"
    else if (state.phase === "lost") lastStat.textContent = "Locked"
    else if (last) lastStat.textContent = `● ${last.exact}  ○ ${last.near}`
    else lastStat.textContent = "Ready"

    activeRow.hidden = state.phase === "won"
    activeIndex.textContent = state.phase === "lost" ? "×" : ">"
    const filled = state.draft.filter((slot) => slot !== null).length
    activeCount.textContent = playing ? `${filled}/${state.slots}` : "Code"

    if (state.phase === "lost") {
      activeRow.setAttribute("role", "group")
      activeRow.setAttribute("aria-label", `The code was ${codeText(state.secret)}`)
    } else {
      activeRow.removeAttribute("role")
      activeRow.removeAttribute("aria-label")
    }

    const showSecret = state.phase === "lost"
    for (let index = 0; index < activeCells.length; index += 1) {
      const cell = activeCells[index]
      if (!cell) continue
      const symbol = showSecret ? (state.secret[index] ?? null) : (state.draft[index] ?? null)
      const active = playing && index === state.cursor
      const letter = letterFor(symbol)

      cell.className = "cb-tile"
      const symbolStyle = symbolClass(symbol)
      if (symbolStyle) cell.classList.add(symbolStyle)
      if (symbol !== null) cell.classList.add("is-filled")
      if (active) cell.classList.add("is-cursor")
      if (showSecret) cell.classList.add("is-reveal")
      cell.textContent = letter || "·"
      cell.disabled = !playing
      cell.setAttribute(
        "aria-label",
        `Slot ${index + 1}: ${letter || "empty"}${active ? ", active" : ""}`,
      )
      if (active) cell.setAttribute("aria-current", "true")
      else cell.removeAttribute("aria-current")
    }

    // Guess rows are append-only, so append only the new ones. Newest first.
    if (state.guesses.length > historyCount) {
      for (let index = historyCount; index < state.guesses.length; index += 1) {
        const guess = state.guesses[index]
        if (!guess) continue
        history.prepend(buildHistoryRow(guess, index + 1))
      }
      historyCount = state.guesses.length
    }

    for (const button of controlButtons) button.disabled = !playing

    if (state.attemptsUsed !== lastAnnouncedAttempts || state.phase !== lastAnnouncedPhase) {
      if (state.phase === "won") {
        live.textContent = `Code cracked in ${state.attemptsUsed} attempts.`
      } else if (state.phase === "lost") {
        live.textContent = `Out of attempts. The code was ${codeText(state.secret)}.`
      } else if (last) {
        const left = state.maxAttempts - state.attemptsUsed
        live.textContent = `Attempt ${state.attemptsUsed}: ${feedbackLabel(last)}. ${left} ${
          left === 1 ? "attempt" : "attempts"
        } left.`
      }
      lastAnnouncedAttempts = state.attemptsUsed
      lastAnnouncedPhase = state.phase
    }
  }

  return {
    render(state) {
      render(state)
    },
    destroy() {
      ctx.container.removeEventListener("keydown", onKeyDown)
      wrap.remove()
    },
  }
}
