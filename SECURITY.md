# Security

## Reporting

Open a private security advisory on the repository, or email the maintainer
listed in `CODEOWNERS`. Do not open a public issue for a vulnerability.

## Scope

- The verifier API and score submission.
- Auth token handling in the OpenCode server part and Antigravity sidecar.
- Firestore rules and Cloud Run IAM.
- Game sandboxing (games must not receive auth tokens or raw network access).

## Rules

- Clients never hold a service-account credential.
- Games never see auth tokens; the shell owns submission.
- Scores are verified from replays on the server.
- No `eval`, `new Function`, or dynamic code execution in a game core.
- Display names are rendered with `textContent`, not HTML.
- Firestore rules deny client writes; only the API writes.
- Rate-limit run creation and submission.
- Set a GCP budget alert and a Cloud Run max-instance cap.

## Local development

- Use the Firebase emulators for Firestore/Auth where possible.
- Do not use another production project's sidecar credential for Await Arcade.
- Keep secrets in the host's server half, not in the renderer or webview.
