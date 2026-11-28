import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { Replay } from "@await-arcade/contract"
import { verifyReplay } from "@await-arcade/framework"
import { games } from "./registry.generated"
import { verifiers } from "../../server/src/registry.generated"

const gamesDir = fileURLToPath(new URL("../../../games", import.meta.url))

describe("cartridge contract", () => {
  it("keeps the shell and server registries in sync", () => {
    const shell = new Map(games.map((entry) => [entry.meta.id, entry.meta]))
    const server = new Map(Object.entries(verifiers))

    expect([...shell.keys()].sort()).toEqual([...server.keys()].sort())
    for (const [id, meta] of shell) {
      expect(server.get(id)?.meta.version, id).toBe(meta.version)
    }
  })

  it("declares coherent metadata for every cartridge and mode", () => {
    const ids = new Set<string>()

    for (const { meta } of games) {
      expect(meta.id, "game id").toMatch(/^[a-z][a-z0-9-]*$/)
      expect(ids.has(meta.id), `duplicate game id: ${meta.id}`).toBe(false)
      ids.add(meta.id)

      expect(meta.title.trim(), `${meta.id} title`).not.toBe("")
      expect(meta.description.trim(), `${meta.id} description`).not.toBe("")
      expect(meta.version, `${meta.id} version`).toMatch(/^\d+\.\d+\.\d+$/)
      expect(meta.modes.length, `${meta.id} modes`).toBeGreaterThan(0)
      expect(
        meta.modes.some((mode) => mode.ranked !== false),
        `${meta.id} has no ranked mode`,
      ).toBe(true)
      expect(meta.score.min, `${meta.id} score min`).toBeLessThanOrEqual(meta.score.max)
      expect(meta.maxDurationMs, `${meta.id} maxDurationMs`).toBeGreaterThan(0)
      expect(meta.display.width, `${meta.id} display width`).toBeGreaterThan(0)
      expect(meta.display.height, `${meta.id} display height`).toBeGreaterThan(0)

      if (meta.kind === "realtime") {
        expect(meta.tickRate ?? 0, `${meta.id} realtime tickRate`).toBeGreaterThan(0)
      } else {
        expect(meta.tickRate, `${meta.id} turn game tickRate`).toBeUndefined()
      }

      const modeIds = new Set<string>()
      for (const mode of meta.modes) {
        expect(mode.id, `${meta.id} mode id`).toMatch(/^[a-z][a-z0-9-]*$/)
        expect(modeIds.has(mode.id), `${meta.id} duplicate mode: ${mode.id}`).toBe(false)
        modeIds.add(mode.id)
        expect(mode.title.trim(), `${meta.id}/${mode.id} title`).not.toBe("")
        if (mode.variant !== undefined) {
          expect(
            meta.variants?.some((variant) => variant.id === mode.variant),
            `${meta.id}/${mode.id} unknown variant ${mode.variant}`,
          ).toBe(true)
        }
      }

      const variantIds = new Set<string>()
      for (const variant of meta.variants ?? []) {
        expect(variantIds.has(variant.id), `${meta.id} duplicate variant ${variant.id}`).toBe(false)
        variantIds.add(variant.id)
        expect(variant.title.trim(), `${meta.id}/${variant.id} variant title`).not.toBe("")
      }
    }
  })

  it("creates every mode deterministically with a rankable live score", () => {
    for (const { meta, core } of games) {
      for (const mode of meta.modes) {
        const first = core.create(12345, mode)
        const second = core.create(12345, mode)

        expect(core.phase(first), `${meta.id}/${mode.id} initial phase`).toBe("playing")
        expect(core.serialize(first), `${meta.id}/${mode.id} deterministic create`).toEqual(
          core.serialize(second),
        )
        expect(
          JSON.parse(JSON.stringify(core.serialize(first))),
          `${meta.id}/${mode.id} serializable state`,
        ).toEqual(core.serialize(first))

        const score = core.score(first, { elapsedMs: 0, ticks: 0 })
        expect(Number.isFinite(score.value), `${meta.id}/${mode.id} live score`).toBe(true)
        expect(score.value, `${meta.id}/${mode.id} score min`).toBeGreaterThanOrEqual(
          meta.score.min,
        )
        expect(score.value, `${meta.id}/${mode.id} score max`).toBeLessThanOrEqual(meta.score.max)
        expect(score.type, `${meta.id}/${mode.id} score type`).toBe(meta.score.type)
      }
    }
  })

  it("has a verified replay fixture for every cartridge", () => {
    const withFixtures = readdirSync(gamesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(gamesDir, entry.name, "replay.json")))
      .map((entry) => entry.name)
      .sort()

    expect(withFixtures).toEqual(games.map(({ meta }) => meta.id).sort())

    for (const { meta, core } of games) {
      const replay = JSON.parse(
        readFileSync(path.join(gamesDir, meta.id, "replay.json"), "utf8"),
      ) as Replay

      expect(replay.gameId, `${meta.id} fixture game`).toBe(meta.id)
      expect(replay.gameVersion, `${meta.id} fixture version`).toBe(meta.version)
      expect(
        meta.modes.some((mode) => mode.id === replay.modeId),
        `${meta.id} fixture mode ${replay.modeId}`,
      ).toBe(true)

      const result = verifyReplay(core, meta, replay)
      expect(result.ok, `${meta.id} fixture: ${result.reason ?? "unknown"}`).toBe(true)
      expect(Number.isFinite(result.score?.value), `${meta.id} fixture score`).toBe(true)
      expect(result.score!.value).toBeGreaterThanOrEqual(meta.score.min)
      expect(result.score!.value).toBeLessThanOrEqual(meta.score.max)
    }
  })
})
