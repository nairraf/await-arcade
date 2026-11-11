# Await Arcade

Await Arcade is a tiny cross-host arcade for OpenCode Desktop and Antigravity.

Four cartridges ship in the scaffold:

- **Mineflag** — turn-based, safe first click, flood reveal, chording,
  keyboard play, three difficulties in random or no-guess logic boards,
  replay-verified fewest-moves ranking.
- **Neon Cycles** — endless grid light cycles against a sharper AI each level,
  plus local duel; a canvas reference implementation.
- **Mergegrid** — seeded tile merging, keyboard/swipe/on-screen pad, a DOM
  reference implementation with score-attack ranking.
- **Brickstorm** — endless brick levels with varied layouts, rising speed, and
  more gold armor per wall.

The point is the framework: the shell is the product, games are content. Adding
a cartridge should be one folder plus `npm run aa -- sync`.

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
- ✅ All-time leaderboard hub and the featured daily challenge: fixed seed,
  Mineflag anchor, three attempts, best-of-three board, and a daily tile.
- ✅ Arcade XP, medals, arcade rank, and unranked ghost practice in both hosts.
- ✅ Prod backend live on Cloud Run + Firestore. ⏳ Public site, custom domain, and packaged installer.

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
npm run aa -- verify mineflag games/mineflag/replay.json
```

## Layout

```
packages/
  contract/        types and the GameCore/GameView contract
  framework/       runner, seeded RNG, surface, replay verifier, testkit
  shell/           launcher, HUD, local host, styles, generated game registry
  server/          verifier API (in-memory for tests, Firestore on Cloud Run)
  host-opencode/   OpenCode Desktop GUI plugin
  host-antigravity/Antigravity sidecar
games/
  mineflag/        turn-based reference
  light-cycles/    canvas/realtime reference
  mergegrid/       DOM turn-based reference
  brickstorm/      canvas brick-buster with power bricks
tools/
  cli/             new-game, sync, verify, check
skills/
  await-arcade-game/ the executable contribution guide
apps/
  web/             Vite demo
site/              static landing and policy pages
firebase.json      Firebase Hosting config
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
AWAIT_ARCADE_API_URL=https://await-arcade-api-apxfi7nqna-nn.a.run.app \
  ./scripts/install-hosts.sh
```

`AWAIT_ARCADE_API_URL` is optional; without it the hosts use
`http://127.0.0.1:8787`, or the `apiUrl` in
`~/Library/Application Support/await-arcade/config.json`.

### OpenCode Desktop

The installer symlinks `packages/host-opencode` to
`~/.config/opencode/plugins/await-arcade`. The plugin id is `await-arcade`
(from `server.js`); it adds a pinned **Await Arcade** side panel, a command, and
a titlebar pill. `npm run build:hosts` writes both `gui-experimental.cjs` and
the bundled server half at `dist/server.js`. Rebuild after changing the shell,
framework, or games. If your plugin directory is not the default, set
`OPENCODE_PLUGINS_DIR` or add the absolute directory to `plugins` in
`~/.config/opencode/opencode.jsonc`.

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

- `npm run check` passes: workspace typecheck, OpenCode host typecheck, 73 tests,
  core determinism scan, and all four replay fixtures.
- `npm run build` builds the browser demo.
- `npm run build:hosts` builds `gui-experimental.cjs` and the Antigravity
  `index.html` + `app.js`.
- The Antigravity sidecar serves `/`, `/app.js`, and an empty `/app.css` on
  loopback.
- In the browser: the launcher renders, Mineflag reveals/floods, Neon Cycles
  runs and ends, Mergegrid merges tiles by keyboard/swipe/pad, Brickstorm follows
  pointer and keyboard paddle aim, the game-over overlay saves a personal best,
  and the best score survives a return to the launcher via `localStorage`.
- `aa new-game` scaffolds a working template game, and its test + `check`
  pass.

## Pick up here

The first tagged milestone is **beta-1**; the public release target is **beta-2**. See
`docs/roadmap.md` for scope, acceptance criteria, and what is deliberately out of scope.

1. ✅ Wire the shell's `GameHost.submit` to the verifier API:
   - OpenCode: a small RPC in `packages/host-opencode/server.js`; the server part
     owns `auth.opencode.json` in the native state directory.
   - Antigravity: proxy through `server.mjs`; store `auth.antigravity.json` in the
     native state directory. The sidecar data directory is for non-secret cache.
2. ✅ GitHub Device Flow + per-host persistent sessions; local guest mode;
   account deletion (see `docs/backend.md`).
3. ✅ Firestore + Cloud Run: the server keeps the in-memory store for tests and
   uses Firestore in production.
4. ✅ Featured daily challenge (fixed seed/anchor, 3 attempts, best of 3,
   separate board, daily tile). ✅ Unranked ghost practice and arcade XP/medals.
5. ⏳ Add the next cartridge from the skill; Missile Defense async PvP is the first
   multiplayer candidate.

## Website

The static site lives in `site/`. `firebase.json` deploys it to Firebase Hosting and rewrites
`/v1/**` to the production Cloud Run service. Policy pages in `site/` are beta-2 drafts for
review before launch. The preview is intentionally `noindex` until the custom domain is
attached and the policies are approved.

```sh
FIREBASE_ACCESS_TOKEN="$(gcloud auth application-default print-access-token)" \
  npm run deploy:hosting
```

`HOSTING_DRY_RUN=1` lists the files and converted Hosting config without uploading. The
Firebase CLI works too, but the REST script avoids an interactive login.

The custom domain `awaitarcade.com` will be attached in Firebase Hosting, not by Cloud Run
domain mapping (which is not available in `northamerica-northeast1`).

## Design docs

- `docs/architecture.md` — layers, contract, determinism, verification.
- `docs/roadmap.md` — beta-1/beta-2 scope, acceptance criteria, and later milestones.
- `docs/backend.md` — the cheap GCP plan: Firestore, Cloud Run, GitHub identity,
  per-host persistent sessions, boards, account deletion, arcade XP, costs.
- `docs/hosts.md` — the two host models and their constraints.
- `skills/await-arcade-game/` — the contributor skill.

## License

MIT. Game assets must be original or CC0/CC-BY; see
`skills/await-arcade-game/reference/assets.md`.
