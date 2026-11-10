# Contributing

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Branching and releases

- `main` is the stable, public branch. Every commit should pass `npm run check` and the host builds.
- `development` is the integration branch for unstable work.
- Feature branches start from `development` (`feat/...`, `fix/...`) and open PRs against `development`.
- Merge `development` into `main` only at a milestone, then tag the merge (`beta-1`, ...).
- Governance and release docs may land directly on `main`; everything else goes through a PR.

## Add a cartridge

```sh
npm install
npm run aa -- new-game my-game
```

The scaffold copies `skills/await-arcade-game/templates/game`, replaces the id and
title, and regenerates both registries.

Read `skills/await-arcade-game/SKILL.md` first. The short version:

1. `core.ts` is pure and deterministic.
2. `view.ts` is the only place with DOM/canvas/audio.
3. `score` derives from state; `ranked` says whether the run counts.
4. Add tests and, when stable, a `replay.json` fixture.
5. Run `npm run check`.
6. Open a PR with the template.

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
- [ ] Replay fixture verifies.
- [ ] Original or CC0/CC-BY assets; `LICENSES.md` if assets ship.
- [ ] Trademark-safe name and art.
- [ ] Bundle size and frame rate are reasonable.
- [ ] No network calls from the game core.
- [ ] `npm run check` passes.

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
