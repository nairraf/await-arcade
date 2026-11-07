# Await Arcade

Await Arcade is a tiny cross-host arcade for OpenCode Desktop and Antigravity.

Two cabinets ship in the scaffold:

- **Minesweeper** — turn-based, safe first click, flood reveal, chording,
  keyboard play, replay-verified personal bests.
- **Neon Cycles** — realtime grid light cycles, solo vs AI or local duel, a
  canvas reference implementation.

The point is the framework: the shell is the product, games are content. Adding
a cabinet should be one folder plus `npm run aa -- sync`.

## Status

This is a working scaffold, not a finished arcade.

- ✅ Framework contract, fixed-timestep runner, seeded RNG, replay verifier.
- ✅ Shell: launcher, HUD, pause, restart, local bests, replay download.
- ✅ Two reference games with tests and replay verification.
- ✅ OpenCode Desktop host (GUI plugin) and Antigravity host (sidecar).
- ✅ In-memory verifier API (`packages/server`) with run issuance and boards.
- ✅ `aa` CLI: `new-game`, `sync`, `verify`, `check`, `list`.
- ✅ `await-arcade-game` skill with contract docs, determinism rules, and templates.
- ⏳ GitHub device-flow auth, durable Firestore boards, daily challenge, arcade
  XP/medals. The design is in `docs/backend.md`.

Scores are local in the hosts today. The verifier server is real but in-memory;
it is the shape the GCP backend will take.

## Quick start

```sh
npm install
npm run dev
```

Open <http://localhost:5199>. The launcher is the front door.

Useful commands:

```sh
npm run typecheck
npm test
npm run check                  # typecheck + tests + core scan + replay fixtures
npm run aa -- list
npm run aa -- sync
npm run aa -- new-game my-game
npm run aa -- verify minesweeper games/minesweeper/replay.json
```

## Layout

```
packages/
  contract/        types and the GameCore/GameView contract
  framework/       runner, seeded RNG, surface, replay verifier, testkit
  shell/           launcher, HUD, local host, styles, generated game registry
  server/          in-memory verifier API + generated verifier registry
  host-opencode/   OpenCode Desktop GUI plugin
  host-antigravity/Antigravity sidecar
games/
  minesweeper/     turn-based reference
  light-cycles/    canvas/realtime reference
tools/
  cli/             new-game, sync, verify, check
skills/
  await-arcade-game/ the executable contribution guide
apps/
  web/             Vite demo
```

## Add a game

```sh
npm run aa -- new-game neon-cycles
```

That copies the template from `skills/await-arcade-game/templates/game`, replaces
`__ID__`/`__TITLE__`, and regenerates both registries. Then read
`skills/await-arcade-game/SKILL.md`.

The one rule: `core.ts` is pure and deterministic; `view.ts` owns the DOM or
canvas. The server imports only the core, replays the run, and derives the
score itself.

## Hosts

### OpenCode Desktop

```sh
npm run build --workspace @await-arcade/host-opencode
ln -s "$PWD/packages/host-opencode" ~/.config/opencode/plugins/await-arcade
```

The plugin id is `await-arcade` (from `server.js`). It adds a pinned **Await Arcade** side
panel, a command, and a titlebar pill. See `packages/host-opencode/README.md`.

### Antigravity

```sh
npm run build --workspace @await-arcade/host-antigravity
ln -s "$PWD/packages/host-antigravity" ~/.gemini/config/sidecars/await-arcade
```

Enable it in `~/.gemini/config/config.json`:

```json
{ "sidecars": { "await-arcade": { "enabled": true } } }
```

See `packages/host-antigravity/README.md`.

## Verified in this scaffold

- `npm run check` passes: workspace typecheck, OpenCode host typecheck, 11 tests,
  core determinism scan, and both replay fixtures.
- `npm run build` builds the browser demo.
- `npm run build:hosts` builds `gui-experimental.cjs` and the Antigravity
  `index.html` + `app.js`.
- The Antigravity sidecar serves `/`, `/app.js`, and an empty `/app.css` on
  loopback.
- In the browser: the launcher renders, Minesweeper reveals/floods, Neon Cycles
  runs and ends, the game-over overlay saves a personal best, and the best score
  survives a return to the launcher via `localStorage`.
- `aa new-game` scaffolds a working template game, and its test + `check`
  pass.

## Pick up here

The first milestone is **beta-1**. See `docs/roadmap.md` for scope, acceptance
criteria, and what is deliberately out of scope.

1. Wire the shell's `GameHost.submit` to the verifier API:
   - OpenCode: a small RPC in `packages/host-opencode/server.js`.
   - Antigravity: proxy through `server.mjs` and store the token in the
     sidecar data directory.
2. GitHub Device Flow + `playerId` recovery code (see `docs/backend.md`).
3. Firestore + Cloud Run: replace the in-memory store in `packages/server`.
4. Daily challenge and arcade XP/medals.
5. Add the next cabinet from the skill; Missile Defense async PvP is the first
   multiplayer candidate.

## Design docs

- `docs/architecture.md` — layers, contract, determinism, verification.
- `docs/roadmap.md` — beta-1 scope, acceptance criteria, and later milestones.
- `docs/backend.md` — the cheap GCP plan: Firestore, Cloud Run, auth, boards,
  playerId recovery, arcade XP, costs.
- `docs/hosts.md` — the two host models and their constraints.
- `skills/await-arcade-game/` — the contributor skill.

## License

MIT. Game assets must be original or CC0/CC-BY; see
`skills/await-arcade-game/reference/assets.md`.
