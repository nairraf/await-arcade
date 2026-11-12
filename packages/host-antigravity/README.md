# Await Arcade for Antigravity

The Antigravity host is a UI-extension sidecar. It serves the same shell and
games as the OpenCode panel, wrapped in an aux-pane page.

## Build

```sh
npm run build --workspace @await-arcade/host-antigravity
```

This writes `index.html` with the app bundle inlined, plus `app.js` for direct
use. Antigravity's `plugin://` page handler returns 500 for the external bundle,
so the inline module is required; `inline.mjs` runs after Vite. The sidecar
serves those three paths.

## Install

From the repo root, use the installer:

```sh
npm run build:hosts
AWAIT_ARCADE_API_URL=https://await-arcade-api-164244433164.northamerica-northeast1.run.app \
  ./scripts/install-hosts.sh
```

It creates the sidecar directory, a local `sidecar.json`, the Antigravity
project, and the `sidecars` config entry.

Manual alternative: create `~/.gemini/config/sidecars/await-arcade` as a **real
directory** (not a symlink to the package), symlink or copy the four built files
into it, and write a local `sidecar.json` whose `args` point at the absolute
`server.mjs` path. Then add the entry to `~/.gemini/config/config.json`:

```json
{
  "sidecars": {
    "await-arcade": {
      "enabled": true,
      "projectId": "<uuid>",
      "schemaVersion": 1
    }
  }
}
```

The matching `~/.gemini/config/projects/<uuid>.json` is required for the
sidecar to appear under its project. `scripts/install-hosts.sh` is the reference
for the exact shape.

Open the **Await Arcade** project and the **Await Arcade** aux-pane view.

## Notes

- `server.mjs` tries `import("sidecar_sdk")` and falls back to the macOS
  install path. Adjust the fallback for another machine.
- The sidecar only serves registered paths. Vite is configured to emit
  `app.js` and `app.css` at the package root so `server.mjs` can serve them.
- `web/index.html` must load `/preload.js`; the sidecar SDK serves it and defines
  `window.sidecar`. Without it the aux pane has no sidecar bridge and API calls
  are unauthenticated.
- `inline.mjs` inlines `app.js` into `index.html` after Vite. Antigravity's
  `plugin://` handler returns 500 for the external bundle; a single inline
  module works (the same pattern Selos Pulse uses).
- Scores go through the shared verifier API; the sidecar owns the player id,
  sessions, and the submit queue.

## Release bundle

`npm run build` also writes the self-contained sidecar server to
`dist-server/server.mjs`; the release packager ships that plus the inlined `index.html`.
