import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { playRealtime, playTurn } from "../packages/framework/src/testkit"
import { core as cyclesCore } from "../games/light-cycles/src/core"
import { meta as cyclesMeta } from "../games/light-cycles/src/meta"
import { core as minesCore } from "../games/mineflag/src/core"
import { meta as minesMeta } from "../games/mineflag/src/meta"
import type { MineInput } from "../games/mineflag/src/core"
import { core as mergeCore } from "../games/mergegrid/src/core"
import { meta as mergeMeta } from "../games/mergegrid/src/meta"
import type { MergeInput } from "../games/mergegrid/src/core"
import { core as brickstormCore } from "../games/brickstorm/src/core"
import { meta as brickstormMeta } from "../games/brickstorm/src/meta"

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

function mergeInputs(seed: number): MergeInput[] {
  const mode = mergeMeta.modes[0]!
  const cycle = ["left", "up", "right", "down"] as const
  const inputs: MergeInput[] = []
  let state = mergeCore.create(seed, mode)

  for (let move = 0; move < 20_000 && state.phase === "playing"; move += 1) {
    const input: MergeInput = { direction: cycle[move % cycle.length]! }
    inputs.push(input)
    state = mergeCore.step(state, [input], 0)
  }

  return inputs
}

const merge = playTurn(mergeCore, mergeMeta, {
  seed: 42,
  mode: mergeMeta.modes[0]!,
  inputs: mergeInputs(42),
  durationMs: 60_000,
})

const brickstorm = playRealtime(brickstormCore, brickstormMeta, {
  seed: 77,
  mode: brickstormMeta.modes[0]!,
  ticks: 20_000,
  inputs: [
    { tick: 30, input: { target: 80 } },
    { tick: 90, input: { target: 240 } },
  ],
})

if (!mines.verified.ok) throw new Error(`mineflag fixture failed: ${mines.verified.reason}`)
if (!cycles.verified.ok) throw new Error(`light-cycles fixture failed: ${cycles.verified.reason}`)
if (!merge.verified.ok) throw new Error(`mergegrid fixture failed: ${merge.verified.reason}`)
if (!brickstorm.verified.ok) throw new Error(`brickstorm fixture failed: ${brickstorm.verified.reason}`)

writeFileSync(path.join(root, "games/mineflag/replay.json"), `${JSON.stringify(mines.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/light-cycles/replay.json"), `${JSON.stringify(cycles.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/mergegrid/replay.json"), `${JSON.stringify(merge.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/brickstorm/replay.json"), `${JSON.stringify(brickstorm.replay, null, 2)}\n`)

console.log(`mineflag: ${mines.state.phase} score=${mines.score.value} verified=${mines.verified.ok}`)
console.log(`light-cycles: ${cycles.state.phase} score=${cycles.score.value} verified=${cycles.verified.ok}`)
console.log(`mergegrid: ${merge.state.phase} score=${merge.score.value} verified=${merge.verified.ok}`)
console.log(`brickstorm: ${brickstorm.state.phase} score=${brickstorm.score.value} verified=${brickstorm.verified.ok}`)
