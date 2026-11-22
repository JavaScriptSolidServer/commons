# Notes: shell and design sheet (phase 1)

## Judgement calls

1. **Tokens: option (a), with the fallback as one `:where(:root)` block per pane.** The shell writes the same block
   as `:root`, which always wins (specificity), so a theme change in the shell reaches every app and a pane alone still
   looks right. `design/embed.mjs` copies the block plus the chosen recipes into a pane (renaming `ui-` to the
   pane's prefix) and `--check` catches drift. It is an authoring helper, not a build; nothing runs at load time.
2. **The shell takes over the whole viewport below the browser's bar** (its root is `position: fixed`, top =
   `--app-header-height`, which the browse page already sets). That hides the outliner's own chrome (pane tabs, the
   folder header) without styling anything outside the shell's root. The "Other views" menu replaces the hidden
   pane tabs.
3. **The shell opens first for everything** (`shouldGetFocus` true for any http(s) subject) and chooses the app pane
   itself. Loading it is the opt-in: by link today; if someone puts it in their tool index, the whole data browser
   becomes the suite. Exceptions in the browser's own logic: the built-in `source` pane claims `.js` files first,
   and a document with `ui:mintClass` goes to the pane that mints it, because both come before link panes in the
   registry. Not worked around.
4. **The shell loads the suite's panes itself** (`import()` of `SUITE_APPS` next to its own file, `import.meta.url`
   relative), so one `?pane=` is enough and the registry order cannot put an app pane ahead of the shell. A
   tool-index pane is imported only from the page's own site or a site the browser's `mashlib.panes.allowed` list
   has; anything else is refused with a toast, never run. The browser's "allow?" question is respected by stepping
   aside (hiding the frame) while `#browseAsk` is open.
5. **Contract shape**: `renderNavigation(subject, context)` once per showing after `render`; `renderDetails(node,
   context)` only when details open; a fresh `context.suite.state` shared by the three. The alternative (one render
   that returns `{content, navigation, details}`) would break the plain pane contract; separate optional methods keep
   every existing pane working unchanged (content-only fallback). `context` is a shallow copy of the outliner's,
   plus `suite`.
6. **App names avoid Nextcloud's**: Dashboard, Files, Photos, Contacts, **Boards** (not Deck), Notes, **Pads** (not
   Text), Polls, Meetings. Profile and Settings live in the avatar menu; Sharing, Document, Table, Source, Data and the
   demo are "viewers" (loaded, offered under Other views, no tile).
