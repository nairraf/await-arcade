import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import {
  DIRS,
  MAX_SCORE,
  OVER_PAR_PENALTY,
  WIN_FLOOR,
  findStuckCrate,
  modeBase,
  previewMove,
  toPoint,
  traceMove,
  type CrateInput,
  type CrateState,
  type MoveDir,
  type MovePreview,
  type MoveTrace,
  type Point,
} from "./core"

const css = `
.cp-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  outline: none;
  user-select: none;
  touch-action: manipulation;
}

.cp-wrap:focus-visible {
  outline: 2px solid var(--game-accent, #f59e0b);
  outline-offset: 3px;
  border-radius: 8px;
}

.cp-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cp-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.2));
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cp-stat.is-accent {
  color: var(--game-accent, #f59e0b);
  border-color: color-mix(in srgb, var(--game-accent, #f59e0b) 38%, transparent);
}

.cp-stat.is-live {
  color: var(--game-accent-2, #38bdf8);
  border-color: color-mix(in srgb, var(--game-accent-2, #38bdf8) 38%, transparent);
}

.cp-goal {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--game-accent, #f59e0b) 32%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--game-accent, #f59e0b) 6%, transparent);
}

.cp-goal.is-warn {
  border-color: color-mix(in srgb, var(--game-accent-2, #38bdf8) 48%, transparent);
  background: color-mix(in srgb, var(--game-accent-2, #38bdf8) 7%, transparent);
}

.cp-goal.is-met {
  border-color: color-mix(in srgb, var(--game-accent, #f59e0b) 70%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--game-accent, #f59e0b) 42%, transparent);
}

.cp-goal-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.cp-goal-target {
  font-weight: 700;
  color: var(--arcade-fg, #e8eef5);
}

.cp-goal-left {
  font-weight: 600;
  color: var(--game-accent, #f59e0b);
  white-space: nowrap;
}

.cp-goal.is-warn .cp-goal-left {
  color: var(--game-accent-2, #38bdf8);
}

.cp-goal-track {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e8eef5) 12%, transparent);
  overflow: hidden;
}

.cp-goal-fill {
  height: 100%;
  width: 0%;
  border-radius: 999px;
  background: var(--game-accent, #f59e0b);
  transition: width 180ms ease-out;
}

.cp-goal.is-warn .cp-goal-fill {
  background: var(--game-accent-2, #38bdf8);
}

.cp-board {
  display: grid;
  grid-template-columns: repeat(var(--cp-cols, 7), minmax(0, 1fr));
  gap: 4px;
  width: 100%;
  padding: 5px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.22));
  border-radius: 10px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 3%, transparent);
}

.cp-cell {
  appearance: none;
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 4%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font: inherit;
  font-size: clamp(13px, 4vw, 18px);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: border-color 90ms ease, background 90ms ease, transform 70ms ease;
}

.cp-cell:active:not(:disabled) {
  transform: scale(0.94);
}

.cp-cell.is-wall {
  cursor: default;
  border-color: color-mix(in srgb, var(--arcade-fg, #e6edf3) 20%, transparent);
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--arcade-fg, #e6edf3) 16%, transparent),
    color-mix(in srgb, var(--arcade-fg, #e6edf3) 16%, transparent) 4px,
    color-mix(in srgb, var(--arcade-fg, #e6edf3) 5%, transparent) 4px,
    color-mix(in srgb, var(--arcade-fg, #e6edf3) 5%, transparent) 8px
  );
}

.cp-cell.is-goal {
  border-color: color-mix(in srgb, var(--game-accent, #f59e0b) 46%, transparent);
  background: color-mix(in srgb, var(--game-accent, #f59e0b) 7%, transparent);
}

.cp-cell.is-goal .cp-glyph {
  color: color-mix(in srgb, var(--game-accent, #f59e0b) 78%, var(--arcade-fg, #e6edf3));
}

.cp-cell.is-crate {
  border-color: color-mix(in srgb, var(--game-accent-2, #38bdf8) 60%, transparent);
  background: color-mix(in srgb, var(--game-accent-2, #38bdf8) 16%, transparent);
  color: var(--game-accent-2, #38bdf8);
}

.cp-cell.is-crate.is-on-goal {
  border-color: color-mix(in srgb, var(--game-accent, #f59e0b) 80%, transparent);
  background: color-mix(in srgb, var(--game-accent, #f59e0b) 20%, transparent);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--game-accent, #f59e0b) 46%, transparent);
  color: var(--game-accent, #f59e0b);
}

.cp-cell.is-operator {
  border-color: color-mix(in srgb, var(--arcade-fg, #e6edf3) 40%, transparent);
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 12%, transparent);
}

.cp-cell.is-operator.is-goal {
  border-color: color-mix(in srgb, var(--game-accent, #f59e0b) 64%, transparent);
}

.cp-cell.is-push-target {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--game-accent-2, #38bdf8) 45%, transparent);
}

.cp-cell.is-would-goal {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--game-accent, #f59e0b) 78%, transparent);
}

.cp-cell.is-would-stick {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, #ef4444 75%, transparent);
}

.cp-cell.is-blocked-push {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, #ef4444 60%, transparent);
}

.cp-cell.is-preview-step {
  border-color: var(--arcade-fg, #e6edf3);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--arcade-fg, #e6edf3) 55%, transparent);
}

.cp-cell.is-blocked-push::after {
  content: "×";
  position: absolute;
  right: 2px;
  bottom: 0;
  font-size: 9px;
  color: #ef4444;
}

.cp-cell.is-on-goal::after {
  content: "✓";
  position: absolute;
  right: 3px;
  top: 1px;
  font-size: 9px;
  color: var(--game-accent, #f59e0b);
}

.cp-glyph {
  pointer-events: none;
  line-height: 1;
}

.cp-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cp-dpad {
  display: inline-flex;
  gap: 4px;
}

.cp-btn {
  appearance: none;
  padding: 6px 10px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.25));
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 7%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}

.cp-btn:hover:not(:disabled),
.cp-btn:focus-visible {
  border-color: color-mix(in srgb, var(--game-accent, #f59e0b) 55%, transparent);
  background: color-mix(in srgb, var(--game-accent, #f59e0b) 14%, transparent);
}

.cp-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.cp-btn.is-primary {
  border-color: color-mix(in srgb, var(--game-accent, #f59e0b) 60%, transparent);
  color: var(--game-accent, #f59e0b);
}

.cp-help {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--game-accent, #f59e0b) 35%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--game-accent, #f59e0b) 8%, transparent);
  color: var(--arcade-fg, #e8eef5);
  font-size: 12px;
  line-height: 1.5;
}

.cp-help[hidden] {
  display: none;
}

.cp-help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.cp-help h3 {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--game-accent, #f59e0b);
}

.cp-help-legend {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--arcade-muted, #8b98a9);
}

.cp-help-swatch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cp-help-swatch::before {
  content: "";
  width: 9px;
  height: 9px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 2px var(--game-accent-2, #38bdf8);
}

.cp-help-swatch.is-goal::before {
  box-shadow: inset 0 0 0 2px var(--game-accent, #f59e0b);
}

.cp-help-swatch.is-trap::before {
  box-shadow: inset 0 0 0 2px #ef4444;
}

.cp-help ul {
  margin: 0;
  padding-left: 16px;
}

.cp-help li {
  margin: 0 0 5px;
}

.cp-help li:last-child {
  margin-bottom: 0;
}

.cp-help strong {
  color: var(--arcade-fg, #e8eef5);
}

.cp-hint {
  margin: 0;
  min-height: 2.8em;
  text-align: center;
  color: var(--arcade-muted, #8b98a9);
  font-size: 11.5px;
  line-height: 1.45;
}

.cp-sr {
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

@keyframes cp-push {
  0% { transform: scale(0.82); }
  60% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

@keyframes cp-step {
  0% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

@keyframes cp-goal {
  0% { box-shadow: inset 0 0 0 2px var(--game-accent, #f59e0b); }
  50% { box-shadow: 0 0 12px color-mix(in srgb, var(--game-accent, #f59e0b) 80%, transparent); }
  100% { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--game-accent, #f59e0b) 46%, transparent); }
}

@keyframes cp-stuck {
  0%, 100% { box-shadow: inset 0 0 0 2px #ef4444; }
  50% { box-shadow: 0 0 14px #ef4444; }
}

.cp-cell.is-pushed {
  animation: cp-push 180ms ease-out;
}

.cp-cell.is-pushed.is-goal-flash {
  animation: cp-push 180ms ease-out, cp-goal 180ms ease-out;
}

.cp-cell.is-stepped {
  animation: cp-step 140ms ease-out;
}

.cp-cell.is-stuck-flash {
  animation: cp-stuck 260ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .cp-cell,
  .cp-btn,
  .cp-goal-fill {
    transition: none;
  }
  .cp-cell.is-pushed,
  .cp-cell.is-pushed.is-goal-flash,
  .cp-cell.is-stepped,
  .cp-cell.is-stuck-flash {
    animation: none;
  }
}
`

