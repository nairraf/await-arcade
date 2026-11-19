# Nonogram

A deterministic logic-grid puzzle. Every row and column clue describes the runs
of filled cells in that line; fill the grid to match all of them. `easy` is a
6 × 6 board at roughly 55% fill, `hard` is 10 × 10 at roughly 50%. Both modes are
ranked on a win and get their own board.

Generated puzzles are guaranteed to be solvable by pure line logic — no
guessing, no backtracking — and the logic solution is the only grid the clues
can describe. If 200 seeded candidates are rejected, the game falls back to a
pre-verified puzzle for the mode, so `create()` always returns a playable board.

## Files

- `src/meta.ts` — id, modes, score bounds, controls, DOM surface, accent.
- `src/generate.ts` — seeded candidate drawing, clue derivation, the pure line
  solver, and the fallback bank. No DOM, no network, no wall-clock time, no
  unseeded randomness.
- `src/core.ts` — pure game rules: cursor, mark cycle, checks, score, and
  serialization.
- `src/view.ts` — DOM grid, clue rails, keyboard and touch input.
- `src/core.test.ts` — solver unit cases, generator quality over 40 seeds per
  mode, win/fail/loss paths, input hardening, serialization, and the replay
  fixture.
- `replay.json` — a verified 900-point hard win that fails one check before
  solving.
- `arcade.config.ts` — tells `aa sync` where the three parts live.

## Controls

| Keys | Action |
| --- | --- |
| `←` / `→` / `↑` / `↓` | Move the cursor (wraps at the edges) |
| `Space` | Cycle the cell: empty → filled → crossed → empty |
| `X` | Mark the cell crossed directly |
| `Enter` | Check the board |
| Click / Tap | Move the cursor there, then cycle the cell |

The on-screen **Cross** and **Check** buttons mirror `X` and `Enter` for
pointer-only and touch-only play. Crosses are a player’s own notes. They are
never part of the solution check, so a crossed cell is treated exactly like an
empty one. Keys are scoped to the cartridge surface, modifier combinations are
left alone, and held keys never repeat a move.

## Scoring

A win is the only ranked result: 1000 for a first-check solve, minus 100 for
each failed check before the winning one, with a 100-point floor. One failed
check followed by a clean solve scores 900. Ten failed checks lose the run and
score 0, unranked. Failed checks only report “not solved yet”; the game never
reveals which cells are wrong.

## Rules

`create(seed, mode)` draws candidates from `createRng(seed)` at the mode’s
density, rejects empty or solid boards and any board with an empty outer row or
column, derives the clues, and accepts only puzzles the line solver finishes
with the original grid. Rejections continue on the same stream up to a hard cap
of 200. The solver is pure and deterministic: for each line it enumerates every
legal block placement and keeps only the cells that are filled in every
placement or empty in every placement.

Bump `meta.version` when the rules, scoring, or generator acceptance change so
old replays are rejected instead of silently scoring under new rules.
