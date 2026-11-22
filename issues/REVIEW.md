# Review: issues (Boards), `issues-pane.js`

Reviewer did not write this pane. Checked by reading the code and by running it on the test pod, ports 9565 (me) and
9566 (bob). Test data in `me/public/suite-data/issues-review/`. Screenshots: `tests/shots/review-*.png`.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | issues-pane.js:622-640, 589-604 | **Edit loses data with `{` `}` in the text (REPORT.md #5), and says "Saved."** Edited "Edit me" to title `Use {braces} here`, description `a } b`: status "Saved.", the card shows the new title, but on the pod the issue now has NO `dc:title` and NO `wf:description` (both old values deleted, new ones lost). After a reload the card is called "Iss1" (shot `review-shell-1300.png`). | Re-read the state file after every save (the suite brief requires it) and compare; say "Not saved as typed" when it differs. Better: avoid the SPARQL route for literals with braces (send an N3 Patch, or PUT the whole state file with If-Match). |
| 2 | bug | issues-pane.js:650-670 | **New issue with `}` in the title is not stored, but the pane says `Added "Brace } new".`** The pod file has no such issue; it disappears on reload. Same server bug, same missing re-read. | As #1. |
| 3 | bug | issues-pane.js:635, 663 | A failed save throws away what was typed: `editing = null` / `adding = false` are set before `change()`, so on any error (403, 409, 500) the form is gone with the title and description. Checked with a failing updater: form gone, only "Not saved: …" left. | Clear `adding`/`editing` only when `change()` returns true; redraw the form with the typed values otherwise. |
| 4 | bug | issues-pane.js:597-600 | Two people: when bob moved a card and me then moved the same card from her stale page, the server rightly refused (409, pod stays consistent) but the pane shows `Not saved: Web error: 409 (Conflict) on PATCH of <http://…/state.ttl>` and leaves the card where it was (To do, though it is Done on the pod) until a manual reload. | On 409 (and 412) reload the state file (`load(true)`) and say "Someone else changed this issue; the board is up to date now. Try again." |
| 5 | bug | issues-pane.js:792-794 | Refresh is drawn only for people who can write. A read-only viewer (bob on a board shared read-only; anyone logged out) cannot refresh, and there are no live updates (me's page still showed bob's old state 3 s after his move), so they must reload the whole page. | Draw Refresh for everyone; only New issue needs `writable`. |
| 6 | bug | issues-pane.js:437-445 | `canWrite` treats `append` as write. With an Append-only ACL every control is shown, but Move/Edit/Unassign delete triples and will be refused (403). Not run (no append-only share made); follows from the code. | `writable` = `write` for move/edit/assign; `append` alone could allow only New issue. |
| 7 | nit | issues-pane.js:546-553, 882-883 | The message line never clears. After "Give it a title." and Cancel, the red note stays. A success line ("Moved to Doing.") stays until the next action, and while it is there the "You can see this tracker but not change it" note is suppressed. | Clear the line on Cancel and on the next draw after a success (or time it out like a toast). |
| 8 | design | issues-pane.js:240-241, 834-838 | At 400 px the column switcher is `iss-chip` buttons with `role="tab"`, measured 28 px tall. DESIGN.md rule 5: tabs are ≥ 44 px; chips are the exception only as filters or labels. These are the main navigation of the board on a phone. | Use the sheet's `tabs`/`tab` recipe (44 px), or make the chips 44 px tall. |
| 9 | design | issues-pane.js:248, 273 | Raw pixel values outside the tokens: `.iss-count { min-width: 24px; line-height: 22px }`, `.iss-navbox { gap: 2px }`. DESIGN.md rule 7 / "do not invent sizes". | `min-width: var(--sui-space-6)`, `line-height: var(--sui-space-6)` (or the chip/nav-count recipe), `gap: var(--sui-space-1)`. |
| 10 | nit | issues-pane.js:779, 785 | Titles are not shortened on cards (only descriptions are). A 3000-character title from data makes one card 4219 px tall at 1300 px (`review-hostile-1300.png`, `review-hostile-400.png`). Typed titles are capped at 200, but data from SolidOS or elsewhere is not. | `shorten(issue.title, 120)` on cards; full title on the issue page and in the details. |
| 11 | nit | issues-pane.js:781-782 | In the shell a card is `role="button"` with `aria-selected`; `aria-selected` is not allowed on a button role, so screen readers ignore it. | Use `aria-pressed`, or `aria-current="true"` for the open card. |
| 12 | nit | issues-pane.js:419 | `personName` of a `javascript:alert(2)` assignee shows "alert(2)". Harmless (text only, never a link), but a name made from a non-http address is noise. | Show "Unknown person" for non-http(s) WebIDs. |

## Two-person: what was tested, result

`tests/two-person.mjs` (added to `tests/run.mjs`), me on 9565 and bob on 9566, three trackers written fresh each run
under `suite-data/issues-review/` with JSON-LD ACLs: `rw/` (bob Read+Write), `ro/` (bob Read), `priv/` (me only),
and `half/` (bob may read the settings, not `state.ttl`).

- me adds "Fix the gate". Bob, logged in as bob in his own browser, sees both of me's cards and has the controls;
  he adds "Bob paints the shed", assigns it to himself, moves it to Doing. The pod file has it in Doing only, with
  `wf:assignee` and `dc:author` bob. **PASS**
- me reloads: bob's card in Doing, "Bob Tester" (from his profile), her two cards unchanged; the issue page says
  "by Bob Tester" and "Assigned to Bob Tester". **PASS**
- Read-only board: bob sees the card, zero controls (no New issue, Move, Edit, Assign), the note "You can see this
  tracker but not change it."; in the shell the card's details open with no controls; his own PATCH gets 403. **PASS**
- Private board: the data browser's own "Access denied" (the pane cannot tell it is a board). `half/`: the pane says
  "You are not allowed to see these issues.", no controls. **PASS**
- Stale page race: bob moves a card to Done; me, not reloaded, moves it to Doing → 409, the pod keeps ONE state
  (Done). **PASS** for data safety; the message and the stale card are finding #4. No live update reached me's page.

Result: `node tests/two-person.mjs` → all passed (23 PASS lines); the whole `node tests/run.mjs` ends EVERY TEST PASSED.

## Checked and fine

- Safety: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; markup in titles, state labels and names shows as text (`<img onerror>` title, `<b>` label, `<script>` name: no element made, no alert); links are http(s) only with `rel="noopener"` (a `javascript:` author is never a link).
- Writes: every non-GET is the README's list — `mintNew` PUTs (with `If-None-Match: *`), `updater.update` in move / assign / edit / add; nothing on open; nav reads only.
- Races: double clicks are blocked by `busy` + disabled controls; no controls exist until the load and the WAC check finish.
- Errors: 403 on the issues file and server refusals are shown (wording of 409 aside, #4).
- JSS #4 (`dct:created`): kept as `dct:` on this path, and the pane reads both `dct:` and `dc:` created anyway.
- Design: tokens and recipes embedded (`--check` current); 44 px buttons, icon buttons, selects, nav items and detail controls (measured); pill buttons, 12 px cards, empty columns; shell contract (nav, details with `onClose`, (i) board details, toasts) followed.
- 400 px: true 400 px (`design/viewport.mjs`) alone, in the shell, with details open, and the issue page: no sideways scroll (`review-shell-400*.png`, `review-hostile-400.png`).
- Two-person sharing behaviour: as above.

## After reading NOTES.md

The author already knew: #8 (chips chosen over the sheet's tabs on purpose, as "filters"; they still act as 28 px
tabs), #6 in part (`append` counted as write is stated, its consequence is not), and that live updates were untested
(#5 shows they do not arrive here). Not in the notes: #1–#4 (no re-read after save, REPORT #5 not guarded, typed text
lost on failure, raw 409), #7, #9–#12. The "second person cannot be tested" line is now covered by `tests/two-person.mjs`.

## Fixed (author, after this review)

| # | fix | regression check |
|---|---|---|
| 1, 2 | Every write is now an N3 Patch per document (literals escaped by the pane), not SPARQL Update, so `{` `}` survive. After every save the pane reads each written document again (fresh, `no-cache`, into its own graph, then swaps it into the store; a forced `fetcher.load` made the data browser redraw the pane) and says "Saved"/"Added" only if the pod holds what was meant, else "Not saved as typed …". `dct:created` read back as `dc:created` (JSS #4) still counts as stored. | `issues.mjs`: "edit with braces …", "new issue with braces …" (pod file checked) |
| 3 | `adding`/`editing` are cleared only when the save is confirmed; the form keeps what was typed (`draft`) on any failure. | `issues.mjs`: "a failed save says so and keeps the form with what was typed", "the pod file still has the old title" |
| 4 | 409/412: "Someone else changed this meanwhile, so it was not saved. The board now shows the latest; try again." and the state file is read again, so the card moves to where the pod has it. | `two-person.mjs`: race checks now expect that message and the card in Done without a reload; `issues.mjs`: "a conflict (409) …" |
| 5 | Refresh is drawn for everyone (logged out and read-only too). | `sample.mjs`: "logged out, Refresh is still offered"; `two-person.mjs`: "read-only board: he can still refresh it" |
| 6 | `access()` returns write and append separately: move/edit/assign need write; append alone gives New issue only, with the note "You can add issues to this tracker but not change them." | `two-person.mjs`: new `app/` board (bob Read+Append): "append-only board: New issue only …" and his new issue |
| 7 | Cancel clears the message line; a success line clears itself after 6 s and the standing note comes back. | `issues.mjs`: "Cancel clears the error line" |
| 8 | Column switch chips are 44 px tall (`--sui-target`). | `sample.mjs`: "400 px: the column switches are 44 px targets" |
| 9 | `.iss-count` uses `--sui-space-6`; `.iss-navbox` gap `--sui-space-1`. | `embed --check` (sheet untouched); by reading |
| 10 | Card titles are cut at 120 characters; full title on the issue page and in the details. | `issues.mjs`: "a long title is cut short on its card" |
| 11 | The open card is `aria-current="true"` (not `aria-selected` on a button). | `shell.mjs`: selectors use `aria-current` |
| 12 | `personName` shows "Unknown person" for a non-http(s) WebID. | `issues.mjs`: "an assignee that is not a web address shows as "Unknown person"" |

Also found while fixing: removing a document's statements must copy the list first (`statementsMatching(...).slice()`),
or rdflib's own index is mutated while it is walked and half the old statements stay. `two-person.mjs` now uses ports
9517/9518.
