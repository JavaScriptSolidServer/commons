# tasks: notes

Built 22 Nov 2026 for phase 3 of the suite. Pane `suite-tasks`, prefix `tsk-`. Ports 9531 (me) and 9532 (bob).

## Judgement calls

1. **Vocabulary: SolidOS's wf: tracker for lists and done, iCalendar (`cal:`) for the to-do fields.** Looked at:
   the wf: flow ontology (SolidOS issue pane, our Deck/Boards pane), `cal:Vtodo` (the VTODO that CalDAV task apps
   store; also Melvin's `solid-apps/tasks` and the losos todo pane, which put `ical:Vtodo` items with `ical:status`
   inside one JSON-LD file per list), schema.org `Action`. wf: alone has no due date or priority; `cal:` alone has no
   notion of a list SolidOS can open; schema.org has no priority and nothing here reads it. The hybrid is a plain
   SolidOS tracker, so Boards and (in principle) SolidOS's own issue pane open a list, and the fields mean what
   CalDAV says. A task list is told apart from a board by `wf:issueClass` being a subclass of `cal:Vtodo`.
   **Not compatible with `solid-apps/tasks` / losos as they stand**: those embed the items in one JSON-LD file
   (`wf:issue` + `ical:status`) under `/public/tracker/`. This pane reads `cal:status "COMPLETED"` and `cal:summary`
   on a task, but does not look for lists there or read the embedded-array shape. If Melvin wants one format across
   his apps, that is a decision (see below).
2. **Done is the tracker state, not `cal:status`.** One source of truth, the one SolidOS and Boards read. A done
   task also gets `cal:completed` (when). `cal:status` is written only for a tracker with no closed state.
3. **Whole-file PUT with If-Match, never PATCH, and re-read after every save.** This breaks the lab brief's
   "write with `store.updater.update`" on purpose: JSS findings #5 (a `}` in a SPARQL literal silently loses the
   text; task notes are free text, and the tests type braces), #6 (PATCH to a JSON-LD-stored file drops lists; the
   list's `index.ttl` holds `owl:disjointUnionOf`), #7 (WHERE ignored). The REPORT lists PUT + If-Match as the
   workaround; meeting and contacts do the same. A 412 tells the person to try again; a mismatch after re-reading
   says "Not saved as typed". Writes are queued, one at a time.
4. **No `dct:`** (findings #4): `dc:title`, `dc:created`. Both read.
5. **Where the lists come from:** the folders beside the open list (its parent folder), up to 40, each probed for
   `index.ttl`. Opening on a folder works when it is named `tasks` (as the inbox/health lab panes do) or when its
   list folders are already loaded. No type index: writing to it touches the person's private settings, and the
   shell's own type-index start would then need `cal:Vtodo` registrations nobody writes yet. See "Needs a decision".
6. **Alone, three columns of its own**, following DESIGN.md's breakpoints on the pane's own width (container
   queries, not media queries, since the data browser puts margins round a pane): details float at 1100, lists become
   a drawer at 900, details take the width at 600, row facts move under the title at 520. DESIGN.md allows "chips or
   a list above the content" alone; a drawer is closer to the shell and Nextcloud.
7. **Row facts kept at 400 px.** DESIGN.md rule 8 drops row meta under 520 px; for a to-do the due date is the
   point, so below 520 the facts (notes mark, flag, due) wrap under the title as a subline instead of vanishing.
8. **Priority is shown as the tick box's border colour plus a flag** (error/warning/primary tokens), High = 1,
   Medium = 5, Low = 9.
9. Fields in the details save on `change` (blur or Enter), as Nextcloud does: no Save button.
10. New list button is secondary (pale), Add is the one primary button in the view (DESIGN rule 3).
11. Kept `dc:author` on each task (SolidOS issues do not have it; Boards writes it too) so "Added by" works.

## Design sheet

DESIGN.md arrived mid-build; the pane follows it: tokens + recipes embedded with
`node design/embed.mjs tasks/tasks-pane.js --prefix tsk --only base,icon,nav,toolbar,row,buttons,input,empty,toast,details`
(checked by `tests/static.mjs` with `--check`). Own rules use only `var(--sui-…)`. Inside the shell the nav and
details elements do not carry the alone-only `nav`/`details` recipes; actions end in `context.suite.toast()`.

Pieces the sheet lacks, built from tokens and noted here:
- **A tick box** (`tsk-check`/`tsk-box`): a 44 px round target around a 20 px (`--sui-icon`) square, 2 px border,
  `--sui-radius-sm`; ticked fills with `--sui-border-strong`. Priority colours the border.
- **A fold toggle** ("N completed tasks"): a tertiary button with a chevron that turns.
- **The status line vs the browser:** the data browser styles every `[role="status"]` as a padded green box
  (mash.css). The sheet's `status` recipe does not undo that; this pane does (`.tsk-root .tsk-status[role=status]`).
  Every pane using `ui-status` with `role="status"` will hit it — worth adding to `recipes.css`.

## Verified

`node tests/run.mjs` → EVERY TEST PASSED (static, sample, tasks, shell, bob, interop). Looked at every screenshot in
`tests/shots/` at 1300 and true 400 px (alone, in the shell, as bob, logged out, details open and closed).
True 400 px is `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`), not the helper's window width.
Two people: bob reads me's public list, gets no controls and "You can see this list but not change it.", and his
own PUT is refused (403), file unchanged.

