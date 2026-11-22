// search-pane.js: the suite's Search. Finds files and folders by name across the pod's folders, client side.
//
// Two ways in:
//  - In the shell's header box: the shell loads this file with import() the first time someone types, and calls
//    pane.headerSearch({ input, form, context, suite }). A dropdown opens under the box with grouped results
//    (Folders, then by app type), keyboard up/down/Enter, "Show more" per group; Escape closes it.
//  - Alone, as an ordinary pane (name suite-search): a search page for a folder, searching inside that folder.
//
// How it searches: a breadth-first walk of folder listings (ldp:contains), level by level, from the pod root (header)
// or the folder on show (page). At most LIMITS.containers listings are fetched and none deeper than LIMITS.depth
// below the start; names are decoded and matched case-insensitively. The walk is kept for the rest of the page's
// life (one per person and start folder), so later searches are instant. It never writes anything.
// One file, no imports. Icons: Material Design Icons (Apache 2.0). MIT. Copyright (c) 2026 Melvin Carvalho.

const NAME = 'suite-search'
const LIMITS = Object.freeze({ containers: 300, depth: 8, parallel: 6 })
const PER_GROUP = 5 // rows per group before "Show more"
const MORE = 25 // rows added by each "Show more"

const LDP = 'http://www.w3.org/ns/ldp#'
const PIM = 'http://www.w3.org/ns/pim/space#'

