import type { GameView, ViewContext } from "@await-arcade/contract"
import type { BreakoutInput, BreakoutState } from "./core"

const BRICK_COLORS = ["#a3e635", "#4ade80", "#38bdf8", "#f472b6", "#fbbf24"]
const COLS = 8

export function view(ctx: ViewContext<BreakoutState, BreakoutInput>): GameView<BreakoutState> {
  const canvas = ctx.ctx2d
  if (!canvas) throw new Error("Breakout needs a canvas surface")

  const pointerTarget = (event: PointerEvent): number | undefined => {
    const surface = ctx.container.querySelector("canvas")
    if (!surface) return undefined
    const rect = surface.getBoundingClientRect()
    if (rect.width === 0) return undefined
    return ((event.clientX - rect.left) / rect.width) * ctx.size().width
  }

  const onPointerMove = (event: PointerEvent): void => {
    const target = pointerTarget(event)
    if (target !== undefined) ctx.dispatch({ target })
  }

  const onPointerDown = (event: PointerEvent): void => {
    const target = pointerTarget(event)
    if (target !== undefined) ctx.dispatch({ target })
  }

  const onPointerCancel = (): void => {
    ctx.dispatch({ target: ctx.state().paddleX })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()
    if (key === "arrowleft" || key === "a") {
      event.preventDefault()
      ctx.dispatch({ left: true })
    } else if (key === "arrowright" || key === "d") {
      event.preventDefault()
      ctx.dispatch({ right: true })
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()
    if (key === "arrowleft" || key === "a") ctx.dispatch({ left: false })
    else if (key === "arrowright" || key === "d") ctx.dispatch({ right: false })
  }

  globalThis.addEventListener("keydown", onKeyDown)
  globalThis.addEventListener("keyup", onKeyUp)
  ctx.container.addEventListener("pointermove", onPointerMove)
  ctx.container.addEventListener("pointerdown", onPointerDown)
  ctx.container.addEventListener("pointercancel", onPointerCancel)

  const render = (state: BreakoutState): void => {
    const width = state.width
    const height = state.height

    canvas.fillStyle = "#05080c"
    canvas.fillRect(0, 0, width, height)

    canvas.strokeStyle = "rgba(148, 163, 184, 0.08)"
    canvas.lineWidth = 1
    for (let x = 0; x <= width; x += 20) {
      canvas.beginPath()
      canvas.moveTo(x + 0.5, 0)
      canvas.lineTo(x + 0.5, height)
      canvas.stroke()
    }
    for (let y = 0; y <= height; y += 20) {
      canvas.beginPath()
      canvas.moveTo(0, y + 0.5)
      canvas.lineTo(width, y + 0.5)
      canvas.stroke()
    }

    const brickWidth = (width - 24 - 4 * (COLS - 1)) / COLS
    state.bricks.forEach((alive, index) => {
      if (!alive) return
      const row = Math.floor(index / COLS)
      const column = index % COLS
      canvas.fillStyle = BRICK_COLORS[row] ?? "#a3e635"
      canvas.globalAlpha = 0.9
      canvas.fillRect(12 + column * (brickWidth + 4), 30 + row * 16, brickWidth, 12)
    })
    canvas.globalAlpha = 1

    canvas.fillStyle = "#a3e635"
    canvas.shadowColor = "#a3e635"
    canvas.shadowBlur = 12
    canvas.fillRect(state.paddleX - state.paddleWidth / 2, state.paddleY, state.paddleWidth, 7)

    canvas.fillStyle = "#f8fafc"
    canvas.shadowColor = "#f8fafc"
    canvas.shadowBlur = 10
    canvas.beginPath()
    canvas.arc(state.ballX, state.ballY, 4, 0, Math.PI * 2)
    canvas.fill()
    canvas.shadowBlur = 0

    canvas.fillStyle = "rgba(226, 232, 240, 0.55)"
    canvas.font = "9px ui-monospace, Menlo, monospace"
    canvas.fillText(`SCORE ${state.score}`, 12, 16)
    canvas.fillText(`BRICKS ${state.hits}/40`, width - 78, 16)
  }

  return {
    render,
    destroy() {
      globalThis.removeEventListener("keydown", onKeyDown)
      globalThis.removeEventListener("keyup", onKeyUp)
      ctx.container.removeEventListener("pointermove", onPointerMove)
      ctx.container.removeEventListener("pointerdown", onPointerDown)
      ctx.container.removeEventListener("pointercancel", onPointerCancel)
    },
  }
}
