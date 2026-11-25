import { describe, expect, it } from "vitest"
import type { Replay } from "@await-arcade/contract"
import { expectDeterministic, playTurn, verifyReplay } from "@await-arcade/framework"
import {
  COLS,
  ENDLESS_BAG,
  ROWS,
  SKIRMISH_BAG,
  SKIRMISH_TARGET_CLEARS,
  bagAt,
  core,
  type Cell,
  type TilechainInput,
  type TilechainState,
  previewDrop,
} from "./core"
import { meta } from "./meta"
import fixture from "../replay.json"

const skirmish = meta.modes.find((mode) => mode.id === "skirmish")!
const endless = meta.modes.find((mode) => mode.id === "endless")!

// Read the fixture from the committed replay so a regenerated fixture cannot
// leave these expectations behind.
const FIXTURE = fixture as unknown as Replay<TilechainInput>
const FIXTURE_SEED = FIXTURE.seed
const FIXTURE_INPUTS: TilechainInput[] = FIXTURE.inputs.map((event) => event.input)
const FIXTURE_COLUMNS = FIXTURE_INPUTS.map((input) => input.col)

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null as Cell),
  )
}

/**
 * Build a controlled state from the seeded create() state. Tests use this to
 * isolate one rule at a time; illegal gaps are allowed because the drop still
 * lands in the lowest empty row and every cascade settles through gravity.
 */
function withBoard(
  base: TilechainState,
  cells: ReadonlyArray<readonly [number, number, Cell]>,
  extra: Partial<TilechainState> = {},
): TilechainState {
  const board = emptyBoard()
  for (const [x, y, cell] of cells) board[y]![x] = cell
  return { ...base, board, ...extra }
}

function drop(state: TilechainState, col: number): TilechainState {
  return core.step(state, [{ type: "drop", col }], 0)
}

function dropAll(state: TilechainState, cols: readonly number[]): TilechainState {
  let next = state
  for (const col of cols) {
    if (next.phase !== "playing") break
    next = drop(next, col)
  }
  return next
}

describe("tilechain determinism", () => {
  it("produces identical states, scores, and replays for the same seed and inputs", () => {
    const columns = [3, 0, 3, 1, 0, 0, 0, 0, 0]
    const left = dropAll(core.create(FIXTURE_SEED, skirmish), columns)
    const right = dropAll(core.create(FIXTURE_SEED, skirmish), columns)

    expect(core.serialize(left)).toEqual(core.serialize(right))
    expect(core.score(left, { elapsedMs: 0, ticks: 9 })).toEqual(
      core.score(right, { elapsedMs: 0, ticks: 9 }),
    )

    const played = playTurn(core, meta, {
      seed: FIXTURE_SEED,
      mode: skirmish,
      inputs: FIXTURE_INPUTS,
      durationMs: 45_000,
    })
    expect(played.state.phase).toBe("won")
    expect(expectDeterministic(core, meta, played.replay)).toBe(true)

    const otherSeed = dropAll(core.create(FIXTURE_SEED + 1, skirmish), columns)
    expect(core.serialize(otherSeed)).not.toEqual(core.serialize(left))
  })

  it("wraps the seeded bag deterministically", () => {
    const base = core.create(FIXTURE_SEED, skirmish)
    const bag0 = bagAt(FIXTURE_SEED, 0, "skirmish")
    const bag1 = bagAt(FIXTURE_SEED, 1, "skirmish")

    expect(SKIRMISH_BAG).toEqual([1, 2, 3, 4, 5, 6, 7, "cracked"])
    expect(ENDLESS_BAG).toEqual([1, 2, 3, 4, 5, 6, 7, "cracked", "cracked"])
    expect([...bag0].sort()).toEqual([...SKIRMISH_BAG].sort())
    expect(base.currentTile).toBe(bag0[0])
    expect(base.nextTile).toBe(bag0[1])

    // Eight-tile bag: the initial two draws plus six drops exhaust it, so the
    // first tile of bag 1 is the next tile after the seventh drop.
    const afterSeven = dropAll(base, [3, 3, 3, 3, 3, 3, 3])
    expect(afterSeven.bagIndex).toBe(1)
    expect(afterSeven.bagPos).toBe(1)
    expect(afterSeven.nextTile).toBe(bag1[0])

    const afterEight = drop(afterSeven, 3)
    expect(afterEight.currentTile).toBe(bag1[0])
    expect(afterEight.nextTile).toBe(bag1[1])

    // Nine-tile endless bag: bag 1 starts one draw later.
    let endlessState = core.create(FIXTURE_SEED, endless)
    const endlessBag1 = bagAt(FIXTURE_SEED, 1, "endless")
    endlessState = dropAll(endlessState, [3, 3, 3, 3, 3, 3, 3, 3])
    expect(endlessState.nextTile).toBe(endlessBag1[0])
    expect(drop(endlessState, 3).currentTile).toBe(endlessBag1[0])
  })
})

