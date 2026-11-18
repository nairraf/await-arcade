import type { GameMeta } from "@await-arcade/contract"

export const meta: GameMeta = {
  id: "codebreaker",
  title: "Codebreaker",
  description:
    "Crack a hidden four- or five-symbol code in ten tries. Every guess scores exact hits and near misses, repeats included.",
  author: "Await Arcade",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    {
      id: "classic",
      title: "Classic",
      description: "4 slots, 5 symbols, 10 attempts",
      difficulty: 1,
    },
    {
      id: "expert",
      title: "Expert",
      description: "5 slots, 5 symbols, 10 attempts",
      difficulty: 2,
    },
  ],
  score: { type: "higher", min: 0, max: 1000, unit: "points" },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "← / →", action: "Select slot" },
    { keys: "↑ / ↓", action: "Cycle symbol" },
    { keys: "A–E", action: "Set symbol" },
    { keys: "Enter", action: "Submit guess" },
    { keys: "Backspace", action: "Clear slot" },
  ],
  display: { surface: "dom", width: 5, height: 10 },
  glyph: " _ _\n|A B|\n|C D|\n|_E_|",
  theme: { accent: "#a78bfa", accent2: "#fbbf24", mode: "terminal" },
  maxDurationMs: 1_800_000,
  tags: ["deduction", "logic", "puzzle", "turn-based"],
}
