// sharing-pane.js: who can see and change a file or a folder (Solid Web Access Control).
//
// One file, no imports. It reads the access rules (the ".acl" document) of the item on screen and
// says in plain words who can do what. Someone who has Control can change them.
//
// Where the rules live: the Link: <...>; rel="acl" header of the item (else "<item>.acl"). If that
// document does not exist, the item INHERITS: the pane walks up the folders to the first one with an
// ACL, and uses its acl:default rules.
//
//   <#bob> a acl:Authorization ; acl:agent <https://bob.example/profile/card#me> ;
//          acl:accessTo <https://pod.example/notes/> ; acl:default <https://pod.example/notes/> ;
//          acl:mode acl:Read, acl:Write .
//
// What this pane writes, and when (only after the person has seen a summary and clicked to confirm):
// - "Give this item its own rules": one PUT of a new ACL for the item, a copy of the inherited
//   rules (If-None-Match: *, so it never overwrites an ACL that appeared meanwhile).
// - "Save these changes": one PUT of the whole ACL document (If-Match with its ETag).
// - "Go back to inherited rules": one DELETE of the item's own ACL (If-Match with its ETag).
// Turtle is tried first; a server that answers 415 (the JavaScript Solid Server) gets JSON-LD.
// Rules this pane cannot edit (groups, origins, conditions, anything unusual) are kept exactly.
//
// Layout: the suite's design sheet (design/DESIGN.md), laid out like a files app's sharing tab: an "add a person"
// box, the list of people (avatar, name, a permission dropdown, a ⋯ menu), then everyone / anyone logged in.
// It fits a ~360 px details sidebar as well as a full page (a container query on its own root, not the viewport),
// so a host may mount render(subject, context) anywhere, with or without context.suite.
// Icons: Material Design Icons (Apache 2.0). MIT. Copyright (c) 2026 Melvin Carvalho.

const ACL = 'http://www.w3.org/ns/auth/acl#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LDP = 'http://www.w3.org/ns/ldp#'
const VCARD = 'http://www.w3.org/2006/vcard/ns#'
const VCARD_FN = VCARD + 'fn'
const PUBLIC = FOAF + 'Agent'
const AUTHENTICATED = ACL + 'AuthenticatedAgent'
const MODES = ['Read', 'Append', 'Write', 'Control']
// Predicates an editable rule may carry. Anything else makes the rule read-only, kept as it is.
const PLAIN = new Set([RDF_TYPE, ACL + 'agent', ACL + 'agentClass', ACL + 'accessTo', ACL + 'default', ACL + 'defaultForNew', ACL + 'mode'])

// The levels a person can pick. "owner" is offered for people only, never for everyone.
const LEVELS = [
  ['none', 'No access', []],
  ['view', 'Can view', ['Read']],
  ['add', 'Can view and add', ['Read', 'Append']],
  ['edit', 'Can edit', ['Read', 'Write']],
  ['owner', 'Owner', ['Read', 'Write', 'Control']]
]

