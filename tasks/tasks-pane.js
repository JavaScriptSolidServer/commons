// tasks-pane.js: to-do lists kept in a pod. Lists on the left, the tasks of one list in the middle, one task's
// details on the right: title, done, due date, priority, notes.
//
// One file, no imports. The data is SolidOS's issue-tracker format (http://www.w3.org/2005/01/wf/flow#), so the
// suite's Boards pane and SolidOS's own issue pane open a task list too, with the to-do fields from iCalendar in RDF
// (http://www.w3.org/2002/12/cal/ical#, the VTODO that CalDAV task apps store). A list is one folder:
//
//   garden/index.ttl   <#this> a wf:Tracker ; dc:title "Garden" ; dc:author <WebID> ; dc:created "…"^^xsd:dateTime ;
//                          wf:issueClass <#Task> ; wf:initialState <#ToDo> ; wf:stateStore <state.ttl> .
//                      <#Task> rdfs:subClassOf wf:Task, cal:Vtodo ; owl:disjointUnionOf (<#ToDo> <#Done>) .
//                      <#ToDo> rdfs:label "To do" ; rdfs:subClassOf <#Task>, wf:Open .
//                      <#Done> rdfs:label "Done" ; rdfs:subClassOf <#Task>, wf:Closed .
//
//   garden/state.ttl   <#Iss1764000000000> a <index.ttl#ToDo>, cal:Vtodo ; wf:tracker <index.ttl#this> ;
//                          dc:title "Sow the beans" ; wf:description "Two rows by the fence." ;
//                          cal:due "2026-11-28"^^xsd:date ; cal:priority 1 ;
//                          dc:created "…"^^xsd:dateTime ; dc:author <WebID> .
//                      (done: its type is <index.ttl#Done>, and cal:completed "…"^^xsd:dateTime says when)
//
// A list is a task list when its wf:issueClass is a subclass of cal:Vtodo. The lists shown on the left are the task
// lists in the folders beside the open one (the folder that holds the list folders).
//
// What this pane writes, and when (only for someone the pod lets write; the README has the full table):
// - "New list": a new folder beside the others, with index.ttl and state.ttl as above. No access rules.
// - Adding, ticking, editing and deleting a task: that list's state.ttl.
// - Renaming a list: its index.ttl (dc:title).
// Every change reads the file fresh, changes it, and writes the whole file back with If-Match, so an edit made
// elsewhere meanwhile is never overwritten; then reads it again and says if the pod stored something else.
// (Whole-file writes, not patches: the test server loses text containing "}" in a SPARQL patch, and drops lists in a
// file it keeps as JSON-LD. See README, "Why whole files".)
//
// Inside the suite shell it also gives the shell its left column (renderNavigation) and right column (renderDetails).
// Icons: Material Design Icons (Apache 2.0). MIT. Copyright (c) 2026 Melvin Carvalho.

const WF = 'http://www.w3.org/2005/01/wf/flow#'
const CAL = 'http://www.w3.org/2002/12/cal/ical#'
const DC = 'http://purl.org/dc/elements/1.1/'
const DCT = 'http://purl.org/dc/terms/'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const LDP = 'http://www.w3.org/ns/ldp#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const VCARD = 'http://www.w3.org/2006/vcard/ns#'
const MAX_LISTS = 40 // folders looked into for lists, beside the open one

// ---- icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box ------------------------------------------
const MDI = {
  list: 'M3,5H9V11H3V5M5,7V9H7V7H5M11,7H21V9H11V7M11,15H21V17H11V15M5,20L1.5,16.5L2.91,15.09L5,17.17L9.59,12.59L11,14L5,20Z',
  plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  check: 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z',
  flag: 'M14.4,6L14,4H5V21H7V14H12.6L13,16H20V6H14.4Z',
  notes: 'M21,6V8H3V6H21M3,18H12V16H3V18M3,13H21V11H3V13Z',
  delete: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  menu: 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z',
  chevron: 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z',
  done: 'M19,19H5V5H15V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V11H19M7.91,10.08L6.5,11.5L11,16L21,6L19.59,4.58L11,13.17L7.91,10.08Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z'
}
const svgUri = (path, colour = '#000') => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${colour}" d="${path}"/></svg>`)

const PRIORITIES = [
  { key: 'none', label: 'None', value: 0 },
  { key: 'high', label: 'High', value: 1 },
  { key: 'medium', label: 'Medium', value: 5 },
  { key: 'low', label: 'Low', value: 9 }
]
// iCalendar: 1 to 4 high, 5 medium, 6 to 9 low, 0 or none undefined.
const priorityKey = (n) => !n ? 'none' : n <= 4 ? 'high' : n === 5 ? 'medium' : 'low'

