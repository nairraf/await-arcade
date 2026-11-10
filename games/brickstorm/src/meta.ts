import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "brickstorm",
  title: "Brickstorm",
  description:
    "Endless brick levels: each cleared wall rebuilds with more gold armor and a faster ball. Keep one run alive and climb the level ladder.",
  author: "Await Arcade",
  version: "1.1.0",
  engines: { arcade: "^0.1.0" },
  kind: "realtime",
  tickRate: 60,
  modes: [
    {
      id: "classic",
      title: "Classic",
      description: "Endless walls, rising speed, and more gold per level",
      difficulty: 1,
    },
  ],
  score: { type: "higher", min: 0, max: 250_000 },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "← → / A D", action: "Move paddle" },
    { keys: "Mouse / touch", action: "Aim paddle" },
  ],
  display: { surface: "canvas", width: 320, height: 240 },
  glyph: " [##]\n--##--\n [##]",
  theme: { accent: "#fb923c", accent2: "#f43f5e", mode: "neon" },
  maxDurationMs: 600_000,
  maxInputs: 40_000,
  tags: ["action", "classic", "arcade"],
}
