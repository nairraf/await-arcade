# Lockstep

A seeded 5×5 telegraphed micro-tactics cartridge. Every enemy paints the cell it
is about to hit, so each turn is a choice between killing a threat, shoving it
somewhere worse, or stepping out of the way.

## Files

- `src/meta.ts` — id, title, modes, score type, controls, display surface.
- `src/core.ts` — pure, deterministic simulation and score. No DOM, no network.
- `src/view.ts` — DOM grid, intent badges, danger overlay, keyboard/click input.
- `src/core.test.ts` — rule-level tests plus a scripted full-run replay check.
- `solver.ts` — dev-only greedy policy used by the tests and the fixture. Not
  imported by `index.ts` and not part of the cartridge.
- `arcade.config.ts` — tells `aa sync` where the three parts live.

## How it plays

- The runner has 3 HP and moves one orthogonal cell per turn. Walking into an
  enemy shoves it instead of moving.
- A shoved enemy takes 1 damage. If the cell behind it is a pillar, the arena
  edge, or another enemy, it takes a second point of damage. Shoving an enemy
  into another damages **both** units, and a kill on either side pays out. That
  crush is the only way to one-shot a 2-HP Lancer.
- Pulse pushes all four adjacent enemies outward on a 2-turn cooldown. Wait
  holds position and still resolves the enemy phase.
- Enemies telegraph, then resolve: Strikers chase and slash one adjacent cell,
  Lancers fire a row/column beam along a line of sight and cool down for a
  turn, Mortars never move and lock an X-shaped blast on the runner's cell.
- Clearing a sector heals 1 HP (max 3), pays `25 × sector`, and pays a speed
  bonus of 12 points per turn under the 6-turn par. Winning adds a bonus for
  every HP still standing, so clean and fast runs separate on the board.

`dangerCells()` is the single source of truth for the telegraph overlay: it and
turn resolution both walk beams through `traceBeam()`, and every impact is
snapshotted before damage lands, so the preview cannot drift from the damage
rule. Killing the last enemy ends the sector immediately, so a telegraph still
pointing at the runner never fires.

## Commands

```sh
npm run dev                 # play it at http://localhost:5199
npm run test                # rules and replay checks
npm run aa -- sync          # regenerate the shell and server registries
npm run fixtures            # regenerate replay.json from solver.ts
```

The committed fixture is a full Skirmish win (seed 10). Regenerate it after any
rules change; `aa check` fails if the fixture no longer verifies.

## Rules for contributors

Keep `core.ts` deterministic: seeded RNG only, no `Math.random`, no `Date.now`,
no `window`, no `document`, no `fetch`. The server imports `core.ts` to verify
leaderboard runs. If you change the rules or the scoring, bump `meta.version`
so old replays are not accepted against new rules.
