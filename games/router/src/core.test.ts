import { describe, expect, it } from "vitest"
import { playTurn } from "@await-arcade/framework"
import {
  EAST,
  NORTH,
  SOUTH,
  WEST,
  analyzeCircuit,
  core,
  generateBoard,
  periodOf,
  previewRotate,
  rotateCCW,
  rotateCW,
  rotateMask,
  specFor,
  traceRotate,
  type Point,
  type RouterInput,
  type RouterState,
} from "./core"
import { meta } from "./meta"
import fixture from "../replay.json"

const easy = meta.modes.find((mode) => mode.id === "easy")!
const hard = meta.modes.find((mode) => mode.id === "hard")!

const DIRS = [NORTH, EAST, SOUTH, WEST] as const
const DELTAS: Readonly<Record<number, Point>> = {
  [NORTH]: { x: 0, y: -1 },
  [EAST]: { x: 1, y: 0 },
  [SOUTH]: { x: 0, y: 1 },
  [WEST]: { x: -1, y: 0 },
}

function opposite(dir: number): number {
  return ((dir << 2) | (dir >> 2)) & 0b1111
}

function popcount(mask: number): number {
  let count = 0
  for (const dir of DIRS) if ((mask & dir) !== 0) count += 1
  return count
}

function stateAt(
  masks: readonly number[],
  width: number,
  height: number,
  source: Point,
  overrides: Partial<RouterState> = {},
): RouterState {
  return {
    seed: 1,
    modeId: width === 5 ? "easy" : "hard",
    width,
    height,
    source,
    masks: [...masks],
    par: 0,
    rotationBudget: 999,
    rotationsUsed: 0,
    phase: "playing",
    ...overrides,
  }
}