// Material Design Icons (pictogrammers.com, Apache 2.0), 24 x 24 paths.
const MDI = {
  share: 'M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A2.92,2.92 0 0,0 18,16.08Z',
  accountPlus: 'M15,14C12.33,14 7,15.33 7,18V20H23V18C23,15.33 17.67,14 15,14M6,10V7H4V10H1V12H4V15H6V12H9V10M15,12A4,4 0 0,0 19,8A4,4 0 0,0 15,4A4,4 0 0,0 11,8A4,4 0 0,0 15,12Z',
  earth: 'M17.9,17.39C17.64,16.59 16.89,16 16,16H15V13A1,1 0 0,0 14,12H8V10H10A1,1 0 0,0 11,9V7H13A2,2 0 0,0 15,5V4.59C17.93,5.77 20,8.64 20,12C20,14.08 19.2,15.97 17.9,17.39M11,19.93C7.05,19.44 4,16.08 4,12C4,11.38 4.08,10.78 4.21,10.21L9,15V16A2,2 0 0,0 11,18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z',
  people: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z',
  puzzle: 'M20.5,11H19V7C19,5.89 18.1,5 17,5H13V3.5A2.5,2.5 0 0,0 10.5,1A2.5,2.5 0 0,0 8,3.5V5H4A2,2 0 0,0 2,7V10.8H3.5C5,10.8 6.2,12 6.2,13.5C6.2,15 5,16.2 3.5,16.2H2V20A2,2 0 0,0 4,22H7.8V20.5C7.8,19 9,17.8 10.5,17.8C12,17.8 13.2,19 13.2,20.5V22H17A2,2 0 0,0 19,20V16H20.5A2.5,2.5 0 0,0 23,13.5A2.5,2.5 0 0,0 20.5,11Z',
  dots: 'M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z',
  delete: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  openNew: 'M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  alert: 'M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z',
  check: 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z',
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
  lock: 'M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path${fill ? ` fill="${fill}"` : ''} d="${d}"/></svg>`)

const CSS = `
/* suite:design begin --prefix shr --only icon,menu,row,buttons,input,chip,avatar,empty,toast */
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
.shr-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.shr-root *, .shr-root *::before, .shr-root *::after { box-sizing: border-box }
.shr-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.shr-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.shr-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.shr-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.shr-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.shr-root [hidden] { display: none !important }
.shr-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.shr-muted { color: var(--sui-text-muted) }
.shr-small { font-size: var(--sui-text-sm) }
.shr-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.shr-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.shr-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.shr-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.shr-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.shr-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --shr-i set to url("data:image/svg+xml,...") ---------------------------------- */
.shr-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--shr-i) center / contain no-repeat; mask: var(--shr-i) center / contain no-repeat }
/* ---- menu: popover menu (avatar menu, row actions) ------------------------------------------------------------ */
.shr-popover { position: absolute; z-index: 40; min-width: 220px; max-width: calc(100vw - 16px); padding: var(--sui-space-1); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-text); box-shadow: var(--sui-shadow-lg); border: 1px solid var(--sui-border) }
.shr-menu { margin: 0; padding: 0; list-style: none }
.shr-menu-head { display: flex; align-items: center; gap: var(--sui-space-3); padding: var(--sui-space-2) var(--sui-space-3) var(--sui-space-3); border-bottom: 1px solid var(--sui-border); margin-bottom: var(--sui-space-1); min-width: 0 }
.shr-menu-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.shr-menu-item:hover, .shr-menu-item:focus-visible { background: var(--sui-bg-hover); outline: none }
.shr-menu-item .shr-icon { color: var(--sui-text-muted) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.shr-list { margin: 0; padding: 0; list-style: none }
.shr-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.shr-row:hover { background: var(--sui-bg-hover) }
.shr-row[aria-selected="true"], .shr-row[aria-current="true"] { background: var(--sui-primary-light) }
.shr-row-main { flex: 1 1 auto; min-width: 0 }
.shr-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.shr-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.shr-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.shr-row-actions { flex: none; display: flex; align-items: center }
.shr-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.shr-row-icon .shr-icon { width: 28px; height: 28px }
.shr-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .shr-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.shr-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.shr-btn:hover { background: var(--sui-primary-light-hover) }
.shr-btn:disabled, .shr-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.shr-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.shr-btn-primary:hover { background: var(--sui-primary-element-hover) }
.shr-btn-tertiary { background: transparent; color: var(--sui-text) }
.shr-btn-tertiary:hover { background: var(--sui-bg-hover) }
.shr-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.shr-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.shr-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.shr-btn-icon:hover { background: var(--sui-bg-hover) }
.shr-btn-wide { width: 100%; justify-content: flex-start }
.shr-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.shr-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.shr-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.shr-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.shr-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.shr-input:hover { border-color: var(--sui-primary-element) }
.shr-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.shr-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.shr-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.shr-search { position: relative; display: flex; align-items: center; min-width: 0 }
.shr-search .shr-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.shr-search .shr-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.shr-select { position: relative; display: block; min-width: 0 }
.shr-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.shr-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.shr-file { position: relative; overflow: hidden }
.shr-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.shr-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .shr-row-check */
.shr-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.shr-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.shr-check-round { border-radius: 50% }
.shr-check:hover { border-color: var(--sui-primary-element) }
.shr-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.shr-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.shr-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.shr-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.shr-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.shr-segment:hover { background: var(--sui-bg-hover) }
.shr-segment[aria-pressed="true"], .shr-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.shr-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.shr-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.shr-chip { cursor: pointer }
button.shr-chip:hover { background: var(--sui-primary-light-hover) }
.shr-chip-primary, .shr-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.shr-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.shr-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.shr-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- avatar: a span with initials, or an <img class="ui-avatar"> -------------------------------------------- */
.shr-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar); height: var(--sui-avatar); border-radius: 50%; overflow: hidden; background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); line-height: 1; object-fit: cover; text-transform: uppercase; user-select: none }
.shr-avatar-lg { width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); font-size: var(--sui-text-xl) }
.shr-avatar-xl { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.shr-header .shr-avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.shr-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.shr-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.shr-empty-icon .shr-icon { width: 48px; height: 48px }
.shr-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.shr-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.shr-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.shr-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.shr-toast-error { border-left-color: var(--sui-error) }
.shr-toast-success { border-left-color: var(--sui-success) }
.shr-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.shr-status-error { color: var(--sui-error) }
.shr-status-success { color: var(--sui-success) }
.shr-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.shr-note-error { background: var(--sui-error-light) }
.shr-note-warning { background: var(--sui-warning-light) }
.shr-note-success { background: var(--sui-success-light) }
/* suite:design end */
.shr.sharing-lab-pane { container: shr / inline-size; width: 100%; max-width: 760px; margin: 0 auto; padding: var(--sui-space-4) }
.shr.sharing-lab-pane.shr-embedded { max-width: none; padding: 0 }
.shr-top { margin-bottom: var(--sui-space-4) }
.shr-meta { overflow-wrap: anywhere }
.shr .shr-status { margin: 0 0 var(--sui-space-4); font-size: var(--sui-text-md); overflow-wrap: anywhere }
.shr .shr-status:empty { display: none }
.shr .shr-note > span:last-child, .shr-source > div { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere }
.shr .shr-note strong { font-size: inherit; font-weight: var(--sui-weight-bold) }
.shr-no-actions { width: var(--sui-target) }
.shr .shr-note.shr-good { background: var(--sui-success-light); color: var(--sui-success) }
.shr .shr-note.shr-bad { color: var(--sui-error) }
.shr-body { display: flex; flex-direction: column; gap: var(--sui-space-4) }
.shr-group { display: flex; flex-direction: column; gap: var(--sui-space-1) }
.shr-caption.shr-section { padding: var(--sui-space-2) var(--sui-space-2) var(--sui-space-1); line-height: 1.35 }
.shr .shr-list { display: flex; flex-direction: column; gap: 2px }
.shr-add { display: flex; flex-direction: column; gap: var(--sui-space-2) }
.shr-add-fields { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2) }
.shr-add-fields > .shr-search { flex: 1 1 240px }
.shr-add-level { flex: 1 0 auto; display: flex; gap: var(--sui-space-2); min-width: 0 }
.shr-add-level > .shr-select { flex: 1 1 auto }
@container shr (min-width: 521px) { .shr-add-level { flex: 0 1 auto } }
.shr-add .shr-hint { padding: 0 var(--sui-space-4) }
.shr .shr-select { min-width: 0; max-width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit; text-overflow: ellipsis; cursor: pointer }
.shr .shr-select:hover { border-color: var(--sui-primary-element) }
.shr .shr-select:disabled { opacity: .5; cursor: default }
.shr .shr-share { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; grid-template-areas: "av main perm act"; align-items: center; column-gap: var(--sui-space-3); row-gap: var(--sui-space-1); padding: var(--sui-space-2) var(--sui-space-1) var(--sui-space-2) var(--sui-space-2); cursor: default }
.shr-share > .shr-avatar { grid-area: av }
.shr-share > .shr-row-main { grid-area: main }
.shr-share > .shr-perm { grid-area: perm; justify-self: end; min-width: 0; max-width: 280px }
.shr-share > .shr-row-actions { grid-area: act; position: relative }
.shr .shr-share.shr-changed { background: var(--sui-warning-light) }
.shr-titleline { display: flex; align-items: center; gap: var(--sui-space-2); min-width: 0 }
.shr-name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.shr-titleline .shr-chip { flex: none }
.shr-row-sub a { color: inherit; text-decoration: none }
.shr-id > a:only-child { display: block; overflow: hidden; text-overflow: ellipsis }
.shr-row-sub a:hover { text-decoration: underline }
.shr .shr-readonly .shr-row-sub, .shr .shr-scope { white-space: normal; overflow-wrap: anywhere }
.shr-avatar.shr-avatar-public { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.shr-avatar.shr-avatar-other { background: var(--sui-bg-dark); color: var(--sui-text) }
.shr-level .shr-chip { max-width: 100% }
.shr-row-menu { right: 0; top: calc(100% - var(--sui-space-1)) }
.shr .shr-quiet, .shr .shr-quiet .shr-icon { color: var(--sui-error) }
.shr-box { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sui-space-2); padding: var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-bg-app) }
.shr-pending { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2) var(--sui-space-3); padding: var(--sui-space-2) var(--sui-space-2) var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-warning-light); color: var(--sui-warning) }
.shr-pending > span { flex: 1 1 160px; min-width: 0; font-weight: var(--sui-weight-bold) }
.shr-pending .shr-btn-tertiary { color: var(--sui-warning) }
.shr-review { display: flex; flex-direction: column; gap: var(--sui-space-3); padding: var(--sui-space-4); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg); box-shadow: var(--sui-shadow) }
.shr-summary { margin: 0; padding-left: var(--sui-space-5) }
.shr-summary li { overflow-wrap: anywhere }
.shr-review .shr-btns { justify-content: flex-end }
.shr-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sui-space-2) var(--sui-space-3); padding-top: var(--sui-space-3); border-top: 1px solid var(--sui-border); color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
.shr-foot > span { flex: 1 1 200px; min-width: 0 }
.shr-foot a { color: inherit }
.shr-empty.shr-nobody { margin: var(--sui-space-4) auto }
@container shr (max-width: 520px) {
  .shr .shr-share { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "av main act" ". perm act"; align-items: start }
  .shr-share > .shr-avatar { margin-top: var(--sui-space-1) }
  .shr-share > .shr-perm { justify-self: start; max-width: 100% }
  .shr-top .shr-heading { font-size: var(--sui-text-lg) }
}
`

function el (dom, tag, className, text) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function icon (dom, name) {
  const span = dom.createElement('span')
  span.className = 'shr-icon'
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--shr-i', `url("${svg(MDI[name])}")`)
  return span
}

// Initials: the first letters of up to two words of a name ("Bob Tester" → BT; "alice.example" → A).
const initials = (text) => (String(text || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join('') || '?').toUpperCase()

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

const webFetch = (store) => (store.fetcher && store.fetcher._fetch && store.fetcher._fetch.bind(store.fetcher)) || fetch
// Reads (GET, HEAD) give up after 20 s, so the pane always settles to its rules or to an error, never stays "busy".
// Writes are never cut short: an aborted PUT or DELETE might still be applied by the server.
const READ_TIMEOUT = 20000
const withTimeout = (fetcher) => (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase()
  if ((method !== 'GET' && method !== 'HEAD') || options.signal || typeof AbortController === 'undefined') return fetcher(url, options)
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), READ_TIMEOUT)
  return Promise.resolve(fetcher(url, { ...options, signal: abort.signal })).finally(() => clearTimeout(timer))
}
const sameUrl = (a, b) => a.replace(/\/$/, '') === b.replace(/\/$/, '')
const parentOf = (url) => { const u = new URL(url); if (u.pathname === '/') return null; return new URL(u.pathname.endsWith('/') ? '..' : '.', u).href }
const shortName = (url) => { const u = new URL(url); const parts = u.pathname.split('/').filter(Boolean); return parts.length ? decodeURIComponent(parts[parts.length - 1]) + (u.pathname.endsWith('/') ? '/' : '') : u.host }
const hostOf = (url) => { try { return new URL(url).host || url } catch { return url } }
const safeHref = (url) => /^(https?:|mailto:|tel:)/i.test(url) ? url : null