// ---- icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box ------------------------------------------
const MDI = {
  search: 'M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z',
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
  image: 'M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z',
  notes: 'M14,10H19.5L14,4.5V10M5,3H15L21,9V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3M5,12V14H19V12H5M5,16V18H14V16H5Z',
  document: 'M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z',
  table: 'M5,4H19A2,2 0 0,1 21,6V18A2,2 0 0,1 19,20H5A2,2 0 0,1 3,18V6A2,2 0 0,1 5,4M5,8V12H11V8H5M13,8V12H19V8H13M5,14V18H11V14H5M13,14V18H19V14H13Z',
  data: 'M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z',
  code: 'M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z',
  contacts: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z',
  file: 'M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6Z',
  login: 'M10,17V14H3V10H10V7L15,12L10,17M10,2H19A2,2 0 0,1 21,4V20A2,2 0 0,1 19,22H10A2,2 0 0,1 8,20V18H10V20H19V4H10V6H8V4A2,2 0 0,1 10,2Z',
  chevron: 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z'
}
const svgUri = (path, fill = '#000') => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="${path}"/></svg>`)

// The groups, in the order they are shown. A file goes in the first group whose extensions it has.
const GROUPS = [
  { id: 'folders', name: 'Folders', icon: 'folder' },
  { id: 'photos', name: 'Photos', icon: 'image', ext: 'png jpg jpeg gif webp svg avif bmp heic tif tiff' },
  { id: 'notes', name: 'Notes', icon: 'notes', ext: 'md markdown' },
  { id: 'documents', name: 'Documents', icon: 'document', ext: 'pdf txt html htm odt doc docx rtf log epub' },
  { id: 'tables', name: 'Tables', icon: 'table', ext: 'csv tsv ods xls xlsx' },
  { id: 'contacts', name: 'Contacts', icon: 'contacts', ext: 'vcf' },
  { id: 'data', name: 'Data', icon: 'data', ext: 'ttl jsonld json n3 nt nq trig rdf owl' },
  { id: 'code', name: 'Code', icon: 'code', ext: 'js mjs cjs ts css sh py' },
  { id: 'files', name: 'Other files', icon: 'file' }
]
const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : '' }
const groupOf = (item) => {
  if (item.folder) return 'folders'
  const ext = extOf(item.name)
  const g = GROUPS.find(g => g.ext && ext && g.ext.split(' ').includes(ext))
  return g ? g.id : 'files'
}

// ---- CSS: the design sheet (design/embed.mjs), then this pane's own rules -----------------------------------
const CSS = `
/* suite:design begin --prefix se --only icon,menu,row,buttons,input,empty,toast */
:where(:root) {
  --sui-primary: #0082c9;
  --sui-primary-element: #00679e;
  --sui-primary-element-hover: #00557f;
  --sui-primary-text: #ffffff;
  --sui-primary-light: #e3eff6;
  --sui-primary-light-hover: #d2e5f0;
  --sui-primary-light-text: #00507b;
  --sui-bg: #ffffff;
  --sui-bg-app: #f5f7f9;
  --sui-bg-hover: #eef1f4;
  --sui-bg-dark: #e3e7eb;
  --sui-text: #1f2328;
  --sui-text-muted: #5c6670;
  --sui-border: #e1e5ea;
  --sui-border-strong: #8a949e;
  --sui-error: #c62828;
  --sui-error-light: #fdecea;
  --sui-warning: #8a5a00;
  --sui-warning-light: #fff3d6;
  --sui-success: #237a38;
  --sui-success-light: #e6f4e9;
  --sui-late: #c62828;
  --sui-surface-dark: #16191d;
  --sui-surface-dark-text: #f1f3f5;
  --sui-surface-dark-muted: #a7b0b9;
  --sui-focus: #0082c9;
  --sui-backdrop: rgba(18, 24, 31, .45);
  --sui-font: system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", "Helvetica Neue", Arial, sans-serif;
  --sui-font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
  --sui-text-sm: 13px;
  --sui-text-md: 15px;
  --sui-text-lg: 17px;
  --sui-text-xl: 20px;
  --sui-text-2xl: 24px;
  --sui-line: 1.5;
  --sui-weight: 400;
  --sui-weight-bold: 600;
  --sui-space-1: 4px;
  --sui-space-2: 8px;
  --sui-space-3: 12px;
  --sui-space-4: 16px;
  --sui-space-5: 20px;
  --sui-space-6: 24px;
  --sui-space-8: 32px;
  --sui-space-12: 48px;
  --sui-target: 44px;
  --sui-target-sm: 34px;
  --sui-icon: 20px;
  --sui-avatar: 32px;
  --sui-avatar-lg: 64px;
  --sui-avatar-xl: 96px;
  --sui-header: 50px;
  --sui-nav-width: 290px;
  --sui-details-width: 380px;
  --sui-content-max: 1080px;
  --sui-reading-width: 760px;
  --sui-column-width: 290px;
  --sui-radius-sm: 4px;
  --sui-radius: 8px;
  --sui-radius-lg: 12px;
  --sui-radius-pill: 999px;
  --sui-shadow: 0 1px 3px rgba(16, 24, 40, .12);
  --sui-shadow-lg: 0 8px 28px rgba(16, 24, 40, .18);
  --sui-ease: .15s ease;
}
/* ---- base: put this on a pane's root ---------------------------------------------------------------- */
.se-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.se-root *, .se-root *::before, .se-root *::after { box-sizing: border-box }
.se-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.se-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.se-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.se-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.se-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.se-root [hidden] { display: none !important }
.se-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.se-muted { color: var(--sui-text-muted) }
.se-small { font-size: var(--sui-text-sm) }
.se-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.se-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.se-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.se-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.se-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.se-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --se-i set to url("data:image/svg+xml,...") ---------------------------------- */
.se-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--se-i) center / contain no-repeat; mask: var(--se-i) center / contain no-repeat }
/* ---- menu: popover menu (avatar menu, row actions) ------------------------------------------------------------ */
.se-popover { position: absolute; z-index: 40; min-width: 220px; max-width: calc(100vw - 16px); padding: var(--sui-space-1); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-text); box-shadow: var(--sui-shadow-lg); border: 1px solid var(--sui-border) }
.se-menu { margin: 0; padding: 0; list-style: none }
.se-menu-head { display: flex; align-items: center; gap: var(--sui-space-3); padding: var(--sui-space-2) var(--sui-space-3) var(--sui-space-3); border-bottom: 1px solid var(--sui-border); margin-bottom: var(--sui-space-1); min-width: 0 }
.se-menu-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.se-menu-item:hover, .se-menu-item:focus-visible { background: var(--sui-bg-hover); outline: none }
.se-menu-item .se-icon { color: var(--sui-text-muted) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.se-list { margin: 0; padding: 0; list-style: none }
.se-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.se-row:hover { background: var(--sui-bg-hover) }
.se-row[aria-selected="true"], .se-row[aria-current="true"] { background: var(--sui-primary-light) }
.se-row-main { flex: 1 1 auto; min-width: 0 }
.se-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.se-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.se-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.se-row-actions { flex: none; display: flex; align-items: center }
.se-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.se-row-icon .se-icon { width: 28px; height: 28px }
.se-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .se-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.se-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.se-btn:hover { background: var(--sui-primary-light-hover) }
.se-btn:disabled, .se-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.se-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.se-btn-primary:hover { background: var(--sui-primary-element-hover) }
.se-btn-tertiary { background: transparent; color: var(--sui-text) }
.se-btn-tertiary:hover { background: var(--sui-bg-hover) }
.se-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.se-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.se-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.se-btn-icon:hover { background: var(--sui-bg-hover) }
.se-btn-wide { width: 100%; justify-content: flex-start }
.se-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.se-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.se-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.se-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.se-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.se-input:hover { border-color: var(--sui-primary-element) }
.se-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.se-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.se-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.se-search { position: relative; display: flex; align-items: center; min-width: 0 }
.se-search .se-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.se-search .se-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.se-select { position: relative; display: block; min-width: 0 }
.se-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.se-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.se-file { position: relative; overflow: hidden }
.se-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.se-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .se-row-check */
.se-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.se-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.se-check-round { border-radius: 50% }
.se-check:hover { border-color: var(--sui-primary-element) }
.se-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.se-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.se-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.se-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.se-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.se-segment:hover { background: var(--sui-bg-hover) }
.se-segment[aria-pressed="true"], .se-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.se-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.se-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.se-empty-icon .se-icon { width: 48px; height: 48px }
.se-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.se-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.se-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.se-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.se-toast-error { border-left-color: var(--sui-error) }
.se-toast-success { border-left-color: var(--sui-success) }
.se-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.se-status-error { color: var(--sui-error) }
.se-status-success { color: var(--sui-success) }
.se-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.se-note-error { background: var(--sui-error-light) }
.se-note-warning { background: var(--sui-warning-light) }
.se-note-success { background: var(--sui-success-light) }
/* suite:design end */
.se.suite-search-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) }
.se-page-head { display: flex; flex-direction: column; gap: var(--sui-space-1); margin-bottom: var(--sui-space-4); min-width: 0 }
.se-page-head .se-muted { overflow-wrap: anywhere }
.se-page .se-search { max-width: 560px }
.se-page .se-status { margin: var(--sui-space-2) 0 var(--sui-space-2) var(--sui-space-2) }
.se-results { min-width: 0 }
.se-group { margin-top: var(--sui-space-2) }
.se-group:first-child { margin-top: 0 }
.se-group-head { display: flex; align-items: baseline; gap: var(--sui-space-2) }
.se-group-count { color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.se-row { outline-offset: -2px }
.se-row[aria-selected="true"] { background: var(--sui-primary-light) }
.se-hit { background: transparent; color: var(--sui-primary-element); font-weight: var(--sui-weight-bold); text-decoration: underline; text-underline-offset: 2px }
.se-more { width: 100%; justify-content: flex-start; gap: var(--sui-space-3); padding: 0 var(--sui-space-3); color: var(--sui-primary-element) }
.se-more[aria-selected="true"] { background: var(--sui-primary-light) }
.se-more .se-icon { margin: 0 var(--sui-space-2) }
.se-quiet { padding: var(--sui-space-4) var(--sui-space-3); color: var(--sui-text-muted); overflow-wrap: anywhere }
.se-quiet b { color: var(--sui-text) }
.se-drop { top: calc(var(--sui-header) - 2px); right: var(--se-right, var(--sui-space-1)); width: 440px; max-height: min(560px, calc(100vh - var(--app-header-height, 0px) - var(--sui-header) - var(--sui-space-6))); padding: var(--sui-space-2); overflow: auto; overscroll-behavior: contain }
.se-status { flex-wrap: wrap }
.se-status-text { flex: 1 1 12em; min-width: 0 }
.se-again { padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); color: var(--sui-primary-element) }
.se-drop .se-status { padding: 0 var(--sui-space-3); border-top: 1px solid var(--sui-border); margin-top: var(--sui-space-2); padding-top: var(--sui-space-1) }
@media (max-width: 600px) { .se-drop { left: var(--sui-space-2); right: var(--sui-space-2); width: auto } }
`

// ---- small helpers ------------------------------------------------------------------------------------------
function el (dom, tag, className, text, attrs) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = text
  if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v === true) node.setAttribute(k, ''); else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, String(v)) }
  return node
}
function icon (dom, name) {
  const span = el(dom, 'span', 'se-icon', null, { 'aria-hidden': 'true' })
  span.style.setProperty('--se-i', `url("${svgUri(MDI[name] || MDI.file)}")`)
  return span
}
const decode = (s) => { try { return decodeURIComponent(s) } catch { return s } }
const norm = (s) => String(s).normalize('NFC').toLocaleLowerCase()
const httpOnly = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '' } catch { return '' } }
const isFolder = (uri) => /\/$/.test(uri)
const lastName = (uri) => decode(uri.replace(/\/$/, '').split('/').pop() || uri).normalize('NFC')
const parentOf = (uri) => uri.replace(/\/$/, '').replace(/[^/]*$/, '')
let ids = 0

function currentUser (context) {
  const places = [
    context && context.session && context.session.logic && context.session.logic.authn,
    globalThis.SolidLogic && globalThis.SolidLogic.authn,
    globalThis.UI && globalThis.UI.authn
  ]
  for (const authn of places) {
    try { const me = authn && authn.currentUser && authn.currentUser(); if (me) return me } catch { /* try the next */ }
  }
  return null
}

// The person's pod root: pim:storage in the profile, else the folder above the profile's folder
// (/me/profile/card → /me/, /profile/card → /, a profile at the host root → /). '' when there is no http(s) answer.
// Never throws.
async function podRoot (store, me) {
  let doc = ''
  try { doc = me.doc().uri } catch { return '' }
  try { await store.fetcher.load(me.doc()) } catch { /* use what is there */ }
  try {
    const storage = store.any(me, store.sym(PIM + 'storage'), null, me.doc()) || store.any(me, store.sym(PIM + 'storage'))
    const given = httpOnly(storage && storage.value)
    if (given) return given
  } catch { /* fall back below */ }
  try { return httpOnly(new URL('../', doc).href) } catch { /* not an address */ }
  try { return httpOnly(new URL('/', doc).href) } catch { return '' }
}

// ---- the walk: one per person and start folder, kept for the page's life -----------------------------------------
const walks = new Map()
const STALE = 5 * 60 * 1000 // a kept walk older than this is done again when a new search starts

// fresh: true walks again even if a walk is kept (the "Search again" button, or a stale walk).
function walkFrom (root, fetchFn, who, { fresh = false } = {}) {
  const key = (who || 'anyone') + ' ' + root
  let w = walks.get(key)
  if (w && !fresh) return w
  w = { root, items: [], fetched: 0, unreadable: 0, capped: false, tooDeep: false, done: false, started: Date.now(), finished: 0, listeners: new Set() }
  walks.set(key, w)
  let queued = false
  const changed = (now) => {
    if (now) { queued = false; for (const f of [...w.listeners]) { try { f() } catch (error) { console.warn('[search]', error) } } return }
    if (queued) return
    queued = true
    setTimeout(() => { if (queued) changed(true) }, 150)
  }
  w.promise = (async () => {
    let level = [root]
    let depth = 0
    while (level.length) {
      const room = LIMITS.containers - w.fetched
      if (room <= 0) { w.capped = true; break }
      if (level.length > room) w.capped = true
      const batch = level.slice(0, room)
      const lists = new Array(batch.length)
      let next = 0
      const worker = async () => {
        while (next < batch.length) {
          const k = next++
          w.fetched++
          const children = await listing(batch[k], fetchFn)
          lists[k] = children || []
          if (!children) w.unreadable++
          for (const uri of lists[k]) w.items.push({ uri, name: lastName(uri), folder: isFolder(uri), parent: batch[k], depth: depth + 1 })
          changed()
        }
      }
      await Promise.all(Array.from({ length: Math.min(LIMITS.parallel, batch.length) }, worker))
      depth++
      // The next level, in listing order, so the same pod always gives the same folders within the cap.
      const folders = lists.flat().filter(isFolder)
      if (folders.length && depth > LIMITS.depth) { w.tooDeep = true; break } // depth: how far down these folders are
      level = folders
    }
    w.done = true
    w.finished = Date.now()
    changed(true)
  })()
  return w
}

// One folder's children (addresses), or null when it cannot be read. Read-only GET with a short Accept.
// A listing that has not answered (headers and body) within LISTING_WAIT counts as unreadable, so a stalled request
// (say, a session whose token refresh hangs) cannot keep the walk, and its "Searching…", going for ever.
const LISTING_WAIT = 20000
async function listing (uri, fetchFn) {
  let timer
  const late = new Promise(resolve => { timer = setTimeout(() => resolve(null), LISTING_WAIT) })
  try { return await Promise.race([readListing(uri, fetchFn), late]) } finally { clearTimeout(timer) }
}
async function readListing (uri, fetchFn) {
  try {
    const res = await fetchFn(uri, { headers: { Accept: 'text/turtle' } })
    if (!res.ok) return null
    // A folder holding index.html answers with that page, not its listing (JSS): nothing to walk into.
    if (!/turtle/i.test(res.headers.get('content-type') || '')) return []
    const text = await res.text()
    const $rdf = globalThis.$rdf
    const g = $rdf.graph()
    $rdf.parse(text, g, uri, 'text/turtle') // a garbled listing (an apostrophe in a name, REPORT 3b) throws: unreadable
    const out = []
    for (const node of g.each(g.sym(uri), g.sym(LDP + 'contains'))) {
      const child = node.value
      if (node.termType !== 'NamedNode' || !child.startsWith(uri) || child === uri) continue
      if (/^\./.test(lastName(child))) continue // .acl, .meta, .well-known: not the person's files
      out.push(child)
    }
    return out.sort()
  } catch { return null }
}

// The matches, best first: names that start with the words, then shallower, then by name.
function matches (w, query) {
  const q = norm(query.trim())
  if (!q) return []
  const out = []
  for (const it of w.items) { const n = norm(it.name); const at = n.indexOf(q); if (at >= 0) out.push({ it, at }) }
  out.sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) || a.it.depth - b.it.depth || a.it.name.localeCompare(b.it.name))
  return out.map(x => x.it)
}

// Where a thing lives: a path from the walk's start, decoded. From the pod root it reads like a path on the pod
// ("/public/photos", "/" for the top); on a search page it starts with that folder's name ("photos/2024").
function folderPath (w, item, top) {
  const p = item.parent.startsWith(w.root) ? item.parent.slice(w.root.length) : item.parent
  const parts = p.split('/').filter(Boolean).map(decode)
  return top ? [top, ...parts].join('/') : '/' + parts.join('/')
}

const stale = (w) => !!w && w.done && Date.now() - w.finished > STALE
const clock = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }

function statusText (w) {
  if (!w.done) return `Searching… ${w.fetched} folder${w.fetched === 1 ? '' : 's'} so far`
  const parts = [`Searched ${w.fetched} folder${w.fetched === 1 ? '' : 's'} at ${clock(w.finished)}.`]
  if (w.capped) parts.push(`That is the limit (${LIMITS.containers}), so some folders were not searched.`)
  if (w.tooDeep) parts.push(`Folders more than ${LIMITS.depth} levels down were not searched.`)
  if (w.unreadable) parts.push(`${w.unreadable} could not be read.`)
  return parts.join(' ')
}

// ---- drawing the results: shared by the dropdown and the page --------------------------------------------------
// view: { dom, w, query, shown: Map(group → rows shown), open(uri), redraw(), idBase }
function drawResults (view, box) {
  const { dom, w } = view
  box.replaceChildren()
  const found = matches(w, view.query)
  if (!found.length) {
    const p = box.appendChild(el(dom, 'p', 'se-quiet', null, { role: 'presentation' }))
    if (w.done) { p.append('Nothing is named like '); p.appendChild(el(dom, 'b', null, '“' + view.query.trim() + '”')); p.append(` in the folders searched at ${clock(w.finished)}. Files added since then need “Search again”.`) } else p.textContent = 'Searching…'
    return 0
  }
  const q = norm(view.query.trim())
  let n = 0
  for (const g of GROUPS) {
    const rows = found.filter(it => groupOf(it) === g.id)
    if (!rows.length) continue
    const sec = box.appendChild(el(dom, 'div', 'se-group', null, { role: 'group', 'aria-labelledby': view.idBase + '-g-' + g.id, 'data-group': g.id }))
    const head = sec.appendChild(el(dom, 'div', 'se-group-head', null, { role: 'presentation' }))
    head.appendChild(el(dom, 'span', 'se-caption', g.name, { id: view.idBase + '-g-' + g.id }))
    head.appendChild(el(dom, 'span', 'se-group-count', String(rows.length), { 'aria-hidden': 'true' }))
    const limit = view.shown.get(g.id) || PER_GROUP
    for (const it of rows.slice(0, limit)) {
      const href = httpOnly(it.uri)
      if (!href) continue
      const a = sec.appendChild(el(dom, 'a', 'se-row', null, { role: 'option', id: view.idBase + '-o-' + (n++), href, rel: 'noopener', 'data-uri': it.uri, 'aria-selected': 'false', tabindex: '-1' }))
      const ic = a.appendChild(el(dom, 'span', 'se-row-icon'))
      ic.appendChild(icon(dom, g.icon))
      const main = a.appendChild(el(dom, 'span', 'se-row-main'))
      const title = main.appendChild(el(dom, 'span', 'se-row-title', null, { title: it.name }))
      const at = norm(it.name).indexOf(q)
      if (at >= 0 && norm(it.name.slice(0, at)).length === at) {
        title.append(it.name.slice(0, at))
        title.appendChild(el(dom, 'mark', 'se-hit', it.name.slice(at, at + q.length)))
        title.append(it.name.slice(at + q.length))
      } else title.textContent = it.name
      const where = folderPath(w, it, view.top)
      main.appendChild(el(dom, 'span', 'se-row-sub', 'in ' + where, { title: where }))
      a.addEventListener('click', (event) => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); view.open(it.uri) } })
    }
    if (rows.length > limit) {
      const more = sec.appendChild(el(dom, 'button', 'se-btn se-btn-tertiary se-more', null, { type: 'button', role: 'option', id: view.idBase + '-o-' + (n++), 'data-more': g.id, 'aria-selected': 'false', tabindex: '-1' }))
      more.appendChild(icon(dom, 'chevron'))
      more.appendChild(el(dom, 'span', null, `Show more (${rows.length - limit} more ${g.name.toLowerCase()})`))
      more.addEventListener('click', () => { view.more(g.id) })
    }
  }
  return found.length
}

// Keyboard: the focus stays in the box; up/down move the highlighted option (aria-activedescendant).
// The highlight follows the result itself (its address, or "more:<group>"), so rows the walk adds above it while it
// runs do not move the highlight onto another file.
function keyboard (input, box, view) {
  let active = -1
  let activeKey = ''
  const options = () => [...box.querySelectorAll('[role="option"]')]
  const keyOf = (o) => o.dataset.uri || 'more:' + o.dataset.more
  const set = (i) => {
    const list = options()
    active = list.length ? Math.max(-1, Math.min(i, list.length - 1)) : -1
    activeKey = active >= 0 ? keyOf(list[active]) : ''
    list.forEach((o, k) => o.setAttribute('aria-selected', String(k === active)))
    if (active >= 0) { input.setAttribute('aria-activedescendant', list[active].id); list[active].scrollIntoView({ block: 'nearest' }) } else input.removeAttribute('aria-activedescendant')
  }
  return {
    get active () { return active },
    set,
    reset () { active = -1; activeKey = ''; input.removeAttribute('aria-activedescendant') },
    // after a redraw: the same result again, wherever it is now; none if it is gone
    restore () { set(activeKey ? options().findIndex(o => keyOf(o) === activeKey) : -1) },
    // true when the key was used
    key (event) {
      if (event.key === 'ArrowDown') { set(active + 1); return true }
      if (event.key === 'ArrowUp') { set(active <= 0 ? -1 : active - 1); return true }
      if (event.key === 'Enter' && active >= 0) {
        const o = options()[active]
        if (!o) return false
        if (o.dataset.more) view.more(o.dataset.more)
        else view.open(o.dataset.uri)
        return true
      }
      return false
    }
  }
}

// The status line under the results: what was searched (visible, not live), a "Search again" button once the walk
// is done, and a separate live region that announces only "Searching…" and the final line, not every count.
function statusLine (dom, parent, again) {
  const line = parent.appendChild(el(dom, 'div', 'se-status', null, { hidden: true }))
  const text = line.appendChild(el(dom, 'span', 'se-status-text'))
  const button = line.appendChild(el(dom, 'button', 'se-btn se-btn-tertiary se-again', 'Search again', { type: 'button', hidden: true }))
  button.addEventListener('click', again)
  const live = parent.appendChild(el(dom, 'p', 'se-sr', null, { 'aria-live': 'polite', 'data-live': 'search' }))
  let said = ''
  return {
    line,
    show (w) {
      line.hidden = false
      text.textContent = statusText(w)
      button.hidden = !w.done
      const say = w.done ? statusText(w) : 'Searching…'
      if (say !== said) { said = say; live.textContent = say }
    },
    hide () { line.hidden = true }
  }
}

// ---- the pane ------------------------------------------------------------------------------------------------
const pane = {
  name: NAME,
  icon: svgUri(MDI.search, '#0082c9'),
  limits: LIMITS,
  // For tests only: walks kept, the root finder, and startAt (an address) to make the header walk start there
  // instead of the pod root, so header tests do not depend on the rest of the pod. null in normal use.
  _test: { walks, podRoot, startAt: null },

  label (subject) { return subject && subject.termType === 'NamedNode' && /^https?:\/\/.*\/$/.test(subject.uri) ? 'Search' : null },
  // Loaded alone by link, it opens first on a folder; next to the shell it waits to be asked.
  shouldGetFocus (subject) {
    const reg = globalThis.panes
    if (reg && typeof reg.byName === 'function' && reg.byName('suite-shell')) return false
    return !!pane.label(subject)
  },

  // The shell's live search: the page itself filters as the box changes.
  search (query, context) {
    const s = context && context.suite && context.suite.state
    if (s && typeof s.searchFor === 'function') s.searchFor(query)
  },

  // ---- the search page for a folder
  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null
    const root = el(dom, 'div', 'se suite-search-pane se-root se-page')
    root.appendChild(el(dom, 'style', null, CSS))
    const start = isFolder(subject.uri) ? subject.uri : parentOf(subject.uri)
    const head = root.appendChild(el(dom, 'div', 'se-page-head'))
    head.appendChild(el(dom, 'h1', 'se-heading', 'Search'))
    head.appendChild(el(dom, 'p', 'se-muted', 'Names of files and folders in ' + decode(start)))
    const form = root.appendChild(el(dom, 'form', 'se-search', null, { role: 'search' }))
    form.appendChild(icon(dom, 'search'))
    const idBase = 'se' + (++ids)
    const input = form.appendChild(el(dom, 'input', 'se-input', null, { type: 'search', placeholder: 'Search by name', 'aria-label': 'Search by name', autocomplete: 'off', enterkeyhint: 'search', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': idBase + '-list' }))
    const status = statusLine(dom, root, () => { use(walkFrom(start, fetchFn, me && me.uri, { fresh: true })); draw() })
    const box = root.appendChild(el(dom, 'div', 'se-results', null, { role: 'listbox', id: idBase + '-list', 'aria-label': 'Results' }))

    const me = currentUser(context)
    const fetchFn = (u, o) => (store.fetcher && store.fetcher._fetch ? store.fetcher._fetch(u, o) : fetch(u, o))
    let w = null
    const listener = () => { if (!root.isConnected && w.done) { w.listeners.delete(listener); return } draw() }
    function use (walk) { if (w) w.listeners.delete(listener); w = walk; view.w = w; w.listeners.add(listener) }
    const open = (uri) => {
      if (suite) { suite.go(uri); return }
      try { context.getOutliner(dom).GotoSubject(store.sym(uri), true, undefined, true, undefined) } catch { dom.defaultView.location.href = uri }
    }
    const view = { dom, w: null, query: (suite && suite.query) || '', shown: new Map(), idBase, open, more: null, top: lastName(start) || start }
    const nav = keyboard(input, box, view)
    view.more = (group) => { const at = nav.active; view.shown.set(group, (view.shown.get(group) || PER_GROUP) + MORE); draw(); if (at >= 0) nav.set(at) }
    input.value = view.query

    function draw () {
      root.dataset.fetched = String(w.fetched)
      root.dataset.query = view.query
      root.dataset.done = w.done ? 'yes' : 'no'
      root.dataset.capped = w.capped ? 'yes' : 'no'
      status.show(w)
      if (!view.query.trim()) {
        box.replaceChildren()
        const empty = box.appendChild(el(dom, 'div', 'se-empty', null, { role: 'presentation' }))
        empty.appendChild(el(dom, 'span', 'se-empty-icon')).appendChild(icon(dom, 'search'))
        empty.appendChild(el(dom, 'h2', 'se-empty-title', 'Find a file or folder'))
        empty.appendChild(el(dom, 'p', 'se-empty-text', 'Type part of a name. Upper and lower case are the same.'))
        input.setAttribute('aria-expanded', 'false')
        return
      }
      drawResults(view, box)
      input.setAttribute('aria-expanded', 'true')
      nav.restore()
    }
    const searchFor = (q) => { view.query = String(q || ''); input.value = view.query; view.shown.clear(); nav.reset(); draw() }
    if (suite) { suite.state.searchFor = searchFor; suite.state.searchPage = true }
    let typing = 0
    input.addEventListener('input', () => { const mine = ++typing; setTimeout(() => { if (mine === typing) { if (stale(w)) use(walkFrom(start, fetchFn, me && me.uri, { fresh: true })); view.query = input.value; view.shown.clear(); nav.reset(); draw() } }, 150) })
    input.addEventListener('keydown', (event) => { if (nav.key(event)) event.preventDefault() })
    form.addEventListener('submit', (event) => event.preventDefault())
    use(walkFrom(start, fetchFn, me && me.uri))
    draw()
    return root
  },

  // ---- the shell's header box: called once per shell showing, after the first keystroke --------------------
  // Returns { query(text) }, which the shell calls 250 ms after each change. Never throws into the shell.
  headerSearch ({ input, form, context, suite }) {
    const dom = input.ownerDocument
    const win = dom.defaultView || globalThis
    const store = context.session.store
    const top = form.closest('.sh-top') || form.parentNode
    const idBase = 'se' + (++ids)
    const drop = el(dom, 'div', 'se se-root se-popover se-drop', null, { hidden: true, 'data-search': 'dropdown' })
    drop.appendChild(el(dom, 'style', null, CSS))
    const box = drop.appendChild(el(dom, 'div', 'se-results', null, { role: 'listbox', id: idBase + '-list', 'aria-label': 'Search results' }))
    let root = ''
    const status = statusLine(dom, drop, () => { if (root) { use(walkFrom(root, fetchFn, me.uri, { fresh: true })); draw() } })
    top.appendChild(drop)
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', 'false')
    input.setAttribute('aria-controls', idBase + '-list')

    const me = currentUser(context)
    const fetchFn = (u, o) => (store.fetcher && store.fetcher._fetch ? store.fetcher._fetch(u, o) : fetch(u, o))
    let w = null
    const view = { dom, w: null, query: '', shown: new Map(), idBase, open: null, more: null }
    const nav = keyboard(input, box, view)
    const isOpen = () => !drop.hidden
    function close () { drop.hidden = true; input.setAttribute('aria-expanded', 'false'); nav.reset() }
    function place () {
      const t = top.getBoundingClientRect(); const f = form.getBoundingClientRect()
      drop.style.setProperty('--se-right', Math.max(8, Math.round(t.right - f.right)) + 'px')
    }
    function show () { place(); drop.hidden = false; input.setAttribute('aria-expanded', 'true') }
    view.open = (uri) => { close(); suite.go(uri) }
    view.more = (group) => { const at = nav.active; view.shown.set(group, (view.shown.get(group) || PER_GROUP) + MORE); draw(); if (at >= 0) nav.set(at) }

    function draw () {
      if (!drop.isConnected) return
      drop.dataset.query = view.query
      if (!me) {
        box.replaceChildren(el(dom, 'p', 'se-quiet', 'Log in to search the files and folders on your pod.', { role: 'presentation' }))
        status.hide()
        drop.dataset.loggedIn = 'no'
        return
      }
      if (!w) {
        // Still finding the pod root, or there is none: never a "Searching…" that does not end.
        box.replaceChildren(el(dom, 'p', 'se-quiet', noRoot ? 'Your pod\'s top folder could not be found (no storage in your profile), so there is nothing to search.' : 'Searching…', { role: 'presentation' }))
        status.hide()
        drop.dataset.done = noRoot ? 'yes' : 'no'
        if (noRoot) drop.dataset.noRoot = 'yes'
        return
      }
      drop.dataset.fetched = String(w.fetched)
      drop.dataset.done = w.done ? 'yes' : 'no'
      drop.dataset.capped = w.capped ? 'yes' : 'no'
      status.show(w)
      drawResults(view, box)
      nav.restore()
    }
    let noRoot = false
    const listener = () => { if (!drop.isConnected) { w.listeners.delete(listener); return } if (isOpen()) draw() }
    function use (walk) { if (w) w.listeners.delete(listener); w = walk; view.w = w; w.listeners.add(listener) }
    const starting = me
      ? podRoot(store, me).then(found => {
        drop.dataset.podRoot = found
        root = httpOnly(pane._test.startAt) || found
        if (!root) { noRoot = true; return }
        use(walkFrom(root, fetchFn, me.uri))
        drop.dataset.root = root
      }).catch(error => { noRoot = true; console.warn('[search] no pod root', error) })
      : Promise.resolve()

    function query (text) {
      view.query = String(text || '')
      view.shown.clear()
      nav.reset()
      // On the search page itself the page filters; no dropdown on top of it.
      if (!view.query.trim() || (suite.state && suite.state.searchPage)) { close(); return }
      if (stale(w)) use(walkFrom(root, fetchFn, me.uri, { fresh: true }))
      show()
      draw()
      starting.then(() => { if (isOpen()) draw() })
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && !isOpen() && view.query.trim()) { query(input.value); event.preventDefault(); return }
      if (!isOpen()) return
      if (nav.key(event)) { event.preventDefault(); event.stopPropagation() }
    })
    // Enter with nothing highlighted is the shell's (an address, or the search page): the dropdown gives way.
    form.addEventListener('submit', () => close())
    input.addEventListener('focus', () => { if (view.query.trim() && input.value === view.query && !isOpen()) query(view.query) })
    // Clicks in the dropdown keep the focus in the box; a click elsewhere closes it.
    drop.addEventListener('mousedown', (event) => event.preventDefault())
    const onDown = (event) => {
      if (!drop.isConnected) { forget(); return }
      if (isOpen() && !drop.contains(event.target) && !form.contains(event.target)) close()
    }
    // Escape closes the dropdown only (window, capture: before the shell's own Escape on the document).
    const onEscape = (event) => {
      if (!drop.isConnected) { forget(); return }
      if (event.key !== 'Escape' || !isOpen()) return
      event.stopPropagation()
      event.preventDefault()
      close()
      input.focus()
    }
    dom.addEventListener('mousedown', onDown, true)
    win.addEventListener('keydown', onEscape, true)
    const onResize = () => { if (!drop.isConnected) { forget(); return } if (isOpen()) place() }
    // The shell draws a new box for each showing: the old dropdown's window and document listeners go with it.
    function forget () {
      dom.removeEventListener('mousedown', onDown, true)
      win.removeEventListener('keydown', onEscape, true)
      win.removeEventListener('resize', onResize)
      if (w) w.listeners.delete(listener)
    }
    win.addEventListener('resize', onResize)
    query(input.value)
    return { query, close, element: drop, forget }
  }
}

export default pane
