# Commons (suite): notes

Compiled from every pane's `NOTES.md` and `REVIEW.md` ("Fixed"), `shell/NOTES.md` and `design/DESIGN.md` ("What
changed in sheet v2"). The detail is in those files.

Screenshots (`shots/take.mjs`): one browser on port 9590, logged in as `me` through `lib/lib.mjs`. Each app is opened
inside the shell on that pane's own sample data under `/me/public/suite/<folder>/samples/` (static, so the shots
do not depend on test runs). The shots at 400 px use `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`,
so `innerWidth` is exactly 400), not the helper's `width: 400` window. The browser profile is kept in the system
temp folder, outside the served suite folder.

## Judgement calls (suite-wide)

1. **Tokens: option (a)**: each pane carries the sheet's token block as a `:where(:root)` fallback, and the shell
   writes the same block on `:root`, which always wins. A pane looks right alone, and a theme change in the shell
   reaches every app. `design/embed.mjs` copies the block and `--check` catches drift. (shell, design)
2. **Nav/details contract**: optional `renderNavigation(subject, context)` and `renderDetails(node, context)` beside
   the normal `render`, plus `context.suite` (`go`, `showDetails`, `closeDetails`, `toast`, `state`). Every
   existing pane still works as content only. (shell)
3. **The shell opens first for every http(s) address and picks the app itself**, ranked by `SUITE_APPS` order
   (Dashboard before Files at the root, Tasks before Boards on a task list). It imports the suite panes
   itself, so one `?pane=` is enough. (shell)
4. **Suite copies win over same-named tool-index panes.** The test user's tool index registers the published
   `notes-reader` first. The shell always uses its own module for a `SUITE_APPS` name and gives such a tool-index
   pane no launcher tile. Outside the shell the browser still uses the first-registered copy. (shell, notes)
5. **Whole-file PUT with `If-Match`, then a fresh re-read, instead of PATCH.** JSS finding 5: a `}` in a SPARQL
   Update literal silently deletes the value (204). Contacts, Tasks, Pads, Polls, Meetings, Profile and Settings
   use GET → change → PUT + If-Match → read back. They say "Saved" only if the pod holds what was meant, and
   "Not saved as typed" otherwise. Boards uses N3 Patch (clean for finding 5) with the same read-back. (all writers)
6. **Tasks vocabulary**: a list is SolidOS's `wf:Tracker`, done is the tracker state, and the fields are iCalendar
   `cal:Vtodo`. Boards reads the same lists. No `dct:` (JSS finding 4). (tasks)
7. **Escape rule**: the shell listens in the bubble phase and acts last. It ignores events already
   `defaultPrevented` and events from inside `[aria-modal=true]`, menus, listboxes and dialogs. Panes close their
   own topmost thing first. Written into DESIGN.md. (shell, media, folder)
8. **Sharing → Files: `suite-sharing-change`**: after every confirmed write, the Sharing pane dispatches a
   bubbling, composed event (`detail: { uri, acl }`). Files reads its listing again, so Rename and Delete see the
   current `.acl`. (sharing, folder)
9. **Files deletes a file's own `.acl` with it and refuses to rename a file that has one.** It asks the server via
   `Link: rel="acl"`, not the cached listing. (folder)
10. **Search caps: 300 folders, 8 levels, 6 at a time**, walked into a private graph. Beyond the caps it says
    "capped". (search)
11. **Activity caps: 60 folders, 4 levels**, breadth first and newest first. A folder's modified date does not move
    when a file inside it changes, so it cannot be used to prune the walk. (activity)
12. **App names avoid Nextcloud's**: Boards (not Deck), Pads (not Text). Profile and Settings are in the avatar menu;
    Sharing, Document, Table, Source and Data are viewers under "Other views". (shell)
13. **Keep lab pane names** (`folder-lab`, `notepad`, `meeting-page`, `source-lab`, `data-lab`, ...). A new pane with
    a built-in name is skipped by the browser's registry. (pad, meeting, all)
14. **Profile and Settings write named nodes, not blank nodes**, and refuse or report when JSON-LD would be damaged
    (JSS finding 6). New trusted apps are `<profile#trusted-<host>-<rand>>`. (settings, profile-edit)
15. **Sheet v2 added pieces the apps asked for and changed no existing values**: reading width, board column,
    `--sui-late`, card, fields, select, file, segmented, checkbox, a success note, a dark viewer surface, and a base
    reset for bare `[role=status]`. Re-embedding cannot break a pane. (design)

## What review found and fixed

