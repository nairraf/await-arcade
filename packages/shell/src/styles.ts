export const styles = `
.arcade {
  color-scheme: dark;
  --arcade-bg: #06090d;
  --arcade-panel: #0b1118;
  --arcade-panel-2: #101923;
  --arcade-elevated: #16212d;
  --arcade-line: rgba(148, 163, 184, 0.18);
  --arcade-line-strong: rgba(148, 163, 184, 0.34);
  --arcade-fg: #e8eef5;
  --arcade-muted: #8f9bac;
  --arcade-accent: #22d3ee;
  --arcade-accent-2: #f472b6;
  --arcade-coin: #fbbf24;
  --arcade-success: #4ade80;
  --arcade-danger: #fb7185;
  --arcade-bezel: #04070b;
  --arcade-slot: #0a1017;
  --arcade-glow: rgba(34, 211, 238, 0.16);
  --arcade-scanline: rgba(255, 255, 255, 0.035);
  --arcade-shadow: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--arcade-fg);
  background:
    repeating-linear-gradient(0deg, var(--arcade-scanline) 0 1px, transparent 1px 4px),
    radial-gradient(1100px 600px at 10% -10%, color-mix(in srgb, var(--arcade-accent) 14%, transparent), transparent 60%),
    radial-gradient(900px 500px at 110% 0%, color-mix(in srgb, var(--arcade-accent-2) 10%, transparent), transparent 55%),
    var(--arcade-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

.arcade[data-theme="light"] {
  color-scheme: light;
  --arcade-bg: #eee8db;
  --arcade-panel: #fbf8ef;
  --arcade-panel-2: #e2dac9;
  --arcade-elevated: #fffdf7;
  --arcade-line: rgba(38, 42, 48, 0.18);
  --arcade-line-strong: rgba(38, 42, 48, 0.32);
  --arcade-fg: #1b1f24;
  --arcade-muted: #5d6570;
  --arcade-accent: #0e7490;
  --arcade-accent-2: #be185d;
  --arcade-coin: #b45309;
  --arcade-success: #15803d;
  --arcade-danger: #b91c1c;
  --arcade-bezel: #c9bfae;
  --arcade-slot: #e7e0d1;
  --arcade-glow: rgba(14, 116, 144, 0.12);
  --arcade-scanline: rgba(20, 24, 30, 0.025);
  --arcade-shadow: rgba(45, 40, 30, 0.22);
}

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] {
    color-scheme: light;
    --arcade-bg: #eee8db;
    --arcade-panel: #fbf8ef;
    --arcade-panel-2: #e2dac9;
    --arcade-elevated: #fffdf7;
    --arcade-line: rgba(38, 42, 48, 0.18);
    --arcade-line-strong: rgba(38, 42, 48, 0.32);
    --arcade-fg: #1b1f24;
    --arcade-muted: #5d6570;
    --arcade-accent: #0e7490;
    --arcade-accent-2: #be185d;
    --arcade-coin: #b45309;
    --arcade-success: #15803d;
    --arcade-danger: #b91c1c;
    --arcade-bezel: #c9bfae;
    --arcade-slot: #e7e0d1;
    --arcade-glow: rgba(14, 116, 144, 0.12);
    --arcade-scanline: rgba(20, 24, 30, 0.025);
    --arcade-shadow: rgba(45, 40, 30, 0.22);
  }
}

.arcade *,
.arcade *::before,
.arcade *::after {
  box-sizing: border-box;
}

/* Bright game accents in the dark cabinet; a darker mix on paper. */
.arcade-card,
.arcade-game,
.arcade-boards,
.arcade-daily {
  --game-accent: var(--game-accent-dark, #22d3ee);
  --game-accent-2: var(--game-accent-2-dark, #f472b6);
  --game-label: var(--game-accent-dark, #22d3ee);
  --game-label-2: var(--game-accent-2-dark, #f472b6);
}

.arcade[data-theme="light"] .arcade-card,
.arcade[data-theme="light"] .arcade-game,
.arcade[data-theme="light"] .arcade-boards,
.arcade[data-theme="light"] .arcade-daily {
  --game-accent: color-mix(in srgb, var(--game-accent-dark, #22d3ee) 38%, var(--arcade-fg, #1b1f24));
  --game-accent-2: color-mix(in srgb, var(--game-accent-2-dark, #f472b6) 38%, var(--arcade-fg, #1b1f24));
  --game-label: color-mix(in srgb, var(--game-accent-dark, #22d3ee) 62%, var(--arcade-fg, #1b1f24));
  --game-label-2: color-mix(in srgb, var(--game-accent-2-dark, #f472b6) 62%, var(--arcade-fg, #1b1f24));
}

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] .arcade-card,
  .arcade[data-theme="auto"] .arcade-game,
  .arcade[data-theme="auto"] .arcade-boards,
  .arcade[data-theme="auto"] .arcade-daily {
    --game-accent: color-mix(in srgb, var(--game-accent-dark, #22d3ee) 38%, var(--arcade-fg, #1b1f24));
    --game-accent-2: color-mix(in srgb, var(--game-accent-2-dark, #f472b6) 38%, var(--arcade-fg, #1b1f24));
    --game-label: color-mix(in srgb, var(--game-accent-dark, #22d3ee) 62%, var(--arcade-fg, #1b1f24));
    --game-label-2: color-mix(in srgb, var(--game-accent-2-dark, #f472b6) 62%, var(--arcade-fg, #1b1f24));
  }
}

.arcade-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--arcade-line);
  background: color-mix(in srgb, var(--arcade-panel) 88%, transparent);
  backdrop-filter: blur(10px);
  flex: none;
}

.arcade-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.arcade-brand-mark {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--arcade-accent) 58%, transparent);
  border-radius: 8px;
  color: var(--arcade-accent);
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--arcade-accent) 14%, transparent), transparent),
    var(--arcade-slot);
  box-shadow: 0 0 18px var(--arcade-glow), inset 0 1px 0 color-mix(in srgb, var(--arcade-fg) 10%, transparent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: -0.08em;
}

.arcade-brand-text {
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 13px;
  white-space: nowrap;
}

.arcade-top-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.arcade-badge,
.arcade-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--arcade-line);
  border-radius: 999px;
  color: var(--arcade-muted);
  background: color-mix(in srgb, var(--arcade-fg) 4%, transparent);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.arcade-badge {
  border-color: color-mix(in srgb, var(--arcade-accent) 38%, transparent);
  color: var(--arcade-accent);
  background: color-mix(in srgb, var(--arcade-accent) 8%, transparent);
}

.arcade-chip-mode {
  border-color: var(--arcade-line-strong);
  color: var(--arcade-fg);
  text-transform: none;
  letter-spacing: 0.02em;
}

.arcade-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px;
}

.arcade-launcher {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.arcade-hero {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 2px 2px;
}

.arcade-kicker {
  color: var(--arcade-coin);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.arcade-hero-title {
  margin: 0;
  font-size: clamp(24px, 4vw, 38px);
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.arcade-hero-sub {
  margin: 0;
  max-width: 64ch;
  color: var(--arcade-muted);
  font-size: 12px;
}

.arcade-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--arcade-line);
  box-shadow: 0 24px 30px -34px var(--arcade-shadow);
}

.arcade-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--arcade-line);
  border-radius: 12px 12px 8px 8px;
  background:
    linear-gradient(160deg, var(--arcade-panel), var(--arcade-panel-2));
  box-shadow: 0 16px 34px -28px var(--arcade-shadow);
  overflow: hidden;
  cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.arcade-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: linear-gradient(90deg, var(--game-label), var(--game-label-2));
  opacity: 0.9;
  z-index: 3;
  pointer-events: none;
}

.arcade-card::after {
  content: "";
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 7px;
  height: 4px;
  background: repeating-linear-gradient(90deg, var(--arcade-line) 0 10px, transparent 10px 16px);
  opacity: 0.8;
  pointer-events: none;
}

.arcade-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--game-accent) 50%, var(--arcade-line));
  box-shadow: 0 22px 44px -30px color-mix(in srgb, var(--game-accent) 45%, transparent);
}

.arcade-card-marquee {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 96px;
  padding: 14px;
  background:
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--arcade-fg) 4%, transparent) 0 1px, transparent 1px 4px),
    radial-gradient(140% 140% at 18% 0%, color-mix(in srgb, var(--game-label) 38%, transparent), transparent 58%),
    radial-gradient(120% 120% at 100% 100%, color-mix(in srgb, var(--game-label-2) 34%, transparent), transparent 55%),
    var(--arcade-slot);
  border-bottom: 1px solid var(--arcade-line);
}

.arcade-card-marquee::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 48px;
  height: 6px;
  border: 1px solid var(--arcade-line);
  border-top: 0;
  border-radius: 0 0 6px 6px;
  background: var(--arcade-bg);
  z-index: 2;
}

.arcade[data-theme="light"] .arcade-card-marquee {
  background:
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--arcade-fg) 4%, transparent) 0 1px, transparent 1px 4px),
    radial-gradient(140% 140% at 18% 0%, color-mix(in srgb, var(--game-label) 58%, transparent), transparent 64%),
    radial-gradient(120% 120% at 100% 100%, color-mix(in srgb, var(--game-label-2) 52%, transparent), transparent 60%),
    var(--arcade-slot);
}

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] .arcade-card-marquee {
    background:
      repeating-linear-gradient(0deg, color-mix(in srgb, var(--arcade-fg) 4%, transparent) 0 1px, transparent 1px 4px),
      radial-gradient(140% 140% at 18% 0%, color-mix(in srgb, var(--game-label) 58%, transparent), transparent 64%),
      radial-gradient(120% 120% at 100% 100%, color-mix(in srgb, var(--game-label-2) 52%, transparent), transparent 60%),
      var(--arcade-slot);
  }
}

.arcade-card-marquee::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 45%, color-mix(in srgb, var(--arcade-bg) 80%, transparent));
  pointer-events: none;
}

.arcade-card-glyph {
  position: relative;
  z-index: 1;
  font-size: 46px;
  font-weight: 800;
  line-height: 0.85;
  color: color-mix(in srgb, var(--arcade-fg) 92%, transparent);
  text-shadow: 0 0 26px color-mix(in srgb, var(--game-label) 55%, transparent);
}

.arcade-card-glyph.arcade-card-art {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: 0.02em;
  white-space: pre;
}

.arcade-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 13px 14px 19px;
  min-width: 0;
}

.arcade-card-kicker {
  color: var(--arcade-muted);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.arcade-card-title {
  margin: 0;
  font-size: 17px;
  letter-spacing: -0.02em;
}

.arcade-card-desc {
  margin: 0;
  color: var(--arcade-muted);
  font-size: 11.5px;
  min-height: 3.2em;
}

.arcade-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.arcade-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.arcade-card .arcade-btn-primary {
  border-color: color-mix(in srgb, var(--game-accent) 58%, transparent);
  background: color-mix(in srgb, var(--game-accent) 16%, transparent);
  color: color-mix(in srgb, var(--game-accent) 30%, var(--arcade-fg));
}

.arcade-card .arcade-btn-primary:hover {
  background: color-mix(in srgb, var(--game-accent) 26%, transparent);
}

.arcade-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 6px 12px;
  border: 1px solid var(--arcade-line-strong);
  border-radius: 8px;
  background: color-mix(in srgb, var(--arcade-fg) 6%, transparent);
  color: var(--arcade-fg);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
}

.arcade-btn:hover {
  background: color-mix(in srgb, var(--arcade-fg) 12%, transparent);
  border-color: color-mix(in srgb, var(--arcade-fg) 34%, transparent);
}

.arcade-btn:active {
  transform: translateY(1px);
}

.arcade-btn:focus-visible,
.arcade-select:focus-visible,
.arcade-card:focus-visible {
  outline: 2px solid var(--arcade-accent);
  outline-offset: 2px;
}

.arcade-btn-primary {
  border-color: color-mix(in srgb, var(--arcade-accent) 55%, transparent);
  background: color-mix(in srgb, var(--arcade-accent) 16%, transparent);
  color: color-mix(in srgb, var(--arcade-accent) 24%, var(--arcade-fg));
}

.arcade-btn-primary:hover {
  background: color-mix(in srgb, var(--arcade-accent) 26%, transparent);
}

.arcade[data-theme="light"] .arcade-btn-primary {
  border-color: var(--arcade-accent);
  background: var(--arcade-accent);
  color: #fffdf7;
}

.arcade[data-theme="light"] .arcade-card .arcade-btn-primary {
  border-color: var(--game-accent);
  background: var(--game-accent);
  color: #fffdf7;
}

.arcade[data-theme="light"] .arcade-btn-primary:hover,
.arcade[data-theme="light"] .arcade-card .arcade-btn-primary:hover {
  background: color-mix(in srgb, var(--arcade-accent) 82%, #000);
}

.arcade[data-theme="light"] .arcade-card .arcade-btn-primary:hover {
  background: color-mix(in srgb, var(--game-accent) 82%, #000);
}

@media (prefers-color-scheme: light) {
  .arcade[data-theme="auto"] .arcade-btn-primary {
    border-color: var(--arcade-accent);
    background: var(--arcade-accent);
    color: #fffdf7;
  }

  .arcade[data-theme="auto"] .arcade-card .arcade-btn-primary {
    border-color: var(--game-accent);
    background: var(--game-accent);
    color: #fffdf7;
  }

  .arcade[data-theme="auto"] .arcade-btn-primary:hover {
    background: color-mix(in srgb, var(--arcade-accent) 82%, #000);
  }

  .arcade[data-theme="auto"] .arcade-card .arcade-btn-primary:hover {
    background: color-mix(in srgb, var(--game-accent) 82%, #000);
  }
}

.arcade-btn-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--arcade-muted);
}

.arcade-btn-ghost:hover {
  background: color-mix(in srgb, var(--arcade-fg) 8%, transparent);
  color: var(--arcade-fg);
}

.arcade-game {
  position: relative;
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.arcade-cabinet-marquee {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 13px;
  border: 1px solid color-mix(in srgb, var(--game-accent) 34%, var(--arcade-line));
  border-top: 3px solid var(--game-accent);
  border-radius: 12px;
  background:
    linear-gradient(100deg, color-mix(in srgb, var(--game-accent) 13%, transparent), transparent 42%),
    linear-gradient(160deg, var(--arcade-panel), var(--arcade-panel-2));
  box-shadow: 0 0 26px -12px color-mix(in srgb, var(--game-accent) 45%, transparent);
}

.arcade-cabinet-badge {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: 1px solid color-mix(in srgb, var(--game-accent) 60%, transparent);
  border-radius: 8px;
  color: var(--game-accent);
  background: var(--arcade-slot);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: -0.08em;
}

.arcade-cabinet-badge.arcade-cabinet-daily {
  width: auto;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border-color: color-mix(in srgb, var(--arcade-coin) 55%, transparent);
  color: var(--arcade-coin);
  font-size: 9px;
  letter-spacing: 0.1em;
}

.arcade-cabinet-title {
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arcade-cabinet-score {
  margin-left: auto;
  color: var(--arcade-muted);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.arcade-game-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.arcade-game-title p {
  margin: 0;
  color: var(--arcade-muted);
  font-size: 11px;
  max-width: 64ch;
}

.arcade-mode-hint {
  color: var(--arcade-muted);
  font-size: 10px;
  line-height: 1.3;
}

.arcade-game-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.arcade-select {
  appearance: none;
  min-height: 32px;
  padding: 6px 30px 6px 10px;
  border: 1px solid var(--arcade-line-strong);
  border-radius: 8px;
  background:
    linear-gradient(45deg, transparent 50%, var(--arcade-muted) 50%) calc(100% - 14px) 14px / 5px 5px no-repeat,
    linear-gradient(135deg, var(--arcade-muted) 50%, transparent 50%) calc(100% - 9px) 14px / 5px 5px no-repeat,
    color-mix(in srgb, var(--arcade-fg) 6%, transparent);
  color: var(--arcade-fg);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.arcade-input {
  min-width: 0;
  flex: 1;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--arcade-line-strong);
  border-radius: 8px;
  background: color-mix(in srgb, var(--arcade-fg) 6%, transparent);
  color: var(--arcade-fg);
  font: inherit;
  font-size: 12px;
}

.arcade-input:focus {
  outline: none;
  border-color: var(--arcade-accent);
}

.arcade-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.arcade-name-status {
  min-height: 14px;
  font-size: 10px;
  color: var(--arcade-muted);
}

.arcade-name-status[data-state="ok"] {
  color: var(--arcade-success);
}

.arcade-name-status[data-state="bad"] {
  color: var(--arcade-danger);
}

.arcade-hud {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.arcade-hud-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px;
  border: 1px solid var(--arcade-line);
  border-top: 2px solid color-mix(in srgb, var(--game-accent) 55%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--arcade-panel) 82%, transparent);
  min-width: 0;
}

.arcade-hud-label {
  color: var(--arcade-muted);
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.arcade-hud-value {
  font-size: 18px;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arcade-surface {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  padding: 8px;
  border: 6px solid var(--arcade-bezel);
  border-radius: 12px;
  background: var(--arcade-bezel);
  box-shadow:
    inset 0 0 0 1px var(--arcade-line),
    0 0 34px -18px color-mix(in srgb, var(--game-accent) 55%, transparent);
  overflow: auto;
}

.arcade-surface:focus {
  outline: none;
}

.arcade-canvas {
  display: block;
  width: 100%;
  height: auto;
  max-width: 100%;
  image-rendering: pixelated;
  border-radius: 6px;
  touch-action: none;
}

.arcade-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  color: var(--arcade-muted);
  font-size: 10.5px;
}

.arcade-key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.arcade-key b {
  padding: 2px 6px;
  border: 1px solid var(--arcade-line-strong);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--arcade-fg) 6%, transparent);
  color: var(--arcade-fg);
  font-size: 9.5px;
  font-weight: 600;
}

.arcade-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--arcade-bg) 72%, transparent);
  backdrop-filter: blur(6px);
  z-index: 5;
}

.arcade-overlay[hidden] {
  display: none;
}

.arcade-overlay-card {
  width: min(430px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--game-accent) 44%, var(--arcade-line));
  border-top: 3px solid var(--game-accent);
  border-radius: 12px;
  background:
    linear-gradient(160deg, var(--arcade-panel), var(--arcade-panel-2));
  box-shadow: 0 26px 80px var(--arcade-shadow), 0 0 40px -22px color-mix(in srgb, var(--game-accent) 55%, transparent);
  text-align: center;
}

.arcade-overlay-kicker {
  color: var(--arcade-coin);
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.arcade-overlay-title {
  margin: 0;
  font-size: 22px;
  letter-spacing: -0.03em;
}

.arcade-overlay-score {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--game-accent);
  font-variant-numeric: tabular-nums;
}

.arcade-overlay-detail {
  color: var(--arcade-muted);
  font-size: 11px;
}

.arcade-overlay-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.arcade-board {
  width: min(470px, 100%);
  text-align: left;
}

.arcade-board .arcade-overlay-kicker,
.arcade-board .arcade-overlay-title {
  text-align: center;
}

.arcade-board-list {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(46vh, 340px);
  overflow: auto;
}

.arcade-board-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: baseline;
  padding: 6px 8px;
  border-bottom: 1px solid var(--arcade-line);
  font-size: 12px;
}

.arcade-board-rank {
  color: var(--arcade-muted);
  font-variant-numeric: tabular-nums;
}

.arcade-board-row:first-child .arcade-board-rank,
.arcade-board-row:first-child .arcade-board-player {
  color: var(--arcade-coin);
}

.arcade-board-player {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arcade-board-score {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--game-accent);
}

.arcade-daily-slot {
  display: flex;
}

.arcade-daily {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--game-accent) 44%, var(--arcade-line));
  border-left: 3px solid var(--game-accent);
  border-radius: 12px;
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--game-accent) 12%, transparent), transparent 62%),
    var(--arcade-panel);
  box-shadow: 0 16px 34px -30px var(--arcade-shadow);
}

.arcade-daily-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.arcade-daily-title {
  margin: 0;
  font-size: 22px;
  letter-spacing: -0.03em;
}

.arcade-daily-sub {
  margin: 0;
  color: var(--arcade-muted);
  font-size: 11px;
}

.arcade-daily-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 6px;
}

.arcade-daily-label {
  color: var(--arcade-muted);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.arcade-daily-attempts,
.arcade-daily-reset {
  display: flex;
  align-items: center;
  gap: 8px;
}

.arcade-daily-pip {
  width: 16px;
  height: 6px;
  border: 1px solid var(--arcade-line-strong);
  border-radius: 999px;
  background: transparent;
}

.arcade-daily-pip-used {
  border-color: var(--game-accent);
  background: var(--game-accent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--game-accent) 55%, transparent);
}

.arcade-daily-count {
  color: var(--arcade-muted);
  font-size: 10px;
}

.arcade-daily-reset-value {
  color: var(--arcade-fg);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.arcade-daily-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.arcade-boards-tabs {
  display: flex;
  gap: 6px;
}

.arcade-tab {
  appearance: none;
  padding: 5px 10px;
  border: 1px solid var(--arcade-line);
  border-radius: 999px;
  background: transparent;
  color: var(--arcade-muted);
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.arcade-tab:hover {
  color: var(--arcade-fg);
  border-color: var(--arcade-line-strong);
}

.arcade-tab-active {
  color: var(--game-accent);
  border-color: color-mix(in srgb, var(--game-accent) 50%, var(--arcade-line));
  background: color-mix(in srgb, var(--game-accent) 10%, transparent);
}

.arcade-boards {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 18px;
}

.arcade-boards-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-top: 4px;
}

.arcade-boards-heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.arcade-boards-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--arcade-line);
}

.arcade-boards-controls .arcade-select {
  min-width: 150px;
}

.arcade-boards-you {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 14px;
  padding: 12px 14px;
  border: 1px solid var(--arcade-line);
  border-left: 3px solid var(--game-accent);
  border-radius: 10px;
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--game-accent) 9%, transparent), transparent 60%),
    var(--arcade-panel);
}

.arcade-boards-you-label {
  flex-basis: 100%;
  color: var(--arcade-coin);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.arcade-boards-you-rank {
  color: var(--game-accent);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.arcade-boards-you-score {
  color: var(--arcade-muted);
  font-size: 11px;
}

.arcade-boards-signin {
  margin-left: auto;
  align-self: center;
}

.arcade-boards-list {
  max-height: none;
  padding: 6px;
  border: 1px solid var(--arcade-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--arcade-panel) 72%, transparent);
}

.arcade-boards-row {
  grid-template-columns: 52px minmax(0, 1fr) auto;
  padding: 8px 10px;
}

.arcade-board-row-you {
  border-radius: 6px;
  background: color-mix(in srgb, var(--game-accent) 12%, transparent);
  border-bottom-color: transparent;
}

.arcade-board-row-you .arcade-board-player {
  color: var(--game-accent);
  font-weight: 700;
}

.arcade-boards-list .arcade-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  border: 0;
}

.arcade-auth-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--arcade-bg) 74%, transparent);
  backdrop-filter: blur(6px);
}

.arcade-auth-card {
  width: min(430px, 100%);
}

.arcade-auth-code {
  margin: 4px 0;
  padding: 10px;
  border: 1px dashed color-mix(in srgb, var(--arcade-accent) 45%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--arcade-accent) 10%, transparent);
  color: var(--arcade-fg);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-align: center;
  user-select: all;
}

.arcade-auth-link {
  color: var(--arcade-accent);
  font-size: 11px;
  text-align: center;
  word-break: break-all;
}

.arcade-auth-steps {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}

.arcade-auth-step {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.arcade-auth-step-num {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--arcade-accent) 38%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--arcade-accent) 16%, transparent);
  color: var(--arcade-accent);
  font-size: 11px;
  font-weight: 700;
}

.arcade-auth-step-title {
  color: var(--arcade-fg);
  font-size: 12px;
  font-weight: 600;
}

.arcade-auth-step-detail {
  color: var(--arcade-muted);
  font-size: 11px;
}

.arcade-auth-step .arcade-btn,
.arcade-auth-step .arcade-auth-link {
  margin-top: 6px;
}

.arcade-auth-step .arcade-auth-link {
  display: inline-block;
  text-align: left;
}

.arcade-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 16px;
  border-top: 1px solid var(--arcade-line);
  color: var(--arcade-muted);
  font-size: 9.5px;
  letter-spacing: 0.04em;
}

.arcade-toast {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 50;
  max-width: min(420px, calc(100vw - 32px));
  padding: 9px 14px;
  border: 1px solid color-mix(in srgb, var(--arcade-accent) 42%, transparent);
  border-radius: 999px;
  background: var(--arcade-panel);
  color: var(--arcade-fg);
  font-size: 11px;
  box-shadow: 0 12px 40px var(--arcade-shadow);
  animation: arcade-toast-in 160ms ease-out;
}

@keyframes arcade-toast-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.arcade-empty {
  padding: 30px;
  border: 1px dashed var(--arcade-line-strong);
  border-radius: 12px;
  color: var(--arcade-muted);
  text-align: center;
}

@media (max-width: 640px) {
  .arcade-main {
    padding: 12px;
  }

  .arcade-boards-head {
    flex-direction: column;
  }

  .arcade-boards-signin {
    margin-left: 0;
  }

  .arcade-daily {
    align-items: flex-start;
  }

  .arcade-daily-actions {
    width: 100%;
  }

  .arcade-daily-actions .arcade-btn {
    flex: 1;
  }

  .arcade-hud {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .arcade-game-actions {
    width: 100%;
  }

  .arcade-select {
    flex: 1;
  }

  .arcade-card-desc {
    min-height: 0;
  }

  .arcade-foot {
    display: none;
  }

  .arcade-cabinet-title {
    font-size: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .arcade *,
  .arcade *::before,
  .arcade *::after {
    animation: none !important;
    transition: none !important;
  }
}
`
