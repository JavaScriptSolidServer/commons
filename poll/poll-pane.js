// poll-pane.js: find a time for a call or a meeting, with a poll kept in a pod.
// Offer hours on one or more days; people say which they can make. Other things can be voted on too.
//
// One file, no imports. It reads and writes the format of SolidOS's own scheduling pane
// (http://www.w3.org/ns/pim/schedule#), so a poll made there opens here and the other way round:
//
//   index.ttl     <#this> a sched:SchedulableEvent ; cal:summary "Dinner" ; dc:author <WebID> ;
//                     sched:option <#o1>, <#o2> ; sched:results <results.ttl> .
//                 <#o1> cal:dtstart "2026-12-04T14:00:00Z"^^xsd:dateTime ;    (an hour: an exact moment,
//                       cal:dtend "2026-12-04T15:00:00Z"^^xsd:dateTime .       shown in each person's own time zone)
//                 <#o2> rdfs:label "The Thai place" .                         (anything else)
//
//   results.ttl   <index.ttl#this> sched:response <#r1> .
//                 <#r1> dc:author <WebID> ; sched:cell <#r1-o1> .
//                 <#r1-o1> sched:option <index.ttl#o1> ; cal:dtstart "…" ; sched:availabilty sched:Yes .
//
// ("availabilty" is the spelling the vocabulary uses.) An answer is matched to its option by the
// sched:option link, or by the same cal:dtstart, which is all SolidOS's pane writes.
//
// What this pane writes, and when:
// - "New Poll" in a folder's Add menu, or "Add poll" in the suite's left column (beside the poll on show):
//   the two files above and an access rule for each, so that anyone with the link can see the poll and
//   anyone logged in can answer.
// - The person who made the poll: its title, notes and options, in index.ttl (read fresh, written back whole).
// - Anyone logged in, on pressing an answer: their own answer, in results.ttl.
//
// Inside the suite shell (context.suite) it also gives the left column (renderNavigation: the poll, "Add poll")
// and the right column (renderDetails: about, configuration, participants). Alone, everything is in the content.
// Styled with the suite's design sheet (design/DESIGN.md). Icons: Material Design Icons (Apache 2.0).

const SCHED = 'http://www.w3.org/ns/pim/schedule#'
const CAL = 'http://www.w3.org/2002/12/cal/ical#'
const DC = 'http://purl.org/dc/elements/1.1/'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'
const VCARD_FN = 'http://www.w3.org/2006/vcard/ns#fn'
const ACL = 'http://www.w3.org/ns/auth/acl#'
const ANSWERS = [['Yes', 'Yes'], ['Maybe', 'If need be'], ['No', 'No']]

// Material Design Icons (pictogrammers.com, Apache 2.0), paths in a 24 x 24 box.
const MDI = {
  poll: 'M3,22V8H7V22H3M10,22V2H14V22H10M17,22V14H21V22H17Z',
  plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  Yes: 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z',
  Maybe: 'M10,19H13V22H10V19M12,2C17.35,2.22 19.68,7.62 16.5,11.67C15.67,12.67 14.33,13.33 13.67,14.17C13,15 13,16 13,17H10C10,15.33 10,13.92 10.67,12.92C11.33,11.92 12.67,11.33 13.5,10.67C15.92,8.43 15.32,5.26 12,5A3,3 0 0,0 9,8H6A6,6 0 0,1 12,2Z',
  No: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  remove: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  place: 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z',
  clock: 'M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z',
  refresh: 'M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z',
  people: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)

