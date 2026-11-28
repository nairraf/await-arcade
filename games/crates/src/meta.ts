import type { GameMeta } from "@await-arcade/contract"
import { EASY_ROOMS, HARD_ROOMS, MAX_SCORE } from "./core"

export const meta: GameMeta = {
  id: "crates",
  title: "Crate Pusher",
  description:
    "Push every crate onto a goal pad across multi-room runs, avoiding non-goal corners and beating each room's Par for maximum score.",
  author: "Await Arcade",
  version: "1.1.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    {
      id: "easy",
      title: "Easy (3 rooms · 6×6)",
      description:
        `${EASY_ROOMS} rooms · 6 × 6 grid · Par-scaled room scores · Tiebreak: server time`,
      difficulty: 1,
      ranked: true,
    },
    {
      id: "hard",
      title: "Hard (3 rooms · 7×7)",
      description:
        `${HARD_ROOMS} rooms · 7 × 7 grid · 3 crates & goals · Par-scaled room scores · Tiebreak: server time`,
      difficulty: 2,
      ranked: true,
    },
    {
      id: "endless",
      title: "Endless",
      description:
        "Unlimited rooms (6×6 2 crates then 7×7 3 crates) · bank room scores until a corner trap · Tiebreak: server time",
      difficulty: 3,
      ranked: true,
    },
  ],
  score: { type: "higher", min: 0, max: MAX_SCORE, unit: "points" },
  leaderboard: "replay",
  ranking: { tiebreak: "serverTime" },
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
