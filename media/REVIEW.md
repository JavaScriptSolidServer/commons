# Review: media (Photos)

Reviewer: phase-4 agent, 22 Nov 2026. Read the code, README and tests; ran `node tests/run.mjs` (on ports 9569/9570
through a loader hook that only swaps the port numbers, so the files ran unchanged); wrote my own checks against
`suite-data/media-review/` (a gallery with a picture named `<img src=x onerror=alert(1)>.svg`, a sub-folder holding
only text files). Screenshots: `tests/shots/review-*`.

**`node tests/run.mjs` does NOT end EVERY TEST PASSED today**: `shell.mjs` fails 4 checks (below, #1). The
coordinator's log (`tests/coord-verify.log`, 10:05) passed; `shell/suite-shell-pane.js` was changed at 10:16 and now
lets a pane's open modal handle Escape first. `media.mjs` (1300 and 400) and `logged-out.mjs` pass.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | media-pane.js:778 | In the shell, with the viewer open and its details in the shell's column, ONE Escape closes both the details and the viewer (README: "Escape closes the details first, then the viewer"). The pane counted on the shell handling Escape first (the `justClosed` trick); the shell now acts last and skips events from inside `[aria-modal="true"]`, so the pane's `else hide()` runs. Reproduced by the pane's own `shell.mjs` (4 FAILs, the last 2 cascade from this) and by my run: `after one Escape: {"details":false,"viewer":false}`. | In `onKey`: `if (detailsOn) closeDetails(); else hide()` whether or not in the shell; drop `justClosed`. Keep the `onClose` path for the shell's own close button. |
| 2 | bug | media-pane.js:780-783 | The viewer traps Tab inside `.med-box`, but in the shell the photo's details are in the shell's column, outside the box. With details open, 10 presses of Tab cycle only Previous / Next / Details / Close; the column's "Close details", the Folder link and the Address link can never be reached by keyboard. `aria-modal="true"` also hides the column from screen readers while it is the thing just opened. | When `suite` and `detailsOn`, include the shell's details column (`.closest` of the element `showDetails` returned) in `stops`, or drop `aria-modal` and the trap while the column is open. |
| 3 | bug | media-pane.js:837, 835 | Opening a folder with sound or video starts loading the first track at once. For a private folder that is a full download through `fetchBlob` before anyone presses play: on `media/private/` the 13 kB `hum.wav` is fetched and turned into a `blob:` URL on open. With a film this downloads the whole film just to show the list; in the shell it happens even when the "Photos" filter hides the playlist. | Do not call `load()` in `play(0, false)` for a private folder; set the player up and load on the first play click (public files can keep `preload="metadata"`). |
| 4 | bug | media-pane.js:756 | Race: a slow failing photo writes its error into the frame of whatever photo is shown by then. `onFail` appends to `frame` without checking that `big` is still the shown image, so pressing → while a private photo is still answering 403 shows the next photo with "You do not have permission to see this file." under it. (Reasoned from the code; the cached promise makes it first-load only.) | In the callback: `if (!big.isConnected) return` before touching `frame`. |
| 5 | design | media-pane.js:502-506 | The left column lists every sub-folder under "Folders", including ones with no media. Clicking `docs` (two .txt files) in `media-review/album/` goes to a dead end: the shell says "Photos has nothing to show here. It does not open …/docs/." (shot `review-docs-subfolder-400`). | List only sub-folders Photos would open, or open them with the Files app; at least do not offer a folder Photos will refuse. |
| 6 | design | media-pane.js:622-641 | No empty state. A folder with no media opened with this pane (alone, by `?pane=`, or via #5 if the shell ever lets it through) shows only the folder name and "2 other items not shown": no icon, title or sentence (rule 9). | Draw the `empty` recipe ("No photos or sound here") when `images` and `tracks` are both empty. |
| 7 | nit | media-pane.js:560 | A picture that loads but cannot be decoded (corrupt PNG) fires `error` twice: the first falls back to the logged-in fetch, the second is ignored (`fellBack`), so the tile stays a broken image with no message. | On a second error call `onFail('Could not show this file.')`. |

## Two-person

Not asked for in this review (task: no two-person tests). Not written.

## Checked and fine

- Safety: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; every name goes in by `textContent`; a picture named `<img src=x onerror=alert(1)>.svg` shows as text, no alert. Links are `http(s)` only with `rel="noopener"`. SVG is shown through `<img>` only (no script).
- Writes: none. No PUT/PATCH/POST/DELETE, no `updater`; the only non-GET-looking call is `_fetch(uri)` (a GET). The pod snapshot checks in the tests pass.
- Blob URLs are revoked when the pane leaves the page (tested by the author, re-run green).
- Design: tokens and recipes embedded and current (`embed.mjs --check`); nav, rows, icon buttons 44 px; the viewer is the one `position: fixed` thing and is a modal.
- 400 px: no sideways scroll alone or in the shell at a true 400 px (author's tests re-run green; my shots agree). Grid, playlist and viewer-with-details look right at 400.
- Logged out: private folder and file say "Log in to see this file."; `logged-out.mjs` passes.
- JSS quirks: none apply (read-only; reads `stat:size` and `dcterms:modified` from listings, tolerant of either missing).

## After reading NOTES.md

#1 was foreseen (NOTES: "If the shell changes that, one Escape would close both") and the shell has now made exactly
that change, so it is due. #2-#7 are not mentioned.

## Fixed (author, 22 Nov 2026)

`node tests/run.mjs` ends EVERY TEST PASSED (ports 9513/9514); `embed --check` passes (block re-run by the tool to add
the `empty` recipe, not edited by hand).

| # | fix | regression check |
|---|---|---|
| 1 | Viewer's Escape (document, capture phase) always `preventDefault` + `stopPropagation`, and closes only the topmost thing: the details if open (in the shell too, via `suite.closeDetails()`), else the viewer. `justClosed` removed; the shell's close button still reaches the viewer through `onClose`. | `shell.mjs`: "Escape closes the details first; the photo stays", "two Escapes close the details, then the viewer" (1300 and true 400 px). |
| 2 | The Tab trap includes the shell's details column while it shows the photo (the `aside` around the element `showDetails` returned); `aria-modal` is `false` while that column is open beside the viewer, `true` otherwise. | `shell.mjs`: 10 real Tab presses reach "Close details" and the Address link, never leave viewer + column, and `aria-modal="false"`. |
| 3 | A private (WAC-Allow: no public read) folder's first track is not loaded on open: the player shows a "Play" button that loads and plays it. Public folders keep `preload="metadata"`. | `media.mjs`: no player and no request for `hum.wav` before the click; after it, a `blob:` source that loads. |
| 4 | A late failure only touches its own photo: `if (!big.isConnected) return`. | Code only (needs a slow 403 to reproduce; not tested). |
| 5 | A sub-folder in "Folders" is loaded on click: with media it opens in Photos (`pane: 'media'`), without it the shell picks (Files), so never "Photos has nothing to show here". | `shell.mjs`: `music/notes/` (one .txt) opens in Files; `music/live/` still opens in Photos. |
| 6 | Empty state (`empty` recipe: icon, "No photos or sound here", one sentence) when a folder drawn by the pane has no media. | `media.mjs`: rendering `docs/` with the pane shows it. |
| 7 | A second `error` (after the fallback, or a blob that will not decode) calls `onFail('Could not show this file.')`. | `media.mjs`: `broken/a-broken.png` (not a picture) says "Could not show this file."; the good picture beside it shows. |
