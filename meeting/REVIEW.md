# Review: meeting

Reviewed 22 Nov 2026 against `BRIEF-REVIEW.md`. Probes in a logged-in headless Chromium on port 9573 against a test
meeting at `suite-data/meeting-review/m1/index.ttl` (left there, now holding the broken state of finding 2), plus the
sample in the suite shell. Screenshots: `tests/shots/review-*`. NOTES.md read only after the findings were written.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | meeting-pane.js:577-588, 846-875 | **Silent loss of the notes.** Save goes through `store.updater.update` (SPARQL PATCH) and nothing re-reads the file. JSS finding 5: a literal with `}` makes the server delete the old value and drop the new one, answering 204. Tested: Notes set to `Agree budget {draft} }`, Save: the status says "Saved." and the page shows the new notes, but the pod's file has no `cal:comment` at all (the old "Original notes." is gone too), and after a reload Notes is empty. The same goes for the title and the place. The suite brief says to re-read after every save. | Save the details the way the list is saved (read fresh, change, PUT with `If-Match`), or use N3 Patch (clean for finding 5), and in any case read the file back and say "Not saved as typed" when it differs. |
| 2 | bug | meeting-pane.js:794-797 | An https address with two apostrophes is accepted and breaks the meeting for every later list change. Tested: Add "Quotes" → `https://example.org/bob's-and-carol's` ("was added"); then Add "Next" → "Not saved: the pod refused it (400)". The served Turtle now holds NUL bytes (JSS finding 3b); moving or removing items fails the same way. | Percent-encode `'` in the address before writing (`address.href.replace(/'/g, '%27')`), which is the same address. |
| 3 | bug | meeting-pane.js:713-716 | "Remove takes two presses" is beaten by a double-click: the first click redraws the row with the armed "Press again to remove" button under the pointer and the second click of the same double-click removes the item. Tested with a real CDP double-click on the bin: "Minutes was removed." | Ignore the confirming press when `event.detail > 1`, or for ~500 ms after arming. |
| 4 | nit | meeting-pane.js:340 | `icsText` turns `\n` and `\r\n` into `\n` but leaves a lone `\r`. A title, place or notes from a hostile file with `\r` can start a new line in the `.ics` for lenient calendar apps (e.g. `\rATTENDEE:…`). Read from the code, not tried in a calendar app. | Replace `/\r\n|\r|\n/g`. |
| 5 | design | meeting-pane.js:690-695 | In "For this meeting" only the item's name text (20 px tall) is the link; the 56 px row around it does nothing on click. The sheet's rows are the target (the data pane makes the whole row open its thing). | Make the row open the item (click on the row, not on its buttons), as the data pane does. |

## Two-person

Not in this task ("no two-person tests"). Not tested.

## Checked and fine

- List changes (add, move, remove) read fresh, PUT with `If-Match`, read back; after a rewrite the file is stored as JSON-LD and a later PATCH (title) kept the list intact (JSS finding 6 did not bite: the list is an `rdf:first` chain there). Busy flag stops double saves.
- Writes: only what the README lists (mintNew PUT with `If-None-Match: *`, the details PATCH, the list PUT); no ACL written.
- Hostile data: everything via `textContent`; item links http(s)/mailto/tel only, web pages `target=_blank rel=noopener`; "Where" is a link only for http(s); only https accepted for new links.
- Code: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`.
- Access: write controls only when `WAC-Allow` says `user="…write…"`; logged out sees no controls and a note.
- Design: header card, chips, pill inputs, one primary (Save), 44 px icon buttons; in the shell the left column lists Overview and the items, 44 px each.
- 400 px: true 400 px (`design/viewport.mjs`) alone as an editor (forms open) and in the shell: no sideways scroll; only the 20 px item links are under 44 px (finding 5).

## Fixed

| # | fix | proof |
|---|---|---|
| 1 | Details saved by whole-file PUT + If-Match (no SPARQL patch), read back; "Saved." only if every field reads back as sent, else "Not saved as typed: …". | `tests/meeting.mjs`: notes `Agree budget {draft} }` → "Saved.", the served file has `{draft} }`, still shown after a reload. |
| 2 | `'` in a new address written as `%27`. | `meeting.mjs`: add `https://example.org/bob's-and-carol's`, then another link: both saved, file has `bob%27s-and-carol%27s`, no NUL bytes. |
| 3 | Confirming press ignored when `event.detail > 1` or within 400 ms of arming. | `meeting.mjs`: real CDP double-click on the bin only arms it; the item stays in the page and the file. |
| 4 | `icsText` escapes `\r\n`, `\r` and `\n`. | Code (one regex); not tried in a calendar app. |
| 5 | A click anywhere on an item's row opens it via its link (not on buttons or the link). | `tests/sample.mjs`: clicking the Shared notes row opens SharedNotes. |
