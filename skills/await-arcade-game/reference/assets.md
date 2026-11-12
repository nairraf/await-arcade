# Assets, licensing, and naming

## Assets

- Original art, or CC0/CC-BY with attribution.
- No ripped sprites, tilesets, fonts, or music from commercial games.
- Keep a `LICENSES.md` in the game folder listing every asset and its license.
- Prefer small pixel art or procedural canvas drawing for the first version.
- Audio is optional. Mute by default in new cartridges until playtested.

## Naming

Mechanics are not copyrightable. Names, logos, and character art are
trademarks.

- "Missile Command" → **Missile Defense**
- "Space Invaders" → **Starfall** / **Void Invaders**
- "Breakout" → **Brick Buster**
- "Tron" / "Light Cycles" → **Neon Cycles**

Use original cartridge names and visuals. It keeps the project clean and avoids
marketplace review problems later.

## Code license

- MIT or Apache-2.0 for game code.
- DCO sign-off on commits (`git commit -s`).
- Don't copy code from a game you don't have the rights to.

## Content

- Family-friendly by default.
- No gore, no gambling, no real-money mechanics.
- No network calls from the game core.
- No telemetry beyond the score submission the shell already owns.
