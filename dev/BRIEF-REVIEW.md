# Phase 4: review a suite pane you did not write

You are a reviewer. You did not write this code. Be sceptical and specific; a review that finds nothing on 800 lines
is probably not looking hard enough, but do not invent problems either — every finding needs a concrete failure.

Read: `~/ideas/suite/BRIEF.md` (rules), `~/ideas/panes-lab/BRIEF.md` (hard rules), `~/ideas/suite/design/DESIGN.md`
(the sheet and the shell contract), and look at http://127.0.0.1:8732/me/public/suite/design/samples.html.
Then the pane's code, README and tests. Do NOT read the pane's NOTES.md (the author's own account) until you have
written your findings; then you may read it to see whether the author already knew.

Check:
1. Correctness: every action does what the README says; reload reads back; races (double click, save during load);
   errors from the server shown, not swallowed; JSS quirks in `~/ideas/panes-lab/jss-findings/REPORT.md` respected.
2. Safety: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; links only http(s)/mailto/tel with
   `rel="noopener"`; no writes outside what the README lists (read the code for every fetch with a method other
   than GET, every `updater.update`, every PUT/PATCH/DELETE/POST); hostile data (names with markup, `javascript:`
   URIs, huge values) handled.
3. Design: matches the sheet (tokens, recipes, 44 px targets, pill buttons, list rows), alone and inside the shell;
   the nav/details contract followed as DESIGN.md states it.
4. 400 px: no sideways scroll at a TRUE 400 px (`design/viewport.mjs`), nothing cut off or overlapping. Look at
   screenshots yourself — take your own.
5. Two-person (only where your task says): write `tests/two-person.mjs` in the pane's tests folder using
   `open({ as: 'bob' })` and a `me` browser side by side (see `~/ideas/suite/two-person/` for working examples), and
   add it to the pane's `tests/run.mjs`. Test what a second person really does with this app (sees what was shared,
   cannot write what was not, sees the other's change after reload).

You may write ONLY: `<pane folder>/REVIEW.md`, `<pane folder>/tests/two-person.mjs` (+ its line in `tests/run.mjs`),
your own screenshots under `<pane folder>/tests/shots/review-*`, and test data under
`~/ideas/jss-data/me/public/suite-data/<pane folder>-review/` (and bob's pod equivalent if needed). Do NOT fix the
pane — the author will. Use only the ports in your task.

`REVIEW.md` format: a table `# | severity (bug / safety / design / 400px / nit) | where (file:line) | what fails, concretely | suggested fix`,
then "Two-person: what was tested, result", then "Checked and fine:" one line per area.

Final message, under 150 words: counts per severity, the 3 worst findings in one line each, two-person result,
and whether `node tests/run.mjs` still ends EVERY TEST PASSED with your two-person test added (if it fails because
of a real bug, say so — that is a finding, not your failure).
