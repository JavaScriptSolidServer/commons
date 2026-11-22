# home

A dynamic SolidOS pane: a home screen for a pod. The page a person lands on for their own pod, putting
together what is in it, the panes and apps they use, and what changed lately. In the suite it is the **Dashboard** app.

**In the suite shell** (log in, then the Dashboard button in the header):
http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2F

**Try it** (log in as the test user; the root of your pod opens on it):
http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fhome%2Fhome-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2F

A fuller sample pod (Alice, made up), no login needed. On someone else's WebID the profile opens first:
press the house icon among the pane icons to see her home.
http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fhome%2Fhome-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fhome%2Falice%2Fprofile%2Fcard.ttl%23me

(`node tests/setup.mjs` puts the samples on the pod first.)

## Look (phase 2)

Laid out like a familiar dashboard: a centred greeting ("Good morning, <name>"; on someone else's, the name and
"A pod home · read-only"), the avatar above it and the WebID and pod below, then a responsive grid of rounded widget
cards on the pale page background. Each card has an icon and a title, a short list of rows (at most six; a
"Show all N" button shows the rest in place) and a foot. Content only: no navigation or details column in the shell.
Styled with the suite design sheet (`design/`, prefix `hom`: tokens, icon, row, buttons, chip, avatar, empty, toast);
the card itself is built from tokens (`--sui-bg`, `--sui-border`, `--sui-radius-lg`, `--sui-shadow`).
Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as `data:` URIs.

## What it does

- **Greeting:** the person's name and photo from their profile (`foaf:name` / `vcard:fn` / `schema:name`;
  `foaf:img` / `vcard:hasPhoto` / `schema:image`), their WebID and their pod. No photo: their initial.
- **Your things** (a card): a row for each registration in their type indexes (`solid:forClass` with `solid:instance` or
  `solid:instanceContainer`), with a friendly name for the class (Address book, Notes, Chat, Meeting, Tracker,
  Poll, Bookmarks, …; otherwise the class's local name, "PlantCollection" → "Plant collection"). Entries from the
  private type index carry a *private* chip.
- **Folders** (a card): a row for each top-level folder, with how many items it holds.
- **Your panes and apps** (a card): the panes and apps switched on in the tool index, and one link, *Manage panes and apps*,
  (the card's foot button) that opens the tool index in the data browser (where the tool-index dashboard pane takes over). Switched-off
  entries are counted in one line. PodOS HTML tools are left out (the data browser does not load them). No tool
  index: an empty state with a button to the Tools app.
- **Recently changed** (a card): the six newest items in the pod's root and its top-level folders, from `dct:modified` (or
  `posix:mtime`) in the folder listings.
- Every row and link opens in the data browser, in place. A card with nothing to show is not shown.

## When it opens

| Opened on | Logged in as its owner | Logged in as someone else | Logged out |
|---|---|---|---|
| The pod's root folder (the container their profile names with `pim:storage`; only if it names none, the folder their profile sits in — never the server root by itself) | opens first | a "Home" tab only if the folder says it is a `pim:Storage` | not offered: the folder view as usual |
| A WebID (a profile with `pim:storage`, a type index, a preferences file or an OIDC issuer) | opens first | a "Home" tab | a "Home" tab |

The pane's `name` is `pod-home`: SolidOS already has a built-in pane named `home`, and a second pane with the
same name is ignored.

## What it reads

Everything is found by following links from the subject it is opened on, never from guessed file names, and
never from the logged-in user unless the subject is their own root folder:

```turtle
# profile                                  # preferences file
<#me> pim:storage <../> ;                  <../profile/card.ttl#me>
  pim:preferencesFile <../settings/prefs.ttl> ;   solid:privateTypeIndex <privateTypeIndex.jsonld> ;
  solid:publicTypeIndex <../settings/publicTypeIndex.ttl> .   tools:toolIndex <tools.jsonld> .

# a type index (Turtle or JSON-LD)
<#contacts> solid:forClass vcard:AddressBook ; solid:instance <../contacts/index.ttl#this> .
<#notes> solid:forClass <http://www.w3.org/ns/iana/media-types/text/markdown#Resource> ; solid:instanceContainer <../notes/> .

# the tool index (https://pod-os.org/vocab/tools): on = linked with tools:registration
<> a tools:ToolIndex ; tools:registration <#notes> .
<#notes> schema:name "Notes reader" ; ac:capability [ ac:invocation [ a panes:PaneModuleInvocation ; schema:url "…" ] ] .
```

Type index links are taken from both the profile and the preferences file, from any subject in them (pods in the
wild put them on the WebID or on the preferences file itself). Folder listings are read for the root and up to 24
top-level folders.

## What it writes

Nothing. It never writes to a pod.

## Tests

`node tests/run.mjs` (ends with `EVERY TEST PASSED`; browser ports 9525 and 9526):

- First, the design block is checked (`design/embed.mjs --check`).
- `setup.mjs` copies `samples/` (Alice: full pod; Bob: nearly empty) to `suite-data/home/` and fixes their file times.
- `home.mjs` logs in: the root opens on the pane; folders, tool index, manage link, recent order; a row navigates;
  the own WebID opens on it; a reload reads back the same; the profile and settings files are byte-for-byte unchanged;
  `home.mjs 400` the layout at a true 400 px (`design/viewport.mjs`).
- `shell.mjs` the Dashboard inside the suite shell: content only, greeting and cards, a row opens its folder in the shell, no sideways scroll at 1300 and a true 400 px.
- `sample.mjs` logged out, at 1300 and a true 400 px: Alice's and Bob's homes in full (centred greeting, a card per section, "Show all"); the root folder logged out is left alone.

## Not done

- A second, real person's view of someone else's root folder: there is one test user.
- Rows do not open things with the person's chosen pane or app; they open the thing and the data browser picks.
- Nothing can be arranged, pinned or hidden. See NOTES.md for what a fuller shell would need.
- Instances are not loaded, so a row shows the file's path, not its title.
