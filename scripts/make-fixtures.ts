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
import { core as lockCore } from "../games/lockstep/src/core"
import { meta as lockMeta } from "../games/lockstep/src/meta"
import { greedySolve } from "../games/lockstep/solver"
import { core as codeCore } from "../games/codebreaker/src/core"
import { meta as codeMeta } from "../games/codebreaker/src/meta"
import type { CodebreakerInput } from "../games/codebreaker/src/core"
import { MARK_FILLED, core as nonogramCore } from "../games/nonogram/src/core"
import { meta as nonogramMeta } from "../games/nonogram/src/meta"
import type { NonogramInput } from "../games/nonogram/src/core"
import { core as tileCore } from "../games/tilechain/src/core"
import { meta as tileMeta } from "../games/tilechain/src/meta"
import type { TilechainInput } from "../games/tilechain/src/core"

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

const lock = playTurn(lockCore, lockMeta, {
  seed: 10,
  mode: lockMeta.modes[0]!,
  inputs: greedySolve(10, lockMeta.modes[0]!, 200),
  durationMs: 12_000,
})

/**
 * Codebreaker fixture: a two-attempt solve. The opener is a guaranteed miss
 * (every slot shifted off the secret), so the log carries real feedback, then
 * the secret is typed in exactly.
 *
 * A symbol costs `symbol + 1` forward cycles from an empty slot (empty starts
 * at A on `cycle +1`), so the input log stays readable.
 */
function codebreakerInputs(seed: number): CodebreakerInput[] {
  const mode = codeMeta.modes[0]!
  const state = codeCore.create(seed, mode)
  const inputs: CodebreakerInput[] = []

  const enterRow = (symbols: readonly number[]): void => {
    symbols.forEach((symbol, slot) => {
      for (let step = 0; step <= symbol; step += 1) inputs.push({ type: "cycle", delta: 1 })
      if (slot < symbols.length - 1) inputs.push({ type: "slot", delta: 1 })
    })
    inputs.push({ type: "submit" })
  }

  enterRow(state.secret.map((symbol) => (symbol + 1) % state.symbols))
  enterRow(state.secret)
  return inputs
}

const CODE_SEED = 20260418
const code = playTurn(codeCore, codeMeta, {
  seed: CODE_SEED,
  mode: codeMeta.modes[0]!,
  inputs: codebreakerInputs(CODE_SEED),
  durationMs: 24_000,
})

/**
 * Nonogram fixture: one deliberate failed check on the empty hard board, then
 * the solution's cells are marked and checked for a clean win. For seed
 * 20260419 (complexity 3650), one failed check deducts 250 (base 3400) and
 * 60s elapsed yields a 797-point time bonus for a verified score of 4197.
 */
const NONOGRAM_MODE = nonogramMeta.modes.find((mode) => mode.id === "hard")!

function nonogramInputs(seed: number): NonogramInput[] {
  const state = nonogramCore.create(seed, NONOGRAM_MODE)
  const inputs: NonogramInput[] = [{ type: "check" }]

  for (let index = 0; index < state.solution.length; index += 1) {
    if (state.solution[index] !== 1) continue
    inputs.push({
      type: "set",
      x: index % state.width,
      y: Math.floor(index / state.width),
      mark: MARK_FILLED,
    })
  }

  inputs.push({ type: "check" })
  return inputs
}

const NONOGRAM_SEED = 20260419
const nonogramScript = nonogramInputs(NONOGRAM_SEED)
const nonogram = playTurn(nonogramCore, nonogramMeta, {
  seed: NONOGRAM_SEED,
  mode: NONOGRAM_MODE,
  inputs: nonogramScript,
  durationMs: 60_000,
})

/**
 * Tile Chain Drop fixture: a 28-drop skirmish win found by a greedy rollout at
 * the 32-clear target. Seed 285 clears 32 tiles (4 of them cracked) with a
 * seven-wave chain and 3420 chain points; 7 drops saved add 175 and the win
 * bonus adds 200 for a verified score of 3795.
 */
const TILECHAIN_MODE = tileMeta.modes.find((mode) => mode.id === "skirmish")!
const TILECHAIN_SEED = 285
// 28 drops, 32 clears (the skirmish target), 4 cracked tiles and a seven-wave chain.
const TILECHAIN_COLUMNS = [
  3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 0, 0, 2, 0,
]
const tilechainScript: TilechainInput[] = TILECHAIN_COLUMNS.map((col) => ({
  type: "drop",
  col,
}))
const tilechain = playTurn(tileCore, tileMeta, {
  seed: TILECHAIN_SEED,
  mode: TILECHAIN_MODE,
  inputs: tilechainScript,
  durationMs: 45_000,
})

