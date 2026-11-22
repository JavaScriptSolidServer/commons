// pad-pane.js: a shared notepad kept in a pod. Read it line by line, each line marked by who wrote it;
// edit it line by line when you are allowed to. Other people's changes show up within ten seconds.
//
// One file, no imports. It reads and writes the format of SolidOS's own notepad
// (http://www.w3.org/ns/pim/pad#), so a pad made there opens here and the other way round:
//
//   index.ttl   <#this> a pad:Notepad ; dc:title "Shared Notes" ; dc:author <WebID> ; dc:created "…"^^xsd:dateTime ;
//                   pad:next <#this_line0> ;                     (the first line)
//                   wf:participation <#p1> .                     (who has taken part, with their colour)
//               <#this_line0> sioc:content "First line" ; dc:author <WebID> ; pad:next <#id1732…> .
//               <#id1732…>    sioc:content "Second line" ; dc:author <WebID> ; pad:next <#this> .   (back to the pad: the end)
//               <#p1> wf:participant <WebID> ; cal:dtstart "…"^^xsd:dateTime ; ui:backgroundColor "#e4c3d9" .
//
// The lines are a ring: pad:next from the pad through every line and back to the pad. Each line has exactly
// one sioc:content and one dc:author (the SolidOS pane refuses a pad where that is not so).
//
// What this pane writes, and when (always one small patch, never the whole file; no access rules):
// - "New Notepad" in a folder's Add menu: index.ttl as above, with one empty line.
// - When you leave a line or pause typing: that line's text, you as its author, and dc:date (now).
// - Enter: a new empty line after the current one (two pad:next links change). Backspace on an empty line: it goes.
// - The first time you change anything: your participation and colour, as the SolidOS pane does.
// Two people editing the same line: the last one saved wins.

const PAD = 'http://www.w3.org/ns/pim/pad#'
const DC = 'http://purl.org/dc/elements/1.1/'
const DCT = 'http://purl.org/dc/terms/'
// When a line was last written. dc:date (Dublin Core elements), not dct:modified: JSS 0.0.x stores any dct: term
// a PATCH sends as dc:<same name>, so dct:modified could never be deleted again. Both are still read.
const WHEN = [DC + 'date', DCT + 'modified', DC + 'modified']
const SIOC_CONTENT = 'http://rdfs.org/sioc/ns#content'
const WF = 'http://www.w3.org/2005/01/wf/flow#'
const CAL_DTSTART = 'http://www.w3.org/2002/12/cal/ical#dtstart'
const UI_BG = 'http://www.w3.org/ns/ui#backgroundColor'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'
const VCARD_FN = 'http://www.w3.org/2006/vcard/ns#fn'
const PAUSE = 1500 // ms of no typing before a line is saved
const POLL = 10000 // ms between checks for other people's changes

