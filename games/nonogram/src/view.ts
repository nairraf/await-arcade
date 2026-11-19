import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import {
  MARK_CROSSED,
  MARK_FILLED,
  MAX_CHECKS,
  type NonogramInput,
  type NonogramState,
} from "./core"

const css = `
.ng-wrap {
  --ng-cell: clamp(30px, 9.5vw, 46px);
  --ng-line: var(--arcade-line, rgba(148, 163, 184, 0.3));
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  outline: none;
  user-select: none;
  touch-action: manipulation;
}

.ng-wrap:focus-visible {
  outline: 2px solid var(--game-accent, #f472b6);
  outline-offset: 3px;
  border-radius: 6px;
}

.ng-bar {
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

.ng-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--ng-line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ng-stat.is-accent {
  color: var(--game-accent, #f472b6);
  border-color: color-mix(in srgb, var(--game-accent, #f472b6) 38%, transparent);
}

.ng-stat.is-status {
  color: var(--arcade-fg, #e6edf3);
}

.ng-board {
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  justify-content: center;
  align-items: end;
  width: 100%;
  min-width: 0;
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
  padding-bottom: 4px;
  color: var(--arcade-muted, #8b98a9);
  font-size: clamp(9px, 2.5vw, 11px);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
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
  padding-right: 6px;
  color: var(--arcade-muted, #8b98a9);
  font-size: clamp(9px, 2.5vw, 11px);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.ng-grid {
  grid-area: 2 / 2;
  display: grid;
  grid-template-columns: repeat(var(--ng-w, 6), var(--ng-cell));
  grid-template-rows: repeat(var(--ng-h, 6), var(--ng-cell));
  border-top: 1px solid var(--ng-line);
  border-left: 1px solid var(--ng-line);
}

.ng-cell {
  appearance: none;
  display: grid;
  place-items: center;
  width: var(--ng-cell);
  height: var(--ng-cell);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  box-shadow: inset -1px -1px 0 var(--ng-line);
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 4%, transparent);
  color: var(--arcade-muted, #8b98a9);
  font: inherit;
  font-size: calc(var(--ng-cell) * 0.62);
  line-height: 1;
  cursor: pointer;
  transition: background 90ms ease;
}

.ng-cell.is-filled {
  background: var(--game-accent, #f472b6);
}

button.ng-cell.is-filled:not(:disabled):hover {
  background: color-mix(in srgb, var(--game-accent, #f472b6) 82%, var(--arcade-fg, #e6edf3));
}

.ng-cell.is-crossed {
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 3%, transparent);
  color: var(--arcade-muted, #8b98a9);
  font-weight: 600;
}

.ng-cell.is-cursor {
  box-shadow:
    inset -1px -1px 0 var(--ng-line),
    inset 0 0 0 2px var(--game-accent-2, #38bdf8);
  z-index: 1;
}

button.ng-cell:focus-visible {
  outline: 2px solid var(--game-accent, #f472b6);
  outline-offset: -3px;
}

button.ng-cell:disabled {
  cursor: default;
  opacity: 1;
}

.ng-hint {
  margin: 0;
  text-align: center;
  color: var(--arcade-muted, #8b98a9);
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.95;
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

@media (max-width: 360px) {
  .ng-hint {
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ng-cell {
    transition: none;
  }
}
`

function markWord(mark: number): string {
  if (mark === MARK_FILLED) return "filled"
  if (mark === MARK_CROSSED) return "crossed"
  return "empty"
}

function clueText(clue: readonly number[]): string {
  return clue.length === 0 ? "0" : clue.join(" ")
}

function clueLabel(kind: "Row" | "Column", index: number, clue: readonly number[]): string {
  return `${kind} ${index}: ${clue.length === 0 ? "empty" : clue.join(", ")}`
}

