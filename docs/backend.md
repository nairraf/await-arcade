# Await Arcade backend plan

The scaffold ships an in-memory verifier API in `packages/server`. This is the
plan for the real, cheap GCP backend.

## Recommendation

A **separate GCP project** (never a production project that holds other user data):

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

**Firestore does not require a Firebase project.** It is a normal GCP service,
created with `gcloud firestore databases create`. This backend talks to it with
the Admin SDK from Cloud Run, so the project intentionally stays a plain GCP
project and does not appear in the Firebase console. Adding Firebase
(`firebase projects:addfirebase`) is only needed for Firebase client SDKs, the
Firebase emulator, or deploying `firestore.rules` with the Firebase CLI. None of
those are required while every read and write goes through the API.

At hobby scale this is **$0/month**. At a few thousand daily players it is
roughly **$5–20/month**. Set a $5 budget alert.

Do not reuse another production project's service account. Await Arcade gets its
own least-privilege service account.

## Data model

| Collection | Key | Purpose |
|---|---|---|
| `players/{playerId}` | random UUID | durable identity, display name, provider link, XP, status |
| `providers/github:{numericId}` | provider ID | maps a GitHub account to a `playerId` |
| `sessions/{sessionId}` | random id | player, host, rotating refresh hash, previous-hash grace, expiry |
| `accessTokens/{tokenHash}` | token hash | short-lived access token, player, session, expiry |
| `challenges/{challengeId}` | derived from the date | not stored; the schedule and HMAC seed reproduce it |
| `challengeAttempts/{challengeId}__{playerId}` | composite | attempts used and update time |
| `games/{gameId}` | gameId | catalog, modes, score type, version |
| `runs/{runId}` | runId | issued seed/anchor, challenge, attempt, replay, verification, TTL |
| `ghosts/{ghostId}` | runId | seed/mode/anchor for unranked practice; deleted with the player |
| `xpDaily/{playerId}__{gameId}__{day}` | composite | best arcade XP per game per UTC day |
| `boards/{boardId}/entries/{playerId}` | boardId | public leaderboard entry |
| `players/{playerId}/bests/{boardId}` | boardId | personal best |
| `seasons/{seasonId}` | seasonId | optional season metadata |

Board ids:

```
mineflag:expert:all
mineflag:expert:daily:2026-11-07
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
GET  /v1/challenges/today         featured daily descriptor + attempts left
POST /v1/challenges/:id/runs      issue a run token (consumes an attempt)
GET  /v1/challenges/:id/board     daily board
GET  /v1/runs/:id/ghost           seed/mode/anchor for unranked ghost practice
POST /v1/runs                     { gameId, modeId } -> { runId, seed, expiresAt }
POST /v1/runs/:id/submit          { replay } -> { score, best?, rank?, xp?, challengeId? }
GET  /v1/boards/:gameId/:modeId         -> { entries, period }
GET  /v1/boards/:gameId/:modeId/player/:playerId -> { entry? (includes xpLevel, xpRank), rank? }
GET  /v1/me                       identity
GET  /v1/me/profile               arcade XP, level, medals, arcade rank
PATCH /v1/me                      display name
DELETE /v1/me                     delete the player and all player-linked data
```

Board GETs send `Cache-Control: public, max-age=30, s-maxage=30`; the
player-best GET sends `private, max-age=15`, except `/player/me`, which is
`no-store`. Everything else is `no-store`.
Board entries include `xpLevel` and `xpRank`: the player's arcade XP level and
global competition rank by total XP, enriched on read from a projection of the
`players` collection. Rows show `LVL n · Rn`; players with no XP have no
enrichment and no pill. The projection is cached in-process for 30 seconds; the
board response is separately cacheable for 30s.

On submit, one Firestore transaction: check the run is issued and owned, verify
the replay, retain the best XP for that game and UTC day, compare against the
personal best, update if better, and delete the run. Idempotent on `runId`; a
lost response retried after success returns 404 instead of double-awarding.

## Identity

### Guest vs ranked

- **Guest (default):** play immediately, local bests only, no server player, no
  account. This is the zero-friction path.
- **Ranked:** sign in with GitHub. The same GitHub account maps to the same
  `playerId` on every host and machine. Sign in once per host.

Guest local bests are not claimed/merged in beta-1; ranked runs start after
sign-in. A future “claim a local replay” flow can be added later.

### GitHub Device Flow

1. The host server calls `POST /v1/auth/github/start`; Cloud Run uses the OAuth
   app **client ID** (the device flow does not need the client secret) and
   requests a device code from GitHub.
2. The UI shows `userCode` and opens `https://github.com/login/device`.
3. The host server polls `POST /v1/auth/github/poll`; Cloud Run polls GitHub.
4. On success, Cloud Run reads the numeric GitHub `id`, `login`, and display
   name, upserts `players` and `providers/github:{id}`, issues session tokens,
   and discards the GitHub access token. We never store or reuse it.