describe("tilechain clear rules", () => {
  it("clears a dual-axis match once, then cascades through gravity", () => {
    const base = withBoard(core.create(1, skirmish), [
      [1, 4, 2],
      [1, 5, "cracked"],
      [1, 6, 2],
      [2, 5, 3],
      [3, 4, 3],
      [3, 6, 4],
      [4, 5, 3],
    ])

    const state = drop(
      { ...base, currentTile: 3, nextTile: 1, dropsUsed: 0 },
      3,
    )

    // Wave 1: (3,5) qualifies horizontally and vertically but is one clear.
    // The 3s at (2,5), (4,5), and (3,4) also clear, and the cracked tile at
    // (1,5) is removed as collateral. k1 = 4 numbered + 1 cracked.
    // Wave 2: the 2 at (1,4) falls onto the 2 at (1,6), forming a vertical
    // pair that clears. k2 = 2.
    expect(state.dropsUsed).toBe(1)
    expect(state.clearedTiles).toBe(7)
    expect(state.crackedCleared).toBe(1)
    expect(state.chainPoints).toBe(10 * 1 * 1 * 5 + 10 * 2 * 2 * 2)
    expect(state.maxChain).toBe(2)
    expect(state.chainPoints).toBe(130)
    expect(state.phase).toBe("playing")

    expect(state.board[6]![1]).toBeNull()
    expect(state.board[6]![2]).toBeNull()
    expect(state.board[6]![3]).toBe(4)
    expect(state.board[6]![4]).toBeNull()
  })

  it("excludes cracked cells from group sizes", () => {
    const base = withBoard(core.create(2, skirmish), [
      [0, 6, 3],
      [1, 6, "cracked"],
      [2, 6, 3],
    ])

    const state = drop({ ...base, currentTile: "cracked", nextTile: 1 }, 6)

    // The two 3s are separated by a cracked tile. A cracked tile is not a
    // numbered cell, so each horizontal run is one and neither 3 clears. If
    // the cracked tile were counted, the run would be three and both would
    // clear on value 3.
    expect(state.clearedTiles).toBe(0)
    expect(state.crackedCleared).toBe(0)
    expect(state.chainPoints).toBe(0)
    expect(state.board[6]![0]).toBe(3)
    expect(state.board[6]![1]).toBe("cracked")
    expect(state.board[6]![2]).toBe(3)
  })

  it("removes only the cracked tiles adjacent to a clearing numbered tile", () => {
    const base = withBoard(core.create(3, skirmish), [
      [0, 5, 4],
      [0, 6, 2],
      [1, 5, 4],
      [1, 6, 2],
      [2, 6, "cracked"],
      [3, 6, "cracked"],
    ])

    const state = drop({ ...base, currentTile: "cracked", nextTile: 1 }, 6)

    // The two 2s clear as a horizontal pair. The cracked tile at x=2 touches
    // the clearing 2 at (1,6); the cracked tile at x=3 only touches another
    // cracked tile, so it survives the cascade.
    expect(state.clearedTiles).toBe(3)
    expect(state.crackedCleared).toBe(1)
    expect(state.chainPoints).toBe(30)
    expect(state.maxChain).toBe(1)
    expect(state.board[6]![2]).toBeNull()
    expect(state.board[6]![3]).toBe("cracked")
    expect(state.board[6]![0]).toBe(4)
    expect(state.board[6]![1]).toBe(4)
  })
})

