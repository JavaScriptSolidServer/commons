# suite shell

The suite's frame, as a pane (`suite-shell`): a header bar with the app launcher, a search box and the person's avatar
menu, and an app frame with navigation on the left, content in the middle and details on the right. Every address the
data browser shows is drawn inside it by the right app pane.

**Try it** (log in as the test user with the button at the top right):

- The demo shelf (navigation + details): http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fshell%2Fshelf%2Fshelf.ttl
- A note (content only): http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fshell%2Fnotes%2Fwelcome.md
- Your pod's root, in Files: http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2F

## What it does

- **Opens first for every http(s) address** once loaded, and picks the pane to draw it: the one the launcher or
  "Other views" asked for; else a suite pane that asks to open first; else any pane that does; else a suite app pane;
  else the first pane that can show it. Suite panes are ranked by their place in `SUITE_APPS`, not by load order
  (Dashboard before Files at the pod root; Tasks before Boards on a task list). For every `SUITE_APPS` name the shell
  uses the module it imported itself, even if the tool index registered another copy under that name first. The `…` button lists every other pane that can show it ("Other views").
- **Header bar**: the launcher (grid button), the suite's apps as icons on wide screens (the current one underlined),
  the current app's name on mid-size screens, the search box, and the avatar (or "Log in").
- **Launcher**: the suite's apps (Dashboard, Files, Activity, Photos, Contacts, Tasks, Boards, Notes, Pads, Polls,
  Meetings), then "From your tool index": its panes (not a second copy of a suite app) (shown with what is on show, if they can) and its external apps (a link to the
  app for what is on show, in a new tab). An app opens on: the pod root (Dashboard, Files), the person (Profile,
  Settings), or the first instance its classes have in the person's type indexes; with none, an empty state says so.
- **Avatar menu**: name and WebID, Profile (profile editor), Settings, Log out.
- **Search box**: as you type, the app's `search(query)` (if it has one) filters in place; Enter opens an address if
  it is one, else the search page (`suite-search`) on the pod root, with the words kept in the box. While typing,
  the search pane's dropdown shows matches.
  Every change also raises a `suite-search` DOM event.
- **App frame**: the left column comes from the app pane's `renderNavigation`, the right one from `renderDetails`
  when the pane opens it (or the (i) button). Crossing the 900 px breakpoint closes or reopens the drawer. Escape
  goes to a pane's own modal or menu first (the rule is in DESIGN.md). A toast raised before a navigation stays. Under 900 px the navigation is a drawer; under 1100 px the details float
  over the content, and under 600 px take the full width. A pane with neither is shown content-only.
- **Logged out**: a "Log in" button (it presses the browser's own login button); public things still show; apps
  that need the person say "Log in to open …".
- While the browser asks whether to allow a pane (its box above the outline), the shell steps aside so the question
  can be seen.

The contract an app pane follows (`renderNavigation`, `renderDetails`, `search`, `context.suite`) is in
`../design/DESIGN.md`, "The shell and the app-pane contract". `suite-shell-demo-pane.js` is the worked example.

## What it reads and writes

It **never writes** (the tests hash the profile, every settings file and the sample before and after).
It reads: the person's profile (name, photo, `pim:storage`), their preferences file, their public and private type
indexes (`solid:forClass` → `solid:instance` / `solid:instanceContainer`) and their tool index
(`tools:toolIndex` → registrations, as the browser's `toolIndex.js` reads it). It imports the suite's panes listed
in `SUITE_APPS` from next to itself (`../<folder>/<folder>-pane.js`, i.e.
`http://127.0.0.1:8732/me/public/suite/<folder>/<folder>-pane.js` here). It imports a tool-index pane only if its
site is the page's own or one the browser was already told to allow; otherwise it says so and does not run it.

## Files

| File | What |
|---|---|
| `suite-shell-pane.js` | The shell. `SUITE_APPS` at the top is the one list of the suite's apps (and their priority). Its root element carries `suiteApi`, the same object panes get as `context.suite` (for tests and the console). |
| `suite-shell-demo-pane.js` | `suite-shell-demo`: a reading shelf using navigation + details (also works alone). |
| `samples/` | The demo shelf and two notes (fictional people only), copied to `suite-data/shell/` by the tests. |
| `tests/` | `run.mjs` runs everything (see below). |

Demo data format (`samples/shelf/shelf.ttl`):

```turtle
@prefix shelf: <https://example.org/ns/shelf#> .  @prefix schema: <http://schema.org/> .
<#this> a shelf:Shelf ; schema:name "Alice's reading shelf" ; shelf:list <#garden> .
<#garden> schema:name "Garden" ; shelf:item <#soil> .
<#soil> schema:name "Soil First" ; schema:author "Carol Example" ; schema:datePublished "2020" ; schema:description "…" .
```

## Tests

`node tests/run.mjs` (browser port 9501): the design sheet's sample page (1300 and a true 400 px, and that both panes
carry the current design block); `setup.mjs` (sample data onto the pod); `shell.mjs` at 1300 (logs in) and at a
true 400 px (CDP device metrics via `design/viewport.mjs`); `loggedout.mjs` (logs in, logs out from the avatar menu).
Screenshots in `tests/shots/` and `../design/tests/shots/`.

## Not done

- Notifications, a person's own app order, the browser's address bar folded into the header (see NOTES, "Needs a
  decision").
- Photos/Contacts/Tasks/Boards/Pads/Polls/Meetings open only if the person's type indexes point at something; the test
  pod's are empty, so they show their empty state there.

Icons: Material Design Icons (Apache 2.0), https://pictogrammers.com/library/mdi/ . MIT. Copyright (c) 2026 Melvin Carvalho.
