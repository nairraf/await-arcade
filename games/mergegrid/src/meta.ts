import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "mergegrid",
  title: "Mergegrid",
  description: "Slide the grid, merge matching tiles, and reach 2048 before the board fills. A seeded classic for the arcade shelf.",
  author: "Await Arcade",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    { id: "classic", title: "Classic", description: "4 × 4, reach 2048", difficulty: 1 },
  ],
  score: { type: "higher", min: 0, max: 4_000_000 },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "Arrows / WASD", action: "Slide tiles" },
    { keys: "On-screen pad", action: "Touch play" },
  ],
  display: { surface: "dom", width: 4, height: 4 },
  glyph: "+--+--+\n|2 |4 |\n+--+--+\n|8 |16|\n+--+--+",
  theme: { accent: "#f0b429", accent2: "#8b5cf6", mode: "paper" },
  maxDurationMs: 3_600_000,
  tags: ["puzzle", "classic", "numbers"],
}
