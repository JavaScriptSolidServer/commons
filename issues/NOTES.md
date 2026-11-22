# Notes: judgement calls, gaps, next

## Phase 2 (suite restyle): judgement calls

1. **Column width is `--sui-nav-width` (290 px).** The sheet has no column size; a board column the width of the
   navigation column reads right and needs no new size. Columns never shrink below it: they scroll inside
   `.iss-board` (`overflow-x: auto`), so the page never scrolls sideways. In the shell with the details open only two
   columns show at 1300 px; that is how a kanban board behaves, but it is a lot of scrolling for 5+ states.
2. **In the shell the cards carry no controls**; a card opens its details in the right column, which has Move to, Edit,
   Assign to me, Unassign. Alone the cards keep their controls (as icon buttons, so a card stays compact), because there
   is no details column to put them in. Same functions, same writes.
3. **Boards in the navigation** = this tracker + `solid:instance` registrations for `wf:Tracker` in the person's
   public/private type indexes (via the profile and preferences file, as the shell does) + any `wf:Tracker` already in
   the store this session. `solid:instanceContainer` registrations are skipped (we would have to guess the tracker
   inside). Board colours are token colours picked from a hash of the address; there is no colour in the data.
4. **Column and state colours** come from tokens (`--sui-primary`, `--sui-warning`, `--sui-primary-light-text`,
   `--sui-error`, muted; closed: success, then border-strong). The `ui:backgroundColor` values `mintNew` writes are
   unchanged (they are data for SolidOS, not this pane's look).
5. **Messages:** alone, a message line (info as `iss-note`, failure as `iss-note-error`, success as `iss-status-success`).
   In the shell success is a toast only and a failure is a toast and the error note. The data browser styles every
   `[role=status]` as a green box; the pane undoes that inside its root (no sheet change needed).
6. **The column switcher uses chips** (`role=tab`, `aria-selected`), not the sheet's `tabs`, because tabs scroll
   sideways in one line and chips wrap; chips are allowed as filters. The class is `iss-coltabs` so it does not pick up
   the sheet's `iss-tabs` (details tabs) rule.
7. **Assignee on a card** is initials + name (was "→ name"); tests now match the name. The issue page keeps
   "Assigned to …" and "by …".
8. True 400 px is from `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`) in sample.mjs, issues.mjs
   (form open) and shell.mjs. In the shell test the shell keeps its navigation drawer open after the window is narrowed
   under it, so the test closes it before the 400 px screenshots.

## Phase 2: unverified / weak

- **Type-index boards are untested**: the test pod's type indexes list no tracker, and I may not write there. Only
  "this board" and "boards already seen" are covered by tests.
- The shell's header search is not wired (`search` not given); Deck has no in-board filter in our brief either.
- Logged out inside the shell is not tested (alone it is). `bob` (second user) is not used.
- In the shell, the issue page (an issue as subject) shows the issue in the content and its details again from (i);
  harmless but redundant.

## After the review (REVIEW.md, "Fixed")

- Writes are N3 Patches built by the pane, then a fresh re-read and a comparison. The N3 route is clean for JSS #1, #5
  and #7 but shares #4 (dct:/dc:) and #6 (JSON-LD nested objects); issues have no nested objects. JSS answered 204 to
  an N3 delete that did not match (no 409) in one case seen; the re-read catches that, which is why it stays.
- Append-only is decided from `WAC-Allow`; whether JSS lets an Append-only agent send an insert-only N3 Patch is checked
  by two-person.mjs (bob on `app/`).
- Success lines clear after 6 s, so a test reading the line must do it soon after the save.

## Needs a decision

- The shell does not close its navigation drawer when the viewport narrows below 900 px after load (seen with CDP
  device metrics; a real phone loads narrow, so probably fine). If wanted: in the shell, on a `(max-width: 900px)`
  media change, `setNav(false)`.
- A sheet size for a board column would help other board-like panes (I used `--sui-nav-width`).

## Phase 1 (lab) notes

## Judgement calls

