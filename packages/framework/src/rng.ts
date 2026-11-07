export interface Rng {
  next(): number
  /** Inclusive integer in [min, max]. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
}

/**
 * Mulberry32: tiny, fast, deterministic, and good enough for games.
 * Never use Math.random inside a game core.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new Error(`createRng.int: invalid range ${min}..${max}`)
      }
      return min + Math.floor(next() * (max - min + 1))
    },
    pick(items) {
      if (items.length === 0) throw new Error("createRng.pick: empty list")
      return items[Math.floor(next() * items.length)]!
    },
    shuffle(items) {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1))
        const left = copy[i]!
        const right = copy[j]!
        copy[i] = right
        copy[j] = left
      }
      return copy
    },
  }
}
