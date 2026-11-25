import type { GameMeta } from "@await-arcade/contract"
import { MAX_SCORE } from "./core"

export const meta: GameMeta = {
  id: "crates",
  title: "Crate Pusher",
  description:
    "Push every crate onto a goal pad using orthogonal moves without trapping a crate in a corner or running out of moves.",
  author: "Await Arcade",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    {
      id: "easy",
      title: "Easy (6×6)",
      description:
        "6 × 6 grid · 2 crates & goals · Budget par + max(6, ceil(0.75×par)) · Base 2,000 (−50/move over par) · Tiebreak: server time",
      difficulty: 1,
      ranked: true,
    },
    {
      id: "hard",
      title: "Hard (7×7)",
      description:
        "7 × 7 grid · 2 crates & goals · Budget par + max(6, ceil(0.75×par)) · Base 4,000 (−50/move over par) · Tiebreak: server time",
      difficulty: 2,
      ranked: true,
    },
  ],
  score: { type: "higher", min: 0, max: MAX_SCORE, unit: "points" },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "Arrows / WASD", action: "Move operator or push adjacent crate" },
    { keys: "Click / Tap adjacent cell", action: "Step or push 1 cell in that direction" },
    { keys: "H", action: "Show or hide the how-to guide" },
  ],
  display: { surface: "dom", width: 7, height: 7 },
  glyph: "+--+--+--+\n|##|  |O |\n+--+--+--+\n|@ |[X]| |\n+--+--+--+",
  theme: { accent: "#f59e0b", accent2: "#38bdf8", mode: "terminal" },
  maxDurationMs: 3_600_000,
  tags: ["puzzle", "logic", "sokoban", "grid", "turn-based"],
}
