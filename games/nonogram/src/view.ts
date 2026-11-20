import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import {
  MARK_CROSSED,
  MARK_EMPTY,
  MARK_FILLED,
  MAX_CHECKS,
  type NonogramInput,
  type NonogramMark,
  type NonogramState,
} from "./core"

const NOTE_A = 1
const NOTE_B = 2
const NOTE_BOTH = NOTE_A | NOTE_B

type Tool = "fill" | "cross" | "noteA" | "noteB"

const css = `
.ng-wrap {
  --ng-cell: clamp(28px, 11cqi, 44px);
  --ng-line: var(--arcade-line, rgba(148, 163, 184, 0.24));
  --ng-line-strong: var(--arcade-line-strong, rgba(148, 163, 184, 0.42));
  --ng-line-major: color-mix(in srgb, var(--arcade-fg, #e8eef5) 44%, transparent);
  --ng-cell-bg: color-mix(in srgb, var(--arcade-fg, #e8eef5) 5%, transparent);
  --ng-cross-bg: color-mix(in srgb, var(--arcade-fg, #e8eef5) 3%, transparent);
  --ng-filled-seam: color-mix(in srgb, var(--arcade-panel, #0b1118) 58%, transparent);
  --ng-clue-fg: color-mix(in srgb, var(--arcade-fg, #e8eef5) 76%, var(--arcade-muted, #8f9bac));
  --ng-note-a: #38bdf8;
  --ng-note-b: #fbbf24;
  --ng-note-both: #c084fc;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 10px;
  border: 1px solid var(--ng-line);
  border-radius: 8px;
  background: var(--arcade-panel, #0b1118);
  outline: none;
  user-select: none;
  touch-action: manipulation;
}

.arcade[data-theme="light"] .ng-wrap {
  --ng-line: rgba(38, 42, 48, 0.2);
  --ng-line-strong: rgba(38, 42, 48, 0.42);
  --ng-line-major: rgba(27, 31, 36, 0.56);
  --ng-cell-bg: var(--arcade-elevated, #fffdf7);
  --ng-cross-bg: #f3eee3;
  --ng-filled-seam: rgba(251, 248, 239, 0.55);
  --ng-clue-fg: #333b45;
  --ng-note-a: #0369a1;
  --ng-note-b: #b45309;
  --ng-note-both: #7c3aed;
}

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] .ng-wrap {
    --ng-line: rgba(38, 42, 48, 0.2);
    --ng-line-strong: rgba(38, 42, 48, 0.42);
    --ng-line-major: rgba(27, 31, 36, 0.56);
    --ng-cell-bg: var(--arcade-elevated, #fffdf7);
    --ng-cross-bg: #f3eee3;
    --ng-filled-seam: rgba(251, 248, 239, 0.55);
    --ng-clue-fg: #333b45;
    --ng-note-a: #0369a1;
    --ng-note-b: #b45309;
    --ng-note-both: #7c3aed;
  }
}

.ng-wrap:focus-visible {
  outline: 2px solid var(--game-accent, #f472b6);
  outline-offset: 2px;
}

.ng-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--arcade-muted, #8f9bac);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.ng-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--ng-line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 5%, transparent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ng-stat.is-accent {
  color: var(--game-accent, #f472b6);
  border-color: color-mix(in srgb, var(--game-accent, #f472b6) 40%, transparent);
}

.ng-stat.is-status {
  color: var(--arcade-fg, #e8eef5);
}

.ng-board {
  display: grid;
  grid-template-columns: max-content auto;
  grid-template-rows: auto auto;
  justify-content: center;
  justify-content: safe center;
  align-items: end;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
  overscroll-behavior-x: contain;
}

.ng-corner {
  grid-area: 1 / 1;
}

.ng-col-clues {
  grid-area: 1 / 2;
  display: flex;
  align-items: flex-end;
  min-width: 0;
}

.ng-col-clue {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 1px;
  width: var(--ng-cell);
  padding: 3px 0 4px;
  border-radius: 4px 4px 0 0;
  color: var(--ng-clue-fg);
  font-size: clamp(9.5px, 2.7cqi, 11.5px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  transition: color 90ms ease, opacity 90ms ease, background 90ms ease;
}

.ng-row-clues {
  grid-area: 2 / 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.ng-row-clue {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: var(--ng-cell);
  min-width: 2.2em;
  padding: 0 7px 0 4px;
  border-radius: 4px 0 0 4px;
  color: var(--ng-clue-fg);
  font-size: clamp(9.5px, 2.7cqi, 11.5px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
  transition: color 90ms ease, opacity 90ms ease, background 90ms ease;
}

.ng-col-clue.is-active-line,
.ng-row-clue.is-active-line {
  color: var(--arcade-fg, #e8eef5);
  background: color-mix(in srgb, var(--game-accent, #f472b6) 11%, transparent);
}

.ng-col-clue.is-satisfied,
.ng-row-clue.is-satisfied {
  opacity: 0.4;
}

.ng-grid {
  grid-area: 2 / 2;
  display: grid;
  grid-template-columns: repeat(var(--ng-w, 6), var(--ng-cell));
  grid-template-rows: repeat(var(--ng-h, 6), var(--ng-cell));
  border-top: 1px solid var(--ng-line-strong);
  border-left: 1px solid var(--ng-line-strong);
  touch-action: none;
}

.ng-cell {
  --ng-major-x: 0 0 0 0 transparent;
  --ng-major-y: 0 0 0 0 transparent;
  --ng-ring: 0 0 0 0 transparent;
  position: relative;
  appearance: none;
  display: grid;
  place-items: center;
  width: var(--ng-cell);
  height: var(--ng-cell);
  margin: 0;
  padding: 0;
  border: 0;
  border-right: 1px solid var(--ng-line);
  border-bottom: 1px solid var(--ng-line);
  border-radius: 0;
  box-shadow: var(--ng-ring), var(--ng-major-x), var(--ng-major-y);
  background: var(--ng-cell-bg);
  color: var(--arcade-muted, #8f9bac);
  font: inherit;
  font-size: calc(var(--ng-cell) * 0.58);
  line-height: 1;
  cursor: pointer;
  transition: background 80ms ease;
}

.ng-cell.is-major-left {
  --ng-major-x: inset 2px 0 0 var(--ng-line-major);
}

.ng-cell.is-major-top {
  --ng-major-y: inset 0 2px 0 var(--ng-line-major);
}

.ng-cell.is-active-line {
  background: color-mix(in srgb, var(--game-accent, #f472b6) 7%, var(--ng-cell-bg));
}

.ng-cell.is-note-a {
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--ng-note-a) 26%, var(--ng-cell-bg)) 0 4px,
    color-mix(in srgb, var(--ng-note-a) 8%, var(--ng-cell-bg)) 4px 8px
  );
}

.ng-cell.is-note-b {
  background: repeating-linear-gradient(
    45deg,
    color-mix(in srgb, var(--ng-note-b) 26%, var(--ng-cell-bg)) 0 4px,
    color-mix(in srgb, var(--ng-note-b) 8%, var(--ng-cell-bg)) 4px 8px
  );
}

.ng-cell.is-note-a.is-note-b {
  background:
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--ng-note-a) 28%, transparent) 0 4px,
      transparent 4px 8px
    ),
    repeating-linear-gradient(
      45deg,
      color-mix(in srgb, var(--ng-note-b) 28%, transparent) 0 4px,
      transparent 4px 8px
    ),
    color-mix(in srgb, var(--ng-note-both) 18%, var(--ng-cell-bg));
  color: var(--ng-note-both);
  font-size: calc(var(--ng-cell) * 0.44);
  font-weight: 700;
}

.ng-cell.is-note-a::before,
.ng-cell.is-note-b::after {
  content: "";
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 1px;
  pointer-events: none;
}

.ng-cell.is-note-a::before {
  top: 2px;
  left: 2px;
  background: var(--ng-note-a);
}

.ng-cell.is-note-b::after {
  right: 2px;
  bottom: 2px;
  background: var(--ng-note-b);
}

.ng-cell.is-filled {
  background: var(--game-accent, #f472b6);
  border-right-color: var(--ng-filled-seam);
  border-bottom-color: var(--ng-filled-seam);
}

button.ng-cell.is-filled:not(:disabled):hover {
  background: color-mix(in srgb, var(--game-accent, #f472b6) 84%, var(--arcade-fg, #e8eef5));
}

.ng-cell.is-crossed {
  background: var(--ng-cross-bg);
  color: var(--ng-clue-fg);
  font-weight: 600;
}

.ng-cell.is-wrong {
  background: color-mix(in srgb, var(--arcade-danger, #fb7185) 26%, var(--ng-cell-bg));
  color: var(--arcade-danger, #fb7185);
  font-size: calc(var(--ng-cell) * 0.52);
  font-weight: 700;
}

.ng-cell.is-missed {
  background: color-mix(in srgb, var(--game-accent, #f472b6) 14%, var(--ng-cell-bg));
  color: var(--game-accent, #f472b6);
  font-size: calc(var(--ng-cell) * 0.5);
  font-weight: 700;
}

.ng-cell.is-cursor {
  --ng-ring:
    inset 0 0 0 1px var(--arcade-panel, #0b1118),
    inset 0 0 0 3px var(--game-label-2, var(--game-accent-2, #38bdf8));
  z-index: 1;
}

button.ng-cell:focus-visible {
  outline: 2px solid var(--game-label-2, var(--game-accent-2, #38bdf8));
  outline-offset: -4px;
  --ng-ring: inset 0 0 0 2px var(--arcade-panel, #0b1118);
  z-index: 2;
}

button.ng-cell:disabled {
  cursor: default;
  opacity: 1;
}

.ng-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ng-row-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
}

.ng-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid var(--ng-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 6%, transparent);
  color: var(--arcade-fg, #e8eef5);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}

.ng-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--game-accent, #f472b6) 55%, transparent);
  background: color-mix(in srgb, var(--game-accent, #f472b6) 14%, transparent);
}

.ng-btn[aria-pressed="true"] {
  border-color: var(--game-accent, #f472b6);
  background: color-mix(in srgb, var(--game-accent, #f472b6) 18%, transparent);
  color: var(--arcade-fg, #e8eef5);
}

.ng-btn[data-tool="noteA"][aria-pressed="true"] {
  border-color: var(--ng-note-a);
  background: color-mix(in srgb, var(--ng-note-a) 18%, transparent);
}

.ng-btn[data-tool="noteB"][aria-pressed="true"] {
  border-color: var(--ng-note-b);
  background: color-mix(in srgb, var(--ng-note-b) 18%, transparent);
}

.ng-btn.is-promote:not(:disabled) {
  border-color: color-mix(in srgb, var(--ng-note-both) 65%, transparent);
  background: color-mix(in srgb, var(--ng-note-both) 16%, transparent);
  color: var(--ng-note-both);
}

.ng-btn.is-primary {
  border-color: color-mix(in srgb, var(--game-accent, #f472b6) 62%, transparent);
  color: var(--game-accent, #f472b6);
}

.ng-btn.is-confirm:not(:disabled) {
  border-color: color-mix(in srgb, var(--arcade-danger, #fb7185) 75%, transparent);
  background: color-mix(in srgb, var(--arcade-danger, #fb7185) 18%, transparent);
  color: var(--arcade-danger, #fb7185);
}

.ng-btn.is-confirm:hover:not(:disabled) {
  border-color: var(--arcade-danger, #fb7185);
  background: color-mix(in srgb, var(--arcade-danger, #fb7185) 26%, transparent);
}

.ng-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ng-btn:focus-visible {
  outline: 2px solid var(--game-accent, #f472b6);
  outline-offset: 2px;
}

.ng-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: none;
}

.ng-swatch.is-a {
  background: var(--ng-note-a);
}

.ng-swatch.is-b {
  background: var(--ng-note-b);
}

.ng-sr {
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
  .ng-cell,
  .ng-btn,
  .ng-col-clue,
  .ng-row-clue {
    transition: none;
  }
}
`

