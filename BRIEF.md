# Suite: the brief every agent works to

The suite turns the lab panes into one product for a Solid pod, laid out and styled the way a Nextcloud user would
recognise at once. The full goal is in `~/cos/handoffs/suite/HANDOFF.md`; read its "goal" table (what to take from
Nextcloud and what not to).

**`~/ideas/panes-lab/BRIEF.md` applies in full**, with these changes:

| Lab brief says | In the suite |
|---|---|
| Write only in `~/ideas/panes-lab/<name>/` | Write only in `~/ideas/suite/<your-folder>/` (given in your task) |
| Test data in `lab-data/<name>/` | Test data in `~/ideas/jss-data/me/public/suite-data/<your-folder>/`, served at `http://127.0.0.1:8732/me/public/suite-data/<your-folder>/` |
| Served at `/me/public/lab/` | The suite is served at `http://127.0.0.1:8732/me/public/suite/` (`LAB` in the helper now points there) |
| One test user | Two: `me` and `bob` (`open({ as: 'bob' })`, `POD2`). See `~/ideas/suite/two-person/` |
| Helper at `~/ideas/panes-lab/lib/` | Helper at `~/ideas/suite/lib/lib.mjs` (same code). Do not edit `lib/` or `local.json` |

Also:

- Read `~/ideas/suite/design/DESIGN.md` and look at `design/samples.html` before styling anything (from phase 2 on).
  Use its tokens and class recipes; do not invent new colours, sizes or radii. If the sheet lacks a piece you
  need, build it from existing tokens and say so in your NOTES.
- Icons: Material Design Icons (Apache 2.0) as inline SVG `data:` URIs only. Credit them in your README.
  No Nextcloud CSS, HTML, JS, Vue components, icons, name or logo.
- Server bugs and their workarounds: `~/ideas/panes-lab/jss-findings/REPORT.md`. Never rely on behaviour it says is
  broken; re-read after every save.
- Keep your pane's `name` as it is unless your task says otherwise (a pane with a built-in pane's name is skipped).
- Do not change JSS, the browser (`~/ideas/dynamic`), the lab, or anything under `~/remote/`. If you need one
  changed, write the exact need in your NOTES under "Needs a decision" and carry on.
- No publishing, no `git push`, no `gh`, no git commits (the coordinator commits). No sudo. Never print
  passwords, keys or tokens; do not list process command lines.
- Viewport at 400 px: the helper's `width: 400` window is really about 500 px of page. Emulate a true 400 px
  with CDP device metrics (see how `design/` does it once phase 1 is done) and say in your NOTES which you used.
- Stay in scope. When your task is done, stop.

## Final message

Under 200 words: the local try-it link; the last lines of `node tests/run.mjs`; what works; what is unverified or
weak; the three most important judgement calls; anything under "Needs a decision". No preamble.
