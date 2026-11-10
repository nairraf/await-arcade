import type {
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
import { LocalHost, normaliseBoard } from "@await-arcade/shell"
import { Api } from "./rpc.js"

interface RpcClient {
  rpc(contract: any): any
}

/**
 * The OpenCode side of the game host. The shell runs in the renderer; this class
 * only forwards calls over RPC to the plugin server, which owns the API client
 * and any future auth token.
 */
export class OpenCodeHost extends LocalHost {
  constructor(private readonly client: RpcClient) {
    super({ prefix: "opencode", name: "opencode" })
  }

  async start(input: { gameId: string; modeId: string }): Promise<{ seed: number; runId?: string }> {
    const result = (await this.client.rpc(Api).start(input)) as { seed: number; runId?: string }
    return {
      seed: result.seed,
      ...(result.runId !== undefined ? { runId: result.runId } : {}),
    }
  }

  override async submit(run: RunResult): Promise<SubmitResult> {
    if (!run.runId) return super.submit(run)

    const result = (await this.client.rpc(Api).submit({
      runId: run.runId,
      replay: run.replay,
    })) as SubmitResult

    if (result.best && !result.challengeId) {
      this.storage.set(`best.${run.gameId}.${run.modeId}`, result.best)
    }

    return result
  }

  async loadBest(gameId: string, modeId: string): Promise<Score | undefined> {
    const result = (await this.client.rpc(Api).best({ gameId, modeId })) as { best?: Score }
    return this.mergeBest(gameId, modeId, result.best)
  }

  async board(gameId: string, modeId: string): Promise<readonly BoardEntry[]> {
    const result = (await this.client.rpc(Api).board({ gameId, modeId })) as {
      entries?: unknown
    }
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
    return (await this.client.rpc(Api).playerBest({ gameId, modeId })) as {
      score?: Score
      rank?: number
      playerId?: string
      xpRank?: number
    }
  }

  async daily(): Promise<DailyChallenge> {
    return (await this.client.rpc(Api).daily({})) as DailyChallenge
  }

  async startDaily(challengeId: string): Promise<DailyStart> {
    const result = (await this.client.rpc(Api).dailyStart({ challengeId })) as
      | (DailyStart & { readonly ok?: true })
      | { readonly ok: false; readonly error?: string }
    if (result.ok === false) {
      throw new Error(result.error ?? "The daily challenge is unavailable.")
    }
    return result
  }

  async dailyBoard(challengeId: string): Promise<readonly BoardEntry[]> {
    const result = (await this.client.rpc(Api).dailyBoard({ challengeId })) as {
      entries?: unknown
    }
    return normaliseBoard(result.entries)
  }

  async ghost(ghostId: string): Promise<GhostRun> {
    return (await this.client.rpc(Api).ghost({ ghostId })) as GhostRun
  }

  async profile(): Promise<ArcadeProfile> {
    return (await this.client.rpc(Api).profile({})) as ArcadeProfile
  }

  async authState(): Promise<AuthState> {
    return (await this.client.rpc(Api).authStatus({})) as AuthState
  }

  async authStart(): Promise<DeviceFlow> {
    return (await this.client.rpc(Api).authStart({})) as DeviceFlow
  }

  async authPoll(flowId: string): Promise<AuthPoll> {
    return (await this.client.rpc(Api).authPoll({ flowId })) as AuthPoll
  }

  async signOut(): Promise<AuthState> {
    return (await this.client.rpc(Api).authSignOut({})) as AuthState
  }

  async deleteAccount(): Promise<AuthState> {
    return (await this.client.rpc(Api).deleteAccount({})) as AuthState
  }

  async updateName(displayName: string): Promise<AuthState> {
    return (await this.client.rpc(Api).updateName({ displayName })) as AuthState
  }

  async nameAvailable(
    displayName: string,
  ): Promise<{ name?: string; available: boolean }> {
    return (await this.client.rpc(Api).nameAvailable({ displayName })) as {
      name?: string
      available: boolean
    }
  }
}
