# __TITLE__

This is a generated Await Arcade cartridge. It is a working "click the target five
times" game, and it is meant to be replaced.

## Files

- `src/meta.ts` — id, title, modes, score type, controls, display surface.
- `src/core.ts` — pure, deterministic simulation and score. No DOM, no network.
- `src/view.ts` — DOM or canvas rendering and input. Calls `ctx.dispatch`.
- `src/core.test.ts` — determinism and replay checks.
- `arcade.config.ts` — tells `aa sync` where the three parts live.

## Commands

```sh
npm run aa -- sync
npm run test
npm run dev
```

## Rules

Keep `core.ts` deterministic: seeded RNG only, no `Math.random`, no `Date.now`,
no `window`, no `document`, no `fetch`. The server imports `core.ts` to verify
leaderboard runs. If you change the rules, bump `meta.version` so old replays
are not accepted against new rules.
