# Commons

Commons (folder `suite`, working name until 22 Nov 2026) is a set of Solid pod apps that a Nextcloud user would recognise straight away: a
blue header with an app launcher, search and an avatar menu; navigation on the left, content in the middle, details
on the right. Each app is a SolidOS pane (one ES module, no build) that reads and writes ordinary Solid data on your
own pod (folders, Turtle, JSON-LD, Web Access Control). The shell (`shell/suite-shell-pane.js`) is a pane too. It
chooses which app draws each address and puts that app in the frame. All of it runs in the SolidOS data browser.

**Open it** (test pod; log in as `me` with the button at the top right):
http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2F

## Apps

Screenshots are in the shell, logged in as `me`, at 1300 px and a true 400 px (CDP device metrics). The script that
takes them is `shots/take.mjs`.

| App | Nextcloud twin | folder | pane name | state | screenshots |
|---|---|---|---|---|---|
| Shell (header, launcher, app frame) | the Nextcloud frame | `shell/` | `suite-shell` | tests pass (no separate review) | [launcher 1300](shots/launcher-1300.png) |
| Dashboard | Dashboard | `home/` | `pod-home` | reviewed, fixed, tests pass | [1300](shots/dashboard-1300.png) / [400](shots/dashboard-400.png) |
| Files | Files | `folder/` | `folder-lab` | reviewed, fixed, tests pass | [1300](shots/files-1300.png) / [400](shots/files-400.png) |
| Photos | Photos | `media/` | `media` | reviewed, fixed, tests pass | [1300](shots/photos-1300.png) / [400](shots/photos-400.png) |
| Contacts | Contacts | `contacts/` | `contacts` | reviewed, fixed, tests pass | [1300](shots/contacts-1300.png) / [400](shots/contacts-400.png) |
| Tasks | Tasks | `tasks/` | `suite-tasks` | reviewed, fixed, tests pass | [1300](shots/tasks-1300.png) / [400](shots/tasks-400.png) |
| Boards | Deck | `issues/` | `issues` | reviewed, fixed, tests pass | [1300](shots/boards-1300.png) / [400](shots/boards-400.png) |
| Notes | Notes | `notes/` | `notes-reader` | reviewed, fixed, tests pass | [1300](shots/notes-1300.png) / [400](shots/notes-400.png) |
| Pads | Text (shared editing) | `pad/` | `notepad` | reviewed, fixed, tests pass | [1300](shots/pads-1300.png) / [400](shots/pads-400.png) |
| Source | Text (plain-text editor) | `source/` | `source-lab` | reviewed, fixed, tests pass | [1300](shots/source-1300.png) / [400](shots/source-400.png) |
| Polls | Polls | `poll/` | `poll` | reviewed, fixed, tests pass | [1300](shots/polls-1300.png) / [400](shots/polls-400.png) |
| Meetings | Calendar (an event's page) | `meeting/` | `meeting-page` | reviewed, fixed, tests pass | [1300](shots/meetings-1300.png) / [400](shots/meetings-400.png) |
| Activity | Activity | `activity/` | `suite-activity` | reviewed, fixed, tests pass | [1300](shots/activity-1300.png) / [400](shots/activity-400.png) |
| Search | Unified search | `search/` | `suite-search` | reviewed, fixed, tests pass | [1300](shots/search-1300.png) / [400](shots/search-400.png) |
| Sharing (in Files' details) | Sharing tab | `sharing/` | `sharing-lab` | reviewed, fixed, tests pass | [1300](shots/sharing-1300.png) / [400](shots/sharing-400.png) |
| Settings | Personal settings | `settings/` | `settings-lab` | reviewed, fixed, tests pass | [1300](shots/settings-1300.png) / [400](shots/settings-400.png) |
| Profile | Personal info | `profile-edit/` | `profile-edit-lab` | reviewed, fixed, tests pass | [1300](shots/profile-1300.png) / [400](shots/profile-400.png) |
| Document | Viewer | `document/` | `document-lab` | reviewed, fixed, tests pass | [1300](shots/document-1300.png) / [400](shots/document-400.png) |
| Table | (none; nearest is Tables) | `table/` | `table` | reviewed, fixed, tests pass | [1300](shots/table-1300.png) / [400](shots/table-400.png) |
| Data | (none) | `data/` | `data-lab` | reviewed, fixed, tests pass | [1300](shots/data-1300.png) / [400](shots/data-400.png) |

Profile and Settings are in the avatar menu. Search opens from the header box. Sharing, Document, Table, Source and
Data are viewers: they have no launcher tile and are offered under "Other views" (`…`). Several panes keep "lab"
names because the browser skips a new pane that has a built-in pane's name (see NOTES.md).

## Tests

How to run every test: `node verify.mjs | tee verify.log`. The run ends with `EVERY TEST PASSED`. Each pane folder
also has its own `tests/run.mjs`.

## Design

- Design sheet and sample page: http://127.0.0.1:8732/me/public/suite/design/samples.html
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

See [NOTES.md](NOTES.md) for judgement calls, what is unverified, and what must change in the browser and JSS.

## Licence

[AGPL-3.0-or-later](LICENSE), copyright Melvin Carvalho, like the data browser it runs in (`~/ideas/dynamic`). Panes
that were published earlier under MIT (for example poll and notes in solid-panes) stay MIT in those published copies;
the copies here are AGPL. Several apps were written from the data formats of SolidOS panes (MIT); no SolidOS code is
copied. Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as SVG `data:` URIs.