function numberText(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function pointText(point: Point): string {
  return `(${point.x},${point.y})`
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1)
}

function moveInput(dir: MoveDir): CrateInput {
  return { type: "move", dir }
}

function projectedScore(state: CrateState): number {
  const overPar = Math.max(0, state.movesUsed - state.par)
  return Math.min(
    MAX_SCORE,
    Math.max(WIN_FLOOR, modeBase(state.modeId) - overPar * OVER_PAR_PENALTY),
  )
}

function cratesOnGoals(state: CrateState): number {
  const goalSet = new Set(state.goals)
  return state.crates.filter((cell) => goalSet.has(cell)).length
}

function isAdjacentDir(state: CrateState, cell: number): MoveDir | null {
  const ox = state.operator % state.width
  const oy = Math.floor(state.operator / state.width)
  const x = cell % state.width
  const y = Math.floor(cell / state.width)
  const dx = x - ox
  const dy = y - oy
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null
  if (dx === 1) return "right"
  if (dx === -1) return "left"
  if (dy === 1) return "down"
  return "up"
}

const KEY_DIRS: Readonly<Record<string, MoveDir>> = {
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowLeft: "left",
  w: "up",
  W: "up",
  d: "right",
  D: "right",
  s: "down",
  S: "down",
  a: "left",
  A: "left",
}