5. The host server stores the refresh token and keeps the access token in memory.

The OAuth app must have Device Flow enabled. GitHub still requires a callback
URL in the registration form even though the device flow never redirects; any
valid HTTPS URL works (the repository URL is fine).

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

- **Access token:** short-lived (about 15 minutes), memory only. Opaque; only
  its SHA-256 hash is stored, in `accessTokens`. Refreshing does not revoke
  access tokens already handed out, so two hosts cannot invalidate each other.
- **Refresh token:** 180 days, sliding, rotated on every use; only its hash is
  stored in `sessions`. Rotation is a Firestore transaction, and the previous
  hash stays valid for five minutes so concurrent refreshes (two windows, or a
  host retry) do not destroy the session.
- **Per-host sessions:** OpenCode and Antigravity each have their own refresh
  token, so they cannot rotate each other out. Both GitHub sign-ins map to the
  same `playerId`.
- **No re-auth on updates:** the state directory is outside the plugin bundle,
  the GUI, and the Antigravity sidecar data. A GUI update, plugin reinstall,
  host restart, or changed Antigravity port reads the same file and refreshes
  silently. Re-auth only when the file is deleted, the refresh token is
  revoked/expired, or the user signs out.
- **Sign-out:** revoke the session and its access tokens, then delete that
  host's auth file. If revocation fails, the host does not report success; the
  local file stays so the user can retry.

### Account deletion (GDPR)

`DELETE /v1/me` requires a valid access token and deletes:

- the `players/{playerId}` document,
- the `providers/github:{numericId}` mapping,
- every `sessions` entry and `accessTokens` entry for the player (all hosts),
- pending `runs` for the player,
- the player's `ghosts` and `xpDaily` records,
- every board entry for the player.

Board parent documents are written on submit, so deletion can enumerate every
board without a collection-group index. Deletion uses Firestore's `BulkWriter`,
so it is not limited to a 500-write batch. Then the host clears its local auth
file and returns to guest mode. The GitHub account is untouched.

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
- medals are derived from retained records (First Credit, Spark, Silver, Gold,
  House Legend, Daily Devotee, Polymath).

That rewards breadth, not grinding one cartridge.

## Daily challenge

One **featured game per day**. A server-side schedule picks the game/mode; a
deterministic rotation is the fallback. The rotation walks every installed ranked
game/mode pair sorted by id (unranked modes such as local duel are excluded);
`AWAIT_ARCADE_DAILY_FEATURED=game:mode` overrides it for a manual pick.

`seed = HMAC(secret, gameId + ":" + YYYY-MM-DD)`. Mineflag also gets a fixed
**anchor** (the first-click cell) so the same seed produces the same board for
everyone; the first replay input must be that anchor. The server derives the
anchor from the core's board dimensions (board centre instead of a hardcoded
mode table). Logic variants generate boards until the no-guess solver clears
them, including from the daily anchor.

- **Secret:** `AWAIT_ARCADE_DAILY_SECRET` sets the HMAC key. The built-in fallback
  is public and dev-only; set a real value for production. The seed is not a
  credential (players receive it), but the key keeps the schedule opaque.
- **3 attempts per player.** The attempt is consumed atomically when the run
  token is issued (`POST /v1/challenges/:id/runs`), not on submit. Abandoned or
  expired runs still count; a fourth start is rejected with 429. This avoids the
  infinite cancel/restart loophole.
- **Active date only.** Run tokens are issued only for the current UTC date;
  submissions after the date rolls over return 410. Boards for past dates stay
  readable at `/v1/challenges/:id/board`.
- **Best of 3** is the player's daily board entry. A worse later attempt never
  lowers it.
- **Mineflag daily score:** a shared board makes the optimal move count
  identical, so the daily board is sorted by **moves, then server elapsed**
  (ascending). Attempts are shown as `try N` but do not affect the rank; the
  best of three can improve on a later attempt. Server elapsed is measured from
  run issuance to submit, so the replay cannot forge it. The board entry stores
  moves as `score.value` and a hidden `rankKey` (`moves|time`, fixed-width) for
  ordering; the UI shows `moves · time · try N`. All-time Mineflag also ranks
  moves.
- **Ranked only.** A run that the core marks unranked (for example, an
  unfinished Mineflag board) no longer writes a board entry, so a fast loss
  cannot beat a completed time.
- **Separate board:** `game:mode:daily:YYYY-MM-DD`. All-time boards keep using a
  fresh random seed per run.
- **Practice is possible once the seed is known.** Three attempts limit ranked
  submissions, not local practice; for a casual arcade this is acceptable. If it
  ever becomes a problem, per-player seeds are the alternative, but they remove
  the shared daily board.

