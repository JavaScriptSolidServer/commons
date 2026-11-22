# document

A SolidOS pane that shows a human-readable file in a pod as itself: an HTML page, plain text, a CSV, a PDF or an SVG picture.
It replaces the behaviour of upstream `humanReadablePane.js`, written from scratch. Name `document-lab`, label **View**. Read-only.

**Try it:** [the hostile sample page](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fdocument-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fsamples%2Fhostile.html)
· [a plain page](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fdocument-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fsamples%2Fwelcome.html)
· [text](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fdocument-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fsamples%2Fnotes.txt)
· [CSV](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fdocument-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fsamples%2Fteam.csv)
· [PDF](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fdocument-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fsamples%2Fminutes.pdf)

· [in the suite shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdocument%2Fsamples%2Fteam.csv) (press the (i) button for the file's details)

## In the suite (phase 2)

- Restyled with the suite's design sheet (`design/`): the token block and the `icon`, `buttons`, `toast` and `details`
  recipes are embedded with `design/embed.mjs` (prefix `doc`), and the pane's own rules use only `--sui-*` values.
- A reader: one centred column (three quarters of `--sui-content-max`, 810 px), 15 px body type, a slim header row with
  the file name, its kind/size/lines in muted small type, and the actions as 44 px icon buttons (**Open in a new tab**,
  **Download**; named for screen readers and as tooltips).
- The HTML safety line is a suite note (yellow when the pod and the browser share a site); errors are a red state box;
  CSV's Table/Text switch uses the sheet's tabs.
- **Details** (`renderDetails`): inside the shell, the (i) button shows the file's kind, content type, size, lines or rows,
  how it is shown (HTML: without scripts, in a sandbox) and its address. Alone in the data browser there is no details
  column; the header line says the same, more briefly. No navigation column (a single file has no sections).
- Nothing changed in what it shows, claims, fetches or how: the sandbox, the CSP, the blob handling are as before.
- Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0): file-document, open-in-new, download.

## What it does

| File | Decided by | Shown as |
|---|---|---|
| HTML | `text/html`, `application/xhtml+xml`; `.html`, `.htm`, `.xhtml` | a frame with `sandbox=""`, no scripts, its own scrolling |
| Text | `text/plain`; `.txt`, `.log`, `.text` | the text, wrapped, with its size and lines |
| CSV | `text/csv`; `.csv` | a table of at most 500 rows, 50 columns and 20,000 cells (it says when there are more), or the text |
| PDF | `application/pdf`; `.pdf` | the browser's PDF viewer, from a copy in memory, plus a download link |
| SVG | `image/svg+xml`; `.svg` | a picture, through `<img>` only |

- The content type decides; the file name only when the server gives no type (or `application/octet-stream`). The type is checked
  again on the response the pane fetches.
- It opens first (takes the focus) for HTML, text, CSV and PDF. SVG is claimed but left to picture panes to open first.
- Never claimed: Markdown (the notes pane has it), RDF documents (`.ttl`, `.jsonld`, …), folders, anything else.
- Every view has **Open in a new tab** (the file itself, `rel="noopener noreferrer"`), except HTML and SVG on the data browser's own
  site (see Safety); PDFs, those, and files too large to show have **Download**.
- States: loading; private (401: "Log in to see it"); not allowed (403); not found (404); too large (over 5 MB: the links, nothing rendered);
  any other error with its status.

## Safety

A file in a pod can be hostile, and a pane runs with the person's session. So:

- **HTML** goes into `<iframe sandbox="" srcdoc="…">`. With nothing allowed in the sandbox, the page gets an origin of its own and
  can run no script, submit no form, open no window and move no other page. The pane also puts a `Content-Security-Policy` that forbids
  scripts, frames, objects, fetches and form posts at the very top of the document, and a `<base href>` for the file's own address (so its
  relative pictures and links resolve; the first `<base>` counts, so the file cannot replace it). Links inside the frame do not open:
  an ordinary link targets a new window, which the sandbox refuses; a link that names its own frame (`target="_self"`) can move the
  frame, so whenever the frame loads anything after the page, the pane puts the page back (a fresh frame) and the note says "A link
  inside tried to open another page in its place; it was stopped." After five tries the page is no longer shown. The note says
  "Shown without scripts. Links inside do not open; pictures from other sites are loaded."
- **HTML and SVG are never offered to open on their own when the pod and the data browser share a site** (as on this test pod):
  opened there, the file's scripts would run on the data browser's site with the person's session. Those views have **Download**
  instead of **Open in a new tab**, a yellow note saying why, and in the shell's details the address is text, not a link. On another
  site, **Open in a new tab** is offered as for every other kind.
- **SVG** is only ever an `<img src="blob:…">`, where an SVG cannot run script. The blob address is dropped once the picture is drawn, so
  it cannot be opened as a page on this site.
- **PDF** blobs are typed `application/pdf` and dropped when the pane leaves the page.
- **Text and CSV** are set with `textContent`. Nothing from a file is ever parsed as HTML by the pane. No `innerHTML` anywhere.

## What it reads and writes

It reads the one file on show, with the logged-in fetch (`store.fetcher._fetch`). It writes nothing.

## The data

Any file of the types above. For example, `samples/team.csv`:

```
name,role,email,notes
Alice,Chair,alice@example.org,"Runs the meetings, keeps the minutes"
Bob,Treasurer,bob@example.org,"Says ""no"" to new tools, usually"
```

Quoted fields, `""` inside quotes and line breaks inside a cell are read (RFC 4180, comma only).

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/document/document-pane.js')).default)
```

## Tests

`node tests/run.mjs` (needs the suite's test pod and `local.json`; port 9535). It checks the embedded design block is current
(`design/embed.mjs --check`), then `tests/document.mjs` logs in and covers every kind of file, the hostile page (real mouse
clicks on its `javascript:` link, ordinary link and form, and a look inside the frame through DevTools), the blob clean-up, the
states, what it does not claim and a reload. `tests/shell.mjs` runs it inside the suite shell: content only, the (i) details
(text, CSV, HTML), the hostile page inside the shell, no sideways scroll at 1300 px and a true 400 px (details open too).
`tests/sample.mjs 1300|400` reads the samples logged out; 400 is a true 400 px page (`design/viewport.mjs`).
`tests/make-samples.mjs` rebuilds `samples/minutes.pdf`. Test files go to `suite-data/document/` on the pod.

## Not done

Editing, Markdown, office formats, syntax colouring (all out of scope). TSV and other separators. Pictures inside an HTML page that
need a login (the frame cannot send the person's credentials). Showing more than 5 MB.
