// meeting-pane.js: one clear page for a meeting kept in a pod.
// What it is, when (in your own time zone), where, notes, who, and everything kept for it.
//
// One file, no imports. It reads and writes the format of SolidOS's own meeting pane
// (http://www.w3.org/ns/pim/meeting#), so a meeting made there opens here and the other way round:
//
//   index.ttl   <#this> a meeting:Meeting ; cal:summary "Planning" ; dc:author <WebID> ;
//                   cal:dtstart "2026-12-03T14:00:00Z"^^xsd:dateTime ;     (or "2026-12-03"^^xsd:date)
//                   cal:dtend "2026-12-03T15:30:00Z"^^xsd:dateTime ;
//                   cal:location "Room 2" ; cal:comment "Bring the draft." ;
//                   meeting:toolList ( <#this> <#t1> <#t2> ) ;               (in order; <#this> = the details tab)
//                   meeting:chat <Chat/chat.ttl> ; wf:attachment <https://example.org/agenda> ;
//                   wf:participation <#p1> .
//               <#t1> a meeting:Tool ; rdfs:label "Chat" ; meeting:target <Chat/chat.ttl> .
//               <#t2> a meeting:Tool ; rdfs:label "Agenda" ; meeting:target <https://example.org/agenda> ;
//                   meeting:view "iframe" .
//               <#p1> wf:participant <WebID> .
//
// What this pane writes, and when (only for someone the pod lets write the meeting's file):
// - "Save" on the details: cal:summary, cal:dtstart, cal:dtend, cal:location, cal:comment, by rewriting the
//   whole file as below (a SPARQL patch loses literals holding "}" on JSS), then reading it back to check.
// - Adding a link, removing an item, moving one up or down: the whole meeting file, rewritten with the
//   new meeting:toolList (an RDF list cannot be patched safely). The file is read fresh first and the
//   write is refused by the server if it changed in between (If-Match), so nobody's edit is lost.
// - "New Meeting" in a folder's Add menu: index.ttl in the new folder, as SolidOS's pane makes it.
//   No access rule is written: the new meeting gets the folder's.

const MEETING = 'http://www.w3.org/ns/pim/meeting#'
const CAL = 'http://www.w3.org/2002/12/cal/ical#'
const DC = 'http://purl.org/dc/elements/1.1/'
const WF = 'http://www.w3.org/2005/01/wf/flow#'
const UI_NS = 'http://www.w3.org/ns/ui#'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'
const VCARD_FN = 'http://www.w3.org/2006/vcard/ns#fn'
const DCT_TITLE = 'http://purl.org/dc/terms/title'

// What an item is, from the link the meeting has to it, then from how SolidOS shows it.
const BY_LINK = {
  [MEETING + 'chat']: 'Chat',
  [MEETING + 'sharedNotes']: 'Shared notes',
  [MEETING + 'actions']: 'Actions',
  [MEETING + 'videoCallPage']: 'Video call',
  [MEETING + 'materialsFolder']: 'Files',
  [MEETING + 'pictures']: 'Pictures',
  [MEETING + 'attendeeGroup']: 'Attendees',
  [MEETING + 'particpants']: 'Participants',
  [MEETING + 'subMeeting']: 'Meeting',
  [MEETING + 'attachmentTool']: 'Links',
  [MEETING + 'schedulingPoll']: 'Scheduling poll',
  [WF + 'sharingControl']: 'Sharing'
}
const BY_VIEW = { iframe: 'Web page', peoplePicker: 'People', schedule: 'Scheduling poll', slideshow: 'Pictures', link: 'Links', sharing: 'Sharing', details: 'Details', contact: 'Contacts', folder: 'Folder', chat: 'Chat', pad: 'Shared notes' }
const BY_TYPE = { [MEETING + 'Chat']: 'Chat', [MEETING + 'Meeting']: 'Meeting', [WF + 'Tracker']: 'Actions', [MEETING + 'VideoCallPage']: 'Video call', 'http://www.w3.org/ns/pim/pad#Notepad': 'Shared notes', 'http://www.w3.org/ns/pim/schedule#SchedulableEvent': 'Scheduling poll', 'http://www.w3.org/2006/vcard/ns#Group': 'Group' }
const EDITED = ['summary', 'dtstart', 'dtend', 'location', 'comment']

