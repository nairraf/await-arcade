import { LocalHost, normaliseBoard } from "@await-arcade/shell"
import type { BoardEntry, RunResult, Score, SubmitResult } from "@await-arcade/contract"

interface SidecarBridge {
  fetch(input: string, init?: RequestInit): Promise<Response>
}

type SidecarWindow = Window & { sidecar?: SidecarBridge }

/**
 * The Antigravity side of the game host. The webview only talks to the local
 * sidecar; the sidecar owns the API client and the player identity.
 */
export class SidecarHost extends LocalHost {
  constructor() {
    super({ prefix: "antigravity", name: "antigravity" })
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    const bridge = (window as SidecarWindow).sidecar
    const init: RequestInit = { method: "POST", body: JSON.stringify(body) }
    const response = bridge ? await bridge.fetch(path, init) : await fetch(path, init)
    const json = (await response.json().catch(() => ({}))) as { error?: string; reason?: string }

    if (!response.ok) {
      throw new Error(json.error ?? json.reason ?? `${response.status} ${response.statusText}`)
    }
    return json as T
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

    if (result.best) {
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
}
