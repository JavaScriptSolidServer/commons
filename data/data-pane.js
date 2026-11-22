// data-pane.js: what the data says about anything. The view of last resort in the data browser.
//
// One file, no imports. It is offered for every subject and never asks to open first: any pane
// made for the kind of thing on show comes before it. It reads only what is in the store
// (and loads the subject's document if nobody has yet). It never writes.
//
//   About this       every property of the subject and its values, names first, then text and
//                    numbers, then links. Unnamed (blank) nodes nested, lists as numbered lists.
//   Linked from      the things that point at the subject, by the link they use.
//   In this document for a document: the things it describes, each one a link.
//   As text          the document as Turtle or JSON-LD, with a Copy button.
//
// Works with data in any vocabulary: a property is shown by its rdfs:label when the store has
// one, else by its local name made readable ("birthDate" -> "Birth date").

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDF_TYPE = RDF + 'type'
const RDF_FIRST = RDF + 'first'
const RDF_REST = RDF + 'rest'
const RDF_NIL = RDF + 'nil'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const PLAIN = [XSD + 'string', RDF + 'langString']
// Local names that name a thing, best first.
const NAMES = ['name', 'fn', 'prefLabel', 'label', 'title', 'summary', 'nick']
// A few local names that read badly as they are.
const WORDS = { type: 'Type', fn: 'Full name', mbox: 'Email', nick: 'Nickname', img: 'Image', dtstart: 'Starts', dtend: 'Ends', mtime: 'Modified', homepage: 'Home page', seeAlso: 'See also', sameAs: 'Same as', dc: 'DC' }

const DEPTH = 4 // how deep unnamed nodes are opened
const VALUES = 12 // values shown per property before "show more"
const LONG = 2000 // characters of one value shown before "show all"
const POINTERS = 8 // things shown per property in Linked from
const THINGS = 40 // things shown in In this document, per step
const TEXT_STATEMENTS = 20000 // most statements turned into text
const TEXT_LINES = 1500 // most lines of text put on the page
const TEXT_CHARS = 200000

// Icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box.
const MDI = {
  data: 'M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z',
  thing: 'M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L6.04,7.5L12,10.85L17.96,7.5L12,4.15M5,15.91L11,19.29V12.58L5,9.21V15.91M19,15.91V9.21L13,12.58V19.29L19,15.91Z',
  copy: 'M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z',
  alert: 'M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)
const ICON = svg(MDI.data, '#00679e')

const CSS = `
/* suite:design begin --prefix dat --only icon,row,buttons,chip,empty,toast */
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
.dat-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.dat-root *, .dat-root *::before, .dat-root *::after { box-sizing: border-box }
.dat-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.dat-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.dat-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.dat-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.dat-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.dat-root [hidden] { display: none !important }
.dat-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.dat-muted { color: var(--sui-text-muted) }
.dat-small { font-size: var(--sui-text-sm) }
.dat-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.dat-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.dat-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.dat-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.dat-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.dat-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --dat-i set to url("data:image/svg+xml,...") ---------------------------------- */
.dat-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--dat-i) center / contain no-repeat; mask: var(--dat-i) center / contain no-repeat }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.dat-list { margin: 0; padding: 0; list-style: none }
.dat-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.dat-row:hover { background: var(--sui-bg-hover) }
.dat-row[aria-selected="true"], .dat-row[aria-current="true"] { background: var(--sui-primary-light) }
.dat-row-main { flex: 1 1 auto; min-width: 0 }
.dat-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.dat-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.dat-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.dat-row-actions { flex: none; display: flex; align-items: center }
.dat-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.dat-row-icon .dat-icon { width: 28px; height: 28px }
.dat-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .dat-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.dat-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.dat-btn:hover { background: var(--sui-primary-light-hover) }
.dat-btn:disabled, .dat-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.dat-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.dat-btn-primary:hover { background: var(--sui-primary-element-hover) }
.dat-btn-tertiary { background: transparent; color: var(--sui-text) }
.dat-btn-tertiary:hover { background: var(--sui-bg-hover) }
.dat-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.dat-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.dat-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.dat-btn-icon:hover { background: var(--sui-bg-hover) }
.dat-btn-wide { width: 100%; justify-content: flex-start }
.dat-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.dat-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.dat-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.dat-chip { cursor: pointer }
button.dat-chip:hover { background: var(--sui-primary-light-hover) }
.dat-chip-primary, .dat-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.dat-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.dat-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.dat-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.dat-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.dat-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.dat-empty-icon .dat-icon { width: 48px; height: 48px }
.dat-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.dat-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.dat-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.dat-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.dat-toast-error { border-left-color: var(--sui-error) }
.dat-toast-success { border-left-color: var(--sui-success) }
.dat-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.dat-status-error { color: var(--sui-error) }
.dat-status-success { color: var(--sui-success) }
.dat-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.dat-note-error { background: var(--sui-error-light) }
.dat-note-warning { background: var(--sui-warning-light) }
.dat-note-success { background: var(--sui-success-light) }
/* suite:design end */
.dat.data-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-2) var(--sui-space-8); container-type: inline-size; min-width: 0 }
.dat-head { display: flex; flex-direction: column; gap: var(--sui-space-1); padding: 0 var(--sui-space-3) }
.dat-title { overflow-wrap: anywhere }
.dat-uri { font-family: var(--sui-font-mono); font-size: var(--sui-text-sm); color: var(--sui-text-muted); overflow-wrap: anywhere }
.dat-types { margin: var(--sui-space-1) 0 0; padding: 0; list-style: none }
.dat-types:empty { display: none }
a.dat-chip { color: var(--sui-primary-light-text); background: var(--sui-primary-light); text-decoration: none }
a.dat-chip:hover { background: var(--sui-primary-light-hover); text-decoration: none }
.dat-note { margin: var(--sui-space-4) var(--sui-space-3) 0; overflow-wrap: anywhere }
.dat-note .dat-icon { margin-top: 2px }
.dat-note.dat-quiet { background: var(--sui-bg-app); color: var(--sui-text-muted) }
.dat-section { margin-top: var(--sui-space-8) }
.dat-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sui-space-1) var(--sui-space-3); margin: 0 0 var(--sui-space-2); padding: 0 var(--sui-space-3) }
.dat-h small { font-size: var(--sui-text-sm); font-weight: var(--sui-weight); color: var(--sui-text-muted) }
.dat-rows { display: flex; flex-direction: column }
.dat-prop { display: grid; grid-template-columns: minmax(110px, 13em) minmax(0, 1fr); gap: 2px var(--sui-space-5); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-3); border-top: 1px solid var(--sui-border); border-radius: 0 }
.dat-rows > .dat-prop:first-child { border-top-color: transparent }
.dat-prop:hover { background: var(--sui-bg-hover); border-radius: var(--sui-radius) }
.dat-prop:hover, .dat-prop:hover + .dat-prop { border-top-color: transparent }
.dat-rows > .dat-prop.dat-break { border-top: 2px solid var(--sui-bg-dark) }
.dat-key { color: var(--sui-text-muted); overflow-wrap: anywhere; min-width: 0; cursor: help }
.dat-key .dat-n { color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.dat-vals { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sui-space-1); align-items: flex-start; min-width: 0 }
.dat-vals > li { max-width: 100%; min-width: 0 }
.dat-val { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap }
.dat-tag { display: inline-block; margin-left: var(--sui-space-2); padding: 0 var(--sui-space-1); border-radius: var(--sui-radius-sm); font-size: var(--sui-text-sm); color: var(--sui-text-muted); background: var(--sui-bg-dark); white-space: nowrap; line-height: 1.4 }
.dat a { text-decoration: none }
.dat a:hover { text-decoration: underline }
.dat-plain { font-family: var(--sui-font-mono); font-size: var(--sui-text-sm) }
.dat-nest { container-type: inline-size; width: 100%; margin: 2px 0; padding: var(--sui-space-1) var(--sui-space-3); border-left: 3px solid var(--sui-primary-light-hover); background: var(--sui-bg-app); border-radius: 0 var(--sui-radius) var(--sui-radius) 0 }
.dat-vals > li:has(> .dat-nest) { width: 100% }
.dat-nest .dat-prop { grid-template-columns: minmax(90px, 10em) minmax(0, 1fr); min-height: 0; padding: 6px 0 }
.dat-nest .dat-prop:hover { background: none }
.dat-seq { margin: 0; padding-left: var(--sui-space-6); display: flex; flex-direction: column; gap: 2px }
.dat-deep { color: var(--sui-text-muted) }
.dat-more { margin-top: var(--sui-space-1); margin-left: calc(-1 * var(--sui-space-4)) }
.dat-things > .dat-more { margin: var(--sui-space-2) 0 0 }
.dat-thing { min-width: 0 }
.dat-thing .dat-row-icon .dat-icon { width: 24px; height: 24px }
.dat-thing .dat-row-title { max-width: 100%; width: max-content }
.dat-thing .dat-row-sub { display: flex; flex-wrap: wrap; gap: var(--sui-space-1); margin-top: 2px; white-space: normal }
.dat-thing .dat-row-sub:empty { display: none }
.dat-switch { align-items: center }
.dat-btn.dat-toggle[aria-pressed="true"] { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.dat-text { margin-top: var(--sui-space-3); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); overflow: hidden }
.dat-bar { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) var(--sui-space-3); align-items: center; min-height: calc(var(--sui-target) + var(--sui-space-3)); padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-4); background: var(--sui-bg-app); border-bottom: 1px solid var(--sui-border); font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.dat-bar span { flex: 1 1 200px; min-width: 0 }
.dat-pre { margin: 0; padding: var(--sui-space-3) var(--sui-space-4); max-height: 70vh; overflow: auto; font-family: var(--sui-font-mono); font-size: var(--sui-text-sm); line-height: var(--sui-line); color: var(--sui-text); background: var(--sui-bg); white-space: pre; tab-size: 2 }
.dat-empty { margin-top: var(--sui-space-8); margin-bottom: var(--sui-space-8) }
@container (max-width: 520px) {
  .dat-prop, .dat-nest .dat-prop { grid-template-columns: minmax(0, 1fr) }
  .dat-key { font-size: var(--sui-text-sm) }
  .dat-title { font-size: var(--sui-text-xl) }
  .dat-thing .dat-row-meta { display: none }
}
`

function el (dom, tag, className, text) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function icon (dom, path) {
  const span = dom.createElement('span')
  span.className = 'dat-icon'
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--dat-i', `url("${svg(path)}")`)
  return span
}

const localName = (uri) => {
  const cut = uri.replace(/[/#]+$/, '')
  return cut.slice(Math.max(cut.lastIndexOf('#'), cut.lastIndexOf('/'), cut.lastIndexOf(':')) + 1)
}
const said = (n) => n.toLocaleString()
const plural = (n, one, many) => said(n) + ' ' + (n === 1 ? one : (many || one + 's'))
const safeHref = (uri) => /^(https?:|mailto:|tel:)/i.test(uri)

// "birthDate" -> "Birth date", "has_address" -> "Has address".
function readable (word) {
  if (WORDS[word]) return WORDS[word]
  let text = ''
  try { text = decodeURIComponent(word) } catch { text = word }
  text = text.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim()
  if (!text) return word
  text = text.split(' ').map((w, i) => (i > 0 && /^[A-Z][a-z]+$/.test(w)) ? w.toLowerCase() : w).join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// The text of a literal in the language the viewer reads, else any.
function pickText (literals) {
  if (!literals.length) return null
  const want = ((globalThis.navigator && navigator.language) || 'en').slice(0, 2).toLowerCase()
  return literals.find(l => (l.language || '').slice(0, 2).toLowerCase() === want) || literals.find(l => !l.language) || literals[0]
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

function dateText (value, kind) {
  const m = /^(-?\d{4,})-(\d{2})-(\d{2})/.exec(value)
  if (!m || !realDay(Number(m[1]), Number(m[2]), Number(m[3]))) return null
  if (kind === 'date') {
    if (m[0] !== value) return null
    const d = new Date(2000, 0, 1)
    d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  }
  if (!/^\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null
  const d = new Date(value)
  return isNaN(d) ? null : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const NUMBERS = ['integer', 'int', 'long', 'short', 'byte', 'decimal', 'double', 'float', 'nonNegativeInteger', 'positiveInteger', 'negativeInteger', 'nonPositiveInteger', 'unsignedInt', 'unsignedLong', 'unsignedShort', 'unsignedByte']

const pane = {
  name: 'data-lab',
  icon: ICON,
  label () { return 'Data' },
  shouldGetFocus () { return false },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const $rdf = globalThis.$rdf
    const sym = (uri) => store.sym(uri)

    const root = el(dom, 'div', 'dat data-pane dat-root')
    root.appendChild(el(dom, 'style', '', CSS))
    const head = root.appendChild(el(dom, 'header', 'dat-head'))
    const body = root.appendChild(el(dom, 'div', 'dat-body'))

    const doc = subject.termType === 'NamedNode' && /^https?:/i.test(subject.value) ? subject.doc() : null
    const isDoc = !!doc && doc.value === subject.value

    // ---- names and links

    function nameOf (node) {
      if (node.termType !== 'NamedNode' && node.termType !== 'BlankNode') return null
      const found = {}
      for (const st of store.statementsMatching(node)) {
        if (st.object.termType !== 'Literal') continue
        const key = localName(st.predicate.value)
        if (NAMES.includes(key)) (found[key] = found[key] || []).push(st.object)
      }
      for (const key of NAMES) if (found[key]) return pickText(found[key]).value
      return null
    }
    function shortName (node) {
      const uri = node.value
      if (/^(mailto|tel):/i.test(uri)) return uri.slice(uri.indexOf(':') + 1).split('?')[0]
      if (!/^https?:/i.test(uri)) return uri
      if (uri.includes('#')) return uri.slice(uri.lastIndexOf('#') + 1) || uri
      try {
        const url = new URL(uri)
        const parts = url.pathname.split('/').filter(Boolean)
        if (!parts.length) return url.host || uri
        const last = decodeURIComponent(parts[parts.length - 1])
        return uri.endsWith('/') ? last + '/' : last
      } catch { return localName(uri) || uri }
    }
    const labelOf = (node) => nameOf(node) || shortName(node)

    // The prefix a vocabulary is known by ("foaf"), else its site: to tell apart two "Person"s.
    function vocabOf (uri) {
      let best = ''
      let bestPrefix = ''
      for (const [prefix, ns] of Object.entries(store.namespaces || {})) {
        if (prefix && ns && uri.startsWith(ns) && ns.length > best.length) { best = ns; bestPrefix = prefix }
      }
      if (bestPrefix) return bestPrefix
      try { return new URL(uri).host.replace(/^www\./, '') } catch { return '' }
    }
    // Links to named things, with the vocabulary added where two would read the same.
    function namedLinks (nodes, className) {
      const labels = nodes.map(labelOf)
      const seen = new Map()
      for (const l of labels) seen.set(l, (seen.get(l) || 0) + 1)
      return nodes.map((node, i) => {
        const v = seen.get(labels[i]) > 1 ? vocabOf(node.value) : ''
        return linkTo(node, v ? labels[i] + ' (' + v + ')' : labels[i], className)
      })
    }

    function propertyName (predicate) {
      const labels = store.each(predicate, sym(RDFS_LABEL)).filter(l => l.termType === 'Literal')
      const label = pickText(labels)
      return label ? label.value : readable(localName(predicate.value) || predicate.value)
    }

    function linkTo (node, text, className) {
      const uri = node.value
      if (!safeHref(uri)) {
        const span = el(dom, 'span', 'dat-plain' + (className ? ' ' + className : ''), text)
        span.title = uri
        return span
      }
      const a = el(dom, 'a', className || '', text)
      a.href = uri
      a.rel = 'noopener'
      a.title = uri
      if (/^https?:/i.test(uri)) {
        a.addEventListener('click', (event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          const outliner = context.getOutliner && context.getOutliner(dom)
          if (!outliner || !outliner.GotoSubject) return
          event.preventDefault()
          outliner.GotoSubject(node, true, undefined, true, undefined)
        })
      }
      return a
    }

    // ---- values

    function literalView (lit) {
      const span = el(dom, 'span', 'dat-val')
      const type = lit.datatype ? lit.datatype.value : ''
      const kind = type.startsWith(XSD) ? type.slice(XSD.length) : ''
      let shown = null
      if (kind === 'date' || kind === 'dateTime') shown = dateText(lit.value, kind)
      else if (kind === 'gYear' || kind === 'gYearMonth') shown = lit.value
      else if (NUMBERS.includes(kind)) shown = numberText(lit.value, kind, 20)
      else if (kind === 'boolean') {
        const yes = /^(true|1)$/.test(lit.value.trim())
        const pill = el(dom, 'span', yes ? 'dat-chip dat-chip-success dat-yes' : 'dat-chip dat-no', yes ? 'Yes' : 'No')
        pill.title = lit.value + ' (boolean)'
        span.appendChild(pill)
        return span
      }
      // A very long value (a pasted document, base64) is cut, with a button for the rest.
      const full = shown !== null ? shown : lit.value
      const text = span.appendChild(dom.createTextNode(full.length > LONG ? full.slice(0, LONG) + '…' : full))
      if (shown !== null) span.title = lit.value
      if (lit.language) {
        const tag = span.appendChild(el(dom, 'span', 'dat-tag', lit.language))
        tag.title = 'Language: ' + lit.language
      } else if (type && !PLAIN.includes(type) && shown === null) {
        const tag = span.appendChild(el(dom, 'span', 'dat-tag', localName(type) || type))
        tag.title = type
      }
      if (full.length > LONG) {
        const more = span.appendChild(el(dom, 'button', 'dat-more dat-btn dat-btn-tertiary dat-long', 'Show all ' + said(full.length) + ' characters'))
        more.type = 'button'
        more.addEventListener('click', () => { text.data = full; more.remove() })
      }
      return span
    }

    // An RDF list as an array of its members, or null if the node is not one.
    function listMembers (node) {
      if (node.termType === 'Collection') return node.elements
      if (node.termType !== 'BlankNode' || !store.any(node, sym(RDF_FIRST))) return null
      const out = []
      const seen = new Set()
      let at = node
      while (at && at.value !== RDF_NIL && !seen.has(at.value) && out.length < 1000) {
        seen.add(at.value)
        const first = store.any(at, sym(RDF_FIRST))
        if (first) out.push(first)
        at = store.any(at, sym(RDF_REST))
      }
      return out
    }

    function valueView (node, depth, path) {
      if (node.termType === 'Literal') return literalView(node)
      const members = listMembers(node)
      if (members) {
        const ol = el(dom, 'ol', 'dat-seq')
        for (const m of members) ol.appendChild(el(dom, 'li', 'dat-val')).appendChild(valueView(m, depth + 1, path))
        if (!members.length) ol.appendChild(el(dom, 'li', 'dat-deep', 'an empty list'))
        return ol
      }
      if (node.termType === 'NamedNode') return linkTo(node, labelOf(node))
      if (node.termType === 'BlankNode') {
        if (path.has(node.value)) return el(dom, 'span', 'dat-deep', 'the same unnamed thing as above')
        if (depth >= DEPTH) return el(dom, 'span', 'dat-deep', 'more nested data, not shown')
        const box = el(dom, 'div', 'dat-nest')
        const inner = new Set(path).add(node.value)
        const rows = rowsView(node, depth + 1, inner, false)
        if (rows) box.appendChild(rows)
        else box.appendChild(el(dom, 'span', 'dat-deep', 'an unnamed thing with nothing said about it'))
        return box
      }
      return el(dom, 'span', 'dat-val', node.value)
    }

    // Shows the first few of a list of items, and a button for the rest.
    function capped (list, items, limit, make) {
      const add = (from, to) => { for (const item of items.slice(from, to)) list.appendChild(make(item)) }
      add(0, limit)
      if (items.length > limit) {
        const more = el(dom, 'button', 'dat-more dat-btn dat-btn-tertiary', 'Show ' + said(items.length - limit) + ' more')
        more.type = 'button'
        more.addEventListener('click', () => { more.remove(); add(limit, items.length) })
        list.appendChild(more)
      }
    }

    const termKey = (t) => t.termType + '|' + t.value + '|' + (t.language || '') + '|' + (t.datatype ? t.datatype.value : '')

    // Every property of a node and its values, as rows: names and types, then text, then links.
    function rowsView (node, depth, path, top) {
      const byProperty = new Map()
      for (const st of store.statementsMatching(node)) {
        const p = st.predicate.value
        if (!byProperty.has(p)) byProperty.set(p, { predicate: st.predicate, values: new Map() })
        byProperty.get(p).values.set(termKey(st.object), st.object)
      }
      if (!byProperty.size) return null
      const groups = [...byProperty.values()].map(g => {
        const values = [...g.values.values()]
        const name = propertyName(g.predicate)
        const local = localName(g.predicate.value)
        const rank = g.predicate.value === RDF_TYPE ? 0 : NAMES.includes(local) ? 1 + NAMES.indexOf(local) / 100 : values.every(v => v.termType === 'Literal') ? 2 : 3
        return { predicate: g.predicate, values, name, rank }
      })
      groups.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      const rows = el(dom, 'div', 'dat-rows')
      let lastRank = null
      for (const g of groups) {
        const row = rows.appendChild(el(dom, 'div', 'dat-prop'))
        row.dataset.property = g.predicate.value
        const band = Math.floor(g.rank)
        if (top && lastRank !== null && band !== lastRank && band >= 2) row.classList.add('dat-break')
        lastRank = band
        const key = row.appendChild(el(dom, 'div', 'dat-key', g.name))
        key.title = g.predicate.value
        if (g.values.length > 1) key.appendChild(el(dom, 'span', 'dat-n', ' · ' + said(g.values.length)))
        const vals = row.appendChild(el(dom, 'ul', 'dat-vals'))
        const sorted = g.values.slice().sort((a, b) => (b.termType === 'Literal') - (a.termType === 'Literal'))
        const named = sorted.filter(v => v.termType === 'NamedNode')
        const made = namedLinks(named)
        const links = new Map(named.map((v, i) => [v, made[i]]))
        capped(vals, sorted, VALUES, (v) => {
          const li = el(dom, 'li')
          li.appendChild(links.get(v) || valueView(v, depth, path))
          return li
        })
      }
      return rows
    }

    // ---- sections

    function section (title, count) {
      const box = el(dom, 'section', 'dat-section')
      const h = box.appendChild(el(dom, 'h3', 'dat-h dat-subheading', title))
      if (count) h.appendChild(el(dom, 'small', '', count))
      return box
    }

    function about () {
      const box = section('About this', plural(store.statementsMatching(subject).length, 'statement'))
      const rows = rowsView(subject, 0, new Set([subject.value]), true)
      box.appendChild(rows)
      box.dataset.part = 'about'
      return box
    }

    function linkedFrom () {
      const sts = store.statementsMatching(null, null, subject)
      if (!sts.length) return null
      const byProperty = new Map()
      for (const st of sts) {
        const p = st.predicate.value
        if (!byProperty.has(p)) byProperty.set(p, { predicate: st.predicate, from: new Map() })
        byProperty.get(p).from.set(st.subject.value, st)
      }
      const groups = [...byProperty.values()].map(g => ({ ...g, name: propertyName(g.predicate) }))
      groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      const box = section('Linked from', plural(new Set(sts.map(s => s.subject.value)).size, 'thing') + ' point here')
      box.dataset.part = 'linked'
      const rows = box.appendChild(el(dom, 'div', 'dat-rows'))
      for (const g of groups) {
        const row = rows.appendChild(el(dom, 'div', 'dat-prop'))
        row.dataset.property = g.predicate.value
        const key = row.appendChild(el(dom, 'div', 'dat-key', g.name))
        key.title = g.predicate.value + ' (these things say this about it)'
        const from = [...g.from.values()].sort((a, b) => labelOf(a.subject).localeCompare(labelOf(b.subject), undefined, { numeric: true, sensitivity: 'base' }))
        if (from.length > 1) key.appendChild(el(dom, 'span', 'dat-n', ' · ' + said(from.length)))
        const vals = row.appendChild(el(dom, 'ul', 'dat-vals'))
        capped(vals, from, POINTERS, (st) => {
          const li = el(dom, 'li', 'dat-val')
          if (st.subject.termType === 'NamedNode') li.appendChild(linkTo(st.subject, labelOf(st.subject)))
          else {
            // An unnamed thing: say where it hangs from, which can be linked.
            const parent = store.statementsMatching(null, null, st.subject).map(s => s.subject).find(s => s.termType === 'NamedNode')
            const where = parent || (st.why && st.why.termType === 'NamedNode' ? st.why : null)
            li.appendChild(dom.createTextNode(nameOf(st.subject) || 'Something unnamed'))
            if (where) { li.appendChild(dom.createTextNode(parent ? ', part of ' : ', in ')); li.appendChild(linkTo(where, labelOf(where))) }
          }
          return li
        })
      }
      return box
    }

    function inDocument () {
      if (!isDoc) return null
      const sts = store.statementsMatching(null, null, null, doc)
      const counts = new Map()
      const objects = new Set()
      for (const st of sts) {
        counts.set(st.subject.value, (counts.get(st.subject.value) || { node: st.subject, n: 0 }))
        counts.get(st.subject.value).n++
        if (st.object.termType === 'BlankNode') objects.add(st.object.value)
      }
      const things = [...counts.values()].filter(t => t.node.termType === 'NamedNode' && t.node.value !== doc.value)
      const loose = [...counts.values()].filter(t => t.node.termType === 'BlankNode' && !objects.has(t.node.value)).length
      if (!things.length && !loose) return null
      things.forEach(t => { t.label = labelOf(t.node) })
      things.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
      const box = section('In this document', plural(things.length, 'thing') + (loose ? ' and ' + plural(loose, 'unnamed one') : ''))
      box.dataset.part = 'things'
      const list = box.appendChild(el(dom, 'ul', 'dat-things dat-list'))
      // A list row: the thing's name (a link), its types as chips, how much is said about it.
      const make = (t) => {
        const li = el(dom, 'li', 'dat-thing dat-row')
        li.appendChild(el(dom, 'span', 'dat-row-icon')).appendChild(icon(dom, MDI.thing))
        const main = li.appendChild(el(dom, 'div', 'dat-row-main'))
        const link = main.appendChild(linkTo(t.node, t.label, 'dat-row-title'))
        const sub = main.appendChild(el(dom, 'div', 'dat-row-sub'))
        for (const chip of namedLinks(store.each(t.node, sym(RDF_TYPE), null, doc).filter(n => n.termType === 'NamedNode'), 'dat-chip')) sub.appendChild(chip)
        li.appendChild(el(dom, 'span', 'dat-count dat-row-meta', plural(t.n, 'statement')))
        // The whole row opens the thing, as its name does.
        li.addEventListener('click', (event) => { if (!event.target.closest('a') && link.click) link.click() })
        return li
      }
      const add = (from) => {
        for (const t of things.slice(from, from + THINGS)) list.appendChild(make(t))
        const left = things.length - from - THINGS
        if (left > 0) {
          const more = el(dom, 'button', 'dat-more dat-btn dat-btn-tertiary', 'Show ' + said(Math.min(left, THINGS)) + ' more of ' + said(left))
          more.type = 'button'
          more.addEventListener('click', () => { more.remove(); add(from + THINGS) })
          list.appendChild(more)
        }
      }
      add(0)
      return box
    }

    // The document as text: made when asked for, kept for the next time.
    const made = {}
    function serialize (type) {
      const all = store.statementsMatching(null, null, null, doc)
      let kb = store
      if (all.length > TEXT_STATEMENTS) {
        kb = $rdf.graph()
        for (const st of all.slice(0, TEXT_STATEMENTS)) kb.add(st.subject, st.predicate, st.object, st.why)
      }
      return new Promise((resolve, reject) => {
        try {
          const result = $rdf.serialize(doc, kb, doc.value, type, (error, text) => error ? reject(error) : resolve(text))
          if (result !== undefined) Promise.resolve(result).then(resolve, reject)
        } catch (error) { reject(error) }
      }).then(text => {
        text = String(text || '')
        if (type === 'application/ld+json') { try { text = JSON.stringify(JSON.parse(text), null, 2) } catch { /* as it came */ } }
        return { text, cut: all.length > TEXT_STATEMENTS }
      })
    }

    async function copy (text, button) {
      let ok = false
      // The clipboard API can wait for a permission that never comes: give it two seconds.
      try { ok = await Promise.race([navigator.clipboard.writeText(text).then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 2000))]) } catch { /* try the old way */ }
      if (!ok) {
        const area = el(dom, 'textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px'
        root.appendChild(area)
        area.select()
        try { ok = dom.execCommand('copy') } catch { ok = false }
        area.remove()
      }
      button.textContent = ok ? 'Copied' : 'Could not copy'
      setTimeout(() => { button.textContent = 'Copy' }, 2000)
    }

    function asText () {
      if (!doc) return null
      const n = store.statementsMatching(null, null, null, doc).length
      if (!n) return null
      const box = section('As text', plural(n, 'statement') + ' in ' + shortName(doc))
      box.dataset.part = 'text'
      const bar = box.appendChild(el(dom, 'div', 'dat-switch dat-btns'))
      const panel = box.appendChild(el(dom, 'div', 'dat-text'))
      panel.hidden = true
      const buttons = []
      for (const [label, type] of [['Turtle', 'text/turtle'], ['JSON-LD', 'application/ld+json']]) {
        const b = bar.appendChild(el(dom, 'button', 'dat-btn dat-toggle', label))
        b.type = 'button'
        b.setAttribute('aria-pressed', 'false')
        b.dataset.type = type
        buttons.push(b)
        b.addEventListener('click', async () => {
          const on = b.getAttribute('aria-pressed') !== 'true'
          buttons.forEach(x => x.setAttribute('aria-pressed', 'false'))
          if (!on) { panel.hidden = true; return }
          b.setAttribute('aria-pressed', 'true')
          panel.hidden = false
          panel.replaceChildren(el(dom, 'div', 'dat-bar', 'Making ' + label + '…'))
          if (!$rdf || !$rdf.serialize) { panel.replaceChildren(el(dom, 'div', 'dat-bar', 'This data browser cannot write text from data.')); return }
          try {
            made[type] = made[type] || await serialize(type)
          } catch (error) {
            if (b.getAttribute('aria-pressed') === 'true') panel.replaceChildren(el(dom, 'div', 'dat-bar', 'Could not write it as ' + label + ': ' + (error && error.message ? error.message : error)))
            return
          }
          if (b.getAttribute('aria-pressed') !== 'true') return
          const { text, cut } = made[type]
          const lines = text.split('\n')
          let shown = lines.length > TEXT_LINES ? lines.slice(0, TEXT_LINES).join('\n') : text
          if (shown.length > TEXT_CHARS) shown = shown.slice(0, TEXT_CHARS)
          const top = el(dom, 'div', 'dat-bar')
          const parts = [label + ', ' + plural(lines.length, 'line')]
          if (cut) parts.push('only the first ' + said(TEXT_STATEMENTS) + ' of ' + said(n) + ' statements')
          if (shown.length < text.length) parts.push('showing the first ' + plural(shown.split('\n').length, 'line') + '; Copy takes all of it')
          top.appendChild(el(dom, 'span', 'dat-what', parts.join(' · ')))
          const c = top.appendChild(el(dom, 'button', 'dat-btn dat-copy', 'Copy'))
          c.type = 'button'
          c.addEventListener('click', () => copy(text, c))
          const pre = el(dom, 'pre', 'dat-pre', shown)
          pre.setAttribute('aria-label', label + ' of ' + doc.value)
          pre.tabIndex = 0
          panel.replaceChildren(top, pre)
        })
      }
      return box
    }

    // ---- the whole pane

    function draw (state, why) {
      head.replaceChildren()
      body.replaceChildren()
      const name = nameOf(subject)
      head.appendChild(el(dom, 'h2', 'dat-title', name || shortName(subject)))
      head.appendChild(el(dom, 'p', 'dat-uri', subject.value))
      const types = head.appendChild(el(dom, 'ul', 'dat-types dat-chips'))
      for (const chip of namedLinks(store.each(subject, sym(RDF_TYPE)).filter(n => n.termType === 'NamedNode'), 'dat-chip')) types.appendChild(el(dom, 'li')).appendChild(chip)
      const note = (text, kind) => {
        const p = body.appendChild(el(dom, 'p', 'dat-note' + (kind ? ' ' + kind : '')))
        if (kind !== 'dat-quiet') p.appendChild(icon(dom, MDI.alert))
        p.appendChild(el(dom, 'span', '', text))
        return p
      }
      if (state === 'loading') note('Loading ' + shortName(doc) + '…', 'dat-quiet')
      if (state === 'failed') note(why, 'dat-bad dat-note-error')

      const parts = [
        store.statementsMatching(subject).length ? about() : null,
        linkedFrom(),
        inDocument()
      ].filter(Boolean)
      if (!parts.length && !state) {
        const empty = body.appendChild(el(dom, 'div', 'dat-empty'))
        empty.dataset.part = 'nothing'
        empty.appendChild(el(dom, 'span', 'dat-empty-icon')).appendChild(icon(dom, MDI.data))
        empty.appendChild(el(dom, 'h3', 'dat-empty-title', 'Nothing is known about this here.'))
        const n = doc && !isDoc ? store.statementsMatching(null, null, null, doc).length : 0
        // The leading space keeps the whole box's text a sentence apart (it is not seen).
        if (n) empty.appendChild(el(dom, 'p', 'dat-empty-text', ' Its document, ' + shortName(doc) + ', holds ' + plural(n, 'statement') + ' about other things: see it as text below.'))
      }
      for (const part of parts) body.appendChild(part)
      const text = asText()
      if (text) body.appendChild(text)
      root.dataset.state = state || 'ready'
    }

    function whyFailed (code, error) {
      if (code === 401) return 'You need to log in to read ' + shortName(doc) + ' (401).'
      if (code === 403) return 'You are not allowed to read ' + shortName(doc) + ' (403).'
      if (code === 404) return 'There is no document at ' + doc.value + ' (404).'
      if (typeof code === 'number' && code > 0) return shortName(doc) + ' could not be read (' + code + ').'
      return shortName(doc) + ' could not be read' + (error && error.message ? ': ' + error.message : '.')
    }

    const fetcher = store.fetcher
    const stateOf = () => (doc && fetcher && fetcher.getState) ? fetcher.getState(doc.value) : 'fetched'
    const codeOf = (error) => {
      const known = fetcher && fetcher.requested ? fetcher.requested[doc.value] : undefined
      if (typeof known === 'number') return known
      return (error && (error.status || (error.response && error.response.status))) || 0
    }
    const now = stateOf()
    if (now === 'fetched') draw()
    else if (now === 'failed') draw('failed', whyFailed(codeOf()))
    else {
      draw('loading')
      fetcher.load(doc).then(() => {
        if (stateOf() === 'failed') draw('failed', whyFailed(codeOf()))
        else draw()
      }, (error) => draw('failed', whyFailed(codeOf(error), error)))
    }
    return root
  }
}

export default pane
