# Notes: judgement calls, what is unverified, what next

## Phase 2: the suite restyle (22 Nov 2026)

### Judgement calls

1. **One "+ New" menu, and a ⋮ menu per row.** Upload, New folder and "New …" were three buttons; they are now one
   primary **+ New** pill (Upload files, New folder, then the minting panes under a caption), as a familiar file
   manager has it. Rename and Delete moved from inline buttons into each row's ⋮ menu, with **Details** first (so the
   details are reachable by keyboard; a row is not focusable itself). One ⋮ per row keeps the size and date columns
   aligned. The confirm and rename strips, the questions and every check behind them are unchanged.
2. **Details: Info and Sharing tabs, Info first; Sharing loaded on demand.** The Sharing pane is `import()`ed from
   `new URL('../sharing/sharing-pane.js', import.meta.url)` the first time its tab opens, then its `render(fileNode,
   ctx)` goes in the tab. `ctx` is the details' context **without `suite`**, so Sharing draws as it does alone and its
   state never lands on this pane's `context.suite.state`. If Sharing comes to want `suite.toast`, that is a
   one-line change here.
3. **Messages stay in place, not toasts.** The inline status line (working…, done, refused) is kept in the shell too.
   The data browser redraws the pane (and so the shell) after the force-reload each change makes, which would throw
   away a toast; the status line survives through the per-folder memo, as before. The sheet allows a status line in
   place; this pane uses it for results as well.
- Columns collapse by a **container query at 500 px** of the pane, not the viewport: in the shell at 1300 px with the
  details open the content is about 600 px and keeps its columns; alone at 400 px, or in the shell's phone layout, the
  rows show name with "size · date" under it. The sheet's own 520 px media rule (row meta hidden) agrees with it.
- **Recent** is this folder's files sorted newest first, from the listing already read (no pod-wide walk). **All files**
  goes to the pod root (`pim:Storage` / profile `pim:storage`, else the host's root) and stays in this app
  (`suite.go(root, { pane: 'folder-lab' })`). Alone there is no navigation.
- Image previews (png, jpg, gif, webp, svg, avif, bmp) are fetched with the authenticated fetch and shown from a blob
  URL in an `<img>` (so a private image previews; an SVG cannot run script in an `<img>`).
- Folder names no longer end in "/" in the list (the icon says folder); the row's `data-name` is unchanged.
- File-kind colours are gone (no new colours): folders are `--sui-primary-element`, files `--sui-text-muted`; kinds
  differ by icon shape. PDF uses the MDI file-document icon and text the file-document-lines one.
- Sizes built from tokens, as the sheet has no column widths: size column `calc(var(--sui-space-12) * 2)` (96 px),
  date column `calc(var(--sui-space-8) * 5)` (160 px), the icon column the recipe's 40 px row icon. The New menu is
  placed under its button in JS, clamped to the toolbar's width so it never pokes out at 400 px.
- Two-user test (`bob.mjs`, port 9512): bob reads me's public garden with no write tools, opens details and Sharing,
  and gets nothing from the locked folder. Write tests stay with me.
- **True 400 px**: `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`) in read, write and shell tests. The
  shell test reloads after narrowing, because the shell decides at mount whether its navigation is a drawer.

### After the review (REVIEW.md)