| pane | worst finding | fixed? |
|---|---|---|
| Dashboard (home) | One bad `%E0` IRI in a type index blanked the whole dashboard (`URIError`) | yes |
| Files (folder) | Deleting a file left its `.acl`; a new file of the same name silently got the old sharing | yes |
| Photos (media) | In the shell, one Escape closed both the details and the viewer | yes |
| Contacts | JSS #5: a `}` in a name or note was lost while it said "Saved." (a card with no name) | yes |
| Tasks | Lost update from a stale view: one person's edit silently overwrote another's | yes |
| Boards (issues) | JSS #5: an edit with `{}` deleted the title and description and said "Saved." | yes |
| Notes | The title came from a `# ` line inside a code fence; the real H1 was not shown | yes |
| Pads (pad) | A line containing `}` was lost while it said "Saved" | yes |
| Source | Unsaved edits were lost when navigating inside the browser or shell | yes |
| Polls (poll) | JSS #5 on notes, title, place and choice labels; no re-read | yes |
| Meetings (meeting) | JSS #5: the notes were silently lost on save | yes |
| Activity | A file was named and opened as any typed thing it mentioned (two "Friends" rows) | yes |
| Search | The highlighted result could change under the person while the walk ran (Enter opened another file) | yes |
| Sharing | Hosts could not learn that it wrote, so Files' Rename guard used a stale listing | yes |
| Settings | Trusting an app wiped keys and other inline items from a JSON-LD profile (JSS #6) | yes |
| Profile (profile-edit) | Saving the name wiped keys and other inline items from a JSON-LD profile (JSS #6) | yes |
| Document | A hostile page could navigate the sandboxed frame (a phishing surface) | yes (see Security) |
| Table | In the shell, a row stayed marked after its details closed if the table had been redrawn | yes |
| Data | Big integers shown wrong (`12345678901234567890` lost digits; `1e400` showed ∞) | yes |

## Unverified

- **Shell**: never run as `bob`. The JSS `--mashlib-module` boot page was not tried. The tool-index refusal path
  for unallowed sites was not tested.
- **Dashboard**: a second person viewing the root; NSS/CSS pods; 100+ registrations.
- **Files**: a second person with append-only access; servers that send `pim:Storage`; big uploads (one PUT each, no
  progress bar).
- **Photos**: real sound output; MP4/MP3; folders of hundreds of photos.
- **Contacts**: upstream and PodOS reading a book this pane wrote; large books.
- **Tasks**: SolidOS's own issue pane on a Tasks list; CalDAV round trip; list discovery is capped at 40 folders.
- **Boards**: boards found through the type index (none registered on the test pod); `wf:issueURITemplate`.
- **Notes**: the static-site path (no listing); logged-in use inside the shell.
- **Pads**: two people typing in the same line at once (simulated only); upstream editing our pad.
- **Source**: the browser's leave dialog (headless); non-UTF-8 files are re-saved as UTF-8.
- **Polls**: `bob` in the shell; "Add poll" without write access to the parent folder.
- **Meetings**: two real editors racing (412 tested against the server only); `.ics` not imported into a calendar.
- **Activity**: non-JSS listings; seven folders that could not be read even when logged in were not investigated.
- **Search**: a slow or remote pod; screen readers. Its tests set a test-only `_test.startAt` hook on the pane so
  the header search walks the test's own tree instead of the whole (growing) pod; normal use never sets it, and the
  pod-root lookup is tested separately. Each folder listing gives up after 20 s so a search always finishes.
- **Sharing**: Turtle ACL PUT on NSS/CSS (JSS always answers 415, so JSON-LD is used); ACL saves are unconditional
  without an ETag.
- **Settings**: writing to the real profile and preferences (only copies were written); whether the switches change
  which panes show.
- **Profile**: pressing Save on the real logged-in profile (only copies were written).
- **Document**: Firefox and Safari; a logged-in 403.
- **Table**: thousands of rows; class mode reached from the browser itself.
- **Data**: 401/403 inside the browser (it draws no pane); RDF/XML and N3 sources.

### Unverified / looks wrong (from the screenshots)

- **Dashboard** lists "Notes reader" (the published tool-index copy) under "Your panes and apps", while the launcher
  hides it as a second copy of Notes. Minor inconsistency.
- **Search** was typed while Files showed `suite/search/samples/orchard/`. The dropdown lists pod-wide matches,
  starting with `suite-data/search/`, not the open folder's copies. This seems to be by design (the walk starts at
  the pod root) and is noted only so nobody reads it as a scoping bug.
- **Profile** for `me` is nearly empty (the test user has only a name), so the shot shows mostly empty fields. That
  is the data, not the pane.
- Every shot has two bars: the browser's dark address bar above the suite's blue header (see below).
- Nothing showed an error or an empty state caused by a wrong address.

## What must change elsewhere for the suite to replace SolidOS's own panes

### Browser (`~/ideas/dynamic`)

1. **One top bar.** The browse page should let the shown pane hide its own bar: `?chrome=none`, or
   `data-chrome="none"` on `#OutlineView`, would hide `.browse-bar` and set `--app-header-height: 0`. The shell
   already handles a zero offset.
2. **A public login API**, e.g. `SolidLogic.authn.login()` or a `solid-login-request` event that the page answers.
   Today the shell (and the test helper) press the browser's login button through two shadow roots.
3. **`?frame=<pane url>`**: a frame pane that always renders and is given the chosen inner pane. Today `.js` files
   go to the built-in `source` pane and `ui:mintClass` documents go to the pane that mints them, before the shell is
   asked, so they open outside the suite.
4. **Built-in pane names**: a new pane with a built-in name is skipped, so suite panes keep lab names. To replace
   SolidOS panes, the registry needs a way to let a named pane replace a built-in one (opt-in, e.g. by tool index).
5. **Same-named panes**: the registry keeps the first copy (the tool index's published `notes-reader`). Outside the
   shell the browser uses that copy.
6. **401/403/404**: the browser shows its own "Failed to load" and draws no pane, so the panes' own "private" and
   "not found" states never show in the browser. (data, document)
7. **Small ones**: the profile view has no ⋮ menu, so "Show with Data" cannot be reached by clicking. The header's
   Private/Public badge does not refresh after a Sharing save. Logout calls `authSession.logout()` only (no
   server-side logout).
8. **Redraw after session restore**: when the browser restores a login session it redraws the page, which can drop
   a pane that has just opened (and a click made at that moment). Found as intermittent failures in the full test
   pass (Files, Sharing). Worked around: Files reloads only when the logged-in user actually changes; Sharing's reads
   time out and only the newest read draws; their tests wait for the session and re-open (logged) at most 3 times.
   The real fix is in the browser: restore the session before the first render, or don't re-render on restore.

### JSS (`jss-findings/REPORT.md` numbers)

1. **#5: a `}` in a SPARQL Update literal** deletes the old value and drops the new one, and still answers 204.
   Text like `PREFIX x: <…>` inside a literal is stripped. Fix: a real SPARQL Update parser.
2. **#6: any PATCH to a JSON-LD document drops nested objects, `@list` values and empty strings.** Profiles are
   JSON-LD, so a name change or a trusted app wipes keys, emails and languages.
3. **#1 / #7: SPARQL Update ignores WHERE** and half-applies blank-node patches (204). Either fix it or list
   `text/n3` first in `Accept-Patch`; the N3 Patch path is clean for these.
4. **A folder's ETag does not change when a file in it is modified**, so a revalidating fetch gets 304 and a stale
   listing. (activity)
5. **No `Last-Modified` on GET** (the header is exposed but not sent). A PUT response carries no ETag. (source)
6. **#4: `dct:` is rewritten as `dc:`** (dc/terms → dc/elements) on PATCH and on Turtle PUT, and the value cannot be
   deleted later.
7. **`.acl` files**: `x.acl` is kept when `x` is deleted, so a new `x` inherits the old rules. `.acl` files are not
   always listed, so a client cannot rely on the listing to find them. Delete `x.acl` with `x`.
8. **#2: DELETE on a non-empty folder** removes the whole tree, including children whose ACL forbids it (should be
   409).
9. **#3b: names with apostrophes** give a garbled, unparsable listing.
10. A folder holding `index.html` answers a Turtle request with the HTML page, so its listing cannot be read.
    (search)
11. A Turtle PUT is stored as JSON-LD (comments, relative IRIs and layout are lost). A Turtle ACL PUT is refused
    with 415. Compact IRIs in `@id` are not expanded. (source, sharing, profile-edit)

## Security notes

- **Credentials and browser profiles were public.** The suite folder is linked into `/me/public/`, so the pod served
  `local.json` (test passwords) and the test browser profiles (cookies) under `tests/`. Fixed in the suite: the
  credentials moved to `~/ideas/suite-local.json` (outside the served folder) and every `tests/` folder has an
  owner-only `.acl`. `/me/public/suite/local.json` now answers 404. **The lab had the same leak**. With Melvin's OK
  (22 Nov) it was fixed without changing lab code: an owner-only `local.json.acl` and an owner-only `.acl` in each
  `*/tests/profile*/` and `two-person/profile*/`. `/me/public/lab/local.json` now answers 401, and all 16 lab cookie
  files are refused.
- **Snap Chromium has its own `/tmp`.** A browser profile under `/tmp` is not the one the test deletes, so a
  "fresh" browser was already logged in. `shots/take.mjs` and `shots/launcher.mjs` keep their profiles in
  `~/ideas/suite-browsers/` instead.
- **Leftover `.acl` on deleted files**: Files now deletes a file's own `.acl` with it, but an upload or New folder
  onto a name with a leftover `.acl` (left by another tool or the server) still inherits those rules. Only Rename
  checks the target.
- **Document viewer**: a hostile HTML page's `target="_self"` link can briefly show an off-site page in the sandboxed
  frame (no scripts, no forms) before the pane puts the original back. `<meta http-equiv="refresh">` to an
  ordinary URL is not stripped.

## Needs a decision

1. ~~The suite's name~~ **Commons** (Melvin, 22 Nov). Only the shown name changed; internal names stay `suite`.
2. ~~Register the sample data~~ **Done (22 Nov)**: copies of the samples are in `/me/private/suite-demo/`
   (owner-only), registered in `/me/settings/privateTypeIndex.jsonld` (see `demo/README.md`; the original is `demo/privateTypeIndex.original.jsonld`). Every launcher app opens on data (`node shots/launcher.mjs`). The home and shell tests now expect
   these registrations. Still open: whether Tasks should register new lists (`cal:Vtodo`).
3. ~~The lab exposure~~ **Fixed (22 Nov)**, see Security.