const CSS = `
/* suite:design begin --prefix npd --only icon,toolbar,row,buttons,chip,avatar,toast,details */
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
.npd-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.npd-root *, .npd-root *::before, .npd-root *::after { box-sizing: border-box }
.npd-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.npd-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.npd-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.npd-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.npd-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.npd-root [hidden] { display: none !important }
.npd-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.npd-muted { color: var(--sui-text-muted) }
.npd-small { font-size: var(--sui-text-sm) }
.npd-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.npd-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.npd-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.npd-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.npd-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.npd-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --npd-i set to url("data:image/svg+xml,...") ---------------------------------- */
.npd-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--npd-i) center / contain no-repeat; mask: var(--npd-i) center / contain no-repeat }
/* ---- toolbar: content toolbar and breadcrumbs ---------------------------------------------------------------------- */
.npd-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2); min-height: calc(var(--sui-target) + var(--sui-space-3)); padding: var(--sui-space-1) var(--sui-space-3) }
.npd-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; min-width: 0; margin: 0; padding: 0; list-style: none; font-size: var(--sui-text-lg) }
.npd-crumbs li { display: flex; align-items: center; min-width: 0 }
.npd-crumbs li + li::before { content: "›"; padding: 0 var(--sui-space-1); color: var(--sui-text-muted) }
.npd-crumbs a { display: inline-flex; align-items: center; min-height: var(--sui-target); padding: 0 var(--sui-space-2); border-radius: var(--sui-radius); color: var(--sui-text-muted); text-decoration: none; overflow-wrap: anywhere }
.npd-crumbs a:hover { background: var(--sui-bg-hover) }
.npd-crumbs [aria-current="page"] { color: var(--sui-text); font-weight: var(--sui-weight-bold) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.npd-list { margin: 0; padding: 0; list-style: none }
.npd-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.npd-row:hover { background: var(--sui-bg-hover) }
.npd-row[aria-selected="true"], .npd-row[aria-current="true"] { background: var(--sui-primary-light) }
.npd-row-main { flex: 1 1 auto; min-width: 0 }
.npd-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.npd-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.npd-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.npd-row-actions { flex: none; display: flex; align-items: center }
.npd-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.npd-row-icon .npd-icon { width: 28px; height: 28px }
.npd-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .npd-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.npd-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.npd-btn:hover { background: var(--sui-primary-light-hover) }
.npd-btn:disabled, .npd-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.npd-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.npd-btn-primary:hover { background: var(--sui-primary-element-hover) }
.npd-btn-tertiary { background: transparent; color: var(--sui-text) }
.npd-btn-tertiary:hover { background: var(--sui-bg-hover) }
.npd-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.npd-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.npd-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.npd-btn-icon:hover { background: var(--sui-bg-hover) }
.npd-btn-wide { width: 100%; justify-content: flex-start }
.npd-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.npd-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.npd-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.npd-chip { cursor: pointer }
button.npd-chip:hover { background: var(--sui-primary-light-hover) }
.npd-chip-primary, .npd-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.npd-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.npd-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.npd-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- avatar: a span with initials, or an <img class="ui-avatar"> -------------------------------------------- */
.npd-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar); height: var(--sui-avatar); border-radius: 50%; overflow: hidden; background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); line-height: 1; object-fit: cover; text-transform: uppercase; user-select: none }
.npd-avatar-lg { width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); font-size: var(--sui-text-xl) }
.npd-avatar-xl { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.npd-header .npd-avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.npd-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.npd-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.npd-toast-error { border-left-color: var(--sui-error) }
.npd-toast-success { border-left-color: var(--sui-success) }
.npd-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.npd-status-error { color: var(--sui-error) }
.npd-status-success { color: var(--sui-success) }
.npd-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.npd-note-error { background: var(--sui-error-light) }
.npd-note-warning { background: var(--sui-warning-light) }
.npd-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.npd-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.npd-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.npd-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.npd-details-figure .npd-icon { width: 36px; height: 36px }
.npd-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.npd-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.npd-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.npd-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.npd-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.npd-tab:hover { color: var(--sui-text) }
.npd-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.npd-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.npd-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.npd-props dt { color: var(--sui-text-muted) }
.npd-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.npd.pad-pane { max-width: calc(var(--sui-content-max) * .75); margin: 0 auto; padding: 0 var(--sui-space-4) var(--sui-space-8); min-width: 0 }
.npd.pad-pane .npd-toolbar { position: sticky; top: 0; z-index: 2; gap: var(--sui-space-2); min-height: 0; margin: 0 0 var(--sui-space-2); padding: var(--sui-space-2) 0; background: var(--sui-bg); border-bottom: 1px solid var(--sui-border) }
.npd.pad-pane .npd-toolbar .npd-status { flex: 1 1 0; min-width: 0; margin: 0; padding: 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; overflow-wrap: anywhere }
.npd.pad-pane .npd-toolbar .npd-status-success { color: var(--sui-success) }
.npd.pad-pane .npd-toolbar .npd-status-error { color: var(--sui-error) }
.npd-toolbar .npd-people { margin-left: auto }
.npd-people { flex: none; display: flex; align-items: center; padding: 0 var(--sui-space-1); border: 0; border-radius: var(--sui-radius-pill); background: transparent; min-height: var(--sui-target) }
button.npd-people { cursor: pointer }
button.npd-people:hover { background: var(--sui-bg-hover) }
.npd-people .npd-avatar { color: var(--sui-text); box-shadow: 0 0 0 2px var(--sui-bg) }
.npd-people .npd-avatar + .npd-avatar { margin-left: calc(var(--sui-space-2) * -1) }
.npd-people:empty { display: none }
.npd-title { overflow-wrap: anywhere; margin-top: var(--sui-space-4) }
.npd-meta { margin: var(--sui-space-1) 0 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
.npd-legend { list-style: none; margin: var(--sui-space-3) 0 0; padding: 0 }
.npd-legend:empty { display: none }
.npd-who { gap: var(--sui-space-2); padding-left: var(--sui-space-1) }
.npd-who b { font-weight: var(--sui-weight-bold); overflow: hidden; text-overflow: ellipsis; min-width: 0 }
.npd-dot { flex: none; width: var(--sui-space-5); height: var(--sui-space-5); border-radius: 50%; box-shadow: inset 0 0 0 1px var(--sui-border-strong) }
.npd-sheet { margin: var(--sui-space-4) 0 0 }
.npd-lines { list-style: none; margin: 0; padding: 0; counter-reset: npd }
.npd-line { position: relative; display: flex; align-items: stretch; min-height: var(--sui-target); margin: 0 0 2px; border-radius: var(--sui-radius); counter-increment: npd }
.npd-line::before { content: counter(npd); flex: none; width: var(--sui-space-8); padding: calc((var(--sui-target) - var(--sui-space-5)) / 2) var(--sui-space-2) 0 0; text-align: right; font-size: var(--sui-text-sm); line-height: var(--sui-space-5); color: var(--sui-text-muted); font-variant-numeric: tabular-nums }
.npd-mark { flex: none; width: var(--sui-space-1); margin: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) 0; border-radius: var(--sui-radius-sm) }
.npd-text, .npd.pad-pane .npd-field { flex: 1 1 auto; min-width: 0; min-height: var(--sui-target); margin: 0; padding: calc((var(--sui-target) - var(--sui-line) * 1em) / 2 - 1px) var(--sui-space-2); border: 1px solid transparent; border-radius: var(--sui-radius-sm); font: inherit; line-height: var(--sui-line); color: var(--sui-text); overflow-wrap: anywhere; white-space: pre-wrap }
.npd.pad-pane .npd-field { display: block; width: 100%; height: var(--sui-target); background: transparent; outline: none; resize: none; overflow: hidden }
.npd.pad-pane .npd-field:focus { border-color: var(--sui-primary-element); background: var(--sui-bg); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.npd.pad-pane .npd-line.npd-pending .npd-field { border-style: dashed; border-color: var(--sui-warning) }
.npd.pad-pane .npd-line.npd-failed .npd-field { border-color: var(--sui-error); background: var(--sui-error-light) }
.npd-empty { padding: var(--sui-space-4); color: var(--sui-text-muted); text-align: center }
.npd-empty .npd-btn { margin-left: var(--sui-space-2) }
.npd-hint { margin: var(--sui-space-4) 0 0; font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.npd-checked { display: block; margin-top: var(--sui-space-1); font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.npd-plist .npd-row { cursor: default }
.npd-plist .npd-row:hover { background: transparent }
.npd-plist .npd-avatar { color: var(--sui-text) }
@media (max-width: 600px) { .npd.pad-pane { padding: 0 var(--sui-space-2) var(--sui-space-6) } .npd-line::before { width: var(--sui-space-6); padding-right: var(--sui-space-1) } }
`

