# Architecture

## Layers

```
contract   types only: GameMeta, GameCore, GameView, Replay, Score
framework  runner, seeded RNG, surface, verifier, testkit
shell      launcher, HUD, local host, styles, generated game registry
games      pure core + view per cabinet
server     run issuance + replay verification + boards (in-memory for now)
hosts      OpenCode GUI plugin and Antigravity sidecar
apps/web   the same shell in a browser
```

The shell depends on the contract and framework. Games depend on both. The
server imports only `meta` + `core`; it must never import a view.

## The core/view split

`core.ts` is a pure state machine:

```ts
create(seed, mode): S
step(state, inputs, dt): S
phase(state): "playing" | "won" | "lost"
score(state, { elapsedMs, ticks }): Score
serialize(state): unknown
```

`view.ts` receives a `ViewContext` with the current state, a `dispatch`
function, the surface element, and the host capabilities. It never mutates
state and never sees auth tokens or the network.

## The runner

`createRunner` owns the clock:

- turn games: one `step` per dispatched input, `dt = 0`;
- realtime games: a fixed `step` at `1000 / tickRate`, driven by
  `requestAnimationFrame`;
- it records every input with its tick, stops when `phase !== "playing"`, and
  builds a `Replay`;
- it pauses on `visibilitychange` in the shell and exposes `pause`/`resume`.

The view only renders. This keeps replay recording and pacing identical across
games.

## Determinism

The verifier re-runs the core from the seed and inputs. That requires:

- seeded RNG (`createRng`), never `Math.random`;
- injected time, never `Date.now`/`performance.now`;
- fixed-timestep realtime cores;
- integer/fixed-point simulation where cross-platform drift matters;
- no DOM, network, storage, or locale in the core.

`npm run aa -- check` scans each core for forbidden globals and verifies
`replay.json` fixtures.

## Registries

`npm run aa -- sync` scans `games/*/arcade.config.ts` and writes:

- `packages/shell/src/registry.generated.ts` — `meta + core + view`;
- `packages/server/src/registry.generated.ts` — `meta + core`.

The registry is generated at build time on purpose. OpenCode's GUI bundle is a
single prebuilt CommonJS file, and its Vite preset inlines dynamic imports, so
runtime third-party game loading is not a v1 feature. Contributors add a
folder, run `sync`, and the release bundles it.

## Verification flow

1. `POST /v1/runs` issues `runId` + `seed`.
2. The client plays and records inputs.
3. `POST /v1/runs/:id/submit` sends the replay.
4. The server calls `verifyReplay(core, meta, replay)`.
5. If `score.ranked`, it updates the board.

The client never sends a trusted score. A determined cheater can still use a
solver; leaderboards are for fun. The verifier stops trivial score injection.

## Host boundary

- **OpenCode**: GUI bundle + optional server part. The panel mounts the shared
  shell into a `div`; styles go through `ctx.add(Style, …)`. The server part is
  the future place for the API proxy and token storage.
- **Antigravity**: a Node sidecar serves `index.html`, `app.js`, `app.css` on
  loopback. The page mounts the same shell. The sidecar data directory is the
  future token store.

The shell is framework-free DOM, so both hosts can mount it without shipping a
React/Solid runtime into the game layer. The OpenCode wrapper is Solid because
that is the host's component model; the shell itself is not.
