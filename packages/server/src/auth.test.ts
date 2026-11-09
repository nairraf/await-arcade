import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { playRealtime } from "@await-arcade/framework"
import { createArcadeServer, type ArcadeServer } from "./index"
import type { GitHubClient, GitHubUser } from "./github"
import { verifiers } from "./registry.generated"

let server: ArcadeServer
let base = ""
let signedIn = false
let clock = Date.now()
let githubUser: GitHubUser = {
  id: 42,
  login: "octocat",
  name: "The Octocat",
  avatarUrl: "https://example.test/a.png",
}

interface AuthTokens {
  status: string
  accessToken: string
  refreshToken: string
  player: { playerId: string; displayName: string }
}

const github: GitHubClient = {
  async startDeviceFlow() {
    return {
      deviceCode: "device-code",
      userCode: "ABCD-EFGH",
      verificationUri: "https://github.com/login/device",
      interval: 1,
      expiresAt: Date.now() + 900_000,
    }
  },
  async pollDeviceFlow() {
    if (!signedIn) return { status: "pending" }
    return { status: "complete", accessToken: "github-token" }
  },
  async user() {
    return githubUser
  },
}

async function post(path: string, body: unknown, token?: string) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function get(path: string, token?: string) {
  return fetch(`${base}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

async function signIn(): Promise<AuthTokens> {
  signedIn = true
  const started = (await post("/v1/auth/github/start", { host: "opencode" }).then((r) =>
    r.json(),
  )) as { flowId: string }
  return (await post("/v1/auth/github/poll", { flowId: started.flowId }).then((r) =>
    r.json(),
  )) as AuthTokens
}

async function playOne(token: string, playerId: string): Promise<string> {
  const run = (await post(
    "/v1/runs",
    { gameId: "light-cycles", modeId: "solo", playerId: "someone-else" },
    token,
  ).then((r) => r.json())) as { runId: string; seed: number; playerId: string }

  expect(run.playerId).toBe(playerId)

  const entry = verifiers["light-cycles"]!
  const result = playRealtime(entry.core, entry.meta, {
    seed: run.seed,
    mode: entry.meta.modes[0]!,
    ticks: 4000,
    inputs: [],
  })

  const submitted = (await post(
    `/v1/runs/${run.runId}/submit`,
    { replay: result.replay },
    token,
  ).then((r) => r.json())) as { ok: boolean }
  expect(submitted.ok).toBe(true)
  return playerId
}

beforeAll(async () => {
  server = createArcadeServer({ github, auth: { refreshGraceMs: 5_000, now: () => clock } })
  const port = await server.listen(0)
  base = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await server.close()
})

describe("GitHub device flow", () => {
  it("signs in, issues tokens, and binds runs to the session player", async () => {
    const started = (await post("/v1/auth/github/start", { host: "opencode" }).then((r) =>
      r.json(),
    )) as { flowId: string; userCode: string; verificationUri: string }
    expect(started.userCode).toBe("ABCD-EFGH")

    const pending = (await post("/v1/auth/github/poll", { flowId: started.flowId }).then((r) =>
      r.json(),
    )) as { status: string }
    expect(pending.status).toBe("pending")

    clock += 2_000
    signedIn = true
    const complete = (await post("/v1/auth/github/poll", {
      flowId: started.flowId,
    }).then((r) => r.json())) as AuthTokens

    expect(complete.status).toBe("complete")
    expect(complete.player.displayName).toBe("The Octocat")

    const me = (await get("/v1/me", complete.accessToken).then((r) => r.json())) as {
      player: { playerId: string; githubLogin: string }
    }
    expect(me.player.playerId).toBe(complete.player.playerId)
    expect(me.player.githubLogin).toBe("octocat")

    await playOne(complete.accessToken, complete.player.playerId)

    const refreshed = (await post("/v1/auth/refresh", {
      refreshToken: complete.refreshToken,
    }).then((r) => r.json())) as { accessToken: string; refreshToken: string }

    expect(refreshed.accessToken).toBeTruthy()
    expect(refreshed.refreshToken).not.toBe(complete.refreshToken)

    clock += 6_000
    const reused = await post("/v1/auth/refresh", { refreshToken: complete.refreshToken })
    expect(reused.status).toBe(401)

    const signedOut = await post("/v1/auth/signout", {}, refreshed.accessToken)
    expect(signedOut.status).toBe(204)

    const afterSignOut = await get("/v1/me", refreshed.accessToken)
    expect(afterSignOut.status).toBe(401)
  })

  it("updates the arcade name and existing board rows", async () => {
    githubUser = { id: 123, login: "rename-me", name: "Rename Me" }
    const tokens = await signIn()
    await playOne(tokens.accessToken, tokens.player.playerId)

    const renamed = await fetch(`${base}/v1/me`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify({ displayName: "Sir Mines" }),
    })
    expect(renamed.status).toBe(200)
    const renamedBody = (await renamed.json()) as {
      player: { displayName: string }
    }
    expect(renamedBody.player.displayName).toBe("Sir Mines")

    const me = (await get("/v1/me", tokens.accessToken).then((r) => r.json())) as {
      player: { displayName: string }
    }
    expect(me.player.displayName).toBe("Sir Mines")

    const board = (await get("/v1/boards/light-cycles/solo").then((r) => r.json())) as {
      entries: Array<{ playerId: string; displayName?: string }>
    }
    expect(
      board.entries.find((entry) => entry.playerId === tokens.player.playerId)?.displayName,
    ).toBe("Sir Mines")

    const invalid = await fetch(`${base}/v1/me`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify({ displayName: "<script>" }),
    })
    expect(invalid.status).toBe(400)

    githubUser = { id: 42, login: "octocat", name: "The Octocat" }
  })

  it("deletes the player, sessions, and board entry", async () => {
    githubUser = { id: 99, login: "deleteme", name: "Delete Me" }
    const tokens = await signIn()
    await playOne(tokens.accessToken, tokens.player.playerId)

    const deleted = await fetch(`${base}/v1/me`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    })
    expect(deleted.status).toBe(204)

    const me = await get("/v1/me", tokens.accessToken)
    expect(me.status).toBe(401)

    const board = (await get("/v1/boards/light-cycles/solo").then((r) => r.json())) as {
      entries: Array<{ playerId: string }>
    }
    expect(board.entries.some((entry) => entry.playerId === tokens.player.playerId)).toBe(false)

    githubUser = { id: 42, login: "octocat", name: "The Octocat" }
  })
})

describe("auth guards", () => {
  it("requires a session for ranked runs when GitHub is configured", async () => {
    const response = await post("/v1/runs", {
      gameId: "light-cycles",
      modeId: "solo",
      playerId: "guest",
    })
    expect(response.status).toBe(401)
  })

  it("serialises concurrent refresh attempts", async () => {
    githubUser = { id: 77, login: "racer", name: "Racer" }
    const tokens = await signIn()

    const [left, right] = await Promise.all([
      post("/v1/auth/refresh", { refreshToken: tokens.refreshToken }),
      post("/v1/auth/refresh", { refreshToken: tokens.refreshToken }),
    ])

    expect([left.status, right.status]).toEqual([200, 200])
    const leftTokens = (await left.json()) as { accessToken: string }
    const rightTokens = (await right.json()) as { accessToken: string }
    expect((await get("/v1/me", leftTokens.accessToken)).status).toBe(200)
    expect((await get("/v1/me", rightTokens.accessToken)).status).toBe(200)

    githubUser = { id: 42, login: "octocat", name: "The Octocat" }
  })

  it("rejects unknown flows and malformed tokens", async () => {
    const missing = await post("/v1/auth/github/poll", { flowId: "nope" })
    expect(missing.status).toBe(404)

    const badRefresh = await post("/v1/auth/refresh", { refreshToken: "short" })
    expect(badRefresh.status).toBe(400)

    const badToken = await get("/v1/me", "not-a-token")
    expect(badToken.status).toBe(401)
  })

  it("requires auth when configured", async () => {
    const strict = createArcadeServer({ github, requireAuth: true, auth: { refreshGraceMs: 5_000 } })
    const port = await strict.listen(0)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: "light-cycles", modeId: "solo", playerId: "guest" }),
      })
      expect(response.status).toBe(401)
    } finally {
      await strict.close()
    }
  })
})
