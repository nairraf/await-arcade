import type { GameMeta } from "@await-arcade/contract"
import { MAX_SCORE } from "./core"

export const meta: GameMeta = {
  id: "lockstep",
  title: "Lockstep",
  description:
    "Read enemy telegraphs on a 5×5 grid, shove threats into pillars or each other, and clear every sector.",
  author: "Await Arcade",
  version: "1.1.0",
  engines: { arcade: "^0.1.0" },
  kind: "turn",
  modes: [
    {
      id: "skirmish",
      title: "Skirmish",
      description: "5 sectors · 3 HP · clear all waves",
      difficulty: 1,
    },
    {
      id: "endless",
      title: "Endless",
      description: "Escalating rosters until the board caps, then survive for score",
      difficulty: 2,
    },
  ],
  score: { type: "higher", min: 0, max: MAX_SCORE, unit: "points" },
  leaderboard: "replay",
  status: "experimental",
  controls: [
    { keys: "Arrows / WASD / Click", action: "Move or shove enemy" },
    { keys: "Space / Pulse", action: "Push adjacent threats (2t CD)" },
    { keys: ". / E / Wait", action: "Hold position & resolve telegraphs" },
    { keys: "? / Guide", action: "Show or hide how to play" },
  ],
  display: { surface: "dom", width: 5, height: 5 },
  glyph: "+--+--+--+\n|@ |  |S |\n+--+--+--+\n|  |# |! |\n+--+--+--+",
  theme: { accent: "#4ade80", accent2: "#fb7185", mode: "terminal" },
  maxDurationMs: 3_600_000,
  tags: ["tactics", "turn-based", "roguelike", "grid"],
}
