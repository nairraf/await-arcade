import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "light-cycles",
  title: "Neon Cycles",
  description: "Grid light cycles. Cut off the other rider, or survive the grid for as long as you can.",
  author: "Await Arcade",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "realtime",
  tickRate: 12,
  modes: [
    { id: "solo", title: "Solo vs AI", description: "One rider, one very rude computer", difficulty: 1 },
    { id: "duel", title: "Local Duel", description: "Two riders, one keyboard", difficulty: 2 },
  ],
  score: { type: "higher", min: 0, max: 100_000 },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "Arrows / WASD", action: "Steer" },
    { keys: "Escape", action: "Pause" },
  ],
  display: { surface: "canvas", width: 480, height: 288, pixelated: true },
  glyph: "   __o\n _`\\<,_\n(*)/ (*)",
  theme: { accent: "#22d3ee", accent2: "#f472b6", mode: "neon" },
  maxDurationMs: 300_000,
  tags: ["action", "grid", "neon"],
}
