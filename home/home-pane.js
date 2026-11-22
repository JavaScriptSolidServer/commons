// home-pane.js: a home screen for a pod. The page a person lands on for their own pod.
//
// Opens on a pod's root folder (the container a profile names with pim:storage) and on a WebID.
// The suite's Dashboard app. It shows, read-only, from the person's own data, a centred greeting with the name
// and photo from the profile, then a grid of widget cards (each an icon, a title, a short list and a foot):
//   - "Your things": a row for each type registration in the type indexes;
//   - "Folders": the top-level folders;
//   - "Your panes and apps": what the tool index has switched on, and one link to manage it;
//   - "Recently changed": the newest items in the top-level folders, from the folder listings.
// Content only in the suite shell (no navigation or details column). Styled with the suite design sheet.
//
// Where it looks (every link is followed, no file name is guessed):
//   WebID  --solid:publicTypeIndex / pim:preferencesFile / pim:storage-->
//   preferences file  --solid:privateTypeIndex / solid:publicTypeIndex / tools:toolIndex-->
//   type index   <#r> solid:forClass vcard:AddressBook ; solid:instance <../contacts/index.ttl#this> .
//   tool index   <> tools:registration <#notes> .  <#notes> schema:name "Notes reader" ; ac:capability [...]
//
// When it takes over: on the root folder only for the pod's owner, on a WebID only for that person.
// Anyone else gets a "Home" tab beside the usual view; logged out, it does not claim a folder at all.
//
// It never writes. One file, no imports. Icons: Material Design Icons (Apache 2.0). AGPL-3.0-or-later. Copyright (c) 2026 Melvin Carvalho.

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const PIM = 'http://www.w3.org/ns/pim/space#'
const SOLID = 'http://www.w3.org/ns/solid/terms#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const VCARD = 'http://www.w3.org/2006/vcard/ns#'
const DCT_MODIFIED = 'http://purl.org/dc/terms/modified'
const POSIX_MTIME = 'http://www.w3.org/ns/posix/stat#mtime'
const TOOLS = 'https://pod-os.org/vocab/tools#'
const AC = 'https://www.w3.org/ns/ac#'
const SCHEMA = ['https://schema.org/', 'http://schema.org/'] // both spellings are in use
// The invocation type for a pane module: a placeholder until its name is settled (as in toolIndex.js).
const PANE_MODULE = 'https://mashlib.com/ns/panes#PaneModuleInvocation'
const REGISTRATION_TYPES = ['Registration', 'ToolRegistration', 'AppRegistration'].map(t => TOOLS + t)
const TOOLS_APP = 'https://solid-apps.github.io/tools/'
const MAX_FOLDERS = 24 // folder listings read for "Recently changed"
const RECENT = 6

// Friendly names for the classes people register, by local name, with an icon for each.
const KINDS = {
  AddressBook: ['Address book', 'contacts'], Individual: ['Contacts', 'contacts'], Group: ['Contacts', 'contacts'], Person: ['People', 'contacts'],
  LongChat: ['Chat', 'chat'], Chat: ['Chat', 'chat'], ChatChannel: ['Chat', 'chat'], ChatMessage: ['Chat', 'chat'],
  Meeting: ['Meeting', 'meeting'], Event: ['Events', 'meeting'], Calendar: ['Calendar', 'meeting'],
  Tracker: ['Tracker', 'tracker'], Issue: ['Issues', 'tracker'], Task: ['Tasks', 'tracker'],
  SchedulableEvent: ['Poll', 'poll'], Poll: ['Poll', 'poll'],
  Bookmark: ['Bookmarks', 'bookmark'], Bookmarks: ['Bookmarks', 'bookmark'],
  Notepad: ['Notes', 'notes'], Note: ['Notes', 'notes'], NoteDigitalDocument: ['Notes', 'notes'], TextDigitalDocument: ['Notes', 'notes'],
  Recipe: ['Recipes', 'recipe'], ImageObject: ['Photos', 'photo'], Photograph: ['Photos', 'photo'], ImageGallery: ['Photos', 'photo'],
  ChessGame: ['Chess games', 'game'], Game: ['Games', 'game']
}
// Media types used as classes (http://www.w3.org/ns/iana/media-types/text/markdown#Resource).
const MEDIA_KINDS = { 'text/markdown': ['Notes', 'notes'], 'text/plain': ['Text files', 'notes'], 'text/html': ['Web pages', 'thing'] }

// Icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box, drawn as masks so they take the text colour.
const MDI = {
  home: 'M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z',
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
  folders: 'M22,4H14L12,2H6A2,2 0 0,0 4,4V16A2,2 0 0,0 6,18H22A2,2 0 0,0 24,16V6A2,2 0 0,0 22,4M2,6H0V11H0V20A2,2 0 0,0 2,22H20V20H2V6Z',
  contacts: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z',
  notes: 'M14,10H19.5L14,4.5V10M5,3H15L21,9V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3M5,12V14H19V12H5M5,16V18H14V16H5Z',
  chat: 'M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4C22,2.89 21.1,2 20,2M6,9H18V11H6M14,14H6V12H14M18,8H6V6H18',
  meeting: 'M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z',
  tracker: 'M3,5H9V11H3V5M5,7V9H7V7H5M11,7H21V9H11V7M11,15H21V17H11V15M5,20L1.5,16.5L2.91,15.09L5,17.17L9.59,12.59L11,14L5,20Z',
  poll: 'M3,22V8H7V22H3M10,22V2H14V22H10M17,22V14H21V22H17Z',
  bookmark: 'M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z',
  recipe: 'M11,9H9V2H7V9H5V2H3V9C3,11.12 4.66,12.84 6.75,12.97V22H9.25V12.97C11.34,12.84 13,11.12 13,9V2H11V9M16,6V14H18.5V22H21V2C18.24,2 16,4.24 16,6Z',
  photo: 'M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z',
  game: 'M7,6H17A6,6 0 0,1 23,12A6,6 0 0,1 17,18C15.22,18 13.63,17.23 12.53,16H11.47C10.37,17.23 8.78,18 7,18A6,6 0 0,1 1,12A6,6 0 0,1 7,6M6,9V11H4V13H6V15H8V13H10V11H8V9H6M15.5,12A1.5,1.5 0 0,0 14,13.5A1.5,1.5 0 0,0 15.5,15A1.5,1.5 0 0,0 17,13.5A1.5,1.5 0 0,0 15.5,12M18.5,9A1.5,1.5 0 0,0 17,10.5A1.5,1.5 0 0,0 18.5,12A1.5,1.5 0 0,0 20,10.5A1.5,1.5 0 0,0 18.5,9Z',
  thing: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z',
  pane: 'M20.5,11H19V7C19,5.89 18.1,5 17,5H13V3.5A2.5,2.5 0 0,0 10.5,1A2.5,2.5 0 0,0 8,3.5V5H4A2,2 0 0,0 2,7V10.8H3.5C5,10.8 6.2,12 6.2,13.5C6.2,15 5,16.2 3.5,16.2H2V20A2,2 0 0,0 4,22H7.8V20.5C7.8,19 9,17.8 10.5,17.8C12,17.8 13.2,19 13.2,20.5V22H17A2,2 0 0,0 19,20V16H20.5A2.5,2.5 0 0,0 23,13.5A2.5,2.5 0 0,0 20.5,11Z',
  app: 'M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z',
  shapes: 'M11,13.5V21.5H3V13.5H11M12,2L17.5,11H6.5L12,2M17.5,13C20,13 22,15 22,17.5C22,20 20,22 17.5,22C15,22 13,20 13,17.5C13,15 15,13 17.5,13Z',
  history: 'M13.5,8H12V13L16.28,15.54L17,14.33L13.5,12.25V8M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3'
}
const svgUri = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)
const WIDGET_ROWS = 6 // rows a widget shows before "Show all"

