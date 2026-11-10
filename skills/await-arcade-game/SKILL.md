---
name: await-arcade-game
description: Add a new game to Await Arcade. Use when creating a cartridge, implementing the GameCore/GameView contract, recording replay fixtures, wiring a game into the shell and verifier, or preparing a game PR.
---

# Adding a game to Await Arcade

Use this skill when you are adding or changing a cartridge in Await Arcade.

Await Arcade is a cross-host mini arcade for OpenCode and Antigravity. The shell
owns the launcher, auth, leaderboards, and submission. A game owns its rules,
rendering, and feel. The server re-runs the game's pure core to verify scores.

## The one rule

Split the game in two:

- `core.ts` is pure and deterministic. It must not touch the DOM, network,
  wall-clock time, or `Math.random`.
- `view.ts` is the only place that touches the DOM, canvas, audio, or host.

The server imports `core.ts`, never `view.ts`.

## Workflow

1. **Propose it.** Write down the loop, controls, fail state, score, run length,
   and whether it needs multiplayer. Keep the first version small.
2. **Scaffold it.**
   ```sh
   npm run aa -- new-game <kebab-case-id>
   ```
   This copies the template from `skills/await-arcade-game/templates/game` and
   regenerates the registries.
3. **Implement `core.ts`.** Use `createRng(seed)` from `@await-arcade/framework`.
   Make `step(state, inputs, dt)` advance exactly one turn (turn games) or one
   fixed tick (realtime games).
4. **Implement `view.ts`.** DOM for board games, canvas for action games.
   Dispatch inputs through `ctx.dispatch`; never mutate game state directly.
5. **Write tests.** At minimum: determinism, win path, loss path, and replay
   verification. Add a `replay.json` fixture when the game is stable.
6. **Register it.**
   ```sh
   npm run aa -- sync
   ```
7. **Check it.**
   ```sh
   npm run check
   ```
8. **Open a PR** using `.github/PULL_REQUEST_TEMPLATE.md`.

## Definition of done

- `npm run check` passes.
- `core.ts` has no `Math.random`, `Date.now`, `performance.now`, `window`,
  `document`, `fetch`, `localStorage`, `eval`, or `new Function`.
- Same seed + same inputs produce the same serialized state on Node and in a
  browser.
- The score is derived from state, not trusted from the client.
- `meta.version` is bumped whenever rules or scoring change.
- Assets are original or CC0/CC-BY. No ripped sprites or music.
- The game is keyboard-playable, pauses, mutes, and respects reduced motion.
- The cartridge reads in both light and dark mode, uses the shared shell frame,
  and sets its accent instead of inventing chrome.
- The bundle is small and the game holds 60fps on a modest laptop.
- The name and art are original; mechanics are fine, trademarks are not.

## Read next

- `reference/contract.md` — the exact `GameCore` / `GameView` contract.
- `reference/determinism.md` — the rules that make verification possible.
- `reference/replay.md` — replay format and the verifier.
- `reference/scoring.md` — `score`, `ranked`, modes, and leaderboards.
- `reference/rendering.md` — DOM vs canvas, input, focus, pause.
- `reference/visual-language.md` — the cartridge/cartridge system, per-game accents, light/dark, accessibility.
- `reference/assets.md` — art, audio, licensing, and naming.
- `reference/multiplayer.md` — daily seeds, ghosts, async PvP, realtime.
- `reference/contributing.md` — review, ownership, and release.

## Common pitfalls

- **Using `Math.random` in the core.** The replay will diverge. Use the seed.
- **Mutating state in the view.** Call `ctx.dispatch`; the runner records it.
- **Reading the wall clock in the core.** Pass elapsed time through `score`.
- **Making the first click unsafe.** Generate the board from the seed only
  after the first input, or relocate mines deterministically.
- **Reusing a score after a rule change.** Bump `meta.version`.
- **Ripping sprites.** Use original art. Mechanics are not copyrightable.
- **Stealing keyboard focus.** Scope listeners to the game surface; release
  keys on blur; never bind globally in the OpenCode renderer.
- **Skipping the replay fixture.** A fixture catches determinism regressions
  that unit tests miss.
