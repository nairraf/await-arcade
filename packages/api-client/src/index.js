/**
 * A tiny fetch client for the verifier API. It is plain JavaScript so both host
 * server halves can import it without a build step.
 */
export function createArcadeClient(options) {
  const baseUrl = options.baseUrl.replace(/\/$/, "")
  const playerId = options.playerId
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const getToken = options.getToken ?? (() => undefined)

  if (typeof playerId !== "string" || playerId.length === 0) {
    throw new Error("Await Arcade: a playerId is required")
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("Await Arcade: this host has no fetch")
  }

  async function request(path, init) {
    const timeout =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(15_000)
        : undefined
    const token = getToken()
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      ...(init?.signal ? {} : timeout ? { signal: timeout } : {}),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })

    if (response.status === 204) return {}
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const failure = new Error(body?.error ?? body?.reason ?? `${response.status} ${response.statusText}`)
      failure.status = response.status
      throw failure
    }
    return body
  }

  async function start(gameId, modeId) {
    const body = await request("/v1/runs", {
      method: "POST",
      body: JSON.stringify({ gameId, modeId, playerId }),
    })
    return { runId: body.runId, seed: body.seed, expiresAt: body.expiresAt }
  }

  async function submit(runId, replay) {
    return request(`/v1/runs/${encodeURIComponent(runId)}/submit`, {
      method: "POST",
      body: JSON.stringify({ replay }),
    })
  }

  async function board(gameId, modeId) {
    return request(`/v1/boards/${encodeURIComponent(gameId)}/${encodeURIComponent(modeId)}`)
  }

  async function playerBest(gameId, modeId) {
    const who = getToken() ? "me" : encodeURIComponent(playerId)
    const value = await request(
      `/v1/boards/${encodeURIComponent(gameId)}/${encodeURIComponent(modeId)}/player/${who}`,
    )
    return { score: value.entry?.score, rank: value.rank, playerId: value.playerId }
  }

  async function dailyToday() {
    return request("/v1/challenges/today", {
      headers: { "x-arcade-player": playerId },
    })
  }

  async function dailyStart(challengeId) {
    return request(`/v1/challenges/${encodeURIComponent(challengeId)}/runs`, {
      method: "POST",
      body: JSON.stringify({ playerId }),
    })
  }

  async function dailyBoard(challengeId) {
    return request(`/v1/challenges/${encodeURIComponent(challengeId)}/board`)
  }

  async function ghost(ghostId) {
    return request(`/v1/runs/${encodeURIComponent(ghostId)}/ghost`)
  }

  async function profile() {
    return request("/v1/me/profile")
  }

  async function bestFor(gameId, modeId) {
    const { score } = await playerBest(gameId, modeId)
    return score
  }

  async function authStart(host) {
    return request("/v1/auth/github/start", {
      method: "POST",
      body: JSON.stringify({ host }),
    })
  }

  async function authPoll(flowId) {
    return request("/v1/auth/github/poll", {
      method: "POST",
      body: JSON.stringify({ flowId }),
    })
  }

  async function authRefresh(refreshToken) {
    return request("/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    })
  }

  async function authSignOut() {
    return request("/v1/auth/signout", { method: "POST", body: "{}" })
  }

  async function me() {
    return request("/v1/me")
  }

  async function deleteMe() {
    return request("/v1/me", { method: "DELETE" })
  }

  async function updateMe(displayName) {
    return request("/v1/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    })
  }

  async function nameAvailable(displayName) {
    return request(`/v1/names/${encodeURIComponent(displayName)}`)
  }

  async function status() {
    return { mode: "online", playerId }
  }

  return {
    start,
    submit,
    board,
    bestFor,
    playerBest,
    dailyToday,
    dailyStart,
    dailyBoard,
    ghost,
    profile,
    authStart,
    authPoll,
    authRefresh,
    authSignOut,
    me,
    updateMe,
    nameAvailable,
    deleteMe,
    status,
  }
}

export { createHostSession, stateDir, apiUrl } from "./session.js"
