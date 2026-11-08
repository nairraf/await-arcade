# Roadmap

## beta-1 — Hosted Arcade

**Goal:** turn the local scaffold into a real cross-host arcade: GitHub identity,
replay-verified leaderboards, a daily challenge, and both OpenCode and Antigravity
talking to the backend.

**In scope**

- **Host integration:** the shell submits and reads leaderboards through each host's
  server half. Local mode still works with no backend.
- **Identity:** local guest mode, GitHub Device Flow for ranked play, per-host
  persistent sessions (short-lived access token, 180-day rotating refresh token),
  and account deletion. Tokens stay in the host server halves, never the renderer.
- **Backend:** Firestore + Cloud Run, run issuance, replay verification, top boards,
  personal bests, rate limits, and a $5 budget alert.
- **Featured daily challenge + arcade XP:** one featured game per day, a fixed
  seed/anchor, three attempts consumed on start, best-of-three scoring, a separate
  daily board, and a cross-game XP/medal board that rewards breadth.
- **Ghost practice:** play a verified high-score run on the same seed/anchor as
  unranked practice; no board entry and no daily attempt consumed.
- **Visual system:** cartridge/cabinet shell, per-game accents, Auto/Light/Dark
  modes, and light/dark smoke tests on both hosts.
- **Release gate:** both hosts smoke-tested, CI green, security review done, docs
  updated, and `beta-1` tagged on `main`.

**Out of scope**

- Real-time PvP, async Missile Defense, or any multiplayer.
- Runtime third-party game loading; the registry stays build-time.
- A third cabinet; the two reference games are enough for beta-1.
- Mobile-specific polish beyond the responsive shell.
- Ranked ghost boards or per-player daily seeds.

**Acceptance criteria**

- A player can play locally without an account, sign in with GitHub once per host,
  and keep the same `playerId` across hosts.
- A host update or reinstall, or an Antigravity port change, does not require
  re-authentication.
- OpenCode and Antigravity submit a verified run and read the same top-50 board.
- A forged replay or a client-reported score cannot enter a board.
- The featured daily game rotates, uses one seed/anchor per day, allows three
  starts consumed on start, and scores the best of three on a separate board.
- A player can open a high-score run as unranked practice on the same board; it
  writes no board entry and consumes no daily attempt.
- The arcade reads correctly in light and dark modes for a DOM cabinet
  (Minesweeper) and a canvas cabinet (Neon Cycles).
- Arcade XP aggregates across games without one game dominating.
- Tokens never enter the renderer or webview.
- `DELETE /v1/me` removes the player, sessions, and board entries.
- Firestore rules deny client writes; rate limits and a budget alert are configured.

## Later

- Async **Missile Defense**: attacker builds a wave, defender plays it.
- Real-time **Neon Cycles** and **Pong**.
- More cabinets: Breakout, Space Invaders-like, 2048.
- A public game registry / marketplace only if a sandbox exists.

## How we work

- `main` is stable; `development` integrates unstable work.
- Feature branches start from `development`; PRs target `development`.
- `development` merges into `main` at a milestone, then the merge is tagged.

See `CONTRIBUTING.md` and `GOVERNANCE.md`.
