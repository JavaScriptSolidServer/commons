# data

A SolidOS pane that shows what the data says about anything: the view of last resort. It is offered
for every subject (as **Data** in the pane menu) but never opens first, so any pane made for the kind
of thing on show comes before it. It does the job of four upstream panes: the default outline,
Data contents, N3 and RDF/XML.

**Try it locally:** [people.ttl in the data browser](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fdata%2Fdata-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fdata%2Fpeople.ttl),
then open the "More options" menu (⋮) at the top right of the view and pick **Data**.
(Run `node tests/setup.mjs` first to put the samples on the test pod.)

**In the suite:** [people.ttl in the suite shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fdata%2Fpeople.ttl),
then pick **Data** from the shell's "Other views" menu (⋯ at the top right of the content). The shell loads
this pane itself (it is in `SUITE_APPS` as a viewer, not an app of its own).

## The suite look (phase 2)

Restyled with the suite's design sheet (`design/`): the `--sui-*` tokens and the `icon, row, buttons, chip, empty,
toast` recipes, copied in with `node design/embed.mjs data/data-pane.js` (prefix `dat`) and checked by the tests.
What changed on screen, nothing else:

- Blue and grey of the suite instead of the old purple; system type at 15 px; no capitals for section headings.
- Types are chips; booleans are green/grey chips; language and datatype tags are small grey marks.
- Properties are 44 px rows on hairlines with a row hover; the band of text values and the band of links are
  set apart by a heavier line. Unnamed things nest on the pale app background.
- **In this document** is a list of rows (icon, name, type chips, statement count on the right, dropped under
  520 px); the whole row opens the thing.
- Turtle / JSON-LD are pill buttons (the chosen one pale blue), Copy is a secondary pill; "Show more" is a
  tertiary pill. Errors are an error note with an icon; "Nothing is known" is an empty state.
- Content only in the shell: no navigation or details column (the Nextcloud equivalent has none; this is a
  viewer). It works the same alone.

## What it shows

- **About this**: every property of the subject and its values, from everything in the store.
  Type and names first, then text, numbers and dates, then links. A property with several values
  is one heading with a count. Property names are made readable (`birthDate` becomes "Birth date";
  `rdfs:label` wins when the store has one); the full URI is on hover.
  - Dates and times in the viewer's own format, numbers with separators, booleans as Yes/No;
    language tags and other datatypes shown small.
  - Links open in the data browser; each has a real `href` too (new tab, copy link). They are named
    from the store (`name`, `fn`, `prefLabel`, `label`, `title`…) when it knows one. Two types that
    read the same are told apart: "Person (foaf)", "Person (schema)". Addresses other than
    http(s), mailto and tel (`urn:`, `did:`) are shown as text, not links.
  - Unnamed (blank) nodes are shown nested, four levels deep. RDF lists are numbered lists.
- **Linked from**: the things that point at the subject, by the property they use; eight per
  property, then "Show N more".
- **In this document**: for a document, every named thing it describes, with its types and how
  many statements it has, forty at a time. So a data file can be browsed.
- **As text**: the document as Turtle or JSON-LD (pretty-printed), made when asked for, with the
  statement count and a Copy button. Over 1,500 lines, only the first 1,500 are put on the page
  (it says so); Copy still takes it all. Over 20,000 statements, only the first 20,000 are written out.
- **States**: a quiet "Loading…" while the subject's document loads; why it failed (401: log in;
  403: not allowed; 404: no document there); "Nothing is known about this here", with the document
  as text if it holds anything.
- At 400 px the two columns stack; nothing scrolls sideways.

## What it reads and writes

It reads only what is in the browser's store, and loads the subject's document (`subject.doc()`)
if nobody has yet. **It never writes**: no PUT, PATCH or update of any kind.

## The data

Any RDF in any vocabulary. For example, `samples/people.ttl`:

```turtle
<#alice> a foaf:Person, schema:Person ;
    foaf:name "Alice Example" ;
    schema:birthDate "1990-04-12"^^xsd:date ;
    ex:favouriteColours ( "red" "green" "deep blue" ) ;
    rdfs:comment "Leads the Sunday walks."@en, "Vede nedělní procházky."@cs ;
    vcard:hasAddress [ vcard:locality "Exampleton" ; ex:location [ ex:lat 50.08 ] ] .
ex:favouriteColours rdfs:label "Favourite colours" .
<#walk1> schema:name "Walk 1" ; schema:organizer <#alice> .
```

Samples: `people.ttl` (Alice, Bob and Carol, twelve walks), `project.jsonld` (JSON-LD that links
into `people.ttl`). The tests also make `big.ttl` (6,000 statements) and owner-only and
someone-else-only folders on the pod.

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/data/data-pane.js')).default)
```

Its name is `data-lab`.

## Tests

`node tests/run.mjs` checks the design block is current (`embed.mjs --check`), puts the samples on the test
pod, then runs the pane in headless Chromium (port 9533) logged in and logged out, at 1300 and 400 px, and
`tests/shell.mjs` runs it inside the suite shell and alone at a true 400 px (`design/viewport.mjs`).
Screenshots land in `tests/shots/`.

## Not done

- No editing, adding properties, SPARQL, graphs or visualisations (out of scope).
- No RDF/XML or N3 text (only Turtle and JSON-LD were asked for).
- In this browser, 401 and 403 are caught by the page itself ("Access denied") before any pane is
  drawn, so the pane's own 401/403 messages only show where a host draws it anyway (tested by
  drawing it directly).
- The pane menu is not on every view: the profile pane, for one, has none, so in this browser
  there is no click that shows a person with Data. Links inside the pane open the target's own
  preferred view, as asked.

## Credits

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as `data:` URIs
(database, cube-outline, alert-circle-outline).
