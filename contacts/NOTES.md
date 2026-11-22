# Notes

## Phase 2: the suite look

Judgement calls:

1. **Groups in the navigation, the card in the content, no details column.** As Nextcloud Contacts: New contact pill,
   All contacts (count), a Groups caption, each group (count of book members in it), New group. The card stays in
   the content beside the list (not `renderDetails`), so the shell's (i) button is not shown. Alone, the groups stay
   chips above the list and New contact / New group stay by the title.
2. **Sharing state with the shell.** `render` puts its view on `context.suite.state.ctc`; `renderNavigation` asks
   it for an element it keeps and refills in place on every redraw (counts, current item, the New buttons once write
   access is known). I did not call `refreshNavigation()`: it re-runs the shell's open/close of the drawer.
   The module-level view map (kept across the data browser's redraws) is unchanged.
3. **Results are toasts in the shell** (`suite.toast`, success/error); the line in the content is then hidden but
   still set (`data-kind`), so one code path serves both. Alone the line is a recipe: `note` (info), `status-success`,
   `note-error`. "Log in to add or change people." stays a note in both.
4. **Avatars use the sheet's one avatar colour** (pale blue, initials). The old per-person colours were not sheet
   colours, so they went. Photos still show, http(s) only, with initials if they fail.
5. **The header search also drives the list** (`search` hook) and fills the list's own box; the list keeps its box
   because the pane must work alone too. Two boxes in the shell is a little redundant.
6. Delete is a tertiary button that turns into the danger button on the first press ("Press again…"), so red shows
   only when it means it. The group tag's × is a 20 px button inside a 28 px chip: below the 44 px target, as chips are.
7. Stacking stays on a viewport query at 760 px (as before), not the content width. In the shell between 901 and
   about 1050 px the list and card share ~620–760 px; it fits, checked by eye only at 1300 and 400.
8. The fact labels' icons (email, phone, map marker, cake, account circle, web, note, group) are my choice of MDI
   icons; Nextcloud's own icons are not used.

Unverified: widths between 400 and 1300 other than by the layout rules; keyboard-only use of the navigation column;
a book with many groups (the column scrolls, per the shell). The 400 px checks use `design/viewport.mjs` (CDP
`Emulation.setDeviceMetricsOverride`), a true 400 px page. In the shell test the page is reloaded after narrowing,
because the shell closes its drawer only when it mounts.

### Needs a decision

- **The shell does not close an open navigation drawer when the window becomes narrow** (it only decides at mount).
  Narrowing a wide window leaves the drawer open over the content. A `matchMedia('(max-width: 900px)')` change
  listener calling `setNav(false)` in `shell/suite-shell-pane.js` would fix it. Not mine to edit.
- The sheet has no "success note" (`note-success`); I used `status-success` for a saved line when alone.
- The sheet has no recipe for a label/value list with icons (a contact card's fields); built from tokens
  (`.ctc-facts`). Worth a recipe if Profile or others need the same.

## Phase 4: fixes after REVIEW.md

- **Writes stay in the book's folder.** `insideBook()` (the folder of `index.ttl`, after URL resolution) guards every
  PUT, rewrite and DELETE; `cardInBook()` also excludes the book's own files (index, people, groups, group files) and
  folders. An entry pointing elsewhere: Delete takes it out of the book and leaves the file; no Edit. Group files
  outside the folder are not changed (a join or leave there is refused with a message).
- **No more patches.** Every change to an existing file is a whole-file PUT + If-Match, then a fresh GET of my own
  (old statements dropped first; rdflib's forced load only adds) and a comparison of what was meant with what came
  back. Blank-node statements are not compared (they are renamed on a read). This trades patch size for
  correctness: a big `people.ttl` is rewritten whole on each add. Whole-file PUT also turns a `dct:` predicate already
  in a hand-written card into `dc:` (JSS finding 4) when that card is edited; the pane itself no longer writes `dct:`.
- **ETags are kept by the pane** (module-level map, from its own GET or PUT re-read), because rdflib's
  `getHeader` returns any of the responses it has kept, often the first, which gave 412s after a second save. A stale
  entry can only make a save fail with 412, never overwrite.
- The read-only note is a standing message (state.standing), shown whenever no action message is.
- Test interception (review.mjs) wraps `window.fetch`: wrapping `store.fetcher._fetch` recursed.
- Unverified: two people saving the same file at once (the 412 path) by a real second browser; a book of thousands
  (each add rewrites `people.ttl`).

## Phase 1 notes (the lab pane)

## Judgement calls

1. **The pane survives being redrawn.** Creating `Group/` or `Person/<id>/` changes the book's folder, and the data
   browser then throws the pane away and renders a fresh one (seen in tests: the "saved" message, the selection and
   the open form vanished after the first group). View state (selected person, mode, group filter, search, message,
   busy) lives in a module-level `Map` keyed by the subject, and a save that finishes in the old copy redraws the live
   one. Typing in an open form is lost if that happens mid-edit; I did not try to restore field contents.
2. **Blank-node cards are written back whole (PUT + If-Match), not patched.** JSS 0.0.2xx (installed one) parses a
   SPARQL Update's triples with a Turtle parser; rdflib names blank nodes with `?vars`, which that parser rejects, and
   JSS then falls back to a regex that splits on `. ` — so any literal with ". " in the same patch breaks
   (`409 Triple to delete not found: Likes long`). Also, JSS ignores the SPARQL `WHERE`. rdflib always picks SPARQL
   when `Accept-Patch` lists it, so I cannot steer it to N3 Patch. This is a **JSS bug worth reporting**
   (`src/patch/sparql-update.js`, `parseTriples` / `parseSimpleTriples`). Named-node changes still use
   `store.updater.update`. The rewrite keeps every other statement and blank-node kinds (`a vcard:Cell`).
3. **New group creation is included**, though scope only said "add a person to a group". A new book has no groups
   otherwise, so the group feature would be unusable on any book this pane makes. Files are named as upstream names
   them (`Group/Work_play.ttl` for "Work & play"), with the same back pointer to the book.
4. **A new person need not be in a group.** Upstream insists on one; that is a UI rule, not a data rule, and its
   reader copes. New cards use named value nodes (`<#email1>`), no `a vcard:Work` type: I did not want to guess a kind.
5. **Group membership by WebID** follows upstream: `hasMember <webid>` plus `<webid> owl:sameAs <card>`; removal
   drops the WebID member only when no other card shares it.
6. **A card opened alone is read-only.** Editing its name there would leave `people.ttl` stale. It links to its book
   when `../../index.ttl` is one.
7. **Who may edit** = logged in and rdflib's `updater.editable()` on `people.ttl` (and `groups.ttl`) is truthy, which
   reads JSS's `WAC-Allow`. A profile typed both `foaf:Person` and `vcard:Individual` is left to the profile pane.
8. Phone numbers are stored as `tel:` with spaces turned into dashes (`+44 20 7946 0000` → `tel:+44-20-7946-0000`).
   Emails use `type=email`, so the browser refuses a bad one before the pane sees it; the pane checks again.
9. `mintNew` writes `dc:title` (the `title` option, else "Contacts"), `acl:owner` and `dct:created`, as upstream does
   (upstream's title is "New address Book"). The PUTs use `If-None-Match: *`, so minting over an existing book fails
   with 412 instead of overwriting (tested).

## Unverified

- **Upstream pane and PodOS Contacts reading data this pane wrote**: the format was checked against upstream's
  source (`contactLogic.js`, `mintNewAddressBook.js`, `webidControl.js`) and the public demo book, not by opening a
  pane-made book in either app.
- The Add menu flow itself (clicking "+" in a folder): `mintNew` was called directly, as the poll pane's tests do.
- A second person: one test user only, so shared books, someone with read-only access while logged in, and the
  412 path of the ETag guard were not exercised.
- Large books: cards load six at a time and the list redraws at most every 250 ms; tried only with three people.
  A book of thousands would read every card to show role/organisation.

## Next, if wanted

- Edit address, photo, WebID and web sites; rename and delete groups.
- Report the JSS SPARQL parsing bug; once fixed, the whole-card PUT could go.
- Keep typed form input across a redraw.
- Load cards lazily (visible rows first) for big books.