const CSS = `
/* suite:design begin --prefix hom --only icon,row,buttons,chip,avatar,empty,toast */
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
.hom-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.hom-root *, .hom-root *::before, .hom-root *::after { box-sizing: border-box }
.hom-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.hom-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.hom-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.hom-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.hom-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.hom-root [hidden] { display: none !important }
.hom-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.hom-muted { color: var(--sui-text-muted) }
.hom-small { font-size: var(--sui-text-sm) }
.hom-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.hom-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.hom-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.hom-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.hom-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.hom-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --hom-i set to url("data:image/svg+xml,...") ---------------------------------- */
.hom-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--hom-i) center / contain no-repeat; mask: var(--hom-i) center / contain no-repeat }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.hom-list { margin: 0; padding: 0; list-style: none }
.hom-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.hom-row:hover { background: var(--sui-bg-hover) }
.hom-row[aria-selected="true"], .hom-row[aria-current="true"] { background: var(--sui-primary-light) }
.hom-row-main { flex: 1 1 auto; min-width: 0 }
.hom-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.hom-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.hom-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.hom-row-actions { flex: none; display: flex; align-items: center }
.hom-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.hom-row-icon .hom-icon { width: 28px; height: 28px }
.hom-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .hom-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.hom-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.hom-btn:hover { background: var(--sui-primary-light-hover) }
.hom-btn:disabled, .hom-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.hom-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.hom-btn-primary:hover { background: var(--sui-primary-element-hover) }
.hom-btn-tertiary { background: transparent; color: var(--sui-text) }
.hom-btn-tertiary:hover { background: var(--sui-bg-hover) }
.hom-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.hom-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.hom-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.hom-btn-icon:hover { background: var(--sui-bg-hover) }
.hom-btn-wide { width: 100%; justify-content: flex-start }
.hom-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.hom-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.hom-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.hom-chip { cursor: pointer }
button.hom-chip:hover { background: var(--sui-primary-light-hover) }
.hom-chip-primary, .hom-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.hom-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.hom-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.hom-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- avatar: a span with initials, or an <img class="ui-avatar"> -------------------------------------------- */
.hom-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar); height: var(--sui-avatar); border-radius: 50%; overflow: hidden; background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); line-height: 1; object-fit: cover; text-transform: uppercase; user-select: none }
.hom-avatar-lg { width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); font-size: var(--sui-text-xl) }
.hom-avatar-xl { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.hom-header .hom-avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.hom-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.hom-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.hom-empty-icon .hom-icon { width: 48px; height: 48px }
.hom-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.hom-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.hom-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.hom-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.hom-toast-error { border-left-color: var(--sui-error) }
.hom-toast-success { border-left-color: var(--sui-success) }
.hom-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.hom-status-error { color: var(--sui-error) }
.hom-status-success { color: var(--sui-success) }
.hom-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.hom-note-error { background: var(--sui-error-light) }
.hom-note-warning { background: var(--sui-warning-light) }
.hom-note-success { background: var(--sui-success-light) }
/* suite:design end */
.hom.home-pane { width: 100%; min-height: 100%; background: var(--sui-bg-app) }
.hom-inner { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-8) var(--sui-space-4) var(--sui-space-12) }
.hom-head { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); text-align: center }
.hom-face img { width: 100%; height: 100%; object-fit: cover; display: block }
.hom-greeting { overflow-wrap: anywhere }
.hom-ids { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 var(--sui-space-4); max-width: 100% }
.hom-ids > span { min-width: 0; overflow-wrap: anywhere }
.hom-ids a { text-decoration: none }
.hom-ids a:hover { text-decoration: underline }
.hom-status { justify-content: center; margin-top: var(--sui-space-4); padding: 0; border: 0; background: transparent; box-shadow: none } /* the data browser styles [role=status] as a green box */
.hom-status:empty { display: none }
.hom-widgets { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); align-items: start; gap: var(--sui-space-4); margin-top: var(--sui-space-8) }
.hom-widget { min-width: 0; padding: var(--sui-space-2) var(--sui-space-2) var(--sui-space-3); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg); box-shadow: var(--sui-shadow) }
.hom-widget-head { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: 0 var(--sui-space-3) }
.hom-widget-head .hom-subheading { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.hom-widget .hom-list { margin-top: var(--sui-space-1) }
div.hom-row { cursor: default }
div.hom-row:hover { background: transparent }
.hom-row-title { font-weight: var(--sui-weight-bold) }
.hom-row .hom-chip { flex: none }
.hom-widget-foot { display: flex; flex-direction: column; gap: var(--sui-space-2); margin-top: var(--sui-space-2); padding: 0 var(--sui-space-1) }
.hom-widget-foot:empty { display: none }
.hom-widget-foot .hom-btn { width: 100% }
.hom-off { padding: 0 var(--sui-space-2) }
.hom-widget .hom-empty { margin: var(--sui-space-6) auto var(--sui-space-4) }
.hom-widgets > .hom-nothing { grid-column: 1 / -1 }
.hom-nothing .hom-empty-icon { background: var(--sui-bg) } /* the page behind it is already --sui-bg-app */
.hom-when-sub { display: none }
@media (max-width: 520px) { .hom-row-main .hom-when-sub { display: block } }
@media (max-width: 600px) {
  .hom-inner { padding: var(--sui-space-6) var(--sui-space-3) var(--sui-space-8) }
  .hom-widgets { margin-top: var(--sui-space-6) }
}
`

