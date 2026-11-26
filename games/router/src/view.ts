import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import {
  DIRECTIONS,
  EAST,
  NORTH,
  SOUTH,
  WEST,
  analyzeCircuit,
  parCeiling,
  previewRotate,
  projectedScore,
  traceRotate,
  type Point,
  type RouterInput,
  type RouterState,
  type RotateTrace,
} from "./core"

const css = `
.cr-wrap {
  --cr-line: var(--arcade-line, rgba(148, 163, 184, 0.22));
  --cr-pipe-off: color-mix(in srgb, var(--arcade-fg, #e8eef5) 30%, transparent);
  --cr-pipe-on: var(--game-accent, #22d3ee);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  padding: 8px;
  border: 1px solid var(--cr-line);
  border-radius: 10px;
  background: var(--arcade-panel, #0b1118);
  outline: none;
  user-select: none;
  touch-action: manipulation;
}

.arcade[data-theme="light"] .cr-wrap {
  --cr-line: rgba(38, 42, 48, 0.22);
  --cr-pipe-off: rgba(38, 42, 48, 0.34);
}

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] .cr-wrap {
    --cr-line: rgba(38, 42, 48, 0.22);
    --cr-pipe-off: rgba(38, 42, 48, 0.34);
  }
}

.cr-wrap:focus-visible {
  outline: 2px solid var(--game-accent, #22d3ee);
  outline-offset: 2px;
}

.cr-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.cr-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--cr-line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 6%, transparent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cr-stat.is-accent {
  color: var(--game-accent, #22d3ee);
  border-color: color-mix(in srgb, var(--game-accent, #22d3ee) 38%, transparent);
}

.cr-stat.is-warn {
  color: var(--game-accent-2, #f59e0b);
  border-color: color-mix(in srgb, var(--game-accent-2, #f59e0b) 38%, transparent);
}

.cr-goal {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--game-accent, #22d3ee) 32%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--game-accent, #22d3ee) 6%, transparent);
}

.cr-goal.is-warn {
  border-color: color-mix(in srgb, var(--game-accent-2, #f59e0b) 52%, transparent);
  background: color-mix(in srgb, var(--game-accent-2, #f59e0b) 7%, transparent);
}

.cr-goal.is-met {
  border-color: color-mix(in srgb, var(--game-accent, #22d3ee) 62%, transparent);
  background: color-mix(in srgb, var(--game-accent, #22d3ee) 11%, transparent);
}

.cr-goal-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.cr-goal-target {
  font-weight: 700;
  color: var(--arcade-fg, #e8eef5);
}

.cr-goal-left {
  white-space: nowrap;
  font-weight: 600;
  color: var(--game-accent, #22d3ee);
}

.cr-goal-sep {
  color: var(--arcade-muted, #8b98a9);
  flex: none;
}

.cr-goal.is-warn .cr-goal-left {
  color: var(--game-accent-2, #f59e0b);
}

.cr-goal-track {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 12%, transparent);
  overflow: hidden;
}

.cr-goal-fill {
  height: 100%;
  width: 0%;
  border-radius: 999px;
  background: var(--game-accent, #22d3ee);
  transition: width 160ms ease-out;
}

.cr-goal.is-warn .cr-goal-fill {
  background: var(--game-accent-2, #f59e0b);
}

.cr-board {
  display: grid;
  grid-template-columns: repeat(var(--cr-w, 5), minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--cr-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 3%, transparent);
}

.cr-cell {
  appearance: none;
  position: relative;
  display: block;
  aspect-ratio: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--cr-line) 70%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 4%, transparent);
  color: var(--cr-pipe-off);
  cursor: pointer;
  transition: border-color 90ms ease, background 90ms ease;
}

.cr-cell.is-powered {
  color: var(--cr-pipe-on);
  background: color-mix(in srgb, var(--game-accent, #22d3ee) 8%, transparent);
}

.cr-cell.is-cursor {
  border-color: color-mix(in srgb, var(--game-accent, #22d3ee) 70%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--game-accent, #22d3ee) 45%, transparent);
}

.cr-cell:focus-visible {
  outline: 2px solid var(--game-accent, #22d3ee);
  outline-offset: 1px;
}

.cr-cell.is-ghost {
  border-color: var(--game-accent, #22d3ee);
}

.cr-cell.is-would-power::after,
.cr-cell.is-would-unpower::after {
  content: "";
  position: absolute;
  inset: 2px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 1;
}

.cr-cell.is-would-power::after {
  border: 1.5px dashed color-mix(in srgb, var(--game-accent, #22d3ee) 85%, transparent);
}

.cr-cell.is-would-unpower::after {
  border: 1.5px dashed color-mix(in srgb, var(--game-accent-2, #f59e0b) 90%, transparent);
}

.cr-cell.is-depowered {
  animation: cr-depower 160ms ease-out;
}

.cr-cell.is-turning {
  animation: cr-turn 160ms ease-out;
}

.cr-cell.is-wave {
  box-shadow: inset 0 0 0 2px var(--game-accent, #22d3ee);
  background: color-mix(in srgb, var(--game-accent, #22d3ee) 22%, transparent);
}

.cr-arm {
  position: absolute;
  display: block;
  border-radius: 2px;
  background: currentColor;
  pointer-events: none;
  z-index: 2;
}

.cr-arm[hidden] {
  display: none;
}

.cr-arm-n { left: 44%; top: 0; width: 12%; height: 50%; }
.cr-arm-e { top: 44%; right: 0; width: 50%; height: 12%; }
.cr-arm-s { left: 44%; bottom: 0; width: 12%; height: 50%; }
.cr-arm-w { top: 44%; left: 0; width: 50%; height: 12%; }

.cr-arm.is-leak {
  background: repeating-linear-gradient(
    135deg,
    var(--game-accent-2, #f59e0b) 0 3px,
    transparent 3px 6px
  );
}

.cr-ghost {
  position: absolute;
  display: block;
  box-sizing: border-box;
  border-style: solid;
  border-color: color-mix(in srgb, var(--game-accent, #22d3ee) 88%, transparent);
  background: color-mix(in srgb, var(--game-accent, #22d3ee) 14%, transparent);
  pointer-events: none;
  z-index: 1;
}

.cr-ghost[hidden] {
  display: none;
}

.cr-ghost.is-shared {
  background: transparent;
}

.cr-ghost-n { left: 36%; top: 0; width: 28%; height: 18%; border-width: 0 2px 2px 2px; border-radius: 0 0 4px 4px; }
.cr-ghost-e { top: 36%; right: 0; width: 18%; height: 28%; border-width: 2px 0 2px 2px; border-radius: 4px 0 0 4px; }
.cr-ghost-s { left: 36%; bottom: 0; width: 28%; height: 18%; border-width: 2px 2px 0 2px; border-radius: 4px 4px 0 0; }
.cr-ghost-w { top: 36%; left: 0; width: 18%; height: 28%; border-width: 2px 2px 2px 0; border-radius: 0 4px 4px 0; }

.cr-ghost-n.is-shared { border-bottom-width: 0; }
.cr-ghost-e.is-shared { border-left-width: 0; }
.cr-ghost-s.is-shared { border-top-width: 0; }
.cr-ghost-w.is-shared { border-right-width: 0; }

.cr-hub {
  position: absolute;
  left: 38%;
  top: 38%;
  width: 24%;
  height: 24%;
  border-radius: 50%;
  background: currentColor;
  pointer-events: none;
  z-index: 2;
}

.cr-cell.is-endpoint .cr-hub {
  left: 34%;
  top: 34%;
  width: 32%;
  height: 32%;
  border-radius: 2px;
  box-shadow: inset 0 0 0 2px var(--arcade-panel, #0b1118);
}

.cr-source {
  position: absolute;
  left: 30%;
  top: 30%;
  width: 40%;
  height: 40%;
  border: 2px solid var(--game-accent-2, #f59e0b);
  border-radius: 50%;
  pointer-events: none;
  z-index: 3;
}

.cr-source::after {
  content: "";
  position: absolute;
  left: 34%;
  top: 34%;
  width: 32%;
  height: 32%;
  border-radius: 50%;
  background: var(--game-accent-2, #f59e0b);
}

.cr-cell:not(.is-source) .cr-source {
  display: none;
}

.cr-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.cr-btn {
  appearance: none;
  padding: 6px 10px;
  border: 1px solid var(--cr-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 7%, transparent);
  color: var(--arcade-fg, #e8eef5);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}

.cr-btn:hover {
  border-color: color-mix(in srgb, var(--game-accent, #22d3ee) 55%, transparent);
  background: color-mix(in srgb, var(--game-accent, #22d3ee) 14%, transparent);
}

.cr-btn.is-primary {
  border-color: color-mix(in srgb, var(--game-accent, #22d3ee) 60%, transparent);
  color: var(--game-accent, #22d3ee);
}

.cr-help {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--game-accent, #22d3ee) 35%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--game-accent, #22d3ee) 8%, transparent);
  color: var(--arcade-fg, #e8eef5);
  font-size: 12px;
  line-height: 1.5;
}

.cr-help[hidden] {
  display: none;
}

.cr-help h3 {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--game-accent, #22d3ee);
}

.cr-help ul {
  margin: 0;
  padding-left: 16px;
}

.cr-help li {
  margin: 0 0 5px;
}

.cr-help li:last-child {
  margin-bottom: 0;
}

.cr-help strong {
  color: var(--arcade-fg, #e8eef5);
}

.cr-help em {
  color: var(--arcade-fg, #e8eef5);
}

.cr-status {
  margin: 0;
  min-height: 2.6em;
  text-align: center;
  color: var(--arcade-muted, #8b98a9);
  font-size: 11.5px;
  line-height: 1.4;
}

.cr-sr {
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

@keyframes cr-turn {
  0% { transform: rotate(0deg) scale(1); }
  60% { transform: rotate(12deg) scale(1.05); }
  100% { transform: rotate(0deg) scale(1); }
}

@keyframes cr-depower {
  0% { background: color-mix(in srgb, var(--game-accent-2, #f59e0b) 42%, transparent); }
  100% { background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 4%, transparent); }
}

@media (prefers-reduced-motion: reduce) {
  .cr-cell,
  .cr-goal-fill,
  .cr-btn {
    transition: none;
  }
  .cr-cell.is-depowered,
  .cr-cell.is-turning {
    animation: none;
  }
}
`

