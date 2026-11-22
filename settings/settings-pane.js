// settings-pane.js: a person's own settings, the apps they trust, and a health check of their pod's settings.
// Shown only to that person: on their WebID or their preferences file, when the viewer is logged in as
// that WebID or may edit the document. It never opens first; pick "Settings" from the pane menu, or from the
// avatar menu of the suite shell, where its three sections (Your pod, Trusted apps, Preferences) are also in the
// shell's left column (renderNavigation) and a saved change is said with the shell's toast.
// Styled with the suite's design sheet (design/, block between the suite:design markers; do not edit by hand).
// Icons: Material Design Icons (Apache 2.0).
//
// One file, no imports. It reads and writes the formats SolidOS itself uses:
//
//   profile        <#me> solid:oidcIssuer <https://idp.example/> ; pim:storage </> ;
//                      pim:preferencesFile </settings/prefs.ttl> ; solid:publicTypeIndex </settings/publicTypeIndex.ttl> ;
//                      acl:trustedApp <#app-1> .
//                  <#app-1> acl:origin <https://app.example> ; acl:mode acl:Read, acl:Write .
//   preferences    <> a pim:ConfigurationFile .
//                  <card#me> a solid:PowerUser, solid:Developer ;            (the "user types" upstream offers)
//                      solid:privateTypeIndex <privateTypeIndex.ttl> ;
//                      tools:toolIndex <toolIndex.jsonld> .                 (https://pod-os.org/vocab/tools#)
//
// What this pane writes, and when. Never a PATCH: each change GETs the whole document, changes only the statements
// named here, PUTs it back with If-Match in its own content type, reads it back and compares every statement, and
// PUTs the original back if the pod stored anything else (see "whole-document writes"):
// - Add a trusted app: in the profile, <person> acl:trustedApp <#trusted-…>, its acl:origin and its acl:mode(s).
// - Change an app's level: in the profile, only the acl:mode statements of that app that change.
// - Remove an app: in the profile, the acl:trustedApp link to it and that app's own statements.
// - Flip a preference switch: in the preferences file, one statement <person> a solid:PowerUser (or solid:Developer).
// Nothing else changes. It never creates or deletes a document.

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const SOLID = 'http://www.w3.org/ns/solid/terms#'
const PIM = 'http://www.w3.org/ns/pim/space#'
const ACL = 'http://www.w3.org/ns/auth/acl#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const TOOL_INDEX = 'https://pod-os.org/vocab/tools#toolIndex'
const PERSON_TYPES = [FOAF + 'Person', 'http://schema.org/Person', 'https://schema.org/Person', 'http://www.w3.org/2006/vcard/ns#Individual']
const TOOLS_APP = 'https://solid-apps.github.io/tools/'
const ACCEPT = 'text/turtle, application/ld+json;q=0.9, */*;q=0.5' // short, see the skill's note on static hosts

// What each access mode lets an app do, in plain words.
const MODE_WORDS = {
  Read: 'see your data',
  Append: 'add to your data',
  Write: 'change and delete your data',
  Control: 'change who may see and change your data'
}
// The levels offered, from least to most. Each is the exact set of modes written.
const LEVELS = [
  { key: 'view', label: 'View', modes: ['Read'] },
  { key: 'add', label: 'View and add', modes: ['Read', 'Append'] },
  { key: 'edit', label: 'Edit', modes: ['Read', 'Write'] },
  { key: 'control', label: 'Control', modes: ['Read', 'Write', 'Control'] }
]
// The upstream "user types" (solid-panes dashboard/basicPreferences): panes with an `audience` show only to these.
const ROLES = [
  { type: SOLID + 'PowerUser', label: 'Power user', hint: 'Show the extra views meant for people who like more options and more detail.' },
  { type: SOLID + 'Developer', label: 'Developer', hint: 'Show the views for developers, such as the raw data of a document.' }
]

// Icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box.
const MDI = {
  cog: 'M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z',
  database: 'M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z',
  shield: 'M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z',
  tune: 'M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z',
  earth: 'M17.9,17.39C17.64,16.59 16.89,16 16,16H15V13A1,1 0 0,0 14,12H8V10H10A1,1 0 0,0 11,9V7H13A2,2 0 0,0 15,5V4.59C17.93,5.77 20,8.64 20,12C20,14.08 19.2,15.97 17.9,17.39M11,19.93C7.05,19.44 4,16.08 4,12C4,11.38 4.08,10.78 4.21,10.21L9,15V16A2,2 0 0,0 11,18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z',
  refresh: 'M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z',
  plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  alert: 'M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z',
  lock: 'M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z',
  remove: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)
// The sections of the page, in order: the navigation column (in the suite shell) jumps to them.
const SECTIONS = [
  { key: 'overview', label: 'Your pod', icon: 'database' },
  { key: 'trusted', label: 'Trusted apps', icon: 'shield' },
  { key: 'prefs', label: 'Preferences', icon: 'tune' }
]

