# Crate Pusher

A compact, seeded Sokoban-shaped turn puzzle. Push every crate onto a goal pad
using orthogonal moves. A crate pushed into a non-goal corner is trapped for
good, and every board comes with a true-optimal `par` found by exhaustive BFS.

## Modes

- **Easy (6×6)** — 5 walls, 2 crates and 2 goals, 7 reverse pulls. Base score
  2,000.
- **Hard (7×7)** — 8 walls, 2 crates and 2 goals, 9 reverse pulls. Base score
  4,000.

Both modes use the same move budget: `par + max(6, ceil(0.75 × par))`. Finishing
at or under par earns the full base score; each move over par costs 50 points,
with a floor of 100. Ranked play has no undo, and the server tiebreak is score,
then elapsed server time.

## Rules

- **Grid** — row-major cells (`index = y * width + x`). `walls` is a boolean
  array; `goals` is sorted ascending; `crates` preserves slot order across
  pushes so the view can animate the crate that moved. The operator starts
  after the reverse-pull scramble, not at the solved-state position.
- **Move** — one orthogonal step onto an in-bounds, non-wall cell. Stepping
  into a crate pushes it one cell further in the same direction when that cell
  is in bounds, wall-free, and crate-free. Every committed move increments
  `movesUsed`; refused moves cost nothing.
- **Generation** — static walls, goals with a two-cell approach, and a
  solved-state operator are drawn from one `createRng(seed >>> 0)` stream.
  `targetPulls` reverse pulls scramble the board; each pull is a single RNG
  draw after a deterministic BFS walk. Boards are rejected until every crate
  has left a goal and the true optimal `par` (exhaustive BFS, 300k-node cap)
  reaches the mode minimum. A pinned fallback bank guarantees `create()`.
- **Stuck rule** — a crate is stuck only when it sits off a goal and is blocked
  along both axes by static walls or borders. Other crates never count as
  corner blockers, so the rule has no false positives. The view shows a warning
  outline and status sentence before the push.
- **Inputs** — the only replay input is `{ type: "move", dir }`. Unknown types,
  diagonals, numbers, `NaN`, and any input after the run ends are no-ops.
- **Score** — no wall-clock time. While playing, `score()` returns the live
  projected value so the shell HUD and pause overlay match `Est.`; a loss is
  worth 0 and unranked; a win is ranked with the server's elapsed time only in
  `rankKey`.

## Files

- `src/meta.ts` — id, modes, score bounds, controls, DOM surface, theme.
- `src/core.ts` — pure deterministic state, reverse-pull generation, optimal
  par BFS, stuck rule, preview/trace, and score.
- `src/view.ts` — DOM grid, goal strip, always-available guide, push previews,
  bounded per-turn playback, keyboard/click input, and screen-reader labels.
- `src/core.test.ts` — generation invariants, optimal par, stuck soundness with
  a raw BFS oracle, refused pushes, budget/win ordering, scoring, determinism,
  zero-leak serialization, preview/trace agreement, and the replay fixture.
- `replay.json` — verified easy `20260421` win: 16 moves, par 14, score 1,900.
- `measure.ts` — F10 harness: 250 seeds per mode, random and `bfs2k` policies,
  optimality and budget gates, non-zero exit on failure.
- `arcade.config.ts` — tells `aa sync` where the three parts live.
- `README.md` — this file.

## Controls

| Keys | Action |
| --- | --- |
| `Arrows` / `WASD` | Move the operator, or push the adjacent crate |
| Click / Tap an adjacent tile | Step or push one cell in that direction |
| `H` | Show or hide the how-to guide |

Keyboard input is scoped to the cartridge surface. Held keys never repeat a
move, modifier shortcuts are left to the shell, and the guide never blocks the
board.

## Measurement

```sh
npx tsx games/crates/measure.ts
```

250 seeds per mode. Gates: `optimalSolution` wins in exactly `par` on 100% of
seeds, `moveBudget >= ceil(1.6 × par)` on 100%, and the uniform-random solve
rate stays below 5%. The bounded-lookahead `bfs2k` rate is reported but not
gated, and Ian's playtest is the human acceptance.

## Commands

```sh
npx vitest run games/crates   # fast rules loop
npm run dev                   # play at http://localhost:5199
npm run aa -- sync            # regenerate shell/server registries
npm run fixtures              # regenerate replay.json
npm run check                 # typecheck, tests, core scan, fixtures
```

## Rules for contributors

Keep `core.ts` deterministic: seeded RNG only, no `Math.random`, no `Date.now`,
no `performance.now`, no DOM, no timers. `serialize()` must omit the generated
optimal and canonical solutions. The ranked value must be replay-derived only.
Bump `meta.version` when rules or scoring change so old replays are rejected
instead of silently scoring under new rules.