## Ghost practice

A verified high-score run can be replayed as **unranked practice**:

- The board row exposes a **Practice** action that calls
  `GET /v1/runs/:id/ghost`, which returns the run's seed, mode, and anchor. It
  never returns the input log, tokens, or account data.
- The client starts a practice run with the same seed/anchor. It is clearly
  labeled **Practice**, writes no board entry, consumes no daily attempt, and
  needs no submission.
- A ghost record is written when a run becomes a personal best and is removed
  with the player's account.
- Mineflag first (same board); Neon Cycles can add a ghost trail later;
  Missile Command's wave plan becomes the ghost when that cartridge lands.

## Arcade XP, medals, and rank

- A ranked submit awards `base(difficulty) x performance`, clamped to 1–300:
  difficulty 1–5 gives a 20–100 base, a win multiplies by 3, and the daily
  carries a 1.5x bonus.
- Only the best XP for each game and UTC day is retained; improving that day's
  run adds the difference. Grinding the same cartridge does not farm XP.
- `GET /v1/me/profile` returns the total, level and title, the next level
  threshold, competition rank by total XP, per-cartridge totals, and medals.
- Levels: Rookie 0, Regular 250, Contender 750, Veteran 1,500, Champion 3,000,
  Legend 6,000, Arcade Immortal 10,000.
- Medals are derived from the retained records: First Credit, Spark (100),
  Silver (500), Gold (1,500), House Legend (3,000), Daily Devotee (seven UTC
  days), and Polymath (all four cartridges). Ghost practice never awards XP.

## Cost

| Component | Free tier | Hobby | Notes |
|---|---|---|---|
| Firestore | 50k reads, 20k writes/day | ~5–20k reads/day | cache top boards 30s |
| Cloud Run | 2M requests, 180k vCPU-s, 360k GB-s/mo | far below | `min-instances=0`, `max-instances=2` |
| Egress | ~1 GB/month | well under | small JSON |

Set `Cache-Control` on GETs, cache the XP projection in-process for 30s (and
invalidate it when XP is awarded), use `count()` for a single player's XP rank,
and TTL `runs`.

## Deployment sketch

The repo ships a `Dockerfile`, `packages/server/vite.server.config.ts`, the
Firestore store in `packages/server/src/firestore.ts`, and
`scripts/deploy-cloud-run.sh`. `npm run dev --workspace @await-arcade/server`
keeps using the in-memory store; the Cloud Run entry uses Firestore.

```sh
AWAIT_ARCADE_GITHUB_CLIENT_ID=<client-id> \
AWAIT_ARCADE_DAILY_SECRET=<random-string> \
  PROJECT_ID=await-arcade-dev ./scripts/deploy-cloud-run.sh
```

The script passes `--service-account`, so the revision runs as `arcade-api` with
`roles/datastore.user`, not the default Compute Engine account.

- Set `AWAIT_ARCADE_GITHUB_CLIENT_ID` to the OAuth app's client ID to enable
  sign-in. Without it the auth endpoints return 503; guest play still works.
- `AWAIT_ARCADE_DAILY_SECRET` sets the HMAC key for daily seeds. It is required
  when `NODE_ENV=production` (Cloud Run); the built-in fallback is dev-only.
  `AWAIT_ARCADE_DAILY_FEATURED=game:mode` pins one challenge and is optional.
- Ranked run issuance and submission require a session whenever the client ID is
  configured. `AWAIT_ARCADE_REQUIRE_AUTH=0` opts back into guest-ranked writes
  for local testing; don't use it in production.
- Firestore in `northamerica-northeast1` (Montreal), matching the existing
  Selos database. The region is permanent.
- Terraform owns the base resources; see `infra/terraform/README.md`.
- The GitHub OAuth client secret container exists in Secret Manager, but the
  device flow does not use it. It is reserved for a future web flow.
- Firestore rules in `firestore.rules` deny all client access; everything goes
  through the API. Deploy them with the Firebase CLI or the rules API.
- Budget alert at $5 (CAD); per-player rate limits are still open work.

## What to build first

1. Cloud Run + Firestore + a GitHub OAuth app with Device Flow enabled.
2. `mineflag:expert:all`, submit + top 50 + personal best.
3. Featured daily challenge (3 attempts, best of 3) + ghost practice + arcade XP.
   Daily challenge API, board, tile, anchored Mineflag run, ghost practice, and
   XP/medals/rank are in.
4. Replay verification (already implemented in `packages/framework`).
5. Game #2 on the same schema.
6. GitHub Device Flow + per-host persistent sessions + `DELETE /v1/me`.
7. Async Missile Defense PvP; realtime Neon Cycles later.
