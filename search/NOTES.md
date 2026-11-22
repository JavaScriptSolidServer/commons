# Notes: Search (phase 3)

## Judgement calls

1. **Limits: 300 folders, 8 levels, 6 at a time.** 300 listings take about 0.6 s on the test pod, and maybe 5 s over
   a slow network. The test pod is unusual: code trees are linked into `public/` (lab, suite, solidos, with their
   test browser profiles), so the walk from the root hits the 300 limit at level 4 and never sees most deeper
   folders. A normal pod with a few hundred folders is covered. Raising the limit is a one-line change
   (`LIMITS` at the top; `tests/static.mjs` checks the README states the same numbers).
2. **Level by level, not a free-running queue.** Each level is read in listing order before the next, and a
   level is cut where the limit falls, so the same pod always gives the same folders within the limit (the tests
   rely on it: `many/` gives exactly box-001 to box-299). The cost is a small wait at the end of each level.
3. **Folders past a limit are still found by name**, because their name is in their parent's listing; only their
   contents are missed. The status line says when a limit was reached, so an empty answer is not mistaken for "not
   there".
4. **The walk is per page, per person, per start folder** (a module-level map). The shell re-renders on every
   navigation but the module is imported once, so opening a result and searching again costs nothing. Not
   refreshed: a file added after the walk is not found until reload. A "search again" button would fix that;
   not added (not asked for).
5. **Listings go into a private `$rdf.graph()`, not the shared store**: 300 listings would otherwise sit in the
   store other panes read, and rdflib's fetcher would mark them all as fetched. Plain GET with `Accept: text/turtle`.
6. **Groups by file extension**, not by reading each file's `rdf:type`: reading 1000s of files to classify them would
   cost far more than the walk. So a Turtle address book shows under Data, not Contacts (only `.vcf` does).
7. **Logged out, the header walks nothing** and asks to log in: there is no "your pod" to start from, and walking
   whichever pod the page shows would be surprising. The search page alone does walk logged out (it was given a
   folder), and counts folders it may not read ("17 could not be read" from the root).
8. **Enter with nothing highlighted is left to the shell**, which now opens the search page on the pod root with
   the words kept; the dropdown closes on submit so it does not sit over that page.
9. **Escape is caught on `window` in the capture phase**, before the shell's own document-level Escape (which would
   close the details column or the drawer too). Only while the dropdown is open.
10. **The search page grabs focus on folders only when the shell is not loaded** (`shouldGetFocus` checks the
    registry for `suite-shell`), so loading it by link opens the search page, and next to the shell it never takes
    a folder from the Files app.
11. **Ranking:** names starting with the words first, then shallower, then alphabetical. Simple and predictable.

## The shell edit

At the search hook only (`shell/suite-shell-pane.js`, the "search box" block): a `findIn()` that imports
`../search/search-pane.js` on the first keystroke and calls `headerSearch({ input, form, context, suite })`, and one
line in the debounced input handler that passes `suite.query` to it: 6 lines added, the comment above reworded, nothing
else changed. `node shell/tests/run.mjs` ends `EVERY TEST PASSED`.

The dropdown is drawn by this module inside the shell's `.sh-top` (which is `position: relative`), with its own
`<style>`; it sets `role="combobox"`, `aria-expanded`, `aria-controls` and `aria-activedescendant` on the shell's
input at run time.

## Design sheet

Embedded with `--only icon,menu,row,buttons,input,empty,toast` (prefix `se`). Built from tokens, not in the sheet:
the group heading (the `caption` recipe plus a muted count), the dropdown's placement and height, the marked match
(`se-hit`: primary text, bold, underlined; no new colour), the "Show more" row (a tertiary button laid out like a
row). Row selection uses the row recipe's `aria-selected` colour.

## True 400 px

All 400 px checks use `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`, `innerWidth === 400`).
Under 600 px the dropdown spans the page with 8 px each side (checked).

## Found on the way (JSS)

- A folder that holds `index.html` answers a Turtle request with the HTML page, so its listing cannot be read
  (`curl -H 'Accept: text/turtle' …/public/poll-repo/` gives HTML). Not in `jss-findings/REPORT.md`. The walk treats
  it as an empty folder.
- The 4 "could not be read" when logged in include `jss-findings/r3-names/` (REPORT 3b, the apostrophe listing).
- `…/public/suite/local.json` (the test settings, with passwords) is served by the pod, because the suite folder is
  linked into `public/`. Local only, but worth knowing.

## Unverified

- A second person (`bob`): the walk is keyed by WebID, so a switch of person on one page starts a new walk; not run.
- A slow or remote pod; a pod with thousands of files in one folder (all names are kept in memory; fine at 10^4).
- Screen readers: the combobox/listbox roles and `aria-activedescendant` are set, not tried with one.

## Needs a decision

1. The limits (300 / 8) are a guess; the coordinator may want them per pod size, or a "Search deeper" action.
2. `local.json` being public on the test pod (above): move it, or keep the suite link out of `public/`.

## After review

All six review findings fixed; see the "Fixed" section of REVIEW.md. The highlight follows the result by address,
the pod root never hangs, links are http(s) with rel=noopener, listeners are cleaned up, the live region is quiet,
and the status says when it searched with "Search again" (a walk older than 5 minutes is redone on a new search).

## Tests independent of the rest of the pod (after the coordinator's full pass)

The full pass failed two checks in `alone.mjs` ("typing searches inside this folder", "box-005") that pass alone.
That file used to reuse the login left by `search.mjs`; the likeliest cause is a stale session whose authenticated
fetch stalled, so the walk never finished (not reproduced: three local runs of the old tests passed). Changes:

- **Pane:** each listing now has a 20 s limit (`LISTING_WAIT`); one that does not answer counts as unreadable, so a
  walk always ends. The folder-scoped search was checked: it walks only from its folder (`deep/` fetches exactly 9).
- **`alone.mjs`** logs in itself, reads the limits back from the pane (`pane.limits`) and compares against them,
  and logs the page's state if a search does not settle.
- **`search.mjs`** points the header walk at its own tree (`pane._test.startAt = …/suite-data/search/`; `null`
  in normal use) and checks separately that the header finds the pod root (`data-pod-root`). From that tree the walk
  meets `many/` (320 folders), so it always stops at exactly the read-back limit in the same place.
- **`loggedout.mjs`** looks for public files on the sample folder, not the pod root; on the pod root it only checks
  that unreadable folders are counted (`private/`, `settings/`, `inbox/` are read first, at level 1, whatever the
  pod size).
