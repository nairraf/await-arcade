# Brickstorm

A seeded brick-buster with three brick bands, a glowing save brick, and
explosive super bricks that clear their neighbours. Score is awarded per brick,
with higher rows worth more.

## Files

- `src/meta.ts` — id, title, modes, score type, controls, display surface.
- `src/core.ts` — pure, deterministic simulation and score. No DOM, no network.
- `src/view.ts` — canvas rendering, pointer and keyboard input.
- `src/core.test.ts` — determinism, paddle/ball physics, and replay checks.
- `arcade.config.ts` — tells `aa sync` where the three parts live.

## Rules

The initial ball angle derives from the seed. Keep `core.ts` deterministic: no
`Math.random`, no `Date.now`, no DOM, no network. Bump `meta.version` when the
rules change so old replays are rejected.
