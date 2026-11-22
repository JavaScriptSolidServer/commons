// issues-pane.js: an issue tracker kept in a pod, shown as a board with one column per state.
// Opens on a tracker (the board) or on one issue (in full, with a link back to its tracker).
//
// One file, no imports. It reads and writes the format of SolidOS's own issue pane
// (http://www.w3.org/2005/01/wf/flow#), so a tracker made there opens here and the other way round:
//
//   index.ttl   <#this> a wf:Tracker ; dc:title "Shed" ; dc:author <WebID> ; dc:created "…"^^xsd:dateTime ;
//                   wf:issueClass <#Issue> ; wf:initialState <#ToDo> ; wf:stateStore <state.ttl> .
//               <#Issue> rdfs:subClassOf wf:Task ; owl:disjointUnionOf (<#ToDo> <#Doing> <#Done>) .
//               <#ToDo> rdfs:label "To do" ; rdfs:subClassOf <#Issue>, wf:Open .     (wf:Open or wf:Closed
//               <#Done> rdfs:label "Done" ; rdfs:subClassOf <#Issue>, wf:Closed .     says which kind it is)
//
//   state.ttl   <#Iss1732000000000> a <index.ttl#ToDo> ; wf:tracker <index.ttl#this> ;
//                   dc:title "Fix the door" ; wf:description "…" ; dct:created "…"^^xsd:dateTime ;
//                   wf:assignee <WebID> .
//
// The columns are the states in the order of owl:disjointUnionOf, open states first.
//
// In the suite shell (the Boards app) it also gives the shell's two side columns: renderNavigation lists the boards
// (this one, those in the person's type indexes, others already seen) and renderDetails shows a card in full, with the
// move / edit / assign controls, or the board itself. Alone in the data browser it is content only, as before.
// Styled with the suite's design sheet (design/); icons: Material Design Icons (Apache 2.0).
//
// What this pane writes, and when (only for someone the pod lets write the state file):
// - "New issue": a new issue in the state file, in the tracker's initial state.
// - "Move to": the issue's state (its rdf:type) in the state file.
// - "Edit": the issue's dc:title and wf:description in the state file.
// - "Assign to me" / "Unassign": the issue's wf:assignee.
// - "New Tracker" in a folder's Add menu: index.ttl and state.ttl in a new folder. No access rules.

const WF = 'http://www.w3.org/2005/01/wf/flow#'
const DC = 'http://purl.org/dc/elements/1.1/'
const DCT = 'http://purl.org/dc/terms/'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const UI_NS = 'http://www.w3.org/ns/ui#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const VCARD_FN = 'http://www.w3.org/2006/vcard/ns#fn'

const SOLID = 'http://www.w3.org/ns/solid/terms#'
const PIM = 'http://www.w3.org/ns/pim/space#'

