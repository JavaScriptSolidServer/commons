# activity

The suite's Activity app: what changed lately across a pod, or under any folder, newest first. Read-only.

- **Left:** filters. *All activity*, *Files* (whatever no app claims), then each app that has something:
  Photos, Notes, Contacts, Boards, Pads, Polls, Meetings, with counts.
- **Middle:** the stream, grouped **Today**, **Yesterday**, **This week** (the last seven days), **Last 30 days**,
  then by month. Each row: an icon (a small preview for pictures up to 2 MB, loaded as rows scroll into view), the name, the folder it is in, and a relative
  time ("10 min ago", "yesterday", "3 days ago", then a date; the full date on hover). 50 rows, then *Show more*.
- **Clicking a row opens the thing** in the data browser (in place; a modified click opens a new tab). For a data
  file it opens the file's main thing (`index.ttl#this`), so the poll opens as a poll.
- **Under the stream:** how many folders were read, how deep, and what was left out (over the limit, too deep,
  or not readable). Logged out, a note says some folders need a login.

Inside the suite shell it gives the shell its left column (`renderNavigation`: the filters) and its right column
(`renderDetails`, the (i) button: what was read, and which folders could not be). Alone in the data browser it
draws the filters itself: a left column from 900 px up, a row of chips below that.

**Try it** (the samples, logged in or out; `node tests/setup.mjs` puts them on the pod first and dates them from now):
http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Factivity%2Factivity-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Factivity%2Falice%2F

The whole test pod (log in; runs into the folder limit):
http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Factivity%2Factivity-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2F

70 folders, to see the limit:
http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Factivity%2Factivity-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Factivity%2Fbig%2F

## When it opens

On any folder it offers an **Activity** tab. It opens first only when the page was opened with its own link
(`?pane=…/activity-pane.js`); otherwise the folder view stays first. In the shell, the shell decides (see NOTES).
Pane name: `suite-activity`.

## What it reads

Folder listings only, walked from the folder it is opened on:

```turtle
<alice/notes/> ldp:contains <alice/notes/shopping.md>, <alice/notes/old/> .
<alice/notes/shopping.md> dct:modified "2026-11-22T08:15:00Z" ; stat:size 30 .
```

- The time is `dct:modified` (also `dc:modified` from Dublin Core elements, which JSS sometimes stores instead),
  else `stat:mtime` (seconds). A file with neither gets one `HEAD` for its `Last-Modified` (at most 12 per walk).
- Folders themselves are not rows (a folder's time only says something was added or removed in it).
  Names starting with a dot (`.acl`, `.meta`) are skipped.
- Then the newest Turtle / JSON-LD files (at most 40) are read once each, to see what they are by `rdf:type`
  (`vcard:AddressBook`, `vcard:Individual`, `vcard:Group` → Contacts; `wf:Tracker`, `wf:Open`, `wf:Closed` →
  Boards; `pad:Notepad` → Pads; `sched:SchedulableEvent` → Polls; `meeting:Meeting` → Meetings) or a give-away
  link (`vcard:inAddressBook`, `wf:tracker`, `sched:response`, `pad:next`), and to show their own title
  (`dct:title`, `dc:title`, `cal:summary`, `vcard:fn`, `rdfs:label`, `schema:name`). Pictures and Markdown go by
  their file name. Only things defined in the file itself count: a file that just mentions a typed thing from
  another file (an address book's `groups.ttl` naming `<Group/Friends.ttl#this> a vcard:Group`) keeps its own name. These reads go into a graph of the pane's own; SolidOS's store is not touched.
- Every read uses the logged-in fetch and `cache: no-store` (see NOTES: JSS answers a stale listing otherwise).

### The walk's limits

| Limit | Value | Meaning |
|---|---|---|
| Depth | **4** | The start folder and up to four levels of folders below it are read; a fifth level is not. |
| Folder cap | **60** | At most 60 folder listings per view, the start folder included. |
| Order | breadth first | All of one level before the next; within a level, the most recently changed folder first. |
| Type reads | 40 | The newest data files read to learn their kind and title; a file over 256 kB is not read. |
| `HEAD`s | 12 | For files whose listing gives no time. |
| At once | 6 | Requests in flight. |

What was left out is said under the stream (and in the shell's details): "11 more folders were not read: the
limit of 60 was reached", "1 folder is more than 4 levels down and was not read", "1 folder could not be read".
The constants are at the top of `activity-pane.js`.

## What it writes

Nothing. No `PUT`, `POST`, `PATCH` or `DELETE`, no `updater`; the static test checks the source, and the browser
test checks every file under the test folder is byte-for-byte the same afterwards.

## Tests

`node tests/run.mjs` (ends with `EVERY TEST PASSED`), port 9541:

- `static.mjs`: house rules on the source (no imports, no HTML strings, no writes, one prefix), the design block
  is current (`design/embed.mjs --check`), the pane's shape, `label` on folders only.
- `setup.mjs`: copies `samples/alice/` to `suite-data/activity/alice/` and dates every file from now (two today,
  two yesterday, four this week, four in the last 30 days, four older; one file five levels down, dated newest of
  all, which must never show); makes `alice/private/` owner-only (a JSON-LD ACL); builds `big/` (70 folders with
  a note each, newest `f00`).
- `activity.mjs`, logged in: the stream is every dated file, in order, in the right groups with the right
  relative times, folders, kinds and titles; the filters and their counts; each filter's rows; depth 4 is read
  and depth 5 is not; a row opens its thing; **a file touched on disk during the test is first after a reload**
  ("just now", Today); on `big/` exactly 60 listings are read, 11 folders left out and said so, *Show more*
  shows the rest and nothing past the cap; the shell contract (filters in the left column, a filter narrows the
  content, a row opens through `suite.go`, the details say what was read); no sideways scroll at 1300 px and a
  true 400 px; nothing on the pod changed.
- `shell.mjs`: inside the real suite shell, switched to Activity through the shell's views menu: Activity is the
  current app, the filters are in the shell's left column (none in the content), a filter there narrows the
  stream, the (i) button shows "What was read", a row opens its thing in the shell, no sideways scroll at 1300 px
  and a true 400 px.
- `loggedout.mjs`: the public files only, the note to log in, no sideways scroll at 1300 and 400 px; an
  unreadable folder is left to the data browser's own "Access denied".

## Not done

- No "by you / by others": listings carry no author. No deletions: a removed file just disappears.
- No live updates; reload to see new changes. No search.
- A file inside a folder past the cap or the depth is not shown, however new.

## Credits

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache License 2.0), as inline SVG
`data:` URIs. Styles: the suite design sheet (`design/`), copied in with `design/embed.mjs`.

AGPL-3.0-or-later (../LICENSE). Copyright (c) 2026 Melvin Carvalho.
