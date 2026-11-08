import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import type { MineInput, MineState } from "./core"

const css = `
.ms-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
}

.ms-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.ms-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.18));
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent);
}

.ms-board {
  display: grid;
  grid-template-columns: repeat(var(--ms-cols, 9), minmax(0, 1fr));
  gap: 2px;
  width: 100%;
  max-width: calc(var(--ms-cols, 9) * 30px);
  user-select: none;
  touch-action: manipulation;
}

.ms-cell {
  appearance: none;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  font: inherit;
  font-size: clamp(8px, 1.4vw, 13px);
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background 80ms ease, transform 60ms ease;
}

.ms-hidden {
  border-color: var(--arcade-line, rgba(148, 163, 184, 0.18));
  background: linear-gradient(160deg, var(--arcade-panel-2, #1d2937), var(--arcade-panel, #111923));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--arcade-fg, #e6edf3) 8%, transparent);
}

.ms-hidden:hover {
  background: linear-gradient(160deg, var(--arcade-elevated, #263648), var(--arcade-panel-2, #16202c));
}

.ms-cell:active {
  transform: scale(0.96);
}

.ms-open {
  border-color: var(--arcade-line, rgba(148, 163, 184, 0.18));
  background: var(--arcade-bg, #0a0f16);
  cursor: default;
}

.ms-mine {
  color: var(--arcade-danger, #fb7185);
  background: color-mix(in srgb, var(--arcade-danger, #fb7185) 12%, transparent);
}

.ms-flag {
  color: var(--arcade-coin, #fbbf24);
}

.ms-flag-wrong {
  color: var(--arcade-danger, #fb7185);
}

.ms-n1 { color: #60a5fa; }
.ms-n2 { color: #4ade80; }
.ms-n3 { color: #fb7185; }
.ms-n4 { color: #a78bfa; }
.ms-n5 { color: #fbbf24; }
.ms-n6 { color: #22d3ee; }
.ms-n7 { color: #f472b6; }
.ms-n8 { color: #cbd5e1; }

.arcade[data-theme="light"] .ms-n1 { color: #1d4ed8; }
.arcade[data-theme="light"] .ms-n2 { color: #15803d; }
.arcade[data-theme="light"] .ms-n3 { color: #b91c1c; }
.arcade[data-theme="light"] .ms-n4 { color: #6d28d9; }
.arcade[data-theme="light"] .ms-n5 { color: #b45309; }
.arcade[data-theme="light"] .ms-n6 { color: #0e7490; }
.arcade[data-theme="light"] .ms-n7 { color: #be185d; }
.arcade[data-theme="light"] .ms-n8 { color: #475569; }

.arcade[data-theme="light"] .ms-hidden {
  border-color: rgba(60, 50, 35, 0.24);
  background: linear-gradient(160deg, #d2c8b5, #b9ad98);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.arcade[data-theme="light"] .ms-hidden:hover {
  background: linear-gradient(160deg, #ded4c2, #c8bca6);
}

.arcade[data-theme="light"] .ms-open {
  border-color: rgba(60, 50, 35, 0.14);
  background: #fffdf7;
}

.arcade[data-theme="light"] .ms-stat {
  border-color: rgba(60, 50, 35, 0.2);
  background: rgba(255, 255, 255, 0.32);
}

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] .ms-n1 { color: #1d4ed8; }
  .arcade[data-theme="auto"] .ms-n2 { color: #15803d; }
  .arcade[data-theme="auto"] .ms-n3 { color: #b91c1c; }
  .arcade[data-theme="auto"] .ms-n4 { color: #6d28d9; }
  .arcade[data-theme="auto"] .ms-n5 { color: #b45309; }
  .arcade[data-theme="auto"] .ms-n6 { color: #0e7490; }
  .arcade[data-theme="auto"] .ms-n7 { color: #be185d; }
  .arcade[data-theme="auto"] .ms-n8 { color: #475569; }

  .arcade[data-theme="auto"] .ms-hidden {
    border-color: rgba(60, 50, 35, 0.24);
    background: linear-gradient(160deg, #d2c8b5, #b9ad98);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }

  .arcade[data-theme="auto"] .ms-hidden:hover {
    background: linear-gradient(160deg, #ded4c2, #c8bca6);
  }

  .arcade[data-theme="auto"] .ms-open {
    border-color: rgba(60, 50, 35, 0.14);
    background: #fffdf7;
  }

  .arcade[data-theme="auto"] .ms-stat {
    border-color: rgba(60, 50, 35, 0.2);
    background: rgba(255, 255, 255, 0.32);
  }
}

.ms-cell:disabled {
  opacity: 1;
  cursor: default;
}

.ms-cell:focus-visible {
  outline: 2px solid var(--arcade-accent, #22d3ee);
  outline-offset: 1px;
  z-index: 1;
}
`

