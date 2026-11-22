# Review: table

Reviewed 22 Nov 2026 against `BRIEF-REVIEW.md`. Probes in headless Chromium on port 9574, inside the suite shell
(logged out, the public `suite-data/table/library.ttl`). Screenshots: `tests/shots/review-*`. NOTES.md read only after
the findings were written.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | table-pane.js:581-587, 624 | In the shell a row stays marked after its details close if the table was redrawn meanwhile. Tested: click a cell of "Bridges of Salt" (details open, row marked), click the Name header to sort, close the details: the details column is gone but "Bridges of Salt" still has `aria-selected="true"`. `onClose` clears the `tr` that was clicked, but sorting, filtering or the header search drew a new `tr` that copied the mark from `state.selected`. | In `onClose`, clear `state.selected` and every `tr[aria-selected]` in `scroll`, not the captured `tr`. |
| 2 | nit | table-pane.js:316, 322-325 | Same formatting slips as the data pane: an impossible `"2023-02-30"^^xsd:date` is shown (and sorted) as Mar 2, 2023 (`Date.UTC` rolls over); integers past 2^53 are shown rounded (the CSV keeps the raw value, so only the screen is wrong). | Check the date round-trips before formatting; use `BigInt` (or the raw text) for integers that are not safe. |
| 3 | nit | table-pane.js:639 | In the shell, a row's details open only on a mouse click on the `tr`; the row cannot be focused, and the one focusable thing in it (the name link) navigates away instead. Keyboard users cannot reach a row's details. | Give the name cell a small "Details" button, or make the row focusable with Enter/Space opening `showDetails`. |

## Two-person

Not in this task ("no two-person tests"). Not tested.

## Checked and fine

- Hostile data: names and cells via `textContent`; `javascript:`/`urn:` shown as text; links http(s)/mailto/tel with `rel="noopener"` (code read; the author's `edge.mjs` covers `odd.ttl`).
- CSV: header, URI and text cells escaped for formulas (`= + - @` tab, CR) and quoted; numbers left raw only in all-number columns.
- Code: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`.
- Writes: none; no `fetch` at all, no updater (also checked by the author's write watch).
- Sorting (numbers, dates, empties last), filter count, Show all columns/rows, type chips: read and right.
- Design: sticky 44 px header, 44 px rows, pill search and buttons, type chips as `aria-pressed` filter buttons, details recipe in the shell.
- 400 px: true 400 px (`design/viewport.mjs`) in the shell: cards with a Sort by select, no sideways scroll.

## Fixed

| # | fix | regression check |
|---|---|---|
| 1 | `onClose` clears `state.selected` and every `tr[aria-selected]` in the table box (not the captured `tr`), and only if that row is still the selected one. | `tests/shell.mjs`: "re-sorted with the details open: the mark follows the row, and closing clears it". |
| 2 | Same as the data pane: integers via `BigInt` (exact on screen; sorting still by number), other numbers as written when not finite or over 15 digits; dates and date-times must round-trip (`setUTCFullYear`), else shown (and sorted) as the raw text; year 90 stays 90. | `tests/edge.mjs` on `tests/data/numbers.ttl` (copied to the pod by the test): "a 20-digit integer is shown exactly", "an impossible date is shown as written", "a date in the year 90 stays in the year 90". |
| 3 | In the shell, rows are focusable (`tabindex=0`, focus ring inside the row); Enter or Space on the row opens its details. | `tests/shell.mjs`: "keyboard: a focused row opens its details with Enter". |

Also (coordinator): `tests/table.mjs` (logged in) ends with a shell check: the shell's `data-logged-in="yes"`, the
table, and a row's details. `node tests/run.mjs` ends EVERY TEST PASSED; `embed --check` OK (design block untouched).
