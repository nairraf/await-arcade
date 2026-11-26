# Crate Pusher

A compact, seeded Sokoban-shaped turn puzzle. Push every crate onto a goal pad
using orthogonal moves. A crate pushed into a non-goal corner is trapped for
good, and every board comes with a true-optimal `par` found by exhaustive BFS.

## Modes

- **Easy (3 rooms · 6×6)** — 3 rooms of 6×6 (6 walls, 2 crates/goals, 9 reverse pulls, min Par 10). Room ceiling `500 + par × 50`.
- **Hard (3 rooms · 7×7)** — 3 rooms of 7×7 (10 walls, 3 crates/goals, 12 reverse pulls, min Par 15). Room ceiling `900 + par × 80`.
- **Endless** — unlimited rooms (6×6 2 crates for rooms 1–2, 7×7 3 crates for room 3+), adding `+150 × (room - 1)` to each room's ceiling until a corner trap ends the run. Any run that clears at least one room ranks on the Endless board.

All modes have no move limit: solving a room at or under Par earns its full ceiling, and extra moves reduce that room's payout along `ceiling × (par / moves)^1.5` (floor 100 per room). Ranked play has no undo, and the server tiebreak is score, then elapsed server time.

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
  corner blockers, so the rule has no false positives. Easy previews corner traps
  with a dashed red outline and status sentence before the push; Hard and Endless
  omit the warning.
- **Inputs** — the only replay input is `{ type: "move", dir }`. Unknown types,
  diagonals, numbers, `NaN`, and any input after the run ends are no-ops.
- **Score** — no wall-clock time. While playing, `score()` returns banked room
  points plus the live room projection so the shell HUD matches `Est.`; a
  corner-trap loss keeps banked points (`unranked` in Easy/Hard; `ranked` in
  Endless if at least one room was cleared); an Easy/Hard win is ranked with
  the server's elapsed time only in `rankKey`.

## Files

- `src/meta.ts` — id, modes, score bounds, controls, DOM surface, theme.
- `src/core.ts` — pure deterministic state, reverse-pull generation, optimal
  par BFS, stuck rule, preview/trace, and score.
- `src/view.ts` — DOM grid, goal strip, always-available guide, push previews,
  bounded per-turn playback, keyboard/click input, and screen-reader labels.
- `src/view.test.ts` — unit tests for `previewCell` push, blocked-push, goal,
  trap, and plain-walk states.
- `src/core.test.ts` — generation invariants, optimal par, stuck soundness with
  a raw BFS oracle, refused pushes, terminal ordering, scoring, determinism,
  zero-leak serialization, preview/trace agreement, and the replay fixture.
- `replay.json` — verified 3-room easy `20260421` win (room 1 with a 2-move detour + rooms 2–3 at Par).
- `measure.ts` — F10 harness: 250 seeds per mode, random and `bfs2k` policies,
  optimality and random-solve gates, non-zero exit on failure.
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
seeds, and the uniform-random solve rate stays below 5%. The bounded-lookahead
`bfs2k` rate is reported but not gated, and Ian's playtest is the human
acceptance.

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
