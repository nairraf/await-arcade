# Hosts

## OpenCode Desktop

Model: a plugin package with a **server part** and a **GUI part**.

- `server.js` exports `{ id, setup }`; the id is `await-arcade`.
- `gui-experimental.cjs` is a prebuilt CommonJS bundle from
  `@opencode/plugin/gui/vite`.
- The GUI runs in every desktop window. It registers a `Panel`, a `Command`, and
  a `TitlebarItem`.
- Host modules are provided at runtime: `solid-js`, `@opencode/plugin/gui`,
  `@opencode/plugin/rpc`, `effect`, `@opencode/client`.
- The bundle must be a single CJS file; dynamic imports are inlined. This is why
  the game registry is generated at build time.
- The GUI API is experimental. Pin `@opencode/plugin` (the scaffold uses
  `2.2.5`) and rebuild after upgrades.

Mounting the shell:

```tsx
onMount(() => {
  const arcade = createArcade({
    root: mount,
    games,
    host: new LocalHost({ prefix: "opencode", name: "opencode" }),
    injectStyles: false, // the host adds `styles` via ctx.add(Style, …)
  })
  onCleanup(() => arcade.destroy())
})
```

Next: add an RPC contract (`server.js` + `src/rpc.ts`), keep `auth.opencode.json`
in the native state directory, and proxy leaderboard calls through the plugin
server so the renderer never holds a token.

## Antigravity

Model: a **sidecar** process plus a **web UI extension**.

- `sidecar.json` declares the command, restart policy, and a `ui_config` view
  with `entrypoint: SIDECAR_UI_ENTRYPOINT_AUX_PANE`.
- `server.mjs` uses `sidecar_sdk`'s `SidecarApp` to serve registered paths on
  loopback. It serves `/`, `/app.js`, `/app.css`.
- The page runs in an aux pane. `window.sidecar` provides `fetch` (with the
  sidecar token) and `agent.sendMessage`.
- The sidecar only serves exact registered paths. Vite emits `app.js` and
  `app.css` at the package root so the server can serve them without a static
  directory handler.
- The host assigns `ANTIGRAVITY_SIDECAR_WEB_PORT`; the UI origin can change
  between runs. Do not rely on `localStorage` for a session token. Store auth in
  the native per-OS state directory (`auth.antigravity.json`, `0600`); use
  `ANTIGRAVITY_EXECUTABLE_DATA_DIR` for non-secret sidecar cache and queue state.

Next: proxy the verifier API through `server.mjs`, keep the auth file in the
native state directory, and use `window.sidecar.agent.sendMessage` for
"brief me on my run" style actions.

## Shared shell

The shell is framework-free DOM and canvas. It mounts into any element. The
OpenCode wrapper is Solid because the host requires Solid components; the
shell itself stays independent. Both hosts use the same `games` registry, the
same `LocalHost` (until the API proxy lands), and the same styles.
