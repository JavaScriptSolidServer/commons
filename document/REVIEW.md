# Review: document

Reviewed 22 Nov 2026 against `BRIEF-REVIEW.md`. Probes in a logged-in headless Chromium on port 9573/9574, against hostile
files in `suite-data/document-review/` (`nav-self.html`, `nav-refresh.html`, `landing.html`, `evil.svg`, `wide.csv`,
`grid.csv`). Screenshots: `tests/shots/review-*`. NOTES.md read only after the findings were written; where the author
already knew, the row says so.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | safety | document-pane.js:276, 425-437; README "Safety" | A hostile page CAN navigate the frame. `<a href="landing.html" target="_self">` in `nav-self.html`, clicked with a real mouse: the frame's target changed from `about:srcdoc` to `.../document-review/landing.html` ("Your session has expired. Sign in again at …") inside the pane, under the pane's own header. Any site works the same way, and a page can make the whole frame one big link. Still sandboxed (no script, no forms), but it is a phishing surface. The README says "Links inside the frame do nothing", which is false. (NOTES knew `_self` navigates; the README and the in-page note "Links inside do not open" do not.) `_parent`, `_top` and `<meta refresh>` were tried too and are blocked. | Listen for the frame's `load`: after the first one, put the original `srcdoc` back (or replace the frame) and show "Links inside do not open". At the least, make the README and the note true. |
| 2 | safety | document-pane.js:362, 431-435 | For an SVG, "Open in a new tab" is the raw file on the pod, which is this site. `evil.svg` holds a `<script>`; JSS serves it as `image/svg+xml` with no CSP, so the click runs that script on the data browser's origin, with the person's storage. The same-site warning is only drawn for HTML, so the SVG view gives no warning at all (note empty, link `…/evil.svg`). | Show the same-site note for SVG too, or for SVG offer Download instead of Open in a new tab (or open the blob-backed `<img>` copy, never the pod address). |
| 3 | bug | document-pane.js:446-467 | No cap on columns or cells. `wide.csv` (800 KB: two lines of 400,000 commas) froze the tab: the render had not finished after 90 s. `grid.csv` (1 MB, 500 × 2,000) drew 1,000,500 cells and took 6 s. A file under the 5 MB limit can hang the reader. | Cap the table (say 50 columns and 20,000 cells), say "Showing the first N columns; the text view has them all", and fall back to the text view past that. |
| 4 | nit | document-pane.js:275 | `img-src *` / `style-src *` let any HTML file load a tracking picture from anywhere the moment it is opened (tested: `nav-self.html`'s remote `<img>` was fetched). A known trade-off (NOTES), but the person is not told. | Add "Pictures from other sites are loaded" to the note, or block remote pictures until a "Show pictures" press. |

## Two-person

Not in this task ("no two-person tests"). Not tested.

## Checked and fine

- Scripts: none ran in the hostile sample; `<meta http-equiv=refresh>` to an http page did not navigate (frame stayed `about:srcdoc` for 3 s); `_parent`/`_top` links blocked; forms, pop-ups, nested frames, objects blocked by `sandbox=""` + the CSP.
- Code: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; file text and CSV cells via `textContent`; the injected `<base>`/CSP come first and the file cannot replace them.
- Writes: none. Only one `fetch` (GET of the file); no updater calls.
- Links: header links are http(s)/blob only, `rel="noopener noreferrer"`.
- States and limits: 401/403/404/other, 5 MB cap (header and streamed), content type checked again on the response.
- Design: tokens and recipes embedded, 44 px icon buttons, note/tabs from the sheet; shell (i) details look right at 1300 and 400 px.
- 400 px: true 400 px (`design/viewport.mjs`) alone (CSV) and in the shell with details open: no sideways scroll; wide CSV scrolls inside its own box.

## Fixed

| # | fix | proof |
|---|---|---|
| 1 | A frame load after the first (a `target="_self"` link) replaces the frame with a fresh one holding the page; the note says the link was stopped; after 5 tries the page is not shown. README now true. | `tests/document.mjs`: real click on `#selflink` (`target="_self"`, added to `samples/hostile.html`): note says stopped, no frame target on welcome.html, about:srcdoc with the hostile text back, one sandboxed frame. |
| 2 | HTML and SVG on the data browser's own site: no "Open in a new tab"; **Download** instead, a yellow note saying why (SVG too); the shell details' address is plain text. | `document.mjs`: welcome.html and diagram.svg offer only Download, note says "use Download"; `shell.mjs`: no link in hostile.html's details. |
| 3 | Table capped at 50 columns and 20,000 cells (plus 500 rows); the note names both cuts; the text view has everything. | `document.mjs`: wide.csv (2 × 400,000 commas) and grid.csv (2,000 × 500) made in `setup.mjs`: 50 columns, 400 rows, notes right, under 20 s each including page load. |
| 4 | The HTML note now says "pictures from other sites are loaded". | `document.mjs` HTML note check. |