if (!mines.verified.ok) throw new Error(`mineflag fixture failed: ${mines.verified.reason}`)
if (!cycles.verified.ok) throw new Error(`light-cycles fixture failed: ${cycles.verified.reason}`)
if (!merge.verified.ok) throw new Error(`mergegrid fixture failed: ${merge.verified.reason}`)
if (!brickstorm.verified.ok) throw new Error(`brickstorm fixture failed: ${brickstorm.verified.reason}`)
if (!lock.verified.ok) throw new Error(`lockstep fixture failed: ${lock.verified.reason}`)
if (!code.verified.ok) throw new Error(`codebreaker fixture failed: ${code.verified.reason}`)
if (!nonogram.verified.ok) throw new Error(`nonogram fixture failed: ${nonogram.verified.reason}`)
if (!tilechain.verified.ok) throw new Error(`tilechain fixture failed: ${tilechain.verified.reason}`)
if (code.state.attemptsUsed !== 2 || code.score.value !== 900) {
  throw new Error(
    `codebreaker fixture shape drifted: attempts=${code.state.attemptsUsed} score=${code.score.value}`,
  )
}
const nonogramChecks = nonogramScript.filter((input) => input.type === "check").length
if (nonogramChecks !== 2 || nonogram.state.checksUsed !== 2 || nonogram.score.value !== 3400) {
  throw new Error(
    `nonogram fixture shape drifted: attempts=${nonogramChecks} checksUsed=${nonogram.state.checksUsed} score=${nonogram.score.value}`,
  )
}
if (
  tilechainScript.length !== 28 ||
  tilechain.state.phase !== "won" ||
  tilechain.state.dropsUsed !== 28 ||
  tilechain.state.clearedTiles !== 32 ||
  tilechain.state.crackedCleared !== 4 ||
  tilechain.state.maxChain !== 7 ||
  tilechain.state.chainPoints !== 3420 ||
  tilechain.score.value !== 3795
) {
  throw new Error(
    `tilechain fixture shape drifted: inputs=${tilechainScript.length} phase=${tilechain.state.phase} drops=${tilechain.state.dropsUsed} cleared=${tilechain.state.clearedTiles} cracked=${tilechain.state.crackedCleared} maxChain=${tilechain.state.maxChain} chainPoints=${tilechain.state.chainPoints} score=${tilechain.score.value}`,
  )
}

writeFileSync(path.join(root, "games/mineflag/replay.json"), `${JSON.stringify(mines.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/light-cycles/replay.json"), `${JSON.stringify(cycles.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/mergegrid/replay.json"), `${JSON.stringify(merge.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/brickstorm/replay.json"), `${JSON.stringify(brickstorm.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/lockstep/replay.json"), `${JSON.stringify(lock.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/codebreaker/replay.json"), `${JSON.stringify(code.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/nonogram/replay.json"), `${JSON.stringify(nonogram.replay, null, 2)}\n`)
writeFileSync(path.join(root, "games/tilechain/replay.json"), `${JSON.stringify(tilechain.replay, null, 2)}\n`)

console.log(`mineflag: ${mines.state.phase} score=${mines.score.value} verified=${mines.verified.ok}`)
console.log(`light-cycles: ${cycles.state.phase} score=${cycles.score.value} verified=${cycles.verified.ok}`)
console.log(`mergegrid: ${merge.state.phase} score=${merge.score.value} verified=${merge.verified.ok}`)
console.log(`brickstorm: ${brickstorm.state.phase} score=${brickstorm.score.value} verified=${brickstorm.verified.ok}`)
console.log(`lockstep: ${lock.state.phase} score=${lock.score.value} verified=${lock.verified.ok}`)
console.log(`codebreaker: ${code.state.phase} score=${code.score.value} verified=${code.verified.ok}`)
console.log(`nonogram: ${nonogram.state.phase} score=${nonogram.score.value} verified=${nonogram.verified.ok}`)
console.log(`tilechain: ${tilechain.state.phase} score=${tilechain.score.value} verified=${tilechain.verified.ok}`)
