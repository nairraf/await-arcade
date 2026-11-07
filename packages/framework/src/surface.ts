import type { Display, SurfaceSize } from "@await-arcade/contract"

export interface Surface {
  readonly canvas: HTMLCanvasElement | null
  readonly ctx2d: CanvasRenderingContext2D | null
  size(): SurfaceSize
  dispose(): void
}

export function createSurface(container: HTMLElement, display: Display): Surface {
  if (display.surface !== "canvas") {
    return {
      canvas: null,
      ctx2d: null,
      size: () => ({ width: display.width, height: display.height, dpr: 1 }),
      dispose: () => undefined,
    }
  }

  const canvas = document.createElement("canvas")
  canvas.className = "arcade-canvas"
  canvas.setAttribute("role", "img")
  canvas.setAttribute("aria-label", "Game canvas")

  const ctx2d = canvas.getContext("2d")
  if (!ctx2d) throw new Error("Await Arcade: Canvas 2D is unavailable")

  let dpr = 1

  const apply = (): void => {
    dpr = Math.min(globalThis.devicePixelRatio || 1, 3)
    canvas.width = Math.round(display.width * dpr)
    canvas.height = Math.round(display.height * dpr)
    canvas.style.aspectRatio = `${display.width} / ${display.height}`
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx2d.imageSmoothingEnabled = !display.pixelated
  }

  container.replaceChildren(canvas)
  apply()

  const onResize = (): void => apply()
  globalThis.addEventListener("resize", onResize)

  return {
    canvas,
    ctx2d,
    size: () => ({ width: display.width, height: display.height, dpr }),
    dispose: () => {
      globalThis.removeEventListener("resize", onResize)
      canvas.remove()
    },
  }
}
