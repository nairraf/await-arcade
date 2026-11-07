# Await Arcade backend plan

The scaffold ships an in-memory verifier API in `packages/server`. This is the
plan for the real, cheap GCP backend.

## Recommendation

A **separate Firebase/GCP project** (never a production project that holds other user data):

- **Firestore Native** for players, runs, boards, and seasons.
- **Cloud Run** (TypeScript + Hono/Fastify) for the API and replay verification.
- **Firebase Anonymous Auth** for a frictionless first run.
- **GitHub Device Flow** for a durable, developer-friendly identity.
- **The shared game core on the server** to verify scores.

At hobby scale this is **$0/month**. At a few thousand daily players it is
roughly **$5–20/month**. Set a $5 budget alert.

Do not reuse another production project's service account. Await Arcade gets its
own least-privilege service account.

## Data model

| Collection | Key | Purpose |
|---|---|---|
| `players/{playerId}` | playerId | durable identity, display name, XP, status |
| `authUids/{uid}` | auth UID | maps an auth identity to a playerId |
| `games/{gameId}` | gameId | catalog, modes, score type, version |
| `runs/{runId}` | runId | issued seed, replay, verification result, TTL |
| `boards/{boardId}/entries/{playerId}` | boardId | public leaderboard entry |
| `players/{playerId}/bests/{boardId}` | boardId | personal best |
| `seasons/{seasonId}` | seasonId | optional season metadata |

Board ids:

```
minesweeper:expert:all
minesweeper:expert:daily:2026-11-07
await-arcade:xp:all
await-arcade:xp:season:2026-11
```

## API

```
POST /v1/auth/anonymous          Firebase Auth (or REST sign-in)
GET  /v1/games                   catalog
POST /v1/runs                    { gameId, modeId } -> { runId, seed, expiresAt }
POST /v1/runs/:id/submit         { replay } -> { score, best, rank }
GET  /v1/boards/:boardId         top 50 + your rank
GET  /v1/me                      profile, bests, XP, medals
PATCH /v1/me                     display name
POST /v1/link/start              link code for OpenCode <-> Antigravity
POST /v1/link/claim              merge the two auth UIDs onto one playerId
```

On submit, one Firestore transaction: check the run is issued and owned, verify
the replay, compare against the personal best, update if better, add XP, mark
the run verified. Idempotent on `runId`.

## Identity and recovery

Firebase anonymous UIDs are per install. They change on reinstall, sign-out, or
clearing app data, leaving an orphaned player.

Fix: **decouple the durable `playerId` from the ephemeral auth UID.**

- `players/{playerId}` owns scores and XP.
- `authUids/{uid}` maps a device credential to a player.
- On first run, create a player and show a **recovery code** once. Store only
  its hash.
- On reinstall or a new machine, enter the code to map the new UID to the old
  player.
- Linking GitHub is the durable upgrade: Firebase keeps the same UID when you
  `linkWithCredential`, so scores follow.
- Use GitHub **Device Flow**, not a popup: server `POST /login/device/code`,
  show `user_code`, poll, then link `githubId` to the player. No client secret,
  no redirect URI, works in Electron and webviews.
- Store the refresh token in the host's server half (OpenCode plugin server,
  Antigravity sidecar data dir), never in the renderer/webview. The Antigravity
  sidecar origin can change with its assigned port, so browser storage is not a
  reliable session store.

Enable Firebase anonymous cleanup and mark dormant players; keep their board
entries. Don't delete a player doc that still owns scores.

## Arcade-wide leaderboard

Don't sum raw scores across games. Normalize:

- each verified run earns `base(difficulty) × performance`, clamped;
- only the best run per game per UTC day counts;
- arcade board = sum of best points per game + medals;
- medals: gold/silver/bronze by fixed thresholds or percentile.

That rewards breadth, not grinding one cabinet.

## Daily challenge

`seed = HMAC(secret, gameId + ":" + YYYY-MM-DD)`. One attempt, or best of three,
per player. Board `game:mode:daily:YYYY-MM-DD`. Same seed for everyone, replay
verified, nearly free.

## Cost

| Component | Free tier | Hobby | Notes |
|---|---|---|---|
| Firestore | 50k reads, 20k writes/day | ~5–20k reads/day | cache top boards 30s |
| Cloud Run | 2M requests, 180k vCPU-s, 360k GB-s/mo | far below | `min-instances=0`, `max-instances=2` |
| Firebase Auth | free at this scale | < 100 players | anonymous + GitHub |
| Egress | ~1 GB/month | well under | small JSON |

Cache each board's top 50 in Cloud Run memory for 30–60 seconds, set
`Cache-Control` on GETs, use `count()` for "your rank", and TTL `runs`.

## Deployment sketch

```sh
gcloud run deploy await-arcade-api \
  --source . \
  --region africa-south1 \
  --allow-unauthenticated \
  --max-instances 2 \
  --min-instances 0 \
  --memory 256Mi \
  --cpu 1 \
  --concurrency 80 \
  --timeout 10
```

- Firestore in the region closest to your players. The region is permanent.
- Cloud Run service account: `roles/datastore.user` only.
- Firestore rules: deny all client access; everything goes through the API.
- Budget alert at $5; per-player rate limits.

## What to build first

1. Cloud Run + Firestore + anonymous auth.
2. `minesweeper:expert:all`, submit + top 50 + personal best.
3. Daily board + arcade XP.
4. Replay verification (already implemented in `packages/framework`).
5. Game #2 on the same schema.
6. GitHub device flow + playerId recovery.
7. Async Missile Defense PvP; realtime Neon Cycles later.