const SHAPE_NAMES: Readonly<Record<number, string>> = {
  1: "north endpoint",
  2: "east endpoint",
  4: "south endpoint",
  8: "west endpoint",
  5: "north-south straight",
  10: "east-west straight",
  3: "north-east elbow",
  6: "east-south elbow",
  12: "south-west elbow",
  9: "west-north elbow",
  7: "north-east-south tee",
  14: "east-south-west tee",
  13: "south-west-north tee",
  11: "west-north-east tee",
  15: "4-way cross",
}

const DIR_NAMES: Readonly<Record<number, string>> = {
  [NORTH]: "north",
  [EAST]: "east",
  [SOUTH]: "south",
  [WEST]: "west",
}

function popcount(mask: number): number {
  let count = 0
  for (const dir of DIRECTIONS) if ((mask & dir) !== 0) count += 1
  return count
}

function opposite(dir: number): number {
  return ((dir << 2) | (dir >> 2)) & 0b1111
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

function formatNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function keyOf(point: Point): string {
  return `${point.x},${point.y}`
}

function dirNames(mask: number): string {
  const names = DIRECTIONS.filter((dir) => (mask & dir) !== 0).map((dir) => DIR_NAMES[dir])
  return names.length === 1 ? names[0]! : names.join(" and ")
}

/** Preview power delta: `+g`, `-l`, or `+g / -l`. */
function previewDelta(preview: {
  readonly newlyPowered: readonly Point[]
  readonly lostPower: readonly Point[]
}): string {
  const gained = preview.newlyPowered.length
  const lost = preview.lostPower.length
  if (lost === 0) return `+${gained}`
  return gained > 0 ? `+${gained} / -${lost}` : `-${lost}`
}

function leakDirs(state: RouterState, index: number, mask: number): number[] {
  const x = index % state.width
  const y = Math.floor(index / state.width)
  const leaks: number[] = []
  for (const dir of DIRECTIONS) {
    if ((mask & dir) === 0) continue
    const dx = dir === EAST ? 1 : dir === WEST ? -1 : 0
    const dy = dir === SOUTH ? 1 : dir === NORTH ? -1 : 0
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || nx >= state.width || ny < 0 || ny >= state.height) {
      leaks.push(dir)
      continue
    }
    if ((state.masks[ny * state.width + nx]! & opposite(dir)) === 0) leaks.push(dir)
  }
  return leaks
}

