# Commons

Commons is a set of apps for your [Solid](https://solidproject.org) pod that a Nextcloud user would recognise
straight away: a blue header with an app launcher, search and an avatar menu; navigation on the left, content in the
middle, details on the right. Files, Photos, Contacts, Tasks, Boards, Notes, Pads, Polls, Meetings, Activity and Search,
plus Sharing, Settings and Profile. Every app reads and writes ordinary Solid data on your own pod (folders, Turtle,
JSON-LD, Web Access Control), so other Solid apps see the same data.

Each app is a SolidOS pane: one ES module, no build, no framework. The shell (`shell/suite-shell-pane.js`) is a pane
too. It chooses which app draws each address and puts that app in the frame. All of it runs in the SolidOS data
browser [mashlib/dynamic](https://github.com/mashlib/dynamic).

**Try it on your pod:**
https://mashlib.com/dynamic/?pane=https%3A%2F%2Fjss.live%2Fcommons%2Fshell%2Fsuite-shell-pane.js&uri=YOUR-POD-ADDRESS

Put your pod's address (for example `https://alice.example/`) in place of `YOUR-POD-ADDRESS`. The browser asks once
whether to trust the pane.

**Make it your pod's interface** ([JSS](https://jss.live) 0.0.230 or later):

```sh
jss start --mashlib-module https://mashlib.com/dynamic/v/0.0.2/dist/boot.js \
          --panes https://jss.live/commons/shell/suite-shell-pane.js
```

`v/0.0.2` is a pinned release of the browser, which never changes; `dist/boot.js` is the latest. The shell loads its apps
from beside itself, so the one pane brings all of them. From mashlib/dynamic 0.0.2 the browser honours the shell's
`frame: true` and `chrome: 'none'`: Commons is the only top bar, and it opens every address, including `.js` files
and pages that fail to load. In an older browser Commons still works, under the browser's own bar.

## Apps

| App | Nextcloud twin | folder | pane name | state |
|---|---|---|---|---|
| Shell (header, launcher, app frame) | the Nextcloud frame | `shell/` | `suite-shell` | tests pass (no separate review) |
| Dashboard | Dashboard | `home/` | `pod-home` | reviewed, fixed, tests pass |
| Files | Files | `folder/` | `folder-lab` | reviewed, fixed, tests pass |
| Photos | Photos | `media/` | `media` | reviewed, fixed, tests pass |
| Contacts | Contacts | `contacts/` | `contacts` | reviewed, fixed, tests pass |
| Tasks | Tasks | `tasks/` | `suite-tasks` | reviewed, fixed, tests pass |
| Boards | Deck | `issues/` | `issues` | reviewed, fixed, tests pass |
| Notes | Notes | `notes/` | `notes-reader` | reviewed, fixed, tests pass |
| Pads | Text (shared editing) | `pad/` | `notepad` | reviewed, fixed, tests pass |
| Source | Text (plain-text editor) | `source/` | `source-lab` | reviewed, fixed, tests pass |
| Polls | Polls | `poll/` | `poll` | reviewed, fixed, tests pass |
| Meetings | Calendar (an event's page) | `meeting/` | `meeting-page` | reviewed, fixed, tests pass |
| Activity | Activity | `activity/` | `suite-activity` | reviewed, fixed, tests pass |
| Search | Unified search | `search/` | `suite-search` | reviewed, fixed, tests pass |
| Sharing (in Files' details) | Sharing tab | `sharing/` | `sharing-lab` | reviewed, fixed, tests pass |
| Settings | Personal settings | `settings/` | `settings-lab` | reviewed, fixed, tests pass |
| Profile | Personal info | `profile-edit/` | `profile-edit-lab` | reviewed, fixed, tests pass |
| Document | Viewer | `document/` | `document-lab` | reviewed, fixed, tests pass |
| Table | (none; nearest is Tables) | `table/` | `table` | reviewed, fixed, tests pass |
| Data | (none) | `data/` | `data-lab` | reviewed, fixed, tests pass |

Profile and Settings are in the avatar menu. Search opens from the header box. Sharing, Document, Table, Source and
Data are viewers: they have no launcher tile and are offered under "Other views" (`…`). Several panes keep their
working names (`folder-lab`, `sharing-lab`…) because a browser skips a new pane that has a built-in pane's name.

## Tests

The tests drive a real browser (Chromium, over CDP) against a real pod. They need a local
[JSS](https://jss.live) pod with two test users (`me` and `bob`). Their addresses and passwords go in
`../suite-local.json`, outside this folder (see `lib/lib.mjs` for the fields).
`node verify.mjs | tee verify.log` runs every test and ends with `EVERY TEST PASSED`. The last run is
[verify.log](verify.log): 20 panes, 2135 checks. Each pane folder also has its own `tests/run.mjs`. Every app was
reviewed by an agent that did not write it (`REVIEW.md` in each folder, with what was fixed); two-person tests
(`me` and `bob` at once) cover Files with Sharing, Contacts, Boards, Polls, Tasks and Pads.

Screenshots: `node shots/take.mjs` (every app at 1300 px and a true 400 px) and `node shots/launcher.mjs` (each launcher
app opens on data). `demo/` describes the demo data used on the test pod.

## Design

- Design sheet and sample page: [design/samples.html](https://jss.live/commons/design/samples.html)
- Tokens, recipes and the shell/app-pane contract: [design/DESIGN.md](design/DESIGN.md)
- Icons: Material Design Icons (https://pictogrammers.com/library/mdi/), Apache 2.0, as inline SVG `data:` URIs.
  No Nextcloud code, CSS, icons, name or logo.

## Not yet

- Calendar
- Talk / chat
- Mail
- Office documents
- Forms engine
- Mobile apps
- Sync clients
- Bookmarks
- Notes editing (Notes is read-only)
- An "all polls" list in Polls

See [NOTES.md](NOTES.md) for judgement calls, what is unverified, security notes, and what JSS still needs to fix.
How it was built (the briefs given to the agents that wrote and reviewed it) is in [dev/](dev/).

## Licence

[AGPL-3.0-or-later](LICENSE), copyright Melvin Carvalho, like the data browser it runs in ([mashlib/dynamic](https://github.com/mashlib/dynamic)). Panes
that were published earlier under MIT (for example poll and notes in solid-panes) stay MIT in those published copies;
the copies here are AGPL. Several apps were written from the data formats of SolidOS panes (MIT); no SolidOS code is
copied. Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as SVG `data:` URIs.