const CSS = `
/* suite:design begin --prefix set --only icon,nav,row,buttons,input,switch,chip,toast */
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
.set-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.set-root *, .set-root *::before, .set-root *::after { box-sizing: border-box }
.set-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.set-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.set-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.set-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.set-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.set-root [hidden] { display: none !important }
.set-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.set-muted { color: var(--sui-text-muted) }
.set-small { font-size: var(--sui-text-sm) }
.set-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.set-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.set-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.set-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.set-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.set-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --set-i set to url("data:image/svg+xml,...") ---------------------------------- */
.set-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--set-i) center / contain no-repeat; mask: var(--set-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.set-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.set-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.set-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.set-nav-item:hover { background: var(--sui-bg-hover) }
.set-nav-item[aria-current="page"], .set-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.set-nav-item .set-icon { color: var(--sui-text-muted) }
.set-nav-item[aria-current] .set-icon { color: inherit }
.set-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.set-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.set-nav-new { margin-bottom: var(--sui-space-2) }
.set-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.set-list { margin: 0; padding: 0; list-style: none }
.set-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.set-row:hover { background: var(--sui-bg-hover) }
.set-row[aria-selected="true"], .set-row[aria-current="true"] { background: var(--sui-primary-light) }
.set-row-main { flex: 1 1 auto; min-width: 0 }
.set-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.set-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.set-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.set-row-actions { flex: none; display: flex; align-items: center }
.set-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.set-row-icon .set-icon { width: 28px; height: 28px }
.set-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .set-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.set-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.set-btn:hover { background: var(--sui-primary-light-hover) }
.set-btn:disabled, .set-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.set-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.set-btn-primary:hover { background: var(--sui-primary-element-hover) }
.set-btn-tertiary { background: transparent; color: var(--sui-text) }
.set-btn-tertiary:hover { background: var(--sui-bg-hover) }
.set-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.set-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.set-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.set-btn-icon:hover { background: var(--sui-bg-hover) }
.set-btn-wide { width: 100%; justify-content: flex-start }
.set-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.set-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.set-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.set-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.set-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.set-input:hover { border-color: var(--sui-primary-element) }
.set-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.set-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.set-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.set-search { position: relative; display: flex; align-items: center; min-width: 0 }
.set-search .set-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.set-search .set-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.set-select { position: relative; display: block; min-width: 0 }
.set-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.set-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.set-file { position: relative; overflow: hidden }
.set-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.set-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .set-row-check */
.set-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.set-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.set-check-round { border-radius: 50% }
.set-check:hover { border-color: var(--sui-primary-element) }
.set-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.set-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.set-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.set-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.set-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.set-segment:hover { background: var(--sui-bg-hover) }
.set-segment[aria-pressed="true"], .set-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- switch: <label class="ui-switch"><input type="checkbox" role="switch"><span>Text</span></label> ---------- */
.set-switch { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.set-switch input { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 40px; height: 22px; margin: 0; border-radius: var(--sui-radius-pill); background: var(--sui-border-strong); cursor: pointer; transition: background var(--sui-ease) }
.set-switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--sui-bg); transition: transform var(--sui-ease) }
.set-switch input:checked { background: var(--sui-primary-element) }
.set-switch input:checked::after { transform: translateX(18px) }
.set-switch input:disabled { opacity: .5 }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.set-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.set-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.set-chip { cursor: pointer }
button.set-chip:hover { background: var(--sui-primary-light-hover) }
.set-chip-primary, .set-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.set-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.set-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.set-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.set-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.set-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.set-toast-error { border-left-color: var(--sui-error) }
.set-toast-success { border-left-color: var(--sui-success) }
.set-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.set-status-error { color: var(--sui-error) }
.set-status-success { color: var(--sui-success) }
.set-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.set-note-error { background: var(--sui-error-light) }
.set-note-warning { background: var(--sui-warning-light) }
.set-note-success { background: var(--sui-success-light) }
/* suite:design end */
.set.settings-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8) }
.set.settings-pane p { max-width: none }
.set-head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--sui-space-3) var(--sui-space-4); margin-bottom: var(--sui-space-4) }
.set-head-text { flex: 1 1 260px; min-width: 0 }
.set-title { overflow-wrap: anywhere }
.set-sub { display: flex; align-items: center; gap: var(--sui-space-2); margin-top: var(--sui-space-1); color: var(--sui-text-muted); overflow-wrap: anywhere }
.set-sub .set-icon { width: 16px; height: 16px }
.set-say { margin: 0 0 var(--sui-space-4); overflow-wrap: anywhere }
.set-say:empty { display: none }
.set-say.set-note { margin-bottom: var(--sui-space-4) }
.set-section { margin: 0 0 var(--sui-space-6); padding: var(--sui-space-6); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg); scroll-margin-top: calc(var(--sui-target) + var(--sui-space-4)) }
.set-section:empty { display: none }
.set-section-head { display: flex; align-items: center; gap: var(--sui-space-3); margin-bottom: var(--sui-space-1) }
.set-section-head .set-icon { color: var(--sui-primary-element) }
.set-hint { margin: 0 0 var(--sui-space-5); color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.set-rows { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: var(--sui-space-5) var(--sui-space-6); margin: 0; padding: 0; list-style: none }
.set-item { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.set-item-top { display: flex; align-items: center; justify-content: space-between; gap: var(--sui-space-2); min-width: 0 }
.set-name { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold) }
.set-value { min-width: 0; overflow-wrap: anywhere }
.set-value a { text-decoration: none }
.set-value a:hover { text-decoration: underline }
.set-none { color: var(--sui-text-muted) }
.set-help { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
.set-item .set-chip { flex: none }
.set-apps { margin: 0 0 var(--sui-space-2); padding: 0; list-style: none }
.set-app { padding: var(--sui-space-1) 0; border-top: 1px solid var(--sui-border) }
.set-app:first-child { border-top: 0 }
.set-app .set-row { flex-wrap: wrap; cursor: default; padding-left: 0; padding-right: 0 }
.set-root .set-note { border: 0 }
.set-app .set-row:hover { background: transparent }
.set-app .set-row-main { flex: 1 1 220px }
.set-app .set-row-title { white-space: normal; overflow-wrap: anywhere }
.set-app .set-row-sub { white-space: normal }
.set-app .set-row-actions { flex-wrap: wrap; gap: var(--sui-space-2); margin-left: auto }
.set-app .set-row-icon { background: var(--sui-bg-app) }
.set-level { width: auto; max-width: 100% }
.set-app .set-note { margin: 0 0 var(--sui-space-3) 52px }
.set-empty-line { padding: var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-bg-app); color: var(--sui-text-muted); text-align: center }
.set-add { margin-top: var(--sui-space-4); padding-top: var(--sui-space-5); border-top: 1px solid var(--sui-border) }
.set-add-title { margin: 0 0 var(--sui-space-3) }
.set-fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto; gap: var(--sui-space-3) var(--sui-space-4); align-items: end }
.set-add .set-note { margin-top: var(--sui-space-3) }
.set-warn-actions { margin-top: var(--sui-space-3) }
.set-note p { margin: 0 }
.set-note > .set-icon { margin-top: 2px }
.set-note-body { flex: 1 1 auto; min-width: 0 }
.set-small-note { margin: var(--sui-space-3) 0 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.set-switches { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: var(--sui-space-4) var(--sui-space-6); margin: 0; padding: 0; list-style: none }
.set-switch-row { min-width: 0 }
.set-switch { font-weight: var(--sui-weight-bold) }
.set-switch-hint { margin: 0 0 0 52px; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.set-foot { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
@media (max-width: 600px) {
  .set.settings-pane { padding: var(--sui-space-3) var(--sui-space-3) var(--sui-space-6) }
  .set-section { padding: var(--sui-space-4) }
  .set-fields { grid-template-columns: minmax(0, 1fr) }
  .set-app .set-row-actions { margin-left: 52px }
  .set-app .set-note { margin-left: 0 }
}
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
const isWeb = (value) => /^https?:\/\//i.test(value || '')
const editable = (store, doc) => { try { return !!(store.updater && store.updater.editable(doc.value, store)) } catch { return false } }
const localName = (value) => value.replace(/.*[#/]/, '')

// Is the subject a preferences document? (The document itself, typed pim:ConfigurationFile.)
function isPreferences (store, subject) {
  const doc = subject.doc()
  return subject.value === doc.value && store.holds(doc, store.sym(RDF_TYPE), store.sym(PIM + 'ConfigurationFile'), doc)
}

// Does the subject look like a person's WebID, by what its profile says about it?
function isPerson (store, subject) {
  if (subject.termType !== 'NamedNode') return false
  const sym = store.sym.bind(store)
  const doc = subject.doc()
  if (PERSON_TYPES.some(type => store.holds(subject, sym(RDF_TYPE), sym(type), doc))) return true
  return [PIM + 'preferencesFile', SOLID + 'oidcIssuer', PIM + 'storage'].some(p => !!store.any(subject, sym(p), null, doc))
}

// Whose settings these are: the WebID itself, or for a preferences file, the person it belongs to.
function findPerson (store, subject, me) {
  if (isPreferences(store, subject)) {
    const sym = store.sym.bind(store)
    const doc = subject.doc()
    if (me && store.holds(me, sym(PIM + 'preferencesFile'), doc)) return me
    const owner = store.any(null, sym(PIM + 'preferencesFile'), doc)
    if (owner && owner.termType === 'NamedNode') return owner
    // Upstream writes its statements about the person into the file: take the person from those.
    for (const p of [SOLID + 'privateTypeIndex', TOOL_INDEX, RDF_TYPE]) {
      const found = store.statementsMatching(null, sym(p), null, doc)
        .map(st => st.subject).find(s => s.termType === 'NamedNode' && s.value !== doc.value && s.value.includes('#'))
      if (found) return found
    }
    return null
  }
  return isPerson(store, subject) ? subject : null
}

// Is the viewer this person? Logged in as that WebID; or allowed to edit the document on show when it is a
// preferences file, or a WebID profile that names an identity provider (an account, not a contact card in
// someone's address book, which is person-typed and editable too but has no settings).
function viewerIsPerson (store, subject, context) {
  const me = currentUser(context)
  const person = findPerson(store, subject, me)
  if (!person) return null
  if (me && me.value === person.value) return person
  if (!editable(store, subject.doc())) return null
  if (isPreferences(store, subject)) return person
  return store.any(person, store.sym(SOLID + 'oidcIssuer'), null, person.doc()) ? person : null
}

// The level a set of modes amounts to, or null if it is none of the four offered.
function levelOf (modes) {
  const set = [...new Set(modes)].sort().join(' ')
  const exact = LEVELS.find(l => [...l.modes].sort().join(' ') === set)
  if (exact) return exact.key
  // Write includes Append in WAC, so Read + Append + Write is still "edit".
  if (set === 'Append Read Write') return 'edit'
  if (set === 'Append Control Read Write') return 'control'
  return null
}

function plainModes (modes) {
  const words = ['Read', 'Append', 'Write', 'Control'].filter(m => modes.includes(m)).map(m => MODE_WORDS[m])
  if (modes.includes('Write') && modes.includes('Append')) words.splice(words.indexOf(MODE_WORDS.Append), 1)
  if (!words.length) return 'Nothing: no access modes are listed.'
  const text = words.length === 1 ? words[0] : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1]
  return 'May ' + text + '.'
}

// An app's address, checked: an https origin, nothing after it. A bare host gets https:// in front.
function cleanOrigin (text) {
  let value = String(text || '').trim()
  if (!value) return { error: 'Type the address of the app first, like https://app.example' }
  if (/\s/.test(value)) return { error: 'A web address has no spaces. Type it like https://app.example' }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value
  let url
  try { url = new URL(value) } catch { return { error: 'That is not a web address. Type it like https://app.example' } }
  if (url.protocol !== 'https:') return { error: 'Only https addresses can be trusted: ' + url.protocol.replace(':', '') + ' is not safe enough.' }
  const host = url.hostname
  if (!(host === 'localhost' || /^\[[0-9a-f:.]+\]$/i.test(host) || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,}$/i.test(host))) return { error: 'That does not look like a site\'s address. Type it like https://app.example' }
  if (url.username || url.password) return { error: 'The address must not have a user name or password in it.' }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || /^https:\/\/[^/]+\/./i.test(value)) {
    return { error: 'Give only the app\'s site, with nothing after it: ' + url.origin }
  }
  return { origin: url.origin }
}

// What a probe found: found, missing, locked (not readable), or unknown (could not check).
async function probe (fetcher, address) {
  try {
    const response = await fetcher(address, { method: 'HEAD', headers: { Accept: ACCEPT } })
    if (response.ok) return { state: 'found', code: response.status }
    if (response.status === 404 || response.status === 410) return { state: 'missing', code: response.status }
    if (response.status === 401 || response.status === 403) return { state: 'locked', code: response.status }
    return { state: 'unknown', code: response.status }
  } catch (error) {
    return { state: 'unknown', code: 0 }
  }
}

// ---------- whole-document writes ----------
// JSS loses data on a PATCH (jss-findings 5, 6, 7): a literal holding "}" is dropped, a JSON-LD document loses its
// nested objects (inline keys, emails) and @list values, and a WHERE clause is ignored. So this pane never patches.
// Every change: GET the whole document as stored, with its ETag; change only the statements named, in memory; PUT
// it back whole, If-Match, in the same content type; read it again and check it holds exactly what was sent (the
// change, and every other statement as it was). If not, the original text is PUT back and the change is refused.
const WD_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const WD_STRING = 'http://www.w3.org/2001/XMLSchema#string'
const WD_TYPES = ['application/ld+json', 'text/turtle']

// A term as expanded JSON-LD. Blank nodes keep a stable _:bN name; an RDF list stays an @list.
function wdTerm (t, bn) {
  if (t.termType === 'Collection') return { '@list': t.elements.map(e => wdTerm(e, bn)) }
  if (t.termType === 'BlankNode') return { '@id': bn(t) }
  if (t.termType === 'Literal') {
    const o = { '@value': t.value }
    if (t.language) o['@language'] = t.language
    else if (t.datatype && t.datatype.value !== WD_STRING && t.datatype.value !== WD_RDF + 'langString') o['@type'] = t.datatype.value
    return o
  }
  return { '@id': t.value }
}
// The whole graph as flat, expanded JSON-LD: one top-level object per subject, each with an @id, full IRIs only.
function wdJsonld (statements) {
  const ids = new Map()
  const bn = (t) => { if (!ids.has(t.value)) ids.set(t.value, '_:b' + ids.size); return ids.get(t.value) }
  const nodes = new Map()
  for (const s of statements) {
    const id = s.subject.termType === 'BlankNode' ? bn(s.subject) : s.subject.value
    const node = nodes.get(id) || { '@id': id }
    nodes.set(id, node)
    if (s.predicate.value === WD_RDF + 'type' && s.object.termType === 'NamedNode') (node['@type'] = node['@type'] || []).push(s.object.value)
    else (node[s.predicate.value] = node[s.predicate.value] || []).push(wdTerm(s.object, bn))
  }
  return JSON.stringify({ '@graph': [...nodes.values()] }, null, 2) + '\n'
}
const wdHash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) + '.' + text.length.toString(36) }
// A graph as sorted lines that compare equal for equal graphs: lists spelled out as rdf:first/rest, and blank
// nodes named by what is around them (a few rounds of refinement), not by their labels.
function wdCanon (statements) {
  const triples = []
  let n = 0
  const NIL = { termType: 'NamedNode', value: WD_RDF + 'nil' }
  const FIRST = { termType: 'NamedNode', value: WD_RDF + 'first' }
  const REST = { termType: 'NamedNode', value: WD_RDF + 'rest' }
  const flat = (t) => {
    if (t.termType !== 'Collection') return t
    let head = NIL
    for (const e of [...t.elements].reverse()) { const b = { termType: 'BlankNode', value: 'wdlist' + (n++) }; triples.push([b, FIRST, flat(e)], [b, REST, head]); head = b }
    return head
  }
  for (const s of statements) triples.push([flat(s.subject), s.predicate, flat(s.object)])
  const isB = (t) => t.termType === 'BlankNode'
  const nt = (t) => t.termType === 'Literal' ? JSON.stringify([t.value, t.language ? '@' + t.language.toLowerCase() : (t.datatype && t.datatype.value) || WD_STRING]) : '<' + t.value + '>'
  let sig = new Map()
  for (const [s, , o] of triples) { if (isB(s)) sig.set(s.value, ''); if (isB(o)) sig.set(o.value, '') }
  const show = (t, m) => isB(t) ? '_:' + m.get(t.value) : nt(t)
  for (let round = 0; round < 6 && sig.size; round++) {
    const parts = new Map([...sig.keys()].map(k => [k, []]))
    for (const [s, p, o] of triples) {
      if (isB(s)) parts.get(s.value).push('>' + p.value + ' ' + show(o, sig))
      if (isB(o)) parts.get(o.value).push('<' + show(s, sig) + ' ' + p.value)
    }
    sig = new Map([...parts].map(([k, list]) => [k, wdHash(list.sort().join('\n'))]))
  }
  return triples.map(([s, p, o]) => show(s, sig) + ' <' + p.value + '> ' + show(o, sig)).sort().join('\n')
}
// The document as the pod stores it: its text, type, ETag and statements (in a graph of its own).
async function wdRead (fetcher, doc) {
  const response = await fetcher(doc.value, { headers: { Accept: '*/*' }, cache: 'no-store' })
  if (!response.ok) throw new Error('it could not be read (' + response.status + ')')
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!WD_TYPES.includes(type)) throw new Error('it is stored as ' + (type || 'an unknown type') + ', which this page does not write')
  const text = await response.text()
  const graph = rdflib().graph()
  await new Promise((resolve, reject) => rdflib().parse(text, graph, doc.value, type, (error) => error ? reject(error) : resolve()))
  return { text, type, etag: response.headers.get('etag'), graph }
}
// One change, written as described above. Throws (nothing written) when the document cannot be read, has changed
// since the page read it, or the pod refuses. Returns { ok: true, graph } when the pod holds exactly what was sent;
// { ok: false, restored } when it did not and the original was (or could not be) put back.
async function writeWhole (store, doc, deletions, insertions) {
  const fetcher = webFetch(store)
  const before = await wdRead(fetcher, doc)
  const graph = before.graph
  const original = wdCanon(graph.statements)
  for (const s of deletions) {
    if (!graph.holds(s.subject, s.predicate, s.object, doc)) throw new Error('it was changed somewhere else since this page read it. Reload and try again')
    graph.removeMatches(s.subject, s.predicate, s.object, doc)
  }
  for (const s of insertions) if (!graph.holds(s.subject, s.predicate, s.object, doc)) graph.add(s.subject, s.predicate, s.object, doc)
  const sent = wdCanon(graph.statements)
  if (sent === original) return { ok: true, graph }
  const body = before.type === 'application/ld+json' ? wdJsonld(graph.statements) : rdflib().serialize(doc, graph, doc.value, 'text/turtle')
  const headers = { 'Content-Type': before.type }
  if (before.etag) headers['If-Match'] = before.etag
  const put = await fetcher(doc.value, { method: 'PUT', headers, body })
  if (put.status === 412) throw new Error('it was changed somewhere else a moment ago. Reload and try again')
  if (!put.ok) throw new Error('the pod refused it (' + put.status + ')')
  let after = null
  try { after = await wdRead(fetcher, doc) } catch { /* treated as not stored */ }
  if (after && wdCanon(after.graph.statements) === sent) return { ok: true, graph: after.graph }
  // The pod stored something else: put the original text back, and check that.
  let restored = false
  try {
    const back = { 'Content-Type': before.type }
    if (after && after.etag) back['If-Match'] = after.etag
    const response = await fetcher(doc.value, { method: 'PUT', headers: back, body: before.text })
    if (response.ok) restored = wdCanon((await wdRead(fetcher, doc)).graph.statements) === original
  } catch { /* restored stays false */ }
  return { ok: false, restored }
}
// After a write the pod has: the same change in the shared store, so the page shows it without a reload.
function mirror (store, deletions, insertions) {
  for (const s of deletions) { try { store.removeMatches(s.subject, s.predicate, s.object, s.graph) } catch { /* already gone */ } }
  for (const s of insertions) { if (!store.holds(s.subject, s.predicate, s.object, s.graph)) store.add(s.subject, s.predicate, s.object, s.graph) }
}

const PILL = { found: 'Found', missing: 'Missing', locked: 'Not readable', unknown: 'Not checked', checking: 'Checking', unset: 'Not set up' }
const CHIP = { found: 'success', missing: 'warning', locked: 'warning', unknown: '', checking: '', unset: 'warning' }

function icon (dom, name) {
  const span = dom.createElement('span')
  span.className = 'set-icon'
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--set-i', `url("${svg(MDI[name])}")`)
  return span
}

function button (dom, className, text, iconName) {
  const b = el(dom, 'button', 'set-btn ' + className)
  b.type = 'button'
  if (iconName) b.appendChild(icon(dom, iconName))
  b.appendChild(el(dom, 'span', 'set-btn-text', text))
  return b
}

// The suite shell's per-showing state, or a plain object when the pane is alone.
const stateOf = (context) => (context && context.suite && context.suite.version >= 1 && context.suite.state) || {}

const pane = {
  name: 'settings-lab',
  icon: svg(MDI.cog, '#00679e'),

  label (subject, context) {
    try { return viewerIsPerson(context.session.store, subject, context) ? 'Settings' : null } catch { return null }
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const sym = store.sym.bind(store)
    const fetcher = webFetch(store)
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null
    const shared = stateOf(context)
    const st = (s, p, o, g) => rdflib().st(s, p, o, g)
    const root = el(dom, 'div', 'set settings-pane set-root')
    root.appendChild(el(dom, 'style', '', CSS))

    const head = root.appendChild(el(dom, 'div', 'set-head'))
    const headText = head.appendChild(el(dom, 'div', 'set-head-text'))
    const title = headText.appendChild(el(dom, 'h2', 'set-title', 'Settings'))
    const sub = headText.appendChild(el(dom, 'p', 'set-sub'))
    const headActions = head.appendChild(el(dom, 'div', 'set-btns'))
    const status = root.appendChild(el(dom, 'div', 'set-status set-say'))
    status.setAttribute('role', 'status')
    const sectionEls = {}
    const section = (key, className) => {
      const part = root.appendChild(el(dom, 'section', 'set-section ' + className))
      part.dataset.section = key
      sectionEls[key] = part
      return part
    }
    const overview = section('overview', 'set-overview')
    const apps = section('trusted', 'set-trusted')
    const prefs = section('prefs', 'set-prefs')
    const foot = root.appendChild(el(dom, 'p', 'set-foot'))
    shared.sections = sectionEls

    // A message in place: info and errors as a status line or note; in the suite shell a success is a toast.
    const say = (text, kind) => {
      status.replaceChildren()
      kind = kind || 'info'
      if (text && kind === 'good' && suite) {
        // In the shell a success is a toast only; the line stays (empty, so hidden) to mark the outcome.
        try { suite.toast(text, { kind: 'success' }); status.className = 'set-status set-say set-good'; return } catch { /* say it in place */ }
      }
      if (text && kind === 'bad') {
        status.className = 'set-say set-note set-note-error set-bad'
        status.appendChild(icon(dom, 'alert'))
        status.appendChild(el(dom, 'p', 'set-note-body', text))
      } else {
        status.className = 'set-status set-say' + (text ? (kind === 'good' ? ' set-status-success set-good' : ' set-info') : '')
        if (text) status.appendChild(el(dom, 'span', '', text))
      }
    }
    const sectionHead = (part, key, text) => {
      const h = part.appendChild(el(dom, 'div', 'set-section-head'))
      h.appendChild(icon(dom, SECTIONS.find(s => s.key === key).icon))
      h.appendChild(el(dom, 'h3', 'set-heading', text))
    }
    const checks = new Map() // address -> probe result
    let busy = false
    let loaded = false
    let person = null
    let profile = null
    let prefsDoc = null // the preferences file in use: the one on show, or the first the profile names
    let prefsRead = false

    function link (address) {
      if (!isWeb(address)) return el(dom, 'span', '', address)
      const a = el(dom, 'a', '', address)
      a.href = address
      a.rel = 'noopener'
      a.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        try {
          const outliner = context.getOutliner && context.getOutliner(dom)
          if (!outliner) return
          event.preventDefault()
          outliner.GotoSubject(sym(address), true, undefined, true, undefined)
        } catch { /* the plain link still works */ }
      })
      return a
    }

    // Where things are, as the profile and preferences file say. Each list holds { address, where }.
    function addresses () {
      const doc = profile
      const gather = (predicates, docs) => {
        const found = new Map()
        for (const [p, subjects] of predicates) {
          for (const d of docs) {
            if (!d) continue
            for (const s of subjects(d)) {
              for (const o of store.each(s, sym(p), null, d)) {
                if (o.termType !== 'NamedNode') continue
                const entry = found.get(o.value) || { address: o.value, where: [] }
                const label = d.value === profile.value ? 'profile' : 'preferences file'
                if (!entry.where.includes(label)) entry.where.push(label)
                found.set(o.value, entry)
              }
            }
          }
        }
        return [...found.values()]
      }
      const aboutPerson = () => [person]
      const aboutAnyone = (d) => [...new Map(store.statementsMatching(null, null, null, d).filter(x => x.subject.termType === 'NamedNode').map(x => [x.subject.value, x.subject])).values()]
      const prefsHere = prefsDoc && prefsRead ? prefsDoc : null
      return {
        issuers: gather([[SOLID + 'oidcIssuer', aboutPerson]], [doc]),
        storage: gather([[PIM + 'storage', aboutPerson]], [doc]),
        preferences: gather([[PIM + 'preferencesFile', aboutPerson]], [doc]),
        publicIndex: gather([[SOLID + 'publicTypeIndex', aboutAnyone]], [doc, prefsHere].filter(d => d && (d === doc || d.value !== doc.value))),
        privateIndex: gather([[SOLID + 'privateTypeIndex', aboutAnyone]], [doc, prefsHere].filter(d => d && (d === doc || d.value !== doc.value))),
        // As the data browser reads it (toolIndex.js): from any subject in the preferences file.
        toolIndex: prefsHere ? gather([[TOOL_INDEX, aboutAnyone]], [prefsHere]) : []
      }
    }

    // One overview item: a label and whether it was found, the address as a link, and help when it was not.
    function row (list, name, entries, help, key) {
      const item = (state, text) => {
        const li = list.appendChild(el(dom, 'li', 'set-item'))
        li.dataset.item = key
        const top = li.appendChild(el(dom, 'div', 'set-item-top'))
        top.appendChild(el(dom, 'span', 'set-name', name))
        const chip = top.appendChild(el(dom, 'span', 'set-chip' + (CHIP[state] ? ' set-chip-' + CHIP[state] : ''), text))
        chip.dataset.state = state
        return li
      }
      if (!entries.length) {
        const li = item('unset', loaded ? PILL.unset : PILL.checking)
        li.appendChild(el(dom, 'span', 'set-value set-none', 'Not set'))
        if (help.unset) li.appendChild(help.unset)
        return
      }
      for (const entry of entries) {
        const result = checks.get(entry.address)
        const state = result ? result.state : 'checking'
        const li = item(state, PILL[state])
        li.appendChild(el(dom, 'span', 'set-value')).appendChild(link(entry.address))
        const notes = []
        if (entry.where && entry.where.length && key !== 'webid' && !(entry.where.length === 1 && entry.where[0] === help.home)) notes.push('Listed in your ' + entry.where.join(' and ') + '.')
        if (entries.length > 1) notes.push(help.several || 'More than one is listed; apps may not agree on which one to use.')
        if (help[state]) notes.push(help[state])
        if (notes.length || help.link) {
          const p = li.appendChild(el(dom, 'p', 'set-help', notes.join(' ')))
          if (help.link && state !== 'found') { p.appendChild(dom.createTextNode(' ')); p.appendChild(help.link()) }
        }
      }
    }

    function helpText (text, extra) {
      const p = el(dom, 'p', 'set-help', text)
      if (extra) { p.appendChild(dom.createTextNode(' ')); p.appendChild(extra) }
      return p
    }
    const toolsLink = () => { const a = el(dom, 'a', '', 'Make one with the Tools app.'); a.href = TOOLS_APP; a.rel = 'noopener'; a.target = '_blank'; return a }

    function drawOverview () {
      overview.replaceChildren()
      sectionHead(overview, 'overview', 'Your pod')
      overview.appendChild(el(dom, 'p', 'set-hint', 'Where your pod keeps the things apps look for. Each one is checked by trying to load it.'))
      const list = overview.appendChild(el(dom, 'ul', 'set-rows'))
      const a = addresses()
      const locked = 'You may not read it as you are logged in now; apps you use may still be able to.'
      const unknown = 'It could not be checked from this page; that is often fine.'
      row(list, 'WebID', [{ address: person.value, where: [] }], { missing: 'Your profile could not be found at this address.', locked, unknown }, 'webid')
      row(list, 'Identity provider', a.issuers, {
        home: 'profile',
        unset: helpText('Your profile does not name an identity provider, so apps cannot log you in with this WebID.'),
        missing: 'The provider did not answer as one; logging in may not work.',
        unknown: 'Its server does not let this page check it; logging in may still work fine.',
        locked
      }, 'issuer')
      row(list, 'Storage', a.storage, {
        home: 'profile',
        unset: helpText('Your profile does not say where your storage is. Apps will ask you, or guess from your WebID.'),
        missing: 'Nothing was found there. If your pod moved, the profile needs the new address.',
        locked, unknown
      }, 'storage')
      const prefsEntries = a.preferences.slice()
      if (prefsDoc && !prefsEntries.some(e => e.address === prefsDoc.value)) prefsEntries.push({ address: prefsDoc.value, where: ['this page (your profile does not link to it)'] })
      row(list, 'Preferences file', prefsEntries, {
        home: 'profile',
        unset: helpText('Your profile does not link to a preferences file. That is fine: apps that need one usually make it. Until then, the preferences below cannot be saved.'),
        missing: 'Your profile links to it, but it is not there. An app that needs it can make it again.',
        locked: 'It is private, and you may not read it as you are logged in now.',
        unknown
      }, 'preferences')
      row(list, 'Public type index', a.publicIndex, {
        home: 'profile',
        unset: helpText('There is none yet. Apps use it to find the things you share; many make one the first time they need it.'),
        missing: 'It is linked but not there. An app that needs it can make it again.',
        locked, unknown
      }, 'public-index')
      row(list, 'Private type index', a.privateIndex, {
        home: 'preferences file',
        unset: helpText(prefsRead ? 'There is none yet. Apps use it to find your private things; many make one the first time they need it.' : !prefsDoc ? 'There is none: it is listed in a preferences file, and there is no preferences file.' : 'It is listed in the preferences file, which could not be read.'),
        missing: 'It is linked but not there. An app that needs it can make it again.',
        locked, unknown
      }, 'private-index')
      row(list, 'Tool index', a.toolIndex, {
        home: 'preferences file',
        unset: helpText(prefsRead ? 'You have not set one up yet. It lists the panes and apps you want the data browser to use.' : !prefsDoc ? 'There is none: it is listed in a preferences file, and there is no preferences file.' : 'It is listed in the preferences file, which could not be read.', prefsRead ? toolsLink() : null),
        missing: 'It is linked but not there.',
        link: toolsLink,
        locked, unknown
      }, 'tool-index')
    }

    // ---- trusted apps

    // The apps the profile trusts, from the shared store or from a fresh read of the profile.
    function trusted (graph = store) {
      return graph.each(person, sym(ACL + 'trustedApp'), null, profile).map(node => ({
        node,
        origins: graph.each(node, sym(ACL + 'origin'), null, profile).map(o => o.value),
        modes: graph.each(node, sym(ACL + 'mode'), null, profile).map(m => localName(m.value))
      })).sort((x, y) => (x.origins[0] || '').localeCompare(y.origins[0] || ''))
    }

    // One change, written whole (writeWhole: GET, change in memory, PUT with If-Match, read back, compare every
    // statement; put the original back if the pod stored anything else). `verify` is an extra check on the pod's
    // copy. A change touching a blank node (an entry another app wrote) is refused before anything is sent.
    async function change (doc, deletions, insertions, done, verify, blank) {
      if (busy) return false
      if (blank || [...deletions, ...insertions].some(x => x.subject.termType === 'BlankNode' || x.object.termType === 'BlankNode')) {
        say('Not changed. Another app saved this one as a blank node (an entry without a name of its own), and this page does not change such entries, so nothing was sent.', 'bad')
        draw()
        return false
      }
      busy = true
      for (const control of root.querySelectorAll('button, select, input')) control.disabled = true
      say('Saving…')
      let ok = false
      try {
        const result = await writeWhole(store, doc, deletions, insertions)
        ok = result.ok && verify(result.graph)
        if (ok) { mirror(store, deletions, insertions); say(done, 'good') }
        else if (result.ok) say('Not changed as expected: the file was saved, but reading it back does not show the change. Check again.', 'bad')
        else if (result.restored) say('Not saved: your pod stored something different from what was sent, so the file was put back exactly as it was.', 'bad')
        else say('Not saved, and the file could not be put back as it was: your pod stored something different. Check the file now (Check again).', 'bad')
      } catch (error) {
        say('Not saved: ' + (error && error.message ? error.message : error) + '.', 'bad')
      }
      busy = false
      draw()
      return ok
    }
    const modesFor = (origin, graph) => trusted(graph).filter(a => a.origins.includes(origin)).map(a => [...a.modes].sort().join(' '))
    const same = (modes) => [...modes].sort().join(' ')

    function controlWarning (holder, origin, onYes, onNo) {
      holder.replaceChildren()
      const box = holder.appendChild(el(dom, 'div', 'set-note set-note-warning set-warn'))
      box.setAttribute('role', 'alert')
      box.appendChild(icon(dom, 'alert'))
      const body = box.appendChild(el(dom, 'div', 'set-note-body'))
      body.appendChild(el(dom, 'p', '', 'Control lets ' + origin + ' change who may see and change your data. It could share your private things with anyone, or lock you out of them. Give it only to an app you trust completely.'))
      const actions = body.appendChild(el(dom, 'div', 'set-btns set-warn-actions'))
      const no = actions.appendChild(button(dom, 'set-btn-tertiary set-no-control', 'Cancel'))
      no.addEventListener('click', () => { holder.replaceChildren(); onNo() })
      const yes = actions.appendChild(button(dom, 'set-btn-danger set-armed set-yes-control', 'Give it control'))
      yes.addEventListener('click', onYes)
    }

    function levelSelect (current) {
      const select = el(dom, 'select', 'set-input')
      if (!current) {
        const odd = select.appendChild(el(dom, 'option', '', 'As listed'))
        odd.value = ''
        odd.disabled = true
      }
      for (const level of LEVELS) {
        const option = select.appendChild(el(dom, 'option', '', level.label))
        option.value = level.key
      }
      select.value = current || ''
      return select
    }

    function drawApps () {
      apps.replaceChildren()
      sectionHead(apps, 'trusted', 'Trusted apps')
      apps.appendChild(el(dom, 'p', 'set-hint', 'Apps you trust may use your data while you use them, up to the level you choose here, and never more than you may do yourself.'))
      const canEdit = editable(store, profile)
      const list = apps.appendChild(el(dom, 'ul', 'set-apps'))
      const entries = trusted()
      if (!entries.length) list.appendChild(el(dom, 'li', 'set-empty-line', 'You have not trusted any app yet.'))
      for (const app of entries) {
        const li = list.appendChild(el(dom, 'li', 'set-app'))
        const origin = app.origins.join(', ') || '(no address)'
        li.dataset.origin = origin
        const line = li.appendChild(el(dom, 'div', 'set-row'))
        line.appendChild(el(dom, 'span', 'set-row-icon')).appendChild(icon(dom, 'earth'))
        const main = line.appendChild(el(dom, 'div', 'set-row-main'))
        main.appendChild(el(dom, 'span', 'set-row-title set-origin', origin))
        main.appendChild(el(dom, 'span', 'set-row-sub set-can', plainModes(app.modes)))
        const warnHolder = el(dom, 'div')
        if (canEdit && app.origins.length) {
          const actions = line.appendChild(el(dom, 'div', 'set-row-actions'))
          const current = levelOf(app.modes)
          const select = actions.appendChild(levelSelect(current))
          select.setAttribute('aria-label', 'Level for ' + origin)
          select.classList.add('set-level')
          const apply = (key) => {
            const want = LEVELS.find(l => l.key === key).modes
            const modeStatements = store.statementsMatching(app.node, sym(ACL + 'mode'), null, profile)
            const deletions = modeStatements.filter(s => !want.includes(localName(s.object.value)))
            const insertions = want.filter(m => !app.modes.includes(m)).map(m => st(app.node, sym(ACL + 'mode'), sym(ACL + m), profile))
            if (!deletions.length && !insertions.length) return
            change(profile, deletions, insertions, origin + ' is now set to ' + LEVELS.find(l => l.key === key).label.toLowerCase() + '.', (pod) => modesFor(origin, pod).includes(same(want)), app.node.termType === 'BlankNode')
          }
          select.addEventListener('change', () => {
            const key = select.value
            if (key === 'control' && !app.modes.includes('Control')) {
              controlWarning(warnHolder, origin, () => apply('control'), () => { select.value = current || '' })
            } else {
              warnHolder.replaceChildren()
              apply(key)
            }
          })
          const remove = actions.appendChild(button(dom, 'set-btn-tertiary set-remove', 'Remove', 'remove'))
          const label = remove.querySelector('.set-btn-text')
          let timer = null
          remove.addEventListener('click', () => {
            if (!remove.classList.contains('set-armed')) {
              remove.classList.add('set-armed', 'set-btn-danger')
              label.textContent = 'Click again to remove'
              timer = setTimeout(() => { remove.classList.remove('set-armed', 'set-btn-danger'); label.textContent = 'Remove' }, 5000)
              return
            }
            clearTimeout(timer)
            const deletions = [
              ...store.statementsMatching(person, sym(ACL + 'trustedApp'), app.node, profile),
              ...store.statementsMatching(app.node, null, null, profile)
            ]
            const count = modesFor(origin).length
            change(profile, deletions, [], origin + ' is no longer trusted.', (pod) => modesFor(origin, pod).length < count, app.node.termType === 'BlankNode')
          })
        }
        li.appendChild(warnHolder)
      }
      if (!canEdit) {
        apps.appendChild(el(dom, 'p', 'set-small-note', 'Your profile cannot be changed from here as you are logged in now, so this list is read-only.'))
        return
      }
      // Add an app.
      const form = apps.appendChild(el(dom, 'form', 'set-add'))
      form.appendChild(el(dom, 'h4', 'set-subheading set-add-title', 'Trust a new app'))
      const fields = form.appendChild(el(dom, 'div', 'set-fields'))
      const where = fields.appendChild(el(dom, 'label', 'set-field'))
      where.appendChild(el(dom, 'span', 'set-label', 'Its address'))
      const input = where.appendChild(el(dom, 'input', 'set-input'))
      input.type = 'text'
      input.placeholder = 'https://app.example'
      input.autocomplete = 'off'
      input.spellcheck = false
      const what = fields.appendChild(el(dom, 'label', 'set-field'))
      what.appendChild(el(dom, 'span', 'set-label', 'It may'))
      const select = what.appendChild(levelSelect('view'))
      const add = fields.appendChild(button(dom, 'set-btn-primary', 'Trust it', 'plus'))
      add.type = 'submit'
      const warnHolder = form.appendChild(el(dom, 'div'))
      const grant = (origin, key) => {
        const node = sym(profile.value + '#trusted-' + origin.replace(/^https:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6))
        const level = LEVELS.find(l => l.key === key)
        const insertions = [
          st(person, sym(ACL + 'trustedApp'), node, profile),
          st(node, sym(ACL + 'origin'), sym(origin), profile),
          ...level.modes.map(m => st(node, sym(ACL + 'mode'), sym(ACL + m), profile))
        ]
        change(profile, [], insertions, origin + ' is now trusted: ' + plainModes(level.modes).replace(/^May /, 'it may '), (pod) => modesFor(origin, pod).includes(same(level.modes)))
      }
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        warnHolder.replaceChildren()
        input.removeAttribute('aria-invalid')
        const checked = cleanOrigin(input.value)
        if (checked.error) { say(checked.error, 'bad'); input.setAttribute('aria-invalid', 'true'); input.focus(); return }
        if (trusted().some(a => a.origins.includes(checked.origin))) { say(checked.origin + ' is already trusted. Change its level in the list above.', 'bad'); return }
        if (select.value === 'control') controlWarning(warnHolder, checked.origin, () => grant(checked.origin, 'control'), () => {})
        else grant(checked.origin, select.value)
      })
      form.appendChild(el(dom, 'p', 'set-small-note', 'Only the app\'s site is stored, like https://app.example. A change is saved in your profile straight away.'))
    }

    // ---- preferences

    function drawPrefs () {
      prefs.replaceChildren()
      sectionHead(prefs, 'prefs', 'Preferences')
      prefs.appendChild(el(dom, 'p', 'set-hint', 'What kind of user you are, so the data browser can offer the views that suit you. Kept private, in your preferences file.'))
      const canEdit = !!prefsDoc && prefsRead && editable(store, prefsDoc)
      const list = prefs.appendChild(el(dom, 'ul', 'set-switches'))
      for (const role of ROLES) {
        const on = !!prefsDoc && prefsRead && store.holds(person, sym(RDF_TYPE), sym(role.type), prefsDoc)
        const li = list.appendChild(el(dom, 'li', 'set-switch-row'))
        li.dataset.role = localName(role.type)
        const label = li.appendChild(el(dom, 'label', 'set-switch'))
        const box = label.appendChild(el(dom, 'input'))
        box.type = 'checkbox'
        box.setAttribute('role', 'switch')
        box.checked = on
        box.disabled = !canEdit
        label.appendChild(el(dom, 'span', '', role.label))
        li.appendChild(el(dom, 'p', 'set-switch-hint', role.hint))
        box.addEventListener('change', () => {
          const statement = st(person, sym(RDF_TYPE), sym(role.type), prefsDoc)
          const holds = (pod) => pod.holds(person, sym(RDF_TYPE), sym(role.type))
          if (on) change(prefsDoc, store.statementsMatching(person, sym(RDF_TYPE), sym(role.type), prefsDoc), [], role.label + ' is off. It takes effect when the data browser next loads.', (pod) => !holds(pod))
          else change(prefsDoc, [], [statement], role.label + ' is on. It takes effect when the data browser next loads.', holds)
        })
      }
      let why = ''
      if (!prefsDoc) why = 'There is no preferences file to keep these in, so they cannot be changed here.'
      else if (!prefsRead) why = 'The preferences file could not be read, so these cannot be shown or changed.'
      else if (!canEdit) why = 'The preferences file cannot be changed as you are logged in now, so these are read-only.'
      if (why) prefs.appendChild(el(dom, 'p', 'set-small-note', why))
    }

    function draw () {
      if (!person) return
      const name = store.any(person, sym(FOAF + 'name'), null, profile) || store.any(person, sym('http://www.w3.org/2006/vcard/ns#fn'), null, profile)
      title.textContent = 'Settings' + (name ? ' · ' + name.value : '')
      sub.replaceChildren(icon(dom, 'lock'), el(dom, 'span', '', 'Only you see this page. Changes are saved to your pod straight away.'))
      drawOverview()
      drawApps()
      drawPrefs()
      headActions.replaceChildren()
      const again = headActions.appendChild(button(dom, 'set-refresh', 'Check again', 'refresh'))
      again.addEventListener('click', () => { if (!busy) load(true) })
      foot.textContent = 'Your password and identity provider are not changed here: that is done on your pod server\'s own account page.'
    }

    async function load (force) {
      say(loaded ? 'Checking again…' : '')
      try { await store.fetcher.load(profile, force ? { force: true, clearPreviousData: true } : undefined) } catch { /* the overview shows it */ }
      checks.set(person.value, await probe(fetcher, profile.value))
      // The preferences file: the one on show, or the first the profile names that can be read.
      const named = store.each(person, sym(PIM + 'preferencesFile'), null, profile).filter(n => n.termType === 'NamedNode')
      const candidates = isPreferences(store, subject) ? [subject.doc()] : named.map(n => n.doc())
      prefsDoc = candidates[0] || null
      prefsRead = false
      for (const candidate of candidates) {
        try {
          await store.fetcher.load(candidate, force ? { force: true, clearPreviousData: true } : undefined)
          prefsDoc = candidate
          prefsRead = true
          break
        } catch { /* try the next one */ }
      }
      const a = addresses()
      const all = [...a.storage, ...a.preferences, ...a.publicIndex, ...a.privateIndex, ...a.toolIndex].map(e => e.address)
      if (prefsDoc) all.push(prefsDoc.value)
      await Promise.all([
        ...[...new Set(all)].map(async address => checks.set(address, await probe(fetcher, address))),
        // An identity provider is checked by its public configuration, without your login.
        ...a.issuers.map(async entry => {
          const config = entry.address.replace(/\/?$/, '/') + '.well-known/openid-configuration'
          const result = await probe(fetch, config)
          checks.set(entry.address, result.state === 'locked' ? { state: 'unknown', code: result.code } : result)
        })
      ])
      loaded = true
      say('')
      draw()
    }

    // Decide whose settings these are and that the viewer is that person.
    person = viewerIsPerson(store, subject, context)
    shared.person = person
    if (!person) {
      title.textContent = 'Settings'
      sub.textContent = currentUser(context) ? 'These settings belong to someone else. Only that person can see them.' : 'Log in to see your settings.'
      for (const part of [overview, apps, prefs]) part.hidden = true
      return root
    }
    profile = person.doc()
    sub.replaceChildren(icon(dom, 'lock'), el(dom, 'span', '', 'Only you see this page.'))
    say('Checking your settings…')
    load(false).catch(error => say('The settings could not be read: ' + (error && error.message ? error.message : error), 'bad'))
    return root
  },

  // In the suite shell: the sections of the page in the left column. A click scrolls to that section.
  renderNavigation (subject, context) {
    const shared = stateOf(context)
    if (!shared.person || !shared.sections) return null
    const dom = context.dom
    const list = el(dom, 'ul', 'set-nav-list set-shell-nav')
    list.setAttribute('aria-label', 'Settings sections')
    const items = []
    for (const part of SECTIONS) {
      const b = list.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'set-nav-item'))
      b.type = 'button'
      b.dataset.section = part.key
      b.appendChild(icon(dom, part.icon))
      b.appendChild(el(dom, 'span', 'set-nav-label', part.label))
      if (part.key === (shared.current || SECTIONS[0].key)) b.setAttribute('aria-current', 'page')
      items.push(b)
      b.addEventListener('click', () => {
        shared.current = part.key
        for (const x of items) { if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current') }
        const target = shared.sections[part.key]
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start' })
      })
    }
    return list // styled by the <style> in render's root, which is in the same document
  }
}

export default pane
