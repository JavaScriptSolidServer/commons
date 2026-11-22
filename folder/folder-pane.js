// folder-pane.js: the Files view of a folder (a Solid container): a small file manager.
// One file, no imports (the Sharing pane is loaded with import() when its tab is opened). It opens on anything
// whose address ends in "/".
//
// In the suite shell (context.suite) it gives three columns: a short navigation ("All files", "Recent"), the
// folder in the middle, and the details of the selected file on the right (renderDetails), with the Sharing pane
// for that file in a tab. Alone in the data browser the details open under the row.
//
// What it reads: the folder's own listing, as the server gives it:
//
//   <./> ldp:contains <a.txt>, <photos/> .
//   <a.txt> posix:size 1234 ; dct:modified "2026-11-21T22:13:31Z" .   (or posix:mtime, in seconds)
//
// Size and modified are matched by local name (size, modified, mtime), so other vocabularies work too.
//
// What it writes, and when (only when someone is logged in AND the server says they may write here):
// - "New folder": an empty folder (PUT name/ with If-None-Match: *).
// - "Upload" or dropping files on the list: each file, as it is, with its content type
//   (PUT with If-None-Match: *). An existing name is replaced only after the person says so.
// - "Rename" (files only): a copy under the new name, then a DELETE of the old one. Not atomic.
// - "Delete" (a file, or a folder that is empty): one DELETE of that one item, after a second click.
//   Folders are checked for contents first, from a fresh listing; this pane never deletes recursively.
// - "New ..." menu: whatever the chosen pane's own mintNew writes, in a new folder named by the person.
// The Sharing tab is the Sharing pane (../sharing/sharing-pane.js); what it writes is in its own README.
// Icons: Material Design Icons (Apache 2.0).

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const SPACE_STORAGE = 'http://www.w3.org/ns/pim/space#storage'
const MINT_TIMEOUT = 90000
const SHARING = new URL('../sharing/sharing-pane.js', import.meta.url).href

// ---- icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box ----------------------------------------
const MDI = {
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
  folderPlus: 'M10,4L12,6H20A2,2 0 0,1 22,8V18A2,2 0 0,1 20,20H4C2.89,20 2,19.1 2,18V6C2,4.89 2.89,4 4,4H10M15,9V12H12V14H15V17H17V14H20V12H17V9H15Z',
  image: 'M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z',
  audio: 'M12,3V13.55C11.41,13.21 10.73,13 10,13C7.79,13 6,14.79 6,17C6,19.21 7.79,21 10,21C12.21,21 14,19.21 14,17V7H18V3H12Z',
  video: 'M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z',
  pdf: 'M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z',
  data: 'M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z',
  code: 'M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z',
  text: 'M14,10H19.5L14,4.5V10M5,3H15L21,9V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3M5,12V14H19V12H5M5,16V18H14V16H5Z',
  file: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z',
  plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  upload: 'M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z',
  dots: 'M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  pencil: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  delete: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  sync: 'M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z',
  search: 'M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z',
  clock: 'M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  alert: 'M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.48 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)
const ICON = svg(MDI.folder, '#00679e') // --sui-primary-element

const CSS = `
/* suite:design begin --prefix fl --only icon,toolbar,nav,row,buttons,input,switch,menu,empty,toast,details */
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
.fl-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.fl-root *, .fl-root *::before, .fl-root *::after { box-sizing: border-box }
.fl-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.fl-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.fl-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.fl-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.fl-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.fl-root [hidden] { display: none !important }
.fl-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.fl-muted { color: var(--sui-text-muted) }
.fl-small { font-size: var(--sui-text-sm) }
.fl-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.fl-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.fl-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.fl-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.fl-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.fl-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --fl-i set to url("data:image/svg+xml,...") ---------------------------------- */
.fl-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--fl-i) center / contain no-repeat; mask: var(--fl-i) center / contain no-repeat }
/* ---- menu: popover menu (avatar menu, row actions) ------------------------------------------------------------ */
.fl-popover { position: absolute; z-index: 40; min-width: 220px; max-width: calc(100vw - 16px); padding: var(--sui-space-1); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-text); box-shadow: var(--sui-shadow-lg); border: 1px solid var(--sui-border) }
.fl-menu { margin: 0; padding: 0; list-style: none }
.fl-menu-head { display: flex; align-items: center; gap: var(--sui-space-3); padding: var(--sui-space-2) var(--sui-space-3) var(--sui-space-3); border-bottom: 1px solid var(--sui-border); margin-bottom: var(--sui-space-1); min-width: 0 }
.fl-menu-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.fl-menu-item:hover, .fl-menu-item:focus-visible { background: var(--sui-bg-hover); outline: none }
.fl-menu-item .fl-icon { color: var(--sui-text-muted) }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.fl-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.fl-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.fl-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.fl-nav-item:hover { background: var(--sui-bg-hover) }
.fl-nav-item[aria-current="page"], .fl-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.fl-nav-item .fl-icon { color: var(--sui-text-muted) }
.fl-nav-item[aria-current] .fl-icon { color: inherit }
.fl-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.fl-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.fl-nav-new { margin-bottom: var(--sui-space-2) }
.fl-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- toolbar: content toolbar and breadcrumbs ---------------------------------------------------------------------- */
.fl-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2); min-height: calc(var(--sui-target) + var(--sui-space-3)); padding: var(--sui-space-1) var(--sui-space-3) }
.fl-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; min-width: 0; margin: 0; padding: 0; list-style: none; font-size: var(--sui-text-lg) }
.fl-crumbs li { display: flex; align-items: center; min-width: 0 }
.fl-crumbs li + li::before { content: "›"; padding: 0 var(--sui-space-1); color: var(--sui-text-muted) }
.fl-crumbs a { display: inline-flex; align-items: center; min-height: var(--sui-target); padding: 0 var(--sui-space-2); border-radius: var(--sui-radius); color: var(--sui-text-muted); text-decoration: none; overflow-wrap: anywhere }
.fl-crumbs a:hover { background: var(--sui-bg-hover) }
.fl-crumbs [aria-current="page"] { color: var(--sui-text); font-weight: var(--sui-weight-bold) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.fl-list { margin: 0; padding: 0; list-style: none }
.fl-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.fl-row:hover { background: var(--sui-bg-hover) }
.fl-row[aria-selected="true"], .fl-row[aria-current="true"] { background: var(--sui-primary-light) }
.fl-row-main { flex: 1 1 auto; min-width: 0 }
.fl-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.fl-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.fl-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.fl-row-actions { flex: none; display: flex; align-items: center }
.fl-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.fl-row-icon .fl-icon { width: 28px; height: 28px }
.fl-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .fl-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.fl-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.fl-btn:hover { background: var(--sui-primary-light-hover) }
.fl-btn:disabled, .fl-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.fl-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.fl-btn-primary:hover { background: var(--sui-primary-element-hover) }
.fl-btn-tertiary { background: transparent; color: var(--sui-text) }
.fl-btn-tertiary:hover { background: var(--sui-bg-hover) }
.fl-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.fl-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.fl-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.fl-btn-icon:hover { background: var(--sui-bg-hover) }
.fl-btn-wide { width: 100%; justify-content: flex-start }
.fl-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.fl-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.fl-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.fl-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.fl-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.fl-input:hover { border-color: var(--sui-primary-element) }
.fl-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.fl-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.fl-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.fl-search { position: relative; display: flex; align-items: center; min-width: 0 }
.fl-search .fl-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.fl-search .fl-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.fl-select { position: relative; display: block; min-width: 0 }
.fl-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.fl-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.fl-file { position: relative; overflow: hidden }
.fl-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.fl-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .fl-row-check */
.fl-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.fl-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.fl-check-round { border-radius: 50% }
.fl-check:hover { border-color: var(--sui-primary-element) }
.fl-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.fl-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.fl-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.fl-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.fl-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.fl-segment:hover { background: var(--sui-bg-hover) }
.fl-segment[aria-pressed="true"], .fl-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- switch: <label class="ui-switch"><input type="checkbox" role="switch"><span>Text</span></label> ---------- */
.fl-switch { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.fl-switch input { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 40px; height: 22px; margin: 0; border-radius: var(--sui-radius-pill); background: var(--sui-border-strong); cursor: pointer; transition: background var(--sui-ease) }
.fl-switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--sui-bg); transition: transform var(--sui-ease) }
.fl-switch input:checked { background: var(--sui-primary-element) }
.fl-switch input:checked::after { transform: translateX(18px) }
.fl-switch input:disabled { opacity: .5 }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.fl-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.fl-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.fl-empty-icon .fl-icon { width: 48px; height: 48px }
.fl-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.fl-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.fl-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.fl-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.fl-toast-error { border-left-color: var(--sui-error) }
.fl-toast-success { border-left-color: var(--sui-success) }
.fl-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.fl-status-error { color: var(--sui-error) }
.fl-status-success { color: var(--sui-success) }
.fl-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.fl-note-error { background: var(--sui-error-light) }
.fl-note-warning { background: var(--sui-warning-light) }
.fl-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.fl-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.fl-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.fl-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.fl-details-figure .fl-icon { width: 36px; height: 36px }
.fl-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.fl-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.fl-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.fl-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.fl-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.fl-tab:hover { color: var(--sui-text) }
.fl-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.fl-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.fl-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.fl-props dt { color: var(--sui-text-muted) }
.fl-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.fl.folder-lab-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-2) var(--sui-space-4) var(--sui-space-8); container-type: inline-size }
.fl-top { position: relative; padding-left: 0; padding-right: 0 }
.fl-crumbs .fl-here { padding: 0 var(--sui-space-2); overflow-wrap: anywhere }
.fl-write { display: contents }
.fl-newmenu { top: 100%; left: 0; max-height: calc(var(--sui-target) * 9); overflow-y: auto }
.fl-newmenu .fl-caption { margin-top: var(--sui-space-1); border-top: 1px solid var(--sui-border); padding-top: var(--sui-space-1) }
.fl-make-icon { flex: none; width: var(--sui-icon); height: var(--sui-icon) }
.fl-bar { min-height: 0; padding: 0 0 var(--sui-space-2) }
.fl-bar .fl-search { flex: 1 1 var(--sui-space-12); max-width: var(--sui-details-width) }
.fl-ask { flex-wrap: wrap; align-items: center; margin: 0 0 var(--sui-space-3) }
.fl-ask .fl-asktext { flex: 1 1 100%; margin: 0; overflow-wrap: anywhere }
.fl-ask .fl-input, .fl-strip .fl-input { flex: 1 1 calc(var(--sui-space-12) * 4); width: auto }
.fl-status { margin: 0 0 var(--sui-space-2); overflow-wrap: anywhere }
.fl-status:empty { display: none }
.fl-status.fl-good { color: var(--sui-success) }
.fl-status.fl-bad { color: var(--sui-error) }
.fl-mintout { margin: 0 0 var(--sui-space-3) }
.fl-mintout:empty { display: none }
.fl-list { border-radius: var(--sui-radius) }
.fl-list.fl-drag { outline: 2px dashed var(--sui-primary-element); outline-offset: 2px; background: var(--sui-primary-light) }
.fl-head { display: flex; align-items: center; gap: var(--sui-space-3); padding: 0 var(--sui-space-2) 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border) }
.fl-hico { flex: none; width: calc(var(--sui-space-8) + var(--sui-space-2)) } /* the row recipe's 40 px icon */
.fl-hacts { flex: none; width: var(--sui-target) }
.fl-sort { min-height: var(--sui-target); padding: 0 var(--sui-space-2); justify-content: flex-start; background: transparent; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.fl-sort:hover { background: var(--sui-bg-hover); color: var(--sui-text) }
.fl-sort[aria-pressed="true"] { color: var(--sui-text) }
.fl-hname { flex: 1 1 auto; min-width: 0; margin-left: calc(-1 * var(--sui-space-2)) }
.fl-hsize, .fl-size { flex: none; width: calc(var(--sui-space-12) * 2); justify-content: flex-end; text-align: right }
.fl-hdate, .fl-date { flex: none; width: calc(var(--sui-space-8) * 5) }
.fl-size { padding-right: var(--sui-space-2) }
.fl-date { padding-left: var(--sui-space-2) }
.fl-rows { margin: 0; padding: 0; list-style: none }
.fl-row:not(.fl-isdir) .fl-row-icon { color: var(--sui-text-muted) }
.fl-row-title.fl-name { display: inline-block; max-width: 100%; vertical-align: top; color: var(--sui-text); text-decoration: none }
.fl-name:hover { color: var(--sui-primary-element); text-decoration: underline }
.fl-meta { display: none }
.fl-size, .fl-date { font-variant-numeric: tabular-nums }
.fl-acts { position: relative; width: var(--sui-target); justify-content: flex-end }
.fl-rowmenu { top: 100%; right: 0 }
.fl-strip { flex-wrap: wrap; align-items: center; margin: var(--sui-space-1) 0 var(--sui-space-2) calc(var(--sui-space-12) + var(--sui-space-2)) }
.fl-strip p { flex: 1 1 100%; margin: 0; overflow-wrap: anywhere }
.fl-loading { margin: 0; padding: var(--sui-space-4) var(--sui-space-3); color: var(--sui-text-muted) }
.fl-foot { margin: var(--sui-space-2) var(--sui-space-3) 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.fl-inline-details { position: relative; margin: var(--sui-space-1) 0 var(--sui-space-3) calc(var(--sui-space-12) + var(--sui-space-2)); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); overflow: hidden }
.fl-details-close { position: absolute; top: var(--sui-space-2); right: var(--sui-space-2) }
.fl-details-figure img { width: 100%; height: 100%; object-fit: cover; border-radius: var(--sui-radius-lg) }
.fl-preview { display: block; width: 100%; height: auto; border-radius: var(--sui-radius); background: var(--sui-bg-app) }
.fl-props a { color: var(--sui-primary-element) }
.fl-details-body[hidden] { display: none }
@container (max-width: 500px) {
  .fl-row .fl-size, .fl-row .fl-date, .fl-hico, .fl-hacts { display: none }
  .fl-meta { display: block }
  .fl-head { gap: var(--sui-space-1); padding-left: var(--sui-space-1) }
  .fl-head .fl-hname { flex: none; margin-left: 0 }
  .fl-hsize, .fl-hdate { width: auto }
  .fl-strip, .fl-inline-details { margin-left: 0 }
}
`

