# Tile Chain Drop

A seeded 7×7 cascade puzzle. Drop the current numbered tile into any of seven
columns. A numbered tile clears when its value equals the size of its contiguous
horizontal or vertical run of numbered tiles. Every clear settles gravity, so one
drop can chain into several waves.

## Modes

- **Skirmish** — clear 25 tiles within 35 drops. The run is won as soon as the
  clear objective is met; otherwise it is lost at the drop cap or when the top
  row fills. A win scores
  `chainPoints + (35 - dropsUsed) × 25 + 200`; a loss scores 0 and is unranked.
- **Endless** — every 10 drops pushes the stack up one row and inserts a row of
  seven cracked tiles, raising the depth. The run ends when the push would
  overflow row 0 or when the top row is full. Any ended run with a positive
  score ranks, even though it is a loss: `chainPoints + (depth - 1) × 100`.

## Rules

- **Tiles** — values `1`–`7`, plus `"cracked"` blockers. Empty cells are `null`.
- **Groups** — a group is a maximal orthogonal run of numbered tiles. Cracked and
  empty cells break runs and never count toward group size. A tile clears when
  `hSize === value || vSize === value`, with both axes measured on the same
  pre-wave snapshot. A tile matching on both axes clears once.
- **Cascades** — each wave removes all qualifying numbered tiles, then any
  `"cracked"` tile orthogonally adjacent to a clearing numbered tile. Cracked
  tiles never propagate to other cracked tiles. The wave is scored
  `10 × wave² × tilesRemoved`, gravity compacts each column down, and the board
  is re-evaluated. The loop is capped at 49 waves (the board has 49 cells).
- **Bag** — `skirmish` shuffles `[1..7, "cracked"]`; `endless` shuffles
  `[1..7, "cracked", "cracked"]`. Bag `n` is derived only from
  `(seed, n, modeId)` with `createRng`, so replays redraw the same sequence and
  the state stores only the current and next tile.
- **Inputs** — the only replay input is `{ type: "drop", col }`. Out-of-range
  columns, malformed inputs, drops into a full column, and any input after the
  run ends are no-ops. Time never enters the core or the score; the server adds
  elapsed time only at the end of the `rankKey` tiebreak.

## Files

- `src/meta.ts` — id, modes, score bounds, controls, DOM surface, theme.
- `src/core.ts` — pure, deterministic board, bag, cascades, and score. No DOM,
  no network, no wall-clock time, no unseeded randomness.
- `src/view.ts` — DOM board, landing preview, column cursor, keyboard/click/touch
  input, and next/current tile previews.
- `src/core.test.ts` — determinism, bag wrap, clear/cascade/cracked rules, both
  game-over paths, scoring invariance, serialize round-trip, input hardening,
  and the replay fixture.
- `replay.json` — a verified 29-drop skirmish win (`seed 20260420`): 29 clears,
  3 cracked tiles, max chain 2, 410 chain points, score 760.
- `arcade.config.ts` — tells `aa sync` where the three parts live.
- `README.md` — this file.

## Controls

| Keys | Action |
| --- | --- |
| `←` / `→` / `A` / `D` | Select column (wraps) |
| `Space` / `Enter` / Click | Drop into the selected column |
| `1`–`7` | Drop directly into column 1–7 |

Touch works by tapping any cell in a column. Keyboard input is scoped to the
cartridge surface; held keys never repeat a drop.

## Commands

```sh
npx vitest run games/tilechain   # fast rules loop
npm run dev                      # play at http://localhost:5199
npm run aa -- sync               # regenerate shell/server registries
npm run fixtures                 # regenerate replay.json
npm run check                    # typecheck, tests, core scan, fixtures
```

## Rules for contributors

Keep `core.ts` deterministic: seeded RNG only, no `Math.random`, no `Date.now`,
no `performance.now`, no DOM, no timers. `serialize()` must round-trip every
play-affecting field and must not leak undealt bag tiles. The ranked value must
be replay-derived only. Bump `meta.version` when rules or scoring change so old
replays are rejected instead of silently scoring under new rules.
