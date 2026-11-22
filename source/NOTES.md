# Notes: judgement calls, gaps, next steps

## Suite phase 2 (restyle)

- **Two homes for a message, by length.** The old pane had one coloured box for every message. The sheet has a quiet
  status line (for "Saving…"/"Saved") and a note (for what stays true). Rule in `say()`: one line of 48 characters or
  less, not an error and with no buttons, goes in the status line at the right of the toolbar; everything else is a
  note above the text (`note-error` for errors). Both carry `data-tone` (good/bad/info) and class `src-msg`; the tests
  read whichever is showing.
- **No success note in the sheet.** A long "Saved. The server keeps this file in its own layout…" is a plain
  `note` (pale blue) with a green check icon (`src-note-ok` only colours the icon with `--sui-success`). If the
  sheet wants a `note-success`, it should add one.
- **Buttons:** Copy is a round icon button (`btn-icon`, `aria-label` + tooltip); Edit and Save are the one primary
  pill (never both at once); Cancel is tertiary. "Save anyway" and "Load the server's version" are secondary
  (`btn`): the sheet keeps danger for deleting, so the old red "Save anyway" is gone.
- **No details column, though the task allowed file info there.** The shell's own test (`shell/tests/shell.mjs`,
  "picking one shows it in the same frame, content only (no nav, no details)") picks Source and checks there is no
  (i) button, so a `renderDetails` would break another folder's test. The facts (type, size, modified) are cheap to
  show in the quiet line above the toolbar instead, which is also where a text editor shows them. See "Needs a decision".
- **Modified time:** JSS sends no `Last-Modified` on GET (it is in `Access-Control-Expose-Headers`, but not sent). So the
  pane takes the folder listing's `dct:modified` from the store when it is there (the data browser loads the parent
  folder, so it usually is), and after a save it shows "now" by the browser's clock. It never fetches the folder itself.
- **Width:** the column is `--sui-content-max` (1080), not a narrower "readable" measure: code lines are long and
  the text box scrolls sideways anyway. Line height of the code is `--sui-space-5` (20 px) so the gutter and the
  text stay lined up with the height maths in `fitHeight`.
- **Pane icon** is MDI code-tags filled `#00679e` (`--sui-primary-element`; a `data:` image cannot read a CSS
  variable). The test finds our menu item by that colour, as it did with the old one.
- **Toasts not used.** In the shell the sheet suggests `context.suite.toast()` after an action; the task asked for a
  status line, and the pane behaves the same alone and in the shell. Copy could toast in the shell; not done.
- **Tests:** port 9521. 400 px is a true 400 px page via `design/viewport.mjs` (CDP
  `Emulation.setDeviceMetricsOverride`) in `layout.mjs`, `logged-out.mjs` and `shell.mjs`, with `measure()`
  for sideways scroll. Selectors changed: buttons are matched by `aria-label` or text, messages by `.src-msg`.
  One check added (modified time); none removed.

### Needs a decision

- Should Source get a details column (file info, sharing) in the shell? It would need `shell/tests/shell.mjs` to stop
  expecting "no details" for `source-lab`.
- The sheet has no `note-success`; add one, or keep successes as status lines only?
- JSS: send `Last-Modified` on GET (it already exposes the header to scripts).


## Judgement calls (lab phase)

- **The store is renewed by hand, not with `fetcher.load(doc, { force: true })`.** I tried the forced load first. It
  works, but the data browser has a long-lived `done` callback (`outline/manager.js`, `sf.addCallback('done', expand)`,
  commented "This can really mess up existing work") that redraws the page's subject in its default view when that
  document finishes loading. So a save threw the person out of the Source view into the table. Instead the pane calls
  `fetcher.unload(doc)` (forgets the statements and the "already fetched" mark, so the next load by anyone reads it
  afresh) and parses the server's copy into the store itself. The test checks that the store holds the new value and not
  the old one. Side effect: the fetcher's response metadata for that document (headers, media type) is gone until
  the next real load.
- **Label is generous.** It says "Source" for any http(s) document that is not a folder and not a `#thing`, unless the
  store already knows a non-text media type, or the name ends in a plainly binary extension (.png, .pdf, .zip …).
  `label` must answer at once, so a file the store has not read yet is offered and checked on render; binary is then
  refused with type and size. Upstream labelled ".js" as "Javascript Source" and so on; I used just "Source" as asked.
