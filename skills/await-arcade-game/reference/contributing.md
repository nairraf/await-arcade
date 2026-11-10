# Contributing and review

## Adding a cartridge

1. Fork and branch.
2. `npm run aa -- new-game <id>`
3. Implement, test, and run `npm run check`.
4. Add a `replay.json` fixture.
5. Open a PR with the template.

## What reviewers check

- The game is fun for 30 seconds and has a clear fail state.
- `core.ts` is pure and deterministic.
- The replay fixture verifies.
- The score is derived from state, not trusted.
- Keyboard, pause, mute, and reduced motion work.
- Assets are original or licensed; naming is trademark-safe.
- Bundle size and frame rate are reasonable.
- `meta.version` reflects rule changes.

## Ownership

- `CODEOWNERS` maps `games/<id>/` to the game's author.
- Framework changes need a framework maintainer.
- A game can land as `status: "experimental"` and live in Labs before it is
  promoted to `stable`.

## Release

- Semver for the framework and for each game.
- A game's replay fixture is tied to `meta.version`; bump it when rules change.
- The arcade release bundles the curated games. Runtime third-party game
  loading is a separate, sandboxed problem; don't mix it into the native panel.

## Security

- Games never see auth tokens or raw network access.
- Scores are submitted by the shell, not the game.
- No `eval`, no dynamic code execution in a core.
- Sanitize display names; render them with `textContent`.
- Report vulnerabilities through `SECURITY.md`.