describe("tilechain game over", () => {
  it("loses skirmish at the thirty-fifth drop without enough clears", () => {
    const base = withBoard(core.create(4, skirmish), [], {
      currentTile: 7,
      nextTile: 7,
      dropsUsed: 34,
      clearedTiles: 0,
    })

    const state = drop(base, 0)
    expect(state.phase).toBe("lost")
    expect(state.dropsUsed).toBe(35)

    const score = core.score(state, { elapsedMs: 0, ticks: 35 })
    expect(score).toMatchObject({ value: 0, won: false, ranked: false, type: "higher" })
  })

  it("loses skirmish when the top row fills", () => {
    const cells: Array<readonly [number, number, Cell]> = []
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (x === 0 && y === 0) continue
        cells.push([x, y, 4])
      }
    }
    const base = withBoard(core.create(5, skirmish), cells, {
      currentTile: 4,
      nextTile: 4,
    })

    const state = drop(base, 0)
    expect(state.phase).toBe("lost")
    expect(state.board[0]!.every((cell) => cell !== null)).toBe(true)
    expect(state.clearedTiles).toBe(0)
    expect(core.score(state, { elapsedMs: 0, ticks: 1 }).ranked).toBe(false)
  })

  it("loses endless on a rising-row overflow", () => {
    const fullColumn: Array<readonly [number, number, Cell]> = []
    for (let y = 0; y < ROWS; y += 1) fullColumn.push([1, y, 4])
    const base = withBoard(core.create(6, endless), fullColumn, {
      currentTile: 4,
      nextTile: 4,
      dropsUsed: 9,
      chainPoints: 50,
      depth: 1,
    })

    const state = drop(base, 0)
    expect(state.phase).toBe("lost")
    expect(state.depth).toBe(1)
    expect(state.chainPoints).toBe(50)
    expect(state.board[6]![0]).toBe(4)
    expect(state.board[6]![1]).toBe(4)

    const score = core.score(state, { elapsedMs: 0, ticks: 10 })
    expect(score.value).toBe(50)
    expect(score.won).toBe(false)
    expect(score.ranked).toBe(true)
  })

  it("advances endless depth by pushing a row of cracked tiles", () => {
    const base = withBoard(core.create(7, endless), [], {
      currentTile: 4,
      nextTile: 4,
      dropsUsed: 9,
      depth: 1,
    })

    const state = drop(base, 0)
    expect(state.phase).toBe("playing")
    expect(state.depth).toBe(2)
    expect(state.board[6]).toEqual(Array.from({ length: COLS }, () => "cracked"))
    expect(state.board[5]![0]).toBe(4)
    expect(state.clearedTiles).toBe(0)
  })

  it("loses endless when a depth push fills the new top row", () => {
    // Columns 0..5 are at height 6 and column 6 is at height 5, so the tenth
    // drop lands in row 1 without touching row 0. Nothing clears, so the push
    // then copies the old full row 1 into row 0. That is a game-over board, not
    // a playable one: every column is full and no future drop can land.
    const cells: Array<readonly [number, number, Cell]> = []
    for (let x = 0; x < COLS; x += 1) {
      const start = x === 6 ? 2 : 1
      for (let y = start; y < ROWS; y += 1) cells.push([x, y, 4])
    }
    const base = withBoard(core.create(11, endless), cells, {
      currentTile: 4,
      nextTile: 4,
      dropsUsed: 9,
      depth: 1,
    })

    const state = drop(base, 6)
    expect(state.depth).toBe(2)
    expect(state.phase).toBe("lost")
    expect(state.board[0]!.every((cell) => cell !== null)).toBe(true)
    expect(state.board[6]).toEqual(Array.from({ length: COLS }, () => "cracked"))

    // The board is full, so every further drop is a no-op as well.
    const frozen = core.serialize(state)
    expect(core.serialize(drop(state, 0))).toEqual(frozen)
  })

  it("loses endless when the top row fills on a non-push turn", () => {
    const cells: Array<readonly [number, number, Cell]> = []
    for (let x = 0; x < COLS; x += 1) {
      const start = x === 0 ? 1 : 0
      for (let y = start; y < ROWS; y += 1) cells.push([x, y, 4])
    }
    const base = withBoard(core.create(12, endless), cells, {
      currentTile: 4,
      nextTile: 4,
      dropsUsed: 0,
    })

    const state = drop(base, 0)
    expect(state.dropsUsed).toBe(1)
    expect(state.phase).toBe("lost")
    expect(state.depth).toBe(1)
    expect(state.board[0]!.every((cell) => cell !== null)).toBe(true)
  })

  it("wins skirmish on the thirty-fifth drop when the clear objective is met", () => {
    const base = withBoard(core.create(13, skirmish), [[0, 6, 2]], {
      currentTile: 2,
      nextTile: 2,
      dropsUsed: 34,
      clearedTiles: SKIRMISH_TARGET_CLEARS - 2,
    })

    // The drop completes a horizontal pair of 2s, taking the run exactly to the
    // clear objective on the 35th drop. The objective must win before the drop
    // cap is allowed to end the run.
    const state = drop(base, 1)
    expect(state.dropsUsed).toBe(35)
    expect(state.clearedTiles).toBe(SKIRMISH_TARGET_CLEARS)
    expect(state.phase).toBe("won")

    const score = core.score(state, { elapsedMs: 0, ticks: 35 })
    expect(score).toMatchObject({ value: 220, won: true, ranked: true })
  })

  it("keeps a skirmish win even when the winning drop fills the top row", () => {
    // Cleared-tile precedence guard: the board becomes full on this drop, and
    // the already-met objective must still resolve as a win, not a loss.
    const cells: Array<readonly [number, number, Cell]> = []
    for (let x = 0; x < COLS; x += 1) {
      const start = x === 0 ? 1 : 0
      for (let y = start; y < ROWS; y += 1) cells.push([x, y, 4])
    }
    const base = withBoard(core.create(14, skirmish), cells, {
      currentTile: 4,
      nextTile: 4,
      dropsUsed: 1,
      clearedTiles: SKIRMISH_TARGET_CLEARS,
    })

    const state = drop(base, 0)
    expect(state.board[0]!.every((cell) => cell !== null)).toBe(true)
    expect(state.phase).toBe("won")
    expect(core.score(state, { elapsedMs: 0, ticks: 2 })).toMatchObject({
      won: true,
      ranked: true,
    })
  })
})