- **No label for `doc#thing`**, so the Source menu item is not on every person or poll inside an RDF file; it is on the
  file. Upstream did the same in effect (it reads the subject's own types).
- **Edit permission**: `WAC-Allow` user modes decide when the server sends it (JSS always does); `store.updater.editable`
  only when it does not. `editable` depends on the fetcher having loaded the document, which it may not have for a plain text file (reasoned from rdflib, not tested).
- **Accept header** follows the file name (`.ttl` → `text/turtle`, etc.), else `*/*`. JSS ignores it for files on disk
  and converts PUT-stored RDF to Turtle for `.ttl` either way.
- **Content-Type on PUT** is exactly what the GET returned, including `; charset=utf-8`. Note JSS serves `.json` as
  `application/ld+json`, so a plain JSON file is checked as JSON-LD too (JSON.parse first, then rdflib; plain JSON with
  no `@context` parses to an empty graph without error, so it passes).
- **"Same data" check** after saving RDF: both texts parsed with rdflib, statements printed as N-Triples with every
  blank node written `_`, sorted and compared. Cheap and good enough here; it is not true graph isomorphism, so two
  graphs differing only in how blank nodes connect would compare equal.
- **Leave warning**: an in-page "Unsaved changes" badge, plus a `beforeunload` handler that is attached only while
  editing (it removes itself when the pane leaves the page). No `confirm()`/`alert()`. Moving to another resource
  inside the data browser does not unload the page and cannot be stopped from a pane, so (after review) the unsaved
  text is kept per file in `sessionStorage` with the ETag it was based on and offered on the next open.
- **Tab** inserts two spaces always while editing; to keep keyboard users from being trapped, Esc then Tab moves focus on.
- **Large files**: over 1,000,000 bytes, the first 1,000,000 bytes are decoded and shown, and Edit is not offered
  (saving would cut the file).
- **412 handling** offers only "Load the server's version" (replaces the text; Copy first to keep yours). There is no
  "overwrite anyway", as the task said never to overwrite silently and I kept the scope tight.
- **Header line**: the data browser already shows the file name as a heading, so the pane shows the name once, small,
  with type and size, rather than a second big title.

## Found on this server (JSS)

- `If-Match` with a stale ETag gets 412, as hoped. A PUT's response carries no ETag, so the pane re-reads to get one.
- A Turtle PUT is stored as JSON-LD and served back as Turtle with full IRIs and a fixed set of prefixes: comments,
  relative IRIs and layout are lost. The README says what the person sees.
- **"Save anyway" on broken JSON in a `.json` file was accepted (201) and stored as sent**, even though it was sent
  as `application/ld+json`. The pane reports whatever the server answers; the test accepts either outcome.

## Unverified or weak

- A second person (read-only access to someone else's file) cannot be tested: one test user. Logged out is tested,
  and a private file logged out ("This file is private. Log in to see it.").
- The browser's own leave dialog is not seen in headless runs; the test checks the `beforeunload` event is cancelled
  while there are unsaved changes and not after Cancel.
- Copy is tested with clipboard permission granted; the `execCommand('copy')` fallback path is untested.
- Non-UTF-8 text files are decoded as UTF-8 and would be re-saved as UTF-8.
- On a 1 MB file the gutter is one `<pre>` of numbers; fine here, untested on slow phones.
- Logging in or out while the pane is open does not redraw it (the data browser usually redraws on login).

## Next, if wanted

- Warn before saving a `.ttl` on a server known to re-serialise it (comments will go).

## After review (REVIEW.md)

- Finding 1 (unsaved text lost on in-app navigation): drafts in `sessionStorage`, per file, with their base ETag;
  offered as a note ("Restore them" / "Discard them"). Restoring uses the draft's ETag, so a file changed since gets
  412, not a silent overwrite. Drafts are dropped on Save, Cancel, Discard, or when the file already holds that text.
  Not shared across tabs (sessionStorage); a closed tab loses it (the leave warning covers that).
- Finding 2 (no ETag): `If-Unmodified-Since` from `Last-Modified` when there is one; with neither, the Edit note says
  so. Tested by stripping the ETag in the page's `window.fetch` (JSS always sends one).
- Finding 3 (whole file read): the body stream is read up to 1,000,001 bytes, then cancelled. Not measured in a test
  beyond the existing large-file checks (the first 1,000,000 characters, the size from `Content-Length`).
- Finding 4 (plain JSON into the store): skipped for `application/json`; tested with a fetch wrapper that serves
  `settings.json` as `application/json` (JSS serves `.json` as JSON-LD, which is still parsed).
- The design block was re-run with `embed.mjs` (the sheet had changed on disk); not edited by hand. The sheet now
  resets `[role=status]`, so that "Needs a decision" item is done.