export function view(ctx: ViewContext<RouterState, RouterInput>): GameView<RouterState> {
  ensureStyle("arcade-game-router", css)

  const wrap = el("div", "cr-wrap")
  wrap.tabIndex = 0
  wrap.setAttribute("role", "application")
  wrap.setAttribute("aria-roledescription", "circuit routing board")
  wrap.setAttribute(
    "aria-label",
    "Circuit Router. Arrow keys or W A S D move the cursor. Space, Enter, or click rotates the selected tile clockwise. Q, X, or right-click rotates it counter-clockwise. H shows or hides the guide. Power every tile from the centre source with zero open ends in as few turns as possible.",
  )

  const bar = el("div", "cr-bar")
  const modeStat = el("span", "cr-stat is-accent")
  const baseStat = el("span", "cr-stat")
  const turnsStat = el("span", "cr-stat")
  const estimateStat = el("span", "cr-stat is-accent")
  bar.append(modeStat, baseStat, turnsStat, estimateStat)

  const goalBox = el("div", "cr-goal")
  const goalRow = el("div", "cr-goal-row")
  const goalTarget = el("span", "cr-goal-target")
  const goalLeft = el("span", "cr-goal-left")
  goalRow.append(goalTarget, el("span", "cr-goal-sep", "·"), goalLeft)
  const goalTrack = el("div", "cr-goal-track")
  const goalFill = el("div", "cr-goal-fill")
  goalTrack.append(goalFill)
  goalBox.append(goalRow, goalTrack)

  const board = el("div", "cr-board")
  board.setAttribute("role", "grid")
  board.setAttribute("aria-label", "Circuit tile board")

  const controls = el("div", "cr-controls")
  const cwBtn = el("button", "cr-btn is-primary", "Rotate CW")
  const ccwBtn = el("button", "cr-btn", "Rotate CCW")
  const helpBtn = el("button", "cr-btn", "How to play")
  for (const button of [cwBtn, ccwBtn, helpBtn]) {
    button.type = "button"
    button.dataset.crControl = "true"
  }
  cwBtn.setAttribute("aria-label", "Rotate the selected tile clockwise")
  ccwBtn.setAttribute("aria-label", "Rotate the selected tile counter-clockwise")
  helpBtn.setAttribute("aria-expanded", "false")
  controls.append(cwBtn, ccwBtn, helpBtn)

  const help = el("div", "cr-help")
  help.hidden = true
  const helpTitle = el("h3", "", "How to play")
  const helpList = el("ul", "")
  const helpPoint = (label: string, body: string, emphasis = false): HTMLLIElement => {
    const li = document.createElement("li")
    li.append(el("strong", "", `${label}: `))
    if (emphasis) {
      const em = document.createElement("em")
      em.textContent = body
      li.append(em)
    } else {
      li.append(document.createTextNode(body))
    }
    return li
  }
  helpList.append(
    helpPoint(
      "Controls & win",
      "Select any tile with Arrows/WASD or pointer, rotate CW (Space/Enter/Click) or CCW (Q/X/Right-click), and power every tile from the center source with zero open ends.",
    ),
    helpPoint(
      "Worked example",
      "Example: if the center source points East and the tile beside it is a South–East elbow (disconnected on its West edge), one clockwise turn rotates it to West–South — aligning West-to-East to light it and routing power South into the tile below.",
      true,
    ),
    helpPoint(
      "Zero open ends",
      "Every tile must light up AND no pipe arm may point at a blank edge or grid border — an open leak blocks victory even if every tile is lit.",
    ),
    helpPoint(
      "Par & symmetric tiles",
      "4-way crosses are already aligned in every direction (rotating them does nothing and costs no turn); your score scales by par / turns against the board's par target, so fewer turns earn a higher score.",
    ),
  )
  help.append(helpTitle, helpList)

  const status = el("p", "cr-status")
  const live = el("div", "cr-sr")
  live.setAttribute("aria-live", "polite")
  live.setAttribute("aria-atomic", "true")

  wrap.append(bar, goalBox, board, controls, help, status, live)
  ctx.container.append(wrap)

  interface CellNodes {
    readonly button: HTMLButtonElement
    readonly arms: readonly HTMLElement[]
    readonly ghosts: readonly HTMLElement[]
  }

  const cells: CellNodes[] = []
  let builtWidth = 0
  let builtHeight = 0
  let cursorX = 0
  let cursorY = 0
  let buttonPreviewDir: 1 | -1 | null = null
  let prevState: RouterState | null = null
  let pendingRotate: { readonly x: number; readonly y: number; readonly dir: 1 | -1 } | null = null
  let lastOutcome = ""
  let lastBlocked = ""
  let lastRotated: Point | null = null
  let dirForTrace: 1 | -1 = 1
  let animTimer: number | null = null
  let animTurning: string | null = null
  let animDepowered: ReadonlySet<string> = new Set()
  let animWave: ReadonlySet<string> | null = null

  const guideKey = "router.guideSeen"
  let helpDismissed = ctx.host.storage.get<boolean>(guideKey) === true

  const prefersReducedMotion = (): boolean =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const setHelp = (open: boolean, remember = false): void => {
    help.hidden = !open
    helpBtn.textContent = open ? "Hide guide" : "How to play"
    helpBtn.setAttribute("aria-expanded", open ? "true" : "false")
    if (!open) {
      helpDismissed = true
      if (remember) ctx.host.storage.set(guideKey, true)
    }
  }
  setHelp(!helpDismissed)

  const cancelAnim = (): void => {
    if (animTimer !== null) {
      clearTimeout(animTimer)
      animTimer = null
    }
    animTurning = null
    animDepowered = new Set()
    animWave = null
  }

  const build = (state: RouterState): void => {
    builtWidth = state.width
    builtHeight = state.height
    cursorX = Math.min(cursorX, state.width - 1)
    cursorY = Math.min(cursorY, state.height - 1)
    cells.length = 0
    board.replaceChildren()
    board.style.setProperty("--cr-w", String(state.width))
    board.setAttribute("aria-label", `${state.width} by ${state.height} circuit tile board`)

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const button = el("button", "cr-cell")
        button.type = "button"
        button.setAttribute("role", "gridcell")
        const arms: HTMLElement[] = []
        const ghosts: HTMLElement[] = []
        for (const dir of DIRECTIONS) {
          const suffix = dir === NORTH ? "n" : dir === EAST ? "e" : dir === SOUTH ? "s" : "w"
          const arm = el("span", `cr-arm cr-arm-${suffix}`)
          const ghost = el("span", `cr-ghost cr-ghost-${suffix}`)
          ghost.hidden = true
          button.append(ghost, arm)
          arms.push(arm)
          ghosts.push(ghost)
        }
        button.append(el("span", "cr-hub"))
        button.append(el("span", "cr-source"))

        button.addEventListener("pointerenter", () => {
          if (ctx.state().phase !== "playing") return
          if (x === cursorX && y === cursorY && buttonPreviewDir === null) return
          cursorX = x
          cursorY = y
          buttonPreviewDir = null
          lastBlocked = ""
          paint(ctx.state())
        })
        button.addEventListener("focus", () => {
          if (x === cursorX && y === cursorY) return
          cursorX = x
          cursorY = y
          paint(ctx.state())
        })
        button.addEventListener("click", () => {
          cursorX = x
          cursorY = y
          rotateAt(x, y, 1)
        })
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault()
          cursorX = x
          cursorY = y
          rotateAt(x, y, -1)
        })

        board.append(button)
        cells.push({ button, arms, ghosts })
      }
    }
  }

  const renderCells = (state: RouterState): void => {
    if (state.width !== builtWidth || state.height !== builtHeight) build(state)
    const analysis = analyzeCircuit(state.masks, state.width, state.height, state.source)
    const sourceIndex = state.source.y * state.width + state.source.x
    const playing = state.phase === "playing"
    const preview =
      playing && buttonPreviewDir !== null
        ? previewRotate(state, cursorX, cursorY, buttonPreviewDir)
        : null
    const wouldPower = new Set((preview?.newlyPowered ?? []).map(keyOf))
    const wouldUnpower = new Set((preview?.lostPower ?? []).map(keyOf))
    const showGhost = preview?.valid === true

    for (let index = 0; index < cells.length; index += 1) {
      const node = cells[index]!
      const x = index % state.width
      const y = Math.floor(index / state.width)
      const mask = state.masks[index]!
      const powered = analysis.distances[index]! >= 0
      const isCursor = playing && x === cursorX && y === cursorY
      const key = `${x},${y}`
      const leaks = leakDirs(state, index, mask)

      const classes = ["cr-cell"]
      if (powered) classes.push("is-powered")
      if (isCursor) classes.push("is-cursor")
      if (isCursor && showGhost) classes.push("is-ghost")
      if (wouldPower.has(key)) classes.push("is-would-power")
      if (wouldUnpower.has(key)) classes.push("is-would-unpower")
      if (animTurning === key) classes.push("is-turning")
      if (animDepowered.has(key)) classes.push("is-depowered")
      if (animWave?.has(key)) classes.push("is-wave")
      if (popcount(mask) === 1) classes.push("is-endpoint")
      if (index === sourceIndex) classes.push("is-source")

      node.button.className = classes.join(" ")
      node.button.tabIndex = isCursor ? 0 : -1
      if (isCursor) node.button.setAttribute("aria-current", "true")
      else node.button.removeAttribute("aria-current")

      for (let at = 0; at < DIRECTIONS.length; at += 1) {
        const dir = DIRECTIONS[at]!
        const arm = node.arms[at]!
        const ghost = node.ghosts[at]!
        arm.hidden = (mask & dir) === 0
        arm.classList.toggle("is-leak", leaks.includes(dir))
        const ghostVisible = isCursor && showGhost && preview !== null && (preview.nextMask & dir) !== 0
        ghost.hidden = !ghostVisible
        ghost.classList.toggle("is-shared", ghostVisible && (mask & dir) !== 0)
      }

      const shape = SHAPE_NAMES[mask] ?? `${popcount(mask)}-way junction`
      const parts = [
        `Row ${y + 1}, column ${x + 1}`,
        shape,
        `open ${dirNames(mask)}`,
        powered ? "powered" : "unpowered",
      ]
      if (leaks.length > 0) parts.push(`${plural(leaks.length, "open end")}`)
      if (index === sourceIndex) parts.push("power source")
      if (isCursor) parts.push("selected")
      if (isCursor && showGhost && preview?.valid === true) {
        parts.push(
          `next ${buttonPreviewDir === -1 ? "counter-clockwise" : "clockwise"}: ${previewDelta(preview)} powered and ${plural(
            preview.danglingCount,
            "open end",
          )}`,
        )
      }
      if (isCursor && mask === 15) parts.push("4-way cross, no turn cost")
      node.button.setAttribute("aria-label", parts.join(", "))
    }
  }

  const playWaves = (trace: RotateTrace, state: RouterState): void => {
    cancelAnim()
    if (prefersReducedMotion()) {
      renderCells(state)
      return
    }

    animTurning = keyOf(trace.rotated)
    animDepowered = new Set(trace.lost.map(keyOf))

    // Zero-gain and pure de-powering turns still get one 160 ms cue frame.
    if (trace.waves.length === 0) {
      renderCells(state)
      animTimer = window.setTimeout(() => {
        animTimer = null
        animTurning = null
        animDepowered = new Set()
        animWave = null
        renderCells(ctx.state())
      }, 160)
      return
    }

    let waveIndex = 0
    const step = (): void => {
      if (waveIndex >= trace.waves.length) {
        animTimer = null
        animTurning = null
        animDepowered = new Set()
        animWave = null
        renderCells(ctx.state())
        return
      }
      animWave = new Set(trace.waves[waveIndex]!.map(keyOf))
      if (waveIndex > 0) {
        animTurning = null
        animDepowered = new Set()
      }
      renderCells(ctx.state())
      waveIndex += 1
      animTimer = window.setTimeout(step, 160)
    }
    step()
  }

  const previewSentence = (state: RouterState): string => {
    if (state.phase !== "playing" || buttonPreviewDir === null) return ""
    const index = cursorY * state.width + cursorX
    if (state.masks[index] === 15) {
      return `4-way cross at (${cursorX},${cursorY}): symmetric, no turn cost.`
    }
    const preview = previewRotate(state, cursorX, cursorY, buttonPreviewDir)
    if (!preview || !preview.valid) return ""
    const dirLabel = buttonPreviewDir === -1 ? "CCW" : "CW"
    return `Next ${dirLabel} at (${cursorX},${cursorY}): ${previewDelta(preview)} powered (${preview.poweredCount}/${
      state.width * state.height
    }), ${plural(preview.danglingCount, "open end")}.`
  }

  const statusText = (state: RouterState): string => {
    const totalCells = state.width * state.height
    if (lastBlocked) return lastBlocked
    if (state.phase === "won") {
      return `Circuit complete! All ${totalCells} tiles powered in ${state.rotationsUsed} turns (Par ${
        state.par
      }) for ${formatNumber(projectedScore(state))} pts.`
    }
    if (state.rotationsUsed === 0 && !lastOutcome) {
      return `Circuit offline — rotate tiles from the center source to power all ${totalCells} tiles with no open ends. ${previewSentence(
        state,
      )}`.trim()
    }
    const base = lastOutcome
      ? `${lastOutcome} ${previewSentence(state)}`.trim()
      : previewSentence(state)
    return base
  }

  const paint = (state: RouterState): void => {
    const totalCells = state.width * state.height
    const analysis = analyzeCircuit(state.masks, state.width, state.height, state.source)
    const overPar = Math.max(0, state.rotationsUsed - state.par)

    const previous = prevState
    const justRotated =
      pendingRotate !== null &&
      previous !== null &&
      state.rotationsUsed > previous.rotationsUsed &&
      previous.phase === "playing"

    if (justRotated && pendingRotate) {
      const before = analyzeCircuit(previous.masks, previous.width, previous.height, previous.source)
      let gained = 0
      let lost = 0
      for (let at = 0; at < analysis.distances.length; at += 1) {
        if (before.distances[at] === -1 && analysis.distances[at]! >= 0) gained += 1
        else if (before.distances[at]! >= 0 && analysis.distances[at] === -1) lost += 1
      }
      lastRotated = { x: pendingRotate.x, y: pendingRotate.y }
      lastBlocked = ""
      lastOutcome =
        gained > 0 && lost === 0
          ? `+${gained} powered (${analysis.poweredCount}/${totalCells}).`
          : gained === 0 && lost > 0
            ? `-${lost} powered (${analysis.poweredCount}/${totalCells}).`
            : gained > 0 && lost > 0
              ? `+${gained} / -${lost} powered (${analysis.poweredCount}/${totalCells}).`
              : `Rotated (${pendingRotate.x},${pendingRotate.y}) — ${plural(
                  analysis.danglingCount,
                  "open end",
                )} remain (${analysis.poweredCount}/${totalCells}).`
    }
    pendingRotate = null

    // Auto-collapse only on the first committed rotation, before any dismissal.
    if (justRotated && !helpDismissed) setHelp(false, true)

    modeStat.textContent = `${state.modeId === "hard" ? "Hard" : "Easy"} · ${state.width}×${state.height}`
    baseStat.textContent = `Target ${formatNumber(parCeiling(state.modeId, state.par))}`
    turnsStat.textContent = `Turns ${state.rotationsUsed} (Par ${state.par})`
    turnsStat.classList.toggle("is-warn", overPar > 0)
    estimateStat.textContent = `Est. ${formatNumber(projectedScore(state))}`

    const fill =
      state.phase === "won"
        ? 100
        : analysis.poweredCount === totalCells && analysis.danglingCount > 0
          ? 95
          : Math.round((analysis.poweredCount / totalCells) * 100)
    goalFill.style.width = `${fill}%`

    if (state.phase === "won") {
      goalTarget.textContent = `Circuit complete: ${totalCells}/${totalCells} powered · 0 open ends`
    } else if (analysis.poweredCount === totalCells && analysis.danglingCount > 0) {
      goalTarget.textContent = `All ${totalCells}/${totalCells} lit — close ${plural(
        analysis.danglingCount,
        "open end",
      )}`
    } else {
      goalTarget.textContent = `Power ${analysis.poweredCount}/${totalCells} tiles · ${plural(
        analysis.danglingCount,
        "open end",
      )}`
    }
    goalLeft.textContent = `${plural(state.rotationsUsed, "turn")} · Par ${state.par}`

    const warn =
      state.phase === "playing" &&
      analysis.poweredCount === totalCells &&
      analysis.danglingCount > 0
    goalBox.classList.toggle("is-warn", warn)
    goalBox.classList.toggle("is-met", state.phase === "won")

    status.textContent = statusText(state)

    if (state.phase === "won") {
      if (previous === null || previous.phase !== "won") {
        live.textContent = `Circuit complete. All ${totalCells} tiles powered in ${state.rotationsUsed} turns.`
        ctx.host.audio.play("win")
      }
    } else if (justRotated) {
      live.textContent = lastOutcome
      if (lastRotated) ctx.host.audio.play("turn")
    }

    renderCells(state)
    if (justRotated && previous !== null && lastRotated) {
      const trace = traceRotate(previous, lastRotated.x, lastRotated.y, dirForTrace)
      if (trace) playWaves(trace, state)
    }

    prevState = state
  }

  const rotateAt = (x: number, y: number, dir: 1 | -1): void => {
    const state = ctx.state()
    if (state.phase !== "playing") {
      lastBlocked = "Circuit run finished — start a new run to play again."
      cancelAnim()
      paint(state)
      live.textContent = lastBlocked
      return
    }
    const index = y * state.width + x
    if (state.masks[index] === 15) {
      lastBlocked = "4-way cross is already connected in all directions — no turn used."
      lastOutcome = ""
      buttonPreviewDir = null
      cancelAnim()
      paint(state)
      live.textContent = lastBlocked
      ctx.host.audio.play("turn")
      return
    }

    cancelAnim()
    lastBlocked = ""
    cursorX = x
    cursorY = y
    buttonPreviewDir = null
    dirForTrace = dir
    pendingRotate = { x, y, dir }
    ctx.dispatch({ type: "rotate", x, y, dir })
  }

  const move = (dx: number, dy: number): void => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    cancelAnim()
    lastBlocked = ""
    cursorX = (cursorX + dx + state.width) % state.width
    cursorY = (cursorY + dy + state.height) % state.height
    buttonPreviewDir = null
    paint(state)
    const index = cursorY * state.width + cursorX
    cells[index]?.button.focus()
  }

  const bindRotatePreview = (button: HTMLButtonElement, dir: 1 | -1): void => {
    const show = (): void => {
      if (ctx.state().phase !== "playing") return
      buttonPreviewDir = dir
      paint(ctx.state())
    }
    const clear = (): void => {
      if (buttonPreviewDir === null) return
      buttonPreviewDir = null
      paint(ctx.state())
    }
    button.addEventListener("pointerenter", show)
    button.addEventListener("focus", show)
    button.addEventListener("pointerleave", clear)
    button.addEventListener("blur", clear)
  }
  bindRotatePreview(cwBtn, 1)
  bindRotatePreview(ccwBtn, -1)

  cwBtn.addEventListener("click", () => rotateAt(cursorX, cursorY, 1))
  ccwBtn.addEventListener("click", () => rotateAt(cursorX, cursorY, -1))
  helpBtn.addEventListener("click", () => {
    const open = help.hidden
    setHelp(open, !open)
  })
  for (const button of [cwBtn, ccwBtn, helpBtn]) {
    button.addEventListener("pointerup", () => wrap.focus())
  }

  const isControl = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && target.closest("[data-cr-control]") !== null

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key
    const handled =
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "w" ||
      key === "W" ||
      key === "a" ||
      key === "A" ||
      key === "s" ||
      key === "S" ||
      key === "d" ||
      key === "D" ||
      key === " " ||
      key === "Enter" ||
      key === "q" ||
      key === "Q" ||
      key === "x" ||
      key === "X" ||
      key === "h" ||
      key === "H"
    if (!handled) return
    // Controls handle their own Enter/Space activation.
    if ((key === "Enter" || key === " ") && isControl(event.target)) return

    event.preventDefault()
    if (event.repeat) return

    if (key === "h" || key === "H") {
      const open = help.hidden
      setHelp(open, !open)
      return
    }

    if (key === " " || key === "Enter") {
      rotateAt(cursorX, cursorY, 1)
      return
    }
    if (key === "q" || key === "Q" || key === "x" || key === "X") {
      rotateAt(cursorX, cursorY, -1)
      return
    }
    if (key === "ArrowUp" || key === "w" || key === "W") move(0, -1)
    else if (key === "ArrowDown" || key === "s" || key === "S") move(0, 1)
    else if (key === "ArrowLeft" || key === "a" || key === "A") move(-1, 0)
    else if (key === "ArrowRight" || key === "d" || key === "D") move(1, 0)
  }

  wrap.addEventListener("pointerdown", (event) => {
    if (isControl(event.target)) return
    wrap.focus()
  })
  ctx.container.addEventListener("keydown", onKeyDown)

  return {
    render(state) {
      cursorX = Math.min(cursorX, state.width - 1)
      cursorY = Math.min(cursorY, state.height - 1)
      paint(state)
    },
    destroy() {
      cancelAnim()
      ctx.container.removeEventListener("keydown", onKeyDown)
      wrap.remove()
    },
  }
}