export function view(ctx: ViewContext<NonogramState, NonogramInput>): GameView<NonogramState> {
  ensureStyle("arcade-game-nonogram", css)

  const wrap = el("div", "ng-wrap")
  wrap.tabIndex = -1
  wrap.setAttribute("role", "application")
  wrap.setAttribute("aria-roledescription", "nonogram board")
  wrap.setAttribute(
    "aria-label",
    "Nonogram. Arrow keys move the cursor. Space cycles a cell from empty to filled to crossed. X marks the cell crossed. Enter checks the board. Use the row and column clues to fill every required cell without filling an empty one.",
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

  const hint = el(
    "p",
    "ng-hint",
    "Arrows move · Space mark · X cross · Enter check · Crosses are notes and never part of the solution",
  )
  const live = el("div", "ng-sr")
  live.setAttribute("aria-live", "polite")
  live.setAttribute("aria-atomic", "true")

  wrap.append(bar, board, hint, live)
  ctx.container.append(wrap)

  let builtWidth = 0
  let builtHeight = 0
  let cells: HTMLButtonElement[] = []
  let lastChecks = 0
  let lastPhase = "playing"

  const dispatch = (input: NonogramInput): void => {
    if (ctx.state().phase !== "playing") return
    ctx.dispatch(input)
  }

  const build = (state: NonogramState): void => {
    builtWidth = state.width
    builtHeight = state.height
    cells = []
    grid.replaceChildren()
    rowClues.replaceChildren()
    colClues.replaceChildren()

    wrap.style.setProperty(
      "--ng-cell",
      state.width <= 6 ? "clamp(30px, 9.5vw, 46px)" : "clamp(20px, 7.4vw, 36px)",
    )
    grid.style.setProperty("--ng-w", String(state.width))
    grid.style.setProperty("--ng-h", String(state.height))

    for (let y = 0; y < state.height; y += 1) {
      const clue = state.rowClues[y] ?? []
      const row = el("div", "ng-row-clue", clueText(clue))
      row.setAttribute("role", "listitem")
      row.setAttribute("aria-label", clueLabel("Row", y + 1, clue))
      rowClues.append(row)
    }

    for (let x = 0; x < state.width; x += 1) {
      const clue = state.colClues[x] ?? []
      const column = el("div", "ng-col-clue")
      column.setAttribute("role", "listitem")
      column.setAttribute("aria-label", clueLabel("Column", x + 1, clue))
      for (const run of clue.length === 0 ? [0] : clue) {
        column.append(el("span", undefined, String(run)))
      }
      colClues.append(column)
    }

    for (let index = 0; index < state.width * state.height; index += 1) {
      const cell = el("button", "ng-cell")
      cell.type = "button"
      cell.addEventListener("click", () => {
        const current = ctx.state()
        if (current.phase !== "playing") return
        if (current.cursor === index) {
          dispatch({ type: "mark" })
        } else {
          moveCursorTo(index)
        }
        const next = ctx.state()
        cells[next.cursor]?.focus({ preventScroll: true })
      })
      grid.append(cell)
      cells.push(cell)
    }
  }

  const moveCursorTo = (target: number): void => {
    let guard = 0
    const limit = builtWidth * builtHeight + 2
    while (ctx.state().cursor !== target && guard < limit) {
      guard += 1
      const state = ctx.state()
      if (state.phase !== "playing") return
      const width = state.width
      const height = state.height
      const x = state.cursor % width
      const y = Math.floor(state.cursor / width)
      const tx = target % width
      const ty = Math.floor(target / width)

      if (x !== tx) {
        const right = (tx - x + width) % width
        const left = width - right
        dispatch({ type: "cursor", dx: right <= left ? 1 : -1, dy: 0 })
      } else {
        const down = (ty - y + height) % height
        const up = height - down
        dispatch({ type: "cursor", dx: 0, dy: down <= up ? 1 : -1 })
      }
    }
  }

  const crossCursor = (): void => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    const mark = state.draft[state.cursor] ?? 0
    if (mark === MARK_CROSSED) return
    // empty → filled → crossed, or filled → crossed.
    dispatch({ type: "mark" })
    if (mark !== MARK_FILLED) dispatch({ type: "mark" })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    // Leave browser and shell shortcuts alone: Ctrl/Cmd+X must cut, not cross,
    // and Alt+Arrow must navigate history, not the grid.
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const key = event.key
    const isMove =
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown"
    const isMark = key === " " || key === "Spacebar"
    const isCross = key === "x" || key === "X"
    const isCheck = key === "Enter"

    if (!isMove && !isMark && !isCross && !isCheck) return
    event.preventDefault()
    // Held keys never repeat a mutating action; one press, one turn.
    if (event.repeat) return

    if (isMove) {
      if (key === "ArrowLeft") dispatch({ type: "cursor", dx: -1, dy: 0 })
      else if (key === "ArrowRight") dispatch({ type: "cursor", dx: 1, dy: 0 })
      else if (key === "ArrowUp") dispatch({ type: "cursor", dx: 0, dy: -1 })
      else dispatch({ type: "cursor", dx: 0, dy: 1 })
      cells[ctx.state().cursor]?.focus({ preventScroll: true })
      return
    }

    if (isMark) {
      dispatch({ type: "mark" })
      return
    }

    if (isCross) {
      crossCursor()
      return
    }

    dispatch({ type: "check" })
  }

  ctx.container.addEventListener("keydown", onKeyDown)
  wrap.addEventListener("pointerdown", (event) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest(".ng-cell") !== null) return
    wrap.focus({ preventScroll: true })
  })

  const render = (state: NonogramState): void => {
    if (state.width !== builtWidth || state.height !== builtHeight) build(state)

    const playing = state.phase === "playing"

    sizeStat.textContent = `${state.width} × ${state.height}`
    checksStat.textContent = `Checks ${state.checksUsed}/${MAX_CHECKS}`
    if (state.phase === "won") statusStat.textContent = "Solved"
    else if (state.phase === "lost") statusStat.textContent = "Out of checks"
    else if (state.checksUsed > 0) statusStat.textContent = "Not solved yet"
    else statusStat.textContent = "Ready"

    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index]
      if (!cell) continue
      const mark = state.draft[index] ?? 0
      const word = markWord(mark)
      const x = index % state.width
      const y = Math.floor(index / state.width)
      const cursor = index === state.cursor

      cell.className = "ng-cell"
      if (mark === MARK_FILLED) cell.classList.add("is-filled")
      if (mark === MARK_CROSSED) cell.classList.add("is-crossed")
      if (cursor) cell.classList.add("is-cursor")
      cell.textContent = mark === MARK_CROSSED ? "×" : ""
      cell.disabled = !playing
      cell.tabIndex = cursor ? 0 : -1
      cell.setAttribute("aria-label", `row ${y + 1} column ${x + 1}, ${word}`)
      if (cursor) cell.setAttribute("aria-current", "true")
      else cell.removeAttribute("aria-current")
    }

    if (state.phase !== lastPhase) {
      if (state.phase === "won") {
        live.textContent = `Solved in ${state.checksUsed} ${state.checksUsed === 1 ? "check" : "checks"}.`
      } else if (state.phase === "lost") {
        live.textContent = "Out of checks. The puzzle was not solved."
      }
      lastPhase = state.phase
    } else if (state.checksUsed > lastChecks && playing) {
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
      ctx.container.removeEventListener("keydown", onKeyDown)
      wrap.remove()
    },
  }
}
