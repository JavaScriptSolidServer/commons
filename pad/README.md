# pad

A dynamic SolidOS pane for a shared notepad kept in a pod. It replaces SolidOS's own `pad` pane and keeps its data format,
so a pad made there opens here and a pad edited here still opens there.

**Try it locally** (test pod, log in to edit):
[the demo pad](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fpad%2Fpad-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fpad%2Fdemo%2Findex.ttl%23this)
· [the read-only sample](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fpad%2Fpad-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fpad%2Fsamples%2Fmeeting-notes.ttl%23this)

**In the suite** it is the **Pads** app (`SUITE_APPS` in the shell):
[the demo pad in the shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fpad%2Fdemo%2Findex.ttl%23this).

## The look (suite phase 2)

Restyled to the suite's design sheet as a plain document editor, the way a Nextcloud user knows "Text":

- One centred, readable column (three quarters of `--sui-content-max`, about 810 px). On top, a slim toolbar that
  stays in view while the pad scrolls: a round **Refresh** icon button, the quiet status line ("Saving…", "Saved",
  "Not saved: …", in the sheet's status colours), and the people who took part as round avatars in their pad colours.
- Below it the title (sheet title, 24 px), the muted "By … · n lines · last written by …" line, and alone in the data
  browser the legend as chips (colour dot, name, line count). Then the lines, each tinted in its author's colour with
  a stronger mark and a muted line number; the line being edited gets the sheet's blue focus border.
- **In the shell** the pane also gives `renderDetails`: the shell's (i) button, or the avatars in the toolbar, open a
  details column with the pad's title, its participants (avatar, name, how many lines) and who made it and when. The
  legend is then not repeated in the content. There is no navigation column. Alone, it looks as before: legend inline.
- Tokens and recipes come from `design/` (`embed.mjs --prefix npd --only icon,toolbar,row,buttons,chip,avatar,toast,details`).

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as SVG `data:` URIs:
pencil (the pane's icon and the details figure) and refresh.

## What it does

- Opens on any `pad:Notepad`. Shows the title, who made it, the number of lines and who wrote last (and when).
- Shows the text line by line. Each line is tinted in its author's colour, with a stronger mark beside it; a legend
  says who is who and how many lines each person has. Hover a line to see its author's name.
- Logged in and allowed to write (the server's `WAC-Allow` header says `write`): every line is a text box that grows
  as its text wraps (at least 44 px tall), so a long line can be read whole on a phone. Append access alone is not
  enough (every edit here rewrites the file): such a person gets the read-only view and a line saying why.
  - A line saves when you leave it or stop typing for 1.5 seconds. The line is then recorded as yours.
  - **Enter** adds a new empty line after the current one. **Backspace** on an empty line removes it.
    **Up** and **Down** move between lines.
  - A small status says **Saved** or **Not saved: …** with the server's reason.
- Keeps up with other people: a **Refresh** button (the round arrow in the toolbar), and a check every 10 seconds while the tab is visible.
  Lines you are not editing are brought up to date; the line you are typing in is left alone.
- With the pane loaded, a folder's Add menu offers **New Notepad**.
- Logged out, or without write access: read-only, and it says so.
- One column; no sideways scrolling at 400 px.

## What it writes

A pane runs as the person using it, so this is the whole list. It sets no access rules. Every change is made the
same way: read `index.ttl` fresh (keeping its ETag), make the change, **PUT the whole file** (`text/turtle`) with
`If-Match: <ETag>`, read it back, and check the change is really there. Only then does it say **Saved**; otherwise
**Not saved: …** with the reason. (It used to send small SPARQL patches, but this server silently drops the inserted
text of a patch whose literal holds a `}` or `PREFIX …`, so a line like `if (x) { y }` was emptied while the pane said
"Saved": jss-findings, finding 5.) The pod stores the file as JSON-LD under the same name; it is served back as Turtle.

| When | What |
|---|---|
| **New Notepad** | `index.ttl` in the new folder: the pad and one empty line, as SolidOS's pane makes it |
| You leave a line or pause typing | that line's `sioc:content`, `dc:author` (you) and `dc:date` (now), replacing the old ones |
| Enter | a new line: two `pad:next` links change, and the new line gets its author, empty content and date |
| Backspace on an empty line | everything about that line goes, and the line before it points past it |
| Your first change in a visit, if you have none yet | your participation and colour (`wf:participation`), as SolidOS's pane does |
| **Start writing**, on a pad with no lines at all | its first line (SolidOS's pane adds one by itself on opening; this pane waits to be asked) |

If someone else saved the file in between, the server refuses the PUT (412); the pane reads the file again, makes the
same change on the new version and tries once more. So two people editing different lines never overwrite each other,
and two people editing **the same line**: the last one saved wins. There is no merge.

## The data

`http://www.w3.org/ns/pim/pad#`, as SolidOS's pad widget (solid-ui `pad.ts`) reads and writes it:

```turtle
<#this> a pad:Notepad ;
    dc:title "Shared Notes" ; dc:author <https://alice.example/profile/card#me> ;
    dc:created "2026-11-18T09:00:00Z"^^xsd:dateTime ;
    pad:next <#l1> ;                                   # the first line
    wf:participation <#p1> .
<#l1> sioc:content "Spring planting day" ; dc:author <https://alice.example/profile/card#me> ;
    dc:date "2026-11-18T09:02:00Z"^^xsd:dateTime ; pad:next <#l2> .
<#l2> sioc:content "Bring gloves" ; dc:author <https://bob.example/profile/card#me> ;
    pad:indent 1 ; pad:next <#this> .                  # back to the pad: the end
<#p1> wf:participant <https://alice.example/profile/card#me> ;
    cal:dtstart "2026-11-18T09:00:00Z"^^xsd:dateTime ; ui:backgroundColor "#f6d6e4" .
```

- The lines are a ring: `pad:next` from the pad through each line and back to the pad. Each line has exactly one
  `pad:next`, one `sioc:content` and one `dc:author`; SolidOS's pane refuses a pad where that is not so, and this pane
  keeps it so.
- `pad:indent` is read and shown; it is not edited here.
- `dc:date` on a line is this pane's one addition (SolidOS ignores it). It is what "last written by" is worked out from.
  `dct:modified` is read as well.
- A person's colour is the `ui:backgroundColor` of their participation, else the same hash of their WebID SolidOS uses.
- New lines are named `#id<time><random>`, like SolidOS's `#id<time>`.

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/pad/pad-pane.js')).default)
```

or add `?pane=<that address>` to the data browser's link, as above.

## Tests

`node tests/run.mjs` (needs the suite's `local.json` and the test pod running; browser ports 9521, and 9522 for bob).
It first checks the design block is current (`design/embed.mjs --check`). `tests/pad.mjs` makes a pad on the pod,
types, adds and removes lines, makes changes as another person would (direct patches), checks Refresh, polling and
last-write-wins, reads the file back the way SolidOS's pane checks it, renders it with SolidOS's own pad pane, and checks
1300 px and a true 400 px. `tests/shell.mjs` opens a pad in the suite shell: the Pads app, no navigation, details with
the participants (from the (i) button and from the avatars), a save, and a true 400 px with the details open.
`tests/two.mjs` is two real people: me shares a pad with bob (read and write), bob logs in as himself and adds a line,
me's page picks it up by itself, and after a reload shows bob's name from his profile and his colour.
`tests/two-person.mjs` (added by a reviewer) shares pads with bob for read+write, read only and append only, and
checks each: both editing at once, a refused write, and no fields for append only.
`tests/sample.mjs` reads the sample logged out at 1300 and a true 400 px. True 400 px is `design/viewport.mjs` (CDP
device metrics). Tests write only under `suite-data/pad/` and remove what they make. Screenshots are in `tests/shots/`.

## Not done

- Rich text, other people's cursors, undo history, merging two edits to the same line (last write wins).
- Splitting a line at the cursor on Enter, joining lines on Backspace, pasting several lines at once (a field holds one line).
- Changing the title or the indent of a line.
- Other people's cursors or a live "who is here now" list: the avatars are everyone who has ever taken part.
