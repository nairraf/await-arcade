import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "breakout",
  title: "Breakout",
  description: "Bounce the ball, clear the wall, keep the paddle under it. A seeded brick-buster with pointer and keyboard control.",
  author: "Await Arcade",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "realtime",
  tickRate: 60,
  modes: [{ id: "classic", title: "Classic", description: "8 × 5 wall, one ball", difficulty: 1 }],
  score: { type: "higher", min: 0, max: 1_200 },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "← → / A D", action: "Move paddle" },
    { keys: "Mouse / touch", action: "Aim paddle" },
  ],
  display: { surface: "canvas", width: 320, height: 240 },
  theme: { accent: "#a3e635", accent2: "#38bdf8", mode: "neon" },
  maxDurationMs: 600_000,
  tags: ["action", "classic", "arcade"],
}
