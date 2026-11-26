import type { GameMeta } from "@await-arcade/contract"
import { MAX_SCORE } from "./core"

export const meta: GameMeta = {
  id: "router",
  title: "Circuit Router",
  description:
    "Rotate the circuit tiles to link every terminal to the power source with zero open ends.",
  author: "Await Arcade",
  version: "1.2.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    {
      id: "easy",
      title: "Easy (5×5)",
      description:
        "5 × 5 grid · Unlimited turns · Efficiency score (par-scaled) · Tiebreak: server time",
      difficulty: 1,
      ranked: true,
    },
    {
      id: "hard",
      title: "Hard (6×6)",
      description:
        "6 × 6 grid · Unlimited turns · Efficiency score (par-scaled) · Tiebreak: server time",
      difficulty: 2,
      ranked: true,
    },
  ],
  score: { type: "higher", min: 0, max: MAX_SCORE, unit: "points" },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "Arrows / WASD / Hover", action: "Move cursor" },
    { keys: "Space / Enter / Click", action: "Rotate tile clockwise" },
    { keys: "Q / X / Right-click", action: "Rotate tile counter-clockwise" },
    { keys: "H", action: "Show or hide the how-to guide" },
  ],
  display: { surface: "dom", width: 6, height: 6 },
  theme: { accent: "#22d3ee", accent2: "#f59e0b", mode: "terminal" },
  maxDurationMs: 3_600_000,
  tags: ["puzzle", "logic", "routing", "turn-based"],
}
