# Notes: activity

## Judgement calls

1. **Breadth first, newest folder first, 60 listings, 4 levels.** A folder's `dct:modified` only moves when
   something is added to or removed from it, not when a file inside is edited, so it cannot be used to prune the
   walk. Breadth first keeps the shallow, usual places always covered; newest-first within a level is a cheap
   bet that pays off for new files. On the whole test pod (170 folders, with the browser and the suite symlinked
   in) it stops at 60 and lists 109 folders as not read. Ranking by folder time across levels (best first) would
   find deep new files sooner but makes "what was read" hard to explain; not done.
2. **Files only, not folders.** A folder's time is noise (see 1). A new empty folder is therefore not shown.
3. **"Files" means "no app claims it"**, not "every file". Nextcloud's "File changes" is every file; here every
   item is a file, so that filter would equal "All". Pictures are Photos, Markdown is Notes, typed RDF goes to its
   app, the rest (CSV, PDF, untyped Turtle) is Files. Only filters with something in them are shown, besides All
   and Files.
4. **Kind and title come from reading the file**, for the 40 newest Turtle / JSON-LD files, into a graph of the
   pane's own (not SolidOS's store: it would go stale and fill up). Older data files go by name and land in Files.
   A pod with many data files will show some polls or contacts under Files once they are older than the 40th.
5. **Groups are rolling:** Today, Yesterday, This week = the last seven days, Last 30 days, then calendar months.
   Calendar weeks would leave "This week" empty on Mondays. "Last 30 days" rather than "This month" for the same
   reason.
6. **A row opens the thing; it does not open the details sidebar.** The task asked for that, and DESIGN.md rule 8
   says selecting a row opens details. The details column instead holds the walk summary (the (i) button), and a
   row's own details are its tooltip (address, full date, size). If rows should open details, the details would
   need content worth showing per file (a preview, who can see it) that this pane does not read.
7. **Alone, the filters are a left column from 900 px and chips below** (the sheet allows chips "or a list above
   the content"). Two small DOMs, one shown by a media query, both drawn from the same model.
8. **Opens first only when asked for by link** (`?pane=` names this file). Otherwise a folder keeps the Files
   view and Activity is a tab. In the shell, `SUITE_APPS` with `start: 'root'` would open it through
   `state.wanted`, so it needs no focus of its own.
9. **Under 520 px the time moves into the subline** (`notes · 10 min ago`), because the sheet's row recipe drops
   the meta column there and the time is the point of this app.
10. **Re-reads on login, logout and session restore** (as the Files pane does), so a page that draws before the
   session is back still ends up showing the private folders.
11. **Photos get a 40 px preview** (the picture itself, `img src`), falling back to the icon when it cannot load
   (a private picture: an `img` does not carry the login).

## Server facts found (not in the findings report)

- **A folder's ETag does not change when a file in it is modified** (only when entries are added or removed).
  A revalidating fetch (`cache: 'no-cache'`, or the browser's own heuristics) sends `If-None-Match`, gets `304`,
  and keeps the old listing with the old `dc:modified`. Reproduced with curl: same ETag before and after `touch`,
  and `304` for it. The pane fetches with `cache: 'no-store'`. Worth adding to `jss-findings/REPORT.md`.
- Container listings give no content type for files, so kinds come from names and contents.
- SolidOS's own poll view **rewrote a poll's `index.ttl`** (as JSON-LD) when its owner opened it. Not this pane;
  the test opens a Markdown note instead so its "nothing changed" check stays honest.
- In headless runs, navigating away within about a second of an in-place navigation **lost the login** for the
  next page. With a 4 s pause it did not. Cause not found; the test pauses. Not seen by hand.

## Unverified

- Inside the real shell: now tested (`tests/shell.mjs`), opened through the views menu on a folder. The launcher's
  Activity tile (pod root) is not clicked in the tests: the whole shared pod is slow and changes under other agents.
- A second person: only the owner and logged out were tested (bob exists but has nothing of his own here).
- Pods other than JSS (NSS/CSS listings with `stat:mtime` only, `Last-Modified` only): code paths written, not run.
- Times right after midnight: the samples put "today" items 10 and 40 minutes back, clamped to after 00:01, so
  the group test holds after 00:02 only.
- Seven folders on the whole test pod could not be read even logged in; which ones (and why) shows in the details
  column; not investigated further (possibly finding 3b's garbled listings).

## Viewport

400 px is a true 400 px: `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`), checked with its
`measure()` (no sideways scroll, nothing poking past the right edge).

## Styling

Follows `design/DESIGN.md`: the token block and the `icon, nav, row, buttons, chip, empty, toast, details` recipes
copied in with `node design/embed.mjs activity/activity-pane.js --prefix act --only …` (checked by
`tests/static.mjs`). Own rules after the end marker use only `var(--sui-…)`. Built from tokens, not in the sheet:
the group heading uses `caption` made sticky; the photo preview (40 px, `--sui-radius`); the narrow subline time;
the left column's border when alone.

## Needs a decision

- Whether rows should open the details column instead of the thing (judgement call 6).

## Next

- Show the change itself where it is cheap: "Alice answered the poll" needs authors, which listings lack; a
  per-file `dct:creator` read, within the 40 data reads, would give some.
- A notification source (the inbox, or Solid Notifications) for live updates, instead of a walk per view.
- Remember the last walk's folder times to read changed folders first next time.
