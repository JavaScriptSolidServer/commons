# source

A SolidOS pane that shows the raw text of a file in a pod, and lets its owner edit it. One file, no
dependencies: a plain text box in a monospace font, with line numbers beside it.

**In the suite** it is a viewer (`viewer: true` in the shell's `SUITE_APPS`): open any text file in the suite shell
and choose **Source** from the frame's **Other views** (three dots) menu:
[notes.md in the shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsource%2Fnotes.md).

## The look (suite phase 2)

Restyled to the suite's design sheet as a plain document editor, the way a Nextcloud user knows "Text":

- One centred column (`--sui-content-max`): a quiet line with the file's name, type, size and when it was modified;
  a slim toolbar row (a round **Copy** icon button, the one primary pill **Edit** or **Save**, a tertiary **Cancel**);
  then the text in a rounded box with its line numbers.
- Feedback is the sheet's status recipe: short news ("Saving…", "Saved.", "Copied 468 characters.") is a quiet status
  line at the right end of the toolbar; "Unsaved changes" is a warning chip there. Anything longer, anything wrong,
  or anything with its own buttons (the parse error with **Save anyway**, the conflict with **Load the server's
  version**, the large-file notice) is a note above the text (`note`, `note-error`).
- A file that cannot be shown (private, missing, a folder, a picture) is the sheet's empty state: a big muted icon,
  a title, one sentence (and, for a picture, a link to open it).
- Tokens and recipes come from `design/` (`embed.mjs --prefix src --only icon,toolbar,buttons,chip,empty,toast`).
  No navigation and no details column: in the shell it is content only.
- "Modified" comes from the `Last-Modified` header when the server sends one (JSS does not), else from the folder
  listing's `dct:modified` if the store already holds it (the data browser loads it); it makes no extra request.

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as SVG `data:` URIs:
code-tags (the pane's icon), content-copy, pencil, content-save, close, information-outline, alert-circle-outline,
check-circle-outline, lock, file, open-in-new.

## Alone in the data browser

It is an alternative view. It never opens first: in the data browser, choose **Source** from the
**More options** menu (the three dots) of a file.

**Try it locally** (the test pod must be running; log in to edit):
[people.ttl](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fsource%2Fsource-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsource%2Fpeople.ttl),
[notes.md](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fsource%2Fsource-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsource%2Fnotes.md),
[settings.json](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fsource%2Fsource-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsource%2Fsettings.json).
Those files are put there by `node tests/run.mjs` (copies of `samples/`).

## What it does

- **Reads** any file that is not a folder, as the person looking at it, and shows its text read only, with its name,
  content type and size, and a **Copy** button.
- **Text** means the server's content type is `text/*`, JSON, JSON-LD, Turtle, N3, JavaScript, XML (SVG too),
  Markdown, YAML, CSV and the like. Anything else (a picture, a PDF) is refused with its type and size, and a link to
  the file itself. The menu does not offer Source for such files at all, once the type or name gives them away.
- **Large files** (over 1 MB) show their first megabyte, say so, and cannot be edited here. Only that much is read.
- **Edit** appears only when the person is logged in and the server says they may write (`WAC-Allow: user="… write …"`;
  if the server does not say, the store's `updater.editable`). Edit makes the text editable; **Save** writes it;
  **Cancel** puts it back. **Ctrl+S** (Cmd+S) saves. **Tab** adds two spaces; Esc then Tab moves on out of the text.
- While there are unsaved changes, "Unsaved changes" shows beside the buttons, and closing or reloading the page brings
  up the browser's own leave warning. Leaving the view inside the app (a link, the shell's search, another view) cannot
  be warned against, so the unsaved text is kept in this tab's `sessionStorage` and the next time the file is opened
  here a note offers **Restore them** or **Discard them**. A restored draft is saved against the version it was made
  from, so if the file changed meanwhile Save gets 412 and says so.
- **Checks before saving.** Turtle and N3 are parsed with rdflib, JSON-LD with `JSON.parse` and rdflib, JSON with
  `JSON.parse`. If the text does not parse, nothing is saved: the error is shown with its line, and a separate
  **Save anyway** button saves it if the person really means it.
- **If the file changed on the server** since it was read, the save is refused (412), the person's text stays in the box,
  and **Load the server's version** replaces it with what is there now. Nothing is overwritten silently.
- After a save it reads the file back and shows what the server holds, and puts that into the data browser's store, so
  other views (the default table, for example) show the change.

## What the person sees after saving Turtle on this server

The JavaScript Solid Server keeps an RDF file it is sent as JSON-LD, under the same name, and serves it back as Turtle
in its own layout. So after saving a `.ttl` file the text box shows the server's version: the same data, but with
full addresses in place of `<#alice>`, its own prefixes, and **without the person's comments or spacing**. The pane
tells the difference apart by parsing both into triples, not by comparing the text, and says:
"Saved. The server keeps this file in its own layout … the same data, but your comments, spacing and order are not
kept." If the data itself came back different, it says that instead, in red. Plain text and Markdown are kept byte
for byte ("Saved."). A `.json` file is kept as sent, and served back pretty-printed.

## What it reads

Only the file itself: a `GET` with the logged-in fetch (`store.fetcher._fetch`), `cache: 'no-store'`, and an `Accept`
header for the form the name suggests (`text/turtle` for `.ttl`, `application/ld+json` for `.jsonld`,
`application/json` for `.json`, `*/*` otherwise). It keeps the `ETag`, `Content-Type` and `WAC-Allow`.

## What it writes, and when

Only when the person presses **Save** or **Save anyway**, or presses Ctrl/Cmd+S while editing:

| What | How |
|---|---|
| The whole file, at its own address | `PUT`, the same `Content-Type` it was read with, `If-Match: <ETag>` (a server that sends no ETag: `If-Unmodified-Since` from `Last-Modified`; with neither, Edit says a change made elsewhere would be replaced) |
| Unsaved text, in the browser only | this tab's `sessionStorage` (key `source-lab:draft:<address>`) while there are unsaved changes; removed on Save, Cancel or Discard. Never sent to the pod. |

Nothing else, ever. It creates no files, and it does not write when logged out or without write access (the buttons
are not there). In the store it only replaces its copy of that one document (and for plain `application/json` only
forgets it: JSON that is not JSON-LD is not parsed as RDF).

## The data

Any text. For example, `samples/people.ttl`:

```turtle
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#alice> a foaf:Person ; foaf:name "Alice Example" ; foaf:knows <#bob>, <#carol> .
```

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/source/source-pane.js')).default)
```

Its `name` is `source-lab`, its label "Source".

## Tests

`node tests/run.mjs` first checks the design block is current (`design/embed.mjs --check`), then runs `source.mjs`
(logged in, 1300 px: read, copy, edit, checks, save, conflict, cancel, leave warning, large and binary files, reload,
the modified time), `layout.mjs 400` (the same session at a true 400 px), `shell.mjs` (inside the suite shell, picked
from Other views: read, edit, save, content only, 1300 and a true 400 px) and `logged-out.mjs` (1300 and a true 400 px,
and a private file). The true 400 px page is `design/viewport.mjs` (CDP device metrics). Browser port 9521. They write
only in `suite-data/source/` on the test pod. Screenshots are in `tests/shots/`.

## Not done

Syntax colouring, search and replace, creating new files and a diff view were left out on purpose. Saving a file that
is shown only in part is not offered. Line numbers assume no line wrapping (the text box scrolls sideways instead).
