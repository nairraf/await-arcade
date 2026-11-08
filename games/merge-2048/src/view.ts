import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import type { Direction, MergeInput, MergeState } from "./core"

const css = `
.m2048 {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 0;
}

.m2048-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--arcade-muted, #8b98a9);
}

.m2048-stat {
  padding: 3px 9px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.18));
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent);
}

.m2048-stat b {
  color: var(--arcade-fg, #e6edf3);
  font-size: 12px;
}

.m2048-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  width: min(78vw, 360px);
  aspect-ratio: 1;
  padding: 8px;
  border-radius: 10px;
  background: #bbada0;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.28);
  user-select: none;
  touch-action: none;
}

.m2048-tile {
  display: grid;
  place-items: center;
  border-radius: 6px;
  font-size: clamp(14px, 4.4vw, 26px);
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #776e65;
  background: rgba(238, 228, 218, 0.35);
  transition: background 90ms ease, color 90ms ease;
}

.m2048-tile[data-value="2"] { background: #eee4da; }
.m2048-tile[data-value="4"] { background: #ede0c8; }
.m2048-tile[data-value="8"] { background: #f2b179; color: #f9f6f2; }
.m2048-tile[data-value="16"] { background: #f59563; color: #f9f6f2; }
.m2048-tile[data-value="32"] { background: #f67c5f; color: #f9f6f2; }
.m2048-tile[data-value="64"] { background: #f65e3b; color: #f9f6f2; }
.m2048-tile[data-value="128"] { background: #edcf72; color: #f9f6f2; }
.m2048-tile[data-value="256"] { background: #edcc61; color: #f9f6f2; }
.m2048-tile[data-value="512"] { background: #edc850; color: #f9f6f2; }
.m2048-tile[data-value="1024"] { background: #edc53f; color: #f9f6f2; }
.m2048-tile[data-value="2048"] { background: #edc22e; color: #f9f6f2; box-shadow: 0 0 18px rgba(237, 194, 46, 0.7); }

.m2048-pad {
  display: grid;
  grid-template-columns: repeat(3, 42px);
  grid-template-rows: repeat(2, 38px);
  gap: 6px;
  justify-content: center;
}

.m2048-key {
  appearance: none;
  border: 1px solid var(--arcade-line-strong, rgba(148, 163, 184, 0.34));
  border-radius: 8px;
  background: var(--arcade-panel-2, #101923);
  color: var(--arcade-fg, #e8eef5);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}

.m2048-key:active {
  transform: translateY(1px);
}

.m2048-up { grid-column: 2; grid-row: 1; }
.m2048-left { grid-column: 1; grid-row: 2; }
.m2048-down { grid-column: 2; grid-row: 2; }
.m2048-right { grid-column: 3; grid-row: 2; }
`

function directionFor(key: string): Direction | undefined {
  const value = key.toLowerCase()
  if (value === "arrowup" || value === "w") return "up"
  if (value === "arrowdown" || value === "s") return "down"
  if (value === "arrowleft" || value === "a") return "left"
  if (value === "arrowright" || value === "d") return "right"
  return undefined
}

export function view(ctx: ViewContext<MergeState, MergeInput>): GameView<MergeState> {
  ensureStyle("await-arcade-2048", css)

  const wrap = el("div", "m2048")
  const bar = el("div", "m2048-bar")
  const scoreStat = el("span", "m2048-stat", "Score 0")
  const tileStat = el("span", "m2048-stat", "Best 0")
  bar.append(scoreStat, tileStat)

  const board = el("div", "m2048-board")
  board.setAttribute("role", "grid")
  board.setAttribute("aria-label", "2048 board")

  const tiles: HTMLElement[] = []
  for (let index = 0; index < 16; index += 1) {
    const tile = el("div", "m2048-tile")
    tile.setAttribute("role", "gridcell")
    tiles.push(tile)
    board.append(tile)
  }

  const pad = el("div", "m2048-pad")
  const move = (direction: Direction): void => {
    ctx.dispatch({ direction })
  }
  const keys: Array<[Direction, string, string]> = [
    ["up", "↑", "m2048-up"],
    ["left", "←", "m2048-left"],
    ["down", "↓", "m2048-down"],
    ["right", "→", "m2048-right"],
  ]
  for (const [direction, label, className] of keys) {
    const button = el("button", `m2048-key ${className}`, label)
    button.type = "button"
    button.setAttribute("aria-label", `Move ${direction}`)
    button.addEventListener("click", () => move(direction))
    pad.append(button)
  }

  wrap.append(bar, board, pad)
  ctx.container.append(wrap)

  const onKey = (event: KeyboardEvent): void => {
    const direction = directionFor(event.key)
    if (!direction) return
    event.preventDefault()
    move(direction)
  }
  globalThis.addEventListener("keydown", onKey)

  // Swipe for touch and trackpad users.
  let startX = 0
  let startY = 0
  const onPointerDown = (event: PointerEvent): void => {
    startX = event.clientX
    startY = event.clientY
  }
  const onPointerUp = (event: PointerEvent): void => {
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left")
    else move(dy > 0 ? "down" : "up")
  }
  board.addEventListener("pointerdown", onPointerDown)
  board.addEventListener("pointerup", onPointerUp)

  return {
    render(state) {
      let best = 0
      for (let index = 0; index < 16; index += 1) {
        const value = state.grid[index] ?? 0
        const tile = tiles[index]!
        tile.textContent = value === 0 ? "" : String(value)
        tile.dataset.value = String(value)
        tile.setAttribute("aria-label", value === 0 ? "empty" : String(value))
        if (value > best) best = value
      }
      scoreStat.textContent = `Score ${state.score}`
      tileStat.textContent = `Best ${best}`
    },

    destroy() {
      globalThis.removeEventListener("keydown", onKey)
      board.removeEventListener("pointerdown", onPointerDown)
      board.removeEventListener("pointerup", onPointerUp)
      wrap.remove()
    },
  }
}