// Where a resource's access rules live: the server says in a Link header; else beside it.
async function aclAddress (fetcher, address) {
  try {
    const response = await fetcher(address, { method: 'HEAD', cache: 'no-store' })
    const link = (response.headers.get('link') || '').split(',').map(part => part.match(/<([^>]+)>\s*;\s*rel="?acl"?/)).find(Boolean)
    if (link) return new URL(link[1], address).href
  } catch { /* fall through */ }
  return address + '.acl'
}

// Read an ACL document into a throwaway graph. { status, etag, graph }
async function readAcl (fetcher, aclUrl) {
  const response = await fetcher(aclUrl, { headers: { Accept: 'application/ld+json, text/turtle;q=0.9' }, cache: 'no-store' })
  if (!response.ok) return { status: response.status }
  const text = await response.text()
  const type = (response.headers.get('content-type') || 'text/turtle').split(';')[0].trim().toLowerCase()
  const graph = rdflib().graph()
  await new Promise((resolve, reject) => {
    try {
      rdflib().parse(text, graph, aclUrl, /json/.test(type) ? 'application/ld+json' : 'text/turtle', (error) => error ? reject(error) : resolve())
    } catch (error) { reject(error) }
  })
  return { status: response.status, etag: response.headers.get('etag'), graph }
}

const local = (uri) => uri.slice(ACL.length)
const levelOf = (modes) => {
  const has = (m) => modes.has(m)
  if (!modes.size) return 'none'
  if (has('Control') && has('Write') && has('Read')) return 'owner'
  if (has('Control')) return 'custom'
  if (has('Write') && has('Read')) return 'edit'
  if (has('Append') && has('Read') && !has('Write')) return 'add'
  if (has('Read') && modes.size === 1) return 'view'
  return 'custom'
}
const sameModes = (a, b) => levelOf(a) === levelOf(b) && (levelOf(a) !== 'custom' || [...a].sort().join() === [...b].sort().join())
const modesFor = (level) => new Set(LEVELS.find(l => l[0] === level)[2])

// What a set of modes means, in words: "can edit", "owner".
function levelWords (modes) {
  const level = levelOf(modes)
  if (level === 'none') return 'no access'
  if (level === 'owner') return 'owner: can edit and change who has access'
  if (level !== 'custom') return LEVELS.find(l => l[0] === level)[1].toLowerCase()
  const parts = []
  if (modes.has('Read')) parts.push('view')
  if (modes.has('Write')) parts.push('change'); else if (modes.has('Append')) parts.push('add')
  if (modes.has('Control')) parts.push('change who has access')
  const text = 'can ' + parts.join(', ').replace(/, ([^,]*)$/, ' and $1')
  return modes.has('Read') ? text : text + ' (but not view)'
}
// The same, as the end of a sentence: "Bob can now ___".
function levelVerb (modes) {
  const level = levelOf(modes)
  if (level === 'owner') return 'edit and change who has access'
  if (level === 'edit') return 'edit'
  if (level === 'add') return 'view and add'
  if (level === 'view') return 'view'
  return levelWords(modes).replace(/^can /, '')
}

// Turn the triples of one ACL document into what the pane shows.
//   own:       the item's own ACL (rules apply by acl:accessTo; to a folder's contents by acl:default)
//   inherited: a folder's ACL above it (rules apply by acl:default on that folder)
// Returns people/classes that can be edited, read-only rules, and the subjects that are editable.
function readRules (graph, { item, isFolder, own, from }) {
  const subjects = new Map()
  for (const st of graph.statements) {
    if (st.subject.termType !== 'NamedNode' && st.subject.termType !== 'BlankNode') continue
    const key = st.subject.termType + ' ' + st.subject.value
    if (!subjects.has(key)) subjects.set(key, { node: st.subject, sts: [] })
    subjects.get(key).sts.push(st)
  }
  const principals = new Map()
  const readOnly = []
  const editable = new Set()
  const applying = [] // subjects of the rules that apply here (for copying)
  for (const { node, sts } of subjects.values()) {
    const values = (p) => sts.filter(s => s.predicate.value === ACL + p).map(s => s.object.value)
    const isAuth = sts.some(s => s.predicate.value === RDF_TYPE && s.object.value === ACL + 'Authorization') || values('mode').length
    if (!isAuth) continue
    const accessTo = values('accessTo')
    const defaults = values('default').concat(values('defaultForNew'))
    const modes = new Set(values('mode').filter(m => m.startsWith(ACL)).map(local).filter(m => MODES.includes(m)))
    const odd = values('mode').some(m => !MODES.includes(local(m)))
    let self, contents
    if (own) {
      self = accessTo.some(a => sameUrl(a, item))
      contents = isFolder && defaults.some(d => sameUrl(d, item))
    } else {
      self = defaults.some(d => sameUrl(d, from))
      contents = isFolder && self
    }
    if (!self && !contents) continue
    applying.push(node)
    const agents = values('agent')
    const classes = values('agentClass')
    const groups = values('agentGroup')
    const origins = values('origin')
    const plain = !odd && agents.every(a => /^https?:/i.test(a)) && sts.every(s => PLAIN.has(s.predicate.value)) && classes.every(c => c === PUBLIC || c === AUTHENTICATED) &&
      (agents.length + classes.length > 0) && node.termType === 'NamedNode' &&
      (!own || (accessTo.every(a => sameUrl(a, item)) && defaults.every(d => sameUrl(d, item))))
    if (plain) {
      if (own) editable.add(node.value)
      const add = (kind, id) => {
        const key = kind + ' ' + id
        if (!principals.has(key)) principals.set(key, { key, kind, id, self: new Set(), contents: new Set() })
        const p = principals.get(key)
        if (self) modes.forEach(m => p.self.add(m))
        if (contents) modes.forEach(m => p.contents.add(m))
      }
      agents.forEach(a => add('agent', a))
      classes.forEach(c => add(c === PUBLIC ? 'public' : 'authenticated', c))
    } else {
      readOnly.push({ agents, classes, groups, origins, modes, self, contents, other: sts.some(s => !PLAIN.has(s.predicate.value) && ![ACL + 'agentGroup', ACL + 'origin'].includes(s.predicate.value)) })
    }
  }
  return { principals, readOnly, editable, applying }
}