interface AdjacentPush {
  readonly dir: MoveDir
  readonly preview: MovePreview
}

function adjacentPushes(state: CrateState): AdjacentPush[] {
  if (state.phase !== "playing") return []
  const pushes: AdjacentPush[] = []
  for (const dir of DIRS) {
    const preview = previewMove(state, dir)
    if (preview !== null && preview.pushedFrom !== null) pushes.push({ dir, preview })
  }
  return pushes
}

export interface PreviewCell {
  readonly classes: readonly string[]
  readonly aria: string
}

/** Pure per-cell preview: base state classes plus valid-push affordances. */
function previewCellWithPushes(
  state: CrateState,
  cell: number,
  pushes: readonly AdjacentPush[],
): PreviewCell {
  const x = cell % state.width
  const y = Math.floor(cell / state.width)
  const classes: string[] = []
  const parts: string[] = [`Column ${x + 1}, row ${y + 1}`]

  const wall = state.walls[cell] === true
  const goal = state.goals.includes(cell)
  const crate = state.crates.includes(cell)
  const operator = state.operator === cell

  if (wall) classes.push("is-wall")
  if (goal) classes.push("is-goal")
  if (crate) classes.push("is-crate")
  if (crate && goal) classes.push("is-on-goal")
  if (operator) classes.push("is-operator")

  if (wall) {
    parts.push("wall")
    return { classes, aria: parts.join(", ") }
  }

  if (goal) parts.push("goal pad")
  if (crate) parts.push(goal ? "crate on goal" : "crate")
  if (operator) parts.push("operator")
  if (!crate && !goal && !operator) parts.push("empty floor")

  const push = pushes.find(
    (entry) =>
      entry.preview.pushedFrom !== null &&
      entry.preview.pushedFrom.y * state.width + entry.preview.pushedFrom.x === cell,
  )
  if (push) {
    if (!push.preview.valid) {
      classes.push("is-blocked-push")
      parts.push(`push ${push.dir} blocked`)
    } else if (push.preview.wouldStick) {
      parts.push(`push ${push.dir} would trap the crate`)
    } else if (push.preview.landsOnGoal) {
      parts.push(`push ${push.dir} would land on goal`)
    } else {
      parts.push(`push ${push.dir} available`)
    }
  }

  const receives = pushes.find(
    (entry) =>
      entry.preview.valid &&
      entry.preview.pushedTo !== null &&
      entry.preview.pushedTo.y * state.width + entry.preview.pushedTo.x === cell,
  )
  if (receives) {
    classes.push("is-push-target")
    if (receives.preview.landsOnGoal) classes.push("is-would-goal")
    if (receives.preview.wouldStick) classes.push("is-would-stick")
    parts.push(`would receive a crate pushed ${receives.dir}`)
  }

  if (state.phase === "playing" && isAdjacentDir(state, cell) !== null) {
    parts.push("click to move here")
  }

  return { classes, aria: parts.join(", ") }
}