const CSS = `
/* suite:design begin --prefix tsk --only base,icon,nav,toolbar,row,buttons,input,empty,toast,details */
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
.tsk-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.tsk-root *, .tsk-root *::before, .tsk-root *::after { box-sizing: border-box }
.tsk-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.tsk-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.tsk-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.tsk-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.tsk-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.tsk-root [hidden] { display: none !important }
.tsk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.tsk-muted { color: var(--sui-text-muted) }
.tsk-small { font-size: var(--sui-text-sm) }
.tsk-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.tsk-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.tsk-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.tsk-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.tsk-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.tsk-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --tsk-i set to url("data:image/svg+xml,...") ---------------------------------- */
.tsk-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--tsk-i) center / contain no-repeat; mask: var(--tsk-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.tsk-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.tsk-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.tsk-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.tsk-nav-item:hover { background: var(--sui-bg-hover) }
.tsk-nav-item[aria-current="page"], .tsk-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.tsk-nav-item .tsk-icon { color: var(--sui-text-muted) }
.tsk-nav-item[aria-current] .tsk-icon { color: inherit }
.tsk-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.tsk-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.tsk-nav-new { margin-bottom: var(--sui-space-2) }
.tsk-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- toolbar: content toolbar and breadcrumbs ---------------------------------------------------------------------- */
.tsk-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2); min-height: calc(var(--sui-target) + var(--sui-space-3)); padding: var(--sui-space-1) var(--sui-space-3) }
.tsk-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; min-width: 0; margin: 0; padding: 0; list-style: none; font-size: var(--sui-text-lg) }
.tsk-crumbs li { display: flex; align-items: center; min-width: 0 }
.tsk-crumbs li + li::before { content: "›"; padding: 0 var(--sui-space-1); color: var(--sui-text-muted) }
.tsk-crumbs a { display: inline-flex; align-items: center; min-height: var(--sui-target); padding: 0 var(--sui-space-2); border-radius: var(--sui-radius); color: var(--sui-text-muted); text-decoration: none; overflow-wrap: anywhere }
.tsk-crumbs a:hover { background: var(--sui-bg-hover) }
.tsk-crumbs [aria-current="page"] { color: var(--sui-text); font-weight: var(--sui-weight-bold) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.tsk-list { margin: 0; padding: 0; list-style: none }
.tsk-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.tsk-row:hover { background: var(--sui-bg-hover) }
.tsk-row[aria-selected="true"], .tsk-row[aria-current="true"] { background: var(--sui-primary-light) }
.tsk-row-main { flex: 1 1 auto; min-width: 0 }
.tsk-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.tsk-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.tsk-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.tsk-row-actions { flex: none; display: flex; align-items: center }
.tsk-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.tsk-row-icon .tsk-icon { width: 28px; height: 28px }
.tsk-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .tsk-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.tsk-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.tsk-btn:hover { background: var(--sui-primary-light-hover) }
.tsk-btn:disabled, .tsk-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.tsk-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.tsk-btn-primary:hover { background: var(--sui-primary-element-hover) }
.tsk-btn-tertiary { background: transparent; color: var(--sui-text) }
.tsk-btn-tertiary:hover { background: var(--sui-bg-hover) }
.tsk-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.tsk-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.tsk-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.tsk-btn-icon:hover { background: var(--sui-bg-hover) }
.tsk-btn-wide { width: 100%; justify-content: flex-start }
.tsk-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.tsk-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.tsk-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.tsk-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.tsk-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.tsk-input:hover { border-color: var(--sui-primary-element) }
.tsk-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.tsk-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.tsk-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.tsk-search { position: relative; display: flex; align-items: center; min-width: 0 }
.tsk-search .tsk-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.tsk-search .tsk-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.tsk-select { position: relative; display: block; min-width: 0 }
.tsk-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.tsk-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.tsk-file { position: relative; overflow: hidden }
.tsk-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.tsk-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .tsk-row-check */
.tsk-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.tsk-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.tsk-check-round { border-radius: 50% }
.tsk-check:hover { border-color: var(--sui-primary-element) }
.tsk-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.tsk-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.tsk-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.tsk-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.tsk-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.tsk-segment:hover { background: var(--sui-bg-hover) }
.tsk-segment[aria-pressed="true"], .tsk-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.tsk-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.tsk-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.tsk-empty-icon .tsk-icon { width: 48px; height: 48px }
.tsk-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.tsk-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.tsk-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.tsk-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.tsk-toast-error { border-left-color: var(--sui-error) }
.tsk-toast-success { border-left-color: var(--sui-success) }
.tsk-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.tsk-status-error { color: var(--sui-error) }
.tsk-status-success { color: var(--sui-success) }
.tsk-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.tsk-note-error { background: var(--sui-error-light) }
.tsk-note-warning { background: var(--sui-warning-light) }
.tsk-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.tsk-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.tsk-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.tsk-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.tsk-details-figure .tsk-icon { width: 36px; height: 36px }
.tsk-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.tsk-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.tsk-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.tsk-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.tsk-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.tsk-tab:hover { color: var(--sui-text) }
.tsk-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.tsk-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.tsk-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.tsk-props dt { color: var(--sui-text-muted) }
.tsk-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.tsk.suite-tasks-pane { max-width: none; margin: 0; padding: 0; container-type: inline-size; }
.tsk-app { position: relative; display: grid; grid-template-columns: var(--sui-nav-width) minmax(0, 1fr); min-height: 520px; }
.tsk-app.tsk-with-details { grid-template-columns: var(--sui-nav-width) minmax(0, 1fr) var(--sui-details-width); }
.tsk-app > .tsk-nav { width: auto; border-right: 1px solid var(--sui-border); }
.tsk-app > .tsk-details { width: auto; }
.tsk-main { min-width: 0; padding: var(--sui-space-2) var(--sui-space-4) var(--sui-space-8); }
.tsk-inner { max-width: var(--sui-content-max); margin: 0 auto; }
.tsk-toolbar { flex-wrap: nowrap; padding-left: 0; padding-right: 0; }
.tsk-titles { flex: 1 1 auto; min-width: 0; }
.tsk-heading { overflow-wrap: anywhere; }
.tsk-lists-btn { display: none; }
.tsk-root .tsk-status[role="status"] { display: flex; width: auto; margin: var(--sui-space-1) 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; } /* the browser styles every [role=status] as a green box */
.tsk-root .tsk-status[role="status"]:empty { display: none; }
.tsk-add { display: flex; gap: var(--sui-space-2); margin: var(--sui-space-2) 0 var(--sui-space-3); }
.tsk-add .tsk-input { flex: 1 1 auto; }
.tsk-add .tsk-btn { flex: none; }
.tsk-task { gap: var(--sui-space-1); padding-left: var(--sui-space-1); border-bottom: 1px solid var(--sui-border); border-radius: 0; cursor: default; }
.tsk-task:hover { background: transparent; }
.tsk-task[aria-selected="true"] { border-radius: var(--sui-radius); }
.tsk-check { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-width: var(--sui-target); height: var(--sui-target); padding: 0; border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); cursor: pointer; }
.tsk-check:hover { background: var(--sui-bg-hover); }
.tsk-check:disabled { cursor: default; background: transparent; }
.tsk-box { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-icon); height: var(--sui-icon); border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); color: var(--sui-primary-text); }
.tsk-box .tsk-icon { width: var(--sui-space-4); height: var(--sui-space-4); visibility: hidden; }
.tsk-check[aria-checked="true"] .tsk-box { background: var(--sui-border-strong); }
.tsk-check[aria-checked="true"] .tsk-box .tsk-icon { visibility: visible; }
.tsk-pri-high .tsk-box { border-color: var(--sui-error); }
.tsk-pri-medium .tsk-box { border-color: var(--sui-warning); }
.tsk-pri-low .tsk-box { border-color: var(--sui-primary-element); }
.tsk-open { flex: 1 1 auto; display: flex; align-items: center; gap: var(--sui-space-1) var(--sui-space-3); min-width: 0; min-height: var(--sui-target); padding: var(--sui-space-1) var(--sui-space-2); border: 0; border-radius: var(--sui-radius); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.tsk-open:hover { background: var(--sui-bg-hover); }
.tsk-task[aria-selected="true"] .tsk-open:hover { background: transparent; }
.tsk-open .tsk-row-title { font-weight: var(--sui-weight); white-space: normal; overflow-wrap: anywhere; }
.tsk-done .tsk-row-title { color: var(--sui-text-muted); text-decoration: line-through; }
.tsk-facts { flex: none; display: flex; align-items: center; gap: var(--sui-space-2); }
.tsk-facts .tsk-icon { color: var(--sui-text-muted); }
.tsk-facts .tsk-flag-high { color: var(--sui-error); }
.tsk-facts .tsk-flag-medium { color: var(--sui-warning); }
.tsk-facts .tsk-flag-low { color: var(--sui-primary-element); }
.tsk-due { font-size: var(--sui-text-sm); color: var(--sui-text-muted); white-space: nowrap; }
.tsk-due.tsk-late { color: var(--sui-error); font-weight: var(--sui-weight-bold); }
.tsk-due.tsk-soon { color: var(--sui-primary-element); font-weight: var(--sui-weight-bold); }
.tsk-more { margin: var(--sui-space-4) 0 var(--sui-space-1); }
.tsk-more .tsk-icon { transition: transform var(--sui-ease); }
.tsk-more[aria-expanded="false"] .tsk-icon { transform: rotate(-90deg); }
.tsk-nav-form { display: flex; flex-direction: column; gap: var(--sui-space-2); padding: 0 0 var(--sui-space-2); }
.tsk-nav-note { padding: var(--sui-space-2) var(--sui-space-3); color: var(--sui-text-muted); font-size: var(--sui-text-sm); }
.tsk-shell-nav { display: flex; flex-direction: column; background: transparent; }
.tsk-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--sui-space-3); }
.tsk-value { min-height: var(--sui-target-sm); display: flex; align-items: center; overflow-wrap: anywhere; }
.tsk-value-notes { white-space: pre-wrap; align-items: flex-start; }
.tsk-details-done { align-self: flex-start; }
.tsk-details-check { padding: 0 var(--sui-space-3) 0 var(--sui-space-3); }
.tsk-meta { display: flex; flex-direction: column; gap: var(--sui-space-1); }
.tsk-meta a { overflow-wrap: anywhere; }
.tsk-delete { align-self: flex-start; }
.tsk-unsaved { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--sui-space-2); color: var(--sui-error); overflow-wrap: anywhere; }
.tsk-unsaved > span { flex: 1 1 100%; }
.tsk-delete.tsk-btn-tertiary { color: var(--sui-error); }
.tsk-shell-details { background: var(--sui-bg); }
.tsk-app > .tsk-details .tsk-details-close { position: absolute; top: var(--sui-space-2); right: var(--sui-space-2); }
.tsk-app > .tsk-details { position: relative; }
/* Alone, the breakpoints of the design sheet, on the pane's own width: details float at 1100, navigation is a
   drawer at 900, details take the full width at 600, row meta moves under the title at 520. */
@container (max-width: 1100px) {
  .tsk-app.tsk-with-details { grid-template-columns: var(--sui-nav-width) minmax(0, 1fr); }
  .tsk-app > .tsk-details { position: absolute; z-index: 2; top: 0; right: 0; bottom: 0; width: min(var(--sui-details-width), 100%); overflow: auto; box-shadow: var(--sui-shadow-lg); }
}
@container (max-width: 900px) {
  .tsk-app, .tsk-app.tsk-with-details { grid-template-columns: minmax(0, 1fr); }
  .tsk-app > .tsk-nav { display: none; position: absolute; z-index: 3; top: 0; left: 0; bottom: 0; width: min(var(--sui-nav-width), 85%); overflow: auto; border-right: 0; box-shadow: var(--sui-shadow-lg); }
  .tsk-app.tsk-nav-open > .tsk-nav { display: flex; }
  .tsk-lists-btn { display: inline-flex; }
}
@container (max-width: 600px) {
  .tsk-app.tsk-with-details > .tsk-main { display: none; }
  .tsk-app > .tsk-details { position: static; width: 100%; box-shadow: none; border-left: 0; }
  .tsk-main { padding-left: var(--sui-space-2); padding-right: var(--sui-space-2); }
}
@container (max-width: 520px) {
  .tsk-open { flex-wrap: wrap; }
  .tsk-open .tsk-row-main { flex-basis: 100%; }
  .tsk-pair { grid-template-columns: minmax(0, 1fr); }
  .tsk-add .tsk-btn-label { display: none; }
}
`