function run(state: RouterState, inputs: readonly RouterInput[]): RouterState {
  let next = state
  for (const input of inputs) {
    next = core.step(next, [input], 0)
    if (next.phase !== "playing") break
  }
  return next
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

/** Shortest number of quarter turns that restores `initial` to `solved`. */
function restoreTurns(solved: number, initial: number): readonly (1 | -1)[] {
  const period = periodOf(solved)
  if (period === 1) return []
  const offset = [0, 1, 2, 3].find((k) => rotateMask(solved, k) === initial)!
  if (offset === 0) return []
  if (offset === 1) return [-1]
  if (offset === 2) return [1, 1]
  return [1]
}

/** The brief's fixture script: one redundant pair, then shortest restores. */
function fixtureInputs(): RouterInput[] {
  const generated = generateBoard(20260420, specFor("easy"))
  const first = generated.initialMasks.findIndex((mask) => periodOf(mask) > 1)
  const x = first % generated.width
  const y = Math.floor(first / generated.width)
  const inputs: RouterInput[] = [
    { type: "rotate", x, y, dir: 1 },
    { type: "rotate", x, y, dir: -1 },
  ]

  for (let index = 0; index < generated.initialMasks.length; index += 1) {
    for (const dir of restoreTurns(generated.solvedMasks[index]!, generated.initialMasks[index]!)) {
      inputs.push({
        type: "rotate",
        x: index % generated.width,
        y: Math.floor(index / generated.width),
        dir,
      })
    }
  }

  return inputs
}

describe("generation invariants", () => {
  for (const mode of [easy, hard]) {
    const spec = specFor(mode)

    it(`${mode.id} builds a connected, matched spanning tree for 60 seeds`, () => {
      for (let seed = 1; seed <= 60; seed += 1) {
        const label = `${mode.id} seed ${seed}`
        const generated = generateBoard(seed, mode)
        const cells = spec.width * spec.height

        expect(generated.width, label).toBe(spec.width)
        expect(generated.height, label).toBe(spec.height)
        expect(generated.modeId, label).toBe(mode.id)
        expect(generated.source, label).toEqual(spec.source)
        expect(generated.initialMasks, label).toHaveLength(cells)
        expect(generated.solvedMasks, label).toHaveLength(cells)
        expect(generated.par, label).toBeGreaterThanOrEqual(spec.minPar)
        expect(generated.rotationBudget, label).toBeGreaterThan(generated.par)

        for (const mask of [...generated.solvedMasks, ...generated.initialMasks]) {
          expect(mask, label).toBeGreaterThanOrEqual(1)
          expect(mask, label).toBeLessThanOrEqual(15)
        }

        const solved = analyzeCircuit(
          generated.solvedMasks,
          generated.width,
          generated.height,
          generated.source,
        )
        expect(solved.solved, label).toBe(true)
        expect(solved.poweredCount, label).toBe(cells)
        expect(solved.danglingCount, label).toBe(0)

        const initial = analyzeCircuit(
          generated.initialMasks,
          generated.width,
          generated.height,
          generated.source,
        )
        expect(initial.solved, label).toBe(false)

        // Exactly cells - 1 undirected edges, all matched, all on the grid.
        let bits = 0
        for (let y = 0; y < generated.height; y += 1) {
          for (let x = 0; x < generated.width; x += 1) {
            const index = y * generated.width + x
            const mask = generated.solvedMasks[index]!
            bits += popcount(mask)
            for (const dir of DIRS) {
              if ((mask & dir) === 0) continue
              const nx = x + DELTAS[dir]!.x
              const ny = y + DELTAS[dir]!.y
              expect(nx, label).toBeGreaterThanOrEqual(0)
              expect(nx, label).toBeLessThan(generated.width)
              expect(ny, label).toBeGreaterThanOrEqual(0)
              expect(ny, label).toBeLessThan(generated.height)
              const neighbor = generated.solvedMasks[ny * generated.width + nx]!
              expect(neighbor & opposite(dir), label).not.toBe(0)
            }
          }
        }
        expect(bits / 2, label).toBe(cells - 1)
      }
    })
  }
})

describe("mode specs", () => {
  it("pins the revision-2 boards and per-mode budget slack", () => {
    expect(specFor("easy")).toMatchObject({
      id: "easy",
      width: 5,
      height: 5,
      source: { x: 2, y: 2 },
      minPar: 12,
    })
    expect(specFor("hard")).toMatchObject({
      id: "hard",
      width: 6,
      height: 6,
      source: { x: 3, y: 3 },
      minPar: 18,
    })

    for (const mode of [easy, hard]) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const state = core.create(seed, mode)
        const slack =
          mode.id === "easy"
            ? Math.max(8, Math.ceil(state.par * 0.6))
            : Math.max(12, Math.ceil(state.par * 1.0))
        expect(state.rotationBudget, `${mode.id} seed ${seed}`).toBe(state.par + slack)
      }
    }
  })

  it("advertises the 6×6 hard mode and its budget", () => {
    const hardMode = meta.modes.find((mode) => mode.id === "hard")!
    expect(meta.version).toBe("1.1.0")
    expect(meta.display).toMatchObject({ width: 6, height: 6 })
    expect(hardMode.title).toContain("6×6")
    expect(hardMode.description).toContain("6 × 6")
    expect(hardMode.description).toContain("par + max(12, 1.0×par)")
  })
})

describe("rotation arithmetic", () => {
  it("round-trips every mask and normalizes any step count", () => {
    for (let mask = 0; mask <= 15; mask += 1) {
      expect(rotateCCW(rotateCW(mask))).toBe(mask)
      expect(rotateCW(rotateCCW(mask))).toBe(mask)
      expect(rotateMask(mask, 4)).toBe(mask)
      expect(rotateMask(mask, 0)).toBe(mask)
      expect(rotateMask(mask, -4)).toBe(mask)
      for (let k = -9; k <= 9; k += 1) expect(rotateMask(mask, k)).toBe(rotateMask(mask, k + 4))
    }
    expect(rotateMask(NORTH, 1)).toBe(EAST)
    expect(rotateMask(EAST, -1)).toBe(NORTH)
  })

  it("classifies rotational periods by shape", () => {
    expect(periodOf(15)).toBe(1)
    expect(periodOf(5)).toBe(2)
    expect(periodOf(10)).toBe(2)
    for (let mask = 1; mask <= 15; mask += 1) {
      if (mask === 5 || mask === 10 || mask === 15) continue
      expect(periodOf(mask), `mask ${mask}`).toBe(4)
    }
  })
})

