# meeting

A dynamic SolidOS pane that shows a meeting as one clear page: what it is, when, where, who, notes, and
everything kept for it. The meeting is kept in a pod, in the format of SolidOS's own meeting pane, so a meeting
made there opens here and the other way round.

**Try it locally:** [the sample meeting](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmeeting%2Fmeeting-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmeeting%2Fsamples%2Fplanning%2Findex.ttl%23this)
 · [in the suite shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmeeting%2Fsamples%2Fplanning%2Findex.ttl%23this)

## In the suite (phase 2)

- Restyled with the suite's design sheet (`design/`): the token block and the `icon`, `nav`, `row`, `buttons`, `input`,
  `chip` and `empty` recipes are embedded with `design/embed.mjs` (prefix `mtg`); the pane's own rules use only `--sui-*` values.
- **A header card**: a calendar figure, "Meeting", the title; **When** and **Where** as chips (with icons; they wrap rather than
  cut text off), the time-zone line, then **Who** and **Notes**, and **Add to calendar** as a secondary button.
- **For this meeting** is a list of rows: an icon for the kind, the name (the link), the kind under it; for an editor, up,
  down and remove as 44 px icon buttons (remove still takes two presses; the second is a red "Press again to remove").
  An empty list is the sheet's empty state.
- The forms are cards with the sheet's pill inputs; **Save** is the one primary button, **Add** is secondary.
- **Navigation** (`renderNavigation`): inside the suite shell, the left column lists **Overview** and then every item in the
  list's order, like SolidOS's tabs. Web pages open in a new tab, pod items in place (still in the shell). It is redrawn when
  the list changes. Alone in the data browser there is no column; the page is the same.
- In the shell, a saved or refused change also shows the shell's toast; the status line in the page stays as before.
- No details column (`renderDetails`): the header card is the meeting's details.
- Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0): calendar, calendar-plus, clock-outline,
  map-marker, information-outline, arrow-up, arrow-down, delete, web, message-text, pencil, poll, folder, account-multiple, link.

## What it does

