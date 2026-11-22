// contacts-pane.js: an address book kept in a pod. A list of people you can search and filter by
// group, and everything known about each person.
//
// One file, no imports. It reads and writes the format of SolidOS's own contacts pane, so a book
// made there opens here and the other way round (PodOS Contacts reads it too):
//
//   index.ttl           <#this> a vcard:AddressBook ; dc:title "Contacts" ;
//                           vcard:nameEmailIndex <people.ttl> ; vcard:groupIndex <groups.ttl> .
//   people.ttl          <Person/1a2b/index.ttl#this> vcard:inAddressBook <index.ttl#this> ; vcard:fn "Alice" .
//   groups.ttl          <index.ttl#this> vcard:includesGroup <Group/Friends.ttl#this> .
//                       <Group/Friends.ttl#this> a vcard:Group ; vcard:fn "Friends" .
//   Group/Friends.ttl   <#this> a vcard:Group ; vcard:fn "Friends" ; vcard:hasMember <../Person/1a2b/index.ttl#this> .
//                       <../Person/1a2b/index.ttl#this> vcard:fn "Alice" .
//   Person/1a2b/index.ttl
//                       <#this> a vcard:Individual ; vcard:fn "Alice" ; vcard:role "…" ; vcard:organization-name "…" ;
//                           vcard:hasEmail <#email1> ; vcard:hasTelephone <#phone1> ; vcard:note "…" ;
//                           vcard:hasAddress <#address> ; vcard:hasPhoto <https://…> ;
//                           vcard:url <#webid> .
//                       <#email1> vcard:value <mailto:alice@example.org> .
//                       <#phone1> vcard:value <tel:+420-123-456> .
//                       <#webid> a vcard:WebID ; vcard:value <https://alice.example.org/profile/card#me> .
//
// A group member with a WebID is listed by the WebID, linked back to the card, as SolidOS does:
//   <#this> vcard:hasMember <https://alice.example.org/profile/card#me> .
//   <https://alice.example.org/profile/card#me> owl:sameAs <../Person/1a2b/index.ttl#this> .
//
// What this pane writes, and when (only for someone the pod lets write; the controls are hidden otherwise):
// (Only ever inside the book's own folder. An existing file is written whole with PUT + If-Match and read back,
// never patched: JSS loses values holding "}" from a SPARQL patch.)
// - "New address book" in a folder's Add menu: index.ttl, people.ttl and groups.ttl. No access rule:
//   the book inherits the folder's.
// - Add a person: a new Person/<id>/index.ttl, and their name in people.ttl.
// - Edit a person: their card; a changed name is changed in people.ttl and in their groups too.
// - New group: a new Group/<name>.ttl, and its entry in groups.ttl.
// - Add to / remove from a group: that group's file.
// - Delete a person: their entry in people.ttl and in every group, then their card and its folder.
//
// In the suite shell (context.suite): the groups are the navigation column (renderNavigation), the header search
// filters the list (search), and results are toasts. Alone: groups are chips above the list. Styled with the suite's
// design sheet (design/embed.mjs). Icons: Material Design Icons (Apache 2.0).

const VCARD = 'http://www.w3.org/2006/vcard/ns#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const DC_TITLE = 'http://purl.org/dc/elements/1.1/title'
const OWL_SAMEAS = 'http://www.w3.org/2002/07/owl#sameAs'
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const WIDE = '(min-width: 760px)'

// The data browser draws a pane afresh when a folder it shows changes (a new Person/ or Group/
// folder does that). What the person was doing is kept here, by book, so the new drawing carries on.
const views = new Map()
// The ETag of this pane's own last read or write of each file, kept across those redraws too. At worst it is
// older than the file, and then the write is refused (412), never made over a newer version.
const etags = new Map()

const CSS = `
/* suite:design begin --prefix ctc --only icon,nav,row,buttons,input,chip,avatar,empty,toast */
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
.ctc-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.ctc-root *, .ctc-root *::before, .ctc-root *::after { box-sizing: border-box }
.ctc-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.ctc-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.ctc-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.ctc-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.ctc-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.ctc-root [hidden] { display: none !important }
.ctc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.ctc-muted { color: var(--sui-text-muted) }
.ctc-small { font-size: var(--sui-text-sm) }
.ctc-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.ctc-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.ctc-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.ctc-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.ctc-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.ctc-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --ctc-i set to url("data:image/svg+xml,...") ---------------------------------- */
.ctc-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--ctc-i) center / contain no-repeat; mask: var(--ctc-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.ctc-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.ctc-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.ctc-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.ctc-nav-item:hover { background: var(--sui-bg-hover) }
.ctc-nav-item[aria-current="page"], .ctc-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.ctc-nav-item .ctc-icon { color: var(--sui-text-muted) }
.ctc-nav-item[aria-current] .ctc-icon { color: inherit }
.ctc-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.ctc-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.ctc-nav-new { margin-bottom: var(--sui-space-2) }
.ctc-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.ctc-list { margin: 0; padding: 0; list-style: none }
.ctc-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.ctc-row:hover { background: var(--sui-bg-hover) }
.ctc-row[aria-selected="true"], .ctc-row[aria-current="true"] { background: var(--sui-primary-light) }
.ctc-row-main { flex: 1 1 auto; min-width: 0 }
.ctc-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.ctc-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.ctc-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.ctc-row-actions { flex: none; display: flex; align-items: center }
.ctc-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.ctc-row-icon .ctc-icon { width: 28px; height: 28px }
.ctc-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .ctc-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.ctc-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.ctc-btn:hover { background: var(--sui-primary-light-hover) }
.ctc-btn:disabled, .ctc-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.ctc-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.ctc-btn-primary:hover { background: var(--sui-primary-element-hover) }
.ctc-btn-tertiary { background: transparent; color: var(--sui-text) }
.ctc-btn-tertiary:hover { background: var(--sui-bg-hover) }
.ctc-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.ctc-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.ctc-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.ctc-btn-icon:hover { background: var(--sui-bg-hover) }
.ctc-btn-wide { width: 100%; justify-content: flex-start }
.ctc-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.ctc-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.ctc-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.ctc-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.ctc-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.ctc-input:hover { border-color: var(--sui-primary-element) }
.ctc-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.ctc-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.ctc-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.ctc-search { position: relative; display: flex; align-items: center; min-width: 0 }
.ctc-search .ctc-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.ctc-search .ctc-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.ctc-select { position: relative; display: block; min-width: 0 }
.ctc-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.ctc-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.ctc-file { position: relative; overflow: hidden }
.ctc-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.ctc-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .ctc-row-check */
.ctc-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.ctc-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.ctc-check-round { border-radius: 50% }
.ctc-check:hover { border-color: var(--sui-primary-element) }
.ctc-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.ctc-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.ctc-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.ctc-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.ctc-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.ctc-segment:hover { background: var(--sui-bg-hover) }
.ctc-segment[aria-pressed="true"], .ctc-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.ctc-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.ctc-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.ctc-chip { cursor: pointer }
button.ctc-chip:hover { background: var(--sui-primary-light-hover) }
.ctc-chip-primary, .ctc-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.ctc-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.ctc-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.ctc-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- avatar: a span with initials, or an <img class="ui-avatar"> -------------------------------------------- */
.ctc-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar); height: var(--sui-avatar); border-radius: 50%; overflow: hidden; background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); line-height: 1; object-fit: cover; text-transform: uppercase; user-select: none }
.ctc-avatar-lg { width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); font-size: var(--sui-text-xl) }
.ctc-avatar-xl { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.ctc-header .ctc-avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.ctc-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.ctc-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.ctc-empty-icon .ctc-icon { width: 48px; height: 48px }
.ctc-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.ctc-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.ctc-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.ctc-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.ctc-toast-error { border-left-color: var(--sui-error) }
.ctc-toast-success { border-left-color: var(--sui-success) }
.ctc-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.ctc-status-error { color: var(--sui-error) }
.ctc-status-success { color: var(--sui-success) }
.ctc-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.ctc-note-error { background: var(--sui-error-light) }
.ctc-note-warning { background: var(--sui-warning-light) }
.ctc-note-success { background: var(--sui-success-light) }
/* suite:design end */
.ctc.contacts-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8) }
.ctc-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2) var(--sui-space-3); margin: 0 0 var(--sui-space-4) }
.ctc-book { min-width: 0; overflow-wrap: anywhere }
.ctc-count { color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.ctc-actions { margin-left: auto }
@media (max-width: 520px) { .ctc-actions { margin-left: 0 } }
.ctc-msg { margin: 0 0 var(--sui-space-3); overflow-wrap: anywhere }
.ctc-msg:empty { display: none }
.ctc-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sui-space-4) }
@media ${WIDE} {
  .ctc-body { grid-template-columns: minmax(240px, 340px) minmax(0, 1fr); gap: 0; align-items: start }
  .ctc-side { padding-right: var(--sui-space-3); border-right: 1px solid var(--sui-border); min-height: 100% }
  .ctc-main { padding-left: var(--sui-space-6); min-width: 0 }
  .ctc-back { display: none }
}
@media not all and ${WIDE} { .ctc.ctc-detail-open .ctc-side { display: none } .ctc:not(.ctc-detail-open) .ctc-main { display: none } }
.ctc-back { margin: 0 0 var(--sui-space-3) calc(-1 * var(--sui-space-2)) }
.ctc-chips { margin: var(--sui-space-3) 0 0 }
.ctc-list { margin: var(--sui-space-3) 0 0 }
button.ctc-row { width: 100%; border: 0; background: transparent; font: inherit; text-align: left }
.ctc-list .ctc-empty { margin: var(--sui-space-8) auto }
.ctc-nav-new { width: 100% }
.ctc-caption { margin-top: var(--sui-space-3) }
.ctc-head { display: flex; align-items: flex-start; gap: var(--sui-space-4); margin: 0 0 var(--sui-space-6) }
.ctc-head-text { min-width: 0 }
.ctc-name { overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden }
.ctc-sub { margin: 0; color: var(--sui-text-muted); overflow-wrap: anywhere }
.ctc-sub:empty { display: none }
.ctc-facts { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 var(--sui-space-4) }
@media (min-width: 520px) { .ctc-facts { grid-template-columns: 140px minmax(0, 1fr) } }
.ctc-facts dt { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding-top: var(--sui-space-3); color: var(--sui-text-muted); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold) }
.ctc-facts dd { margin: 0; min-width: 0; padding: var(--sui-space-3) 0 0; overflow-wrap: anywhere }
@media (min-width: 520px) { .ctc-facts dd + dd { grid-column: 2 } }
@media not all and (min-width: 520px) { .ctc-facts dd { padding: var(--sui-space-1) 0 0 calc(var(--sui-icon) + var(--sui-space-3)) } }
.ctc-facts dd.ctc-pre { white-space: pre-wrap }
.ctc a { color: var(--sui-primary-element); text-decoration: none }
.ctc a:hover { text-decoration: underline }
.ctc-line { display: block }
.ctc-kind { margin-left: var(--sui-space-2); color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.ctc-groups { display: flex; flex-wrap: wrap; gap: var(--sui-space-2); align-items: center }
.ctc-tag:has(button) { padding-right: var(--sui-space-1) }
.ctc-tag { overflow: visible }
/* The × is a 20 px mark with a 44 px hit area (rule 5). */
button.ctc-x::before { content: ""; position: absolute; inset: calc(-1 * var(--sui-space-3)) }
button.ctc-x { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-icon); height: var(--sui-icon); padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer }
button.ctc-x:hover { background: var(--sui-primary-light-hover); color: var(--sui-error) }
button.ctc-x .ctc-icon { width: 16px; height: 16px }
select.ctc-pick { width: auto; max-width: 100%; padding: 0 var(--sui-space-4) }
.ctc-tools { margin: var(--sui-space-6) 0 0; padding-top: var(--sui-space-4); border-top: 1px solid var(--sui-border) }
.ctc-form .ctc-subheading { margin: 0 0 var(--sui-space-4) }
.ctc-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sui-space-3) var(--sui-space-4) }
@media (min-width: 520px) { .ctc-fields { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) } }
.ctc-full { grid-column: 1 / -1 }
.ctc-form .ctc-tools { border-top: 0; padding-top: 0 }
.ctc-hint { margin: var(--sui-space-3) 0 0; color: var(--sui-text-muted) }
`

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
const docOf = (node) => node.value.split('#')[0]