describe("solved predicate and near misses", () => {
  const width = 3
  const height = 3
  const source = { x: 1, y: 1 }
  // Snake: (0,0)-(0,1)-(0,2)-(1,2)-(1,1)-(1,0)-(2,0)-(2,1)-(2,2).
  const tree = [SOUTH, SOUTH | EAST, WEST | SOUTH, NORTH | SOUTH, SOUTH | NORTH, NORTH | SOUTH, NORTH | EAST, WEST | NORTH, NORTH]

  it("accepts a known valid spanning tree", () => {
    const analysis = analyzeCircuit(tree, width, height, source)
    expect(analysis.solved).toBe(true)
    expect(analysis.poweredCount).toBe(9)
    expect(analysis.danglingCount).toBe(0)
  })

  it("rejects a fully lit board with one tee stub at a blank wall", () => {
    const nearMiss = [...tree]
    nearMiss[4] = NORTH | EAST | SOUTH // add an east stub into (2,1)'s blank west edge
    const analysis = analyzeCircuit(nearMiss, width, height, source)
    expect(analysis.poweredCount).toBe(9)
    expect(analysis.danglingCount).toBe(1)
    expect(analysis.solved).toBe(false)
  })

  it("rejects a leak-free isolated 2x2 loop disconnected from the source", () => {
    const masks = Array<number>(16).fill(0)
    // A closed loop at the top-left, far from the source at (3,3).
    masks[0] = EAST | SOUTH
    masks[1] = WEST | SOUTH
    masks[4] = EAST | NORTH
    masks[5] = WEST | NORTH
    const analysis = analyzeCircuit(masks, 4, 4, { x: 3, y: 3 })
    expect(analysis.danglingCount).toBe(0)
    expect(analysis.poweredCount).toBe(1)
    expect(analysis.solved).toBe(false)
  })
})

describe("determinism", () => {
  it("creates identical states for the same seed and normalizes signed seeds", () => {
    for (const mode of [easy, hard]) {
      expect(core.serialize(core.create(1234, mode))).toEqual(
        core.serialize(core.create(1234, mode)),
      )
      expect(core.serialize(core.create(-1234, mode))).toEqual(
        core.serialize(core.create(-1234 >>> 0, mode)),
      )
      expect(core.serialize(core.create(1234, mode))).not.toEqual(
        core.serialize(core.create(1235, mode)),
      )
    }
  })

  it("replays identical inputs to the same hash and score", () => {
    const mode = easy
    const initial = core.create(77, mode)
    const inputs: RouterInput[] = []
    for (let index = 0; index < 8; index += 1) {
      inputs.push({
        type: "rotate",
        x: index % initial.width,
        y: Math.floor(index / initial.width),
        dir: index % 2 === 0 ? 1 : -1,
      })
    }

    const left = playTurn(core, meta, { seed: 77, mode, inputs, durationMs: 12_000 })
    const right = playTurn(core, meta, { seed: 77, mode, inputs, durationMs: 12_000 })
    expect(left.replay.stateHash).toBe(right.replay.stateHash)
    expect(left.score).toEqual(right.score)
  })
})

