// activity-pane.js: what changed lately, across a pod or under any folder. Read-only.
//
// Opens on a folder (the pod's root for "everything"). It walks the folder listings below it, breadth first,
// newest folder first within each level, and lists every file it finds by the time the server gives it:
//
//   <folder/> ldp:contains <folder/shopping.md>, <folder/polls/> .
//   <folder/shopping.md> dct:modified "2026-11-22T08:15:00Z" ; stat:size 30 .     (or stat:mtime, in seconds)
//
// A file with no time in its listing gets one HEAD request for its Last-Modified (a few at most). The newest
// Turtle / JSON-LD files are then read once each to see what they are (rdf:type), so a poll, an address book or a
// board is filed under its app and shown by its own title. Everything else goes by its file name.
//
// Limits, so a big pod stays quick: folders up to MAX_DEPTH levels below the start, at most MAX_FOLDERS folder
// listings, at most SNIFF documents read for their type, at most HEADS Last-Modified requests.
//
// Inside the suite shell it gives the shell its left column (the filters) and its right column (what was read).
// On its own it draws both itself. It never writes. One file, no imports.
// Icons: Material Design Icons (Apache 2.0). AGPL-3.0-or-later. Copyright (c) 2026 Melvin Carvalho.

const MAX_DEPTH = 4 // folders read: the start and up to four levels below it
const MAX_FOLDERS = 60 // folder listings read, at most
const SNIFF = 40 // Turtle / JSON-LD files read to learn what they are, newest first
const HEADS = 12 // HEAD requests for a Last-Modified, for files whose listing gives no time
const PARALLEL = 6 // requests at once
const PAGE = 50 // rows shown before "Show more"
const SNIFF_MAX = 256 * 1024 // a data file bigger than this is not read for its kind
const THUMB_MAX = 2 * 1024 * 1024 // a picture bigger than this gets an icon, not a preview

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const MODIFIED = ['http://purl.org/dc/terms/modified', 'http://purl.org/dc/elements/1.1/modified'] // JSS may store dct: as dc: (findings, 4)
const MTIME = 'http://www.w3.org/ns/posix/stat#mtime'
const SIZE = 'http://www.w3.org/ns/posix/stat#size'
const VCARD = 'http://www.w3.org/2006/vcard/ns#'
const WF = 'http://www.w3.org/2005/01/wf/flow#'
const SCHED = 'http://www.w3.org/ns/pim/schedule#'
const MEETING = 'http://www.w3.org/ns/pim/meeting#'
const PAD = 'http://www.w3.org/ns/pim/pad#'
const SCHEMA = ['http://schema.org/', 'https://schema.org/']
const TITLES = [
  'http://purl.org/dc/terms/title', 'http://purl.org/dc/elements/1.1/title', 'http://www.w3.org/2002/12/cal/ical#summary',
  VCARD + 'fn', 'http://www.w3.org/2000/01/rdf-schema#label', ...SCHEMA.map(s => s + 'name'), 'http://xmlns.com/foaf/0.1/name'
]

