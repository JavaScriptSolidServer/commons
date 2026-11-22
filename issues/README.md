# issues

A dynamic SolidOS pane for an issue tracker kept in a pod, shown as a board: one column per state, one card per issue.

It reads and writes the format of SolidOS's own issue pane, so a tracker made there opens here and the other way round.

**Try it:** [open the sample tracker](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fissues%2Fissues-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fissues%2Fsamples%2Fshed%2Findex.ttl%23this)
(local test pod; one issue on its own: [Fit the window](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fissues%2Fissues-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fissues%2Fsamples%2Fshed%2Fstate.ttl%23Iss4)).
**In the suite shell** (the Boards app): [the sample tracker in the shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fissues%2Fsamples%2Fshed%2Findex.ttl%23this).

## Changed for the suite (phase 2)

- Restyled with the suite's design sheet (`design/`): its tokens and recipes are copied into the pane by
  `design/embed.mjs --prefix iss` (sections icon, nav, buttons, input, chip, avatar, empty, toast, details). No colours,
  sizes or radii of its own; the column and board dots are token colours.
- Laid out like a kanban board app: the columns sit side by side at a fixed width and scroll sideways **inside the
  board**, never the page (they used to wrap into rows). Cards are white with a light shadow: title, the start of the
  description, age and the assignee's initials and name. Under 600 px the columns become chips, one column at a time.
- **In the suite shell**, through the shell contract (`renderNavigation`, `renderDetails`):
  - the left column lists the boards: this one (marked, with its open count), the trackers the person's type indexes
    list (`solid:forClass wf:Tracker`, `solid:instance`), and trackers already seen in this session; each with a
    colour dot; one opens that board in the shell;
  - a card opens its details in the right column: title, state, opened, by, assigned to, the whole description, and
    the controls (Move to, Edit, Assign to me, Unassign) and a link to the issue page. In the shell the cards carry
    no controls of their own; results are toasts;
  - the shell's (i) button shows the board itself: owner, created, each column with its count, where issues are kept.
- Alone in the data browser it works as before: controls on each card (icon buttons), the message line in place.
- Behaviour, data and writes are unchanged.

## What it does

- Opens on a tracker (`wf:Tracker`) as a board. The columns are the tracker's states, in the order its settings list
  them, open states first. Each column shows a count; each card shows the title, the start of the description, how old
  the issue is and who it is assigned to. Newest first.
- On a phone (under 600 px) the columns become chips, one column at a time. No sideways page scrolling at 400 px.
- Opens on one issue to show it in full: state, when it was opened, by whom, who has it, the whole description, and a
  link back to its tracker.
- Refresh is there for everyone. Someone the pod lets only append to the state file gets **New issue** and nothing
  else. A failed save keeps the form and what was typed; a conflict (409/412, someone else changed it) says so in
  plain words and reads the board again.
- For someone the pod lets write the tracker's state file: **New issue** (title, description), **Move to** another
  state (a select on each card and on the issue page), **Edit** title and description, **Assign to me**, **Unassign**.
  Logged out, or without write access, there are no controls and the pane says so.
- With the pane loaded, a folder's Add menu offers **New Tracker**, with three states: To do, Doing, Done.

## What it writes

A pane runs as the person using it, so this is the whole list:

| When | What | Where |
|---|---|---|
| **New Tracker** | `index.ttl` (the settings) and `state.ttl` (the issues) in a new folder. No access rules. | the new folder |
| **New issue** | a new issue: `wf:tracker`, `dc:title`, `wf:description`, `dct:created`, `dc:author`, its first state | `state.ttl` |
| **Move to** | the issue's state (`rdf:type`), the old one removed | `state.ttl` |
| **Edit** | `dc:title` and `wf:description`, replaced | `state.ttl` |
| **Assign to me / Unassign** | `wf:assignee` | the issue's own document (`state.ttl`, as SolidOS does) |