describe("input hardening and the loss path", () => {
  it("ignores malformed inputs without spending a turn", () => {
    const state = core.create(9, easy)
    const malformed: unknown[] = [
      null,
      undefined,
      42,
      "rotate",
      {},
      { type: "spin", x: 0, y: 0, dir: 1 },
      { type: "rotate", x: -1, y: 0, dir: 1 },
      { type: "rotate", x: state.width, y: 0, dir: 1 },
      { type: "rotate", x: 0, y: -1, dir: 1 },
      { type: "rotate", x: 0, y: state.height, dir: 1 },
      { type: "rotate", x: 1.5, y: 0, dir: 1 },
      { type: "rotate", x: Number.NaN, y: 0, dir: 1 },
      { type: "rotate", x: 0, y: 0, dir: 0 },
      { type: "rotate", x: 0, y: 0, dir: 2 },
    ]

    for (const input of malformed) {
      const next = core.step(state, [input as RouterInput], 0)
      expect(next).toBe(state)
      expect(next.rotationsUsed).toBe(0)
    }

    expect(core.step(state, null as unknown as RouterInput[], 0)).toBe(state)
  })

  it("treats a 4-way cross as a free no-op", () => {
    const base = core.create(9, easy)
    const masks = [...base.masks]
    masks[0] = 15
    const state = { ...base, masks }
    const next = core.step(state, [{ type: "rotate", x: 0, y: 0, dir: 1 }], 0)
    expect(next).toBe(state)
    expect(next.rotationsUsed).toBe(0)
    expect(previewRotate(state, 0, 0, 1)?.valid).toBe(false)
    expect(traceRotate(state, 0, 0, 1)).toBeNull()
  })

  it("loses when the rotation budget is exhausted and scores zero", () => {
    let state = core.create(9, easy)
    const index = state.masks.findIndex((mask) => periodOf(mask) > 1)
    const x = index % state.width
    const y = Math.floor(index / state.width)
    let guard = 0
    while (state.phase === "playing" && guard < state.rotationBudget + 10) {
      state = core.step(state, [{ type: "rotate", x, y, dir: 1 }], 0)
      guard += 1
    }

    expect(state.phase).toBe("lost")
    expect(state.rotationsUsed).toBe(state.rotationBudget)
    const score = core.score(state, { elapsedMs: 10_000, ticks: state.rotationsUsed })
    expect(score.value).toBe(0)
    expect(score.won).toBe(false)
    expect(score.ranked).toBe(false)
  })

  it("ignores every input after a terminal phase", () => {
    const won = fixtureInputs()
    let state = core.create(20260420, easy)
    state = run(state, won)
    expect(state.phase).toBe("won")
    expect(core.step(state, [{ type: "rotate", x: 0, y: 0, dir: 1 }], 0)).toBe(state)

    const lost = { ...core.create(9, easy), phase: "lost" as const }
    expect(core.step(lost, [{ type: "rotate", x: 0, y: 0, dir: 1 }], 0)).toBe(lost)
  })
})

describe("serialize round-trip and zero leak", () => {
  it("round-trips play state and terminal state without the solution", () => {
    let state = core.create(20260420, easy)
    const inputs = fixtureInputs()
    const samples: RouterState[] = [state]

    for (let index = 0; index < inputs.length; index += 1) {
      state = core.step(state, [inputs[index]!], 0)
      if (index === 3 || state.phase !== "playing") samples.push(state)
    }

    for (const sample of samples) {
      const serialized = core.serialize(sample) as Record<string, unknown>
      expect(Object.keys(serialized).sort()).toEqual(
        [
          "seed",
          "mode",
          "width",
          "height",
          "source",
          "masks",
          "par",
          "rotationBudget",
          "rotationsUsed",
          "phase",
        ].sort(),
      )
      expect(serialized.seed).toBe(sample.seed)
      expect(serialized.mode).toBe(sample.modeId)
      expect(serialized.width).toBe(sample.width)
      expect(serialized.height).toBe(sample.height)
      expect(serialized.source).toEqual(sample.source)
      expect(serialized.masks).toEqual(sample.masks)
      expect(serialized.par).toBe(sample.par)
      expect(serialized.rotationBudget).toBe(sample.rotationBudget)
      expect(serialized.rotationsUsed).toBe(sample.rotationsUsed)
      expect(serialized.phase).toBe(sample.phase)

      const text = JSON.stringify(serialized)
      expect(text).not.toContain("solvedMasks")
      expect(text).not.toContain("offsets")
      expect(text).not.toContain("solution")
      expect(serialized).not.toHaveProperty("solvedMasks")
      expect(serialized).not.toHaveProperty("offsets")
    }
  })
})

