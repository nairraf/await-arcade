import { randomUUID } from "node:crypto"
import { createHostSession } from "@await-arcade/api-client"
import { Api } from "./src/rpc.js"

/**
 * OpenCode server part.
 *
 * The renderer calls this over RPC. This half owns the API client, the player
 * identity, and the GitHub session; the renderer never sees a token.
 */
const QUEUE_KEY = "submit.queue"
const HOST = "opencode"

export default {
  id: "await-arcade",
  async setup(ctx) {
    let playerId = await ctx.storage.get("playerId")
    if (typeof playerId !== "string" || !playerId) {
      playerId = randomUUID()
      await ctx.storage.set("playerId", playerId)
    }

    const session = createHostSession({
      host: HOST,
      playerId,
      readQueue: async () => (await ctx.storage.get(QUEUE_KEY)) ?? [],
      writeQueue: async (items) => {
        await ctx.storage.set(QUEUE_KEY, items)
      },
    })

    await ctx.rpc.register(Api, {
      start: (input) => session.start(input.gameId, input.modeId),
      submit: (input) => session.submit(input.runId, input.replay),
      best: (input) => session.best(input.gameId, input.modeId),
      board: (input) => session.board(input.gameId, input.modeId),
      playerBest: (input) => session.playerBest(input.gameId, input.modeId),
      daily: () => session.daily(),
      dailyStart: async (input) => {
        try {
          return await session.dailyStart(input.challengeId)
        } catch (error) {
          if (String(error?.message ?? "").includes("sign-in")) {
            return { ok: false, error: "Sign in again to play the daily." }
          }
          throw error
        }
      },
      dailyBoard: (input) => session.dailyBoard(input.challengeId),
      ghost: (input) => session.ghost(input.ghostId),
      profile: () => session.profile(),
      status: () => session.status(),
      authStatus: () => session.status(),
      authStart: () => session.authStart(),
      authPoll: (input) => session.authPoll(input.flowId),
      authSignOut: () => session.authSignOut(),
      deleteAccount: () => session.deleteAccount(),
      updateName: (input) => session.updateName(input.displayName),
      nameAvailable: (input) => session.nameAvailable(input.displayName),
    })
  },
}
