import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "brickstorm",
  title: "Brickstorm",
  description:
    "Three brick bands, a glowing save brick, and explosive supers that take their neighbours with them. Keep the ball alive and clear the wall.",
  author: "Await Arcade",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "realtime",
  tickRate: 60,
  modes: [
    {
      id: "classic",
      title: "Classic",
      description: "3 bands, 48 bricks, save and explosive bricks",
      difficulty: 1,
    },
  ],
  score: { type: "higher", min: 0, max: 2_000 },
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
  tags: ["action", "classic", "arcade"],
}
