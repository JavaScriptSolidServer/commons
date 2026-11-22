# Notes

## Phase 2 (suite look)

- **Sections = Overview + the items.** SolidOS's meeting pane has a tab per item; Nextcloud apps put that kind of list in the
  left column. So in the shell the column is Overview (scrolls to the header card) and one entry per item, which opens the
  item exactly as the row's link does. The content keeps its own list too: it carries the editor's buttons, and the pane must
  stand alone.
- **When and Where are chips that wrap** (`white-space: normal` on the header chips only): a 28 px one-line chip would cut
  off "Thursday, December 10, 2026 to Friday, December 11, 2026" or a long place at 400 px. Each chip has the fact name for
  screen readers and as a tooltip. Who and Notes stay a small two-column list under them (a list of names or a paragraph is
  not a chip).
- **Toasts only in the shell**, in addition to the status line (the status line is what the tests and the alone view use).
- **Remove is an icon button until armed**, then a red text button "Press again to remove", so the two-press rule stays
  readable.
- **Column width `calc(var(--sui-content-max) * 3 / 4)`** (810 px), as Document; there is no reading-width token.
- The calendar figure's 36 px icon copies the sheet's `details-figure` size; the chip icons are `--sui-space-4` (16 px).
- `.mtg-root p { max-width: none }`: the data browser caps paragraph width, which made the form hints wrap early.
- **Viewport**: `tests/sample.mjs`, `tests/meeting.mjs` (400 part) and `tests/shell.mjs` use `design/viewport.mjs`
  (CDP `Emulation.setDeviceMetricsOverride`) for a true 400 px page.

## After the review (REVIEW.md)

- **Details are saved by the same whole-file PUT + If-Match as the list**, computed against the file as read just before, then
  read back; "Saved." only when every edited field reads back as sent, else "Not saved as typed: the pod kept something else
  for the notes." (or the list, or "could not be read back"). One write path for everything; no SPARQL patch left in the pane.
  A meeting with no `toolList` stays without one when only the details change.
- **Apostrophes**: `'` in a new link's address is written as `%27`. Addresses already in a file with apostrophes (from
  another app) are not rewritten; a later list change on such a file may still meet JSS finding 3b.
- **Double-click**: the confirming press is ignored when `event.detail > 1` or within 400 ms of arming.
- **Row click** opens the item through its own link (new tab for a web page, in place for a pod item); presses on the buttons
  or the link itself are left alone.
- **`.ics`**: a lone `\r` is now escaped like `\n` (read from the code; not tried in a calendar app).

## Needs a decision

- The shell keeps `data-nav="open"` when a wide window narrows below 900 px without a reload, so the first press of the
  drawer toggle closes a drawer that is not showing (the test presses until it is open). A shell matter; not changed.
- An empty meeting shows two "Not set" chips (when, where). Fine with the icons and tooltips; a meeting tool might prefer a
  single "Set a time and place" prompt for editors. Left as it was (behaviour unchanged).

## Judgement calls (phase 1)

1. **List changes rewrite the whole file with `PUT` + `If-Match`, not `store.updater.update`.** A Turtle list is a chain
   of blank nodes; a SPARQL or N3 patch cannot name them to delete them, so the only safe way is a full rewrite, which
   is what upstream does (`updater.put` of every statement in the doc). Mine reads the file fresh with my own GET (to get
   the ETag that belongs to exactly that content: rdflib's `getHeader` can return an older request's header), changes
   that copy, serialises it with rdflib, and PUTs with `If-Match`. Tested: JSS answers 412 to a stale ETag. Plain field (phase 1; since the review, fields are rewritten the same way)
   edits do use `store.updater.update`.
2. **Pane name `meeting-page`, not `meeting`.** Upstream is registered as `meeting`; the registry ignores a second pane
   with a taken name. With `meeting` my pane never showed (found in the first test run).
