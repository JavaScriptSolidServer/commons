# The suite's design sheet

Read this before styling anything in the suite. It holds the visual language, how it reaches a pane, the class
recipes, and the contract between the shell and an app pane. Open the living page next to it:
http://127.0.0.1:8732/me/public/suite/design/samples.html

| File | What it is |
|---|---|
| `tokens.css` | Every colour, size, space, radius and shadow, as `--sui-*` custom properties. The only place values live. |
| `recipes.css` | The class recipes for every shared piece, with the placeholder prefix `ui-`. Reads only tokens. |
| `samples.html` | The living page: every piece, drawn from the two files above. |
| `embed.mjs` | Copies tokens + recipes into a pane's CSS string (renaming the prefix) and checks a pane is current. |
| `viewport.mjs` | Test helper: a true 400 px page with CDP device metrics, and a sideways-scroll measure. |
| `tests/samples.mjs` | Checks the sample page at 1300 and a true 400 px, and that the shell's panes carry the current block. |

The look follows Nextcloud's public design guidance (primary blue, light neutral backgrounds, pill buttons and inputs,
44 px targets, 4 px grid, 15 px body type, 8/12 px radii). None of its CSS, HTML, JS, components, icons, name or
logo is used. Icons are Material Design Icons (Apache 2.0) as inline SVG `data:` URIs; credit them in your README.

## The visual language in ten rules

1. **Light theme only.** White content (`--sui-bg`), pale grey-blue navigation (`--sui-bg-app`), hover `--sui-bg-hover`.
2. **Blue means action or place.** The header is `--sui-primary`. Buttons, links, current items and focus use
   `--sui-primary-element` (darker, readable on white) or the pale `--sui-primary-light` with `--sui-primary-light-text`.
3. **One primary button per view** (`ui-btn-primary`): the main thing to do ("New contact", "Save"). Everything else
   is secondary (`ui-btn`, pale blue), tertiary (`ui-btn-tertiary`, plain) or an icon button. Danger only to delete.
4. **Pills.** Buttons, inputs, chips, the header search: `--sui-radius-pill`. Rows, nav items, menu items:
   `--sui-radius` (8). Cards, popovers, modals: `--sui-radius-lg` (12). Tags/small marks: `--sui-radius-sm` (4).
5. **44 px targets.** Every button, nav item, menu item, input, tab and switch is at least `--sui-target` tall
   (the sample test checks this). Chips (28 px) are the only exception, and only as filters or labels.
6. **Type:** system font; body `--sui-text-md` 15 px, small 13, sub-heading 17, heading 20, title 24; bold is 600.
   No italics or capitals for emphasis. Muted text (`--sui-text-muted`) for sublines, dates, captions.
7. **Space on a 4 px grid:** use only `--sui-space-1…12` (4, 8, 12, 16, 20, 24, 32, 48). No raw pixel spacing.
8. **Lists are rows**, not tables or cards: icon or avatar, a bold title, a muted subline, meta on the right
   (dropped under 520 px), actions last. Selecting a row opens the details sidebar.
9. **Empty is a state, not a blank:** a big muted icon in a circle, a title, one sentence, at most one button.
10. **Feedback:** a toast after an action (bottom centre, 4 s), a status line in place while saving, a note
    (`ui-note`) for something that stays true ("Only you can see this").

Do not invent colours, sizes or radii. If the sheet lacks a piece, build it from tokens and say so in your NOTES.

## Tokens (`tokens.css`)

