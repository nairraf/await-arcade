import { describe, expect, it } from "vitest"
import type { Replay } from "@await-arcade/contract"
import { createRng, playTurn, stateHash, verifyReplay } from "@await-arcade/framework"
import {
  DIRS,
  FALLBACK_EASY,
  FALLBACK_HARD,
  core,
  findStuckCrate,
  generateBoard,
  isCornerCell,
  previewMove,
  specFor,
  traceMove,
  type CrateInput,
  type CrateState,
  type GeneratedBoard,
  type MoveDir,
} from "./core"
import { meta } from "./meta"
import fixture from "../replay.json"

const easy = meta.modes.find((mode) => mode.id === "easy")!
const hard = meta.modes.find((mode) => mode.id === "hard")!

const DX: Record<MoveDir, number> = { up: 0, right: 1, down: 0, left: -1 }
const DY: Record<MoveDir, number> = { up: -1, right: 0, down: 1, left: 0 }

function move(dir: MoveDir): CrateInput {
  return { type: "move", dir }
}

function run(state: CrateState, inputs: readonly CrateInput[]): CrateState {
  let next = state
  for (const input of inputs) {
    next = core.step(next, [input], 0)
    if (next.phase !== "playing") break
  }
  return next
}

function cellAfter(pos: number, dir: MoveDir, width: number, height: number): number | null {
  const x = (pos % width) + DX[dir]
  const y = Math.floor(pos / width) + DY[dir]
  if (x < 0 || x >= width || y < 0 || y >= height) return null
  return y * width + x
}

/* ------------------------------------------------------------------ */
/* Independent raw oracle (no findStuckCrate, no state.phase)          */
/* ------------------------------------------------------------------ */

interface OracleState {
  readonly operator: number
  readonly crates: readonly number[]
}

function oracleStep(
  state: OracleState,
  dir: MoveDir,
  walls: readonly boolean[],
  width: number,
  height: number,
): OracleState | null {
  const target = cellAfter(state.operator, dir, width, height)
  if (target === null || walls[target]) return null
  const crateIndex = state.crates.indexOf(target)
  if (crateIndex < 0) return { operator: target, crates: state.crates }

  const behind = cellAfter(target, dir, width, height)
  if (behind === null || walls[behind] || state.crates.includes(behind)) return null
  const crates = [...state.crates]
  crates[crateIndex] = behind
  return { operator: target, crates }
}

function oracleKey(state: OracleState): string {
  return `${state.operator}|${[...state.crates].sort((a, b) => a - b).join(",")}`
}

/** Minimum raw moves to all-crates-on-goals, or null (unsolvable / cap hit). */
function oracleSolve(
  start: OracleState,
  walls: readonly boolean[],
  goals: readonly number[],
  width: number,
  height: number,
  cap = 120_000,
): number | null {
  const goalSet = new Set(goals)
  const done = (crates: readonly number[]): boolean =>
    crates.every((cell) => goalSet.has(cell))

  if (done(start.crates)) return 0

  const seen = new Set<string>([oracleKey(start)])
  const queue: Array<{ readonly state: OracleState; readonly moves: number }> = [
    { state: start, moves: 0 },
  ]
  let popped = 0
  for (let head = 0; head < queue.length; head += 1) {
    if (popped >= cap) return null
    const current = queue[head]!
    popped += 1
    for (const dir of DIRS) {
      const next = oracleStep(current.state, dir, walls, width, height)
      if (next === null) continue
      const key = oracleKey(next)
      if (seen.has(key)) continue
      if (done(next.crates)) return current.moves + 1
      seen.add(key)
      queue.push({ state: next, moves: current.moves + 1 })
    }
  }
  return null
}

function openConnected(board: GeneratedBoard): number {
  const { width, height, walls } = board
  const total = width * height
  const start = walls.findIndex((wall) => !wall)
  if (start < 0) return 0
  const seen = new Uint8Array(total)
  const queue = [start]
  seen[start] = 1
  let count = 0
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]!
    count += 1
    for (const dir of DIRS) {
      const next = cellAfter(cell, dir, width, height)
      if (next === null || walls[next] || seen[next]) continue
      seen[next] = 1
      queue.push(next)
    }
  }
  return count
}

