import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "mineflag",
  title: "Mineflag",
  description: "Clear the field without detonating the mines. Safe first click, flood reveal, chording, and keyboard play.",
  author: "Await Arcade",
  version: "1.1.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    { id: "beginner", title: "Beginner", description: "9 × 9, 10 mines", difficulty: 1 },
    { id: "intermediate", title: "Intermediate", description: "16 × 16, 40 mines", difficulty: 2 },
    { id: "expert", title: "Expert", description: "30 × 16, 99 mines", difficulty: 3 },
  ],
  score: { type: "lower", min: 0, max: 100_000, unit: "moves" },
  leaderboard: "replay",
  status: "stable",
  controls: [
    { keys: "Click", action: "Reveal" },
    { keys: "Right click / F", action: "Flag" },
    { keys: "Double click / C", action: "Chord" },
    { keys: "Arrows + Space", action: "Keyboard play" },
  ],
  display: { surface: "dom", width: 30, height: 16 },
  glyph: " \\|/\n--*--\n /|\\",
  theme: { accent: "#60a5fa", accent2: "#fbbf24", mode: "terminal" },
  maxDurationMs: 3_600_000,
  tags: ["logic", "classic"],
}
