# Codebreaker

A compact, deterministic deduction game. Crack a hidden code of four
(`classic`) or five (`expert`) symbols drawn from `A B C D E F`. Repeats are
allowed, in the secret and in guesses. Ten attempts per run.

Each guess reports two numbers — totals across the whole row, not per-slot
markers:

- **exact** — the same symbol in the same slot.
- **near** — the symbol is in the code but in a different slot. Only symbol
  occurrences left after exact matches are counted, so a guess can never claim
  more matches than the secret holds.

Win on the first guess for 1000 points; every extra attempt costs 100. A loss
scores 0 and is not leaderboard eligible.

## Files

- `src/meta.ts` — id, modes, score bounds, controls, DOM surface.
- `src/core.ts` — pure, seeded simulation and score. No DOM, no network, no
  wall-clock time, no unseeded randomness.
- `src/view.ts` — DOM board, guess history, keyboard and touch input.
- `src/core.test.ts` — feedback math, win/loss/invalid paths, determinism, and
  replay-fixture verification.
- `replay.json` — a verified two-attempt win for `classic`.
- `arcade.config.ts` — tells `aa sync` where the three parts live.

## Controls

| Keys | Action |
| --- | --- |
| `←` / `→` | Move the slot cursor (wraps) |
| `↑` / `↓` | Cycle the active symbol (wraps) |
| `A`–`E` | Set the active symbol directly |
| `Enter` | Submit the row when every slot is filled |
| `Backspace` / `Delete` | Clear the active slot |

Touch works through the slot tiles and the on-screen buttons. Keys are scoped to
the cartridge surface; no global listeners are installed.

## Rules

The secret is generated once from the run seed with `createRng`. `step` applies
one discrete input at a time and returns a new state; submitted guesses are
append-only. Invalid actions — submitting an incomplete row, an unknown action
type, a bad delta, or any input after the run ends — are no-ops.

Bump `meta.version` when the rules or scoring change so old replays are
rejected instead of silently scoring under new rules.