function makeState(overrides: Partial<CrateState> = {}): CrateState {
  return {
    seed: 1,
    modeId: "easy",
    width: 6,
    height: 6,
    walls: new Array<boolean>(36).fill(false),
    goals: [1, 7],
    crates: [8, 9],
    operator: 14,
    par: 10,
    moveBudget: 20,
    movesUsed: 0,
    phase: "playing",
    lossReason: "none",
    ...overrides,
  }
}

function stateFromBoard(board: GeneratedBoard, seed: number): CrateState {
  return {
    seed: seed >>> 0,
    modeId: board.modeId,
    width: board.width,
    height: board.height,
    walls: [...board.walls],
    goals: [...board.goals],
    crates: [...board.initialCrates],
    operator: board.initialOperator,
    par: board.par,
    moveBudget: board.moveBudget,
    movesUsed: 0,
    phase: "playing",
    lossReason: "none",
  }
}

function assertBoardInvariants(board: GeneratedBoard, seed: number, modeId: "easy" | "hard"): void {
  const expected =
    modeId === "hard"
      ? { width: 7, height: 7, walls: 8, goals: 2, minPar: 12 }
      : { width: 6, height: 6, walls: 5, goals: 2, minPar: 8 }
  const total = board.width * board.height
  expect(board.modeId).toBe(modeId)
  expect(board.width).toBe(expected.width)
  expect(board.height).toBe(expected.height)
  expect(board.walls).toHaveLength(total)
  expect(board.walls.filter(Boolean)).toHaveLength(expected.walls)
  expect(openConnected(board)).toBe(total - expected.walls)
  expect(board.goals).toHaveLength(expected.goals)
  expect(board.initialCrates).toHaveLength(expected.goals)
  expect([...board.initialCrates].sort((a, b) => a - b)).toEqual([...board.initialCrates])

  const goalSet = new Set(board.goals)
  for (const cell of board.goals) {
    expect(board.walls[cell]).toBe(false)
    expect(cell).toBeGreaterThanOrEqual(0)
    expect(cell).toBeLessThan(total)
  }
  for (const crate of board.initialCrates) {
    expect(board.walls[crate]).toBe(false)
    expect(goalSet.has(crate)).toBe(false)
  }
  expect(board.walls[board.initialOperator]).toBe(false)
  expect(board.initialCrates.includes(board.initialOperator)).toBe(false)

  for (const crate of board.initialCrates) {
    expect(isCornerCell(crate, board.walls, board.width, board.height)).toBe(false)
  }

  // Pinned literals, deliberately not derived from core constants.
  expect(board.par).toBeGreaterThanOrEqual(expected.minPar)
  expect(board.par).toBeLessThanOrEqual(board.canonicalSolution.length)
  expect(board.moveBudget).toBe(board.par + Math.max(6, Math.ceil(board.par * 0.75)))
  expect(board.moveBudget).toBeGreaterThanOrEqual(Math.ceil(1.6 * board.par))
  expect(board.optimalSolution).toHaveLength(board.par)

  const state = core.create(seed, modeId === "hard" ? hard : easy)
  expect(state.par).toBe(board.par)
  expect(state.moveBudget).toBe(board.moveBudget)
  expect(DIRS.some((dir) => previewMove(state, dir)?.valid)).toBe(true)
}

const SEEDS = Array.from({ length: 60 }, (_, index) => index + 50)

describe("crates generation", () => {
  it("keeps every structural invariant across seeds for both modes", () => {
    for (const modeId of ["easy", "hard"] as const) {
      for (const seed of SEEDS) {
        const board = generateBoard(seed, modeId)
        assertBoardInvariants(board, seed, modeId)
      }
    }
  })

  it("falls back to pinned seed-1 boards and they satisfy every invariant", () => {
    const fallbackEasy = generateBoard(1, "easy", { maxAttempts: 0 })
    const fallbackHard = generateBoard(1, "hard", { maxAttempts: 0 })
    expect(fallbackEasy).toEqual(FALLBACK_EASY)
    expect(fallbackHard).toEqual(FALLBACK_HARD)
    expect([fallbackEasy.par, fallbackEasy.moveBudget]).toEqual([13, 23])
    expect([fallbackHard.par, fallbackHard.moveBudget]).toEqual([12, 21])

    for (const [board, modeId] of [
      [fallbackEasy, "easy"],
      [fallbackHard, "hard"],
    ] as const) {
      assertBoardInvariants(board, 1, modeId)

      // Build the state from the returned fallback, not a fresh generate().
      const state = stateFromBoard(board, 1)
      expect(core.serialize(state)).toEqual(
        core.serialize(core.create(1, modeId === "hard" ? hard : easy)),
      )

      const solved = run(state, board.optimalSolution)
      expect(solved.phase).toBe("won")
      expect(solved.movesUsed).toBe(board.par)

      const optimum = oracleSolve(
        { operator: board.initialOperator, crates: board.initialCrates },
        board.walls,
        board.goals,
        board.width,
        board.height,
      )
      expect(optimum).toBe(board.par)
    }
  })

  it("treats unknown mode ids as easy", () => {
    expect(specFor("nope").id).toBe("easy")
    expect(specFor("hard").id).toBe("hard")
    expect(generateBoard(7, "unknown").modeId).toBe("easy")
  })
})

