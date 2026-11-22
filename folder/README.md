# folder (Files)

A dynamic SolidOS pane that shows a folder (a Solid container) as a small file manager. It is built to replace
the built-in folder view; its pane name is `folder-lab` and its tab says **Files**, so it can sit beside the built-in one.

**Try it locally:** in the suite shell, [the sample garden folder](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Ffolder%2Fgarden%2F);
alone, [the same folder](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Ffolder%2Ffolder-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Ffolder%2Fgarden%2F) (run `node tests/setup.mjs` first to put the samples
on the test pod). Log in to see the write tools; try them in
[work/](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Ffolder%2Fwork%2F).

## Suite restyle (phase 2)

- Styled with the suite's design sheet (`--sui-*` tokens and the `fl-` recipes, embedded by `design/embed.mjs`
  between the `suite:design` markers; `node design/embed.mjs folder/folder-pane.js --check` keeps it current).
- Laid out like a familiar file manager: breadcrumbs with a **+ New** pill beside them; a filter box, a
  **Show hidden** switch and a refresh button; a list of rows (icon, name, size, modified, a ⋮ actions button) under
  sortable column names. When the pane is 500 px wide or less the rows collapse to the name with size and date
  under it.
- **+ New** is one menu: Upload files, New folder, then "New, in its own folder" with every pane that can make
  things. Rename and Delete moved into each row's ⋮ menu, with **Details**. The confirm and rename strips are unchanged.
- **Details** (a click on a row, or ⋮ › Details): the file's icon (an image's preview), name, size and date, an
  **Info** tab (kind, size, modified, address) and a **Sharing** tab, which is the Sharing pane
  (`../sharing/sharing-pane.js`, imported when the tab is first opened) drawn for that file.
- **In the suite shell** (`context.suite`): the details are the shell's right column (`renderDetails`; the shell's
  (i) button shows the folder itself), and the left column (`renderNavigation`) has **All files** (the pod's root
  folder) and **Recent** (this folder's files, newest first: the listing already read, nothing more). **Alone** the
  details open under the row and there is no navigation.
- Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), as inline SVG `data:` URIs.

## What it does

- Opens on any address that ends in `/`, and asks to open first there.
- Breadcrumbs up to the pod root (a `pim:Storage` the server marks, else a `pim:storage` in a loaded profile, else the host).
- Lists what is in the folder: folders first, then files, by name. Each has an icon by kind (folder, image, audio, video,
  PDF, linked data, code, text, other), its size and when it last changed, when the listing gives them.
- Sort by name, size or date (press a column name again to reverse; folders stay first). A filter box. An empty-folder message.
- Hidden things (names starting with a dot, and `.acl` / `.meta` files) are left out unless **Show hidden** is ticked.
- A name opens in the data browser in place; it is also a real link, so a middle click opens a new tab.
- If the server's Turtle listing will not parse (JSS lists names with spaces unescaped), it reads the JSON-LD listing instead and says so.
- One column on a phone; no sideways scroll at 400 px.

## What it writes

Only when someone is logged in **and** the server's `WAC-Allow` header says they may write to this folder
(`store.updater.editable` if there is no header). Otherwise the tools are not shown. The whole list:

| When | What it sends |
|---|---|
| **New folder** | `PUT name/` with `If-None-Match: *` (an existing name is refused) |
| **Upload**, or files dropped on the list | `PUT name` per file, its own bytes and content type, with `If-None-Match: *`. If the name exists it asks; **Replace** sends the PUT without the condition |
| **Rename** (files only) | first asks the server (`HEAD`, `Link: rel="acl"`, then `HEAD` that ACL) whether the file has its own sharing rules, and **refuses** if it does, or if rules are left over for the new name; else `GET` the file, `PUT` the bytes under the new name with `If-None-Match: *`, then `DELETE` the old name. Not atomic: if the delete fails, both exist and it says so |
| **Delete** (a file, or an empty folder) | one `DELETE` of that one item, after a second click on a button that names it (the question says when its own sharing rules go too). For a folder it first reads a fresh listing and refuses if anything but the folder's own `.acl`/`.meta` is in it. Then, if the item had its own rules (found from `Link: rel="acl"`, not the listing), one `DELETE` of that ACL, and a `HEAD` to check it is gone; if it is not, it says so in red, since a new item of the same name would get those rules |
| **New …** (a pane from the menu) | whatever that pane's `mintNew` writes, in a new folder named by the person |
| **Sharing** tab in the details | nothing itself: that tab is the Sharing pane, which writes the item's access rules only when the person confirms there (see `../sharing/README.md`) |

Names are checked before anything is sent: no `/` or `\`, no `..`, no leading dot, nothing ending `.acl` or `.meta`,
no spaces or `< > " { } | ^ \` % # ?`. An uploaded file whose name has spaces is saved with dashes, and the message says so.

When the Sharing tab saves, the pane hears its `suite-sharing-change` event and reads the folder's listing again (a GET, straight from the server).

It never deletes a folder's contents, never moves between folders, never copies, and never changes access rules itself.

## The data

The folder's own listing, as any Solid server sends it:

```turtle
<./> a ldp:Container ; ldp:contains <plans/>, <bob-watering.md> .
<plans/> a ldp:Container ; dct:modified "2026-11-21T22:21:00Z" .
<bob-watering.md> posix:size 68 ; dct:modified "2026-11-21T22:21:00Z" .
```

`size`, `modified` and `mtime` (seconds) are matched by local name, so other vocabularies work too.

## New …

The menu lists every registered pane with a `mintNew` (from `context.session.paneRegistry.list`, else
`globalThis.panes.list`), in registry order, leaving out `chat` as upstream does, and the two folder panes since
**New folder** is its own button. It asks for a name, then calls

```js
pane.mintNew(context, { folder, newBase: folder.uri + encodeURIComponent(name) + '/', title: name, pane, noun, div, dom, me, iconEle, noIndexHTML: true })
```

and opens the `newInstance` it returns. A pane that resolves without one has its own messages (written into `div`)
shown. It gives up waiting after 90 seconds. The **File** entry (the source pane) needs a name with an extension.

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/folder/folder-pane.js')).default)
```

## Tests

`node tests/run.mjs` checks the design block is current, resets `suite-data/folder/` on the test pod from `samples/`,
then runs `read.mjs` (logged out, 1300 and a true 400 px: listing, sorting, filter, details and Sharing under a row),
`write.mjs` (logged in, in `work/` only, then a true 400 px), `shell.mjs` (inside the suite shell: navigation,
details column, Sharing tab, the (i) button, Recent, All files, 1300 and a true 400 px) and `bob.mjs` (the second
test user in me's folders: read only). Ports 9511 (me) and 9512 (bob). It must end with `EVERY TEST PASSED`.

## Not done

Moving between folders, recursive delete, copy, zip download, renaming folders, a pod-wide Recent, the header search,
uploading folders, upload progress for big files, keyboard navigation of the list.
