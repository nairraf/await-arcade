# Await Arcade

A tiny arcade that lives inside **OpenCode Desktop** and **Antigravity**.

Four deterministic cartridges ship today:

- **Mineflag** — turn-based minesweeper with safe first click, flood reveal,
  chording, keyboard play, and random or no-guess logic boards.
- **Neon Cycles** — endless grid light cycles against a sharper AI each level,
  plus local duel.
- **Mergegrid** — seeded tile merging with keyboard, swipe, and on-screen pad.
- **Brickstorm** — endless brick levels with varied layouts and rising speed.

The same shell, boards, daily challenge, XP, medals, and ghost practice work in
both hosts. Guest play is local. Signed-in play is replay-verified on the
hosted boards.

## Install

### Release installer

Download and extract the beta-2 tarball and checksum from the
[GitHub Releases page](https://github.com/nairraf/await-arcade/releases), then run
the installer:

```sh
shasum -a 256 -c await-arcade-beta-2.tar.gz.sha256
tar -xzf await-arcade-beta-2.tar.gz
node await-arcade-beta-2/install.mjs --verify
```

It installs both hosts, merges the Antigravity config, preserves existing auth
and local data, and points both hosts at `https://api.awaitarcade.com`.

Requirements: Node.js 22 or newer, plus OpenCode Desktop and/or Antigravity.
Antigravity's sidecar SDK is currently macOS-first.

Useful flags:

```sh
node await-arcade-beta-2/install.mjs --opencode-only
node await-arcade-beta-2/install.mjs --antigravity-only
node await-arcade-beta-2/install.mjs --home /tmp/arcade-test
node await-arcade-beta-2/install.mjs --dry-run
```

### From source

```sh
npm install
npm run build:hosts
AWAIT_ARCADE_API_URL=https://api.awaitarcade.com ./scripts/install-hosts.sh
```

The source installer symlinks the host packages into place. The release
installer copies self-contained files instead.

### Clean uninstall

Quit OpenCode and close the Antigravity pane first. From the extracted release:

```sh
node await-arcade-beta-2/install.mjs --uninstall --yes
```

This removes the OpenCode plugin, Antigravity sidecar, Antigravity config entry
and project, local auth, queue, and sidecar data. It does not delete your GitHub
account, host apps, or the repository. Add `--keep-data` to preserve local
auth/settings for a reinstall, or `--opencode-only` / `--antigravity-only` to
remove one host.

If the release folder is gone, remove
`~/.config/opencode/plugins/await-arcade` and
`~/.gemini/config/sidecars/await-arcade`, then remove the
`sidecars.await-arcade` entry from `~/.gemini/config/config.json`.

## Play

### OpenCode Desktop

The installer links the plugin as `await-arcade` under
`~/.config/opencode/plugins/`. It adds an **Await Arcade** side panel, a command,
and a titlebar pill. Restart OpenCode after installing or rebuilding:

```sh
opencode service restart
```

Sign in from the account panel. Each host keeps its own session, but both map to
the same player.

### Antigravity

The installer creates
`~/.gemini/config/sidecars/await-arcade`, writes a local `sidecar.json`, and
adds this to `~/.gemini/config/config.json`:

```json
{
  "sidecars": {
    "await-arcade": {
      "enabled": true,
      "projectId": "…",
      "schemaVersion": 1
    }
  }
}
```

Open the **await-arcade** project and the **Await Arcade** aux-pane view. Close
and reopen the pane after a rebuild.

### Sign-in

Ranked play uses GitHub Device Flow. Enter the short code at
`github.com/login/device`. Guest play works without an account and keeps local
bests only.

## Add a cartridge

Adding a game should be one folder and one sync:

```sh
npm run aa -- new-game my-game
```

That copies the template from `skills/await-arcade-game/templates/game`,
replaces the id/title, and regenerates the shell and server registries. Then
read `skills/await-arcade-game/SKILL.md`.

A cartridge looks roughly like:

```text
games/my-game/
  arcade.config.ts     game metadata and modes
  src/
    core.ts            pure state machine and scoring
    view.ts            DOM or canvas rendering and input
    meta.ts            generated/exported GameMeta
    core.test.ts       determinism and scoring tests
  replay.json          optional fixture checked by `aa check`
```

The rule that matters: **`core.ts` is pure and deterministic**. It uses the
seeded RNG and injected time; no `Math.random`, `Date.now`, DOM, network,
storage, or host services. `view.ts` owns rendering and input. The server
imports only the core, replays the input log, and derives the score.

Useful commands:

```sh
npm run aa -- new-game my-game
npm run aa -- check                 # core scan + replay fixtures
npm run aa -- verify my-game path/to/replay.json
npm run aa -- sync                  # regenerate registries after adding a game
npm test
npm run typecheck
```

## Develop

```sh
npm install
npm run dev        # browser demo at http://localhost:5199
npm run check      # typecheck, host typecheck, tests, core scan, fixtures
npm run build      # browser demo
npm run build:hosts
```

`npm run build:hosts` builds:

- `packages/host-opencode/gui-experimental.cjs` and `dist/server.js`
- `packages/host-antigravity/index.html` and `dist-server/server.mjs`

Build the hosts after changing the shell, framework, or games.

To produce a release tarball:

```sh
npm run package:release
```

This writes `dist-release/await-arcade-beta-2.tar.gz`, its checksum, and the
unpacked release directory containing `install.mjs`.

## How it fits together

```text
contract ── framework ── shell ── host-opencode
                    \             host-antigravity
                     \── games (core + view)
```

- **contract** — the `GameCore` / `GameView` boundary and shared types.
- **framework** — fixed-timestep runner, seeded RNG, surfaces, replay verifier,
  testkit.
- **shell** — launcher, HUD, leaderboard hub, daily tile, XP/medals, ghost
  practice, local host.
- **games** — pure deterministic cores plus host-agnostic views.
- **hosts** — thin OpenCode and Antigravity adapters. They own identity,
  sessions, and submission; games never see tokens or raw network access.

The shell is the product; games are content. One generated registry loads every
cartridge in both hosts.

## Hosted play (short version)

The hosted verifier issues seeds, verifies replay input logs, and serves the
shared boards, daily challenge, XP, medals, and ghost descriptors. The API is
`https://api.awaitarcade.com`; the public site is
`https://awaitarcade.com`.

Guest play needs no backend. Ranked play needs GitHub sign-in. Backend design,
storage, rate limits, and deployment live in `docs/backend.md`.

## Docs and skill

- `docs/architecture.md` — layers, contract, determinism, replay verification.
- `docs/hosts.md` — the two host models and their constraints.
- `docs/backend.md` — hosted verifier, storage, identity, costs.
- `docs/roadmap.md` — beta scope and later milestones.
- `skills/await-arcade-game/` — the executable game-authoring guide.
- `site/` — landing page and policy drafts.
- `CONTRIBUTING.md` — contribution and review expectations.

## License

MIT. Game assets must be original or CC0/CC-BY; see
`skills/await-arcade-game/reference/assets.md`.
