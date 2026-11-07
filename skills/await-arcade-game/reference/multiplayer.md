# Multiplayer

Build it in phases. Real-time netcode is the last phase, not the first.

## Phase 1 — daily seed and ghosts

- Server issues a per-day seed.
- Everyone plays the same board.
- Store the input log; render a friend's ghost or split times.
- No networking during play.

## Phase 2 — asynchronous PvP

Best fit: **Missile Defense**, attacker vs defender.

- Attacker gets a budget of missiles and builds a wave: targets, trajectories,
  MIRVs, decoys, timing.
- Defender plays the wave in real time and intercepts.
- Score by cities saved, interceptors used, and time.
- Swap roles and aggregate.

This needs a `matches` document and two submissions, not a WebSocket. It is
cheap, latency-tolerant, and genuinely novel.

## Phase 3 — real-time PvP

Start with grid games: **Neon Cycles**, then **Pong**.

- Neon Cycles: both players commit a direction per tick; the server resolves.
  10–15 Hz is enough and tolerates latency.
- Pong: simplest physics, but needs prediction/interpolation.
- Cloud Run WebSockets are fine for short matches; keep an authoritative loop
  and validate the final replay.
- Don't build matchmaking until there are players to match.

## Rules

- Never trust a client for the result.
- The server owns the seed and the final score.
- Short matches, hard timeouts, reconnection-friendly.
- Rate-limit room creation.
- A disconnected player forfeits after a grace period.
