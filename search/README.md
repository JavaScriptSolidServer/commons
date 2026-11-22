# Search (`suite-search`)

Find files and folders by name across your pod, from the search box in the suite's header. Results drop down
under the box as you type, grouped: **Folders** first, then by app type (**Photos**, **Notes**, **Documents**,
**Tables**, **Contacts**, **Data**, **Code**, **Other files**). Each row shows an icon, the name with the matching
part marked, and the folder it is in. Five rows per group, then **Show more**.

Keyboard: **Down** and **Up** move through the results (the focus stays in the box), **Enter** opens the highlighted
one inside the shell, **Escape** closes the dropdown and keeps what you typed. Enter with nothing highlighted is
the shell's: an address opens, anything else opens the search page on your pod root with the words kept.

Alone (without the shell) it is a search page for a folder: open any folder with this pane and search inside it.

## How it searches, and its limits

There is no search index on a Solid pod, so this walks the folders in your browser:

- It reads folder listings (`ldp:contains`) breadth first, level by level, starting at your **pod root**
  (`pim:storage` in your profile, else the folder above your profile's folder, or the host root for a profile at
  the host root; if no address can be made, the dropdown says so instead of searching). On a search page it starts at
  that folder.
- **Limits: at most 300 folders are read, and none more than 8 levels below the start.** A folder past either limit
  is still found by its own name (it is in its parent's listing); what is inside it is not. The dropdown says when a
  limit was reached and how many folders could not be read.
- The walk happens once per page and person and is kept: later searches answer at once, without reading again.
  The status line says when it ran, with **Search again**; a kept walk older than 5 minutes is done again when a
  new search starts. "Nothing found" says it is the answer from that time.
- Names are decoded (`Quince%20photos` is "Quince photos", `caf%C3%A9` is "café") and matched anywhere in the
  name, ignoring upper and lower case. Names that start with what you typed come first, then shallower ones.
- Names starting with a dot (`.acl`, `.meta`, `.well-known`) are skipped.
- A listing that does not answer within 20 s counts as unreadable, so a walk always ends.
- Six listings are read at a time. On the test pod 300 folders take about 0.6 s.

## What it reads, what it writes

Reads: your profile (to find the pod root) and folder listings, with plain GETs (`Accept: text/turtle`). The
listings are parsed into a private graph, not the shared store.

**It never writes anything.**

## JSS behaviour it allows for

- A folder holding `index.html` answers with that page even when asked for Turtle, so it cannot be looked into;
  it counts as read and empty (found by its own name only).
- A name with apostrophes garbles the folder's listing (`jss-findings/REPORT.md`, 3b): that folder counts as
  "could not be read" and the walk carries on.
- Spaces in names are listed as `%20` on JSS 0.0.231 (REPORT 3, fixed); older servers may break that folder.

## In the shell

The shell loads this file the first time someone types in the header box (`import()` of
`../search/search-pane.js`) and calls `pane.headerSearch({ input, form, context, suite })`, which returns
`{ query(text) }`; the shell calls `query` 250 ms after each change. Result links are http(s) only, with `rel="noopener"`. Results open with `context.suite.go(uri)`, so
the shell picks the app. Logged out, the dropdown asks you to log in (nothing is walked).

The pane also has `search(query, context)` from the shell contract, so if the shell ever shows the search page
itself, the header box filters it in place (and no dropdown opens on top).

## Try it

- In the shell: http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsearch%2F
  — log in, type `quince` in the header box.
- Alone: http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fsearch%2Fsearch-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsearch%2F

Sample data: `samples/orchard/` (copied to `suite-data/search/` by `tests/setup.mjs`, which also makes `deep/`, a
chain ten folders deep, and `many/`, 320 folders, to test the two limits).

## Tests

`node tests/run.mjs` (needs the test pod): the file itself, the sample data, the header dropdown at 1300 px and a
true 400 px (`design/viewport.mjs`), the search page alone with both limits, and logged out.

## Not done

- No search inside file contents, only names; no filters (type, date) in the dropdown.
- No live refresh of the cached walk (only "Search again" and the 5-minute rule); no way to search past the limits except a search page on a deeper folder.
- Results from a second person's pod, or folders shared with you elsewhere, are not searched.

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), as inline SVG `data:` URIs.
MIT. Copyright (c) 2026 Melvin Carvalho.
