# Mineflag

A seeded minesweeper-style logic cartridge: reveal safe cells, flag mines, and
chord cleared numbers. Beginner, intermediate, and expert boards.

## Files

- `src/meta.ts` — id, title, modes, score type, controls, display surface.
- `src/core.ts` — pure, deterministic simulation and score. No DOM, no network.
- `src/view.ts` — DOM board, mouse/keyboard play, responsive scroll for expert.
- `src/core.test.ts` — safe first click, flood reveal, and replay checks.
- `arcade.config.ts` — tells `aa sync` where the three parts live.

## Rules

The first reveal is always safe; mines are placed from the seed around that
click. Keep `core.ts` deterministic: no `Math.random`, no `Date.now`, no DOM,
no network. Bump `meta.version` when the rules change so old replays are
rejected.
