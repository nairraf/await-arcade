# The game contract

```ts
interface GameCore<S, I> {
  create(seed: number, mode: Mode): S
  step(state: S, inputs: readonly I[], dt: number): S
  phase(state: S): "playing" | "won" | "lost"
  score(state: S, context: { elapsedMs: number; ticks: number }): Score
  serialize(state: S): unknown
}

interface GameView<S> {
  render(state: S, alpha: number): void
  resize?(size: { width: number; height: number; dpr: number }): void
  destroy(): void
}

interface Mode {
  id: string
  title: string
  description?: string
  difficulty?: number
  ranked?: boolean
  /** Group modes that share a difficulty; the shell renders a variant selector. */
  group?: string
  /** A GameMeta.variants id, e.g. "random" or "logic". */
  variant?: string
}

interface GameMeta {
  id: string
  title: string
  description: string
  author: string
  version: string
  engines: { arcade: string }
  kind: "turn" | "realtime"
  tickRate?: number
  modes: Mode[]
  variants?: { id: string; title: string; description: string }[]
  score: { type: "higher" | "lower"; min: number; max: number; unit?: "time" | "moves" | "points" }
  leaderboard: "replay" | "bounds" | "none"
  status: "stable" | "experimental"
  controls: { keys: string; action: string }[]
  display: { surface: "dom" | "canvas"; width: number; height: number; pixelated?: boolean }
  theme?: { accent: string; accent2: string; mode: "neon" | "terminal" | "paper" }
  maxDurationMs: number
  tags?: string[]
}
```

The shell owns the cabinet frame and typography. `theme` is only the cabinet
accent; do not recreate the chrome in a game view.

## Turn games

- `step` is called once per dispatched input with `dt = 0`.
- `inputs` usually contains one input; the core may process all of them.
- Record the input, then return the new state.

## Realtime games

- `step` is called every fixed tick with `dt = 1000 / tickRate`.
- The runner owns `requestAnimationFrame`; the core never schedules itself.
- Inputs are queued for the next tick.
- Use a tick rate that fits the game: 10–15 Hz for grid movement, 60 Hz only
  for smooth physics.

## The view

`view(ctx)` returns a `GameView`. The runner calls `render(state, alpha)` after
every step or frame. `alpha` is the interpolation fraction; grid games can
ignore it.

The view gets:

```ts
ctx.state()        // current state
ctx.dispatch(input) // the only way to send input
ctx.host           // audio, storage, scores, toast
ctx.container      // the surface element
ctx.canvas/ctx2d   // present for canvas games
ctx.size()         // logical size + dpr
```

Never mutate state in the view. Never call `fetch` or read auth tokens. The
shell owns identity and submission.
