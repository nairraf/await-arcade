/**
 * Compile-time profile metadata for the OpenCode plugin (`prod` vs `dev`).
 * Unbundled Node imports leave `__ARCADE_DEV__` undefined and default to prod.
 */
export const isDev = typeof __ARCADE_DEV__ !== "undefined" && __ARCADE_DEV__ === true
export const pluginId = isDev ? "await-arcade-dev" : "await-arcade"
export const apiId = isDev ? "await-arcade-dev.api" : "await-arcade.api"
export const hostName = isDev ? "opencode-dev" : "opencode"
export const displayName = isDev ? "Await Arcade (Dev)" : "Await Arcade"
export const commandId = isDev ? "open-dev" : "open"