3. **Times: a day and a time become `xsd:dateTime` in UTC; a day alone stays `xsd:date`.** Upstream's form is a
   `ui:DateField` and writes `xsd:date` only. Upstream still *reads* a dateTime (the triple is there) but its date input
   shows it blank; it does not break. A meeting with no time at all round-trips exactly in upstream's format.
4. **Web pages open in a new tab; pod items open in place with `GotoSubject`.** The task asked for GotoSubject for every
   item, but for another site's page the data browser can only fail (CORS). Items with `meeting:view "iframe"` (upstream's
   mark for "a web page") open as plain links with `target=_blank rel=noopener`; everything else uses GotoSubject with
   the real `href` as fallback, and modified clicks (ctrl/middle) are left to the browser.
5. **Who may edit: `WAC-Allow` from a fresh HEAD** (`user="... write ..."`), falling back to rdflib's `editable`.
   Logged out shows no controls at all, and a short line saying why.
6. **Added links:** like upstream's "Attach meeting materials": `meeting:Tool`, `rdfs:label`, `meeting:target`,
   `wf:attachment` from the meeting, and `meeting:view "iframe"` only for another site (a same-site pod resource gets no
   view, so upstream opens it with the data browser, like its chat or notes tools). Only `https:` is accepted, as asked.
7. **Remove** follows upstream's delete: the tool's own statements, statements pointing at it, and the meeting's links
   to its target, except I keep the meeting's links if another item still targets the same thing (upstream does not check).
8. **The details entry** (`<#this>` first in the list, which upstream uses as its "Details" tab) is hidden from the
   list but kept in place when the list is rewritten. A meeting with no list at all gets `( <#this> ... )` when the pane first adds
   something, matching upstream's mint.
9. **`mintNew`** writes the same triples as upstream (`a meeting:Meeting`, `dc:author`, `dc:created`,
   `ui:backgroundColor "#ddddcc"^^xsd:color`, `meeting:toolList ( <#this> )`), plus `cal:summary` if a title is passed.
   `If-None-Match: *` so it never overwrites. No ACL.
10. **Who** reads `wf:participation`/`wf:participant` (what upstream's `manageParticipation` records) and fetches the
   profiles in the background for names. It does not read `meeting:particpantGroup`/`attendeeGroup` members; those groups
   show as items in the list when upstream made them tools.

## Verified

- `node tests/run.mjs` ends with `EVERY TEST PASSED`: sample logged out at 1300/400 px; logged-in mint, edit, add,
  reorder, remove, whole days, reload; no sideways scroll at 1300 and 400 px (forms open).
- After my rewrites the file (which JSS then stores as JSON-LD) still comes back as Turtle with a real list: a fresh
  rdflib store reads `meeting:toolList` as a Collection, `<#this>` first, in the new order.
- Upstream's own meeting pane, opened on a file my pane made and edited, shows the tabs "Board meeting, Budget, Agenda"
  and the title, place, dates (whole-day case) and notes in its form (screenshot `tests/shots/upstream-reads-it.png`).
- Screenshots looked at: `sample-1300/400`, `meeting-1300/400/400-forms`.

## Unverified or weak

- **A second person** cannot be tested (one test user): that someone with read access only sees no controls is tested
  only logged out. The 412 path is tested against the server directly, not by two real editors racing.
- **Upstream's form with a dateTime**: shows the date input empty (by inspection of solid-ui's DateField). Not changed
  there. If that matters, write `xsd:date` only, and lose the time.
- **Upstream writes on view**: opening the details tab in SolidOS adds `dc:author` (again) and a participation for the
  viewer. Not my pane, but it means "Who" fills up with whoever opened it in SolidOS.
- A list stored as a `rdf:first/rest` chain (possible from other JSON-LD writers) is read and rewritten by code that is
  not exercised by the tests: JSS always handed back a Turtle list.
- The `.ics` is checked for its fields and line folding, not imported into a real calendar app.

## Next, if wanted

- Edit an item's name and address in place.
- Read the members of the participants group, if there is one.
- A small "Copy link" for the meeting address.
