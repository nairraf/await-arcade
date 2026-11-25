import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import {
  COLS,
  ROWS,
  SKIRMISH_MAX_DROPS,
  SKIRMISH_TARGET_CLEARS,
  type Cell,
  type Tile,
  type TilechainInput,
  type TilechainState,
  previewDrop,
} from "./core"

const css = `
.tc-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
  outline: none;
  user-select: none;
  touch-action: manipulation;
}

.tc-wrap:focus-visible {
  outline: 2px solid var(--game-accent, #38bdf8);
  outline-offset: 3px;
  border-radius: 8px;
}

.tc-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tc-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.2));
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tc-stat.is-accent {
  color: var(--game-accent, #38bdf8);
  border-color: color-mix(in srgb, var(--game-accent, #38bdf8) 38%, transparent);
}

.tc-stat.is-warn {
  color: var(--game-accent-2, #f59e0b);
  border-color: color-mix(in srgb, var(--game-accent-2, #f59e0b) 38%, transparent);
}

.tc-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 34px;
}

.tc-next {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tc-mini {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.3));
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 5%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tc-mini.is-current {
  border-color: var(--game-accent, #38bdf8);
  box-shadow: 0 0 12px color-mix(in srgb, var(--game-accent, #38bdf8) 28%, transparent);
}

.tc-mini.is-tile {
  border-color: color-mix(in srgb, var(--tc-tile, var(--arcade-fg, #e6edf3)) 55%, transparent);
  background: color-mix(in srgb, var(--tc-tile, var(--arcade-fg, #e6edf3)) 15%, transparent);
  color: var(--tc-tile, var(--arcade-fg, #e6edf3));
}

.tc-mini.is-cracked {
  border-style: dashed;
  color: var(--arcade-muted, #8b98a9);
}

.tc-board {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  width: 100%;
  padding: 5px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.22));
  border-radius: 10px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 3%, transparent);
}

.tc-cell {
  appearance: none;
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 4%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font: inherit;
  font-size: clamp(13px, 4vw, 18px);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: border-color 90ms ease, background 90ms ease, transform 70ms ease;
}

.tc-cell:active:not(:disabled) {
  transform: scale(0.94);
}

.tc-cell:disabled {
  cursor: default;
}

.tc-cell.is-cursor {
  background: color-mix(in srgb, var(--game-accent, #38bdf8) 8%, transparent);
  border-color: color-mix(in srgb, var(--game-accent, #38bdf8) 28%, transparent);
}

.tc-cell.is-landing {
  border-color: var(--game-accent, #38bdf8);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--game-accent, #38bdf8) 55%, transparent);
}

.tc-cell.is-landing::after {
  content: "";
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--game-accent, #38bdf8);
  opacity: 0.65;
}

.tc-cell.is-tile {
  border-color: color-mix(in srgb, var(--tc-tile, var(--arcade-fg, #e6edf3)) 55%, transparent);
  background: color-mix(in srgb, var(--tc-tile, var(--arcade-fg, #e6edf3)) 15%, transparent);
  color: var(--tc-tile, var(--arcade-fg, #e6edf3));
}

.tc-cell.is-cracked {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--game-accent-2, #f59e0b) 45%, transparent);
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--game-accent-2, #f59e0b) 13%, transparent),
    color-mix(in srgb, var(--game-accent-2, #f59e0b) 13%, transparent) 4px,
    transparent 4px,
    transparent 8px
  );
  color: var(--game-accent-2, #f59e0b);
  font-size: 11px;
}

.tc-v1 { --tc-tile: #60a5fa; }
.tc-v2 { --tc-tile: #4ade80; }
.tc-v3 { --tc-tile: #fbbf24; }
.tc-v4 { --tc-tile: #f472b6; }
.tc-v5 { --tc-tile: #a78bfa; }
.tc-v6 { --tc-tile: #2dd4bf; }
.tc-v7 { --tc-tile: #fb7185; }

.arcade[data-theme="light"] .tc-v1 { --tc-tile: #1d4ed8; }
.arcade[data-theme="light"] .tc-v2 { --tc-tile: #15803d; }
.arcade[data-theme="light"] .tc-v3 { --tc-tile: #b45309; }
.arcade[data-theme="light"] .tc-v4 { --tc-tile: #be185d; }
.arcade[data-theme="light"] .tc-v5 { --tc-tile: #6d28d9; }
.arcade[data-theme="light"] .tc-v6 { --tc-tile: #0f766e; }
.arcade[data-theme="light"] .tc-v7 { --tc-tile: #be123c; }

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] .tc-v1 { --tc-tile: #1d4ed8; }
  .arcade[data-theme="auto"] .tc-v2 { --tc-tile: #15803d; }
  .arcade[data-theme="auto"] .tc-v3 { --tc-tile: #b45309; }
  .arcade[data-theme="auto"] .tc-v4 { --tc-tile: #be185d; }
  .arcade[data-theme="auto"] .tc-v5 { --tc-tile: #6d28d9; }
  .arcade[data-theme="auto"] .tc-v6 { --tc-tile: #0f766e; }
  .arcade[data-theme="auto"] .tc-v7 { --tc-tile: #be123c; }
}

.tc-controls {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.tc-btn {
  appearance: none;
  padding: 6px 11px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.25));
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 7%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}

.tc-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--game-accent, #38bdf8) 55%, transparent);
  background: color-mix(in srgb, var(--game-accent, #38bdf8) 14%, transparent);
}

.tc-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.tc-btn.is-primary {
  border-color: color-mix(in srgb, var(--game-accent, #38bdf8) 60%, transparent);
  color: var(--game-accent, #38bdf8);
}

.tc-cell.is-would-clear {
  box-shadow: inset 0 0 0 2px var(--game-accent, #38bdf8);
}

.tc-cell.is-would-break {
  box-shadow: inset 0 0 0 2px #f59e0b;
}

.tc-help {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--game-accent, #38bdf8) 35%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--game-accent, #38bdf8) 8%, transparent);
  color: var(--arcade-text, #e6edf6);
  font-size: 12px;
  line-height: 1.5;
}

.tc-help[hidden] {
  display: none;
}

.tc-help h3 {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--game-accent, #38bdf8);
}

.tc-help ul {
  margin: 0;
  padding-left: 16px;
}

.tc-help li {
  margin: 0 0 4px;
}

.tc-help li:last-child {
  margin-bottom: 0;
}

.tc-hint {
  margin: 0;
  text-align: center;
  color: var(--arcade-muted, #8b98a9);
  font-size: 11.5px;
  line-height: 1.45;
}

.tc-sr {
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

@media (prefers-reduced-motion: reduce) {
  .tc-cell,
  .tc-btn {
    transition: none;
  }
}
`

