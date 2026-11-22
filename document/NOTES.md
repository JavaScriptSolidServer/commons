# Notes: judgement calls, gaps, next

## Phase 2 (suite look)

- **Reading column: `calc(var(--sui-content-max) * 3 / 4)`** (810 px). The sheet has no reading-width token; this is built
  from one rather than a new size. Wide enough for a PDF page and a four-column CSV, narrow enough for text to read as a column.
- **Text is 13 px mono on the app grey**, like a code block (`--sui-font-mono`, `--sui-text-sm`), not 15 px: a log or a
  wide text file fits better, and it keeps the reader's body type for the pane's own words.
- **Actions are icon buttons** whose name is a visually hidden span (so the link text the tests read is unchanged) plus
  a `title` tooltip. Messages that said "the links above" now say "the buttons above".
- **The HTML safety line is a `doc-note`**, yellow (`note-warning`) when the pod and the browser share a site, as it does
  here, so it is always yellow on this pod. The recipe's flex layout split the sentence in two columns; overridden to block.
- **CSV Table/Text** became the sheet's tabs (`role="tab"`, `aria-selected`) instead of pressed pill buttons.
- **Details only in the shell.** Alone, the header line already has kind, size and lines, so I did not add an inline panel.
  `renderDetails` draws from `context.suite.state.info`, which `render` fills as it reads the file, and redraws when more
  is known (so (i) pressed during loading fills in).
- **No navigation**: a file has no sections. In the shell it is content only plus (i).
- **Safety code untouched**: `framed`, the sandbox, the CSP, the blob revoking and every hostile-page check are as they were;
  the shell test adds a hostile-page check inside the shell.
- **Viewport**: `tests/sample.mjs 400` and `tests/shell.mjs` use `design/viewport.mjs` (CDP
  `Emulation.setDeviceMetricsOverride`) for a true 400 px page.

## After the review (REVIEW.md)

- **`_self` links**: Chromium has no CSP `navigate-to`, and `sandbox=""` cannot forbid a frame navigating itself. So the frame's
  `load` after the first is taken as "something moved it", and the frame is replaced by a fresh one with the same `srcdoc`. The other
  page can show for a moment before it is put back (no script runs in it: still sandboxed). Rewriting the page's links would mean
  parsing the file as HTML in the pane, which this pane never does. Tested with a real click on a `target="_self"` link in
  `samples/hostile.html`.
- **No raw open for HTML/SVG on the same site**: Download (a same-origin `download` link saves, never renders). The old
  same-site warning before "Open in a new tab" is gone with the link.
- **CSV caps**: 50 columns, 20,000 cells, 500 rows; the note names both cuts. A 400,000-column file now draws in well under a second
  of table; the text view still holds the whole file (an 800 KB line in a `pre` is hidden until asked for).
- **Remote pictures** are still loaded (trade-off kept), but the note now says so.

## Needs a decision

- The shell lists Document as a `viewer`; it opens first for `.txt`/`.csv`/`.html`/`.pdf` because nothing else in the suite
  claims them. Fine today; if a Files "preview" is wanted, the shell would need a way to show it from a folder row.
- A reading-width token (`--sui-read-max`?) in the sheet, if other readers (Notes) want the same column.

## Judgement calls (phase 1)

- **Links inside an HTML page are inert.** The injected `<base>` has `target="_blank"`, and `sandbox=""` blocks pop-ups, so a click does
  nothing. The alternative (links navigate inside the frame) swaps the document for some other site inside the pod's own view, which
  is worse for phishing and confusing. A page's own `target="_self"` links are put back (see "After the review").
- **The CSP allows pictures, styles, fonts and media from anywhere** (`img-src * data:` etc.), and forbids scripts, frames, objects,
  workers, `connect-src` and `form-action`. Without remote pictures most real pages look broken. The cost: a hostile page can load a
  tracking pixel and learn the reader's IP address and when they looked. It cannot learn anything about the session.
- **The same-site warning.** On this pod the files and the data browser share an origin, so "Open in a new tab" opens a hostile page
  on the data browser's own site with scripts running (localStorage, IndexedDB, and so on). The pane cannot fix that (it is the server's
  choice to serve user HTML on the app's origin), so it says so in one line under the frame when the origins match. Worth raising for JSS
  separately: a `Content-Security-Policy: sandbox` header on user HTML would close it.
- **SVG blob is revoked once drawn**, so a right-click "Open image in new tab" cannot render the SVG as a document on the data
  browser's origin (blob: URLs inherit their creator's origin). Tested: the blob fetch fails after load.
- **Content type first.** A `.html` file the server calls `text/plain` is shown as text, which is the safe direction. A vague type
  (`application/octet-stream`, none) falls back to the extension. `.md` and RDF extensions are refused whatever the type.
- **SVG is claimed but not focused**, as asked; the picture panes open first.
- **CSV defaults to the table** and caps it (500 rows, 50 columns, 20,000 cells); the text view has every row.
- **PDF uses `<object>`** with a fallback message inside, plus `navigator.pdfViewerEnabled === false` for browsers that say outright
  they will not show PDFs.

## What the tests found about the data browser

- For a 404 or a 401 the data browser shows its own "Failed to load … 404" and renders no pane at all, so the pane's "not found" and
  "private" states only show when the pane is drawn directly (another page, a tab, a later fetch). The tests draw it directly for those.
- The data browser loads the whole file before any pane draws, so the 5 MB limit saves rendering, not the download. Upstream's
  humanReadable pane also fetches HTML again in `label` (to spot one editor) on every call; this pane fetches once, in `render`.
- The sandboxed frame is out of process (its own origin), so the page cannot see into it at all; the tests attach to its own DevTools
  target to read its text and requests.

## Unverified or weak

- Only headless Chromium. Firefox and Safari: not run. Firefox's PDF viewer in an `<object>` from a blob should work; not checked.
- A 403 (logged in but not allowed) is handled in code but not tested: there is one test user, so no second person to be refused.
- Charsets other than UTF-8 come from the `charset=` parameter only; no `<meta charset>` sniffing for HTML (the injected
  `<meta charset="utf-8">` comes first, and the text is already decoded, so this only matters for files the server mislabels).
- `<meta http-equiv="refresh">` to an ordinary URL in a hostile page would navigate the frame (still sandboxed). Not stripped.

## Next

- A `Content-Security-Policy: sandbox` header for user HTML in JSS, then the same-site warning can go.
- TSV (and `;` separated CSV) if anyone needs it.
