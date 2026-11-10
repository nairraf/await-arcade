export interface GitHubUser {
  readonly id: number
  readonly login: string
  readonly name?: string
  readonly avatarUrl?: string
}

export interface DeviceStart {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUri: string
  readonly interval: number
  readonly expiresAt: number
}

export type DevicePoll =
  | { readonly status: "pending"; readonly interval?: number; readonly slowDown?: boolean }
  | { readonly status: "complete"; readonly accessToken: string }
  | { readonly status: "expired" }
  | { readonly status: "denied" }

export interface GitHubClient {
  startDeviceFlow(): Promise<DeviceStart>
  pollDeviceFlow(deviceCode: string): Promise<DevicePoll>
  user(accessToken: string): Promise<GitHubUser>
}

export interface GitHubClientOptions {
  readonly clientId: string
  readonly fetchImpl?: typeof fetch
  readonly now?: () => number
}

const DEVICE_CODE_URL = "https://github.com/login/device/code"
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
const USER_URL = "https://api.github.com/user"

/**
 * GitHub Device Flow. The client secret is not used: per GitHub's docs, the
 * device flow authenticates with the client ID only.
 */
export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const now = options.now ?? Date.now

  if (typeof fetchImpl !== "function") {
    throw new Error("Await Arcade: no fetch for GitHub auth")
  }

  async function post(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    })
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok && json.error === undefined) {
      throw new Error(`GitHub auth failed: ${response.status} ${response.statusText}`)
    }
    return json
  }

  async function startDeviceFlow(): Promise<DeviceStart> {
    const json = await post(DEVICE_CODE_URL, {
      client_id: options.clientId,
      scope: "read:user",
    })

    if (typeof json.device_code !== "string" || typeof json.user_code !== "string") {
      throw new Error(`GitHub device flow failed: ${String(json.error ?? "missing codes")}`)
    }

    return {
      deviceCode: json.device_code,
      userCode: json.user_code,
      verificationUri:
        typeof json.verification_uri === "string"
          ? json.verification_uri
          : "https://github.com/login/device",
      interval: typeof json.interval === "number" ? json.interval : 5,
      expiresAt: now() + (typeof json.expires_in === "number" ? json.expires_in : 900) * 1000,
    }
  }

  async function pollDeviceFlow(deviceCode: string): Promise<DevicePoll> {
    const json = await post(ACCESS_TOKEN_URL, {
      client_id: options.clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    })

    if (typeof json.access_token === "string" && json.access_token.length > 0) {
      return { status: "complete", accessToken: json.access_token }
    }

    if (json.error === "authorization_pending") return { status: "pending" }
    if (json.error === "slow_down") {
      return {
        status: "pending",
        slowDown: true,
        ...(typeof json.interval === "number" ? { interval: json.interval } : {}),
      }
    }
    if (json.error === "expired_token") return { status: "expired" }
    if (json.error === "access_denied") return { status: "denied" }

    throw new Error(`GitHub device poll failed: ${String(json.error ?? "unknown error")}`)
  }

  async function user(accessToken: string): Promise<GitHubUser> {
    const response = await fetchImpl(USER_URL, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "await-arcade",
      },
    })
    if (!response.ok) {
      throw new Error(`GitHub user lookup failed: ${response.status} ${response.statusText}`)
    }

    const json = (await response.json()) as Record<string, unknown>
    if (typeof json.id !== "number" || typeof json.login !== "string") {
      throw new Error("GitHub user lookup returned an unexpected shape")
    }

    return {
      id: json.id,
      login: json.login,
      ...(typeof json.name === "string" && json.name.trim() ? { name: json.name } : {}),
      ...(typeof json.avatar_url === "string" ? { avatarUrl: json.avatar_url } : {}),
    }
  }

  return { startDeviceFlow, pollDeviceFlow, user }
}

export function githubClientFromEnv(): GitHubClient | undefined {
  const clientId = process.env.AWAIT_ARCADE_GITHUB_CLIENT_ID
  if (!clientId) return undefined
  return createGitHubClient({ clientId })
}
