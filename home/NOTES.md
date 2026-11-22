# Notes: home pane

## Judgement calls

1. **Pane name `pod-home`, not `home`.** SolidOS ships a built-in pane called `home`; `userTools.js` skips a pane whose
   name is taken, so a pane named `home` silently never loads. Found by testing. The file and class prefix stay `home`.
2. **Focus only for the owner, on the root folder and on their own WebID.** On their own WebID it opens ahead of the
   profile pane (the brief says it opens on the WebID). Anyone else's WebID: a tab, the profile stays first. If the owner
   would rather see their profile on their own WebID, drop the WebID half of `claim(...) === 'mine'`.
3. **Root detection is sync and uses what is already in the store**: the logged-in user's `pim:storage`, or their
   folder their profile sits in (only when no `pim:storage` is named; changed after review #2, the server root no longer counts), or a folder typed `pim:Storage`. It works because SolidOS has loaded the profile by the time
   panes are asked. Not tested: a server whose root folder says `pim:Storage` (JSS does not), or an owner whose
   profile has not loaded yet (the pane would not be offered until the next visit).
4. **Everything from the subject.** Opened on a WebID it shows that person's home, read-only, whoever is logged in.
   That is what made the fake pods testable, and it also means it shows a visitor whatever the visitor can read.
5. **"Panes and apps" only when the preferences file was read.** When it cannot be read (someone else's pod,
   logged out) nothing is known, so the section is hidden rather than claiming "no tool index".
6. **HTML tools (PodOS `tools:HtmlFragmentInvocation`) are left out**, as `toolIndex.js` does: they do nothing in the
   data browser. Switched-off panes and apps are counted in one line, not listed.
7. **Recently changed includes sub-folders** (e.g. `dinner/`), because a folder's time follows its newest file and
   items two levels down are otherwise invisible. Dot files (`.acl`, `.meta`) are left out. Capped at 24 folder reads.
8. **Instances are not loaded.** A tile shows the class name and the path, not the instance's own title. Loading every
   instance would make the home page as slow as the biggest pod. One fetch per tile, lazily, is the obvious next step.
9. **The test pod's own type indexes are empty** (and `privateTypeIndex.ttl` actually holds JSON-LD). So the "By kind"
   grid is only exercised on the fake pods. Alice's indexes are one `.ttl` and one `.jsonld`, linked from the profile and
   the preferences file respectively, to cover both formats and both places.
10. **Links keep the page's own `?pane=` parameters** (only `uri=` is changed), so following a tile keeps the pane loaded.
    Clicks go through `GotoSubject` in place; modified clicks open a new tab.

## Unverified

- A second person viewing the owner's root folder (one test user).
- A real NSS/CSS pod, a pod at a domain root, and `posix:mtime`-only listings (code path written, not run).
- How it looks with 100+ registrations or folders: the grid just grows; there is no "show more".

## What a fuller shell would need

A home screen is useful the day it is **arranged by the person**, and that needs three things this prototype avoids:

**1. Layout a person can arrange.** Options:
(a) keep it computed, as now, with a few fixed sections; (b) a layout document in the pod (a list of tiles with order and
size, e.g. `<#layout> ui:parts ( <#t1> <#t2> )`, one tile per thing the person pinned), edited by drag and drop;
(c) store the layout in the tool index itself, as extra properties on registrations.
**Recommend (b)**, a separate `home.ttl` linked from the preferences file: it is per person, private, survives a
change of shell, and keeps the tool index (shared with PodOS) free of one client's presentation. Fall back to the
computed view when there is no layout, so a new pod still looks alive.

**2. How tiles map to panes.** Today a tile opens a thing and the data browser picks a pane. A tile should instead say
which tool opens it: the type registration gives the class, the tool index gives `ac:resourceType` per capability, so
the shell can match class → registration and open with that pane (`GotoSubject(node, …, pane)`) or app (URI template).
Options: match automatically (first registration whose `ac:resourceType` equals the class), or let the person pin a
tool per tile in the layout document. **Recommend automatic matching with an override in the layout**, and a tile
that can *be* a pane (render a small summary view, e.g. next meeting, unread chat) only when that pane offers a
"tile" mode; that needs a new, optional pane method (`renderTile`), which should be agreed before anyone builds it.

**3. Relation to a PodOS dashboard.** PodOS builds pages from custom elements (resource, label, picture and similar
elements) and reads the same tool index. Two shells, one index, is fine; two layout formats is not.
Options: (i) this pane stays the SolidOS shell and PodOS has its own; (ii) the shell is written as custom elements that
both can host, and this pane becomes a thin wrapper that renders them; (iii) the home page lives only in PodOS.
**Recommend (i) now, aiming at (ii)**: agree the layout document and the class → tool matching first (data, not code),
so a home arranged in either opens the same in the other. Then, once the tile contract is stable, move the tile
rendering into elements both can load. Building elements first would freeze a UI before the data is settled.

## Next

- Lazy titles for tiles (one fetch each), and "Open with" per tile from the tool index.
- A `home.ttl` layout, read only at first (pins and order), then edited.
- Test against a real NSS/CSS pod with real type indexes.

## Phase 2: restyled as the suite's Dashboard (2026-11-22)

### Judgement calls

1. **Four cards, not three.** The old "Your things" section held two grids (by kind, folders). A dashboard card is one
   short list, so it became two cards, "Your things" and "Folders". Order kept: things, folders, panes and apps, recent.
2. **"More" is "Show all N", in place.** A card shows six rows; extra rows are in the DOM but `hidden`, and a secondary
   button shows them. Nothing new is fetched and nothing is linked away (the obvious "More" target, the pod root, is the
   Dashboard itself for the owner). In the panes card the foot button is "Manage panes and apps" (the old heading link).
3. **No card recipe in the sheet**: built from tokens only (`--sui-bg`, 1 px `--sui-border`, `--sui-radius-lg`,
   `--sui-shadow`, `--sui-space-*`); grid `minmax(min(320px, 100%), 1fr)`. The page background is `--sui-bg-app` on the
   pane's own root (the shell's content column stays white around it; the bar above is white).
