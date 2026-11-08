# Visual language

Await Arcade is one cabinet system, not a theme per game. The shell owns the
frame, typography, spacing, overlays, and light/dark behavior. A game owns its
accent and its art.

## The look

**Late-night cabinet with a cartridge shelf.**

- Near-black cabinet, warm paper light mode
- One strong accent per cabinet, plus a secondary action accent
- Thin glowing edge lines, soft bezel shadows, subtle scanlines
- Monospace UI; a display wordmark/monogram for marquees, not for scores
- Attract-mode energy: a blinking cursor, a “now loading” pulse, a coin-slot
  accent — never flashing or distracting

The touchstone is 2010 *Tron Legacy* lighting: thin, deliberate light lines and
soft bloom on dark glass. Not a wall of neon.

## Game theme metadata

Every game may declare an accent:

```ts
theme: {
  accent: "#22d3ee",
  accent2: "#f472b6",
  mode: "neon", // "neon" | "terminal" | "paper"
}
```

The shell sets `--game-accent` and `--game-accent-2` on the launcher card and
the cabinet. The frame, marquee, HUD, focus ring, and overlay use those tokens.
A game may use them in its own CSS; canvas games should read
`ctx.meta.theme` or the same tokens instead of hardcoding hex values.

Suggested accents:

| Cabinet | Accent | Secondary | Mode |
|---|---|---|---|
| Minesweeper | `#60a5fa` | `#fbbf24` | terminal |
| Neon Cycles | `#22d3ee` | `#f472b6` | neon |
| Breakout | `#fbbf24` | `#f472b6` | neon |
| Missile Defense | `#4ade80` | `#fb7185` | terminal |
| Space Invaders-like | `#4ade80` | `#a78bfa` | neon |
| 2048 | `#d97706` | `#78716c` | paper |

## The cartridge

The launcher card is a cartridge, not a generic card:

- a marquee label with the game title and a small AA stamp
- a notch at the top center
- a grip strip at the bottom
- a thin accent line along the top
- a shelf line under the grid

Hover lifts the cartridge slightly and lights its edge. The play button is the
slot. Keep the animation short (120–180ms).

## The cabinet

The game view is the inserted cartridge:

- marquee bar with the game title, AA stamp, and best score
- description and controls in the shell, not in the game
- HUD cells with a thin accent rule
- a dark bezel around the game surface
- pause/game-over overlays with the same accent line

The frame is constant. Do not let a game re-lay-out the HUD, buttons, or
overlays.

## Light and dark

Both modes are first-class. The shell uses `data-theme="auto" | "light" | "dark"`
and CSS variables. `auto` follows `prefers-color-scheme`.

Light mode is a **paper cabinet**: warm off-white, dark ink, same accents at
lower saturation, no heavy glow, scanlines barely visible. The game surface may
remain a dark CRT screen inside the light cabinet; that is intentional. A DOM
game like Minesweeper should use the light board tokens so it reads as a desk
game in light mode.

Test both modes with the top-bar theme toggle before shipping a game. Emulate
`prefers-color-scheme: light` as well as the manual toggle.

## Accessibility

- Contrast: body text and HUD values must pass against the panel in both modes.
- Never use color alone: Minesweeper uses digits and glyphs; Neon Cycles should
  give bikes a head marker/pattern, not just cyan vs pink.
- Focus rings use the cabinet accent.
- Respect `prefers-reduced-motion`; no flashing above 3 Hz.
- Keyboard-playable menus and games; pause and mute always reachable.
- Canvas games need a text control summary and a pause.

## Do not

- Invent a new shell layout per game.
- Mix a tiny pixel font with smooth neon everywhere.
- Use ripped sprites, marquees, fonts, or copyrighted cabinet art.
- Overdo CRT curvature, bloom, or scanlines.
- Hardcode shell chrome colors inside a game view.
- Use color alone for state.

## Fonts and assets

- Use the system monospace stack for UI and scores.
- If a display face is needed, use an OFL font and only for marquee titles.
- The AA monogram should be an SVG/wordmark, not a font dependency.
- Original or CC0/CC-BY assets only; see `assets.md`.