1. **All columns, open states first.** SolidOS's board hides closed states when there are more than two. The brief asked
   for one column per state, so every state gets a column; open ones (`subClassOf wf:Open`) come first, then states that
   are neither, then closed ones, each group in `owl:disjointUnionOf` order. The meta line counts open issues.
2. **"Can edit" means the pod says so.** Controls show only when someone is logged in *and* a `HEAD` on the state file
   returns `WAC-Allow` with `write` or `append` for the user (or, with no `WAC-Allow`, an `Accept-Patch` header). Checked
   once per load. Not checked per action: if access changes mid-session, the update fails and the error is shown.
3. **Move is a select on each card, not buttons.** It fits narrow cards with five or more states, works on a phone, and is
   the same control on the issue page. No drag and drop.
4. **Phone layout is one column at a time** (chips to switch), under 600 px viewport width (the sheet's breakpoint; was
   700). Wider, the columns sit side by side at a fixed width and scroll sideways inside the board (phase 2; they used
   to wrap into rows).
5. **New issues match SolidOS exactly** (`#Iss<ms>` in the state file, `dct:created`, `dc:title`, `wf:tracker`,
   `rdf:type` the initial state), plus `dc:author` and `wf:description` when given. Writing `dc:author` is an addition;
   SolidOS ignores it. If the tracker names several `wf:initialState`s, only the first that is a known state is used
   (SolidOS adds all of them).
6. **`mintNew` writes Turtle by PUT with `If-None-Match: *`** rather than through the updater, like poll-pane does. The
   minted tracker has its own issue class `<#Issue>` (subclass of `wf:Task`) with the `disjointUnionOf` list *and* the
   `subClassOf` links in `index.ttl`; SolidOS's pane checks both and offers to "fix" the settings if they disagree. Each
   state also gets a `ui:backgroundColor`, because SolidOS shows a "delete this suspect issue" button on cards whose
   types have no colour. No ACLs, as asked. SolidOS's own `mintNew` uses `wf:Task` with Open/Closed and a `dc:created`;
   this one has three named states and a `dc:title` (the name typed in the Add menu).
7. **Lists are read in both shapes.** JSS stores a PUT Turtle file as JSON-LD and serves it back; the state list may arrive
   as an rdflib Collection or as `rdf:first`/`rdf:rest` triples. Both are handled. In the test the list did come back
   and the board had its three columns.
8. **Tests read the pod file as JSON-LD on disk** and look up the issue node, rather than matching text.

## Verified

- Every action, in a real logged-in browser, with the change seen in the pod file on disk, and after a reload.
- SolidOS's own issue pane (registered in the test browser as `issue`) labels the minted tracker `tracker` and an issue
  `issue`, renders the tracker with no error and no "fix the settings" prompt, and lists both issues in the right states.
- Logged out: reads, no controls, a one-line explanation. 1300 and 400 px: no sideways scroll; screenshots looked at.

## Not verified / weak

- **A second person** cannot be tested (one test user). The "you can see this but not change it" path is unexercised.
- **`wf:issueURITemplate`** (an issue per file) is handled in code but has no test data. Treat as untested.
- **Names:** for the test user the profile name is "me", so cards say "→ me". Real names come from profiles fetched in
  the background (up to 30 at a time).
- **Live updates** use `updater.addDownstreamChangeListener` if the server pushes changes; not tested. The Refresh button
  reloads the state file.
- The pane registers as `issues` next to SolidOS's `issue`. Both offer **New Tracker** in the Add menu while both are
  loaded; `shouldGetFocus` makes this one open first.
- If a state file holds an issue with two states (bad data), the card goes in the first column in board order; a move
  removes all its state types and adds the new one, which repairs it.

- After a change, the data browser sometimes redraws the whole pane (seen once in the tests: the issue was saved, the new
  pane showed it, but the "Added" message was gone). The write is fine; the message can be lost. The tests now wait on
  the result, not the message.

## Next, if wanted

- Assign to other people (from `wf:assigneeGroup` / project developers, as SolidOS does), and delete an issue.
- Optional drag and drop on wide screens, with the select kept.
- A test tracker in the per-file (`issueURITemplate`) shape.
