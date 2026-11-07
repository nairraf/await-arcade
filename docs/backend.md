# Await Arcade backend plan

The scaffold ships an in-memory verifier API in `packages/server`. This is the
plan for the real, cheap GCP backend.

## Recommendation

A **separate Firebase/GCP project** (never a production project that holds other user data):

- **Firestore Native** for players, providers, sessions, runs, boards, and bests.
- **Cloud Run** (TypeScript + Hono/Fastify) for the API, replay verification, and
  session validation.
- **GitHub Device Flow** for ranked play; local guest mode for no-account play.
- **Server-issued sessions**: a short-lived access token in host memory and a
  180-day rotating refresh token, hashed in Firestore and persisted by the host.
- **The shared game core on the server** to verify scores.

No Firebase Auth. The host server halves already proxy every API call, GitHub is
the only provider for beta-1, and a custom `playerId` avoids anonymous-UID
lifecycle problems. Keep the auth surface small.

At hobby scale this is **$0/month**. At a few thousand daily players it is
roughly **$5–20/month**. Set a $5 budget alert.

Do not reuse another production project's service account. Await Arcade gets its
own least-privilege service account.

## Data model

| Collection | Key | Purpose |
|---|---|---|
| `players/{playerId}` | random UUID | durable identity, private numeric `githubId`, display name, XP, status |
| `providers/github:{numericId}` | provider ID | maps a GitHub account to a `playerId` |
| `sessions/{tokenHash}` | token hash | access/refresh session, player, host, expiry, last use |
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
POST /v1/auth/github/start        -> { flowId, userCode, verificationUri, interval, expiresAt }
POST /v1/auth/github/poll         { flowId } -> { status, accessToken?, refreshToken?, player? }
POST /v1/auth/refresh             { refreshToken } -> { accessToken, refreshToken, player }
POST /v1/auth/signout             revoke the current session
GET  /v1/games                    catalog
POST /v1/runs                     { gameId, modeId } -> { runId, seed, expiresAt }
POST /v1/runs/:id/submit          { replay } -> { score, best, rank }
GET  /v1/boards/:boardId          top 50 + your rank
GET  /v1/me                       profile, bests, XP, medals
PATCH /v1/me                      display name
DELETE /v1/me                     delete the player and all player-linked data
```

On submit, one Firestore transaction: check the run is issued and owned, verify
the replay, compare against the personal best, update if better, add XP, mark
the run verified. Idempotent on `runId`.

## Identity

### Guest vs ranked

- **Guest (default):** play immediately, local bests only, no server player, no
  account. This is the zero-friction path.
- **Ranked:** sign in with GitHub. The same GitHub account maps to the same
  `playerId` on every host and machine. Sign in once per host.

Guest local bests are not claimed/merged in beta-1; ranked runs start after
sign-in. A future “claim a local replay” flow can be added later.

### GitHub Device Flow

1. The host server calls `POST /v1/auth/github/start`; Cloud Run holds the
   GitHub OAuth app client secret and requests a device code from GitHub.
2. The UI shows `userCode` and opens `https://github.com/login/device`.
3. The host server polls `POST /v1/auth/github/poll`; Cloud Run polls GitHub.
4. On success, Cloud Run reads the numeric GitHub `id`, `login`, and display
   name, upserts `players` and `providers/github:{id}`, issues session tokens,
   and discards the GitHub access token. We never store or reuse it.
5. The host server stores the refresh token and keeps the access token in memory.

Use GitHub's numeric `id`, not the login; logins can change. The public board
shows only `playerId` and display name, never the GitHub ID or email.

### Session persistence

Auth lives in the host **server half**, never the renderer or webview. Use a
native per-user state directory:

| Platform | Default |
|---|---|
| macOS | `~/Library/Application Support/await-arcade/` |
| Linux | `${XDG_STATE_HOME:-~/.local/state}/await-arcade/` |
| Windows | `%LOCALAPPDATA%\await-arcade\` |
| Override | `AWAIT_ARCADE_STATE_DIR` |

Per-host files (`auth.opencode.json`, `auth.antigravity.json`), directory `0700`,
file `0600`, atomic writes. Each file holds `playerId`, `displayName`,
`refreshToken`, `host`, `createdAt`, and `lastUsedAt`.

- **Access token:** short-lived (about 15 minutes), memory only. Opaque, stored
  as a hash in `sessions`, with a small Cloud Run cache.
- **Refresh token:** 180 days, sliding, rotated on every use; only its hash is
  stored in Firestore. The host file holds the plaintext token.
- **Per-host sessions:** OpenCode and Antigravity each have their own refresh
  token, so they cannot rotate each other out. Both GitHub sign-ins map to the
  same `playerId`.
- **No re-auth on updates:** the state directory is outside the plugin bundle,
  the GUI, and the Antigravity sidecar data. A GUI update, plugin reinstall,
  host restart, or changed Antigravity port reads the same file and refreshes
  silently. Re-auth only when the file is deleted, the refresh token is
  revoked/expired, or the user signs out.
- **Sign-out:** delete that host's auth file, revoke the session, and return to
  guest mode.

### Account deletion (GDPR)

`DELETE /v1/me` requires a valid access token and deletes:

- the `players/{playerId}` document,
- the `providers/github:{numericId}` mapping,
- every `sessions` entry for the player (all hosts),
- every board entry and personal best for the player.

Then the host clears its local auth file and returns to guest mode. The GitHub
account is untouched. Beta-1 uses a hard delete; `runs` already have a TTL.

### Rejected alternatives

- **Anonymous ranked play + recovery code:** more surface (device secrets,
  recovery UX, orphan cleanup) for a feature we do not need. Local guest mode
  covers the no-account case.
- **Firebase Auth anonymous + link:** anonymous UID lifecycle/reinstall issues,
  MAU/quota, and a browser SDK, while every write already goes through the API.
- **A shared auth file across hosts:** refresh-token rotation races. Per-host
  sessions are simpler.
- **Storing auth in `.config`:** a refresh token is state, not configuration;
  the per-OS state directory is the right home.

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
- GitHub OAuth app client secret in Secret Manager, mounted as an env var.
- Firestore rules: deny all client access; everything goes through the API.
- Budget alert at $5; per-player rate limits.

## What to build first

1. Cloud Run + Firestore + a GitHub OAuth app with Device Flow enabled.
2. `minesweeper:expert:all`, submit + top 50 + personal best.
3. Daily board + arcade XP.
4. Replay verification (already implemented in `packages/framework`).
5. Game #2 on the same schema.
6. GitHub Device Flow + per-host persistent sessions + `DELETE /v1/me`.
7. Async Missile Defense PvP; realtime Neon Cycles later.
