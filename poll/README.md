# poll (the suite's Polls app)

A SolidOS pane that finds a time for a call or a meeting. The poll is kept in a pod. In the suite it is the
**Polls** app; alone it is an ordinary dynamic pane. A copy of the published
[poll pane](https://github.com/solid-panes/poll), restyled to the suite's design sheet.

**Try it locally:**

- In the suite shell: http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fpoll%2Fsamples%2Fcall%2Findex.ttl%23this
- Alone: http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fpoll%2Fpoll-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fpoll%2Fsamples%2Fcall%2Findex.ttl%23this

The sample is read-only; answers are saved only on a poll of your own.

## What it does

- The person arranging it picks a day and a range of hours. Each hour becomes one choice.
- Every hour is an exact moment. Each person sees it in their own time zone, and the pane says which zone that is.
- Each person answers **Yes**, **If need be** or **No** for each hour. Pressing the same answer again clears it.
- Each hour shows its count, a bar, and who can make it (green chips for yes, amber for if need be). The best hour so far is marked.
- Other things can be decided in the same poll: add a choice that is not a time.
- With the pane loaded, a folder's Add menu has **New Poll**. Its maker can add and remove times and edit what it is for, where, and notes.
- No sideways scrolling at a true 400 px; on a narrow screen the answer buttons move under each choice.

## In the suite (phase 2: what changed)

The layout follows the one a Nextcloud Polls user knows, through the suite's app-pane contract (`design/DESIGN.md`):

| Column | What is there |
|---|---|
| Left (`renderNavigation`) | **Add poll** (for the poll's maker), then the poll on show under **My polls** (its maker), **Answered** (someone who has answered) or **This poll**, with the number of people who have answered. The pane knows only the poll it is showing: there is no list of every poll, and no Closed (polls cannot be closed). |
| Middle (`render`) | The poll: title, by-line, place, notes, the time zone, then the choices as rows grouped by day, each with its count, bar, who said yes, and your Yes / If need be / No buttons. The maker's "Offer times" form under it. |
| Right (`renderDetails`, the shell's (i) button) | Three tabs: **About** (place and notes; the maker edits title, place and notes here), **Configuration** (who made it and when, the choices, how answering works, the time zone, the answers file, the address, and a note on who can answer), **Participants** (each person who answered with their counts). Polls have no comments, so there is no comments tab. |

Inside the shell a saved or refused change is also a toast. Alone (no shell), everything stays in the content as
before, including the edit form, and there is no left or right column.

Styling: the suite's tokens and recipes (`--sui-*`), copied in by `design/embed.mjs` (prefix `pol`). Light only.
Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as SVG `data:` URIs.

## What it writes

A pane runs as the person using it, so this is the whole list:

| When | What |
|---|---|
| **New Poll** (a folder's Add menu) | `index.ttl` and `results.ttl` in a new folder, and an access rule for each |
| **Add poll** (the suite's left column, maker only) | the same, in a new folder `poll-<time>/` beside the folder of the poll on show; then it opens it |
| The maker edits the poll | the title, place, notes and options in `index.ttl`: the file is read fresh and written back whole (PUT with If-Match) |
| Someone presses an answer | their own answer in `results.ttl` |

Every save is read back from the pod; it says "Saved" only when the pod holds exactly the change. (Whole-file
writes for `index.ttl` because the test server loses text containing `}` from a SPARQL patch.)

People's names come from their own profiles, or from the poll's `index.ttl` (which only its maker can write), never
from `results.ttl`, which anyone logged in can write.

A new poll can be read by anyone who has its address, and its answers file can be read and written by anyone who is logged in. That is what lets the people you invite answer, and it is what SolidOS's own pane does. It also means a logged-in person could change another person's answer: use it among people you trust. (The Configuration tab says so.)

## The data

The format is the one SolidOS's scheduling pane uses (`http://www.w3.org/ns/pim/schedule#`), so a poll made there opens here.

```turtle
# index.ttl
<#this> a sched:SchedulableEvent ; cal:summary "Call" ; dc:author <WebID> ;
    sched:option <#o1>, <#o2> ; sched:results <results.ttl> .
<#o1> cal:dtstart "2026-12-04T14:00:00Z"^^xsd:dateTime ; cal:dtend "2026-12-04T15:00:00Z"^^xsd:dateTime .
<#o2> rdfs:label "Record the call" .

# results.ttl
<index.ttl#this> sched:response <#r1> .
<#r1> dc:author <WebID> ; sched:cell <#r1-a> .
<#r1-a> sched:option <index.ttl#o1> ; sched:availabilty sched:Yes .
```

`availabilty` is the vocabulary's own spelling. Three things are added to what SolidOS writes: an hour has an end (`cal:dtend`) and is written as an exact moment in UTC; an option may have a text label in place of a time; and an answer links to its option with `sched:option`. Answers that only repeat the option's `cal:dtstart`, as SolidOS's pane writes them, are read too.

## Not yet

- Closing a poll, or fixing the chosen option.
- Limiting who may answer to a list of people.
- A list of all your polls (the left column shows only the one on show).

## Licence

[AGPL-3.0-or-later](LICENSE), copyright Melvin Carvalho. Written from the data format of the SolidOS [scheduling pane](https://github.com/SolidOS/solid-panes) (MIT); no code is shared. Icons: Material Design Icons, Apache 2.0.

## Tests

```sh
node tests/run.mjs
```

They use the suite's helper (`../../lib/lib.mjs`, settings in the suite's `local.json`) and the local test pod,
browsers on ports 9523 and 9524. In order: the design block is current (`design/embed.mjs --check`); `poll.mjs` alone,
logged in: make a poll, add options, answer, change, clear, remove, edit, reload, then 1300 px and a true 400 px;
`shell.mjs` in the suite shell, reusing that login: the left column, an answer with its toast, the details tabs and
editing there, 1300 px and a true 400 px with the details open and shut, and "Add poll"; `sample.mjs` the sample
logged out at 1300 px and a true 400 px; `two-person.mjs` (from the review) me and bob (port 9524) on one poll,
including bob's refused writes and names planted in the answers file. Regression checks for the review are marked
`#n` (REVIEW.md, "Fixed"). Test data goes under `me/public/suite-data/poll/` and is removed after
(`KEEP=1` keeps it). Screenshots: `tests/shots/`.
