// profile-edit-pane.js: edit my own profile (WebID document) in place.
//
// One file, no imports. Opens on a person (foaf:Person, vcard:Individual, schema:Person) only when the
// person looking is logged in and allowed to change that profile document. It never takes focus.
//
// It reads every shape the read-only profile view pane reads, and writes the shapes SolidOS's own
// profile editor writes, so both show the result:
//
//   <#me> foaf:name "Alice" ; vcard:fn "Alice" (kept in step when present) ; foaf:nick "alice" ;
//     solid:preferredSubjectPronoun "she" ; solid:preferredObjectPronoun "her" ;
//     vcard:note "Short bio" ; foaf:homepage <https://…> ; vcard:hasPhoto <https://…/photo.png> ;
//     vcard:hasAddress <#idN> . <#idN> vcard:locality "Lisbon" ; vcard:country-name "Portugal" .
//   <#idN> a solid:CurrentRole ; org:member <#me> ; vcard:role "Engineer" ; org:organization <#idM> .
//   <#idM> a schema:Organization ; schema:name "Example Labs" .
//   <#me> vcard:hasEmail <#idN> . <#idN> a vcard:Work ; vcard:value <mailto:alice@example.org> .
//   <#me> vcard:hasTelephone <#idN> . <#idN> a vcard:Cell ; vcard:value <tel:+351…> .
//   <#me> schema:skills <#idN> . <#idN> schema:name "JavaScript" .
//   <#me> schema:knowsLanguage <#idN> . <#idN> solid:publicId lang:pt ; schema:proficiencyLevel "Fluent" .
//   <#me> foaf:account <#idN> . <#idN> a sm:GithubAccount ; rdfs:label "GitHub" ; foaf:accountName "alice" ;
//     foaf:homepage <https://github.com/alice> .
//   <#me> foaf:knows <https://bob.example/profile/card#me> .
//
// What it writes, and when: only when you press Save, Add, Remove, Use this link, Upload or Remove photo.
// Each change removes the old statements for that one thing and adds the new ones, written whole: GET the
// document, change it in memory, PUT it back with If-Match in its own content type, read it back and compare
// every statement; if the pod stored anything else, the original is PUT back. Never a PATCH.
// Upload also PUTs the image file, with a
// fresh name, next to the profile document.
// It never changes keys, the login provider (solid:oidcIssuer), storage, the preferences file, type
// indexes, the inbox, or anything about access control, and refuses any change that would.

const NS = {
  foaf: 'http://xmlns.com/foaf/0.1/',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  schema: 'http://schema.org/',
  schemas: 'https://schema.org/',
  solid: 'http://www.w3.org/ns/solid/terms#',
  org: 'http://www.w3.org/ns/org#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  sioc: 'http://rdfs.org/sioc/ns#',
  skos: 'http://www.w3.org/2004/02/skos/core#'
}
const IANA = 'https://www.w3.org/ns/iana/language-code/'
const SOCIAL = 'https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#'
const PERSON_TYPES = [NS.foaf + 'Person', NS.schema + 'Person', NS.schemas + 'Person', NS.vcard + 'Individual']

// Statements this pane must never add or remove: identity, login, storage, settings, keys, access.
const PROTECTED = [
  NS.solid + 'oidcIssuer', 'http://www.w3.org/ns/pim/space#storage', 'http://www.w3.org/ns/pim/space#preferencesFile',
  NS.solid + 'publicTypeIndex', NS.solid + 'privateTypeIndex', 'http://www.w3.org/ns/ldp#inbox', NS.solid + 'editableProfile',
  NS.solid + 'account', 'http://www.w3.org/ns/auth/cert#key', NS.foaf + 'primaryTopic', NS.foaf + 'maker'
]
const PROTECTED_SPACES = ['http://www.w3.org/ns/auth/acl#', 'http://www.w3.org/ns/auth/cert#', 'https://www.w3.org/ns/cid/v1#', 'https://w3id.org/security#', 'http://www.w3.org/ns/pim/space#']

// Networks offered when adding an account: label, class in the upstream social ontology, profile prefix.
const NETWORKS = [
  ['GitHub', 'GithubAccount', 'https://github.com/'],
  ['LinkedIn', 'LinkedInAccount', 'https://www.linkedin.com/in/'],
  ['Mastodon', 'MastodonAccount', ''],
  ['Bluesky', 'BlueSkyAccount', 'https://bsky.app/profile/'],
  ['X', 'TwitterAccount', 'https://x.com/'],
  ['YouTube', 'YouTubeAccount', 'https://www.youtube.com/'],
  ['Instagram', 'InstagramAccount', 'https://www.instagram.com/'],
  ['Facebook', 'FacebookAccount', 'https://www.facebook.com/'],
  ['ORCID', 'OrcidAccount', 'https://orcid.org/'],
  ['Other', 'OtherAccount', '']
]
const LANGUAGES = ['en', 'cs', 'sk', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'pl', 'uk', 'ru', 'sv', 'da', 'no', 'fi', 'el', 'tr', 'hu', 'ro', 'ar', 'he', 'hi', 'zh', 'ja', 'ko']
const LEVELS = ['Basic', 'Conversational', 'Fluent', 'Native']
const PHOTO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' }
const PHOTO_MAX = 2 * 1024 * 1024

// Icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box.
const MDI = {
  account: 'M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z',
  camera: 'M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z',
  email: 'M20,8L12,13L4,8V6L12,11L20,6M20,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.1,4 20,4Z',
  phone: 'M6.62,10.79C8.06,13.62 10.38,15.94 13.21,17.38L15.41,15.18C15.69,14.9 16.08,14.82 16.43,14.93C17.55,15.3 18.75,15.5 20,15.5A1,1 0 0,1 21,16.5V20A1,1 0 0,1 20,21A17,17 0 0,1 3,4A1,1 0 0,1 4,3H7.5A1,1 0 0,1 8.5,4C8.5,5.25 8.7,6.45 9.07,7.57C9.18,7.92 9.1,8.31 8.82,8.59L6.62,10.79Z',
  star: 'M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z',
  translate: 'M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z',
  link: 'M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z',
  people: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z',
  briefcase: 'M10,2H14A2,2 0 0,1 16,4V6H20A2,2 0 0,1 22,8V19A2,2 0 0,1 20,21H4C2.89,21 2,20.1 2,19V8C2,6.89 2.89,6 4,6H8V4C8,2.89 8.89,2 10,2M14,6V4H10V6H14Z',
  lock: 'M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z',
  remove: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  upload: 'M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z',
  edit: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)
// The sections, in page order: the suite shell's navigation column jumps to them.
const PARTS = [
  ['photo', 'Profile picture', 'camera'], ['basics', 'About you', 'account'], ['emails', 'Email addresses', 'email'],
  ['phones', 'Phone numbers', 'phone'], ['skills', 'Skills', 'star'], ['languages', 'Languages', 'translate'],
  ['accounts', 'Accounts elsewhere', 'link'], ['friends', 'People I know', 'people'], ['resume', 'Resume', 'briefcase']
]