export function view(ctx: ViewContext<MineState, MineInput>): GameView<MineState> {
  ensureStyle("arcade-game-minesweeper", css)

  const wrap = el("div", "ms-wrap")
  const bar = el("div", "ms-bar")
  const minesOut = el("span", "ms-stat")
  const flagsOut = el("span", "ms-stat")
  bar.append(minesOut, flagsOut)

  const board = el("div", "ms-board")
  wrap.append(bar, board)
  ctx.container.append(wrap)

  let width = 0
  let height = 0
  let buttons: HTMLButtonElement[] = []

  const focusCell = (x: number, y: number): void => {
    const target = buttons[y * width + x]
    if (!target) return
    for (const button of buttons) button.tabIndex = -1
    target.tabIndex = 0
    target.focus()
  }

  const move = (x: number, y: number, dx: number, dy: number): void => {
    focusCell(Math.min(width - 1, Math.max(0, x + dx)), Math.min(height - 1, Math.max(0, y + dy)))
  }

  const build = (state: MineState): void => {
    width = state.width
    height = state.height
    buttons = []
    board.replaceChildren()
    board.style.setProperty("--ms-cols", String(width))

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const button = el("button", "ms-cell")
        button.type = "button"
        button.tabIndex = -1
        button.dataset.x = String(x)
        button.dataset.y = String(y)

        button.addEventListener("click", () => ctx.dispatch({ type: "reveal", x, y }))
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault()
          ctx.dispatch({ type: "flag", x, y })
        })
        button.addEventListener("dblclick", (event) => {
          event.preventDefault()
          ctx.dispatch({ type: "chord", x, y })
        })
        button.addEventListener("keydown", (event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault()
            move(x, y, -1, 0)
          } else if (event.key === "ArrowRight") {
            event.preventDefault()
            move(x, y, 1, 0)
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            move(x, y, 0, -1)
          } else if (event.key === "ArrowDown") {
            event.preventDefault()
            move(x, y, 0, 1)
          } else if (event.key === " " || event.key === "Enter") {
            event.preventDefault()
            ctx.dispatch({ type: "reveal", x, y })
          } else if (event.key === "f" || event.key === "F") {
            event.preventDefault()
            ctx.dispatch({ type: "flag", x, y })
          } else if (event.key === "c" || event.key === "C") {
            event.preventDefault()
            ctx.dispatch({ type: "chord", x, y })
          }
        })

        board.append(button)
        buttons.push(button)
      }
    }

    const first = buttons[0]
    if (first) first.tabIndex = 0
  }

  const render = (state: MineState): void => {
    if (state.width !== width || state.height !== height) build(state)

    const lost = state.phase === "lost"
    const won = state.phase === "won"

    for (let index = 0; index < state.cells.length; index += 1) {
      const cell = state.cells[index]!
      const button = buttons[index]!
      const showMine = cell.mine && (cell.revealed || lost)
      const showFlag = (cell.flagged && !cell.revealed) || (won && cell.mine)
      const open = cell.revealed && !cell.mine
      const x = index % state.width
      const y = Math.floor(index / state.width)

      button.className = "ms-cell"
      button.classList.add(showMine ? "ms-open" : open ? "ms-open" : "ms-hidden")
      if (showMine) button.classList.add("ms-mine")
      if (showFlag) button.classList.add("ms-flag")
      if (lost && cell.flagged && !cell.mine) button.classList.add("ms-flag-wrong")
      if (open && cell.adjacent > 0) button.classList.add(`ms-n${cell.adjacent}`)

      button.textContent = showFlag ? "⚑" : showMine ? "✹" : open && cell.adjacent > 0 ? String(cell.adjacent) : ""
      button.disabled = state.phase !== "playing"
      button.dataset.phase = state.phase
      button.setAttribute(
        "aria-label",
        `Column ${x + 1}, row ${y + 1}: ${
          cell.revealed ? (cell.mine ? "mine" : `${cell.adjacent} adjacent`) : cell.flagged ? "flagged" : "hidden"
        }`,
      )
    }

    minesOut.textContent = `Mines ${state.mineCount - state.flags}`
    flagsOut.textContent = `Flags ${state.flags}`
  }

  return {
    render(state) {
      render(state)
    },
    destroy() {
      wrap.remove()
    },
  }
}
