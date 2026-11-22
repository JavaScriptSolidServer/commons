# Notes: data pane

## Judgement calls

- **Never focuses, always labels "Data".** `shouldGetFocus` returns false; `label` returns "Data" for
  anything. It shows up as "Data" in the explorer's ⋮ menu, next to upstream's "Data (88)". In the
  test browser upstream's own Data contents pane is still the default for a document.
- **Grouping.** Rank: `rdf:type`, then name-like local names (`name, fn, prefLabel, label, title,
  summary, nick`, in that order), then properties whose values are all literals, then the rest
  (links, blank nodes, lists). Inside a band, alphabetical by readable name. A heavier line marks
  the start of the text band and the links band. A property with a mix of literals and links goes in
  the links band, literals listed first.
- **Property names.** `rdfs:label` of the predicate if the store has one (viewer's language first),
  else the local name de-camel-cased, with a small hand list for names that read badly
  (`fn` "Full name", `mbox` "Email", `nick` "Nickname", `mtime` "Modified"…). No vocabularies are fetched.
- **Telling twins apart.** When two values (or type chips) would show the same label, the
  vocabulary's prefix from `store.namespaces` is added ("Person (foaf)"), else the host.
- **Links** go to `GotoSubject(node, true, undefined, true, undefined)`, so the target opens in its
  own preferred view (often not this pane). Modified clicks fall through to the real `href`.
  Only http(s) links navigate in place; mailto/tel are plain links; other schemes are text.
- **Blank nodes**: four levels deep, cycle-safe ("the same unnamed thing as above"). Lists: both
  rdflib `Collection` terms and `rdf:first/rest` chains.
- **Linked from**: a blank-node subject is shown as "Something unnamed, part of <its named parent>".
- **In this document** lists named subjects only (not the document itself); loose blank nodes are
  counted in the heading but not listed.
- **As text** is made on first press and cached for the life of the view; Copy uses the clipboard
  API with a 2 s timeout (it can wait forever for a permission), then falls back to `execCommand`.
  Caps: 1,500 lines / 200,000 characters on the page; 20,000 statements serialised.
  The text is rdflib's serialisation of what is in the store for that document, not the server's
  original bytes (comments and order are lost, and rdflib invents prefixes like `alice:` or `peo:`).
- **States.** Uses `fetcher.getState(doc)`: `fetched` draws, `failed` reads the status from
  `fetcher.requested[doc]`, anything else draws "Loading…" and calls `fetcher.load(doc)`. Whatever
  the store already knows about the subject is still shown under a failure note.
- **Booleans**: rdflib stores Turtle `true` as `"1"^^xsd:boolean`; both `1` and `true` read Yes.

## Unverified or weak

- **401/403 inside the real browser**: the page shows its own "Access denied" and draws no pane, so
  those two messages were tested by calling `render` directly. 404 goes through the real browser.
- **A person can't be shown with Data by clicking** in this browser: the profile pane's view has no ⋮
  menu. The tests use `GotoSubject(subject, …, panes.byName('data-lab'), …)` for Alice, which is
  what the menu does for documents.
- **One test user**: no second person, so "someone else can read it" is only modelled by an ACL
  naming `https://bob.example.com/profile/card#me`.
- Date/number formatting follows the browser's locale; the tests ran in en-US.
- Not tried: very deep or very wide blank-node trees beyond the sample, documents with tens of
  thousands of distinct subjects in "Linked from", RDF/XML or N3 source documents (should work,
  they all end up in the same store).

## Next, if wanted

- Optionally keep the Data view when following links in "In this document" (stay in this pane).
- Fetch vocabularies lazily for `rdfs:label`/`rdfs:comment` of properties and classes.
- An RDF/XML or N-Triples tab if anyone misses the old panes.

## Phase 2: the suite look

Judgement calls:
- **Content only.** No `renderNavigation` / `renderDetails` / `search`: this is the view of last resort and
  has no Nextcloud counterpart with a sidebar; its whole content already *is* a thing's properties, so a
  details column would repeat it. The (i) button is therefore not offered for it in the shell.
- **Class renames forced by the sheet.** The recipe's `row` and `list` classes collided with the pane's own:
  property rows are now `.dat-prop` (were `.dat-row`), RDF lists `ol.dat-seq` (were `.dat-list`). The tests'
  selectors were updated to match; no check was dropped. `.dat-row` now means a list row ("In this document").
- **Properties are hairline rows, not list rows.** A property row is key + values (often several lines), so it
  uses the 44 px target as a minimum height, hairlines and row hover, not the 56 px icon/title/subline row.
  The band break (text vs links) is a 2 px `--sui-bg-dark` line instead of extra space.
- **"In this document" rows are whole-row links**: a click anywhere on the row clicks its name link (so it
  opens the thing exactly as before, `GotoSubject`, and in the shell stays in the shell). Statement count is
  row meta, dropped under 520 px of pane width (container query, plus the sheet's media query).
- **Turtle / JSON-LD** are secondary pills; the chosen one is `--sui-primary-element` (current = blue).
  Copy is secondary. There is no primary button: nothing here is "the main thing to do".
- Booleans use `chip-success` (Yes) / plain chip (No); language and datatype marks are 4 px-radius tags
  (`--sui-radius-sm`, "tags/small marks").
- The loading note is a quiet note on `--sui-bg-app`; failures are `note-error` with an alert icon.
- 400 px: tests/shell.mjs uses `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`, a true 400 px
  page) alone and in the shell. data.mjs/loggedout.mjs still run their old "400" (a ~500 px window) too.

Unverified:
- In the shell, the test now waits for the shell's `data-logged-in="yes"` before its checks (it was reading the
  page before the login settled).
- Values over 2,000 characters are cut with "Show all N characters"; big integers exact (BigInt); impossible
  dates shown as written (see REVIEW.md "Fixed").
- Data is offered in the shell only through "Other views"; whatever the shell chooses first for a document
  (here not Data) is the shell's choice.

## Needs a decision

- None blocking. Optional: a sheet recipe for a key/value property list in content (the `props` recipe is
  details-only, 13 px); this pane builds its own from tokens (`.dat-prop`).
