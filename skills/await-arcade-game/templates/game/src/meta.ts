import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "__ID__",
  title: "__TITLE__",
  description: "A minimal target-clicking game. Replace me.",
  author: "You",
  version: "0.1.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [{ id: "classic", title: "Classic", difficulty: 1 }],
  score: { type: "lower", min: 0, max: 600_000 },
  leaderboard: "replay",
  status: "experimental",
  controls: [{ keys: "Click", action: "Hit the glowing target" }],
  display: { surface: "dom", width: 3, height: 3 },
  maxDurationMs: 600_000,
  tags: ["template"],
}
