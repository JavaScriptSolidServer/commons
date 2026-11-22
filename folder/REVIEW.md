# Review: folder (Files), with Sharing hosted in its details

Reviewer: phase 4, 22 Nov 2026. Read the code, README and tests before NOTES.md. Probes and screenshots on ports
9561 (me) and 9562 (bob); test data in `suite-data/folder-review/`. My screenshots: `tests/shots/review-*.png`.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | safety | folder-pane.js:1070 (`remove`) | Deleting a file that has its own rules leaves its `.acl` behind (JSS keeps `x.acl` when `x` is deleted). A new file with the same name then silently gets the old sharing. Tested: `orphan.md` + `orphan.md.acl` giving bob Read → Delete in Files ("Deleted “orphan.md”.") → `orphan.md.acl` still on disk, listed under Show hidden → me PUTs a new `orphan.md` → **bob GETs it: 200**. | Before the DELETE, HEAD the item for `Link: rel="acl"`; if that ACL exists, say so in the confirm strip ("its sharing rules are deleted too") and DELETE it after the item. Or refuse, as Rename does. Add the request to the README's write table. |
| 2 | bug / safety | folder-pane.js:540-554 (`loadSharing`), 1098 (rename guard) | Files never learns that its Sharing tab wrote. After "Give it its own rules" in the details, the list is not reloaded (foot still says "2 hidden"; no `private.md.acl` row), so the Rename guard that reads `state.items` lets the rename through. Tested in the shell: private.md › Sharing › own rules → ⋮ Rename to moved.md → "Renamed" → on disk `moved.md` with **no** rules of its own (now inherits the folder's, which may be wider) and an orphaned `private.md.acl` (see #1). The guard also only works on servers that list `.acl` files at all (JSS does; most others do not). | Check for the file's own ACL at rename time (HEAD for `Link rel="acl"`, then HEAD that ACL) instead of the cached list. And reload the listing when the Sharing tab writes: e.g. Sharing dispatches a bubbling `sharing-change` event on its root (see sharing/REVIEW.md #1) and Files calls `load(true)`. |
| 3 | design | folder-pane.js:547-549 | Inside the shell the Sharing tab gets a context without `suite`, so a share/remove shows no toast (rule 10; the rest of the shell toasts), and Sharing draws its own `h2` "Sharing" + "Who can see and change the file …" right under the "Sharing" tab and the details head that already name the file. Its own `padding: --sui-space-4` inside the details body leaves ~300 px for rows in the 380 px column (see `review-shell-1300-sharing.png`). | Pass a narrow suite object (`{ version: 1, toast: suite.toast, go: suite.go }`, no `state`) so Sharing can toast and link in-shell; agree a flag (Sharing's NOTES suggests `slot: 'details'`) on which Sharing drops its title and outer padding. |
| 4 | nit | folder-pane.js:452-457 (`creationPanes`) | "+ New" lists every registry pane with `mintNew`: in this browser two "Address book" entries (one with a generic icon, one with people) and a "Dokieli document" entry (`review-shell-400-newmenu.png`). The lab brief says not to mention or add dokieli. At 400 px the menu runs ~180 px past the bottom of the screen (scrolls with the column, but the end is not visible on open). | De-duplicate by noun (keep the first), leave out `dokieli`; cap the menu height with its own scroll. |
| 5 | nit | folder-pane.js:1177-1185 | Every render adds three auth listeners; they are only removed when the next login/logout fires. The pane is re-rendered after every change, so a long session piles up dead closures. | Remove them when the root is disconnected on the next draw too, or keep one module-level listener that calls the live render. |
| 6 | nit | folder-pane.js:985, 1023 | Files dropped while an upload or other task runs are silently ignored (no message; the list even shows the drop outline as "none"). | `say('bad', 'Wait for the current upload to finish.')`. |
| 7 | nit | folder-pane.js:258, 268, 286, 290 | Raw sizes in the pane's own rules (`200px`, `40px`, `56px` margins), against DESIGN rule 7 (spaces from tokens only). They match recipe sizes, so nothing looks off. | `calc()` from `--sui-space-*` / `--sui-target`, or a note in NOTES that they mirror the row recipe. |

## Two-person: what was tested, result

`tests/two-person.mjs` (added to `tests/run.mjs`, ports 9561/9562, data `suite-data/folder-review/`, rebuilt each
run). Everything through the **Sharing pane inside the Files details column, in the suite shell**:

1. A private folder (me only). Bob's own requests: file, other file, folder, subfolder all 403.
2. me: Files › `report.md` › Details › Sharing → inherited → "Give it its own rules" → add bob "Can view" → Review and save.
   Pod: `report.md.acl` names bob; the folder's `.acl` untouched. Bob: reads `report.md` (200); PUT refused (403, file
   unchanged); still 403 on `private.md`, the folder listing and a new file in the folder. Bob opening the folder in
   the shell: the data browser's own "Access denied", nothing listed, no write tools.
3. me: Files › `team/` › Sharing → own rules → bob "Can edit" (summary: "can now edit, in this folder and everything
   inside"). Bob lists `team/`, reads `plan.md`, PUTs `from-bob.md` (201). me opens `team/` in Files and sees
   `from-bob.md` beside `plan.md`.
4. me: `report.md` › Sharing › ⋯ › Remove access → save; bob 403 on read and write. `team/` › "Go back to inherited
   rules" → its `.acl` deleted; bob 403 on listing, on his own file there, and on a new write.

**Result: all pass.** The integration works for real. The failures it found are #1 and #2, which I checked with
separate probes (not in the test, so `run.mjs` stays green).

`node tests/run.mjs` with two-person.mjs added: **EVERY TEST PASSED** (embed check, setup, read 1300/400, write
1300/400, shell, bob, two-person).

## Checked and fine

- Safety, code: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; DOM by `createElement`/`textContent`.
- Writes: every non-GET fetch read (PUT folder, PUT upload ± `If-None-Match`, rename GET+PUT+DELETE, DELETE, `mintNew`); each matches the README table. No `updater.update`.
- Names: `nameProblem` + `childUri` keep every write a direct child; leading dots and `.acl`/`.meta` refused; uploads with spaces get dashes.
- Hostile data: a file named `<img src=x onerror=alert(3)>.md` and a 90-character unbroken name list as text with an ellipsis; no element injected (checked the DOM).
- Links: rows and crumbs are http(s) or `#`, `rel="noopener"`; the Info address opens `_blank` with `noopener`.
- JSS quirks: folder delete reads a fresh listing and refuses a non-empty folder (finding 2); the JSON-LD listing fallback for unparsable Turtle (finding 3/3b).
- Races: double-click on Delete/Rename/Create is stopped by `run()`'s busy check; ask strip resolves once.
- Errors: server statuses are shown in the status line (403/409/412/other), not swallowed.
- Design: tokens and recipes current (`embed.mjs --check` OK), rows/pills/44 px targets (no control under 44 px in the details column), empty and error states, `aria-current` in nav and crumbs.
- Shell contract: `renderNavigation`/`renderDetails`/`showDetails` with `onClose` clearing the selection, state on `suite.state`; alone, details under the row.
- 400 px (true, `design/viewport.mjs`): shell list, row menu, New menu, Sharing in the details overlay, alone with inline Sharing: no sideways scroll, nothing cut off (screenshots `review-shell-400-*`, `review-alone-400-sharing`).
- Read the author's NOTES after: #3 (no toast, the duplicate title) is known and argued there; #1 and #2 are not mentioned.

## Fixed (folder author, 22 Nov 2026)

1. **Safety, delete.** Before the DELETE the pane finds the item's own ACL from `Link: rel="acl"` (fallback
   `<item>.acl`) and HEADs it; the confirm strip says "Its own sharing rules (x.acl) are deleted with it."; after the
   item's DELETE it DELETEs that ACL and HEADs it again, and reports in red if it survives. Folders: same path (JSS
   already removes a folder's own ACL with it; the check confirms). README write table updated. Regression in
   `tests/two-person.mjs`: share private.md with bob → delete in Files → file and ACL gone → me PUTs a new private.md
   → **bob 403**.
2. **Safety/bug, rename.** The guard now asks the server (Link + HEAD), not `state.items`, so it works on servers that
   do not list ACLs and after a Sharing write: a file with its own rules is refused with a clear message (nothing
   copied, nothing orphaned); a target name with leftover rules is refused too. Test: report.md with own rules → Rename
   → refused, report.md and report.md.acl unchanged, no moved.md(.acl).
   **Sharing writes are heard:** Files listens on `document` for `suite-sharing-change` (detail.uri in this folder) and
   re-reads its listing directly (no forced store reload, so the details column stays open). Test: after the save,
   the foot goes from 1 to 2 hidden with the details still open.
3. **Design.** Sharing gets `suite: { version, toast, go, slot: 'details' }` (no `state`): it toasts and links in the
   shell; dropping its title on `slot: 'details'` is the Sharing pane's call (its NOTES proposes exactly that flag).
4. **Nit.** New menu: dokieli left out, one entry per noun, max height nine rows with its own scroll.
5. **Nit.** One module-level auth listener calling only the drawings still on the page.
6. **Nit.** A drop during a running task says "Wait for the current task to finish, then drop the files again."
7. **Nit.** The pane's own 40/56/200 px values are now `calc()`s of `--sui-space-*` (the design block untouched).

`tests/two-person.mjs` now runs on the folder pane's ports (9511 me, 9512 bob).

### Flake in the coordinator's full pass (two-person.mjs, details never opened)

- Pane: every login/logout/session-restore event made each drawing force-reload the folder, and a forced reload makes
  the data browser redraw the whole shell, dropping a click in flight (or closing open details). Now an event for the
  same person only re-checks access; the folder is reloaded only when the person changed.
- Test: the reset checks it left exactly the fresh data (the "1 hidden" is the folder's own `.acl`, expected);
  `sharingFor` waits for the row and for no task running, clicks, and clicks once more if the details did not open
  (logged), then fails. No check weakened.
- Second cause, seen while repeating the full run: bob's login timed out inside the identity provider under load,
  and `open()`'s exit then left me's browser holding port 9511, so the next run failed too. two-person.mjs now reuses
  the sessions write.mjs (me) and bob.mjs (bob) leave in this folder's profiles. It logs in afresh only if there is
  none, and it closes both browsers on any exit. Three full `node tests/run.mjs` in a row: EVERY TEST PASSED (135
  PASS lines each; the helper's two "logged in" lines are not printed when a session is reused). Ports free after.
