import type { GameMeta } from "@await-arcade/contract"
import { MAX_SCORE } from "./core"

export const meta: GameMeta = {
  id: "tilechain",
  title: "Tile Chain Drop",
  description:
    "Drop numbered tiles into seven columns to match group sizes and trigger chain cascades.",
  author: "Await Arcade",
  version: "1.0.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    {
      id: "skirmish",
      title: "Skirmish",
      description: "Clear 25 tiles within 35 drops",
      difficulty: 1,
      ranked: true,
    },
    {
      id: "endless",
      title: "Endless",
      description: "Rising cracked rows every 10 drops · survive for score",
      difficulty: 2,
      ranked: true,
    },
  ],
  score: { type: "higher", min: 0, max: MAX_SCORE, unit: "points" },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "← / → / A / D", action: "Select column" },
    { keys: "Space / Enter / Click", action: "Drop tile" },
    { keys: "1–7", action: "Drop directly into column 1–7" },
  ],
  display: { surface: "dom", width: 7, height: 7 },
  glyph: "+--+--+--+\n| 3|  | 1|\n+--+--+--+\n| 2|##| 2|\n+--+--+--+",
  theme: { accent: "#38bdf8", accent2: "#f59e0b", mode: "terminal" },
  maxDurationMs: 3_600_000,
  tags: ["puzzle", "cascade", "strategy", "turn-based"],
}
