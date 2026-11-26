import { describe, expect, it } from "vitest"
import type { CrateState } from "./core"
import { previewCell } from "./view"

function makeState(overrides: Partial<CrateState> = {}): CrateState {
  return {
    seed: 1,
    modeId: "easy",
    room: 1,
    totalRooms: 3,
    width: 6,
    height: 6,
    walls: new Array<boolean>(36).fill(false),
    goals: [20, 21],
    crates: [20, 25],
    operator: 2,
    par: 10,
    roomMoves: 0,
    movesUsed: 0,
    bankedPoints: 0,
    phase: "playing",
    lossReason: "none",
    ...overrides,
  }
}

function everyCell(state: CrateState): number[] {
  return Array.from({ length: state.width * state.height }, (_, cell) => cell)
}

function assertNoDestinationMarks(state: CrateState): void {
  for (const cell of everyCell(state)) {
    const view = previewCell(state, cell)
    expect(view.classes).not.toContain("is-push-target")
    expect(view.classes).not.toContain("is-would-goal")
    expect(view.classes).not.toContain("is-would-stick")
    expect(view.aria).not.toContain("would receive")
  }
}

describe("crates previewCell", () => {
  it("marks a blocked wall push on the crate, never on the wall", () => {
    const state = makeState({
      walls: [false, false, true, ...new Array<boolean>(33).fill(false)],
      crates: [1, 30],
      operator: 0,
    })
    const source = previewCell(state, 1)
    expect(source.classes).toContain("is-crate")
    expect(source.classes).toContain("is-blocked-push")
    expect(source.classes).not.toContain("is-push-target")
    expect(source.aria).toContain("push right blocked")
    expect(source.aria).not.toContain("would receive")

    expect(previewCell(state, 2).aria).toContain("wall")
    assertNoDestinationMarks(state)
  })

  it("marks a second-crate refusal on the crate, never on the blocking crate", () => {
    const state = makeState({
      crates: [1, 2],
      operator: 0,
    })
    const source = previewCell(state, 1)
    expect(source.classes).toContain("is-blocked-push")
    expect(source.classes).not.toContain("is-push-target")
    expect(source.aria).toContain("push right blocked")
    expect(previewCell(state, 2).classes).toContain("is-crate")
    expect(previewCell(state, 2).aria).not.toContain("would receive")
    assertNoDestinationMarks(state)
  })

  it("marks a valid push onto a goal with the goal class", () => {
    const state = makeState({
      goals: [2, 21],
      crates: [1, 25],
      operator: 0,
    })
    const source = previewCell(state, 1)
    expect(source.classes).not.toContain("is-blocked-push")
    expect(source.aria).toContain("push right would land on goal")

    const destination = previewCell(state, 2)
    expect(destination.classes).toContain("is-goal")
    expect(destination.classes).toContain("is-push-target")
    expect(destination.classes).toContain("is-would-goal")
    expect(destination.classes).not.toContain("is-would-stick")
    expect(destination.aria).toContain("would receive a crate pushed right")
    expect(destination.aria).toContain("goal pad")
  })

  it("marks a valid push that corners the crate with the trap class", () => {
    const state = makeState({
      walls: [true, ...new Array<boolean>(35).fill(false)],
      crates: [12, 22],
      operator: 18,
    })
    const source = previewCell(state, 12)
    expect(source.classes).not.toContain("is-blocked-push")
    expect(source.aria).toContain("push up would trap the crate")

    const destination = previewCell(state, 6)
    expect(destination.classes).toContain("is-push-target")
    expect(destination.classes).toContain("is-would-stick")
    expect(destination.classes).not.toContain("is-would-goal")
    expect(destination.aria).toContain("would receive a crate pushed up")

    const hardState = makeState({
      modeId: "hard",
      walls: [true, ...new Array<boolean>(35).fill(false)],
      crates: [12, 22],
      operator: 18,
    })
    expect(previewCell(hardState, 12).aria).not.toContain("trap")
    expect(previewCell(hardState, 6).classes).toContain("is-push-target")
    expect(previewCell(hardState, 6).classes).not.toContain("is-would-stick")
  })

  it("marks a plain walk without any push affordance", () => {
    const state = makeState()
    const walk = previewCell(state, 1)
    expect(walk.classes).not.toContain("is-push-target")
    expect(walk.classes).not.toContain("is-blocked-push")
    expect(walk.classes).not.toContain("is-would-goal")
    expect(walk.classes).not.toContain("is-would-stick")
    expect(walk.aria).toContain("empty floor")
    expect(walk.aria).toContain("click to move here")
    expect(walk.aria).not.toContain("push")
    expect(walk.aria).not.toContain("would receive")
  })
})
