import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "light-cycles",
  title: "Neon Cycles",
  description: "Endless grid light cycles. Cut off the AI, level up, and face a sharper rider each round.",
  author: "Await Arcade",
  version: "1.3.0",
  engines: { arcade: "^0.1.0" },
  kind: "realtime",
  tickRate: 12,
  modes: [
    { id: "solo", title: "Solo vs AI", description: "Endless AI levels; one life, sharper rider each round", difficulty: 1 },
    { id: "duel", title: "Local Duel", description: "Two riders, one keyboard", difficulty: 2, ranked: false },
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
