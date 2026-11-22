# Notes: pad

## Suite phase 2 (restyle)

- **Layout like a text editor.** Toolbar (Refresh, status, avatars) first, sticky at the top of the scrolling column
  (`position: sticky`, not fixed, so it works in the shell's scrolling content column and alone). Refresh moved from
  the foot to the toolbar as an icon button; the "Checked for changes at …" line stays under the hint, muted.
- **Readable width** is `calc(var(--sui-content-max) * .75)` (810 px). The sheet has no "reading width" token; this is
  the old pane's 820 px expressed from a token. If the sheet adds one, use it.
- **Lines are 44 px text boxes that wrap** (review finding 3 and 4): one-row `textarea`s that grow with their wrapped
  text, minimum `--sui-target`. Enter still adds a line; pasted line breaks become spaces; Up/Down move to the next
  line from a one-row line, or from the first/last character of a wrapped one.
- **Details only in the shell, legend only alone.** The task allowed participants in details since the pane already
  shows them. In the shell the legend chips are hidden (`legend.hidden`) and the details column holds the same
  people as rows plus "Made by / Made / File"; the toolbar avatars are a button that opens it. Alone the avatars are
  plain and the legend is shown, so nothing is lost without the shell. The details are drawn when opened and do not
  follow later polls until opened again.
- **Avatars** use the person's pad colour as the background (not the sheet's pale blue), so they double as the
  colour key; initials as the sheet says. At most five, then "+n".
- **Status:** `npd-status` with `-success`/`-error`. The sheet's base now undoes mash.css's green `[role="status"]` box;
  the pane's own undoing stays as a belt, and the tests check there is no box.
- **Pane icon** is MDI pencil in `#00679e` (the shell's Pads tile uses the same pencil).
- **Tests:** port 9521 (bob 9522). True 400 px via `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`)
  in `pad.mjs` (it used a non-mobile override before), `shell.mjs` and `sample.mjs`. Refresh is found by its
  `aria-label`. Added `shell.mjs` and `two.mjs` (a real second person); nothing removed.
- **A real second person now works** (`two.mjs`): bob, given read+write by an ACL, edits me's pad in his own browser,
  his line is written as him with his own participation colour, and me's page picks it up by polling.

### Needs a decision

