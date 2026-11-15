import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import type { Replay } from "@await-arcade/contract"
import { apiUrl, createHostSession, stateDir } from "./index.js"

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "await-arcade-session-"))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe("host session queue", () => {
  it("queues an offline submit, retries once, and does not double-submit", async () => {
    let queue: Array<{ runId: string; replay: unknown; playerId?: string }> = []
    let submitCalls = 0
    let offline = true

    const fetchImpl = async (url: URL | RequestInfo) => {
      if (String(url).endsWith("/submit")) {
        submitCalls += 1
        if (offline) throw new Error("offline")
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    const session = createHostSession({
      host: "test",
      playerId: "queue-player",
      baseUrl: "http://arcade.test",
      stateDir: tempDir(),
      fetchImpl,
      readQueue: async () => [...queue],
      writeQueue: async (items: readonly unknown[]) => {
        queue = items as typeof queue
      },
    })

    const first = await session.submit("run-1", { inputs: [] } as unknown as Replay)
    expect(first).toMatchObject({ ok: false, queued: true })
    expect(queue).toHaveLength(1)
    expect(submitCalls).toBe(1)

    offline = false
    await session.flush()
    expect(queue).toHaveLength(0)
    expect(submitCalls).toBe(2)

    await session.flush()
    expect(queue).toHaveLength(0)
    expect(submitCalls).toBe(2)
  })

  it("isolates stateDir by appName and resolves apiUrl from custom stateDir", async () => {
    const dir = tempDir()
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiUrl: "https://dev.arcade.test" }))

    const prevState = process.env.AWAIT_ARCADE_STATE_DIR
    const prevApi = process.env.AWAIT_ARCADE_API_URL
    delete process.env.AWAIT_ARCADE_STATE_DIR
    delete process.env.AWAIT_ARCADE_API_URL
    try {
      expect(basename(stateDir("await-arcade-dev"))).toBe("await-arcade-dev")
      expect(apiUrl(dir)).toBe("https://dev.arcade.test")

      const calls: string[] = []
      const session = createHostSession({
        host: "test",
        playerId: "p1",
        stateDir: dir,
        fetchImpl: async (url) => {
          calls.push(String(url))
          return new Response(JSON.stringify({ mode: "online", playerId: "p1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        },
      })
      await session.profile()
      expect(calls[0]).toBe("https://dev.arcade.test/v1/me/profile")
    } finally {
      if (prevState !== undefined) process.env.AWAIT_ARCADE_STATE_DIR = prevState
      if (prevApi !== undefined) process.env.AWAIT_ARCADE_API_URL = prevApi
    }
  })
})
