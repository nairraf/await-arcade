export const styles = `
.arcade {
  --arcade-bg: #070a0f;
  --arcade-panel: #0d131b;
  --arcade-panel-2: #121a24;
  --arcade-line: rgba(148, 163, 184, 0.18);
  --arcade-line-strong: rgba(148, 163, 184, 0.32);
  --arcade-fg: #e6edf3;
  --arcade-muted: #8b98a9;
  --arcade-cyan: #22d3ee;
  --arcade-pink: #f472b6;
  --arcade-amber: #fbbf24;
  --arcade-green: #4ade80;
  --arcade-red: #fb7185;
  --arcade-radius: 14px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--arcade-fg);
  background:
    radial-gradient(1200px 600px at 15% -10%, rgba(34, 211, 238, 0.12), transparent 60%),
    radial-gradient(900px 500px at 110% 10%, rgba(244, 114, 182, 0.1), transparent 55%),
    var(--arcade-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

.arcade *,
.arcade *::before,
.arcade *::after {
  box-sizing: border-box;
}

.arcade-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--arcade-line);
  background: linear-gradient(180deg, rgba(18, 26, 36, 0.9), rgba(7, 10, 15, 0.4));
  backdrop-filter: blur(8px);
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
  width: 28px;
  height: 28px;
  border: 1px solid rgba(34, 211, 238, 0.5);
  border-radius: 8px;
  color: var(--arcade-cyan);
  background: rgba(34, 211, 238, 0.08);
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.18);
  font-size: 15px;
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
  gap: 8px;
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
  background: rgba(148, 163, 184, 0.06);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.arcade-badge {
  border-color: rgba(34, 211, 238, 0.35);
  color: var(--arcade-cyan);
  background: rgba(34, 211, 238, 0.08);
}

.arcade-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px;
}

.arcade-launcher {
  max-width: 980px;
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
  color: var(--arcade-pink);
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
  max-width: 62ch;
  color: var(--arcade-muted);
  font-size: 12px;
}

.arcade-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.arcade-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--arcade-line);
  border-radius: var(--arcade-radius);
  background: linear-gradient(160deg, rgba(18, 26, 36, 0.96), rgba(10, 15, 21, 0.96));
  overflow: hidden;
  cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.arcade-card:hover {
  transform: translateY(-2px);
  border-color: var(--arcade-line-strong);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}

.arcade-card-marquee {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 92px;
  padding: 12px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 4px),
    radial-gradient(140% 140% at 20% 0%, rgba(34, 211, 238, 0.36), transparent 55%),
    radial-gradient(120% 120% at 100% 100%, rgba(244, 114, 182, 0.34), transparent 55%),
    #0a1119;
  border-bottom: 1px solid var(--arcade-line);
}

.arcade-card-marquee::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(7, 10, 15, 0.7));
  pointer-events: none;
}

.arcade-card-glyph {
  position: relative;
  z-index: 1;
  font-size: 44px;
  font-weight: 800;
  line-height: 0.85;
  color: rgba(230, 237, 243, 0.92);
  text-shadow: 0 0 24px rgba(34, 211, 238, 0.45);
}

.arcade-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 13px 13px;
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
  background: rgba(148, 163, 184, 0.08);
  color: var(--arcade-fg);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
}

.arcade-btn:hover {
  background: rgba(148, 163, 184, 0.16);
  border-color: rgba(226, 232, 240, 0.4);
}

.arcade-btn:active {
  transform: translateY(1px);
}

.arcade-btn:focus-visible,
.arcade-select:focus-visible,
.arcade-card:focus-visible {
  outline: 2px solid var(--arcade-cyan);
  outline-offset: 2px;
}

.arcade-btn-primary {
  border-color: rgba(34, 211, 238, 0.55);
  background: rgba(34, 211, 238, 0.16);
  color: #d9fbff;
}

.arcade-btn-primary:hover {
  background: rgba(34, 211, 238, 0.26);
}

.arcade-btn-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--arcade-muted);
}

.arcade-btn-ghost:hover {
  background: rgba(148, 163, 184, 0.1);
  color: var(--arcade-fg);
}

.arcade-game {
  position: relative;
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.arcade-game-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.arcade-game-title h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.arcade-game-title p {
  margin: 2px 0 0;
  color: var(--arcade-muted);
  font-size: 11px;
  max-width: 60ch;
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
    rgba(148, 163, 184, 0.08);
  color: var(--arcade-fg);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
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
  border-radius: 10px;
  background: rgba(18, 26, 36, 0.7);
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
  padding: 12px;
  border: 1px solid var(--arcade-line);
  border-radius: var(--arcade-radius);
  background:
    radial-gradient(120% 100% at 50% 0%, rgba(34, 211, 238, 0.06), transparent 60%),
    #05080c;
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
  border-radius: 8px;
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
  background: rgba(148, 163, 184, 0.08);
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
  background: rgba(4, 7, 11, 0.72);
  backdrop-filter: blur(6px);
  z-index: 5;
}

.arcade-overlay[hidden] {
  display: none;
}

.arcade-overlay-card {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border: 1px solid var(--arcade-line-strong);
  border-radius: var(--arcade-radius);
  background: linear-gradient(160deg, rgba(18, 26, 36, 0.98), rgba(9, 13, 19, 0.98));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
  text-align: center;
}

.arcade-overlay-kicker {
  color: var(--arcade-pink);
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
  color: var(--arcade-cyan);
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
  border: 1px solid rgba(34, 211, 238, 0.4);
  border-radius: 999px;
  background: rgba(9, 13, 19, 0.96);
  color: var(--arcade-fg);
  font-size: 11px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  animation: arcade-toast-in 160ms ease-out;
}

@keyframes arcade-toast-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.arcade-empty {
  padding: 30px;
  border: 1px dashed var(--arcade-line-strong);
  border-radius: var(--arcade-radius);
  color: var(--arcade-muted);
  text-align: center;
}

@media (max-width: 640px) {
  .arcade-main {
    padding: 12px;
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
