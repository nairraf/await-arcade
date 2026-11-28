import { describe, expect, it } from "vitest"
import type { Replay } from "@await-arcade/contract"
import { createRng, playTurn, stateHash, verifyReplay } from "@await-arcade/framework"
import {
  DIRS,
  EASY_ROOMS,
  FALLBACK_EASY,
  FALLBACK_HARD,
  HARD_ROOMS,
  core,
  findStuckCrate,
  generateBoard,
  isCornerCell,
  previewMove,
  roomCeiling,
  roomScore,
  roomSeed,
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
const endless = meta.modes.find((mode) => mode.id === "endless")!

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

function oracleKey(state: OracleState, total: number): number {
  const sorted = [...state.crates].sort((a, b) => a - b)
  let key = state.operator
  for (const cell of sorted) key = key * total + cell
  return key
}

/** Minimum raw moves to all-crates-on-goals, or null (unsolvable / cap hit). */
function oracleSolve(
  start: OracleState,
  walls: readonly boolean[],
  goals: readonly number[],
  width: number,
  height: number,
  cap = 600_000,
): number | null {
  const total = width * height
  const goalSet = new Set(goals)
  const done = (crates: readonly number[]): boolean =>
    crates.every((cell) => goalSet.has(cell))

  if (done(start.crates)) return 0

  const seen = new Set<number>([oracleKey(start, total)])
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
      const key = oracleKey(next, total)
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
    room: 1,
    totalRooms: EASY_ROOMS,
    width: 6,
    height: 6,
    walls: new Array<boolean>(36).fill(false),
    goals: [1, 7],
    crates: [8, 9],
    operator: 14,
    par: 10,
    roomMoves: 0,
    movesUsed: 0,
    bankedPoints: 0,
    phase: "playing",
    lossReason: "none",
    ...overrides,
  }
}

function stateFromBoard(board: GeneratedBoard, seed: number): CrateState {
  return {
    seed: seed >>> 0,
    modeId: board.modeId,
    room: 1,
    totalRooms: board.modeId === "hard" ? HARD_ROOMS : EASY_ROOMS,
    width: board.width,
    height: board.height,
    walls: [...board.walls],
    goals: [...board.goals],
    crates: [...board.initialCrates],
    operator: board.initialOperator,
    par: board.par,
    roomMoves: 0,
    movesUsed: 0,
    bankedPoints: 0,
    phase: "playing",
    lossReason: "none",
  }
}

