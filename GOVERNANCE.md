# Governance

## Roles

- **Framework maintainers** own `packages/contract`, `packages/framework`,
  `packages/shell`, `packages/server`, and the host adapters.
- **Game owners** own `games/<id>/` and are listed in `CODEOWNERS`.
- **Contributors** can propose games, report bugs, and improve docs.

## Decisions

- Framework changes need a framework maintainer approval.
- A game needs one game-owner approval and one framework review for contract or
  security changes.
- Game inclusion criteria are in `CONTRIBUTING.md`.
- A game can be `experimental` and live in Labs; promotion to `stable` is a
  maintainer decision.

## Releases

- Semver for the framework.
- Each game carries its own version; `meta.version` gates replay compatibility.
- The Await Arcade release bundles curated games. Runtime third-party games are out of
  scope for the native panel until a sandbox exists.

## Licensing

- Code: MIT.
- Assets: original or CC0/CC-BY, documented per game.
- Contributions require DCO sign-off.
