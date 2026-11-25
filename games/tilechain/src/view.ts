import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import {
  COLS,
  ENDLESS_DROPS_PER_DEPTH,
  ROWS,
  SKIRMISH_MAX_DROPS,
  SKIRMISH_TARGET_CLEARS,
  type CascadeWave,
  type Cell,
  type Tile,
  type TilechainInput,
  type TilechainState,
  previewDrop,
  traceDrop,
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

.tc-goal {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--game-accent, #38bdf8) 32%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--game-accent, #38bdf8) 6%, transparent);
}

.tc-goal.is-warn {
  border-color: color-mix(in srgb, var(--game-accent-2, #f59e0b) 48%, transparent);
  background: color-mix(in srgb, var(--game-accent-2, #f59e0b) 7%, transparent);
}

.tc-goal-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.tc-goal-target {
  font-weight: 700;
  color: var(--arcade-fg, #e8eef5);
}

.tc-goal-left {
  font-weight: 600;
  color: var(--game-accent, #38bdf8);
}

.tc-goal.is-warn .tc-goal-left {
  color: var(--game-accent-2, #f59e0b);
}

.tc-goal-track {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 12%, transparent);
  overflow: hidden;
}

.tc-goal-fill {
  height: 100%;
  width: 0%;
  border-radius: 999px;
  background: var(--game-accent, #38bdf8);
  transition: width 180ms ease-out;
}

.tc-goal.is-warn .tc-goal-fill {
  background: var(--game-accent-2, #f59e0b);
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
  box-shadow: inset 0 0 0 2px var(--game-accent-2, #f59e0b);
}

@keyframes tc-land {
  0% {
    transform: translateY(-7px) scale(1.06);
    box-shadow: 0 0 0 2px var(--game-accent, #38bdf8);
  }
  100% {
    transform: translateY(0) scale(1);
    box-shadow: none;
  }
}

@keyframes tc-pop {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 2px var(--game-accent, #38bdf8);
  }
  35% {
    transform: scale(1.13);
    background: color-mix(in srgb, var(--game-accent, #38bdf8) 38%, transparent);
    border-color: var(--game-accent, #38bdf8);
    box-shadow: 0 0 14px color-mix(in srgb, var(--game-accent, #38bdf8) 70%, transparent);
    opacity: 1;
  }
  100% {
    transform: scale(0.62);
    background: color-mix(in srgb, var(--game-accent, #38bdf8) 20%, transparent);
    border-color: var(--game-accent, #38bdf8);
    opacity: 0.14;
  }
}

@keyframes tc-shatter {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 2px var(--game-accent-2, #f59e0b);
  }
  35% {
    transform: scale(1.1) rotate(-4deg);
    background: color-mix(in srgb, var(--game-accent-2, #f59e0b) 36%, transparent);
    border-color: var(--game-accent-2, #f59e0b);
    box-shadow: 0 0 12px color-mix(in srgb, var(--game-accent-2, #f59e0b) 65%, transparent);
    opacity: 1;
  }
  100% {
    transform: scale(0.6) rotate(6deg);
    opacity: 0.14;
  }
}

.tc-cell.is-landed {
  animation: tc-land 190ms ease-out;
}

.tc-cell.is-popping {
  z-index: 1;
  animation: tc-pop 260ms ease-out forwards;
}

.tc-cell.is-breaking {
  z-index: 1;
  animation: tc-shatter 260ms ease-out forwards;
}

.tc-help {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--game-accent, #38bdf8) 35%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--game-accent, #38bdf8) 8%, transparent);
  color: var(--arcade-fg, #e8eef5);
  font-size: 12px;
  line-height: 1.5;
}

.tc-help[hidden] {
  display: none;
}

.tc-help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.tc-help h3 {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--game-accent, #38bdf8);
}

.tc-help-legend {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--arcade-muted, #8b98a9);
}

.tc-help-swatch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tc-help-swatch::before {
  content: "";
  width: 9px;
  height: 9px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 2px var(--game-accent, #38bdf8);
}

.tc-help-swatch.is-break::before {
  box-shadow: inset 0 0 0 2px var(--game-accent-2, #f59e0b);
}

.tc-help ul {
  margin: 0;
  padding-left: 16px;
}

.tc-help li {
  margin: 0 0 5px;
}

.tc-help li:last-child {
  margin-bottom: 0;
}

.tc-help strong {
  color: var(--arcade-fg, #e8eef5);
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
  .tc-btn,
  .tc-goal-fill {
    transition: none;
  }
  .tc-cell.is-landed,
  .tc-cell.is-popping,
  .tc-cell.is-breaking {
    animation: none;
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
  const chainStat = el("span", "tc-stat is-warn")
  const pointsStat = el("span", "tc-stat")
  bar.append(modeStat, chainStat, pointsStat)

  const goalBox = el("div", "tc-goal")
  const goalRow = el("div", "tc-goal-row")
  const goalTarget = el("span", "tc-goal-target")
  const goalLeft = el("span", "tc-goal-left")
  goalRow.append(goalTarget, goalLeft)
  const goalTrack = el("div", "tc-goal-track")
  const goalFill = el("div", "tc-goal-fill")
  goalTrack.append(goalFill)
  goalBox.append(goalRow, goalTrack)

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

  interface BoardVisual {
    readonly board: readonly (readonly Cell[])[]
    readonly popping: ReadonlySet<string>
    readonly breaking: ReadonlySet<string>
    readonly landedKey: string | null
  }

  const prefersReducedMotion = (): boolean =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const cancelAnim = (): void => {
    if (animTimer !== null) {
      clearTimeout(animTimer)
      animTimer = null
    }
    animVisual = null
    landedHighlight = null
  }

  const renderCells = (state: TilechainState, visual: BoardVisual | null): void => {
    const activeBoard = visual ? visual.board : state.board
    const showPreview = visual === null && state.phase === "playing"
    const landing = showPreview ? landingRow(state, cursor) : -1
    const dropPreview = showPreview ? previewDrop(state, cursor) : null
    const willClear = new Set((dropPreview?.clears ?? []).map((point) => `${point.x},${point.y}`))
    const willBreak = new Set((dropPreview?.cracked ?? []).map((point) => `${point.x},${point.y}`))
    const landedKey = visual ? visual.landedKey : landedHighlight

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const index = y * COLS + x
        const item = cells[index]!
        const cell = activeBoard[y]![x]!
        const isCursor = showPreview && x === cursor
        const isLanding = showPreview && x === cursor && y === landing

        const key = `${x},${y}`
        const clearsHere = willClear.has(key)
        const breaksHere = willBreak.has(key)
        const isPopping = visual?.popping.has(key) ?? false
        const isBreaking = visual?.breaking.has(key) ?? false
        const isLanded = landedKey === key && !isPopping && !isBreaking

        item.button.className = "tc-cell"
        if (isCursor) item.button.classList.add("is-cursor")
        if (isLanding) item.button.classList.add("is-landing")
        if (clearsHere) item.button.classList.add("is-would-clear")
        if (breaksHere) item.button.classList.add("is-would-break")
        if (isLanded) item.button.classList.add("is-landed")
        if (isPopping) item.button.classList.add("is-popping")
        if (isBreaking) item.button.classList.add("is-breaking")
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
  }

  const playWave = (
    waves: readonly CascadeWave[],
    landedKey: string,
    finalState: TilechainState,
    waveIndex: number,
  ): void => {
    const wave = waves[waveIndex]
    if (!wave) {
      animTimer = null
      animVisual = null
      renderCells(finalState, null)
      return
    }

    animVisual = {
      board: wave.board,
      popping: new Set(wave.clears.map((point) => `${point.x},${point.y}`)),
      breaking: new Set(wave.cracked.map((point) => `${point.x},${point.y}`)),
      landedKey: waveIndex === 0 ? landedKey : null,
    }
    renderCells(finalState, animVisual)
    animTimer = window.setTimeout(() => {
      playWave(waves, landedKey, finalState, waveIndex + 1)
    }, 260)
  }

  const paint = (state: TilechainState): void => {
    const endless = state.modeId === "endless"
    modeStat.textContent = endless ? `Endless · Depth ${state.depth}` : "Skirmish"
    chainStat.textContent = `Chain ×${state.maxChain}`
    pointsStat.textContent = `Pts ${state.chainPoints}`

    if (endless) {
      const intoCycle = state.dropsUsed % ENDLESS_DROPS_PER_DEPTH
      const untilPush = ENDLESS_DROPS_PER_DEPTH - intoCycle
      const pct = Math.round((intoCycle / ENDLESS_DROPS_PER_DEPTH) * 100)
      goalTarget.textContent = `Clears ${state.clearedTiles}`
      goalLeft.textContent =
        untilPush === 1 ? "Cracked row next drop" : `Next cracked row in ${untilPush} drops`
      goalFill.style.width = `${pct}%`
      goalBox.classList.toggle("is-warn", untilPush <= 2)
    } else {
      const dropsLeft = Math.max(0, SKIRMISH_MAX_DROPS - state.dropsUsed)
      const clearsLeft = Math.max(0, SKIRMISH_TARGET_CLEARS - state.clearedTiles)
      const pct = Math.min(100, Math.round((state.clearedTiles / SKIRMISH_TARGET_CLEARS) * 100))
      goalTarget.textContent =
        state.phase === "won"
          ? `Goal met: ${state.clearedTiles}/${SKIRMISH_TARGET_CLEARS} clears`
          : `Goal: ${state.clearedTiles}/${SKIRMISH_TARGET_CLEARS} clears (${clearsLeft} left)`
      goalLeft.textContent = `${dropsLeft} drop${dropsLeft === 1 ? "" : "s"} left`
      goalFill.style.width = `${pct}%`
      goalBox.classList.toggle("is-warn", state.phase === "playing" && dropsLeft <= 10 && clearsLeft > 0)
    }

    currentMini.textContent = tileText(state.currentTile)
    currentMini.className = `tc-mini is-current ${tileClass(state.currentTile)}`
    nextMini.textContent = tileText(state.nextTile)
    nextMini.className = `tc-mini ${tileClass(state.nextTile)}`

    // Auto-collapse the guide after the first drop and remember it for future runs.
    if (state.dropsUsed > 0 && !helpDismissed) {
      helpDismissed = true
      setHelp(false, true)
    }

    const playing = state.phase === "playing"
    prevBtn.disabled = !playing
    nextBtn.disabled = !playing
    dropBtn.disabled = !playing

    const dropHappened = state.dropsUsed > lastDrops
    const dClears = state.clearedTiles - lastCleared
    const dCracked = state.crackedCleared - lastCracked
    const dPoints = state.chainPoints - lastPoints

    if (dropHappened) {
      if (dClears > 0) {
        lastOutcome = `Cleared ${dClears} tile${dClears === 1 ? "" : "s"}${
          dCracked > 0 ? ` (${dCracked} ✕)` : ""
        } for +${dPoints} pts.`
      } else {
        lastOutcome = ""
      }

      if (state.phase === "won") ctx.host.audio.play("win")
      else if (state.phase === "lost") ctx.host.audio.play("lose")
      else if (dClears > 0) ctx.host.audio.play("reveal")
      else ctx.host.audio.play("turn")
    } else if (state.phase !== lastPhase) {
      if (state.phase === "won") ctx.host.audio.play("win")
      else if (state.phase === "lost") ctx.host.audio.play("lose")
    }

    const landing = state.phase === "playing" ? landingRow(state, cursor) : -1
    const dropPreview = state.phase === "playing" ? previewDrop(state, cursor) : null

    if (state.phase === "won") {
      const left = Math.max(0, SKIRMISH_MAX_DROPS - state.dropsUsed)
      hint.textContent = `Goal reached! Cleared ${state.clearedTiles} tiles with ${left} drop${
        left === 1 ? "" : "s"
      } to spare.`
    } else if (state.phase === "lost") {
      hint.textContent = endless
        ? `The stack overflowed at depth ${state.depth}. Chain points ${state.chainPoints}.`
        : state.dropsUsed >= SKIRMISH_MAX_DROPS
          ? `Out of drops — cleared ${state.clearedTiles}/${SKIRMISH_TARGET_CLEARS} tiles (${state.chainPoints} pts).`
          : `Board filled up after ${state.dropsUsed} drops — ${state.clearedTiles}/${SKIRMISH_TARGET_CLEARS} tiles cleared (${state.chainPoints} pts).`
    } else if (landing < 0) {
      hint.textContent = `${lastOutcome ? `${lastOutcome} ` : ""}Column ${cursor + 1} is full — pick another column.`
    } else {
      const clears = dropPreview?.clears.length ?? 0
      const broke = dropPreview?.cracked.length ?? 0
      const previewText =
        clears > 0
          ? `Col ${cursor + 1}: ${tileText(state.currentTile)} pops ${clears} tile${
              clears === 1 ? "" : "s"
            }${broke > 0 ? ` + ${broke} cracked` : ""}.`
          : `Col ${cursor + 1}: no immediate pop — match a tile's number to its row or column length.`
      hint.textContent = lastOutcome ? `${lastOutcome} ${previewText}` : previewText
    }

    if (dropHappened || state.phase !== lastPhase) {
      if (state.phase === "won") live.textContent = `Won after ${state.dropsUsed} drops.`
      else if (state.phase === "lost") live.textContent = "Game over."
      else if (dPoints > 0) {
        live.textContent = `Chain cleared ${state.clearedTiles} tiles total for ${state.chainPoints} points.`
      }
    }

    const dropCol = pendingDropCol
    pendingDropCol = null
    if (dropHappened && prevState !== null && dropCol !== null && !prefersReducedMotion()) {
      const trace = traceDrop(prevState, dropCol)
      cancelAnim()
      if (trace && trace.waves.length > 0) {
        playWave(trace.waves, `${dropCol},${trace.landing}`, state, 0)
      } else if (trace) {
        landedHighlight = `${dropCol},${trace.landing}`
        renderCells(state, null)
        animTimer = window.setTimeout(() => {
          animTimer = null
          landedHighlight = null
          renderCells(ctx.state(), null)
        }, 200)
      } else {
        renderCells(state, null)
      }
    } else if (animVisual === null) {
      renderCells(state, null)
    }

    prevState = state
    lastDrops = state.dropsUsed
    lastCleared = state.clearedTiles
    lastCracked = state.crackedCleared
    lastPhase = state.phase
    lastPoints = state.chainPoints
  }

  const guideKey = "tilechain.guideSeen"
  let cursor = 3
  let helpDismissed = ctx.host.storage.get<boolean>(guideKey) === true
  let prevState: TilechainState | null = null
  let pendingDropCol: number | null = null
  let animTimer: number | null = null
  let animVisual: BoardVisual | null = null
  let landedHighlight: string | null = null
  let lastDrops = 0
  let lastCleared = 0
  let lastCracked = 0
  let lastPhase = "playing"
  let lastPoints = 0
  let lastOutcome = ""

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
        if (cursor !== x) {
          lastOutcome = ""
          cancelAnim()
        }
        cursor = x
        paint(ctx.state())
      })
      button.addEventListener("click", () => {
        dropAt(x)
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
  const helpHead = el("div", "tc-help-head")
  const helpLegend = el("div", "tc-help-legend")
  helpLegend.append(
    el("span", "tc-help-swatch", "Will pop"),
    el("span", "tc-help-swatch is-break", "Will break"),
  )
  helpHead.append(el("h3", "", "How to play"), helpLegend)

  const helpRule = (label: string, body: string): HTMLLIElement => {
    const li = document.createElement("li")
    li.append(el("strong", "", `${label}: `), body)
    return li
  }

  const helpList = el("ul", "")
  helpList.append(
    helpRule(
      "Goal",
      `In Skirmish, clear ${SKIRMISH_TARGET_CLEARS} tiles within ${SKIRMISH_MAX_DROPS} drops before the board fills up. In Endless, survive rising cracked rows every ${ENDLESS_DROPS_PER_DEPTH} drops for the highest chain score.`,
    ),
    helpRule(
      "How tiles pop",
      "A tile pops when its number equals how many numbered tiles sit in its unbroken row or column (other tiles in the line don't have to match it). Extending a line updates every tile in it — dropping a 6 next to 3 · 5 makes a 3-tile row and pops the 3. A 1 only stays if tucked both on top of and beside another number.",
    ),
    helpRule(
      "What to look for",
      "Move across columns to preview your drop — highlighted tiles will pop or break right away. Popping lower tiles makes tiles above fall into new lines, setting off 2×, 3×… chain waves (wave² × tiles bonus points).",
    ),
    helpRule(
      "Cracked tiles (✕)",
      "They block and split lines (never counted toward line length) and shatter only when a numbered tile pops right beside them.",
    ),
  )
  help.append(helpHead, helpList)

  const hint = el("p", "tc-hint")
  const setHelp = (open: boolean, remember = false): void => {
    help.hidden = !open
    helpBtn.textContent = open ? "Hide guide" : "How to play"
    helpBtn.setAttribute("aria-expanded", open ? "true" : "false")
    if (!open && remember) ctx.host.storage.set(guideKey, true)
  }
  setHelp(!helpDismissed)
  helpBtn.addEventListener("click", () => {
    const open = help.hasAttribute("hidden")
    if (!open) helpDismissed = true
    setHelp(open, true)
  })

  const live = el("div", "tc-sr")
  live.setAttribute("aria-live", "polite")
  live.setAttribute("aria-atomic", "true")

  wrap.append(bar, goalBox, preview, board, controls, help, hint, live)
  ctx.container.append(wrap)

  const move = (delta: number): void => {
    if (ctx.state().phase !== "playing") return
    lastOutcome = ""
    cancelAnim()
    cursor = ((cursor + delta) % COLS + COLS) % COLS
    paint(ctx.state())
  }

  const dropAt = (col: number): void => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    cancelAnim()
    cursor = col
    if (landingRow(state, col) >= 0) pendingDropCol = col
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
      setHelp(open, true)
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
      cancelAnim()
      ctx.container.removeEventListener("keydown", onKeyDown)
      wrap.remove()
    },
  }
}
