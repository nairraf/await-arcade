import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "nonogram",
  title: "Nonogram",
  description:
    "Read the row and column clues, fill the right cells, and reveal a picture that logic — never a guess — can finish.",
  author: "Await Arcade",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    {
      id: "easy",
      title: "Easy",
      description: "6 × 6 grid · pure line logic",
      difficulty: 1,
    },
    {
      id: "hard",
      title: "Hard",
      description: "10 × 10 grid · pure line logic",
      difficulty: 2,
    },
  ],
  score: { type: "higher", min: 0, max: 1000, unit: "points" },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "Arrows", action: "Move the cursor" },
    { keys: "Space", action: "Cycle empty → filled → crossed → empty" },
    { keys: "X", action: "Mark the cell crossed" },
    { keys: "Enter", action: "Check the board" },
    { keys: "Click / Tap", action: "Move the cursor, then cycle the cell" },
  ],
  display: { surface: "dom", width: 10, height: 10 },
  glyph: " 1 1\n+--+--+\n|##|  |\n+--+--+\n|  |##|\n+--+--+",
  theme: { accent: "#f472b6", accent2: "#38bdf8", mode: "neon" },
  maxDurationMs: 3_600_000,
  tags: ["logic", "puzzle", "grid", "turn-based"],
}
