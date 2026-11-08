# Await Arcade

Await Arcade is a tiny cross-host arcade for OpenCode Desktop and Antigravity.

Four cabinets ship in the scaffold:

- **Minesweeper** — turn-based, safe first click, flood reveal, chording,
  keyboard play, replay-verified personal bests.
- **Neon Cycles** — realtime grid light cycles, solo vs AI or local duel, a
  canvas reference implementation.
- **2048** — seeded tile merging, keyboard/swipe/on-screen pad, a DOM
  reference implementation with score-attack ranking.
- **Breakout** — realtime brick-busting with pointer and keyboard control, a
  second canvas reference and a higher-score board.

The point is the framework: the shell is the product, games are content. Adding
a cabinet should be one folder plus `npm run aa -- sync`.

## Status

This is a working scaffold, not a finished arcade.

- ✅ Framework contract, fixed-timestep runner, seeded RNG, replay verifier.
- ✅ Shell: launcher, HUD, pause, restart, local bests, replay download, leaderboard.
- ✅ Four reference games with tests and replay verification.
- ✅ OpenCode Desktop host (GUI plugin) and Antigravity host (sidecar).
- ✅ Verifier API (`packages/server`) with run issuance and replay-checked boards.
- ✅ `aa` CLI: `new-game`, `sync`, `verify`, `check`, `list`.
- ✅ `await-arcade-game` skill with contract docs, determinism rules, and templates.
- ✅ Firestore + Cloud Run backend, Terraform-managed dev base, and GitHub Device
  Flow auth with per-host sessions.
- ⏳ Daily challenge, arcade XP/medals, and the production deployment.

Scores are local for guests. Signed-in players submit replay-verified runs to the
shared Firestore boards; the dev API is live, and `docs/backend.md` has the design.

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

Building is not installing. Link the packages into the host config directories
once, then restart the apps:

```sh
npm run build:hosts
AWAIT_ARCADE_API_URL=https://await-arcade-api-164244433164.northamerica-northeast1.run.app \
  ./scripts/install-hosts.sh
```

`AWAIT_ARCADE_API_URL` is optional; without it the hosts use
`http://127.0.0.1:8787`, or the `apiUrl` in
`~/Library/Application Support/await-arcade/config.json`.

### OpenCode Desktop

The installer symlinks `packages/host-opencode` to
`~/.config/opencode/plugins/await-arcade`. The plugin id is `await-arcade`
(from `server.js`); it adds a pinned **Await Arcade** side panel, a command, and
a titlebar pill. Rebuild after changing the shell, framework, or games. If your
plugin directory is not the default, set `OPENCODE_PLUGINS_DIR` or add the
absolute directory to `plugins` in `~/.config/opencode/opencode.jsonc`.

### Antigravity

The installer creates `~/.gemini/config/sidecars/await-arcade`, writes a local
`sidecar.json` with an absolute entry point, and adds:

```json
{ "sidecars": { "await-arcade": { "enabled": true, "projectId": "…", "schemaVersion": 1 } } }
```

to `~/.gemini/config/config.json`, with a matching project file. Open the
**await-arcade** project and the **Await Arcade** aux-pane view. See
`packages/host-antigravity/README.md` if you prefer to install by hand.

## Verified in this scaffold

- `npm run check` passes: workspace typecheck, OpenCode host typecheck, 37 tests,
  core determinism scan, and all four replay fixtures.
- `npm run build` builds the browser demo.
- `npm run build:hosts` builds `gui-experimental.cjs` and the Antigravity
  `index.html` + `app.js`.
- The Antigravity sidecar serves `/`, `/app.js`, and an empty `/app.css` on
  loopback.
- In the browser: the launcher renders, Minesweeper reveals/floods, Neon Cycles
  runs and ends, 2048 merges tiles by keyboard/swipe/pad, Breakout follows
  pointer and keyboard paddle aim, the game-over overlay saves a personal best,
  and the best score survives a return to the launcher via `localStorage`.
- `aa new-game` scaffolds a working template game, and its test + `check`
  pass.

## Pick up here

The first milestone is **beta-1**. See `docs/roadmap.md` for scope, acceptance
criteria, and what is deliberately out of scope.

1. ✅ Wire the shell's `GameHost.submit` to the verifier API:
   - OpenCode: a small RPC in `packages/host-opencode/server.js`; the server part
     owns `auth.opencode.json` in the native state directory.
   - Antigravity: proxy through `server.mjs`; store `auth.antigravity.json` in the
     native state directory. The sidecar data directory is for non-secret cache.
2. ✅ GitHub Device Flow + per-host persistent sessions; local guest mode;
   account deletion (see `docs/backend.md`).
3. ✅ Firestore + Cloud Run: the server keeps the in-memory store for tests and
   uses Firestore in production.
4. ⏳ Featured daily challenge (3 attempts, best of 3), unranked ghost practice,
   and arcade XP/medals.
5. ⏳ Add the next cabinet from the skill; Missile Defense async PvP is the first
   multiplayer candidate.

## Design docs

- `docs/architecture.md` — layers, contract, determinism, verification.
- `docs/roadmap.md` — beta-1 scope, acceptance criteria, and later milestones.
- `docs/backend.md` — the cheap GCP plan: Firestore, Cloud Run, GitHub identity,
  per-host persistent sessions, boards, account deletion, arcade XP, costs.
- `docs/hosts.md` — the two host models and their constraints.
- `skills/await-arcade-game/` — the contributor skill.

## License

MIT. Game assets must be original or CC0/CC-BY; see
`skills/await-arcade-game/reference/assets.md`.