| Group | Tokens |
|---|---|
| Brand | `--sui-primary` #0082c9 (header) · `--sui-primary-element` #00679e (+ `-hover`) · `--sui-primary-text` #fff (on blue) · `--sui-primary-light` #e3eff6 (+ `-hover`) · `--sui-primary-light-text` #00507b |
| Neutrals | `--sui-bg` #fff · `--sui-bg-app` #f5f7f9 · `--sui-bg-hover` #eef1f4 · `--sui-bg-dark` #e3e7eb · `--sui-text` #1f2328 · `--sui-text-muted` #5c6670 · `--sui-border` #e1e5ea · `--sui-border-strong` #8a949e |
| Status | `--sui-error` / `-error-light` · `--sui-warning` / `-warning-light` · `--sui-success` / `-success-light` · `--sui-late` (late or overdue dates) · `--sui-focus` · `--sui-backdrop` |
| Dark surface | `--sui-surface-dark` #16191d · `--sui-surface-dark-text` #f1f3f5 · `--sui-surface-dark-muted` #a7b0b9 (photo and media viewers only) |
| Type | `--sui-font`, `--sui-font-mono`, `--sui-text-sm/md/lg/xl/2xl` (13/15/17/20/24), `--sui-line` 1.5, `--sui-weight` 400, `--sui-weight-bold` 600 |
| Space | `--sui-space-1,2,3,4,5,6,8,12` = 4, 8, 12, 16, 20, 24, 32, 48 px |
| Sizes | `--sui-target` 44 · `--sui-target-sm` 34 · `--sui-icon` 20 · `--sui-avatar` 32 · `--sui-avatar-lg` 64 · `--sui-avatar-xl` 96 · `--sui-header` 50 · `--sui-nav-width` 290 · `--sui-details-width` 380 · `--sui-content-max` 1080 · `--sui-reading-width` 760 (long text) · `--sui-column-width` 290 (a board column) |
| Shape | `--sui-radius-sm` 4 · `--sui-radius` 8 · `--sui-radius-lg` 12 · `--sui-radius-pill` · `--sui-shadow` · `--sui-shadow-lg` · `--sui-ease` |

Text colours pass WCAG AA on their backgrounds: `--sui-text-muted` on white is about 5.9:1,
`--sui-primary-element` on white about 6:1, white on `--sui-primary` about 4.2:1 (so header text is bold 15 px+ or icons only), `--sui-primary-light-text` on `--sui-primary-light` 7.4:1.

## How tokens reach a pane: option (a), with the fallback as one block

**Decision: (a).** The shell declares the tokens on `:root`; every pane reads `var(--sui-…)`; and every pane carries
the same token block as its fallback, written as `:where(:root) { --sui-…: … }`.

How that works: `:where()` has no specificity, so `:where(:root)` (0,0,0) always loses to the shell's `:root`
(0,1,0), whatever order the styles arrive in. Inside the shell the shell's values win; alone in the data browser the
pane's own block applies and it looks the same. A pane's CSS never needs a `var(--x, fallback)` per use.

Why not (b), a build step that inlines tokens: the pane files would become build output that agents and Melvin edit
by hand anyway; a stale build would silently ship old values; and a theme change (say, a person's own accent colour)
could not reach panes at run time. (a) keeps one source file per pane, needs no tooling to run, and lets the shell
re-theme every app in one place. Its cost, a copied block that can drift, is covered by `embed.mjs --check`, which
the coordinator's verify can run over every pane.

`embed.mjs` is an authoring helper, not a build: run it by hand once (and again when the sheet changes); its output is
plain text in your pane, committed like the rest.

### Recipe for a phase-2 agent (copy exactly)

1. Pick your pane's class prefix (your existing one, e.g. `ct` for contacts). Root element:
   `<div class="ct contacts-pane ct-root">` — the two-class width rule stays (`.ct.contacts-pane { … }`), and
   `ct-root` is the base recipe (font, colour, box-sizing, focus ring, and the undoing of the data browser's own
   `header`/`button` styles).
2. Put the two marker lines at the top of your `const CSS` string, then run the tool from the repository root:
   ```js
   const CSS = `
   /* suite:design begin */
   /* suite:design end */
   .ct.contacts-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) }
   `
   ```
   ```sh
   node design/embed.mjs contacts/contacts-pane.js --prefix ct                      # everything
   node design/embed.mjs contacts/contacts-pane.js --prefix ct --only row,buttons,input,avatar,empty,toast,nav,details
   node design/embed.mjs contacts/contacts-pane.js --check                           # in your tests
   ```
   Section names: `base icon header menu launcher nav toolbar row buttons input switch chip avatar empty toast modal
   details fields card board viewer` (`base` is always included). The begin line records your options; a later plain re-run reuses them.
