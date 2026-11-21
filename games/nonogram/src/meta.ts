import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "nonogram",
  title: "Nonogram",
  description:
    "Read the row and column clues, fill the right cells, and reveal the hidden pattern using pure logic — never a guess.",
  author: "Await Arcade",
  version: "1.2.0",
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
  score: { type: "higher", min: 0, max: 10_000, unit: "points" },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "Click / Drag", action: "Fill or paint with the active tool" },
    { keys: "Right-click", action: "Cross or uncross cells" },
    { keys: "Arrows + Space / X", action: "Move, fill, or cross" },
    { keys: "1 / 2 · P / C", action: "Overlap notes · promote / clear" },
    { keys: "Enter / Check", action: "Check the board" },
  ],
  display: { surface: "dom", width: 10, height: 10 },
  glyph: " 1 1\n+--+--+\n|##|  |\n+--+--+\n|  |##|\n+--+--+",
  theme: { accent: "#f472b6", accent2: "#38bdf8", mode: "neon" },
  maxDurationMs: 3_600_000,
  tags: ["logic", "puzzle", "grid", "turn-based"],
}
