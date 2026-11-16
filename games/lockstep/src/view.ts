import type { GameView, ViewContext } from "@await-arcade/contract"
import { el, ensureStyle } from "@await-arcade/framework"
import {
  dangerCells,
  SECTOR_PAR,
  type Enemy,
  type EnemyKind,
  type LockstepInput,
  type LockstepState,
} from "./core"

const css = `
.ls-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
}

.ls-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px;
  color: var(--arcade-muted, #8b98a9);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.ls-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.2));
  border-radius: 999px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent);
}

.ls-stat.is-hp {
  color: var(--game-accent, #4ade80);
  border-color: color-mix(in srgb, var(--game-accent, #4ade80) 35%, transparent);
}

.ls-stat.is-ready {
  color: var(--game-accent, #4ade80);
}

.ls-board {
  display: grid;
  grid-template-columns: repeat(var(--ls-cols, 5), minmax(0, 1fr));
  gap: 4px;
  width: min(100%, 260px);
  user-select: none;
  touch-action: manipulation;
}

.ls-cell {
  position: relative;
  appearance: none;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.2));
  border-radius: 7px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 5%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font: inherit;
  cursor: default;
  transition: transform 80ms ease, border-color 100ms ease, background 100ms ease;
}

.ls-cell.is-adjacent {
  cursor: pointer;
  border-color: color-mix(in srgb, var(--game-accent, #4ade80) 40%, var(--arcade-line, rgba(148, 163, 184, 0.25)));
}

.ls-cell.is-adjacent:hover {
  background: color-mix(in srgb, var(--game-accent, #4ade80) 14%, transparent);
  border-color: var(--game-accent, #4ade80);
}

.ls-cell.is-self {
  cursor: pointer;
}

.ls-cell.is-wall {
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--arcade-fg, #e6edf3) 14%, transparent),
    color-mix(in srgb, var(--arcade-fg, #e6edf3) 14%, transparent) 4px,
    color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent) 4px,
    color-mix(in srgb, var(--arcade-fg, #e6edf3) 6%, transparent) 8px
  );
  border-color: color-mix(in srgb, var(--arcade-fg, #e6edf3) 26%, transparent);
  color: var(--arcade-muted, #8b98a9);
}

.ls-cell.is-danger {
  border-color: color-mix(in srgb, var(--game-accent-2, #fb7185) 75%, transparent);
  background: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--game-accent-2, #fb7185) 18%, transparent),
    color-mix(in srgb, var(--game-accent-2, #fb7185) 18%, transparent) 4px,
    color-mix(in srgb, var(--game-accent-2, #fb7185) 7%, transparent) 4px,
    color-mix(in srgb, var(--game-accent-2, #fb7185) 7%, transparent) 8px
  );
}

.ls-cell.is-player {
  border-color: var(--game-accent, #4ade80);
  background: color-mix(in srgb, var(--game-accent, #4ade80) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--game-accent, #4ade80) 40%, transparent);
}

.ls-cell.is-player.is-danger {
  border-color: var(--game-accent-2, #fb7185);
  background: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--game-accent-2, #fb7185) 24%, transparent),
    color-mix(in srgb, var(--game-accent-2, #fb7185) 24%, transparent) 4px,
    color-mix(in srgb, var(--game-accent, #4ade80) 16%, transparent) 4px,
    color-mix(in srgb, var(--game-accent, #4ade80) 16%, transparent) 8px
  );
  box-shadow: inset 0 0 0 1px var(--game-accent-2, #fb7185);
}

.ls-cell.is-enemy {
  border-color: color-mix(in srgb, var(--game-accent-2, #fb7185) 65%, transparent);
  background: color-mix(in srgb, var(--game-accent-2, #fb7185) 16%, transparent);
}

.ls-cell:focus-visible {
  outline: 2px solid var(--arcade-accent, var(--game-accent, #4ade80));
  outline-offset: 1px;
  z-index: 1;
}

.ls-glyph {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}

.ls-cell.is-player .ls-glyph {
  color: var(--game-accent, #4ade80);
}

.ls-cell.is-enemy .ls-glyph {
  color: var(--game-accent-2, #fb7185);
}

.ls-pips {
  position: absolute;
  bottom: 2px;
  left: 4px;
  font-size: 8px;
  line-height: 1;
  color: var(--game-accent-2, #fb7185);
  letter-spacing: 1px;
}

.ls-intent {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 9px;
  line-height: 1;
  font-weight: 700;
  color: var(--game-accent-2, #fb7185);
}

.ls-warn {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font-size: 9px;
  line-height: 1;
  font-weight: 700;
  color: var(--game-accent-2, #fb7185);
}

.ls-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  gap: 6px;
}

.ls-btn {
  appearance: none;
  padding: 5px 9px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.25));
  border-radius: 6px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 7%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}

.ls-btn.is-primary {
  border-color: color-mix(in srgb, var(--game-accent, #4ade80) 55%, transparent);
  color: var(--game-accent, #4ade80);
}

.ls-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--game-accent, #4ade80) 15%, transparent);
}

.ls-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.ls-log {
  min-height: 15px;
  max-width: 280px;
  text-align: center;
  color: var(--arcade-muted, #8b98a9);
  font-size: 11px;
  line-height: 1.35;
}

.ls-legend {
  color: var(--arcade-muted, #8b98a9);
  font-size: 10px;
  text-align: center;
  opacity: 0.85;
}

.ls-guide {
  width: min(100%, 300px);
  padding: 10px 11px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.25));
  border-radius: 8px;
  background: color-mix(in srgb, var(--arcade-fg, #e6edf3) 5%, transparent);
  color: var(--arcade-fg, #e6edf3);
  font-size: 11px;
  line-height: 1.45;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ls-guide[hidden] {
  display: none;
}

.ls-guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--game-accent, #4ade80);
}

.ls-guide-list {
  margin: 0;
  padding-left: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--arcade-muted, #8b98a9);
}

.ls-guide-list b {
  color: var(--arcade-fg, #e6edf3);
}

.ls-chip {
  display: inline-grid;
  place-items: center;
  min-width: 17px;
  padding: 0 4px;
  border-radius: 4px;
  font-weight: 700;
  font-size: 10px;
  border: 1px solid var(--arcade-line, rgba(148, 163, 184, 0.3));
}

.ls-chip.is-p {
  color: var(--game-accent, #4ade80);
  border-color: var(--game-accent, #4ade80);
}

.ls-chip.is-e {
  color: var(--game-accent-2, #fb7185);
  border-color: var(--game-accent-2, #fb7185);
}

@media (prefers-reduced-motion: reduce) {
  .ls-cell {
    transition: none;
  }
}
`