function el (dom, tag, className, text) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function icon (dom, kind) {
  const span = el(dom, 'span', 'hom-icon')
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--hom-i', `url("${svgUri(MDI[kind] || MDI.thing)}")`)
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

const safeDecode = (text, decode = decodeURIComponent) => { try { return decode(text) } catch { return text } } // %E0 and the like: keep the raw text
const localName = (uri) => safeDecode(String(uri).replace(/[/#]+$/, '').split(/[/#]/).pop() || String(uri))
// The pod a profile sits in, from where the profile is: <pod>/profile/card#me -> <pod>/ (used only when no pim:storage is named).
const profilePod = (webid) => { try { return new URL('../', String(webid).split('#')[0]).href } catch { return '' } }
const isFolder = (node) => !!node && node.termType === 'NamedNode' && node.value.endsWith('/')
const httpOnly = (uri) => { try { const u = new URL(uri); return /^https?:$/.test(u.protocol) ? u.href : '' } catch { return '' } }

// "PlantCollection" -> "Plant collection"; a known class -> its friendly name and icon.
function kindOf (classUri) {
  const media = /\/media-types\/([^#]+)#Resource$/.exec(classUri)
  if (media) return MEDIA_KINDS[media[1]] || [media[1] + ' files', 'thing']
  const name = localName(classUri)
  if (KINDS[name]) return KINDS[name]
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return [words.charAt(0).toUpperCase() + words.slice(1).toLowerCase(), 'thing']
}

// Is this a WebID (a person with a pod), from the profile already loaded?
function isWebId (subject, store) {
  if (!subject || subject.termType !== 'NamedNode' || isFolder(subject)) return false
  const sym = store.sym.bind(store)
  return [PIM + 'storage', SOLID + 'publicTypeIndex', PIM + 'preferencesFile', SOLID + 'oidcIssuer']
    .some(p => !!store.any(subject, sym(p), null, subject.doc()))
}

// The folder is the root of the viewer's own pod: the storage their profile names (pim:storage), or, when it names
// none, the folder their profile sits in (<pod>/profile/card#me -> <pod>/). Not the server's root on a path-based server.
function isMyRoot (subject, store, me) {
  if (!me || !isFolder(subject)) return false
  const named = store.each(me, store.sym(PIM + 'storage'), null, null).filter(n => n.termType === 'NamedNode')
  if (named.length) return named.some(n => n.value === subject.value)
  return profilePod(me.value) === subject.value
}

// What the pane is looking at: 'mine' (my root or my WebID), 'root' (someone's pod root), 'person' (a WebID), or null.
function claim (subject, store, me) {
  if (!subject || !store) return null
  if (isFolder(subject)) {
    if (!me) return null // logged out: the folder is left to the folder view
    if (isMyRoot(subject, store, me)) return 'mine'
    if (store.holds(subject, store.sym(RDF_TYPE), store.sym(PIM + 'Storage'))) return 'root'
    return null
  }
  if (!isWebId(subject, store)) return null
  return me && me.value === subject.value ? 'mine' : 'person'
}

let lastStore = null

const pane = {
  name: 'pod-home', // SolidOS already has a pane named 'home' (its own small home page); a second one is ignored
  icon: svgUri(MDI.home, '#00679e'), // --sui-primary-element
  audience: [],

  label (subject, context) {
    try {
      const store = context.session.store
      lastStore = store
      return claim(subject, store, currentUser(context)) ? 'Home' : null
    } catch { return null }
  },

  // Called with the subject only: open first only on the viewer's own root folder or own WebID.
  shouldGetFocus (subject) {
    try {
      const store = (globalThis.SolidLogic && globalThis.SolidLogic.store) || lastStore
      return claim(subject, store, currentUser(null)) === 'mine'
    } catch { return false }
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const sym = store.sym.bind(store)
    const me = currentUser(context)

    const root = el(dom, 'div', 'hom home-pane hom-root')
    root.appendChild(el(dom, 'style', '', CSS))
    const inner = root.appendChild(el(dom, 'div', 'hom-inner'))
    const head = inner.appendChild(el(dom, 'header', 'hom-head'))
    const status = inner.appendChild(el(dom, 'p', 'hom-status', 'Reading the pod…'))
    status.setAttribute('role', 'status')
    const widgets = inner.appendChild(el(dom, 'div', 'hom-widgets'))

    const load = async (node) => { if (!node) return false; try { await store.fetcher.load(node.doc ? node.doc() : node); return true } catch { return false } }
    const any = (s, p, doc) => store.any(s, sym(p), null, doc)
    const schemaName = (node, doc) => { for (const ns of SCHEMA) { const v = store.any(node, sym(ns + 'name'), null, doc); if (v) return v.value } return '' }

    // A link that opens in the data browser: the page's own address with uri= changed, or the resource itself.
    const browseHref = (uri) => {
      try {
        const here = new URL(globalThis.location.href)
        if (here.searchParams.has('uri')) { here.searchParams.set('uri', uri); here.hash = ''; return here.href }
      } catch { /* not in a page with an address */ }
      return httpOnly(uri)
    }
    const browseLink = (a, uri) => {
      const href = browseHref(uri)
      if (!href) return a
      a.setAttribute('href', href)
      a.setAttribute('rel', 'noopener')
      a.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        try {
          const outliner = context.getOutliner(dom)
          event.preventDefault()
          outliner.GotoSubject(sym(uri), true, undefined, true, undefined)
        } catch { /* fall back to the link */ }
      })
      return a
    }
    // A widget: a card with an icon and a title, a short list of rows, and a foot ("Show all", other links).
    const widget = (cls, kind, title) => {
      const box = widgets.appendChild(el(dom, 'section', 'hom-section hom-widget ' + cls))
      const h = box.appendChild(el(dom, 'div', 'hom-widget-head'))
      h.appendChild(icon(dom, kind))
      h.appendChild(el(dom, 'h3', 'hom-subheading', title))
      return box
    }
    const rows = (box, cls, items) => {
      const list = box.appendChild(el(dom, 'ul', 'hom-list ' + cls))
      items.forEach((li, i) => { if (i >= WIDGET_ROWS) li.hidden = true; list.appendChild(li) })
      const foot = box.appendChild(el(dom, 'div', 'hom-widget-foot'))
      if (items.length > WIDGET_ROWS) {
        const all = 'Show all ' + items.length
        const more = foot.appendChild(el(dom, 'button', 'hom-btn hom-more', all))
        more.type = 'button'
        more.setAttribute('aria-expanded', 'false')
        more.addEventListener('click', () => {
          const open = more.getAttribute('aria-expanded') !== 'true'
          items.forEach((li, i) => { if (i >= WIDGET_ROWS) li.hidden = !open })
          more.setAttribute('aria-expanded', String(open))
          more.textContent = open ? 'Show fewer' : all
        })
      }
      return foot
    }
    const row = (kind, title, sub, uri, tag) => {
      const li = el(dom, 'li')
      const box = li.appendChild(uri ? browseLink(el(dom, 'a', 'hom-row'), uri) : el(dom, 'div', 'hom-row'))
      box.appendChild(el(dom, 'span', 'hom-row-icon')).appendChild(icon(dom, kind))
      const text = box.appendChild(el(dom, 'span', 'hom-row-main'))
      text.appendChild(el(dom, 'span', 'hom-row-title', title))
      if (sub) text.appendChild(el(dom, 'span', 'hom-row-sub', sub)).setAttribute('title', sub)
      if (tag) box.appendChild(el(dom, 'span', 'hom-chip hom-tag', tag))
      return li
    }

    let storage = null
    const shortPath = (uri) => {
      uri = uri.split('#')[0]
      if (storage && uri.startsWith(storage.value) && uri !== storage.value) return safeDecode(uri.slice(storage.value.length), decodeURI)
      try { const u = new URL(uri); return safeDecode(u.pathname + u.hash, decodeURI) } catch { return uri }
    }

    function drawHead (person, mine) {
      head.textContent = ''
      const doc = person && person.doc()
      const name = (person && (any(person, FOAF + 'name', doc) || any(person, VCARD + 'fn', doc) || store.any(person, sym(SCHEMA[1] + 'name'), null, doc) || store.any(person, sym(SCHEMA[0] + 'name'), null, doc)))
      const shown = name ? name.value : person ? localName(person.doc().value.replace(/\/profile\/.*$/, '/')) : localName(subject.value)
      const initials = shown.trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase() || '?'
      const face = head.appendChild(el(dom, 'span', 'hom-avatar hom-avatar-lg hom-face', initials))
      face.setAttribute('aria-hidden', 'true')
      const photo = person && [FOAF + 'img', FOAF + 'depiction', VCARD + 'hasPhoto', SCHEMA[0] + 'image', SCHEMA[1] + 'image']
        .map(p => any(person, p, doc)).find(v => v && httpOnly(v.value))
      if (photo) {
        const img = el(dom, 'img')
        img.setAttribute('alt', '')
        img.addEventListener('load', () => { face.textContent = ''; face.appendChild(img) }) // on error the initials stay
        img.setAttribute('src', httpOnly(photo.value))
      }
      const hour = new Date().getHours()
      const greet = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
      const title = head.appendChild(el(dom, 'h2', 'hom-title hom-greeting'))
      if (mine) {
        title.appendChild(el(dom, 'span', 'hom-eyebrow', greet))
        title.appendChild(dom.createTextNode(', '))
      }
      title.appendChild(el(dom, 'span', 'hom-name', shown))
      if (!mine) head.appendChild(el(dom, 'p', 'hom-eyebrow hom-muted', 'A pod home · read-only'))
      const ids = head.appendChild(el(dom, 'p', 'hom-ids hom-small hom-muted'))
      if (person) {
        const line = ids.appendChild(el(dom, 'span', '', 'WebID '))
        line.appendChild(browseLink(el(dom, 'a', 'hom-webid', person.value), person.value))
      }
      if (storage) {
        const line = ids.appendChild(el(dom, 'span', '', 'Pod '))
        line.appendChild(browseLink(el(dom, 'a', 'hom-pod', storage.value), storage.value))
      }
    }

    // Type registrations, from every type index the profile or the preferences file links to.
    async function typeTiles (person, preferences) {
      const indexes = new Map()
      for (const doc of [person.doc(), ...preferences]) {
        for (const [p, scope] of [[SOLID + 'publicTypeIndex', 'public'], [SOLID + 'privateTypeIndex', 'private']]) {
          for (const st of store.statementsMatching(null, sym(p), null, doc)) {
            if (st.object.termType === 'NamedNode' && !indexes.has(st.object.doc().value)) indexes.set(st.object.doc().value, scope)
          }
        }
      }
      const found = new Map()
      await Promise.all([...indexes.keys()].map(uri => load(sym(uri))))
      for (const [uri, scope] of indexes) {
        const doc = sym(uri)
        for (const st of store.statementsMatching(null, sym(SOLID + 'forClass'), null, doc)) {
          const [title, kind] = kindOf(st.object.value)
          for (const p of [SOLID + 'instance', SOLID + 'instanceContainer']) {
            for (const target of store.each(st.subject, sym(p), null, doc)) {
              if (target.termType !== 'NamedNode' || !httpOnly(target.value)) continue // javascript: and the like: no row
              const key = target.value + ' ' + title
              if (!found.has(key)) found.set(key, { title, kind, uri: target.value, scope })
            }
          }
        }
      }
      return [...found.values()].sort((a, b) => a.title.localeCompare(b.title) || a.uri.localeCompare(b.uri))
    }

    // The tool index: what is switched on (linked with tools:registration), panes and apps.
    async function toolEntries (preferences) {
      let index = null
      for (const doc of preferences) {
        const link = store.statementsMatching(null, sym(TOOLS + 'toolIndex'), null, doc).map(st => st.object).find(o => o.termType === 'NamedNode')
        if (link) { index = link; break }
      }
      if (!index) return { index: null, entries: [], off: 0 }
      const doc = index.doc()
      if (!await load(doc)) return { index, entries: [], off: 0, unread: true }
      const on = new Set(store.each(index, sym(TOOLS + 'registration'), null, doc).map(n => n.value))
      const all = new Set(on)
      for (const type of REGISTRATION_TYPES) for (const n of store.each(null, sym(RDF_TYPE), sym(type), doc)) all.add(n.value)
      const entries = []
      let off = 0
      for (const uri of all) {
        const node = sym(uri)
        let kind = ''
        for (const capability of store.each(node, sym(AC + 'capability'), null, doc)) {
          for (const invocation of store.each(capability, sym(AC + 'invocation'), null, doc)) {
            const types = store.each(invocation, sym(RDF_TYPE), null, doc).map(t => t.value)
            if (types.includes(PANE_MODULE)) kind = kind || 'pane'
            else if (types.includes(AC + 'UriTemplateInvocation')) kind = kind || 'app'
          }
        }
        if (!kind) continue // PodOS HTML tools and anything else: not loaded by the data browser
        if (!on.has(uri)) { off++; continue }
        entries.push({ kind, name: schemaName(node, doc) || localName(uri) })
      }
      entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'pane' ? -1 : 1) || a.name.localeCompare(b.name))
      return { index, entries, off }
    }

    // The top-level folders, and the newest things in them, from the folder listings.
    async function folders () {
      if (!storage || !await load(storage)) return { tops: [], items: [] }
      const contains = sym(LDP_CONTAINS)
      const children = (folder) => store.each(folder, contains, null, folder.doc()).filter(n => n.termType === 'NamedNode' && !localName(n.value).startsWith('.'))
      const top = children(storage)
      const tops = top.filter(isFolder).sort((a, b) => a.value.localeCompare(b.value))
      const read = await Promise.all(tops.slice(0, MAX_FOLDERS).map(f => load(f)))
      const items = []
      const when = (node, doc) => {
        const m = any(node, DCT_MODIFIED, doc)
        if (m) { const d = new Date(m.value); if (!isNaN(d)) return d }
        const t = any(node, POSIX_MTIME, doc)
        if (t && /^\d+(\.\d+)?$/.test(t.value)) return new Date(+t.value * 1000)
        return null
      }
      for (const node of top.filter(n => !isFolder(n))) { const d = when(node, storage.doc()); if (d) items.push({ node, d, folder: storage }) }
      const counts = new Map()
      tops.slice(0, MAX_FOLDERS).forEach((folder, i) => {
        if (!read[i]) return
        const inside = children(folder)
        counts.set(folder.value, inside.length)
        for (const node of inside) { const d = when(node, folder.doc()); if (d) items.push({ node, d, folder }) }
      })
      items.sort((a, b) => b.d - a.d)
      return { tops, counts, items: items.slice(0, RECENT) }
    }

    const whenText = (d) => {
      const now = new Date()
      const day = (x) => x.toDateString()
      const clock = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      if (day(d) === day(now)) return 'Today ' + clock
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
      if (day(d) === day(yesterday)) return 'Yesterday ' + clock
      return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
    }

    async function fill () {
      const kind = claim(subject, store, me) || (isFolder(subject) ? 'root' : 'person')
      let person = null
      if (isFolder(subject)) {
        storage = subject
        await load(subject)
        person = isMyRoot(subject, store, me) ? me : (store.any(subject, sym(SOLID + 'owner'), null, subject.doc()) || store.any(null, sym(PIM + 'storage'), subject))
      } else {
        person = subject
      }
      if (person) await load(person)
      if (!storage && person) storage = store.any(person, sym(PIM + 'storage'), null, person.doc())
      if (!storage && person) { const pod = profilePod(person.value); if (pod) storage = sym(pod) }
      const mine = kind === 'mine' || (!!me && !!person && me.value === person.value)
      drawHead(person, mine)

      const preferences = []
      if (person) {
        for (const p of store.each(person, sym(PIM + 'preferencesFile'), null, person.doc())) {
          if (p.termType === 'NamedNode' && await load(p)) preferences.push(p.doc())
        }
      }
      const [types, tix, listing] = await Promise.all([
        person ? typeTiles(person, preferences) : [],
        toolEntries(preferences),
        folders()
      ])

      // Your things: what the type indexes register, then the top-level folders.
      if (types.length) {
        const box = widget('hom-things', 'shapes', mine ? 'Your things' : 'Things in this pod')
        rows(box, 'hom-types', types.map(t => row(t.kind, t.title, shortPath(t.uri), t.uri, t.scope === 'private' ? 'private' : '')))
      }
      if (listing.tops.length) {
        const box = widget('hom-folderbox', 'folders', 'Folders')
        rows(box, 'hom-folders', listing.tops.map(f => {
          const n = listing.counts.get(f.value)
          return row('folder', localName(f.value), n === undefined ? '' : n === 1 ? '1 item' : n + ' items', f.value)
        }))
      }

      // Your panes and apps. Shown only when the preferences file could be read (else nothing is known).
      if (preferences.length) {
        const box = widget('hom-tools', 'pane', mine ? 'Your panes and apps' : 'Panes and apps')
        if (tix.entries.length) {
          const foot = rows(box, 'hom-toolgrid', tix.entries.map(t => row(t.kind, t.name, t.kind === 'pane' ? 'Pane' : 'App')))
          if (tix.off) foot.appendChild(el(dom, 'p', 'hom-off hom-small hom-muted', tix.off === 1 ? '1 more is switched off.' : tix.off + ' more are switched off.'))
          if (tix.index) foot.appendChild(browseLink(el(dom, 'a', 'hom-btn hom-manage', 'Manage panes and apps'), tix.index.doc().value))
        } else {
          const empty = box.appendChild(el(dom, 'div', 'hom-empty'))
          empty.appendChild(el(dom, 'span', 'hom-empty-icon')).appendChild(icon(dom, 'pane'))
          if (!tix.index) {
            empty.appendChild(el(dom, 'p', 'hom-empty-title', 'No tool index yet'))
            empty.appendChild(el(dom, 'p', 'hom-empty-text', 'The panes and apps switched on in it show here.'))
            const a = empty.appendChild(el(dom, 'a', 'hom-btn', 'Make one with the Tools app'))
            a.setAttribute('href', TOOLS_APP)
            a.setAttribute('rel', 'noopener')
            a.setAttribute('target', '_blank')
          } else {
            empty.appendChild(el(dom, 'p', 'hom-empty-title', tix.unread ? 'The tool index could not be read.' : 'Nothing is switched on in the tool index.'))
            empty.appendChild(browseLink(el(dom, 'a', 'hom-btn hom-manage', 'Manage panes and apps'), tix.index.doc().value))
          }
        }
      }

      // Recently changed
      if (listing.items.length) {
        const box = widget('hom-changed', 'history', 'Recently changed')
        rows(box, 'hom-recent', listing.items.map(({ node, d, folder }) => {
          const li = row(isFolder(node) ? 'folder' : 'thing', localName(node.value) + (isFolder(node) ? '/' : ''), 'in ' + (folder.value === storage.value ? 'the pod' : shortPath(folder.value)), node.value)
          const time = li.firstChild.appendChild(el(dom, 'time', 'hom-row-meta', whenText(d)))
          time.setAttribute('datetime', d.toISOString())
          li.querySelector('.hom-row-main').appendChild(el(dom, 'span', 'hom-row-sub hom-when-sub', whenText(d))) // shown under 520 px, where the meta is hidden
          return li
        }))
      }
      if (!widgets.children.length) {
        const empty = widgets.appendChild(el(dom, 'div', 'hom-empty hom-nothing'))
        empty.appendChild(el(dom, 'span', 'hom-empty-icon')).appendChild(icon(dom, 'home'))
        empty.appendChild(el(dom, 'p', 'hom-empty-title', 'Nothing to show here yet'))
        empty.appendChild(el(dom, 'p', 'hom-empty-text', me ? 'Nothing in this pod could be read: no folders, type index or tool index.' : 'Log in to see more of this pod.'))
      }
      status.textContent = ''
      root.dataset.ready = 'true'
    }

    fill().catch((error) => {
      status.textContent = 'Could not read the pod: ' + (error && error.message ? error.message : error)
      status.classList.add('hom-status-error')
      status.setAttribute('role', 'alert')
      root.dataset.ready = 'true'
    })
    return root
  }
}

export default pane