function assertBoardInvariants(board: GeneratedBoard, seed: number, modeId: "easy" | "hard"): void {
  const expected =
    modeId === "hard"
      ? { width: 7, height: 7, walls: 10, goals: 3, minPar: 15 }
      : { width: 6, height: 6, walls: 6, goals: 2, minPar: 10 }
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
  expect(board.optimalSolution).toHaveLength(board.par)

  const state = core.create(seed, modeId === "hard" ? hard : easy)
  expect(state.par).toBe(board.par)
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
  }, 30_000)

  it("falls back to pinned seed-1 boards and they satisfy every invariant", () => {
    const fallbackEasy = generateBoard(1, "easy", { maxAttempts: 0 })
    const fallbackHard = generateBoard(1, "hard", { maxAttempts: 0 })
    expect(fallbackEasy).toEqual(FALLBACK_EASY)
    expect(fallbackHard).toEqual(FALLBACK_HARD)
    expect(fallbackEasy.par).toBe(17)
    expect(fallbackHard.par).toBe(32)

    for (const [board, modeId] of [
      [fallbackEasy, "easy"],
      [fallbackHard, "hard"],
    ] as const) {
      assertBoardInvariants(board, 1, modeId)

      // Build a single-room state from the returned fallback, not a fresh generate().
      const singleRoom = { ...stateFromBoard(board, 1), totalRooms: 1 }
      expect(core.serialize(stateFromBoard(board, 1))).toEqual(
        core.serialize(core.create(1, modeId === "hard" ? hard : easy)),
      )

      const solved = run(singleRoom, board.optimalSolution)
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
  it("wins multi-room runs in total par moves and agrees with an independent raw BFS", () => {
    for (const modeId of ["easy", "hard"] as const) {
      const mode = modeId === "hard" ? hard : easy
      const roomsCount = modeId === "hard" ? HARD_ROOMS : EASY_ROOMS
      for (const seed of SEEDS) {
        let state = core.create(seed, mode)
        let expectedParTotal = 0
        let expectedScore = 0
        for (let room = 1; room <= roomsCount; room += 1) {
          const board = generateBoard(roomSeed(seed, room), modeId)
          expectedParTotal += board.par
          expectedScore += roomCeiling(modeId, room, board.par)
          state = run(state, board.optimalSolution)
          if (room < roomsCount) {
            expect(state.phase).toBe("playing")
            expect(state.room).toBe(room + 1)
          }

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
        expect(state.phase).toBe("won")
        expect(state.movesUsed).toBe(expectedParTotal)
        expect(core.score(state, { elapsedMs: 0, ticks: expectedParTotal }).value).toBe(
          expectedScore,
        )
      }
    }
  }, 60_000)

  it("advances endless from 6x6 rooms to 7x7 rooms and ranks banked score on loss", () => {
    let state = core.create(42, endless)
    expect(state.totalRooms).toBeNull()
    expect([state.width, state.height]).toEqual([6, 6])

    for (let room = 1; room <= 3; room += 1) {
      const boardMode = room >= 3 ? "hard" : "easy"
      const board = generateBoard(roomSeed(42, room), boardMode)
      expect([state.width, state.height]).toEqual(room >= 3 ? [7, 7] : [6, 6])
      state = run(state, board.optimalSolution)
      expect(state.phase).toBe("playing")
      expect(state.room).toBe(room + 1)
    }
    expect([state.width, state.height]).toEqual([7, 7])
    expect(state.bankedPoints).toBeGreaterThan(0)

    const trapped = {
      ...state,
      phase: "lost" as const,
      lossReason: "stuck" as const,
    }
    const lostScore = core.score(trapped, { elapsedMs: 0, ticks: trapped.movesUsed })
    expect(lostScore.value).toBe(trapped.bankedPoints)
    expect(lostScore.won).toBe(false)
    expect(lostScore.ranked).toBe(true)
    expect(lostScore.detail).toMatchObject({ level: 4, room: 4 })
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
    let won = core.create(1, easy)
    for (let room = 1; room <= EASY_ROOMS; room += 1) {
      won = run(won, generateBoard(roomSeed(1, room), "easy").optimalSolution)
    }
    expect(won.phase).toBe("won")
    expect(core.step(won, [move("left")], 0)).toBe(won)

    const walls = new Array<boolean>(36).fill(false)
    walls[0] = true
    const stuckBase = makeState({
      walls,
      goals: [20, 21],
      crates: [12, 30],
      operator: 18,
    })
    const stuckLost = core.step(stuckBase, [move("up")], 0)
    expect(stuckLost.phase).toBe("lost")
    expect(stuckLost.lossReason).toBe("stuck")
    expect(core.step(stuckLost, [move("left")], 0)).toBe(stuckLost)
  })

  it("allows solving past par without a move cap and scales score by room efficiency", () => {
    const base = makeState({
      room: 3,
      totalRooms: 3,
      goals: [1],
      crates: [2],
      operator: 3,
      par: 1,
      roomMoves: 10,
      movesUsed: 30,
      bankedPoints: 2_000,
    })
    const walked = core.step(base, [move("down")], 0)
    expect(walked.phase).toBe("playing")
    expect(walked.lossReason).toBe("none")
    expect(walked.roomMoves).toBe(11)
    expect(walked.movesUsed).toBe(31)

    const returned = core.step(walked, [move("up")], 0)
    expect(returned.phase).toBe("playing")
    const won = core.step(returned, [move("left")], 0)
    expect(won.phase).toBe("won")
    expect(won.roomMoves).toBe(13)
    expect(won.movesUsed).toBe(33)
    expect(core.score(won, { elapsedMs: 0, ticks: 33 }).value).toBe(
      2_000 + roomScore("easy", 3, 1, 13),
    )
  })

  it("loses with zero ranked value when a crate is trapped in a corner", () => {
    const walls = new Array<boolean>(36).fill(false)
    walls[0] = true
    const state = makeState({
      walls,
      goals: [20, 21],
      crates: [12, 30],
      operator: 18,
    })
    const lost = core.step(state, [move("up")], 0)
    expect(lost.crates[0]).toBe(6)
    expect(lost.movesUsed).toBe(1)
    expect(lost.phase).toBe("lost")
    expect(lost.lossReason).toBe("stuck")
    const score = core.score(lost, { elapsedMs: 0, ticks: 1 })
    expect(score.value).toBe(0)
    expect(score.won).toBe(false)
    expect(score.ranked).toBe(false)
    expect(score.detail?.lossReason).toBe("stuck")
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
      const boardChanged = next.room > state.room
      if (!boardChanged) {
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
      }
      expect(preview.wouldWin).toBe(next.phase === "won")
      expect(preview.wouldStick).toBe(next.phase === "lost" && next.lossReason === "stuck")

      const trace = traceMove(state, dir)!
      expect(trace.fromOp).toEqual({
        x: state.operator % width,
        y: Math.floor(state.operator / width),
      })
      if (!boardChanged) {
        expect(trace.toOp).toEqual({
          x: next.operator % width,
          y: Math.floor(next.operator / width),
        })
      }
      expect(trace.pushedFrom).toEqual(preview.pushedFrom)
      expect(trace.pushedTo).toEqual(preview.pushedTo)
      expect(trace.landedOnGoal).toBe(preview.landsOnGoal)
      expect(trace.solved).toBe(next.phase === "won")

      if (next.phase === "lost" && next.lossReason === "stuck") {
        // Independent corner check: both axes blocked by static walls/borders,
        // and the cell is not a goal. Never calls findStuckCrate.
        let stuckCell: number | null = null
        for (const cell of next.crates) {
          if (next.goals.includes(cell)) continue
          const up = cellAfter(cell, "up", width, next.height)
          const down = cellAfter(cell, "down", width, next.height)
          const left = cellAfter(cell, "left", width, next.height)
          const right = cellAfter(cell, "right", width, next.height)
          const verticalBlocked =
            up === null || down === null || next.walls[up] === true || next.walls[down] === true
          const horizontalBlocked =
            left === null ||
            right === null ||
            next.walls[left] === true ||
            next.walls[right] === true
          if (verticalBlocked && horizontalBlocked) {
            stuckCell = cell
            break
          }
        }
        expect(stuckCell).not.toBeNull()
        expect(trace.stuckCell).toEqual({
          x: stuckCell! % width,
          y: Math.floor(stuckCell! / width),
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
    let won = core.create(1, easy)
    for (let room = 1; room <= EASY_ROOMS; room += 1) {
      won = run(won, generateBoard(roomSeed(1, room), "easy").optimalSolution)
    }
    expect(won.phase).toBe("won")
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
  it("scales room ceiling by par, projects live score, and separates extra moves", () => {
    const par = 14
    const ceiling = roomCeiling("easy", 1, par)
    expect(ceiling).toBe(500 + 14 * 50)
    expect(roomCeiling("easy", 1, 20)).toBeGreaterThan(ceiling)

    const walked = core.step(makeState({ par }), [move("left")], 0)
    expect(walked.phase).toBe("playing")
    expect(walked.roomMoves).toBe(1)

    const state = makeState({ roomMoves: par + 2, movesUsed: par + 2, par })
    const score = core.score(state, { elapsedMs: 123_456, ticks: state.movesUsed })
    expect(score.value).toBe(roomScore("easy", 1, par, par + 2))
    expect(score.value).toBeLessThan(ceiling)
    expect(score.value).toBeGreaterThan(100)
    expect(score.detail).toMatchObject({ overPar: 2, roomCeiling: ceiling })
    expect(score.detail).not.toHaveProperty("level")
    expect(score.won).toBe(false)
    expect(score.ranked).toBe(false)

    const farOver = makeState({ roomMoves: par + 200, movesUsed: par + 200, par })
    expect(core.score(farOver, { elapsedMs: 0, ticks: 0 }).value).toBe(100)

    const atPar = makeState({ roomMoves: par, movesUsed: par, par })
    expect(core.score(atPar, { elapsedMs: 0, ticks: 0 }).value).toBe(ceiling)
  })

  it("pins the score literals for both modes and efficiency curve", () => {
    expect(roomCeiling("easy", 1, 14)).toBe(1_200)
    expect(roomScore("easy", 1, 14, 14)).toBe(1_200)
    expect(roomScore("easy", 1, 14, 15)).toBe(1_082)
    expect(roomScore("easy", 1, 14, 16)).toBe(982)
    expect(roomCeiling("hard", 1, 15)).toBe(2_100)
    expect(roomScore("hard", 1, 15, 15)).toBe(2_100)
    expect(roomScore("easy", 1, 14, 200)).toBe(100)
  })

  it("reports won and ranked with the sum of par-scaled room scores", () => {
    let state = core.create(3, hard)
    let expected = 0
    let totalPar = 0
    for (let room = 1; room <= HARD_ROOMS; room += 1) {
      const board = generateBoard(roomSeed(3, room), "hard")
      expected += roomCeiling("hard", room, board.par)
      totalPar += board.par
      state = run(state, board.optimalSolution)
    }
    expect(state.phase).toBe("won")
    const score = core.score(state, { elapsedMs: 0, ticks: state.movesUsed })
    expect(score.value).toBe(expected)
    expect(score.won).toBe(true)
    expect(score.ranked).toBe(true)
    expect(score.detail).toMatchObject({
      mode: "hard",
      room: HARD_ROOMS,
      totalRooms: HARD_ROOMS,
      movesUsed: totalPar,
      overPar: 0,
      cratesOnGoals: 3,
      totalCrates: 3,
      bankedPoints: expected,
      lossReason: "none",
      won: true,
    })
    expect(score.detail).not.toHaveProperty("level")
  })

  it("ignores wall-clock time and normalises signed seeds", () => {
    let state = core.create(1, easy)
    for (let room = 1; room <= EASY_ROOMS; room += 1) {
      state = run(state, generateBoard(roomSeed(1, room), "easy").optimalSolution)
    }
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
      "bankedPoints",
      "crates",
      "goals",
      "height",
      "lossReason",
      "mode",
      "movesUsed",
      "operator",
      "par",
      "phase",
      "room",
      "roomMoves",
      "seed",
      "totalRooms",
      "walls",
      "width",
    ])
  })
})

describe("crates replay fixture", () => {
  it("verifies the pinned 3-room easy 20260421 win", () => {
    const r1 = generateBoard(roomSeed(20260421, 1), "easy")
    const r2 = generateBoard(roomSeed(20260421, 2), "easy")
    const r3 = generateBoard(roomSeed(20260421, 3), "easy")
    const expectedMoves = r1.par + 2 + r2.par + r3.par
    const expectedScore =
      roomScore("easy", 1, r1.par, r1.par + 2) +
      roomScore("easy", 2, r2.par, r2.par) +
      roomScore("easy", 3, r3.par, r3.par)

    const replay = fixture as Replay<CrateInput>
    expect(replay.gameId).toBe("crates")
    expect(replay.gameVersion).toBe("1.1.0")
    expect(replay.modeId).toBe("easy")
    expect(replay.seed).toBe(20260421)
    expect(replay.inputs).toHaveLength(expectedMoves)
    expect(replay.inputs.slice(0, 2).map((event) => event.input)).toEqual([
      move("up"),
      move("down"),
    ])

    const verified = verifyReplay(core, meta, replay)
    expect(verified.ok).toBe(true)
    const state = verified.state as {
      room: number
      movesUsed: number
      phase: string
    }
    expect(state.room).toBe(3)
    expect(state.movesUsed).toBe(expectedMoves)
    expect(state.phase).toBe("won")
    expect(verified.score?.value).toBe(expectedScore)
    expect(verified.score?.ranked).toBe(true)
  })

  it("builds the fixture shape from the generated boards", () => {
    const r1 = generateBoard(roomSeed(20260421, 1), "easy")
    const r2 = generateBoard(roomSeed(20260421, 2), "easy")
    const r3 = generateBoard(roomSeed(20260421, 3), "easy")
    expect(r1.par).toBe(21)
    expect(r1.canonicalSolution).toHaveLength(37)
    const inputs = [
      move("up"),
      move("down"),
      ...r1.optimalSolution,
      ...r2.optimalSolution,
      ...r3.optimalSolution,
    ]
    const played = playTurn(core, meta, {
      seed: 20260421,
      mode: easy,
      inputs,
      durationMs: 30_000,
    })
    expect(played.verified.ok).toBe(true)
    expect(played.state.room).toBe(3)
    expect(played.state.movesUsed).toBe(inputs.length)
    expect(played.score.value).toBe(
      roomScore("easy", 1, r1.par, r1.par + 2) +
        roomScore("easy", 2, r2.par, r2.par) +
        roomScore("easy", 3, r3.par, r3.par),
    )
  })
})