describe("crates optimal par and solvability", () => {
  it("wins in exactly par moves and agrees with an independent raw BFS", () => {
    for (const modeId of ["easy", "hard"] as const) {
      const base = modeId === "hard" ? 4_000 : 2_000
      for (const seed of SEEDS) {
        const board = generateBoard(seed, modeId)
        const state = core.create(seed, modeId === "hard" ? hard : easy)
        const solved = run(state, board.optimalSolution)
        expect(solved.phase).toBe("won")
        expect(solved.movesUsed).toBe(board.par)
        expect(core.score(solved, { elapsedMs: 0, ticks: board.par }).value).toBe(base)

        const optimum = oracleSolve(
          { operator: board.initialOperator, crates: board.initialCrates },
          board.walls,
          board.goals,
          board.width,
          board.height,
        )
        expect(optimum).toBe(board.par)

        // The reverse-pull canonical solution is a raw-rule witness too.
        let raw = { operator: board.initialOperator, crates: board.initialCrates }
        let canonicalMoves = 0
        for (const input of board.canonicalSolution) {
          const next = oracleStep(raw, input.dir, board.walls, board.width, board.height)
          expect(next).not.toBeNull()
          raw = next!
          canonicalMoves += 1
          if (raw.crates.every((cell) => board.goals.includes(cell))) break
        }
        expect(canonicalMoves).toBe(board.canonicalSolution.length)
        expect(raw.crates.every((cell) => board.goals.includes(cell))).toBe(true)
      }
    }
  })
})