// What the subject is: an address book, a person's card, or neither. A document (no #) that holds
// exactly one book or one person counts as that thing.
function kindOf (store, subject) {
  if (!store || !subject || subject.termType !== 'NamedNode') return null
  const sym = store.sym.bind(store)
  const type = sym(RDF_TYPE)
  if (store.holds(subject, type, sym(VCARD + 'AddressBook'))) return { kind: 'book', node: subject }
  // A WebID profile that is also typed as a vcard:Individual is left to the profile pane.
  if (store.holds(subject, type, sym(VCARD + 'Individual')) && !store.holds(subject, type, sym('http://xmlns.com/foaf/0.1/Person'))) return { kind: 'person', node: subject }
  if (!subject.value.includes('#')) {
    const books = store.each(null, type, sym(VCARD + 'AddressBook'), subject)
    if (books.length === 1) return { kind: 'book', node: books[0] }
    const people = store.each(null, type, sym(VCARD + 'Individual'), subject).filter(p => !store.holds(p, type, sym('http://xmlns.com/foaf/0.1/Person')))
    if (people.length === 1) return { kind: 'person', node: people[0] }
  }
  return null
}

const isWeb = (value) => /^https?:\/\//i.test(value)
const safeHref = (value) => /^(https?:|mailto:|tel:)/i.test(value) ? value : null

function link (dom, href, text) {
  const ok = safeHref(href)
  if (!ok) return el(dom, 'span', '', text)
  const a = el(dom, 'a', '', text)
  a.href = ok
  a.rel = 'noopener'
  if (isWeb(ok)) a.target = '_blank'
  return a
}

function initials (name) {
  // The first letter or digit of the first and last words ("Alice {A}" is AA, not A{).
  const firsts = String(name || '').trim().split(/\s+/).map(w => [...w].find(c => /[\p{L}\p{N}]/u.test(c))).filter(Boolean)
  if (!firsts.length) return '?'
  return (firsts[0] + (firsts.length > 1 ? firsts[firsts.length - 1] : '')).toUpperCase()
}

// Icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box, drawn as masks in the text colour.
const MDI = {
  contacts: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z',
  group: 'M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.66,12.38C7.16,13.34 6.16,14 5,14A3,3 0 0,1 2,11A3,3 0 0,1 5,8M19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14C17.84,14 16.84,13.34 16.34,12.38C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M5.5,18.25C5.5,16.18 8.41,14.5 12,14.5C15.59,14.5 18.5,16.18 18.5,18.25V20H5.5V18.25M0,20V18.5C0,17.11 1.89,15.94 4.45,15.6C3.86,16.28 3.5,17.22 3.5,18.25V20H0M24,20H20.5V18.25C20.5,17.22 20.14,16.28 19.55,15.6C22.11,15.94 24,17.11 24,18.5V20Z',
  plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  back: 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  search: 'M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z',
  email: 'M20,8L12,13L4,8V6L12,11L20,6M20,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.1,4 20,4Z',
  phone: 'M6.62,10.79C8.06,13.62 10.38,15.94 13.21,17.38L15.41,15.18C15.69,14.9 16.08,14.82 16.43,14.93C17.55,15.3 18.75,15.5 20,15.5A1,1 0 0,1 21,16.5V20A1,1 0 0,1 20,21A17,17 0 0,1 3,4A1,1 0 0,1 4,3H7.5A1,1 0 0,1 8.5,4C8.5,5.25 8.7,6.45 9.07,7.57C9.18,7.92 9.1,8.31 8.82,8.59L6.62,10.79Z',
  address: 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z',
  cake: 'M12,6C13.11,6 14,5.1 14,4C14,3.62 13.9,3.27 13.71,2.97L12,0L10.29,2.97C10.1,3.27 10,3.62 10,4A2,2 0 0,0 12,6M16.6,16L15.53,14.92L14.45,16C13.15,17.29 10.87,17.3 9.56,16L8.5,14.92L7.4,16C6.75,16.64 5.88,17 4.96,17C4.23,17 3.56,16.77 3,16.39V21A1,1 0 0,0 4,22H20A1,1 0 0,0 21,21V16.39C20.44,16.77 19.77,17 19.04,17C18.12,17 17.25,16.64 16.6,16M18,9H13V7H11V9H6A3,3 0 0,0 3,12V13.54C3,14.62 3.88,15.5 4.96,15.5C5.5,15.5 6,15.3 6.34,14.93L8.5,12.8L10.61,14.93C11.35,15.67 12.64,15.67 13.38,14.93L15.5,12.8L17.65,14.93C18,15.3 18.5,15.5 19.03,15.5C20.11,15.5 21,14.62 21,13.54V12A3,3 0 0,0 18,9Z',
  webid: 'M12,19.2C9.5,19.2 7.29,17.92 6,16C6.03,14 10,12.9 12,12.9C14,12.9 17.97,14 18,16C16.71,17.92 14.5,19.2 12,19.2M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z',
  web: 'M16.36,14C16.44,13.34 16.5,12.68 16.5,12C16.5,11.32 16.44,10.66 16.36,10H19.74C19.9,10.64 20,11.31 20,12C20,12.69 19.9,13.36 19.74,14M14.59,19.56C15.19,18.45 15.65,17.25 15.97,16H18.92C17.96,17.65 16.43,18.93 14.59,19.56M14.34,14H9.66C9.56,13.34 9.5,12.68 9.5,12C9.5,11.32 9.56,10.65 9.66,10H14.34C14.43,10.65 14.5,11.32 14.5,12C14.5,12.68 14.43,13.34 14.34,14M12,19.96C11.17,18.76 10.5,17.43 10.09,16H13.91C13.5,17.43 12.83,18.76 12,19.96M8,8H5.08C6.03,6.34 7.57,5.06 9.4,4.44C8.8,5.55 8.35,6.75 8,8M5.08,16H8C8.35,17.25 8.8,18.45 9.4,19.56C7.57,18.93 6.03,17.65 5.08,16M4.26,14C4.1,13.36 4,12.69 4,12C4,11.31 4.1,10.64 4.26,10H7.64C7.56,10.66 7.5,11.32 7.5,12C7.5,12.68 7.56,13.34 7.64,14M12,4.03C12.83,5.23 13.5,6.57 13.91,8H10.09C10.5,6.57 11.17,5.23 12,4.03M18.92,8H15.97C15.65,6.75 15.19,5.55 14.59,4.44C16.43,5.07 17.96,6.34 18.92,8M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z',
  note: 'M14,10H19.5L14,4.5V10M5,3H15L21,9V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3M5,12V14H19V12H5M5,16V18H14V16H5Z',
  edit: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  delete: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path${fill ? ` fill="${fill}"` : ''} d="${d}"/></svg>`)
function icon (dom, name) {
  const span = el(dom, 'span', 'ctc-icon')
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--ctc-i', `url("${svg(MDI[name])}")`)
  return span
}
// A button (or other element) with an icon before its text.
function iconned (dom, tag, className, name, text) {
  const node = el(dom, tag, className)
  node.append(icon(dom, name), dom.createTextNode(text))
  return node
}

// A person's avatar: their photo (http(s) only), or their initials when there is none or it does not load.
function face (dom, name, photo, big) {
  const cls = 'ctc-avatar' + (big ? ' ctc-avatar-lg' : '')
  const letters = () => { const box = el(dom, 'span', cls, initials(name)); box.setAttribute('aria-hidden', 'true'); return box }
  if (!photo || !isWeb(photo)) return letters()
  const img = el(dom, 'img', cls)
  img.alt = ''
  img.loading = 'lazy'
  img.referrerPolicy = 'no-referrer'
  img.addEventListener('error', () => img.replaceWith(letters()))
  img.src = photo
  return img
}

const turtleText = (text) => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'
const turtleIri = (iri) => '<' + String(iri).replace(/[\u0000- <>"{}|^`\\]/g, c => encodeURIComponent(c)) + '>'
const shortId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const newUuid = () => { try { return globalThis.crypto.randomUUID() } catch { return shortId() + Math.random().toString(36).slice(2, 10) } }
const emailOk = (value) => /^[^\s@<>"]+@[^\s@<>"]+$/.test(value)
const mailto = (value) => 'mailto:' + value.trim()
const tel = (value) => 'tel:' + value.trim().replace(/[\s().]+/g, '-').replace(/[^\d+\-*#]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
const telOk = (value) => /\d/.test(value) && tel(value).length > 4
// A malformed %-sequence (legal in an IRI) is shown as it is, not thrown.
const decode = (value) => { try { return decodeURIComponent(value) } catch { return String(value) } }
const strip = (value) => decode(String(value).replace(/^(mailto|tel):/i, '')).replace(/^\/\//, '')
// "Group/Friends_and_family.ttl", as SolidOS names a group file.
const groupFileName = (name) => name.replace(/\W/gu, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'group'

// Everything the card says about one person, as plain data.
function readPerson (store, person) {
  const sym = store.sym.bind(store)
  const doc = sym(docOf(person))
  const one = (term) => { const v = store.any(person, sym(VCARD + term), null, doc); return v ? v.value : '' }
  const valued = (term, scheme) => store.each(person, sym(VCARD + term), null, doc).map(node => {
    if (node.termType === 'NamedNode' && node.value.toLowerCase().startsWith(scheme)) return { node, direct: true, value: node.value }
    if (node.termType === 'Literal') return { node, direct: true, value: scheme + node.value }
    const value = store.any(node, sym(VCARD + 'value'), null, doc)
    if (!value) return null
    const kinds = store.each(node, sym(RDF_TYPE), null, doc).map(t => t.value.split(/[#/]/).pop()).filter(k => !/^(Email|Voice|Internet|Pref|TelephoneType|Type)$/.test(k))
    return { node, direct: false, value: value.termType === 'Literal' && !value.value.includes(':') ? scheme + value.value : value.value, kind: kinds.join(', ') }
  }).filter(Boolean)
  const addresses = store.each(person, sym(VCARD + 'hasAddress'), null, doc).map(node => {
    const part = (term) => { const v = store.any(node, sym(VCARD + term), null, doc); return v ? v.value : '' }
    return [part('street-address'), [part('postal-code'), part('locality')].filter(Boolean).join(' '), part('region'), part('country-name')].filter(Boolean)
  }).filter(lines => lines.length)
  const webids = []
  const sites = []
  for (const node of store.each(person, sym(VCARD + 'url'), null, doc)) {
    if (node.termType === 'NamedNode' && !node.value.startsWith(doc.value + '#')) { sites.push(node.value); continue }
    const value = store.any(node, sym(VCARD + 'value'), null, doc)
    if (!value) continue
    if (store.holds(node, sym(RDF_TYPE), sym(VCARD + 'WebID'), doc)) webids.push(value.value); else sites.push(value.value)
  }
  const photoNode = store.any(person, sym(VCARD + 'hasPhoto'), null, doc) || store.any(person, sym(VCARD + 'photo'), null, doc)
  return {
    node: person,
    doc,
    name: one('fn') || (store.any(person, sym(FOAF_NAME), null, doc) || {}).value || '',
    role: one('role'),
    org: one('organization-name'),
    note: one('note'),
    birthday: one('bday'),
    photo: photoNode ? photoNode.value : '',
    emails: valued('hasEmail', 'mailto:'),
    phones: valued('hasTelephone', 'tel:'),
    addresses,
    webids,
    sites,
    loaded: store.holds(person, sym(RDF_TYPE), null, doc) || !!store.any(person, sym(VCARD + 'fn'), null, doc)
  }
}

const pane = {
  name: 'contacts',
  icon: svg(MDI.contacts, '#0082c9'),
  audience: [],

  label (subject, context) {
    try {
      const kind = kindOf(context.session.store, subject)
      return kind ? (kind.kind === 'book' ? 'Address book' : 'Contact') : null
    } catch { return null }
  },

  shouldGetFocus (subject) {
    try { return !!kindOf(globalThis.SolidLogic && globalThis.SolidLogic.store, subject) } catch { return false }
  },

  // "New address book" in a folder's Add menu.
  mintClass: { termType: 'NamedNode', value: VCARD + 'AddressBook', uri: VCARD + 'AddressBook' },

  async mintNew (context, options) {
    const store = context.session.store
    const fetcher = webFetch(store)
    const me = options.me || currentUser(context)
    if (!me) throw new Error('log in to make an address book')
    const base = options.newBase
    const title = options.title || options.instanceName || 'Contacts'
    const put = async (name, text) => {
      const response = await fetcher(base + name, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' }, body: text })
      if (!response.ok) throw new Error(name + ' was not created (' + response.status + ')')
    }
    await put('index.ttl', `@prefix vcard: <${VCARD}>.\n@prefix dc: <http://purl.org/dc/elements/1.1/>.\n@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n\n` +
      `<#this> a vcard:AddressBook;\n    dc:title ${turtleText(title)};\n    acl:owner <${me.value}>;\n    vcard:nameEmailIndex <people.ttl>;\n    vcard:groupIndex <groups.ttl>.\n`)
    await put('people.ttl', `@prefix vcard: <${VCARD}>.\n`)
    await put('groups.ttl', `@prefix vcard: <${VCARD}>.\n`)
    return { ...options, newInstance: store.sym(base + 'index.ttl#this') }
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const sym = store.sym.bind(store)
    const fetcher = (address, options) => webFetch(store)(address, options) // looked up at each call
    const st = (s, p, o, g) => rdflib().st(s, p, o, g)
    const lit = (value) => rdflib().literal(value)
    const V = (term) => sym(VCARD + term)

    // Inside the suite shell the groups are the navigation column and results are toasts; alone they are
    // chips above the list and a line above it.
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null

    const root = el(dom, 'div', 'ctc contacts-pane ctc-root')
    root.appendChild(el(dom, 'style', '', CSS))
    const top = root.appendChild(el(dom, 'div', 'ctc-top'))
    const title = top.appendChild(el(dom, 'h2', 'ctc-heading ctc-book', 'Contacts'))
    const count = top.appendChild(el(dom, 'span', 'ctc-count'))
    const actions = top.appendChild(el(dom, 'div', 'ctc-btns ctc-actions'))
    const status = root.appendChild(el(dom, 'div', 'ctc-msg'))
    status.setAttribute('role', 'status')
    const body = root.appendChild(el(dom, 'div', 'ctc-body'))
    const side = body.appendChild(el(dom, 'div', 'ctc-side'))
    const main = body.appendChild(el(dom, 'div', 'ctc-main'))
    let nav = null // the navigation column's element, in the shell

    // The line says what happened: data-kind is good, bad or info. In the shell a result is a toast instead.
    const LOOK = { info: 'ctc-note', good: 'ctc-status ctc-status-success', bad: 'ctc-note ctc-note-error' }
    const paintStatus = () => {
      // A message from the last action, else what stays true (logged out, or may read but not change).
      const kind = state.message ? state.kind || 'info' : state.standing ? 'info' : ''
      status.textContent = state.message || state.standing || ''
      status.className = 'ctc-msg' + (kind ? ' ' + LOOK[kind] : '')
      if (kind) status.dataset.kind = kind; else delete status.dataset.kind
      status.hidden = !!(suite && kind && kind !== 'info')
    }
    const say = (text, kind) => {
      state.message = text || ''
      state.kind = kind
      paintStatus()
      if (suite && text && (kind === 'good' || kind === 'bad')) suite.toast(text, { kind: kind === 'good' ? 'success' : 'error' })
    }
    const buttons = () => [...root.querySelectorAll('button, select'), ...(nav && nav.isConnected ? nav.querySelectorAll('button') : [])]
    const problem = (error) => (error && error.message ? error.message : String(error))

    const start = kindOf(store, subject) || { kind: subject.value.includes('#') ? 'person' : 'book', node: subject }
    const key = subject.value
    const kept = views.get(key)
    const state = kept ? kept.state : { book: start.kind === 'book' ? start.node : null, selected: start.kind === 'person' ? start.node : null, mode: 'view', group: null, query: '', busy: false, canEdit: false, groups: [], message: '', kind: '' }
    const self = { state, draw: () => draw() }
    views.set(key, self)
    if (suite) suite.state.ctc = self // for renderNavigation and search, called with the same context
    // The drawing on the page now: this one, or a newer one made while this one was saving.
    const live = () => { const v = views.get(key); return v && v !== self && !root.isConnected ? v : self }
    let peopleDoc = null
    let groupDoc = null

    // ---- the data -----------------------------------------------------------------------

    const people = () => {
      if (!state.book || !peopleDoc) return state.selected ? [state.selected] : []
      const seen = new Set()
      return store.each(null, V('inAddressBook'), state.book, peopleDoc).filter(p => p.termType === 'NamedNode' && !seen.has(p.value) && seen.add(p.value))
    }
    const indexName = (person) => { const v = peopleDoc && store.any(person, V('fn'), null, peopleDoc); return v ? v.value : '' }
    const groupsOfBook = () => {
      if (!state.book) return []
      const seen = new Set()
      return store.each(state.book, V('includesGroup'), null, groupDoc || undefined).filter(g => g.termType === 'NamedNode' && !seen.has(g.value) && seen.add(g.value)).map(g => {
        const name = store.any(g, V('fn'), null, groupDoc || undefined) || store.any(g, V('fn'), null, sym(docOf(g)))
        return { node: g, doc: sym(docOf(g)), name: name ? name.value : decode(docOf(g).split('/').pop().replace(/\.ttl$/, '')) }
      }).sort((a, b) => a.name.localeCompare(b.name))
    }
    // The people a group holds: listed directly, or by a WebID that is the same as their card.
    const membersOf = (group) => {
      const out = new Set()
      for (const m of store.each(group.node, V('hasMember'), null, group.doc)) {
        const same = store.each(m, sym(OWL_SAMEAS), null, group.doc)
        if (same.length) same.forEach(s => out.add(s.value)); else out.add(m.value)
      }
      return out
    }
    const groupsOf = (person) => state.groups.filter(g => membersOf(g).has(person.value))

    const entry = (person) => {
      const card = readPerson(store, person)
      if (!card.name) card.name = indexName(person) || decode(docOf(person).replace(/\/index\.ttl$/, '').split('/').pop())
      return card
    }

    // ---- writing ------------------------------------------------------------------------

    // The book's own folder: the only place this pane writes to or deletes from. Anything a book file points
    // at outside it (another folder, another site) is read, never changed.
    const bookFolder = () => state.book ? new URL('./', docOf(state.book)).href : null
    function insideBook (address) {
      const folder = bookFolder()
      if (!folder) return false
      try {
        const url = new URL(address)
        url.hash = ''
        return url.href.startsWith(folder) && url.href !== folder
      } catch { return false }
    }
    // A card the pane may change or delete: a file in the book's folder that is not one of the book's own files.
    function cardInBook (person) {
      const address = docOf(person)
      if (!insideBook(address) || address.endsWith('/')) return false
      const own = [docOf(state.book), peopleDoc && peopleDoc.value, groupDoc && groupDoc.value, ...state.groups.map(g => g.doc.value)]
      return !own.includes(address)
    }

    // Changes that touch several files: each file written whole, one after another. Every file must be in the
    // book's folder.
    async function updateMany (deletions, insertions) {
      const docs = [...new Set([...deletions, ...insertions].map(s => s.why.value))]
      const outside = docs.filter(d => !insideBook(d))
      if (outside.length) throw new Error(outside.join(', ') + ' is outside this address book\'s folder, so nothing was changed')
      for (const d of docs) {
        const del = deletions.filter(s => s.why.value === d)
        const ins = insertions.filter(s => s.why.value === d)
        if (del.length || ins.length) await rewrite(sym(d), del, ins)
      }
    }

    // Every change to an existing file is a whole-file PUT guarded by its ETag, then a fresh read that must
    // show what was meant. Not a patch: JSS reads a SPARQL Update badly when a value holds "}" (the value is
    // lost and the answer is still 204), and blank nodes (as SolidOS writes emails) are not patched safely.
    async function rewrite (doc, del, ins) {
      const rdf = rdflib()
      const key = (s) => s.subject.toNT() + ' ' + s.predicate.toNT() + ' ' + s.object.toNT()
      // The ETag of what the store holds: from this pane's own last read of the file, else from rdflib's
      // (rdflib keeps every response, so after a second read its answer can be an old one).
      let etag = etags.get(doc.value) || null
      if (!etag) try { etag = (store.fetcher.getHeader(doc, 'etag') || [])[0] } catch { /* none known */ }
      if (!etag) await reread(doc)
      etag = etag || etags.get(doc.value) || null
      const gone = new Set(del.map(key))
      const graph = rdf.graph()
      for (const s of store.statementsMatching(null, null, null, doc)) if (!gone.has(key(s))) graph.add(s.subject, s.predicate, s.object, doc)
      for (const s of ins) graph.add(s.subject, s.predicate, s.object, doc)
      const text = rdf.serialize(doc, graph, doc.value, 'text/turtle')
      const headers = { 'Content-Type': 'text/turtle' }
      if (etag) headers['If-Match'] = etag
      const name = doc.value.slice((bookFolder() || '').length) || doc.value
      const response = await fetcher(doc.value, { method: 'PUT', headers, body: text })
      if (response.status === 412) throw new Error(name + ' was changed somewhere else; reload and try again')
      if (!response.ok) throw new Error(name + ' was not saved (' + response.status + ')')
      await reread(doc)
      // Read back: each value written is there, each value taken out is gone (blank nodes are renamed on a
      // read, so statements that hold one are not compared).
      const plain = (s) => s.subject.termType !== 'BlankNode' && s.object.termType !== 'BlankNode'
      const there = (s) => store.statementsMatching(s.subject, s.predicate, null, doc).some(x => x.object.termType === s.object.termType && x.object.value === s.object.value)
      const kept = new Set(ins.map(key))
      const lost = ins.filter(plain).filter(s => !there(s))
      const stuck = del.filter(plain).filter(s => !kept.has(key(s)) && there(s))
      if (lost.length || stuck.length) {
        const what = [...lost, ...stuck].map(s => s.object.value).slice(0, 2).join(', ')
        throw new Error('the pod did not keep it as typed (' + what + ' in ' + name + '); reload to see what it holds')
      }
    }

    // Read a file afresh into the store (its old statements dropped first: a forced load only adds), keeping its ETag.
    async function reread (doc) {
      const response = await fetcher(doc.value, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
      if (!response.ok) throw new Error(doc.value + ' could not be read back (' + response.status + ')')
      const text = await response.text()
      const etag = response.headers.get('etag')
      if (etag) etags.set(doc.value, etag); else etags.delete(doc.value)
      store.removeMatches(null, null, null, doc)
      rdflib().parse(text, store, doc.value, 'text/turtle')
    }

    async function act (work, done) {
      if (state.busy) return
      state.busy = true
      for (const b of buttons()) b.disabled = true
      try {
        const message = await work()
        say(message || done, 'good')
      } catch (error) {
        say('Not saved: ' + problem(error), 'bad')
      }
      state.busy = false
      live().draw()
    }

    const putNew = async (address, text) => {
      if (!insideBook(address)) throw new Error(address + ' is outside this address book\'s folder')
      const response = await fetcher(address, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' }, body: text })
      if (!response.ok) throw new Error(address.split('/').slice(-2).join('/') + ' was not created (' + response.status + ')')
    }

    function readForm (form) {
      const value = (name) => { const input = form.querySelector('[name="' + name + '"]'); return input ? input.value.trim() : '' }
      return { name: value('name'), role: value('role'), org: value('org'), note: value('note') }
    }

    // A card and its Person/<id>/ folder, deleted; only inside the book's folder.
    async function deleteCard (address) {
      if (!insideBook(address)) return false
      const gone = await fetcher(address, { method: 'DELETE' })
      if (!gone.ok && gone.status !== 404) return false
      try { store.removeDocument(sym(address)) } catch { try { store.fetcher.unload(sym(address)) } catch { /* only tidying */ } }
      if (/\/Person\/[^/]+\/index\.ttl$/.test(address)) {
        const folder = address.replace(/index\.ttl$/, '')
        try {
          if (!insideBook(folder)) return true
          await store.fetcher.load(sym(folder), { force: true })
          if (!store.any(sym(folder), sym(LDP_CONTAINS))) await fetcher(folder, { method: 'DELETE' })
        } catch { /* the folder is left; it does no harm */ }
      }
      return true
    }

    async function addPerson (form) {
      const fields = readForm(form)
      const email = (form.querySelector('[name=email]').value || '').trim()
      const phone = (form.querySelector('[name=phone]').value || '').trim()
      if (!fields.name) throw new Error('a name is needed')
      if (email && !emailOk(email)) throw new Error('that email address does not look right')
      if (phone && !telOk(phone)) throw new Error('that phone number does not look right')
      const address = new URL('Person/' + newUuid() + '/index.ttl', docOf(state.book)).href
      let text = `@prefix vcard: <${VCARD}>.\n\n<#this> a vcard:Individual;\n    vcard:fn ${turtleText(fields.name)}`
      if (fields.role) text += `;\n    vcard:role ${turtleText(fields.role)}`
      if (fields.org) text += `;\n    vcard:organization-name ${turtleText(fields.org)}`
      if (fields.note) text += `;\n    vcard:note ${turtleText(fields.note)}`
      if (email) text += ';\n    vcard:hasEmail <#email1>'
      if (phone) text += ';\n    vcard:hasTelephone <#phone1>'
      text += '.\n'
      if (email) text += `<#email1> vcard:value ${turtleIri(mailto(email))}.\n`
      if (phone) text += `<#phone1> vcard:value ${turtleIri(tel(phone))}.\n`
      await putNew(address, text)
      const person = sym(address + '#this')
      try {
        await store.fetcher.load(person.doc(), { force: true })
        const name = store.any(person, V('fn'), null, person.doc())
        if (!name || name.value !== fields.name) throw new Error('the pod did not keep the name as typed')
        await updateMany([], [st(person, V('inAddressBook'), state.book, peopleDoc), st(person, V('fn'), lit(fields.name), peopleDoc)])
      } catch (error) {
        // Not listed in the book: take the new card away again rather than leave it lying in the folder.
        const cleaned = await deleteCard(address).catch(() => false)
        throw new Error(problem(error) + (cleaned ? '; the new card was removed again' : '; a card was left at ' + address))
      }
      state.selected = person
      state.mode = 'view'
      return fields.name + ' was added.'
    }

    // The changes to one list of values (emails or phones): each existing one kept, changed or
    // removed by its own input, and a new one from the blank input.
    function valueChanges (card, list, term, inputs, make, check, prefix, deletions, insertions) {
      const doc = card.doc
      inputs.forEach((input, i) => {
        const now = input.value.trim()
        const old = list[i]
        if (old) {
          if (now && make(now) === old.value) return
          if (now && !check(now)) throw new Error('"' + now + '" does not look right')
          if (old.direct) {
            deletions.push(...store.statementsMatching(card.node, V(term), old.node, doc))
            if (now) insertions.push(st(card.node, V(term), sym(make(now)), doc))
          } else if (!now) {
            deletions.push(...store.statementsMatching(card.node, V(term), old.node, doc), ...store.statementsMatching(old.node, null, null, doc))
          } else {
            deletions.push(...store.statementsMatching(old.node, V('value'), null, doc))
            insertions.push(st(old.node, V('value'), sym(make(now)), doc))
          }
        } else if (now) {
          if (!check(now)) throw new Error('"' + now + '" does not look right')
          const node = sym(doc.value + '#' + prefix + shortId())
          insertions.push(st(card.node, V(term), node, doc), st(node, V('value'), sym(make(now)), doc))
        }
      })
    }

    async function savePerson (form) {
      if (!cardInBook(state.selected)) throw new Error('this card is outside the address book\'s folder')
      const card = entry(state.selected)
      const doc = card.doc
      const fields = readForm(form)
      if (!fields.name) throw new Error('a name is needed')
      const deletions = []
      const insertions = []
      for (const [key, term] of [['name', 'fn'], ['role', 'role'], ['org', 'organization-name'], ['note', 'note']]) {
        const old = store.statementsMatching(card.node, V(term), null, doc)
        if (old.length === 1 && old[0].object.value === fields[key]) continue
        if (!old.length && !fields[key]) continue
        deletions.push(...old)
        if (fields[key]) insertions.push(st(card.node, V(term), lit(fields[key]), doc))
      }
      valueChanges(card, card.emails, 'hasEmail', [...form.querySelectorAll('[name=email]')], mailto, emailOk, 'email', deletions, insertions)
      valueChanges(card, card.phones, 'hasTelephone', [...form.querySelectorAll('[name=phone]')], tel, telOk, 'phone', deletions, insertions)
      // A new name is also written where the book and its groups (in the book's folder) keep a copy of it.
      if (insertions.some(s => s.predicate.value === VCARD + 'fn')) {
        for (const where of [peopleDoc, ...state.groups.map(g => g.doc)].filter(d => d && insideBook(d.value))) {
          const copies = store.statementsMatching(card.node, V('fn'), null, where)
          if (!copies.length) continue
          deletions.push(...copies)
          insertions.push(st(card.node, V('fn'), lit(fields.name), where))
        }
      }
      if (!deletions.length && !insertions.length) { state.mode = 'view'; return 'Nothing had changed.' }
      await updateMany(deletions, insertions)
      state.mode = 'view'
      return 'Saved.'
    }

    async function newGroup (name) {
      if (!name) throw new Error('a group needs a name')
      const existing = state.groups.find(g => g.name.toLowerCase() === name.toLowerCase())
      if (existing) { state.group = existing.node.value; return name + ' is already a group.' }
      const folder = new URL('Group/', docOf(state.book)).href
      let address = folder + groupFileName(name) + '.ttl'
      if (state.groups.some(g => g.doc.value === address)) address = folder + groupFileName(name) + '_' + shortId() + '.ttl'
      await putNew(address, `@prefix vcard: <${VCARD}>.\n\n${turtleIri(state.book.value)} vcard:includesGroup <#this>.\n<#this> a vcard:Group;\n    vcard:fn ${turtleText(name)}.\n`)
      const group = sym(address + '#this')
      await store.fetcher.load(group.doc(), { force: true })
      await updateMany([], [st(state.book, V('includesGroup'), group, groupDoc), st(group, sym(RDF_TYPE), V('Group'), groupDoc), st(group, V('fn'), lit(name), groupDoc)])
      state.groups = groupsOfBook()
      return 'Group ' + name + ' was made.'
    }

    async function join (person, group) {
      const card = entry(person)
      const g = group.doc
      const insertions = []
      if (!store.holds(person, V('fn'), null, g)) insertions.push(st(person, V('fn'), lit(card.name), g))
      if (card.webids.length) {
        for (const webid of card.webids) {
          if (!store.holds(group.node, V('hasMember'), sym(webid), g)) insertions.push(st(group.node, V('hasMember'), sym(webid), g))
          if (!store.holds(sym(webid), sym(OWL_SAMEAS), person, g)) insertions.push(st(sym(webid), sym(OWL_SAMEAS), person, g))
        }
      } else if (!store.holds(group.node, V('hasMember'), person, g)) insertions.push(st(group.node, V('hasMember'), person, g))
      if (insertions.length) await updateMany([], insertions)
      return card.name + ' was added to ' + group.name + '.'
    }

    // What to take out of one group file so that it no longer holds this person.
    function leaving (person, group) {
      const g = group.doc
      const out = [...store.statementsMatching(group.node, V('hasMember'), person, g), ...store.statementsMatching(person, null, null, g)]
      for (const alias of store.each(null, sym(OWL_SAMEAS), person, g)) {
        out.push(...store.statementsMatching(alias, sym(OWL_SAMEAS), person, g))
        if (store.each(alias, sym(OWL_SAMEAS), null, g).length < 2) out.push(...store.statementsMatching(group.node, V('hasMember'), alias, g))
      }
      return out
    }

    async function leave (person, group) {
      const out = leaving(person, group)
      if (out.length) await updateMany(out, [])
      return entry(person).name + ' was taken out of ' + group.name + '.'
    }

    // Delete: out of people.ttl and the groups (those in the book's folder), then the card itself, but only a card
    // in the book's folder. An entry pointing anywhere else is taken out of the book and its file left alone.
    async function remove (person) {
      const card = entry(person)
      const address = docOf(person)
      const deletions = []
      for (const group of state.groups.filter(g => insideBook(g.doc.value))) deletions.push(...leaving(person, group))
      if (peopleDoc) deletions.push(...store.statementsMatching(person, null, null, peopleDoc))
      await updateMany(deletions, [])
      state.selected = null
      state.mode = 'view'
      if (!cardInBook(person)) return card.name + ' was taken out of the book. Their card (' + address + ') is not in the book\'s folder, so it was left as it is.'
      if (!await deleteCard(address)) throw new Error('the card was taken out of the book, but the file was not deleted')
      return card.name + ' was deleted.'
    }

    // ---- drawing ------------------------------------------------------------------------

    const finder = el(dom, 'div', 'ctc-search')
    finder.appendChild(icon(dom, 'search'))
    const search = finder.appendChild(el(dom, 'input', 'ctc-input'))
    search.type = 'search'
    search.placeholder = 'Search contacts'
    search.setAttribute('aria-label', 'Search people by name, email or work')
    search.value = state.query
    search.addEventListener('input', () => { state.query = search.value; drawList() })
    self.setQuery = (query) => { state.query = String(query || ''); search.value = state.query; drawList() }
    const chips = el(dom, 'div', 'ctc-chips')
    chips.setAttribute('role', 'group')
    chips.setAttribute('aria-label', 'Groups')
    const list = el(dom, 'ul', 'ctc-list')
    list.setAttribute('aria-label', 'People')
    if (state.book) side.append(finder, ...(suite ? [] : [chips]), list)

    function matches (card) {
      const q = state.query.trim().toLowerCase()
      if (!q) return true
      return [card.name, card.role, card.org, card.note, ...card.emails.map(e => strip(e.value)), ...card.phones.map(p => strip(p.value))].join(' ').toLowerCase().includes(q)
    }

    // Choosing a group (a chip alone, a navigation item in the shell). On a phone the list shows again.
    function chooseGroup (value) {
      state.group = value
      if (state.mode === 'add' || state.mode === 'group') state.mode = 'view'
      if (globalThis.matchMedia && !globalThis.matchMedia(WIDE).matches && state.mode === 'view') state.selected = null
      draw()
    }
    const startAdd = () => { state.mode = 'add'; state.selected = null; say(''); draw() }
    const startGroup = () => { state.mode = 'group'; state.selected = null; say(''); draw() }

    function drawChips () {
      chips.replaceChildren()
      if (!state.groups.length) { chips.hidden = true; return }
      chips.hidden = false
      const chip = (text, value) => {
        const b = chips.appendChild(el(dom, 'button', 'ctc-chip', text))
        b.type = 'button'
        b.dataset.group = value || ''
        b.setAttribute('aria-pressed', String((state.group || '') === (value || '')))
        b.addEventListener('click', () => chooseGroup(value))
      }
      chip('All contacts', null)
      for (const g of state.groups) chip(g.name, g.node.value)
    }

    // The navigation column (shell only): New contact, All contacts, each group with its count, New group.
    self.navigation = () => {
      if (!state.book) return null
      nav = el(dom, 'div', 'ctc-navigation')
      drawNav()
      return nav
    }
    function drawNav () {
      if (!nav) return
      nav.replaceChildren()
      if (state.canEdit) {
        const add = nav.appendChild(iconned(dom, 'button', 'ctc-btn ctc-btn-primary ctc-nav-new ctc-add', 'plus', 'New contact'))
        add.type = 'button'
        add.addEventListener('click', startAdd)
      }
      const everyone = people()
      const item = (ul, label, value, n, ic) => {
        const b = ul.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'ctc-nav-item'))
        b.type = 'button'
        b.dataset.group = value || ''
        b.append(icon(dom, ic), el(dom, 'span', 'ctc-nav-label', label))
        if (n !== undefined) b.appendChild(el(dom, 'span', 'ctc-nav-count', String(n)))
        if ((state.group || '') === (value || '')) b.setAttribute('aria-current', 'page')
        b.addEventListener('click', () => chooseGroup(value))
        return b
      }
      const all = nav.appendChild(el(dom, 'ul', 'ctc-nav-list'))
      item(all, 'All contacts', null, everyone.length, 'contacts')
      if (!state.groups.length && !state.canEdit) return
      nav.appendChild(el(dom, 'h3', 'ctc-caption', 'Groups'))
      const groups = nav.appendChild(el(dom, 'ul', 'ctc-nav-list'))
      groups.setAttribute('aria-label', 'Groups')
      for (const g of state.groups) { const members = membersOf(g); item(groups, g.name, g.node.value, everyone.filter(p => members.has(p.value)).length, 'group') }
      if (state.canEdit) {
        const b = groups.appendChild(el(dom, 'li')).appendChild(iconned(dom, 'button', 'ctc-nav-item ctc-new-group', 'plus', 'New group'))
        b.type = 'button'
        b.addEventListener('click', startGroup)
      }
    }

    function emptyState (iconName, titleText, text) {
      const box = el(dom, 'div', 'ctc-empty')
      box.appendChild(el(dom, 'span', 'ctc-empty-icon')).appendChild(icon(dom, iconName))
      box.appendChild(el(dom, 'p', 'ctc-empty-title', titleText))
      if (text) box.appendChild(el(dom, 'p', 'ctc-empty-text', text))
      return box
    }

    function drawList () {
      list.replaceChildren()
      const group = state.groups.find(g => g.node.value === state.group)
      const inGroup = group ? membersOf(group) : null
      const cards = people().filter(p => !inGroup || inGroup.has(p.value)).map(entry).filter(matches).sort((a, b) => a.name.localeCompare(b.name))
      for (const card of cards) {
        const li = list.appendChild(el(dom, 'li'))
        const row = li.appendChild(el(dom, 'button', 'ctc-row'))
        row.type = 'button'
        row.dataset.person = card.node.value
        if (state.selected && state.selected.value === card.node.value) row.setAttribute('aria-current', 'true')
        row.appendChild(face(dom, card.name, card.photo))
        const text = row.appendChild(el(dom, 'span', 'ctc-row-main'))
        text.appendChild(el(dom, 'span', 'ctc-row-title', card.name))
        const sub = [card.role, card.org].filter(Boolean).join(' · ')
        const subline = text.appendChild(el(dom, 'span', 'ctc-row-sub', sub))
        if (!sub) subline.hidden = true
        row.addEventListener('click', () => { state.selected = card.node; state.mode = 'view'; say(''); draw(); if (!globalThis.matchMedia || !globalThis.matchMedia(WIDE).matches) root.scrollIntoView({ block: 'start' }) })
      }
      if (!cards.length) {
        const li = list.appendChild(el(dom, 'li'))
        if (people().length) li.appendChild(emptyState('search', 'No one matches.'))
        else li.appendChild(emptyState('contacts', state.canEdit ? 'No one here yet' : 'This address book is empty.', state.canEdit ? 'Add a person with New contact.' : ''))
      }
      const total = people().length
      count.textContent = state.book ? (total === 1 ? '1 person' : total + ' people') : ''
    }

    function backButton () {
      const back = iconned(dom, 'button', 'ctc-btn ctc-btn-tertiary ctc-back', 'back', 'All contacts')
      back.type = 'button'
      back.addEventListener('click', () => { state.selected = null; state.mode = 'view'; draw() })
      return back
    }

    function fact (facts, iconName, label, ...nodes) {
      if (!nodes.length) return
      const dt = facts.appendChild(el(dom, 'dt'))
      if (iconName) dt.appendChild(icon(dom, iconName))
      dt.appendChild(dom.createTextNode(label))
      const dd = facts.appendChild(el(dom, 'dd'))
      dd.append(...nodes)
      return dd
    }

    function drawPerson () {
      const card = entry(state.selected)
      const box = main.appendChild(el(dom, 'article', 'ctc-card ctc-person'))
      const head = box.appendChild(el(dom, 'div', 'ctc-head'))
      head.appendChild(face(dom, card.name, card.photo, true))
      const headText = head.appendChild(el(dom, 'div', 'ctc-head-text'))
      const nameEl = headText.appendChild(el(dom, 'h3', 'ctc-title ctc-name', card.name))
      nameEl.title = card.name
      headText.appendChild(el(dom, 'p', 'ctc-sub', [card.role, card.org].filter(Boolean).join(' · ')))
      const facts = box.appendChild(el(dom, 'dl', 'ctc-facts'))
      const lines = (items) => items.map(item => { const line = el(dom, 'span', 'ctc-line'); line.appendChild(link(dom, item.value, strip(item.value))); if (item.kind) line.appendChild(el(dom, 'span', 'ctc-kind', item.kind)); return line })
      fact(facts, 'email', card.emails.length > 1 ? 'Emails' : 'Email', ...lines(card.emails))
      fact(facts, 'phone', card.phones.length > 1 ? 'Phones' : 'Phone', ...lines(card.phones))
      card.addresses.forEach((address, i) => fact(facts, i ? '' : 'address', i ? '' : 'Address', ...address.map(line => el(dom, 'span', 'ctc-line', line))))
      if (card.birthday) fact(facts, 'cake', 'Born', el(dom, 'span', '', card.birthday))
      if (card.webids.length) fact(facts, 'webid', 'WebID', ...card.webids.map(w => { const line = el(dom, 'span', 'ctc-line'); line.appendChild(link(dom, w, w)); return line }))
      if (card.sites.length) fact(facts, 'web', 'Web', ...card.sites.map(w => { const line = el(dom, 'span', 'ctc-line'); line.appendChild(link(dom, w, w.replace(/^https?:\/\//, '').replace(/\/$/, ''))); return line }))
      if (card.note) fact(facts, 'note', 'Notes', el(dom, 'span', '', card.note)).className = 'ctc-pre'
      if (state.book) {
        const mine = groupsOf(card.node)
        const others = state.groups.filter(g => !mine.includes(g))
        if (mine.length || (state.canEdit && others.length)) {
          const wrap = el(dom, 'div', 'ctc-groups')
          for (const g of mine) {
            const tag = wrap.appendChild(el(dom, 'span', 'ctc-chip ctc-chip-primary ctc-tag'))
            tag.appendChild(el(dom, 'span', '', g.name))
            if (state.canEdit) {
              const x = tag.appendChild(el(dom, 'button', 'ctc-x'))
              x.appendChild(icon(dom, 'close'))
              x.type = 'button'
              x.dataset.leave = g.node.value
              x.setAttribute('aria-label', 'Take ' + card.name + ' out of ' + g.name)
              x.title = 'Take out of ' + g.name
              x.addEventListener('click', () => act(() => leave(card.node, g)))
            }
          }
          if (state.canEdit && others.length) {
            const pick = wrap.appendChild(el(dom, 'select', 'ctc-input ctc-pick'))
            pick.setAttribute('aria-label', 'Add to a group')
            pick.appendChild(el(dom, 'option', '', 'Add to group…')).value = ''
            for (const g of others) pick.appendChild(el(dom, 'option', '', g.name)).value = g.node.value
            pick.addEventListener('change', () => { const g = others.find(o => o.node.value === pick.value); if (g) act(() => join(card.node, g)) })
          }
          fact(facts, 'group', 'Groups', wrap)
        }
      }
      if (!facts.children.length) box.appendChild(el(dom, 'p', 'ctc-hint', card.loaded ? 'Nothing else is known about ' + card.name + ' yet.' : 'Reading the card…'))
      if (state.canEdit && card.loaded) {
        const tools = box.appendChild(el(dom, 'div', 'ctc-btns ctc-tools'))
        if (!state.book || cardInBook(card.node)) { // a card outside the book's folder is not changed from here
          const edit = tools.appendChild(iconned(dom, 'button', 'ctc-btn ctc-edit', 'edit', 'Edit'))
          edit.type = 'button'
          edit.addEventListener('click', () => { state.mode = 'edit'; say(''); draw() })
        } else tools.appendChild(el(dom, 'p', 'ctc-hint ctc-outside', 'This card is kept outside the address book\'s folder, so it cannot be changed here. Delete only takes it out of the book.'))
        if (state.book) {
          const del = tools.appendChild(iconned(dom, 'button', 'ctc-btn ctc-btn-tertiary ctc-delete', 'delete', 'Delete'))
          del.type = 'button'
          let armed = false
          del.addEventListener('click', () => {
            if (!armed) { armed = true; del.replaceChildren(icon(dom, 'delete'), dom.createTextNode('Press again to delete ' + card.name)); del.classList.add('ctc-btn-danger'); return }
            act(() => remove(card.node))
          })
          del.addEventListener('blur', () => { armed = false; del.replaceChildren(icon(dom, 'delete'), dom.createTextNode('Delete')); del.classList.remove('ctc-btn-danger') })
        }
      }
    }

    function formField (fields, text, name, value, type, full) {
      const label = fields.appendChild(el(dom, 'label', 'ctc-field' + (full ? ' ctc-full' : '')))
      if (text) label.appendChild(el(dom, 'span', 'ctc-label', text))
      const input = label.appendChild(el(dom, type === 'textarea' ? 'textarea' : 'input', 'ctc-input'))
      if (type !== 'textarea') input.type = type || 'text'
      input.name = name
      input.value = value || ''
      input.maxLength = type === 'textarea' ? 4000 : name === 'group' ? 120 : 200
      if (!text) input.setAttribute('aria-label', name === 'email' ? 'Email' : name === 'phone' ? 'Phone' : name)
      return input
    }

    function formTools (form, saveText) {
      const tools = form.appendChild(el(dom, 'div', 'ctc-btns ctc-tools'))
      tools.appendChild(el(dom, 'button', 'ctc-btn ctc-btn-primary', saveText)).type = 'submit'
      const cancel = tools.appendChild(el(dom, 'button', 'ctc-btn ctc-btn-tertiary', 'Cancel'))
      cancel.type = 'button'
      cancel.addEventListener('click', () => { state.mode = 'view'; say(''); draw() })
    }

    function drawForm (card) {
      const form = main.appendChild(el(dom, 'form', 'ctc-card ctc-form'))
      form.appendChild(el(dom, 'h3', 'ctc-subheading', card ? 'Edit ' + card.name : 'New contact'))
      const fields = form.appendChild(el(dom, 'div', 'ctc-fields'))
      const field = (...args) => formField(fields, ...args)
      field('Name', 'name', card && card.name, 'text', true).required = true
      const several = (text, name, items, type) => {
        items.forEach((item, i) => field(i ? '' : text, name, strip(item.value), type))
        field(items.length ? 'Another ' + text.toLowerCase() : text, name, '', type)
      }
      several('Email', 'email', card ? card.emails : [], 'email')
      several('Phone', 'phone', card ? card.phones : [], 'tel')
      field('Role', 'role', card && card.role)
      field('Organisation', 'org', card && card.org)
      field('Notes', 'note', card && card.note, 'textarea', true)
      formTools(form, card ? 'Save' : 'Add')
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        act(() => card ? savePerson(form) : addPerson(form))
      })
      setTimeout(() => { try { form.querySelector('input').focus({ preventScroll: true }) } catch { /* fine */ } }, 0)
    }

    function drawGroupForm () {
      const form = main.appendChild(el(dom, 'form', 'ctc-card ctc-form ctc-group-form'))
      form.appendChild(el(dom, 'h3', 'ctc-subheading', 'New group'))
      const fields = form.appendChild(el(dom, 'div', 'ctc-fields'))
      const input = formField(fields, 'Name', 'group', '', 'text', true)
      input.required = true
      formTools(form, 'Make group')
      form.addEventListener('submit', (event) => { event.preventDefault(); const name = input.value.trim(); act(async () => { const m = await newGroup(name); state.mode = 'view'; return m }) })
      setTimeout(() => { try { input.focus({ preventScroll: true }) } catch { /* fine */ } }, 0)
    }

    function drawMain () {
      main.replaceChildren()
      const open = !!state.selected || state.mode === 'add' || state.mode === 'group'
      root.classList.toggle('ctc-detail-open', open || !state.book)
      if (state.book && open) main.appendChild(backButton())
      if (state.mode === 'add' && state.canEdit) return drawForm(null)
      if (state.mode === 'group' && state.canEdit) return drawGroupForm()
      if (state.selected && state.mode === 'edit' && state.canEdit && cardInBook(state.selected)) return drawForm(entry(state.selected))
      if (state.selected) return drawPerson()
      main.appendChild(people().length ? emptyState('contacts', 'No contact selected', 'Pick someone to see everything known about them.') : emptyState('contacts', 'No contacts', 'No one is in this address book yet.')).classList.add('ctc-pick-hint')
    }

    function drawTop () {
      if (state.book) {
        const t = store.any(state.book, sym(DC_TITLE), null, sym(docOf(state.book)))
        title.textContent = t ? t.value : 'Address book'
      } else {
        title.textContent = 'Contact'
      }
      actions.replaceChildren()
      if (state.book && state.canEdit && !suite) { // in the shell these are in the navigation column
        const add = actions.appendChild(iconned(dom, 'button', 'ctc-btn ctc-btn-primary ctc-add', 'plus', 'New contact'))
        add.type = 'button'
        add.addEventListener('click', startAdd)
        const group = actions.appendChild(iconned(dom, 'button', 'ctc-btn ctc-new-group', 'plus', 'New group'))
        group.type = 'button'
        group.addEventListener('click', startGroup)
      }
    }

    // While a form is open, only the list is redrawn, so nothing typed is lost.
    function refresh () {
      if (state.busy) return
      if (state.mode === 'view') draw(); else if (state.book) { drawChips(); drawList(); drawNav() }
    }

    function draw () {
      paintStatus()
      drawTop()
      if (state.book) { drawChips(); drawList(); drawNav() }
      drawMain()
      if (state.busy) for (const b of buttons()) b.disabled = true
    }

    // ---- loading ------------------------------------------------------------------------

    // Can this person change the book? The server says, in the WAC-Allow header rdflib keeps.
    function writable (doc) {
      if (!currentUser(context)) return false
      try { return !!store.updater.editable(doc.value, store) } catch { return false }
    }

    async function loadCards (list) {
      let next = 0
      let last = 0
      const work = async () => {
        while (next < list.length) {
          const person = list[next++]
          try { await store.fetcher.load(sym(docOf(person))) } catch { /* shown by name only */ }
          if (Date.now() - last > 250) { last = Date.now(); refresh() }
        }
      }
      await Promise.all([1, 2, 3, 4, 5, 6].map(work))
    }

    async function loadBook () {
      const bookDoc = sym(docOf(state.book))
      try { await store.fetcher.load(bookDoc) } catch (error) { say('The address book could not be read: ' + problem(error), 'bad'); return }
      peopleDoc = store.any(state.book, V('nameEmailIndex'), null, bookDoc)
      groupDoc = store.any(state.book, V('groupIndex'), null, bookDoc)
      peopleDoc = peopleDoc ? sym(docOf(peopleDoc)) : null
      groupDoc = groupDoc ? sym(docOf(groupDoc)) : null
      const loads = []
      if (peopleDoc) loads.push(store.fetcher.load(peopleDoc).catch(() => say('The list of people could not be read.', 'bad')))
      if (groupDoc) loads.push(store.fetcher.load(groupDoc).catch(() => { /* a book without groups */ }))
      await Promise.all(loads)
      state.canEdit = !!peopleDoc && writable(peopleDoc) && (!groupDoc || writable(groupDoc))
      state.groups = groupsOfBook()
      draw()
      await Promise.all(state.groups.map(g => store.fetcher.load(g.doc).catch(() => { /* a missing group file */ })))
      state.groups = groupsOfBook()
      draw()
      await loadCards(people())
      state.standing = !currentUser(context) ? 'Log in to add or change people.' : !state.canEdit ? 'You can see this address book but not change it.' : ''
      paintStatus()
      refresh()
    }

    // A card opened on its own: read-only here; the book it belongs to is named if it is nearby.
    async function loadPerson () {
      const doc = sym(docOf(state.selected))
      try { await store.fetcher.load(doc) } catch (error) { say('This card could not be read: ' + problem(error), 'bad') }
      draw()
      if (!/\/Person\/[^/]+\/index\.ttl$/.test(doc.value)) return
      const bookDoc = sym(new URL('../../index.ttl', doc.value).href)
      try {
        await store.fetcher.load(bookDoc)
        const book = store.each(null, sym(RDF_TYPE), V('AddressBook'), bookDoc)[0]
        if (!book) return
        const t = store.any(book, sym(DC_TITLE), null, bookDoc)
        const line = el(dom, 'p', 'ctc-hint ctc-in-book')
        line.appendChild(dom.createTextNode('In the address book '))
        line.appendChild(link(dom, book.value, t ? t.value : 'Address book'))
        line.appendChild(dom.createTextNode('. Open it there to change this card.'))
        main.appendChild(line)
      } catch { /* not in a book we can see */ }
    }

    draw()
    if (state.book) loadBook(); else loadPerson()
    return root
  },

  // In the suite shell: the book's groups as the left column (render has already run with this context).
  renderNavigation (subject, context) {
    const view = context && context.suite && context.suite.state && context.suite.state.ctc
    return view && view.navigation ? view.navigation() : null
  },

  // In the suite shell: the header's search box filters the list, as the list's own box does.
  search (query, context) {
    const view = context && context.suite && context.suite.state && context.suite.state.ctc
    if (view && view.setQuery) view.setQuery(query)
  }
}

export default pane
