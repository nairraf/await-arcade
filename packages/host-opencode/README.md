# Await Arcade for OpenCode Desktop

The OpenCode host is a GUI plugin: a pinned **Await Arcade** side-panel tab, a
command, and a titlebar pill. It mounts the same framework, shell, and games as
the Antigravity sidecar.

## Build

```sh
npm run build --workspace @await-arcade/host-opencode
```

This writes `gui-experimental.cjs` and the bundled server half at
`dist/server.js`. The server bundle inlines the workspace API client so the host
does not have to resolve workspace symlinks at plugin load time.

## Install locally

From the repo root, prefer the installer:

```sh
npm run build:hosts
./scripts/install-hosts.sh
```

Or symlink the package into the global plugin directory by hand:

```sh
ln -s "$PWD/packages/host-opencode" ~/.config/opencode/plugins/await-arcade
```

OpenCode reads `package.json` `exports`: `"."` is the server part and
`"./gui-experimental"` is the GUI bundle. Alternatively, add the absolute
directory to `plugins` in `~/.config/opencode/opencode.jsonc`.

The GUI API is experimental. The scaffold pins `@opencode/plugin` to `2.2.5`.
Rebuild after changing anything under `packages/shell`, `packages/framework`, or
`games/`.

## What is wired

- Pinned **Await Arcade** tab in every session's side region.
- `Await Arcade` command in the palette and a titlebar pill.
- Launcher, two cabinets, local best scores, pause, restart, replay download.

## What is next

- A small RPC proxy in `server.js` so the shell can talk to
  `packages/server` without exposing an auth token to the renderer.
- `Store.global` for cross-window personal bests.
- A GitHub device-flow sign-in and a `playerId` recovery code.
