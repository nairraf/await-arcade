# Await Arcade for OpenCode Desktop

The OpenCode host is a GUI plugin: a pinned **Await Arcade** side-panel tab, a
command, and a titlebar pill. It mounts the same framework, shell, four
cartridges, shared boards, daily challenge, and ghost practice as the
Antigravity sidecar.

## Install

The beta-2 release installer is the normal path:

```sh
tar -xzf await-arcade-beta-2.tar.gz
node await-arcade-beta-2/install.mjs --opencode-only --verify
```

Omit `--opencode-only` to install both hosts. The installer copies the plugin
into `~/.config/opencode/plugins/await-arcade`, preserves existing auth/state,
and points the host at `https://api.awaitarcade.com`.

From a source checkout:

```sh
npm run build:hosts
AWAIT_ARCADE_API_URL=https://api.awaitarcade.com ./scripts/install-hosts.sh
```

The source installer symlinks the package into the plugin directory. The
release installer copies a self-contained directory instead.

Restart OpenCode after installing or rebuilding:

```sh
opencode service restart
```

## Build

```sh
npm run build --workspace @await-arcade/host-opencode
```

This writes `gui-experimental.cjs` and the bundled server half at
`dist/server.js`. The release package places that bundle at the package root as
`server.js`; OpenCode 2.2.7 discovers local plugins by root `server.js` as well
as package exports.

The GUI API is experimental. The scaffold pins `@opencode/plugin` to `2.2.5`.
Rebuild after changing anything under `packages/shell`, `packages/framework`, or
`games/`.

## What is wired

- Pinned **Await Arcade** tab in every session’s side region.
- `Await Arcade` command in the palette and a titlebar pill.
- Launcher, four cartridges, local bests, pause, restart, replay download.
- GitHub Device Flow sign-in, per-host session, account panel, and deletion.
- Shared boards, daily challenge, XP/medals/rank, and ghost practice.

## Uninstall

```sh
node await-arcade-beta-2/install.mjs --uninstall --yes --opencode-only
```

Use `--keep-data` to preserve auth/settings, or omit `--opencode-only` to remove
both hosts. The uninstaller removes the plugin, Antigravity config/project, local
auth, queue, and sidecar data; it never touches the GitHub account or this repo.
