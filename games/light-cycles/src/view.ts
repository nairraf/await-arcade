import type { GameView, ViewContext } from "@await-arcade/contract"
import type { CycleInput, CycleState } from "./core"

const COLORS = ["#22d3ee", "#f472b6"]

function desiredDirection(key: string): number | undefined {
  if (key === "ArrowUp" || key === "w") return 0
  if (key === "ArrowRight" || key === "d") return 1
  if (key === "ArrowDown" || key === "s") return 2
  if (key === "ArrowLeft" || key === "a") return 3
  return undefined
}

export function view(ctx: ViewContext<CycleState, CycleInput>): GameView<CycleState> {
  const canvas = ctx.ctx2d
  if (!canvas) throw new Error("Neon Cycles needs a canvas surface")

  const turn = (player: 0 | 1, direction: number): void => {
    const bike = ctx.state().bikes[player]
    if (!bike || !bike.alive) return

    const diff = (direction - bike.dir + 4) % 4
    if (diff === 1) ctx.dispatch({ player, turn: 1 })
    else if (diff === 3) ctx.dispatch({ player, turn: -1 })
  }

  const onKey = (event: KeyboardEvent): void => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const direction = desiredDirection(key)
    if (direction === undefined) return

    event.preventDefault()
    const duel = ctx.state().modeId === "duel"

    if (duel) {
      if (key.startsWith("Arrow")) turn(0, direction)
      else turn(1, direction)
      return
    }

    turn(0, direction)
  }

  ctx.container.addEventListener("keydown", onKey)

  const render = (state: CycleState): void => {
    const width = ctx.size().width
    const height = ctx.size().height
    const cell = width / state.width

    canvas.fillStyle = "#05080c"
    canvas.fillRect(0, 0, width, height)

    canvas.strokeStyle = "rgba(148, 163, 184, 0.09)"
    canvas.lineWidth = 1
    for (let x = 0; x <= state.width; x += 1) {
      canvas.beginPath()
      canvas.moveTo(x * cell + 0.5, 0)
      canvas.lineTo(x * cell + 0.5, height)
      canvas.stroke()
    }
    for (let y = 0; y <= state.height; y += 1) {
      canvas.beginPath()
      canvas.moveTo(0, y * cell + 0.5)
      canvas.lineTo(width, y * cell + 0.5)
      canvas.stroke()
    }

    state.bikes.forEach((bike, player) => {
      const color = COLORS[player] ?? "#e6edf3"
      const dim = bike.alive ? 1 : 0.25
      const boosted = (state.boostTicks[player] ?? 0) > 0

      canvas.globalAlpha = 0.28 * dim
      canvas.fillStyle = color
      for (const index of bike.trail) {
        const x = index % state.width
        const y = Math.floor(index / state.width)
        canvas.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2)
      }

      canvas.globalAlpha = dim
      canvas.shadowColor = color
      canvas.shadowBlur = boosted ? 26 : 14
      canvas.fillStyle = color
      canvas.fillRect(bike.x * cell, bike.y * cell, cell, cell)
      canvas.shadowBlur = 0
      canvas.globalAlpha = 1
    })

    state.boostTicks.forEach((ticks, player) => {
      if (ticks <= 0) return
      canvas.fillStyle = COLORS[player] ?? "#e6edf3"
      canvas.font = "9px ui-monospace, Menlo, monospace"
      canvas.fillText(`BOOST ${player === 0 ? "P1" : "AI"}`, 8, 12 + player * 12)
    })

    canvas.strokeStyle = "rgba(148, 163, 184, 0.22)"
    canvas.lineWidth = 1
    canvas.strokeRect(0.5, 0.5, width - 1, height - 1)
  }

  return {
    render(state) {
      render(state)
    },
    destroy() {
      ctx.container.removeEventListener("keydown", onKey)
    },
  }
}