const CSS = `
/* suite:design begin --prefix pol --only icon,nav,row,buttons,input,chip,avatar,empty,toast,details */
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
.pol-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.pol-root *, .pol-root *::before, .pol-root *::after { box-sizing: border-box }
.pol-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.pol-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.pol-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.pol-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.pol-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.pol-root [hidden] { display: none !important }
.pol-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.pol-muted { color: var(--sui-text-muted) }
.pol-small { font-size: var(--sui-text-sm) }
.pol-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.pol-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.pol-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.pol-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.pol-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.pol-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --pol-i set to url("data:image/svg+xml,...") ---------------------------------- */
.pol-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--pol-i) center / contain no-repeat; mask: var(--pol-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.pol-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.pol-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.pol-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.pol-nav-item:hover { background: var(--sui-bg-hover) }
.pol-nav-item[aria-current="page"], .pol-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.pol-nav-item .pol-icon { color: var(--sui-text-muted) }
.pol-nav-item[aria-current] .pol-icon { color: inherit }
.pol-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.pol-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.pol-nav-new { margin-bottom: var(--sui-space-2) }
.pol-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.pol-list { margin: 0; padding: 0; list-style: none }
.pol-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.pol-row:hover { background: var(--sui-bg-hover) }
.pol-row[aria-selected="true"], .pol-row[aria-current="true"] { background: var(--sui-primary-light) }
.pol-row-main { flex: 1 1 auto; min-width: 0 }
.pol-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.pol-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.pol-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.pol-row-actions { flex: none; display: flex; align-items: center }
.pol-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.pol-row-icon .pol-icon { width: 28px; height: 28px }
.pol-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .pol-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.pol-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.pol-btn:hover { background: var(--sui-primary-light-hover) }
.pol-btn:disabled, .pol-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.pol-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.pol-btn-primary:hover { background: var(--sui-primary-element-hover) }
.pol-btn-tertiary { background: transparent; color: var(--sui-text) }
.pol-btn-tertiary:hover { background: var(--sui-bg-hover) }
.pol-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.pol-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.pol-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.pol-btn-icon:hover { background: var(--sui-bg-hover) }
.pol-btn-wide { width: 100%; justify-content: flex-start }
.pol-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.pol-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.pol-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.pol-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.pol-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.pol-input:hover { border-color: var(--sui-primary-element) }
.pol-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.pol-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.pol-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.pol-search { position: relative; display: flex; align-items: center; min-width: 0 }
.pol-search .pol-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.pol-search .pol-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.pol-select { position: relative; display: block; min-width: 0 }
.pol-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.pol-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.pol-file { position: relative; overflow: hidden }
.pol-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.pol-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .pol-row-check */
.pol-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.pol-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.pol-check-round { border-radius: 50% }
.pol-check:hover { border-color: var(--sui-primary-element) }
.pol-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.pol-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.pol-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.pol-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.pol-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.pol-segment:hover { background: var(--sui-bg-hover) }
.pol-segment[aria-pressed="true"], .pol-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.pol-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.pol-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.pol-chip { cursor: pointer }
button.pol-chip:hover { background: var(--sui-primary-light-hover) }
.pol-chip-primary, .pol-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.pol-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.pol-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.pol-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- avatar: a span with initials, or an <img class="ui-avatar"> -------------------------------------------- */
.pol-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar); height: var(--sui-avatar); border-radius: 50%; overflow: hidden; background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); line-height: 1; object-fit: cover; text-transform: uppercase; user-select: none }
.pol-avatar-lg { width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); font-size: var(--sui-text-xl) }
.pol-avatar-xl { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.pol-header .pol-avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.pol-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.pol-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.pol-empty-icon .pol-icon { width: 48px; height: 48px }
.pol-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.pol-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.pol-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.pol-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.pol-toast-error { border-left-color: var(--sui-error) }
.pol-toast-success { border-left-color: var(--sui-success) }
.pol-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.pol-status-error { color: var(--sui-error) }
.pol-status-success { color: var(--sui-success) }
.pol-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.pol-note-error { background: var(--sui-error-light) }
.pol-note-warning { background: var(--sui-warning-light) }
.pol-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.pol-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.pol-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.pol-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.pol-details-figure .pol-icon { width: 36px; height: 36px }
.pol-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.pol-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.pol-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.pol-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.pol-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.pol-tab:hover { color: var(--sui-text) }
.pol-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.pol-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.pol-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.pol-props dt { color: var(--sui-text-muted) }
.pol-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.pol.poll-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8); container-type: inline-size }
.pol-top { display: flex; flex-direction: column; gap: var(--sui-space-1); padding: 0 var(--sui-space-2) }
.pol-title { overflow-wrap: anywhere }
.pol-meta { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
.pol-where { display: flex; align-items: center; gap: var(--sui-space-1) }
.pol-where .pol-icon { width: var(--sui-space-4); height: var(--sui-space-4) }
.pol-notes { margin: var(--sui-space-2) 0 0; white-space: pre-wrap; overflow-wrap: anywhere }
.pol .pol-status { width: auto; margin: var(--sui-space-2) var(--sui-space-2) 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none } /* the data browser styles every [role=status] as a green box */
.pol .pol-status.pol-info { padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) } /* a note: it stays true */
.pol-status:empty { display: none }
.pol-zone { display: flex; align-items: center; gap: var(--sui-space-2); margin: var(--sui-space-3) var(--sui-space-2) 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.pol-zone .pol-icon { width: var(--sui-space-4); height: var(--sui-space-4) }
.pol-list.pol-options { margin: var(--sui-space-4) 0 0; border-top: 1px solid var(--sui-border) }
.pol-day { padding: var(--sui-space-4) var(--sui-space-3) var(--sui-space-1); color: var(--sui-primary-element); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold) }
.pol-option { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--sui-space-4); row-gap: var(--sui-space-1); align-items: center; padding: var(--sui-space-3); border-bottom: 1px solid var(--sui-border) }
.pol-option:hover { background: var(--sui-bg-hover) }
.pol-option.pol-lead { box-shadow: inset 3px 0 0 var(--sui-success) }
.pol-option > :not(.pol-choose) { grid-column: 1 }
.pol-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-1) var(--sui-space-2); min-width: 0 }
.pol-name { min-width: 0; font-weight: var(--sui-weight-bold); overflow-wrap: anywhere }
.pol-count { color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.pol-bar { display: flex; height: var(--sui-space-1); max-width: 360px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow: hidden }
.pol-bar span { display: block; height: 100% }
.pol-bar .pol-yes { background: var(--sui-success) }
.pol-bar .pol-maybe { background: var(--sui-warning) }
.pol-who { padding-top: var(--sui-space-1) }
.pol-who .pol-chip { white-space: normal; overflow-wrap: anywhere; text-overflow: clip } /* a long name wraps, never cut off */
.pol-who:empty { display: none }
.pol-choose { grid-column: 2; grid-row: 1 / span 4; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--sui-space-2) }
.pol-choose .pol-btn { border: 1px solid var(--sui-border-strong); background: var(--sui-bg); color: var(--sui-text); font-weight: var(--sui-weight) }
.pol-choose .pol-btn:hover { background: var(--sui-bg-hover) }
.pol-choose .pol-btn .pol-icon { width: var(--sui-space-4); height: var(--sui-space-4) }
.pol-choose .pol-btn.pol-on-Yes { border-color: var(--sui-success); background: var(--sui-success-light); color: var(--sui-success); font-weight: var(--sui-weight-bold) }
.pol-choose .pol-btn.pol-on-Maybe { border-color: var(--sui-warning); background: var(--sui-warning-light); color: var(--sui-warning); font-weight: var(--sui-weight-bold) }
.pol-choose .pol-btn.pol-on-No { border-color: var(--sui-error); background: var(--sui-error-light); color: var(--sui-error); font-weight: var(--sui-weight-bold) }
.pol-choose .pol-btn.pol-quiet { border-color: transparent; background: transparent; color: var(--sui-error) }
.pol-choose .pol-btn.pol-quiet.pol-armed { background: var(--sui-error); color: var(--sui-primary-text) }
@container (max-width: 640px) {
  .pol-option { grid-template-columns: minmax(0, 1fr) }
  .pol-choose { grid-column: 1; grid-row: auto; justify-content: flex-start; padding-top: var(--sui-space-2) }
}
.pol-add, .pol-other { display: flex; flex-direction: column; gap: var(--sui-space-2) }
.pol-box { display: flex; flex-direction: column; gap: var(--sui-space-2); margin-top: var(--sui-space-6); padding: var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-bg-app) }
.pol-fields { display: flex; flex-wrap: wrap; gap: var(--sui-space-3); align-items: flex-end }
.pol-fields > .pol-field { flex: 1 1 200px }
.pol-fields > .pol-field.pol-narrow { flex: 0 1 120px }
.pol-fields > .pol-field.pol-whole { flex-basis: 100% }
.pol-hint { margin: 0 }
.pol-more summary { display: flex; align-items: center; min-height: var(--sui-target); color: var(--sui-primary-element); font-weight: var(--sui-weight-bold); cursor: pointer }
.pol-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2); margin-top: var(--sui-space-6); padding: 0 var(--sui-space-2) }
.pol-link { flex: 1 1 260px; color: var(--sui-text-muted) }
.pol-side .pol-details-body { padding-bottom: var(--sui-space-6) }
.pol-side .pol-props dd { overflow-wrap: anywhere }
.pol-side .pol-box { margin-top: 0 }
.pol-side .pol-list .pol-row { cursor: default }
.pol-side .pol-list .pol-row:hover { background: transparent }
.pol-nav-new { margin-bottom: var(--sui-space-2) }
`