function markWord(mark: number, note: number): string {
  if (mark === MARK_FILLED) return "filled"
  if (mark === MARK_CROSSED) return "crossed"
  if (note === NOTE_BOTH) return "overlap (note 1 + note 2)"
  if (note === NOTE_A) return "note 1"
  if (note === NOTE_B) return "note 2"
  return "empty"
}

function clueLabel(kind: "Row" | "Column", index: number, clue: readonly number[]): string {
  return `${kind} ${index}: ${clue.length === 0 ? "empty" : clue.join(", ")}`
}

function lineRuns(marks: readonly number[]): number[] {
  const runs: number[] = []
  let run = 0
  for (const mark of marks) {
    if (mark === MARK_FILLED) {
      run += 1
    } else if (run > 0) {
      runs.push(run)
      run = 0
    }
  }
  if (run > 0) runs.push(run)
  return runs
}

function lineSatisfied(marks: readonly number[], clue: readonly number[]): boolean {
  if (clue.length === 0) {
    return marks.every((mark) => mark === MARK_CROSSED)
  }
  const runs = lineRuns(marks)
  return runs.length === clue.length && runs.every((value, index) => value === clue[index])
}

export function view(ctx: ViewContext<NonogramState, NonogramInput>): GameView<NonogramState> {
  ensureStyle("arcade-game-nonogram", css)

  const wrap = el("div", "ng-wrap")
  wrap.tabIndex = -1
  wrap.setAttribute("role", "application")
  wrap.setAttribute("aria-roledescription", "nonogram board")
  wrap.setAttribute(
    "aria-label",
    "Nonogram. Arrow keys move the cursor. Space toggles filled, X toggles crossed, 1 and 2 toggle overlap notes, P promotes overlaps, C clears notes, and Enter checks the board.",
  )

  const bar = el("div", "ng-bar")
  const sizeStat = el("span", "ng-stat")
  const checksStat = el("span", "ng-stat is-accent")
  const statusStat = el("span", "ng-stat is-status")
  bar.append(sizeStat, checksStat, statusStat)

  const board = el("div", "ng-board")
  const corner = el("div", "ng-corner")
  const colClues = el("div", "ng-col-clues")
  colClues.setAttribute("role", "list")
  colClues.setAttribute("aria-label", "Column clues")
  const rowClues = el("div", "ng-row-clues")
  rowClues.setAttribute("role", "list")
  rowClues.setAttribute("aria-label", "Row clues")
  const grid = el("div", "ng-grid")
  grid.setAttribute("role", "group")
  grid.setAttribute("aria-label", "Nonogram cells")
  board.append(corner, colClues, rowClues, grid)

  const controls = el("div", "ng-controls")
  const toolRow = el("div", "ng-row-bar")
  const actionRow = el("div", "ng-row-bar")

  const makeToolButton = (tool: Tool, label: string, swatchClass?: string): HTMLButtonElement => {
    const button = el("button", "ng-btn")
    button.type = "button"
    button.dataset.ngControl = "true"
    button.dataset.tool = tool
    if (swatchClass) {
      button.append(el("span", swatchClass))
    }
    button.append(document.createTextNode(label))
    return button
  }

  const fillBtn = makeToolButton("fill", "Fill")
  const crossBtn = makeToolButton("cross", "Cross ×")
  const noteABtn = makeToolButton("noteA", "Note 1", "ng-swatch is-a")
  const noteBBtn = makeToolButton("noteB", "Note 2", "ng-swatch is-b")
  const toolButtons: ReadonlyArray<{ readonly tool: Tool; readonly button: HTMLButtonElement }> = [
    { tool: "fill", button: fillBtn },
    { tool: "cross", button: crossBtn },
    { tool: "noteA", button: noteABtn },
    { tool: "noteB", button: noteBBtn },
  ]
  fillBtn.setAttribute("aria-label", "Fill tool")
  crossBtn.setAttribute("aria-label", "Cross tool")
  noteABtn.setAttribute("aria-label", "Overlap Note 1 tool")
  noteBBtn.setAttribute("aria-label", "Overlap Note 2 tool")
  fillBtn.title = "Fill or erase cells (Space · click/drag)"
  crossBtn.title = "Cross out empty cells (X · right-click/drag)"
  noteABtn.title = "Mark left-most run · overlaps with Note 2 become ◆ (1)"
  noteBBtn.title = "Mark right-most run · overlaps with Note 1 become ◆ (2)"
  toolRow.append(fillBtn, crossBtn, noteABtn, noteBBtn)

  const promoteBtn = el("button", "ng-btn", "Promote")
  const clearNotesBtn = el("button", "ng-btn", "Clear notes")
  const clearBoardBtn = el("button", "ng-btn", "Clear board")
  const checkBtn = el("button", "ng-btn is-primary", "Check")
  const actionButtons = [promoteBtn, clearNotesBtn, clearBoardBtn, checkBtn]
  for (const button of actionButtons) {
    button.type = "button"
    button.dataset.ngControl = "true"
  }
  promoteBtn.setAttribute("aria-label", "Promote overlapping notes to filled")
  clearNotesBtn.setAttribute("aria-label", "Clear all overlap notes")
  clearBoardBtn.setAttribute("aria-label", "Clear all filled and crossed marks on the board")
  checkBtn.setAttribute("aria-label", "Check the board")
  promoteBtn.title = "Fill all ◆ overlaps and clear notes (P)"
  clearNotesBtn.title = "Clear temporary Note 1 / Note 2 marks (C)"
  clearBoardBtn.title = "Erase all filled and crossed marks on this puzzle (keeps check count)"
  checkBtn.title = "Check if your filled cells match all clues (Enter)"
  actionRow.append(promoteBtn, clearNotesBtn, clearBoardBtn, checkBtn)
  controls.append(toolRow, actionRow)

  const allControlButtons = [
    fillBtn,
    crossBtn,
    noteABtn,
    noteBBtn,
    promoteBtn,
    clearNotesBtn,
    clearBoardBtn,
    checkBtn,
  ]

  const live = el("div", "ng-sr")
  live.setAttribute("aria-live", "polite")
  live.setAttribute("aria-atomic", "true")

  wrap.append(bar, board, controls, live)
  ctx.container.append(wrap)

  let builtWidth = 0
  let builtHeight = 0
  let cells: HTMLButtonElement[] = []
  let rowClueNodes: HTMLElement[] = []
  let colClueNodes: HTMLElement[] = []
  let cursor = 0
  let activeTool: Tool = "fill"
  let notes = new Uint8Array(0)
  let lastChecks = 0
  let lastPhase = "playing"

  let dragActive = false
  let dragTool: Tool = "fill"
  let dragPaintValue = true
  const dragVisited = new Set<number>()
  let dragPlayedAudio = false
  let confirmClearBoard = false
  let confirmClearTimer: ReturnType<typeof setTimeout> | undefined

  const endDrag = (): void => {
    dragActive = false
    dragVisited.clear()
    dragPlayedAudio = false
  }

  const disarmClearBoard = (rerender = true): void => {
    const wasArmed = confirmClearBoard
    if (confirmClearTimer !== undefined) {
      clearTimeout(confirmClearTimer)
      confirmClearTimer = undefined
    }
    confirmClearBoard = false
    if (rerender && wasArmed) render(ctx.state())
  }

  const armClearBoard = (): void => {
    if (confirmClearTimer !== undefined) clearTimeout(confirmClearTimer)
    confirmClearBoard = true
    confirmClearTimer = setTimeout(() => disarmClearBoard(true), 3000)
    live.textContent = "Press Clear board again to erase all marks."
    render(ctx.state())
  }

  const dispatchMark = (index: number, mark: NonogramMark): boolean => {
    const state = ctx.state()
    if (state.phase !== "playing") return false
    if (state.draft[index] === mark) return false
    const x = index % state.width
    const y = Math.floor(index / state.width)
    ctx.dispatch({ type: "set", x, y, mark })
    if (ctx.state().draft[index] !== mark) return false
    if (mark !== MARK_EMPTY) notes[index] = 0
    return true
  }

  const applyToolAt = (index: number, tool: Tool, paintOn: boolean): boolean => {
    const state = ctx.state()
    if (state.phase !== "playing") return false
    if (index < 0 || index >= state.width * state.height) return false

    if (tool === "fill") {
      const target: NonogramMark = paintOn ? MARK_FILLED : MARK_EMPTY
      if (dispatchMark(index, target)) {
        if (!dragPlayedAudio) {
          ctx.host.audio.play("click")
          dragPlayedAudio = true
        }
        return true
      }
      return false
    }

    if (tool === "cross") {
      const target: NonogramMark = paintOn ? MARK_CROSSED : MARK_EMPTY
      if (dispatchMark(index, target)) {
        if (!dragPlayedAudio) {
          ctx.host.audio.play("flag")
          dragPlayedAudio = true
        }
        return true
      }
      return false
    }

    if (state.draft[index] !== MARK_EMPTY) return false
    const bit = tool === "noteA" ? NOTE_A : NOTE_B
    const current = notes[index] ?? 0
    const next = paintOn ? current | bit : current & ~bit
    if (next === current) return false
    notes[index] = next
    if (!dragPlayedAudio) {
      ctx.host.audio.play("turn")
      dragPlayedAudio = true
    }
    return false
  }

  const paintOnFor = (index: number, tool: Tool, state: NonogramState): boolean => {
    if (tool === "fill") return state.draft[index] !== MARK_FILLED
    if (tool === "cross") return state.draft[index] !== MARK_CROSSED
    if (tool === "noteA") return ((notes[index] ?? 0) & NOTE_A) === 0
    return ((notes[index] ?? 0) & NOTE_B) === 0
  }

  const toggleCell = (index: number, tool: Tool): void => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    const paintOn = paintOnFor(index, tool, state)
    const dispatched = applyToolAt(index, tool, paintOn)
    if (!dispatched) render(ctx.state())
  }

  const promoteOverlaps = (): void => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    const targets: number[] = []
    for (let index = 0; index < notes.length; index += 1) {
      if (notes[index] === NOTE_BOTH && state.draft[index] !== MARK_FILLED) {
        targets.push(index)
      }
    }
    if (targets.length === 0) return

    notes.fill(0)
    let dispatched = false
    for (const index of targets) {
      const x = index % state.width
      const y = Math.floor(index / state.width)
      ctx.dispatch({ type: "set", x, y, mark: MARK_FILLED })
      dispatched = true
    }
    if (dispatched) ctx.host.audio.play("click")
    render(ctx.state())
  }

  const clearNotes = (): void => {
    if (ctx.state().phase !== "playing") return
    if (!notes.some((value) => value !== 0)) return
    notes.fill(0)
    render(ctx.state())
  }

  const build = (state: NonogramState): void => {
    builtWidth = state.width
    builtHeight = state.height
    cursor = 0
    notes = new Uint8Array(state.width * state.height)
    cells = []
    rowClueNodes = []
    colClueNodes = []
    grid.replaceChildren()
    rowClues.replaceChildren()
    colClues.replaceChildren()

    wrap.style.setProperty(
      "--ng-cell",
      state.width <= 6 ? "clamp(28px, 11cqi, 44px)" : "clamp(20px, 7.2cqi, 34px)",
    )
    grid.style.setProperty("--ng-w", String(state.width))
    grid.style.setProperty("--ng-h", String(state.height))

    for (let y = 0; y < state.height; y += 1) {
      const clue = state.rowClues[y] ?? []
      const row = el("div", "ng-row-clue")
      row.setAttribute("role", "listitem")
      row.setAttribute("aria-label", clueLabel("Row", y + 1, clue))
      for (const run of clue.length === 0 ? [0] : clue) {
        const runText = el("span", undefined, String(run))
        runText.setAttribute("aria-hidden", "true")
        row.append(runText)
      }
      rowClues.append(row)
      rowClueNodes.push(row)
    }

    for (let x = 0; x < state.width; x += 1) {
      const clue = state.colClues[x] ?? []
      const column = el("div", "ng-col-clue")
      column.setAttribute("role", "listitem")
      column.setAttribute("aria-label", clueLabel("Column", x + 1, clue))
      for (const run of clue.length === 0 ? [0] : clue) {
        const runText = el("span", undefined, String(run))
        runText.setAttribute("aria-hidden", "true")
        column.append(runText)
      }
      colClues.append(column)
      colClueNodes.push(column)
    }

    for (let index = 0; index < state.width * state.height; index += 1) {
      const cell = el("button", "ng-cell")
      cell.type = "button"
      cell.dataset.index = String(index)
      cell.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 && event.button !== 2) return
        const stateNow = ctx.state()
        if (stateNow.phase !== "playing") return

        const tool: Tool = event.button === 2 ? "cross" : activeTool
        cursor = index
        cell.focus({ preventScroll: true })
        disarmClearBoard(false)

        const paintOn = paintOnFor(index, tool, stateNow)
        dragActive = true
        dragTool = tool
        dragPaintValue = paintOn
        dragVisited.clear()
        dragVisited.add(index)
        dragPlayedAudio = false

        const dispatched = applyToolAt(index, tool, paintOn)
        if (!dispatched) render(ctx.state())
      })
      cell.addEventListener("click", (event) => {
        // Support screen-reader synthetic clicks (detail === 0); pointer presses
        // are already handled in pointerdown and keyboard Enter/Space in keydown.
        if (event.detail !== 0) return
        if (ctx.state().phase !== "playing") return
        cursor = index
        dragPlayedAudio = false
        disarmClearBoard(false)
        toggleCell(index, activeTool)
      })
      grid.append(cell)
      cells.push(cell)
    }
  }

  const onWindowPointerMove = (event: PointerEvent): void => {
    if (!dragActive) return
    const state = ctx.state()
    if (state.phase !== "playing") {
      endDrag()
      return
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)
    const button = target instanceof HTMLElement ? target.closest(".ng-cell") : null
    if (!(button instanceof HTMLButtonElement) || !grid.contains(button)) return
    const raw = button.dataset.index
    if (raw === undefined) return
    const index = Number(raw)
    if (!Number.isInteger(index) || dragVisited.has(index)) return
    dragVisited.add(index)
    cursor = index
    const dispatched = applyToolAt(index, dragTool, dragPaintValue)
    if (!dispatched) render(ctx.state())
  }

  const onWindowPointerEnd = (): void => {
    endDrag()
  }

  const onWindowBlur = (): void => {
    endDrag()
    disarmClearBoard(true)
  }

  const onGridContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  const isControl = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && target.closest("[data-ng-control]") !== null

  const wrapCoord = (value: number, size: number): number => ((value % size) + size) % size

  const moveCursorBy = (dx: number, dy: number): void => {
    const state = ctx.state()
    const x = cursor % state.width
    const y = Math.floor(cursor / state.width)
    const nx = wrapCoord(x + dx, state.width)
    const ny = wrapCoord(y + dy, state.height)
    cursor = ny * state.width + nx
    cells[cursor]?.focus({ preventScroll: true })
    render(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    // Leave browser and shell shortcuts alone: Ctrl/Cmd+X must cut, not cross,
    // and Alt+Arrow must navigate history, not the grid.
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const state = ctx.state()
    if (state.phase !== "playing") return

    const key = event.key
    const isMove =
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown"
    const isFill = key === " " || key === "Spacebar"
    const isCross = key === "x" || key === "X"
    const isNoteA = key === "1"
    const isNoteB = key === "2"
    const isPromote = key === "p" || key === "P"
    const isClear = key === "c" || key === "C"
    const isCheck = key === "Enter"

    if (
      !isMove &&
      !isFill &&
      !isCross &&
      !isNoteA &&
      !isNoteB &&
      !isPromote &&
      !isClear &&
      !isCheck
    ) {
      return
    }

    // A focused on-screen control keeps its native Enter/Space activation.
    if (isControl(event.target) && (isFill || isCheck)) return

    event.preventDefault()

    if (isMove) {
      disarmClearBoard(false)
      if (key === "ArrowLeft") moveCursorBy(-1, 0)
      else if (key === "ArrowRight") moveCursorBy(1, 0)
      else if (key === "ArrowUp") moveCursorBy(0, -1)
      else moveCursorBy(0, 1)
      return
    }

    // Held keys never repeat a mutating action; one press, one turn.
    if (event.repeat) return

    disarmClearBoard(true)
    dragPlayedAudio = false

    if (isFill) {
      toggleCell(cursor, "fill")
      return
    }

    if (isCross) {
      toggleCell(cursor, "cross")
      return
    }

    if (isNoteA) {
      toggleCell(cursor, "noteA")
      return
    }

    if (isNoteB) {
      toggleCell(cursor, "noteB")
      return
    }

    if (isPromote) {
      promoteOverlaps()
      return
    }

    if (isClear) {
      clearNotes()
      return
    }

    ctx.dispatch({ type: "check" })
  }

  grid.addEventListener("contextmenu", onGridContextMenu)
  ctx.container.addEventListener("keydown", onKeyDown)
  window.addEventListener("pointermove", onWindowPointerMove)
  window.addEventListener("pointerup", onWindowPointerEnd)
  window.addEventListener("pointercancel", onWindowPointerEnd)
  window.addEventListener("blur", onWindowBlur)

  wrap.addEventListener("pointerdown", (event) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest(".ng-cell") !== null) return
    if (isControl(target)) return
    disarmClearBoard(true)
    wrap.focus({ preventScroll: true })
  })

  for (const { tool, button } of toolButtons) {
    button.addEventListener("click", () => {
      disarmClearBoard(false)
      activeTool = tool
      render(ctx.state())
    })
  }
  promoteBtn.addEventListener("click", () => {
    disarmClearBoard(true)
    promoteOverlaps()
  })
  clearNotesBtn.addEventListener("click", () => {
    disarmClearBoard(true)
    clearNotes()
  })
  clearBoardBtn.addEventListener("click", () => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    if (!confirmClearBoard) {
      armClearBoard()
      return
    }
    disarmClearBoard(false)
    ctx.dispatch({ type: "clear" })
    if (ctx.state().draft.every((mark) => mark === MARK_EMPTY)) {
      notes.fill(0)
      ctx.host.audio.play("flag")
      live.textContent = "Board cleared."
    }
    render(ctx.state())
  })
  checkBtn.addEventListener("click", () => {
    disarmClearBoard(true)
    if (ctx.state().phase === "playing") ctx.dispatch({ type: "check" })
  })

  // Pointer activation hands focus back to the board so the next Enter checks
  // instead of re-activating a button. Keyboard activation keeps native focus.
  for (const button of allControlButtons) {
    button.addEventListener("pointerup", () => {
      const cell = cells[cursor]
      if (cell && !cell.disabled) cell.focus({ preventScroll: true })
      else wrap.focus({ preventScroll: true })
    })
  }

  const render = (state: NonogramState): void => {
    if (state.width !== builtWidth || state.height !== builtHeight) build(state)

    const playing = state.phase === "playing"
    if (!playing) {
      endDrag()
      notes.fill(0)
    }

    if (cursor >= state.width * state.height) cursor = 0
    const cursorX = cursor % state.width
    const cursorY = Math.floor(cursor / state.width)

    sizeStat.textContent = `${state.width} × ${state.height}`
    checksStat.textContent = `Checks ${state.checksUsed}/${MAX_CHECKS}`
    if (state.phase === "won") statusStat.textContent = "Solved"
    else if (state.phase === "lost") statusStat.textContent = "Out of checks"
    else if (state.checksUsed > 0) statusStat.textContent = "Not solved yet"
    else statusStat.textContent = "Ready"

    for (let y = 0; y < state.height; y += 1) {
      const rowNode = rowClueNodes[y]
      if (!rowNode) continue
      const rowMarks = state.draft.slice(y * state.width, (y + 1) * state.width)
      const satisfied = lineSatisfied(rowMarks, state.rowClues[y] ?? [])
      rowNode.classList.toggle("is-active-line", playing && y === cursorY)
      rowNode.classList.toggle("is-satisfied", satisfied)
    }

    for (let x = 0; x < state.width; x += 1) {
      const colNode = colClueNodes[x]
      if (!colNode) continue
      const colMarks: number[] = []
      for (let y = 0; y < state.height; y += 1) {
        colMarks.push(state.draft[y * state.width + x] ?? MARK_EMPTY)
      }
      const satisfied = lineSatisfied(colMarks, state.colClues[x] ?? [])
      colNode.classList.toggle("is-active-line", playing && x === cursorX)
      colNode.classList.toggle("is-satisfied", satisfied)
    }

    let overlapCount = 0
    let anyNotes = false

    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index]
      if (!cell) continue
      const mark = state.draft[index] ?? MARK_EMPTY
      if (mark !== MARK_EMPTY) notes[index] = 0
      const note = playing && mark === MARK_EMPTY ? (notes[index] ?? 0) : 0
      if (note !== 0) anyNotes = true
      if (note === NOTE_BOTH) overlapCount += 1

      const x = index % state.width
      const y = Math.floor(index / state.width)
      const isCursor = playing && index === cursor
      const isActiveLine = playing && (x === cursorX || y === cursorY)
      const isMajorLeft = state.width >= 10 && x > 0 && x % 5 === 0
      const isMajorTop = state.height >= 10 && y > 0 && y % 5 === 0
      const wrong = state.phase === "lost" && mark === MARK_FILLED && state.solution[index] === 0
      const missed = state.phase === "lost" && mark !== MARK_FILLED && state.solution[index] === 1

      cell.className = "ng-cell"
      if (isMajorLeft) cell.classList.add("is-major-left")
      if (isMajorTop) cell.classList.add("is-major-top")
      if (isActiveLine && mark === MARK_EMPTY && note === 0) cell.classList.add("is-active-line")
      if (mark === MARK_FILLED && !wrong) cell.classList.add("is-filled")
      if (mark === MARK_CROSSED && !missed) cell.classList.add("is-crossed")
      if (note & NOTE_A) cell.classList.add("is-note-a")
      if (note & NOTE_B) cell.classList.add("is-note-b")
      if (wrong) cell.classList.add("is-wrong")
      if (missed) cell.classList.add("is-missed")
      if (isCursor) cell.classList.add("is-cursor")

      if (wrong) cell.textContent = "✕"
      else if (missed) cell.textContent = "□"
      else if (mark === MARK_CROSSED) cell.textContent = "×"
      else if (note === NOTE_BOTH) cell.textContent = "◆"
      else cell.textContent = ""

      cell.disabled = !playing
      cell.tabIndex = index === cursor ? 0 : -1

      const statusWord = wrong
        ? "wrongly filled"
        : missed
          ? "missed solution cell"
          : markWord(mark, note)
      cell.setAttribute("aria-label", `row ${y + 1} column ${x + 1}, ${statusWord}`)
      if (isCursor) cell.setAttribute("aria-current", "true")
      else cell.removeAttribute("aria-current")
    }

    for (const { tool, button } of toolButtons) {
      button.disabled = !playing
      button.setAttribute("aria-pressed", String(activeTool === tool))
    }

    promoteBtn.textContent = overlapCount > 0 ? `Promote (${overlapCount})` : "Promote"
    promoteBtn.classList.toggle("is-promote", playing && overlapCount > 0)
    promoteBtn.disabled = !playing || overlapCount === 0
    clearNotesBtn.disabled = !playing || !anyNotes

    const hasDraft = state.draft.some((mark) => mark !== MARK_EMPTY)
    if ((!playing || !hasDraft) && confirmClearBoard) {
      if (confirmClearTimer !== undefined) {
        clearTimeout(confirmClearTimer)
        confirmClearTimer = undefined
      }
      confirmClearBoard = false
    }
    clearBoardBtn.disabled = !playing || !hasDraft
    clearBoardBtn.textContent = confirmClearBoard ? "Confirm clear?" : "Clear board"
    clearBoardBtn.classList.toggle("is-confirm", playing && confirmClearBoard)
    clearBoardBtn.setAttribute(
      "aria-label",
      confirmClearBoard
        ? "Confirm clearing all marks on the board"
        : "Clear all filled and crossed marks on the board",
    )

    checkBtn.disabled = !playing

    if (state.phase !== lastPhase) {
      if (state.phase === "won") {
        ctx.host.audio.play("win")
        live.textContent = `Solved in ${state.checksUsed} ${state.checksUsed === 1 ? "check" : "checks"}.`
      } else if (state.phase === "lost") {
        ctx.host.audio.play("lose")
        live.textContent = "Out of checks. Wrong and missed cells are shown."
      }
      lastPhase = state.phase
    } else if (state.checksUsed > lastChecks && playing) {
      ctx.host.audio.play("crash")
      const left = MAX_CHECKS - state.checksUsed
      live.textContent = `Not solved yet. ${left} ${left === 1 ? "check" : "checks"} left.`
    }
    lastChecks = state.checksUsed
  }

  return {
    render(state) {
      render(state)
    },
    destroy() {
      endDrag()
      disarmClearBoard(false)
      grid.removeEventListener("contextmenu", onGridContextMenu)
      ctx.container.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointermove", onWindowPointerMove)
      window.removeEventListener("pointerup", onWindowPointerEnd)
      window.removeEventListener("pointercancel", onWindowPointerEnd)
      window.removeEventListener("blur", onWindowBlur)
      wrap.remove()
    },
  }
}