describe("tilechain scoring", () => {
  it("ignores elapsed time for an identical completed run", () => {
    const result = playTurn(core, meta, {
      seed: FIXTURE_SEED,
      mode: skirmish,
      inputs: FIXTURE_INPUTS,
      durationMs: 45_000,
    })

    expect(result.state.phase).toBe("won")
    const fast = core.score(result.state, { elapsedMs: 1_500, ticks: 28 })
    const slow = core.score(result.state, { elapsedMs: 3_500_000, ticks: 28 })

    expect(fast).toEqual(slow)
    expect(fast).toMatchObject({ value: 3795, type: "higher", won: true, ranked: true })
    expect(fast.detail).toMatchObject({
      mode: "skirmish",
      clearedTiles: 32,
      dropsUsed: 28,
      depth: 1,
      level: 1,
      maxChain: 7,
      chainPoints: 3420,
      won: true,
    })
  })

  it("scores endless only after a game over, with depth as a bonus", () => {
    const base = withBoard(core.create(8, endless), [], {
      phase: "lost",
      chainPoints: 240,
      depth: 3,
    })
    const ended = core.score(base, { elapsedMs: 0, ticks: 30 })
    expect(ended.value).toBe(240 + 2 * 100)
    expect(ended.won).toBe(false)
    expect(ended.ranked).toBe(true)

    const playing = core.score({ ...base, phase: "playing" }, { elapsedMs: 0, ticks: 30 })
    expect(playing.value).toBe(0)
    expect(playing.ranked).toBe(false)
  })
})