function el (dom, tag, className, text, attrs) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = text
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}
function icon (dom, path) {
  const span = el(dom, 'span', 'pol-icon', null, { 'aria-hidden': 'true' })
  span.style.setProperty('--pol-i', `url("${svg(path)}")`)
  return span
}
const initials = (name) => (name || '?').split(/[\s@./]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const suiteOf = (context) => context && context.suite && context.suite.version >= 1 ? context.suite : null

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

function isPoll (store, subject) {
  const sym = store.sym.bind(store)
  return store.holds(subject, sym(RDF_TYPE), sym(SCHED + 'SchedulableEvent')) || !!store.any(subject, sym(SCHED + 'option'))
}

// A time as people read it, or the text of the option.
function optionLabel (store, option, doc) {
  const sym = store.sym.bind(store)
  const text = store.any(option, sym(RDFS_LABEL), null, doc)
  if (text) return text.value
  const when = store.any(option, sym(CAL + 'dtstart'), null, doc)
  if (!when) return option.value.split('#').pop()
  const end = store.any(option, sym(CAL + 'dtend'), null, doc)
  return timeLabel(when.value, end ? end.value : '')
}

const dateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const moment = (value) => new Date(dateOnly(value) ? value + 'T12:00:00' : value)
const clock = (date) => date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
// The day a time falls on, for the person looking: "Fri 4 Dec 2026".
function dayLabel (value) {
  const date = moment(value)
  return isNaN(date) ? '' : date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
// The time itself, in the viewer's own time zone: "14:00 to 15:00", or "14:00", or "All day".
function hourLabel (value, end) {
  const date = moment(value)
  if (isNaN(date)) return value
  if (dateOnly(value)) return 'All day'
  const until = end ? moment(end) : null
  return clock(date) + (until && !isNaN(until) ? ' to ' + clock(until) : '')
}
function timeLabel (value, end) {
  const day = dayLabel(value)
  return day ? day + ', ' + hourLabel(value, end) : value
}

// A person's name, from their own profile document only, or from the poll's own file (which only its maker can
// write). Never from the answers file: anyone logged in can write there, and could name the maker "Mallory".
function trustedName (store, person, pollDoc) {
  if (!person || person.termType !== 'NamedNode') return null
  const sym = store.sym.bind(store)
  for (const where of [person.doc(), pollDoc].filter(Boolean)) {
    const name = store.any(person, sym(FOAF_NAME), null, where) || store.any(person, sym(VCARD_FN), null, where)
    if (name) return name.value
  }
  return null
}
function personName (store, person, pollDoc) {
  const name = trustedName(store, person, pollDoc)
  if (name) return name
  try { const url = new URL(person.value); return url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 && !/^\/(profile\/card(\.jsonld)?)?$/.test(url.pathname) ? url.pathname : '') } catch { return person.value }
}

// The poll as plain data: its options, and for each one who answered what.
function readPoll (store, subject, resultsDoc) {
  const sym = store.sym.bind(store)
  const doc = subject.doc()
  const options = store.each(subject, sym(SCHED + 'option'), null, doc).map(node => {
    const when = store.any(node, sym(CAL + 'dtstart'), null, doc)
    const end = store.any(node, sym(CAL + 'dtend'), null, doc)
    const text = store.any(node, sym(RDFS_LABEL), null, doc)
    const timed = !!when && !isNaN(moment(when.value))
    return {
      node,
      when: when ? when.value : '',
      at: timed ? moment(when.value).getTime() : null,
      day: timed ? dayLabel(when.value) : '',
      short: timed ? hourLabel(when.value, end ? end.value : '') + (text ? ' · ' + text.value : '') : '',
      label: optionLabel(store, node, doc),
      answers: []
    }
  })
  options.sort((a, b) => (a.at !== null && b.at !== null) ? a.at - b.at : (a.at !== null ? -1 : b.at !== null ? 1 : a.node.value.localeCompare(b.node.value, undefined, { numeric: true })))
  const byNode = new Map(options.map(o => [o.node.value, o]))
  const byTime = new Map(options.filter(o => o.when).map(o => [o.when, o]))
  const people = new Map()
  for (const response of store.each(subject, sym(SCHED + 'response'), null, resultsDoc)) {
    const author = store.any(response, sym(DC + 'author'), null, resultsDoc)
    if (!author) continue
    for (const cell of store.each(response, sym(SCHED + 'cell'), null, resultsDoc)) {
      const value = store.any(cell, sym(SCHED + 'availabilty'), null, resultsDoc)
      if (!value) continue
      const linked = store.any(cell, sym(SCHED + 'option'), null, resultsDoc)
      const when = store.any(cell, sym(CAL + 'dtstart'), null, resultsDoc)
      const option = (linked && byNode.get(linked.value)) || (when && byTime.get(when.value))
      if (!option) continue
      const answer = value.value.slice(SCHED.length)
      if (!ANSWERS.some(a => a[0] === answer)) continue
      people.set(author.value, author) // only people with an answer on a choice still offered
      const earlier = option.answers.find(a => a.who.value === author.value)
      if (earlier) earlier.answer = answer; else option.answers.push({ who: author, answer, response, cell })
    }
  }
  return { options, people: [...people.values()] }
}

// Where a resource's access rule lives: the server says in a Link header; else beside it.
async function aclAddress (fetcher, address) {
  try {
    const response = await fetcher(address, { method: 'HEAD' })
    const link = (response.headers.get('link') || '').split(',').map(part => part.match(/<([^>]+)>\s*;\s*rel="?acl"?/)).find(Boolean)
    if (link) return new URL(link[1], address).href
  } catch { /* fall through */ }
  return address + '.acl'
}

// An access rule for one file: its maker has full control; `others` (an agent class) gets `modes`.
async function putAcl (fetcher, address, me, others, modes) {
  const target = await aclAddress(fetcher, address)
  const turtle = `@prefix acl: <${ACL}>.\n@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n` +
    `<#owner> a acl:Authorization; acl:agent <${me}>; acl:accessTo <${address}>; acl:mode acl:Read, acl:Write, acl:Control.\n` +
    `<#others> a acl:Authorization; acl:agentClass ${others}; acl:accessTo <${address}>; acl:mode ${modes.map(m => 'acl:' + m).join(', ')}.\n`
  let response = await fetcher(target, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: turtle })
  if (response.status === 415) {
    const jsonld = JSON.stringify({
      '@context': { acl: ACL, foaf: 'http://xmlns.com/foaf/0.1/' },
      '@graph': [
        { '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': me }, 'acl:accessTo': { '@id': address }, 'acl:mode': ['Read', 'Write', 'Control'].map(m => ({ '@id': 'acl:' + m })) },
        { '@id': '#others', '@type': 'acl:Authorization', 'acl:agentClass': { '@id': others }, 'acl:accessTo': { '@id': address }, 'acl:mode': modes.map(m => ({ '@id': 'acl:' + m })) }
      ]
    }, null, 2)
    response = await fetcher(target, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, body: jsonld })
  }
  if (!response.ok) throw new Error('the access rule for ' + address.split('/').pop() + ' was refused (' + response.status + ')')
}

const turtleText = (text) => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'

// ---- one poll on show: what render, renderNavigation and renderDetails share. In the shell it lives on
// context.suite.state (new for each showing); alone, render makes its own.
function appFor (subject, context) {
  const suite = suiteOf(context)
  if (!suite) return makeApp(subject, context, null)
  const state = suite.state || (suite.state = {})
  if (!state.poll) state.poll = makeApp(suite.subject || subject, context, suite)
  return state.poll
}