describe("crates stuck soundness", () => {
  const wallCells = (cells: readonly number[]): boolean[] => {
    const walls = new Array<boolean>(36).fill(false)
    for (const cell of cells) walls[cell] = true
    return walls
  }

  const pointAt = (cell: number, width = 6): { x: number; y: number } => ({
    x: cell % width,
    y: Math.floor(cell / width),
  })

  interface CornerCase {
    readonly name: string
    readonly corner: number
    readonly walls: readonly number[]
    readonly push: { readonly crate: number; readonly operator: number; readonly dir: MoveDir }
    readonly walk: { readonly operator: number; readonly dir: MoveDir }
  }

  // Four quadrants × border-border / both border-wall orientations / wall-wall.
  const CORNER_CASES: readonly CornerCase[] = [
    // up + left
    { name: "up-left border-border", corner: 0, walls: [], push: { crate: 1, operator: 2, dir: "left" }, walk: { operator: 2, dir: "down" } },
    { name: "up-left border-wall", corner: 6, walls: [0], push: { crate: 12, operator: 18, dir: "up" }, walk: { operator: 18, dir: "right" } },
    { name: "up-left wall-wall", corner: 7, walls: [1, 6], push: { crate: 13, operator: 19, dir: "up" }, walk: { operator: 19, dir: "left" } },
    // up + right
    { name: "up-right border-border", corner: 5, walls: [], push: { crate: 4, operator: 3, dir: "right" }, walk: { operator: 3, dir: "down" } },
    { name: "up-right border-wall", corner: 1, walls: [2], push: { crate: 7, operator: 13, dir: "up" }, walk: { operator: 13, dir: "right" } },
    { name: "up-right wall-wall", corner: 13, walls: [7, 14], push: { crate: 19, operator: 25, dir: "up" }, walk: { operator: 25, dir: "left" } },
    // down + left
    { name: "down-left border-border", corner: 30, walls: [], push: { crate: 31, operator: 32, dir: "left" }, walk: { operator: 32, dir: "up" } },
    { name: "down-left border-wall", corner: 6, walls: [12], push: { crate: 7, operator: 8, dir: "left" }, walk: { operator: 8, dir: "down" } },
    { name: "down-left wall-wall", corner: 13, walls: [19, 12], push: { crate: 7, operator: 1, dir: "down" }, walk: { operator: 1, dir: "left" } },
    // down + right
    { name: "down-right border-border", corner: 35, walls: [], push: { crate: 34, operator: 33, dir: "right" }, walk: { operator: 33, dir: "up" } },
    { name: "down-right border-wall", corner: 11, walls: [17], push: { crate: 10, operator: 9, dir: "right" }, walk: { operator: 9, dir: "down" } },
    { name: "down-right wall-wall", corner: 14, walls: [20, 15], push: { crate: 8, operator: 2, dir: "down" }, walk: { operator: 2, dir: "right" } },
  ]

  it("detects every quadrant and shape, including cornering pushes", () => {
    const goals = [21, 28]
    for (const cornerCase of CORNER_CASES) {
      const walls = wallCells(cornerCase.walls)
      expect(isCornerCell(cornerCase.corner, walls, 6, 6)).toBe(true)

      // Push a crate into the corner: refused nowhere, trapped on arrival.
      const pushState = makeState({
        walls,
        goals,
        crates: [cornerCase.push.crate, 22],
        operator: cornerCase.push.operator,
      })
      const preview = previewMove(pushState, cornerCase.push.dir)!
      expect(preview.valid).toBe(true)
      expect(preview.wouldStick).toBe(true)
      expect(preview.landsOnGoal).toBe(false)
      expect(preview.pushedTo).toEqual(pointAt(cornerCase.corner))

      const pushed = core.step(pushState, [move(cornerCase.push.dir)], 0)
      expect(pushed.crates[0]).toBe(cornerCase.corner)
      expect(pushed.phase).toBe("lost")
      expect(pushed.lossReason).toBe("stuck")
      expect(traceMove(pushState, cornerCase.push.dir)?.stuckCell).toEqual(
        pointAt(cornerCase.corner),
      )

      // A crate already in the corner is detected by the next committed walk.
      const walkState = makeState({
        walls,
        goals,
        crates: [cornerCase.corner, 22],
        operator: cornerCase.walk.operator,
      })
      expect(
        findStuckCrate(walkState.crates, walkState.goals, walkState.walls, 6, 6),
      ).toBe(0)
      expect(previewMove(walkState, cornerCase.walk.dir)?.wouldStick).toBe(true)
      const walked = core.step(walkState, [move(cornerCase.walk.dir)], 0)
      expect(walked.phase).toBe("lost")
      expect(walked.lossReason).toBe("stuck")
    }
  })

  it("does not mark a corner when the trap cell is a goal", () => {
    // The same corner cell is safe when it is a goal.
    const onGoal = makeState({
      walls: [true, ...new Array<boolean>(35).fill(false)],
      goals: [6, 20],
      crates: [6, 27],
      operator: 7,
    })
    expect(isCornerCell(6, onGoal.walls, 6, 6)).toBe(true)
    expect(findStuckCrate(onGoal.crates, onGoal.goals, onGoal.walls, 6, 6)).toBe(-1)
    const safe = core.step(onGoal, [move("down")], 0)
    expect(safe.phase).toBe("playing")
    expect(safe.lossReason).toBe("none")
  })

  it("never fires on a one-wall edge or on two crates that can still separate", () => {
    const edge = makeState({
      walls: [false, true, ...new Array<boolean>(34).fill(false)],
      goals: [20, 21],
      crates: [7, 27],
      operator: 8,
    })
    expect(isCornerCell(7, edge.walls, 6, 6)).toBe(false)
    expect(findStuckCrate(edge.crates, edge.goals, edge.walls, 6, 6)).toBe(-1)
    expect(oracleSolve(
      { operator: edge.operator, crates: edge.crates },
      edge.walls,
      edge.goals,
      6,
      6,
    )).not.toBeNull()

    const pair = makeState({
      goals: [20, 21],
      crates: [8, 9],
      operator: 2,
    })
    expect(findStuckCrate(pair.crates, pair.goals, pair.walls, 6, 6)).toBe(-1)
    // Push the left crate up, then the right crate right: both separate.
    const afterPush = core.step(pair, [move("down")], 0)
    expect(afterPush.phase).toBe("playing")
    expect(oracleSolve(
      { operator: afterPush.operator, crates: afterPush.crates },
      afterPush.walls,
      afterPush.goals,
      6,
      6,
    )).not.toBeNull()
  })

  it("proves unsolvability on real stuck rollouts with a raw oracle", () => {
    const stuckStates = new Map<string, CrateState>()
    for (let seed = 1; seed <= 250 && stuckStates.size < 8; seed += 1) {
      const state = core.create(seed, easy)
      const policy = createRng((seed ^ 0x9e3779b9) >>> 0)
      let current = state
      for (let step = 0; step < 500 && current.phase === "playing"; step += 1) {
        const valid = DIRS.filter((dir) => previewMove(current, dir)?.valid === true)
        if (valid.length === 0) break
        const dir = valid[policy.int(0, valid.length - 1)]!
        current = core.step(current, [move(dir)], 0)
      }
      if (current.phase === "lost" && current.lossReason === "stuck") {
        const key = JSON.stringify(core.serialize(current))
        if (!stuckStates.has(key)) stuckStates.set(key, current)
      }
    }

    expect(stuckStates.size).toBeGreaterThanOrEqual(8)
    for (const state of stuckStates.values()) {
      const stuck = findStuckCrate(state.crates, state.goals, state.walls, state.width, state.height)
      expect(stuck).toBeGreaterThanOrEqual(0)
      const solution = oracleSolve(
        { operator: state.operator, crates: state.crates },
        state.walls,
        state.goals,
        state.width,
        state.height,
      )
      expect(solution).toBeNull()
    }

    // Non-stuck initial boards are solvable by the same oracle.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = core.create(seed, easy)
      const solution = oracleSolve(
        { operator: state.operator, crates: state.crates },
        state.walls,
        state.goals,
        state.width,
        state.height,
      )
      expect(solution).toBe(state.par)
    }
  })
})

