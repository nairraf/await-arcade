/**
 * A tiny fetch client for the verifier API. It is plain JavaScript so both host
 * server halves can import it without a build step.
 */
export function createArcadeClient(options) {
  const baseUrl = options.baseUrl.replace(/\/$/, "")
  const playerId = options.playerId
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (typeof fetchImpl !== "function") {
    throw new Error("Await Arcade: this host has no fetch")
  }

  async function request(path, init) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    })

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

  async function bestFor(gameId, modeId) {
    const value = await board(gameId, modeId)
    const entry = Array.isArray(value.entries)
      ? value.entries.find((item) => item.playerId === playerId)
      : undefined
    return entry?.score
  }

  async function status() {
    return { mode: "online", playerId }
  }

  return { start, submit, board, bestFor, status }
}
