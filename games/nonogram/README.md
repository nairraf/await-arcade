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
- `src/core.ts` — pure game rules: coordinate cell marks, checks, score, and
  serialization.
- `src/view.ts` — DOM grid, clue rails, overlap scratchpad, pointer/drag/touch
  and keyboard input, light/dark themes, and audio cues.
- `src/core.test.ts` — solver unit cases, generator quality over 40 seeds per
  mode, win/fail/loss paths, input hardening, serialization, and the replay
  fixture.
- `replay.json` — a verified 3,400-point hard win that fails one check before
  solving.
- `arcade.config.ts` — tells `aa sync` where the three parts live.

## Controls

| Input | Action |
| --- | --- |
| Click / Drag | Paint or erase using the active tool (`Fill`, `Cross ×`, `Note 1`, `Note 2`) |
| Right-click / Drag | Cross or uncross cells directly without switching tools |
| `←` / `→` / `↑` / `↓` | Move the cell cursor (wraps at the edges) |
| `Space` | Toggle filled at the cursor |
| `X` | Toggle crossed at the cursor |
| `1` / `2` | Toggle temporary `Note 1` / `Note 2` on an empty cell |
| `P` / **Promote** | Commit all `Note 1` + `Note 2` overlap cells (`◆`) as filled and clear notes |
| `C` / **Clear notes** | Clear all temporary notes |
| **Clear board** | Click twice to erase all filled and crossed marks (keeps check count) |
| `Enter` / **Check** | Check the board |

Crosses are a player’s own notes. They are never part of the solution check, so
a crossed cell is treated like an empty one. Keys are scoped to the cartridge
surface, modifier combinations are left alone, and held mutating keys never
repeat a move.

## Overlap Notes

Temporary notes (`Note 1` and `Note 2`) live strictly in the view as a thinking
aid for left-most / right-most line overlap techniques and are never written to
replays. Each cell stores the two note layers independently so painting `Note 2`
over `Note 1` highlights the intersection (`◆`) without erasing either pass.
Notes apply only to empty cells and clear automatically when a cell is filled or
crossed, or when you trigger **Promote** (`P`) or **Clear notes** (`C`).

## Scoring

A win is the only ranked result:

- **Complexity ceiling (`base`)**: derived deterministically from board size,
  line-solver depth (`iterations`), and total clue runs (`15 × cells +
  (120 or 160) × iterations + 25 × runs`).
- **Precision deductions**: `-100` per failed check on easy and `-250` on hard
  before the winning check,
  `-25` per undone or overwritten filled cell, and `-100` per **Clear board**
  reset (plus any filled cells wiped), clamped at a 100-point floor. Toggling
  `Cross ×`, `Note 1`, and `Note 2` is free.
- **No time in the score.** The ranked value is the base minus deductions, so
  the same replay always verifies to the same number and a pause — an agent
  answering a turn, or you walking away — costs nothing. Elapsed time appears
  only at the end of the board `rankKey` as a tiebreak between identical scores,
  the way Mineflag's daily board orders moves then server time. A run longer than
  `meta.maxDurationMs` (one hour) is still rejected outright at submit — the cap
  guards replay size, not speed — so finish or restart within the hour. Five
  failed checks on the 6 × 6 board, or ten on the 10 × 10 board, lose the run and
  score `0`, unranked. Failed checks only report “not solved yet”; on a loss the
  wrongly filled (`✕`) and missed (`□`) cells are revealed.

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