describe("crates move and refused-push rules", () => {
  it("advances a walk and a push by one move", () => {
    const state = makeState()
    const walked = core.step(state, [move("left")], 0)
    expect(walked.operator).toBe(13)
    expect(walked.movesUsed).toBe(1)
    expect(walked.crates).toEqual(state.crates)

    const pushed = core.step(state, [move("up")], 0)
    expect(pushed.operator).toBe(8)
    expect(pushed.crates).toEqual([2, 9])
    expect(pushed.movesUsed).toBe(1)
  })

  it("refuses out-of-bounds, walls, borders, walls behind, and second crates", () => {
    const edge = makeState({ operator: 0, crates: [20, 30], goals: [1, 7] })
    expect(core.step(edge, [move("left")], 0)).toBe(edge)

    const wall = makeState({ walls: [false, true, ...new Array<boolean>(34).fill(false)], operator: 0 })
    expect(core.step(wall, [move("right")], 0)).toBe(wall)

    const border = makeState({ operator: 7, crates: [1, 30], goals: [20, 21] })
    expect(core.step(border, [move("up")], 0)).toBe(border)
    expect(previewMove(border, "up")).toMatchObject({
      valid: false,
      blockedReason: "blocked-push",
      pushedFrom: { x: 1, y: 0 },
      pushedTo: null,
    })

    const wallBehind = makeState({
      walls: [false, false, true, ...new Array<boolean>(33).fill(false)],
      operator: 0,
      crates: [1, 30],
      goals: [20, 21],
    })
    expect(core.step(wallBehind, [move("right")], 0)).toBe(wallBehind)
    expect(previewMove(wallBehind, "right")?.blockedReason).toBe("blocked-push")

    const secondCrate = makeState({ operator: 0, crates: [1, 2], goals: [20, 21] })
    expect(core.step(secondCrate, [move("right")], 0)).toBe(secondCrate)
    expect(previewMove(secondCrate, "right")?.blockedReason).toBe("blocked-push")

    for (const state of [edge, wall, border, wallBehind, secondCrate]) {
      expect(state.movesUsed).toBe(0)
    }
  })

  it("marks no destination cell when a push is refused", () => {
    const border = makeState({ operator: 7, crates: [1, 30], goals: [20, 21] })
    const wallBehind = makeState({
      walls: [false, false, true, ...new Array<boolean>(33).fill(false)],
      operator: 0,
      crates: [1, 30],
      goals: [20, 21],
    })
    const secondCrate = makeState({ operator: 0, crates: [1, 2], goals: [20, 21] })

    for (const [state, dir] of [
      [border, "up"],
      [wallBehind, "right"],
      [secondCrate, "right"],
    ] as const) {
      const preview = previewMove(state, dir)!
      expect(preview.valid).toBe(false)
      expect(preview.blockedReason).toBe("blocked-push")
      expect(preview.pushedFrom).not.toBeNull()
      // A refused push must not paint a destination on the wall or second crate.
      expect(preview.pushedTo).toBeNull()
      expect(preview.landsOnGoal).toBe(false)
      expect(preview.wouldStick).toBe(false)
    }
  })
})