// Serialise triples, as N-Triples (which is Turtle) and as expanded JSON-LD.
function termNT (t) {
  if (t.termType === 'NamedNode') return '<' + t.value.replace(/[<>"{}|^`\\\s]/g, c => encodeURIComponent(c)) + '>'
  if (t.termType === 'BlankNode') return '_:' + t.value.replace(/[^A-Za-z0-9_]/g, '_')
  const text = '"' + t.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"'
  if (t.language) return text + '@' + t.language
  if (t.datatype && t.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') return text + '^^<' + t.datatype.value + '>'
  return text
}
const toTurtle = (triples) => triples.map(([s, p, o]) => `${termNT(s)} ${termNT(p)} ${termNT(o)} .`).join('\n') + '\n'
function toJsonLd (triples) {
  const nodes = new Map()
  for (const [s, p, o] of triples) {
    const id = s.termType === 'BlankNode' ? '_:' + s.value.replace(/[^A-Za-z0-9_]/g, '_') : s.value
    if (!nodes.has(id)) nodes.set(id, { '@id': id })
    const node = nodes.get(id)
    if (p.value === RDF_TYPE && o.termType === 'NamedNode') { (node['@type'] = node['@type'] || []).push(o.value); continue }
    let value
    if (o.termType === 'NamedNode') value = { '@id': o.value }
    else if (o.termType === 'BlankNode') value = { '@id': '_:' + o.value.replace(/[^A-Za-z0-9_]/g, '_') }
    else if (o.language) value = { '@value': o.value, '@language': o.language }
    else if (o.datatype && o.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') value = { '@value': o.value, '@type': o.datatype.value }
    else value = { '@value': o.value }
    ;(node[p.value] = node[p.value] || []).push(value)
  }
  return JSON.stringify([...nodes.values()], null, 2)
}

// The rules for people and classes, as triples for a new ACL document at aclUrl.
function principalTriples (principals, { item, isFolder, aclUrl, taken }) {
  const $rdf = rdflib()
  const sym = (u) => $rdf.sym(u)
  const out = []
  let n = 0
  const name = (base) => { let id; do { id = aclUrl + '#' + base + (n ? '-' + n : '') ; n++ } while (taken.has(id)); taken.add(id); return id }
  for (const p of principals.values()) {
    const scopes = []
    if (isFolder && sameModes(p.self, p.contents)) { if (p.self.size) scopes.push([p.self, true, true]) } else {
      if (p.self.size) scopes.push([p.self, true, false])
      if (isFolder && p.contents.size) scopes.push([p.contents, false, true])
    }
    for (const [modes, self, contents] of scopes) {
      const s = sym(name(p.kind === 'agent' ? 'person' : p.kind))
      out.push([s, sym(RDF_TYPE), sym(ACL + 'Authorization')])
      out.push([s, sym(p.kind === 'agent' ? ACL + 'agent' : ACL + 'agentClass'), sym(p.id)])
      if (self) out.push([s, sym(ACL + 'accessTo'), sym(item)])
      if (contents) out.push([s, sym(ACL + 'default'), sym(item)])
      for (const m of MODES) if (modes.has(m)) out.push([s, sym(ACL + 'mode'), sym(ACL + m)])
    }
  }
  return out
}

// Send a whole ACL document: Turtle first, JSON-LD if the server wants that (415).
async function sendAcl (fetcher, aclUrl, triples, condition) {
  const headers = { ...condition }
  let response = await fetcher(aclUrl, { method: 'PUT', headers: { ...headers, 'Content-Type': 'text/turtle' }, body: toTurtle(triples) })
  if (response.status === 415) {
    response = await fetcher(aclUrl, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/ld+json' }, body: toJsonLd(triples) })
  }
  return response
}

const clone = (principals) => new Map([...principals].map(([k, p]) => [k, { ...p, self: new Set(p.self), contents: new Set(p.contents) }]))
// Does `me` have Control of the item itself under these rules?
const canControl = (principals, me) => [...principals.values()].some(p => p.self.has('Control') && ((p.kind === 'agent' && me && p.id === me) || p.kind === 'public' || (p.kind === 'authenticated' && me)))
const someOwner = (principals) => [...principals.values()].some(p => p.kind === 'agent' && p.self.has('Control'))

// A WebID someone typed: an https address (http only for this computer, for testing).
function checkWebId (text) {
  let url
  try { url = new URL(text.trim()) } catch { return { error: 'That is not a web address. A WebID looks like https://alice.example/profile/card#me' } }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) return { error: 'A WebID must start with https://' }
  return { webId: url.href }
}

// What a level is called on its chip: short ("Can edit"); the full words go in its title and for screen readers.
function levelChip (modes) {
  const level = levelOf(modes)
  if (level !== 'custom') return LEVELS.find(l => l[0] === level)[1]
  const words = levelWords(modes)
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const pane = {
  name: 'sharing-lab',
  icon: svg(MDI.share, '#0082c9'),

  label (subject, context) {
    try {
      if (!subject || subject.termType !== 'NamedNode' || subject.uri.includes('#') || !/^https?:/.test(subject.uri)) return null
      if (subject.uri.endsWith('/')) return 'Sharing'
      const store = (context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store)
      const types = store && store.findTypeURIs ? store.findTypeURIs(subject) : {}
      if (types[LDP + 'Resource'] || types[LDP + 'Container'] || types[LDP + 'BasicContainer'] || types[LDP + 'NonRDFSource'] || types[LDP + 'RDFSource']) return 'Sharing'
      return null
    } catch { return null }
  },

  shouldGetFocus () { return false },

  // render(subject, context): context.dom and context.session.store as the data browser gives them (either may be
  // missing when a host mounts the pane itself: then document and SolidLogic.store). context.suite is optional.
  render (subject, context = {}) {
    const dom = context.dom || globalThis.document
    const store = (context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store)
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null
    const fetcher = withTimeout(webFetch(store))
    const item = subject.uri
    const isFolder = item.endsWith('/')
    const noun = isFolder ? 'folder' : 'file'
    const root = el(dom, 'div', 'shr sharing-lab-pane shr-root')
    root.appendChild(el(dom, 'style', '', CSS))
    // In a host's details column (it already says "Sharing" and names the item): no title, no outer padding.
    const embedded = context.embedded === true || !!(suite && suite.slot === 'details')
    if (embedded) root.classList.add('shr-embedded')
    else {
      const top = root.appendChild(el(dom, 'header', 'shr-top'))
      top.appendChild(el(dom, 'h2', 'shr-heading', 'Sharing'))
      top.appendChild(el(dom, 'p', 'shr-meta shr-muted shr-small', 'Who can see and change the ' + noun + ' ' + shortName(item)))
    }
    const status = root.appendChild(el(dom, 'div', 'shr-status'))
    status.setAttribute('role', 'status')
    const body = root.appendChild(el(dom, 'div', 'shr-body'))
    const say = (text, kind) => {
      status.replaceChildren()
      status.className = 'shr-status'
      if (!text) return
      kind = kind || 'info'
      status.className = 'shr-status shr-note shr-' + kind + (kind === 'bad' ? ' shr-note-error' : '')
      status.appendChild(icon(dom, kind === 'good' ? 'check' : kind === 'bad' ? 'alert' : 'info'))
      status.appendChild(el(dom, 'span', '', text))
    }
    const toast = (text, kind) => { try { if (suite && suite.toast) suite.toast(text, { kind }) } catch { /* the status line says it too */ } }

    const me = () => { const who = currentUser(context); return who ? who.value : null }
    const names = new Map() // WebID -> name, once the profile has loaded
    const photos = new Map() // WebID -> photo address (http(s) only)
    const spots = new Map() // WebID -> functions to call when the name or photo arrives
    let state = null // what the server has
    let draft = null // the person's unsaved edits (own rules only)
    let review = null // the summary being confirmed
    let busy = false

    const who = (p, capital = true) => {
      if (p.kind === 'public') return capital ? 'Everyone' : 'everyone'
      if (p.kind === 'authenticated') return capital ? 'Anyone logged in' : 'anyone logged in'
      if (p.id === me()) return capital ? 'You' : 'you'
      return names.get(p.id) || p.id
    }

    function loadName (webId) {
      if (names.has(webId) || !/^https?:/.test(webId)) return
      names.set(webId, null)
      const $rdf = rdflib()
      const node = $rdf.sym(webId)
      const done = () => {
        const name = store.any(node, $rdf.sym(FOAF + 'name')) || store.any(node, $rdf.sym(VCARD_FN))
        const photo = store.any(node, $rdf.sym(VCARD + 'hasPhoto')) || store.any(node, $rdf.sym(FOAF + 'img'))
        if (name) names.set(webId, name.value)
        if (photo && /^https?:/i.test(photo.value)) photos.set(webId, photo.value)
        if (!name && !photos.has(webId)) return
        if (name && review && review.relines) { review.lines = review.relines(); const ul = body.querySelector('.shr-summary'); if (ul) ul.replaceChildren(...review.lines.map(line => el(dom, 'li', '', line))) }
        for (const fill of spots.get(webId) || []) fill()
      }
      Promise.race([store.fetcher.load(node.doc()), new Promise((resolve, reject) => setTimeout(() => reject(new Error('slow')), 10000))]).then(done, () => {})
    }

    function link (url, text, className) {
      const a = el(dom, 'a', className || '', text === undefined ? url : text)
      const href = safeHref(url)
      if (href) { a.href = href; a.rel = 'noopener' }
      a.addEventListener('click', (event) => {
        try {
          if (suite && /^https?:/.test(url)) { event.preventDefault(); suite.go(url); return }
          const outliner = context.getOutliner && context.getOutliner(dom)
          if (outliner && /^https?:/.test(url)) { event.preventDefault(); outliner.GotoSubject(store.sym(url), true, undefined, true, undefined) }
        } catch { /* the plain link works */ }
      })
      return a
    }

    // A person's avatar: their photo, else initials; an icon for everyone / anyone logged in / a group / an app.
    function avatar (p) {
      const span = el(dom, 'span', 'shr-avatar')
      span.setAttribute('aria-hidden', 'true')
      if (p.kind === 'public') { span.classList.add('shr-avatar-public'); span.appendChild(icon(dom, 'earth')); return span }
      if (p.kind === 'authenticated') { span.classList.add('shr-avatar-public'); span.appendChild(icon(dom, 'people')); return span }
      if (p.kind === 'group') { span.classList.add('shr-avatar-other'); span.appendChild(icon(dom, 'people')); return span }
      if (p.kind === 'other') { span.classList.add('shr-avatar-other'); span.appendChild(icon(dom, 'puzzle')); return span }
      span.textContent = initials(names.get(p.id) || hostOf(p.id))
      return span
    }
    // Keep an agent's name and avatar up to date as the profile loads.
    function watch (webId, nameEl, avatarEl) {
      if (!spots.has(webId)) spots.set(webId, new Set())
      let current = avatarEl
      const fill = () => {
        if (!current.isConnected && current !== avatarEl) return
        if (nameEl && names.get(webId)) nameEl.textContent = names.get(webId)
        const photo = photos.get(webId)
        if (photo && current.tagName !== 'IMG') {
          const img = el(dom, 'img', 'shr-avatar')
          img.alt = ''
          img.src = photo
          img.addEventListener('error', () => { photos.delete(webId); avatarEl.textContent = initials(names.get(webId) || hostOf(webId)); img.replaceWith(avatarEl); current = avatarEl })
          current.replaceWith(img)
          current = img
        } else if (current.tagName !== 'IMG') current.textContent = initials(names.get(webId) || hostOf(webId))
      }
      spots.get(webId).add(fill)
      if (names.get(webId) || photos.has(webId)) fill()
      loadName(webId)
    }

    // The ⋯ menus on rows: one open at a time; Escape or a click elsewhere closes it.
    function closeMenus (focus) {
      for (const pop of root.querySelectorAll('.shr-row-menu:not([hidden])')) {
        pop.hidden = true
        const btn = pop.parentNode.querySelector('.shr-more')
        btn.setAttribute('aria-expanded', 'false')
        if (focus) btn.focus()
      }
    }
    const outside = (event) => {
      if (!root.isConnected) { dom.removeEventListener('click', outside, true); return }
      if (!event.target.closest || !event.target.closest('.shr-row-actions')) closeMenus()
    }
    dom.addEventListener('click', outside, true)
    root.addEventListener('keydown', (event) => { if (event.key === 'Escape' && root.querySelector('.shr-row-menu:not([hidden])')) { event.stopPropagation(); closeMenus(true) } })

    function rowMenu (p) {
      const wrap = el(dom, 'div', 'shr-row-actions')
      const btn = wrap.appendChild(el(dom, 'button', 'shr-btn shr-btn-icon shr-more'))
      btn.type = 'button'
      btn.setAttribute('aria-label', 'More for ' + who(p, false))
      btn.setAttribute('aria-haspopup', 'menu')
      btn.setAttribute('aria-expanded', 'false')
      btn.disabled = busy
      btn.appendChild(icon(dom, 'dots'))
      const pop = wrap.appendChild(el(dom, 'div', 'shr-popover shr-row-menu'))
      pop.hidden = true
      const menu = pop.appendChild(el(dom, 'ul', 'shr-menu'))
      menu.setAttribute('role', 'menu')
      if (safeHref(p.id)) {
        const a = menu.appendChild(el(dom, 'li')).appendChild(link(p.id, '', 'shr-menu-item'))
        a.setAttribute('role', 'menuitem')
        a.append(icon(dom, 'openNew'), el(dom, 'span', '', 'Open profile'))
      }
      const remove = menu.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'shr-menu-item shr-quiet'))
      remove.type = 'button'
      remove.setAttribute('role', 'menuitem')
      remove.append(icon(dom, 'delete'), el(dom, 'span', '', 'Remove access'))
      remove.addEventListener('click', () => { draft.delete(p.key); review = null; draw() })
      btn.addEventListener('click', () => {
        const open = pop.hidden
        closeMenus()
        pop.hidden = !open
        btn.setAttribute('aria-expanded', String(open))
        if (open) { const first = pop.querySelector('.shr-menu-item'); if (first) first.focus() }
      })
      return wrap
    }

    // Find the rules that apply to the item: its own, or those of the nearest folder above with an ACL.
    async function load () {
      const aclUrl = await aclAddress(fetcher, item)
      const own = await readAcl(fetcher, aclUrl)
      if (own.status === 401 || own.status === 403) return { kind: 'denied', aclUrl, status: own.status }
      if (own.graph) return { kind: 'own', aclUrl, etag: own.etag, graph: own.graph, rules: readRules(own.graph, { item, isFolder, own: true }) }
      if (own.status !== 404) return { kind: 'error', aclUrl, status: own.status }
      const inherited = await findInherited()
      return { ...inherited, aclUrl }
    }
    async function findInherited () {
      for (let folder = parentOf(item); folder; folder = parentOf(folder)) {
        const folderAcl = await aclAddress(fetcher, folder)
        const read = await readAcl(fetcher, folderAcl)
        if (read.status === 404) continue
        if (read.status === 401 || read.status === 403) return { kind: 'denied', status: read.status, from: folder }
        if (!read.graph) return { kind: 'error', status: read.status, from: folder }
        return { kind: 'inherited', from: folder, fromAcl: folderAcl, graph: read.graph, rules: readRules(read.graph, { item, isFolder, own: false, from: folder }) }
      }
      return { kind: 'none' }
    }

    // Only the latest read draws: an older one that ends later is dropped. A read that never ends is cut off (a
    // last guard behind the fetch timeouts, since load() may walk several folders), so the state always settles.
    let reading = 0
    async function refresh (message, kind) {
      const mine = ++reading
      busy = true
      root.dataset.state = 'busy'
      let next
      try {
        next = await Promise.race([load(), new Promise((resolve, reject) => setTimeout(() => reject(new Error('no answer from the server in time')), READ_TIMEOUT * 3))])
      } catch (error) {
        next = { kind: 'error', status: String(error && error.message ? error.message : error) }
      }
      if (mine !== reading) return state
      state = next
      busy = false
      draft = state.kind === 'own' ? clone(state.rules.principals) : null
      review = null
      draw()
      if (message) say(message, kind)
      return state
    }

    function sorted (principals) {
      const rank = (p) => p.kind === 'public' ? 4 : p.kind === 'authenticated' ? 3 : p.id === me() ? 0 : p.self.has('Control') ? 1 : 2
      return [...principals.values()].sort((a, b) => rank(a) - rank(b) || who(a).localeCompare(who(b)))
    }

    // The words for what someone can do, for a folder saying which part it applies to.
    function scopeWords (p) {
      if (!isFolder) return levelWords(p.self)
      if (sameModes(p.self, p.contents)) return levelWords(p.self) + (p.self.size ? ', here and in everything inside' : '')
      const parts = []
      parts.push('this folder: ' + levelWords(p.self))
      parts.push('things inside it: ' + levelWords(p.contents))
      return parts.join(' · ')
    }

    function changedRows () {
      if (!draft || !state || state.kind !== 'own') return []
      const keys = new Set([...state.rules.principals.keys(), ...draft.keys()])
      const out = []
      for (const key of keys) {
        const before = state.rules.principals.get(key) || { self: new Set(), contents: new Set() }
        const after = draft.get(key) || { ...before, self: new Set(), contents: new Set() }
        if (!sameModes(before.self, after.self) || (isFolder && !sameModes(before.contents, after.contents))) out.push(key)
      }
      return out
    }

    // Plain sentences for a change from one set of rules to another.
    function summary (before, after) {
      const keys = new Set([...before.keys(), ...after.keys()])
      const lines = []
      const empty = { self: new Set(), contents: new Set() }
      for (const key of keys) {
        const b = before.get(key) || { ...(after.get(key)), ...empty }
        const a = after.get(key) || { ...b, self: new Set(), contents: new Set() }
        const selfChanged = !sameModes(b.self, a.self)
        const contentsChanged = isFolder && !sameModes(b.contents, a.contents)
        if (!selfChanged && !contentsChanged) continue
        const name = who(a)
        const sentence = (from, to) => {
          if (!to.size) return `${name} can no longer see or change it (could ${levelVerb(from)})`
          if (!from.size) return `${name} can now ${levelVerb(to)}`
          return `${name} can now ${levelVerb(to)} (could ${levelVerb(from)})`
        }
        if (!isFolder || (selfChanged && contentsChanged && sameModes(b.self, b.contents) && sameModes(a.self, a.contents))) {
          lines.push(sentence(b.self, a.self) + (isFolder ? ', in this folder and everything inside' : ''))
        } else {
          if (selfChanged) lines.push(sentence(b.self, a.self) + ', in this folder itself')
          if (contentsChanged) lines.push(sentence(b.contents, a.contents) + ', in the things inside it')
        }
      }
      return lines
    }

    function group (caption) {
      const box = el(dom, 'section', 'shr-group')
      if (caption) box.appendChild(el(dom, 'h3', 'shr-caption shr-section', caption))
      return box
    }

    // One share row: avatar · name and WebID · permission (a dropdown when editing, else a chip) · ⋯ menu.
    function shareRow (p, { editing, changed }) {
      const row = el(dom, 'li', 'shr-row shr-share' + (changed ? ' shr-changed' : ''))
      row.dataset.key = p.key
      const av = row.appendChild(avatar(p))
      const main = row.appendChild(el(dom, 'div', 'shr-row-main'))
      const line = main.appendChild(el(dom, 'div', 'shr-titleline'))
      const name = line.appendChild(el(dom, 'span', 'shr-name', p.kind === 'agent' ? (names.get(p.id) || hostOf(p.id)) : who(p)))
      if (p.kind === 'agent') {
        if (p.id === me()) line.appendChild(el(dom, 'span', 'shr-chip shr-chip-primary shr-tag', 'you'))
        if (editing && !state.rules.principals.has(p.key)) line.appendChild(el(dom, 'span', 'shr-chip shr-chip-warning shr-tag shr-new', 'new'))
        const id = main.appendChild(el(dom, 'span', 'shr-row-sub shr-id'))
        id.title = p.id
        id.appendChild(link(p.id))
        watch(p.id, name, av)
      } else {
        main.appendChild(el(dom, 'span', 'shr-row-sub shr-id', p.kind === 'public' ? 'Anybody on the web, logged in or not' : 'Anybody who has logged in with any WebID'))
      }
      const mixed = isFolder && !sameModes(p.self, p.contents)
      if (mixed) main.appendChild(el(dom, 'span', 'shr-row-sub shr-scope', scopeWords(p)))
      const perm = row.appendChild(el(dom, 'div', 'shr-perm'))
      if (!editing) {
        const level = perm.appendChild(el(dom, 'span', 'shr-level'))
        const chip = level.appendChild(el(dom, 'span', 'shr-chip' + (p.self.has('Control') ? ' shr-chip-primary' : ''), mixed ? 'Mixed' : levelChip(p.self)))
        chip.title = scopeWords(p)
        level.appendChild(el(dom, 'span', 'shr-sr', ': ' + scopeWords(p)))
        return row
      }
      const select = perm.appendChild(el(dom, 'select', 'shr-select'))
      select.setAttribute('aria-label', 'What ' + who(p, false) + ' can do')
      const now = mixed ? 'custom' : levelOf(p.self)
      for (const [value, text] of LEVELS) {
        if (value === 'owner' && p.kind !== 'agent' && now !== 'owner') continue
        const option = select.appendChild(el(dom, 'option', '', text))
        option.value = value
      }
      if (now === 'custom') { const option = select.appendChild(el(dom, 'option', '', 'As now: ' + scopeWords(p))); option.value = 'custom' }
      select.value = now
      select.disabled = busy
      select.addEventListener('change', () => {
        if (select.value === 'custom') return
        const target = draft.get(p.key) || { key: p.key, kind: p.kind, id: p.id, self: new Set(), contents: new Set() }
        target.self = modesFor(select.value)
        target.contents = isFolder ? modesFor(select.value) : new Set()
        if (!target.self.size && p.kind !== 'agent') draft.delete(p.key); else draft.set(p.key, target)
        review = null
        draw()
      })
      // Everyone / anyone logged in have no ⋯ menu: an empty cell keeps their dropdowns in line with the people's.
      row.appendChild(p.kind === 'agent' ? rowMenu(p) : el(dom, 'div', 'shr-row-actions shr-no-actions'))
      return row
    }

    function draw () {
      body.replaceChildren()
      say('')
      root.dataset.state = busy ? 'busy' : state ? state.kind : 'loading'
      if (!state) { say('Reading who has access...'); return }
      if (state.kind === 'denied') {
        say('You cannot see who has access to this.' + (me() ? ' Only someone with control of it can.' : ' Log in to see it, if it is yours.'), 'info')
        return
      }
      if (state.kind === 'none') { say('No access rules were found for this ' + noun + ' or any folder above it.', 'bad'); return }
      if (state.kind === 'error') { say('The access rules could not be read (' + state.status + ').', 'bad'); return }
      const editing = state.kind === 'own'
      const rules = state.rules

      if (editing) drawAdd()

      const source = body.appendChild(el(dom, 'div', 'shr-note shr-source'))
      source.appendChild(icon(dom, editing ? 'lock' : 'folder'))
      const words = source.appendChild(el(dom, 'div'))
      if (editing) {
        words.appendChild(el(dom, 'strong', '', 'This ' + noun + ' has its own rules.'))
        if (isFolder) words.appendChild(dom.createTextNode(' They also apply to everything inside it that has no rules of its own.'))
      } else {
        words.appendChild(el(dom, 'strong', '', 'This ' + noun + ' follows the rules of the folder '))
        words.appendChild(link(state.from, shortName(state.from)))
        words.appendChild(dom.createTextNode('.'))
        words.appendChild(dom.createTextNode(isFolder ? ' Things inside it follow them too, unless they have rules of their own.' : ' It has no rules of its own.'))
      }

      const principals = editing ? draft : rules.principals
      const changed = new Set(changedRows())
      const rows = sorted(principals).filter(p => editing || p.self.size || p.contents.size)
      if (editing) {
        for (const kind of ['authenticated', 'public']) {
          const id = kind === 'public' ? PUBLIC : AUTHENTICATED
          if (!rows.some(p => p.kind === kind)) rows.push({ key: kind + ' ' + id, kind, id, self: new Set(), contents: new Set(), placeholder: true })
        }
      }
      const people = rows.filter(p => p.kind === 'agent')
      const others = rows.filter(p => p.kind !== 'agent')
      if (people.length) {
        const list = body.appendChild(group()).appendChild(el(dom, 'ul', 'shr-list shr-people'))
        for (const p of people) list.appendChild(shareRow(p, { editing, changed: changed.has(p.key) }))
      }
      if (others.length) {
        const box = body.appendChild(group(people.length ? 'Everyone else' : ''))
        const list = box.appendChild(el(dom, 'ul', 'shr-list shr-others'))
        for (const p of others) list.appendChild(shareRow(p, { editing, changed: changed.has(p.key) }))
      }
      if (!rows.length) {
        const empty = body.appendChild(el(dom, 'div', 'shr-empty shr-nobody'))
        empty.appendChild(el(dom, 'span', 'shr-empty-icon')).appendChild(icon(dom, 'lock'))
        empty.appendChild(el(dom, 'p', 'shr-empty-title', 'Nobody has access'))
        empty.appendChild(el(dom, 'p', 'shr-empty-text', 'Nobody has access through these rules.'))
      }

      if (rules.readOnly.length) {
        const box = body.appendChild(group(editing ? 'Also in the rules (read-only, kept as they are)' : 'Also in the rules'))
        const extra = box.appendChild(el(dom, 'ul', 'shr-list shr-extra'))
        for (const r of rules.readOnly) {
          const row = extra.appendChild(el(dom, 'li', 'shr-row shr-share shr-readonly'))
          const kind = r.groups.length ? 'group' : r.agents.length === 1 && !r.origins.length ? 'agent' : 'other'
          const av = row.appendChild(avatar({ kind, id: r.agents[0] }))
          const main = row.appendChild(el(dom, 'div', 'shr-row-main'))
          const whoParts = []
          r.agents.forEach(a => whoParts.push(a === me() ? 'You' : names.get(a) || hostOf(a)))
          r.classes.forEach(c => whoParts.push(c === PUBLIC ? 'Everyone' : c === AUTHENTICATED ? 'Anyone logged in' : 'Members of class ' + c))
          const name = main.appendChild(el(dom, 'div', 'shr-titleline')).appendChild(el(dom, 'span', 'shr-name', whoParts.join(', ') || (r.groups.length ? 'Members of a group' : 'Someone')))
          for (const a of r.agents) { main.appendChild(el(dom, 'span', 'shr-row-sub shr-id')).appendChild(link(a)); loadName(a) }
          if (kind === 'agent' && r.agents[0] !== me()) watch(r.agents[0], name, av)
          for (const g of r.groups) { const line = main.appendChild(el(dom, 'span', 'shr-row-sub shr-id', 'Group: ')); line.appendChild(link(g)) }
          for (const o of r.origins) main.appendChild(el(dom, 'span', 'shr-row-sub shr-id', 'Only when using the app at ' + o))
          if (r.other) main.appendChild(el(dom, 'span', 'shr-row-sub shr-id', 'With extra conditions this pane does not show'))
          const where = isFolder ? (r.self && r.contents ? '' : r.self ? ' (this folder only)' : ' (things inside only)') : ''
          const chip = row.appendChild(el(dom, 'div', 'shr-perm')).appendChild(el(dom, 'span', 'shr-level')).appendChild(el(dom, 'span', 'shr-chip', levelChip(r.modes) + where))
          chip.title = levelWords(r.modes) + where
        }
      }

      if (!editing) {
        const box = body.appendChild(el(dom, 'div', 'shr-box shr-own'))
        box.appendChild(el(dom, 'h3', 'shr-subheading', 'Give this ' + noun + ' its own rules'))
        box.appendChild(el(dom, 'p', 'shr-hint', 'This copies the rules above into a rules file for this ' + noun + ' alone, so nothing changes by itself. Then you can change them here without touching the folder ' + shortName(state.from) + '.'))
        const start = box.appendChild(el(dom, 'button', 'shr-btn shr-btn-primary', 'Give it its own rules'))
        start.type = 'button'
        start.disabled = busy
        start.addEventListener('click', () => { review = makeOwnReview(); draw() })
      } else {
        const pendingCount = changed.size
        if (pendingCount && !review) {
          const bar = body.appendChild(el(dom, 'div', 'shr-pending'))
          bar.setAttribute('role', 'status')
          bar.appendChild(el(dom, 'span', '', pendingCount === 1 ? '1 change, not saved yet.' : pendingCount + ' changes, not saved yet.'))
          const btns = bar.appendChild(el(dom, 'div', 'shr-btns'))
          const undo = btns.appendChild(el(dom, 'button', 'shr-btn shr-btn-tertiary', 'Undo changes'))
          undo.type = 'button'
          undo.addEventListener('click', () => { draft = clone(state.rules.principals); review = null; draw() })
          const go = btns.appendChild(el(dom, 'button', 'shr-btn shr-btn-primary', 'Review and save'))
          go.type = 'button'
          go.addEventListener('click', () => { review = makeSaveReview(); draw() })
        }
      }
      if (review) { drawReview(); const box = body.querySelector('.shr-review'); try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) } catch { /* old browser */ } }

      const foot = body.appendChild(el(dom, 'div', 'shr-foot'))
      const file = foot.appendChild(el(dom, 'span', '', 'Rules file: '))
      file.appendChild(link(editing ? state.aclUrl : state.fromAcl))
      if (editing && parentOf(item)) {
        const back = foot.appendChild(el(dom, 'button', 'shr-btn shr-btn-tertiary shr-back', 'Go back to inherited rules'))
        back.type = 'button'
        back.disabled = busy
        back.addEventListener('click', async () => {
          busy = true; back.disabled = true; root.dataset.state = 'busy'; say('Reading the rules of the folders above...')
          let problem = ''
          try { review = await makeBackReview() } catch (error) { review = null; problem = 'Could not read the folder rules: ' + (error.message || error) }
          busy = false
          draw()
          if (problem) say(problem, 'bad')
        })
      }
    }

    // "Share with people": a WebID box, the level, Add. At the top, as a files app's sharing tab has it.
    function drawAdd () {
      const box = body.appendChild(el(dom, 'form', 'shr-add'))
      box.noValidate = true // the pane checks the WebID itself, with a plain message
      box.setAttribute('aria-label', 'Add a person')
      const fields = box.appendChild(el(dom, 'div', 'shr-add-fields'))
      const search = fields.appendChild(el(dom, 'div', 'shr-search'))
      search.appendChild(icon(dom, 'accountPlus'))
      const input = search.appendChild(el(dom, 'input', 'shr-input'))
      input.type = 'url'
      input.placeholder = 'Add a person by WebID'
      input.autocomplete = 'off'
      input.setAttribute('aria-label', 'WebID of the person to add')
      const levelBox = fields.appendChild(el(dom, 'div', 'shr-add-level'))
      const level = levelBox.appendChild(el(dom, 'select', 'shr-select'))
      level.setAttribute('aria-label', 'What they can do')
      for (const [value, text] of LEVELS.slice(1)) { const o = level.appendChild(el(dom, 'option', '', text)); o.value = value }
      level.value = 'view'
      const add = levelBox.appendChild(el(dom, 'button', 'shr-btn', 'Add'))
      add.type = 'submit'
      add.disabled = busy
      box.appendChild(el(dom, 'p', 'shr-hint', 'Paste their WebID, the web address of their profile, e.g. https://alice.example/profile/card#me'))
      input.addEventListener('input', () => input.removeAttribute('aria-invalid'))
      box.addEventListener('submit', (event) => {
        event.preventDefault()
        const checked = checkWebId(input.value)
        if (checked.error) { input.setAttribute('aria-invalid', 'true'); say(checked.error, 'bad'); return }
        const key = 'agent ' + checked.webId
        const existing = draft.get(key)
        if (existing && existing.self.size) { say('That person is already on the list. Change their level there.', 'bad'); return }
        draft.set(key, { key, kind: 'agent', id: checked.webId, self: modesFor(level.value), contents: isFolder ? modesFor(level.value) : new Set() })
        review = null
        draw()
        say('Added to the list, not saved yet. Review and save to give them access.', 'info')
      })
    }

    // The three things that write, each first shown as a summary to confirm.
    function makeOwnReview () {
      const copy = clone(state.rules.principals)
      const lines = ['Nothing changes in who can see or change it: the rules are copied as they are.',
        'A rules file is made for this ' + noun + ': ' + state.aclUrl]
      if (state.rules.readOnly.length) lines.push(state.rules.readOnly.length + ' rule(s) this pane cannot edit are copied too.')
      return {
        title: 'Give this ' + noun + ' its own rules?',
        lines,
        blocked: someOwner(copy) || state.rules.readOnly.some(r => r.agents.length && r.modes.has('Control')) ? '' : 'The folder rules give no person control, so a copy would leave this ' + noun + ' with no owner. Nothing was saved.',
        losesControl: false,
        confirm: 'Make its own rules',
        run: async () => {
          const taken = new Set()
          const triples = []
          let n = 0
          const $rdf = rdflib()
          for (const node of state.rules.applying) {
            let id; do { id = state.aclUrl + '#inherited-' + (++n) } while (taken.has(id)); taken.add(id)
            const s = $rdf.sym(id)
            for (const st of state.graph.statementsMatching(node, null, null)) {
              if ([ACL + 'accessTo', ACL + 'default', ACL + 'defaultForNew'].includes(st.predicate.value)) continue
              triples.push([s, st.predicate, st.object])
              if (st.object.termType === 'BlankNode') for (const inner of state.graph.statementsMatching(st.object, null, null)) triples.push([inner.subject, inner.predicate, inner.object])
            }
            triples.push([s, $rdf.sym(ACL + 'accessTo'), $rdf.sym(item)])
            if (isFolder) triples.push([s, $rdf.sym(ACL + 'default'), $rdf.sym(item)])
          }
          const response = await sendAcl(fetcher, state.aclUrl, triples, { 'If-None-Match': '*' })
          return { response, expect: copy, acl: state.aclUrl, done: 'This ' + noun + ' now has its own rules, the same as before. Change them below.' }
        }
      }
    }

    function makeSaveReview () {
      const lines = summary(state.rules.principals, draft)
      const mine = me()
      return {
        title: 'Check before saving',
        lines,
        relines: () => summary(state.rules.principals, draft),
        blocked: someOwner(draft) ? '' : 'These rules would leave nobody as owner: no person could change who has access, and nobody could fix it from here. Make at least one person an owner. Nothing was saved.',
        losesControl: !!mine && canControl(state.rules.principals, mine) && !canControl(draft, mine),
        confirm: 'Save these changes',
        run: async () => {
          const kept = state.graph.statements.filter(st => !(st.subject.termType === 'NamedNode' && state.rules.editable.has(st.subject.value)))
          const taken = new Set(state.graph.statements.map(st => st.subject.value))
          const triples = kept.map(st => [st.subject, st.predicate, st.object]).concat(principalTriples(draft, { item, isFolder, aclUrl: state.aclUrl, taken }))
          const condition = state.etag ? { 'If-Match': state.etag } : {}
          const response = await sendAcl(fetcher, state.aclUrl, triples, condition)
          return { response, expect: clone(draft), acl: state.aclUrl, done: 'Saved. Below is what the server now has.' }
        }
      }
    }

    async function makeBackReview () {
      const inherited = await findInherited()
      if (inherited.kind !== 'inherited') {
        return { title: 'Go back to inherited rules?', lines: [], blocked: inherited.kind === 'denied' ? 'You cannot see the rules of the folders above, so it is not safe to go back to them. Nothing was changed.' : 'There are no folder rules above this ' + noun + ' to go back to. Nothing was changed.', confirm: '' }
      }
      const mine = me()
      const lines = summary(state.rules.principals, inherited.rules.principals)
      return {
        title: 'Go back to inherited rules?',
        lines: ['This deletes the rules file of this ' + noun + '. It will then follow the rules of the folder ' + shortName(inherited.from) + '.'].concat(lines.length ? lines : ['Nothing changes in who can see or change it.']),
        blocked: someOwner(inherited.rules.principals) || inherited.rules.readOnly.some(r => r.agents.length && r.modes.has('Control')) ? '' : 'The folder rules give no person control. Nothing was changed.',
        losesControl: !!mine && canControl(state.rules.principals, mine) && !canControl(inherited.rules.principals, mine),
        confirm: 'Delete its own rules',
        danger: true,
        run: async () => {
          const response = await fetcher(state.aclUrl, { method: 'DELETE', headers: state.etag ? { 'If-Match': state.etag } : {} })
          return { response, expect: inherited.rules.principals, acl: null, done: 'This ' + noun + ' follows the rules of the folder ' + shortName(inherited.from) + ' again.' }
        }
      }
    }

    function drawReview () {
      const box = body.appendChild(el(dom, 'div', 'shr-review'))
      box.setAttribute('role', 'group')
      box.setAttribute('aria-label', review.title)
      box.appendChild(el(dom, 'h3', 'shr-subheading', review.title))
      if (review.lines.length) {
        const ul = box.appendChild(el(dom, 'ul', 'shr-summary'))
        for (const line of review.lines) ul.appendChild(el(dom, 'li', '', line))
      }
      const buttons = el(dom, 'div', 'shr-btns')
      const cancel = buttons.appendChild(el(dom, 'button', 'shr-btn shr-btn-tertiary shr-cancel', review.blocked ? 'Back' : 'Cancel'))
      cancel.type = 'button'
      cancel.addEventListener('click', () => { review = null; draw() })
      const warn = (text, extra) => { const p = box.appendChild(el(dom, 'p', 'shr-note shr-note-error shr-warn ' + extra)); p.append(icon(dom, 'alert'), el(dom, 'span', '', text)) }
      if (review.blocked) {
        warn(review.blocked, 'shr-blocked')
      } else {
        if (review.losesControl) warn('You will no longer be able to change who has access to this ' + noun + '. Only another owner could give it back.', 'shr-lose')
        const go = buttons.appendChild(el(dom, 'button', 'shr-btn shr-confirm ' + (review.danger || review.losesControl ? 'shr-btn-danger' : 'shr-btn-primary'), review.losesControl ? 'Yes, remove my own control' : review.confirm))
        go.type = 'button'
        go.disabled = busy
        let armed = !review.losesControl
        go.addEventListener('click', async () => {
          if (!armed) { armed = true; go.textContent = 'Click again to confirm: I will lose control'; return }
          await apply()
        })
      }
      box.appendChild(buttons)
    }

    async function apply () {
      if (busy) return
      busy = true
      const running = review
      for (const b of body.querySelectorAll('button, select, input')) b.disabled = true
      say('Saving...')
      root.dataset.state = 'busy'
      let result
      try { result = await running.run() } catch (error) { busy = false; draw(); say('Not saved: ' + (error && error.message ? error.message : error), 'bad'); toast('Not saved', 'error'); return }
      busy = false
      const { response, expect, done, acl } = result
      if (response.status === 412) { await refresh('Someone changed these rules while you were looking. Nothing was saved. Here is what the server has now; please check and try again.', 'bad'); toast('Not saved: the rules changed meanwhile', 'error'); return }
      if (!response.ok) {
        let why = ''
        try { why = (await response.text()).slice(0, 200) } catch { /* no text */ }
        draw()
        say('The server refused the change (' + response.status + '). Nothing was changed.' + (why ? ' ' + why : ''), 'bad')
        toast('The server refused the change', 'error')
        return
      }
      // Read back what the server now has, and say if it is not what was meant.
      await refresh()
      const now = state.rules ? state.rules.principals : new Map()
      const differences = summary(expect, now)
      // For hosts (README "For hosts"): once the server has the write and the re-read agrees (or, after giving up your
      // own control, can no longer be read), say so with one bubbling event from the root.
      const changed = () => { try { root.dispatchEvent(new CustomEvent('suite-sharing-change', { bubbles: true, composed: true, detail: { uri: item, acl } })) } catch { /* no host listening */ } }
      if (state.kind === 'denied') { say(done + ' You can no longer see the rules.', 'good'); toast(done, 'success'); changed() } else if (differences.length) { say('Saved, but the server now has something different from what was sent: ' + differences.join('; ') + '.', 'bad'); toast('Saved, but the server has something different', 'error') } else { say(done, 'good'); toast(done, 'success'); changed() }
    }

    refresh()
    return root
  }
}

export default pane
