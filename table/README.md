# table

A read-only SolidOS pane that shows the things a document describes as a table: one row per thing, one
column per property. A generic fallback for data that has no pane of its own. It replaces the data
browser's `tableViewPane.js` and `classInstancePane.js`.

One file, no imports. Loads at runtime by link, with no build or release.

**Try it locally:** [the book club sample](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Ftable%2Ftable-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Ftable%2Flibrary.ttl)
then choose **Table** from the ⋮ menu in the resource header. It is an extra view: the data browser still opens
its usual view first.

**In the suite:** [the book club in the suite shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Ftable%2Flibrary.ttl),
then pick **Table** from the shell's "Other views" menu (⋯). The shell loads this pane itself (`SUITE_APPS`, viewer).

## The suite look (phase 2)

Restyled with the suite's design sheet (`design/`): `--sui-*` tokens and the `icon, buttons, input, chip, empty,
toast, details` recipes, copied in with `node design/embed.mjs table/table-pane.js` (prefix `tbl`), checked by the tests.

- A clean table: white header that sticks to the top of the table box, 44 px rows on hairlines, row hover, no
  zebra stripes; sort arrows are icons. A wide or long table scrolls inside its own rounded box (at most 70% of
  the window high, so the header can stick); the page never scrolls sideways.
- The **Type** menu is now a row of chips (pressed = shown), the largest type first; same behaviour.
- The filter is a pill search box with an icon; Copy as CSV, Show all columns and Show all rows are pill buttons;
  the copy result is a status line (green, or red with the CSV box); "not a table" is an empty state.
- Below 600 px of pane width each thing is a card, sorting is a pill select and a button, as before.
- **In the suite shell only:** a click on a row (not on one of its links) marks the row and opens that thing in
  the shell's details column with every property, the hidden columns too; the shell's (i) button shows the
  table itself (type, rows, columns, where from, the property list); the shell's header search filters the rows
  (and fills the filter box). Alone in the data browser none of this is drawn, and nothing else changes.

## What it does

- Offered as **Table** when the subject is a document in which 3 or more things share an `rdf:type`, or a
  class with 3 or more members in the store. Never opens first.
- One row per thing. The first column is the thing's name (`schema:name`, `foaf:name`, `vcard:fn`,
  `dct:title`, `rdfs:label` and the like), linked to the thing.
- One column per property those things use, most-used first. The first 8 are shown; **Show all N columns**
  shows the rest.
- When the document has several types with 3 or more things each, **type chips** pick which to show,
  the largest first.
- Headers are the property's `rdfs:label` if the store has one, otherwise its local name in words
  (`numberOfPages` reads "Number of pages", `isbn` reads "ISBN").
- Cells: text as text; numbers formatted and right-aligned; dates and date-times formatted in the
  reader's locale; things as links that open in the data browser; `mailto:` and `tel:` as plain links;
  several values joined with commas; a blank node by its name or its first few values. Other link kinds
  (`urn:`, `javascript:`…) are shown as text, never as links.
- Click a header to sort, again to reverse. Numbers and dates sort as numbers and dates; empty cells go
  last either way.
- A filter box narrows the rows as you type (every word must appear somewhere in the row), and a count
  says "3 of 12".
- **Copy as CSV** copies the rows now shown, in their order, with every column (hidden ones too), a URI
  column, and raw values (ISO dates, plain numbers, full URIs). If the browser refuses the clipboard, the
  CSV appears in a box, selected, to copy by hand.
- A wide table scrolls inside its own box; the page never scrolls sideways. Below about 600 px of pane
  width each thing becomes a card, and sorting moves to a **Sort by** menu.

## What it reads

Only what the data browser has already loaded into its store: the document's own statements, or, for a
class, every statement about its members. It fetches nothing itself.

## What it writes

Nothing, ever. The tests check that no PUT, POST, PATCH or DELETE is sent and that the store's updater is
never called.

## The data

Any RDF where several things share a type, for example:

```turtle
@prefix schema: <http://schema.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<#b1> a schema:Book ; schema:name "The Quiet Orchard" ; schema:author <#alice> ;
    schema:numberOfPages 312 ; schema:datePublished "2019-04-02"^^xsd:date ; schema:genre "Fiction" .
<#b2> a schema:Book ; schema:name "Bridges of Salt" ; schema:author <#bob> ;
    schema:numberOfPages 1024 ; schema:genre "History", "Travel" .
<#b3> a schema:Book ; schema:name "A Map of Small Rooms" ; schema:author <#carol> .
schema:numberOfPages rdfs:label "Pages" .   # optional: a header of your own
```

`samples/library.ttl` is a made-up book club: 12 books and 3 members (Alice, Bob, Carol).

A folder with 3 or more files also offers Table: the files are the rows (size, modified). The document
itself (here the folder) is never a row of its own table.

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/table/table-pane.js')).default)
```

## Not done

- No paging beyond a first 500 rows (a **Show all** button draws the rest); very large documents are
  slow to group, as everything is in memory.
- Class mode counts only members stated with `rdf:type` in the store; members implied by subclasses or
  `rdfs:domain` (which `classInstancePane` reported) are not found.
- Language-tagged values are all shown, joined; there is no choice of language.
- Columns cannot be reordered or hidden one by one, and the column choice is not remembered.
- Nested things (a blank node with its own properties) are summarised in one cell, not expanded.

## Tests

```sh
node tests/run.mjs
```

They check the design block is current (`design/embed.mjs --check`), then drive a real headless Chromium
against the local test pod (`../lib/lib.mjs`, browser port 9534):

- `table.mjs`, logged in: offered not focused; rows, headers, cells; sorting numbers, dates, text and
  empties; filtering; more columns; Copy as CSV through the real clipboard and its refused fallback; the
  type menu; a link opening in the data browser; a reload; nothing written and the pod file unchanged.
- `sample.mjs`, logged out at 1300 and a true 400 px (`design/viewport.mjs`): the same table, cards and the sort menu on a phone, no
  sideways scroll.
- `edge.mjs`, logged out: not offered for 2 things or for one thing; hostile text, `javascript:` and
  `urn:` links, blank nodes, booleans, CSV quoting and formula escaping (`tests/data/odd.ttl`); a class as
  subject; a folder.
- `shell.mjs`, logged out, inside the suite shell: chosen from Other views; sticky 44 px header and rows; the (i)
  details; a row's details (marked, cleared on close); the header search; nothing written; no sideways scroll
  at 1300 px and a true 400 px (with the details open too).

The test data lives in `public/suite-data/table/` on the test pod (`samples/library.ttl`,
`tests/data/few.ttl`, `tests/data/odd.ttl`).

## Credits

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as `data:` URIs
(table, magnify, content-copy, menu-up, menu-down, cube-outline).

## Licence

AGPL-3.0-or-later, copyright Melvin Carvalho. Written from the data shapes of SolidOS's `tableViewPane` and
`classInstancePane` (MIT); no code is shared.
