import type { GameView, ViewContext } from "@await-arcade/contract"
import {
  BRICK_COLS,
  brickRect,
  speedFactor,
  type BrickstormInput,
  type BrickstormState,
} from "./core"

const BAND_COLORS = [
  ["#a3e635", "#4ade80"],
  ["#38bdf8", "#818cf8"],
  ["#f472b6", "#fb7185"],
]

export function view(ctx: ViewContext<BrickstormState, BrickstormInput>): GameView<BrickstormState> {
  const canvas = ctx.ctx2d
  if (!canvas) throw new Error("Brickstorm needs a canvas surface")

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

  const render = (state: BrickstormState): void => {
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

    state.bricks.forEach((alive, index) => {
      if (!alive) return
      const row = Math.floor(index / BRICK_COLS)
      const band = Math.floor(row / 2)
      const rect = brickRect(index)
      const kind = state.kinds[index]
      const armor = state.armor[index] ?? 0

      let color = BAND_COLORS[band]?.[row % 2] ?? "#a3e635"
      if (armor === 3) color = "#fbbf24"
      else if (armor === 2) color = "#cbd5e1"
      else if (armor === 1) color = "#d97706"
      else if (kind === "save") color = "#67e8f9"
      else if (kind === "explosive") color = "#fb923c"

      canvas.fillStyle = color
      canvas.globalAlpha = 0.92
      canvas.fillRect(rect.x, rect.y, rect.w, rect.h)
      canvas.globalAlpha = 1

      if (armor > 0) {
        canvas.fillStyle = "rgba(15, 23, 42, 0.7)"
        for (let pip = 0; pip < armor; pip += 1) {
          canvas.fillRect(rect.x + 3 + pip * 4, rect.y + rect.h - 4, 2, 2)
        }
      } else if (kind === "save") {
        canvas.strokeStyle = "#ecfeff"
        canvas.lineWidth = 1.5
        canvas.beginPath()
        canvas.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, 2.5, 0, Math.PI * 2)
        canvas.stroke()
      } else if (kind === "explosive") {
        const cx = rect.x + rect.w / 2
        const cy = rect.y + rect.h / 2
        canvas.strokeStyle = "#7c2d12"
        canvas.lineWidth = 1.5
        canvas.beginPath()
        canvas.moveTo(cx - 3, cy)
        canvas.lineTo(cx + 3, cy)
        canvas.moveTo(cx, cy - 3)
        canvas.lineTo(cx, cy + 3)
        canvas.stroke()
      }
    })

    canvas.fillStyle = "#fb923c"
    canvas.shadowColor = "#fb923c"
    canvas.shadowBlur = 12
    canvas.fillRect(state.paddleX - state.paddleWidth / 2, state.paddleY, state.paddleWidth, 7)

    canvas.fillStyle = "#f8fafc"
    canvas.shadowColor = "#f8fafc"
    canvas.shadowBlur = 10
    canvas.beginPath()
    canvas.arc(state.ballX, state.ballY, 4, 0, Math.PI * 2)
    canvas.fill()
    canvas.shadowBlur = 0

    canvas.fillStyle = "rgba(226, 232, 240, 0.8)"
    canvas.font = "9px ui-monospace, Menlo, monospace"
    canvas.fillText(`SCORE ${state.score}`, 12, 16)
    canvas.fillText(`BRICKS ${state.hits}/48`, width - 78, 16)

    if (!state.ballLive) {
      const remaining = Math.max(1, Math.ceil((state.serveUntilTick - state.ticks) / 60))
      canvas.fillStyle = "#fb923c"
      canvas.font = "bold 18px ui-monospace, Menlo, monospace"
      canvas.textAlign = "center"
      canvas.fillText(`READY: ${remaining}`, width / 2, height * 0.44)
      canvas.textAlign = "left"
    }

    const remaining = state.saveUntilTick - state.ticks
    if (remaining > 0) {
      canvas.strokeStyle = "rgba(103, 232, 249, 0.55)"
      canvas.lineWidth = 2
      canvas.beginPath()
      canvas.moveTo(0, height - 3)
      canvas.lineTo(width, height - 3)
      canvas.stroke()

      canvas.fillStyle = "#67e8f9"
      canvas.fillText(`SAVE ${(remaining / 60).toFixed(1)}s`, width - 64, height - 8)
    }

    if (state.speedLevel > 0) {
      canvas.fillStyle = "#fb923c"
      canvas.fillText(`SPEED x${speedFactor(state).toFixed(2)}`, 12, height - 8)
    }
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
