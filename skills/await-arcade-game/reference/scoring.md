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

## Mineflag

- `value` is the verified move count (`context.ticks`) — fewer moves wins.
- `ranked` is true only on a win.
- A loss still gets `won: false, ranked: false`, so it never reaches the board.
- Turn replays carry a client-supplied `durationMs`; never score from it. Use
  `context.ticks` or the final state so the server derives the value itself.

## Score-attack games

- `value` is the score, survival time, or distance.
- For realtime games, `elapsedMs` comes from the tick-aligned replay duration.
- `ranked` can be true for a loss: the run is complete and the score is real.
- Set `meta.score.unit` (`time`, `moves`, or `points`) so the shell formats the
  value correctly.

## Ranking metadata

Declare ordering in `meta.ranking`; never rely on the server or shell knowing
your game id.

- `ranking.tiebreak: "serverTime"` adds a server-clock tiebreak when primary
  values are equal. `tiebreakScope: "daily"` limits it to daily boards; omit for
  every ranked board.
- `ranking.value: "moves"` writes the verified input count as a lower-is-better
  board value. It requires `meta.score.type: "lower"`.
- `meta.clock: "elapsed"` shows the live elapsed clock on a turn game (realtime
  games always show one).
- `meta.dailyAnchor: "centerReveal"` asks the server to require a centre reveal
  as the daily prelude.

A timed board's `score.max` must stay below 1,000,000: the stored rank key pads
the primary value to six digits. A `moves` board must be turn-based and keep
`maxInputs` below the same bound.

The server derives the stored rank key and the shell derives board formatting
and rank hints from these fields. Run `npm run check`; the generic cartridge
contract suite rejects incoherent declarations (moves ranking on a realtime or
higher-score game, a timed board without replay verification, a score range that
overflows the six-digit rank key, or a daily anchor the core cannot play).

## Arcade-wide points

Don't sum raw scores across games. Normalize:

- each run earns `base(difficulty) × performance`, clamped;
- only the best run per game per UTC day counts;
- arcade board = sum of best points per game + medals.

Medals per board: gold/silver/bronze by fixed thresholds or percentile. Arcade
rank rewards breadth, not grinding one cartridge.

## Daily challenge

`seed = HMAC(secret, gameId + ":" + YYYY-MM-DD)`. One attempt (or best of
three) per player. Board id `game:mode:daily:YYYY-MM-DD`. Same seed for
everyone, verifiable, and nearly free to run.