## Unverified or weak

- **SolidOS's own issue pane** on a Tasks list: same format, not opened in a test (only our Boards pane was).
- **CalDAV round trip**: the field meanings are VTODO's, but nothing converts to or from .ics.
- **The shell load race in the test:** with both panes given by `?pane=`, the browser registers whichever module
  arrives first; if this pane wins, it opens alone. `tests/shell.mjs` reloads (up to 3 times) when that happens.
  Goes away once Tasks is in `SUITE_APPS`.
- A list folder name with an apostrophe (JSS 3b) cannot happen from this pane (slugs are `a-z0-9-`), but a list made
  elsewhere with one would trip the server's listing.
- 40-folder cap on discovery; a big parent folder means 40 HEAD-less GETs of `index.ttl` (404s for non-lists).
- Folder detection by the name `tasks` is a heuristic; the pane's own source folder (`suite/tasks/`) is excluded.
- No undo for delete (two presses, disarmed after 4 s or on leaving the button). Concurrent edits: see REVIEW.md
  "Fixed" — a stale edit is refused per field, a 412 keeps the typed text; still no live refresh, so a person only
  sees someone else's change when they save, reload or switch lists.
- Dates show in the browser's locale; the tests accept any order of day and month.

## Needs a decision

1. **Add Tasks to the shell's launcher** (`shell/suite-shell-pane.js`, not mine to edit). Suggested entry, placed
   **before** `boards` so a task list opens in Tasks rather than Boards (both ask for focus on a tracker; the shell
   picks the first suite app that does):
   `{ id: 'tasks', name: 'Tasks', folder: 'tasks', pane: 'suite-tasks', icon: 'tasks', start: [...] }`
   with an MDI `format-list-checks` path for `icon`. For `start`, either a fixed folder
   (`<pod>/public/tasks/`? the shell has no such kind yet) or a type-index class (`http://www.w3.org/2002/12/cal/ical#Vtodo`)
   — which needs someone to register lists there (see 2). Alternatively the Boards pane could decline focus for a
   tracker whose issue class is a `cal:Vtodo`.
2. **Register lists in the type index?** SolidOS registers trackers in the person's type index. Doing so for task
   lists (`solid:forClass cal:Vtodo; solid:instanceContainer <tasks/>`) would let the shell and other apps find them,
   but means this pane writing to the person's private type index. Not done.
3. **One task format across Melvin's apps?** `solid-apps/tasks` and the losos todo pane use a different shape (items
   embedded in one JSON-LD file, `ical:status`, `dct:` terms, which JSS rewrites to `dc:`). Either those move to the
   SolidOS tracker shape used here, or this pane learns to read theirs.
4. Recipes: the `[role="status"]` override above belongs in `design/recipes.css`.

## After the review (22 Nov)

REVIEW.md found a lost update from a stale details panel, typed text lost after a 412, ticks dropped during a
save, and writes to whatever `wf:stateStore` named. All fixed; see its "Fixed" section and `tests/fixes.mjs`.
`tests/two-person.mjs` (the reviewer's) now runs on ports 9531/9532 instead of 9571/9572; its checks are unchanged.

## Next, if there were more time

Smart lists (Today, Important, All), moving a task between lists, times on due dates, subtasks (`cal:relatedTo`),
an .ics export of a list.