describe("tilechain serialize and input hardening", () => {
  it("round-trips every play-affecting field without leaking the bag", () => {
    const state = dropAll(core.create(FIXTURE_SEED, endless), [0, 1, 2, 3])
    const serialized = core.serialize(state) as Record<string, unknown>

    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized)
    expect(Object.keys(serialized)).toEqual(
      expect.arrayContaining([
        "board",
        "currentTile",
        "nextTile",
        "bagIndex",
        "bagPos",
        "dropsUsed",
        "clearedTiles",
        "crackedCleared",
        "chainPoints",
        "maxChain",
        "depth",
        "phase",
      ]),
    )
    expect(serialized).not.toHaveProperty("bag")
    expect(serialized).not.toHaveProperty("bagTiles")
    // Board is the only array in the serialized state; no undealt bag is kept.
    expect(Object.values(serialized).filter(Array.isArray)).toHaveLength(1)
    const board = serialized.board as Cell[][]
    expect(board).toHaveLength(ROWS)
    for (const row of board) expect(row).toHaveLength(COLS)
  })

  it("ignores malformed, out-of-range, and full-column drops", () => {
    const base = core.create(9, skirmish)
    const before = core.serialize(base)

    const badInputs: unknown[] = [
      { type: "drop", col: -1 },
      { type: "drop", col: COLS },
      { type: "drop", col: 1.5 },
      { type: "drop", col: Number.NaN },
      { type: "drop", col: Number.POSITIVE_INFINITY },
      { type: "drop", col: "3" },
      { type: "bogus" },
      null,
      undefined,
      3,
    ]

    for (const bad of badInputs) {
      const after = core.step(base, [bad as TilechainInput], 0)
      expect(core.serialize(after)).toEqual(before)
      expect(after.dropsUsed).toBe(0)
    }

    const notArray = core.step(base, null as unknown as readonly TilechainInput[], 0)
    expect(core.serialize(notArray)).toEqual(before)

    const fullColumn: Array<readonly [number, number, Cell]> = []
    for (let y = 0; y < ROWS; y += 1) fullColumn.push([0, y, 4])
    const full = withBoard(base, fullColumn, { currentTile: 7, nextTile: 7 })
    const fullBefore = core.serialize(full)
    const fullAfter = drop(full, 0)
    expect(core.serialize(fullAfter)).toEqual(fullBefore)
    expect(fullAfter.dropsUsed).toBe(0)
    expect(fullAfter.currentTile).toBe(7)
  })

  it("ignores inputs after the run resolves", () => {
    const won = { ...core.create(10, skirmish), phase: "won" as const }
    const lost = { ...core.create(10, skirmish), phase: "lost" as const }

    for (const terminal of [won, lost]) {
      const before = core.serialize(terminal)
      const after = drop(terminal, 3)
      expect(core.serialize(after)).toEqual(before)
    }
  })
})