3. Use the classes with your prefix: `ct-btn ct-btn-primary`, `ct-row`, `ct-row-title`… exactly as `samples.html`
   shows them with `ui-`. Your own extra rules go after the end marker and use only `var(--sui-…)` values.
4. Never edit between the markers by hand; never redefine a `--sui-*` token in your own rules.
5. Icons: a span with the icon class and its image in a custom property (the recipe masks it, so it takes the text
   colour):
   ```js
   const svg = (d) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}"/></svg>`)
   function icon (dom, path) {
     const span = dom.createElement('span')
     span.className = 'ct-icon'
     span.setAttribute('aria-hidden', 'true')
     span.style.setProperty('--ct-i', `url("${svg(path)}")`) // --ui-i is renamed to --<prefix>-i
     return span
   }
   ```
   Paths come from Material Design Icons (pictogrammers.com, Apache 2.0); `samples.html` and the shell have a set.
6. Avatars: initials (first letters of up to two words of the name) in `ct-avatar`; a photo as `img.ct-avatar`
   with an `error` handler that swaps back to initials. Only http(s) photo addresses.

## The pieces (`recipes.css`, shown in `samples.html`)

| Piece | Classes (prefix `ui-`) | Notes |
|---|---|---|
| Header bar | `header`, `header-btn`, `header-apps`, `header-app`, `header-spacer`, `header-search` | The shell's. 50 px, primary blue. Current app: `aria-current="page"`. |
| Launcher, menus | `popover`, `launcher`, `launcher-grid`, `launcher-tile`, `launcher-badge` (`alt`), `menu`, `menu-head`, `menu-item`, `caption` | Popovers: absolute, 12 px radius, large shadow. Row-action menus use the same `popover` + `menu`. |
| Navigation | `nav` (alone only), `nav-new`, `nav-list`, `nav-item`, `nav-label`, `nav-count`, `nav-foot`, `caption` | Current: `aria-current="page"`. Labels end in an ellipsis. |
| Toolbar, breadcrumbs | `toolbar`, `crumbs` | Last crumb: `aria-current="page"`. |
| List row | `list`, `row`, `row-icon`, `row-main`, `row-title`, `row-sub`, `row-meta`, `row-actions` | 56 px. Selected: `aria-selected="true"`. Meta hidden under 520 px. |
| Buttons | `btn`, `btn-primary`, `btn-tertiary`, `btn-danger`, `btn-icon`, `btn-wide`, `btns` | Pills, 44 px. Icon buttons need `aria-label`. |
| Input | `field`, `label`, `hint`, `input`, `search` | Pills; textarea 12 px radius. Error: `aria-invalid="true"`. |
| Select | `select` › `select.input` | The wrapper draws the chevron. |
| File input | `label.btn.file` › `input[type=file]` | A button that opens the picker; the input is invisible over it. |
| Checkbox | `checkbox` › `input.check` (`check-round` for a task tick); `row-check` in a list row | 22 px box, 44 px label. |
| Segmented control | `segmented` (`role="group"`) › `segment` (`aria-pressed`) | View switches (list/grid). Scrolls inside itself if too wide. |
| Switch | `switch` | `<label class="ui-switch"><input type="checkbox" role="switch"><span>Text</span></label>` |
| Chip | `chips`, `chip`, `chip-primary/-success/-warning/-error` | A filter chip is a `button` with `aria-pressed`. |
| Avatar | `avatar`, `avatar-lg`, `avatar-xl` | 32 / 64 / 96 px circles (96: a profile or contact header). |
| Field list | `fields` › `field-row` › icon, `field-row-label`, `field-row-value`, `field-row-action` | A contact card, a details panel. |
| Card | `cards` › `card` › `card-head` (icon, `card-title`), body, `card-foot` | Dashboard widgets, Settings and Profile sections. |
| Board | `board` › `column` › `column-head`, `column-card` | Scrolls sideways inside itself, never the page. |
| Viewer | `viewer`, `viewer-muted` | The dark surface for a photo or media viewer; icon buttons inside turn light. |
| Empty state | `empty`, `empty-icon`, `empty-title`, `empty-text` | One button at most. |
| Toast, status | `toasts`, `toast`, `toast-success/-error`, `status`, `status-success/-error`, `note`, `note-success/-warning/-error`; late dates: `late` | In the shell, call `context.suite.toast()` instead of drawing your own. |
| Modal | `backdrop`, `modal`, `modal-head`, `modal-body`, `modal-foot` | `role="dialog" aria-modal="true"`; Cancel first, the action last. Never `alert/confirm/prompt`. Closing on Escape: call `event.preventDefault()` (the shell acts last; see the Escape rule below). |
| Details | `details` (alone only), `details-head`, `details-figure`, `details-titles`, `details-title`, `details-sub`, `tabs`, `tab`, `details-body`, `props` | The head keeps 56 px free on the right for the shell's close button. |
| Text | `root`, `title`, `heading`, `subheading`, `small`, `muted`, `late`, `reading`, `sr` | `sr` = visible to screen readers only; `reading` = the reading width, centred. |

The base reset (in `root`) also undoes the data browser's styling of bare `[role="status"]` and `[role="alert"]`
(a green or red box with margins): inside a pane root a live region is plain until a recipe styles it.

## Widths and breakpoints

- Everything must work at a **true 400 px** with no sideways page scroll.
- Breakpoints (max-width): **1100 px** the details column floats over the content; **900 px** the navigation becomes
  a drawer (toggle in the content bar); **600 px** the details take the full width, the header drops the app name;
  **520 px** row meta is hidden.
- Use `min-width: 0` on flex children that hold text, `overflow-wrap: anywhere` for addresses, and never a fixed
  width wider than 360 px without `max-width: 100%`.

## The shell and the app-pane contract (version 1)

The shell (`shell/suite-shell-pane.js`, pane name `suite-shell`) is loaded by link
(`…/solidos/index.html?pane=<shell>&uri=<anything>`). It opens first for every address and draws it with an app pane
inside its frame: header on top, **navigation** left, **content** middle, **details** right. It loads the suite's
own panes itself (the list `SUITE_APPS` at the top of the shell), so an app pane does not need its own `?pane=`.

### What an app pane gives

```js
const pane = {
  name, icon, label, shouldGetFocus, render,           // unchanged: the ordinary pane contract
  renderNavigation (subject, context) { … },           // optional: the left column, or null for none
  renderDetails (node, context) { … },                 // optional: the right column for one thing, or null
  search (query, context) { … }                        // optional: filter your content as the person types
}
```

1. **`render(subject, context)`** is required and is the content. It must stand alone: in the plain data browser
   there is no shell and no `context.suite`.
2. **`renderNavigation(subject, context)`**, if present, is called **once per showing, right after `render`, with
   the same `context` object**. Return one element (e.g. a `<ul class="xx-nav-list">` of `xx-nav-item`s) or `null`
   for no column. Do not give it a width or background: the shell's column has `--sui-nav-width`, `--sui-bg-app`,
   8 px padding and its own scroll. Mark the current item `aria-current="page"` yourself. It may fill in later (after
   a load); call `context.suite.refreshNavigation()` to have it called again from scratch.
3. **`renderDetails(node, context)`** is called **only when the details column opens**: when you call
   `context.suite.showDetails(node)`, or when the person presses the shell's (i) button, which calls it with the
   subject itself. `node` is whatever you passed (usually a row's thing). Return one element (use the `details-head`,
   `tabs`, `details-body` recipes) or `null` to keep it closed. The shell adds the close button (top right) and
   handles Escape, the narrow-screen overlay and the scrim. Draw synchronously from what is already loaded; load
   more inside the element if needed.
4. **`search(query, context)`**, if present, is called 250 ms after each change in the header's search box (an empty
   string means "clear"). Filter in place. Enter in the box opens an address if it is one, else the pod-wide search
   app (`suite-search`, phase 3) if there is one.
5. A pane with none of the optional methods is shown **content only**: no navigation column or toggle, no (i)
   button. This is the fallback; every pane works in the shell without changes.

### What the shell gives: `context.suite` (absent when not in the shell)

| Member | What it does |
|---|---|
| `version` | `1`. Check `context.suite && context.suite.version >= 1`. |
| `subject` | The thing on show (an rdflib NamedNode). |
| `app` | `{ id, name }` of the suite app being shown, or `null`. |
| `state` | A plain object, **new for each showing**, the same one in `render`, `renderNavigation` and `renderDetails`. Put what they share on it: a load promise, the chosen list, the selection, a `draw()` function. |
| `showDetails(node, { onClose })` | Opens the details column with `pane.renderDetails(node, context)`. `onClose()` is called when it closes or is replaced (clear your row's `aria-selected` there). Returns the element, or null. |
| `closeDetails()` | Closes it. |
| `refreshNavigation()` | Calls `renderNavigation` again and replaces the column. |
| `go(target, { pane })` | Shows another thing in the shell (NamedNode or address); `pane` names the pane to use (e.g. your own name, to stay in your app on a folder another pane would claim). Plain `GotoSubject` from your links works too and stays in the shell. |
| `toast(text, { kind })` | A toast: `kind` `'info'` (default), `'success'` or `'error'` (an error is `role="alert"`). |
| `query` | The search box text. |

The shell also raises a `suite-search` DOM event (bubbles; `detail: { query, submit }`) for anything outside a pane
that wants to listen; cancelling it on submit stops the shell's own Enter handling.

### Rules for a pane inside the shell

- Navigating to another resource re-renders everything (a new `state`). Keep in-app choices that are not
  resources (a filter, a selected list) on `state`, and redraw from shared functions, as the demo does.
- In the shell, open details with `showDetails` instead of drawing them inside the content; alone, draw them in
  place (under the row, or a panel below). Same for navigation: alone, a pane may show it as chips or a list
  above its content (`if (!context.suite) …`).
- Do not use `position: fixed` for anything but a modal; the shell's frame is itself fixed and scrolls its columns.
  A modal's backdrop (z-index 50) covers the shell's frame but not the browser's own top bar.
- **Escape.** The shell acts last: it listens on the document in the bubble phase, and does nothing when the
  event was already handled — `event.defaultPrevented` is true, or propagation was stopped so it never arrives —
  or when the key comes from inside an element with `aria-modal="true"` or `role` `menu`, `listbox` or `dialog`, or
  while any `[aria-modal="true"]` in the content or details column is visible. Otherwise it closes, in order: its
  own open popover, the details column, the navigation drawer (narrow screens). So a pane that closes its own viewer,
  modal or menu on Escape calls `event.preventDefault()` (or `stopPropagation()`), and marks a modal
  `aria-modal="true"`. Listen on your root, or on the document in the capture phase; both run before the shell.
- **Toasts survive navigation:** a `context.suite.toast()` raised just before `go()` is drawn again in the new frame
  for the time it has left.
- Do not set a page-level `max-width` on `html`/`body`, or style anything outside your root.
- Your root keeps its two-class width rule; the shell's content column is the full width between the columns.

### The demo and the fallback

- `shell/suite-shell-demo-pane.js` (`suite-shell-demo`) is a tiny reading shelf using all three methods — the
  shortest complete example: shared `state.loaded` promise, `state.draw()` called from the navigation, a row
  calling `showDetails(book, { onClose })`, and an alone mode with chips and inline details.
- Data (`data/data-pane.js`), Source and Sharing have neither method: they show the content-only fallback.

### Adding an app to the launcher

One place: `SUITE_APPS` at the top of `shell/suite-shell-pane.js`: `{ id, name, folder, pane, icon, start }`, with
the pane at `../<folder>/<folder>-pane.js` next to the shell (or `file:`), `start` = `'root'`, `'webid'`, or a list of
classes looked up in the person's type indexes. `menu: true` puts it in the avatar menu; `viewer: true` loads it
without a tile. The person's tool index adds its panes and apps in a second launcher section (a tool-index copy of a
suite app, e.g. the published notes pane, gets no tile, and the shell always uses its own module for a `SUITE_APPS`
name). **The order of `SUITE_APPS` is the priority** when two suite panes both ask to open first on one thing:
Dashboard before Files at the pod root, Tasks before Boards on a task list.

## Testing

- Load your pane inside the shell: `http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=<your sample>`
  (with `lib.mjs`: `open({ pane: LAB + 'shell/suite-shell-pane.js', … })`; your pane is loaded by the shell if it is in
  `SUITE_APPS`). Test alone too (`pane: LAB + '<you>/<you>-pane.js'`).
- **True 400 px**: the helper's `width: 400` window gives a page about 500 px wide. Use device metrics instead:
  ```js
  import { narrow, wide, measure } from '../../design/viewport.mjs'
  await narrow(page)                    // innerWidth === 400 exactly; media queries follow, no reload
  const m = await measure(page)         // { innerWidth, scrollWidth, sideways, poking: ['.cls@412', …] }
  check('no sideways scroll at 400 px', !m.sideways, m.poking.join(' '))
  ```
  Say in your NOTES that you used `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`).
- `node design/embed.mjs <your-pane.js> --check` in your tests keeps your copy of the sheet current.
- `node design/tests/samples.mjs` checks this sheet itself.

## What changed in sheet v2

Asked for by the phase-2 app agents. Panes pick these up when the design block is re-embedded; the right-hand column
says who should then switch their own raw values to the tokens or classes.

| Added | Adopt in |
|---|---|
| Base reset for bare `[role=status]` / `[role=alert]` (no green or red box) | Polls, Pads (Text), Tasks, Dashboard: drop their own resets |
| `--sui-surface-dark`, `-text`, `-muted` and `ui-viewer` | Photos (its viewer, now built from `--sui-text`) |
| `--sui-reading-width` 760 px and `ui-reading` | Notes (72ch), Document and Pads (content-max × .75) |
| `--sui-column-width` 290 px and `ui-board` / `ui-column` | Boards (uses `--sui-nav-width` for its columns) |
| `ui-note-success` | Settings, Profile, Sharing (confirmations that stay) |
| `--sui-late` and `ui-late` | Tasks (late dates), Boards (overdue cards) |
| `ui-card` family | Dashboard widgets, Settings and Profile section cards |
| `--sui-avatar-xl` 96 px and `ui-avatar-xl` | Profile, Contacts (person header) |
| `ui-fields` / `ui-field-row` | Contacts (card), details panels in Files, Data, Table, Photos |
| `ui-select` | Tasks (priority), Settings, Polls, Meetings, Sharing (access level) |
| `ui-file` | Files and Photos (upload), Profile (photo) |
| `ui-segmented` / `ui-segment` | Photos and Files (grid/list), Activity filters if shown inline, Table/Data view switch |
| `ui-checkbox`, `ui-check`, `ui-check-round`, `ui-row-check` | Tasks (tick in a row), Files (multi-select), Polls |
| The Escape rule on the modal recipe | Every pane with a modal, viewer or menu (Photos, Files, Sharing, Tasks) |

**Re-embedding.** From the repository root, for each pane: `node design/embed.mjs <folder>/<file>-pane.js` (no options:
the begin line remembers each pane's prefix and sections). For example, every pane at once:
`for f in */*-pane.js; do grep -q 'suite:design begin' "$f" && node design/embed.mjs "$f"; done`.
After the sheet changes, `--check` reports STALE for every pane until it is re-embedded: that means only
"re-run embed", nothing else. A pane embedded with `--only` gets the new sections only if it adds them to its list
(`node design/embed.mjs <pane> --prefix xx --only <old list>,card`); the base reset and new tokens reach every pane.
v2 renamed nothing and changed no existing value, so a re-embed cannot break a pane's own rules. (One thing to look
at: a pane that styled a bare `[role=status]` element with a rule of its own class keeps its look; one that relied on
the data browser's green box loses it.)
