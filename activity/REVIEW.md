# Review: activity (read-only)

Reviewer: phase-4 agent, 22 Nov 2026. Read the code, README and tests; ran `node tests/run.mjs` (port 9569 through a
loader hook that only swaps the port number): **EVERY TEST PASSED** (first try failed at the login step on a
time-out; a re-run passed whole). My own data: `suite-data/activity-review/` (the contacts sample address book with
`groups.ttl`, and a folder `it's o'clock/`). Screenshots: `tests/shots/review-*`.

**Never writes: confirmed.** The only requests are `readRdf` (GET with `Accept`, `cache: no-store`) and one `HEAD`
per untimed file (at most 12). No `updater`, no PUT/PATCH/POST/DELETE anywhere in the file; the static test checks
this and the browser test's byte-for-byte snapshot of the test folder passes.

**Walk caps hold: confirmed.** `walk()` reads at most `MAX_FOLDERS` (60): `room = max(0, 60 - read)` slices each
level, so `read` cannot pass 60 (test: `big/` reads exactly 60, says 11 left out). Depth: a child is queued only
if `depth + 1 <= 4`, else counted in `deeper` (test: level 4 read, level 5 not). Cycles cannot loop (`seen` set).
Sniffs are `.slice(0, 40)`, HEADs `.slice(0, 12)`, and `pool` keeps 6 in flight.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | activity-pane.js:406-414 | A data file is named and opened as ANY typed thing inside it, not its own. `rank` 3 accepts subjects in other documents, so the address book's `groups.ttl` (which only *mentions* `<Group/Friends.ttl#this> a vcard:Group`) shows as a row "Friends" that opens `Group/Friends.ttl#this`; the stream then has two "Friends" rows, one of them the wrong file (shot `review-book-1300`). Any file that lists typed things from elsewhere (a people index, a tracker's index) is mislabelled the same way. | Only accept subjects in the document itself (rank 0-2); otherwise fall through to `BY_LINK` and keep the file name and the file as the target. |
| 2 | nit | activity-pane.js:494-500 | The 40 type reads have no size limit: each is a full GET and parse, though `stat:size` is already known from the listing. A large Turtle/JSON-LD export among the newest 40 is downloaded and parsed in full just to pick an icon. | Skip sniffing when `item.size` is over, say, 256 kB. |
| 3 | nit | activity-pane.js:666-670 | Photo previews load the full picture for every photo row (up to 50 per page, no `loading="lazy"`). A stream of camera photos downloads them all at full size. | Add `loading: 'lazy'` (and keep the icon for files over a size). |
| 4 | nit | activity-pane.js:741-755 | Each render adds three auth listeners that are removed only when an auth event later fires while the pane is gone; listeners and the old models (with their `paint`s) pile up across navigations until a login/logout. | Remove them with the same MutationObserver pattern the media pane uses, or on the next render. |
| 5 | nit | README.md:97 | "Not done: not yet in the shell's launcher" is out of date: `SUITE_APPS` now has `{ id: 'activity', … }`. | Update the README. |

## Two-person

Not asked for in this review (task: no two-person tests). Not written.

## Checked and fine

- Safety: no HTML strings or eval; titles and names by `textContent`; row links are the data-browser URL or http(s) only, `rel="noopener"`; in the shell rows go through `suite.go`.
- Reads use the logged-in fetch with `cache: no-store` (JSS stale listings) and accept `dc:modified` as well as `dct:modified` (finding 4). A folder JSS cannot list (`it's o'clock/`, finding 3b) is counted as "1 folder could not be read", not shown as empty.
- Reads go into a graph of the pane's own; SolidOS's store is not touched.
- Errors: a failed walk shows `role="alert"` with the message; logged out, a note says to log in.
- Design: filters as nav items (alone, ≥900 px) or 28 px filter chips (allowed), rows 56 px, empty state with icon/title/text, "Show more" 44 px pill; nav/details contract followed in the shell.
- 400 px: true 400 px, no sideways scroll (mine: scrollWidth 400; author's tests green); the time moves into the subline under 520 px.
- Not a finding, noted: the walk does not check that `ldp:contains` children are under the start folder; JSS generates listings so this cannot happen here today.

## After reading NOTES.md

None of #1-#4 is mentioned. NOTES already explains the cap order (breadth first) and files-not-folders.

## Fixed (author, 22 Nov 2026)

| # | Fix | Test |
|---|---|---|
| 1 | `sniffGraph` keeps only typed subjects in the file itself (`<#this>`, `<>`, `<#…>`); a file that only mentions a typed thing from another file falls through to `BY_LINK` (kind) and keeps its own name and address. | New sample `alice/contacts/groups.ttl` (mentions `<Group/Friends.ttl#this> a vcard:Group`); `activity.mjs` checks it shows as `groups.ttl`, kind contacts, opens `groups.ttl`, and no row is "Friends". |
| 2 | Data files over 256 kB (`stat:size` from the listing) are not read for their kind (`SNIFF_MAX`). | Not tested (no big sample). |
| 3 | Previews are `loading="lazy"` and only for pictures up to 2 MB (`THUMB_MAX`); the image is in the row from the start (a detached lazy image never loads) and swaps to the icon on error. | Seen in the shots (`shell-1300`, `loggedout-1300`). |
| 4 | Each drawing removes the previous drawing's auth listeners and clears its model's listeners (`dropPrevious`), so nothing piles up across navigations. | Not tested directly; every test still passes. |
| 5 | README updated: Activity is in the launcher. | — |

Also added `tests/shell.mjs`: Activity inside the real shell (filters in the left column, a filter narrows,
(i) shows "What was read", a row opens in the shell, 1300 px and a true 400 px). The design block is untouched
(`embed --check` passes in `static.mjs`).
