# Await Arcade for Antigravity

The Antigravity host is a UI-extension sidecar. It serves the same shell and
games as the OpenCode panel, wrapped in an aux-pane page.

## Build

```sh
npm run build --workspace @await-arcade/host-antigravity
```

This writes `index.html`, `app.js`, and `app.css` next to `server.mjs`. The
sidecar serves those three paths.

## Install

Symlink or copy the package into the sidecar directory. The directory name is
the sidecar id:

```sh
ln -s "$PWD/packages/host-antigravity" ~/.gemini/config/sidecars/await-arcade
```

Enable it in `~/.gemini/config/config.json`:

```json
{
  "sidecars": {
    "await-arcade": {
      "enabled": true
    }
  }
}
```

Open the **Await Arcade** view in the Antigravity aux pane.

## Notes

- `server.mjs` tries `import("sidecar_sdk")` and falls back to the macOS
  install path. Adjust the fallback for another machine.
- The sidecar only serves registered paths. Vite is configured to emit
  `app.js` and `app.css` at the package root so `server.mjs` can serve them.
- Scores are local for now. The next step is to proxy through the same
  verifier API as OpenCode, using the sidecar data directory for the token.