7. **Where an app opens**: Dashboard and Files on the pod root (`pim:storage`, else the WebID's parent folder);
   Profile and Settings on the WebID; the rest on the first type-index instance of their classes. The classes chosen
   (e.g. `schema:ImageGallery` for Photos, the Markdown media type for Notes) are a guess at what people register;
   phase 2 owners should correct theirs.
8. **Log in** presses the browser's own login button (found through the shadow DOM, as the test helper does);
   **Log out** calls `SolidLogic.authn.authSession.logout()` (there is no `authn.logout`). The browser re-renders on
   the logout event and the shell follows. `performServerSideLogout` is not called, so the identity provider's
   cookie may still be there; the browser's own menu may do more.
9. **Primary colours**: #0082c9 for the header (Nextcloud's well-known default hue, which is a colour, not artwork),
   #00679e for buttons and links (readable on white, 6.1:1). All values are our own choices in `tokens.css`.
10. **Search Enter on an address opens it**: with the browser's address bar still above, it is a convenience, and it
    is the cheapest way to get somewhere when the suite bar is the only one (see Needs a decision).

## Follow-up pass (after phase 2)

- **Added** Activity (pod root), Tasks (type-index class `cal:Vtodo`; before Boards), and Search as a viewer, so Enter
  in the header box opens the search page on the pod root with the words kept (the stale "later version" toast is gone).
- **Priority is `SUITE_APPS` order**, not load order: `choose()` sorts the suite panes that ask for focus by their
  place in the list. Tested: the pod root opens in Dashboard (twice, with a reload), a task list in Tasks, an
  ordinary tracker in Boards.
- **The suite's own module wins over a same-named registry entry.** The test user's tool index registers the
  published `notes-reader` before the shell loads ours, and the registry keeps the first. The shell now always imports
  its own modules, keeps them in `state.own` by name, and uses them wherever it looks a suite name up (choosing,
  Other views, forcing, tool-index tiles). A tool-index pane whose module (same site or allowed site only) has a
  suite name gets no launcher tile. Tested logged in: Notes shows its navigation while `panes.byName('notes-reader')`
  is still the published copy without one. Outside the shell the browser still uses the published copy (registry
  order), which only the tool index or the browser can change.
- **Drawer and resize**: crossing 900 px closes (narrowing) or reopens (widening) the navigation column.
- **Toasts** live in module state until they time out and are redrawn after a re-render.
- **Escape**: moved from document-capture to document-bubble, and ignored when `defaultPrevented`, when it comes from
  inside `[aria-modal=true]` / role menu, listbox, dialog, or while a pane's `[aria-modal=true]` is visible. With the
  old capture listener the shell ran before Photos' viewer and Files' ⋮ menu; now their own handlers (capture on the
  document, or on their root with stopPropagation) run first. Tested with a synthetic modal and a handler that calls
  preventDefault.
- **Content-only fallback** is now tested with Data (no renderNavigation/renderDetails); Notes has navigation.
- **Data/Table "logged out in the shell" (item 9): not a shell problem.** The shell reads `authn.currentUser()` on every
  render, and the browser re-renders it on `login`/`sessionRestore`/`logout`. Traced with the same steps as
  data/tests/shell.mjs (log in with the data pane, close, new browser with `login: false`, open the shell link): the
  shell's very first render was already logged in (181 ms). shell.mjs 400 also reuses a session and passes the
  logged-in checks; loggedout.mjs shows the shell follows a logout. table/tests/shell.mjs opens with
  `login: false, fresh: true` (a clean profile: logged out by design). Data's shell.mjs reads the page as soon as
  `.sh-content > *` exists; if a session restore needs the identity provider (an older token), the first render is
  logged out until the browser re-shows it, so a check that early can see "Log in". Wait for
  `.sh.suite-shell-pane[data-logged-in=yes]` before logged-in checks.

### Proposed sheet additions (not made: other agents run embed --check)

- A **header search dropdown** (the search pane built one from menu + row): a `popover-wide` recipe
  (full width under 600 px, 8 px margins) would save each pane its placement rules.
- A **drawer** recipe for panes alone (the navigation as an overlay under 900 px, with a scrim): Tasks and Activity
  each wrote their own.
- A **due/late** text colour role (Tasks uses `--sui-error` for late): name it `--sui-late` or document the reuse.
- A **`ui-row` checkbox** slot (Tasks' tick box, Boards' cards) and a **segmented control** for view switches.
- Document `aria-modal` + preventDefault on Escape in the modal recipe's comment (the rule is now in DESIGN.md).

## True 400 px

All 400 px checks use `design/viewport.mjs` (`Emulation.setDeviceMetricsOverride`, width 400, scale 1, mobile, touch),
which gives `innerWidth === 400` exactly; the helper's `width: 400` window is not used.

## Unverified

- A second person (`bob`) using the shell: nothing in it is per-pod except reading the logged-in person's own files,
  but it was not run as bob.
- The browser's JSS `--mashlib-module` boot page (`boot.js`): the shell reads `--app-header-height`, which that page
  sets in `rem`; not tried there.
- Panes with their own `position: fixed` modals inside the shell: the frame is a stacking context (z-index 20), so a
  modal covers the frame but not the browser's top bar. Looks acceptable; not tested with a real pane modal.
- Pod-wide search: only the hook exists. Tool-index pane tiles on a page where the site is not yet allowed: the
  refusal path is written, not tested (the test pod's tool-index sites are allowed).
- The page behind the frame can still scroll (the outliner's own content); the frame's columns use
  `overscroll-behavior: contain`, so a wheel at the end of a column does not move it.

## Needs a decision (each needs a browser change; the shell works without them)

1. **One top bar.** Today the browser's dark address bar stays above the suite's blue header (two bars, ~106 px on a
   phone, 154 px with the wrapped address bar). For "one bar like Nextcloud", the browse page needs a way for the
   shown pane to hide its bar, e.g. `browse.html` honours `?chrome=none` (or a `data-chrome="none"` attribute the
   pane sets on `#OutlineView`) by hiding `.browse-bar` and setting `--app-header-height: 0`, plus a public log-in
   call (below) so the shell can offer it. The shell already handles a zero offset.
2. **A public way to log in.** The shell presses the browser's own button through two shadow roots. Something like
   `SolidLogic.authn.login()` or a `solid-login-request` event the page answers would make that robust.
3. **A frame pane.** The shell is first only because of `shouldGetFocus` and registry order (see judgement 3). A
   page-level `?frame=<pane url>` that always renders that pane, passing the chosen inner pane, would make it exact
   and would let `.js` files and `ui:mintClass` documents open inside the suite too.

## Name ideas for the suite

Chosen 22 Nov 2026: **Commons**. The folder, file names, pane names (`suite-*`) and CSS prefixes (`--sui-`, `sh-`) stay as
they are; they are internal, and renaming them would break links and tests.

1. **Hearth** — the warm centre of your own home on the web.
2. **Podium** — your pod, with everything on one stage.
3. **Burrow** — a private home you dig for yourself.
4. **Mosaic** — many small apps, one picture.
5. **Commons** — your things, shared on your terms.
6. **Lodge** — a small house of your own, with room for friends.
7. **Atrium** — the open hall every room of the house leads off.
8. **Homestead** — your own plot of the web, worked by you.
9. **Pantry** — everything you need, on your own shelves.