// ---- icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box ------------------------------------------
const MDI = {
  activity: 'M11,15H6L13,1V9H18L11,23V15Z',
  all: 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z',
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
  file: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z',
  document: 'M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z',
  data: 'M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z',
  image: 'M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z',
  contacts: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z',
  boards: 'M16,5V18H21V5M4,18H9V5H4M10,18H15V5H10V18Z',
  notes: 'M14,10H19.5L14,4.5V10M5,3H15L21,9V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3M5,12V14H19V12H5M5,16V18H14V16H5Z',
  pad: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  poll: 'M3,22V8H7V22H3M10,22V2H14V22H10M17,22V14H21V22H17Z',
  meeting: 'M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  lock: 'M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z'
}
const svgUri = (d, fill = '#000') => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="${d}"/></svg>`)

// ---- what a thing is: the suite's apps, then plain files --------------------------------------------------------
// Filters in the order shown. "files" is everything no app claims.
const KINDS = [
  { id: 'all', name: 'All activity', icon: 'all' },
  { id: 'files', name: 'Files', icon: 'file' },
  { id: 'photos', name: 'Photos', icon: 'image' },
  { id: 'notes', name: 'Notes', icon: 'notes' },
  { id: 'contacts', name: 'Contacts', icon: 'contacts' },
  { id: 'boards', name: 'Boards', icon: 'boards' },
  { id: 'pads', name: 'Pads', icon: 'pad' },
  { id: 'polls', name: 'Polls', icon: 'poll' },
  { id: 'meetings', name: 'Meetings', icon: 'meeting' }
]
const BY_TYPE = {
  [VCARD + 'AddressBook']: 'contacts', [VCARD + 'Individual']: 'contacts', [VCARD + 'Group']: 'contacts', [VCARD + 'Organization']: 'contacts',
  [WF + 'Tracker']: 'boards', [WF + 'Task']: 'boards', [WF + 'Open']: 'boards', [WF + 'Closed']: 'boards',
  [PAD + 'Notepad']: 'pads',
  [SCHED + 'SchedulableEvent']: 'polls',
  [MEETING + 'Meeting']: 'meetings',
  ...Object.fromEntries(SCHEMA.map(s => [s + 'NoteDigitalDocument', 'notes']))
}
// Links that give a document away even with no type on its subject (an address book's people file, a poll's results).
const BY_LINK = { [VCARD + 'inAddressBook']: 'contacts', [VCARD + 'includesGroup']: 'contacts', [WF + 'tracker']: 'boards', [SCHED + 'response']: 'polls', [PAD + 'next']: 'pads' }
const EXT = {
  photos: /\.(png|jpe?g|gif|webp|svg|avif|bmp|heic)$/i,
  notes: /\.(md|markdown)$/i
}
const RDF_FILE = /\.(ttl|jsonld|json-ld|n3|nt|rdf|owl)$/i
const fileIcon = (name) => /\.(pdf|docx?|odt|txt|html?|csv|xlsx?|ods|log)$/i.test(name) ? 'document' : RDF_FILE.test(name) ? 'data' : 'file'

// ---- styles: the suite design sheet, then this pane's own few rules ----------------------------------------------
const CSS = `
/* suite:design begin --prefix act --only icon,nav,row,buttons,chip,empty,toast,details */
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
.act-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.act-root *, .act-root *::before, .act-root *::after { box-sizing: border-box }
.act-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.act-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.act-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.act-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.act-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.act-root [hidden] { display: none !important }
.act-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.act-muted { color: var(--sui-text-muted) }
.act-small { font-size: var(--sui-text-sm) }
.act-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.act-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.act-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.act-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.act-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.act-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --act-i set to url("data:image/svg+xml,...") ---------------------------------- */
.act-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--act-i) center / contain no-repeat; mask: var(--act-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.act-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.act-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.act-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.act-nav-item:hover { background: var(--sui-bg-hover) }
.act-nav-item[aria-current="page"], .act-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.act-nav-item .act-icon { color: var(--sui-text-muted) }
.act-nav-item[aria-current] .act-icon { color: inherit }
.act-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.act-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.act-nav-new { margin-bottom: var(--sui-space-2) }
.act-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.act-list { margin: 0; padding: 0; list-style: none }
.act-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.act-row:hover { background: var(--sui-bg-hover) }
.act-row[aria-selected="true"], .act-row[aria-current="true"] { background: var(--sui-primary-light) }
.act-row-main { flex: 1 1 auto; min-width: 0 }
.act-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.act-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.act-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.act-row-actions { flex: none; display: flex; align-items: center }
.act-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.act-row-icon .act-icon { width: 28px; height: 28px }
.act-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .act-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.act-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.act-btn:hover { background: var(--sui-primary-light-hover) }
.act-btn:disabled, .act-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.act-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.act-btn-primary:hover { background: var(--sui-primary-element-hover) }
.act-btn-tertiary { background: transparent; color: var(--sui-text) }
.act-btn-tertiary:hover { background: var(--sui-bg-hover) }
.act-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.act-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.act-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.act-btn-icon:hover { background: var(--sui-bg-hover) }
.act-btn-wide { width: 100%; justify-content: flex-start }
.act-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.act-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.act-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.act-chip { cursor: pointer }
button.act-chip:hover { background: var(--sui-primary-light-hover) }
.act-chip-primary, .act-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.act-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.act-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.act-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.act-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.act-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.act-empty-icon .act-icon { width: 48px; height: 48px }
.act-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.act-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.act-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.act-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.act-toast-error { border-left-color: var(--sui-error) }
.act-toast-success { border-left-color: var(--sui-success) }
.act-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.act-status-error { color: var(--sui-error) }
.act-status-success { color: var(--sui-success) }
.act-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.act-note-error { background: var(--sui-error-light) }
.act-note-warning { background: var(--sui-warning-light) }
.act-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.act-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.act-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.act-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.act-details-figure .act-icon { width: 36px; height: 36px }
.act-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.act-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.act-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.act-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.act-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.act-tab:hover { color: var(--sui-text) }
.act-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.act-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.act-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.act-props dt { color: var(--sui-text-muted) }
.act-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.act.suite-activity { max-width: calc(var(--sui-content-max) + var(--sui-nav-width)); margin: 0 auto }
.act.suite-activity.act-in-shell { max-width: var(--sui-content-max) }
.act-frame { display: flex; align-items: stretch; min-width: 0 }
.act-side { flex: none; align-self: stretch; border-right: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg) 0 0 var(--sui-radius-lg) }
.act-main { flex: 1 1 auto; min-width: 0; padding: var(--sui-space-4) var(--sui-space-6) var(--sui-space-8) }
.act-in-shell .act-main { padding-top: var(--sui-space-2) }
.act-head { display: flex; flex-direction: column; gap: var(--sui-space-1); padding: 0 var(--sui-space-3) var(--sui-space-2) }
.act-chipbar { display: none; padding: var(--sui-space-2) var(--sui-space-3) }
.act-group { margin-top: var(--sui-space-3) }
.act-group-title { position: sticky; top: 0; z-index: 1; background: var(--sui-bg) }
.act-row-icon { color: var(--sui-text-muted) }
.act-kind-photos, .act-kind-notes, .act-kind-contacts, .act-kind-boards, .act-kind-pads, .act-kind-polls, .act-kind-meetings { color: var(--sui-primary-element) }
.act-thumb { width: 40px; height: 40px; border-radius: var(--sui-radius); object-fit: cover; background: var(--sui-bg-app) }
.act-row-sub .act-file, .act-when-sub { color: var(--sui-text-muted) }
.act-when-sub { display: none }
.act-login { margin: var(--sui-space-2) 0 var(--sui-space-3) }
.act-login .act-icon { margin-top: 2px; color: var(--sui-primary-light-text) }
.act-more { margin: var(--sui-space-4) var(--sui-space-3) 0 }
.act-foot { margin-top: var(--sui-space-6); padding: var(--sui-space-3) var(--sui-space-3) 0; border-top: 1px solid var(--sui-border) }
.act-foot .act-status { display: block; min-height: 0; padding: var(--sui-space-1) 0 }
.act-details-body .act-status { min-height: 0 }
.act-unread { margin: 0; padding-left: var(--sui-space-5); color: var(--sui-text-muted); overflow-wrap: anywhere }
@media (max-width: 900px) {
  .act-side { display: none }
  .act-chipbar { display: flex }
  .act-main { padding: var(--sui-space-3) var(--sui-space-2) var(--sui-space-8) }
}
@media (max-width: 520px) {
  .act-when-sub { display: inline }
  .act-row { padding-left: var(--sui-space-2) }
}
`

// ---- small helpers ---------------------------------------------------------------------------------------------
function el (dom, tag, className, text, attrs) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = text
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : String(v))
  return node
}
function icon (dom, name) {
  const span = el(dom, 'span', 'act-icon', null, { 'aria-hidden': 'true' })
  span.style.setProperty('--act-i', `url("${svgUri(MDI[name] || MDI.file)}")`)
  return span
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

const isFolder = (node) => !!node && node.termType === 'NamedNode' && node.value.endsWith('/')
const lastPart = (uri) => { const parts = String(uri).split('#')[0].replace(/\/+$/, '').split('/'); try { return decodeURIComponent(parts.pop()) } catch { return parts.pop() || uri } }
const httpOnly = (uri) => { try { const u = new URL(uri); return /^https?:$/.test(u.protocol) ? u.href : '' } catch { return '' } }
const hidden = (uri) => lastPart(uri).startsWith('.') // .acl, .meta, .git and the like

// ---- reading the pod -------------------------------------------------------------------------------------------
// Parse an RDF body into a fresh graph of its own (the shared store is left alone, and never goes stale).
function parse ($rdf, text, base, type) {
  return new Promise((resolve) => {
    const graph = $rdf.graph()
    const mime = /json/.test(type || '') ? 'application/ld+json' : 'text/turtle'
    try {
      $rdf.parse(text, graph, base, mime, (error) => resolve(error ? null : graph))
    } catch { resolve(null) }
  })
}

async function readRdf ($rdf, fetchFn, uri) {
  let response
  try { response = await fetchFn(uri, { headers: { Accept: 'text/turtle, application/ld+json;q=0.9' }, cache: 'no-store' }) } catch { return { status: 0 } }
  if (!response.ok) return { status: response.status }
  const text = await response.text()
  const graph = await parse($rdf, text, response.url || uri, response.headers.get('content-type'))
  return { status: response.status, graph }
}

function timeIn (graph, node) {
  for (const p of MODIFIED) {
    const m = graph.any(node, graph.sym(p))
    if (m) { const d = new Date(m.value); if (!isNaN(d)) return d }
  }
  const t = graph.any(node, graph.sym(MTIME))
  if (t && /^\d+(\.\d+)?$/.test(t.value)) return new Date(+t.value * 1000)
  return null
}

// Run tasks PARALLEL at a time.
async function pool (tasks) {
  const out = new Array(tasks.length)
  let next = 0
  const worker = async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i]() } }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, tasks.length) }, worker))
  return out
}

// The walk: breadth first, newest folder first within a level, to MAX_DEPTH levels and MAX_FOLDERS listings.
async function walk ({ $rdf, fetchFn, start, maxDepth = MAX_DEPTH, maxFolders = MAX_FOLDERS }) {
  const files = []
  const unread = [] // { uri, status }
  let read = 0
  let skipped = 0 // folders seen but not read: over the cap
  let deeper = 0 // folders seen but not read: too deep
  const seen = new Set([start])
  let level = [{ uri: start, depth: 0, time: null }]
  while (level.length) {
    level.sort((a, b) => (b.time || 0) - (a.time || 0) || a.uri.localeCompare(b.uri))
    const room = Math.max(0, maxFolders - read)
    skipped += Math.max(0, level.length - room)
    const now = level.slice(0, room)
    read += now.length
    const results = await pool(now.map(f => () => readRdf($rdf, fetchFn, f.uri)))
    const next = []
    now.forEach((folder, i) => {
      const { status, graph } = results[i]
      if (!graph) { unread.push({ uri: folder.uri, status }); return }
      const here = graph.sym(folder.uri)
      for (const child of graph.each(here, graph.sym(LDP_CONTAINS))) {
        if (child.termType !== 'NamedNode' || hidden(child.value) || seen.has(child.value)) continue
        seen.add(child.value)
        const time = timeIn(graph, child)
        if (isFolder(child)) {
          if (folder.depth + 1 <= maxDepth) next.push({ uri: child.value, depth: folder.depth + 1, time })
          else deeper++
        } else {
          const size = graph.any(child, graph.sym(SIZE))
          files.push({ uri: child.value, folder: folder.uri, time, size: size ? +size.value : null })
        }
      }
    })
    level = next
  }
  return { files, unread, read, skipped, deeper }
}

// What one file is, from its name and, for RDF, its content. Fills in kind, title and the thing to open.
function kindFromName (item) {
  const name = lastPart(item.uri)
  for (const [kind, re] of Object.entries(EXT)) if (re.test(name)) return kind
  return 'files'
}
function sniffGraph (graph, item) {
  const doc = item.uri
  // Only things defined in this document count: a file that merely mentions a typed thing from another file
  // (an address book's groups.ttl lists <Group/Friends.ttl#this> a vcard:Group) is not that thing.
  const rank = (s) => { const v = s.value; return v === doc + '#this' ? 0 : v === doc ? 1 : v.startsWith(doc + '#') ? 2 : 3 }
  const typed = graph.statementsMatching(null, graph.sym(RDF_TYPE), null).filter(st => BY_TYPE[st.object.value] && st.subject.termType === 'NamedNode' && rank(st.subject) < 3)
  // Prefer the document's own main thing: <#this>, then <>, then any <#…>.
  typed.sort((a, b) => rank(a.subject) - rank(b.subject))
  if (typed.length) {
    const main = typed[0].subject
    let title = ''
    for (const p of TITLES) { const t = graph.any(main, graph.sym(p)); if (t && t.termType === 'Literal' && t.value.trim()) { title = t.value.trim(); break } }
    return { kind: BY_TYPE[typed[0].object.value], title, open: main.termType === 'NamedNode' ? main.value : doc }
  }
  for (const [p, kind] of Object.entries(BY_LINK)) if (graph.statementsMatching(null, graph.sym(p), null).length) return { kind }
  return null
}

// ---- dates -----------------------------------------------------------------------------------------------------
const DAY = 86400000
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
// Today, Yesterday, This week (the last seven days), Last 30 days, then by month.
function groupOf (d, now = new Date()) {
  const today = startOfDay(now)
  if (d >= today) return 'Today'
  if (d >= new Date(+today - DAY)) return 'Yesterday'
  if (d >= new Date(+today - 6 * DAY)) return 'This week'
  if (d >= new Date(+today - 29 * DAY)) return 'Last 30 days'
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
function relative (d, now = new Date()) {
  const ms = now - d
  if (ms < 60000) return 'just now'
  if (ms < 3600000) return Math.floor(ms / 60000) + ' min ago'
  const today = startOfDay(now)
  if (d >= today) { const h = Math.floor(ms / 3600000); return h === 1 ? '1 hour ago' : h + ' hours ago' }
  if (d >= new Date(+today - DAY)) return 'yesterday'
  const days = Math.round((+today - +startOfDay(d)) / DAY)
  if (days < 7) return days + ' days ago'
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
const fullDate = (d) => d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })
const sizeText = (n) => n === null || isNaN(n) ? '' : n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'

// ---- the model: one per drawing, shared by the stream, the filters and the details -------------------------------
// Inside the shell, render, renderNavigation and renderDetails share context.suite.state (the contract in
// design/DESIGN.md). Alone, render keeps its own.
function modelFor (subject, context) {
  const state = context.suite && context.suite.state
  if (state && state.activity && state.activity.subject === subject.value) return state.activity
  const model = makeModel(subject, context)
  if (state) state.activity = model
  return model
}

function makeModel (subject, context) {
  const store = context.session.store
  return {
    subject: subject.value,
    store,
    $rdf: globalThis.$rdf || (globalThis.UI && globalThis.UI.rdf),
    fetchFn: (store.fetcher && store.fetcher._fetch) || globalThis.fetch.bind(globalThis),
    me: currentUser(context),
    items: [],
    walk: null,
    state: 'reading', // reading | sniffing | done | failed
    filter: 'all',
    shown: PAGE,
    listeners: new Set(),
    changed () { for (const f of this.listeners) { try { f() } catch (error) { console.warn('[activity]', error) } } }
  }
}

// Read everything again (at the start, and after a login or logout). A newer run makes an older one stop.
async function fill (model) {
  const run = model.run = (model.run || 0) + 1
  const live = () => model.run === run
  const { $rdf, fetchFn } = model
  if (!$rdf) throw new Error('rdflib is not on the page')
  const result = await walk({ $rdf, fetchFn, start: model.subject })
  if (!live()) return
  // Files with no time in their listing: ask for Last-Modified, a few at most.
  const untimed = result.files.filter(f => !f.time).slice(0, HEADS)
  await pool(untimed.map(f => async () => {
    try { const r = await fetchFn(f.uri, { method: 'HEAD', cache: 'no-store' }); const lm = r.ok && r.headers.get('last-modified'); if (lm && !isNaN(new Date(lm))) f.time = new Date(lm) } catch { /* left out */ }
  }))
  if (!live()) return
  const items = result.files.filter(f => f.time).map(f => ({ ...f, kind: kindFromName(f), title: '', open: f.uri }))
  items.sort((a, b) => b.time - a.time || a.uri.localeCompare(b.uri))
  Object.assign(model, { walk: result, items, sniffed: undefined, state: 'sniffing' })
  model.changed()
  // The newest RDF files: read once each, to file them under their app and show their own title.
  const rdf = items.filter(i => RDF_FILE.test(lastPart(i.uri)) && !(i.size > SNIFF_MAX)).slice(0, SNIFF)
  model.sniffed = rdf.length
  await pool(rdf.map(item => async () => {
    const { graph } = await readRdf($rdf, fetchFn, item.uri)
    const found = graph && sniffGraph(graph, item)
    if (found) Object.assign(item, { kind: found.kind, title: found.title || '', open: found.open || item.uri })
  }))
  if (!live()) return
  model.state = 'done'
  model.changed()
}

// ---- drawing ---------------------------------------------------------------------------------------------------
const kindById = (id) => KINDS.find(k => k.id === id) || KINDS[1]
const itemIcon = (item) => item.kind === 'files' ? fileIcon(lastPart(item.uri)) : kindById(item.kind).icon
function counts (model) {
  const c = { all: model.items.length }
  for (const i of model.items) c[i.kind] = (c[i.kind] || 0) + 1
  return c
}
const where = (model, folder) => {
  if (folder === model.subject) return lastPart(model.subject) || new URL(model.subject).host
  return decodeURI(folder.slice(model.subject.length).replace(/\/$/, ''))
}

// The address that opens a thing in the data browser: this page with uri= changed, else the thing itself.
function browseHref (uri) {
  try {
    const here = new URL(globalThis.location.href)
    if (here.searchParams.has('uri')) { here.searchParams.set('uri', uri); here.hash = ''; return here.href }
  } catch { /* not in a page with an address */ }
  return httpOnly(uri)
}
function openLink (a, uri, context) {
  const href = browseHref(uri)
  if (!href) return a
  a.setAttribute('href', href)
  a.setAttribute('rel', 'noopener')
  a.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    try {
      if (context.suite && typeof context.suite.go === 'function') { event.preventDefault(); context.suite.go(uri); return }
      const outliner = context.getOutliner(context.dom)
      event.preventDefault()
      outliner.GotoSubject(context.session.store.sym(uri), true, undefined, true, undefined)
    } catch { /* fall back to the link */ }
  })
  return a
}

// Left column: All, Files, then each app that has something. Used by the shell and by the pane on its own.
// In the shell it is just the list (the shell gives the column); alone it is a column of its own.
function drawNavigation (dom, model, forShell) {
  const list = el(dom, 'ul', 'act-nav-list act-filters', null, { 'aria-label': 'Activity filters' })
  const nav = forShell ? list : el(dom, 'nav', 'act-nav act-side', null, { 'aria-label': 'Activity filters' })
  if (!forShell) nav.appendChild(list)
  let shown = false
  const paint = () => {
    if (shown && !list.isConnected) { model.listeners.delete(paint); return } // was on the page, now replaced
    if (list.isConnected) shown = true
    const c = counts(model)
    list.replaceChildren()
    for (const k of KINDS) {
      if (k.id !== 'all' && k.id !== 'files' && !c[k.id]) continue
      const li = list.appendChild(el(dom, 'li'))
      const b = li.appendChild(el(dom, 'button', 'act-nav-item', null, { type: 'button', 'data-filter': k.id, 'aria-current': model.filter === k.id ? 'page' : null }))
      b.appendChild(icon(dom, k.icon))
      b.appendChild(el(dom, 'span', 'act-nav-label', k.name))
      if (model.state !== 'reading') b.appendChild(el(dom, 'span', 'act-nav-count', String(c[k.id] || 0)))
      b.addEventListener('click', () => { model.filter = k.id; model.shown = PAGE; model.changed() })
    }
  }
  paint()
  model.listeners.add(paint)
  return nav
}

// Alone and narrow (under 900 px): the same filters as a row of chips above the stream.
function drawChips (dom, model) {
  const box = el(dom, 'div', 'act-chips act-chipbar', null, { role: 'group', 'aria-label': 'Activity filters' })
  let shown = false
  const paint = () => {
    if (shown && !box.isConnected) { model.listeners.delete(paint); return }
    if (box.isConnected) shown = true
    const c = counts(model)
    box.replaceChildren()
    for (const k of KINDS) {
      if (k.id !== 'all' && k.id !== 'files' && !c[k.id]) continue
      const label = (k.id === 'all' ? 'All' : k.name) + (model.state === 'reading' ? '' : ' ' + (c[k.id] || 0))
      const b = box.appendChild(el(dom, 'button', 'act-chip', label, { type: 'button', 'data-filter': k.id, 'aria-pressed': String(model.filter === k.id) }))
      b.addEventListener('click', () => { model.filter = k.id; model.shown = PAGE; model.changed() })
    }
  }
  paint()
  model.listeners.add(paint)
  return box
}

function limits (model) {
  const w = model.walk
  const notes = []
  if (w.skipped) notes.push(`${w.skipped} more ${w.skipped === 1 ? 'folder was' : 'folders were'} not read: the limit of ${MAX_FOLDERS} was reached.`)
  if (w.deeper) notes.push(`${w.deeper} ${w.deeper === 1 ? 'folder is' : 'folders are'} more than ${MAX_DEPTH} levels down and ${w.deeper === 1 ? 'was' : 'were'} not read.`)
  if (w.unread.length) notes.push(`${w.unread.length} ${w.unread.length === 1 ? 'folder' : 'folders'} could not be read` + (model.me ? '.' : '. Log in to see what you have access to.'))
  return notes
}

// One line under the stream (alone): how much was read, and what was left out.
function walkLine (dom, model) {
  const box = el(dom, 'div', 'act-summary')
  const w = model.walk
  if (!w) return box
  box.appendChild(el(dom, 'p', 'act-status', `Read ${w.read} ${w.read === 1 ? 'folder' : 'folders'} (at most ${MAX_FOLDERS}), up to ${MAX_DEPTH} levels below this one. Activity only reads; it never changes anything.`))
  for (const n of limits(model)) box.appendChild(el(dom, 'p', 'act-status act-limit', n))
  return box
}

// What was read, how far down, and what could not be read: the shell's details column.
function walkSummary (dom, model, cls) {
  const box = el(dom, 'div', cls)
  const w = model.walk
  if (!w) { box.appendChild(el(dom, 'p', 'act-status', 'Reading the folders…')); return box }
  const props = box.appendChild(el(dom, 'dl', 'act-props'))
  const row = (k, v) => { props.appendChild(el(dom, 'dt', '', k)); props.appendChild(el(dom, 'dd', '', v)) }
  row('Starting at', model.subject)
  row('Folders read', `${w.read} of at most ${MAX_FOLDERS}`)
  row('How deep', `${MAX_DEPTH} levels below the start`)
  row('Files found', String(model.items.length))
  if (model.sniffed !== undefined) row('Read for their kind', `the newest ${model.sniffed} data files (at most ${SNIFF})`)
  for (const n of limits(model)) box.appendChild(el(dom, 'p', 'act-status act-limit', n))
  if (w.unread.length) {
    const list = box.appendChild(el(dom, 'ul', 'act-unread'))
    for (const u of w.unread.slice(0, 10)) list.appendChild(el(dom, 'li', 'act-small', where(model, u.uri) + (u.status ? ' (' + u.status + ')' : '')))
  }
  return box
}

function drawStream (dom, model, context, box) {
  box.replaceChildren()
  const items = model.items.filter(i => model.filter === 'all' || i.kind === model.filter)
  if (model.state === 'reading') { box.appendChild(el(dom, 'p', 'act-status act-reading', 'Reading the folders…', { role: 'status' })); return }
  if (!items.length) {
    const empty = box.appendChild(el(dom, 'div', 'act-empty'))
    empty.appendChild(el(dom, 'span', 'act-empty-icon')).appendChild(icon(dom, model.filter === 'all' ? 'activity' : kindById(model.filter).icon))
    empty.appendChild(el(dom, 'h3', 'act-empty-title', model.filter === 'all' ? 'No activity yet' : 'Nothing here'))
    const unread = model.walk && model.walk.unread.length
    empty.appendChild(el(dom, 'p', 'act-empty-text', model.filter === 'all'
      ? (unread && !model.me ? 'These folders could not be read without logging in.' : 'Nothing with a date was found in these folders.')
      : 'No ' + kindById(model.filter).name.toLowerCase() + ' changed in these folders.'))
    return
  }
  if (model.walk && model.walk.unread.length && !model.me) {
    const note = box.appendChild(el(dom, 'p', 'act-note act-login'))
    note.appendChild(icon(dom, 'lock'))
    note.appendChild(el(dom, 'span', '', 'Some folders could not be read without logging in. Log in to see everything you have access to.'))
  }
  let group = null
  let list = null
  const now = new Date()
  for (const item of items.slice(0, model.shown)) {
    const g = groupOf(item.time, now)
    if (g !== group) {
      group = g
      const section = box.appendChild(el(dom, 'section', 'act-group'))
      section.appendChild(el(dom, 'h3', 'act-caption act-group-title', g))
      list = section.appendChild(el(dom, 'ul', 'act-list'))
    }
    const li = list.appendChild(el(dom, 'li'))
    const name = item.title || lastPart(item.uri)
    const a = li.appendChild(openLink(el(dom, 'a', 'act-row act-item', null, { 'data-uri': item.uri, 'data-kind': item.kind }), item.open, context))
    const figure = a.appendChild(el(dom, 'span', 'act-row-icon act-kind-' + item.kind))
    if (item.kind === 'photos' && httpOnly(item.uri) && !(item.size > THUMB_MAX)) {
      // A small preview, loaded only when the row scrolls into view; the icon instead if it cannot be shown.
      const img = figure.appendChild(el(dom, 'img', 'act-thumb', null, { alt: '', loading: 'lazy', decoding: 'async' }))
      img.addEventListener('error', () => { figure.replaceChildren(icon(dom, itemIcon(item))) })
      img.setAttribute('src', httpOnly(item.uri))
    } else {
      figure.appendChild(icon(dom, itemIcon(item)))
    }
    const main = a.appendChild(el(dom, 'span', 'act-row-main'))
    main.appendChild(el(dom, 'span', 'act-row-title act-name', name))
    const sub = main.appendChild(el(dom, 'span', 'act-row-sub'))
    sub.appendChild(el(dom, 'span', 'act-where', where(model, item.folder)))
    if (item.title) sub.appendChild(el(dom, 'span', 'act-file', ' · ' + lastPart(item.uri)))
    sub.appendChild(el(dom, 'span', 'act-when-sub', ' · ' + relative(item.time, now))) // the meta column is dropped under 520 px
    const t = a.appendChild(el(dom, 'time', 'act-row-meta act-when', relative(item.time, now), { datetime: item.time.toISOString(), title: fullDate(item.time) }))
    t.dataset.group = g
    a.setAttribute('title', `${name}\n${item.uri}\n${fullDate(item.time)}${item.size !== null ? '\n' + sizeText(item.size) : ''}`)
  }
  if (items.length > model.shown) {
    const more = box.appendChild(el(dom, 'button', 'act-btn act-more', `Show more (${items.length - model.shown} left)`, { type: 'button' }))
    more.addEventListener('click', () => { model.shown += PAGE; model.changed() })
  }
}

// When this pane was opened by its own link (?pane=<this file>), it opens first on a folder; otherwise it is a tab.
let dropPrevious = null // the auth listeners of the last drawing
const SELF = (() => { try { return import.meta.url } catch { return '' } })()
function askedFor () {
  try { return new URL(globalThis.location.href).searchParams.getAll('pane').includes(SELF) } catch { return false }
}

const pane = {
  name: 'suite-activity',
  icon: svgUri(MDI.activity, '#00679e'),
  audience: [],

  label (subject) {
    return isFolder(subject) ? 'Activity' : null
  },

  shouldGetFocus (subject) {
    return isFolder(subject) && askedFor()
  },

  render (subject, context) {
    const dom = context.dom
    const inShell = !!(context.suite && context.suite.version)
    const model = modelFor(subject, context)

    const root = el(dom, 'div', 'act suite-activity act-root' + (inShell ? ' act-in-shell' : ''))
    root.appendChild(el(dom, 'style', '', CSS))
    const frame = root.appendChild(el(dom, 'div', 'act-frame'))
    if (!inShell) frame.appendChild(drawNavigation(dom, model)) // the shell asks for it with renderNavigation
    const main = frame.appendChild(el(dom, 'main', 'act-main'))
    const head = main.appendChild(el(dom, 'header', 'act-head'))
    const title = head.appendChild(el(dom, 'h2', 'act-heading act-title', 'All activity'))
    head.appendChild(el(dom, 'p', 'act-muted act-small act-scope', 'Recently changed in ' + (where(model, model.subject) || model.subject) + ' and its folders, newest first'))
    if (!inShell) main.appendChild(drawChips(dom, model))
    const stream = main.appendChild(el(dom, 'div', 'act-stream', null, { 'aria-live': 'polite' }))
    const foot = main.appendChild(el(dom, 'footer', 'act-foot'))

    const paint = () => {
      title.textContent = kindById(model.filter).name
      drawStream(dom, model, context, stream)
      foot.replaceChildren(walkLine(dom, model))
      root.dataset.state = model.state
      root.dataset.filter = model.filter
      if (model.walk) { root.dataset.read = String(model.walk.read); root.dataset.deeper = String(model.walk.deeper); root.dataset.skipped = String(model.walk.skipped); root.dataset.unread = String(model.walk.unread.length) }
      if (model.state === 'done') root.dataset.ready = 'true'
    }
    model.listeners.add(paint)
    paint()
    const start = () => fill(model).catch((error) => {
      model.state = 'failed'
      stream.replaceChildren(el(dom, 'p', 'act-status act-status-error', 'Could not read the folders: ' + (error && error.message ? error.message : error), { role: 'alert' }))
      root.dataset.ready = 'true'
    })
    if (!model.run) start() // the shell may draw the same model again: read once
    // A login, a logout or a restored session changes what can be read: read again.
    const events = globalThis.SolidLogic && globalThis.SolidLogic.authSession && globalThis.SolidLogic.authSession.events
    if (events && events.on) {
      const names = ['login', 'logout', 'sessionRestore']
      const off = () => { for (const n of names) try { (events.off || events.removeListener).call(events, n, onAuth) } catch { /* old emitter */ } }
      // Each drawing drops the one before it (its listeners, and with them its model), so nothing piles up.
      if (dropPrevious) try { dropPrevious() } catch { /* already gone */ }
      dropPrevious = () => { off(); model.listeners.clear() }
      const onAuth = () => {
        if (!root.isConnected) { off(); return }
        const me = currentUser(context)
        if ((me && me.value) === (model.me && model.me.value) && model.state !== 'reading' && model.walk && !model.walk.unread.length) return
        model.me = me
        model.state = 'reading'
        delete root.dataset.ready
        model.changed()
        start()
      }
      for (const n of names) try { events.on(n, onAuth) } catch { /* old emitter */ }
    }
    return root
  },

  // The shell's left column: the filters.
  renderNavigation (subject, context) {
    const model = context.suite && context.suite.state && context.suite.state.activity
    if (!model || model.subject !== subject.value) return null
    return drawNavigation(context.dom, model, true)
  },

  // The shell's right column: what was read and what was left out.
  renderDetails (subject, context) {
    const dom = context.dom
    const model = context.suite && context.suite.state && context.suite.state.activity
    if (!model) return null
    const box = el(dom, 'div', 'act act-root act-details-wrap')
    const head = box.appendChild(el(dom, 'div', 'act-details-head'))
    head.appendChild(el(dom, 'span', 'act-details-figure')).appendChild(icon(dom, 'activity'))
    const titles = head.appendChild(el(dom, 'div', 'act-details-titles'))
    titles.appendChild(el(dom, 'h3', 'act-details-title', 'What was read'))
    titles.appendChild(el(dom, 'p', 'act-details-sub', 'Activity never writes to the pod.'))
    box.appendChild(walkSummary(dom, model, 'act-details-body'))
    return box
  }
}

export default pane