describe("crates input hardening and terminal ordering", () => {
  it("ignores malformed inputs without spending a move", () => {
    const state = core.create(77, easy)
    const junk = [
      null,
      42,
      "move",
      {},
      { type: "drop", dir: "up" },
      { type: "move" },
      { type: "move", dir: "up-left" },
      { type: "move", dir: 1 },
      { type: "move", dir: Number.NaN },
      { type: "move", dir: undefined },
    ]
    expect(core.step(state, junk as unknown as readonly CrateInput[], 0)).toBe(state)
    expect(core.step(state, null as unknown as readonly CrateInput[], 0)).toBe(state)
    expect(core.step(state, { type: "move", dir: "up" } as unknown as readonly CrateInput[], 0)).toBe(state)
  })

  it("ignores every input after a win or a loss", () => {
    const won = run(core.create(1, easy), generateBoard(1, "easy").optimalSolution)
    expect(won.phase).toBe("won")
    expect(core.step(won, [move("left")], 0)).toBe(won)

    const lost = makeState({ goals: [20], crates: [9], operator: 10, moveBudget: 1 })
    const budgetLost = core.step(lost, [move("right")], 0)
    expect(budgetLost.phase).toBe("lost")
    expect(budgetLost.lossReason).toBe("budget")
    expect(core.step(budgetLost, [move("left")], 0)).toBe(budgetLost)
  })

  it("wins on the final budgeted move instead of losing on budget", () => {
    const state = makeState({
      goals: [1],
      crates: [2],
      operator: 3,
      par: 1,
      moveBudget: 1,
    })
    const won = core.step(state, [move("left")], 0)
    expect(won.movesUsed).toBe(1)
    expect(won.phase).toBe("won")
    expect(won.lossReason).toBe("none")
  })

  it("checks stuck before budget when the same move both corners and spends the last move", () => {
    const walls = new Array<boolean>(36).fill(false)
    walls[0] = true
    const state = makeState({
      walls,
      goals: [20, 21],
      crates: [12, 30],
      operator: 18,
      moveBudget: 1,
    })
    const lost = core.step(state, [move("up")], 0)
    expect(lost.crates[0]).toBe(6)
    expect(lost.movesUsed).toBe(1)
    expect(lost.phase).toBe("lost")
    expect(lost.lossReason).toBe("stuck")
    expect(core.score(lost, { elapsedMs: 0, ticks: 1 }).value).toBe(0)
  })

  it("loses on budget with zero ranked value", () => {
    const state = makeState({ goals: [20], crates: [9], operator: 10, par: 1, moveBudget: 1 })
    const lost = core.step(state, [move("right")], 0)
    expect(lost.phase).toBe("lost")
    expect(lost.lossReason).toBe("budget")
    const score = core.score(lost, { elapsedMs: 0, ticks: 1 })
    expect(score.value).toBe(0)
    expect(score.won).toBe(false)
    expect(score.ranked).toBe(false)
    expect(score.detail?.lossReason).toBe("budget")
  })
})

