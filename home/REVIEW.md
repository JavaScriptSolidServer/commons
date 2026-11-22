# Review: home (Dashboard)

Reviewer: phase-4 agent, 22 Nov 2026. Read the code, README and tests; ran `node tests/run.mjs` (ports 9569/9570
through a loader hook that only swaps port numbers): **EVERY TEST PASSED**. My own checks used made-up pods under
`suite-data/home-review/` (carol: markup in the name, a `javascript:` photo and instance; erin: one type
registration with a malformed `%E0` class; dave: no preferences or type index). Screenshots: `tests/shots/review-*`.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | home-pane.js:274 (also 420) | One bad IRI in anyone's type index blanks the whole dashboard. `localName` calls `decodeURIComponent` without a guard; a registration `solid:forClass <https://garden.example/ns#Plant%E0>` throws `URIError`, `fill()` rejects and the page shows only the greeting and "Could not read the pod: URI malformed" (shot `review-malformed-1300`) — no folders, no recent, no tools, though only one row was bad. `shortPath` (`decodeURI`, line 420) has the same hole for instance addresses. | Wrap both decodes in try/catch and fall back to the raw text (as activity's `lastPart` does). |
| 2 | bug | home-pane.js:300 | `isMyRoot` also accepts the root of the WebID's *site*, not only the `pim:storage` the profile names. On a server with path-based pods (this one: WebID `…/me/profile/card.jsonld#me`, storage `…/me/`), logged in, `http://127.0.0.1:8732/` opens first on the Dashboard with "Good morning, me" and "Pod http://127.0.0.1:8732/" (shot `review-server-root-1300`). The server root is not this person's pod. | Use the site root only when the profile names no `pim:storage` at all. |
| 3 | 400px | home-pane.js:171, 629 | At 400 px "Recently changed" shows no time at all: the time is a `hom-row-meta`, and the row recipe hides meta under 520 px. The card's whole point (when) is gone on a phone (shot `review-empty-400`: "card.ttl / in profile/", no date). | Put the time in the subline under 520 px (activity does this with `act-when-sub`). |
| 4 | design | home-pane.js:349, 638 | The error is drawn as a status, not an error: `p.hom-status[role=status]`, muted grey text; the data browser's own `[role=status]` style then gives it a pale green box (computed `rgba(0,200,83,.1)`), so "Could not read the pod" looks like a success note (shot `review-malformed-1300`). The "Reading the pod…" line gets the same green box. | On failure add `hom-status-error` (or a `hom-note hom-note-error`) and `role="alert"`; give `.hom-status` an explicit `background: transparent`. |
| 5 | design | home-pane.js:597-631 | No empty state when there is nothing: a WebID whose preferences, type index and root listing are all unreadable (e.g. logged out on a private pod) shows the greeting and an empty page; "A card with nothing to show is not shown" means no card at all (rule 9). | When no widget was drawn, draw the `empty` recipe ("Nothing to show here yet" / "log in to see more" when logged out). |
| 6 | nit | home-pane.js:477-480 | Type-index targets are not checked: `solid:instance <javascript:alert(1)>` becomes a row "Plant · alert(1)" whose link is the data browser with `uri=javascript:alert(1)`. Nothing runs (checked: no alert), but it is a dead row. | Skip targets that are not http(s) (`httpOnly(target.value)`). |

## Two-person

Not asked for in this review (task: no two-person tests). Not written.

## Checked and fine

- Safety: no HTML strings or eval; a `foaf:name` of `<img src=x onerror=alert(1)> Carol` shows as text, no alert; a `javascript:` `foaf:img` is dropped (initials stay); all `href`s are http(s) with `rel="noopener"`; the Tools-app link has `target=_blank` + `noopener`.
- Writes: none. Only `store.fetcher.load` (GET); no updater, no PUT/PATCH/POST/DELETE. The tests' byte-for-byte checks of profile and settings pass.
- Reload reads back the same (author's test, re-run green). Logged out it leaves folders alone (`claim` returns null).
- Design: tokens/recipes current; cards built from tokens; rows 56 px, "Show all" and "Manage" are 44 px pills; one-column grid at 400 px with no sideways scroll (my `review-empty-400` measure: scrollWidth 400).
- In the shell: content only, rows go through `GotoSubject` and stay in the shell (author's `shell.mjs` green).

## After reading NOTES.md

#3 was a deliberate choice (NOTES 4: time in `row-meta`, hidden under 520 px "per the sheet"); I still count it,
because the card loses its point on a phone and activity shows the sheet allows the subline route. #2: NOTES 3 names
the site-root fallback but not path-based pods. #1, #4-#6 are not mentioned.

## Fixed (author, 22 Nov 2026)

| # | fix | regression check |
|---|---|---|
| 1 | `safeDecode` wraps `decodeURIComponent` (`localName`) and `decodeURI` (`shortPath`); a bad `%E0` keeps its raw text, the rest draws. | `sample.mjs` Carol: a `Plant%E0` class and a `bad%E0.ttl` instance show raw ("Plant%e0"), no error status, folders still drawn (1300 + 400). |
| 2 | `isMyRoot`: the profile's `pim:storage` only; when none is named, the folder the profile sits in (`<pod>/profile/card#me` → `<pod>/`). The server root by itself no longer counts. Same fallback for `storage` in `fill()`. | `home.mjs`: logged in, `label`/`shouldGetFocus` on `http://127.0.0.1:8732/` give `null false`; `/me/` still `Home`. |
| 3 | The time is also a `hom-row-sub hom-when-sub` line, shown only under 520 px where `row-meta` is hidden. | `sample.mjs`: at a true 400 px meta hidden, subline time shown and equal to `<time>`; at 1300 the reverse. |
| 4 | Failure: `hom-status-error` + `role="alert"`; `.hom-status` gets `background: transparent; border: 0; padding: 0; box-shadow: none` against the browser's `[role=status]` box. | `home.mjs`: a store whose `each` throws → status `role=alert`, error class, "Could not read the pod: …", computed background transparent. |
| 5 | No card drawn → the `empty` recipe across the grid: "Nothing to show here yet" + "Log in to see more of this pod." (logged out) or what could not be read (logged in). | `sample.mjs` Dave (storage that does not exist, no indexes): 0 cards, that empty state. |
| 6 | Type-index targets must pass `httpOnly`; others get no row. | `sample.mjs` Carol: no row for the `javascript:` instance; all links http(s) + noopener. |

Design block untouched (`embed --check` OK). New samples: `samples/carol/`, `samples/dave/`.