describe("score invariance", () => {
  it("never lets elapsed time change value, eligibility, or detail", () => {
    const generated = generateBoard(20260420, specFor("easy"))
    const won: RouterState = {
      ...core.create(20260420, easy),
      masks: [...generated.solvedMasks],
      rotationsUsed: generated.par,
      phase: "won",
    }
    const fast = core.score(won, { elapsedMs: 1_000, ticks: 12 })
    const slow = core.score(won, { elapsedMs: 1_800_000, ticks: 12 })
    expect(fast.value).toBe(slow.value)
    expect(fast.won).toBe(slow.won)
    expect(fast.ranked).toBe(slow.ranked)
    expect(fast.detail).toEqual(slow.detail)
    expect(fast.value).toBe(2500)
  })

  it("scores concrete base, over-par, and floor values", () => {
    const easyBoard = generateBoard(20260420, specFor("easy"))
    const hardBoard = generateBoard(20260420, specFor("hard"))
    const easyScore = (rotationsUsed: number): number =>
      core.score(
        {
          ...core.create(20260420, easy),
          masks: [...easyBoard.solvedMasks],
          par: easyBoard.par,
          rotationsUsed,
          phase: "won",
        },
        { elapsedMs: 0, ticks: 0 },
      ).value
    const hardScore = (rotationsUsed: number): number =>
      core.score(
        {
          ...core.create(20260420, hard),
          masks: [...hardBoard.solvedMasks],
          par: hardBoard.par,
          rotationsUsed,
          phase: "won",
        },
        { elapsedMs: 0, ticks: 0 },
      ).value

    expect(easyScore(easyBoard.par)).toBe(2500)
    expect(easyScore(easyBoard.par - 1)).toBe(2500)
    expect(hardScore(hardBoard.par)).toBe(5000)
    expect(hardScore(hardBoard.par - 1)).toBe(5000)
    expect(easyScore(easyBoard.par + 12)).toBe(1900)
    expect(easyScore(easyBoard.par + 60)).toBe(100)
  })
})

