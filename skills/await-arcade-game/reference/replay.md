# Replays and verification

A replay is the seed plus the ordered inputs. The server recreates the initial
state, applies the inputs, and calls `core.score` itself. The client never
sends a trusted score.

```ts
interface Replay<I> {
  version: 1
  gameId: string
  gameVersion: string
  frameworkVersion: string
  modeId: string
  seed: number
  kind: "turn" | "realtime"
  tickRate?: number
  durationMs: number
  inputs: { tick: number; input: I }[]
  stateHash?: string
}
```

## Turn games

- `tick` is the move sequence: 0, 1, 2, …
- `durationMs` is wall time, bounded by `meta.maxDurationMs`.
- The verifier applies each input once and stops when the phase changes.

## Realtime games

- `tick` is the simulation tick.
- `durationMs` must align to `1000 / tickRate`.
- The verifier simulates exactly `durationMs / dt` ticks.
- Inputs at tick `N` are applied on step `N`.

## Server flow

1. `POST /v1/runs` with `{ gameId, modeId }` returns `{ runId, seed, expiresAt }`.
2. The client plays the seed and records inputs.
3. `POST /v1/runs/:id/submit` with `{ replay }`.
4. The server calls `verifyReplay(core, meta, replay)`.
5. If `ok` and `score.ranked`, update the board.

## Fixtures

Put a verified run at `games/<id>/replay.json`. `npm run aa -- check`
verifies it on every run. Bump `meta.version` if you change the rules; old
fixtures should then fail loudly rather than silently pass.
