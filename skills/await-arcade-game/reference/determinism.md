# Determinism

Determinism is what makes the leaderboard trustworthy and ghosts possible. The
server re-runs `core.ts` from the replay and derives the score itself.

## Rules

1. **Seeded randomness only.** `createRng(seed)` from `@await-arcade/framework`.
   Never `Math.random`.
2. **Injected time.** The core gets `elapsedMs` in `score` and `dt` in `step`.
   Never `Date.now` or `performance.now`.
3. **Fixed timestep.** Realtime cores must not depend on frame timing. Step in
   whole ticks.
4. **Integer or fixed-point math in the simulation.** Avoid `Math.sin`,
   `Math.cos`, `Math.pow`, and floating-point accumulation in hot paths where
   cross-platform drift matters.
5. **No host state.** No DOM, network, storage, locale, or `window` in `core`.
6. **Stable serialization.** `serialize` must produce the same value for the
   same state. Sort sets and maps before serializing.
7. **Version the rules.** Bump `meta.version` when behavior changes.

## Good

```ts
const rng = createRng(seed)
const mine = rng.int(0, cells.length - 1)
const x = Math.floor(index / width)
```

## Bad

```ts
const mine = Math.floor(Math.random() * cells.length) // diverges
const now = Date.now() // unverifiable
const x = Math.sin(t) * radius // platform drift risk
```

## Test it

```ts
const a = playTurn(core, meta, { seed, mode, inputs })
const b = playTurn(core, meta, { seed, mode, inputs })
expect(core.serialize(a.state)).toEqual(core.serialize(b.state))
```
