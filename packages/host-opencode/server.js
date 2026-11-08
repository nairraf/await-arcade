import { randomUUID } from "node:crypto"
import { createArcadeClient } from "@await-arcade/api-client"
import { Api } from "./src/rpc.js"

/**
 * OpenCode server part.
 *
 * The renderer calls this over RPC. This half owns the API client and the
 * player identity; the renderer never sees a URL or (later) an auth token.
 */
const QUEUE_KEY = "submit.queue"

export default {
  id: "await-arcade",
  async setup(ctx) {
    let playerId = await ctx.storage.get("playerId")
    if (typeof playerId !== "string" || !playerId) {
      playerId = randomUUID()
      await ctx.storage.set("playerId", playerId)
    }

    const baseUrl = process.env.AWAIT_ARCADE_API_URL ?? "http://127.0.0.1:8787"
    const client = createArcadeClient({ baseUrl, playerId })
    const readQueue = async () => (await ctx.storage.get(QUEUE_KEY)) ?? []

    const flush = async () => {
      const items = await readQueue()
      if (items.length === 0) return
      const remaining = []
      for (const item of items) {
        try {
          await client.submit(item.runId, item.replay)
        } catch (error) {
          if (!(error?.status >= 400 && error?.status < 500)) remaining.push(item)
        }
      }
      await ctx.storage.set(QUEUE_KEY, remaining)
    }

    await ctx.rpc.register(Api, {
      start: async (input) => {
        await flush()
        return client.start(input.gameId, input.modeId)
      },
      submit: async (input) => {
        try {
          const result = await client.submit(input.runId, input.replay)
          await flush()
          return result
        } catch (error) {
          if (!(error?.status >= 400 && error?.status < 500)) {
            const items = await readQueue()
            items.push({ runId: input.runId, replay: input.replay, at: Date.now() })
            await ctx.storage.set(QUEUE_KEY, items.slice(-20))
          }
          throw error
        }
      },
      best: async (input) => ({ best: await client.bestFor(input.gameId, input.modeId) }),
      board: async (input) => client.board(input.gameId, input.modeId),
      status: async () => ({
        mode: "online",
        playerId,
        queued: (await readQueue()).length,
      }),
    })
  },
}