function makeApp (subject, context, suite) {
  const dom = context.dom
  const store = context.session.store
  const sym = store.sym.bind(store)
  const doc = subject.doc()
  const linked = store.any(subject, sym(SCHED + 'results'), null, doc) || store.any(subject, sym(SCHED + 'resultsDocument'), null, doc)
  const resultsDoc = linked && linked.termType === 'NamedNode' && linked.value !== doc.value ? linked.doc() : sym(new URL('results.ttl', doc.value).href)
  const app = {
    dom, store, sym, subject, doc, resultsDoc, suite,
    busy: false,
    resultsRead: false,
    started: false,
    tab: 'about',
    areas: {}, // the elements drawn: content, nav, details
    draws: {}, // and how to draw each again
    say: () => {}
  }
  app.me = () => currentUser(context)
  app.mine = () => { const who = app.me(); const author = store.any(subject, sym(DC + 'author'), null, doc); return !!who && !!author && author.value === who.value }
  app.literal = (value, datatype) => { const rdf = rdflib(); return datatype ? rdf.literal(value, sym(XSD + datatype)) : rdf.literal(value) }
  app.st = (s, p, o, g) => rdflib().st(s, p, o, g)
  app.zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time' } catch { return 'local time' } }
  app.text = (term) => { const value = store.any(subject, sym(CAL + term), null, doc); return value ? value.value : '' }
  app.poll = () => readPoll(store, subject, resultsDoc)
  app.name = (person) => personName(store, person, doc)
  app.byLine = () => {
    const author = store.any(subject, sym(DC + 'author'), null, doc)
    const count = app.poll().people.length
    return (author ? 'By ' + app.name(author) + ' · ' : '') + (count === 1 ? '1 person has answered' : count + ' people have answered')
  }
  app.refresh = () => { for (const [key, draw] of Object.entries(app.draws)) { const area = app.areas[key]; if (area && (area.isConnected || key === 'content')) draw() } }

  // A document as the server holds it now, put in place of what the store had for it. Returns its ETag.
  app.readFresh = async (d) => {
    const response = await webFetch(store)(d.value, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
    if (!response.ok) { const error = new Error(d.value.split('/').pop() + ' could not be read (' + response.status + ')'); error.status = response.status; throw error }
    const type = (response.headers.get('content-type') || 'text/turtle').split(';')[0].trim()
    const text = await response.text()
    const graph = rdflib().graph()
    await new Promise((resolve, reject) => { try { rdflib().parse(text, graph, d.value, type, (error) => error ? reject(error) : resolve()) } catch (error) { reject(error) } })
    store.removeMatches(null, null, null, d)
    for (const t of graph.statements) store.add(t.subject, t.predicate, t.object, d)
    return response.headers.get('etag')
  }

  // One change. The poll's own file (title, place, notes, choices: only its maker writes it) is read fresh, changed
  // and written back whole with If-Match: the test server loses text with "}" in it from a SPARQL patch (JSS
  // finding 5). The answers file (no free text in it) is patched, so two people answering at once do not clash.
  // Then every file touched is read again, and "saved" is said only if it holds exactly the change.
  app.change = async (deletions, insertions, done) => {
    if (app.busy) return false
    app.busy = true
    const focused = dom.activeElement && dom.activeElement.dataset && dom.activeElement.dataset.answer ? [dom.activeElement.dataset.option, dom.activeElement.dataset.answer] : null
    const buttons = Object.values(app.areas).filter(Boolean).flatMap(a => [...a.querySelectorAll('button')])
    for (const button of buttons) button.disabled = true // until saved (and let go after, for what is not drawn again)
    const inDoc = (list, d) => list.filter(t => t.why.value === d.value)
    const touched = [doc, resultsDoc].filter(d => inDoc(deletions, d).length || inDoc(insertions, d).length)
    let ok = false
    try {
      if (touched.includes(resultsDoc)) await store.updater.update(inDoc(deletions, resultsDoc), inDoc(insertions, resultsDoc))
      if (touched.includes(doc)) {
        const etag = await app.readFresh(doc)
        for (const t of inDoc(deletions, doc)) store.removeMatches(t.subject, t.predicate, t.object, doc)
        for (const t of inDoc(insertions, doc)) if (!store.holds(t.subject, t.predicate, t.object, doc)) store.add(t.subject, t.predicate, t.object, doc)
        const headers = { 'Content-Type': 'text/turtle' }
        if (etag) headers['If-Match'] = etag
        const response = await webFetch(store)(doc.value, { method: 'PUT', headers, body: rdflib().serialize(doc, store, doc.value, 'text/turtle') })
        if (response.status === 412) throw new Error('the poll was changed somewhere else a moment ago. It has been read again; try once more.')
        if (response.status === 401 || response.status === 403) throw new Error('you are not allowed to change this poll.')
        if (!response.ok) throw new Error('the pod refused it (' + response.status + ').')
      }
      for (const d of touched) await app.readFresh(d)
      const held = touched.length && insertions.every(t => store.holds(t.subject, t.predicate, t.object, t.why)) && !deletions.some(t => store.holds(t.subject, t.predicate, t.object, t.why))
      if (held) { ok = true; app.say(done, 'good') } else app.say('Not saved as typed: the pod stored something different. What it holds is shown.', 'bad')
    } catch (error) {
      app.say('Not saved: ' + (error && error.message ? error.message : error), 'bad')
      for (const d of touched) { try { await app.readFresh(d) } catch { /* keep what we have */ } }
    }
    app.busy = false
    for (const button of buttons) button.disabled = false
    app.refresh()
    // Keyboard focus stays on the answer just pressed (the list is drawn again).
    if (focused) {
      const again = [...((app.areas.content && app.areas.content.querySelectorAll('button[data-answer]')) || [])].find(b => b.dataset.option === focused[0] && b.dataset.answer === focused[1])
      if (again) again.focus()
    }
    return ok
  }

  app.answer = async (option, value) => {
    const who = app.me()
    if (!who) return
    const current = app.poll().options.find(o => o.node.value === option.node.value)
    const earlier = current && current.answers.find(a => a.who.value === who.value)
    const deletions = []
    const insertions = []
    const st = app.st
    let response = null
    for (const candidate of store.each(subject, sym(SCHED + 'response'), null, resultsDoc)) {
      if (store.holds(candidate, sym(DC + 'author'), who, resultsDoc)) response = candidate
    }
    if (!response) {
      response = sym(resultsDoc.value + '#r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
      insertions.push(st(subject, sym(SCHED + 'response'), response, resultsDoc), st(response, sym(DC + 'author'), who, resultsDoc))
    }
    let cell = earlier && earlier.cell
    if (cell) {
      for (const old of store.statementsMatching(cell, sym(SCHED + 'availabilty'), null, resultsDoc)) deletions.push(old)
    } else {
      cell = sym(response.value + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5))
      insertions.push(st(response, sym(SCHED + 'cell'), cell, resultsDoc), st(cell, sym(SCHED + 'option'), option.node, resultsDoc))
      const when = store.any(option.node, sym(CAL + 'dtstart'), null, doc)
      if (when) insertions.push(st(cell, sym(CAL + 'dtstart'), when, resultsDoc))
    }
    if (earlier && earlier.answer === value) return app.change(deletions, [], 'Your answer for ' + option.label + ' was cleared.')
    insertions.push(st(cell, sym(SCHED + 'availabilty'), sym(SCHED + value), resultsDoc))
    await app.change(deletions, insertions, 'Saved: ' + ANSWERS.find(a => a[0] === value)[1] + ' for ' + option.label + '.')
  }

  // Refresh (force) reads both files again: the poll itself may have new choices or a new title.
  app.load = async (force) => {
    if (force) { try { await app.readFresh(doc) } catch { /* the poll on show stays */ } }
    try {
      if (force) await app.readFresh(resultsDoc); else await store.fetcher.load(resultsDoc)
      app.resultsRead = true
    } catch (error) {
      app.resultsRead = false
      const code = error && error.status
      app.say(code === 404 ? 'This poll has no answers file yet.' : code === 401 || code === 403 ? 'You are not allowed to see the answers.' : 'The answers could not be read.', 'bad')
    }
    app.refresh()
    // People's names come from their profiles: fetched in the background, shown when they arrive.
    const poll = app.poll()
    const author = store.any(subject, sym(DC + 'author'), null, doc)
    const unnamed = [...poll.people, ...(author ? [author] : [])].filter(p => p.termType === 'NamedNode' && !trustedName(store, p, doc))
    if (unnamed.length) Promise.allSettled(unnamed.slice(0, 30).map(p => store.fetcher.load(p.doc()))).then(() => { if (!app.busy) app.refresh() })
  }

  // The maker's form for the title, place and notes. Alone it sits under the poll; in the shell, in the details.
  // It is made once and kept: a redraw only brings in the stored value for a field the person has not typed in.
  app.editForm = (primary) => {
    const edit = el(dom, 'form', 'pol-box pol-edit')
    const shown = new Map()
    edit.appendChild(el(dom, 'h3', 'pol-subheading', 'About this meeting'))
    const editFields = edit.appendChild(el(dom, 'div', 'pol-fields'))
    const field = (labelText, term, multi) => {
      const label = editFields.appendChild(el(dom, 'label', 'pol-field pol-whole'))
      label.appendChild(el(dom, 'span', 'pol-label', labelText))
      const input = label.appendChild(el(dom, multi ? 'textarea' : 'input', 'pol-input'))
      if (!multi) input.type = 'text'
      input.maxLength = multi ? 1000 : 160
      input.value = app.text(term)
      shown.set(input, input.value)
      return { term, input }
    }
    const inputs = [field('What it is for', 'summary'), field('Where, or the call link', 'location'), field('Notes', 'comment', true)]
    edit.sync = (all) => { for (const { term, input } of inputs) { if (all || input.value === shown.get(input)) { input.value = app.text(term); shown.set(input, input.value) } } }
    editFields.appendChild(el(dom, 'button', 'pol-btn' + (primary ? ' pol-btn-primary' : ''), 'Save', { type: 'submit' }))
    edit.addEventListener('submit', (event) => {
      event.preventDefault()
      const deletions = []
      const insertions = []
      for (const { term, input } of inputs) {
        const old = store.statementsMatching(subject, sym(CAL + term), null, doc)
        const value = input.value.trim()
        if (old.length === 1 && old[0].object.value === value) continue
        deletions.push(...old)
        if (value) insertions.push(app.st(subject, sym(CAL + term), app.literal(value), doc))
      }
      if (!deletions.length && !insertions.length) { app.say('Nothing to save.'); return }
      app.change(deletions, insertions, 'Saved.').then(ok => { if (ok) edit.sync(true) })
    })
    return edit
  }
  return app
}

const pane = {
  name: 'poll',
  icon: svg(MDI.poll, '#00679e'),
  audience: [],

  label (subject, context) {
    try { return isPoll(context.session.store, subject) ? 'Find a time' : null } catch { return null }
  },

  shouldGetFocus (subject, context) {
    try { return isPoll((context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store) || (globalThis.UI && globalThis.UI.store), subject) } catch { return false }
  },

  // "New Poll" in a folder's Add menu.
  mintClass: { termType: 'NamedNode', value: SCHED + 'SchedulableEvent', uri: SCHED + 'SchedulableEvent' },

  async mintNew (context, options) {
    const store = context.session.store
    const fetcher = webFetch(store)
    const me = options.me || currentUser(context)
    if (!me) throw new Error('log in to make a poll')
    const base = options.newBase
    const index = base + 'index.ttl'
    const results = base + 'results.ttl'
    const title = options.title || 'Poll'
    const body = `@prefix sched: <${SCHED}>.\n@prefix cal: <${CAL}>.\n@prefix dc: <${DC}>.\n@prefix xsd: <${XSD}>.\n\n` +
      `<#this> a sched:SchedulableEvent;\n    cal:summary ${turtleText(title)};\n    dc:author <${me.value}>;\n    dc:created "${new Date().toISOString()}"^^xsd:dateTime;\n    sched:results <results.ttl>.\n`
    // If a step fails, what was written so far is removed again, so no half-made poll is left behind.
    const written = []
    const put = async (address, text) => {
      const response = await fetcher(address, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' }, body: text })
      if (!response.ok) throw new Error(address.split('/').pop() + ' was not created (' + response.status + ')')
      written.push(address)
    }
    try {
      await put(index, body)
      await put(results, `@prefix sched: <${SCHED}>.\n`)
      await putAcl(fetcher, index, me.value, 'foaf:Agent', ['Read'])
      await putAcl(fetcher, results, me.value, 'acl:AuthenticatedAgent', ['Read', 'Write'])
    } catch (error) {
      const left = []
      for (const address of written.reverse()) {
        const gone = await fetcher(address, { method: 'DELETE' }).then(r => r.ok || r.status === 404, () => false)
        if (!gone) left.push(address.split('/').pop())
      }
      throw new Error(error.message + (left.length ? '; left on the pod: ' + left.join(', ') : '; nothing was left behind'))
    }
    return { ...options, newInstance: store.sym(index + '#this') }
  },

  render (subject, context) {
    const app = appFor(subject, context)
    const { dom, store, sym, doc, suite } = app
    subject = app.subject
    const root = el(dom, 'div', 'pol poll-pane pol-root')
    root.appendChild(el(dom, 'style', '', CSS))
    app.areas.content = root

    const top = root.appendChild(el(dom, 'header', 'pol-top'))
    const title = top.appendChild(el(dom, 'h2', 'pol-title'))
    const meta = top.appendChild(el(dom, 'p', 'pol-meta'))
    const where = top.appendChild(el(dom, 'p', 'pol-meta pol-where'))
    where.appendChild(icon(dom, MDI.place))
    const whereText = where.appendChild(el(dom, 'span'))
    const notes = top.appendChild(el(dom, 'p', 'pol-notes'))
    const status = root.appendChild(el(dom, 'p', 'pol-status', null, { role: 'status' }))
    const zoneLine = root.appendChild(el(dom, 'p', 'pol-zone'))
    zoneLine.appendChild(icon(dom, MDI.clock))
    const zoneText = zoneLine.appendChild(el(dom, 'span'))
    const list = root.appendChild(el(dom, 'ul', 'pol-list pol-options', null, { 'aria-label': 'Choices' }))
    const owner = root.appendChild(el(dom, 'div'))
    const foot = root.appendChild(el(dom, 'div', 'pol-foot'))

    // The status line stays in place; inside the shell a saved or refused change is also a toast.
    app.say = (text, kind) => {
      status.textContent = text || ''
      const look = kind === 'good' ? ' pol-status-success' : kind === 'bad' ? ' pol-status-error' : ''
      status.className = 'pol-status' + (text ? ' pol-' + (kind || 'info') + look : '')
      if (suite && suite.toast && text && (kind === 'good' || kind === 'bad')) { try { suite.toast(text, { kind: kind === 'good' ? 'success' : 'error' }) } catch { /* the line says it */ } }
    }

    // The maker's forms are made once and kept, so a redraw (an answer, a name arriving) never loses typing.
    let ownerForms = null
    function ownerTools () {
      if (!app.mine()) { owner.replaceChildren(); ownerForms = null; return }
      if (ownerForms) { if (ownerForms.edit) ownerForms.edit.sync(); return }
      ownerForms = {}
      const st = app.st
      const taken = () => new Set(store.each(subject, sym(SCHED + 'option'), null, doc).map(o => o.value))
      const fresh = (used) => { let n = used.size + 1; while (used.has(doc.value + '#o' + n)) n++; used.add(doc.value + '#o' + n); return sym(doc.value + '#o' + n) }
      // Two forms in one box: Enter in the "not a time" field submits that one, not the hours.
      const box = owner.appendChild(el(dom, 'div', 'pol-box'))
      const add = box.appendChild(el(dom, 'form', 'pol-add'))
      add.appendChild(el(dom, 'h3', 'pol-subheading', 'Offer times'))
      add.appendChild(el(dom, 'p', 'pol-hint', 'Pick a day and a range of hours. Each hour becomes one choice. Times are in your time zone (' + app.zone() + '); everyone else sees them in theirs.'))
      const fields = add.appendChild(el(dom, 'div', 'pol-fields'))
      const dayLabelEl = fields.appendChild(el(dom, 'label', 'pol-field'))
      dayLabelEl.appendChild(el(dom, 'span', 'pol-label', 'Day'))
      const day = dayLabelEl.appendChild(el(dom, 'input', 'pol-input'))
      day.type = 'date'
      day.required = true
      const hours = (labelText, chosen) => {
        const label = fields.appendChild(el(dom, 'label', 'pol-field pol-narrow'))
        label.appendChild(el(dom, 'span', 'pol-label', labelText))
        const select = label.appendChild(el(dom, 'select', 'pol-input'))
        for (let h = 0; h <= 24; h++) { const o = select.appendChild(el(dom, 'option', '', String(h).padStart(2, '0') + ':00')); o.value = String(h); if (h === chosen) o.selected = true }
        return select
      }
      const from = hours('From', 9)
      const to = hours('To', 12)
      // One primary button per view: alone it is this one; in the shell it is the column's "Add poll".
      const addButton = fields.appendChild(el(dom, 'button', 'pol-btn' + (suite ? '' : ' pol-btn-primary'), null, { type: 'submit' }))
      addButton.appendChild(icon(dom, MDI.plus))
      addButton.appendChild(el(dom, 'span', null, 'Add times'))
      add.addEventListener('submit', (event) => {
        event.preventDefault()
        const first = +from.value
        const last = +to.value
        if (!day.value) { app.say('Pick a day.', 'bad'); return }
        if (last <= first) { app.say('"To" must be later than "From".', 'bad'); return }
        const have = new Set(store.each(subject, sym(SCHED + 'option'), null, doc).map(o => store.any(o, sym(CAL + 'dtstart'), null, doc)).filter(Boolean).map(t => moment(t.value).getTime()))
        const used = taken()
        const insertions = []
        const [y, m, d] = day.value.split('-').map(Number)
        for (let h = first; h < last; h++) {
          const start = new Date(y, m - 1, d, h, 0, 0)
          if (have.has(start.getTime())) continue
          const option = fresh(used)
          insertions.push(st(subject, sym(SCHED + 'option'), option, doc))
          insertions.push(st(option, sym(CAL + 'dtstart'), app.literal(start.toISOString().replace('.000Z', 'Z'), 'dateTime'), doc))
          insertions.push(st(option, sym(CAL + 'dtend'), app.literal(new Date(y, m - 1, d, h + 1, 0, 0).toISOString().replace('.000Z', 'Z'), 'dateTime'), doc))
        }
        if (!insertions.length) { app.say('Those hours are already offered.'); return }
        app.change([], insertions, (insertions.length / 3 === 1 ? '1 time' : insertions.length / 3 + ' times') + ' added.')
      })
      const more = box.appendChild(el(dom, 'details', 'pol-more'))
      more.appendChild(el(dom, 'summary', '', 'Or add something else to vote on'))
      const other = more.appendChild(el(dom, 'form', 'pol-other'))
      const moreFields = other.appendChild(el(dom, 'div', 'pol-fields'))
      const textLabel = moreFields.appendChild(el(dom, 'label', 'pol-field'))
      textLabel.appendChild(el(dom, 'span', 'pol-label', 'A choice that is not a time'))
      const text = textLabel.appendChild(el(dom, 'input', 'pol-input'))
      text.type = 'text'
      text.maxLength = 120
      text.placeholder = 'Video call, or in person'
      moreFields.appendChild(el(dom, 'button', 'pol-btn', 'Add', { type: 'submit' }))
      other.addEventListener('submit', (event) => {
        event.preventDefault()
        const label = text.value.trim()
        if (!label) { app.say('Type the choice first.', 'bad'); return }
        const option = fresh(taken())
        app.change([], [st(subject, sym(SCHED + 'option'), option, doc), st(option, sym(RDFS_LABEL), app.literal(label), doc)], 'Choice added.').then(ok => { if (ok) text.value = '' })
      })
      // In the shell the poll's own details (title, place, notes) are edited in the details column.
      if (!suite) ownerForms.edit = owner.appendChild(app.editForm(false))
    }

    function draw () {
      const poll = app.poll()
      const who = app.me()
      title.textContent = app.text('summary') || 'Find a time'
      meta.textContent = app.byLine()
      whereText.textContent = app.text('location')
      where.hidden = !whereText.textContent
      notes.textContent = app.text('comment')
      notes.hidden = !notes.textContent

      list.replaceChildren()
      const count = poll.people.length
      const score = (option) => option.answers.filter(a => a.answer === 'Yes').length * 2 + option.answers.filter(a => a.answer === 'Maybe').length
      const best = Math.max(0, ...poll.options.map(score))
      let lastDay = null
      for (const option of poll.options) {
        if (option.day !== lastDay) {
          lastDay = option.day
          list.appendChild(el(dom, 'li', 'pol-day', option.day || 'Also to decide'))
        }
        const yes = option.answers.filter(a => a.answer === 'Yes')
        const maybe = option.answers.filter(a => a.answer === 'Maybe')
        const lead = best > 0 && score(option) === best
        const item = list.appendChild(el(dom, 'li', 'pol-option' + (lead ? ' pol-lead' : '')))
        item.dataset.option = option.node.value
        const head = item.appendChild(el(dom, 'div', 'pol-head'))
        head.appendChild(el(dom, 'span', 'pol-name', option.short || option.label))
        if (lead) head.appendChild(el(dom, 'span', 'pol-chip pol-chip-success pol-tag', 'Best so far'))
        head.appendChild(el(dom, 'span', 'pol-count', yes.length + ' yes' + (maybe.length ? ' · ' + maybe.length + ' if need be' : '')))
        const bar = item.appendChild(el(dom, 'div', 'pol-bar', null, { 'aria-hidden': 'true' }))
        const total = Math.max(count, 1)
        bar.appendChild(el(dom, 'span', 'pol-yes')).style.width = (100 * yes.length / total) + '%'
        bar.appendChild(el(dom, 'span', 'pol-maybe')).style.width = (100 * maybe.length / total) + '%'
        const names = item.appendChild(el(dom, 'div', 'pol-who pol-chips', null, { 'aria-label': 'Who can make it' }))
        for (const a of yes) { const n = app.name(a.who); names.appendChild(el(dom, 'span', 'pol-chip pol-chip-success', n, { title: n })) }
        for (const a of maybe) { const n = app.name(a.who) + ' (if need be)'; names.appendChild(el(dom, 'span', 'pol-chip pol-chip-warning', n, { title: n })) }
        const answering = !!who && app.resultsRead
        if (answering || app.mine()) {
          const own = who && option.answers.find(a => a.who.value === who.value)
          const choose = item.appendChild(el(dom, 'div', 'pol-choose', null, { role: 'group', 'aria-label': (answering ? 'Your answer for ' : '') + option.label }))
          for (const [value, label] of answering ? ANSWERS : []) {
            const on = own && own.answer === value
            const button = choose.appendChild(el(dom, 'button', 'pol-btn' + (on ? ' pol-on-' + value : ''), null, { type: 'button', 'data-answer': value, 'data-option': option.node.value, 'aria-pressed': on ? 'true' : 'false' }))
            button.appendChild(icon(dom, MDI[value]))
            button.appendChild(el(dom, 'span', null, label))
            button.addEventListener('click', () => app.answer(option, value))
          }
          if (app.mine()) {
            const remove = choose.appendChild(el(dom, 'button', 'pol-btn pol-quiet', null, { type: 'button', 'aria-label': 'Remove ' + option.label }))
            remove.appendChild(icon(dom, MDI.remove))
            const words = remove.appendChild(el(dom, 'span', null, 'Remove'))
            let armed = false
            const disarm = () => { armed = false; words.textContent = 'Remove'; remove.classList.remove('pol-armed') }
            remove.addEventListener('blur', disarm)
            remove.addEventListener('click', () => {
              if (!armed) { armed = true; words.textContent = 'Press again to remove'; remove.classList.add('pol-armed'); setTimeout(() => { if (armed) disarm() }, 4000); return }
              app.change([...store.statementsMatching(subject, sym(SCHED + 'option'), option.node, doc), ...store.statementsMatching(option.node, null, null, doc)], [], option.label + ' was removed.')
            })
          }
        }
      }
      if (!poll.options.length) {
        const empty = list.appendChild(el(dom, 'li', 'pol-empty'))
        empty.appendChild(el(dom, 'span', 'pol-empty-icon')).appendChild(icon(dom, MDI.poll))
        empty.appendChild(el(dom, 'p', 'pol-empty-title', 'No times yet'))
        empty.appendChild(el(dom, 'p', 'pol-empty-text', app.mine() ? 'No times offered yet. Add some below.' : 'No times have been offered yet.'))
      }
      zoneText.textContent = poll.options.some(o => o.at !== null) ? 'Times are shown in your time zone: ' + app.zone() + '.' : ''
      zoneLine.hidden = !zoneText.textContent
      if (!who && !status.textContent) app.say('Log in to say when you can make it.')
      ownerTools()

      foot.replaceChildren()
      const link = foot.appendChild(el(dom, 'input', 'pol-input pol-link'))
      link.type = 'text'
      link.readOnly = true
      link.value = subject.value
      link.setAttribute('aria-label', 'The address of this poll, to send to people')
      link.addEventListener('focus', () => link.select())
      const again = foot.appendChild(el(dom, 'button', 'pol-btn', null, { type: 'button' }))
      again.appendChild(icon(dom, MDI.refresh))
      again.appendChild(el(dom, 'span', null, 'Refresh'))
      again.addEventListener('click', () => app.load(true))
    }

    app.draws.content = draw
    draw()
    if (!app.started) { app.started = true; app.load(false) }
    return root
  },

  // The suite shell's left column: "Add poll" for the poll's maker, and the poll on show under the heading a
  // Nextcloud user would look for it ("My polls" when it is theirs, "Answered" when they have answered).
  // The pane knows only this poll: it does not search the pod for others.
  renderNavigation (subject, context) {
    const suite = suiteOf(context)
    if (!suite) return null
    const app = appFor(subject, context)
    const { dom } = app
    const box = el(dom, 'div', 'pol pol-root pol-side pol-navbox')
    app.areas.nav = box
    const draw = () => {
      box.replaceChildren()
      const who = app.me()
      if (app.mine()) {
        const add = box.appendChild(el(dom, 'button', 'pol-btn pol-btn-primary pol-btn-wide pol-nav-new', null, { type: 'button' }))
        add.appendChild(icon(dom, MDI.plus))
        add.appendChild(el(dom, 'span', null, 'Add poll'))
        add.addEventListener('click', async () => {
          add.disabled = true
          const base = new URL('../', app.doc.value).href + 'poll-' + Date.now().toString(36) + '/'
          try {
            const made = await pane.mintNew({ dom, session: { store: app.store } }, { newBase: base, title: 'New poll' })
            suite.go(made.newInstance, { pane: 'poll' })
          } catch (error) {
            add.disabled = false
            suite.toast('The poll was not made: ' + (error && error.message ? error.message : error), { kind: 'error' })
          }
        })
      }
      const answered = !!who && app.poll().people.some(p => p.value === who.value)
      box.appendChild(el(dom, 'p', 'pol-caption', app.mine() ? 'My polls' : answered ? 'Answered' : 'This poll'))
      const list = box.appendChild(el(dom, 'ul', 'pol-nav-list'))
      const item = list.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'pol-nav-item', null, { type: 'button', 'aria-current': 'page', 'data-poll': app.subject.value }))
      item.appendChild(icon(dom, MDI.poll))
      item.appendChild(el(dom, 'span', 'pol-nav-label', app.text('summary') || 'Find a time'))
      item.appendChild(el(dom, 'span', 'pol-nav-count', String(app.poll().people.length), { title: 'People who have answered' }))
      item.addEventListener('click', () => { suite.closeDetails(); suite.go(app.subject, { pane: 'poll' }) })
    }
    app.draws.nav = draw
    draw()
    return box
  },

  // The suite shell's right column for the poll: About (place, notes; the maker edits them here), Configuration
  // (what the poll is and who may do what) and Participants (each person and their answers). It has no comments.
  renderDetails (node, context) {
    const suite = suiteOf(context)
    if (!suite) return null
    const app = appFor(node, context)
    const { dom, store } = app
    const box = el(dom, 'div', 'pol pol-root pol-side')
    app.areas.details = box
    const head = box.appendChild(el(dom, 'div', 'pol-details-head'))
    head.appendChild(el(dom, 'span', 'pol-details-figure')).appendChild(icon(dom, MDI.poll))
    const titles = head.appendChild(el(dom, 'div', 'pol-details-titles'))
    const name = titles.appendChild(el(dom, 'h2', 'pol-details-title'))
    const sub = titles.appendChild(el(dom, 'p', 'pol-details-sub'))
    const tabs = box.appendChild(el(dom, 'div', 'pol-tabs', null, { role: 'tablist', 'aria-label': 'Poll details' }))
    const ids = 'pol-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const body = box.appendChild(el(dom, 'div', 'pol-details-body', null, { role: 'tabpanel', id: ids + '-panel' }))
    const TABS = [['about', 'About'], ['config', 'Configuration'], ['people', 'Participants']]
    const buttons = TABS.map(([key, label]) => {
      const b = tabs.appendChild(el(dom, 'button', 'pol-tab', label, { type: 'button', role: 'tab', 'data-tab': key, id: ids + '-' + key, 'aria-controls': ids + '-panel' }))
      b.addEventListener('click', () => { app.tab = key; draw() })
      return b
    })
    // Arrow keys move between the tabs (and choose), as tabs do.
    tabs.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1, Home: -99, End: 99 }[event.key]
      if (!step) return
      event.preventDefault()
      const at = TABS.findIndex(t => t[0] === app.tab)
      const next = Math.max(0, Math.min(TABS.length - 1, Math.abs(step) === 99 ? (step < 0 ? 0 : TABS.length - 1) : (at + step + TABS.length) % TABS.length))
      app.tab = TABS[next][0]
      draw()
      buttons[next].focus()
    })
    const props = (pairs) => {
      const dl = el(dom, 'dl', 'pol-props')
      for (const [k, v] of pairs) {
        if (!v) continue
        dl.appendChild(el(dom, 'dt', null, k))
        const dd = dl.appendChild(el(dom, 'dd'))
        if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v)
      }
      return dl
    }
    const link = (href, text) => {
      if (!/^https?:/i.test(href)) return text
      const a = el(dom, 'a', null, text, { href, rel: 'noopener', target: '_blank' })
      return a
    }
    const draw = () => {
      const poll = app.poll()
      name.textContent = app.text('summary') || 'Find a time'
      sub.textContent = app.byLine()
      for (const b of buttons) { const on = b.dataset.tab === app.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on) body.setAttribute('aria-labelledby', b.id) }
      body.replaceChildren()
      if (app.tab === 'about') {
        const location = app.text('location')
        const notes = app.text('comment')
        body.appendChild(props([['Where', location ? (/^https?:\/\/\S+$/i.test(location) ? link(location, location) : location) : ''], ['Notes', notes]]))
        if (!location && !notes) body.appendChild(el(dom, 'p', 'pol-muted', 'No place or notes given.'))
        // The edit form is kept between redraws (typing is not lost); secondary, as "Add poll" is the primary.
        if (app.mine()) { if (!app.detailsEdit) app.detailsEdit = app.editForm(false); else app.detailsEdit.sync(); body.appendChild(app.detailsEdit) }
      } else if (app.tab === 'config') {
        const author = store.any(app.subject, app.sym(DC + 'author'), null, app.doc)
        const created = store.any(app.subject, app.sym(DC + 'created'), null, app.doc)
        const times = poll.options.filter(o => o.at !== null).length
        const others = poll.options.length - times
        body.appendChild(props([
          ['Made by', author ? app.name(author) : ''],
          ['Made on', created && !isNaN(new Date(created.value)) ? new Date(created.value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : ''],
          ['Choices', (times === 1 ? '1 time' : times + ' times') + (others ? ', ' + others + (others === 1 ? ' other choice' : ' other choices') : '')],
          ['Answers', '“Yes”, “If need be” or “No”; pressing the same answer again clears it'],
          ['Time zone', 'Times are shown in yours: ' + app.zone()],
          ['Answers file', link(app.resultsDoc.value, app.resultsDoc.value.split('/').slice(-2).join('/'))],
          ['Address', link(app.subject.value, app.subject.value)]
        ]))
        const note = body.appendChild(el(dom, 'p', 'pol-note'))
        note.textContent = 'Anyone who can write to the answers file can answer. A poll made here can be read by anyone with its address, and answered by anyone who is logged in, so a logged-in person could change another person\'s answer.'
      } else {
        if (!poll.people.length) {
          const empty = body.appendChild(el(dom, 'div', 'pol-empty'))
          empty.appendChild(el(dom, 'span', 'pol-empty-icon')).appendChild(icon(dom, MDI.people))
          empty.appendChild(el(dom, 'p', 'pol-empty-title', 'Nobody yet'))
          empty.appendChild(el(dom, 'p', 'pol-empty-text', app.resultsRead ? 'Nobody has answered this poll yet.' : 'The answers have not been read.'))
        } else {
          const who = app.me()
          const list = body.appendChild(el(dom, 'ul', 'pol-list pol-people', null, { 'aria-label': 'Participants' }))
          for (const person of poll.people) {
            const tally = { Yes: 0, Maybe: 0, No: 0 }
            for (const o of poll.options) { const a = o.answers.find(x => x.who.value === person.value); if (a && a.answer in tally) tally[a.answer]++ }
            const row = list.appendChild(el(dom, 'li', 'pol-row'))
            const label = app.name(person)
            row.appendChild(el(dom, 'span', 'pol-avatar', initials(label), { 'aria-hidden': 'true' }))
            const main = row.appendChild(el(dom, 'span', 'pol-row-main'))
            main.appendChild(el(dom, 'span', 'pol-row-title', label + (who && who.value === person.value ? ' (you)' : '')))
            main.appendChild(el(dom, 'span', 'pol-row-sub', tally.Yes + ' yes · ' + tally.Maybe + ' if need be · ' + tally.No + ' no'))
          }
        }
      }
    }
    app.draws.details = draw
    draw()
    return box
  }
}

export default pane