- Opens on anything typed `meeting:Meeting` (and asks to open first, ahead of SolidOS's tabbed pane).
- A header: the title, **When** (start and end in the viewer's own time zone, with the zone named), **Where**
  (a link if it is a web address), **Who** (the people SolidOS has recorded as taking part), and **Notes**.
- **Add to calendar**: an `.ics` file built from the meeting's own fields, as a `data:` link. Whole days stay whole days.
- **For this meeting**: every tool or material in the meeting's list, in the list's order, with its name and kind
  (Chat, Shared notes, Web page, Scheduling poll, ...). Pod items open in place in the data browser; web pages open in
  a new tab, since the data browser cannot show other sites.
- For someone the pod lets write the file (it asks the pod, via `WAC-Allow`): edit the title, start, end, where and notes;
  add a link (name and https address) to the end of the list; move an item up or down; remove one (press twice; a double-click counts as one press). A click anywhere on an item's row opens it.
  Everyone else sees no buttons and no forms.
- With the pane loaded, a folder's Add menu offers **New Meeting**.
- One column on a phone; no sideways scrolling at 400 px.

## What it writes

A pane runs as the person using it, so this is the whole list:

| When | What |
|---|---|
| **New Meeting** | `index.ttl` in the new folder, as SolidOS's pane makes it. No access rule: it gets the folder's. |
| **Save** on the details | `cal:summary`, `cal:dtstart`, `cal:dtend`, `cal:location`, `cal:comment` of the meeting, by rewriting the whole `index.ttl` (see below) |
| **Add**, **Remove**, **↑** / **↓** | the whole `index.ttl`, rewritten with the new list (see below) |

An RDF list cannot be patched safely, and JSS drops a literal holding `}` from a SPARQL patch while answering 204, so every
change rewrites the file, as SolidOS's pane does for its list. After each write the pane reads the file back and says
"Saved." only if the pod kept what was sent; otherwise "Not saved as typed: …" and shows what the pod has. An address with an
apostrophe is written percent-encoded (`%27`, the same address), as JSS garbles IRIs with two of them. Before each one the pane
reads the file fresh, makes the change to that copy, and sends it with `If-Match`: if anyone changed the file in between,
the pod refuses (412), nothing is lost, and the pane says so and shows the latest. A removed item takes with it its own
description and the meeting's link to its target (unless another item still points there), as SolidOS's delete does.

It never records "you took part" on its own (SolidOS's details tab does, each time someone opens it).

## The data

`http://www.w3.org/ns/pim/meeting#`, with iCal (`cal:`), Dublin Core (`dc:`) and the workflow vocabulary (`wf:`):

```turtle
<#this> a meeting:Meeting ;
    cal:summary "Planning the spring workshop" ;
    cal:dtstart "2026-12-03T14:00:00Z"^^xsd:dateTime ;     # or "2026-12-03"^^xsd:date for a whole day
    cal:dtend "2026-12-03T15:30:00Z"^^xsd:dateTime ;
    cal:location "Room 2, Example Hall" ;
    cal:comment "Agree the dates." ;
    dc:author <https://alice.example/profile/card#me> ;
    meeting:toolList ( <#this> <#id1> <#id2> ) ;            # in order; <#this> is SolidOS's details tab
    meeting:chat <Chat/chat.ttl> ;
    wf:attachment <https://workshop.example.org/agenda> ;
    wf:participation <#p1> .
<#id1> a meeting:Tool ; rdfs:label "Agenda" ; meeting:target <https://workshop.example.org/agenda> ; meeting:view "iframe" .
<#id2> a meeting:Tool ; rdfs:label "Chat" ; meeting:target <Chat/chat.ttl> .
<#p1> wf:participant <https://alice.example/profile/card#me> .
```

A link added here is written as SolidOS's "Attach meeting materials" writes one: a `meeting:Tool` with a label, a
`meeting:target`, `meeting:view "iframe"` (for another site), and `wf:attachment` from the meeting. A day and a time are
written as an exact moment in UTC (`xsd:dateTime`); a day alone as `xsd:date`, which is what SolidOS's form writes.
The kind of an item comes from the meeting's link to it (`meeting:chat`, `meeting:sharedNotes`, ...), then its
`meeting:view`, then its type.

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/meeting/meeting-pane.js')).default)
```

Its name is `meeting-page`: SolidOS's own pane is called `meeting`, and a second pane with a taken name is ignored.

## Not done

- Tabs that embed other panes, making a chat, notes or poll from inside the meeting (link to an existing one instead),
  video calls, agenda timers, drag and drop.
- Choosing participants. **Who** is read only.
- Editing an item's name or address (remove it and add it again).
- The tab colour (`ui:backgroundColor`) is kept but not shown or edited.

## Tests

```sh
node tests/run.mjs
```

Port 9536. First `design/embed.mjs --check` (the embedded sheet is current). Then a real headless Chromium against the local
test pod: the sample logged out at 1300 and a true 400 px (`design/viewport.mjs`) (header card and chips, zone, list order,
kinds, links, calendar file, no controls, opening a pod item), then logged in: make a meeting with `mintNew`, edit,
notes with braces (saved and read back), add three links, refuse an http one, move, remove with two presses, whole days, reload, check the file's list with a
fresh rdflib store, open the same file in SolidOS's own meeting pane, and the forms at a true 400 px (44 px targets); then a
link with two apostrophes and a later change, and a real double-click on Remove. The sample test also opens an item by its row.
`tests/shell.mjs`: the sample in the suite shell (the Meetings app, the left column in order, links, a pod item opening in
place in the shell), a meeting made there (adding a link updates the left column, with a toast), no sideways scroll at
1300 px and a true 400 px with the drawer open. Test meetings go to `suite-data/meeting/` and are removed afterwards.

## Licence

MIT, copyright Melvin Carvalho. Written from the data format of the SolidOS meeting pane (MIT); no code is shared.