describe("crates preview and trace", () => {
  function agree(state: CrateState): void {
    const width = state.width
    for (const dir of DIRS) {
      const preview = previewMove(state, dir)!
      expect(preview).not.toBeNull()
      expect(preview.dir).toBe(dir)
      const next = core.step(state, [move(dir)], 0)
      if (!preview.valid) {
        expect(next).toBe(state)
        expect(traceMove(state, dir)).toBeNull()
        continue
      }
      expect(next.movesUsed).toBe(state.movesUsed + 1)
      expect(next.operator).toBe(state.operator + DX[dir] * 1 + DY[dir] * width)
      if (preview.pushedTo === null) {
        expect(next.crates).toEqual(state.crates)
        expect(traceMove(state, dir)?.pushedTo).toBeNull()
      } else {
        expect(next.crates).toContain(preview.pushedTo.y * width + preview.pushedTo.x)
        expect(next.crates).not.toContain(preview.pushedFrom!.y * width + preview.pushedFrom!.x)
        expect(preview.landsOnGoal).toBe(
          state.goals.includes(preview.pushedTo.y * width + preview.pushedTo.x),
        )
      }
      expect(preview.wouldWin).toBe(next.phase === "won")
      expect(preview.wouldStick).toBe(next.phase === "lost" && next.lossReason === "stuck")

      const trace = traceMove(state, dir)!
      expect(trace.fromOp).toEqual({
        x: state.operator % width,
        y: Math.floor(state.operator / width),
      })
      expect(trace.toOp).toEqual({
        x: next.operator % width,
        y: Math.floor(next.operator / width),
      })
      expect(trace.pushedFrom).toEqual(preview.pushedFrom)
      expect(trace.pushedTo).toEqual(preview.pushedTo)
      expect(trace.landedOnGoal).toBe(preview.landsOnGoal)
      expect(trace.solved).toBe(next.phase === "won")

      if (next.phase === "lost" && next.lossReason === "stuck") {
        const stuck = findStuckCrate(
          next.crates,
          next.goals,
          next.walls,
          width,
          next.height,
        )
        expect(stuck).toBeGreaterThanOrEqual(0)
        const cell = next.crates[stuck]!
        expect(trace.stuckCell).toEqual({
          x: cell % width,
          y: Math.floor(cell / width),
        })
      } else {
        expect(trace.stuckCell).toBeNull()
      }
    }
  }

  it("agrees with committed moves for walking, pushing, winning, and stuck boards", () => {
    const board = generateBoard(20260421, "easy")
    agree(core.create(20260421, easy))
    agree(run(core.create(20260421, easy), board.optimalSolution.slice(0, 5)))
    agree(run(core.create(20260421, easy), board.optimalSolution.slice(0, board.par - 1)))

    const hardBoard = generateBoard(1, "hard")
    agree(core.create(1, hard))
    agree(run(core.create(1, hard), hardBoard.optimalSolution.slice(0, 4)))
    agree(run(core.create(1, hard), hardBoard.optimalSolution.slice(0, hardBoard.par - 1)))

    const walls = new Array<boolean>(36).fill(false)
    walls[0] = true
    agree(makeState({ walls, goals: [20, 21], crates: [12, 30], operator: 18 }))
    agree(makeState({ operator: 0, crates: [20, 30] }))
    agree(makeState({ operator: 0, crates: [1, 2], goals: [20, 21] }))
  })

  it("returns null for terminal states and invalid directions", () => {
    const won = run(core.create(1, easy), generateBoard(1, "easy").optimalSolution)
    expect(previewMove(won, "up")).toBeNull()
    expect(traceMove(won, "up")).toBeNull()

    const state = core.create(1, easy)
    expect(previewMove(state, "north" as MoveDir)).toBeNull()
    expect(traceMove(state, "north" as MoveDir)).toBeNull()
    const walking = makeState()
    expect(traceMove(walking, "left")?.solved).toBe(false)
    expect(traceMove(walking, "left")?.stuckCell).toBeNull()
  })
})

