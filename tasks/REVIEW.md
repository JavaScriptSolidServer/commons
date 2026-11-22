# Review: Tasks (`suite-tasks`)

Reviewer's pass, 22 Nov 2026. Read: the pane, README, tests, the briefs, DESIGN.md, JSS findings, and JSS's own PUT code
(`handlers/resource.js`, `utils/conditional.js`). Ran `node tests/run.mjs` with a new `tests/two-person.mjs`, plus a
throw-away probe (me only, port 9571) whose data was removed afterwards. Screenshots: `tests/shots/review-*`.

**Is whole-file PUT + If-Match correct and safe?** Against the server, yes: JSS checks If-Match under a per-resource
lock (no check-then-write race), its ETag (`md5(mtime in ms + size)`) is the same for the Turtle you GET by conneg and
the JSON-LD it stores, and a write in between really gives 412. The two-person test shows it: bob's task written
while me's save waited between its read and its PUT survived. me got "changed somewhere else", and the next try
saved. The problems are in how the pane uses it: the If-Match window starts at the fresh read, not at the moment
the person saw the value (#1). After a 412 the person's own typing is thrown away (#2). And the file it writes is
whatever the list names (#4).

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | tasks-pane.js:686-701 (`setField`), fed by :1050, :1057, :1064, :1069 | **Lost update from a stale view.** `change()` replaces the field with what is in the box, without checking that the fresh value is still the one the box started from. Two-person test: me opens "Plan the picnic" (notes "Bring a blanket."). bob changes the notes to "Bring a blanket and the kite.". me adds " Ask Carol." in the still-open box. Result: "Notes saved." and bob's kite is gone from the pod, with no word to either. Same for title, due and priority. The README's "a change made elsewhere in between is never overwritten" holds only for the milliseconds between the read and the PUT. | Pass the value the control was showing (`before`) into `setField`. In `change()`, if the fresh value is neither `before` nor the new value, return false and say "Changed by someone else meanwhile; theirs is shown, yours is still in the box". |
| 2 | bug | tasks-pane.js:560-564 → :1070 (also :1051, :1058, :1065) | **After a 412 the typed text is discarded.** The error path re-reads and calls `draw()`, then `details.update()` sets `notes.value = task.notes`, because focus has already left the box (change fires on blur). Probe: typed "Shelves first. Then a long paragraph I typed carefully.", forced a 412, and the box went back to "Shelves first." while the message said "try once more". | On error, keep the unsaved value in the control (remember it per field and skip the update for that field until it saves or the person clears it). |
| 3 | bug | tasks-pane.js:882, :1044 | **A tick clicked during any save is silently dropped** (`if (!busy) setDone(…)`). The usual path: edit the title, then click "Mark as done". The title's change event (on blur) starts a save, so the click finds `busy` true. Probe (PUTs slowed to 1 s): status at the click was "Saving…", the result was "Title saved.", and the task was not Done on the pod. | Drop the `busy` guard (rewrite already queues). Or disable the boxes while saving so it shows, and keep the click. |
| 4 | safety | tasks-pane.js:401, :408 (stateDoc), used by :542-556 | **Writes go wherever `wf:stateStore` points.** A list whose `index.ttl` says `wf:stateStore <../victim.ttl>` (or any other address, even another origin) makes Add, tick, edit and delete PUT the whole of that other resource with the person's credentials. Probe: a list "Looks harmless" pointing at an unrelated Turtle file of mine. Add answered "Added: Written into another file", and `victim.ttl` was rewritten: its comment gone, stored as JSON-LD, with a task in it. Anyone who gets a person to open a list (a shared list, a link) can make the pane rewrite any RDF file that person may write. That is a write outside the README's table ("the list's state.ttl"). | Accept a stateStore only in the same folder as the list's `index.ttl` (`folderOf(stateDoc) === folderOf(list.node)`). Otherwise show the list read-only with a note. |
| 5 | nit | tasks-pane.js:548 (with :675, :694) | Ticking or editing a task that someone else deleted meanwhile: `change()` returns false and `say('')` clears the line, and the row just vanishes after the re-read with no explanation. | Say "This task was deleted elsewhere." as an error. |
| 6 | nit | tasks-pane.js:551 | With no ETag in the GET response the PUT goes out with no If-Match, overwriting blindly without a word. JSS always sends one; another server or proxy might not. | Refuse to save (or warn) when there is no ETag. |
| 7 | nit | README "What it writes", Tick row; tasks-pane.js:678-680 | Ticking also removes `cal:status`, and on a tracker with no open or closed state it writes `cal:status "COMPLETED"`/`"NEEDS-ACTION"`. The table does not list it. | Add it to the row. |
| 8 | design | tasks-pane.js:1101-1105 | "Delete task" stays armed ("Press again to delete", red) indefinitely. A stray click minutes later deletes without a fresh decision. | Disarm on blur or after about 4 s, or use the sheet's modal (Cancel first, Delete last). |
| 9 | nit | alone: `say()` :572-582; see `shots/review-two-person-bob-400.png` | Alone, the green "Done." / "Added: …" line stays above the add box until the next action. The sheet's feedback rule is a 4 s toast, or a status line *while* saving. | Clear success lines after 4 s (errors stay). |

## Two-person: what was tested, result

`tests/two-person.mjs` (me on 9571, bob on 9572; data rebuilt in `suite-data/tasks-review/`). me owns two lists in one
folder: **Family** (folder ACL: me RWC, bob RW) and **Private** (me only).

- PASS: me sees both lists and can add and tick.
- PASS: bob sees Family's three tasks and can add and tick. Private is not in his left column. He gets no **New list**
  (the folder above is not his), and the pod refuses him Private's state.ttl for both read and write (403/403).
- PASS: bob adds "Bring the lemonade" (on the pod under his WebID; me's tasks and notes kept) and ticks "Buy milk"
  (Done, with a `cal:completed`). No sideways scroll at a true 400 px.
- PASS: me reloads and sees bob's task, "Buy milk" under completed, and "Added by Bob Tester" (from his profile).
- PASS: lost update with a real 412. me's priority save is held between its read and its PUT, bob adds "Charge the camera",
  then me's PUT goes: 412, "changed somewhere else… try once more". bob's task is still on the pod, me's pane shows it,
  and retrying saves.
- **FAIL** (finding #1): me edits notes in a details panel opened before bob changed them. "Notes saved.", and bob's
  text is gone.

`node tests/run.mjs`: static, sample, tasks, shell, bob and interop all pass. two-person ends with 1 failure (#1),
so the run says `STOPPED: two-person.mjs failed`, not EVERY TEST PASSED. That is the bug, not the test.

## Checked and fine

- Server side of If-Match: JSS 0.0.231 serialises conditional PUTs per path under a lock. The ETag is shared across
  conneg, and the 412 is real (tested above, end to end).
- Whole-file rewrite keeps other triples: `}` in notes, quotes and newlines round-trip (tasks.mjs). No PATCH anywhere,
  so JSS findings #1, #5, #6 and #7 do not apply. `dct:` is avoided (#4).
- Queueing: all saves go through one promise chain, and change and serialise are synchronous after the fresh read.
  Double Enter in the add box is harmless (the box is emptied first).
- Safety: no innerHTML, outerHTML, insertAdjacentHTML, eval or new Function. Every `<a>` is http(s)-checked with
  `rel="noopener"`. Hostile titles (`<b>Label</b>`) render as text. New lists use `If-None-Match: *`. Every
  non-GET request is in `rewrite` (PUT) or `createList` (HEAD, PUT), apart from #4.
- Access: write controls follow WAC-Allow on state.ttl, and New list follows the folder's. Logged out and read-only
  (bob.mjs) show no controls and say why.
- Design: the sheet's tokens and recipes come via embed.mjs. Targets are 44 px, buttons are pills, and rows follow the
  sheet. Alone it follows the 1100/900/600/520 breakpoints on its own width. In the shell it uses showDetails,
  refreshNavigation and toasts.
- 400 px: a true 400 px with no sideways scroll for me, bob, alone and in the shell (author's shots plus
  `review-two-person-bob-400.png`). Nothing is cut off.
- Interop: the Boards pane opens a Tasks list (interop.mjs).

## Against the author's NOTES (read after the findings)

- NOTES says "Concurrent edits from two tabs: the second gets a 412 and must retry". That is true only when the
  second save starts while the first is between its read and its PUT. A save from a view opened earlier gets no 412
  and overwrites (#1), and when a 412 does come, the retry starts from a reset box (#2).
- #3, #4 and #5 are not in NOTES. #7 is in NOTES (decision 2) but not in the README's write table.

## Fixed (author, 22 Nov 2026)

`node tests/run.mjs` now includes `fixes.mjs` (new) and `two-person.mjs` (the reviewer's, checks unchanged; only its
ports moved to the pane's own 9531/9532) and ends EVERY TEST PASSED.

| # | Fix | Tested by |
|---|---|---|
| 1 | Every edit carries the value the control showed when the person started (`base`). After the fresh read, if that field now holds something else (and not what was typed), the save is refused: "someone else changed it meanwhile". Theirs is shown under the box, and the typed text stays with **Save again** (replace theirs, knowingly) and **Discard**. A delete is refused if the task's statements changed since it was seen. A rename checks the old name. The If-Match is still the ETag of the fresh read; the field check covers the window before it. | two-person.mjs (stale notes: bob's kite kept, me told), fixes.mjs (delete) |
| 2 | Unsaved text is kept per task and field (`app.unsaved`) through re-reads and redraws, and shown "Not saved yet". It is cleared only by a save that succeeds or by Discard. The 412 message says what was typed is kept. | fixes.mjs (forced 412 on notes, then Save again) |
| 3 | The `busy` guards on ticks and on the add box are gone: `rewrite` queues every change in order. | fixes.mjs (title save held, tick clicked meanwhile; both on the pod) |
| 4 | `readList` marks a list `safe` only if its `wf:stateStore` is in the list's own folder or below it (same origin, no `..`). An unsafe list is read-only, with a note naming the file. `rewrite` also refuses any document that is not a known list's `index.ttl` or safe state file. | fixes.mjs (`stateStore <../victim.ttl>`: no controls, file byte-identical) |
| 5 | A change to a task deleted meanwhile says "This task was deleted elsewhere…" as an error. | (code path; not driven by a test) |
| 6 | No ETag from the GET: no PUT, and the pane says why. | (JSS always sends one; not testable here) |
| 7 | README's write table lists the `cal:status` removal and the no-state fallback. | — |
| 8 | Delete disarms after 4 s or when the button loses focus. | (manual) |
| 9 | Alone, a success line clears after 4 s; errors stay. In the shell, success was already a toast. | fixes.mjs |
