# notes pane

Markdown notes in a Solid pod, read as pages in the SolidOS data browser, with links between notes.
The pane is one ES module with no dependencies, loaded by link. In the suite it is the **Notes** app.

**Try it locally (alone):** <http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fnotes%2Fnotes-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fnotes%2Fjournal%2Fwelcome.md>

**In the suite shell:** <http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fnotes%2Fjournal%2Fwelcome.md>
(run `node tests/setup.mjs` first to put the samples there; see NOTES.md for why, logged in, the shell may show the
published copy of this pane instead).

Published copy: <https://mashlib.com/dynamic/?pane=https%3A%2F%2Fsolid-panes.github.io%2Fnotes%2Fnotes-pane.js&uri=https%3A%2F%2Fsolid-panes.github.io%2Fnotes%2Fnotes%2Fwelcome.md>

## What it does

- Shows any `.md` or `.markdown` file as a clean page: headings, lists, task lists, tables, code, quotes, links.
- `[[name]]` links to the note `name.md` in the same folder, and `[[name|label]]` shows your own words.
  A note that does not exist is shown greyed, not as a broken link.
- A date at the start of the file name (`2026-11-18-first-entry.md`) is shown above the title, and
  `[[first-entry]]` finds the note without the date.
- Previous and next step through the notes in the folder; "All notes (n)" opens the folder.
- Links between notes (`[[…]]`, previous, next) open in place. Ordinary Markdown links are plain links.
- The Markdown is turned into page elements one by one, never inserted as HTML, so a note cannot run script.
- **In the suite shell** (phase 2): the shell's left column lists the notes of the folder, each by its name and
  date (the date in the file name, else "Changed …" from the folder listing), the open one marked. Picking one opens
  it in the content, staying in the shell. There is no details column (Nextcloud Notes has none). Alone in the data
  browser the pane looks and works as before, with no column of its own.

Previous and next, the shell's list, and finding a note without its date need the folder's listing. A Solid pod
gives one; a static site does not, so there the pane shows the note, follows links by name, and gives the shell no
column.

## What it reads and writes

- Reads: the note itself (a GET through the browser's logged-in fetch) and its folder's listing (`ldp:contains`,
  and `dc:modified` for the shell's list). With no listing, a HEAD for each `[[link]]` to see whether it is there.
- Writes: **nothing**. The tests check that no PUT, PATCH, POST or DELETE is sent and the pod files are unchanged.

## What changed in the suite (phase 2)

- Restyled with the suite's design sheet (`design/`): tokens `--sui-*`, and the `icon`, `nav` and `buttons`
  recipes copied in by `node design/embed.mjs notes/notes-pane.js --prefix note --only icon,nav,buttons`. Class
  prefix `note-`; root `<div class="note notes-reader-pane note-root">`. The previous / next bar is now
  `note-pager` (its old name `note-nav` is the sheet's navigation class).
- Previous / next are tertiary buttons with chevrons, "All notes" a secondary button; under 520 px previous / next
  become icon buttons with their name as a tooltip.
- `renderNavigation` added (the shell's contract, DESIGN.md). No `renderDetails`, no `search`.
- External links (`http(s)`) now carry `rel="noopener"`.
- The pane's own icon is the MDI note icon in the suite's blue.

## Tests

`node tests/run.mjs` (ends `EVERY TEST PASSED`). `setup.mjs` resets `suite-data/notes/` on the pod from
`samples/journal/` and adds a private note. `notes.mjs` (port 9519, logged in, alone), `shell.mjs` and
`loggedout.mjs` (port 9520, clean browser). True 400 px via `design/viewport.mjs`. Screenshots in `tests/shots/`.

## Using it

- By link, on mashlib dynamic: `https://mashlib.com/dynamic/?pane=https://solid-panes.github.io/notes/notes-pane.js&uri=<your note>`
- On a JavaScript Solid Server: `jss start --mashlib-cdn --panes https://solid-panes.github.io/notes/notes-pane.js`
- In any SolidOS page: `panes.register((await import('https://solid-panes.github.io/notes/notes-pane.js')).default)`

SolidOS has its own Markdown view (the human-readable pane in solid-panes). This pane is registered under a
different name, `notes-reader`, and asks to be shown first for Markdown files.

## Credits and licence

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0): file-document (note),
chevron-left, chevron-right, folder.

[AGPL-3.0-or-later](LICENSE), copyright Melvin Carvalho.
