# Phase 2: restyle a pane into the suite

You take one (or two) existing panes into the suite's look. Rules: `~/ideas/suite/BRIEF.md`, which makes
`~/ideas/panes-lab/BRIEF.md` apply in full. Read both first.

Then read, in this order:
1. `~/ideas/suite/design/DESIGN.md` all of it — especially "Recipe for a phase-2 agent (copy exactly)", "The shell and
   the app-pane contract", "Rules for a pane inside the shell" and "Testing". Open `design/samples.html` in your
   browser (http://127.0.0.1:8732/me/public/suite/design/samples.html) and look at it.
2. `~/ideas/suite/shell/suite-shell-pane.js` (SUITE_APPS near the top shows how your pane is launched) and
   `shell/suite-shell-demo-pane.js` — the worked example of `renderNavigation` / `renderDetails`.
3. Your pane, its README, NOTES and tests.

What to do:
- Restyle with the sheet's tokens and recipes (`--sui-*`, the fallback block via `design/embed.mjs`, run its
  `--check`). No new colours, sizes or radii. Material Design Icons inline as `data:` URIs.
- Add navigation and/or details only where your task says the Nextcloud app has them, through the contract.
  Content-only must still work when the pane is opened alone (no `context.suite`).
- Keep behaviour. No new features beyond matching the layout. Keep the pane `name` and file name.
- Tests: switch every `open()` to YOUR port(s) (they currently use old 94xx ports). Keep all existing checks passing
  (update selectors where markup changed, never delete a behavioural check to make it pass). Add: the pane inside
  the shell (see DESIGN.md "Testing"), nav/details if you added them, no sideways scroll at 1300 and a TRUE 400 px
  (`design/viewport.mjs`). `node tests/run.mjs` must end `EVERY TEST PASSED`.
- LOOK at your screenshots at both widths, alone and in the shell, next to `design/samples.html`. Fix what looks
  poor or off-sheet.
- Update README (what changed, MDI credit, still lists exactly what it writes) and NOTES (judgement calls, unverified,
  "Needs a decision").
- Write only in your folder(s) and your `suite-data/<folder>/`. Do NOT edit design/, shell/, lib/ or any other pane.
  If the sheet or shell needs a change, write the exact need under "Needs a decision" in your NOTES.
- Other agents run browsers at the same time; use only your ports. If a test is flaky under load, make it wait
  on a condition, not a longer sleep.