- The sheet could add a reading-width token.
- Append-only access: the pane shows the pad read-only. An "add a line at the end" that only inserts is impossible in
  this format (the last line's `pad:next` must change), so it would need a different data shape. Decide if wanted.
- Names: a person whose profile is not loaded yet shows as host + path (`127.0.0.1/bob/profile/card.jsonld`) until
  the next reload; unchanged behaviour, but it looks rougher next to avatars.


## Judgement calls (lab phase)

1. **Pane name `notepad`, not `pad`.** The browser already has SolidOS's `pad` pane, and the loader only registers a
   pane whose name is not taken (`if (!panes.byName(pane.name))`), so a pane named `pad` was silently skipped and
   upstream opened instead. The file is still `pad-pane.js`.
2. **Whole-file PUT with If-Match, confirmed by a read-back; last write wins** (changed after review: was one SPARQL
   patch per change, which JSS finding 5 breaks for any text with `}`). Each change is computed from a fresh read,
   applied to the store, the document serialised as Turtle and PUT with the read's ETag; 412 means someone saved in
   between, so it reads again and redoes the change once. After a 2xx it reads the file back and checks the change
   (the line's one text equals what was typed; the new line is in the ring; the removed one is not; the participation
   exists). A save is now three requests (GET, PUT, GET) instead of one; fine for a notepad.
3. **The pane re-reads the file itself instead of `fetcher.load(doc, { force: true })`.** A forced load of the pane's
   own document made the data browser redraw the whole pane (seen in a test: a mark put on the root was gone), which
   threw away the line being typed. Now it fetches the file, parses it into a scratch graph and changes only the
   triples that differ in the shared store. Reloads and saves run in one queue, and drawing is skipped while a reload
   is half done.
4. **`dc:date` (Dublin Core elements) on each line, not `dct:modified`.** Needed for "who wrote it last"; upstream has
   no per-line time. I first used `dct:modified`, but **JSS stores any `dct:` term sent in a PATCH under the `dc:`
   (elements 1.1) namespace** (an inline N3 patch inserting `<http://purl.org/dc/terms/modified>` came back as
   `<http://purl.org/dc/elements/1.1/modified>`). The old value could then never be deleted and piled up. `dc:date`
   is a real elements term and survives. The pane also reads `dct:modified` and the mangled `dc:modified`, and deletes
   all three when it rewrites a line. This JSS bug probably affects other panes that write `dct:` terms; worth reporting.
5. **Changing a line makes it yours** (author replaced), as the brief asked. Upstream keeps the original author on edit.
   Exactly one `dc:author` per line is kept either way, which upstream's consistency check needs.
6. **Colours**: a person's `ui:backgroundColor` from their participation, else upstream's WebID hash (copied
   exactly). Upstream tints lines by the hash only and uses the participation colour only in its participants list, so
   a person whose recorded colour differs from their hash looks different in the two panes. With data upstream wrote,
   they are the same. The sample uses hand-picked colours because the hash makes Bob and Carol nearly the same blue.
7. **No write on opening.** Upstream adds a first line to a pad with none as soon as it opens; this pane shows a
   **Start writing** button instead. Participation is recorded on your first actual change, not on opening.
8. **Write access from `WAC-Allow`** (`user="… write|append …"`), falling back to `updater.editable`. Logged-in people
   without write see the read-only view and a line saying so.
9. **Enter makes a new empty line after the current one**; it does not split the line at the cursor (the brief's
   wording). Indent (`pad:indent`) is shown but not edited.

## Verified

- `node tests/run.mjs` ends with EVERY TEST PASSED: mint, type and leave, pause-to-save, Enter, Backspace, Refresh with a line mid-edit, polling within 10 s, same-line conflict, reload,
  empty pad + Start writing, no sideways scroll at 1300/400, logged-out sample at both widths.
- After every step the file is re-read into a fresh graph and checked with the same rules as solid-ui's
  `consistencyCheck` (ring closed, one next/content/author per line, each line pointed at once).
- SolidOS's own `pad` pane (from the bundle) renders the file this pane wrote, same lines in the same order.

## Unverified or weak

- The lab phase had one user; "someone else" in `pad.mjs` is still direct patches. `two.mjs` (phase 2) now covers
  two real accounts editing different lines; two people typing in the same line at once is still only simulated.
- **mintNew through the folder's Add menu UI** was not clicked; the test calls `mintNew` the way the menu does and
  checks the file. The new folder gets no access rule, so it inherits the parent's.
- **Upstream editing our pad** was not tested: only upstream rendering it. Upstream's own edit path deletes
  `sioc:content` when a line is emptied, which breaks its own check; not our problem but it means pads edited upstream
  can have a line with no content. This pane reads that as an empty line and, on save, writes one content again.
- A line removed by someone else while you type in it: your text is dropped when the next refresh removes the row.
- Polling reads the whole file every 10 s while visible; fine for notes, wasteful for very long pads. No ETag check.
- Paste of several lines goes into one line (line breaks become spaces).
- `Not saved: …` shows the server's message trimmed to 160 characters; the failed line keeps a red border until
  saved again.

## Next, if this were to continue

- Report the JSS `dct:` → `dc:` PATCH bug (with the one-line reproduction above).
- Split at the cursor on Enter and join with the line above on Backspace at the start of a line.
- Send `If-None-Match`/ETag on polls to skip unchanged files.
- Test with two accounts on the pod.

## After review (REVIEW.md)

- Finding 1 (`}` lost, "Saved" anyway): saves are whole-file PUT + If-Match + read-back check. `pad.mjs` saves
  `if (x) { y }` and `PREFIX x: <…> and } more` and checks the pod holds each (SolidOS's own check passes), and fakes a
  pod that answers 204 but keeps nothing: the pane says "Not saved: line: the pod did not keep it".
- Finding 2 (Append counted as write): only `write` in `WAC-Allow` makes fields; append-only gets the read-only view
  with its own hint. The reviewer's `two-person.mjs` passes unchanged in what it checks; changed in it: ports to
  9521/9522, `.npd-line input` to `.npd-line textarea`, and `authorOf` now parses the file (a PUT file is stored as
  JSON-LD, so the Turtle-block text search found nothing).
- Findings 3 and 4: 44 px lines that wrap (see above). `shell.mjs` checks every line is at least 44 px and that the
  long sample line grows at 400 px with nothing cut off.
- The design block was re-run with `embed.mjs` (the sheet had changed on disk); not edited by hand.
