# Review: Search (`suite-search`) and its hook in the shell

Reviewer's pass, 22 Nov 2026. Read: the pane, README, tests, the briefs, DESIGN.md, JSS findings, and only the
search hook in `shell/suite-shell-pane.js` (lines 960-998; the shell is being edited by another agent, so its tests
were not run). Probe (port 9571; data in `suite-data/search-review/`, removed afterwards): hostile names (`<img
onerror>`, `javascript:`, 220 x's, `100% done`, `İstanbul`, quotes), the page alone at 1300 and a true 400 px, and the
header dropdown logged in at a true 400 px with the keyboard. Screenshots: `tests/shots/review-*`.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | search-pane.js:277-283 with :512, :576 (`nav.restore()`) | **The highlighted result can change under the person while the walk runs.** Each progress redraw (every 150 ms until the walk is done) rebuilds the rows, and `restore()` re-highlights the same *index*. New matches sort in ahead: names starting with the words come first, then shallower ones. So on a slow pod, a person who pressed Down to a row and then Enter opens a different file from the one that was highlighted. Not seen on the local pod (its walk takes about 0.6 s); follows from the code. | Remember the highlighted row's `data-uri` and find it again after each redraw (fall back to index −1). |
| 2 | bug | search-pane.js:264 | If there is no `pim:storage` and the profile document sits at the host root (a WebID like `https://alice.example/#me`), `parentOf` gives `https://`. Then `new URL('..', 'https://')` throws, `podRoot` rejects, the walk never starts, and the dropdown says "Searching…" forever. | Wrap it in try/catch and fall back to `new URL('/', me.doc().uri)`. Show an error line instead of "Searching…" when there is no root. |
| 3 | safety | search-pane.js:388 | Result links (`a.se-row`) have no `rel="noopener"`, which the hard rules require on every link. Their `href` is always an http(s) child of a walked folder (`startsWith` check at :331), so the real risk is nil. | Add `rel: 'noopener'`. |
| 4 | nit | search-pane.js:622 | Each shell showing (every navigation) adds a `resize` listener to the window that is never removed. The mousedown and keydown ones clean themselves up; this one keeps every old dropdown and its closures alive. | Remove it in the same disconnected check as `onDown` and `onEscape`. |
| 5 | nit | search-pane.js:479, :537 | The `aria-live="polite"` status is rewritten every 150 ms during a walk ("Searching… 37 folders so far", "… 43 …"). A screen reader reads a stream of numbers. | Announce only the first "Searching…" and the final line. Keep the count visible but not live. |
| 6 | design | README "The walk happens once per page"; search-pane.js:268-272 | Inside the suite, a file made in Files a minute ago (no page reload) is not found. The dropdown says "Nothing is named like '…'." with no hint that the answer comes from an older walk. Documented, but the message misleads. | Say when it searched ("Searched 300 folders at 10:31") with a "Search again" option, or re-walk when the cache is older than a few minutes. |

**The shell's search hook** (`suite-shell-pane.js:960-998`) is fine. It imports the pane once and keeps a failure as
`null` (a warning, no crash). A debounce token drops stale keystrokes. Enter on a highlighted row is cancelled by the
pane's keydown, so the shell's own submit does not also fire. Enter with nothing highlighted keeps the shell's
behaviour: an address, else the search page on the pod root with the words carried over. On the search page the
dropdown stays shut and the page filters. One thing for the shell's owner, not this pane: the focused header input
draws a 2 px square focus outline inside the white pill (computed `outline: rgb(0,130,201) solid 2px` despite
`.sh-header-search input { outline: 0 }`). See `review-dropdown-hostile-400.png`.

## Two-person

Not asked for this pane. Search walks only the person's own pod root, so another person's pod and folders shared
with you are not searched (the README says so under "Not done").

## Checked and fine

- Read-only: the only requests are GETs (`fetcher.load` of the profile, and listings with `Accept: text/turtle`). No
  PUT, PATCH, POST or DELETE, and no `updater`. Listings are parsed into a private graph, not the shared store.
- Safety: no innerHTML, outerHTML, insertAdjacentHTML, eval or new Function. Hostile names render as text (0 `<img>`
  made from `<img src=x onerror=…>`). `javascript:` in a name stays inside an http(s) path. Children outside the folder
  (`startsWith`) and dot-files are skipped. `pim:storage` is http(s)-only.
- Limits: 300 folders and 8 levels behave as the README says (alone.mjs, and my header walk hit the cap and said so).
  A garbled listing (REPORT 3b) and a folder holding index.html count as unreadable or empty.
- Matching: the decoded, NFC, case-folded match is right on `İstanbul` (whose lower case is longer), `100% done` and
  `café`. The highlight guard copes with case mappings that change length.
- Keyboard: Down, Down highlights the 2nd row (`aria-activedescendant`) and focus stays in the box. Escape closes the
  dropdown only (window capture, before the shell's own Escape).
- Design: sheet tokens and recipes via embed.mjs, 56 px rows (measured), group captions, an empty state on the page,
  and the popover recipe for the dropdown.
- 400 px: a true 400 px has no sideways scroll for the page alone or for the header dropdown (left 8, right 392). The
  220-character name ends in an ellipsis inside its row, and nothing overlaps.

## Against the author's NOTES (read after the findings)

None of #1 to #6 is mentioned in NOTES. NOTES does say the cached walk misses later files, which the README also says; #6 is only about the message.

## Fixed (author, 22 Nov 2026)

Each fix has a regression check; `node tests/run.mjs` ends `EVERY TEST PASSED`, and so does `node shell/tests/run.mjs`.

| # | Fix | Check |
|---|---|---|
| 1 | The keyboard highlight follows the result's address (`data-uri`, or `more:<group>` for "Show more"), not its place; if the result is gone, nothing is highlighted. "Show more" still moves to the first newly shown row. | `search.mjs` "#1": a row is injected above the highlighted one and the walk's listeners fired; the highlight stays on the same address one place lower, and back. |
| 2 | `podRoot` never throws: `pim:storage` (http(s) only), else `new URL('../', profile doc)` (host root for `https://alice.example/` and `/profile/card`, `/me/` for `/me/profile/card.jsonld`), else the origin root, else `''`. No root: the dropdown ends with "Your pod's top folder could not be found…", never a lasting "Searching…". | `units.mjs` "#2" (seven cases, including a host-root WebID, an unloadable profile and nonsense); `search.mjs` "#2" drives `headerSearch` with a store that cannot find a root and sees the message. |
| 3 | Result links: `href` only when http(s), and `rel="noopener"`. | `units.mjs` "#3" (source); `search.mjs` "#3" (every rendered row). |
| 4 | The `resize` listener is removed with the mousedown and Escape ones (one `forget()`, also returned to the caller). | `units.mjs` "#4". |
| 5 | The visible status line is no longer live. A separate visually hidden live region says "Searching…" once and then the final line. | `units.mjs` "#5"; `search.mjs` "#5" (live text equals the final status). |
| 6 | The status says when it searched ("Searched 300 folders at 10:31.") with a **Search again** button; "Nothing is named like …" adds "in the folders searched at 10:31. Files added since then need 'Search again'"; a kept walk older than 5 minutes is redone when a new search starts. | `search.mjs` "#6": a file written after the walk is not found, then is after "Search again"; the status and message texts. |

Also, from the shell's change (Search registered as a viewer): the dropdown now closes when the box is submitted, so
Enter with nothing highlighted shows the search page without the dropdown left over it. `loggedout.mjs` checks that
Enter, logged out, opens the search page in the shell with the words kept and finds the public sample files (it
replaces the old toast check).

Not changed: the shell's focus outline inside the header box (the shell's, noted for its owner).

### Later (coordinator's full pass)

Tests made independent of the pod's size: the header test walks its own tree (`_test.startAt`), the cap is checked
against `pane.limits` read back from the page, `alone.mjs` logs in itself, and each listing has a 20 s limit so a
stalled request cannot keep a walk going. See NOTES "Tests independent of the rest of the pod".
