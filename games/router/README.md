# Circuit Router

A turn-based routing puzzle. Every tile is a pipe junction; rotate tiles until
the whole grid is powered from the centre source with zero open ends.

## Modes

| Mode | Grid | Source | Turn limit | Par target |
| --- | --- | --- | --- | --- |
| Easy | 5 × 5 | (2, 2) | Unlimited | `1,500 + 100 × par` |
| Hard | 6 × 6 | (3, 3) | Unlimited | `3,000 + 125 × par` |

Score scales smoothly by move efficiency (`round(parTarget × par / turns)`, clamped to `100..10,000`), so harder boards and under-par solutions score higher while extra turns lower the score. Both boards are deterministic from the run seed. The generator builds a random spanning tree with Prim's algorithm, then scrambles each tile by a random rotation. `par` is the shortest quarter-turn restoration distance to that reference tree; alternate valid circuits can finish under par.

## Rules

- A tile is a 4-bit connector mask (`N=1, E=2, S=4, W=8`).
- Power floods from the centre source through mutually matching connectors.
- A win needs every tile powered **and** every pipe arm matched: an arm into the
  grid border or a neighbour's blank wall is an open end and blocks victory.
- 4-way crosses are symmetric, so rotating one is a free no-op.
- Most boards have a unique solution, though roughly 5% admit an alternate
  valid spanning tree (which can occasionally finish under `par`).
- Score is replay-derived: `round(parTarget × par / turns)`, clamped to
  `100..10,000`. The server uses elapsed time only as a board tiebreak.

## Controls

Arrows/WASD/hover move the cursor, Space/Enter/click rotate clockwise,
Q/X/right-click rotate counter-clockwise, hovering or focusing the `Rotate CW`
/ `Rotate CCW` buttons previews the next turn on the selected tile, and H
toggles the guide.

## Checks

```sh
npx vitest run games/router
npm run check
npx tsx games/router/measure.ts   # 250 seeds/mode, random vs greedy
```