// Material Design Icons (Apache 2.0), as inline SVG data: URIs.
const I = {
  board: 'M16,5V18H21V5M4,18H9V5H4M10,18H15V5H10V18Z',
  card: 'M20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20M4,6V18H20V6H4M6,9H18V11H6V9M6,13H16V15H6V13Z',
  plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  refresh: 'M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z',
  pencil: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  take: 'M15,14C12.33,14 7,15.33 7,18V20H23V18C23,15.33 17.67,14 15,14M6,10V7H4V10H1V12H4V15H6V12H9V10M15,12A4,4 0 0,0 19,8A4,4 0 0,0 15,4A4,4 0 0,0 11,8A4,4 0 0,0 15,12Z',
  drop: 'M15,14C12.33,14 7,15.33 7,18V20H23V18C23,15.33 17.67,14 15,14M1,10V12H9V10M15,12A4,4 0 0,0 19,8A4,4 0 0,0 15,4A4,4 0 0,0 11,8A4,4 0 0,0 15,12Z',
  clock: 'M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z',
  back: 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z',
  open: 'M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)

const CSS = `
/* suite:design begin --prefix iss --only icon,nav,buttons,input,chip,avatar,empty,toast,details */
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
.iss-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.iss-root *, .iss-root *::before, .iss-root *::after { box-sizing: border-box }
.iss-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.iss-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.iss-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.iss-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.iss-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.iss-root [hidden] { display: none !important }
.iss-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.iss-muted { color: var(--sui-text-muted) }
.iss-small { font-size: var(--sui-text-sm) }
.iss-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.iss-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.iss-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.iss-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.iss-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.iss-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --iss-i set to url("data:image/svg+xml,...") ---------------------------------- */
.iss-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--iss-i) center / contain no-repeat; mask: var(--iss-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.iss-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.iss-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.iss-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.iss-nav-item:hover { background: var(--sui-bg-hover) }
.iss-nav-item[aria-current="page"], .iss-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.iss-nav-item .iss-icon { color: var(--sui-text-muted) }
.iss-nav-item[aria-current] .iss-icon { color: inherit }
.iss-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.iss-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.iss-nav-new { margin-bottom: var(--sui-space-2) }
.iss-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.iss-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.iss-btn:hover { background: var(--sui-primary-light-hover) }
.iss-btn:disabled, .iss-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.iss-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.iss-btn-primary:hover { background: var(--sui-primary-element-hover) }
.iss-btn-tertiary { background: transparent; color: var(--sui-text) }
.iss-btn-tertiary:hover { background: var(--sui-bg-hover) }
.iss-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.iss-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.iss-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.iss-btn-icon:hover { background: var(--sui-bg-hover) }
.iss-btn-wide { width: 100%; justify-content: flex-start }
.iss-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.iss-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.iss-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.iss-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.iss-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.iss-input:hover { border-color: var(--sui-primary-element) }
.iss-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.iss-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.iss-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.iss-search { position: relative; display: flex; align-items: center; min-width: 0 }
.iss-search .iss-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.iss-search .iss-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.iss-select { position: relative; display: block; min-width: 0 }
.iss-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.iss-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.iss-file { position: relative; overflow: hidden }
.iss-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.iss-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .iss-row-check */
.iss-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.iss-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.iss-check-round { border-radius: 50% }
.iss-check:hover { border-color: var(--sui-primary-element) }
.iss-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.iss-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.iss-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.iss-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.iss-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.iss-segment:hover { background: var(--sui-bg-hover) }
.iss-segment[aria-pressed="true"], .iss-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.iss-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.iss-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.iss-chip { cursor: pointer }
button.iss-chip:hover { background: var(--sui-primary-light-hover) }
.iss-chip-primary, .iss-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.iss-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.iss-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.iss-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- avatar: a span with initials, or an <img class="ui-avatar"> -------------------------------------------- */
.iss-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar); height: var(--sui-avatar); border-radius: 50%; overflow: hidden; background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); line-height: 1; object-fit: cover; text-transform: uppercase; user-select: none }
.iss-avatar-lg { width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); font-size: var(--sui-text-xl) }
.iss-avatar-xl { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.iss-header .iss-avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.iss-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.iss-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.iss-empty-icon .iss-icon { width: 48px; height: 48px }
.iss-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.iss-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.iss-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.iss-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.iss-toast-error { border-left-color: var(--sui-error) }
.iss-toast-success { border-left-color: var(--sui-success) }
.iss-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.iss-status-error { color: var(--sui-error) }
.iss-status-success { color: var(--sui-success) }
.iss-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.iss-note-error { background: var(--sui-error-light) }
.iss-note-warning { background: var(--sui-warning-light) }
.iss-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.iss-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.iss-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.iss-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.iss-details-figure .iss-icon { width: 36px; height: 36px }
.iss-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.iss-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.iss-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.iss-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.iss-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.iss-tab:hover { color: var(--sui-text) }
.iss-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.iss-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.iss-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.iss-props dt { color: var(--sui-text-muted) }
.iss-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.iss.issues-pane { width: 100%; max-width: 100%; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8) }
.iss.issues-pane.iss-single { max-width: var(--sui-content-max); margin: 0 auto }
.iss-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sui-space-2) var(--sui-space-4); margin: 0 0 var(--sui-space-4) }
.iss-titles { flex: 1 1 auto; min-width: 0 }
.iss-titles .iss-title { overflow-wrap: anywhere }
.iss-meta { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
.iss-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2) }
.iss-bar:empty, .iss-msg:empty { display: none }
/* The data browser styles every [role=status] as a green box: the message line undoes that. */
.iss-root .iss-msg { width: auto; margin: 0 0 var(--sui-space-4); border: 0; box-shadow: none }
.iss-root .iss-msg:not(.iss-note) { padding: 0; border-radius: 0; background: none }
.iss-root .iss-msg.iss-note { padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light) }
.iss-root .iss-msg.iss-note-error { background: var(--sui-error-light) }
.iss-back { display: inline-flex; align-items: center; gap: var(--sui-space-1); min-height: var(--sui-target-sm); font-weight: var(--sui-weight-bold); text-decoration: none; overflow-wrap: anywhere }
.iss-back:hover { text-decoration: underline }
.iss-back .iss-icon { width: var(--sui-space-4); height: var(--sui-space-4) }
.iss-coltabs { display: none; margin: 0 0 var(--sui-space-3) }
.iss-coltabs .iss-chip { min-height: var(--sui-target); padding: 0 var(--sui-space-4) }
.iss-coltabs .iss-chip[aria-selected="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.iss-board { display: flex; align-items: flex-start; gap: var(--sui-space-3); max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; padding: 0 0 var(--sui-space-3) }
.iss-col { flex: 0 0 var(--sui-nav-width); max-width: 100%; min-width: 0; padding: var(--sui-space-2); border-radius: var(--sui-radius-lg); background: var(--sui-bg-app) }
.iss-col-head { display: flex; align-items: center; gap: var(--sui-space-2); min-height: var(--sui-target-sm); padding: 0 var(--sui-space-2) var(--sui-space-1); font-weight: var(--sui-weight-bold) }
.iss-dot { flex: none; width: var(--sui-space-3); height: var(--sui-space-3); border-radius: 50%; background: var(--sui-border-strong) }
.iss-col-name { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere }
.iss-closed .iss-col-name { color: var(--sui-text-muted) }
.iss-count { flex: none; min-width: var(--sui-space-6); padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight); line-height: var(--sui-space-6); text-align: center }
.iss-cards { display: flex; flex-direction: column; gap: var(--sui-space-2); margin: 0; padding: 0; list-style: none }
.iss-card { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0; padding: var(--sui-space-3); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg); box-shadow: var(--sui-shadow) }
.iss-card[role="button"] { cursor: pointer }
.iss-card[role="button"]:hover { border-color: var(--sui-border-strong) }
.iss-card[aria-current="true"] { border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.iss-card-title { color: var(--sui-text); font-weight: var(--sui-weight-bold); text-decoration: none; overflow-wrap: anywhere }
a.iss-card-title:hover { color: var(--sui-primary-element); text-decoration: underline }
.iss-desc { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
.iss-desc:empty { display: none }
.iss-facts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-1) var(--sui-space-3); min-width: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.iss-age { display: inline-flex; align-items: center; gap: var(--sui-space-1) }
.iss-age .iss-icon { width: var(--sui-space-4); height: var(--sui-space-4) }
.iss-person { display: inline-flex; align-items: center; gap: var(--sui-space-2); min-width: 0; margin-left: auto }
.iss-card .iss-person .iss-avatar { width: var(--sui-space-6); height: var(--sui-space-6); font-size: var(--sui-text-sm) }
.iss-who { min-width: 0; overflow-wrap: anywhere }
.iss-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-1); margin-top: var(--sui-space-1) }
.iss-acts .iss-move { flex: 1 1 140px; width: auto }
.iss-col-empty { padding: var(--sui-space-3); border: 1px dashed var(--sui-border-strong); border-radius: var(--sui-radius); color: var(--sui-text-muted); font-size: var(--sui-text-sm); text-align: center }
.iss-form { display: flex; flex-direction: column; gap: var(--sui-space-3); min-width: 0 }
.iss-new-form { max-width: var(--sui-content-max); margin: 0 0 var(--sui-space-4); padding: var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-bg-app) }
.iss-one { display: flex; flex-direction: column; gap: var(--sui-space-3); padding: var(--sui-space-4); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg) }
.iss-one .iss-desc, .iss-details-wrap .iss-desc { color: var(--sui-text); font-size: var(--sui-text-md); white-space: pre-wrap }
.iss-one .iss-person { margin-left: 0 }
.iss-one .iss-acts .iss-move { flex: 0 1 var(--sui-nav-width) }
.iss-navbox { display: flex; flex-direction: column; gap: var(--sui-space-1); background: transparent }
.iss-navbox .iss-dot { margin: 0 var(--sui-space-1) }
.iss-details-wrap { background: var(--sui-bg) }
.iss-details-wrap .iss-acts { gap: var(--sui-space-2) }
.iss-details-wrap .iss-acts .iss-move { flex-basis: 100% }
.iss-section { display: flex; flex-direction: column; gap: var(--sui-space-1) }
.iss-section-title { margin: 0; font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text-muted) }
.iss-open-page { align-self: flex-start }
@media (max-width: 600px) {
  .iss-coltabs { display: flex }
  .iss-board { display: block; overflow: visible; padding: 0 }
  .iss-board .iss-col { display: none }
  .iss-board .iss-col.iss-active { display: block }
}
`

// A colour per column, from the sheet's tokens: open states in turn, the first closed state green, the rest grey.
const OPEN_COLOURS = ['var(--sui-primary)', 'var(--sui-warning)', 'var(--sui-primary-light-text)', 'var(--sui-error)', 'var(--sui-text-muted)']
const CLOSED_COLOURS = ['var(--sui-success)', 'var(--sui-border-strong)']
// A colour per board in the navigation (as a board list shows one), picked from its address.
const BOARD_COLOURS = ['var(--sui-primary)', 'var(--sui-success)', 'var(--sui-warning)', 'var(--sui-error)', 'var(--sui-primary-light-text)', 'var(--sui-border-strong)']
const boardColour = (uri) => { let h = 0; for (const c of String(uri)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return BOARD_COLOURS[h % BOARD_COLOURS.length] }


function el (dom, tag, className, text) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

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
const localName = (uri) => decodeURIComponent(String(uri).replace(/[/#]$/, '').split(/[/#]/).pop() || uri)

function isTracker (store, subject) {
  return store.holds(subject, store.sym(RDF + 'type'), store.sym(WF + 'Tracker'))
}
function isIssue (store, subject) {
  return !!store.any(subject, store.sym(WF + 'tracker')) || store.holds(subject, store.sym(RDF + 'type'), store.sym(WF + 'Task'))
}
function kindOf (store, subject) {
  try {
    if (!subject || subject.termType !== 'NamedNode') return null
    if (isTracker(store, subject)) return 'tracker'
    if (isIssue(store, subject)) return 'issue'
  } catch { /* not ours */ }
  return null
}

// An RDF list as an array: an rdflib Collection, or rdf:first / rdf:rest links (as JSON-LD gives back).
function listItems (store, node) {
  if (!node) return []
  if (node.termType === 'Collection' || Array.isArray(node.elements)) return node.elements.slice()
  const out = []
  const seen = new Set()
  let at = node
  while (at && at.value !== RDF + 'nil' && !seen.has(at.value) && out.length < 200) {
    seen.add(at.value)
    const first = store.any(at, store.sym(RDF + 'first'))
    if (first) out.push(first)
    at = store.any(at, store.sym(RDF + 'rest'))
  }
  return out
}

function stateLabel (store, state) {
  const label = store.any(state, store.sym(RDFS + 'label'))
  const text = label ? label.value : localName(state.value).replace(/([a-z])([A-Z])/g, '$1 $2')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// The tracker's settings as plain data: the issue class, the states in column order, where issues are kept.
function readTracker (store, tracker) {
  const sym = store.sym.bind(store)
  const issueClass = store.any(tracker, sym(WF + 'issueClass'))
  const stateStore = store.any(tracker, sym(WF + 'stateStore'))
  let states = issueClass ? listItems(store, store.any(issueClass, sym(OWL + 'disjointUnionOf'))) : []
  if (!states.length && issueClass) states = store.each(null, sym(RDFS + 'subClassOf'), issueClass)
  if (!states.length && issueClass && issueClass.value === WF + 'Task') states = [sym(WF + 'Open'), sym(WF + 'Closed')]
  const kind = (state) => {
    if (state.value === WF + 'Open' || store.holds(state, sym(RDFS + 'subClassOf'), sym(WF + 'Open'))) return 0
    if (state.value === WF + 'Closed' || store.holds(state, sym(RDFS + 'subClassOf'), sym(WF + 'Closed'))) return 2
    return 1
  }
  let openIndex = 0
  let closedIndex = 0
  const columns = states.map((node, index) => {
    const k = kind(node)
    return { node, index, open: k !== 2, rank: k, label: stateLabel(store, node), colour: k === 2 ? CLOSED_COLOURS[Math.min(closedIndex++, 1)] : OPEN_COLOURS[openIndex++ % OPEN_COLOURS.length] }
  })
  columns.sort((a, b) => a.rank - b.rank || a.index - b.index)
  const initial = store.each(tracker, sym(WF + 'initialState')).find(s => columns.some(c => c.node.value === s.value)) ||
    (columns.find(c => c.open) || columns[0] || {}).node || null
  const title = store.any(tracker, sym(DC + 'title')) || store.any(tracker, sym(DCT + 'title')) || store.any(tracker, sym(RDFS + 'label'))
  const template = store.any(tracker, sym(WF + 'issueURITemplate'))
  return { tracker, issueClass, stateStore, columns, initial, title: title ? title.value : '', template: template ? template.value : '' }
}

const when = (store, issue) => store.any(issue, store.sym(DCT + 'created')) || store.any(issue, store.sym(DC + 'created'))

// One issue as plain data.
function readIssue (store, issue, config) {
  const sym = store.sym.bind(store)
  const types = store.each(issue, sym(RDF + 'type')).map(t => t.value)
  const column = config.columns.find(c => types.includes(c.node.value)) || null
  const title = store.any(issue, sym(DC + 'title')) || store.any(issue, sym(DCT + 'title'))
  const description = store.any(issue, sym(WF + 'description'))
  const created = when(store, issue)
  const at = created ? new Date(created.value).getTime() : NaN
  return {
    node: issue,
    column,
    title: title ? title.value : localName(issue.value),
    description: description ? description.value : '',
    at: isNaN(at) ? null : at,
    assignee: store.any(issue, sym(WF + 'assignee')),
    author: store.any(issue, sym(DC + 'author')) || store.any(issue, sym(FOAF + 'maker'))
  }
}

function issuesOf (store, config) {
  const seen = new Map()
  for (const node of store.each(null, store.sym(WF + 'tracker'), config.tracker)) {
    if (node.termType === 'NamedNode') seen.set(node.value, node)
  }
  return [...seen.values()].map(node => readIssue(store, node, config)).sort((a, b) => (b.at || 0) - (a.at || 0))
}

function personName (store, person) {
  const sym = store.sym.bind(store)
  const name = store.any(person, sym(FOAF + 'name')) || store.any(person, sym(VCARD_FN))
  if (name) return name.value
  if (!/^https?:/i.test(person.value)) return 'Unknown person'
  try { const url = new URL(person.value); return url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 && !/^\/(profile\/card(\.jsonld)?)?$/.test(url.pathname) ? url.pathname : '') } catch { return person.value }
}

// "today", "3 days", "5 weeks", "2 months", "1 year".
function age (at, now = Date.now()) {
  if (at === null) return ''
  const days = Math.floor((now - at) / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return '1 day'
  if (days < 14) return days + ' days'
  if (days < 60) return Math.floor(days / 7) + ' weeks'
  if (days < 730) return Math.floor(days / 30.4) + ' months'
  return Math.floor(days / 365) + ' years'
}

const shorten = (text, n) => { const one = text.replace(/\s+/g, ' ').trim(); return one.length > n ? one.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : one }

// What the logged-in person may do to a document, from the server's WAC-Allow header: write (change anything) or only
// append (add new statements, so a new issue but no move, edit or assign).
async function access (fetcher, address) {
  try {
    const response = await fetcher(address, { method: 'HEAD' })
    const wac = response.headers.get('wac-allow') || ''
    const user = (wac.match(/user\s*=\s*"([^"]*)"/i) || [])[1]
    if (user !== undefined) return { write: /\bwrite\b/.test(user), append: /\b(write|append)\b/.test(user) }
    const ok = response.ok && !!response.headers.get('accept-patch')
    return { write: ok, append: ok }
  } catch { return { write: false, append: false } }
}

// A term written for an N3 Patch. Literals are escaped here, so any text (braces included) goes as typed.
const XSD_STRING = XSD + 'string'
function n3Term (term) {
  if (term.termType === 'NamedNode') return '<' + term.value.replace(/[<>"{}|^`\\\s]/g, (c) => encodeURIComponent(c)) + '>'
  if (term.termType === 'Literal') {
    const text = '"' + term.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'
    if (term.language) return text + '@' + term.language
    if (term.datatype && term.datatype.value && term.datatype.value !== XSD_STRING && !/#langString$/.test(term.datatype.value)) return text + '^^<' + term.datatype.value + '>'
    return text
  }
  throw new Error('Cannot write a ' + term.termType)
}
// A Solid N3 Patch (not SPARQL Update: the server loses literals containing "}" on that route, JSS finding 5).
function n3Patch (deletions, insertions) {
  const block = (sts) => sts.map(st => '    ' + n3Term(st.subject) + ' ' + n3Term(st.predicate) + ' ' + n3Term(st.object) + ' .').join('\n')
  return '@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n_:patch a solid:InsertDeletePatch' +
    (deletions.length ? ';\n  solid:deletes {\n' + block(deletions) + '\n  }' : '') +
    (insertions.length ? ';\n  solid:inserts {\n' + block(insertions) + '\n  }' : '') + '.\n'
}

const turtleText = (text) => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'


function icon (dom, path) {
  const span = el(dom, 'span', 'iss-icon')
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--iss-i', `url("${svg(path)}")`)
  return span
}

// Initials for an avatar: the first letters of up to two words of the name.
const initials = (name) => String(name).replace(/^https?:\/\//, '').split(/[\s.@/_-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

// The trackers the person's type indexes list (solid:forClass wf:Tracker, solid:instance). Read only.
async function typeIndexTrackers (store, me) {
  const sym = (u) => store.sym(u)
  const load = async (node) => { try { await store.fetcher.load(node); return true } catch { return false } }
  const out = []
  if (!me || !await load(me.doc())) return out
  const indexes = []
  for (const p of [SOLID + 'publicTypeIndex', SOLID + 'privateTypeIndex']) for (const i of store.each(me, sym(p))) indexes.push(i)
  for (const prefs of store.each(me, sym(PIM + 'preferencesFile'))) {
    if (await load(prefs.doc())) for (const p of [SOLID + 'publicTypeIndex', SOLID + 'privateTypeIndex']) for (const i of store.each(null, sym(p), null, prefs.doc())) indexes.push(i)
  }
  for (const index of indexes) {
    if (index.termType !== 'NamedNode' || !await load(index.doc())) continue
    for (const reg of store.each(null, sym(SOLID + 'forClass'), sym(WF + 'Tracker'), index.doc())) {
      for (const found of store.each(reg, sym(SOLID + 'instance'), null, index.doc())) if (found.termType === 'NamedNode' && /^https?:/i.test(found.value)) out.push(found)
    }
  }
  return out
}

const pane = {
  name: 'issues',
  icon: svg(I.board, '#00679e'),
  audience: [],

  label (subject, context) {
    const kind = kindOf(context.session.store, subject)
    return kind === 'tracker' ? 'Board' : kind === 'issue' ? 'Issue' : null
  },

  shouldGetFocus (subject) {
    try { return !!kindOf(globalThis.SolidLogic.store, subject) } catch { return false }
  },

  // "New Tracker" in a folder's Add menu.
  mintClass: { termType: 'NamedNode', value: WF + 'Tracker', uri: WF + 'Tracker' },

  async mintNew (context, options) {
    const store = context.session.store
    const fetcher = webFetch(store)
    const me = options.me || currentUser(context)
    const base = options.newBase
    const index = base + 'index.ttl'
    const state = base + 'state.ttl'
    const title = options.title || 'Issues'
    const now = new Date().toISOString()
    const body = `@prefix wf: <${WF}>.\n@prefix dc: <${DC}>.\n@prefix rdfs: <${RDFS}>.\n@prefix owl: <${OWL}>.\n` +
      `@prefix ui: <${UI_NS}>.\n@prefix foaf: <${FOAF}>.\n@prefix xsd: <${XSD}>.\n\n` +
      `<#this> a wf:Tracker;\n    dc:title ${turtleText(title)};\n` + (me ? `    dc:author <${me.value}>;\n` : '') +
      `    dc:created "${now}"^^xsd:dateTime;\n    wf:issueClass <#Issue>;\n    wf:initialState <#ToDo>;\n` +
      `    wf:stateStore <state.ttl>;\n    wf:assigneeClass foaf:Person.\n\n` +
      `<#Issue> a rdfs:Class; rdfs:label "Issue"; rdfs:subClassOf wf:Task;\n    owl:disjointUnionOf (<#ToDo> <#Doing> <#Done>).\n` +
      `<#ToDo> a rdfs:Class; rdfs:label "To do"; rdfs:subClassOf <#Issue>, wf:Open; ui:backgroundColor "#dbeafe".\n` +
      `<#Doing> a rdfs:Class; rdfs:label "Doing"; rdfs:subClassOf <#Issue>, wf:Open; ui:backgroundColor "#fef3c7".\n` +
      `<#Done> a rdfs:Class; rdfs:label "Done"; rdfs:subClassOf <#Issue>, wf:Closed; ui:backgroundColor "#dcfce7".\n`
    const put = async (address, text) => {
      const response = await fetcher(address, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' }, body: text })
      if (!response.ok) throw new Error(address.split('/').pop() + ' was not created (' + response.status + ')')
    }
    await put(index, body)
    await put(state, `@prefix wf: <${WF}>.\n\n<index.ttl#this> wf:stateStore <state.ttl>.\n`)
    return { ...options, newInstance: store.sym(index + '#this') }
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const sym = store.sym.bind(store)
    // In the suite shell the boards go in its left column and a card's details in its right column (renderNavigation
    // and renderDetails below, which reach this showing through context.suite.state). Alone, it is all in here.
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null
    const shared = suite ? suite.state : {}
    const single = kindOf(store, subject) === 'issue'
    const root = el(dom, 'div', 'iss issues-pane iss-root' + (single ? ' iss-single' : ''))
    root.appendChild(el(dom, 'style', '', CSS))
    const head = root.appendChild(el(dom, 'div', 'iss-head'))
    const titles = head.appendChild(el(dom, 'div', 'iss-titles'))
    const title = titles.appendChild(el(dom, 'h2', 'iss-title', 'Loading…'))
    const meta = titles.appendChild(el(dom, 'p', 'iss-meta'))
    const bar = head.appendChild(el(dom, 'div', 'iss-bar'))
    const status = root.appendChild(el(dom, 'div', 'iss-msg'))
    status.setAttribute('role', 'status')
    const body = root.appendChild(el(dom, 'div', 'iss-body'))

    // The message line: info as a note, a failure as an error note, success as a status line. In the shell a result
    // is also a toast, and success is only a toast.
    let quiet = null
    const say = (text, kind) => {
      kind = text ? (kind || 'info') : ''
      status.textContent = text || ''
      status.dataset.kind = kind
      status.className = 'iss-msg' + (kind === 'good' ? ' iss-status iss-status-success' : kind === 'bad' ? ' iss-note iss-note-error' : kind === 'info' ? ' iss-note' : '')
      status.hidden = !!suite && kind === 'good'
      if (suite && (kind === 'good' || kind === 'bad') && suite.toast) { try { suite.toast(text, { kind: kind === 'good' ? 'success' : 'error' }) } catch { /* the line says it */ } }
      // A success line goes after a while (like a toast), and the standing note, if any, comes back.
      clearTimeout(quiet)
      if (kind === 'good') quiet = setTimeout(() => { if (status.dataset.kind === 'good' && status.textContent === text) { say(''); restNote() } }, 6000)
    }
    // The note that stays true while nothing else is said: logged out, or not allowed to change this tracker.
    function restNote () {
      if (!config || !config.issueClass || !config.stateStore || status.textContent) return
      if (!me()) say('Log in to add or change issues.')
      else if (!writable) say(canAdd ? 'You can add issues to this tracker but not change them.' : 'You can see this tracker but not change it.')
    }
    const st = (s, p, o, g) => rdflib().st(s, p, o, g)
    const literal = (value, datatype) => { const rdf = rdflib(); return datatype ? rdf.literal(value, sym(XSD + datatype)) : rdf.literal(value) }
    const me = () => currentUser(context)
    let tracker = single ? null : subject
    let config = null
    let writable = false // may change issues (WAC write)
    let canAdd = false // may add new ones (write or append)
    let draft = null // { key, title, description }: what was typed, kept until it is saved
    let busy = false
    let activeTab = null
    let editing = null // the issue whose edit form is open
    let adding = false
    let detail = null // in the shell: { node, box } for the open details column
    let navList = null // in the shell: the boards list in the left column
    const boards = new Map() // the other trackers found: address -> node

    function go (node, event) {
      try {
        const outliner = context.getOutliner && context.getOutliner(dom)
        if (outliner) { if (event) event.preventDefault(); outliner.GotoSubject(node, true, undefined, true, undefined) }
      } catch { /* the plain link works */ }
    }
    function link (node, className, text) {
      const a = el(dom, 'a', className, text)
      if (/^https?:/i.test(node.value)) { a.href = node.value; a.rel = 'noopener' }
      a.addEventListener('click', (event) => go(node, event))
      return a
    }
    function button (label, path, className, iconOnly) {
      const b = el(dom, 'button', 'iss-btn ' + className)
      b.type = 'button'
      if (path) b.appendChild(icon(dom, path))
      if (iconOnly) { b.classList.add('iss-btn-icon'); b.setAttribute('aria-label', label); b.title = label } else b.appendChild(dom.createTextNode(label))
      return b
    }
    const controlsEverywhere = () => [...root.querySelectorAll('button, select'), ...(detail ? detail.box.querySelectorAll('button, select') : [])]

    // Every change is an N3 Patch per document (SPARQL Update loses text with "}" on this server), then each document
    // is read again and checked: the pane says "Saved" only if the pod now holds what was meant.
    async function patch (doc, deletions, insertions) {
      const response = await webFetch(store)(doc, { method: 'PATCH', headers: { 'Content-Type': 'text/n3' }, body: n3Patch(deletions, insertions) })
      if (!response.ok) { const error = new Error('the pod answered ' + response.status + (response.statusText ? ' ' + response.statusText : '')); error.status = response.status; throw error }
    }
    const holds = (s) => {
      const preds = s.predicate.value === DCT + 'created' ? [DCT + 'created', DC + 'created'] : [s.predicate.value] // JSS finding 4
      return preds.some(p => store.statementsMatching(s.subject, sym(p), null, s.why).some(x => x.object.value === s.object.value))
    }
    // Read each document fresh from the pod (no-cache: a cached copy would hide what the save did) and put what it now holds in the store in place of what was there. Done by
    // hand (not fetcher.load) so the data browser does not redraw the whole pane for a reload it did not ask for.
    async function reread (docs) {
      for (const doc of new Set(docs)) {
        const response = await webFetch(store)(doc, { headers: { Accept: 'text/turtle', 'Cache-Control': 'no-cache' }, cache: 'no-store' })
        if (!response.ok) { const error = new Error('the pod answered ' + response.status + ' when read again'); error.status = response.status; throw error }
        const graph = rdflib().graph()
        rdflib().parse(await response.text(), graph, doc, 'text/turtle')
        const node = sym(doc)
        store.remove(store.statementsMatching(null, null, null, node).slice()) // a copy: the store may hand back its own index
        for (const st of graph.statements) store.add(st.subject, st.predicate, st.object, node)
      }
      if (tracker) config = readTracker(store, tracker)
    }
    async function change (deletions, insertions, done) {
      if (busy) return false
      busy = true
      for (const control of controlsEverywhere()) control.disabled = true
      let ok = true
      const docs = [...new Set([...deletions, ...insertions].map(s => s.why.value))]
      try {
        for (const doc of docs) await patch(doc, deletions.filter(s => s.why.value === doc), insertions.filter(s => s.why.value === doc))
        await reread(docs)
        const meant = (s) => insertions.some(i => i.subject.value === s.subject.value && i.predicate.value === s.predicate.value && i.object.value === s.object.value)
        if (insertions.some(s => !holds(s)) || deletions.some(s => !meant(s) && holds(s))) {
          ok = false
          say('Not saved as typed: the pod now holds something else. Check it and try again.', 'bad')
        } else say(done, 'good')
      } catch (error) {
        ok = false
        if (error && (error.status === 409 || error.status === 412)) {
          say('Someone else changed this meanwhile, so it was not saved. The board now shows the latest; try again.', 'bad')
          try { await reread([config.stateStore.value, ...docs]) } catch { /* the message stands */ }
        } else say('Not saved: ' + (error && error.message ? error.message : error), 'bad')
      }
      busy = false
      draw()
      return ok
    }

    // Statements about an issue in a document this pane writes to (the state file, or the issue's own file).
    const about = (issue, predicate) => store.statementsMatching(issue, sym(predicate), null).filter(s => s.why.value === config.stateStore.value || s.why.value === issue.doc().value)

    function moveTo (issue, column) {
      const stateTypes = new Set(config.columns.map(c => c.node.value))
      const old = store.statementsMatching(issue, sym(RDF + 'type'), null, config.stateStore).filter(s => stateTypes.has(s.object.value))
      if (old.length === 1 && old[0].object.value === column.node.value) return
      change(old, [st(issue, sym(RDF + 'type'), column.node, config.stateStore)], 'Moved to ' + column.label + '.')
    }

    function assign (issue, person) {
      const doc = issue.doc()
      const old = store.statementsMatching(issue, sym(WF + 'assignee'), null, doc)
      change(old, person ? [st(issue, sym(WF + 'assignee'), person, doc)] : [], person ? 'Assigned to you.' : 'Unassigned.')
    }

    async function saveText (issue, newTitle, newDescription) {
      const deletions = []
      const insertions = []
      for (const [predicate, value] of [[DC + 'title', newTitle], [WF + 'description', newDescription]]) {
        const old = about(issue, predicate)
        if (old.length === 1 && old[0].object.value === value) continue
        if (!old.length && !value) continue
        deletions.push(...old)
        if (value) insertions.push(st(issue, sym(predicate), literal(value), old.length ? old[0].why : config.stateStore))
      }
      if (!deletions.length && !insertions.length) { editing = null; draft = null; say('Nothing changed.'); draw(); return }
      // The form stays open, with what was typed, until the save is confirmed.
      if (await change(deletions, insertions, 'Saved.')) { editing = null; draft = null; draw() }
    }

    function newIssueAddress () {
      const stamp = String(Date.now())
      if (!config.template) return sym(config.stateStore.value + '#Iss' + stamp)
      const now = new Date().toISOString()
      const filled = config.template.replace('{N}', stamp).replace('{YYYY}', now.slice(0, 4)).replace('{MM}', now.slice(5, 7)).replace('{DD}', now.slice(8, 10))
      return sym(new URL(filled, config.stateStore.value).href)
    }

    async function addIssue (newTitle, newDescription) {
      if (!config.initial) { say('This tracker has no states to put a new issue in.', 'bad'); return false }
      const issue = newIssueAddress()
      const s = config.stateStore
      const insertions = [
        st(issue, sym(WF + 'tracker'), config.tracker, s),
        st(issue, sym(DC + 'title'), literal(newTitle), s),
        st(issue, sym(DCT + 'created'), literal(new Date().toISOString(), 'dateTime'), s),
        st(issue, sym(RDF + 'type'), config.initial, s)
      ]
      if (newDescription) insertions.push(st(issue, sym(WF + 'description'), literal(newDescription), s))
      const who = me()
      if (who) insertions.push(st(issue, sym(DC + 'author'), who, s))
      const ok = await change([], insertions, 'Added "' + newTitle + '".')
      if (ok) { adding = false; draft = null; draw() }
      if (ok && config.template && issue.doc().value !== s.value) {
        // An issue in its own file also says, in that file, which tracker it belongs to (as SolidOS does).
        await change([], [st(issue, sym(WF + 'tracker'), config.tracker, issue.doc()), st(issue, sym(RDFS + 'seeAlso'), s, issue.doc())], 'Added "' + newTitle + '".')
      }
      return ok
    }

    // The form for a new issue, or for editing one.
    function textForm (heading, issueData, onSave, onCancel) {
      const key = issueData ? issueData.node.value : 'new'
      const kept = draft && draft.key === key ? draft : null
      const form = el(dom, 'form', 'iss-form')
      if (heading) form.appendChild(el(dom, 'h3', 'iss-subheading', heading))
      const field = (label, input) => {
        const box = form.appendChild(el(dom, 'label', 'iss-field'))
        box.appendChild(el(dom, 'span', 'iss-label', label))
        return box.appendChild(input)
      }
      const t = field('Title', el(dom, 'input', 'iss-input'))
      t.type = 'text'
      t.maxLength = 200
      t.name = 'title'
      t.value = kept ? kept.title : issueData ? issueData.title : ''
      const d = field('Description', el(dom, 'textarea', 'iss-input'))
      d.maxLength = 5000
      d.name = 'description'
      d.value = kept ? kept.description : issueData ? issueData.description : ''
      const row = form.appendChild(el(dom, 'div', 'iss-btns'))
      const cancel = row.appendChild(el(dom, 'button', 'iss-btn iss-btn-tertiary', 'Cancel'))
      cancel.type = 'button'
      cancel.addEventListener('click', () => { draft = null; say(''); onCancel(); restNote() })
      const save = row.appendChild(el(dom, 'button', 'iss-btn iss-btn-primary', issueData ? 'Save' : 'Add issue'))
      save.type = 'submit'
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        const value = t.value.trim()
        if (!value) { t.setAttribute('aria-invalid', 'true'); say('Give it a title.', 'bad'); return }
        draft = { key, title: value, description: d.value.trim() }
        onSave(value, d.value.trim())
      })
      setTimeout(() => { try { t.focus() } catch { /* fine */ } }, 0)
      return form
    }

    // Move, edit, assign: icon buttons on a card, labelled buttons on the issue page and in the details column.
    function controls (issue, box, roomy) {
      const acts = box.appendChild(el(dom, 'div', 'iss-acts'))
      const move = acts.appendChild(el(dom, 'select', 'iss-input iss-move'))
      move.setAttribute('aria-label', 'Move "' + issue.title + '" to another state')
      if (!issue.column) { const o = move.appendChild(el(dom, 'option', '', 'No state')); o.value = ''; o.selected = true }
      for (const column of config.columns) {
        const o = move.appendChild(el(dom, 'option', '', (issue.column === column ? '' : 'Move to ') + column.label))
        o.value = column.node.value
        if (issue.column === column) o.selected = true
      }
      move.addEventListener('change', () => { const c = config.columns.find(x => x.node.value === move.value); if (c) moveTo(issue.node, c) })
      const edit = acts.appendChild(button('Edit', I.pencil, (roomy ? '' : 'iss-btn-tertiary ') + 'iss-edit', !roomy))
      edit.addEventListener('click', (event) => { event.stopPropagation(); editing = issue.node.value; draw() })
      const who = me()
      if (who && !(issue.assignee && issue.assignee.value === who.value)) {
        const take = acts.appendChild(button('Assign to me', I.take, (roomy ? '' : 'iss-btn-tertiary ') + 'iss-take', !roomy))
        take.addEventListener('click', (event) => { event.stopPropagation(); assign(issue.node, who) })
      }
      if (issue.assignee) {
        const drop = acts.appendChild(button('Unassign', I.drop, (roomy ? '' : 'iss-btn-tertiary ') + 'iss-drop', !roomy))
        drop.addEventListener('click', (event) => { event.stopPropagation(); assign(issue.node, null) })
      }
      move.addEventListener('click', (event) => event.stopPropagation())
    }

    function person (who, full) {
      const box = el(dom, 'span', 'iss-person')
      if (who) {
        const name = personName(store, who)
        box.appendChild(el(dom, 'span', 'iss-avatar', initials(name))).setAttribute('aria-hidden', 'true')
        box.appendChild(el(dom, 'span', 'iss-who', (full ? 'Assigned to ' : '') + name))
      } else box.appendChild(el(dom, 'span', 'iss-who iss-nobody', 'Unassigned'))
      return box
    }

    function facts (issue, box, full) {
      const line = box.appendChild(el(dom, 'div', 'iss-facts'))
      if (full && issue.column) line.appendChild(el(dom, 'span', 'iss-chip iss-chip-primary iss-state', issue.column.label))
      if (issue.at !== null) {
        const a = line.appendChild(el(dom, 'span', 'iss-age'))
        if (!full) a.appendChild(icon(dom, I.clock))
        a.appendChild(dom.createTextNode(full ? 'Opened ' + new Date(issue.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' (' + age(issue.at) + ')' : age(issue.at)))
        a.title = new Date(issue.at).toLocaleString()
      }
      if (full && issue.author) line.appendChild(el(dom, 'span', '', 'by ' + personName(store, issue.author)))
      line.appendChild(person(issue.assignee, full))
    }

    // In the shell a card opens its details in the right column.
    function openDetails (node) {
      if (!suite) return
      shared.selected = node.value
      markSelected()
      suite.showDetails(node, {
        onClose: () => {
          if (shared.selected === node.value) { shared.selected = ''; markSelected() }
          if (editing === node.value) editing = null
        }
      })
    }
    function markSelected () {
      for (const c of root.querySelectorAll('.iss-card[role="button"]')) { if (c.dataset.issue === shared.selected) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current') }
    }

    function card (issue) {
      const item = el(dom, 'li', 'iss-card')
      item.dataset.issue = issue.node.value
      if (editing === issue.node.value && !suite) {
        item.appendChild(textForm('', issue, (t, d) => saveText(issue.node, t, d), () => { editing = null; draw() }))
        return item
      }
      if (suite) {
        item.appendChild(el(dom, 'span', 'iss-card-title', shorten(issue.title, 120)))
        item.tabIndex = 0
        item.setAttribute('role', 'button')
        if (shared.selected === issue.node.value) item.setAttribute('aria-current', 'true')
        item.addEventListener('click', () => openDetails(issue.node))
        item.addEventListener('keydown', (e) => { if (e.target === item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetails(issue.node) } })
      } else item.appendChild(link(issue.node, 'iss-card-title', shorten(issue.title, 120)))
      item.appendChild(el(dom, 'p', 'iss-desc', shorten(issue.description, 140)))
      facts(issue, item, false)
      if (writable && !suite) controls(issue, item, false)
      return item
    }

    function drawBar () {
      bar.replaceChildren()
      if (single || !config || !config.stateStore) return
      if (canAdd && !adding) {
        const add = bar.appendChild(button('New issue', I.plus, 'iss-btn-primary iss-new'))
        add.addEventListener('click', () => { adding = true; draw() })
      }
      const again = bar.appendChild(button('Refresh', I.refresh, 'iss-refresh', true))
      again.addEventListener('click', () => load(true))
    }

    function boardColumns () {
      const issues = issuesOf(store, config)
      const columns = config.columns.map(c => ({ ...c, items: issues.filter(i => i.column && i.column.node.value === c.node.value) }))
      const loose = issues.filter(i => !i.column)
      if (loose.length) columns.push({ node: null, label: 'No state', colour: 'var(--sui-border-strong)', open: true, items: loose })
      return { issues, columns }
    }

    function drawBoard () {
      const { issues, columns } = boardColumns()
      if (!activeTab || !columns.some(c => (c.node ? c.node.value : '') === activeTab)) activeTab = columns.length ? (columns[0].node ? columns[0].node.value : '') : null

      title.textContent = config.title || 'Issues'
      const open = issues.filter(i => !i.column || i.column.open).length
      meta.textContent = issues.length + (issues.length === 1 ? ' issue' : ' issues') + ' · ' + open + ' open'

      if (canAdd && adding) body.appendChild(textForm('New issue', null, (t, d) => addIssue(t, d), () => { adding = false; draw() })).classList.add('iss-new-form')

      if (!columns.length) {
        const box = body.appendChild(el(dom, 'div', 'iss-empty'))
        box.appendChild(el(dom, 'span', 'iss-empty-icon')).appendChild(icon(dom, I.board))
        box.appendChild(el(dom, 'p', 'iss-empty-title', 'No columns'))
        box.appendChild(el(dom, 'p', 'iss-empty-text', 'This tracker names no states, so there is nothing to show.'))
        return
      }
      const tabs = body.appendChild(el(dom, 'div', 'iss-chips iss-coltabs'))
      tabs.setAttribute('role', 'tablist')
      tabs.setAttribute('aria-label', 'Columns')
      const board = body.appendChild(el(dom, 'div', 'iss-board'))
      for (const column of columns) {
        const key = column.node ? column.node.value : ''
        const tab = tabs.appendChild(el(dom, 'button', 'iss-chip', column.label + ' ' + column.items.length))
        tab.type = 'button'
        tab.setAttribute('role', 'tab')
        tab.setAttribute('aria-selected', key === activeTab ? 'true' : 'false')
        tab.addEventListener('click', () => { activeTab = key; draw() })
        const col = board.appendChild(el(dom, 'section', 'iss-col' + (column.open ? '' : ' iss-closed') + (key === activeTab ? ' iss-active' : '')))
        col.dataset.state = key
        col.setAttribute('aria-label', column.label)
        const h = col.appendChild(el(dom, 'div', 'iss-col-head'))
        h.appendChild(el(dom, 'span', 'iss-dot')).style.background = column.colour
        h.appendChild(el(dom, 'span', 'iss-col-name', column.label))
        h.appendChild(el(dom, 'span', 'iss-count', String(column.items.length)))
        const list = col.appendChild(el(dom, 'ul', 'iss-cards'))
        for (const issue of column.items) list.appendChild(card(issue))
        if (!column.items.length) list.appendChild(el(dom, 'li', 'iss-col-empty', 'Nothing here'))
      }
    }

    function backLink () {
      const a = link(config.tracker, 'iss-back', '')
      a.appendChild(icon(dom, I.back))
      a.appendChild(dom.createTextNode(config.title || 'Back to the tracker'))
      return a
    }

    function drawIssue () {
      const issue = readIssue(store, subject, config)
      title.textContent = issue.title
      meta.replaceChildren(backLink())
      const box = body.appendChild(el(dom, 'div', 'iss-one'))
      if (editing === subject.value && !suite) {
        box.appendChild(textForm('', issue, (t, d) => saveText(subject, t, d), () => { editing = null; draw() }))
        return
      }
      facts(issue, box, true)
      box.appendChild(el(dom, 'p', 'iss-desc', issue.description || ''))
      if (!issue.description) box.appendChild(el(dom, 'p', 'iss-meta', 'No description.'))
      if (writable) controls(issue, box, true)
    }

    function draw () {
      body.replaceChildren()
      drawBar()
      if (config) {
        if (!config.issueClass) { title.textContent = config.title || 'Issues'; say('This tracker names no issue class (wf:issueClass), so it has no states.', 'bad') }
        else if (!config.stateStore) { title.textContent = config.title || 'Issues'; say('This tracker names no state file (wf:stateStore).', 'bad') }
        else {
          if (single) drawIssue(); else drawBoard()
          restNote()
        }
      }
      fillNav()
      fillDetails()
    }

    // ---- the shell's left column: the boards this pane can find ----------------------------------------------------
    function navigation () {
      const box = el(dom, 'div', 'iss iss-root iss-navbox')
      box.appendChild(el(dom, 'p', 'iss-caption', 'Boards'))
      navList = box.appendChild(el(dom, 'ul', 'iss-nav-list'))
      navList.setAttribute('aria-label', 'Boards')
      fillNav()
      return box
    }
    function fillNav () {
      if (!navList) return
      navList.replaceChildren()
      const here = tracker ? tracker.value : ''
      const list = []
      if (tracker) list.push({ node: tracker, name: (config && config.title) || 'Issues', count: config && config.stateStore ? boardColumns().issues.filter(i => !i.column || i.column.open).length : null })
      for (const [uri, node] of boards) {
        if (uri === here) continue
        const t = store.any(node, sym(DC + 'title')) || store.any(node, sym(DCT + 'title')) || store.any(node, sym(RDFS + 'label'))
        list.push({ node, name: t ? t.value : localName(node.doc().value.replace(/\/index\.ttl$/, '/')) })
      }
      if (!list.length) { navList.appendChild(el(dom, 'li', 'iss-caption iss-muted', 'Loading…')); return }
      for (const b of list) {
        const item = navList.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'iss-nav-item'))
        item.type = 'button'
        item.dataset.board = b.node.value
        item.appendChild(el(dom, 'span', 'iss-dot')).style.background = boardColour(b.node.value)
        item.appendChild(el(dom, 'span', 'iss-nav-label', b.name))
        if (b.count !== null && b.count !== undefined) { const n = item.appendChild(el(dom, 'span', 'iss-nav-count', String(b.count))); n.title = b.count + ' open' }
        if (b.node.value === here) item.setAttribute('aria-current', 'page')
        item.addEventListener('click', () => {
          if (b.node.value === here && !single) return
          try { suite.go(b.node, { pane: pane.name }) } catch { go(b.node) }
        })
      }
    }
    async function findBoards () {
      for (const node of store.each(null, sym(RDF + 'type'), sym(WF + 'Tracker'))) if (node.termType === 'NamedNode' && /^https?:/i.test(node.value)) boards.set(node.value, node)
      try { for (const node of await typeIndexTrackers(store, me())) boards.set(node.value, node) } catch { /* only the current board */ }
      fillNav()
      // Their titles, in the background.
      const unnamed = [...boards.values()].filter(n => !store.any(n, sym(DC + 'title'))).slice(0, 10)
      if (unnamed.length) Promise.allSettled(unnamed.map(n => store.fetcher.load(n.doc()))).then(fillNav)
    }

    // ---- the shell's right column: a card in full, or the board itself ------------------------------------------
    function details (node) {
      const box = el(dom, 'div', 'iss iss-root iss-details-wrap')
      detail = { node, box }
      fillDetails()
      return box
    }
    function fillDetails () {
      if (!detail || !detail.box) return
      const { node, box } = detail
      box.replaceChildren()
      const headBox = box.appendChild(el(dom, 'div', 'iss-details-head'))
      const figure = headBox.appendChild(el(dom, 'span', 'iss-details-figure'))
      const names = headBox.appendChild(el(dom, 'div', 'iss-details-titles'))
      const inner = box.appendChild(el(dom, 'div', 'iss-details-body'))
      if (!config || !config.stateStore) {
        figure.appendChild(icon(dom, I.board))
        names.appendChild(el(dom, 'h2', 'iss-details-title', config ? config.title || 'Issues' : 'Loading…'))
        return
      }
      const isBoard = node.value === config.tracker.value
      if (isBoard) {
        const { issues, columns } = boardColumns()
        figure.appendChild(icon(dom, I.board))
        names.appendChild(el(dom, 'h2', 'iss-details-title', config.title || 'Issues'))
        names.appendChild(el(dom, 'p', 'iss-details-sub', 'Board · ' + issues.length + (issues.length === 1 ? ' issue' : ' issues')))
        const props = inner.appendChild(el(dom, 'dl', 'iss-props'))
        const prop = (k, v) => { if (!v) return; props.appendChild(el(dom, 'dt', '', k)); const dd = props.appendChild(el(dom, 'dd')); if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v) }
        const author = store.any(config.tracker, sym(DC + 'author'))
        const made = store.any(config.tracker, sym(DC + 'created'))
        prop('Owner', author ? personName(store, author) : '')
        prop('Created', made && !isNaN(new Date(made.value)) ? new Date(made.value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
        for (const c of columns) prop(c.label, c.items.length + (c.open ? ' open' : ' closed'))
        const file = el(dom, 'a', '', config.stateStore.value.split('/').slice(-2).join('/'))
        if (/^https?:/i.test(config.stateStore.value)) { file.href = config.stateStore.value; file.rel = 'noopener' }
        prop('Issues kept in', file)
        if (!me()) inner.appendChild(el(dom, 'p', 'iss-note', 'Log in to add or change issues.'))
        else if (!writable) inner.appendChild(el(dom, 'p', 'iss-note', canAdd ? 'You can add issues to this tracker but not change them.' : 'You can see this tracker but not change it.'))
        return
      }
      const issue = readIssue(store, node, config)
      box.classList.add('iss-details-issue')
      box.dataset.issue = node.value
      figure.appendChild(icon(dom, I.card))
      names.appendChild(el(dom, 'h2', 'iss-details-title', issue.title))
      names.appendChild(el(dom, 'p', 'iss-details-sub', issue.column ? issue.column.label + ' · ' + config.title : config.title))
      if (editing === node.value) {
        inner.appendChild(textForm('', issue, (t, d) => saveText(node, t, d), () => { editing = null; draw() }))
        return
      }
      const props = inner.appendChild(el(dom, 'dl', 'iss-props'))
      const prop = (k, v) => { if (!v) return; props.appendChild(el(dom, 'dt', '', k)); props.appendChild(el(dom, 'dd', '', v)) }
      prop('State', issue.column ? issue.column.label : 'No state')
      prop('Opened', issue.at !== null ? new Date(issue.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' (' + age(issue.at) + ')' : '')
      prop('By', issue.author ? personName(store, issue.author) : '')
      prop('Assigned to', issue.assignee ? personName(store, issue.assignee) : 'Nobody')
      const section = inner.appendChild(el(dom, 'div', 'iss-section'))
      section.appendChild(el(dom, 'h3', 'iss-section-title', 'Description'))
      section.appendChild(el(dom, 'p', issue.description ? 'iss-desc' : 'iss-meta', issue.description || 'No description.'))
      if (writable) controls(issue, inner, true)
      const page = inner.appendChild(el(dom, 'a', 'iss-btn iss-btn-tertiary iss-open-page'))
      page.appendChild(icon(dom, I.open))
      page.appendChild(dom.createTextNode('Open the issue page'))
      if (/^https?:/i.test(node.value)) { page.href = node.value; page.rel = 'noopener' }
      page.addEventListener('click', (event) => { event.preventDefault(); try { suite.go(node, { pane: pane.name }) } catch { go(node) } })
    }

    let listening = false
    async function load (force) {
      try {
        if (single) {
          tracker = store.any(subject, sym(WF + 'tracker'))
          if (!tracker) throw new Error('This issue names no tracker.')
          await store.fetcher.load(tracker.doc())
        }
        config = readTracker(store, tracker)
        if (config.stateStore) {
          await store.fetcher.load(config.stateStore, force ? { force: true, clearPreviousData: true } : undefined)
          if (single && subject.doc().value !== config.stateStore.value) await store.fetcher.load(subject.doc(), force ? { force: true } : undefined)
          config = readTracker(store, tracker)
          const may = me() ? await access(webFetch(store), config.stateStore.value) : { write: false, append: false }
          writable = may.write
          canAdd = may.append
        }
        if (force) say('Up to date.', 'good')
      } catch (error) {
        const code = error && error.status
        say(code === 404 ? 'The issues file is missing.' : code === 401 || code === 403 ? 'You are not allowed to see these issues.' : 'The issues could not be read: ' + (error && error.message ? error.message : error), 'bad')
        if (!config && tracker) config = readTracker(store, tracker)
      }
      draw()
      if (config && config.stateStore && !listening && store.updater && store.updater.addDownstreamChangeListener) {
        listening = true
        try { store.updater.addDownstreamChangeListener(config.stateStore, () => { if (!busy && !editing && !adding) draw() }) } catch { /* no live updates */ }
      }
      // People's names come from their profiles: fetched in the background, shown when they arrive.
      if (!config || !config.stateStore) return
      const people = new Map()
      for (const issue of single ? [readIssue(store, subject, config)] : issuesOf(store, config)) {
        for (const p of [issue.assignee, issue.author]) if (p && p.termType === 'NamedNode' && !store.any(p, sym(FOAF + 'name')) && !store.any(p, sym(VCARD_FN))) people.set(p.value, p)
      }
      if (people.size) Promise.allSettled([...people.values()].slice(0, 30).map(p => store.fetcher.load(p.doc()))).then(() => { if (!busy && !editing && !adding) draw() })
    }

    shared.issues = { navigation, details }
    shared.loaded = load(false).then(() => { if (suite) findBoards() })
    return root
  },

  // The shell's left column: the boards (this one, the ones the person's type indexes list, others already seen).
  renderNavigation (subject, context) {
    const api = context.suite && context.suite.state && context.suite.state.issues
    return api ? api.navigation() : null
  },

  // The shell's right column: a card (an issue), or the board itself from the shell's (i) button.
  renderDetails (node, context) {
    const api = context.suite && context.suite.state && context.suite.state.issues
    return api && node ? api.details(node) : null
  }
}

export default pane
