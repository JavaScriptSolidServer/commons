# Review: source (text editor)

Reviewer's probes: files in `suite-data/source-review/` (`a.ttl`, `b.jsonld`, `c.txt`), logged in on port 9575;
screenshots `tests/shots/review-probe/shots/review-*`. Line numbers are `source-pane.js`.

| # | severity | where | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | source-pane.js:553-567 | Unsaved edits are guarded only by `beforeunload`. Moving to another resource inside the data browser or the shell (a link, the shell's search, another file from Other views, the back button within the app) replaces the pane and the typed text is gone with no warning. That is the common way to leave in the suite. (The author lists a sessionStorage draft under "next".) | Keep the draft (per URI) in `sessionStorage` while dirty and offer it on the next open, or intercept the shell's `go()` while dirty. |
| 2 | nit | source-pane.js:645 | `If-Match` is sent only when the read gave an `ETag`. JSS always sends one (checked: `.ttl`, `.jsonld`, `.txt`, and the same ETag under Turtle and JSON-LD conneg), but on a server that does not, Save overwrites silently, which the README says never happens. | With no ETag, send `If-Unmodified-Since` from `Last-Modified`, or say "this server cannot detect conflicts" next to Save. |
| 3 | nit | source-pane.js:444 | A file over the 1 MB limit is still read in full (`arrayBuffer()`) before the first megabyte is shown; a 500 MB log pulls 500 MB into the tab. | Read the stream and stop after `LIMIT` bytes (or send `Range: bytes=0-999999`). |
| 4 | nit | source-pane.js:717 | After saving a plain `.json` file, `renewStore` parses it into the store as JSON-LD, so arbitrary JSON keys may turn into junk triples about the document in the shared store. | Skip the store parse for `kind === 'json'`. |

## Two-person

Not asked for this pane. Not tested.

## Checked and fine

- Lost update: I edited `c.txt`, then changed the file on disk underneath; Save got **412**, said so, kept my text, and offered "Load the server's version"; the disk kept the other writer's text.
- Double save: three clicks on Save within 120 ms on `b.jsonld` and `a.ttl` sent exactly **one** PUT (counted at `window.fetch`); `busy` and the synchronous parse check close the gap.
- Turtle round trip: the server's re-laid-out copy is shown and the message says the data is the same (triple compare), as the README says; red when the data differs.
- Writes: one `PUT` of the file at its own address with its own content type, only on Save / Save anyway / Ctrl+S. Nothing else.
- Safety: no `innerHTML`/`eval`; file name and text only through `textContent`/`value`; the binary "open" link is the file's own http(s) address with `rel="noopener"`.
- Access: Edit only with `WAC-Allow` user write (append alone does not count), logged out read-only.
- 400 px: true 400 px in the shell on `people.ttl`: no sideways scroll; the text box scrolls sideways inside itself; all buttons 44 px.
- Design: one primary button, tertiary Cancel, status line and notes from the sheet; content only in the shell, as DESIGN.md says for Source.

## Fixed

1. **Unsaved edits lost on in-app navigation** — while dirty, the text (and the ETag it was based on) is kept per file in
   `sessionStorage`; the next open offers "Restore them" / "Discard them". A restored draft saves against its own
   ETag, so a file changed meanwhile gets 412. Regression (`source.mjs`): leave and return via the browser's
   `openPane` (no unload): draft offered, restored, cleared by Cancel; a draft over a file changed on disk is refused.
2. **No ETag** — `If-Unmodified-Since` from `Last-Modified` when present; with neither, the Edit note says a change made
   elsewhere would be replaced. Regression: ETag stripped by a `window.fetch` wrapper: note shown, PUT without `If-Match`.
3. **Whole file read** — the stream is read to 1 MB + 1 byte and cancelled. Regression: the existing large-file checks.
4. **Plain JSON parsed into the store** — skipped for `application/json`. Regression: `settings.json` served as
   `application/json` by the wrapper; after Save the store holds no statements for it.

`node tests/run.mjs`: EVERY TEST PASSED (73 PASS).
