# 2048

A seeded 2048 cabinet: slide the grid, merge matching tiles, and reach 2048
before the board fills. The score is the sum of merged tiles.

## Files

- `src/meta.ts` — id, title, modes, score type, controls, display surface.
- `src/core.ts` — pure, deterministic simulation and score. No DOM, no network.
- `src/view.ts` — DOM rendering, keyboard, swipe, and on-screen pad.
- `src/core.test.ts` — determinism, merge rules, win, and replay checks.
- `arcade.config.ts` — tells `aa sync` where the three parts live.

## Rules

Spawns derive from `seed` and the spawn counter, so the core keeps no hidden RNG
state and the server can replay a run exactly. Keep it that way: no
`Math.random`, no `Date.now`, no DOM, no network in `core.ts`. Bump
`meta.version` when the rules change so old replays are rejected.
