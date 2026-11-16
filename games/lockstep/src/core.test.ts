import { describe, expect, it } from "vitest"
import { createRng, playTurn } from "@await-arcade/framework"
import { greedySolve } from "../solver"
import { core, dangerCells, type Enemy, type LockstepInput, type LockstepState } from "./core"
import { meta } from "./meta"

const skirmish = meta.modes[0]!
const endless = meta.modes[1]!

/** Hand-built board for rule-level tests. */
function scenario(
  overrides: Partial<LockstepState> & Pick<LockstepState, "player" | "enemies">,
): LockstepState {
  return {
    size: 5,
    seed: 1,
    modeId: skirmish.id,
    targetSectors: 5,
    walls: [],
    hp: 3,
    maxHp: 3,
    pulseCooldown: 0,
    sector: 1,
    turns: 0,
    sectorStartedAt: 0,
    kills: 0,
    crushes: 0,
    points: 0,
    lastLog: "",
    nextEnemyId: 99,
    phase: "playing",
    ...overrides,
  }
}

describe("lockstep core", () => {
  it("is deterministic across separate runs with identical seed and inputs", () => {
    const inputs: LockstepInput[] = [
      { action: "move", dx: 1, dy: 0 },
      { action: "wait" },
      { action: "pulse" },
      { action: "move", dx: 0, dy: -1 },
    ]

    let first = core.create(42, skirmish)
    let second = core.create(42, skirmish)
    first = core.step(first, inputs, 0)
    second = core.step(second, inputs, 0)

    const ctx = { elapsedMs: 0, ticks: inputs.length }
    expect(core.serialize(first)).toEqual(core.serialize(second))
    expect(core.score(first, ctx)).toEqual(core.score(second, ctx))
  })

  it("crushes a 2-HP lancer when shoved against the arena edge", () => {
    const base: LockstepState = {
      size: 5,
      seed: 1,
      modeId: skirmish.id,
      targetSectors: 5,
      walls: [],
      player: { x: 3, y: 2 },
      hp: 3,
      maxHp: 3,
      pulseCooldown: 0,
      sector: 1,
      turns: 0,
      sectorStartedAt: 0,
      kills: 0,
      crushes: 0,
      points: 0,
      lastLog: "",
      enemies: [
        { id: 1, kind: "lancer", x: 4, y: 2, hp: 2, maxHp: 2, intent: { kind: "none" } },
        { id: 2, kind: "striker", x: 0, y: 0, hp: 1, maxHp: 1, intent: { kind: "none" } },
      ],
      nextEnemyId: 3,
      phase: "playing",
    }

    const after = core.step(base, [{ action: "move", dx: 1, dy: 0 }], 0)
    expect(after.kills).toBe(1)
    expect(after.crushes).toBe(1)
    expect(after.points).toBe(15)
    expect(after.enemies.some((e) => e.id === 1)).toBe(false)
  })

  it("enforces pulse cooldown after activation", () => {
    const state: LockstepState = {
      size: 5,
      seed: 7,
      modeId: skirmish.id,
      targetSectors: 5,
      walls: [],
      player: { x: 4, y: 4 },
      hp: 3,
      maxHp: 3,
      pulseCooldown: 0,
      sector: 1,
      turns: 0,
      sectorStartedAt: 0,
      kills: 0,
      crushes: 0,
      points: 0,
      lastLog: "",
      enemies: [{ id: 1, kind: "striker", x: 0, y: 0, hp: 1, maxHp: 1, intent: { kind: "none" } }],
      nextEnemyId: 2,
      phase: "playing",
    }
    const afterPulse = core.step(state, [{ action: "pulse" }], 0)
    expect(afterPulse.turns).toBe(1)
    expect(afterPulse.pulseCooldown).toBe(2)

    // Repeat pulse while on cooldown must be ignored (returns same state).
    const ignored = core.step(afterPulse, [{ action: "pulse" }], 0)
    expect(ignored).toBe(afterPulse)

    const afterWait1 = core.step(afterPulse, [{ action: "wait" }], 0)
    expect(afterWait1.pulseCooldown).toBe(1)
    const afterWait2 = core.step(afterWait1, [{ action: "wait" }], 0)
    expect(afterWait2.pulseCooldown).toBe(0)
  })

  it("allows friendly fire when dodging out of a lancer beam behind another enemy", () => {
    const base: LockstepState = {
      size: 5,
      seed: 1,
      modeId: skirmish.id,
      targetSectors: 5,
      walls: [],
      player: { x: 2, y: 2 },
      hp: 3,
      maxHp: 3,
      pulseCooldown: 0,
      sector: 1,
      turns: 0,
      sectorStartedAt: 0,
      kills: 0,
      crushes: 0,
      points: 0,
      lastLog: "",
      enemies: [
        {
          id: 1,
          kind: "lancer",
          x: 0,
          y: 2,
          hp: 2,
          maxHp: 2,
          intent: { kind: "beam", dx: 1, dy: 0 },
        },
        { id: 2, kind: "striker", x: 4, y: 2, hp: 1, maxHp: 1, intent: { kind: "none" } },
      ],
      nextEnemyId: 3,
      phase: "playing",
    }

    // Moving down clears the horizontal beam so it hits the Striker at (4, 2) instead.
    const after = core.step(base, [{ action: "move", dx: 0, dy: 1 }], 0)
    expect(after.hp).toBe(3)
    expect(after.kills).toBe(1)
    // A kill by friendly fire is a kill, not a shove-crush.
    expect(after.crushes).toBe(0)
    expect(after.enemies.some((e) => e.id === 2)).toBe(false)
  })

  it("shows beam danger past the player and keeps sector spawns out of immediate adjacency", () => {
    const beamState: LockstepState = {
      size: 5,
      seed: 1,
      modeId: skirmish.id,
      targetSectors: 5,
      walls: [],
      player: { x: 2, y: 2 },
      hp: 3,
      maxHp: 3,
      pulseCooldown: 0,
      sector: 1,
      turns: 0,
      sectorStartedAt: 0,
      kills: 0,
      crushes: 0,
      points: 0,
      lastLog: "",
      enemies: [
        {
          id: 1,
          kind: "lancer",
          x: 0,
          y: 2,
          hp: 2,
          maxHp: 2,
          intent: { kind: "beam", dx: 1, dy: 0 },
        },
      ],
      nextEnemyId: 2,
      phase: "playing",
    }

    const cells = dangerCells(beamState)
    expect(cells).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ])

    for (let seed = 1; seed <= 12; seed += 1) {
      const created = core.create(seed, skirmish)
      for (const enemy of created.enemies) {
        const dist = Math.abs(enemy.x - created.player.x) + Math.abs(enemy.y - created.player.y)
        expect(dist).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it("replays a full skirmish win and validates loss paths cleanly", () => {
    const inputs = greedySolve(10, skirmish)
    const result = playTurn(core, meta, {
      seed: 10,
      mode: skirmish,
      inputs,
      durationMs: 12_000,
    })

    expect(result.state.phase).toBe("won")
    expect(result.score.won).toBe(true)
    expect(result.score.ranked).toBe(true)
    expect(result.score.value).toBeGreaterThan(200)
    expect(result.verified.ok).toBe(true)

    // Zero-point passive wait loss is unranked and rejected by the verifier.
    const lossInputs: LockstepInput[] = Array.from({ length: 40 }, () => ({ action: "wait" }))
    const lossResult = playTurn(core, meta, {
      seed: 7,
      mode: endless,
      inputs: lossInputs,
      durationMs: 4_000,
    })
    expect(lossResult.state.phase).toBe("lost")
    expect(lossResult.score.won).toBe(false)
    expect(lossResult.score.ranked).toBe(false)
    expect(lossResult.verified.ok).toBe(false)

    // Scoring points before falling in Endless still produces a verified ranked score.
    const scoredLossInputs: LockstepInput[] = [
      ...greedySolve(10, endless, 10),
      ...Array.from({ length: 60 }, () => ({ action: "wait" as const })),
    ]
    const scoredLossResult = playTurn(core, meta, {
      seed: 10,
      mode: endless,
      inputs: scoredLossInputs,
      durationMs: 8_000,
    })
    expect(scoredLossResult.state.phase).toBe("lost")
    expect(scoredLossResult.score.won).toBe(false)
    expect(scoredLossResult.score.value).toBeGreaterThan(0)
    expect(scoredLossResult.score.ranked).toBe(true)
    expect(scoredLossResult.verified.ok).toBe(true)
  })

  it("walks a lancer to a firing position instead of oscillating behind a pillar", () => {
    // The old greedy stepper bounced between (0,0) and (0,1) here forever and
    // never fired, so a single pillar switched the lancer off for the sector.
    let state = scenario({
      walls: [{ x: 1, y: 0 }],
      player: { x: 4, y: 0 },
      enemies: [{ id: 1, kind: "lancer", x: 0, y: 1, hp: 2, maxHp: 2, intent: { kind: "none" } }],
    })

    const visited = new Set<string>()
    for (let turn = 0; turn < 6; turn += 1) {
      state = core.step(state, [{ action: "wait" }], 0)
      const lancer = state.enemies[0]!
      visited.add(`${lancer.x},${lancer.y}`)
    }

    expect(visited.size).toBeGreaterThan(2)
    expect(state.hp).toBeLessThan(3)
  })

  it("clears a mortar X-blast by stepping off the locked centre", () => {
    const mortar = (): Enemy => ({
      id: 1,
      kind: "mortar",
      x: 4,
      y: 4,
      hp: 1,
      maxHp: 1,
      intent: { kind: "blast", target: { x: 0, y: 0 } },
    })

    const base = scenario({ player: { x: 0, y: 0 }, enemies: [mortar()] })

    const dodged = core.step(base, [{ action: "move", dx: 0, dy: 1 }], 0)
    expect(dodged.hp).toBe(3)

    const caught = core.step(base, [{ action: "wait" }], 0)
    expect(caught.hp).toBe(2)
  })

  it("fires a lancer every other turn while it cools down", () => {
    let state = scenario({
      player: { x: 2, y: 0 },
      enemies: [
        { id: 1, kind: "lancer", x: 0, y: 0, hp: 2, maxHp: 2, intent: { kind: "beam", dx: 1, dy: 0 } },
      ],
    })

    state = core.step(state, [{ action: "wait" }], 0)
    expect(state.hp).toBe(2)
    state = core.step(state, [{ action: "wait" }], 0)
    expect(state.hp).toBe(2)
    state = core.step(state, [{ action: "wait" }], 0)
    expect(state.hp).toBe(1)
  })

  it("pays a speed bonus for a fast sector clear and nothing for a slow one", () => {
    const board = scenario({
      sector: 3,
      hp: 2,
      points: 100,
      player: { x: 2, y: 2 },
      enemies: [{ id: 1, kind: "striker", x: 2, y: 1, hp: 1, maxHp: 1, intent: { kind: "none" } }],
    })

    // One turn in the sector: 100 + 10 shove kill + 75 sector bonus + 5 turns under par * 12.
    const fast = core.step(board, [{ action: "move", dx: 0, dy: -1 }], 0)
    expect(fast.points).toBe(245)
    expect(fast.sector).toBe(4)
    expect(fast.hp).toBe(3)
    expect(fast.sectorStartedAt).toBe(1)
    expect(fast.enemies.length).toBe(5)

    // The same clear after the par has elapsed scores the bonus-free total.
    const slow = core.step({ ...board, turns: 12 }, [{ action: "move", dx: 0, dy: -1 }], 0)
    expect(slow.points).toBe(185)
    expect(fast.points - slow.points).toBe(60)
  })

  it("crushes an enemy shoved into a pillar", () => {
    const state = scenario({
      player: { x: 2, y: 2 },
      walls: [{ x: 4, y: 2 }],
      enemies: [
        { id: 1, kind: "lancer", x: 3, y: 2, hp: 2, maxHp: 2, intent: { kind: "none" } },
        // Keeps the sector alive so the assertion sees kill points, not a clear bonus.
        { id: 2, kind: "striker", x: 0, y: 4, hp: 1, maxHp: 1, intent: { kind: "none" } },
      ],
    })

    const after = core.step(state, [{ action: "move", dx: 1, dy: 0 }], 0)
    expect(after.kills).toBe(1)
    expect(after.crushes).toBe(1)
    expect(after.points).toBe(15)
    expect(after.enemies).toHaveLength(1)
    expect(after.enemies[0]!.id).toBe(2)
  })

  it("damages both units when an enemy is shoved into another enemy", () => {
    const state = scenario({
      player: { x: 1, y: 2 },
      enemies: [
        { id: 1, kind: "lancer", x: 2, y: 2, hp: 2, maxHp: 2, intent: { kind: "none" } },
        { id: 2, kind: "lancer", x: 3, y: 2, hp: 2, maxHp: 2, intent: { kind: "none" } },
      ],
    })

    const after = core.step(state, [{ action: "move", dx: 1, dy: 0 }], 0)
    // The shoved lancer takes the hit plus the collision and dies; the blocker
    // it slammed into is left on 1 HP.
    expect(after.kills).toBe(1)
    expect(after.crushes).toBe(1)
    expect(after.points).toBe(15)
    expect(after.enemies).toHaveLength(1)
    expect(after.enemies[0]!.id).toBe(2)
    expect(after.enemies[0]!.hp).toBe(1)
  })

  it("does not let a beam pass through a blocker that died earlier in the same phase", () => {
    // Lancer 1 shoots the 1 HP Striker at (2,0) dead; Lancer 3's eastward beam
    // was telegraphed to stop on that Striker. It must not slide through the
    // corpse onto the runner at (4,0), a tile the overlay never marked.
    const state = scenario({
      player: { x: 4, y: 0 },
      enemies: [
        { id: 1, kind: "lancer", x: 2, y: 4, hp: 2, maxHp: 2, intent: { kind: "beam", dx: 0, dy: -1 } },
        { id: 2, kind: "striker", x: 2, y: 0, hp: 1, maxHp: 1, intent: { kind: "none" } },
        { id: 3, kind: "lancer", x: 0, y: 0, hp: 2, maxHp: 2, intent: { kind: "beam", dx: 1, dy: 0 } },
      ],
    })

    const marked = dangerCells(state).map((cell) => `${cell.x},${cell.y}`)
    expect(marked).not.toContain("4,0")

    const after = core.step(state, [{ action: "wait" }], 0)
    expect(after.hp).toBe(3)
    expect(after.kills).toBe(1)
  })

  it("escalates the Endless roster past the Skirmish sectors, then caps", () => {
    const atSector = (sector: number): LockstepState => ({
      ...scenario({
        modeId: endless.id,
        targetSectors: 0,
        sector,
        player: { x: 2, y: 2 },
        enemies: [{ id: 1, kind: "striker", x: 2, y: 1, hp: 1, maxHp: 1, intent: { kind: "none" } }],
      }),
    })
    const clear = (sector: number): LockstepState =>
      core.step(atSector(sector), [{ action: "move", dx: 0, dy: -1 }], 0)

    const six = clear(5)
    expect(six.sector).toBe(6)
    expect(six.enemies).toHaveLength(6)
    expect(six.walls).toHaveLength(3)

    const eight = clear(7)
    expect(eight.sector).toBe(8)
    expect(eight.enemies).toHaveLength(7)
    expect(eight.walls).toHaveLength(4)
    // Spawns still keep the outer ring even at the roster cap.
    expect(
      eight.enemies.every(
        (enemy) => Math.abs(enemy.x - eight.player.x) + Math.abs(enemy.y - eight.player.y) >= 2,
      ),
    ).toBe(true)

    expect(clear(8).enemies).toHaveLength(7)
  })

  it("marks exactly the cells a melee and a blast damage", () => {
    const melee = scenario({
      player: { x: 2, y: 2 },
      enemies: [
        { id: 1, kind: "striker", x: 2, y: 1, hp: 1, maxHp: 1, intent: { kind: "melee", dx: 0, dy: 1 } },
      ],
    })
    expect(dangerCells(melee)).toEqual([{ x: 2, y: 2 }])

    const blast = scenario({
      player: { x: 2, y: 2 },
      enemies: [
        {
          id: 1,
          kind: "mortar",
          x: 0,
          y: 0,
          hp: 1,
          maxHp: 1,
          intent: { kind: "blast", target: { x: 2, y: 2 } },
        },
      ],
    })
    expect(dangerCells(blast).map((cell) => `${cell.x},${cell.y}`).sort()).toEqual([
      "1,1",
      "1,3",
      "2,2",
      "3,1",
      "3,3",
    ])
    expect(core.step(blast, [{ action: "wait" }], 0).hp).toBe(2)
    // One step off the X is unmarked and unhurt.
    expect(core.step(blast, [{ action: "move", dx: -1, dy: 0 }], 0).hp).toBe(3)
  })

  it("keeps state invariants under adversarial random input", () => {
    const rng = createRng(0xc0ffee)
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
    ]
    // Shapes the view never emits but a hand-written replay can.
    const weird: LockstepInput[] = [
      { action: "move", dx: 9, dy: -9 },
      { action: "move", dx: 0, dy: 0 },
      { action: "move", dx: -1, dy: 1 },
    ]

    for (const mode of [skirmish, endless]) {
      for (let seed = 1; seed <= 3; seed += 1) {
        let state = core.create(seed, mode)
        for (let turn = 0; turn < 60 && state.phase === "playing"; turn += 1) {
          const roll = rng.next()
          let input: LockstepInput
          if (roll < 0.06) input = { action: "pulse" }
          else if (roll < 0.14) input = { action: "wait" }
          else if (roll < 0.18) input = rng.pick(weird)
          else {
            const dir = rng.pick(dirs)
            input = { action: "move", dx: dir.dx, dy: dir.dy }
          }

          state = core.step(state, [input], 0)

          expect(Number.isFinite(state.points)).toBe(true)
          expect(state.hp).toBeGreaterThanOrEqual(0)
          expect(state.hp).toBeLessThanOrEqual(state.maxHp)
          expect(state.turns).toBeGreaterThanOrEqual(state.sectorStartedAt)
          expect(state.enemies.some((enemy) => enemy.hp <= 0)).toBe(false)
          expect(new Set(state.enemies.map((enemy) => `${enemy.x},${enemy.y}`)).size).toBe(
            state.enemies.length,
          )
          expect(
            state.walls.some((wall) => wall.x === state.player.x && wall.y === state.player.y),
          ).toBe(false)
          expect(
            dangerCells(state).every(
              (cell) => cell.x >= 0 && cell.x < state.size && cell.y >= 0 && cell.y < state.size,
            ),
          ).toBe(true)
        }
      }
    }
  })
})
