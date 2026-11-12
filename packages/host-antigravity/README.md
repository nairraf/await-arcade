# Await Arcade for Antigravity

The Antigravity host is a UI-extension sidecar. It serves the same shell, four
cartridges, boards, daily challenge, and ghost practice as the OpenCode panel,
wrapped in an aux-pane page.

## Install

The beta-2 release installer is the normal path:

```sh
tar -xzf await-arcade-beta-2.tar.gz
node await-arcade-beta-2/install.mjs --antigravity-only --verify
```

Omit `--antigravity-only` to install both hosts. It creates
`~/.gemini/config/sidecars/await-arcade`, writes a local `sidecar.json`, creates
the Antigravity project, and adds the `sidecars` config entry. It points the
host at `https://api.awaitarcade.com` and preserves existing auth/state.

From a source checkout:

```sh
npm run build:hosts
AWAIT_ARCADE_API_URL=https://api.awaitarcade.com ./scripts/install-hosts.sh
```

Open the **Await Arcade** project and the **Await Arcade** aux-pane view. Close
and reopen the pane after a rebuild.

## Build

```sh
npm run build --workspace @await-arcade/host-antigravity
```

This writes the inlined `index.html` and the self-contained sidecar server to
`dist-server/server.mjs`. The release packager ships `server.mjs`,
`index.html`, and a `sidecar.json.example`; no external `app.js` is needed
because Antigravity’s `plugin://` page handler returns 500 for it.

## Notes

- `server.mjs` tries `import("sidecar_sdk")` and falls back to the macOS
  Antigravity install path. The sidecar SDK is currently macOS-first; adjust the
  fallback for another machine.
- `index.html` must load `/preload.js`; the sidecar SDK serves it and defines
  `window.sidecar`. Without it the aux pane has no bridge.
- `inline.mjs` runs after Vite and fails the build if the page has more than one
  module script or still references an external `app.js`.
- Scores go through the shared verifier API; the sidecar owns the player id,
  sessions, and the submit queue.

## Uninstall

```sh
node await-arcade-beta-2/install.mjs --uninstall --yes --antigravity-only
```

Use `--keep-data` to preserve auth/settings, or omit `--antigravity-only` to
remove both hosts. The uninstaller removes the sidecar, Antigravity config entry
and project, local auth, queue, and sidecar data; it never touches the GitHub
account or this repo.