describe("preview and trace agree with the committed engine", () => {
  function expectAgreement(state: RouterState, x: number, y: number, dir: 1 | -1): void {
    const preview = previewRotate(state, x, y, dir)
    const trace = traceRotate(state, x, y, dir)
    const committed = core.step(state, [{ type: "rotate", x, y, dir }], 0)
    const index = y * state.width + x
    const before = analyzeCircuit(state.masks, state.width, state.height, state.source)

    if (state.masks[index] === 15) {
      expect(preview?.valid).toBe(false)
      expect(trace).toBeNull()
      expect(committed).toBe(state)
      return
    }

    expect(preview).not.toBeNull()
    expect(trace).not.toBeNull()
    if (!preview || !trace) return

    const after = analyzeCircuit(committed.masks, committed.width, committed.height, committed.source)
    expect(preview.valid).toBe(true)
    expect(preview.nextMask).toBe(committed.masks[index])
    expect(preview.poweredCount).toBe(after.poweredCount)
    expect(preview.danglingCount).toBe(after.danglingCount)
    expect(preview.solved).toBe(after.solved)
    expect(preview.newlyPowered).toEqual(
      after.distances
        .map((distance, at) =>
          before.distances[at] === -1 && distance >= 0
            ? { x: at % state.width, y: Math.floor(at / state.width) }
            : null,
        )
        .filter((point): point is Point => point !== null),
    )
    expect(preview.lostPower).toEqual(
      after.distances
        .map((distance, at) =>
          before.distances[at]! >= 0 && distance === -1
            ? { x: at % state.width, y: Math.floor(at / state.width) }
            : null,
        )
        .filter((point): point is Point => point !== null),
    )

    expect(trace.nextMask).toBe(preview.nextMask)
    expect(trace.poweredCount).toBe(after.poweredCount)
    expect(trace.danglingCount).toBe(after.danglingCount)
    expect(trace.solved).toBe(after.solved)
    expect(trace.lost).toEqual(preview.lostPower)
    expect(trace.waves.length).toBeLessThanOrEqual(5)
    const flattened = trace.waves.flat()
    expect(new Set(flattened.map(pointKey)).size).toBe(flattened.length)
    expect(new Set(flattened.map(pointKey))).toEqual(
      new Set(preview.newlyPowered.map(pointKey)),
    )
  }

  it("matches across generated turns for ten seeds per mode", () => {
    for (const mode of [easy, hard]) {
      const spec = specFor(mode)
      for (let seed = 1; seed <= 10; seed += 1) {
        const state = core.create(seed, mode)
        for (let index = 0; index < spec.width * spec.height; index += 1) {
          const x = index % spec.width
          const y = Math.floor(index / spec.width)
          expectAgreement(state, x, y, 1)
          expectAgreement(state, x, y, -1)
        }
      }
    }
  })

  it("matches a winning move, a de-powering move, and a neutral move", () => {
    // Winning: the final fixture rotation.
    const inputs = fixtureInputs()
    let winning = core.create(20260420, easy)
    for (let index = 0; index < inputs.length - 1; index += 1) {
      winning = core.step(winning, [inputs[index]!], 0)
    }
    const last = inputs[inputs.length - 1]!
    expect(previewRotate(winning, last.x, last.y, last.dir)?.solved).toBe(true)
    expectAgreement(winning, last.x, last.y, last.dir)

    // De-powering: rotate a working bridge on the solved reference tree.
    const generated = generateBoard(7, specFor("easy"))
    const solvedState: RouterState = {
      ...core.create(7, easy),
      masks: [...generated.solvedMasks],
      phase: "playing",
    }
    let foundDepower = false
    for (let index = 0; index < solvedState.masks.length && !foundDepower; index += 1) {
      const x = index % solvedState.width
      const y = Math.floor(index / solvedState.width)
      for (const dir of [1, -1] as const) {
        const preview = previewRotate(solvedState, x, y, dir)
        if (preview?.valid && preview.lostPower.length > 0) {
          expectAgreement(solvedState, x, y, dir)
          foundDepower = true
          break
        }
      }
    }
    expect(foundDepower).toBe(true)

    // Neutral: any rotation that neither gains nor loses power.
    let foundNeutral = false
    for (let seed = 1; seed <= 40 && !foundNeutral; seed += 1) {
      const state = core.create(seed, easy)
      for (let index = 0; index < state.masks.length && !foundNeutral; index += 1) {
        const x = index % state.width
        const y = Math.floor(index / state.width)
        for (const dir of [1, -1] as const) {
          const preview = previewRotate(state, x, y, dir)
          if (preview?.valid && preview.newlyPowered.length === 0 && preview.lostPower.length === 0) {
            expectAgreement(state, x, y, dir)
            foundNeutral = true
            break
          }
        }
      }
    }
    expect(foundNeutral).toBe(true)
  })

  it("returns null for terminal, out-of-bounds, non-integer, and invalid directions", () => {
    const state = core.create(3, easy)
    expect(previewRotate(state, -1, 0, 1)).toBeNull()
    expect(previewRotate(state, 0, state.height, 1)).toBeNull()
    expect(previewRotate(state, 1.5, 0, 1)).toBeNull()
    expect(previewRotate(state, 0, 0, 2 as 1)).toBeNull()
    expect(traceRotate(state, -1, 0, 1)).toBeNull()

    const terminal = { ...state, phase: "won" as const }
    expect(previewRotate(terminal, 0, 0, 1)).toBeNull()
    expect(traceRotate(terminal, 0, 0, 1)).toBeNull()
  })
})

describe("replay fixture", () => {
  const inputs = fixtureInputs()
  const generated = generateBoard(20260420, specFor("easy"))
  const played = playTurn(core, meta, {
    seed: 20260420,
    mode: easy,
    inputs,
    durationMs: 60_000,
  })

  it("restores the reference tree with no early alternate solve", () => {
    let state = core.create(20260420, easy)
    for (let index = 0; index < inputs.length - 1; index += 1) {
      state = core.step(state, [inputs[index]!], 0)
      expect(state.phase, `prefix ${index}`).toBe("playing")
    }
    state = core.step(state, [inputs[inputs.length - 1]!], 0)
    expect(state.phase).toBe("won")
  })

  it("has the brief's pinned shape and a verified replay", () => {
    expect(generated.par).toBe(19)
    expect(played.state.par).toBe(19)
    expect(inputs.length).toBe(21)
    expect(played.state.rotationsUsed).toBe(21)
    expect(played.state.phase).toBe("won")
    expect(played.score.value).toBe(2400)
    expect(played.verified.ok).toBe(true)
    expect(fixture.gameId).toBe("router")
    expect(fixture.gameVersion).toBe(meta.version)
    expect(fixture.stateHash).toBe(played.replay.stateHash)
    expect(fixture.inputs.length).toBe(21)
  })
})
