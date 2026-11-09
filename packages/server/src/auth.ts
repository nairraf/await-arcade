import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { GitHubClient } from "./github"
import { nameKey, type AccessTokenRecord, type ArcadeStore, type AuthFlow, type PlayerRecord, type SessionRecord } from "./store"

export interface PublicPlayer {
  readonly playerId: string
  readonly displayName: string
  readonly githubLogin?: string
  readonly avatarUrl?: string
}

export interface AuthTokens {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly player: PublicPlayer
}

export interface AuthConfig {
  readonly accessTtlMs?: number
  readonly refreshTtlMs?: number
  /** How long the immediately previous refresh token may still be used. */
  readonly refreshGraceMs?: number
  readonly now?: () => number
}

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "AuthError"
  }
}

const ACCESS_TTL_MS = 15 * 60 * 1000
const REFRESH_TTL_MS = 180 * 24 * 60 * 60 * 1000
const REFRESH_GRACE_MS = 5 * 60 * 1000

function token(): string {
  return randomBytes(32).toString("base64url")
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export class AuthService {
  private readonly store: ArcadeStore
  private readonly github: GitHubClient
  private readonly accessTtlMs: number
  private readonly refreshTtlMs: number
  private readonly refreshGraceMs: number
  private readonly now: () => number
  private readonly activePolls = new Set<string>()

  constructor(store: ArcadeStore, github: GitHubClient, config: AuthConfig = {}) {
    this.store = store
    this.github = github
    this.accessTtlMs = config.accessTtlMs ?? ACCESS_TTL_MS
    this.refreshTtlMs = config.refreshTtlMs ?? REFRESH_TTL_MS
    this.refreshGraceMs = config.refreshGraceMs ?? REFRESH_GRACE_MS
    this.now = config.now ?? Date.now
  }

  private publicPlayer(player: PlayerRecord): PublicPlayer {
    return {
      playerId: player.playerId,
      displayName: player.displayName,
      ...(player.githubLogin !== undefined ? { githubLogin: player.githubLogin } : {}),
      ...(player.avatarUrl !== undefined ? { avatarUrl: player.avatarUrl } : {}),
    }
  }

  private async issueAccess(
    session: SessionRecord,
    player: PlayerRecord,
  ): Promise<{ accessToken: string; expiresAt: number }> {
    const at = this.now()
    const accessToken = token()
    const record: AccessTokenRecord = {
      hash: hash(accessToken),
      playerId: player.playerId,
      sessionId: session.sessionId,
      expiresAt: at + this.accessTtlMs,
      createdAt: at,
    }
    await this.store.putAccessToken(record)
    return { accessToken, expiresAt: record.expiresAt }
  }

  private async issue(player: PlayerRecord, host: string): Promise<AuthTokens> {
    const at = this.now()
    const refreshToken = token()
    const session: SessionRecord = {
      sessionId: randomBytes(16).toString("hex"),
      playerId: player.playerId,
      host,
      refreshHash: hash(refreshToken),
      refreshExpiresAt: at + this.refreshTtlMs,
      createdAt: at,
      lastUsedAt: at,
    }
    await this.store.putSession(session)
    const access = await this.issueAccess(session, player)

    return {
      accessToken: access.accessToken,
      refreshToken,
      expiresAt: access.expiresAt,
      player: this.publicPlayer(player),
    }
  }

  async start(
    host: string,
  ): Promise<{ flowId: string; userCode: string; verificationUri: string; interval: number; expiresAt: number }> {
    const device = await this.github.startDeviceFlow()
    const flow: AuthFlow = {
      flowId: randomBytes(16).toString("hex"),
      deviceCode: device.deviceCode,
      userCode: device.userCode,
      verificationUri: device.verificationUri,
      interval: device.interval,
      expiresAt: device.expiresAt,
      host,
      createdAt: this.now(),
    }
    await this.store.putFlow(flow)

    return {
      flowId: flow.flowId,
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      interval: flow.interval,
      expiresAt: flow.expiresAt,
    }
  }

  async poll(
    flowId: string,
  ): Promise<{ status: "pending"; interval: number } | ({ status: "complete" } & AuthTokens)> {
    if (this.activePolls.has(flowId)) {
      return { status: "pending", interval: 5 }
    }
    this.activePolls.add(flowId)

    try {
      const flow = await this.store.getFlow(flowId)
      if (!flow) throw new AuthError(404, "unknown sign-in flow")

      const at = this.now()
      if (at > flow.expiresAt) {
        await this.store.deleteFlow(flowId)
        throw new AuthError(410, "sign-in flow expired")
      }

      // Enforce GitHub's polling interval even if a client ignores it.
      if (flow.lastPolledAt !== undefined && at - flow.lastPolledAt < flow.interval * 1000) {
        return { status: "pending", interval: flow.interval }
      }
      flow.lastPolledAt = at
      await this.store.putFlow(flow)

      const result = await this.github.pollDeviceFlow(flow.deviceCode)

      if (result.status === "pending") {
        const nextInterval = result.interval ?? (result.slowDown ? flow.interval + 5 : flow.interval)
        if (nextInterval !== flow.interval) {
          flow.interval = nextInterval
          await this.store.putFlow(flow)
        }
        return { status: "pending", interval: flow.interval }
      }

      if (result.status === "expired") {
        await this.store.deleteFlow(flowId)
        throw new AuthError(410, "sign-in flow expired")
      }

      if (result.status === "denied") {
        await this.store.deleteFlow(flowId)
        throw new AuthError(403, "GitHub sign-in was cancelled")
      }

      const githubUser = await this.github.user(result.accessToken)
      const now = this.now()
      const displayName = githubUser.name?.trim() || githubUser.login
      const candidate: PlayerRecord = {
        playerId: randomUUID(),
        providerId: `github:${githubUser.id}`,
        displayName,
        nameKey: nameKey(displayName),
        createdAt: now,
        updatedAt: now,
        githubLogin: githubUser.login,
        ...(githubUser.avatarUrl !== undefined ? { avatarUrl: githubUser.avatarUrl } : {}),
      }

      const player = await this.store.ensurePlayer(candidate.providerId, candidate)
      await this.store.deleteFlow(flowId)

      return { status: "complete", ...(await this.issue(player, flow.host)) }
    } finally {
      this.activePolls.delete(flowId)
    }
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    if (typeof refreshToken !== "string" || refreshToken.length < 20) {
      throw new AuthError(400, "refreshToken is required")
    }

    const presented = hash(refreshToken)
    const session = await this.store.findSessionByRefresh(presented)
    if (!session) throw new AuthError(401, "invalid refresh token")
    if (this.now() > session.refreshExpiresAt) {
      await this.store.deleteSession(session.sessionId)
      await this.store.deleteAccessTokensForSession(session.sessionId)
      throw new AuthError(401, "refresh token expired")
    }

    const player = await this.store.getPlayer(session.playerId)
    if (!player) {
      await this.store.deleteSession(session.sessionId)
      await this.store.deleteAccessTokensForSession(session.sessionId)
      throw new AuthError(401, "player no longer exists")
    }

    const at = this.now()
    const nextRefresh = token()
    const rotated = await this.store.rotateSession(session.sessionId, {
      presentedHash: presented,
      refreshHash: hash(nextRefresh),
      refreshExpiresAt: at + this.refreshTtlMs,
      previousRefreshValidUntil: at + this.refreshGraceMs,
      now: at,
    })
    if (!rotated) throw new AuthError(401, "refresh token was already used")

    const access = await this.issueAccess(rotated, player)
    return {
      accessToken: access.accessToken,
      refreshToken: nextRefresh,
      expiresAt: access.expiresAt,
      player: this.publicPlayer(player),
    }
  }

  async authenticate(accessToken: string): Promise<{ token: AccessTokenRecord; player: PlayerRecord }> {
    const record = await this.store.getAccessToken(hash(accessToken))
    if (!record) throw new AuthError(401, "invalid access token")

    const session = await this.store.getSession(record.sessionId)
    if (!session || session.playerId !== record.playerId || this.now() > session.refreshExpiresAt) {
      await this.store.deleteAccessTokensForSession(record.sessionId)
      throw new AuthError(401, "session is no longer valid")
    }

    const player = await this.store.getPlayer(record.playerId)
    if (!player) {
      await this.store.deleteAccessTokensForSession(record.sessionId)
      throw new AuthError(401, "player no longer exists")
    }
    return { token: record, player }
  }

  async signOut(token: AccessTokenRecord): Promise<void> {
    await this.store.deleteSession(token.sessionId)
    await this.store.deleteAccessTokensForSession(token.sessionId)
  }

  async deleteAccount(player: PlayerRecord, boardIds: readonly string[] = []): Promise<void> {
    await this.store.deletePlayerData(player.playerId, player.providerId, boardIds)
  }

  async updateDisplayName(player: PlayerRecord, displayName: string): Promise<PublicPlayer> {
    const updated = await this.store.updatePlayerName(player.playerId, displayName)
    return this.publicPlayer(updated ?? player)
  }

  me(player: PlayerRecord): PublicPlayer {
    return this.publicPlayer(player)
  }
}
