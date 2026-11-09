import type {
  AudioBus,
  BoardEntry,
  GameHost,
  GameStorage,
  RunResult,
  Score,
  SubmitResult,
} from "@await-arcade/contract"
import { isBetter } from "./format"

interface LocalHostOptions {
  readonly prefix?: string
  readonly toastRoot?: HTMLElement
  readonly name?: string
}

const FREQUENCIES: Record<string, number> = {
  click: 660,
  flag: 440,
  reveal: 520,
  win: 880,
  lose: 180,
  turn: 560,
  crash: 140,
}

/** Accept only well-formed board entries from a host or an untrusted server. */
export function normaliseBoard(value: unknown): BoardEntry[] {
  if (!Array.isArray(value)) return []

  const entries: BoardEntry[] = []
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue
    const record = item as Record<string, unknown>
    const score = record.score
    if (typeof record.playerId !== "string" || typeof score !== "object" || score === null) continue
    const raw = score as Record<string, unknown>
    if (typeof raw.value !== "number" || (raw.type !== "higher" && raw.type !== "lower")) continue

    let detail: Record<string, number | string | boolean> | undefined
    if (typeof raw.detail === "object" && raw.detail !== null && !Array.isArray(raw.detail)) {
      const candidate: Record<string, number | string | boolean> = {}
      for (const [key, value] of Object.entries(raw.detail as Record<string, unknown>)) {
        if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
          candidate[key] = value
        }
      }
      detail = candidate
    }

    entries.push({
      playerId: record.playerId,
      achievedAt: typeof record.achievedAt === "number" ? record.achievedAt : 0,
      ...(typeof record.displayName === "string" ? { displayName: record.displayName } : {}),
      ...(typeof record.rankKey === "string" ? { rankKey: record.rankKey } : {}),
      score: {
        value: raw.value,
        type: raw.type,
        won: raw.won === true,
        ranked: raw.ranked !== false,
        ...(detail ? { detail } : {}),
      },
    })
    if (entries.length >= 50) break
  }
  return entries
}

class SimpleAudio implements AudioBus {
  private context: AudioContext | undefined
  private mutedState: boolean

  constructor(private readonly storage: GameStorage) {
    this.mutedState = storage.get<boolean>("audio.muted") ?? false
  }

  muted(): boolean {
    return this.mutedState
  }

  toggle(): boolean {
    this.mutedState = !this.mutedState
    this.storage.set("audio.muted", this.mutedState)
    return this.mutedState
  }

  play(name: string): void {
    if (this.mutedState || typeof AudioContext === "undefined") return

    try {
      this.context ??= new AudioContext()
      const context = this.context
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime

      oscillator.type = "square"
      oscillator.frequency.value = FREQUENCIES[name] ?? 520
      gain.gain.setValueAtTime(0.035, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.09)
    } catch {
      // Audio is a nice-to-have. Never let it break a game.
    }
  }
}

export class LocalHost implements GameHost {
  readonly name: string
  readonly storage: GameStorage
  readonly audio: SimpleAudio

  private readonly prefix: string
  private readonly memory = new Map<string, string>()
  private toastRoot: HTMLElement | undefined

  constructor(prefixOrOptions: string | LocalHostOptions = "await-arcade") {
    const options = typeof prefixOrOptions === "string" ? { prefix: prefixOrOptions } : prefixOrOptions
    this.prefix = options.prefix ?? "await-arcade"
    this.name = options.name ?? "local"
    this.toastRoot = options.toastRoot

    const read = (key: string): string | null => {
      try {
        return globalThis.localStorage?.getItem(`${this.prefix}.${key}`) ?? this.memory.get(key) ?? null
      } catch {
        return this.memory.get(key) ?? null
      }
    }

    const write = (key: string, value: string): void => {
      this.memory.set(key, value)
      try {
        globalThis.localStorage?.setItem(`${this.prefix}.${key}`, value)
      } catch {
        // Private mode or a sandboxed webview. Memory storage still works.
      }
    }

    const remove = (key: string): void => {
      this.memory.delete(key)
      try {
        globalThis.localStorage?.removeItem(`${this.prefix}.${key}`)
      } catch {
        // Ignore.
      }
    }

    this.storage = {
      get<T>(key: string): T | undefined {
        const raw = read(key)
        if (raw === null) return undefined
        try {
          return JSON.parse(raw) as T
        } catch {
          return undefined
        }
      },
      set<T>(key: string, value: T): void {
        write(key, JSON.stringify(value))
      },
      remove,
    }

    this.audio = new SimpleAudio(this.storage)
  }

  setToastRoot(root: HTMLElement): void {
    this.toastRoot = root
  }

  best(gameId: string, modeId: string): Score | undefined {
    const value = this.storage.get<Score>(`best.${gameId}.${modeId}`)
    if (!value || typeof value.value !== "number" || typeof value.type !== "string") return undefined
    return value
  }

  /** Merge a remote best into the local cache; the better score wins. */
  protected mergeBest(gameId: string, modeId: string, remote: Score | undefined): Score | undefined {
    const local = this.best(gameId, modeId)
    if (!remote) return local
    if (!local || isBetter(remote, local)) {
      this.storage.set(`best.${gameId}.${modeId}`, remote)
      return remote
    }
    return local
  }

  async submit(run: RunResult): Promise<SubmitResult> {
    if (!run.score.ranked) return { ok: false, reason: "this run is not ranked" }

    const key = `best.${run.gameId}.${run.modeId}`
    const previous = this.best(run.gameId, run.modeId)

    if (isBetter(run.score, previous)) {
      this.storage.set(key, run.score)
      this.toast("New personal best")
      return { ok: true, best: run.score }
    }

    return previous ? { ok: true, best: previous } : { ok: true }
  }

  toast(message: string): void {
    if (typeof document === "undefined") {
      console.log(`[await-arcade] ${message}`)
      return
    }

    const root = this.toastRoot ?? document.body
    const node = document.createElement("div")
    node.className = "arcade-toast"
    node.textContent = message
    root.appendChild(node)

    globalThis.setTimeout(() => node.remove(), 2200)
  }
}