// ---- small helpers ----------------------------------------------------------------------------------------------
function el (dom, tag, className, text, attrs) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = text
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}
function icon (dom, name, extra) {
  const span = el(dom, 'span', 'tsk-icon' + (extra ? ' ' + extra : ''), null, { 'aria-hidden': 'true' })
  span.style.setProperty('--tsk-i', `url("${svgUri(MDI[name])}")`)
  return span
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
const storeOf = (context) => (context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store) || (globalThis.UI && globalThis.UI.store)
const folderOf = (uri) => uri.replace(/[#?].*$/, '').replace(/[^/]*$/, '')
const parentFolder = (folder) => folder.replace(/[^/]+\/$/, '')
const lastName = (uri) => decodeURIComponent(uri.replace(/\/$/, '').split('/').pop() || '')
const textOf = (term) => term ? term.value : ''
const insideFolder = (address, folder) => { try { const a = new URL(address); const f = new URL(folder); return a.origin === f.origin && a.pathname.startsWith(f.pathname) && !/(^|\/)\.\.?(\/|$)/.test(a.pathname.slice(f.pathname.length)) } catch { return false } }

// ---- reading the data -------------------------------------------------------------------------------------------
function rdfList (store, head) {
  if (!head) return []
  if (head.termType === 'Collection') return head.elements.slice()
  const out = []
  let node = head
  for (let i = 0; node && node.value !== RDF + 'nil' && i < 200; i++) {
    const first = store.any(node, store.sym(RDF + 'first'))
    if (first) out.push(first)
    node = store.any(node, store.sym(RDF + 'rest'))
  }
  return out
}

// A task list: a wf:Tracker whose issue class is a kind of cal:Vtodo.
function isTaskList (store, node) {
  if (!store || !node || node.termType !== 'NamedNode') return false
  const sym = store.sym.bind(store)
  if (!store.holds(node, sym(RDF + 'type'), sym(WF + 'Tracker'))) return false
  const kind = store.any(node, sym(WF + 'issueClass'))
  return !!kind && (kind.value === CAL + 'Vtodo' || store.holds(kind, sym(RDFS + 'subClassOf'), sym(CAL + 'Vtodo')))
}
const trackerOf = (store, node) => node && store.any(node, store.sym(WF + 'tracker'))
const isTask = (store, node) => !!node && node.termType === 'NamedNode' && (store.holds(node, store.sym(RDF + 'type'), store.sym(CAL + 'Vtodo')) || isTaskList(store, trackerOf(store, node))) && !!trackerOf(store, node)
function isTaskHome (store, node) {
  if (!store || !node || !/\/$/.test(node.value)) return false
  const kids = store.each(node, store.sym(LDP + 'contains')).map(k => k.value)
  if (kids.some(k => /tasks-pane\.js$/.test(k))) return false // the pane's own source folder
  if (lastName(node.value).toLowerCase() === 'tasks') return true
  return kids.some(k => /\/$/.test(k) && isTaskList(store, store.sym(k + 'index.ttl#this')))
}

function readList (store, node) {
  const sym = store.sym.bind(store)
  const kind = store.any(node, sym(WF + 'issueClass'))
  let states = kind ? rdfList(store, store.any(kind, sym(OWL + 'disjointUnionOf'))) : []
  if (!states.length && kind) states = store.each(null, sym(RDFS + 'subClassOf'), kind)
  states = states.map(s => ({ node: s, label: textOf(store.any(s, sym(RDFS + 'label'))) || lastName(s.value.replace('#', '/')), closed: store.holds(s, sym(RDFS + 'subClassOf'), sym(WF + 'Closed')) }))
  const initial = store.any(node, sym(WF + 'initialState'))
  const store2 = store.any(node, sym(WF + 'stateStore'))
  return {
    node,
    title: textOf(store.any(node, sym(DC + 'title')) || store.any(node, sym(DCT + 'title'))) || lastName(folderOf(node.value)) || 'Tasks',
    states,
    open: states.find(s => initial && s.node.value === initial.value && !s.closed) || states.find(s => !s.closed) || null,
    done: states.find(s => s.closed) || null,
    stateDoc: store2 && store2.termType === 'NamedNode' ? store2.doc() : node.doc(),
    // Safety: the pane writes the tasks only to a file in the list's own folder (or below it). A list whose
    // wf:stateStore names any other address (another folder, another site) is shown read-only.
    safe: !(store2 && store2.termType === 'NamedNode') || insideFolder(store2.doc().value, folderOf(node.value))
  }
}

const dateOnly = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v)
const whenOf = (v) => { if (!v) return null; const d = dateOnly(v) ? new Date(v + 'T00:00:00') : new Date(v); return isNaN(d) ? null : d }
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const daysFromToday = (d) => Math.round((dayStart(d) - dayStart(new Date())) / 86400000)
const toDateInput = (v) => { const d = whenOf(v); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '' }
function shortDate (d) {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { weekday: sameYear ? 'short' : undefined, day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
}
// "Today", "Tomorrow", "Yesterday", or the date; with how urgent it is.
function dueLabel (value) {
  const d = whenOf(value)
  if (!d) return null
  const n = daysFromToday(d)
  const text = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : shortDate(d)
  return { text, late: n < 0, soon: n >= 0 && n <= 1 }
}
const longDate = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

function readTasks (store, list) {
  const sym = store.sym.bind(store)
  const doc = list.stateDoc
  const one = (node, ...terms) => { for (const t of terms) { const v = store.any(node, sym(t), null, doc); if (v) return v } return null }
  return store.each(null, sym(WF + 'tracker'), list.node, doc).filter(n => n.termType === 'NamedNode').map(node => {
    const types = store.each(node, sym(RDF + 'type'), null, doc).map(t => t.value)
    const state = list.states.find(s => types.includes(s.node.value)) || null
    const status = textOf(one(node, CAL + 'status'))
    const completed = textOf(one(node, CAL + 'completed'))
    const priority = parseInt(textOf(one(node, CAL + 'priority')), 10)
    return {
      node,
      title: textOf(one(node, DC + 'title', CAL + 'summary', DCT + 'title')),
      notes: textOf(one(node, WF + 'description', CAL + 'description')),
      due: textOf(one(node, CAL + 'due')),
      priority: priority >= 0 && priority <= 9 ? priority : 0,
      created: textOf(one(node, DC + 'created', DCT + 'created')),
      completed,
      author: one(node, DC + 'author', FOAF + 'maker'),
      state,
      done: state ? state.closed : /^completed$/i.test(status) || !!completed
    }
  })
}
const rank = (p) => p === 0 ? 10 : p
function sortTasks (tasks) {
  const t = (v) => { const d = whenOf(v); return d ? d.getTime() : Infinity }
  const open = tasks.filter(x => !x.done).sort((a, b) => (t(a.due) - t(b.due)) || (rank(a.priority) - rank(b.priority)) || (t(b.created) - t(a.created)) || b.node.value.localeCompare(a.node.value, undefined, { numeric: true }))
  const done = tasks.filter(x => x.done).sort((a, b) => (t(b.completed) - t(a.completed)) || a.title.localeCompare(b.title))
  return { open, done }
}

function personName (store, person) {
  if (!person) return ''
  const name = store.any(person, store.sym(FOAF + 'name')) || store.any(person, store.sym(VCARD + 'fn'))
  if (name) return name.value
  try { const url = new URL(person.value); return url.hostname + (/^\/(profile\/card(\.jsonld)?)?$/.test(url.pathname) ? '' : url.pathname.replace(/\/profile\/card(\.jsonld)?$/, '')) } catch { return person.value }
}

// What the logged-in person may do with a resource, from the server's WAC-Allow header.
function parseWac (header) {
  const out = { user: '', public: '' }
  for (const m of String(header || '').matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2]
  return out
}
const turtleText = (text) => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'
function listTurtle (title, me, now) {
  return `@prefix wf: <${WF}> .\n@prefix cal: <${CAL}> .\n@prefix dc: <${DC}> .\n@prefix rdfs: <${RDFS}> .\n@prefix owl: <${OWL}> .\n@prefix xsd: <${XSD}> .\n\n` +
    `<#this> a wf:Tracker ;\n    dc:title ${turtleText(title)} ;\n    dc:author <${me}> ;\n    dc:created "${now}"^^xsd:dateTime ;\n` +
    '    wf:issueClass <#Task> ;\n    wf:initialState <#ToDo> ;\n    wf:stateStore <state.ttl> .\n\n' +
    '<#Task> a rdfs:Class ; rdfs:label "Task" ; rdfs:subClassOf wf:Task, cal:Vtodo ;\n    owl:disjointUnionOf ( <#ToDo> <#Done> ) .\n' +
    '<#ToDo> a rdfs:Class ; rdfs:label "To do" ; rdfs:subClassOf <#Task>, wf:Open .\n' +
    '<#Done> a rdfs:Class ; rdfs:label "Done" ; rdfs:subClassOf <#Task>, wf:Closed .\n'
}
function slugOf (name) {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'list'
}

// ---- the app: one per showing. In the shell, render, renderNavigation and renderDetails share it through
// context.suite.state (new for each showing); alone, render makes its own.
const suiteOf = (context) => context && context.suite && context.suite.version >= 1 ? context.suite : null
function appFor (subject, context) {
  const suite = suiteOf(context)
  if (!suite) return makeApp(subject, context)
  const state = suite.state || (suite.state = {})
  if (!state.tasks || state.tasks.subject.value !== subject.value) state.tasks = makeApp(subject, context)
  return state.tasks
}

function makeApp (subject, context) {
  const dom = context.dom
  const store = context.session.store
  const sym = store.sym.bind(store)
  const lit = (v, type) => type ? rdflib().literal(v, sym(XSD + type)) : rdflib().literal(v)
  const suite = suiteOf(context)
  const me = () => currentUser(context)

  const app = {
    subject,
    home: null, // the folder that holds the list folders
    lists: [], // [{ node, title, stateDoc, ... }]
    current: null, // the list shown
    selected: null, // the task shown in the details
    access: new Map(), // address -> { user, public }
    unsaved: new Map(), // 'task field' -> what the person typed and the pod has not taken yet
    homeWritable: false,
    loading: true,
    showDone: false,
    navOpen: false,
    message: { text: '', kind: '' },
    navs: new Set(),
    details: null // { node, update() }
  }
  let queue = Promise.resolve()
  let busy = false

  // ---- reading and writing files
  async function readFresh (doc) {
    const response = await webFetch(store)(doc.value, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
    app.access.set(doc.value, parseWac(response.headers.get('wac-allow')))
    if (!response.ok) { const error = new Error('could not be read (' + response.status + ')'); error.status = response.status; throw error }
    const type = (response.headers.get('content-type') || 'text/turtle').split(';')[0].trim()
    const text = await response.text()
    store.removeMatches(null, null, null, doc)
    await new Promise((resolve, reject) => {
      try { rdflib().parse(text, store, doc.value, type, (error) => error ? reject(error) : resolve()) } catch (error) { reject(error) }
    })
    return response.headers.get('etag')
  }
  const canWrite = (doc) => !!me() && /\bwrite\b/.test((app.access.get(doc.value) || {}).user || '')
  const canWriteTasks = (list) => !!list && list.safe && canWrite(list.stateDoc)
  // Every file this pane may PUT: a list's index.ttl, and its state file when it is in the list's folder.
  const writableTarget = (doc) => app.lists.some(l => l.node.doc().value === doc.value || (l.safe && l.stateDoc.value === doc.value))

  // Read fresh, change in the store, write the whole file back only if nobody changed it meanwhile (If-Match with
  // the ETag of that read), read again. change() may refuse with a message (a string): the task was deleted, or the
  // field was changed by someone else since the person saw it (each edit carries the value it started from, so an edit
  // made from a view opened earlier cannot overwrite a newer one). Resolves to 'ok', 'refused' or 'error'.
  function rewrite (doc, change, done, verify) {
    const result = queue.then(async () => {
      busy = true
      say('Saving…')
      let outcome = 'error'
      try {
        if (!writableTarget(doc)) throw new Error('this pane writes only inside the list\'s own folder, and ' + doc.value + ' is not.')
        const etag = await readFresh(doc)
        if (!etag) throw new Error('the pod gave no version tag (ETag) for the file, so it cannot be saved without risk of overwriting someone else\'s change.')
        const refusal = change()
        if (typeof refusal === 'string') { outcome = 'refused'; say(refusal, 'error'); return outcome }
        const body = rdflib().serialize(doc, store, doc.value, 'text/turtle')
        const response = await webFetch(store)(doc.value, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-Match': etag }, body })
        if (response.status === 412) throw new Error('it was changed somewhere else a moment ago. It has been read again; what you typed is kept: try once more.')
        if (response.status === 401 || response.status === 403) throw new Error('you are not allowed to change this list.')
        if (!response.ok) throw new Error('the pod refused it (' + response.status + ').')
        await readFresh(doc)
        if (verify && !verify()) say('Not saved as typed: the pod stored something different. What it holds is shown.', 'error')
        else { say(done, 'success'); outcome = 'ok' }
      } catch (error) {
        say('Not saved: ' + (error && error.message ? error.message : error), 'error')
        try { await readFresh(doc) } catch { /* keep what we have */ }
      } finally {
        busy = false
        draw()
      }
      return outcome
    })
    queue = result.catch(() => null)
    return result
  }

  // The status line in place (saving, errors, what stays true). In the shell, the outcome of an action is also a
  // toast, as the design sheet asks; a success then leaves the line, so it is not said twice.
  function say (text, kind) {
    if (suite && suite.toast && (kind === 'success' || kind === 'error') && text) {
      try { suite.toast(text, { kind }) } catch { /* the line still says it */ }
      if (kind === 'success') { app.lastToast = text; text = ''; kind = '' }
    }
    app.message = { text: text || '', kind: kind || '' }
    clearTimeout(app.fade)
    if (kind === 'success') { const shown = app.message; app.fade = setTimeout(() => { if (app.message === shown) say('') }, 4000) }
    for (const line of app.statusLines()) {
      line.textContent = app.message.text
      line.className = 'tsk-status tsk-status-line' + (app.message.kind ? ' tsk-status-' + app.message.kind : '')
    }
  }

  // ---- finding the lists
  async function discover () {
    const found = new Map()
    let start = null // the list (and task) the subject points at
    let task = null
    try {
      if (/\/$/.test(subject.value)) {
        app.home = subject.value
      } else {
        if (isTask(store, subject)) { task = subject; start = trackerOf(store, subject) } else start = subject
        if (start && !isTaskList(store, start)) { try { await store.fetcher.load(start.doc()) } catch { /* shown below */ } }
        app.home = start ? parentFolder(folderOf(start.value)) : null
      }
      if (start && isTaskList(store, start)) found.set(start.value, start)
      if (app.home) {
        const home = sym(app.home)
        try { await store.fetcher.load(home, { force: true }) } catch { /* a folder we cannot list: only the open list */ }
        const kids = store.each(home, sym(LDP + 'contains')).map(k => k.value).filter(k => /\/$/.test(k) && k.startsWith(app.home) && k !== app.home).sort().slice(0, MAX_LISTS)
        await Promise.all(kids.map(async (kid) => {
          const doc = sym(kid + 'index.ttl')
          try { await store.fetcher.load(doc) } catch { return }
          for (const node of store.each(null, sym(RDF + 'type'), sym(WF + 'Tracker'), doc)) if (isTaskList(store, node)) found.set(node.value, node)
        }))
        try {
          const response = await webFetch(store)(app.home, { method: 'HEAD', cache: 'no-store' })
          app.homeWritable = !!me() && /\b(write|append)\b/.test(parseWac(response.headers.get('wac-allow')).user)
        } catch { app.homeWritable = false }
      }
    } catch (error) {
      say('The lists could not be read: ' + (error && error.message ? error.message : error), 'error')
    }
    app.lists = [...found.values()].map(node => readList(store, node)).sort((a, b) => a.title.localeCompare(b.title))
    // Every list's tasks, for the counts on the left; the open list is read fresh, with what the person may do.
    await Promise.all(app.lists.map(l => store.fetcher.load(l.stateDoc).catch(() => null)))
    const first = (start && app.lists.find(l => l.node.value === start.value)) || app.lists[0] || null
    app.loading = false
    if (first) await choose(first.node, task)
    else draw()
  }

  async function choose (node, task) {
    const list = app.lists.find(l => l.node.value === node.value)
    if (!list) return
    app.current = list
    app.selected = null
    app.showDone = false
    if (app.details) closeDetails()
    say('')
    draw()
    try {
      await readFresh(list.stateDoc)
    } catch (error) {
      say(error.status === 401 || error.status === 403 ? 'You are not allowed to see the tasks in this list.' : error.status === 404 ? 'This list has no tasks file yet.' : 'The tasks could not be read.', 'error')
    }
    if (!list.safe) say('This list keeps its tasks outside its own folder (' + list.stateDoc.value + '), so this pane shows it but will not change it.', 'error')
    else if (!me()) say('Log in to add or change tasks.')
    else if (!canWrite(list.stateDoc) && !app.message.text) say('You can see this list but not change it.')
    draw()
    if (task) openTask(task)
    // Names of the people who added tasks, from their profiles, shown when they arrive.
    const people = readTasks(store, list).map(t => t.author).filter(p => p && p.termType === 'NamedNode' && !store.any(p, sym(FOAF + 'name')) && !store.any(p, sym(VCARD + 'fn')))
    const unique = [...new Map(people.map(p => [p.value, p])).values()].slice(0, 20)
    if (unique.length) Promise.allSettled(unique.map(p => store.fetcher.load(p.doc()))).then(() => { if (!busy && app.details) app.details.update() })
  }

  // ---- changes
  const GONE = 'This task was deleted elsewhere, so the change was not made.'
  const fingerprint = (node, doc) => store.statementsMatching(node, null, null, doc).map(q => q.predicate.value + ' ' + q.object.termType + ' ' + q.object.value).sort().join('\n')
  // A field in the form the details compare: title and notes as text, due as YYYY-MM-DD, priority as its key.
  const fieldOf = (task, field) => !task ? undefined : field === 'due' ? toDateInput(task.due) : field === 'priority' ? priorityKey(task.priority) : task[field]
  const fresh = (list) => { let id; do { id = list.stateDoc.value + '#Iss' + Date.now() + (Math.random() < 0.5 ? '' : String(Math.floor(Math.random() * 10))) } while (store.any(sym(id), null, null, list.stateDoc)); return sym(id) }

  function addTask (title) {
    const list = app.current
    const who = me()
    if (!list || !who) return
    const text = title.trim()
    if (!text) { say('Type the task first.', 'error'); return }
    const node = fresh(list)
    const doc = list.stateDoc
    return rewrite(doc, () => {
      const now = new Date().toISOString() // with milliseconds, so tasks added in one second keep their order
      if (list.open) store.add(node, sym(RDF + 'type'), list.open.node, doc)
      store.add(node, sym(RDF + 'type'), sym(CAL + 'Vtodo'), doc)
      store.add(node, sym(WF + 'tracker'), list.node, doc)
      store.add(node, sym(DC + 'title'), lit(text), doc)
      store.add(node, sym(DC + 'created'), lit(now, 'dateTime'), doc)
      store.add(node, sym(DC + 'author'), who, doc)
    }, 'Added: ' + text, () => textOf(store.any(node, sym(DC + 'title'), null, doc)) === text)
  }

  function setDone (node, done) {
    const list = app.current
    const doc = list.stateDoc
    const target = done ? list.done : list.open
    return rewrite(doc, () => {
      if (!store.any(node, null, null, doc)) return GONE
      for (const s of list.states) store.removeMatches(node, sym(RDF + 'type'), s.node, doc)
      store.removeMatches(node, sym(CAL + 'completed'), null, doc)
      store.removeMatches(node, sym(CAL + 'status'), null, doc)
      if (target) store.add(node, sym(RDF + 'type'), target.node, doc)
      else store.add(node, sym(CAL + 'status'), lit(done ? 'COMPLETED' : 'NEEDS-ACTION'), doc)
      if (done) store.add(node, sym(CAL + 'completed'), lit(new Date().toISOString().replace(/\.\d+Z$/, 'Z'), 'dateTime'), doc)
    }, done ? 'Done.' : 'Not done any more.')
  }

  // One field of a task: title, notes, due or priority. An empty value removes it (except the title).
  // before: the field as the person saw it when they started the edit (the same form as fieldOf gives).
  function setField (node, field, value, before) {
    const doc = app.current.stateDoc
    const terms = { title: [DC + 'title', CAL + 'summary', DCT + 'title'], notes: [WF + 'description', CAL + 'description'], due: [CAL + 'due'], priority: [CAL + 'priority'] }[field]
    const make = () => field === 'due' ? lit(value, 'date') : field === 'priority' ? lit(String(value), 'integer') : lit(value)
    const empty = field === 'priority' ? !value : !String(value).trim()
    if (field === 'title' && empty) { say('A task needs a title.', 'error'); draw(); return }
    const names = { title: 'Title', notes: 'Notes', due: 'Due date', priority: 'Priority' }
    return rewrite(doc, () => {
      if (!store.any(node, null, null, doc)) return GONE
      const now = fieldOf(readTasks(store, app.current).find(t => t.node.value === node.value), field)
      const mine = field === 'priority' ? priorityKey(value) : value
      if (before !== undefined && now !== before && now !== mine) return names[field] + ' not saved: someone else changed it meanwhile. Theirs is shown under the box; what you typed is still in it, so save again to replace theirs.'
      for (const t of terms) store.removeMatches(node, sym(t), null, doc)
      if (!empty) store.add(node, sym(terms[0]), make(), doc)
    }, names[field] + (empty ? ' removed.' : ' saved.'), () => {
      const now = store.any(node, sym(terms[0]), null, doc)
      if (empty) return !now
      return !!now && (field === 'priority' ? parseInt(now.value, 10) === value : field === 'due' ? toDateInput(now.value) === value : now.value === value)
    })
  }

  // Deleted only if the task is still as the person saw it; changed meanwhile, it is kept and they are told.
  function deleteTask (node) {
    const doc = app.current.stateDoc
    const title = (readTasks(store, app.current).find(t => t.node.value === node.value) || {}).title || 'The task'
    const seen = fingerprint(node, doc)
    if (app.selected && app.selected.value === node.value) closeDetails()
    return rewrite(doc, () => {
      if (!store.any(node, null, null, doc)) return GONE
      if (fingerprint(node, doc) !== seen) return 'Not deleted: someone else changed this task meanwhile. Look at it again first.'
      store.removeMatches(node, null, null, doc)
      store.removeMatches(null, null, node, doc)
    }, 'Deleted: ' + title, () => !store.any(node, null, null, doc))
  }

  function renameList (list, title) {
    const text = title.trim()
    if (!text) { say('A list needs a name.', 'error'); draw(); return }
    const doc = list.node.doc()
    const before = list.title
    return rewrite(doc, () => {
      const now = readList(store, list.node).title
      if (now !== before && now !== text) return 'Not renamed: someone else renamed the list meanwhile (to “' + now + '”).'
      store.removeMatches(list.node, sym(DC + 'title'), null, doc)
      store.removeMatches(list.node, sym(DCT + 'title'), null, doc)
      store.add(list.node, sym(DC + 'title'), lit(text), doc)
    }, 'List renamed.', () => textOf(store.any(list.node, sym(DC + 'title'), null, doc)) === text).then(() => {
      const fresh = readList(store, list.node)
      Object.assign(list, { title: fresh.title, states: fresh.states, open: fresh.open, done: fresh.done })
      app.lists.sort((a, b) => a.title.localeCompare(b.title))
      draw()
    })
  }

  async function createList (name) {
    const who = me()
    const title = name.trim()
    if (!who || !app.home) return false
    if (!title) { say('Give the list a name.', 'error'); return false }
    const fetcher = webFetch(store)
    say('Making the list…')
    try {
      let folder = null
      for (let i = 1; i <= 30 && !folder; i++) {
        const candidate = app.home + slugOf(title) + (i > 1 ? '-' + i : '') + '/'
        const seen = await fetcher(candidate, { method: 'HEAD', cache: 'no-store' })
        if (seen.status === 404) folder = candidate
      }
      if (!folder) throw new Error('no free folder name was found')
      const put = async (address, text) => {
        const response = await fetcher(address, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' }, body: text })
        if (!response.ok) throw new Error(address.split('/').slice(-2).join('/') + ' was not created (' + response.status + ')')
      }
      await put(folder + 'index.ttl', listTurtle(title, who.value, new Date().toISOString().replace(/\.\d+Z$/, 'Z')))
      await put(folder + 'state.ttl', `@prefix wf: <${WF}> .\n`)
      const node = sym(folder + 'index.ttl#this')
      await readFresh(node.doc())
      if (!isTaskList(store, node)) throw new Error('the new list could not be read back')
      const list = readList(store, node)
      app.lists.push(list)
      app.lists.sort((a, b) => a.title.localeCompare(b.title))
      await choose(node)
      say('List made: ' + list.title, 'success')
      return true
    } catch (error) {
      say('The list was not made: ' + (error && error.message ? error.message : error), 'error')
      draw()
      return false
    }
  }

  // ---- details: in the shell's right column, or this pane's own
  function openTask (node) {
    app.selected = node
    if (suite) {
      const shown = suite.showDetails(node, { onClose: () => { if (app.selected && app.selected.value === node.value) { app.selected = null; app.details = null; drawContent() } } })
      if (!shown) app.selected = null
    } else {
      app.details = null
      drawOwnDetails()
    }
    drawContent()
  }
  function closeDetails () {
    app.selected = null
    app.details = null
    if (suite) suite.closeDetails()
    drawOwnDetails()
    drawContent()
  }

  // ---- drawing
  let contentRoot = null
  let ownNav = null
  let ownDetails = null
  let frame = null
  const lines = new Set()
  app.statusLines = () => [...lines].filter(l => l.isConnected || !suite)

  // The left column. Redrawn after every change; a half-typed new list name survives that.
  function navInto (box) {
    const typing = box.querySelector('.tsk-nav-form input')
    const hadFocus = !!typing && dom.activeElement === typing
    box.replaceChildren()
    if (app.homeWritable) {
      const form = el(dom, 'form', 'tsk-nav-form')
      form.hidden = !app.newList
      const add = box.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-wide tsk-nav-new tsk-new-list', null, { type: 'button' }))
      add.hidden = !!app.newList
      add.appendChild(icon(dom, 'plus'))
      add.appendChild(el(dom, 'span', '', 'New list'))
      const input = form.appendChild(el(dom, 'input', 'tsk-input', null, { type: 'text', maxlength: '80', placeholder: 'Name of the list', 'aria-label': 'Name of the new list' }))
      input.value = app.newListDraft || ''
      input.addEventListener('input', () => { app.newListDraft = input.value })
      const buttons = form.appendChild(el(dom, 'div', 'tsk-btns'))
      buttons.appendChild(el(dom, 'button', 'tsk-btn', 'Create', { type: 'submit' }))
      const cancel = buttons.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-tertiary', 'Cancel', { type: 'button' }))
      box.appendChild(form)
      if (hadFocus) setTimeout(() => input.focus(), 0)
      add.addEventListener('click', () => { app.newList = true; form.hidden = false; add.hidden = true; input.focus() })
      cancel.addEventListener('click', () => { app.newList = false; app.newListDraft = ''; form.hidden = true; add.hidden = false; input.value = '' })
      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        if (busy) return
        for (const b of form.querySelectorAll('button')) b.disabled = true
        const ok = await createList(input.value)
        for (const b of form.querySelectorAll('button')) b.disabled = false
        if (ok) { app.newList = false; app.newListDraft = ''; draw() }
      })
    }
    box.appendChild(el(dom, 'h2', 'tsk-caption', 'Lists'))
    const list = box.appendChild(el(dom, 'ul', 'tsk-nav-list'))
    for (const l of app.lists) {
      const li = list.appendChild(el(dom, 'li'))
      const a = li.appendChild(el(dom, 'a', 'tsk-nav-item tsk-list-link'))
      a.href = listHref(l) // the browser's own page with ?uri= this list, or the list's http(s) address
      a.rel = 'noopener'
      a.dataset.list = l.node.value
      if (app.current && app.current.node.value === l.node.value) a.setAttribute('aria-current', 'page')
      a.appendChild(icon(dom, 'list'))
      a.appendChild(el(dom, 'span', 'tsk-nav-label', l.title))
      const open = readTasks(store, l).filter(t => !t.done).length
      a.appendChild(el(dom, 'span', 'tsk-nav-count', String(open), { 'aria-label': open + ' to do' }))
      a.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        app.navOpen = false
        choose(l.node)
      })
    }
    if (app.loading) box.appendChild(el(dom, 'p', 'tsk-nav-note', 'Looking for lists…'))
    else if (!app.lists.length) box.appendChild(el(dom, 'p', 'tsk-nav-note', 'No lists yet.'))
  }
  function listHref (list) {
    if (!/^https?:\/\//i.test(list.node.value)) return '#'
    try {
      const here = new URL(globalThis.location.href)
      if (here.searchParams.has('uri')) { here.searchParams.set('uri', list.node.value); return here.href }
    } catch { /* plain link */ }
    return list.node.value
  }

  // Alone, the nav recipe (its own width and background); in the shell, the shell's column gives those.
  function buildNav () {
    const box = el(dom, suite ? 'div' : 'nav', suite ? 'tsk tsk-root tsk-shell-nav' : 'tsk-nav', null, { 'aria-label': 'Task lists' })
    app.navs.add(box)
    navInto(box)
    return box
  }

  function emptyState (iconName, title, text, action) {
    const box = el(dom, 'div', 'tsk-empty')
    box.appendChild(el(dom, 'span', 'tsk-empty-icon')).appendChild(icon(dom, iconName))
    box.appendChild(el(dom, 'h3', 'tsk-empty-title', title))
    if (text) box.appendChild(el(dom, 'p', 'tsk-empty-text', text))
    if (action) box.appendChild(action)
    return box
  }

  function taskRow (task, writable) {
    const li = el(dom, 'li', 'tsk-row tsk-task' + (task.done ? ' tsk-done' : '') + ' tsk-pri-' + priorityKey(task.priority))
    li.dataset.task = task.node.value
    if (app.selected && app.selected.value === task.node.value) li.setAttribute('aria-selected', 'true')
    const check = li.appendChild(el(dom, 'button', 'tsk-check', null, { type: 'button', role: 'checkbox', 'aria-checked': String(task.done), 'aria-label': (task.done ? 'Done: ' : 'To do: ') + (task.title || 'untitled') }))
    check.appendChild(el(dom, 'span', 'tsk-box')).appendChild(icon(dom, 'check'))
    if (!writable) check.disabled = true
    check.addEventListener('click', () => setDone(task.node, !task.done)) // queued behind any save in progress
    const open = li.appendChild(el(dom, 'button', 'tsk-open', null, { type: 'button', 'aria-label': 'Details of ' + (task.title || 'untitled') }))
    const main = open.appendChild(el(dom, 'span', 'tsk-row-main'))
    main.appendChild(el(dom, 'span', 'tsk-row-title', task.title || '(untitled)'))
    const facts = open.appendChild(el(dom, 'span', 'tsk-facts'))
    if (task.notes) facts.appendChild(icon(dom, 'notes')).title = 'Has notes'
    const pkey = priorityKey(task.priority)
    if (pkey !== 'none') { const f = facts.appendChild(icon(dom, 'flag', 'tsk-flag-' + pkey)); f.title = PRIORITIES.find(p => p.key === pkey).label + ' priority'; f.setAttribute('aria-hidden', 'false'); f.setAttribute('role', 'img'); f.setAttribute('aria-label', f.title) }
    const due = dueLabel(task.due)
    if (due) facts.appendChild(el(dom, 'span', 'tsk-due' + (!task.done && due.late ? ' tsk-late' : !task.done && due.soon ? ' tsk-soon' : ''), due.text, { title: 'Due ' + longDate(whenOf(task.due)) }))
    open.addEventListener('click', () => { if (app.selected && app.selected.value === task.node.value) closeDetails(); else openTask(task.node) })
    return li
  }

  function drawContent () {
    if (!contentRoot) return
    const main = contentRoot
    const keepFocus = dom.activeElement && main.contains(dom.activeElement) && dom.activeElement.classList.contains('tsk-add-input') ? dom.activeElement.value : null
    main.replaceChildren()
    const inner = main.appendChild(el(dom, 'div', 'tsk-inner'))
    const bar = inner.appendChild(el(dom, 'div', 'tsk-toolbar'))
    if (!suite) {
      const lists = bar.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-icon tsk-lists-btn', null, { type: 'button', 'aria-label': app.navOpen ? 'Hide lists' : 'Show lists', 'aria-expanded': String(app.navOpen) }))
      lists.appendChild(icon(dom, 'menu'))
      lists.addEventListener('click', () => { app.navOpen = !app.navOpen; draw() })
    }
    const titles = bar.appendChild(el(dom, 'div', 'tsk-titles'))
    const status = el(dom, 'p', 'tsk-status tsk-status-line' + (app.message.kind ? ' tsk-status-' + app.message.kind : ''), app.message.text, { role: 'status' })
    lines.clear()
    lines.add(status)
    const list = app.current
    if (!list) {
      titles.appendChild(el(dom, 'h2', 'tsk-heading tsk-list-title', 'Tasks'))
      inner.appendChild(status)
      if (app.loading) { inner.appendChild(el(dom, 'p', 'tsk-muted', 'Reading the lists…')); return }
      let action = null
      if (app.homeWritable) {
        action = el(dom, 'button', 'tsk-btn tsk-btn-primary', 'New list', { type: 'button' })
        action.addEventListener('click', () => {
          app.navOpen = true
          draw()
          const nav = suite ? [...app.navs].find(n => n.isConnected) : ownNav
          const b = nav && nav.querySelector('.tsk-new-list')
          if (b) b.click()
        })
      }
      inner.appendChild(emptyState('list', 'No task lists here yet', app.homeWritable ? 'Make a list to start adding tasks.' : (me() ? 'There are no task lists in this folder.' : 'There are no task lists in this folder, or you need to log in to see them.'), action))
      return
    }
    const q = app.query
    const tasks = readTasks(store, list).filter(t => !q || (t.title + ' ' + t.notes).toLowerCase().includes(q))
    const { open, done } = sortTasks(tasks)
    const writable = canWriteTasks(list)
    titles.appendChild(el(dom, 'h2', 'tsk-heading tsk-list-title', list.title))
    titles.appendChild(el(dom, 'p', 'tsk-muted tsk-small tsk-list-meta', (q ? 'Matching “' + q + '”: ' : '') + open.length + ' to do' + (done.length ? ' · ' + done.length + ' done' : '')))
    if (!suite) { // in the shell, its own (i) button shows the list's details
      const info = bar.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-icon tsk-list-info', null, { type: 'button', 'aria-label': 'About this list', title: 'About this list' }))
      info.appendChild(icon(dom, 'info'))
      info.addEventListener('click', () => { app.selected = list.node; app.details = null; drawOwnDetails(); drawContent() })
    }
    inner.appendChild(status)
    if (writable) {
      const form = inner.appendChild(el(dom, 'form', 'tsk-add'))
      const input = form.appendChild(el(dom, 'input', 'tsk-input tsk-add-input', null, { type: 'text', maxlength: '300', placeholder: 'Add a task to “' + list.title + '”…', 'aria-label': 'New task' }))
      const add = form.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-primary', null, { type: 'submit', 'aria-label': 'Add the task' }))
      add.appendChild(icon(dom, 'plus'))
      add.appendChild(el(dom, 'span', 'tsk-btn-label', 'Add'))
      if (keepFocus !== null) { input.value = keepFocus; setTimeout(() => input.focus(), 0) }
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        const text = input.value
        if (!text.trim()) { say('Type the task first.', 'error'); return }
        input.value = ''
        addTask(text)
      })
    }
    const ul = inner.appendChild(el(dom, 'ul', 'tsk-list tsk-open-list', null, { 'aria-label': 'To do' }))
    for (const t of open) ul.appendChild(taskRow(t, writable))
    if (!open.length && q) {
      if (!done.length) inner.appendChild(emptyState('list', 'No tasks match', 'Nothing in “' + list.title + '” matches “' + q + '”.'))
    } else if (!open.length) {
      inner.appendChild(emptyState('done', done.length ? 'All done' : 'No tasks yet', done.length ? 'Every task in this list is ticked off.' : writable ? 'Add the first one above.' : 'Nothing has been added to this list.'))
    }
    if (done.length) {
      const more = inner.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-tertiary tsk-more', null, { type: 'button', 'aria-expanded': String(app.showDone) }))
      more.appendChild(icon(dom, 'chevron'))
      more.appendChild(el(dom, 'span', '', done.length === 1 ? '1 completed task' : done.length + ' completed tasks'))
      more.addEventListener('click', () => { app.showDone = !app.showDone; drawContent() })
      if (app.showDone) {
        const dl = inner.appendChild(el(dom, 'ul', 'tsk-list tsk-done-list', null, { 'aria-label': 'Completed' }))
        for (const t of done) dl.appendChild(taskRow(t, writable))
      }
    }
  }

  // The details of one task (or of the list), as a column. Fields save when they change.
  function buildDetails (node) {
    const box = el(dom, suite ? 'div' : 'aside', suite ? 'tsk tsk-root tsk-shell-details' : 'tsk-details', null, { 'aria-label': 'Details' })
    const list = app.current
    if (!list) return null
    const isList = node.value === list.node.value
    const head = box.appendChild(el(dom, 'div', 'tsk-details-head'))
    head.appendChild(el(dom, 'span', 'tsk-details-figure')).appendChild(icon(dom, isList ? 'list' : 'done'))
    const titles = head.appendChild(el(dom, 'div', 'tsk-details-titles'))
    const heading = titles.appendChild(el(dom, 'h2', 'tsk-details-title'))
    const sub = titles.appendChild(el(dom, 'p', 'tsk-details-sub'))
    if (!suite) {
      const close = head.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-icon tsk-details-close', null, { type: 'button', 'aria-label': 'Close details', title: 'Close' }))
      close.appendChild(icon(dom, 'close'))
      close.addEventListener('click', () => closeDetails())
    }
    const body = box.appendChild(el(dom, 'div', 'tsk-details-body'))
    let field = (label, control) => { const f = body.appendChild(el(dom, 'label', 'tsk-field')); f.appendChild(el(dom, 'span', 'tsk-label', label)); f.appendChild(control); return f }

    if (isList) {
      const writable = canWrite(node.doc())
      heading.textContent = list.title
      sub.textContent = 'Task list'
      const updates = []
      if (writable || (me() && !app.access.has(node.doc().value))) {
        const name = el(dom, 'input', 'tsk-input tsk-list-name', null, { type: 'text', maxlength: '80' })
        name.value = list.title
        field('Name', name)
        name.addEventListener('change', () => { if (name.value.trim() !== list.title) renameList(list, name.value) })
        updates.push(() => { if (dom.activeElement !== name) name.value = list.title; heading.textContent = list.title })
      }
      const facts = body.appendChild(el(dom, 'div', 'tsk-meta tsk-small tsk-muted'))
      const fill = () => {
        const t = readTasks(store, list)
        facts.replaceChildren()
        facts.appendChild(el(dom, 'span', '', t.filter(x => !x.done).length + ' to do · ' + t.filter(x => x.done).length + ' done'))
        const author = store.any(node, sym(DC + 'author'))
        const created = whenOf(textOf(store.any(node, sym(DC + 'created')) || store.any(node, sym(DCT + 'created'))))
        if (author || created) facts.appendChild(el(dom, 'span', '', 'Made' + (author ? ' by ' + personName(store, author) : '') + (created ? ' on ' + longDate(created) : '')))
        if (/^https?:\/\//i.test(node.value)) { // the folder the list lives in; only ever an http(s) link
          const where = facts.appendChild(el(dom, 'a', '', folderOf(node.value)))
          where.href = folderOf(node.value)
          where.rel = 'noopener'
        }
      }
      fill()
      updates.push(fill)
      app.details = { node, update: () => updates.forEach(u => u()) }
      return box
    }

    const find = () => readTasks(store, list).find(t => t.node.value === node.value) || null
    let task = find()
    if (!task) { body.appendChild(el(dom, 'p', 'tsk-muted', 'This task is not in the list any more.')); heading.textContent = 'Task'; app.details = { node, update () {} }; return box }
    const writable = canWriteTasks(list)
    const updates = []
    heading.textContent = task.title || '(untitled)'
    sub.textContent = list.title
    updates.push(() => { heading.textContent = task.title || '(untitled)' })

    // Done
    const doneRow = body.appendChild(el(dom, 'div', 'tsk-details-done tsk-pri-' + priorityKey(task.priority)))
    const check = doneRow.appendChild(el(dom, 'button', 'tsk-check tsk-details-check', null, { type: 'button', role: 'checkbox' }))
    check.appendChild(el(dom, 'span', 'tsk-box')).appendChild(icon(dom, 'check'))
    const checkText = check.appendChild(el(dom, 'span', ''))
    if (!writable) check.disabled = true
    check.addEventListener('click', () => setDone(node, !task.done)) // queued behind any save in progress
    updates.push(() => { check.setAttribute('aria-checked', String(task.done)); checkText.textContent = task.done ? 'Done' : 'Mark as done'; doneRow.className = 'tsk-details-done tsk-pri-' + priorityKey(task.priority) })

    if (writable) {
      // Each control remembers the value it showed when the person started (base). A save carries it, so an edit
      // from a view opened before someone else's change is refused rather than overwriting it. Text that was not
      // saved (refused, a 412, any error) stays in the box, with what is on the pod now and Save again / Discard.
      const bind = (control, fieldName, label) => {
        const key = node.value + ' ' + fieldName
        let base = fieldOf(task, fieldName)
        const wrap = field(label, control)
        const note = wrap.appendChild(el(dom, 'span', 'tsk-hint tsk-unsaved'))
        note.hidden = true
        const noteText = note.appendChild(el(dom, 'span', ''))
        const again = note.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-tertiary tsk-save-again', 'Save again', { type: 'button' }))
        const discard = note.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-tertiary tsk-discard', 'Discard', { type: 'button' }))
        const valueOf = () => fieldName === 'title' ? control.value.trim() : control.value
        const shown = (t) => { const v = fieldOf(t, fieldName); return fieldName === 'priority' ? PRIORITIES.find(p => p.key === v).label : fieldName === 'due' ? (v ? longDate(whenOf(v)) : 'none') : (v || 'empty') }
        async function save (force) {
          const value = valueOf()
          if (fieldName === 'title' && !value) { control.value = task.title; say('A task needs a title.', 'error'); return }
          if (!force && value === base && !app.unsaved.has(key)) return
          app.unsaved.set(key, control.value)
          const write = fieldName === 'priority' ? PRIORITIES.find(p => p.key === value).value : value
          const outcome = await setField(node, fieldName, write, base)
          const now = fieldOf(find(), fieldName)
          if (outcome === 'ok') { app.unsaved.delete(key); base = now }
          else if (outcome === 'refused' && now !== undefined) base = now // they have now seen theirs: Save again replaces it
          if (app.details) app.details.update()
        }
        control.addEventListener('change', () => save(false))
        again.addEventListener('click', () => save(true))
        discard.addEventListener('click', () => { app.unsaved.delete(key); base = fieldOf(task, fieldName); control.value = base; if (app.details) app.details.update() })
        updates.push(() => {
          const pod = fieldOf(task, fieldName)
          if (app.unsaved.has(key)) {
            if (dom.activeElement !== control) control.value = app.unsaved.get(key)
            note.hidden = false
            noteText.textContent = 'Not saved yet.' + (pod !== base || pod !== valueOf() ? ' On the pod now: ' + String(shown(task)).slice(0, 200) : '')
          } else {
            note.hidden = true
            if (dom.activeElement !== control) { control.value = pod; base = pod }
          }
        })
      }
      bind(el(dom, 'input', 'tsk-input tsk-details-title-input tsk-edit-title', null, { type: 'text', maxlength: '300' }), 'title', 'Title')
      const pair = body.appendChild(el(dom, 'div', 'tsk-pair'))
      const fieldBefore = field
      field = (label, control) => { const f = pair.appendChild(el(dom, 'label', 'tsk-field')); f.appendChild(el(dom, 'span', 'tsk-label', label)); f.appendChild(control); return f }
      bind(el(dom, 'input', 'tsk-input tsk-edit-due', null, { type: 'date' }), 'due', 'Due')
      const pri = el(dom, 'select', 'tsk-input tsk-edit-priority')
      for (const p of PRIORITIES) { const o = pri.appendChild(el(dom, 'option', '', p.label)); o.value = p.key }
      bind(pri, 'priority', 'Priority')
      field = fieldBefore
      bind(el(dom, 'textarea', 'tsk-input tsk-edit-notes', null, { maxlength: '5000', rows: '6', placeholder: 'Add notes' }), 'notes', 'Notes')
    } else {
      const show = (label, cls, value) => { const f = body.appendChild(el(dom, 'div', 'tsk-field')); f.appendChild(el(dom, 'span', 'tsk-label', label)); return f.appendChild(el(dom, 'div', 'tsk-value ' + cls, value)) }
      const pair = body.appendChild(el(dom, 'div', 'tsk-pair'))
      body.insertBefore(pair, null)
      const dueV = show('Due', 'tsk-show-due', '')
      const priV = show('Priority', 'tsk-show-priority', '')
      pair.appendChild(dueV.parentNode)
      pair.appendChild(priV.parentNode)
      const notesV = show('Notes', 'tsk-value-notes tsk-show-notes', '')
      updates.push(() => {
        const d = whenOf(task.due)
        dueV.textContent = d ? longDate(d) : 'None'
        priV.textContent = PRIORITIES.find(p => p.key === priorityKey(task.priority)).label
        notesV.textContent = task.notes || 'None'
      })
    }

    const meta = body.appendChild(el(dom, 'div', 'tsk-meta tsk-small tsk-muted tsk-task-meta'))
    updates.push(() => {
      meta.replaceChildren()
      const created = whenOf(task.created)
      if (task.author || created) meta.appendChild(el(dom, 'span', '', 'Added' + (task.author ? ' by ' + personName(store, task.author) : '') + (created ? ' on ' + longDate(created) : '')))
      const completed = whenOf(task.completed)
      if (task.done) meta.appendChild(el(dom, 'span', '', 'Done' + (completed ? ' on ' + longDate(completed) : '')))
    })

    if (writable) {
      const remove = body.appendChild(el(dom, 'button', 'tsk-btn tsk-btn-tertiary tsk-delete', null, { type: 'button' }))
      remove.appendChild(icon(dom, 'delete'))
      const removeText = remove.appendChild(el(dom, 'span', '', 'Delete task'))
      let armed = false
      let timer = null
      const disarm = () => { armed = false; clearTimeout(timer); removeText.textContent = 'Delete task'; remove.classList.remove('tsk-btn-danger'); remove.classList.add('tsk-btn-tertiary') }
      remove.addEventListener('click', () => {
        if (!armed) { armed = true; removeText.textContent = 'Press again to delete'; remove.classList.add('tsk-btn-danger'); remove.classList.remove('tsk-btn-tertiary'); timer = setTimeout(disarm, 4000); return }
        disarm()
        deleteTask(node)
      })
      remove.addEventListener('blur', () => { if (armed) disarm() })
    }
    app.details = { node, update: () => { task = find() || task; updates.forEach(u => u()) } }
    app.details.update()
    return box
  }

  function drawOwnDetails () {
    if (suite || !frame) return
    if (!app.selected) {
      if (ownDetails) ownDetails.remove()
      ownDetails = null
      frame.classList.remove('tsk-with-details')
      return
    }
    if (ownDetails && app.details && app.details.node.value === app.selected.value) { app.details.update(); return }
    const fresh = buildDetails(app.selected)
    if (ownDetails) ownDetails.remove()
    ownDetails = fresh
    if (fresh) { frame.appendChild(fresh); frame.classList.add('tsk-with-details') } else frame.classList.remove('tsk-with-details')
  }

  function draw () {
    for (const nav of [...app.navs]) { if (suite && !nav.isConnected && nav !== ownNav) { app.navs.delete(nav); continue } navInto(nav) }
    if (frame) frame.classList.toggle('tsk-nav-open', app.navOpen)
    drawContent()
    if (app.details) {
      if (app.selected || suite) app.details.update()
    }
    drawOwnDetails()
  }

  app.render = function () {
    const root = el(dom, 'div', 'tsk tsk-root suite-tasks-pane')
    root.appendChild(el(dom, 'style', '', CSS))
    contentRoot = el(dom, 'section', 'tsk-main', null, { 'aria-label': 'Tasks' })
    if (suite) {
      root.appendChild(contentRoot)
    } else {
      frame = root.appendChild(el(dom, 'div', 'tsk-app'))
      // On a narrow screen the lists are a drawer: a click outside it, or Escape, closes it.
      frame.addEventListener('click', (event) => { if (app.navOpen && ownNav && !ownNav.contains(event.target) && !event.target.closest('.tsk-lists-btn')) { app.navOpen = false; frame.classList.remove('tsk-nav-open'); drawContent() } })
      frame.addEventListener('keydown', (event) => { if (event.key === 'Escape' && app.navOpen) { app.navOpen = false; frame.classList.remove('tsk-nav-open'); drawContent() } })
      ownNav = buildNav()
      frame.appendChild(ownNav)
      frame.appendChild(contentRoot)
    }
    drawContent()
    discover()
    return root
  }
  app.buildNav = buildNav
  app.query = ''
  app.search = (query) => { app.query = String(query || '').trim().toLowerCase(); drawContent() }
  app.buildDetails = (node) => {
    if (!app.current) return null
    if (node.value !== app.current.node.value && !readTasks(store, app.current).some(t => t.node.value === node.value)) {
      // The shell's own details button passes the subject: show the list.
      node = app.current.node
    }
    const box = buildDetails(node)
    return box
  }
  return app
}

const pane = {
  name: 'suite-tasks',
  icon: svgUri(MDI.list, '#00679e'),
  audience: [],

  label (subject, context) {
    try {
      const store = storeOf(context)
      if (isTaskList(store, subject)) return 'Tasks'
      if (isTask(store, subject)) return 'Task'
      if (isTaskHome(store, subject)) return 'Tasks'
    } catch { /* not ours */ }
    return null
  },

  shouldGetFocus (subject) {
    try {
      const store = storeOf()
      return isTaskList(store, subject) || isTask(store, subject) || isTaskHome(store, subject)
    } catch { return false }
  },

  render (subject, context) {
    return appFor(subject, context).render()
  },

  // The suite shell: the lists, for its left column.
  renderNavigation (subject, context) {
    return appFor(subject, context).buildNav()
  },

  // The suite shell: its search box filters the tasks of the open list by title and notes.
  search (query, context) {
    const suite = suiteOf(context)
    const app = suite && suite.state && suite.state.tasks
    if (app) app.search(query)
  },

  // The suite shell: a task's details (or the list's), for its right column.
  renderDetails (node, context) {
    return appFor(context.suite ? context.suite.subject : node, context).buildDetails(node)
  }
}

export default pane