function tileText(tile: Tile): string {
  return tile === "cracked" ? "✕" : String(tile)
}

function tileClass(tile: Tile): string {
  return tile === "cracked" ? "is-cracked" : `is-tile tc-v${tile}`
}

function cellLabel(cell: Cell): string {
  if (cell === null) return "empty"
  return cell === "cracked" ? "cracked" : String(cell)
}

function landingRow(state: TilechainState, col: number): number {
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (state.board[y]![col] === null) return y
  }
  return -1
}

export function view(
  ctx: ViewContext<TilechainState, TilechainInput>,
): GameView<TilechainState> {
  ensureStyle("arcade-game-tilechain", css)

  const wrap = el("div", "tc-wrap")
  wrap.tabIndex = 0
  wrap.setAttribute("role", "application")
  wrap.setAttribute("aria-roledescription", "tile chain board")
  wrap.setAttribute(
    "aria-label",
    "Tile Chain Drop. The current tile falls into the selected column. A numbered tile clears when its number equals the size of its horizontal or vertical run of numbered tiles. Cracked tiles break runs and are removed only beside a clearing tile. Left and right select a column; space or enter drops the tile; the number keys 1 through 7 drop into that column.",
  )

  const bar = el("div", "tc-bar")
  const modeStat = el("span", "tc-stat is-accent")
  const dropsStat = el("span", "tc-stat")
  const clearsStat = el("span", "tc-stat")
  const chainStat = el("span", "tc-stat is-warn")
  const pointsStat = el("span", "tc-stat")
  bar.append(modeStat, dropsStat, clearsStat, chainStat, pointsStat)

  const preview = el("div", "tc-preview")
  const currentWrap = el("div", "tc-next")
  const currentMini = el("span", "tc-mini is-current")
  currentWrap.append(el("span", "", "Now"), currentMini)
  const nextWrap = el("div", "tc-next")
  const nextMini = el("span", "tc-mini")
  nextWrap.append(el("span", "", "Next"), nextMini)
  preview.append(currentWrap, nextWrap)

  const board = el("div", "tc-board")
  board.setAttribute("role", "grid")
  board.setAttribute("aria-label", "Seven by seven tile board")

  const cells: Array<{ button: HTMLButtonElement; glyph: HTMLElement }> = []

  const paint = (state: TilechainState): void => {
    const endless = state.modeId === "endless"
    modeStat.textContent = endless ? "Endless" : "Skirmish"
    dropsStat.textContent = endless
      ? `Depth ${state.depth}`
      : `Drops ${state.dropsUsed}/${SKIRMISH_MAX_DROPS}`
    clearsStat.textContent = endless
      ? `Clears ${state.clearedTiles}`
      : `Clears ${state.clearedTiles}/${SKIRMISH_TARGET_CLEARS}`
    chainStat.textContent = `Chain ×${state.maxChain}`
    pointsStat.textContent = `Chain pts ${state.chainPoints}`

    currentMini.textContent = tileText(state.currentTile)
    currentMini.className = `tc-mini is-current ${tileClass(state.currentTile)}`
    nextMini.textContent = tileText(state.nextTile)
    nextMini.className = `tc-mini ${tileClass(state.nextTile)}`

    const landing = state.phase === "playing" ? landingRow(state, cursor) : -1
    const dropPreview = state.phase === "playing" ? previewDrop(state, cursor) : null
    const willClear = new Set((dropPreview?.clears ?? []).map((point) => `${point.x},${point.y}`))
    const willBreak = new Set((dropPreview?.cracked ?? []).map((point) => `${point.x},${point.y}`))

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const index = y * COLS + x
        const item = cells[index]!
        const cell = state.board[y]![x]!
        const isCursor = x === cursor
        const isLanding = x === cursor && y === landing

        const key = `${x},${y}`
        const clearsHere = willClear.has(key)
        const breaksHere = willBreak.has(key)

        item.button.className = "tc-cell"
        if (isCursor) item.button.classList.add("is-cursor")
        if (isLanding) item.button.classList.add("is-landing")
        if (clearsHere) item.button.classList.add("is-would-clear")
        if (breaksHere) item.button.classList.add("is-would-break")
        if (cell !== null) item.button.classList.add(...tileClass(cell).split(" "))
        item.button.disabled = state.phase !== "playing"
        item.glyph.textContent = cell === null ? (isLanding ? "" : "·") : tileText(cell)
        item.button.setAttribute(
          "aria-label",
          `Column ${x + 1}, row ${y + 1}: ${cellLabel(cell)}${
            isCursor ? ", selected column" : ""
          }${clearsHere ? ", would clear" : ""}${breaksHere ? ", would break" : ""}${
            state.phase === "playing" ? ", click to drop here" : ""
          }`,
        )
        if (isLanding) item.button.setAttribute("aria-current", "true")
        else item.button.removeAttribute("aria-current")
      }
    }

    // The guide stays open until the first drop, then gets out of the way.
    if (state.dropsUsed > 0 && !helpDismissed) {
      helpDismissed = true
      setHelp(false)
    }

    const playing = state.phase === "playing"
    prevBtn.disabled = !playing
    nextBtn.disabled = !playing
    dropBtn.disabled = !playing

    if (state.phase === "won") {
      hint.textContent = `Cleared ${state.clearedTiles} tiles in ${state.dropsUsed} drops. Skirmish won.`
    } else if (state.phase === "lost") {
      hint.textContent = endless
        ? `The stack overflowed at depth ${state.depth}. Chain points ${state.chainPoints}.`
        : `No room left after ${state.dropsUsed} drops. ${state.clearedTiles}/${SKIRMISH_TARGET_CLEARS} tiles cleared.`
    } else {
      const clears = dropPreview?.clears.length ?? 0
      const broke = dropPreview?.cracked.length ?? 0
      const rule = "A tile clears when its number equals the tiles in its row or column run."
      hint.textContent =
        clears > 0
          ? `Dropping ${tileText(state.currentTile)} in column ${cursor + 1} clears ${clears} tile${
              clears === 1 ? "" : "s"
            }${broke > 0 ? ` and breaks ${broke} cracked` : ""}. ${rule}`
          : `Nothing clears in column ${cursor + 1} yet — try a column where the number matches the run. ${rule}`
    }

    if (state.dropsUsed !== lastDrops || state.phase !== lastPhase) {
      if (state.phase === "won") live.textContent = `Won after ${state.dropsUsed} drops.`
      else if (state.phase === "lost") live.textContent = "Game over."
      else if (state.chainPoints > lastPoints) {
        live.textContent = `Chain cleared ${state.clearedTiles} tiles total for ${state.chainPoints} points.`
      }
      lastDrops = state.dropsUsed
      lastPhase = state.phase
      lastPoints = state.chainPoints
    }
  }

  let cursor = 3
  let helpDismissed = false
  let lastDrops = 0
  let lastPhase = "playing"
  let lastPoints = 0

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const button = el("button", "tc-cell")
      button.type = "button"
      button.tabIndex = -1
      button.setAttribute("role", "gridcell")
      const glyph = el("span", "tc-glyph")
      button.append(glyph)
      button.addEventListener("pointerenter", () => {
        if (ctx.state().phase !== "playing") return
        cursor = x
        paint(ctx.state())
      })
      button.addEventListener("click", () => {
        const state = ctx.state()
        if (state.phase !== "playing") return
        cursor = x
        ctx.dispatch({ type: "drop", col: x })
      })
      board.append(button)
      cells.push({ button, glyph })
    }
  }

  const controls = el("div", "tc-controls")
  const prevBtn = el("button", "tc-btn", "◀ Column")
  const nextBtn = el("button", "tc-btn", "Column ▶")
  const dropBtn = el("button", "tc-btn is-primary", "Drop")
  for (const button of [prevBtn, nextBtn, dropBtn]) {
    button.type = "button"
    button.dataset.tcControl = "true"
  }
  prevBtn.setAttribute("aria-label", "Select the previous column")
  nextBtn.setAttribute("aria-label", "Select the next column")
  dropBtn.setAttribute("aria-label", "Drop the current tile into the selected column")
  controls.append(prevBtn, nextBtn, dropBtn)

  const helpBtn = el("button", "tc-btn", "How to play")
  helpBtn.type = "button"
  helpBtn.dataset.tcControl = "true"
  helpBtn.setAttribute("aria-expanded", "true")
  controls.append(helpBtn)

  const help = el("div", "tc-help")
  help.append(
    el("h3", "", "How to play"),
    (() => {
      const list = el("ul", "")
      for (const line of [
        "One tile at a time — pick a column and the tile drops to the bottom of that stack. Nothing falls or rotates, so this is not Tetris.",
        "A tile clears when its number equals how many numbered tiles sit in its unbroken row or column run. A 4 needs a run of four.",
        "Clears cascade: tiles fall, runs re-form, and later waves score more (wave squared).",
        "Cracked tiles never count toward a run and only break when they sit next to a clearing tile.",
        "Skirmish: clear 25 tiles within 35 drops. Endless: a cracked row rises every 10 drops.",
        "The outlined tiles are what your current column would clear if you dropped now.",
      ])
        list.append(el("li", "", line))
      return list
    })(),
  )

  const hint = el("p", "tc-hint")
  const setHelp = (open: boolean): void => {
    help.hidden = !open
    helpBtn.textContent = open ? "Hide guide" : "How to play"
    helpBtn.setAttribute("aria-expanded", open ? "true" : "false")
  }
  setHelp(true)
  helpBtn.addEventListener("click", () => {
    const open = help.hasAttribute("hidden")
    if (!open) helpDismissed = true
    setHelp(open)
  })

  const live = el("div", "tc-sr")
  live.setAttribute("aria-live", "polite")
  live.setAttribute("aria-atomic", "true")

  wrap.append(bar, preview, board, controls, help, hint, live)
  ctx.container.append(wrap)

  const move = (delta: number): void => {
    if (ctx.state().phase !== "playing") return
    cursor = ((cursor + delta) % COLS + COLS) % COLS
    paint(ctx.state())
  }

  const dropAt = (col: number): void => {
    if (ctx.state().phase !== "playing") return
    cursor = col
    ctx.dispatch({ type: "drop", col })
  }

  prevBtn.addEventListener("click", () => move(-1))
  nextBtn.addEventListener("click", () => move(1))
  dropBtn.addEventListener("click", () => dropAt(cursor))
  for (const button of [prevBtn, nextBtn, dropBtn]) {
    button.addEventListener("pointerup", () => wrap.focus())
  }

  const isControl = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && target.closest("[data-tc-control]") !== null

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const key = event.key
    const digit = key.length === 1 && /^[1-7]$/.test(key)
    const handled =
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "a" ||
      key === "A" ||
      key === "d" ||
      key === "D" ||
      key === " " ||
      key === "Enter" ||
      key === "h" ||
      key === "H" ||
      digit

    if (!handled) return
    // Enter on a focused control is that button's own activation.
    if (key === "Enter" && isControl(event.target)) return

    // Claim a held key so it never scrolls the shell, but never repeat a drop.
    event.preventDefault()
    if (event.repeat) return

    if (key === "h" || key === "H") {
      const open = help.hasAttribute("hidden")
      if (!open) helpDismissed = true
      setHelp(open)
      return
    }

    if (ctx.state().phase !== "playing") return

    if (key === "ArrowLeft" || key === "a" || key === "A") {
      move(-1)
      return
    }
    if (key === "ArrowRight" || key === "d" || key === "D") {
      move(1)
      return
    }
    if (key === " " || key === "Enter") {
      dropAt(cursor)
      return
    }
    if (digit) dropAt(Number(key) - 1)
  }

  wrap.addEventListener("pointerdown", (event) => {
    if (isControl(event.target)) return
    wrap.focus()
  })
  ctx.container.addEventListener("keydown", onKeyDown)

  return {
    render(state) {
      paint(state)
    },
    destroy() {
      ctx.container.removeEventListener("keydown", onKeyDown)
      wrap.remove()
    },
  }
}