function enemyCode(kind: EnemyKind): string {
  return kind === "striker" ? "S" : kind === "lancer" ? "L" : "B"
}

function enemyName(kind: EnemyKind): string {
  return kind === "striker" ? "Striker" : kind === "lancer" ? "Lancer" : "Mortar"
}

function arrowFor(dx: number, dy: number): string {
  if (dx === 1) return "→"
  if (dx === -1) return "←"
  if (dy === 1) return "↓"
  if (dy === -1) return "↑"
  return ""
}

function intentBadge(enemy: Enemy): string {
  if (enemy.intent.kind === "melee" || enemy.intent.kind === "beam") {
    return arrowFor(enemy.intent.dx, enemy.intent.dy)
  }
  if (enemy.intent.kind === "blast") return "⊕"
  return ""
}

function moveDeltaForKey(key: string): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } | undefined {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return { dx: 0, dy: -1 }
    case "ArrowDown":
    case "s":
    case "S":
      return { dx: 0, dy: 1 }
    case "ArrowLeft":
    case "a":
    case "A":
      return { dx: -1, dy: 0 }
    case "ArrowRight":
    case "d":
    case "D":
      return { dx: 1, dy: 0 }
    default:
      return undefined
  }
}

export function view(ctx: ViewContext<LockstepState, LockstepInput>): GameView<LockstepState> {
  ensureStyle("arcade-game-lockstep", css)

  const wrap = el("div", "ls-wrap")
  const bar = el("div", "ls-bar")
  const sectorStat = el("span", "ls-stat")
  const turnStat = el("span", "ls-stat")
  const hpStat = el("span", "ls-stat is-hp")
  const pulseStat = el("span", "ls-stat")
  bar.append(sectorStat, turnStat, hpStat, pulseStat)

  const board = el("div", "ls-board")
  board.setAttribute("role", "grid")
  board.setAttribute("aria-label", "Lockstep 5 by 5 tactical grid")

  const actions = el("div", "ls-actions")
  const pulseBtn = el("button", "ls-btn is-primary", "Pulse (Space)")
  pulseBtn.type = "button"
  const waitBtn = el("button", "ls-btn", "Wait (.)")
  waitBtn.type = "button"
  const guideBtn = el("button", "ls-btn", "How to play (?)")
  guideBtn.type = "button"
  actions.append(pulseBtn, waitBtn, guideBtn)

  const logOut = el("div", "ls-log")
  const legend = el(
    "div",
    "ls-legend",
    "@ You · S Striker 1HP · L Lancer 2HP · B Mortar 1HP (fixed) · # Pillar",
  )

  const guide = el("section", "ls-guide")
  guide.setAttribute("aria-label", "How to play Lockstep")
  const guideHead = el("div", "ls-guide-head")
  const guideTitle = el("span", "", "HOW TO PLAY")
  const guideClose = el("button", "ls-btn", "Got it")
  guideClose.type = "button"
  guideHead.append(guideTitle, guideClose)

  const makeChip = (text: string, variant?: "p" | "e"): HTMLElement =>
    el("span", variant ? `ls-chip is-${variant}` : "ls-chip", text)

  const guideList = el("ul", "ls-guide-list")
  const rules: Array<() => HTMLLIElement> = [
    () => {
      const li = el("li")
      li.append(
        el("b", "", "Goal: "),
        "You (",
        makeChip("@", "p"),
        ") must eliminate every enemy (",
        makeChip("S", "e"),
        makeChip("L", "e"),
        makeChip("B", "e"),
        ") to clear each sector. Clear 5 sectors in Skirmish (with 3 HP) to win, or push for a high score in Endless.",
      )
      return li
    },
    () => {
      const li = el("li")
      li.append(
        el("b", "", "Reading attacks: "),
        "Striped ",
        makeChip("!", "e"),
        " danger tiles show which squares are in an enemy’s attack path right now. ",
        makeChip("S", "e"),
        " and ",
        makeChip("L", "e"),
        " show a tiny corner arrow (",
        makeChip("↑ → ↓ ←", "e"),
        ") for the direction they will fire at the end of your turn — use it to decide whether to attack or dodge.",
      )
      return li
    },
    () => {
      const li = el("li")
      li.append(
        el("b", "", "Enemies: "),
        makeChip("S", "e"),
        " Striker (1 HP) chases and slashes 1 adjacent tile; ",
        makeChip("L", "e"),
        " Lancer (2 HP) fires a row/col beam, then cools down 1 turn; ",
        makeChip("B", "e"),
        " Mortar (1 HP, ",
        el("b", "", "stationary"),
        ") never moves and fires every turn — ",
        makeChip("⊕", "e"),
        " marks both ",
        makeChip("B", "e"),
        " and the center tile of its X-blast (1-tile step dodges it).",
      )
      return li
    },
    () => {
      const li = el("li")
      li.append(
        el("b", "", "Tip — Shove & crush: "),
        "Walk into an adjacent enemy to hit (1 dmg) and push it 1 tile. Slamming it into ",
        makeChip("#"),
        " pillars, arena edges, or another enemy adds ",
        el("b", "", "+1 crush damage"),
        " (enough to one-shot a 2-HP Lancer) — and a shove into another enemy damages ",
        el("b", "", "both"),
        " of them, so a kill on either side pays out.",
      )
      return li
    },
    () => {
      const li = el("li")
      li.append(
        el("b", "", "Tip — Friendly fire & tools: "),
        "Dodge out of a ",
        makeChip("L", "e"),
        " beam or push enemies sideways so their arrows hit other enemies (+15 pts). ",
        makeChip("Pulse", "p"),
        " pushes all adjacent foes outward (2-turn cooldown); ",
        makeChip("Wait", "p"),
        " (or click ",
        makeChip("@", "p"),
        ") holds in place. Clearing a sector heals +1 HP (max 3), and clearing it within ",
        el("b", "", `${SECTOR_PAR} turns`),
        " pays a speed bonus — faster sectors score more. Killing the last enemy ends the sector at once, so any telegraph still pointing at you never fires.",
      )
      return li
    },
  ]
  for (const buildRule of rules) guideList.append(buildRule())
  guide.append(guideHead, guideList)

  const guideKey = "lockstep.guideSeen"
  let guideOpen = ctx.host.storage.get<boolean>(guideKey) !== true
  const syncGuide = (): void => {
    guide.hidden = !guideOpen
    guideBtn.setAttribute("aria-expanded", String(guideOpen))
    guideBtn.textContent = guideOpen ? "Hide guide (?)" : "How to play (?)"
  }
  const setGuideOpen = (open: boolean): void => {
    guideOpen = open
    if (!open) ctx.host.storage.set(guideKey, true)
    syncGuide()
  }
  syncGuide()

  guideBtn.addEventListener("click", () => setGuideOpen(!guideOpen))
  guideClose.addEventListener("click", () => setGuideOpen(false))

  wrap.append(bar, board, actions, logOut, guide, legend)
  ctx.container.append(wrap)

  pulseBtn.addEventListener("click", () => {
    ctx.dispatch({ action: "pulse" })
  })
  waitBtn.addEventListener("click", () => {
    ctx.dispatch({ action: "wait" })
  })

  const cells: Array<{
    button: HTMLButtonElement
    glyph: HTMLElement
    pips: HTMLElement
    intent: HTMLElement
    warn: HTMLElement
  }> = []

  const build = (state: LockstepState): void => {
    cells.length = 0
    board.replaceChildren()
    board.style.setProperty("--ls-cols", String(state.size))

    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const button = el("button", "ls-cell")
        button.type = "button"
        button.tabIndex = -1
        button.setAttribute("role", "gridcell")
        const glyph = el("span", "ls-glyph")
        const pips = el("span", "ls-pips")
        const intent = el("span", "ls-intent")
        const warn = el("span", "ls-warn")
        button.append(glyph, pips, intent, warn)

        button.addEventListener("click", () => {
          const current = ctx.state()
          if (current.phase !== "playing") return
          const dx = x - current.player.x
          const dy = y - current.player.y
          if (dx === 0 && dy === 0) {
            ctx.dispatch({ action: "wait" })
          } else if (Math.abs(dx) + Math.abs(dy) === 1) {
            ctx.dispatch({ action: "move", dx, dy })
          }
        })

        board.append(button)
        cells.push({ button, glyph, pips, intent, warn })
      }
    }
  }

  const isActionButton = (target: EventTarget | null): boolean =>
    target === pulseBtn || target === waitBtn || target === guideBtn || target === guideClose

  const onKeyDown = (event: KeyboardEvent): void => {
    // A held key would otherwise dispatch a turn per repeat: 30 enemy phases a
    // second, which is guaranteed damage in a game about reading telegraphs.
    if (event.repeat) return
    if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
      event.preventDefault()
      setGuideOpen(!guideOpen)
      return
    }
    if (ctx.state().phase !== "playing") return
    const delta = moveDeltaForKey(event.key)
    if (delta) {
      event.preventDefault()
      ctx.dispatch({ action: "move", dx: delta.dx, dy: delta.dy })
      return
    }
    // Space always pulses unless the focused control is one of the action
    // buttons, which handle their own Space activation. preventDefault below
    // also suppresses Space activation on a focused grid cell, so a cell can
    // never both pulse and step on one press.
    if (event.key === " " && !isActionButton(event.target)) {
      event.preventDefault()
      ctx.dispatch({ action: "pulse" })
      return
    }
    if (event.key === "." || event.key === "e" || event.key === "E") {
      event.preventDefault()
      ctx.dispatch({ action: "wait" })
    }
  }
  ctx.container.addEventListener("keydown", onKeyDown)

  let builtSize = 0
  let lastTurns = 0
  let lastKills = 0
  let lastHp = 0
  let lastSector = 1

  const render = (state: LockstepState): void => {
    if (builtSize !== state.size) {
      builtSize = state.size
      lastHp = state.hp
      lastSector = state.sector
      build(state)
    }

    if (state.turns > lastTurns) {
      if (state.phase === "won") ctx.host.audio.play("win")
      else if (state.phase === "lost") ctx.host.audio.play("lose")
      else if (state.sector > lastSector) ctx.host.audio.play("win")
      else if (state.hp < lastHp) ctx.host.audio.play("crash")
      else if (state.kills > lastKills) ctx.host.audio.play("reveal")
      else ctx.host.audio.play("turn")
    }
    lastTurns = state.turns
    lastKills = state.kills
    lastHp = state.hp
    lastSector = state.sector

    sectorStat.textContent =
      state.targetSectors > 0 ? `Sector ${state.sector}/${state.targetSectors}` : `Sector ${state.sector}`
    turnStat.textContent = `Turns ${state.turns - state.sectorStartedAt}`
    turnStat.classList.toggle("is-ready", state.turns - state.sectorStartedAt < SECTOR_PAR)
    hpStat.textContent = `HP ${"♥".repeat(state.hp)}${"♡".repeat(Math.max(0, state.maxHp - state.hp))}`
    pulseStat.textContent = state.pulseCooldown === 0 ? "Pulse Ready" : `Pulse CD ${state.pulseCooldown}`
    pulseStat.classList.toggle("is-ready", state.pulseCooldown === 0)

    pulseBtn.disabled = state.phase !== "playing" || state.pulseCooldown > 0
    pulseBtn.textContent =
      state.pulseCooldown === 0 ? "Pulse (Space)" : `Pulse (CD ${state.pulseCooldown})`
    waitBtn.disabled = state.phase !== "playing"
    logOut.textContent = state.lastLog

    const threats = new Set(dangerCells(state).map((cell) => `${cell.x},${cell.y}`))
    const blastTargets = new Set(
      state.enemies
        .filter((enemy) => enemy.hp > 0 && enemy.intent.kind === "blast")
        .map((enemy) => {
          const target = (enemy.intent as Extract<typeof enemy.intent, { kind: "blast" }>).target
          return `${target.x},${target.y}`
        }),
    )
    const wallSet = new Set(state.walls.map((wall) => `${wall.x},${wall.y}`))
    const enemyMap = new Map(state.enemies.map((enemy) => [`${enemy.x},${enemy.y}`, enemy]))

    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const cell = cells[y * state.size + x]!
        const key = `${x},${y}`
        const isWall = wallSet.has(key)
        const isPlayer = state.player.x === x && state.player.y === y
        const enemy = enemyMap.get(key)
        const isDanger = threats.has(key)
        const isBlastTarget = blastTargets.has(key)
        const adjacent =
          state.phase === "playing" &&
          !isWall &&
          Math.abs(x - state.player.x) + Math.abs(y - state.player.y) === 1

        cell.button.classList.toggle("is-wall", isWall)
        cell.button.classList.toggle("is-player", isPlayer)
        cell.button.classList.toggle("is-enemy", Boolean(enemy))
        cell.button.classList.toggle("is-danger", isDanger)
        cell.button.classList.toggle("is-adjacent", adjacent)
        cell.button.classList.toggle("is-self", isPlayer && state.phase === "playing")
        cell.button.disabled = state.phase !== "playing"
        cell.button.tabIndex = isPlayer ? 0 : -1

        if (isWall) {
          cell.glyph.textContent = "#"
          cell.pips.textContent = ""
          cell.intent.textContent = ""
          cell.warn.textContent = ""
          cell.button.setAttribute("aria-label", `Column ${x + 1} Row ${y + 1}, Pillar`)
        } else if (isPlayer) {
          cell.glyph.textContent = "@"
          cell.pips.textContent = ""
          cell.intent.textContent = isBlastTarget ? "⊕" : ""
          cell.warn.textContent = isDanger ? "!" : ""
          cell.button.setAttribute(
            "aria-label",
            `Column ${x + 1} Row ${y + 1}, Runner${isBlastTarget ? ", mortar target" : ""}${isDanger ? ", under attack next turn" : ""}, click to wait`,
          )
        } else if (enemy) {
          cell.glyph.textContent = enemyCode(enemy.kind)
          cell.pips.textContent = `${"•".repeat(enemy.hp)}${"·".repeat(Math.max(0, enemy.maxHp - enemy.hp))}`
          cell.intent.textContent = intentBadge(enemy) || (isBlastTarget ? "⊕" : "")
          cell.warn.textContent = isDanger ? "!" : ""
          const intentDesc =
            enemy.intent.kind === "none"
              ? "advancing"
              : enemy.intent.kind === "blast"
                ? "mortar locked"
                : `aiming ${intentBadge(enemy)}`
          cell.button.setAttribute(
            "aria-label",
            `Column ${x + 1} Row ${y + 1}, ${enemyName(enemy.kind)} ${enemy.hp} HP, ${intentDesc}${adjacent ? ", click to shove" : ""}`,
          )
        } else {
          cell.glyph.textContent = ""
          cell.pips.textContent = ""
          cell.intent.textContent = isBlastTarget ? "⊕" : ""
          cell.warn.textContent = isDanger ? "!" : ""
          cell.button.setAttribute(
            "aria-label",
            `Column ${x + 1} Row ${y + 1}, empty${isBlastTarget ? ", mortar blast center" : ""}${isDanger ? ", telegraphed hazard" : ""}${adjacent ? ", click to move" : ""}`,
          )
        }
      }
    }
  }

  return {
    render,
    destroy() {
      ctx.container.removeEventListener("keydown", onKeyDown)
      ctx.container.replaceChildren()
    },
  }
}
