// table-pane.js: a read-only table of the things a document (or a class) describes.
// A generic fallback for data that has no pane of its own: one row per thing, one column per property.
//
// One file, no imports. It offers "Table" as an extra view, never the first one, when
//   - the subject is a document in which 3 or more things share an rdf:type, or
//   - the subject is a class with 3 or more members in the store.
// It reads only what the data browser has already loaded into the store, and it never writes.
//
//   <#b1> a schema:Book ; schema:name "The Quiet Orchard" ; schema:numberOfPages 312 ; schema:author <#alice> .
//   <#b2> a schema:Book ; schema:name "Bridges of Salt" ; schema:genre "History", "Travel" .
//   <#b3> a schema:Book ; ...
//
// Columns are the properties those things use, most-used first. Headers come from the property's
// rdfs:label in the store, or its local name ("numberOfPages" reads "Number of pages").

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const NAME_PROPS = [
  'http://schema.org/name', 'https://schema.org/name', 'http://xmlns.com/foaf/0.1/name', 'http://www.w3.org/2006/vcard/ns#fn',
  'http://purl.org/dc/terms/title', 'http://purl.org/dc/elements/1.1/title', 'http://www.w3.org/2004/02/skos/core#prefLabel',
  'https://www.w3.org/ns/activitystreams#name', 'http://www.w3.org/ns/ui#label', RDFS_LABEL
]
const NUMBER_TYPES = ['integer', 'decimal', 'double', 'float', 'int', 'long', 'short', 'byte', 'nonNegativeInteger',
  'positiveInteger', 'negativeInteger', 'nonPositiveInteger', 'unsignedInt', 'unsignedLong', 'unsignedShort', 'unsignedByte']
const MIN_THINGS = 3 // fewer than this and a table is not worth offering
const FEW_COLUMNS = 8 // shown at first; the rest on request
const FEW_ROWS = 500 // drawn at first; the rest on request

// Icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box.
const MDI = {
  table: 'M5,4H19A2,2 0 0,1 21,6V18A2,2 0 0,1 19,20H5A2,2 0 0,1 3,18V6A2,2 0 0,1 5,4M5,8V12H11V8H5M13,8V12H19V8H13M5,14V18H11V14H5M13,14V18H19V14H13Z',
  search: 'M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z',
  copy: 'M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z',
  up: 'M7,15L12,10L17,15H7Z',
  down: 'M7,10L12,15L17,10H7Z',
  thing: 'M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L6.04,7.5L12,10.85L17.96,7.5L12,4.15M5,15.91L11,19.29V12.58L5,9.21V15.91M19,15.91V9.21L13,12.58V19.29L19,15.91Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)

const CSS = `
/* suite:design begin --prefix tbl --only icon,buttons,input,chip,empty,toast,details */
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
.tbl-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.tbl-root *, .tbl-root *::before, .tbl-root *::after { box-sizing: border-box }
.tbl-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.tbl-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.tbl-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.tbl-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.tbl-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.tbl-root [hidden] { display: none !important }
.tbl-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.tbl-muted { color: var(--sui-text-muted) }
.tbl-small { font-size: var(--sui-text-sm) }
.tbl-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.tbl-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.tbl-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.tbl-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.tbl-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.tbl-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --tbl-i set to url("data:image/svg+xml,...") ---------------------------------- */
.tbl-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--tbl-i) center / contain no-repeat; mask: var(--tbl-i) center / contain no-repeat }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.tbl-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.tbl-btn:hover { background: var(--sui-primary-light-hover) }
.tbl-btn:disabled, .tbl-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.tbl-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.tbl-btn-primary:hover { background: var(--sui-primary-element-hover) }
.tbl-btn-tertiary { background: transparent; color: var(--sui-text) }
.tbl-btn-tertiary:hover { background: var(--sui-bg-hover) }
.tbl-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.tbl-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.tbl-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.tbl-btn-icon:hover { background: var(--sui-bg-hover) }
.tbl-btn-wide { width: 100%; justify-content: flex-start }
.tbl-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.tbl-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.tbl-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.tbl-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.tbl-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.tbl-input:hover { border-color: var(--sui-primary-element) }
.tbl-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.tbl-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.tbl-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.tbl-search { position: relative; display: flex; align-items: center; min-width: 0 }
.tbl-search .tbl-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.tbl-search .tbl-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.tbl-select { position: relative; display: block; min-width: 0 }
.tbl-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.tbl-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.tbl-file { position: relative; overflow: hidden }
.tbl-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.tbl-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .tbl-row-check */
.tbl-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.tbl-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.tbl-check-round { border-radius: 50% }
.tbl-check:hover { border-color: var(--sui-primary-element) }
.tbl-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.tbl-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.tbl-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.tbl-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.tbl-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.tbl-segment:hover { background: var(--sui-bg-hover) }
.tbl-segment[aria-pressed="true"], .tbl-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.tbl-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.tbl-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.tbl-chip { cursor: pointer }
button.tbl-chip:hover { background: var(--sui-primary-light-hover) }
.tbl-chip-primary, .tbl-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.tbl-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.tbl-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.tbl-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.tbl-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.tbl-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.tbl-empty-icon .tbl-icon { width: 48px; height: 48px }
.tbl-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.tbl-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.tbl-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.tbl-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.tbl-toast-error { border-left-color: var(--sui-error) }
.tbl-toast-success { border-left-color: var(--sui-success) }
.tbl-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.tbl-status-error { color: var(--sui-error) }
.tbl-status-success { color: var(--sui-success) }
.tbl-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.tbl-note-error { background: var(--sui-error-light) }
.tbl-note-warning { background: var(--sui-warning-light) }
.tbl-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.tbl-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.tbl-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.tbl-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.tbl-details-figure .tbl-icon { width: 36px; height: 36px }
.tbl-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.tbl-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.tbl-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.tbl-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.tbl-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.tbl-tab:hover { color: var(--sui-text) }
.tbl-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.tbl-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.tbl-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.tbl-props dt { color: var(--sui-text-muted) }
.tbl-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.tbl.table-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8); container-type: inline-size; min-width: 0 }
.tbl-title { overflow-wrap: anywhere }
.tbl-meta { margin: var(--sui-space-1) 0 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
.tbl-types { margin: var(--sui-space-4) 0 0 }
.tbl-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2) var(--sui-space-3); margin: var(--sui-space-4) 0 var(--sui-space-3) }
.tbl-bar .tbl-search { flex: 1 1 220px; max-width: 360px }
.tbl-count { color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap; font-variant-numeric: tabular-nums }
.tbl-copy { margin-left: auto }
.tbl-sortbar { display: none; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2); margin: 0 0 var(--sui-space-3) }
.tbl-sortbar label { display: flex; flex: 1 1 200px; align-items: center; gap: var(--sui-space-2); min-width: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.tbl-sortbar select { flex: 1 1 auto; width: auto }
.tbl-scroll { overflow: auto; max-width: 100%; max-height: 70vh; border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg) }
.tbl table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100% }
.tbl th, .tbl td { height: var(--sui-target); padding: 0 var(--sui-space-3); text-align: left; vertical-align: middle; border-bottom: 1px solid var(--sui-border) }
.tbl tbody tr:last-child td { border-bottom: 0 }
.tbl tbody tr:hover td { background: var(--sui-bg-hover) }
.tbl tbody tr[aria-selected="true"] td { background: var(--sui-primary-light) }
.tbl-pick tbody tr:not(.tbl-none-row) { cursor: pointer }
.tbl-pick tbody tr:focus-visible { outline-offset: -2px }
.tbl th { position: sticky; top: 0; z-index: 1; padding: 0; background: var(--sui-bg); white-space: nowrap; font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text-muted) }
.tbl th .tbl-sort { display: flex; align-items: center; gap: var(--sui-space-1); width: 100%; min-height: calc(var(--sui-target) - 1px); padding: 0 var(--sui-space-2) 0 var(--sui-space-3); border: 0; background: transparent; color: inherit; font-weight: inherit; text-align: left; cursor: pointer }
.tbl th .tbl-sort:hover { background: var(--sui-bg-hover); color: var(--sui-text) }
.tbl th .tbl-sort:focus-visible { outline-offset: -2px }
.tbl th[aria-sort] { color: var(--sui-text) }
.tbl th.tbl-num .tbl-sort { justify-content: flex-end }
.tbl-arrow { display: inline-flex; width: var(--sui-icon); color: var(--sui-primary-element) }
.tbl td { max-width: 320px; overflow-wrap: anywhere }
.tbl td.tbl-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; min-width: 0 }
.tbl td.tbl-date { white-space: nowrap }
.tbl td.tbl-name { font-weight: var(--sui-weight-bold); min-width: 140px }
.tbl a { text-decoration: none }
.tbl a:hover { text-decoration: underline }
.tbl-sep { color: var(--sui-text-muted) }
.tbl td.tbl-none { height: auto; padding: var(--sui-space-6); text-align: center; color: var(--sui-text-muted) }
.tbl-foot { margin-top: var(--sui-space-3) }
.tbl-foot:empty { display: none }
.tbl-status { margin-top: var(--sui-space-2) }
.tbl-status:empty { display: none }
.tbl-csv { display: block; height: 160px; margin-top: var(--sui-space-2); font-family: var(--sui-font-mono); font-size: var(--sui-text-sm); white-space: pre; overflow: auto }
.tbl-side .tbl-props a { text-decoration: none }
.tbl-side .tbl-details-sub { overflow-wrap: anywhere }
@container (max-width: 600px) {
  .tbl-sortbar { display: flex }
  .tbl-copy { margin-left: 0 }
  .tbl-bar .tbl-search { max-width: none; flex-basis: 100% }
  .tbl-scroll { border: 0; border-radius: 0; background: none; overflow: visible; max-height: none }
  .tbl table, .tbl tbody, .tbl tr, .tbl td { display: block; width: auto; min-width: 0; max-width: none }
  .tbl thead { display: none }
  .tbl tbody tr { margin: 0 0 var(--sui-space-3); padding: var(--sui-space-1) 0 var(--sui-space-2); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg) }
  .tbl tbody tr:hover td { background: none }
  .tbl tbody tr:hover { background: var(--sui-bg-hover) }
  .tbl tbody tr[aria-selected="true"], .tbl tbody tr[aria-selected="true"] td { background: var(--sui-primary-light) }
  .tbl td { display: grid; grid-template-columns: minmax(84px, 38%) 1fr; gap: var(--sui-space-3); height: auto; border: 0; padding: var(--sui-space-1) var(--sui-space-4); min-width: 0 }
  .tbl td::before { content: attr(data-label); color: var(--sui-text-muted); overflow-wrap: anywhere }
  .tbl td.tbl-name { display: flex; align-items: center; min-height: var(--sui-target); padding: 0 var(--sui-space-4); font-size: var(--sui-text-lg); border-bottom: 1px solid var(--sui-border); margin-bottom: var(--sui-space-1) }
  .tbl td.tbl-name::before { content: none }
  .tbl td.tbl-num { text-align: left; white-space: normal }
  .tbl td.tbl-blank { display: none }
  .tbl tbody tr.tbl-none-row { border-style: dashed }
  .tbl tbody tr.tbl-none-row td::before { content: none }
  .tbl tbody tr.tbl-none-row td { display: block }
}
`

function icon (dom, path) {
  const span = dom.createElement('span')
  span.className = 'tbl-icon'
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--tbl-i', `url("${svg(path)}")`)
  return span
}

const localName = (uri) => {
  const tail = String(uri).replace(/[#/]+$/, '').split(/[#/]/).pop() || String(uri)
  try { return decodeURIComponent(tail) } catch { return tail }
}
// "numberOfPages" -> "Number of pages", "date_read" -> "Date read", "ISBN" stays "ISBN".
const ACRONYMS = new Set(['id', 'url', 'uri', 'iri', 'isbn', 'issn', 'doi', 'gtin', 'sku', 'iso', 'html', 'csv', 'pdf'])
const humanise = (name) => {
  const spaced = String(name).replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim()
  const words = spaced.split(/\s+/).map((w, i) => (/^[A-Z\d]+$/.test(w) && w.length > 1) ? w : ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
  return words.join(' ') || String(name)
}
const keyOf = (term) => term.termType + ' ' + term.value
const safeHref = (uri) => /^(https?:|mailto:|tel:)/i.test(uri) ? uri : null

function storeFrom (context) {
  return (context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store) || (globalThis.UI && globalThis.UI.store)
}

// What a subject offers: the things grouped by type, from one document or from a class.
function findGroups (store, subject) {
  if (!store || !subject || subject.termType !== 'NamedNode') return null
  const type = store.sym(RDF_TYPE)
  const doc = subject.doc ? subject.doc() : null
  if (doc && doc.value === subject.value) {
    const byType = new Map()
    for (const st of store.statementsMatching(null, type, null, doc)) {
      if (st.object.termType !== 'NamedNode' || st.subject.value === doc.value) continue // not the document itself
      if (!byType.has(st.object.value)) byType.set(st.object.value, { type: st.object, things: new Map() })
      byType.get(st.object.value).things.set(keyOf(st.subject), st.subject)
    }
    const groups = [...byType.values()].filter(g => g.things.size >= MIN_THINGS)
      .map(g => ({ type: g.type, things: [...g.things.values()] }))
      .sort((a, b) => b.things.length - a.things.length || a.type.value.localeCompare(b.type.value))
    if (groups.length) return { doc, groups }
  }
  const members = new Map()
  for (const st of store.statementsMatching(null, type, subject)) members.set(keyOf(st.subject), st.subject)
  if (members.size >= MIN_THINGS) return { doc: null, groups: [{ type: subject, things: [...members.values()] }] }
  return null
}

// A calendar day that really exists (no rolling 30 February into March; years under 100 stay as written).
function realDay (y, m, d) {
  const t = new Date(0)
  t.setUTCFullYear(y, m - 1, d)
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null
}
// A number as the reader writes it, or null to show it as written: integers exactly (BigInt, so 20 digits stay
// 20 digits), others only when finite and short enough for a double to hold every digit.
const INTEGERS = ['integer', 'int', 'long', 'short', 'byte', 'nonNegativeInteger', 'positiveInteger', 'negativeInteger', 'nonPositiveInteger', 'unsignedInt', 'unsignedLong', 'unsignedShort', 'unsignedByte']
function numberText (value, kind, maxFraction) {
  const v = String(value).trim()
  if (INTEGERS.includes(kind) && /^[+-]?\d+$/.test(v)) { try { return BigInt(v).toLocaleString() } catch { return null } }
  const n = Number(v)
  if (v === '' || !Number.isFinite(n)) return null
  if (v.replace(/^[+-]/, '').replace(/[eE].*$/, '').replace('.', '').replace(/^0+/, '').length > 15) return null
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFraction })
}

function nameOf (store, node, doc) {
  for (const p of NAME_PROPS) {
    const v = store.any(node, store.sym(p), null, doc || undefined) || (doc ? store.any(node, store.sym(p)) : null)
    if (v && v.termType === 'Literal' && v.value.trim()) return v.value.trim()
  }
  return null
}

// How a value reads, how it sorts, and what goes in the CSV.
function describe (store, term, doc) {
  if (term.termType === 'Literal') {
    const dt = term.datatype ? term.datatype.value : ''
    const kind = dt.startsWith(XSD) ? dt.slice(XSD.length) : ''
    if (NUMBER_TYPES.includes(kind) && term.value.trim() !== '' && !isNaN(Number(term.value))) {
      const n = Number(term.value)
      return { text: numberText(term.value, kind, 6) || term.value.trim(), sort: n, kind: 'num', raw: term.value }
    }
    if (kind === 'boolean') {
      const yes = term.value === 'true' || term.value === '1'
      return { text: yes ? 'true' : 'false', sort: yes ? 'true' : 'false', kind: 'text', raw: yes ? 'true' : 'false' }
    }
    const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(term.value)
    const real = day && realDay(Number(day[1]), Number(day[2]), Number(day[3]))
    if (kind === 'date' && real) {
      const t = real.getTime()
      return { text: new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' }), sort: t, kind: 'date', raw: term.value }
    }
    // A dateTime, or a plain string that is plainly one (some servers write dates untyped).
    if (real && (kind === 'dateTime' || ((!kind || kind === 'string') && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(term.value)))) {
      const t = Date.parse(term.value)
      if (!isNaN(t)) return { text: new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), sort: t, kind: 'date', raw: term.value }
    }
    return { text: term.value, sort: term.value, kind: 'text', raw: term.value }
  }
  if (term.termType === 'NamedNode') {
    const uri = term.value
    let text = nameOf(store, term, null)
    if (!text) {
      if (/^mailto:/i.test(uri)) text = uri.slice(7)
      else if (/^tel:/i.test(uri)) text = uri.slice(4)
      else if (/^https?:\/\/[^/]+\/?$/i.test(uri)) text = uri.replace(/^https?:\/\//i, '').replace(/\/$/, '')
      else text = humaniseValue(localName(uri))
    }
    return { text, sort: text, kind: 'link', raw: uri, node: term }
  }
  // A blank node: its name, or a few of its plain values.
  let text = nameOf(store, term, doc)
  if (!text) {
    const parts = store.statementsMatching(term, null, null).filter(st => st.object.termType === 'Literal' && st.predicate.value !== RDF_TYPE)
      .slice(0, 3).map(st => humanise(localName(st.predicate.value)) + ': ' + st.object.value)
    text = parts.length ? parts.join(', ') : '(no details)'
  }
  return { text, sort: text, kind: 'text', raw: text }
}
// Values such as schema:Paperback read as "Paperback"; leave other local names as they are.
const humaniseValue = (name) => /^[A-Za-z][a-z]+(?:[A-Z][a-z]+)+$/.test(name) ? humanise(name) : name

function headerOf (store, pred) {
  const label = store.any(pred, store.sym(RDFS_LABEL))
  if (label && label.value.trim()) {
    const text = label.value.trim()
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  return humanise(localName(pred.value))
}

// The rows and columns for one type.
function buildModel (store, group, doc) {
  const typeNode = store.sym(RDF_TYPE)
  const columns = new Map()
  let order = 0
  let otherTypes = false
  const rows = group.things.map(thing => {
    const seen = new Map()
    for (const st of store.statementsMatching(thing, null, null, doc || undefined)) {
      const p = st.predicate.value
      if (p === RDF_TYPE && st.object.value === group.type.value) continue
      if (p === RDF_TYPE) otherTypes = true
      if (!seen.has(p)) seen.set(p, new Map())
      seen.get(p).set(keyOf(st.object), st.object)
    }
    for (const p of seen.keys()) {
      if (!columns.has(p)) columns.set(p, { pred: store.sym(p), uses: 0, order: order++ })
      columns.get(p).uses++
    }
    return { thing, values: seen }
  })
  if (!otherTypes) columns.delete(RDF_TYPE)
  else if (columns.has(RDF_TYPE)) columns.get(RDF_TYPE).pred = typeNode

  // The name column: the naming property most of the rows use.
  let nameProp = null
  let best = 0
  for (const p of NAME_PROPS) {
    const c = columns.get(p)
    if (c && c.uses > best) { best = c.uses; nameProp = p }
  }
  const nameHeader = nameProp ? headerOf(store, store.sym(nameProp)) : 'Item'
  if (nameProp) columns.delete(nameProp)

  const cols = [...columns.values()].sort((a, b) => b.uses - a.uses || a.order - b.order).map(c => ({ pred: c.pred, uri: c.pred.value, header: headerOf(store, c.pred), kind: 'text' }))
  const model = {
    nameHeader,
    cols,
    rows: rows.map(({ thing, values }) => {
      const nameTerm = nameProp && values.get(nameProp) ? [...values.get(nameProp).values()].find(t => t.termType === 'Literal') : null
      const name = nameTerm ? nameTerm.value : (thing.termType === 'NamedNode' ? humaniseValue(localName(thing.value)) : '(unnamed)')
      const cells = cols.map(col => {
        const terms = values.has(col.uri) ? [...values.get(col.uri).values()] : []
        return terms.map(t => describe(store, t, doc)).sort((a, b) => compare(a.sort, b.sort))
      })
      const text = [name, ...cells.map(vs => vs.map(v => v.text).join(' '))].join(' \u0001 ').toLowerCase()
      return { thing, name, cells, text }
    })
  }
  // A column is numeric or a date when every value in it is.
  cols.forEach((col, i) => {
    const kinds = new Set()
    for (const row of model.rows) for (const v of row.cells[i]) kinds.add(v.kind)
    col.kind = kinds.size === 1 && (kinds.has('num') || kinds.has('date')) ? [...kinds][0] : 'text'
  })
  return model
}

function compare (a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

const csvCell = (text, numeric) => {
  let s = String(text)
  if (!numeric && /^[=+\-@\t\r]/.test(s)) s = "'" + s // keep spreadsheets from running it as a formula
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

const pane = {
  name: 'table',
  icon: svg(MDI.table, '#00679e'),

  label (subject, context) {
    try { return findGroups(storeFrom(context), subject) ? 'Table' : null } catch { return null }
  },

  // An alternative view, never the first one.
  shouldGetFocus () { return false },

  render (subject, context) {
    const dom = context.dom
    const store = storeFrom(context)
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null
    const el = (tag, cls, text) => {
      const node = dom.createElement(tag)
      if (cls) node.className = cls
      if (text !== undefined && text !== null) node.textContent = text
      return node
    }
    const root = el('div', 'tbl table-pane tbl-root')
    root.appendChild(el('style', null, CSS))

    let found = null
    try { found = findGroups(store, subject) } catch { found = null }
    if (!found) {
      const empty = root.appendChild(el('div', 'tbl-empty tbl-none'))
      empty.appendChild(el('span', 'tbl-empty-icon')).appendChild(icon(dom, MDI.table))
      empty.appendChild(el('h2', 'tbl-empty-title', 'Nothing here to show as a table'))
      empty.appendChild(el('p', 'tbl-empty-text', 'A table needs three or more things of the same type.'))
      return root
    }
    const { doc, groups } = found
    const typeName = (t) => headerOf(store, t)

    const title = el('h2', 'tbl-title')
    const meta = el('p', 'tbl-meta')
    root.append(title, meta)

    // Several types with 3+ things each: chips to pick one, the largest first.
    let typeChips = null
    if (groups.length > 1) {
      typeChips = el('div', 'tbl-chips tbl-types')
      typeChips.setAttribute('role', 'group')
      typeChips.setAttribute('aria-label', 'Type')
      groups.forEach((g, i) => {
        const chip = el('button', 'tbl-chip tbl-type', `${typeName(g.type)} · ${g.things.length}`)
        chip.type = 'button'
        chip.dataset.index = String(i)
        chip.setAttribute('aria-pressed', 'false')
        chip.title = g.type.value
        chip.addEventListener('click', () => pick(i))
        typeChips.appendChild(chip)
      })
      root.appendChild(typeChips)
    }

    const bar = el('div', 'tbl-bar')
    const search = el('label', 'tbl-search')
    search.appendChild(icon(dom, MDI.search))
    const filter = el('input', 'tbl-input tbl-filter')
    filter.type = 'search'
    filter.placeholder = 'Filter rows'
    filter.setAttribute('aria-label', 'Filter rows')
    search.appendChild(filter)
    const count = el('span', 'tbl-count')
    count.setAttribute('aria-live', 'polite')
    const copy = el('button', 'tbl-btn tbl-copy', 'Copy as CSV')
    copy.type = 'button'
    copy.prepend(icon(dom, MDI.copy))
    bar.append(search, count, copy)
    root.appendChild(bar)

    // On a phone the headers are hidden, so sorting is a menu.
    const sortbar = el('div', 'tbl-sortbar')
    const sortLabel = el('label', null, 'Sort by')
    const sortSelect = el('select', 'tbl-input tbl-sortby')
    const sortDir = el('button', 'tbl-btn tbl-btn-tertiary tbl-sortdir', 'Ascending')
    sortDir.type = 'button'
    sortLabel.appendChild(sortSelect)
    sortbar.append(sortLabel, sortDir)
    root.appendChild(sortbar)

    const scroll = el('div', 'tbl-scroll')
    if (suite) scroll.classList.add('tbl-pick')
    root.appendChild(scroll)
    const foot = el('div', 'tbl-foot tbl-btns')
    root.appendChild(foot)
    const status = el('p', 'tbl-status')
    status.setAttribute('role', 'status')
    root.appendChild(status)

    const state = { group: 0, model: null, sortCol: -1, dir: 1, query: '', allCols: false, allRows: false, csvBox: null, selected: null }

    const open = (node, event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
      try {
        const outliner = context.getOutliner && context.getOutliner(dom)
        if (outliner && outliner.GotoSubject) {
          event.preventDefault()
          outliner.GotoSubject(node, true, undefined, true, undefined)
        }
      } catch { /* follow the plain link */ }
    }
    const valueNode = (v) => {
      if (v.kind === 'link') {
        const href = safeHref(v.raw)
        if (!href) { const s = el('span', null, v.text); s.title = v.raw; return s }
        const a = el('a', null, v.text)
        a.href = href
        a.rel = 'noopener'
        a.title = v.raw
        if (/^https?:/i.test(href)) a.addEventListener('click', (e) => open(v.node, e))
        return a
      }
      return dom.createTextNode(v.text)
    }
    const thingLink = (row) => {
      if (row.thing.termType === 'NamedNode' && safeHref(row.thing.value)) {
        const a = el('a', null, row.name)
        a.href = row.thing.value
        a.rel = 'noopener'
        a.title = row.thing.value
        a.addEventListener('click', (e) => open(row.thing, e))
        return a
      }
      return dom.createTextNode(row.name)
    }

    const shownRows = () => {
      const m = state.model
      const words = state.query.toLowerCase().split(/\s+/).filter(Boolean)
      const rows = words.length ? m.rows.filter(r => words.every(w => r.text.includes(w))) : m.rows.slice()
      const i = state.sortCol // -1 is the name column
      const keyFor = (r) => i < 0 ? r.name : (r.cells[i][0] ? r.cells[i][0].sort : null)
      return rows.map((r, n) => ({ r, n, k: keyFor(r) })).sort((a, b) => {
        if (a.k === null && b.k === null) return a.n - b.n
        if (a.k === null) return 1 // empty cells last, whichever way
        if (b.k === null) return -1
        return state.dir * compare(a.k, b.k) || a.n - b.n
      }).map(x => x.r)
    }
    const visibleCols = () => state.allCols ? state.model.cols : state.model.cols.slice(0, FEW_COLUMNS)

    // In the shell, a row (not its links) opens that thing's properties in the details column.
    const select = (row, tr) => {
      if (!suite) return
      state.selected = row
      for (const r of scroll.querySelectorAll('tr[aria-selected]')) r.removeAttribute('aria-selected')
      tr.setAttribute('aria-selected', 'true')
      // The table may have been redrawn (sorted, filtered) since: clear whatever row is marked now.
      suite.showDetails(row.thing, {
        onClose: () => {
          if (state.selected !== row) return
          state.selected = null
          for (const r of scroll.querySelectorAll('tr[aria-selected]')) r.removeAttribute('aria-selected')
        }
      })
    }

    const drawTable = () => {
      const m = state.model
      const cols = visibleCols()
      const rows = shownRows()
      count.textContent = `${rows.length} of ${m.rows.length}`
      const table = el('table')
      const thead = el('thead')
      const hr = el('tr')
      const head = (text, i, kind, title) => {
        const th = el('th', kind === 'num' ? 'tbl-num' : null)
        th.scope = 'col'
        const b = el('button', 'tbl-sort')
        b.type = 'button'
        b.appendChild(el('span', null, text))
        const arrow = el('span', 'tbl-arrow')
        if (state.sortCol === i) arrow.appendChild(icon(dom, state.dir > 0 ? MDI.up : MDI.down))
        b.appendChild(arrow)
        if (title) b.title = title
        if (state.sortCol === i) th.setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending')
        b.addEventListener('click', () => {
          if (state.sortCol === i) state.dir = -state.dir
          else { state.sortCol = i; state.dir = 1 }
          drawTable()
        })
        th.appendChild(b)
        hr.appendChild(th)
      }
      head(m.nameHeader, -1, 'text', null)
      cols.forEach((c, i) => head(c.header, i, c.kind, c.uri))
      thead.appendChild(hr)
      table.appendChild(thead)
      const tbody = el('tbody')
      const limit = state.allRows ? rows.length : FEW_ROWS
      for (const row of rows.slice(0, limit)) {
        const tr = el('tr')
        if (state.selected === row) tr.setAttribute('aria-selected', 'true')
        const nameCell = el('td', 'tbl-name')
        nameCell.setAttribute('data-label', m.nameHeader)
        nameCell.appendChild(thingLink(row))
        tr.appendChild(nameCell)
        cols.forEach((c, i) => {
          const values = row.cells[i]
          const td = el('td', [c.kind === 'num' ? 'tbl-num' : c.kind === 'date' ? 'tbl-date' : '', values.length ? '' : 'tbl-blank'].filter(Boolean).join(' ') || null)
          td.setAttribute('data-label', c.header)
          values.forEach((v, n) => {
            if (n) td.appendChild(el('span', 'tbl-sep', ', '))
            td.appendChild(valueNode(v))
          })
          tr.appendChild(td)
        })
        if (suite) {
          // A row opens its details by click, or from the keyboard (the row is focusable; Enter or Space).
          tr.tabIndex = 0
          tr.addEventListener('click', (event) => { if (!event.target.closest('a, button')) select(row, tr) })
          tr.addEventListener('keydown', (event) => {
            if (event.target !== tr || (event.key !== 'Enter' && event.key !== ' ')) return
            event.preventDefault()
            select(row, tr)
          })
        }
        tbody.appendChild(tr)
      }
      if (!rows.length) {
        const tr = el('tr', 'tbl-none-row')
        const td = el('td', 'tbl-none', 'No rows match the filter.')
        td.colSpan = cols.length + 1
        tr.appendChild(td)
        tbody.appendChild(tr)
      }
      table.appendChild(tbody)
      scroll.replaceChildren(table)

      foot.replaceChildren()
      if (m.cols.length > FEW_COLUMNS) {
        const more = el('button', 'tbl-btn tbl-cols', state.allCols ? 'Show fewer columns' : `Show all ${m.cols.length + 1} columns`)
        more.type = 'button'
        more.addEventListener('click', () => { state.allCols = !state.allCols; drawSort(); drawTable() })
        foot.appendChild(more)
      }
      if (rows.length > limit) {
        const more = el('button', 'tbl-btn tbl-rows', `Show all ${rows.length} rows`)
        more.type = 'button'
        more.addEventListener('click', () => { state.allRows = true; drawTable() })
        foot.appendChild(more)
      }
      sortSelect.value = String(state.sortCol)
      sortDir.textContent = state.dir > 0 ? 'Ascending' : 'Descending'
    }

    const drawSort = () => {
      sortSelect.replaceChildren()
      const add = (text, i) => { const o = el('option', null, text); o.value = String(i); sortSelect.appendChild(o) }
      add(state.model.nameHeader, -1)
      visibleCols().forEach((c, i) => add(c.header, i))
      if (state.sortCol >= visibleCols().length) { state.sortCol = -1; state.dir = 1 }
    }

    const pick = (index) => {
      const g = groups[index]
      state.group = index
      state.model = buildModel(store, g, doc)
      state.sortCol = -1
      state.dir = 1
      state.allCols = false
      state.allRows = false
      if (state.selected && suite) suite.closeDetails()
      state.selected = null
      if (typeChips) for (const c of typeChips.children) c.setAttribute('aria-pressed', String(c.dataset.index === String(index)))
      title.textContent = typeName(g.type)
      const where = doc ? localName(doc.value) : 'the loaded data'
      meta.textContent = `${g.things.length} things in ${where} · ${state.model.cols.length + 1} properties · read only`
      meta.title = doc ? doc.value : g.type.value
      clearStatus()
      drawSort()
      drawTable()
    }

    const clearStatus = () => {
      status.textContent = ''
      status.className = 'tbl-status'
      if (state.csvBox) { state.csvBox.remove(); state.csvBox = null }
    }

    const csvText = () => {
      const m = state.model
      const lines = [[m.nameHeader, 'URI', ...m.cols.map(c => c.header)].map(h => csvCell(h, false)).join(',')]
      for (const row of shownRows()) {
        const cells = [csvCell(row.name, false), csvCell(row.thing.termType === 'NamedNode' ? row.thing.value : '', false)]
        m.cols.forEach((c, i) => cells.push(csvCell(row.cells[i].map(v => v.raw).join('; '), c.kind === 'num')))
        lines.push(cells.join(','))
      }
      return lines.join('\r\n') + '\r\n'
    }

    copy.addEventListener('click', async () => {
      clearStatus()
      const text = csvText()
      const rows = text.split('\r\n').length - 2
      try {
        if (!globalThis.navigator || !navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard')
        await navigator.clipboard.writeText(text)
        status.className = 'tbl-status tbl-status-success'
        status.textContent = `Copied ${rows} ${rows === 1 ? 'row' : 'rows'} as CSV.`
      } catch {
        status.className = 'tbl-status tbl-status-error tbl-bad'
        status.textContent = 'The browser did not allow copying. The CSV is below: select it and copy it yourself.'
        const box = el('textarea', 'tbl-input tbl-csv')
        box.readOnly = true
        box.value = text
        box.setAttribute('aria-label', 'CSV')
        status.after(box)
        state.csvBox = box
        box.focus()
        box.select()
      }
    })

    const setQuery = (text) => { state.query = text; drawTable() }
    filter.addEventListener('input', () => setQuery(filter.value))
    sortSelect.addEventListener('change', () => { state.sortCol = Number(sortSelect.value); drawTable() })
    sortDir.addEventListener('click', () => { state.dir = -state.dir; drawTable() })

    // What renderDetails and search need, for this showing.
    if (suite) {
      suite.state.table = {
        subject,
        doc,
        model: () => state.model,
        typeOf: () => groups[state.group].type,
        search: (q) => { filter.value = q; setQuery(q) },
        valueNode,
        thingLink
      }
    }

    pick(0)
    return root
  },

  // The details column (in the suite shell only): a row's thing with every property, or, from the shell's (i)
  // button, the table itself. Drawn from what render already built.
  renderDetails (node, context) {
    const t = context && context.suite && context.suite.state && context.suite.state.table
    if (!t || !node) return null
    const dom = context.dom
    const el = (tag, cls, text) => {
      const n = dom.createElement(tag)
      if (cls) n.className = cls
      if (text !== undefined && text !== null) n.textContent = text
      return n
    }
    const m = t.model()
    const box = el('div', 'tbl tbl-root tbl-side')
    const head = box.appendChild(el('div', 'tbl-details-head'))
    const figure = head.appendChild(el('span', 'tbl-details-figure'))
    const titles = head.appendChild(el('div', 'tbl-details-titles'))
    const body = box.appendChild(el('div', 'tbl-details-body'))
    const props = body.appendChild(el('dl', 'tbl-props'))
    const prop = (label, ...values) => {
      props.appendChild(el('dt', null, label))
      const dd = props.appendChild(el('dd'))
      values.forEach((v, n) => {
        if (n) dd.appendChild(el('span', 'tbl-sep', ', '))
        dd.appendChild(typeof v === 'string' ? dom.createTextNode(v) : v)
      })
    }
    const type = t.typeOf()
    if (node.value === t.subject.value) {
      figure.appendChild(icon(dom, MDI.table))
      titles.appendChild(el('h2', 'tbl-details-title', headerOf(storeFrom(context), type)))
      titles.appendChild(el('p', 'tbl-details-sub', 'Table · read only'))
      prop('Rows', String(m.rows.length))
      prop('Columns', String(m.cols.length + 1))
      prop('Type', type.value)
      prop('From', t.doc ? t.doc.value : 'the loaded data')
      prop('Properties', [m.nameHeader, ...m.cols.map(c => c.header)].join(', '))
      box.dataset.of = 'table'
      return box
    }
    const row = m.rows.find(r => r.thing.termType === node.termType && r.thing.value === node.value)
    if (!row) return null
    figure.appendChild(icon(dom, MDI.thing))
    const h = titles.appendChild(el('h2', 'tbl-details-title'))
    h.appendChild(t.thingLink(row))
    titles.appendChild(el('p', 'tbl-details-sub', headerOf(storeFrom(context), type)))
    m.cols.forEach((c, i) => { if (row.cells[i].length) prop(c.header, ...row.cells[i].map(t.valueNode)) })
    box.dataset.of = 'row'
    return box
  },

  // The shell's header search filters the rows, as the filter box does.
  search (query, context) {
    const t = context && context.suite && context.suite.state && context.suite.state.table
    if (t) t.search(query || '')
  }
}

export default pane