describe("tilechain replay fixture", () => {
  it("verifies the recorded skirmish win", () => {
    const replay = fixture as unknown as Replay<TilechainInput>

    expect(replay.gameId).toBe("tilechain")
    expect(replay.modeId).toBe("skirmish")
    expect(replay.seed).toBe(FIXTURE_SEED)
    expect(replay.durationMs).toBe(45_000)
    expect(replay.inputs).toHaveLength(28)

    const verified = verifyReplay(core, meta, replay)
    expect(verified.ok).toBe(true)
    expect(verified.score).toMatchObject({
      value: 3795,
      type: "higher",
      won: true,
      ranked: true,
    })

    const played = playTurn(core, meta, {
      seed: FIXTURE_SEED,
      mode: skirmish,
      inputs: replay.inputs.map((event) => event.input),
      durationMs: replay.durationMs,
    })
    expect(played.state.phase).toBe("won")
    expect(played.state.dropsUsed).toBe(28)
    expect(played.state.clearedTiles).toBe(32)
    expect(played.state.crackedCleared).toBe(4)
    expect(played.state.maxChain).toBe(7)
    expect(played.state.chainPoints).toBe(3420)
    expect(played.score.value).toBe(3795)
    expect(played.score.won).toBe(true)
    expect(played.score.ranked).toBe(true)
  })
})

describe("tilechain drop preview", () => {
  const skirmish = meta.modes.find((mode) => mode.id === "skirmish")!

  it("reports the landing row and no clears for a neutral drop", () => {
    const state = core.create(7, skirmish)
    const preview = previewDrop(state, 3)!
    expect(preview).not.toBeNull()
    expect(preview.landing).toBe(6)
    expect(preview.clears).toEqual([])
    expect(preview.cracked).toEqual([])
  })

  it("reports the landing row as the top of an existing stack", () => {
    const state = core.create(7, skirmish)
    const preview = previewDrop(state, 0)!
    // The seeded valley is [2,1,2,0,2,1,2], so column 0 holds two tiles.
    expect(preview.landing).toBe(4)
  })

  it("refuses a full column, an out-of-range column and a finished run", () => {
    let state = core.create(7, skirmish)
    for (let i = 0; i < 5; i += 1) state = core.step(state, [{ type: "drop", col: 0 }], 0)
    const fullish = previewDrop(state, 0)
    if (state.board[0]![0] !== null) expect(fullish).toBeNull()

    expect(previewDrop(state, -1)).toBeNull()
    expect(previewDrop(state, 7)).toBeNull()
    expect(previewDrop({ ...state, phase: "lost" }, 3)).toBeNull()
  })

  it("shows the tiles that would clear, including the dropped one", () => {
    // Hand-built board: column 0 holds three tiles, so a dropped 4 completes a
    // vertical run of four and only the 4 itself matches that run length.
    const base = core.create(7, skirmish)
    const board: Cell[][] = Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null))
    // Horizontal runs are all 1 and the vertical run is 4, so only the dropped 4
    // matches a run length; 5, 6 and 7 do not.
    board[4]![0] = 5
    board[5]![0] = 6
    board[6]![0] = 7
    const state: TilechainState = { ...base, board, currentTile: 4 }

    const preview = previewDrop(state, 0)!
    expect(preview.landing).toBe(3)
    // Only the dropped 4 matches the run length of four; the 9s need a run of
    // nine, so joining a run is not the same as clearing it.
    expect(preview.clears).toEqual([{ x: 0, y: 3 }])
    expect(preview.cracked).toEqual([])

    // The preview agrees with what the real drop clears.
    const after = core.step(state, [{ type: "drop", col: 0 }], 0)
    expect(after.clearedTiles).toBe(state.clearedTiles + 1)
  })

  it("does not mutate the state it previews", () => {
    const state = core.create(9, skirmish)
    const before = JSON.stringify(core.serialize(state))
    previewDrop(state, 3)
    previewDrop(state, 0)
    expect(JSON.stringify(core.serialize(state))).toBe(before)
  })
})