const CSS = `
/* suite:design begin --prefix pfe --only icon,nav,buttons,input,avatar,toast */
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
.pfe-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.pfe-root *, .pfe-root *::before, .pfe-root *::after { box-sizing: border-box }
.pfe-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.pfe-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.pfe-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.pfe-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.pfe-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.pfe-root [hidden] { display: none !important }
.pfe-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.pfe-muted { color: var(--sui-text-muted) }
.pfe-small { font-size: var(--sui-text-sm) }
.pfe-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.pfe-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.pfe-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.pfe-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.pfe-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.pfe-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --pfe-i set to url("data:image/svg+xml,...") ---------------------------------- */
.pfe-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--pfe-i) center / contain no-repeat; mask: var(--pfe-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.pfe-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.pfe-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.pfe-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.pfe-nav-item:hover { background: var(--sui-bg-hover) }
.pfe-nav-item[aria-current="page"], .pfe-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.pfe-nav-item .pfe-icon { color: var(--sui-text-muted) }
.pfe-nav-item[aria-current] .pfe-icon { color: inherit }
.pfe-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.pfe-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.pfe-nav-new { margin-bottom: var(--sui-space-2) }
.pfe-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.pfe-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.pfe-btn:hover { background: var(--sui-primary-light-hover) }
.pfe-btn:disabled, .pfe-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.pfe-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.pfe-btn-primary:hover { background: var(--sui-primary-element-hover) }
.pfe-btn-tertiary { background: transparent; color: var(--sui-text) }
.pfe-btn-tertiary:hover { background: var(--sui-bg-hover) }
.pfe-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.pfe-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.pfe-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.pfe-btn-icon:hover { background: var(--sui-bg-hover) }
.pfe-btn-wide { width: 100%; justify-content: flex-start }
.pfe-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.pfe-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.pfe-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.pfe-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.pfe-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.pfe-input:hover { border-color: var(--sui-primary-element) }
.pfe-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.pfe-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.pfe-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.pfe-search { position: relative; display: flex; align-items: center; min-width: 0 }
.pfe-search .pfe-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.pfe-search .pfe-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.pfe-select { position: relative; display: block; min-width: 0 }
.pfe-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.pfe-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.pfe-file { position: relative; overflow: hidden }
.pfe-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.pfe-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .pfe-row-check */
.pfe-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.pfe-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.pfe-check-round { border-radius: 50% }
.pfe-check:hover { border-color: var(--sui-primary-element) }
.pfe-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.pfe-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.pfe-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.pfe-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.pfe-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.pfe-segment:hover { background: var(--sui-bg-hover) }
.pfe-segment[aria-pressed="true"], .pfe-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- avatar: a span with initials, or an <img class="ui-avatar"> -------------------------------------------- */
.pfe-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar); height: var(--sui-avatar); border-radius: 50%; overflow: hidden; background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); line-height: 1; object-fit: cover; text-transform: uppercase; user-select: none }
.pfe-avatar-lg { width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); font-size: var(--sui-text-xl) }
.pfe-avatar-xl { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.pfe-header .pfe-avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.pfe-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.pfe-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.pfe-toast-error { border-left-color: var(--sui-error) }
.pfe-toast-success { border-left-color: var(--sui-success) }
.pfe-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.pfe-status-error { color: var(--sui-error) }
.pfe-status-success { color: var(--sui-success) }
.pfe-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.pfe-note-error { background: var(--sui-error-light) }
.pfe-note-warning { background: var(--sui-warning-light) }
.pfe-note-success { background: var(--sui-success-light) }
/* suite:design end */
.pfe.profile-edit-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8) }
.pfe.profile-edit-pane p { max-width: none }
.pfe a { overflow-wrap: anywhere; text-decoration: none }
.pfe a:hover { text-decoration: underline }
.pfe-top { margin: 0 0 var(--sui-space-4); min-width: 0 }
.pfe-top-sub { margin-top: var(--sui-space-1); color: var(--sui-text-muted); overflow-wrap: anywhere }
.pfe-keep { margin: 0 0 var(--sui-space-5); font-size: var(--sui-text-sm) }
.pfe-keep > .pfe-icon { color: var(--sui-primary-element) }
.pfe-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: var(--sui-space-5); align-items: start }
.pfe-card { min-width: 0; padding: var(--sui-space-6); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg); scroll-margin-top: calc(var(--sui-target) + var(--sui-space-4)) }
.pfe-wide { grid-column: 1 / -1 }
.pfe-card-head { display: flex; align-items: center; gap: var(--sui-space-3); margin-bottom: var(--sui-space-4) }
.pfe-card-head .pfe-icon { color: var(--sui-primary-element) }
.pfe-hint { margin: calc(-1 * var(--sui-space-3)) 0 var(--sui-space-4); color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.pfe-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: var(--sui-space-4) var(--sui-space-5) }
.pfe-field.pfe-full { grid-column: 1 / -1 }
.pfe-field > span:first-child { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold) }
.pfe .pfe-input[readonly] { border-color: var(--sui-border); background: var(--sui-bg-app); color: var(--sui-text-muted) }
.pfe-msg { min-height: 0 }
.pfe-msg:empty { display: none }
.pfe-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-3); margin-top: var(--sui-space-5) }
.pfe-list { display: flex; flex-direction: column; gap: 2px; margin: 0 0 var(--sui-space-4); padding: 0; list-style: none }
.pfe-list li { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); min-width: 0; padding: 0 0 0 var(--sui-space-3); border-radius: var(--sui-radius) }
.pfe-list li:hover { background: var(--sui-bg-hover) }
.pfe-list li > span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere }
.pfe-list .pfe-sub { margin-left: var(--sui-space-2); color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.pfe-list li.pfe-empty { padding: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); min-height: 0 }
.pfe-list li.pfe-empty:hover { background: transparent }
.pfe-list .pfe-face { width: var(--sui-avatar); height: var(--sui-avatar) }
.pfe-add { display: flex; flex-wrap: wrap; gap: var(--sui-space-2); align-items: center }
.pfe-add .pfe-input { flex: 1 1 200px; width: auto }
.pfe-add select.pfe-input { flex: 0 1 170px }
.pfe-card > .pfe-msg { margin-top: var(--sui-space-2) }
.pfe-photoedit { display: flex; flex-wrap: wrap; gap: var(--sui-space-6); align-items: center }
.pfe-photoedit .pfe-photo { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.pfe-photoedit > div:last-child { flex: 1 1 280px; min-width: 0; display: flex; flex-direction: column; gap: var(--sui-space-3) }
.pfe input[type=file] { flex: 1 1 200px; min-width: 0; max-width: 100%; font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.pfe input[type=file]::file-selector-button { min-height: var(--sui-target-sm); margin-right: var(--sui-space-3); padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.pfe-locked { margin: var(--sui-space-4) 0 }
@media (max-width: 600px) {
  .pfe.profile-edit-pane { padding: var(--sui-space-3) var(--sui-space-3) var(--sui-space-6) }
  .pfe-card { padding: var(--sui-space-4) }
  .pfe-photoedit { gap: var(--sui-space-4) }
}
`

const el = (dom, tag, className, text) => {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = text
  return node
}
const rdflib = () => globalThis.$rdf || (globalThis.UI && globalThis.UI.rdf)
const webFetch = (store) => (store.fetcher && store.fetcher._fetch) || fetch

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

