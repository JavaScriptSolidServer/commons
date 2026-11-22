# Notes: table pane

## Judgement calls

1. **Threshold of 3 for classes too.** The brief says 3+ subjects of one type for a document. Upstream
   `classInstancePane` offers a class with 1 member; I used 3 for both, since a one-row table is the
   default view done worse.
2. **Document vs. class.** A subject with no `#` is treated as a document (types counted within that
   document only). Otherwise, and when a document has no qualifying type, it is treated as a class
   (`? a subject`, statements from any document). A fragment like `library.ttl#b1` gets no Table.
3. **The document itself is never a row.** Otherwise a folder's own listing (`<folder/> a ldp:Resource`)
   made a 4th row of its own table, and `<> a foaf:Document` would too.
4. **Name column.** The naming property used by most rows (schema:name, foaf:name, vcard:fn, dct:title,
   dc:title, skos:prefLabel, as:name, ui:label, rdfs:label, in that order of preference) becomes the
   first column and is not repeated. Rows without it show their fragment id. Default sort: that column,
   ascending.
5. **rdf:type column** is hidden unless some row has a type other than the one shown.
6. **8 columns** shown at first (plus name). Ordered by how many rows use the property, ties in order of
   first appearance. Hiding a column you sorted by goes back to sorting by name.
7. **CSV holds every column, not just the visible 8**, and only the filtered rows, in the shown order. Raw
   values (ISO dates, unformatted numbers, full URIs) because a spreadsheet wants data, not display text.
   Multiple values joined with `; `. Text starting with `= + - @` is prefixed with `'` (formula injection);
   numbers are not, so -1 stays -1.
8. **Plain strings that look like ISO date-times are treated as dates.** JSS writes `dc:modified` untyped;
   without this a folder's Modified column would read and sort as raw strings. Narrow regex (needs `T`
   and a zone), so it is unlikely to catch ordinary text.
9. **Card layout uses a container query** on the pane root (below 600 px of pane width), not a media
   query, so it follows the pane's width rather than the window's.
10. **No `shouldGetFocus` returning true** — it is defined and returns false, so the intent is explicit.
11. Links: a thing's link has a real `href` and opens in place with `GotoSubject`; modifier-click opens it
    as a plain link. `mailto:`/`tel:` are plain links. Anything else is text.
12. A safety cap of 500 drawn rows with a **Show all** button. Not asked for; it keeps a huge document
    from freezing the tab.

## Verified

- All of `node tests/run.mjs` (three files, real Chromium, the test pod).
- Screens at 1300 and 400 px looked at: table, all columns with inner scroll, people, CSV fallback,
  odd data, a folder, cards at 400.
- 400 px is emulated with `Emulation.setDeviceMetricsOverride`: Chromium will not make a window narrower
  than 500 px, so a plain `open({ width: 400 })` actually gives 500. Other agents' "400 px" checks may be
  testing 500 without knowing it.
- The real clipboard works headless once `clipboardReadWrite` is granted; the refused path is tested by
  stubbing `writeText` to reject.

## Unverified / weak

- Only one test user, and the pane never writes, so "a second person" does not apply.
- Class mode is tested by calling `render` directly with `schema:Book` after the document is loaded; I did
  not find a way for the data browser itself to land on a class URI without fetching schema.org.
- Large documents (thousands of things) not tried. Grouping and the per-row search text are built in one
  go; it should be fine to a few thousand rows, not beyond.
- Date formatting follows the browser's locale; tests compare with the same `toLocaleDateString` call, so
  they pass in any locale but do not pin the exact text.
- Language-tagged duplicates (`"Hello"@en, "Bonjour"@fr`) are all shown joined.

## Next

- Choose one language for language-tagged literals (the browser's, then untagged).
- Members implied by subclass (`rdfs:subClassOf`) in class mode.
- Remember the chosen type, sort and columns per document (in memory or the URL fragment).

## Phase 2: the suite look

Judgement calls:
1. **Sticky header by a height-capped box.** A header can only stick inside the box that scrolls, so the table
   box now scrolls both ways with `max-height: 70vh`. Short tables are unaffected; long ones scroll inside the
   box (in the shell that means a second, inner scrollbar). The alternative, no cap, keeps the header from sticking.
2. **Type menu became chips** (`button.tbl-chip[aria-pressed]`, "Book · 12"): the task asked for chips for types,
   and a filter chip is the sheet's piece for it. Same behaviour; the test now clicks a chip instead of setting
   the select.
3. **Details only in the shell.** A row click (not on a link or button) calls `context.suite.showDetails(thing)`;
   `renderDetails` draws that row's every property (hidden columns too) from the model render built, and for the
   subject (the (i) button) a summary of the table. Alone, rows do nothing new: DESIGN.md says alone a pane may
   draw details in place, but that would be a new feature in the plain browser, so I left it out.
4. **`search` implemented** (header search filters the rows, fills the filter box): it is the contract's way to
   filter content, and the pane already had the filter.
5. No primary button: Copy as CSV is secondary (a read-only table has no "main thing to do").
6. Header cells are 13 px bold muted (the column label is chrome); the sorted column's label goes full text
   colour with a blue arrow icon. Name column bold, links blue.
7. `.tbl-empty` (empty cells) was renamed `.tbl-blank`: the sheet's empty state owns `.tbl-empty`.
8. 400 px: `sample.mjs` and `shell.mjs` use `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`,
   mobile, a true 400 px page). The old helper `narrow` now re-exports it.

Rows in the shell are focusable (Enter/Space opens details). The details are not live: switching type chips
closes them. Numbers and dates: see REVIEW.md "Fixed" (exact big integers, impossible dates shown as written).

## Needs a decision

- The shell's "Other views" is the only way to reach Table in the suite; nothing tells a person a document has a
  table view. A hint from the shell (or Files) would need a shell change.