const EXT_KIND = {
  image: 'png jpg jpeg gif webp svg avif bmp ico heic',
  audio: 'mp3 wav ogg oga flac m4a aac opus',
  video: 'mp4 webm mov mkv avi ogv m4v',
  pdf: 'pdf',
  data: 'ttl jsonld n3 nt nq rdf owl trig',
  code: 'js mjs cjs ts html htm css json xml sh py',
  text: 'txt md markdown csv tsv log ics vcf'
}
const KIND_LABEL = { folder: 'Folder', image: 'Image', audio: 'Audio', video: 'Video', pdf: 'PDF document', data: 'Linked data', code: 'Code', text: 'Text', file: 'File' }
const PREVIEW = 'png jpg jpeg gif webp svg avif bmp'
const MIME = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', jsonld: 'application/ld+json',
  ttl: 'text/turtle', n3: 'text/n3', nt: 'application/n-triples', rdf: 'application/rdf+xml', xml: 'application/xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf', ics: 'text/calendar', vcf: 'text/vcard'
}

const isFolder = (subject) => !!subject && typeof subject.uri === 'string' && /^https?:\/\/[^#?]*\/$/.test(subject.uri)
const localName = (uri) => String(uri).replace(/[/#]+$/, '').split(/[/#]/).pop()
const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : '' }
const kindOf = (name, dir) => {
  if (dir) return 'folder'
  const ext = extOf(name)
  for (const [kind, list] of Object.entries(EXT_KIND)) if (ext && list.split(' ').includes(ext)) return kind
  return 'file'
}
const decode = (s) => { try { return decodeURIComponent(s) } catch { return s } }
const isHidden = (name) => name.startsWith('.') || /\.(acl|meta)$/i.test(name)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// One path segment, safe to make: no slashes, no "..", no leading dot, nothing the server treats as access rules.
function nameProblem (raw) {
  const name = String(raw || '').trim()
  if (!name) return 'Give it a name.'
  if (/[/\\]/.test(name)) return 'A name cannot contain / or \\.'
  // Some servers (JSS among them) list names without escaping them, and one space then makes the whole folder unreadable.
  if (/[\s<>"{}|^`%#?]/.test(name)) return 'Use - or _ in place of spaces. A name cannot contain spaces or any of < > " { } | ^ ` % # ?'
  if (name.includes('..')) return 'A name cannot contain "..".'
  if (name.startsWith('.')) return 'A name cannot start with a dot.'
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'A name cannot contain control characters.'
  if (/\.(acl|meta)$/i.test(name)) return 'Names ending in .acl or .meta are kept for access rules and metadata.'
  if (name.length > 200) return 'That name is too long.'
  return ''
}

function el (dom, tag, className, text, attrs) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = text
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

function icon (dom, path) {
  const span = el(dom, 'span', 'fl-icon', null, { 'aria-hidden': 'true' })
  span.style.setProperty('--fl-i', `url("${svg(path)}")`)
  return span
}

function button (dom, text, className, onClick, path) {
  const b = el(dom, 'button', 'fl-btn' + (className ? ' ' + className : ''))
  b.type = 'button'
  if (path) b.appendChild(icon(dom, path))
  if (text) b.appendChild(el(dom, 'span', null, text))
  if (onClick) b.addEventListener('click', onClick)
  return b
}

function menuItem (dom, text, className, path, onClick) {
  const b = el(dom, 'button', 'fl-menu-item' + (className ? ' ' + className : ''), null, { type: 'button', role: 'menuitem' })
  if (path) b.appendChild(icon(dom, path))
  b.appendChild(el(dom, 'span', null, text))
  if (onClick) b.addEventListener('click', onClick)
  return b
}

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

const webFetch = (store) => (store.fetcher && store.fetcher._fetch) || fetch

function sizeLabel (n) {
  if (n == null || isNaN(n)) return ''
  if (n < 1024) return n + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + units[i]
}

function dateLabel (time) {
  if (!time) return ''
  const d = new Date(time)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const day = d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  return sameYear ? day + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : day
}

// Modes the server grants the logged-in user, from WAC-Allow: user="read write", public="read".
function userModes (header) {
  const m = /(?:^|,)\s*user\s*=\s*"([^"]*)"/i.exec(header || '')
  return m ? m[1].toLowerCase().split(/\s+/).filter(Boolean) : null
}

// The folder's children, read from what the store holds for the folder's own document.
function readItems (store, folder) {
  const doc = folder.doc ? folder.doc() : folder
  const seen = new Set()
  const items = []
  for (const child of store.each(folder, store.sym(LDP_CONTAINS), null, doc)) {
    if (child.termType !== 'NamedNode' || seen.has(child.uri)) continue
    if (!child.uri.startsWith(folder.uri) || child.uri === folder.uri) continue
    const rest = child.uri.slice(folder.uri.length)
    if (rest.replace(/\/$/, '').includes('/')) continue // not a direct child
    seen.add(child.uri)
    let size = null
    let time = null
    let dir = child.uri.endsWith('/')
    for (const st of store.statementsMatching(child, null, null, doc)) {
      const p = localName(st.predicate.uri)
      if (p === 'size' && size == null) size = Number(st.object.value)
      else if (p === 'modified') time = Date.parse(st.object.value) || time
      else if (p === 'mtime' && !time) time = Number(st.object.value) * 1000 || null
      else if (st.predicate.uri === RDF_TYPE && /Container$/.test(localName(st.object.value))) dir = true
    }
    const name = decode(rest.replace(/\/$/, ''))
    items.push({ uri: child.uri, name, dir, size: dir ? null : size, time, kind: kindOf(name, dir), hidden: isHidden(name) })
  }
  return items
}

// The panes that can make something new here, in registry order; chat is left out as upstream does,
// and the two folder panes too, since "New folder" is offered on its own.
function creationPanes (context) {
  const reg = (context && context.session && context.session.paneRegistry) || globalThis.panes
  const list = (reg && reg.list) || []
  return list.filter(p => p && typeof p.mintNew === 'function' && p.name &&
    !['chat', 'folder', 'folder-lab', 'dokieli'].includes(String(p.name).toLowerCase()))
}

function paneNoun (store, pane) {
  if (pane.mintClass) {
    const label = store.any(pane.mintClass, store.sym(RDFS_LABEL))
    if (label && label.value) return label.value
    const words = localName(pane.mintClass.uri || pane.mintClass.value).replace(/([a-z])([A-Z])/g, '$1 $2')
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
  }
  const name = String(pane.name).toLowerCase() === 'source' ? 'file' : String(pane.name)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// A folder's own name for a heading: its last segment, or the host for a site's root.
const folderName = (uri) => { const u = new URL(uri); return u.pathname === '/' ? u.host : decode(localName(uri)) }

// The details of one item (a file or folder in the list, or the folder on show): a head with its icon (or a
// preview), name and size; an Info tab; and a Sharing tab that is the Sharing pane for that item, loaded when
// first opened. Used for the shell's details column and, alone, under the row.
function detailsView (dom, context, item, { onClose } = {}) {
  const store = context.session.store
  const box = el(dom, 'div', 'fl-details-wrap', null, { 'data-uri': item.uri })
  const head = box.appendChild(el(dom, 'div', 'fl-details-head'))
  const fig = head.appendChild(el(dom, 'span', 'fl-details-figure', null, { 'data-kind': item.kind }))
  fig.appendChild(icon(dom, MDI[item.kind] || MDI.file))
  const titles = head.appendChild(el(dom, 'div', 'fl-details-titles'))
  titles.appendChild(el(dom, 'h2', 'fl-details-title', item.name))
  const sub = item.dir ? (item.summary || 'Folder') : [sizeLabel(item.size), dateLabel(item.time)].filter(Boolean).join(' · ') || KIND_LABEL[item.kind]
  titles.appendChild(el(dom, 'p', 'fl-details-sub', sub))
  if (onClose) {
    const close = head.appendChild(button(dom, '', 'fl-btn-icon fl-details-close', onClose, MDI.close))
    close.setAttribute('aria-label', 'Close details')
    close.title = 'Close'
  }

  const id = 'fl-' + Math.random().toString(36).slice(2, 9)
  const tabs = box.appendChild(el(dom, 'div', 'fl-tabs', null, { role: 'tablist', 'aria-label': 'Details' }))
  const panels = {}
  const tabFor = {}
  for (const [key, label] of [['info', 'Info'], ['sharing', 'Sharing']]) {
    const t = tabs.appendChild(el(dom, 'button', 'fl-tab fl-tab-' + key, label, { type: 'button', role: 'tab', id: id + '-' + key, 'aria-controls': id + '-p-' + key, 'aria-selected': String(key === 'info') }))
    tabFor[key] = t
    panels[key] = box.appendChild(el(dom, 'div', 'fl-details-body fl-panel-' + key, null, { role: 'tabpanel', id: id + '-p-' + key, 'aria-labelledby': id + '-' + key }))
    panels[key].hidden = key !== 'info'
    t.addEventListener('click', () => choose(key))
  }
  let sharingLoaded = false
  function choose (key) {
    for (const k of Object.keys(panels)) { panels[k].hidden = k !== key; tabFor[k].setAttribute('aria-selected', String(k === key)) }
    if (key === 'sharing' && !sharingLoaded) { sharingLoaded = true; loadSharing() }
  }

  // Info
  const info = panels.info
  if (!item.dir && PREVIEW.split(' ').includes(extOf(item.name)) && /^https?:/i.test(item.uri)) {
    const img = el(dom, 'img', 'fl-preview', null, { alt: 'Preview of ' + item.name })
    img.hidden = true
    info.appendChild(img)
    webFetch(store)(item.uri, { headers: { Accept: 'image/*' } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (!blob || !/^image\//.test(blob.type || 'image/')) return
        const url = URL.createObjectURL(blob)
        img.addEventListener('load', () => { img.hidden = false; URL.revokeObjectURL(url) }, { once: true })
        img.addEventListener('error', () => { img.remove(); URL.revokeObjectURL(url) }, { once: true })
        img.src = url
      })
      .catch(() => img.remove())
  }
  const dl = info.appendChild(el(dom, 'dl', 'fl-props'))
  const prop = (k, v) => { if (!v) return null; dl.appendChild(el(dom, 'dt', null, k)); return dl.appendChild(el(dom, 'dd', null, typeof v === 'string' ? v : null)) }
  prop('Kind', KIND_LABEL[item.kind] || 'File')
  if (item.dir && item.summary) prop('Contents', item.summary)
  if (!item.dir) prop('Size', item.size != null ? sizeLabel(item.size) + (item.size >= 1024 ? ` (${item.size.toLocaleString()} bytes)` : '') : '')
  if (item.time) prop('Modified', new Date(item.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))
  if (/^https?:/i.test(item.uri)) {
    const dd = prop('Address', true)
    const a = dd.appendChild(el(dom, 'a', null, item.uri, { href: item.uri, rel: 'noopener' }))
    a.target = '_blank'
  }

  // Sharing: the Sharing pane, loaded from next to this one. It is drawn alone (no context.suite), so its own
  // state never mixes with this pane's.
  async function loadSharing () {
    const panel = panels.sharing
    panel.replaceChildren(el(dom, 'p', 'fl-status', 'Loading sharing…'))
    try {
      const mod = await import(SHARING)
      const sharing = mod && mod.default
      if (!sharing || typeof sharing.render !== 'function') throw new Error('it has no render()')
      // Sharing gets the shell's toast and go (so it can say what it saved, and link inside the shell), never its
      // state, and slot 'details' so it may drop its own title under this tab.
      const ctx = Object.assign({}, context)
      const s = context.suite
      if (s && s.version >= 1) ctx.suite = { version: s.version, toast: s.toast, go: s.go, slot: 'details' }
      else delete ctx.suite
      const node = sharing.render(store.sym(item.uri), ctx)
      panel.replaceChildren(node)
    } catch (error) {
      panel.replaceChildren(el(dom, 'p', 'fl-status fl-bad', 'Sharing could not be shown: ' + (error && error.message ? error.message : error)))
    }
  }
  return box
}

// An item's own access rules: where they live (the Link rel="acl" header, else "<item>.acl") and whether they
// exist (HEAD: true, false, or null when the server would not say). Never read from the listing: servers need not
// list .acl files.
async function ownAcl (fetchFn, uri) {
  let url = null
  try {
    const r = await fetchFn(uri, { method: 'HEAD', cache: 'no-store' })
    for (const part of (r.headers.get('link') || '').split(/,(?=\s*<)/)) {
      const m = /^\s*<([^>]*)>(.*)$/.exec(part)
      const rel = m && /;\s*rel\s*=\s*"?([^";]*)"?/i.exec(m[2])
      if (rel && rel[1].toLowerCase().split(/\s+/).includes('acl')) { url = new URL(m[1], uri).href; break }
    }
  } catch { /* fall back below */ }
  if (!url) url = uri + '.acl'
  let exists = null
  try { const h = await fetchFn(url, { method: 'HEAD', cache: 'no-store' }); exists = h.ok ? true : h.status === 404 ? false : null } catch { exists = null }
  return { url, exists }
}

// Logins and logouts: one listener for the module, calling the drawings still on screen.
const authWatchers = new Set()
let authHooked = false
function watchAuth (root, fn) {
  for (const w of authWatchers) if (!w.root.isConnected) authWatchers.delete(w)
  authWatchers.add({ root, fn })
  const events = globalThis.SolidLogic && globalThis.SolidLogic.authSession && globalThis.SolidLogic.authSession.events
  if (authHooked || !events || !events.on) return
  authHooked = true
  const all = () => { for (const w of [...authWatchers]) { if (!w.root.isConnected) authWatchers.delete(w); else try { w.fn() } catch { /* next */ } } }
  for (const n of ['login', 'logout', 'sessionRestore']) try { events.on(n, all) } catch { /* old emitter */ }
}

// The data browser draws the pane again when the folder is reloaded (as it is after every change made here).
// What the person set, and the last message, are kept per folder so the new drawing carries on from the old.
const kept = new Map()

const pane = {
  name: 'folder-lab',
  icon: ICON,

  label (subject) {
    return isFolder(subject) ? 'Files' : null
  },

  shouldGetFocus (subject) {
    return isFolder(subject)
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const $rdf = globalThis.$rdf || (globalThis.UI && globalThis.UI.rdf)
    const sym = (uri) => store.sym(uri)
    const authFetch = (url, init) => webFetch(store)(url, init)
    const folderUri = subject.uri
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null
    const shared = suite ? suite.state : {} // what render, renderNavigation and renderDetails share in the shell

    const root = el(dom, 'div', 'fl folder-lab-pane fl-root')
    root.appendChild(el(dom, 'style', null, CSS))

    const memo = kept.get(folderUri) || {}
    kept.set(folderUri, memo)
    const state = {
      items: [], loaded: false, error: '', sort: memo.sort || 'name', dir: memo.dir || 1, filter: memo.filter || '', showHidden: !!memo.showHidden,
      view: suite && memo.view === 'recent' ? 'recent' : 'all',
      canWrite: false, busy: false, open: null, // open = { uri, kind: 'delete'|'rename' }
      selected: '' // the row whose details are open
    }
    const remember = () => Object.assign(memo, { sort: state.sort, dir: state.dir, filter: state.filter, showHidden: state.showHidden, view: state.view })

    // --- top: where we are, and "+ New"
    const top = root.appendChild(el(dom, 'div', 'fl-toolbar fl-top'))
    const crumbs = top.appendChild(el(dom, 'ol', 'fl-crumbs', null, { 'aria-label': 'Folder path' }))
    const write = top.appendChild(el(dom, 'span', 'fl-write'))
    write.hidden = true
    const newBtn = write.appendChild(button(dom, 'New', 'fl-btn-primary fl-new', () => toggleMenu(), MDI.plus))
    newBtn.setAttribute('aria-haspopup', 'menu')
    newBtn.setAttribute('aria-expanded', 'false')
    const picker = write.appendChild(el(dom, 'input', 'fl-picker'))
    picker.type = 'file'
    picker.multiple = true
    picker.hidden = true
    picker.addEventListener('change', () => { const files = [...(picker.files || [])]; picker.value = ''; if (files.length) upload(files) })
    const menu = top.appendChild(el(dom, 'div', 'fl-popover fl-newmenu', null, { role: 'menu', 'aria-label': 'New' }))
    menu.hidden = true
    const menuList = menu.appendChild(el(dom, 'ul', 'fl-menu'))
    menuList.appendChild(el(dom, 'li')).appendChild(menuItem(dom, 'Upload files', 'fl-upload', MDI.upload, () => { toggleMenu(false); picker.click() }))
    menuList.appendChild(el(dom, 'li')).appendChild(menuItem(dom, 'New folder', 'fl-newfolder', MDI.folderPlus, () => { toggleMenu(false); newFolder() }))
    const makersBox = menu.appendChild(el(dom, 'div', 'fl-makers'))

    // --- tools for everyone: filter, show hidden, refresh
    const bar = root.appendChild(el(dom, 'div', 'fl-toolbar fl-bar'))
    const search = bar.appendChild(el(dom, 'label', 'fl-search'))
    search.appendChild(icon(dom, MDI.search))
    search.appendChild(el(dom, 'span', 'fl-sr', 'Filter by name'))
    const filter = search.appendChild(el(dom, 'input', 'fl-input fl-filter'))
    filter.type = 'search'
    filter.placeholder = 'Filter'
    filter.value = state.filter
    filter.addEventListener('input', () => { state.filter = filter.value; remember(); drawList() })
    const hiddenLabel = bar.appendChild(el(dom, 'label', 'fl-switch'))
    const hiddenBox = hiddenLabel.appendChild(el(dom, 'input', 'fl-hidden', null, { role: 'switch' }))
    hiddenBox.type = 'checkbox'
    hiddenBox.checked = state.showHidden
    hiddenBox.addEventListener('change', () => { state.showHidden = hiddenBox.checked; remember(); drawList() })
    hiddenLabel.appendChild(el(dom, 'span', null, 'Show hidden'))
    const refresh = bar.appendChild(button(dom, '', 'fl-btn-icon fl-refresh', () => load(true), MDI.sync))
    refresh.setAttribute('aria-label', 'Refresh')
    refresh.title = 'Refresh'

    const ask = root.appendChild(el(dom, 'div', 'fl-note fl-ask'))
    ask.hidden = true
    const status = root.appendChild(el(dom, 'div', 'fl-status', null, { role: 'status', 'aria-live': 'polite' }))
    const mintOut = root.appendChild(el(dom, 'div', 'fl-mintout')) // what a minting pane draws (messages, setup)
    const list = root.appendChild(el(dom, 'div', 'fl-list'))
    const foot = root.appendChild(el(dom, 'p', 'fl-foot'))

    const say = (kind, text) => {
      status.className = 'fl-status' + (kind ? ' fl-' + kind : '')
      status.textContent = text || ''
      memo.said = kind === 'work' ? null : { kind, text, at: Date.now() }
    }
    if (memo.said && Date.now() - memo.said.at < 20000) say(memo.said.kind, memo.said.text)
    const setBusy = (busy) => {
      state.busy = busy
      for (const b of root.querySelectorAll('.fl-write button, .fl-newmenu button, .fl-acts button, .fl-strip button')) b.disabled = busy
    }

    // --- popovers (the New menu, a row's actions): one open at a time; a click outside or Escape closes them
    const triggers = new WeakMap()
    function setPop (pop, open) { pop.hidden = !open; const b = triggers.get(pop); if (b) b.setAttribute('aria-expanded', String(open)) }
    function closePops (except) { for (const p of root.querySelectorAll('.fl-popover')) if (p !== except && !p.hidden) setPop(p, false) }
    triggers.set(menu, newBtn)
    dom.addEventListener('click', function outside (e) {
      if (!root.isConnected) { dom.removeEventListener('click', outside); return }
      for (const p of root.querySelectorAll('.fl-popover')) {
        const b = triggers.get(p)
        if (!p.hidden && !p.contains(e.target) && !(b && b.contains(e.target))) setPop(p, false)
      }
    })
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      const open = [...root.querySelectorAll('.fl-popover')].find(p => !p.hidden)
      if (open) { e.stopPropagation(); setPop(open, false); const b = triggers.get(open); if (b) b.focus() }
    })

    // --- breadcrumbs, up to the pod root
    let podRoot = null
    function drawCrumbs () {
      crumbs.replaceChildren()
      const url = new URL(folderUri)
      const segments = url.pathname.split('/').filter(Boolean)
      const levels = [url.origin + '/']
      segments.forEach((s, i) => levels.push(url.origin + '/' + segments.slice(0, i + 1).join('/') + '/'))
      let start = 0
      if (podRoot && levels.includes(podRoot)) start = levels.indexOf(podRoot)
      levels.slice(start).forEach((level, i, shown) => {
        const li = crumbs.appendChild(el(dom, 'li'))
        const text = level === url.origin + '/' ? url.host : decode(localName(level))
        if (i === shown.length - 1) { li.appendChild(el(dom, 'span', 'fl-here', text, { 'aria-current': 'page' })); return }
        li.appendChild(openLink(level, text, null))
      })
    }
    async function findPodRoot () {
      // 1. A server that marks its storage root (Link: <pim:Storage>; rel="type").
      const url = new URL(folderUri)
      const segments = url.pathname.split('/').filter(Boolean)
      const levels = [url.origin + '/']
      segments.slice(0, -1).forEach((s, i) => levels.push(url.origin + '/' + segments.slice(0, i + 1).join('/') + '/'))
      const marked = await Promise.all(levels.map(level => authFetch(level, { method: 'HEAD' })
        .then(r => /pim\/space#Storage/.test(r.headers.get('link') || '') ? level : null, () => null)))
      const found = marked.filter(Boolean).pop()
      if (found) return found
      // 2. A storage named in a profile already loaded (the logged-in person's, usually).
      const storages = store.statementsMatching(null, sym(SPACE_STORAGE), null).map(st => st.object.value)
        .filter(s => s.endsWith('/') && folderUri.startsWith(s)).sort((a, b) => b.length - a.length)
      return storages[0] || null
    }

    // A link that opens in the data browser (or the shell), with a real href to fall back on.
    function openLink (uri, text, className) {
      const a = el(dom, 'a', className, text)
      a.href = /^https?:/i.test(uri) ? uri : '#'
      a.rel = 'noopener'
      a.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const outliner = context.getOutliner && context.getOutliner(dom)
        if (!outliner || !outliner.GotoSubject) return
        event.preventDefault()
        outliner.GotoSubject(sym(uri), true, undefined, true, undefined)
      })
      return a
    }

    // --- the listing
    async function load (force) {
      try {
        if (force) await store.fetcher.load(subject, { force: true, clearPreviousData: true })
        else await store.fetcher.load(subject)
        state.error = ''
        state.items = readItems(store, subject)
        state.raw = false
      } catch (error) {
        const code = (error && (error.status || (error.response && error.response.status))) || 0
        // Some servers list names with spaces unescaped, which no RDF parser accepts: read the JSON listing directly.
        const raw = [401, 403, 404].includes(code) ? null : await readRaw().catch(() => null)
        if (raw) { state.error = ''; state.items = raw; state.raw = true; state.loaded = true; drawList(); return }
        state.error = code === 401 ? 'This folder is private. Log in to see what is in it.'
          : code === 403 ? 'You are not allowed to see what is in this folder.'
            : code === 404 ? 'There is no folder here.'
              : 'Could not read this folder: ' + (error && error.message ? error.message : error)
      }
      if (state.error) state.items = []
      state.loaded = true
      drawList()
    }

    async function readRaw () {
      const r = await authFetch(folderUri, { headers: { Accept: 'application/ld+json' }, cache: 'no-store' })
      if (!r.ok) return null
      const json = await r.json()
      const nodes = [].concat(json['@graph'] || json)
      const me = nodes.find(n => n && n['@id'] === folderUri) || nodes[0]
      const key = me && Object.keys(me).find(k => localName(k.replace(/^[a-z]+:/i, '')) === 'contains')
      if (!key) return null
      const val = (v) => v && typeof v === 'object' ? (v['@value'] ?? v['@id']) : v
      const pick = (node, names) => { const k = Object.keys(node).find(k => names.includes(localName(k.replace(/^[a-z]+:/i, '')))); return k ? val([].concat(node[k])[0]) : null }
      const items = []
      for (const entry of [].concat(me[key])) {
        const id = typeof entry === 'string' ? entry : entry && entry['@id']
        if (!id || !id.startsWith(folderUri) || id === folderUri) continue
        const raw = id.slice(folderUri.length)
        if (raw.replace(/\/$/, '').includes('/')) continue
        const dir = raw.endsWith('/')
        const name = decode(raw.replace(/\/$/, ''))
        const node = (typeof entry === 'object' && Object.keys(entry).length > 1 ? entry : nodes.find(n => n && n['@id'] === id)) || {}
        const size = pick(node, ['size'])
        const modified = pick(node, ['modified'])
        const mtime = pick(node, ['mtime'])
        items.push({ uri: folderUri + encodeURIComponent(name) + (dir ? '/' : ''), name, dir, size: dir || size == null ? null : Number(size), time: (modified && Date.parse(modified)) || (mtime ? Number(mtime) * 1000 : null), kind: kindOf(name, dir), hidden: isHidden(name) })
      }
      return items
    }

    const visible = () => {
      const q = state.filter.trim().toLowerCase()
      const rows = state.items.filter(i => (state.showHidden || !i.hidden) && (!q || i.name.toLowerCase().includes(q)))
      const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      // Recent: the files in this folder, the newest first.
      if (state.view === 'recent') return rows.filter(i => !i.dir).sort((a, b) => (b.time || 0) - (a.time || 0) || byName(a, b))
      const key = { name: byName, size: (a, b) => (a.size ?? -1) - (b.size ?? -1), date: (a, b) => (a.time || 0) - (b.time || 0) }[state.sort]
      // Folders first; ties (folders have no size) stay in name order whichever way the sort runs.
      return rows.sort((a, b) => (b.dir - a.dir) || state.dir * key(a, b) || byName(a, b))
    }
    const summary = () => {
      const folders = state.items.filter(i => i.dir && !i.hidden).length
      const files = state.items.filter(i => !i.dir && !i.hidden).length
      return `${plural(folders, 'folder')}, ${plural(files, 'file')}`
    }
    // What renderDetails is given to draw: a row's item, or the folder itself.
    const itemFor = (uri) => {
      if (uri === folderUri) return { uri, name: folderName(uri), dir: true, kind: 'folder', summary: state.loaded && !state.error ? summary() : '' }
      return state.items.find(i => i.uri === uri) || null
    }
    Object.assign(shared, { itemFor, draw: () => drawList(), setView: (v) => { state.view = v; remember(); drawList() }, view: () => state.view, podRoot: () => podRoot })

    function sortButton (label, key, className) {
      const b = el(dom, 'button', 'fl-btn fl-sort ' + className, label)
      b.type = 'button'
      b.dataset.sort = key
      const on = state.sort === key
      b.setAttribute('aria-pressed', String(on))
      if (on) b.textContent = label + (state.dir > 0 ? ' ↑' : ' ↓')
      b.title = 'Sort by ' + label.toLowerCase()
      b.addEventListener('click', () => {
        if (state.sort === key) state.dir = -state.dir
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1 }
        remember()
        drawList()
      })
      return b
    }

    function emptyState (title, text, path, className) {
      const box = el(dom, 'div', 'fl-empty' + (className ? ' ' + className : ''))
      box.appendChild(el(dom, 'span', 'fl-empty-icon')).appendChild(icon(dom, path))
      box.appendChild(el(dom, 'p', 'fl-empty-title', title))
      if (text) box.appendChild(el(dom, 'p', 'fl-empty-text', text))
      return box
    }

    function drawList () {
      list.replaceChildren()
      if (!state.loaded) { list.appendChild(el(dom, 'p', 'fl-loading', 'Loading…')); return }
      if (state.error) { list.appendChild(emptyState('Cannot show this folder', state.error, MDI.alert, 'fl-error')); foot.textContent = ''; setBusy(state.busy); return }
      const recent = state.view === 'recent'
      if (!recent) {
        const head = list.appendChild(el(dom, 'div', 'fl-head'))
        head.append(el(dom, 'span', 'fl-hico'), sortButton('Name', 'name', 'fl-hname'), sortButton('Size', 'size', 'fl-hsize'), sortButton('Modified', 'date', 'fl-hdate'), el(dom, 'span', 'fl-hacts'))
      }
      const rows = visible()
      const body = list.appendChild(el(dom, 'ul', 'fl-rows', null, { 'aria-label': recent ? 'Recent files' : 'Files' }))
      if (!rows.length) {
        const shown = state.items.filter(i => state.showHidden || !i.hidden).length
        if (state.filter.trim() && shown) list.appendChild(emptyState(`Nothing here matches “${state.filter.trim()}”.`, '', MDI.search))
        else if (recent) list.appendChild(emptyState('No files here yet.', '', MDI.clock))
        else list.appendChild(emptyState('This folder is empty.', state.canWrite ? 'Drop files here, or use New.' : '', MDI.folder))
      }
      for (const item of rows) {
        body.appendChild(drawRow(item))
        if (state.canWrite && state.open && state.open.uri === item.uri) body.appendChild(state.open.kind === 'delete' ? deleteStrip(item) : renameStrip(item))
        if (!suite && state.selected === item.uri) body.appendChild(inlineDetails(item))
      }
      const hiddenCount = state.items.filter(i => i.hidden).length
      foot.textContent = (recent ? 'Recent files in this folder, newest first · ' : '') + summary() +
        (hiddenCount && !state.showHidden ? ` · ${hiddenCount} hidden` : '') +
        (state.raw ? ' · read from the server’s JSON listing, as its Turtle listing would not parse' : '')
      setBusy(state.busy)
    }

    function drawRow (item) {
      const row = el(dom, 'li', 'fl-row' + (item.dir ? ' fl-isdir' : '') + (item.hidden ? ' fl-ishidden' : ''), null, { 'aria-selected': String(state.selected === item.uri) })
      row.dataset.uri = item.uri
      row.dataset.name = item.name
      row.appendChild(el(dom, 'span', 'fl-row-icon', null, { 'data-kind': item.kind })).appendChild(icon(dom, MDI[item.kind] || MDI.file))
      const main = row.appendChild(el(dom, 'span', 'fl-row-main'))
      main.appendChild(openLink(item.uri, item.name, 'fl-row-title fl-name'))
      main.appendChild(el(dom, 'span', 'fl-row-sub fl-meta', [item.dir ? 'Folder' : sizeLabel(item.size), dateLabel(item.time)].filter(Boolean).join(' · ')))
      row.appendChild(el(dom, 'span', 'fl-row-meta fl-size', item.dir ? '' : sizeLabel(item.size)))
      const date = row.appendChild(el(dom, 'span', 'fl-row-meta fl-date', dateLabel(item.time)))
      if (item.time) date.title = new Date(item.time).toISOString()

      // Actions: one button with a menu (Details for everyone; Rename and Delete for those who may write).
      const acts = row.appendChild(el(dom, 'span', 'fl-row-actions fl-acts'))
      const more = acts.appendChild(button(dom, '', 'fl-btn-icon fl-more', null, MDI.dots))
      more.setAttribute('aria-label', 'Actions for ' + item.name)
      more.setAttribute('aria-haspopup', 'menu')
      more.setAttribute('aria-expanded', 'false')
      const pop = acts.appendChild(el(dom, 'div', 'fl-popover fl-rowmenu', null, { role: 'menu', 'aria-label': 'Actions for ' + item.name }))
      pop.hidden = true
      triggers.set(pop, more)
      const ul = pop.appendChild(el(dom, 'ul', 'fl-menu'))
      const add = (b) => ul.appendChild(el(dom, 'li')).appendChild(b)
      add(menuItem(dom, 'Details', 'fl-show-details', MDI.info, () => { setPop(pop, false); select(item) }))
      if (state.canWrite) {
        if (!item.dir) add(menuItem(dom, 'Rename', 'fl-rename', MDI.pencil, () => { setPop(pop, false); state.open = { uri: item.uri, kind: 'rename' }; drawList() }))
        add(menuItem(dom, 'Delete', 'fl-delete', MDI.delete, () => { setPop(pop, false); state.open = { uri: item.uri, kind: 'delete' }; drawList() }))
      }
      more.addEventListener('click', () => { const open = pop.hidden; closePops(pop); setPop(pop, open); if (open) { const f = pop.querySelector('button'); if (f) f.focus() } })
      // A click on the row itself (not its link or buttons) selects it and shows its details.
      row.addEventListener('click', (e) => { if (!e.target.closest('a, button, input, .fl-popover')) select(item) })
      return row
    }

    // --- details: in the shell, its right column; alone, under the row
    function select (item) {
      if (suite) {
        state.selected = item.uri
        for (const r of list.querySelectorAll('.fl-row')) r.setAttribute('aria-selected', String(r.dataset.uri === item.uri))
        const shown = suite.showDetails(sym(item.uri), { onClose: () => { if (state.selected !== item.uri) return; state.selected = ''; for (const r of list.querySelectorAll('.fl-row[aria-selected="true"]')) r.setAttribute('aria-selected', 'false') } })
        if (!shown) { state.selected = ''; drawList() }
      } else {
        state.selected = state.selected === item.uri ? '' : item.uri
        drawList()
      }
    }
    function inlineDetails (item) {
      const li = el(dom, 'li', 'fl-inline-details')
      li.appendChild(detailsView(dom, context, item, { onClose: () => { state.selected = ''; drawList() } }))
      return li
    }

    // --- write access: logged in, and the server says this person may write here
    async function checkAccess () {
      let can = false
      if (currentUser(context)) {
        try {
          const r = await authFetch(folderUri, { method: 'HEAD' })
          const modes = userModes(r.headers.get('wac-allow'))
          can = modes ? modes.includes('write') : !!(store.updater && store.updater.editable(folderUri, store))
        } catch { can = false }
      }
      state.canWrite = can
      write.hidden = !can
      if (!can) { state.open = null; closeAsk(); setPop(menu, false) }
      drawList()
    }

    // --- a question above the list; resolves with the chosen button's value (and the typed text)
    let askDone = null
    function closeAsk () { ask.hidden = true; ask.replaceChildren(); if (askDone) { const d = askDone; askDone = null; d({ choice: null }) } }
    function askUser ({ text, input, value, choices, warn }) {
      closeAsk()
      return new Promise(resolve => {
        askDone = resolve
        ask.className = 'fl-note fl-ask' + (warn ? ' fl-note-warning fl-warn' : '')
        ask.appendChild(el(dom, 'p', 'fl-asktext', text))
        let field = null
        const finish = (choice) => { const v = field ? field.value : ''; askDone = null; ask.hidden = true; ask.replaceChildren(); resolve({ choice, value: v }) }
        if (input) {
          field = el(dom, 'input', 'fl-input fl-askinput')
          field.type = 'text'
          field.value = value || ''
          field.setAttribute('aria-label', input)
          field.placeholder = input
          field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(choices[0].value) } if (e.key === 'Escape') finish(null) })
          ask.appendChild(field)
        }
        for (const c of choices) ask.appendChild(button(dom, c.label, c.className || '', () => finish(c.value)))
        ask.appendChild(button(dom, 'Cancel', 'fl-btn-tertiary fl-cancel', () => finish(null)))
        ask.hidden = false
        if (field) field.focus()
      })
    }

    const childUri = (name, dir) => {
      const uri = folderUri + encodeURIComponent(name.trim()) + (dir ? '/' : '')
      // Belt and braces: the result must be a direct child of this folder.
      const rest = uri.slice(folderUri.length)
      if (!uri.startsWith(folderUri) || !rest || rest.replace(/\/$/, '').includes('/')) throw new Error('Not a name in this folder')
      return uri
    }
    const taken = (name) => state.items.some(i => i.name === name.trim())

    async function run (working, task) {
      if (state.busy) return
      setBusy(true)
      say('work', working)
      try {
        const done = await task()
        if (done) say(done[0], done[1])
      } catch (error) {
        say('bad', error && error.message ? error.message : String(error))
      } finally {
        state.busy = false
        await load(true)
      }
    }

    // --- new folder
    async function newFolder () {
      const { choice, value } = await askUser({ text: 'New folder in ' + folderName(folderUri) + ':', input: 'Folder name', choices: [{ label: 'Create', value: 'ok', className: 'fl-btn-primary' }] })
      if (!choice) return
      const problem = nameProblem(value)
      if (problem) { say('bad', problem); return }
      const name = value.trim()
      if (taken(name)) { say('bad', `“${name}” already exists here. Choose another name.`); return }
      await run(`Creating folder “${name}”…`, async () => {
        const r = await authFetch(childUri(name, true), { method: 'PUT', headers: { 'If-None-Match': '*' } })
        if (r.status === 409 || r.status === 412) return ['bad', `“${name}” already exists here. Nothing was changed.`]
        if (!r.ok) return ['bad', `Could not create “${name}” (${r.status}).`]
        return ['good', `Created folder “${name}”.`]
      })
    }

    // --- upload
    const typeFor = (file) => file.type || MIME[extOf(file.name)] || 'application/octet-stream'
    async function upload (files) {
      if (!state.canWrite || state.busy) return
      const good = []
      const notes = []
      for (const f of files) {
        const safe = f.name.trim().replace(/[\s<>"{}|^`%#?]+/g, '-')
        const problem = nameProblem(safe)
        if (problem) { notes.push(`Skipped “${f.name}”: ${problem}`); continue }
        if (safe !== f.name) notes.push(`“${f.name}” is saved as “${safe}”.`)
        good.push({ file: f, name: safe })
      }
      if (!good.length) { say('bad', notes.join(' ')); return }
      setBusy(true)
      let done = 0
      try {
        for (const { file, name } of good) {
          const uri = childUri(name, false)
          if (state.items.some(i => i.name === name && i.dir)) { notes.push(`Skipped “${name}”: a folder has that name.`); continue }
          say('work', `Uploading “${name}”…`)
          const put = (replace) => authFetch(uri, { method: 'PUT', headers: Object.assign({ 'Content-Type': typeFor(file) }, replace ? {} : { 'If-None-Match': '*' }), body: file })
          let r = taken(name) ? { status: 412 } : await put(false)
          if (r.status === 412) {
            const { choice } = await askUser({ text: `“${name}” already exists here. Replace it with the file you chose?`, warn: true, choices: [{ label: 'Replace', value: 'replace', className: 'fl-btn-danger' }, { label: 'Keep the old one', value: 'skip' }] })
            if (choice !== 'replace') { notes.push(`Kept the old “${name}”.`); continue }
            r = await put(true)
          }
          if (!r.ok) { notes.push(`Could not upload “${name}” (${r.status}).`); continue }
          done++
        }
        say(notes.length && !done ? 'bad' : 'good', [done ? `Uploaded ${plural(done, 'file')}.` : '', ...notes].filter(Boolean).join(' '))
      } catch (error) {
        say('bad', 'Upload stopped: ' + (error && error.message ? error.message : error))
      } finally {
        state.busy = false
        await load(true)
      }
    }
    // Drag and drop onto the list
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')
    list.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (state.canWrite) { e.dataTransfer.dropEffect = 'copy'; list.classList.add('fl-drag') } else e.dataTransfer.dropEffect = 'none' })
    list.addEventListener('dragleave', (e) => { if (!list.contains(e.relatedTarget)) list.classList.remove('fl-drag') })
    list.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return
      e.preventDefault() // never let the browser open a dropped file in place of the page
      list.classList.remove('fl-drag')
      if (!state.canWrite) { say('bad', 'You cannot upload to this folder.'); return }
      if (state.busy) { say('bad', 'Wait for the current task to finish, then drop the files again.'); return }
      const items = [...(e.dataTransfer.items || [])]
      const folders = items.filter(i => i.webkitGetAsEntry && i.webkitGetAsEntry() && i.webkitGetAsEntry().isDirectory).length
      const files = [...(e.dataTransfer.files || [])].filter((f, i) => !(items[i] && items[i].webkitGetAsEntry && items[i].webkitGetAsEntry() && items[i].webkitGetAsEntry().isDirectory))
      if (folders && !files.length) { say('bad', 'Folders cannot be uploaded; drop the files in them.'); return }
      if (files.length) upload(files)
    })

    // --- delete: one item, after a second click that names it; folders only when empty
    function deleteStrip (item) {
      const strip = el(dom, 'li', 'fl-note fl-note-error fl-strip fl-confirm')
      strip.appendChild(el(dom, 'p', null, item.dir
        ? `Delete the folder “${item.name}”? Only an empty folder can be deleted.`
        : `Delete “${item.name}”? This cannot be undone.`))
      // Say so when its own sharing rules go with it (looked up once per item while the question is open).
      const note = strip.appendChild(el(dom, 'p', 'fl-acl-note'))
      note.hidden = true
      const known = aclSeen.get(item.uri)
      const show = (a) => { if (a && a.exists) { note.textContent = `Its own sharing rules (${decode(localName(a.url))}) are deleted with it.`; note.hidden = false } }
      if (known) show(known)
      else ownAcl(authFetch, item.uri).then(a => { aclSeen.set(item.uri, a); show(a) }, () => {})
      strip.append(
        button(dom, 'Cancel', 'fl-btn-tertiary fl-no', () => { state.open = null; drawList() }),
        button(dom, `Delete “${item.name}”`, 'fl-btn-danger fl-yes', () => remove(item)))
      return strip
    }
    const aclSeen = new Map() // item -> its own ACL, for the delete question
    async function folderMembers (uri) {
      // A fresh listing, read straight from the server, not from the store's copy.
      if (!$rdf) throw new Error('Cannot read the folder to check it is empty.')
      const r = await authFetch(uri, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
      if (!r.ok) throw new Error(`Could not check what is in “${decode(localName(uri))}” (${r.status}).`)
      const g = $rdf.graph()
      $rdf.parse(await r.text(), g, uri, 'text/turtle')
      return g.each(g.sym(uri), g.sym(LDP_CONTAINS)).map(n => n.value)
        .filter(m => m !== uri + '.acl' && m !== uri + '.meta') // its own access rules and metadata go with it
    }
    async function remove (item) {
      state.open = null
      await run(`Deleting “${item.name}”…`, async () => {
        const rest = item.uri.slice(folderUri.length)
        if (!item.uri.startsWith(folderUri) || !rest || rest.replace(/\/$/, '').includes('/') || item.dir !== item.uri.endsWith('/')) throw new Error('Refused: that is not one item in this folder.')
        if (item.dir) {
          const members = await folderMembers(item.uri)
          if (members.length) {
            const names = members.slice(0, 3).map(m => decode(localName(m))).join(', ')
            return ['bad', `Not deleted: the folder “${item.name}” is not empty (${plural(members.length, 'item')}: ${names}${members.length > 3 ? ', …' : ''}). Delete what is in it first.`]
          }
        }
        // Its own access rules, found from the server (Link rel="acl"), before the item goes. They are deleted AFTER
        // the item: deleting them first would, for a moment or for good if the item's DELETE failed, leave the item
        // under its folder's (perhaps wider) rules. Left behind, they would apply to any new item of the same name.
        const acl = await ownAcl(authFetch, item.uri)
        aclSeen.delete(item.uri)
        const r = await authFetch(item.uri, { method: 'DELETE' })
        if (!r.ok && r.status !== 404) return ['bad', `Could not delete “${item.name}” (${r.status}).`]
        store.fetcher.unload && (() => { try { store.fetcher.unload(sym(item.uri)) } catch { /* not loaded */ } })()
        if (state.selected === item.uri) { state.selected = ''; if (suite) suite.closeDetails() }
        let rules = ''
        if (acl.exists !== false) {
          const still = await authFetch(acl.url, { method: 'HEAD', cache: 'no-store' }).catch(() => null)
          if (still && still.status !== 404) {
            const d = await authFetch(acl.url, { method: 'DELETE' }).catch(() => null)
            const after = await authFetch(acl.url, { method: 'HEAD', cache: 'no-store' }).catch(() => null)
            if (!after || after.status !== 404) return ['bad', `Deleted “${item.name}”, but NOT its own sharing rules (${decode(localName(acl.url))}, ${d ? d.status : 'no answer'}). A new item named “${item.name}” would get those rules: delete ${decode(localName(acl.url))} (Show hidden) before making one.`]
          }
          if (acl.exists) rules = ' and its own sharing rules'
        }
        return ['good', `Deleted “${item.name}”${rules}.`]
      })
    }

    // --- rename a file: copy, then delete the old one
    function renameStrip (item) {
      const strip = el(dom, 'li', 'fl-note fl-strip fl-renamer')
      strip.appendChild(el(dom, 'p', null, `Rename “${item.name}”. This copies the file to the new name, then deletes the old one; it is not atomic, so if it stops half way both may exist.`))
      const field = el(dom, 'input', 'fl-input fl-newname')
      field.type = 'text'
      field.value = item.name
      field.setAttribute('aria-label', 'New name')
      const go = () => rename(item, field.value)
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go() } if (e.key === 'Escape') { state.open = null; drawList() } })
      strip.append(field, button(dom, 'Cancel', 'fl-btn-tertiary fl-no', () => { state.open = null; drawList() }), button(dom, 'Rename', 'fl-btn-primary fl-yes', go))
      setTimeout(() => { if (field.isConnected) { field.focus(); field.setSelectionRange(0, item.name.replace(/\.[^.]*$/, '').length || item.name.length) } }, 0)
      return strip
    }
    async function rename (item, raw) {
      const problem = nameProblem(raw)
      if (problem) { say('bad', problem); return }
      const name = raw.trim()
      if (name === item.name) { state.open = null; drawList(); return }
      if (taken(name)) { say('bad', `“${name}” already exists here. Rename never replaces; choose another name.`); return }
      state.open = null
      await run(`Renaming “${item.name}” to “${name}”…`, async () => {
        const target = childUri(name, false)
        // Its own access rules, asked of the server (not the listing). A copy would not carry them, and the old ones
        // would be left behind for any new file of the old name: refuse rather than move them by hand.
        const acl = await ownAcl(authFetch, item.uri)
        if (acl.exists) return ['bad', `Not renamed: “${item.name}” has its own sharing rules, which a renamed copy would not keep (and the old rules would be left behind). Open its Sharing tab and go back to the folder's rules first, or keep the name.`]
        if (acl.exists === null) return ['bad', `Not renamed: could not check whether “${item.name}” has its own sharing rules.`]
        const tacl = await ownAcl(authFetch, target)
        if (tacl.exists !== false) return ['bad', `Not renamed: there are sharing rules left for the name “${name}” (${decode(localName(tacl.url))}), which the renamed file would get. Choose another name.`]
        const got = await authFetch(item.uri, { headers: { Accept: '*/*' }, cache: 'no-store' })
        if (!got.ok) return ['bad', `Not renamed: could not read “${item.name}” (${got.status}).`]
        const type = (got.headers.get('content-type') || MIME[extOf(item.name)] || 'application/octet-stream').split(';')[0]
        const body = await got.arrayBuffer()
        const put = await authFetch(target, { method: 'PUT', headers: { 'Content-Type': type, 'If-None-Match': '*' }, body })
        if (put.status === 412) return ['bad', `Not renamed: “${name}” already exists.`]
        if (!put.ok) return ['bad', `Not renamed: could not write “${name}” (${put.status}). “${item.name}” is unchanged.`]
        const del = await authFetch(item.uri, { method: 'DELETE' })
        if (!del.ok) return ['bad', `Copied to “${name}”, but could not delete “${item.name}” (${del.status}): both now exist.`]
        if (state.selected === item.uri) { state.selected = ''; if (suite) suite.closeDetails() }
        return ['good', `Renamed “${item.name}” to “${name}”.`]
      })
    }

    // --- "+ New": upload, a folder, or something another pane makes in a new folder here
    function toggleMenu (show = menu.hidden) {
      closePops(menu)
      setPop(menu, show)
      if (!show) return
      makersBox.replaceChildren()
      const makers = creationPanes(context)
      makersBox.appendChild(el(dom, 'p', 'fl-caption fl-menuhead', makers.length ? 'New, in its own folder' : 'No pane here can make other new things.'))
      const ul = makersBox.appendChild(el(dom, 'ul', 'fl-menu'))
      const nouns = new Set() // two panes that make the same thing: the first one only
      for (const p of makers) {
        const noun = paneNoun(store, p)
        if (nouns.has(noun.toLowerCase())) continue
        nouns.add(noun.toLowerCase())
        const b = el(dom, 'button', 'fl-menu-item fl-make', null, { type: 'button', role: 'menuitem' })
        b.dataset.pane = p.name
        if (typeof p.icon === 'string' && p.icon.startsWith('data:image/')) b.appendChild(el(dom, 'img', 'fl-make-icon', null, { src: p.icon, alt: '' }))
        else b.appendChild(icon(dom, MDI.file))
        b.appendChild(el(dom, 'span', null, noun))
        b.addEventListener('click', () => { toggleMenu(false); mint(p, noun) })
        ul.appendChild(el(dom, 'li')).appendChild(b)
      }
      // Under the button, but never past the toolbar's right edge.
      menu.style.left = Math.max(0, Math.min(newBtn.offsetLeft, top.clientWidth - menu.offsetWidth)) + 'px'
      const first = menu.querySelector('button')
      if (first) first.focus()
    }
    async function mint (p, noun) {
      const isFile = String(p.name).toLowerCase() === 'source'
      const { choice, value } = await askUser({ text: `New ${noun.toLowerCase()} in ${folderName(folderUri)}:`, input: isFile ? 'File name, with an extension' : noun + ' name', choices: [{ label: 'Create', value: 'ok', className: 'fl-btn-primary' }] })
      if (!choice) return
      const problem = nameProblem(value)
      if (problem) { say('bad', problem); return }
      const name = value.trim()
      if (isFile && !/\.[a-z0-9]+$/i.test(name)) { say('bad', 'A new file needs an extension, such as .txt, .ttl or .json.'); return }
      if (taken(name)) { say('bad', `“${name}” already exists here. Choose another name.`); return }
      const me = currentUser(context)
      if (!me) { say('bad', 'Log in to make new things.'); return }
      mintOut.replaceChildren()
      const out = el(dom, 'div')
      mintOut.appendChild(out)
      let made = null
      await run(`Making ${noun.toLowerCase()} “${name}”…`, async () => {
        const options = { folder: subject, newBase: childUri(name, true), title: name, pane: p, noun, div: out, dom, me, iconEle: dom.createElement('img'), noIndexHTML: true }
        let timer
        const result = await Promise.race([
          Promise.resolve().then(() => p.mintNew(context, options)),
          new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`The ${noun.toLowerCase()} pane did not finish within ${MINT_TIMEOUT / 1000} seconds; refresh before trying again.`)), MINT_TIMEOUT) })
        ]).finally(() => clearTimeout(timer))
        if (!result || !result.newInstance) {
          const said = out.textContent.trim()
          return ['bad', `Could not make “${name}”: ` + (said ? `the ${noun.toLowerCase()} pane said:` : 'the pane did not return anything new.')]
        }
        made = result.newInstance
        return ['good', `Made ${noun.toLowerCase()} “${name}”.`]
      }).catch(() => {})
      if (!out.textContent.trim()) mintOut.replaceChildren()
      if (made && root.isConnected) {
        const outliner = context.getOutliner && context.getOutliner(dom)
        if (outliner && outliner.GotoSubject) outliner.GotoSubject(made, true, undefined, true, undefined)
      }
    }

    // --- follow logins and logouts (one module-level listener; this drawing is dropped once it leaves the page)
    // A session event for the same person (a restore, a token refresh) only re-checks access: a forced reload makes
    // the data browser redraw everything, which would drop a click or close the details being used.
    const whoNow = () => { const u = currentUser(context); return u ? u.value || u.uri || String(u) : '' }
    let drawnFor = whoNow()
    watchAuth(root, () => { const now = whoNow(); checkAccess(); if (now !== drawnFor) { drawnFor = now; load(true) } })

    // --- the Sharing pane (in the details, which in the shell sit outside this root) says when it wrote rules for
    // something here: read the listing again, straight from the server, so the list (hidden .acl files, counts) and
    // the checks that use it are current. Not through the store: a forced reload makes the data browser redraw
    // everything, which would close the details the person is working in.
    dom.addEventListener('suite-sharing-change', function onShare (e) {
      if (!root.isConnected) { dom.removeEventListener('suite-sharing-change', onShare); return }
      const uri = e && e.detail && e.detail.uri
      if (typeof uri !== 'string' || !uri.startsWith(folderUri)) return
      if (uri !== folderUri && uri.slice(folderUri.length).replace(/\/$/, '').includes('/')) return
      aclSeen.delete(uri)
      if (state.busy) return
      readRaw().then(items => { if (items && root.isConnected && !state.busy) { state.items = items; state.sharingSeen = (state.sharingSeen || 0) + 1; root.dataset.sharingSeen = String(state.sharingSeen); drawList() } }, () => {})
    })

    drawCrumbs()
    drawList()
    load(false).then(checkAccess)
    findPodRoot().then(found => { if (found) { podRoot = found; drawCrumbs() } }, () => {})
    return root
  },

  // The shell's left column: "All files" (the pod's root folder) and "Recent" (this folder's files, newest first).
  renderNavigation (subject, context) {
    const suite = context.suite
    const shared = suite && suite.state
    if (!shared || !shared.setView) return null
    const dom = context.dom
    const nav = el(dom, 'ul', 'fl-nav-list')
    const items = []
    const mark = () => { const v = shared.view(); for (const b of items) { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current') } }
    for (const [view, label, path] of [['all', 'All files', MDI.folder], ['recent', 'Recent', MDI.clock]]) {
      const b = nav.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'fl-nav-item', null, { type: 'button', 'data-view': view }))
      b.appendChild(icon(dom, path))
      b.appendChild(el(dom, 'span', 'fl-nav-label', label))
      items.push(b)
      b.addEventListener('click', () => {
        if (view === 'all') {
          const top = shared.podRoot() || new URL(subject.uri).origin + '/'
          if (top !== subject.uri) {
            const m = kept.get(top); if (m) m.view = 'all'
            shared.setView('all')
            suite.go(top, { pane: 'folder-lab' })
            return
          }
        }
        shared.setView(view)
        mark()
      })
    }
    mark()
    return nav
  },

  // The shell's right column: one item of the list, or the folder itself (the shell's (i) button).
  renderDetails (node, context) {
    const shared = context.suite && context.suite.state
    if (!node || !node.uri) return null
    const item = (shared && shared.itemFor && shared.itemFor(node.uri)) ||
      { uri: node.uri, name: node.uri.endsWith('/') ? folderName(node.uri) : decode(localName(node.uri)), dir: node.uri.endsWith('/'), kind: kindOf(decode(localName(node.uri)), node.uri.endsWith('/')) }
    return detailsView(context.dom, context, item)
  }
}

export default pane
