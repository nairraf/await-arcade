import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { playRealtime, playTurn } from "../packages/framework/src/testkit"
import { core as cyclesCore } from "../games/light-cycles/src/core"
import { meta as cyclesMeta } from "../games/light-cycles/src/meta"
import { core as minesCore } from "../games/minesweeper/src/core"
import { meta as minesMeta } from "../games/minesweeper/src/meta"
import type { MineInput } from "../games/minesweeper/src/core"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function mineInputs(seed: number): MineInput[] {
  const mode = minesMeta.modes[0]!
  const first: MineInput = { type: "reveal", x: 0, y: 0 }
  const state = minesCore.step(minesCore.create(seed, mode), [first], 0)
  const inputs: MineInput[] = [first]

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.cells[y * state.width + x]!
      if (!cell.mine && !cell.revealed) inputs.push({ type: "reveal", x, y })
    }
  }

  return inputs
}

const mines = playTurn(minesCore, minesMeta, {
  seed: 42,
  mode: minesMeta.modes[0]!,
  inputs: mineInputs(42),
  durationMs: 20_000,
})

const cycles = playRealtime(cyclesCore, cyclesMeta, {
  seed: 123,
  mode: cyclesMeta.modes[0]!,
  ticks: 4000,
  inputs: [],
})

writeFileSync(path.join(root, "games/minesweeper/replay.json"), `${JSON.stringify(mines.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/light-cycles/replay.json"), `${JSON.stringify(cycles.replay, null, 2)}\n`)

console.log(`minesweeper: ${mines.state.phase} score=${mines.score.value} verified=${mines.verified.ok}`)
console.log(`light-cycles: ${cycles.state.phase} score=${cycles.score.value} verified=${cycles.verified.ok}`)
