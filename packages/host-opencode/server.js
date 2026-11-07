/**
 * OpenCode server part.
 *
 * The id is what the host assigns to the plugin, so the GUI bundle and the
 * panel keys are namespaced under "await-arcade". This part is intentionally
 * empty for now; the next step is to proxy leaderboard calls through it so
 * auth tokens never enter the renderer.
 */
export default {
  id: "await-arcade",
  async setup() {},
}
