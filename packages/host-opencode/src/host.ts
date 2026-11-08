import type { SubmitResult, RunResult } from "@await-arcade/contract"
import { LocalHost } from "@await-arcade/shell"
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

    if (result.best) {
      this.storage.set(`best.${run.gameId}.${run.modeId}`, result.best)
    }

    return result
  }
}
