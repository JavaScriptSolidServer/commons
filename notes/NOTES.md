# Notes pane: phase 2 notes

## Judgement calls

- **Navigation = the folder's notes, by file name.** Nextcloud Notes lists each note by its title and an excerpt.
  Ours lists the file name (date and dashes removed, first letter capitalised) and a date (from the file name, else
  `dc:modified` from the listing). Showing real titles or excerpts would mean a GET of every note in the folder, a
  new read the pane never made; the task said to keep the reading behaviour exactly. Needs a decision if wanted.
- **No "+ New note", no categories.** The pane is read-only; a "New note" button would be its first write, and
  categories (Nextcloud: sub-folders) would mean reading more folders. Both left out; see below.
- **The content keeps its previous / all / next bar**, also inside the shell, so the pane behaves the same in both.
- **List order** is the same file-name order previous / next step through (dated notes oldest first), not
  Nextcloud's most-recently-changed first.
- **Reading width:** `var(--sui-reading-width)` (760 px), the token the sheet added during phase 2 (was `72ch`).
- **Body text 15 px** (`--sui-text-md`), down from 17 px, to match the sheet; headings use the sheet's 24/20/17.
  The date above the title is no longer upper case (rule 6).
- **No navigation alone.** Alone, the pane draws no list of its own (the bar's "All notes" opens the folder), as
  before; the demo's chips-when-alone pattern was not needed for a one-folder reader.
- **No listing, no column:** `renderNavigation` returns its element at once with "Loading…"; if the listing then
  fails it sets `state.unlisted` and calls `refreshNavigation()`, which returns null.
- Review fixes (REVIEW.md, Fixed): title from the parser, off-folder `[[links]]` greyed, links decided by their resolved address with rel=noopener off-site, `tel:` allowed, `C#` headings kept, quotes capped at 20 deep, the HEAD check uses the logged-in fetch.
- Nested lists under a task item are indented one step more, so they no longer line up with their parent.
- Built from tokens, not in the sheet: a two-line nav item (`.note-nav-entry` 56 px, `.note-nav-sub` muted 13 px),
  styled like the row recipe's title + subline.

## Testing

- True 400 px: `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`), not the helper's `width: 400`.
- `notes.mjs` logs in (port 9519). `shell.mjs` and `loggedout.mjs` start clean, logged out (port 9520).
- **The shell test runs logged out**, on purpose: logged in, the browser loads the panes in the test user's tool
  index, which lists the *published* `https://solid-panes.github.io/notes/notes-pane.js` under the same name
  `notes-reader`. It registers first, so the shell skips this copy (`loadSuitePanes` checks `byName`) and the Notes
  app shows the old, unstyled pane with no column. Loading this copy by link too (`?pane=` twice) races with the
  shell for the focus. Logged out there is no tool index, and the shell loads this copy itself, as it should.
- A missing note (404) and, logged out, a private note (401) never reach the pane: the data browser loads the
  address first and shows its own Not Found / Access denied (in the shell this also drops the shell's frame).
  The tests check that nothing is shown and nothing stale is left, not the pane's own error line, which only shows
  for errors after the browser's own load.

## Unverified

- The static-site path (no listing: HEAD per link, no column in the shell) is not tested; no static host here.
- The `refreshNavigation()` path when the listing fails is not exercised by a test.
- Logged-in use inside the shell, for the reason above.

## Needs a decision

1. **Tool index shadows the suite copy.** The test user's `settings/tool-index.ttl` lists the published notes pane
   (name `notes-reader`), so logged in the shell's Notes app is the published pane. Options: drop that entry from
   the test pod's tool index; or have the shell's `loadSuitePanes` replace a same-named pane from elsewhere with
   the suite's copy; or rename this pane (the brief says keep the name). I changed none of them.
2. **`shell/tests/shell.mjs` line ~109** checks "content-only fallback: Notes … no nav column", and DESIGN.md says
   "The Notes pane shows the content-only fallback, untouched". With `renderNavigation` added that check fails when
   this copy is the one loaded (it passes today only because of 1). The shell test and DESIGN.md need another
   content-only example.
3. **"+ New note" and categories** (sub-folders) from Nextcloud Notes: both need the pane to write or read more;
   say if wanted.