const CSS = `
/* suite:design begin --prefix mtg --only icon,nav,row,buttons,input,chip,empty */
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
.mtg-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.mtg-root *, .mtg-root *::before, .mtg-root *::after { box-sizing: border-box }
.mtg-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.mtg-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.mtg-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.mtg-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.mtg-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.mtg-root [hidden] { display: none !important }
.mtg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.mtg-muted { color: var(--sui-text-muted) }
.mtg-small { font-size: var(--sui-text-sm) }
.mtg-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.mtg-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.mtg-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.mtg-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.mtg-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.mtg-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --mtg-i set to url("data:image/svg+xml,...") ---------------------------------- */
.mtg-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--mtg-i) center / contain no-repeat; mask: var(--mtg-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.mtg-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.mtg-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.mtg-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.mtg-nav-item:hover { background: var(--sui-bg-hover) }
.mtg-nav-item[aria-current="page"], .mtg-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.mtg-nav-item .mtg-icon { color: var(--sui-text-muted) }
.mtg-nav-item[aria-current] .mtg-icon { color: inherit }
.mtg-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.mtg-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.mtg-nav-new { margin-bottom: var(--sui-space-2) }
.mtg-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.mtg-list { margin: 0; padding: 0; list-style: none }
.mtg-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.mtg-row:hover { background: var(--sui-bg-hover) }
.mtg-row[aria-selected="true"], .mtg-row[aria-current="true"] { background: var(--sui-primary-light) }
.mtg-row-main { flex: 1 1 auto; min-width: 0 }
.mtg-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.mtg-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.mtg-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.mtg-row-actions { flex: none; display: flex; align-items: center }
.mtg-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.mtg-row-icon .mtg-icon { width: 28px; height: 28px }
.mtg-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .mtg-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.mtg-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.mtg-btn:hover { background: var(--sui-primary-light-hover) }
.mtg-btn:disabled, .mtg-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.mtg-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.mtg-btn-primary:hover { background: var(--sui-primary-element-hover) }
.mtg-btn-tertiary { background: transparent; color: var(--sui-text) }
.mtg-btn-tertiary:hover { background: var(--sui-bg-hover) }
.mtg-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.mtg-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.mtg-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.mtg-btn-icon:hover { background: var(--sui-bg-hover) }
.mtg-btn-wide { width: 100%; justify-content: flex-start }
.mtg-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.mtg-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.mtg-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.mtg-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.mtg-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.mtg-input:hover { border-color: var(--sui-primary-element) }
.mtg-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.mtg-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.mtg-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.mtg-search { position: relative; display: flex; align-items: center; min-width: 0 }
.mtg-search .mtg-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.mtg-search .mtg-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.mtg-select { position: relative; display: block; min-width: 0 }
.mtg-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.mtg-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.mtg-file { position: relative; overflow: hidden }
.mtg-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.mtg-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .mtg-row-check */
.mtg-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.mtg-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.mtg-check-round { border-radius: 50% }
.mtg-check:hover { border-color: var(--sui-primary-element) }
.mtg-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.mtg-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.mtg-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.mtg-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.mtg-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.mtg-segment:hover { background: var(--sui-bg-hover) }
.mtg-segment[aria-pressed="true"], .mtg-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.mtg-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.mtg-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.mtg-chip { cursor: pointer }
button.mtg-chip:hover { background: var(--sui-primary-light-hover) }
.mtg-chip-primary, .mtg-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.mtg-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.mtg-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.mtg-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.mtg-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.mtg-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.mtg-empty-icon .mtg-icon { width: 48px; height: 48px }
.mtg-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.mtg-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* suite:design end */
.mtg.meeting-pane { max-width: calc(var(--sui-content-max) * 3 / 4); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8) }
.mtg-root p { max-width: none }
.mtg-card { padding: var(--sui-space-5); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg) }
.mtg-head-top { display: flex; align-items: center; gap: var(--sui-space-4); min-width: 0 }
.mtg-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-primary-light); color: var(--sui-primary-element) }
.mtg-figure .mtg-icon { width: 36px; height: 36px }
.mtg-titles { flex: 1 1 auto; min-width: 0 }
.mtg-kicker { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.mtg-title { overflow-wrap: anywhere }
.mtg-head .mtg-chips { margin: var(--sui-space-4) 0 0 }
.mtg-head .mtg-chip { white-space: normal; overflow-wrap: anywhere; line-height: 1.35; padding-top: var(--sui-space-1); padding-bottom: var(--sui-space-1) }
.mtg-chip .mtg-icon { width: var(--sui-space-4); height: var(--sui-space-4) }
.mtg-chip a { color: inherit }
.mtg-zone { margin: var(--sui-space-2) 0 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.mtg-props { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--sui-space-2) var(--sui-space-4); margin: var(--sui-space-4) 0 0 }
.mtg-props dt { color: var(--sui-text-muted); font-size: var(--sui-text-sm); padding-top: 2px }
.mtg-props dd { margin: 0; min-width: 0; overflow-wrap: anywhere }
.mtg-notes { white-space: pre-wrap }
.mtg-none { color: var(--sui-text-muted) }
.mtg-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2) var(--sui-space-3); margin: var(--sui-space-4) 0 0; font-size: var(--sui-text-sm) }
.mtg-status { margin: var(--sui-space-3) 0 0; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); font-size: var(--sui-text-sm) }
.mtg-status:empty { display: none }
.mtg-good { background: var(--sui-success-light); color: var(--sui-success) }
.mtg-bad { background: var(--sui-error-light); color: var(--sui-error) }
.mtg-info { background: var(--sui-primary-light); color: var(--sui-primary-light-text) }
.mtg-section { margin: var(--sui-space-6) 0 var(--sui-space-2) var(--sui-space-3) }
.mtg-item .mtg-name a { color: var(--sui-text); text-decoration: none }
.mtg-item .mtg-name a:hover { text-decoration: underline }
.mtg-moves { flex: none; display: flex; align-items: center }
.mtg-moves .mtg-btn-icon { color: var(--sui-text-muted) }
.mtg-moves .mtg-btn-icon:hover { color: var(--sui-text) }
.mtg-moves .mtg-btn-icon:disabled { opacity: .35 }
.mtg-list .mtg-empty { margin: var(--sui-space-6) auto }
.mtg-box { margin-top: var(--sui-space-4) }
.mtg-box h3 { margin: 0 0 var(--sui-space-1); font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold) }
.mtg-hint { margin: 0 0 var(--sui-space-3) }
.mtg-edit > summary { display: flex; align-items: center; min-height: var(--sui-target); margin: calc(var(--sui-space-2) * -1) 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); cursor: pointer }
.mtg-edit[open] > summary { margin-bottom: var(--sui-space-2) }
.mtg-fields { display: flex; flex-wrap: wrap; gap: var(--sui-space-3); align-items: flex-end }
.mtg-fields .mtg-field { flex: 1 1 200px }
.mtg-fields .mtg-wide { flex-basis: 100% }
.mtg-fields .mtg-narrow { flex: 1 1 130px }
.mtg-foot { margin-top: var(--sui-space-6); color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
`

// Icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box.
const MDI = {
  calendar: 'M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z',
  calendarPlus: 'M19 19V8H5V19H19M16 1H18V3H19C20.11 3 21 3.9 21 5V19C21 20.11 20.11 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.89 3.89 3 5 3H6V1H8V3H16V1M11 9.5H13V12.5H16V14.5H13V17.5H11V14.5H8V12.5H11V9.5Z',
  clock: 'M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z',
  place: 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  up: 'M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z',
  down: 'M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z',
  remove: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  web: 'M16.36,14C16.44,13.34 16.5,12.68 16.5,12C16.5,11.32 16.44,10.66 16.36,10H19.74C19.9,10.64 20,11.31 20,12C20,12.69 19.9,13.36 19.74,14M14.59,19.56C15.19,18.45 15.65,17.25 15.97,16H18.92C17.96,17.65 16.43,18.93 14.59,19.56M14.34,14H9.66C9.56,13.34 9.5,12.68 9.5,12C9.5,11.32 9.56,10.65 9.66,10H14.34C14.43,10.65 14.5,11.32 14.5,12C14.5,12.68 14.43,13.34 14.34,14M12,19.96C11.17,18.76 10.5,17.43 10.09,16H13.91C13.5,17.43 12.83,18.76 12,19.96M8,8H5.08C6.03,6.34 7.57,5.06 9.4,4.44C8.8,5.55 8.35,6.75 8,8M5.08,16H8C8.35,17.25 8.8,18.45 9.4,19.56C7.57,18.93 6.03,17.65 5.08,16M4.26,14C4.1,13.36 4,12.69 4,12C4,11.31 4.1,10.64 4.26,10H7.64C7.56,10.66 7.5,11.32 7.5,12C7.5,12.68 7.56,13.34 7.64,14M12,4.03C12.83,5.23 13.5,6.57 13.91,8H10.09C10.5,6.57 11.17,5.23 12,4.03M18.92,8H15.97C15.65,6.75 15.19,5.55 14.59,4.44C16.43,5.07 17.96,6.34 18.92,8M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z',
  chat: 'M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4C22,2.89 21.1,2 20,2M6,9H18V11H6M14,14H6V12H14M18,8H6V6H18',
  notes: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  poll: 'M3,22V8H7V22H3M10,22V2H14V22H10M17,22V14H21V22H17Z',
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
  people: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z',
  link: 'M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z'
}
const KIND_ICON = { 'Web page': 'web', Chat: 'chat', 'Shared notes': 'notes', 'Scheduling poll': 'poll', Files: 'folder', Folder: 'folder', Pictures: 'folder', Meeting: 'calendar', Attendees: 'people', Participants: 'people', People: 'people', Group: 'people', Contacts: 'people' }
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path${fill ? ` fill="${fill}"` : ''} d="${d}"/></svg>`)

function icon (dom, name) {
  const span = el(dom, 'span', 'mtg-icon')
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--mtg-i', `url("${svg(MDI[name] || MDI.link)}")`)
  return span
}

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
const safeHref = (value) => /^(https?:|mailto:|tel:)/i.test(String(value || '')) ? String(value) : null

function isMeeting (store, subject) {
  return !!store && !!subject && store.holds(subject, store.sym(RDF + 'type'), store.sym(MEETING + 'Meeting'))
}

// ---- Times

const dateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const parseTime = (value) => {
  if (!value) return null
  const date = dateOnly(value) ? new Date(value + 'T00:00:00') : new Date(value)
  return isNaN(date) ? null : date
}
const zoneName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time' } catch { return 'local time' } }
const dayText = (date) => date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const clockText = (date) => date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// "Thursday 3 December 2026, 15:00 to 16:30", in the viewer's own zone. Null if there is no start.
function whenText (start, end) {
  const from = parseTime(start)
  if (!from) return start ? { text: start, timed: false } : null
  const until = parseTime(end)
  if (dateOnly(start)) {
    if (!until || sameDay(from, until) || until < from) return { text: dayText(from) + ' (all day)', timed: false }
    return { text: dayText(from) + ' to ' + dayText(until), timed: false }
  }
  if (!until || until < from) return { text: dayText(from) + ', ' + clockText(from), timed: true }
  if (dateOnly(end)) return { text: dayText(from) + ', ' + clockText(from) + ' to ' + dayText(until), timed: true }
  if (sameDay(from, until)) return { text: dayText(from) + ', ' + clockText(from) + ' to ' + clockText(until), timed: true }
  return { text: dayText(from) + ', ' + clockText(from) + ' to ' + dayText(until) + ', ' + clockText(until), timed: true }
}

const pad2 = (n) => String(n).padStart(2, '0')
const localDate = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
const localClock = (d) => pad2(d.getHours()) + ':' + pad2(d.getMinutes())
const utcStamp = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

// ---- The calendar file (RFC 5545)

const icsText = (text) => String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
const icsMoment = (d) => utcStamp(d).replace(/[-:]/g, '')
const icsDay = (d) => localDate(d).replace(/-/g, '')
function icsFold (line) {
  // Lines longer than 75 bytes continue on the next line after a space; never split a character.
  const out = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = new TextEncoder().encode(char).length
    if (bytes + size > (out.length ? 74 : 75)) { out.push(current); current = ''; bytes = 0 }
    current += char
    bytes += size
  }
  out.push(current)
  return out.join('\r\n ')
}
function buildIcs ({ uri, summary, start, end, location, comment }) {
  const from = parseTime(start)
  if (!from) return null
  const until = parseTime(end)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//solid-panes//meeting-pane//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + uri, 'DTSTAMP:' + icsMoment(new Date())]
  if (dateOnly(start)) {
    const last = until && until >= from ? until : from
    const after = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1) // an all-day end is the day after
    lines.push('DTSTART;VALUE=DATE:' + icsDay(from), 'DTEND;VALUE=DATE:' + icsDay(after))
  } else {
    lines.push('DTSTART:' + icsMoment(from))
    if (until && until > from) lines.push('DTEND:' + (dateOnly(end) ? icsMoment(new Date(until.getFullYear(), until.getMonth(), until.getDate() + 1)) : icsMoment(until)))
  }
  lines.push('SUMMARY:' + icsText(summary || 'Meeting'))
  if (location) lines.push('LOCATION:' + icsText(location))
  lines.push('DESCRIPTION:' + icsText((comment ? comment + '\n\n' : '') + uri))
  if (safeHref(uri)) lines.push('URL:' + uri)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

// ---- The list of tools and materials

// The meeting's meeting:toolList as an array of terms, whether rdflib holds it as a Collection
// (from Turtle) or as an rdf:first/rdf:rest chain (from some JSON-LD). Null if there is no list.
function readList (store, subject, doc) {
  const sym = store.sym.bind(store)
  const head = store.any(subject, sym(MEETING + 'toolList'), null, doc)
  if (!head) return null
  if (head.termType === 'Collection') return head.elements.slice()
  const items = []
  const seen = new Set()
  let node = head
  while (node && node.value !== RDF + 'nil' && !seen.has(node.termType + node.value)) {
    seen.add(node.termType + node.value)
    const first = store.any(node, sym(RDF + 'first'), null, doc)
    if (first) items.push(first)
    node = store.any(node, sym(RDF + 'rest'), null, doc)
  }
  return items
}

// Every statement that makes up the list, so it can be taken out whole.
function listStatements (store, subject, doc) {
  const sym = store.sym.bind(store)
  const out = []
  for (const st of store.statementsMatching(subject, sym(MEETING + 'toolList'), null, doc)) {
    out.push(st)
    const seen = new Set()
    let node = st.object
    while (node && (node.termType === 'BlankNode') && !seen.has(node.value)) {
      seen.add(node.value)
      const parts = store.statementsMatching(node, null, null, doc)
      out.push(...parts)
      const rest = parts.find(p => p.predicate.value === RDF + 'rest')
      node = rest ? rest.object : null
    }
  }
  return out
}

function nameOf (store, node) {
  const sym = store.sym.bind(store)
  for (const p of [RDFS_LABEL, CAL + 'summary', DC + 'title', DCT_TITLE, FOAF_NAME, VCARD_FN]) {
    const v = store.any(node, sym(p))
    if (v && v.value) return v.value
  }
  try {
    const url = new URL(node.value)
    const tail = decodeURIComponent(url.pathname.replace(/\/(index\.ttl)?$/, '').split('/').pop() || '')
    return tail ? tail.replace(/\.[a-z0-9]+$/i, '') : url.hostname
  } catch { return node.value }
}

// The list as plain data, in order, without the meeting's own details entry.
function readItems (store, subject, doc) {
  const sym = store.sym.bind(store)
  const list = readList(store, subject, doc) || []
  return list.map((item, index) => {
    const isTool = store.holds(item, sym(RDF + 'type'), sym(MEETING + 'Tool'), doc) || !!store.any(item, sym(MEETING + 'target'), null, doc)
    const target = isTool ? store.any(item, sym(MEETING + 'target'), null, doc) : item
    const view = isTool ? store.any(item, sym(MEETING + 'view'), null, doc) : null
    const label = isTool ? store.any(item, sym(RDFS_LABEL), null, doc) : null
    return { item, index, target, view: view ? view.value : '', label: label ? label.value : '' }
  }).filter(entry => {
    if (!entry.target) return false
    const self = entry.target.value === subject.value
    return !(self && (!entry.view || entry.view === 'details')) // the "details" tab is this page itself
  }).map(entry => {
    let kind = ''
    for (const st of store.statementsMatching(subject, null, entry.target, doc)) if (BY_LINK[st.predicate.value]) { kind = BY_LINK[st.predicate.value]; break }
    if (!kind && BY_VIEW[entry.view]) kind = BY_VIEW[entry.view]
    if (!kind) for (const type of store.each(entry.target, sym(RDF + 'type'))) if (BY_TYPE[type.value]) { kind = BY_TYPE[type.value]; break }
    if (!kind && store.holds(subject, sym(WF + 'attachment'), entry.target, doc)) kind = 'Attachment'
    return { ...entry, name: entry.label || nameOf(store, entry.target), kind: kind || 'Link' }
  })
}

function personName (store, person) {
  const sym = store.sym.bind(store)
  const name = store.any(person, sym(FOAF_NAME)) || store.any(person, sym(VCARD_FN))
  if (name) return name.value
  try { const url = new URL(person.value); return url.hostname.replace(/^www\./, '') } catch { return person.value }
}

const turtleText = (text) => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'

// An item's link: a web page opens in a new tab (the data browser cannot show other sites); a pod item opens in
// place with GotoSubject (inside the suite shell too), the real address kept for modified clicks.
function openLink (dom, context, entry, className) {
  const href = safeHref(entry.target.value)
  if (!href) return el(dom, 'span', className || '', entry.name)
  const a = el(dom, 'a', className || '', entry.name)
  a.href = href
  a.rel = 'noopener'
  if (entry.view === 'iframe') {
    a.target = '_blank'
    return a
  }
  a.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    try {
      context.getOutliner(dom).GotoSubject(entry.target, true, undefined, true, undefined)
      event.preventDefault()
    } catch { /* the plain link does it */ }
  })
  return a
}

const pane = {
  name: 'meeting-page', // not 'meeting': SolidOS's own pane has that name, and a second pane with a taken name is ignored
  icon: svg(MDI.calendar, '#0082c9'),
  audience: [],

  label (subject, context) {
    try { return isMeeting(context.session.store, subject) ? 'Meeting' : null } catch { return null }
  },

  shouldGetFocus (subject) {
    try { return isMeeting(globalThis.SolidLogic && globalThis.SolidLogic.store, subject) } catch { return false }
  },

  // "New Meeting" in a folder's Add menu. The same file SolidOS's pane makes.
  mintClass: { termType: 'NamedNode', value: MEETING + 'Meeting', uri: MEETING + 'Meeting' },

  async mintNew (context, options) {
    const store = context.session.store
    const me = options.me || currentUser(context)
    const index = (options.newInstance && options.newInstance.value) ? options.newInstance.value.split('#')[0] : options.newBase + 'index.ttl'
    const body = `@prefix meeting: <${MEETING}>.\n@prefix cal: <${CAL}>.\n@prefix dc: <${DC}>.\n@prefix ui: <${UI_NS}>.\n@prefix xsd: <${XSD}>.\n\n` +
      '<#this> a meeting:Meeting;\n' +
      (options.title ? `    cal:summary ${turtleText(options.title)};\n` : '') +
      (me ? `    dc:author <${me.value}>;\n` : '') +
      `    dc:created "${new Date().toISOString()}"^^xsd:dateTime;\n` +
      '    ui:backgroundColor "#ddddcc"^^xsd:color;\n' +
      '    meeting:toolList ( <#this> ).\n'
    const response = await webFetch(store)(index, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' }, body })
    if (!response.ok) throw new Error(index.split('/').slice(-2).join('/') + ' was not created (' + response.status + ')')
    return { ...options, newInstance: store.sym(index + '#this') }
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const sym = store.sym.bind(store)
    const doc = subject.doc()
    const root = el(dom, 'div', 'mtg meeting-pane mtg-root')
    root.appendChild(el(dom, 'style', '', CSS))
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null

    // The header card: what, when, where (as chips), who and notes, and the calendar file.
    const card = root.appendChild(el(dom, 'section', 'mtg-card mtg-head'))
    card.id = 'mtg-overview'
    const top = card.appendChild(el(dom, 'div', 'mtg-head-top'))
    top.appendChild(el(dom, 'span', 'mtg-figure')).appendChild(icon(dom, 'calendar'))
    const titles = top.appendChild(el(dom, 'div', 'mtg-titles'))
    titles.appendChild(el(dom, 'p', 'mtg-kicker', 'Meeting'))
    const title = titles.appendChild(el(dom, 'h2', 'mtg-title'))
    const facts = card.appendChild(el(dom, 'div', 'mtg-facts'))
    const actions = card.appendChild(el(dom, 'div', 'mtg-actions'))
    const status = root.appendChild(el(dom, 'div', 'mtg-status'))
    status.setAttribute('role', 'status')
    root.appendChild(el(dom, 'h3', 'mtg-section mtg-subheading', 'For this meeting'))
    const list = root.appendChild(el(dom, 'ul', 'mtg-list'))
    list.id = 'mtg-items'
    const tools = root.appendChild(el(dom, 'div'))
    const foot = root.appendChild(el(dom, 'p', 'mtg-foot'))

    let busy = false
    let canWrite = false
    let editOpen = false
    let armed = null // the item a first Remove press is waiting on
    let armedAt = 0 // when; a confirming press too soon after (a double-click) is ignored
    let navKey = null // what the shell's navigation was last drawn from
    const say = (text, kind) => {
      status.textContent = text || ''
      status.className = 'mtg-status' + (text ? ' mtg-' + (kind || 'info') : '')
      if (suite && text && (kind === 'good' || kind === 'bad')) suite.toast(text, { kind: kind === 'good' ? 'success' : 'error' })
    }
    const st = (s, p, o, g) => rdflib().st(s, p, o, g)
    const value = (term) => { const v = store.any(subject, sym(CAL + term), null, doc); return v ? v.value : '' }

    function setBusy (on) {
      busy = on
      for (const button of root.querySelectorAll('button')) button.disabled = on
    }

    // Who may write: the pod says so in WAC-Allow. Asked fresh, as the header the store kept may be old.
    async function checkAccess () {
      canWrite = false
      if (!currentUser(context)) return
      try {
        const response = await webFetch(store)(doc.value, { method: 'HEAD' })
        const wac = response.headers.get('wac-allow')
        if (wac) canWrite = /user="[^"]*\bwrite\b/.test(wac)
        else canWrite = !!(store.updater && store.updater.editable(doc.value, store))
      } catch { canWrite = false }
    }

    // Read the file fresh, straight from the pod, with the ETag that goes with it.
    async function readFresh () {
      const response = await webFetch(store)(doc.value, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
      if (!response.ok) throw new Error('the meeting could not be read (' + response.status + ')')
      const type = (response.headers.get('content-type') || 'text/turtle').split(';')[0].trim()
      const text = await response.text()
      store.removeMatches(null, null, null, doc)
      await new Promise((resolve, reject) => {
        try { rdflib().parse(text, store, doc.value, type, (error) => error ? reject(error) : resolve()) } catch (error) { reject(error) }
      })
      return response.headers.get('etag')
    }

    // Every change: read fresh, change, write the whole file back only if nobody changed it meanwhile (If-Match),
    // then read it back and say "Saved" only if the pod kept what was sent. A whole-file PUT, not a SPARQL patch:
    // JSS drops a literal holding "}" from a patch and still answers 204 (jss-findings 5), and patches lose lists
    // in JSON-LD files (finding 6). change(items) returns { items, remove, add, check } or null for no change;
    // check() returns null when the file read back is right, or what is wrong.
    async function rewrite (change, done) {
      if (busy) return
      setBusy(true)
      armed = null
      let result = null
      let written = false
      try {
        const etag = await readFresh()
        const had = readList(store, subject, doc)
        const items = had || [subject] // SolidOS's list starts with the meeting itself
        result = change(items)
        if (!result) { setBusy(false); draw(); return }
        const listed = !(had === null && result.items === items) // a meeting with no list keeps having none
        if (listed) store.remove(listStatements(store, subject, doc))
        for (const old of result.remove || []) if (store.holds(old.subject, old.predicate, old.object, old.graph)) store.remove(old)
        for (const add of result.add || []) store.add(add.subject, add.predicate, add.object, add.graph)
        if (listed) store.add(subject, sym(MEETING + 'toolList'), new (rdflib().Collection)(result.items), doc)
        const body = rdflib().serialize(doc, store, doc.value, 'text/turtle')
        const headers = { 'Content-Type': 'text/turtle' }
        if (etag) headers['If-Match'] = etag
        const response = await webFetch(store)(doc.value, { method: 'PUT', headers, body })
        if (response.status === 412) throw new Error('someone changed this meeting a moment ago. It has been read again; try once more.')
        if (!response.ok) throw new Error('the pod refused it (' + response.status + ')')
        written = listed ? result.items.map(t => t.value) : null
      } catch (error) {
        say('Not saved: ' + (error && error.message ? error.message : error), 'bad')
      }
      let reread = false
      try { await readFresh(); reread = true } catch { /* keep what we have */ }
      if (written !== false) {
        let wrong = null
        if (!reread) wrong = 'it was sent, but could not be read back to check.'
        else if (written && (readList(store, subject, doc) || []).map(t => t.value).join(' ') !== written.join(' ')) wrong = 'the pod kept a different list.'
        else if (result.check) wrong = result.check()
        if (wrong) say('Not saved as typed: ' + wrong + ' What the pod has is shown.', 'bad')
        else say(done, 'good')
      }
      setBusy(false)
      draw()
    }

    // A fact is marked with data-fact, whether it is a chip (when, where) or a line under them (who, notes).
    let chips, props
    function fact (label, node, ic) {
      if (ic) {
        const chip = chips.appendChild(el(dom, 'span', 'mtg-chip'))
        chip.dataset.fact = label
        chip.title = label + ': ' + node.textContent
        chip.appendChild(icon(dom, ic))
        chip.appendChild(el(dom, 'span', 'mtg-sr', label + ': '))
        chip.appendChild(node)
        return chip
      }
      props.appendChild(el(dom, 'dt', '', label))
      const dd = props.appendChild(el(dom, 'dd'))
      dd.dataset.fact = label
      dd.appendChild(node)
      return dd
    }

    function drawHeader () {
      title.textContent = value('summary') || nameOf(store, subject) || 'Meeting'
      facts.replaceChildren()
      chips = facts.appendChild(el(dom, 'div', 'mtg-chips'))
      const when = whenText(value('dtstart'), value('dtend'))
      fact('When', el(dom, 'span', when ? '' : 'mtg-none', when ? when.text : 'Not set'), when && when.timed ? 'clock' : 'calendar')
      const where = value('location')
      if (where) {
        const href = /^https?:/i.test(where) ? safeHref(where) : null
        if (href) { const a = el(dom, 'a', '', where); a.href = href; a.rel = 'noopener'; a.target = '_blank'; fact('Where', a, 'place') } else fact('Where', el(dom, 'span', '', where), 'place')
      } else fact('Where', el(dom, 'span', 'mtg-none', 'Not set'), 'place')
      if (when && when.timed) {
        const zone = facts.appendChild(el(dom, 'p', 'mtg-zone', 'Shown in your time zone: ' + zoneName()))
        zone.dataset.fact = 'When'
      }
      props = facts.appendChild(el(dom, 'dl', 'mtg-props'))
      const people = store.each(subject, sym(WF + 'participation'), null, doc).map(p => store.any(p, sym(WF + 'participant'), null, doc)).filter(Boolean)
      const unique = [...new Map(people.map(p => [p.value, p])).values()]
      if (unique.length) fact('Who', el(dom, 'span', '', unique.map(p => personName(store, p)).join(', ')))
      const notes = value('comment')
      if (notes) fact('Notes', el(dom, 'span', 'mtg-notes', notes))

      actions.replaceChildren()
      const ics = buildIcs({ uri: subject.value, summary: value('summary'), start: value('dtstart'), end: value('dtend'), location: value('location'), comment: value('comment') })
      if (ics) {
        const a = actions.appendChild(el(dom, 'a', 'mtg-ics mtg-btn'))
        a.append(icon(dom, 'calendarPlus'), 'Add to calendar')
        a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics)
        a.download = (value('summary') || 'meeting').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60).toLowerCase() + '.ics'
        a.rel = 'noopener'
      } else actions.appendChild(el(dom, 'span', 'mtg-none', 'Add to calendar appears once the meeting has a start.'))
      if (!props.children.length) props.remove()
    }

    function drawList () {
      list.replaceChildren()
      const items = readItems(store, subject, doc)
      items.forEach((entry, i) => {
        const li = list.appendChild(el(dom, 'li', 'mtg-item mtg-row'))
        li.dataset.target = entry.target.value
        li.appendChild(el(dom, 'span', 'mtg-row-icon')).appendChild(icon(dom, KIND_ICON[entry.kind] || 'link'))
        const main = li.appendChild(el(dom, 'span', 'mtg-row-main'))
        main.appendChild(el(dom, 'span', 'mtg-row-title mtg-name')).appendChild(openLink(dom, context, entry))
        main.appendChild(el(dom, 'span', 'mtg-row-sub mtg-kind', entry.kind))
        // The whole row opens the item, as its link does (not when a button or the link itself was pressed).
        li.addEventListener('click', (event) => {
          if (event.target.closest('button, a, input')) return
          const a = li.querySelector('.mtg-name a')
          if (a) a.click()
        })
        if (!canWrite) return
        const moves = li.appendChild(el(dom, 'span', 'mtg-moves mtg-row-actions'))
        const button = (ic, text, label, onClick, className) => {
          const b = moves.appendChild(el(dom, 'button', className))
          b.type = 'button'
          if (ic) { b.appendChild(icon(dom, ic)); b.appendChild(el(dom, 'span', 'mtg-sr', text)); b.title = label } else b.textContent = text
          b.setAttribute('aria-label', label)
          b.addEventListener('click', onClick)
          return b
        }
        const up = button('up', 'Up', 'Move ' + entry.name + ' up', () => move(entry, -1), 'mtg-btn mtg-btn-icon')
        up.dataset.act = 'up'
        up.disabled = i === 0
        const down = button('down', 'Down', 'Move ' + entry.name + ' down', () => move(entry, 1), 'mtg-btn mtg-btn-icon')
        down.dataset.act = 'down'
        down.disabled = i === items.length - 1
        const isArmed = armed === entry.item.value
        const remove = button(isArmed ? null : 'remove', isArmed ? 'Press again to remove' : 'Remove', 'Remove ' + entry.name, (event) => {
          if (armed !== entry.item.value) { armed = entry.item.value; armedAt = Date.now(); drawList(); return }
          if (event.detail > 1 || Date.now() - armedAt < 400) return // the second click of a double-click is not a second press
          removeItem(entry)
        }, isArmed ? 'mtg-btn mtg-btn-danger mtg-armed' : 'mtg-btn mtg-btn-icon mtg-quiet')
        remove.dataset.act = 'remove'
      })
      if (!items.length) {
        const box = list.appendChild(el(dom, 'li', 'mtg-empty'))
        box.appendChild(el(dom, 'span', 'mtg-empty-icon')).appendChild(icon(dom, 'link'))
        box.appendChild(el(dom, 'p', 'mtg-empty-title', 'Nothing here yet'))
        box.appendChild(el(dom, 'p', 'mtg-empty-text', canWrite ? 'Add a link below: an agenda, notes, a chat or a poll.' : 'Nothing has been added to this meeting yet.'))
      }
      // The shell's left column lists the same items: redraw it when they change (not on the first draw: the
      // shell asks for it itself, right after render).
      const key = items.map(e => e.item.value + ' ' + e.name).join('\n')
      if (suite && navKey !== null && key !== navKey) suite.refreshNavigation()
      navKey = key
    }

    // Move one item past its visible neighbour; the hidden details entry keeps its place.
    function move (entry, step) {
      const shown = readItems(store, subject, doc)
      const at = shown.findIndex(e => e.item.value === entry.item.value)
      const other = shown[at + step]
      if (at < 0 || !other) return
      rewrite((items) => {
        const a = items.findIndex(t => t.value === entry.item.value)
        const b = items.findIndex(t => t.value === other.item.value)
        if (a < 0 || b < 0) return null
        const next = items.slice()
        next[a] = items[b]
        next[b] = items[a]
        return { items: next }
      }, entry.name + ' moved ' + (step < 0 ? 'up.' : 'down.'))
    }

    // As SolidOS does: drop the entry, its description, and the meeting's link to its target,
    // unless another entry still points at the same thing.
    function removeItem (entry) {
      rewrite((items) => {
        const next = items.filter(t => t.value !== entry.item.value)
        if (next.length === items.length) return null
        const remove = []
        if (entry.item.value !== subject.value) {
          remove.push(...store.statementsMatching(entry.item, null, null, doc), ...store.statementsMatching(null, null, entry.item, doc).filter(s => s.predicate.value !== MEETING + 'toolList'))
        }
        const stillUsed = next.some(t => { const tg = store.any(t, sym(MEETING + 'target'), null, doc); return (tg && tg.value === entry.target.value) || t.value === entry.target.value })
        if (!stillUsed && entry.target.value !== subject.value) remove.push(...store.statementsMatching(subject, null, entry.target, doc))
        return { items: next, remove }
      }, entry.name + ' was removed.')
    }

    function drawTools () {
      tools.replaceChildren()
      if (!canWrite) return

      // Add a link to the materials, as SolidOS's "Attach meeting materials" does.
      const add = tools.appendChild(el(dom, 'form', 'mtg-box mtg-card mtg-add'))
      add.appendChild(el(dom, 'h3', '', 'Add a link'))
      add.appendChild(el(dom, 'p', 'mtg-hint', 'A page, a document, or a chat, notes or poll that already exists. It goes at the end of the list.'))
      const fields = add.appendChild(el(dom, 'div', 'mtg-fields'))
      const field = (box, labelText, tag, className) => {
        const label = box.appendChild(el(dom, 'label', 'mtg-field' + (className ? ' ' + className : '')))
        label.appendChild(el(dom, 'span', 'mtg-label', labelText))
        return label.appendChild(el(dom, tag, 'mtg-input'))
      }
      const name = field(fields, 'Name', 'input')
      name.type = 'text'
      name.maxLength = 128
      name.placeholder = 'Agenda'
      name.name = 'name'
      const url = field(fields, 'Address (https://)', 'input')
      url.type = 'url'
      url.maxLength = 1024
      url.placeholder = 'https://'
      url.name = 'url'
      const addButton = fields.appendChild(el(dom, 'button', 'mtg-btn mtg-add-btn', 'Add'))
      addButton.type = 'submit'
      add.addEventListener('submit', (event) => {
        event.preventDefault()
        const label = name.value.trim()
        let address
        try { address = new URL(url.value.trim()) } catch { address = null }
        if (!address || address.protocol !== 'https:') { say('The address must start with https://', 'bad'); return }
        // An apostrophe is written percent-encoded: the same address, and JSS garbles IRIs with two of them (finding 3b).
        const target = sym(address.href.replace(/'/g, '%27'))
        const sameSite = address.origin === new URL(doc.value).origin
        rewrite((items) => {
          let n = Date.now()
          while (store.any(sym(doc.value + '#id' + n), null, null, doc)) n++
          const tool = sym(doc.value + '#id' + n)
          const add = [
            st(tool, sym(RDF + 'type'), sym(MEETING + 'Tool'), doc),
            st(tool, sym(RDFS_LABEL), rdflib().literal(label || nameOf(store, target)), doc),
            st(tool, sym(MEETING + 'target'), target, doc),
            st(subject, sym(WF + 'attachment'), target, doc)
          ]
          // A page on another site is shown framed by SolidOS's pane; a pod resource opens in the data browser.
          if (!sameSite) add.push(st(tool, sym(MEETING + 'view'), rdflib().literal('iframe'), doc))
          return { items: [...items, tool], add }
        }, (label || address.href) + ' was added.')
      })

      // The details.
      const edit = tools.appendChild(el(dom, 'details', 'mtg-box mtg-card mtg-edit'))
      edit.open = editOpen
      edit.addEventListener('toggle', () => { editOpen = edit.open })
      edit.appendChild(el(dom, 'summary', '', 'Edit the details'))
      const form = edit.appendChild(el(dom, 'form'))
      form.appendChild(el(dom, 'p', 'mtg-hint mtg-hint-text', 'Times are in your time zone (' + zoneName() + '); everyone else sees them in theirs. Leave a time empty for a whole day.'))
      const editFields = form.appendChild(el(dom, 'div', 'mtg-fields'))
      const input = (labelText, type, className, init) => {
        const input = field(editFields, labelText, type === 'textarea' ? 'textarea' : 'input', className)
        if (type !== 'textarea') input.type = type
        input.value = init || ''
        return input
      }
      const startAt = parseTime(value('dtstart'))
      const endAt = parseTime(value('dtend'))
      const f = {
        summary: input('Title', 'text', 'mtg-wide', value('summary')),
        startDay: input('Starts on', 'date', 'mtg-narrow', startAt ? localDate(startAt) : ''),
        startTime: input('at', 'time', 'mtg-narrow', startAt && !dateOnly(value('dtstart')) ? localClock(startAt) : ''),
        endDay: input('Ends on', 'date', 'mtg-narrow', endAt ? localDate(endAt) : ''),
        endTime: input('at', 'time', 'mtg-narrow', endAt && !dateOnly(value('dtend')) ? localClock(endAt) : ''),
        location: input('Where, or the call link', 'text', 'mtg-wide', value('location')),
        comment: input('Notes', 'textarea', 'mtg-wide', value('comment'))
      }
      f.summary.maxLength = 256
      f.location.maxLength = 256
      f.comment.maxLength = 4000
      for (const [k, v] of Object.entries(f)) v.name = k
      const save = editFields.appendChild(el(dom, 'button', 'mtg-btn mtg-btn-primary', 'Save'))
      save.type = 'submit'
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        // A day alone is written as SolidOS's form writes it (xsd:date); a day and a time as an exact moment.
        const moment = (day, time) => {
          if (!day) return null
          if (!time) return rdflib().literal(day, sym(XSD + 'date'))
          const [y, m, d] = day.split('-').map(Number)
          const [h, min] = time.split(':').map(Number)
          return rdflib().literal(utcStamp(new Date(y, m - 1, d, h, min)), sym(XSD + 'dateTime'))
        }
        const start = moment(f.startDay.value, f.startTime.value)
        const end = moment(f.endDay.value, f.endTime.value)
        if ((f.startTime.value && !f.startDay.value) || (f.endTime.value && !f.endDay.value)) { say('A time needs a day.', 'bad'); return }
        if (end && !start) { say('Set when it starts first.', 'bad'); return }
        if (start && end && parseTime(end.value) < parseTime(start.value)) { say('It cannot end before it starts.', 'bad'); return }
        const wanted = { summary: f.summary.value.trim(), dtstart: start, dtend: end, location: f.location.value.trim(), comment: f.comment.value.trim() }
        const changes = () => {
          const deletions = []
          const insertions = []
          for (const term of EDITED) {
            const old = store.statementsMatching(subject, sym(CAL + term), null, doc)
            const next = wanted[term]
            const nextTerm = !next ? null : (typeof next === 'string' ? rdflib().literal(next) : next)
            if (old.length === 1 && nextTerm && old[0].object.equals(nextTerm)) continue
            if (!old.length && !nextTerm) continue
            deletions.push(...old)
            if (nextTerm) insertions.push(st(subject, sym(CAL + term), nextTerm, doc))
          }
          return { deletions, insertions }
        }
        const first = changes()
        if (!first.deletions.length && !first.insertions.length) { say('Nothing to save.'); return }
        editOpen = false
        const names = { summary: 'the title', dtstart: 'the start', dtend: 'the end', location: 'the place', comment: 'the notes' }
        rewrite((items) => {
          const { deletions, insertions } = changes() // against the file as it is now
          return {
            items,
            remove: deletions,
            add: insertions,
            check: () => {
              const off = EDITED.filter(term => { const w = wanted[term]; return value(term) !== (!w ? '' : typeof w === 'string' ? w : w.value) })
              return off.length ? 'the pod kept something else for ' + off.map(t => names[t]).join(', ') + '.' : null
            }
          }
        }, 'Saved.')
      })
    }

    function draw () {
      drawHeader()
      drawList()
      drawTools()
      if (!currentUser(context) && !status.textContent) say('Log in to change this meeting, if it is yours.')
      foot.textContent = subject.value
      if (busy) setBusy(true)
    }

    draw()
    ;(async () => {
      await checkAccess()
      draw()
      // Names come from people's profiles: fetched in the background, shown when they arrive.
      const people = store.each(subject, sym(WF + 'participation'), null, doc).map(p => store.any(p, sym(WF + 'participant'), null, doc)).filter(p => p && p.termType === 'NamedNode' && !store.any(p, sym(FOAF_NAME)) && !store.any(p, sym(VCARD_FN)))
      if (people.length) Promise.allSettled(people.slice(0, 20).map(p => store.fetcher.load(p.doc()))).then(() => { if (!busy) draw() })
    })()
    return root
  },

  // Inside the suite shell: the meeting's sections as the left column, as SolidOS's meeting pane has tabs:
  // the overview (this page), then every item kept for it, in the list's order. Redrawn after each list change.
  renderNavigation (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const items = readItems(store, subject, subject.doc())
    const nav = el(dom, 'ul', 'mtg-nav-list mtg-shell-nav')
    nav.setAttribute('aria-label', 'This meeting')
    const overview = nav.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'mtg-nav-item'))
    overview.type = 'button'
    overview.setAttribute('aria-current', 'page')
    overview.append(icon(dom, 'info'), el(dom, 'span', 'mtg-nav-label', 'Overview'))
    overview.addEventListener('click', () => { const top = dom.getElementById('mtg-overview'); if (top) top.scrollIntoView({ block: 'start' }) })
    if (items.length) nav.appendChild(el(dom, 'li')).appendChild(el(dom, 'p', 'mtg-caption', 'For this meeting'))
    for (const entry of items) {
      const a = nav.appendChild(el(dom, 'li')).appendChild(openLink(dom, context, entry, 'mtg-nav-item'))
      const label = a.textContent
      a.textContent = ''
      a.dataset.target = entry.target.value
      a.title = label + ' · ' + entry.kind + (entry.view === 'iframe' ? ' (opens in a new tab)' : '')
      a.append(icon(dom, KIND_ICON[entry.kind] || 'link'), el(dom, 'span', 'mtg-nav-label', label))
    }
    return nav
  }
}

export default pane
