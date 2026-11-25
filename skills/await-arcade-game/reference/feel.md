# Feel requirements

Rules for how a cartridge *plays*, as opposed to how it computes. They are
game-agnostic: every rule below is stated as observable behaviour, so it can be
reviewed from a screenshot, a DOM assertion or a browser smoke — not from taste.

A cartridge can be deterministic, replay-verified and fully tested and still feel
like an unfinished prototype. These rules exist because that happened: Tile Chain
Drop shipped correct and illegible, and the polish pass that fixed it is the
model for this list.

## F1 — The goal is on screen, always

While playing, the view shows: the objective in the game's own words, the numeric
progress toward it, and what ends the run (drops left, depth, attempts).

- Put a single **goal strip** above or beside the board: `Goal: 12/32 clears
  (20 left)` + `8 drops left`, with a fill bar.
- Give the strip a **warn state** when the end is near and the goal is unmet, and
  a met state on a win.
- In an endless/depth mode the same strip shows the *next milestone*, not a
  score (`Next cracked row in 3 drops`).

Check: a screenshot mid-run states the objective, progress and remaining life
without reading the README.

## F2 — The score is live and reconstructible

Show the components that the ranking uses, updating as they change
(`Pts 240 · Chain ×3`), not only at the end. A player must be able to explain
their number from what is on screen.

- No hidden multipliers. If a value is computed from several parts, show them.
- What is *not* shown — an elapsed-time tiebreak, a server timestamp — is stated
  once in the mode hint (`Daily rank: score, then server time`).
- Board rows must show the same shape the shell ranks by, including the tiebreak
  (see `reference/scoring.md`).

Check: read the final score aloud from the UI alone.

## F3 — Instructions exist and get out of the way

A guide that:

1. opens on a **fresh run** of a first-time state (zero moves), so a new player
   meets the rule at the moment it matters;
2. states in one sentence what you control and what wins;
3. gives **one worked example** of the core rule using the game's own vocabulary
   ("a 4 needs a run of four");
4. is dismissible and **re-openable** by a documented key or button, with the
   control listed in `meta.controls`;
5. never blocks input, and closes on the first action;
6. says plainly what the game is *not*, when players reliably misread it
   ("nothing falls or rotates").

Check: launch a fresh game — the rule is legible before the first input, and one
keypress hides it.

## F4 — Foresight before commitment

When the engine can compute the consequence of the pending action cheaply, show
it **before** the player commits: outline the tiles that would clear, ghost the
landing cell, preview the value. Say it in words too (`this clears 3`).

The preview must be a **pure function of state, sharing the engine's own
resolution path**, so it cannot disagree with the real move — and it must be
tested against that path. If a preview is impossible to compute purely, do not
fake one.

Check: a test asserts the preview's cells and the committed move agree, and a
screenshot shows the affordance.

## F5 — Every action is visible, and nothing hides the input

A committed action produces visible change:

- a landing/hit cue;
- a **staggered clear**: one animation per cascade wave, roughly 150–300 ms, so a
  chain reads as a chain; then catch up rather than queue;
- a distinct cue for damage/loss, not just a colour swap;
- a status line that says what happened in words (`Chain cleared 4 tiles for 40
  points`).

Presentation only: the engine state advances immediately, and input is accepted
during playback. Animations must never delay or swallow a queued input.

Check: perform one multi-wave action — each wave reads separately, and rapid
inputs during playback are not lost.

## F6 — An interruption costs nothing

Ranks are replay-derived; a pause, an agent turn or a walk away must not change
state, value or eligibility (`reference/scoring.md`). Guide overlays, timers and
animations must not advance the game or the clock that ranks it.

Check: the same replay scored before and after a long pause is identical.

## F7 — Accessible and parity-clean

`aria-live` announces outcomes; interactive elements have names; keyboard reaches
everything the pointer can; reduced motion disables animation but keeps the
state change and the status text; the cartridge reads in light and dark.

Check: `reference/visual-language.md` checklist, plus a keyboard-only run.

## F8 — Edge states have their own copy

Distinct, specific sentences for: start, win, loss, blocked input, out of
attempts, and error. Never one generic "Game over" for every ending.

Check: force each terminal state and read the copy.

## F9 — Each mode explains itself

Every mode states its objective and what ranks it. Mode chips and the shell's
mode hint agree with `meta.modes` and `score`.

Check: switch modes — the goal strip and the hint both change to match.

## F10 — Difficulty is measured, not assumed

Before the PR is ready, measure with a simulation across **at least 200 seeds**
per mode: a uniform-random policy and a naive greedy policy (maximise the visible
objective one step ahead).

- Random should win well under a third of runs; naive-greedy roughly half.
- If random wins more than a third, the target or the board is too generous.
- Publish both win rates in the PR body, and re-measure after any rules change.

Check: the numbers are in the PR and reproducible from a script in the tree.

## F11 — A feel budget

Bounded work: ~300 ms per animation wave, no unbounded timers, no idle
`requestAnimationFrame` loop, no layout shift while playing, and no per-frame
allocation storms in the view. The cartridge must hold frame rate on a modest
laptop inside the host webview.

Check: `reference/rendering.md` performance notes plus an idle CPU sanity check.

## Using these in a loop

- **Architect brief:** quote F1–F9 as numbered player-facing requirements with
  the specific affordances for this game, and F10 as a measurement plan.
- **Brief review before any code:** a second reviewer reads only the brief and
  answers "what case does this not cover?". The defects that cost a whole
  remediation round live in briefs — an unstated overflow rule, a missing terminal
  state — and a diff review cannot see them until the implementation exists.
- **Reviewer:** review them explicitly, separately from determinism and scoring;
  a finding must point at a line or a missing element, and a verdict cannot be
  APPROVE with an unmet F1–F5.
- **Implementer:** TDD the pure parts (preview, goal arithmetic, status copy) and
  leave the animation to the view.
- **Adjudicator:** browser-smoke each rule and paste the evidence into the PR.
  "It builds" is not evidence that the goal is legible.

## Evidence for this list

Tile Chain Drop, PR #9: the cartridge passed 187 tests and every fixture while a
player could not tell how to win. The polish that followed — a goal strip, live
chain points, a pop-and-shatter playback through a `traceDrop()` preview, and a
show/hide guide — is what turned it into a game, and the difficulty target had to
be measured (random won 67% before, 15% after) rather than guessed.
