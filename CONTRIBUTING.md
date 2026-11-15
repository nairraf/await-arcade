# Contributing

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

You do **not** need Firebase, Google Cloud, or GitHub OAuth credentials to build, playtest, or verify a game locally. Everything runs offline in your browser and local CLI.

1. **Propose the game (optional, recommended for new cartridges):** Open a `[Game]` issue using [.github/ISSUE_TEMPLATE/new-game.md](.github/ISSUE_TEMPLATE/new-game.md) to align on the loop, controls, scoring, and determinism before investing time building it.
2. **Fork, clone, and branch off `development`:**
   ```sh
   git clone https://github.com/<your-username>/await-arcade.git
   cd await-arcade
   git checkout -b feat/my-game development
   npm install
   ```

## Branching and releases

- `main` is the stable, public branch. Every commit should pass `npm run check`, `npm run build`, and `npm run build:hosts`.
- `development` is the integration branch for in-progress work. **Target `development` when opening PRs.**
- Feature branches start from `development` (`feat/...`, `fix/...`).
- Maintainers merge `development` into `main` at milestones, tag the release (`beta-1`, ...), deploy the hosted web app and Cloud Run verifier, and publish updated host bundles.
- Governance and release docs may land directly on `main`; everything else goes through a PR.

## Add a cartridge

### 1. Scaffold the files

```sh
npm run aa -- new-game my-game
npm install
```

`new-game` copies [skills/await-arcade-game/templates/game](skills/await-arcade-game/templates/game) into `games/my-game/`, replaces the id and title placeholders, and runs `npm run aa -- sync` to regenerate both [packages/shell/src/registry.generated.ts](packages/shell/src/registry.generated.ts) and [packages/server/src/registry.generated.ts](packages/server/src/registry.generated.ts). Running `npm install` afterward links `@await-arcade/game-my-game` in workspace `node_modules`.

### 2. Build manually or with an AI coding agent

Whether you write the game yourself or pair with an AI harness (Antigravity, OpenCode, Claude Code, Codex, Cursor, etc.), point yourself or your agent directly at **[skills/await-arcade-game/SKILL.md](skills/await-arcade-game/SKILL.md)** and its guides in `skills/await-arcade-game/reference/`:

> Tip for AI tools: Not every harness auto-discovers `skills/`. Explicitly reference `skills/await-arcade-game/SKILL.md` in your prompt so your agent follows the cartridge contract, determinism rules, visual guidelines, and testkit.

Keep these boundaries in mind while implementing `games/my-game/`:

1. `src/core.ts` is pure and deterministic (no `Math.random`, `Date.now`, DOM, storage, or network calls).
2. `src/view.ts` is the only place with DOM, canvas, audio, and input handling.
3. `score` derives from state on the core; `ranked` controls whether a run counts toward leaderboards.
4. Set `status: "experimental"` in `src/meta.ts` for new community cartridges so they launch in the shell's Labs tab first.

## Playtest, debug, and verify locally

### Play and debug in the browser

```sh
npm run dev
```

This starts Vite at `http://localhost:5199` using `LocalHost` (offline storage, no backend required). Use normal browser DevTools and hot reload to debug rendering, keyboard/mouse/touch controls, pause/restart, mute, and reduced-motion behavior.

### Capture and verify a real `replay.json`

1. Play a complete run in `npm run dev` until you reach the Game Over screen.
2. Click **Download replay** on the Game Over screen to save the recorded input log as JSON.
3. Verify that the core reproduces the exact run and score from the inputs alone:
   ```sh
   npm run aa -- verify my-game path/to/downloaded-replay.json
   ```
4. Once your gameplay and scoring are settled, save a verified run as `games/my-game/replay.json`.

### Run tests and pre-PR checks

Add unit and determinism tests in `games/my-game/src/core.test.ts` (using `playTurn` / `playRealtime` from `@await-arcade/framework`), then run the full local validation suite:

```sh
npm run aa -- sync
npm run check
npm run build
npm run build:hosts
```

Here is what `npm run check` validates before CI runs the same pipeline:

- `npm run typecheck` and `npm run typecheck:host` (workspace + OpenCode host TypeScript checks).
- `npm test` (Vitest suite across packages and games).
- `npm run aa -- check`, which scans pure files in `games/<id>/src/` (excluding `*.test.ts` and `*view.ts`) for banned globals (`Math.random`, `Date.now`, `performance.now`, `window.`, `document.`, `localStorage`, `fetch(`, `eval(`, `new Function`, `globalThis`, `setTimeout(`, `setInterval(`, `requestAnimationFrame(`) and verifies every `games/<id>/replay.json` fixture through `verifyReplay`.

If you also want to smoke-test the local HTTP verifier API against your replay, you can start it locally on `http://127.0.0.1:8787` with:

```sh
npm --workspace @await-arcade/server run dev
```

## Opening a PR and review

1. Sign off your commits with DCO (`git commit -s`).
2. Push your branch to your fork and open a PR targeting `development`, filling out [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md).
3. GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) automatically runs `npm ci`, `npm run check`, `npm run build`, and `npm run build:hosts`.
4. Maintainers review against the checklists below. Once merged into `development`, new cartridges are bundled into the web app, hosted verifier, and OpenCode/Antigravity host releases on the next `main` milestone release.

## Determinism checklist

- [ ] Seeded RNG only (`createRng`).
- [ ] No `Math.random`, `Date.now`, `performance.now`.
- [ ] No DOM, `window`, `document`, `fetch`, `localStorage` in `core.ts`.
- [ ] Realtime games use a fixed timestep.
- [ ] `serialize` is stable (sort sets/maps).
- [ ] `meta.version` bumped when rules or scoring change.

## Game review checklist

- [ ] Fun for 30 seconds; clear fail state; instant restart.
- [ ] Keyboard playable; pause; mute; reduced-motion respected.
- [ ] Score is derived from state, not trusted from the client.
- [ ] Replay fixture verifies (`npm run aa -- verify <id> games/<id>/replay.json`).
- [ ] Original or CC0/CC-BY assets; `LICENSES.md` if assets ship.
- [ ] Trademark-safe name and art.
- [ ] Bundle size and frame rate are reasonable.
- [ ] No network calls from the game core.
- [ ] `npm run check`, `npm run build`, and `npm run build:hosts` pass.

## Ownership

- `CODEOWNERS` maps `games/<id>/` to the game author.
- Framework changes need a framework maintainer.
- A cartridge can land as `status: "experimental"` and live in Labs before it is
  promoted to `stable`.

## Commits and licensing

- Sign off commits: `git commit -s` (DCO).
- Code is MIT. Assets must be original or CC0/CC-BY; no ripped sprites, fonts,
  or music.
- Don't copy code from a game you don't have the rights to.

## What not to send

- Runtime third-party game loading in the native panel. That is a separate
  sandboxing problem.
- Games that call the network directly.
- Games that read auth tokens.
- Games that require a paid service or an account.