function el (dom, tag, className, text) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// Material Design Icons (Apache 2.0), as paths in a 24 x 24 box.
const MDI = {
  pad: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  refresh: 'M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)
function icon (dom, name) {
  const span = dom.createElement('span')
  span.className = 'npd-icon'
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--npd-i', `url("${svg(MDI[name])}")`)
  return span
}
// Initials for an avatar: the first letters of up to two words of the name.
const initials = (name) => (name || '?').split(/[\s.@/]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

const rdflib = () => globalThis.$rdf || (globalThis.UI && globalThis.UI.rdf)

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

function isPad (store, subject) {
  return store.holds(subject, store.sym(RDF_TYPE), store.sym(PAD + 'Notepad'))
}

// The colour SolidOS gives an author: a hash of the WebID, forced pale. Same sum, so the colours match.
function lightColorHash (uri) {
  if (!uri) return '#ffffff'
  const hash = uri.split('').reduce((a, b) => { a = (a << 5) - a + b.charCodeAt(0); return a & a }, 0)
  return '#' + ((hash & 0xffffff) | 0xc0c0c0).toString(16)
}
// A stronger shade of a pale colour, for the mark beside each line and the legend dot.
function deeper (hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#9aa1b0'
  const n = parseInt(m[1], 16)
  const part = (shift) => Math.max(0, Math.round(((n >> shift) & 255) * 1.6 - 255 * 0.75))
  return 'rgb(' + part(16) + ',' + part(8) + ',' + part(0) + ')'
}

// A person's colour: the one their participation records (SolidOS writes the same hash there), else the hash.
function colourOf (store, subject, doc, author) {
  if (!author) return '#ffffff'
  const sym = store.sym.bind(store)
  for (const p of store.each(subject, sym(WF + 'participation'), null, doc)) {
    if (!store.holds(p, sym(WF + 'participant'), author, doc)) continue
    const bg = store.any(p, sym(UI_BG), null, doc)
    if (bg && /^#[0-9a-f]{6}$/i.test(bg.value)) return bg.value
  }
  return lightColorHash(author.value)
}

// Everyone who wrote a line or took part, in order of first appearance, with their colour and number of lines.
function peopleOf (store, subject, doc, lines) {
  const people = new Map()
  const person = (node) => { if (node && !people.has(node.value)) people.set(node.value, { node, lines: 0, colour: colourOf(store, subject, doc, node) }); return node ? people.get(node.value) : null }
  for (const line of lines) { const p = person(line.author); if (p) p.lines++ }
  for (const parp of store.each(subject, store.sym(WF + 'participation'), null, doc)) person(store.any(parp, store.sym(WF + 'participant'), null, doc))
  return [...people.values()]
}

// A round avatar in the person's pad colour, with their initials.
function avatar (dom, store, p) {
  const name = personName(store, p.node)
  const a = el(dom, 'span', 'npd-avatar', initials(name))
  a.style.background = p.colour
  a.title = name
  return a
}

function personName (store, person) {
  const name = store.any(person, store.sym(FOAF_NAME)) || store.any(person, store.sym(VCARD_FN))
  if (name) return name.value
  try { const url = new URL(person.value); return url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 && !/^\/(profile\/card(\.jsonld)?)?$/.test(url.pathname) ? url.pathname : '') } catch { return person.value }
}

// The lines in order, following pad:next from the pad round to the pad. `broken` says why it stopped early.
function readLines (store, subject, doc) {
  const sym = store.sym.bind(store)
  const next = sym(PAD + 'next')
  const lines = []
  const seen = new Set()
  let broken = ''
  let chunk = store.any(subject, next, null, doc)
  if (!chunk) return { lines, broken: 'it has no first line' }
  while (!chunk.equals(subject)) {
    if (seen.has(chunk.value)) { broken = 'the lines go round in a loop'; break }
    seen.add(chunk.value)
    const content = store.any(chunk, sym(SIOC_CONTENT), null, doc)
    const modified = WHEN.flatMap(p => store.each(chunk, sym(p), null, doc)).map(t => t.value).sort().pop()
    const indent = store.any(chunk, sym(PAD + 'indent'), null, doc)
    lines.push({ chunk, text: content ? content.value : '', author: store.any(chunk, sym(DC + 'author'), null, doc), modified: modified || '', indent: indent ? Math.max(0, Math.min(8, parseInt(indent.value, 10) || 0)) : 0 })
    const after = store.any(chunk, next, null, doc)
    if (!after) { broken = 'line ' + lines.length + ' has no next line'; break }
    chunk = after
  }
  return { lines, broken }
}

const turtleText = (text) => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'

const pane = {
  name: 'notepad',
  icon: svg(MDI.pad, '#00679e'),
  audience: [],

  label (subject, context) {
    try { return isPad(context.session.store, subject) ? 'Notepad' : null } catch { return null }
  },

  shouldGetFocus (subject) {
    try { return isPad(globalThis.SolidLogic.store, subject) } catch { return false }
  },

  // In the suite shell: the details column for the pad (its (i) button, or the avatars in the toolbar). Who has
  // taken part, each in their colour with their number of lines, and when it was made and by whom. Drawn from the
  // store as it is now; it does not follow later changes until it is opened again.
  renderDetails (node, context) {
    const store = context.session.store
    const dom = context.dom
    const subject = node
    if (!subject || !subject.doc || !isPad(store, subject)) return null
    const doc = subject.doc()
    const sym = store.sym.bind(store)
    const { lines } = readLines(store, subject, doc)
    const people = peopleOf(store, subject, doc, lines)
    const value = (p) => { const v = store.any(subject, sym(p), null, doc); return v ? v.value : '' }

    const box = el(dom, 'div', 'npd npd-root npd-details-pane')
    box.appendChild(el(dom, 'style', '', CSS))
    const head = box.appendChild(el(dom, 'div', 'npd-details-head'))
    head.appendChild(el(dom, 'span', 'npd-details-figure')).appendChild(icon(dom, 'pad'))
    const titles = head.appendChild(el(dom, 'div', 'npd-details-titles'))
    titles.appendChild(el(dom, 'h2', 'npd-details-title', value(DC + 'title') || value(DCT + 'title') || 'Notepad'))
    titles.appendChild(el(dom, 'p', 'npd-details-sub', (lines.length === 1 ? '1 line' : lines.length + ' lines') + ' · ' + (people.length === 1 ? '1 person' : people.length + ' people')))

    const body = box.appendChild(el(dom, 'div', 'npd-details-body'))
    body.appendChild(el(dom, 'h3', 'npd-subheading', 'Participants'))
    const list = body.appendChild(el(dom, 'ul', 'npd-list npd-plist'))
    list.setAttribute('aria-label', 'Participants')
    for (const p of people) {
      const row = list.appendChild(el(dom, 'li', 'npd-row'))
      row.appendChild(avatar(dom, store, p))
      const main = row.appendChild(el(dom, 'div', 'npd-row-main'))
      main.appendChild(el(dom, 'span', 'npd-row-title', personName(store, p.node)))
      main.appendChild(el(dom, 'span', 'npd-row-sub', p.lines === 1 ? '1 line' : p.lines + ' lines'))
      row.title = p.node.value
    }
    if (!people.length) body.appendChild(el(dom, 'p', 'npd-muted', 'Nobody has written here yet.'))

    const props = body.appendChild(el(dom, 'dl', 'npd-props'))
    const prop = (term, text) => { if (!text) return; props.appendChild(el(dom, 'dt', '', term)); props.appendChild(el(dom, 'dd', '', text)) }
    const maker = store.any(subject, sym(DC + 'author'), null, doc)
    const made = new Date(value(DC + 'created') || value(DCT + 'created'))
    prop('Made by', maker ? personName(store, maker) : '')
    prop('Made', isNaN(made) ? '' : made.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
    prop('File', decodeURIComponent(doc.value.split('/').slice(-2).join('/')))
    return box
  },

  // "New Notepad" in a folder's Add menu: the same file the SolidOS pane makes.
  mintClass: { termType: 'NamedNode', value: PAD + 'Notepad', uri: PAD + 'Notepad' },

  async mintNew (context, options) {
    const store = context.session.store
    const me = options.me || currentUser(context)
    if (!me) throw new Error('log in to make a notepad')
    const index = options.newBase + 'index.ttl'
    const body = `@prefix pad: <${PAD}>.\n@prefix dc: <${DC}>.\n@prefix sioc: <http://rdfs.org/sioc/ns#>.\n@prefix xsd: <${XSD}>.\n\n` +
      `<#this> a pad:Notepad;\n    dc:title ${turtleText(options.title || 'Shared Notes')};\n    dc:author <${me.value}>;\n    dc:created "${new Date().toISOString()}"^^xsd:dateTime;\n    pad:next <#this_line0>.\n\n` +
      `<#this_line0> dc:author <${me.value}>;\n    sioc:content "";\n    pad:next <#this>.\n`
    const response = await webFetch(store)(index, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' }, body })
    if (!response.ok) throw new Error('index.ttl was not created (' + response.status + ')')
    return { ...options, newInstance: store.sym(index + '#this') }
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const sym = store.sym.bind(store)
    const doc = subject.doc()
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null
    const root = el(dom, 'div', 'npd pad-pane npd-root')
    root.appendChild(el(dom, 'style', '', CSS))

    // A slim toolbar: Refresh, the save status, and who has taken part (in the shell, a button that opens details).
    const bar = root.appendChild(el(dom, 'div', 'npd-toolbar'))
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', 'Notepad')
    const again = bar.appendChild(el(dom, 'button', 'npd-btn npd-btn-icon npd-refresh'))
    again.type = 'button'
    again.setAttribute('aria-label', 'Refresh')
    again.title = 'Refresh: check for other people\'s changes'
    again.appendChild(icon(dom, 'refresh'))
    const status = bar.appendChild(el(dom, 'p', 'npd-status'))
    status.setAttribute('role', 'status')
    const avatars = bar.appendChild(el(dom, suite ? 'button' : 'div', 'npd-people'))
    if (suite) {
      avatars.type = 'button'
      avatars.setAttribute('aria-label', 'Who has taken part')
      avatars.addEventListener('click', () => suite.showDetails(subject))
    }

    const title = root.appendChild(el(dom, 'h2', 'npd-title'))
    const meta = root.appendChild(el(dom, 'p', 'npd-meta'))
    // The legend (who is who, by colour): in the content alone; in the shell it is the details column.
    const legend = root.appendChild(el(dom, 'ul', 'npd-legend npd-chips'))
    legend.setAttribute('aria-label', 'Who wrote which lines')
    legend.hidden = !!suite
    const sheet = root.appendChild(el(dom, 'div', 'npd-sheet'))
    const list = sheet.appendChild(el(dom, 'ol', 'npd-lines'))
    const hint = root.appendChild(el(dom, 'p', 'npd-hint'))
    const checked = root.appendChild(el(dom, 'span', 'npd-checked'))

    const rows = new Map() // chunk URI -> { li, field, timer, dirty }
    let canWrite = false
    let appendOnly = false // the server lets this person append to the file, but not change it
    let broken = ''
    let queue = Promise.resolve()
    let pending = 0 // patches queued or under way
    let joined = false // participation recorded this session
    let timer = null
    let version = null // the ETag of the last read: saves are sent with If-Match on it
    let loading = false // the file is being read again: the store is half empty, so do not draw from it

    const me = () => currentUser(context)
    const rdf = () => rdflib()
    const st = (s, p, o) => rdf().st(s, p, o, doc)
    const now = () => rdf().literal(new Date().toISOString(), sym(XSD + 'dateTime'))
    const say = (text, kind) => { status.textContent = text || ''; status.className = 'npd-status' + (kind === 'good' ? ' npd-status-success' : kind === 'bad' ? ' npd-status-error' : '') }
    const fresh = () => sym(doc.value + '#id' + Date.now() + Math.random().toString(36).slice(2, 6))

    // Every change goes through here, one after another, each computed from the store as it is then.
    function enqueue (job) {
      pending++
      const run = queue.then(job).finally(() => { pending-- })
      queue = run.catch(() => {})
      return run
    }

    // One change, made safely. JSS drops the insert of a PATCH whose literal holds a "}" (and strips "PREFIX …" text)
    // while it applies the delete and answers 204 (jss-findings, finding 5), so a line like "if (x) { y }" would be
    // emptied on the pod. So every change is: read the file fresh (its ETag), apply the change to the store, PUT the
    // whole file with If-Match, read it back, and check with done() that the pod really holds it. "Saved" only then.
    // 412 (someone saved in between): once more from a fresh read; last write wins.
    async function patch (build, what, done) {
      say('Saving…')
      const fail = (why) => { say('Not saved: ' + (what ? what + ': ' : '') + why, 'bad'); return false }
      for (let tries = 0; tries < 2; tries++) {
        if (!(await reload())) return fail('the pad could not be read')
        const change = build()
        if (!change) { const ok = !done || done(); say(ok && tries ? 'Saved' : '', ok && tries ? 'good' : ''); return ok } // nothing (left) to do
        if (!version) return fail('the pod gave no version tag (ETag), so it cannot be saved without risk of overwriting someone else')
        for (const x of change[0]) { try { store.remove(x) } catch { /* already gone */ } }
        for (const x of change[1]) store.add(x.subject, x.predicate, x.object, doc)
        let response
        try {
          const body = rdf().serialize(doc, store, doc.value, 'text/turtle')
          response = await webFetch(store)(doc.value, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-Match': version }, body, cache: 'no-store' })
        } catch (error) {
          await reload()
          return fail((error && error.message ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 160))
        }
        if (response.status === 412) continue // the next round reads the file again, which also undoes the change in the store
        if (!response.ok) {
          await reload()
          return fail('the pod answered ' + response.status + ({ 401: ' (log in again)', 403: ' (you may not change this pad)' }[response.status] || ''))
        }
        if (!(await reload())) return fail('it was sent, but could not be read back to check')
        if (done && !done()) return fail('the pod did not keep it')
        say('Saved', 'good')
        return true
      }
      return fail('the pad kept changing while saving; try again')
    }

    function participate () {
      const who = me()
      if (joined || !who) return
      joined = true
      const already = store.each(subject, sym(WF + 'participation'), null, doc).some(p => store.holds(p, sym(WF + 'participant'), who, doc))
      if (already) return
      enqueue(() => patch(() => {
        const p = sym(doc.value + '#p' + Date.now() + Math.random().toString(36).slice(2, 6))
        if (store.each(subject, sym(WF + 'participation'), null, doc).some(q => store.holds(q, sym(WF + 'participant'), who, doc))) return null
        return [[], [st(subject, sym(WF + 'participation'), p), st(p, sym(WF + 'participant'), who), st(p, sym(CAL_DTSTART), now()), st(p, sym(UI_BG), rdf().literal(lightColorHash(who.value)))]]
      }, 'your colour', () => store.each(subject, sym(WF + 'participation'), null, doc).some(q => store.holds(q, sym(WF + 'participant'), who, doc))))
    }

    // Save one line's text, as yours.
    function saveLine (chunk, text) {
      const row = rows.get(chunk.value)
      return enqueue(async () => {
        const ok = await patch(() => {
          const who = me()
          const holds = store.statementsMatching(chunk, sym(SIOC_CONTENT), null, doc)
          if (!who || !store.any(null, sym(PAD + 'next'), chunk, doc)) return null // gone, or logged out
          if (holds.length === 1 && holds[0].object.value === text && store.holds(chunk, sym(DC + 'author'), who, doc)) return null
          return [[...holds, ...store.statementsMatching(chunk, sym(DC + 'author'), null, doc), ...WHEN.flatMap(p => store.statementsMatching(chunk, sym(p), null, doc))],
            [st(chunk, sym(SIOC_CONTENT), rdf().literal(text)), st(chunk, sym(DC + 'author'), who), st(chunk, sym(DC + 'date'), now())]]
        }, 'line', () => {
          if (!store.any(null, sym(PAD + 'next'), chunk, doc)) return true // someone else removed the line meanwhile
          const holds = store.statementsMatching(chunk, sym(SIOC_CONTENT), null, doc)
          return holds.length === 1 && holds[0].object.value === text
        })
        if (row && row.field && row.field.value === text) { row.dirty = false; row.li.classList.remove('npd-pending'); row.li.classList.toggle('npd-failed', !ok) }
        if (ok) participate()
        draw()
        return ok
      })
    }

    // A new empty line after `after` (a line, or the pad itself for the very start).
    function addLine (after) {
      const chunk = fresh()
      return enqueue(async () => {
        const ok = await patch(() => {
          const who = me()
          if (!who) return null
          const link = store.statementsMatching(after, sym(PAD + 'next'), null, doc)
          if (link.length !== 1) return null
          const next = link[0].object
          if (store.any(null, sym(PAD + 'next'), chunk, doc)) return null // already in (a retry after a lost answer)
          return [link, [st(after, sym(PAD + 'next'), chunk), st(chunk, sym(PAD + 'next'), next), st(chunk, sym(DC + 'author'), who), st(chunk, sym(SIOC_CONTENT), rdf().literal('')), st(chunk, sym(DC + 'date'), now())]]
        }, 'new line', () => !!store.any(null, sym(PAD + 'next'), chunk, doc) && store.statementsMatching(chunk, sym(SIOC_CONTENT), null, doc).length === 1)
        if (ok) participate()
        draw()
        return ok ? chunk : null
      })
    }

    // Take a line out of the ring: everything said about it goes, and the line before it points past it.
    function removeLine (chunk) {
      return enqueue(async () => {
        const ok = await patch(() => {
          const into = store.statementsMatching(null, sym(PAD + 'next'), chunk, doc)
          const out = store.any(chunk, sym(PAD + 'next'), null, doc)
          if (into.length !== 1 || !out) return null
          if (into[0].subject.equals(subject) && out.equals(subject)) return null // the only line stays
          return [[...into, ...store.statementsMatching(chunk, null, null, doc)], [st(into[0].subject, sym(PAD + 'next'), out)]]
        }, 'remove line', () => !store.any(null, sym(PAD + 'next'), chunk, doc))
        draw()
        return ok
      })
    }

    function focusRow (chunk, atEnd) {
      const row = chunk && rows.get(chunk.value)
      if (!row || !row.field) return
      row.field.focus()
      if (atEnd) { const n = row.field.value.length; row.field.setSelectionRange(n, n) }
    }

    function flush (row) {
      clearTimeout(row.timer)
      row.timer = null
      if (row.dirty) return saveLine(row.chunk, row.field.value)
      return Promise.resolve(true)
    }

    // A line's box is as tall as its wrapped text (at least one 44 px row).
    function grow (field) {
      field.style.height = 'auto'
      field.style.height = (field.scrollHeight + 2) + 'px' // + its two 1 px borders
    }
    // In a wrapped line, Up and Down move inside it; they move to the next line from its first or last character.
    const oneRow = (field) => field.offsetHeight <= (parseFloat(globalThis.getComputedStyle(field).minHeight) || 0) + 1
    // The width changes (a phone turned, the details column opened): every line may wrap differently.
    if (globalThis.ResizeObserver) {
      let lastWidth = 0
      new globalThis.ResizeObserver(() => {
        if (!root.isConnected || list.clientWidth === lastWidth) return
        lastWidth = list.clientWidth
        for (const row of rows.values()) if (row.field) grow(row.field)
      }).observe(list)
    }

    function makeRow (line) {
      const li = el(dom, 'li', 'npd-line')
      li.dataset.chunk = line.chunk.value
      const mark = li.appendChild(el(dom, 'span', 'npd-mark'))
      const row = { li, mark, chunk: line.chunk, field: null, text: null, timer: null, dirty: false }
      if (canWrite) {
        // One line of the pad: a one-row text box that grows as its text wraps, so a long line can be read whole
        // on a phone. It holds one line: Enter adds a line, and pasted line breaks become spaces.
        const field = li.appendChild(el(dom, 'textarea', 'npd-field'))
        field.rows = 1
        field.spellcheck = true
        field.setAttribute('aria-label', 'Line')
        row.field = field
        field.addEventListener('input', () => {
          if (/[\r\n]/.test(field.value)) {
            const at = field.selectionStart
            field.value = field.value.replace(/\r?\n|\r/g, ' ')
            field.setSelectionRange(at, at)
          }
          grow(field)
          row.dirty = true
          li.classList.add('npd-pending')
          li.classList.remove('npd-failed')
          clearTimeout(row.timer)
          row.timer = setTimeout(() => flush(row), PAUSE)
        })
        field.addEventListener('blur', () => { flush(row) })
        field.addEventListener('keydown', async (event) => {
          if (event.isComposing) return
          const order = readLines(store, subject, doc).lines.map(l => l.chunk)
          const at = order.findIndex(c => c.equals(row.chunk))
          if (event.key === 'Enter') {
            event.preventDefault()
            await flush(row)
            const made = await addLine(row.chunk)
            if (made) focusRow(made)
          } else if (event.key === 'Backspace' && field.value === '' && order.length > 1) {
            event.preventDefault()
            clearTimeout(row.timer)
            row.dirty = false
            const before = at > 0 ? order[at - 1] : order[1]
            if (await removeLine(row.chunk)) focusRow(before, true)
          } else if (event.key === 'ArrowUp' && at > 0 && (oneRow(field) || field.selectionStart === 0)) {
            event.preventDefault(); focusRow(order[at - 1], true)
          } else if (event.key === 'ArrowDown' && at >= 0 && at < order.length - 1 && (oneRow(field) || field.selectionEnd === field.value.length)) {
            event.preventDefault(); focusRow(order[at + 1], true)
          }
        })
      } else {
        row.text = li.appendChild(el(dom, 'div', 'npd-text'))
      }
      rows.set(line.chunk.value, row)
      return row
    }

    function draw () {
      if (loading) return
      const read = readLines(store, subject, doc)
      broken = read.broken
      const lines = read.lines
      const value = (p) => { const v = store.any(subject, sym(p), null, doc); return v ? v.value : '' }
      title.textContent = value(DC + 'title') || value(DCT + 'title') || 'Notepad'

      // The legend: everyone who wrote a line or took part, with their colour and how many lines are theirs.
      const people = peopleOf(store, subject, doc, lines)
      legend.replaceChildren()
      avatars.replaceChildren()
      for (const p of people.slice(0, 5)) avatars.appendChild(avatar(dom, store, p))
      if (people.length > 5) avatars.appendChild(el(dom, 'span', 'npd-avatar', '+' + (people.length - 5)))
      if (suite) avatars.title = people.map(p => personName(store, p.node)).join(', ')
      for (const p of people) {
        const item = legend.appendChild(el(dom, 'li', 'npd-chip npd-who'))
        item.title = p.node.value
        item.appendChild(el(dom, 'span', 'npd-dot')).style.background = p.colour
        item.appendChild(el(dom, 'b', '', personName(store, p.node)))
        item.appendChild(el(dom, 'span', '', p.lines === 1 ? '1 line' : p.lines + ' lines'))
      }

      const latest = lines.filter(l => l.modified && l.author).sort((a, b) => b.modified.localeCompare(a.modified))[0]
      const maker = store.any(subject, sym(DC + 'author'), null, doc)
      const parts = []
      if (maker) parts.push('By ' + personName(store, maker))
      parts.push(lines.length === 1 ? '1 line' : lines.length + ' lines')
      if (latest) {
        const when = new Date(latest.modified)
        parts.push('last written by ' + personName(store, latest.author) + (isNaN(when) ? '' : ', ' + when.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })))
      } else if (lines.length) {
        const last = lines.filter(l => l.text && l.author).pop()
        if (last) parts.push('last line by ' + personName(store, last.author))
      }
      meta.textContent = parts.join(' · ')

      // The lines: keep the row being edited as it is; bring every other row up to date.
      const wanted = new Set(lines.map(l => l.chunk.value))
      for (const [key, row] of rows) if (!wanted.has(key)) { clearTimeout(row.timer); row.li.remove(); rows.delete(key) }
      let index = 0
      for (const line of lines) {
        const row = rows.get(line.chunk.value) || makeRow(line)
        const colour = colourOf(store, subject, doc, line.author)
        row.li.style.background = colour === '#ffffff' ? '' : colour
        row.mark.style.background = deeper(colour)
        row.mark.style.marginLeft = line.indent ? (line.indent * 18) + 'px' : ''
        row.li.title = line.author ? personName(store, line.author) : 'Unknown author'
        const editing = row.field && (row.dirty || dom.activeElement === row.field)
        if (row.field && !editing && row.field.value !== line.text) row.field.value = line.text
        if (row.text) row.text.textContent = line.text || ' '
        if (list.children[index] !== row.li) list.insertBefore(row.li, list.children[index] || null)
        if (row.field && root.isConnected) grow(row.field)
        index++
      }
      // A pad with no lines at all (SolidOS's pane always keeps one): offer to start, rather than write on opening.
      const empty = list.querySelector('.npd-empty')
      if (lines.length && empty) empty.remove()
      if (!lines.length && !empty) {
        const item = list.appendChild(el(dom, 'li', 'npd-empty', 'This pad has no lines yet. '))
        if (canWrite && !broken) {
          const start = item.appendChild(el(dom, 'button', 'npd-btn npd-btn-primary', 'Start writing'))
          start.type = 'button'
          start.addEventListener('click', async () => { const made = await addLine(subject); if (made) focusRow(made) })
        }
      }
      for (const row of rows.values()) if (row.field) row.field.disabled = !!broken

      if (broken) hint.textContent = 'This pad\'s line list is broken (' + broken + '), so only the lines before that are shown and editing is off.'
      else if (canWrite) hint.textContent = 'Each line saves when you leave it or stop typing. Enter adds a line, Backspace on an empty line removes it. If two people change the same line, the last one saved wins.'
      else if (!me()) hint.textContent = 'Log in to edit this pad.'
      else if (appendOnly) hint.textContent = 'You can read this pad but not change it: your access only lets you add to the file, and editing a line here changes it.'
      else hint.textContent = 'You can read this pad but not change it.'
    }

    // Read the file again ourselves and change only what differs in the store. (A forced fetcher.load of the
    // pane's own document makes the data browser draw the whole pane afresh, losing the line being typed.)
    async function reload () {
      loading = true
      try {
        const response = await webFetch(store)(doc.value, { headers: { Accept: 'text/turtle, application/ld+json;q=0.9' }, cache: 'no-store' })
        if (!response.ok) throw Object.assign(new Error('HTTP ' + response.status), { status: response.status })
        version = response.headers.get('etag')
        const type = (response.headers.get('content-type') || 'text/turtle').split(';')[0].trim()
        const text = await response.text()
        const fresh = rdf().graph()
        await new Promise((resolve, reject) => rdf().parse(text, fresh, doc.value, type, (error) => error ? reject(error) : resolve()))
        const key = (x) => x.subject.toNT() + ' ' + x.predicate.toNT() + ' ' + x.object.toNT()
        const now = new Map(fresh.statements.map(x => [key(x), x]))
        const had = new Map(store.statementsMatching(null, null, null, doc).map(x => [key(x), x]))
        for (const [k, x] of had) if (!now.has(k)) store.remove(x)
        for (const [k, x] of now) if (!had.has(k)) store.add(x.subject, x.predicate, x.object, doc)
        loading = false
        checked.textContent = 'Checked for changes at ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '; again every 10 s.'
        return true
      } catch (error) {
        loading = false
        checked.textContent = 'Could not check for changes (' + (error && error.status ? error.status : 'offline') + ').'
        return false
      }
    }

    // May this person change the pad? The server says in its WAC-Allow header.
    // Only Write counts: every change here rewrites the file (and takes out an old text or link), which Append alone
    // does not allow. With Append only, the pad is shown read-only, and the hint says why.
    async function allowed () {
      if (!me()) return false
      try {
        const response = await webFetch(store)(doc.value, { method: 'HEAD' })
        const wac = response.headers.get('wac-allow')
        if (wac) {
          const user = /user="([^"]*)"/.exec(wac)
          const modes = user ? user[1] : ''
          appendOnly = /\bappend\b/.test(modes) && !/\bwrite\b/.test(modes)
          return /\bwrite\b/.test(modes)
        }
      } catch { /* fall through */ }
      try { return store.updater ? store.updater.editable(doc.value, store) === true : false } catch { return false }
    }

    // Read the file again, in turn with the saves, and show what changed. Skipped while saves are waiting.
    function refresh () {
      if (pending) return
      again.disabled = true
      enqueue(async () => { if (await reload()) draw() }).finally(() => { again.disabled = false })
    }
    again.addEventListener('click', refresh)

    async function start () {
      if (!store.holds(subject, sym(RDF_TYPE), null, doc)) await reload()
      canWrite = await allowed()
      if (canWrite) { list.replaceChildren(); rows.clear() } // the read-only rows become fields
      draw()
      // Names come from people's profiles: fetched in the background, shown when they arrive.
      const people = new Map()
      for (const line of readLines(store, subject, doc).lines) if (line.author) people.set(line.author.value, line.author)
      for (const p of store.each(subject, sym(WF + 'participation'), null, doc)) { const who = store.any(p, sym(WF + 'participant'), null, doc); if (who) people.set(who.value, who) }
      const maker = store.any(subject, sym(DC + 'author'), null, doc)
      if (maker) people.set(maker.value, maker)
      const unnamed = [...people.values()].filter(p => p.termType === 'NamedNode' && !store.any(p, sym(FOAF_NAME)) && !store.any(p, sym(VCARD_FN)))
      if (unnamed.length) Promise.allSettled(unnamed.slice(0, 30).map(p => store.fetcher.load(p.doc()))).then(() => draw())
      timer = setInterval(() => {
        if (!root.isConnected) { clearInterval(timer); return }
        if (dom.visibilityState === 'visible') refresh()
      }, POLL)
    }

    draw()
    start()
    return root
  }
}

export default pane
