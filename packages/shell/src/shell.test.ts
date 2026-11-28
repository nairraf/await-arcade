// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  GameCore,
  GameEntry,
  GameHost,
  GameMeta,
  Score,
} from "@await-arcade/contract"
import { createArcade, type Arcade } from "./index"

/**
 * The shell is where identity, submission and the run overlays live, so it is
 * the one place a regression cannot be caught by a cartridge test. This file
 * drives a minimal turn-based cartridge through the real shell in a DOM.
 */

interface TestState {
  readonly phase: "playing" | "lost"
  readonly moves: number
}

const meta: GameMeta = {
  id: "test-game",
  title: "Test Game",
  description: "Minimal cartridge for the shell flow",
  author: "test",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [{ id: "solo", title: "Solo" }],
  score: { type: "higher", min: 0, max: 100 },
  leaderboard: "replay",
  status: "stable",
  controls: [],
  display: { surface: "dom", width: 320, height: 240 },
  maxDurationMs: 60_000,
}

const score = (state: TestState): Score => ({
  value: state.moves,
  type: "higher",
  won: false,
  ranked: state.phase !== "playing",
})

const core: GameCore<TestState, number> = {
  create: () => ({ phase: "playing", moves: 0 }),
  step: (state) => ({ phase: "lost", moves: state.moves + 1 }),
  phase: (state) => state.phase,
  score,
  serialize: (state) => state,
}

let dispatch: ((input: number) => void) | undefined
let arcade: Arcade | undefined

const entry: GameEntry = {
  meta,
  core,
  view: (context) => {
    dispatch = context.dispatch
    return { render: () => undefined, destroy: () => undefined }
  },
}

function makeHost(): GameHost {
  const store = new Map<string, unknown>()
  return {
    name: "test",
    storage: {
      get: <T,>(key: string): T | undefined => store.get(key) as T | undefined,
      set: (key, value) => {
        store.set(key, value)
      },
      remove: (key) => {
        store.delete(key)
      },
    },
    audio: { play: () => undefined, muted: () => true, toggle: () => true },
    toast: () => undefined,
    best: () => undefined,
    start: async () => ({ seed: 7, runId: "run-1" }),
    submit: async (run) => ({ ok: true, score: run.score, rank: 1 }),
    board: async () => [],
    authState: async () => ({ signedIn: true, playerId: "player-1" }),
  }
}

async function mount(): Promise<HTMLElement> {
  document.body.innerHTML = '<div id="arcade"></div>'
  const root = document.querySelector<HTMLElement>("#arcade")!
  arcade = createArcade({ root, games: [entry], host: makeHost() })
  return root
}

async function startRun(root: HTMLElement): Promise<(input: number) => void> {
  const play = [...root.querySelectorAll("button")].find(
    (button) => button.textContent === "Play",
  )
  expect(play, "Play button").toBeDefined()
  dispatch = undefined
  play!.click()
  await vi.waitFor(() => expect(dispatch).toBeDefined())
  return dispatch!
}

function overlay(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>(".arcade-overlay")!
}

function overlayButton(root: HTMLElement, label: string): HTMLButtonElement {
  const button = [...overlay(root).querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  )
  expect(button, `${label} button`).toBeDefined()
  return button as HTMLButtonElement
}

function gameAction(root: HTMLElement, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>(".arcade-game-actions button")].find(
    (candidate) => candidate.textContent === label,
  )
  expect(button, `${label} game action`).toBeDefined()
  return button!
}

function pauseButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(".arcade-game-actions button")!
}

afterEach(() => {
  arcade?.destroy()
  arcade = undefined
  dispatch = undefined
  document.body.innerHTML = ""
})

describe("shell run overlays", () => {
  it("keeps the leaderboard reachable after a run and returns to the results", async () => {
    const root = await mount()
    const fire = await startRun(root)
    fire(1)

    await vi.waitFor(() => expect(overlay(root).textContent).toContain("Run over."))
    overlayButton(root, "Back to game")
    overlayButton(root, "Leaderboard")

    overlayButton(root, "Leaderboard").click()
    await vi.waitFor(() =>
      expect(overlay(root).textContent).toContain("LEADERBOARD · ALL TIME"),
    )
    expect(overlay(root).textContent).toContain("No ranked runs yet. Be the first.")
    overlayButton(root, "Results")
    overlayButton(root, "Back to game")
    overlayButton(root, "Play again")

    overlayButton(root, "Results").click()
    await vi.waitFor(() => expect(overlay(root).textContent).toContain("Run over."))

    overlayButton(root, "Back to game").click()
    expect(overlay(root).hidden).toBe(true)
    expect(gameAction(root, "Results")).toBeDefined()
    expect(gameAction(root, "Leaderboard").disabled).toBe(false)
  })

  it("opens the leaderboard from the final board after the results card is dismissed", async () => {
    const root = await mount()
    const fire = await startRun(root)
    fire(1)

    await vi.waitFor(() => expect(overlay(root).textContent).toContain("Run over."))
    overlayButton(root, "Back to game").click()
    expect(overlay(root).hidden).toBe(true)

    gameAction(root, "Leaderboard").click()
    await vi.waitFor(() =>
      expect(overlay(root).textContent).toContain("LEADERBOARD · ALL TIME"),
    )
    expect(overlayButton(root, "Results")).toBeDefined()

    overlayButton(root, "Back to game").click()
    expect(overlay(root).hidden).toBe(true)
  })

  it("pauses a live run for the leaderboard and resumes it", async () => {
    const root = await mount()
    await startRun(root)

    gameAction(root, "Leaderboard").click()
    await vi.waitFor(() =>
      expect(overlay(root).textContent).toContain("LEADERBOARD · ALL TIME"),
    )
    expect(overlay(root).textContent).not.toContain("Back to game")
    expect(pauseButton(root).textContent).toBe("Resume")

    overlayButton(root, "Resume").click()
    expect(overlay(root).hidden).toBe(true)
    expect(pauseButton(root).textContent).toBe("Pause")
  })

  it("uses leaderboard wording everywhere it can appear", async () => {
    const root = await mount()
    const fire = await startRun(root)
    fire(1)

    await vi.waitFor(() => expect(overlay(root).textContent).toContain("Run over."))
    const text = root.textContent ?? ""
    expect(text).toContain("Leaderboards")
    expect(text).toContain("Leaderboard")
    expect(text).not.toContain("View board")
    expect(text).not.toContain("Daily board")
    expect(text).not.toContain("Boards")
  })

  it("opens the all-time leaderboard hub from the top bar", async () => {
    const root = await mount()
    const topBar = [...root.querySelectorAll<HTMLButtonElement>(".arcade-top-meta button")]
    const hub = topBar.find((button) => button.textContent === "Leaderboards")
    expect(hub, "Leaderboards top-bar button").toBeDefined()

    hub!.click()
    await vi.waitFor(() =>
      expect(root.querySelector(".arcade-boards")?.textContent).toContain(
        "No ranked runs yet. Be the first.",
      ),
    )
    expect(root.querySelector(".arcade-boards")?.textContent).toContain("ALL TIME · TOP 50")

    const lobby = [...root.querySelectorAll<HTMLButtonElement>(".arcade-boards-head button")].find(
      (button) => button.textContent === "← Lobby",
    )
    expect(lobby, "Lobby button").toBeDefined()
    lobby!.click()
    expect(root.querySelector(".arcade-grid")).not.toBeNull()
  })
})