describe("crates scoring and serialization", () => {
  it("projects the live score while playing and floors it at 100", () => {
    const par = 14
    const state = makeState({ movesUsed: par + 2, par })
    expect(state.phase).toBe("playing")
    const score = core.score(state, { elapsedMs: 123_456, ticks: state.movesUsed })
    expect(score.value).toBe(1_900)
    expect(score.value).toBe(2_000 - 2 * 50)
    expect(score.won).toBe(false)
    expect(score.ranked).toBe(false)

    const farOver = makeState({ movesUsed: par + 100, par })
    expect(core.score(farOver, { elapsedMs: 0, ticks: 0 }).value).toBe(100)

    const atPar = makeState({ movesUsed: par, par })
    expect(core.score(atPar, { elapsedMs: 0, ticks: 0 }).value).toBe(2_000)
    expect(core.score(atPar, { elapsedMs: 0, ticks: 0 }).value).toBeLessThanOrEqual(10_000)
  })

  it("pins the score literals for both modes", () => {
    expect(core.score(makeState({ movesUsed: 14, par: 14 }), { elapsedMs: 0, ticks: 0 }).value).toBe(
      2_000,
    )
    expect(core.score(makeState({ movesUsed: 16, par: 14 }), { elapsedMs: 0, ticks: 0 }).value).toBe(
      1_900,
    )
    expect(
      core.score(makeState({ modeId: "hard", movesUsed: 12, par: 12 }), {
        elapsedMs: 0,
        ticks: 0,
      }).value,
    ).toBe(4_000)
    expect(
      core.score(makeState({ movesUsed: 14 + 100, par: 14 }), { elapsedMs: 0, ticks: 0 }).value,
    ).toBe(100)
  })

  it("reports won and ranked with the base score at par", () => {
    const board = generateBoard(3, "hard")
    const state = run(core.create(3, hard), board.optimalSolution)
    expect(state.phase).toBe("won")
    const score = core.score(state, { elapsedMs: 0, ticks: state.movesUsed })
    expect(score.value).toBe(4_000)
    expect(score.won).toBe(true)
    expect(score.ranked).toBe(true)
    expect(score.detail).toMatchObject({
      mode: "hard",
      par: board.par,
      movesUsed: board.par,
      moveBudget: board.moveBudget,
      overPar: 0,
      cratesOnGoals: 2,
      totalCrates: 2,
      baseScore: 4_000,
      lossReason: "none",
      won: true,
    })
  })

  it("ignores wall-clock time and normalises signed seeds", () => {
    const state = run(core.create(1, easy), generateBoard(1, "easy").optimalSolution)
    expect(core.score(state, { elapsedMs: 1_000, ticks: 9 })).toEqual(
      core.score(state, { elapsedMs: 1_800_000, ticks: 9 }),
    )

    expect(core.create(-1, easy).seed).toBe(4_294_967_295)
    expect(generateBoard(-1, "easy")).toEqual(generateBoard(4_294_967_295, "easy"))
  })

  it("serializes deterministically without leaking the solutions", () => {
    const inputs = generateBoard(5, "easy").optimalSolution.slice(0, 3)
    const left = run(core.create(5, easy), inputs)
    const right = run(core.create(5, easy), inputs)
    expect(core.serialize(left)).toEqual(core.serialize(right))
    expect(stateHash(core.serialize(left))).toBe(stateHash(core.serialize(right)))
    expect(stateHash(core.serialize(left))).not.toBe(stateHash(core.serialize(core.create(5, easy))))

    const serialized = JSON.stringify(core.serialize(left))
    expect(serialized).not.toContain("optimalSolution")
    expect(serialized).not.toContain("canonicalSolution")
    expect(serialized).not.toContain("reverseSteps")
    expect(Object.keys(core.serialize(left) as object).sort()).toEqual([
      "crates",
      "goals",
      "height",
      "lossReason",
      "mode",
      "moveBudget",
      "movesUsed",
      "operator",
      "par",
      "phase",
      "seed",
      "walls",
      "width",
    ])
  })
})

describe("crates replay fixture", () => {
  it("verifies the pinned easy 20260421 win at 1900 points", () => {
    const replay = fixture as Replay<CrateInput>
    expect(replay.gameId).toBe("crates")
    expect(replay.gameVersion).toBe("1.0.0")
    expect(replay.modeId).toBe("easy")
    expect(replay.seed).toBe(20260421)
    expect(replay.inputs).toHaveLength(16)
    expect(replay.inputs.slice(0, 2).map((event) => event.input)).toEqual([
      move("up"),
      move("down"),
    ])

    const verified = verifyReplay(core, meta, replay)
    expect(verified.ok).toBe(true)
    const state = verified.state as {
      par: number
      moveBudget: number
      movesUsed: number
      phase: string
    }
    expect(state.par).toBe(14)
    expect(state.moveBudget).toBe(25)
    expect(state.movesUsed).toBe(16)
    expect(state.phase).toBe("won")
    expect(verified.score?.value).toBe(1900)
    expect(verified.score?.ranked).toBe(true)
  })

  it("builds the fixture shape from the generated board", () => {
    const board = generateBoard(20260421, "easy")
    expect(board.par).toBe(14)
    expect(board.moveBudget).toBe(25)
    expect(board.canonicalSolution).toHaveLength(22)
    const played = playTurn(core, meta, {
      seed: 20260421,
      mode: easy,
      inputs: [move("up"), move("down"), ...board.optimalSolution],
      durationMs: 30_000,
    })
    expect(played.verified.ok).toBe(true)
    expect(played.state.movesUsed).toBe(16)
    expect(played.score.value).toBe(1900)
  })
})