- **Delete takes the item's own ACL with it**, found from `Link: rel="acl"` (else `<item>.acl`), checked with HEAD,
  deleted AFTER the item (never before: a failed item delete would leave the item under its folder's wider rules), and
  checked gone. JSS keeps `x.acl` when `x` is deleted, so before this a new file of the same name was silently shared.
- **Rename refuses** a file with its own rules (asked of the server, not the listing) and a target name with leftover
  rules. Carrying the ACL would mean rewriting its `accessTo` to the new address and PUTting JSON-LD (JSS refuses Turtle
  ACLs): more code on the most dangerous path for a rare case. The message says how to proceed (Sharing › back to the
  folder's rules, then rename).
- **`suite-sharing-change`** (from the Sharing pane, on `document`, as the details sit outside this root in the shell):
  the listing is read again with a direct GET (`readRaw`), not a forced store reload, which would make the data browser
  redraw everything and close the details being worked in.
- Sharing now gets `suite: { version, toast, go, slot: 'details' }` (no `state`), so it toasts in the shell; whether it
  drops its own title on `slot: 'details'` is up to the Sharing pane.
- New menu: no dokieli, one entry per noun (the first pane), capped at nine rows with its own scroll. One module-level
  auth listener. Drops while busy say "wait". Own-rule sizes written from tokens.

### Unverified / weak

- Sharing is being restyled by another agent at the same time; the tests only check its root (`.sharing-lab-pane`)
  appears in the tab, not what it says. Its shape (`default.render(subject, context)`) is all this pane relies on.
- Escape inside an open ⋮ or New menu in the shell: the shell's capture-phase Escape handler runs first and also closes
  the details column if it is open. Not tested.
- Keyboard order inside menus (arrow keys) is not implemented; Tab works.
- The header search (`search(query)` in the contract) is not implemented: the pane has its own filter box.

### Needs a decision

- **Upload / New folder onto a name with leftover rules** (an `x.acl` left by another tool or server) still gets them;
  only Rename checks the target. Checking costs two HEADs per uploaded file; say if wanted.

- **Shell: re-check the navigation drawer on resize.** `fillNavigation` sets the drawer open or closed only at mount
  (`setNav(!!nav && !narrow('900'))`). Narrowing a 1300 px window to 400 px leaves the navigation open over the content.
  A `matchMedia('(max-width: 900px)')` change listener in the shell would fix it for every app.
- **Sheet: a column-width token** (or a "table-like row" recipe) would save each list pane inventing size/date widths.

## Phase 1 notes (the lab pane)

## Found on the way (matters beyond this pane)

- **JSS deletes a non-empty folder recursively.** `DELETE` on a container with files in it returned 204 and the folder and
  everything in it were gone (probed in my own lab folder). The Solid protocol says the server should refuse (409). So the
  only guard is the pane: before deleting a folder it reads a fresh listing straight from the server (not the store's copy)
  and refuses if anything but that folder's own `.acl`/`.meta` is in it. There is still a race: a file added by someone else
  between that check and the DELETE would be deleted too. Only the server can close that.
- **JSS lists names unescaped.** A folder called `Bob's notes` came back in the listing as `<…/Bob's notes/>`; the Turtle
  serializer then dropped `ldp:contains` entirely and rdflib refused the JSON-LD (IRI with a space). One such name makes the
  whole folder unreadable to the built-in folder view. Hence two calls below.
- **The data browser redraws the pane** whenever the folder is force-reloaded, which this pane does after every change. The
  first version lost its messages because of it. Sort, filter, "show hidden" and the last message are now kept per folder
  in a module-level map for 20 seconds, so the redraw carries on. A question waiting for an answer (replace?) is never
  interrupted, because the reload only happens after the whole operation.

## The three judgement calls that matter most

1. **Names with spaces are refused** for new folders, renames and New …, and **uploaded files get dashes** for spaces
   (`my plan.txt` → `my-plan.txt`, said in the message). Also refused: `< > " { } | ^ \` % # ?`. Upstream allows spaces;
   on JSS that breaks the folder for everyone, so I chose safety over fidelity to the file's name.
   If JSS fixes its listing this rule can be relaxed to just the path rules.
2. **Delete is two clicks on the row, the second on a red button that names the item**, and only ever one item. Empty means
   "nothing but its own .acl/.meta" — per the Solid spec those are auxiliary resources, not contents.
3. **Rename refuses** when the target name exists (never replaces), when the file has its own `.acl` (a copy would quietly
   lose those rules, and could make a private file public), and for folders (that would be a recursive copy + delete).

## Other calls

- Write tools need a logged-in user AND `write` in the `WAC-Allow` user modes; `append` alone does not show them
  (delete needs write anyway). Without a header it falls back to `store.updater.editable`.
- Uploads also refuse anything starting with a dot, so a file named `.acl` cannot be dropped in to change access rules.
- "New …" leaves out `chat` (upstream), and `folder` / `folder-lab` (New folder is its own button). Everything else
  in the registry is listed as it is, in registry order, labelled from `mintClass` (rdfs:label, else the local name).
- Breadcrumbs: JSS sends no `pim:Storage` link, so logged out they start at the host; logged in, the profile's
  `pim:storage` makes them start at `me`. Logged out it can also land on `me` when the browser happens to have loaded the
  owner's profile — so the read test only checks the last three crumbs.
- The pane takes focus on every container (`shouldGetFocus`), as the replacement for the built-in view would.
- The menu, questions and confirmations are inline (no `window.prompt`/`confirm`), so they work in tests and at 400 px.
- Folders show no size: JSS gives every folder 4096 (the directory inode), which means nothing to a person.

## Unverified

- A second person (shared folder, append-only access): there is one test user. The `locked/` folder (owner may only read,
  by its own `.acl`) shows the read-only case works for the owner.
- A server that does send `pim:Storage` (CSS, NSS): the breadcrumb code checks `Link` headers but has not met one.
- Big uploads: each file is one PUT of the whole body, no progress bar, no chunking.
- `posix:mtime` (seconds) is handled but JSS only sends `dct:modified`.
- New … was exercised with the Notepad pane only; the others are called the same way and their failures are reported,
  but I did not create a tracker, meeting, etc. The source ("File") pane calls `alert()` itself on a bad extension; the
  pane checks the extension first so that should not fire.
- Drag and drop is tested with synthetic `DragEvent`s carrying a real `DataTransfer`, not a real mouse drag.

## Next, if this goes on

- Ask JSS to answer 409 to a DELETE on a non-empty container and to escape names in listings; then relax the name rule.
- Rename for folders (recursive copy with a check pass first), move, copy.
- Keyboard: arrow keys through the list, Delete key to arm the confirm.
- Listen for the server's live updates (`Updates-Via`) instead of reloading after each change.