/** Exported for node tests; the view reuses the same decision path. */
export function previewCell(state: CrateState, cell: number): PreviewCell {
  return previewCellWithPushes(state, cell, adjacentPushes(state))
}

interface AnimState {
  readonly opCell: number | null
  readonly crateCell: number | null
  readonly goalFlash: boolean
  readonly stuckCell: number | null
}

export function view(
  ctx: ViewContext<CrateState, CrateInput>,
): GameView<CrateState> {
  ensureStyle("arcade-game-crates", css)

  interface CellView {
    readonly button: HTMLButtonElement
    readonly glyph: HTMLElement
  }

  const wrap = el("div", "cp-wrap")
  wrap.tabIndex = 0
  wrap.setAttribute("role", "application")
  wrap.setAttribute("aria-roledescription", "crate pusher board")
  wrap.setAttribute(
    "aria-label",
    "Crate Pusher. Move the operator one cell at a time with the arrow keys or W A S D, or click an adjacent tile, to push every crate onto a goal pad without trapping a crate in a corner or running out of moves. H opens or hides the guide.",
  )

  const bar = el("div", "cp-bar")
  const modeStat = el("span", "cp-stat is-accent")
  const baseStat = el("span", "cp-stat")
  const movesStat = el("span", "cp-stat")
  const estStat = el("span", "cp-stat is-live")
  bar.append(modeStat, baseStat, movesStat, estStat)

  const goalBox = el("div", "cp-goal")
  const goalRow = el("div", "cp-goal-row")
  const goalTarget = el("span", "cp-goal-target")
  const goalLeft = el("span", "cp-goal-left")
  goalRow.append(goalTarget, goalLeft)
  const goalTrack = el("div", "cp-goal-track")
  const goalFill = el("div", "cp-goal-fill")
  goalTrack.append(goalFill)
  goalBox.append(goalRow, goalTrack)

  const board = el("div", "cp-board")
  board.setAttribute("role", "grid")
  board.setAttribute("aria-label", "Crate grid")

  const cells: CellView[] = []

  const controls = el("div", "cp-controls")
  const dpad = el("div", "cp-dpad")
  const dpadButtons: Array<{ readonly dir: MoveDir; readonly button: HTMLButtonElement }> = []
  for (const dir of DIRS) {
    const label =
      dir === "up" ? "↑ Up" : dir === "right" ? "→ Right" : dir === "down" ? "↓ Down" : "← Left"
    const button = el("button", "cp-btn", label)
    button.type = "button"
    button.dataset.cpControl = "true"
    button.setAttribute("aria-label", `Move ${dir}`)
    dpad.append(button)
    dpadButtons.push({ dir, button })
  }
  const helpBtn = el("button", "cp-btn is-primary", "How to play")
  helpBtn.type = "button"
  helpBtn.dataset.cpControl = "true"
  helpBtn.setAttribute("aria-expanded", "true")
  controls.append(dpad, helpBtn)

  const help = el("div", "cp-help")
  const helpHead = el("div", "cp-help-head")
  const helpLegend = el("div", "cp-help-legend")
  helpLegend.append(
    el("span", "cp-help-swatch", "Push"),
    el("span", "cp-help-swatch is-goal", "Goal"),
    el("span", "cp-help-swatch is-trap", "Trap"),
  )
  helpHead.append(el("h3", "", "How to play"), helpLegend)

  const helpRule = (label: string, body: string): HTMLLIElement => {
    const li = document.createElement("li")
    li.append(el("strong", "", `${label}: `), body)
    return li
  }

  const helpList = el("ul", "")
  helpList.append(
    helpRule(
      "Controls & win",
      "Move the operator orthogonally with Arrows/WASD or click/tap an adjacent tile to push every crate onto a goal pad within the move budget.",
    ),
    helpRule(
      "Worked example",
      "Example: if the operator stands left of a crate and an empty floor square sits to the crate's right, pressing Right steps onto the crate's square and pushes the crate one cell right — if a wall or second crate sits behind it, the push is refused and costs no move.",
    ),
    helpRule(
      "Corner trap",
      "Pushing a crate into any non-goal corner (two perpendicular walls or board borders) permanently traps it and immediately ends the run as a loss.",
    ),
    helpRule(
      "Par & scoring",
      "Finishing at or under Par earns the full base score (2,000 Easy / 4,000 Hard); each move over Par costs 50 points (floor 100), and ranked play has no undo.",
    ),
    helpRule(
      "Not a real-time game",
      "It is not a real-time or enemy-telegraph tactics game — nothing chases you or ticks while you think, and pausing costs zero points.",
    ),
    helpRule(
      "Push only",
      "You can only push one crate at a time forward, never pull crates or push two crates at once — check the push preview before moving near walls.",
    ),
  )
  help.append(helpHead, helpList)

  const hint = el("p", "cp-hint")
  const live = el("div", "cp-sr")
  live.setAttribute("aria-live", "polite")
  live.setAttribute("aria-atomic", "true")

  const guideKey = "crates.guideSeen"
  let helpDismissed = ctx.host.storage.get<boolean>(guideKey) === true
  let prevState: CrateState | null = null
  let lastMovesUsed = 0
  let lastPhase = "playing"
  let lastOutcome = ""
  let postGameNotice = ""
  let pendingTrace: MoveTrace | null = null
  let hoverDir: MoveDir | null = null
  let animTimer: number | null = null
  let anim: AnimState | null = null

  const prefersReducedMotion = (): boolean =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const cancelAnim = (): void => {
    if (animTimer !== null) {
      clearTimeout(animTimer)
      animTimer = null
    }
    anim = null
  }

  const setHelp = (open: boolean, remember = false): void => {
    help.hidden = !open
    helpBtn.textContent = open ? "Hide guide" : "How to play"
    helpBtn.setAttribute("aria-expanded", open ? "true" : "false")
    if (!open && remember) {
      helpDismissed = true
      ctx.host.storage.set(guideKey, true)
    }
  }

  setHelp(!helpDismissed)

  const previewSentence = (state: CrateState): string => {
    const pushes = adjacentPushes(state)
    if (pushes.length === 0) return ""

    const narrowed = hoverDir ? pushes.filter((push) => push.dir === hoverDir) : []
    const list = narrowed.length > 0 ? narrowed : pushes
    if (list.length === 0) return ""

    const describe = (push: AdjacentPush, verbose: boolean): string => {
      const cap = capitalize(push.dir)
      if (!push.preview.valid) {
        return verbose
          ? `${cap} is blocked — no room behind the crate.`
          : `${cap} blocked`
      }
      const target = push.preview.pushedTo!
      if (push.preview.wouldStick) {
        return verbose
          ? `Caution: ${cap} pushes crate into corner at ${pointText(target)}!`
          : `${cap} -> corner at ${pointText(target)}!`
      }
      if (push.preview.landsOnGoal) {
        return verbose
          ? `Adjacent push: ${cap} -> ${pointText(target)} onto goal.`
          : `${cap} -> ${pointText(target)} onto goal`
      }
      return verbose
        ? `Adjacent push: ${cap} -> ${pointText(target)}.`
        : `${cap} -> ${pointText(target)}`
    }

    if (list.length === 1) return describe(list[0]!, true)
    return `Adjacent pushes: ${list.map((push) => describe(push, false)).join("; ")}.`
  }

  const isRefusalCopy = (text: string): boolean =>
    text.startsWith("Board edge") ||
    text.startsWith("Blocked by wall") ||
    text.startsWith("Cannot push crate") ||
    text.startsWith("Click a cell")

  const refusalCopy = (preview: MovePreview | null, dir: MoveDir): string => {
    if (preview === null) return "Click a cell next to the operator (or use Arrows / WASD) to move."
    if (preview.blockedReason === "oob") return "Board edge — no move used."
    if (preview.blockedReason === "wall") return "Blocked by wall — no move used."
    if (preview.blockedReason === "blocked-push") {
      return `Cannot push crate ${dir} — space behind it is blocked (no move used).`
    }
    return "Click a cell next to the operator (or use Arrows / WASD) to move."
  }

  const outcomeCopy = (state: CrateState, trace: MoveTrace): string => {
    const total = state.goals.length
    const onGoals = cratesOnGoals(state)
    const movesLeft = Math.max(0, state.moveBudget - state.movesUsed)
    const dir = trace.dir

    if (trace.pushedFrom === null) {
      return `Moved ${dir} (${movesLeft} move${movesLeft === 1 ? "" : "s"} left).`
    }
    if (trace.landedOnGoal) {
      return `Crate placed on goal! (${onGoals}/${total} · ${movesLeft} move${
        movesLeft === 1 ? "" : "s"
      } left).`
    }
    const fromCell = trace.pushedFrom.y * state.width + trace.pushedFrom.x
    const wasOnGoal = prevState !== null && prevState.goals.includes(fromCell)
    if (wasOnGoal) {
      return `Moved crate off goal (${onGoals}/${total} · ${movesLeft} move${
        movesLeft === 1 ? "" : "s"
      } left).`
    }
    return `Pushed crate ${dir} (${onGoals}/${total} on goals · ${movesLeft} move${
      movesLeft === 1 ? "" : "s"
    } left).`
  }

  const renderCells = (state: CrateState, pushes: readonly AdjacentPush[]): void => {
    const narrowed = hoverDir
      ? pushes.find((push) => push.dir === hoverDir) ?? null
      : null
    const previewStep =
      narrowed?.preview.valid === true && narrowed.preview.target !== null
        ? narrowed.preview.target.y * state.width + narrowed.preview.target.x
        : null

    for (let cell = 0; cell < state.width * state.height; cell += 1) {
      const item = cells[cell]
      if (!item) continue
      const button = item.button
      const wall = state.walls[cell] === true
      const goal = state.goals.includes(cell)
      const crate = state.crates.includes(cell)
      const operator = state.operator === cell
      const cellView = previewCellWithPushes(state, cell, pushes)

      button.className = "cp-cell"
      button.disabled = false

      if (cellView.classes.length > 0) button.classList.add(...cellView.classes)
      if (previewStep === cell) button.classList.add("is-preview-step")

      if (anim !== null) {
        if (anim.opCell === cell) button.classList.add("is-stepped")
        if (anim.crateCell === cell) {
          button.classList.add("is-pushed")
          if (anim.goalFlash) button.classList.add("is-goal-flash")
        }
        if (anim.stuckCell === cell) button.classList.add("is-stuck-flash")
      }

      item.glyph.textContent = wall
        ? ""
        : operator
          ? "@"
          : crate
            ? "▣"
            : goal
              ? "○"
              : "·"

      button.setAttribute("aria-label", cellView.aria)
    }
  }

  const startAnim = (trace: MoveTrace): void => {
    if (prefersReducedMotion()) return
    cancelAnim()
    anim = {
      opCell: trace.toOp.y * ctx.state().width + trace.toOp.x,
      crateCell:
        trace.pushedTo === null ? null : trace.pushedTo.y * ctx.state().width + trace.pushedTo.x,
      goalFlash: trace.landedOnGoal,
      stuckCell:
        trace.stuckCell === null ? null : trace.stuckCell.y * ctx.state().width + trace.stuckCell.x,
    }
    animTimer = window.setTimeout(() => {
      animTimer = null
      anim = null
      renderCells(ctx.state(), adjacentPushes(ctx.state()))
    }, 260)
  }

  const paint = (state: CrateState): void => {
    const base = modeBase(state.modeId)
    const total = state.goals.length
    const onGoals = cratesOnGoals(state)
    const movesLeft = Math.max(0, state.moveBudget - state.movesUsed)
    const projected = projectedScore(state)
    const modeTitle = state.modeId === "hard" ? "Hard" : "Easy"

    modeStat.textContent = `${modeTitle} · ${state.width}×${state.height}`
    baseStat.textContent = `Base ${numberText(base)}`
    movesStat.textContent = `Moves ${state.movesUsed}/${state.moveBudget} (Par ${state.par})`
    estStat.textContent = `Est. ${state.phase === "lost" ? 0 : numberText(projected)}`

    if (state.phase === "won") {
      goalTarget.textContent = `All ${total}/${total} crates on goals`
    } else if (state.phase === "lost" && state.lossReason === "stuck") {
      goalTarget.textContent = `Crate stuck in corner · ${onGoals}/${total} on goals`
    } else if (state.phase === "lost" && state.lossReason === "budget") {
      goalTarget.textContent = `Out of moves · ${onGoals}/${total} on goals`
    } else {
      goalTarget.textContent = `Crates on goals: ${onGoals}/${total}`
    }
    goalLeft.textContent = `${movesLeft} move${movesLeft === 1 ? "" : "s"} left · Par ${state.par}`
    goalFill.style.width = `${state.phase === "won" ? 100 : Math.round((onGoals / total) * 100)}%`
    goalBox.classList.toggle(
      "is-warn",
      state.phase === "playing" && movesLeft <= Math.max(4, Math.ceil(state.moveBudget * 0.2)),
    )
    goalBox.classList.toggle("is-met", state.phase === "won")

    for (const button of dpadButtons) button.button.disabled = state.phase !== "playing"
    helpBtn.disabled = false

    // Committed move: outcome copy, audio, and bounded playback.
    const committed = state.movesUsed > lastMovesUsed
    if (committed && pendingTrace !== null) {
      const trace = pendingTrace
      pendingTrace = null
      postGameNotice = ""
      lastOutcome = outcomeCopy(state, trace)

      if (state.phase === "won") ctx.host.audio.play("win")
      else if (state.phase === "lost") ctx.host.audio.play("lose")
      else if (trace.landedOnGoal && !trace.solved) ctx.host.audio.play("reveal")
      else ctx.host.audio.play("turn")

      startAnim(trace)
    }

    const pushes = adjacentPushes(state)
    const sentence = previewSentence(state)

    if (postGameNotice !== "") {
      hint.textContent = postGameNotice
    } else if (state.phase === "won") {
      const score = projectedScore(state)
      hint.textContent = `Solved! All ${total} crates placed in ${state.movesUsed} moves (Par ${state.par}) for ${numberText(score)} pts.`
    } else if (state.phase === "lost" && state.lossReason === "stuck") {
      const stuck = findStuckCrate(state.crates, state.goals, state.walls, state.width, state.height)
      const at = stuck >= 0 ? pointText(toPoint(state.crates[stuck]!, state.width)) : "(unknown)"
      hint.textContent = `Crate trapped in a non-goal corner at ${at} — run lost (${onGoals}/${total} on goals).`
    } else if (state.phase === "lost") {
      hint.textContent = `Out of moves — placed ${onGoals}/${total} crates in ${state.moveBudget} moves.`
    } else if (lastOutcome !== "") {
      hint.textContent = sentence === "" ? lastOutcome : `${lastOutcome} ${sentence}`
    } else if (state.movesUsed === 0) {
      hint.textContent = `Push all ${total} crates onto goal pads in ${state.moveBudget} moves (Par ${state.par}).${
        sentence === "" ? "" : ` ${sentence}`
      }`
    } else if (sentence !== "") {
      hint.textContent = sentence
    } else {
      hint.textContent = `Push all ${total} crates onto goal pads in ${state.moveBudget} moves (Par ${state.par}).`
    }

    if (state.movesUsed > 0 && !helpDismissed) setHelp(false, true)

    if (committed || state.phase !== lastPhase) {
      if (state.phase === "won") {
        live.textContent = `Solved in ${state.movesUsed} moves for ${numberText(projectedScore(state))} points.`
      } else if (state.phase === "lost") {
        live.textContent =
          state.lossReason === "stuck"
            ? "Crate trapped in a corner. Run lost."
            : "Out of moves. Run lost."
      } else {
        live.textContent = lastOutcome
      }
    }
    if (postGameNotice !== "") live.textContent = postGameNotice

    renderCells(state, pushes)

    prevState = state
    lastMovesUsed = state.movesUsed
    lastPhase = state.phase
  }

  const clearHover = (): void => {
    const state = ctx.state()
    if (state.phase !== "playing") return
    const hadRefusal = isRefusalCopy(lastOutcome)
    if (!hadRefusal && hoverDir === null) return
    if (hadRefusal) lastOutcome = ""
    hoverDir = null
    paint(state)
  }

  // Build the grid once; width is fixed for a run.
  const initial = ctx.state()
  board.style.setProperty("--cp-cols", String(initial.width))
  board.setAttribute("aria-label", `${initial.width} by ${initial.height} crate grid`)
  for (let y = 0; y < initial.height; y += 1) {
    for (let x = 0; x < initial.width; x += 1) {
      const cell = y * initial.width + x
      const button = el("button", "cp-cell")
      button.type = "button"
      button.tabIndex = -1
      button.setAttribute("role", "gridcell")
      const glyph = el("span", "cp-glyph")
      button.append(glyph)

      button.addEventListener("pointerenter", () => {
        const state = ctx.state()
        if (state.phase !== "playing") return
        if (isRefusalCopy(lastOutcome)) lastOutcome = ""
        const dir = isAdjacentDir(state, cell)
        hoverDir = dir
        paint(state)
      })
      button.addEventListener("focus", () => {
        const state = ctx.state()
        if (state.phase !== "playing") return
        if (isRefusalCopy(lastOutcome)) lastOutcome = ""
        hoverDir = isAdjacentDir(state, cell)
        paint(state)
      })
      button.addEventListener("pointerleave", clearHover)
      button.addEventListener("blur", clearHover)
      button.addEventListener("click", () => {
        const state = ctx.state()
        if (state.phase !== "playing") {
          postGameNotice = "Puzzle finished — start a new run to play again."
          paint(state)
          return
        }
        const dir = isAdjacentDir(state, cell)
        if (dir === null) {
          lastOutcome = "Click a cell next to the operator (or use Arrows / WASD) to move."
          live.textContent = lastOutcome
          paint(state)
          lastOutcome = ""
          return
        }
        attempt(dir)
      })
      board.append(button)
      cells.push({ button, glyph })
    }
  }

  const attempt = (dir: MoveDir): void => {
    const state = ctx.state()
    if (state.phase !== "playing") {
      postGameNotice = "Puzzle finished — start a new run to play again."
      paint(state)
      return
    }
    const preview = previewMove(state, dir)
    if (preview === null || !preview.valid) {
      lastOutcome = refusalCopy(preview, dir)
      live.textContent = lastOutcome
      paint(state)
      lastOutcome = ""
      return
    }
    const trace = traceMove(state, dir)
    if (trace === null) return
    cancelAnim()
    postGameNotice = ""
    pendingTrace = trace
    ctx.dispatch(moveInput(dir))
  }

  for (const entry of dpadButtons) {
    entry.button.addEventListener("click", () => attempt(entry.dir))
    entry.button.addEventListener("pointerenter", () => {
      if (ctx.state().phase !== "playing") return
      if (isRefusalCopy(lastOutcome)) lastOutcome = ""
      hoverDir = entry.dir
      paint(ctx.state())
    })
    entry.button.addEventListener("pointerleave", clearHover)
    entry.button.addEventListener("focus", () => {
      if (ctx.state().phase !== "playing") return
      if (isRefusalCopy(lastOutcome)) lastOutcome = ""
      hoverDir = entry.dir
      paint(ctx.state())
    })
    entry.button.addEventListener("blur", clearHover)
  }
  dpad.addEventListener("pointerleave", clearHover)

  board.addEventListener("pointerleave", clearHover)

  helpBtn.addEventListener("click", () => {
    const open = help.hasAttribute("hidden")
    if (!open) helpDismissed = true
    setHelp(open, true)
  })

  const isControl = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && target.closest("[data-cp-control]") !== null

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const key = event.key
    const dir = KEY_DIRS[key]
    const isHelp = key === "h" || key === "H"
    if (dir === undefined && !isHelp) return
    // Enter is left untouched so focused buttons keep their own activation.
    if (key === "Enter" && isControl(event.target)) return

    event.preventDefault()
    if (event.repeat) return

    if (isHelp) {
      const open = help.hasAttribute("hidden")
      if (!open) helpDismissed = true
      setHelp(open, true)
      return
    }

    attempt(dir!)
  }

  wrap.addEventListener("pointerdown", (event) => {
    if (isControl(event.target)) return
    wrap.focus()
  })
  ctx.container.addEventListener("keydown", onKeyDown)

  wrap.append(bar, goalBox, board, controls, help, hint, live)
  ctx.container.append(wrap)

  return {
    render(state) {
      paint(state)
    },
    destroy() {
      cancelAnim()
      ctx.container.removeEventListener("keydown", onKeyDown)
      wrap.remove()
    },
  }
}
