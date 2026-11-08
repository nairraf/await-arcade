# Rendering, input, and pause

The shell provides the cabinet frame, HUD, overlays, typography, and light/dark
tokens. Use the shared visual system in `visual-language.md`; do not recreate
the chrome inside a game.

## DOM games

Use DOM for grid/board games: Minesweeper, 2048, card games. Buttons are
focusable, screen readers can label them, and the layout is responsive.

- Set `meta.display.surface = "dom"`.
- Build into `ctx.container`.
- Update in place; don't rebuild the whole board on every move.
- Use a roving tabindex for keyboard play.
- Call `ctx.dispatch` from click/keydown handlers.

## Canvas games

Use canvas for action games: Light Cycles, Breakout, shooters. The framework
creates a canvas sized to `meta.display` and handles DPR.

- Set `meta.display.surface = "canvas"`.
- Draw in logical coordinates.
- Use `image-rendering: pixelated` for retro art.
- Don't call `requestAnimationFrame`; the runner owns the loop.
- Keep the hot loop allocation-free where possible.

## Input

- Scope listeners to the game surface or the window, never the whole app.
- Prevent default for arrows and space while the game owns input.
- Release keys on `blur` so a held key doesn't stick.
- In OpenCode, don't steal keys from the composer. Pause when the panel is not
  active, or scope the listener.
- Provide a touch path: tap to reveal, long-press to flag, on-screen pads for
  action games.

## Pause and visibility

- The shell pauses on Escape and on `visibilitychange`.
- A ranked run should not accumulate paused time.
- On unmount, the runner destroys the view and clears the surface.

## Accessibility

- Every menu and button is keyboard reachable.
- The game has a pause and a mute.
- Respect `prefers-reduced-motion`.
- Canvas games get a text description of controls and state.
- Minesweeper/2048 should be fully keyboard playable.
