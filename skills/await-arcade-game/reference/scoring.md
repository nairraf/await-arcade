# Scoring and leaderboards

```ts
interface Score {
  value: number
  type: "higher" | "lower"
  won: boolean
  ranked: boolean
  detail?: Record<string, number | string | boolean>
}
```

- `type` matches `meta.score.type`.
- `won` is for the UI: did the player win this run?
- `ranked` is for the leaderboard: is this run eligible?
- `value` is what the board stores.

## Minesweeper

- `value` is elapsed milliseconds.
- `ranked` is true only on a win.
- A loss still gets `won: false, ranked: false`, so it never reaches the board.

## Score-attack games

- `value` is the score, survival time, or distance.
- `ranked` can be true for a loss: the run is complete and the score is real.

## Arcade-wide points

Don't sum raw scores across games. Normalize:

- each run earns `base(difficulty) × performance`, clamped;
- only the best run per game per UTC day counts;
- arcade board = sum of best points per game + medals.

Medals per board: gold/silver/bronze by fixed thresholds or percentile. Arcade
rank rewards breadth, not grinding one cabinet.

## Daily challenge

`seed = HMAC(secret, gameId + ":" + YYYY-MM-DD)`. One attempt (or best of
three) per player. Board id `game:mode:daily:YYYY-MM-DD`. Same seed for
everyone, verifiable, and nearly free to run.