Every change is a Solid N3 Patch (`PATCH`, `text/n3`) on the document named, one per document; then the pane reads that
document again and says "Saved" only if the pod now holds what was meant (otherwise "Not saved as typed"). It does not
use SPARQL Update, which loses text containing `}` on JSS (jss-findings #5). Nothing is written on opening a tracker. In the shell, the details column
writes exactly the same things as the card controls; listing the boards only reads (the person's profile, preferences
file and type indexes, and each listed tracker's settings file for its title).

## The data

Vocabulary `http://www.w3.org/2005/01/wf/flow#` (`wf:`), as SolidOS's issue pane uses it.

```turtle
# index.ttl: the tracker and its states
<#this> a wf:Tracker ; dc:title "Kitchen" ; dc:author <WebID> ; dc:created "2026-11-21T10:00:00Z"^^xsd:dateTime ;
    wf:issueClass <#Issue> ; wf:initialState <#ToDo> ; wf:stateStore <state.ttl> ; wf:assigneeClass foaf:Person .
<#Issue> rdfs:subClassOf wf:Task ; owl:disjointUnionOf (<#ToDo> <#Doing> <#Done>) .
<#ToDo>  rdfs:label "To do" ; rdfs:subClassOf <#Issue>, wf:Open .
<#Doing> rdfs:label "Doing" ; rdfs:subClassOf <#Issue>, wf:Open .
<#Done>  rdfs:label "Done"  ; rdfs:subClassOf <#Issue>, wf:Closed .

# state.ttl: the issues; an issue's state is its type
<#Iss1732183200000> a <index.ttl#Doing> ; wf:tracker <index.ttl#this> ;
    dc:title "Fix the tap" ; wf:description "It drips at night." ;
    dct:created "2026-11-21T10:00:00Z"^^xsd:dateTime ; dc:author <WebID> ; wf:assignee <WebID> .
```

- The columns come from `owl:disjointUnionOf` on the issue class (read as an RDF list in either form). With no list it
  uses the states that are `rdfs:subClassOf` the issue class; for a bare `wf:Task`, Open and Closed.
- A state that is a subclass of `wf:Open` is open; of `wf:Closed`, closed. Open states come first.
- An issue with no known state goes in a last column, "No state".
- Read too: `dc:created` for the date, `foaf:maker` for the author, `wf:issueURITemplate` (an issue in its own file).
- `dc:author` on an issue is the one thing this pane adds to what SolidOS writes; SolidOS ignores it.
- Names come from `foaf:name` or `vcard:fn`, from data already loaded or the person's profile.

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/issues/issues-pane.js')).default)
```

## Not done

- Comments on issues, categories other than state, attachments, CSV export (left out on purpose).
- Drag and drop between columns. The select does the job and works on a phone.
- Assigning to someone other than yourself. SolidOS offers a list from groups and project developers; this pane only
  offers "Assign to me" and "Unassign".
- Deleting an issue, and editing the tracker's states or title.

## Tests

```sh
node tests/run.mjs
```

`tests/issues.mjs` logs in, makes a tracker with `mintNew`, adds issues, moves, edits, assigns and unassigns them,
checks each change in the pod file on disk, reloads, opens one issue, checks SolidOS's own issue pane reads the result
without complaint, then looks at 400 px and logged out. It removes the tracker afterwards (`KEEP=1` keeps it).
`tests/sample.mjs` reads the sample logged out at 1300 and a true 400 px (`design/viewport.mjs`), and checks the design
block is current. `tests/shell.mjs` opens copies of the sample in the suite shell, logged in: the boards column, a
card's details (move and edit there, checked in the pod file), the (i) details, scrolling, true 400 px, and opening
another board from the column. It removes its copies afterwards. They use `../lib/lib.mjs` and ports 9517 and 9518.

## Licence

MIT, copyright Melvin Carvalho. Written from the data format of the SolidOS issue pane (MIT); no code is shared.
Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as SVG `data:` URIs
(view-column, card-text-outline, plus, refresh, pencil, account-plus, account-minus, clock-outline, arrow-left, open-in-new).