4. **Rows use the row recipe** (icon, bold title, muted subline); "Recently changed" puts its time in `row-meta`, so per
   the sheet it is hidden under 520 px (the `<time>` is still there for screen readers and tests).
5. **Initials follow the sheet** (two words): Bob is now "BE", not "B"; the test expectation was updated to match.
6. **Old colour tints are gone**: every icon is MDI in `--sui-primary-element` (row icons) or text colour (card heads).
   "Private" is a neutral `chip`. The pane's own icon is MDI home in `#00679e` (`--sui-primary-element`; an `<img>`
   cannot read a custom property).
7. **Bob's "no tool index"** is the sheet's empty state inside the card (icon, title, one sentence, one button), with
   its margins reduced to fit a card.
8. Selectors in tests changed (`hom-tile`/`hom-title`/`hom-note` collide with the sheet's `title`/`note` recipes, so
   they are `hom-row`, `hom-row-title`, `hom-row-sub`); no behavioural check was removed.

### Testing

- True 400 px with `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`) in `home.mjs 400`, `sample.mjs`
  and `shell.mjs`. Ports 9525 (alone) and 9526 (shell).
- `shell.mjs` opens the shell on the pod root and presses the header's Dashboard button.

### Unverified

- The greeting by time of day is only checked by pattern; the shell and alone use the browser's clock.
- A card with very long names at 400 px: titles ellipsise (row recipe), tested only with the samples.

### Needs a decision

- **Which app owns the pod root in the shell.** Both Dashboard and Files have `start: 'root'` and both claim the root
  folder with `shouldGetFocus`. On one run the shell showed Files at `uri=<root>`, on others Dashboard: the shell picks
  the first focused suite pane in registry order, and this pane's focus also depends on the profile being loaded
  (judgement call 3 above). The shell should decide (e.g. SUITE_APPS order, or "root → Dashboard") rather than a race.
  Needs a change in `shell/suite-shell-pane.js` `choose()`; not made here.
