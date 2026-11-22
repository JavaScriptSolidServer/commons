# Review: pad (collaborative notepad)

Reviewer's probes: pads in `suite-data/pad-review/`, logged in on ports 9575 (me) and 9576 (bob); screenshots
`tests/shots/review-*` and `tests/shots/review-probe/shots/`. Line numbers are `pad-pane.js`.

| # | severity | where | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | pad-pane.js:523-541 (patch at 491-509) | **A line containing `}` is lost while the pane says "Saved".** I typed `if (x) { y }` into line 1: status "Saved", the field keeps the text, but on the pod line 1 now has **no `sioc:content` at all** (JSS finding 5: the DELETE applies, the INSERT with `}` is dropped, 204). After a reload the line is empty, and the pad breaks the "exactly one `sioc:content` per line" rule the README says it keeps, so SolidOS's own pad pane refuses it. Text like `PREFIX x: <…>` is stripped the same way. Code, maths and JSON in a notepad are common. | Re-read after each line save and compare (as profile-edit and settings do), and say "Not saved" if the text is not there; better, refuse or encode `}` before sending, or write that line with a PUT of the whole file with `If-Match`. |
| 2 | bug | pad-pane.js:741 | `allowed()` counts WAC **Append** as write. Every change this pane makes deletes a triple (a line's old text, a `pad:next` link), which Append does not permit. Bob, given Read+Append, gets editable fields, types, and every save fails: "Not saved: line: Web error: 403 (Forbidden) on PATCH …". The new `tests/two-person.mjs` fails on this check. | Treat only `write` as editable; with append alone show the read-only view (or, if wanted later, an append-only "add a line at the end" that only inserts). |
| 3 | design | pad-pane.js:220-221 | Line fields are 34 px tall (measured at 400 px, all 8 lines), under the sheet's 44 px target for inputs (DESIGN.md rule 5). | Give `.npd-line input` `min-height: var(--sui-target)`, or justify the denser editor in NOTES as an exception. |
| 4 | design | pad-pane.js:596 | Each line is a single-line `<input>`, so at 400 px a long line is cut off mid-word with no wrap (sample line 8 ends "…water butt <before> t"); the read-only view wraps the same line. A reader on a phone cannot read the end of a line without tapping into it and scrolling. | Use a one-row auto-growing `textarea` (Enter still adds a line), or show wrapped text and swap in the field on focus. |

## Two-person: what was tested, result

The existing `tests/two.mjs` is real two-browser work (bob logs in as himself, adds one line, me's page picks it up
by itself, bob's name arrives in the legend), but it is one-directional: me never edits while bob watches, nobody
edits concurrently, and there is no share that refuses bob. I added `tests/two-person.mjs` (me on 9575, bob on 9576,
data in `suite-data/pad-review/`, removed at the end) and its line in `tests/run.mjs`:

- Read+write share: bob sees me's lines and may edit — PASS. Me edits a line, bob's page shows it by itself — PASS.
  Bob adds a line (saved as his on the pod), me's page shows it by itself — PASS. Me and bob change different lines
  at the same moment: both "Saved", after a reload both see both edits, each recorded as its writer, one text per
  line — PASS. Bob in me's legend by name — PASS.
- Read-only share: bob sees the lines as text, is told he can only read, and his own PATCH is refused 403 with the
  file unchanged — PASS.
- Append-only share: bob is offered 2 editable fields that cannot save (403 on typing) — **FAIL**, finding 2. The
  file stays unchanged — PASS.

`node tests/run.mjs`: design check, `pad.mjs`, `shell.mjs`, `two.mjs`, `sample.mjs` all pass; it now stops at
`two-person.mjs` with 1 failure (finding 2), so it does **not** end `EVERY TEST PASSED` until that is fixed.

## Checked and fine

- Two people on the same line with a stale page: the stale patch is refused, the pane re-reads and retries, last write wins, the line keeps one text (probe B).
- Writes: only `store.updater.update` patches listed in the README, plus `mintNew`'s PUT with `If-None-Match: *`. No ACL writes.
- Safety: no `innerHTML`/`eval`; names, title, lines through `textContent`/`value`; colours only from a `#rrggbb` check or the hash; no links rendered.
- Polling: skipped while saves are queued; the line being typed in is left alone; `loading` stops drawing from a half-filled store.
- Read-only and logged out: text rows, a line saying why.
- 400 px: true 400 px in the shell: no sideways scroll; toolbar, avatars and title fit.
- Design: sheet tokens/recipes current (`embed.mjs --check`); details column in the shell via (i) and the avatars.

## Fixed

1. **`}` lost while "Saved"** — every change is now read fresh, applied, PUT as the whole file with `If-Match`, read
   back and checked; "Saved" only when the pod holds it, else "Not saved: … the pod did not keep it". Regression:
   `pad.mjs` saves `if (x) { y }` and `PREFIX x: <http://example.org/> and } more` (pod holds them, one text per
   line, SolidOS's check passes) and fakes a 204 that keeps nothing (says "Not saved").
2. **Append counted as write** — only `write` gives fields; append only is read-only with a hint saying why.
   `two-person.mjs` passes (ports moved to 9521/9522, the field selector to `textarea`, and `authorOf` now parses the
   file because a PUT file is stored as JSON-LD; the checks themselves are unchanged).
3. **Lines under 44 px** — line boxes are at least `--sui-target`. Regression: `shell.mjs` measures every line at 400 px.
4. **Long lines cut off** — one-row textareas that grow with wrapped text. Regression: `shell.mjs` checks the long
   sample line grows past one row with no hidden overflow at 400 px.

`node tests/run.mjs`: EVERY TEST PASSED (91 PASS).
