import { LocalHost, normaliseBoard } from "@await-arcade/shell"
import type {
  AgentAttentionEvent,
  ArcadeProfile,
  AuthPoll,
  AuthState,
  BoardEntry,
  DailyChallenge,
  DailyStart,
  DeviceFlow,
  GhostRun,
  RunResult,
  Score,
  SubmitResult,
} from "@await-arcade/contract"

interface SidecarBridge {
  readonly conversationId?: string | null
  fetch(input: string, init?: RequestInit): Promise<Response>
}

type SidecarWindow = Window & { sidecar?: SidecarBridge }

interface AttentionPollResponse {
  readonly seq?: number
  readonly event?: AgentAttentionEvent
}

/**
 * The Antigravity side of the game host. The webview only talks to the local
 * sidecar; the sidecar owns the API client and the player identity.
 */
export class SidecarHost extends LocalHost {
  private readonly attentionListeners = new Set<(event: AgentAttentionEvent) => void>()
  private attentionAbort: AbortController | undefined

  constructor() {
    super({ prefix: "antigravity", name: "antigravity" })
  }

  private async call<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const bridge = (window as SidecarWindow).sidecar
    const init: RequestInit = { method: "POST", body: JSON.stringify(body), ...(signal ? { signal } : {}) }
    const response = bridge ? await bridge.fetch(path, init) : await fetch(path, init)
    const json = (await response.json().catch(() => ({}))) as { error?: string; reason?: string }

    if (!response.ok) {
      const error = new Error(json.error ?? json.reason ?? `${response.status} ${response.statusText}`)
      ;(error as Error & { status?: number }).status = response.status
      throw error
    }
    return json as T
  }

  onAgentAttention(listener: (event: AgentAttentionEvent) => void): () => void {
    this.attentionListeners.add(listener)
    if (this.attentionListeners.size === 1) this.startAttentionLoop()
    return () => {
      this.attentionListeners.delete(listener)
      if (this.attentionListeners.size === 0) {
        this.attentionAbort?.abort()
        this.attentionAbort = undefined
      }
    }
  }

  private startAttentionLoop(): void {
    this.attentionAbort?.abort()
    const controller = new AbortController()
    this.attentionAbort = controller
    const conversationId =
      (window as SidecarWindow).sidecar?.conversationId ??
      new URLSearchParams(window.location.search).get("conversationId") ??
      ""

    void (async () => {
      let afterSeq: number | undefined
      while (!controller.signal.aborted && this.attentionListeners.size > 0) {
        try {
          const res = await this.call<AttentionPollResponse>(
            "/api/attention",
            {
              ...(afterSeq !== undefined ? { afterSeq } : {}),
              ...(conversationId ? { conversationId } : {}),
            },
            controller.signal,
          )
          if (typeof res.seq === "number") afterSeq = res.seq
          if (res.event) {
            for (const listener of this.attentionListeners) listener(res.event)
          }
        } catch (error) {
          if (controller.signal.aborted) break
          const status = (error as { status?: number } | undefined)?.status
          if (status === 404 || status === 405) break
          await new Promise((resolve) => setTimeout(resolve, 1500))
        }
      }
    })()
  }

  async start(input: { gameId: string; modeId: string }): Promise<{ seed: number; runId?: string }> {
    return this.call<{ seed: number; runId?: string }>("/api/start", input)
  }

  override async submit(run: RunResult): Promise<SubmitResult> {
    if (!run.runId) return super.submit(run)

    const result = await this.call<SubmitResult>("/api/submit", {
      runId: run.runId,
      replay: run.replay,
    })

    if (result.best && !result.challengeId) {
      this.storage.set(`best.${run.gameId}.${run.modeId}`, result.best)
    }
    return result
  }

  async loadBest(gameId: string, modeId: string): Promise<Score | undefined> {
    const result = await this.call<{ best?: Score }>("/api/best", { gameId, modeId })
    return this.mergeBest(gameId, modeId, result.best)
  }

  async board(gameId: string, modeId: string): Promise<readonly BoardEntry[]> {
    const result = await this.call<{ entries?: unknown }>("/api/board", { gameId, modeId })
    return normaliseBoard(result.entries)
  }

  async playerBest(
    gameId: string,
    modeId: string,
  ): Promise<{
    score?: Score
    rank?: number
    playerId?: string
    xpRank?: number
  }> {
    return this.call<{
      score?: Score
      rank?: number
      playerId?: string
      xpRank?: number
      xpLevel?: number
    }>("/api/player-best", { gameId, modeId })
  }

  async daily(): Promise<DailyChallenge> {
    return this.call<DailyChallenge>("/api/daily", {})
  }

  async startDaily(challengeId: string): Promise<DailyStart> {
    const result = await this.call<DailyStart & { ok?: boolean; error?: string }>(
      "/api/daily-start",
      { challengeId },
    )
    if (result.ok === false) {
      throw new Error(result.error ?? "The daily challenge is unavailable.")
    }
    return result
  }

  async dailyBoard(challengeId: string): Promise<readonly BoardEntry[]> {
    const result = await this.call<{ entries?: unknown }>("/api/daily-board", {
      challengeId,
    })
    return normaliseBoard(result.entries)
  }

  async ghost(ghostId: string): Promise<GhostRun> {
    return this.call<GhostRun>("/api/ghost", { ghostId })
  }

  async profile(): Promise<ArcadeProfile> {
    return this.call<ArcadeProfile>("/api/profile", {})
  }

  async authState(): Promise<AuthState> {
    return this.call<AuthState>("/api/auth/status", {})
  }

  async authStart(): Promise<DeviceFlow> {
    return this.call<DeviceFlow>("/api/auth/start", {})
  }

  async authPoll(flowId: string): Promise<AuthPoll> {
    return this.call<AuthPoll>("/api/auth/poll", { flowId })
  }

  async signOut(): Promise<AuthState> {
    return this.call<AuthState>("/api/auth/signout", {})
  }

  async deleteAccount(): Promise<AuthState> {
    return this.call<AuthState>("/api/auth/delete", {})
  }

  async updateName(displayName: string): Promise<AuthState> {
    return this.call<AuthState>("/api/auth/name", { displayName })
  }

  async nameAvailable(
    displayName: string,
  ): Promise<{ name?: string; available: boolean }> {
    return this.call<{ name?: string; available: boolean }>(
      "/api/auth/name-available",
      { displayName },
    )
  }
}