const localName = (uri) => { const m = String(uri || '').match(/[#/]([^#/]+)\/?$/); return m ? decodeURIComponent(m[1]) : String(uri || '') }
const isBlank = (n) => !!n && n.termType === 'BlankNode'
const keyOf = (n) => n ? n.termType + ':' + n.value : ''

function initialsOf (name) {
  const words = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return ((words[0][0] || '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

function shortUrl (uri) {
  try {
    const u = new URL(uri)
    const path = u.pathname.replace(/\/profile\/card(\.\w+)?$/, '').replace(/\/$/, '')
    return u.host + (path && path !== '/' ? path : '')
  } catch { return String(uri || '') }
}

let displayNames = null
function languageName (code) {
  try {
    if (!displayNames) displayNames = new Intl.DisplayNames(['en'], { type: 'language' })
    const name = displayNames.of(code)
    if (name && name.toLowerCase() !== code.toLowerCase()) return name
  } catch { /* not a code */ }
  return code
}

// ---------- checking what people type ----------

const isLocal = (u) => u.protocol === 'http:' && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)
function httpsUrl (text, allowLocal) {
  const value = String(text || '').trim()
  let u
  try { u = new URL(value) } catch { throw new Error('that is not a web address (it should start with https://)') }
  if (u.protocol !== 'https:' && !(allowLocal && isLocal(u))) throw new Error('only https:// addresses are accepted')
  return u.href
}
function mailto (text) {
  const value = String(text || '').trim().replace(/^mailto:/i, '')
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value)) throw new Error('that does not look like an email address')
  return 'mailto:' + value
}
function tel (text) {
  const value = String(text || '').trim().replace(/^tel:/i, '')
  if (!/^\+?[0-9][0-9 ()\-.]{3,}$/.test(value)) throw new Error('a phone number has digits, and may start with +')
  return 'tel:' + value.replace(/[\s()]/g, '').replace(/\.+/g, '-')
}
const safeHref = (v) => /^(https?:|mailto:|tel:)/i.test(String(v || '').trim()) ? String(v).trim() : ''
const safeImage = (v) => /^(https?:|data:image\/)/i.test(String(v || '').trim()) ? String(v).trim() : ''

// ---------- reading the profile (the same shapes the view pane reads) ----------

function makeReader (store, doc) {
  const sym = (uri) => store.sym(uri)
  const P = (prefix, local) => prefix === 'schema' ? [sym(NS.schema + local), sym(NS.schemas + local)] : [sym(NS[prefix] + local)]
  const preds = (...pairs) => pairs.flatMap(([p, l]) => P(p, l))
  const FIRST = sym(NS.rdf + 'first')
  const REST = sym(NS.rdf + 'rest')
  const isList = (n) => !!n && (Array.isArray(n.elements) || (n.termType !== 'Literal' && !!store.any(n, FIRST, null, doc)))
  function expand (node, seen = new Set()) {
    if (Array.isArray(node.elements)) return node.elements.flatMap(e => isList(e) ? expand(e, seen) : [e])
    const out = []
    let cur = node
    while (cur && !(cur.termType === 'NamedNode' && cur.value === NS.rdf + 'nil') && !seen.has(keyOf(cur))) {
      seen.add(keyOf(cur))
      const v = store.any(cur, FIRST, null, doc)
      if (v) out.push(...(isList(v) ? expand(v, seen) : [v]))
      cur = store.any(cur, REST, null, doc)
    }
    return out
  }
  // Every value of these properties in the document: plain ones keep their statement (so they can be
  // removed); ones inside an RDF list are marked as such.
  function entries (s, predicates) {
    const seen = new Set()
    const out = []
    for (const p of predicates) {
      for (const st of store.statementsMatching(s, p, null, doc)) {
        const items = isList(st.object) ? expand(st.object).map(node => ({ node, inList: true })) : [{ node: st.object, statement: st }]
        for (const item of items) {
          if (seen.has(keyOf(item.node))) continue
          seen.add(keyOf(item.node))
          out.push(item)
        }
      }
    }
    return out
  }
  const first = (s, predicates, graph = doc) => {
    if (!s || s.termType === 'Literal') return null
    for (const p of predicates) { const o = store.any(s, p, null, graph); if (o) return o }
    return null
  }
  function text (s, predicates, graph = doc) {
    if (!s || s.termType === 'Literal') return ''
    const lits = []
    for (const p of predicates) for (const st of store.statementsMatching(s, p, null, graph)) if (st.object.termType === 'Literal' && st.object.value.trim()) lits.push(st.object)
    if (!lits.length) return ''
    const lang = (l) => (l.language || l.lang || '').toLowerCase()
    return (lits.find(l => lang(l).startsWith('en')) || lits.find(l => !lang(l)) || lits[0]).value.trim()
  }
  const types = (n) => n && n.termType !== 'Literal' ? store.each(n, sym(NS.rdf + 'type'), null, doc).map(t => t.value) : []
  return { sym, P, preds, entries, first, text, types, isList }
}

function isPersonTyped (store, node) {
  try { const t = store.findTypeURIs(node); return PERSON_TYPES.some(c => t[c]) } catch { return false }
}

// The person to edit: the subject, or the person the subject document is about.
function personFor (store, subject) {
  if (!subject || !subject.uri) return null
  if (isPersonTyped(store, subject)) return subject
  if (subject.uri === subject.doc().uri) {
    const sym = store.sym.bind(store)
    const topic = store.any(subject, sym(NS.foaf + 'primaryTopic'), null, subject.doc())
    if (topic && topic.termType === 'NamedNode' && isPersonTyped(store, topic)) return topic
    for (const c of PERSON_TYPES) {
      const found = store.each(null, sym(NS.rdf + 'type'), sym(c), subject.doc()).filter(n => n.termType === 'NamedNode')
      if (found.length === 1) return found[0]
    }
  }
  return null
}

function icon (dom, name) {
  const span = dom.createElement('span')
  span.className = 'pfe-icon'
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--pfe-i', `url("${svg(MDI[name])}")`)
  return span
}
// A button from the sheet: its text stays the button's whole textContent (the icon is an empty span).
function btn (dom, className, text, iconName) {
  const b = el(dom, 'button', 'pfe-btn' + (className ? ' ' + className : ''))
  b.type = 'button'
  if (iconName) b.appendChild(icon(dom, iconName))
  if (text) b.appendChild(dom.createTextNode(text))
  return b
}
// The suite shell's per-showing state, or a plain object when the pane is alone.
const suiteOf = (context) => context && context.suite && context.suite.version >= 1 ? context.suite : null
const stateOf = (context) => (suiteOf(context) && context.suite.state) || {}

function canEdit (store, doc) {
  try { return !!(store.updater && store.updater.editable(doc.value || doc.uri, store)) } catch { return false }
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

// ---------- the pane ----------

const pane = {
  name: 'profile-edit-lab',
  icon: svg(MDI.account, '#00679e'),

  label (subject, context) {
    try {
      const store = context.session.store
      const person = personFor(store, subject)
      const me = currentUser(context)
      if (!person || !me) return null
      // Your own WebID; or a WebID profile (it names an identity provider) you may edit. Not a contact card in an
      // address book: person-typed and editable too, but not a profile.
      if (person.value !== me.value && !store.any(person, store.sym(NS.solid + 'oidcIssuer'), null, person.doc())) return null
      return canEdit(store, person.doc()) ? 'Edit profile' : null
    } catch { return null }
  },

  shouldGetFocus () { return false },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const suite = suiteOf(context)
    const shared = stateOf(context)
    const root = el(dom, 'div', 'pfe profile-edit-pane pfe-root')
    root.appendChild(el(dom, 'style', '', CSS))
    const person = personFor(store, subject) || subject
    const doc = person.doc()
    const R = makeReader(store, doc)
    root.dataset.person = person.value
    const { sym } = R
    const st = (s, p, o) => rdflib().st(s, p, o, doc)
    const lit = (value, lang) => lang ? rdflib().literal(value, lang) : rdflib().literal(value)
    const p = (prefix, local) => sym(NS[prefix] + local)
    let counter = 0
    const freshNode = () => sym(doc.value + '#id' + (Date.now() + (counter++)))
    const ownNode = (n) => !!n && n.termType === 'NamedNode' && n.value.startsWith(doc.value + '#') && n.value !== person.value
    const stmts = (s, pred) => store.statementsMatching(s, pred, null, doc)
    const allAbout = (n) => store.statementsMatching(n, null, null, doc)

    if (!currentUser(context) || !canEdit(store, doc)) {
      root.appendChild(el(dom, 'p', 'pfe-locked pfe-note pfe-note-warning', 'You can edit this profile only when you are logged in as someone allowed to change it.'))
      return root
    }

    // One change to the profile: refuses anything outside this pane's remit, then one whole-document write.
    let busy = false
    async function change (msg, deletions, insertions, okText) {
      if (busy) { say(msg, 'Not saved: another change is still being saved', false); return false }
      for (const s of [...deletions, ...insertions]) {
        if ([s.subject, s.object].some(isBlank)) { say(msg, 'Not saved: this item is written in a form this pane does not change', false); return false }
        if (PROTECTED.includes(s.predicate.value) || PROTECTED_SPACES.some(ns => s.predicate.value.startsWith(ns))) { say(msg, 'Not saved: that would touch login, storage or key settings', false); return false }
      }
      if (!deletions.length && !insertions.length) { say(msg, 'Nothing to change', true); return false }
      busy = true
      try {
        // Written whole (writeWhole): GET, change in memory, PUT with If-Match, read back and compare every
        // statement, and the original put back if the pod stored anything else. Never a PATCH (jss-findings 5, 6).
        const result = await writeWhole(store, doc, deletions, insertions)
        if (!result.ok) {
          say(msg, result.restored
            ? 'Not saved: your pod stored something different, so the profile was put back exactly as it was.'
            : 'Not saved, and the profile could not be put back as it was: your pod stored something different. Check the profile now.', false)
          return false
        }
        mirror(store, deletions, insertions)
        say(msg, okText || 'Saved', true)
        return true
      } catch (error) {
        say(msg, 'Not saved: ' + String(error && error.message ? error.message : error).replace(/\s+/g, ' ').slice(0, 200), false)
        return false
      } finally { busy = false }
    }
    function say (msg, text, ok) {
      // A field of the "About you" form says nothing of its own: the form's one summary ("2 saved") is the toast.
      const toast = suite && ok && text && !/…$/.test(text) && !/^Nothing/.test(text)
      if (suite && ok && msg.dataset.field) { msg.textContent = ''; msg.className = 'pfe-msg pfe-status pfe-ok'; return }
      if (toast) { try { suite.toast(text, { kind: 'success' }) } catch { /* said in place below */ } }
      msg.textContent = toast ? '' : text
      msg.className = 'pfe-msg pfe-status ' + (ok ? 'pfe-ok' + (/…$/.test(text) ? '' : ' pfe-status-success') : 'pfe-bad pfe-status-error')
    }
    const message = () => { const m = el(dom, 'span', 'pfe-msg pfe-status'); m.setAttribute('role', 'status'); return m }

    // ----- header -----
    const top = root.appendChild(el(dom, 'div', 'pfe-top'))
    const topName = top.appendChild(el(dom, 'h2', 'pfe-title'))
    const where = top.appendChild(el(dom, 'p', 'pfe-top-sub', 'Personal info. Changes are saved to '))
    const docLink = where.appendChild(el(dom, 'a', '', doc.value.replace(/^https?:\/\//, '')))
    if (safeHref(doc.value)) { docLink.href = doc.value; docLink.rel = 'noopener' }
    const keep = root.appendChild(el(dom, 'div', 'pfe-keep pfe-note'))
    keep.appendChild(icon(dom, 'lock'))
    keep.appendChild(el(dom, 'p', '', 'Your keys, login provider, storage, settings, type indexes, inbox and access settings are in this document too. This pane leaves them exactly as they are.'))
    const grid = root.appendChild(el(dom, 'div', 'pfe-grid'))
    const sections = {}
    shared.sections = sections
    shared.person = person
    const card = (part, title, wide, hint) => {
      const c = grid.appendChild(el(dom, 'section', 'pfe-card' + (wide ? ' pfe-wide' : '')))
      c.dataset.part = part
      sections[part] = c
      const head = c.appendChild(el(dom, 'div', 'pfe-card-head'))
      head.appendChild(icon(dom, (PARTS.find(x => x[0] === part) || [])[2] || 'account'))
      head.appendChild(el(dom, 'h3', 'pfe-subheading', title))
      if (hint) c.appendChild(el(dom, 'p', 'pfe-hint', hint))
      return c
    }
    const nameNow = () => R.text(person, R.preds(['foaf', 'name'], ['vcard', 'fn'], ['schema', 'name'])) || R.text(person, R.preds(['foaf', 'nick'], ['vcard', 'nickname'])) || shortUrl(person.value)
    const photoNow = () => {
      for (const o of [...stmts(person, p('foaf', 'img')), ...stmts(person, p('vcard', 'hasPhoto')), ...R.preds(['foaf', 'depiction'], ['schema', 'image'], ['sioc', 'avatar'], ['vcard', 'photo']).flatMap(pr => stmts(person, pr))].map(s => s.object)) {
        const src = safeImage(o.termType === 'BlankNode' ? (R.first(o, R.preds(['schema', 'contentUrl'], ['schema', 'url'], ['vcard', 'value'])) || {}).value : o.value)
        if (src) return src
      }
      return ''
    }
    const face = (src, name, cls) => {
      if (src) {
        const img = el(dom, 'img', 'pfe-avatar ' + cls)
        img.alt = 'Photo of ' + name
        img.src = src
        img.addEventListener('error', () => img.replaceWith(face('', name, cls)), { once: true })
        return img
      }
      const d = el(dom, 'div', 'pfe-avatar ' + cls, initialsOf(name))
      d.setAttribute('role', 'img')
      d.setAttribute('aria-label', name)
      return d
    }
    const drawHeader = () => {
      topName.textContent = nameNow()
    }

    // ----- basics -----
    const roleNodes = () => store.each(null, p('org', 'member'), person, doc)
      .filter(m => !R.types(m).some(t => /EducationalOccupationalCredential$/.test(t)))
    const currentRole = () => roleNodes().find(m => {
      const kinds = R.types(m).filter(t => t.startsWith(NS.solid)).map(localName)
      return !R.first(m, R.P('schema', 'endDate')) && !kinds.includes('PastRole') && !kinds.includes('FutureRole')
    }) || null
    const orgName = (o) => !o ? '' : o.termType === 'Literal' ? o.value : R.text(o, R.preds(['schema', 'name'], ['foaf', 'name'], ['vcard', 'fn'], ['rdfs', 'label']))
    const firstAddress = () => (stmts(person, p('vcard', 'hasAddress'))[0] || {}).object || null

    // Replace every value of these predicates on node `s` with `value` (nothing when empty).
    const replace = (s, predicates, value) => ({
      deletions: predicates.flatMap(pr => stmts(s, pr)),
      insertions: value === null || value === '' ? [] : [st(s, predicates[0], typeof value === 'string' ? lit(value) : value)]
    })
    const merge = (...plans) => ({ deletions: plans.flatMap(x => x.deletions), insertions: plans.flatMap(x => x.insertions) })
    const present = (s, pr) => stmts(s, pr).length > 0

    const FIELDS = [
      {
        key: 'name',
        label: 'Name',
        read: () => R.text(person, [p('foaf', 'name')]) || R.text(person, [p('vcard', 'fn')]),
        plan: (v) => {
          if (!v) throw new Error('a profile needs a name')
          const plans = [replace(person, [p('foaf', 'name')], v)]
          if (present(person, p('vcard', 'fn'))) plans.push(replace(person, [p('vcard', 'fn')], v))
          return merge(...plans)
        }
      },
      {
        key: 'nick',
        label: 'Nickname',
        read: () => R.text(person, R.preds(['foaf', 'nick'], ['vcard', 'nickname'])),
        plan: (v) => {
          const hadVcard = present(person, p('vcard', 'nickname'))
          const plans = []
          if (present(person, p('foaf', 'nick')) || !hadVcard) plans.push(replace(person, [p('foaf', 'nick')], v))
          if (hadVcard) plans.push(replace(person, [p('vcard', 'nickname')], v))
          return merge(...plans)
        }
      },
      {
        key: 'pronouns',
        label: 'Pronouns',
        placeholder: 'she/her',
        read: () => { const a = R.text(person, [p('solid', 'preferredSubjectPronoun')]); const b = R.text(person, [p('solid', 'preferredObjectPronoun')]); return a && b ? a + '/' + b : a },
        plan: (v) => {
          const [a, b] = v.split('/').map(x => x.trim())
          if (v && !a) throw new Error('write them like she/her')
          return merge(replace(person, [p('solid', 'preferredSubjectPronoun')], a || ''), replace(person, [p('solid', 'preferredObjectPronoun')], b || ''))
        }
      },
      {
        key: 'job',
        label: 'Job title or role',
        locked: () => { const r = currentRole(); return !!r && (isBlank(r) || (!present(r, p('vcard', 'role')) && !!R.first(r, R.P('org', 'role')))) },
        read: () => {
          const r = currentRole()
          if (r) { const role = R.first(r, R.P('org', 'role')); return R.text(r, [p('vcard', 'role')]) || (role ? orgName(role) || localName(role.value) : '') }
          return R.text(person, R.preds(['vcard', 'title'], ['schema', 'jobTitle']))
        },
        plan: (v) => {
          const r = currentRole()
          if (r) return replace(r, [p('vcard', 'role')], v)
          const direct = R.preds(['vcard', 'title'], ['schema', 'jobTitle']).filter(pr => present(person, pr))
          if (direct.length) return replace(person, direct, v)
          if (!v) return { deletions: [], insertions: [] }
          const role = freshNode()
          return { deletions: [], insertions: [st(role, p('rdf', 'type'), p('solid', 'CurrentRole')), st(role, p('org', 'member'), person), st(role, p('vcard', 'role'), lit(v))] }
        }
      },
      {
        key: 'org',
        label: 'Organisation',
        locked: () => { const r = currentRole(); return !!r && isBlank(r) },
        read: () => { const r = currentRole(); return r ? orgName(R.first(r, R.P('org', 'organization'))) : R.text(person, [p('vcard', 'organization-name')]) },
        plan: (v) => {
          const r = currentRole()
          if (!r) {
            if (present(person, p('vcard', 'organization-name'))) return replace(person, [p('vcard', 'organization-name')], v)
            if (!v) return { deletions: [], insertions: [] }
            const role = freshNode()
            const o = freshNode()
            return { deletions: [], insertions: [st(role, p('rdf', 'type'), p('solid', 'CurrentRole')), st(role, p('org', 'member'), person), st(role, p('org', 'organization'), o), st(o, p('rdf', 'type'), p('schema', 'Organization')), st(o, p('schema', 'name'), lit(v))] }
          }
          const links = stmts(r, p('org', 'organization'))
          const o = links.length === 1 ? links[0].object : null
          const shared = o && store.statementsMatching(null, null, o, doc).length > 1
          if (o && ownNode(o) && !shared && v) {
            const named = R.preds(['schema', 'name'], ['foaf', 'name'], ['vcard', 'fn'], ['rdfs', 'label']).filter(pr => present(o, pr))
            return replace(o, named.length ? named : [p('schema', 'name')], v)
          }
          if (!v) return { deletions: links, insertions: [] }
          const fresh = freshNode()
          return { deletions: links, insertions: [st(r, p('org', 'organization'), fresh), st(fresh, p('rdf', 'type'), p('schema', 'Organization')), st(fresh, p('schema', 'name'), lit(v))] }
        }
      },
      ...[['city', 'Town or city', 'locality'], ['country', 'Country', 'country-name']].map(([key, label, local]) => ({
        key,
        label,
        locked: () => isBlank(firstAddress()),
        read: () => R.text(firstAddress(), [p('vcard', local)]),
        plan: (v) => {
          const a = firstAddress()
          if (a) return replace(a, [p('vcard', local)], v)
          if (!v) return { deletions: [], insertions: [] }
          const fresh = freshNode()
          return { deletions: [], insertions: [st(person, p('vcard', 'hasAddress'), fresh), st(fresh, p('vcard', local), lit(v))] }
        }
      })),
      {
        key: 'homepage',
        label: 'Home page',
        placeholder: 'https://',
        read: () => { const h = stmts(person, p('foaf', 'homepage'))[0]; return h ? h.object.value : '' },
        plan: (v) => replace(person, [p('foaf', 'homepage')], v ? sym(httpsUrl(v)) : '')
      },
      {
        key: 'bio',
        label: 'Short bio',
        multi: true,
        read: () => R.text(person, [p('vcard', 'note')]) || R.text(person, R.P('schema', 'description')),
        plan: (v) => replace(person, [p('vcard', 'note')], v)
      }
    ]

    const basics = card('basics', 'About you', true)
    const form = basics.appendChild(el(dom, 'form'))
    const fieldsBox = form.appendChild(el(dom, 'div', 'pfe-fields'))
    const inputs = FIELDS.map(f => {
      const label = fieldsBox.appendChild(el(dom, 'label', 'pfe-field' + (f.multi ? ' pfe-full' : '')))
      label.appendChild(el(dom, 'span', '', f.label))
      const input = label.appendChild(el(dom, f.multi ? 'textarea' : 'input', 'pfe-input'))
      if (!f.multi) { input.type = 'text'; if (f.key === 'homepage') input.inputMode = 'url' }
      input.name = f.key
      input.maxLength = f.multi ? 2000 : 200
      if (f.placeholder) input.placeholder = f.placeholder
      input.value = f.read()
      if (f.locked && f.locked()) { input.readOnly = true; input.title = 'Set in your resume; not editable here yet' }
      const msg = label.appendChild(message())
      msg.dataset.field = f.key
      return { f, input, msg, was: input.value }
    })
    const actions = form.appendChild(el(dom, 'div', 'pfe-actions'))
    const save = actions.appendChild(btn(dom, 'pfe-btn-primary pfe-primary', 'Save'))
    save.type = 'submit'
    const formMsg = actions.appendChild(message())
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      save.disabled = true
      let saved = 0
      let failed = 0
      for (const row of inputs) {
        const value = row.input.value.trim()
        if (row.input.readOnly || value === row.was.trim()) { row.msg.textContent = ''; continue }
        let plan
        try { plan = row.f.plan(value) } catch (error) { say(row.msg, 'Not saved: ' + error.message, false); failed++; continue }
        if (await change(row.msg, plan.deletions, plan.insertions)) { saved++; row.was = row.f.read(); row.input.value = row.was } else {
          // Not saved by the pod: show what is stored again (so the next Save does not send it again), and say so.
          failed++
          row.was = row.f.read()
          if (row.input.value !== row.was) { row.input.value = row.was; row.msg.textContent += ' The field shows what is saved again.' }
        }
      }
      save.disabled = false
      if (!saved && !failed) say(formMsg, 'Nothing has changed', true)
      else say(formMsg, (saved ? saved + ' saved' : '') + (saved && failed ? ', ' : '') + (failed ? failed + ' not saved' : ''), !failed)
      drawHeader()
    })

    // ----- photo -----
    const photoCard = card('photo', 'Profile picture', true, 'Shown on your profile and next to your name in apps.')
    const photoBox = photoCard.appendChild(el(dom, 'div', 'pfe-photoedit'))
    const photoShow = photoBox.appendChild(el(dom, 'div'))
    const photoSide = photoBox.appendChild(el(dom, 'div'))
    const byLink = photoSide.appendChild(el(dom, 'div', 'pfe-add'))
    const photoUrl = byLink.appendChild(el(dom, 'input', 'pfe-input'))
    photoUrl.type = 'text'
    photoUrl.inputMode = 'url'
    photoUrl.placeholder = 'https:// link to a picture'
    photoUrl.setAttribute('aria-label', 'Link to a picture')
    const useLink = byLink.appendChild(btn(dom, '', 'Use this link'))
    const byFile = photoSide.appendChild(el(dom, 'div', 'pfe-add'))
    const file = byFile.appendChild(el(dom, 'input'))
    file.type = 'file'
    file.accept = Object.keys(PHOTO_TYPES).join(',')
    file.setAttribute('aria-label', 'Picture to upload')
    const upload = byFile.appendChild(btn(dom, '', 'Upload', 'upload'))
    const removePhoto = photoSide.appendChild(btn(dom, 'pfe-btn-tertiary pfe-remove', 'Remove photo', 'remove'))
    removePhoto.style.alignSelf = 'flex-start'
    const photoMsg = photoSide.appendChild(message())
    const PHOTO_PREDS = [p('foaf', 'img'), p('vcard', 'hasPhoto')]
    const drawPhoto = () => {
      photoShow.replaceChildren(face(photoNow(), nameNow(), 'pfe-photo'))
      removePhoto.hidden = !PHOTO_PREDS.some(pr => present(person, pr))
      drawHeader()
    }
    const setPhoto = (url) => {
      const used = PHOTO_PREDS.filter(pr => present(person, pr))
      const deletions = PHOTO_PREDS.flatMap(pr => stmts(person, pr))
      return change(photoMsg, deletions, (used.length ? used : [p('vcard', 'hasPhoto')]).map(pr => st(person, pr, sym(url))), 'Photo saved')
    }
    useLink.addEventListener('click', async () => {
      let url
      try { url = httpsUrl(photoUrl.value) } catch (error) { say(photoMsg, 'Not saved: ' + error.message, false); return }
      if (await setPhoto(url)) photoUrl.value = ''
      drawPhoto()
    })
    upload.addEventListener('click', async () => {
      const chosen = file.files && file.files[0]
      if (!chosen) { say(photoMsg, 'Not saved: choose a picture first', false); return }
      const ext = PHOTO_TYPES[chosen.type]
      if (!ext) { say(photoMsg, 'Not saved: use a PNG, JPEG, GIF, WebP or AVIF picture', false); return }
      if (chosen.size > PHOTO_MAX) { say(photoMsg, 'Not saved: the picture is larger than 2 MB', false); return }
      upload.disabled = true
      say(photoMsg, 'Uploading…', true)
      try {
        let address = ''
        for (let attempt = 0; attempt < 3 && !address; attempt++) {
          const target = new URL('photo-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext, doc.value).href
          const response = await webFetch(store)(target, { method: 'PUT', headers: { 'Content-Type': chosen.type, 'If-None-Match': '*' }, body: chosen })
          if (response.ok) address = target
          else if (response.status !== 412) throw new Error('the server refused the picture (' + response.status + ')')
        }
        if (!address) throw new Error('could not find a free file name')
        if (await setPhoto(address)) file.value = ''
      } catch (error) { say(photoMsg, 'Not saved: ' + (error && error.message ? error.message : error), false) }
      upload.disabled = false
      drawPhoto()
    })
    removePhoto.addEventListener('click', async () => {
      await change(photoMsg, PHOTO_PREDS.flatMap(pr => stmts(person, pr)), [], 'Photo removed')
      drawPhoto()
    })

    // ----- lists: one add or remove at a time -----
    // How to take an item out: a plain value loses its link (and, when the item is described only
    // in this document, that description). An item inside an RDF list keeps its place in the list
    // but loses its description, so no reader shows it. Anything else is left alone.
    function removal (item, extra) {
      if (isBlank(item.node)) return null
      const deletions = []
      if (item.statement) deletions.push(item.statement)
      const own = !item.linkOnly && ownNode(item.node) && store.statementsMatching(null, null, item.node, doc).length <= 1 + (item.inList ? 1 : 0)
      if (own) deletions.push(...allAbout(item.node), ...(extra ? extra(item.node) : []))
      if (!item.statement && !own) return null
      if (deletions.some(s => isBlank(s.subject) || isBlank(s.object))) return null
      return deletions
    }

    function listCard ({ part, title, hint, read, row, addForm }) {
      const c = card(part, title, false, hint)
      const ul = c.appendChild(el(dom, 'ul', 'pfe-list'))
      const msg = message()
      const draw = () => {
        ul.replaceChildren()
        const items = read()
        for (const item of items) {
          const li = ul.appendChild(el(dom, 'li'))
          row(li, item)
          const plan = removal(item, item.extra)
          const removeBtn = li.appendChild(btn(dom, 'pfe-btn-icon pfe-remove', '', 'remove'))
          removeBtn.setAttribute('aria-label', 'Remove ' + (item.label || ''))
          removeBtn.title = 'Remove'
          if (!plan) { removeBtn.disabled = true; removeBtn.title = 'Written in a form this pane does not change' }
          removeBtn.addEventListener('click', async () => { await change(msg, plan, [], 'Removed'); draw(); drawHeader() })
        }
        if (!items.length) ul.appendChild(el(dom, 'li', 'pfe-empty', 'None yet.'))
      }
      const add = c.appendChild(el(dom, 'form', 'pfe-add'))
      const submit = addForm(add)
      const button = add.appendChild(btn(dom, '', 'Add', 'plus'))
      button.type = 'submit'
      c.appendChild(msg)
      add.addEventListener('submit', async (event) => {
        event.preventDefault()
        let plan
        try { plan = submit.plan() } catch (error) { say(msg, 'Not saved: ' + error.message, false); return }
        button.disabled = true
        if (await change(msg, plan.deletions || [], plan.insertions, 'Added')) submit.clear()
        button.disabled = false
        draw()
      })
      draw()
      return { draw }
    }
    const input = (form, placeholder, label, type) => { const i = form.appendChild(el(dom, 'input', 'pfe-input')); i.type = 'text'; if (type) i.inputMode = type; i.placeholder = placeholder; i.setAttribute('aria-label', label); i.maxLength = 300; return i }
    const select = (form, options, label) => {
      const s = form.appendChild(el(dom, 'select', 'pfe-input'))
      s.setAttribute('aria-label', label)
      for (const [value, text] of options) { const o = s.appendChild(el(dom, 'option', '', text)); o.value = value }
      return s
    }
    const typeLabel = (node) => R.types(node).map(localName).find(l => /^(Home|Work|Cell|Mobile|Fax|Pref|Personal|Other|Office)$/i.test(l)) || ''

    // emails and phones: vcard:hasEmail [ a vcard:Home|Work ; vcard:value <mailto:…> ]
    const contactCard = (part, title, predicates, scheme, check, kinds, placeholder) => listCard({
      part,
      title,
      read: () => R.entries(person, predicates).map(item => {
        const n = item.node
        const v = /^(mailto|tel):/i.test(n.value) ? n.value : n.termType !== 'Literal' ? ((R.first(n, [p('vcard', 'value')]) || {}).value || '') : n.value
        return { ...item, value: v.replace(new RegExp('^' + scheme, 'i'), ''), type: n.termType === 'Literal' ? '' : typeLabel(n), label: v.replace(/^\w+:/, '') }
      }).filter(x => x.value),
      row: (li, item) => {
        const span = li.appendChild(el(dom, 'span'))
        const href = safeHref(scheme + item.value)
        const a = span.appendChild(el(dom, 'a', '', item.value))
        if (href) { a.href = href; a.rel = 'noopener' }
        if (item.type) span.appendChild(el(dom, 'span', 'pfe-sub', item.type))
      },
      addForm: (form) => {
        const value = input(form, placeholder, 'New ' + title.toLowerCase().replace(/s$/, ''), scheme === 'mailto:' ? 'email' : 'tel')
        const kind = select(form, kinds.map(k => [k, k]), 'Kind')
        return {
          clear: () => { value.value = '' },
          plan: () => {
            const v = check(value.value)
            const existing = R.entries(person, predicates).some(item => [item.node.value, (R.first(item.node, [p('vcard', 'value')]) || {}).value].includes(v))
            if (existing) throw new Error('that is already in your profile')
            const node = freshNode()
            return { insertions: [st(person, predicates[0], node), st(node, p('rdf', 'type'), p('vcard', kind.value)), st(node, p('vcard', 'value'), sym(v))] }
          }
        }
      }
    })
    contactCard('emails', 'Email addresses', R.preds(['vcard', 'hasEmail'], ['foaf', 'mbox'], ['schema', 'email']), 'mailto:', mailto, ['Home', 'Work'], 'name@example.org')
    contactCard('phones', 'Phone numbers', R.preds(['vcard', 'hasTelephone'], ['foaf', 'phone'], ['schema', 'telephone']), 'tel:', tel, ['Cell', 'Home', 'Work'], '+44 20 7946 0000')

    // skills
    const skillName = (n) => {
      if (n.termType === 'Literal') return n.value
      let name = R.text(n, R.preds(['schema', 'name'], ['rdfs', 'label']))
      const pid = R.first(n, R.P('solid', 'publicId'))
      if (!name && pid) name = pid.termType === 'Literal' ? pid.value : (R.text(pid, R.preds(['schema', 'name'], ['rdfs', 'label'], ['skos', 'prefLabel'])) || R.text(pid, R.preds(['schema', 'name'], ['rdfs', 'label'], ['skos', 'prefLabel']), null) || localName(pid.value))
      return (name || '').replace(/\s+/g, ' ').trim()
    }
    const skillExtra = (n) => {
      const pid = R.first(n, R.P('solid', 'publicId'))
      return pid && ownNode(pid) && store.statementsMatching(null, null, pid, doc).length === 1 ? allAbout(pid) : []
    }
    listCard({
      part: 'skills',
      title: 'Skills',
      read: () => R.entries(person, R.P('schema', 'skills')).map(item => ({ ...item, label: skillName(item.node), extra: skillExtra })).filter(x => x.label),
      row: (li, item) => li.appendChild(el(dom, 'span', '', item.label)),
      addForm: (form) => {
        const value = input(form, 'Something you are good at', 'New skill')
        return {
          clear: () => { value.value = '' },
          plan: () => {
            const v = value.value.trim().replace(/\s+/g, ' ')
            if (!v) throw new Error('type a skill first')
            if (R.entries(person, R.P('schema', 'skills')).some(item => skillName(item.node).toLowerCase() === v.toLowerCase())) throw new Error('that skill is already there')
            const node = freshNode()
            return { insertions: [st(person, p('schema', 'skills'), node), st(node, p('schema', 'name'), lit(v))] }
          }
        }
      }
    })

    // languages
    const languageOf = (n) => {
      if (n.termType === 'Literal') return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(n.value) ? { code: n.value, name: languageName(n.value) } : { code: '', name: n.value }
      const pid = R.first(n, R.P('solid', 'publicId'))
      let code = pid && pid.termType === 'Literal' ? pid.value : pid && pid.value.startsWith(IANA) ? pid.value.slice(IANA.length).replace(/[#/].*$/, '') : ''
      if (!code && n.termType === 'NamedNode' && n.value.startsWith(IANA)) code = n.value.slice(IANA.length)
      const name = R.text(n, R.preds(['schema', 'name'], ['rdfs', 'label'])) || (pid && pid.termType !== 'Literal' ? R.text(pid, R.preds(['schema', 'name'], ['rdfs', 'label']), null) : '') || (code ? languageName(code) : '')
      return { code: code.toLowerCase(), name, level: R.text(n, R.P('schema', 'proficiencyLevel')) }
    }
    listCard({
      part: 'languages',
      title: 'Languages',
      read: () => R.entries(person, R.P('schema', 'knowsLanguage')).map(item => ({ ...item, ...languageOf(item.node) })).filter(x => x.name).map(x => ({ ...x, label: x.name })),
      row: (li, item) => { const span = li.appendChild(el(dom, 'span', '', item.name)); if (item.level) span.appendChild(el(dom, 'span', 'pfe-sub', localName(item.level))) },
      addForm: (form) => {
        const code = select(form, [['', 'Language'], ...LANGUAGES.map(c => [c, languageName(c)]).sort((a, b) => a[1].localeCompare(b[1]))], 'Language')
        const level = select(form, [['', 'Level'], ...LEVELS.map(l => [l, l])], 'Level')
        return {
          clear: () => { level.value = ''; code.value = '' },
          plan: () => {
            const c = code.value
            if (!c) throw new Error('choose a language first')
            const name = languageName(c)
            if (R.entries(person, R.P('schema', 'knowsLanguage')).some(item => { const l = languageOf(item.node); return l.code === c || l.name.toLowerCase() === name.toLowerCase() })) throw new Error(name + ' is already there')
            const node = freshNode()
            const iana = sym(IANA + c)
            const insertions = [st(person, p('schema', 'knowsLanguage'), node), st(node, p('solid', 'publicId'), iana)]
            if (level.value) insertions.push(st(node, p('schema', 'proficiencyLevel'), lit(level.value)))
            if (!store.holds(iana, p('schema', 'name'), lit(name, 'en'), doc)) insertions.push(st(iana, p('schema', 'name'), lit(name, 'en')))
            return { insertions }
          }
        }
      }
    })

    // accounts elsewhere
    const accountOf = (n) => {
      if (n.termType === 'Literal') { const href = safeHref(n.value); return { name: shortUrl(href), href } }
      const classes = R.types(n)
      const net = NETWORKS.find(x => classes.some(c => localName(c).toLowerCase() === x[1].toLowerCase()))
      const handle = R.text(n, [p('foaf', 'accountName')])
      const home = R.first(n, [p('foaf', 'homepage')])
      let href = safeHref(home && home.value)
      if (!href && /^https?:\/\//i.test(handle)) href = handle
      if (!href && handle && net && net[2]) href = net[2] + handle.replace(/^@/, '')
      if (!href && n.termType === 'NamedNode' && /^https?:/i.test(n.value) && !n.value.startsWith(doc.value)) href = n.value
      const name = R.text(n, R.preds(['foaf', 'name'], ['rdfs', 'label'])) || (net && net[1] !== 'OtherAccount' ? net[0] : '') || shortUrl(href)
      return { name, href: safeHref(href), handle: handle && !/^https?:/i.test(handle) ? handle : '' }
    }
    listCard({
      part: 'accounts',
      title: 'Accounts elsewhere',
      read: () => R.entries(person, [p('foaf', 'account')]).map(item => ({ ...item, ...accountOf(item.node) })).filter(x => x.href).map(x => ({ ...x, label: x.name })),
      row: (li, item) => {
        const span = li.appendChild(el(dom, 'span'))
        const a = span.appendChild(el(dom, 'a', '', item.name))
        a.href = item.href
        a.rel = 'noopener noreferrer'
        a.target = '_blank'
        const sub = item.handle || shortUrl(item.href)
        if (sub !== item.name) span.appendChild(el(dom, 'span', 'pfe-sub', sub))
      },
      addForm: (form) => {
        const net = select(form, NETWORKS.map(n => [n[1], n[0]]), 'Network')
        const value = input(form, 'Your name there, or a https:// link', 'Account name or link')
        return {
          clear: () => { value.value = '' },
          plan: () => {
            const [label, cls, prefix] = NETWORKS.find(n => n[1] === net.value)
            const v = value.value.trim()
            if (!v) throw new Error('type your name there, or a link')
            let homepage
            let handle = ''
            if (/^https?:/i.test(v) || !prefix) {
              homepage = httpsUrl(v)
              if (prefix && homepage.toLowerCase().startsWith(prefix.toLowerCase())) handle = homepage.slice(prefix.length).replace(/\/$/, '')
              if (cls === 'MastodonAccount') { const m = homepage.match(/^https:\/\/([^/]+)\/(@[^/?#]+)/); if (m) handle = m[2] + '@' + m[1] }
            } else {
              if (/[\s/?#]/.test(v)) throw new Error('a name there has no spaces or slashes; or paste the full link')
              handle = v.replace(/^@/, '')
              homepage = httpsUrl(prefix + encodeURIComponent(handle).replace(/%40/g, '@'))
            }
            if (R.entries(person, [p('foaf', 'account')]).some(item => accountOf(item.node).href.replace(/\/$/, '').toLowerCase() === homepage.replace(/\/$/, '').toLowerCase())) throw new Error('that account is already there')
            const node = freshNode()
            const insertions = [st(person, p('foaf', 'account'), node), st(node, p('rdf', 'type'), sym(SOCIAL + cls)), st(node, p('foaf', 'homepage'), sym(homepage))]
            insertions.push(st(node, p('rdfs', 'label'), lit(cls === 'OtherAccount' ? shortUrl(homepage) : label)))
            if (handle) insertions.push(st(node, p('foaf', 'accountName'), lit(handle)))
            return { insertions }
          }
        }
      }
    })

    // people I know
    const KNOWS = R.preds(['foaf', 'knows'], ['schema', 'knows'])
    const friendName = (n) => R.text(n, R.preds(['foaf', 'name'], ['vcard', 'fn'], ['schema', 'name']), null) || R.text(n, R.preds(['foaf', 'nick'], ['vcard', 'nickname']), null)
    const friendPhoto = (n) => { const o = R.first(n, R.preds(['foaf', 'img'], ['vcard', 'hasPhoto']), null); return o ? safeImage(o.value) : '' }
    const asked = new Set()
    const friends = listCard({
      part: 'friends',
      title: 'People I know',
      hint: 'Add someone by their WebID, the address of their profile.',
      read: () => R.entries(person, KNOWS).filter(item => item.node.termType === 'NamedNode' && /^https?:/i.test(item.node.value)).map(item => ({ ...item, linkOnly: true, label: friendName(item.node) || shortUrl(item.node.value) })),
      row: (li, item) => {
        li.appendChild(face(friendPhoto(item.node), item.label, 'pfe-photo pfe-face'))
        const span = li.appendChild(el(dom, 'span'))
        const a = span.appendChild(el(dom, 'a', '', item.label))
        a.href = item.node.value
        a.rel = 'noopener'
        a.title = item.node.value
        a.addEventListener('click', (ev) => {
          try {
            const outliner = context.getOutliner && context.getOutliner(dom)
            if (outliner && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey) { ev.preventDefault(); outliner.GotoSubject(item.node, true, undefined, true, undefined) }
          } catch { /* follow the link */ }
        })
        if (friendName(item.node) && item.node.doc().value !== doc.value) span.appendChild(el(dom, 'span', 'pfe-sub', shortUrl(item.node.value)))
        lookUp(item.node)
      },
      addForm: (form) => {
        const value = input(form, 'https://their.pod/profile/card#me', 'WebID of someone you know', 'url')
        return {
          clear: () => { value.value = '' },
          plan: () => {
            const v = httpsUrl(value.value, true)
            if (v === person.value) throw new Error('that is you')
            if (R.entries(person, KNOWS).some(item => item.node.value === v)) throw new Error('already in your list')
            return { insertions: [st(person, p('foaf', 'knows'), sym(v))] }
          }
        }
      }
    })
    // Names come from people's own profiles: fetched in the background, shown when they arrive.
    function lookUp (node) {
      if (friendName(node) || node.doc().value === doc.value || asked.has(node.doc().value) || !store.fetcher) return
      asked.add(node.doc().value)
      Promise.race([store.fetcher.load(node.doc()), new Promise(resolve => setTimeout(resolve, 10000))])
        .then(() => { if (friendName(node)) friends.draw() }, () => {})
    }

    // resume
    const cv = card('resume', 'Resume', false)
    const roles = roleNodes().length
    cv.appendChild(el(dom, 'p', 'pfe-muted pfe-cv', (roles ? 'Your profile lists ' + (roles === 1 ? 'one role' : roles + ' roles') + '. ' : '') + 'Editing your resume (roles, dates, organisations) is not available here yet. Job title and organisation above change your current role.'))

    // The cards in page order (the photo first, under the name, as a settings page has it).
    for (const [part] of PARTS) if (sections[part]) grid.appendChild(sections[part])
    drawHeader()
    drawPhoto()
    return root
  },

  // In the suite shell: the cards of the page in the left column. A click scrolls to that card.
  renderNavigation (subject, context) {
    const shared = stateOf(context)
    if (!shared.sections) return null
    const dom = context.dom
    const list = el(dom, 'ul', 'pfe-nav-list pfe-shell-nav')
    list.setAttribute('aria-label', 'Profile sections')
    const items = []
    for (const [part, label, iconName] of PARTS) {
      if (!shared.sections[part]) continue
      const b = list.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'pfe-nav-item'))
      b.type = 'button'
      b.dataset.part = part
      b.appendChild(icon(dom, iconName))
      b.appendChild(el(dom, 'span', 'pfe-nav-label', label))
      if (part === (shared.current || PARTS[0][0])) b.setAttribute('aria-current', 'page')
      items.push(b)
      b.addEventListener('click', () => {
        shared.current = part
        for (const x of items) { if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current') }
        const target = shared.sections[part]
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start' })
      })
    }
    return list // styled by the <style> in render's root, which is in the same document
  }
}

export default pane
