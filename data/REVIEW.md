# Review: data

Reviewed 22 Nov 2026 against `BRIEF-REVIEW.md`. Probes in a logged-in headless Chromium on port 9573/9574 with
`suite-data/data-review/hostile.ttl` (markup in a name, huge literal, `javascript:`/`data:` links, a cyclic list, odd
numbers and dates, 3,000 values on one property) and `big.ttl` (6,000 things, 18,000 statements).
Screenshots: `tests/shots/review-*`. NOTES.md read only after the findings were written.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | data-pane.js:400 | Big integers are shown wrong. `"12345678901234567890"^^xsd:integer` reads **12,345,678,901,234,567,000** (Number loses the last digits; the exact value is only in the tooltip). `"1e400"^^xsd:double` reads **∞**. Sizes, ids and counters can be this long. | For the integer kinds use `BigInt(value).toLocaleString()`; for anything that is not finite or not safe, show the value as written. |
| 2 | bug | data-pane.js:281-284 | Dates are not checked. `"2024-02-30"^^xsd:date` reads **March 1, 2024**; `"0090-05-01"^^xsd:date` reads **May 1, 1990** (`new Date(90, …)` means 1990). | Build with `setFullYear(y, m - 1, d)` and show the raw value unless year, month and day come back the same. |
| 3 | design | data-pane.js:204, 408 | No cap on a literal's length. A 300,000-character value is drawn whole: that one row was **78,521 px** tall, burying everything after it. Hostile or just large data (a pasted document, base64) makes the page useless. | Show the first ~2,000 characters with "Show all N characters", as values and things already have "Show more". |
| 4 | design | data-pane.js:221 | Type chips inside "In this document" rows are links with `min-height: 22px`, below the sheet's 28 px chip (the only allowed exception to 44 px). | Keep the recipe's 28 px chip, or make the chips plain labels (the row already opens the thing). |

## Two-person

Not in this task ("no two-person tests"). Not tested.

## Checked and fine

- Hostile data: a name `<img src=x onerror=alert(1)>Mallory` is text (no `img` made); `javascript:` and `data:` objects are plain text spans, not links; `HTTPS://` links work; the cyclic `rdf:rest` list stops; 3,000 values show 12 and "Show more".
- Code: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; all text via `textContent`; links http(s)/mailto/tel with `rel="noopener"`.
- Writes: none. The only network call is `fetcher.load(doc)`; no PUT/PATCH/POST/DELETE, no updater.
- Speed: hostile subject drawn in under 0.2 s; `big.ttl` (6,000 things) in 0.2 s; Turtle of 18,000 statements made at once, capped at 1,500 lines on the page with Copy taking all.
- States: loading, 401/403/404 and "nothing known" paths read right in code (the author's tests draw them directly).
- Design: tokens and recipes embedded; 44 px property rows, pill buttons, list rows, empty state; content only in the shell.
- 400 px: true 400 px (`design/viewport.mjs`) alone (hostile subject, big document) and in the shell (people.ttl): no sideways scroll, columns stack.

## Fixed

| # | fix | regression check |
|---|---|---|
| 1 | Integer kinds are formatted with `BigInt(…).toLocaleString()` (exact); other numbers only when finite and at most 15 significant digits, else shown as written (`1e400` stays `1e400`, with its datatype tag). | `tests/data.mjs`: "a 20-digit integer is shown exactly", "a double too big for a number is shown as written" (`odd.ttl`, made by `setup.mjs`). |
| 2 | Dates (and the date part of date-times) must round-trip through `setUTCFullYear(y, m - 1, d)`; otherwise the raw literal is shown. The year is set with `setFullYear`, so year 90 stays 90. | `tests/data.mjs`: "impossible dates are shown as written, not rolled over", "a date in the year 90 stays in the year 90". |
| 3 | A value over 2,000 characters shows the first 2,000 and "…", with a tertiary "Show all N characters" button. | `tests/data.mjs`: "a 300,000-character value is cut at 2,000 with "Show all"" (row under 2,000 px), ""Show all" shows the whole value". |
| 4 | The 22 px override on row chips is gone: they are the recipe's 28 px chip. | `tests/data.mjs`: "type chips in the document's rows keep the sheet's 28 px". |

Also (coordinator): `tests/shell.mjs` now waits for the shell's `data-logged-in="yes"` and checks it, so the
in-shell checks run logged in. `node tests/run.mjs` ends EVERY TEST PASSED; `embed --check` OK (design block untouched).
