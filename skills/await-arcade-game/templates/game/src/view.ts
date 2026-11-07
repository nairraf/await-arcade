import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import type { TargetInput, TargetState } from "./core"

const css = `
.target-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.target-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: min(100%, 270px);
}

.target-cell {
  appearance: none;
  aspect-ratio: 1;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  background: #0e141b;
  cursor: pointer;
  transition: transform 80ms ease, background 80ms ease, border-color 80ms ease;
}

.target-cell:hover {
  background: #16202c;
}

.target-cell:active {
  transform: scale(0.97);
}

.target-cell.is-target {
  border-color: rgba(34, 211, 238, 0.7);
  background: radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.75), rgba(34, 211, 238, 0.12));
  box-shadow: 0 0 24px rgba(34, 211, 238, 0.35);
}

.target-cell:disabled {
  opacity: 0.6;
  cursor: default;
}

.target-hits {
  color: var(--arcade-muted, #8b98a9);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
`

export function view(ctx: ViewContext<TargetState, TargetInput>): GameView<TargetState> {
  ensureStyle("arcade-game-__ID__", css)

  const wrap = el("div", "target-wrap")
  const grid = el("div", "target-grid")
  const hits = el("div", "target-hits")
  wrap.append(grid, hits)
  ctx.container.append(wrap)

  let size = 0
  let buttons: HTMLButtonElement[] = []

  const build = (state: TargetState): void => {
    size = state.width * state.height
    buttons = []
    grid.replaceChildren()

    for (let index = 0; index < size; index += 1) {
      const button = el("button", "target-cell")
      button.type = "button"
      button.addEventListener("click", () => ctx.dispatch({ index }))
      grid.append(button)
      buttons.push(button)
    }
  }

  const render = (state: TargetState): void => {
    if (state.width * state.height !== size) build(state)

    buttons.forEach((button, index) => {
      button.classList.toggle("is-target", index === state.target && state.phase === "playing")
      button.disabled = state.phase !== "playing"
    })

    hits.textContent = `Hits ${state.hits} / 5`
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
