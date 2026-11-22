# tasks

The suite's Tasks app: to-do lists kept in a pod. Lists on the left, the tasks of one list in the middle, one task's
details on the right (title, done, due date, priority, notes). One file, `tasks-pane.js`, pane name `suite-tasks`.

**Try it** (local test pod):

- [The sample lists, alone in the data browser](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Ftasks%2Ftasks-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Ftasks%2Fsamples%2Flists%2Fgarden%2Findex.ttl%23this) (read-only; anyone can open it)
- [The same, inside the suite shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Ftasks%2Ftasks-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Ftasks%2Fsamples%2Flists%2Fgarden%2Findex.ttl%23this)
  (until the shell lists Tasks as an app, its Boards app opens a list first: pick **Tasks** in the shell's "…" views menu)
- [Your own lists, to change](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Ftasks%2Ftasks-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Ftasks%2F): log in as `me`; the tests leave two lists there.

## What it does

- **Opens on** a task list, on one task (its list opens with that task in the details), or on a folder of task
  lists (a folder named `tasks`, or one whose list folders are already known to the browser).
- **Left:** the task lists in the folder that holds the open list, by name, each with how many are still to do;
  **New list** (for someone who may write in that folder). Up to 40 folders are looked into.
- **Middle:** the list's title and counts; a box to add a task; the open tasks, soonest due first, then by priority
  (high, medium, low, none), then newest; completed tasks folded under "N completed tasks", newest first. Each row has
  a tick box (its border coloured by priority, as in CalDAV task apps), the title, and on the right: a notes mark, a
  priority flag, the due date in words ("Today", "Tomorrow", "Yesterday", or the date; late ones in red).
- **Right (details):** tick or untick; title; due date; priority (None, High, Medium, Low); notes; who added it and
  when; when it was done; **Delete task** (press twice). Fields save as soon as they change. The list's own details
  (the (i) button) let you rename it and show its counts and folder.
- Logged out, or logged in without write access: everything is shown, nothing can be changed, and the pane says which.
- **Inside the suite shell** it gives the shell's left column (`renderNavigation`), its right column
  (`renderDetails`, for a task or, from the shell's (i) button, the list), and `search(query)`: the header search box
  filters the open list by title and notes. Outcomes of actions are shown with the shell's toasts.
- **Alone** it draws all three columns itself, following the design sheet's breakpoints on its own width: the
  details float over the tasks below 1100 px, the lists become a drawer (the ☰ button) below 900 px, the details
  take the whole width below 600 px, and row facts move under the title below 520 px.

## The data: which vocabulary, and why

Before choosing, I looked at what the Solid world already uses for to-dos:

| Option | Who uses it | Verdict |
|---|---|---|
| **wf: flow** (`http://www.w3.org/2005/01/wf/flow#`) — `wf:Tracker`, states as classes, `wf:Open`/`wf:Closed` | SolidOS's issue pane; the suite's Boards (Deck) pane | **Used for the list and done/not done.** Has no due date or priority. |
| **iCalendar in RDF** (`http://www.w3.org/2002/12/cal/ical#`) — `cal:Vtodo`, `cal:due`, `cal:priority`, `cal:completed`, `cal:status` | The VTODO that CalDAV task apps (Nextcloud Tasks among them) store; Melvin's `solid-apps/tasks` and the losos todo pane (`ical:Vtodo` items with `ical:status`); the poll pane already uses `cal:` | **Used for the to-do fields** wf: lacks. |
| schema.org `Action` / `actionStatus` | Some newer apps | Not used: no priority, and nothing in SolidOS or this suite reads it. |
| Our own | — | No. |

So a list is **exactly a SolidOS tracker** with two states, whose task class is also a `cal:Vtodo`, and each task
carries the iCalendar to-do fields. The payoff: the suite's Boards pane opens a Tasks list as a board (tested: To do and Done columns, every card), SolidOS's
own issue pane should too (same format; not tested), and the fields mean what any CalDAV task app means by them.
A list is told apart from a Deck board by that one link: its `wf:issueClass` is a subclass of `cal:Vtodo`.

Not used on purpose: `ical:status` as the done flag (the tracker state is the one source of truth; a done task
also gets `cal:completed`, the time it was done), and `dct:` terms (the test server stores `dct:` as `dc:` and then
cannot delete it; JSS findings #4), so titles and dates are `dc:title` and `dc:created`, as SolidOS's own trackers write them.

```turtle
# garden/index.ttl: the list
<#this> a wf:Tracker ; dc:title "Garden" ; dc:author <https://alice.example/profile/card#me> ;
    dc:created "2026-10-01T09:00:00Z"^^xsd:dateTime ;
    wf:issueClass <#Task> ; wf:initialState <#ToDo> ; wf:stateStore <state.ttl> .
<#Task> a rdfs:Class ; rdfs:subClassOf wf:Task, cal:Vtodo ; owl:disjointUnionOf ( <#ToDo> <#Done> ) .
<#ToDo> a rdfs:Class ; rdfs:label "To do" ; rdfs:subClassOf <#Task>, wf:Open .
<#Done> a rdfs:Class ; rdfs:label "Done" ; rdfs:subClassOf <#Task>, wf:Closed .

# garden/state.ttl: the tasks
<#Iss1> a <index.ttl#ToDo>, cal:Vtodo ; wf:tracker <index.ttl#this> ;
    dc:title "Sow the broad beans" ; wf:description "Two rows along the fence." ;
    cal:due "2026-11-30"^^xsd:date ; cal:priority 1 ;
    dc:created "2026-11-10T09:00:00Z"^^xsd:dateTime ; dc:author <https://alice.example/profile/card#me> .
<#Iss6> a <index.ttl#Done>, cal:Vtodo ; wf:tracker <index.ttl#this> ; dc:title "Rake the leaves" ;
    cal:completed "2026-11-08T15:30:00Z"^^xsd:dateTime ; …
```

- Priority is iCalendar's: 1–4 high, 5 medium, 6–9 low, 0 or none undefined. The pane writes 1, 5 or 9.
- Due is an `xsd:date`; an `xsd:dateTime` is read too (shown as its day).
- Also read, for data from other apps: `cal:summary` and `dct:title` as the title, `cal:description` as notes,
  `dct:created`, `foaf:maker`, and `cal:status "COMPLETED"` for a task with no tracker state. A tracker with more
  states (To do, Doing, Done) works too: closed states count as done; ticking moves a task to the first closed state,
  unticking to the initial state.
- Names come from `foaf:name` or `vcard:fn`, from data already loaded or the person's profile.

## What it writes

A pane runs as the person using it, so this is the whole list. Nothing is written on opening anything.

| When | What | Where |
|---|---|---|
| **New list** | a new folder named after the list (`a-z0-9-` only, `-2` etc. if taken) holding `index.ttl` (the tracker above, `dc:title`, `dc:author` you, `dc:created` now) and an empty `state.ttl`. Created with `If-None-Match: *`. **No access rules**: the folder inherits its parent's. | beside the other list folders |
| **Add a task** | a new `#Iss<time>` with its To do state, `cal:Vtodo`, `wf:tracker`, `dc:title`, `dc:created`, `dc:author` you | the list's `state.ttl` |
| **Tick / untick** | the task's state (`rdf:type`) swapped; `cal:completed` added (now) or removed; any `cal:status` removed (and, only for a tracker with no open or closed state, `cal:status "COMPLETED"` / `"NEEDS-ACTION"` written instead of the state) | `state.ttl` |
| **Title, notes, due, priority** | `dc:title`, `wf:description`, `cal:due`, `cal:priority` replaced (an empty field removes it; also removes `cal:summary`/`cal:description`/`dct:title` it replaces) | `state.ttl` |
| **Delete task** | every statement about the task, and any pointing at it | `state.ttl` |
| **Rename list** | the tracker's `dc:title` (and any `dct:title`) | the list's `index.ttl` |

### Why whole files

Every change reads the file fresh (with its ETag), changes it, and **PUTs the whole file back with `If-Match`**, so
a write made elsewhere between that read and the PUT is never overwritten (the pod answers 412, the pane says
"try once more", and what you typed stays in the box). No ETag from the pod: no save. Each edit also carries the value
the field showed when you started: if the fresh file has a different one (someone changed that field after you opened
the task), the edit is refused, theirs is shown under the box, and yours stays in it with **Save again** (replace
theirs) and **Discard**. A delete is refused if the task changed since you saw it; renaming checks the old name.
Then it reads the file again and checks the pod stored what was typed; if not it says "Not saved as typed".
Ticks and edits made while a save is running wait their turn; none is dropped.

**Where it writes, and nowhere else:** a list's own `index.ttl`, and its tasks file only when that file is in the
list's own folder or below it (same site). A list whose `wf:stateStore` names any other address is shown read-only
with a note saying why, so opening someone's crafted list cannot make the pane rewrite another file you may write.
It never PATCHes. Reasons, from `panes-lab/jss-findings/REPORT.md`: a SPARQL patch with `}` in a literal silently
loses the text (#5, and task notes are free text); a PATCH to a file the server keeps as JSON-LD drops lists (#6, and
`index.ttl` holds the states list, `owl:disjointUnionOf`); a patch's WHERE is ignored (#7). Other triples in the file
(another app's comments or assignees) are kept: the file is rewritten from everything the pod returned.

## Not done

- Subtasks, recurring tasks, start dates, times on due dates, reminders, tags/categories, percent complete,
  attachments, drag-and-drop ordering, moving a task between lists, smart lists ("Today", "Important").
- Deleting a list (deleting a folder is dangerous on this server: JSS findings #2) and list colours.
- Sharing a list: the Sharing pane does that for the list's folder.
- Registering lists in the type index, so the shell can find a person's lists wherever they are (see NOTES).

## Tests

```sh
node tests/run.mjs      # static · sample · tasks · shell · bob · interop; ends EVERY TEST PASSED
```

Browsers on ports 9531 and 9532 (bob). Test data in `~/ideas/jss-data/me/public/suite-data/tasks/` (rebuilt by
`tasks.mjs`). Screenshots in `tests/shots/`. True 400 px with `design/viewport.mjs`.

## Credits and licence

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0): format-list-checks, plus, check,
flag, text, delete, close, menu, chevron-down, checkbox-marked-outline, information-outline.
MIT. Copyright (c) 2026 Melvin Carvalho.
