// source-pane.js: see and edit the raw text of a file in a pod.
//
// One file, no imports, no dependencies. A plain <textarea> in a monospace font, with line numbers
// in a gutter drawn beside it. It is an alternative view: it never asks to open first.
//
// What it reads: the file itself, fetched as the logged-in person (store.fetcher._fetch), with
// cache: 'no-store', asking for the form the file is stored in. It keeps the ETag and WAC-Allow.
//
// What it writes, and when: only when the person presses Save (or Ctrl/Cmd+S) after pressing Edit.
// Then it PUTs the text back to the same address, with the same Content-Type and If-Match: <ETag>.
// If the file changed on the server since it was read, the server answers 412 and nothing is
// written; the person's text is kept. Nothing else is ever written.

const CSS = `
/* suite:design begin --prefix src --only icon,toolbar,buttons,chip,empty,toast */
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
.src-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.src-root *, .src-root *::before, .src-root *::after { box-sizing: border-box }
.src-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.src-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.src-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.src-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.src-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.src-root [hidden] { display: none !important }
.src-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.src-muted { color: var(--sui-text-muted) }
.src-small { font-size: var(--sui-text-sm) }
.src-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.src-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.src-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.src-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.src-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.src-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --src-i set to url("data:image/svg+xml,...") ---------------------------------- */
.src-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--src-i) center / contain no-repeat; mask: var(--src-i) center / contain no-repeat }
/* ---- toolbar: content toolbar and breadcrumbs ---------------------------------------------------------------------- */
.src-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2); min-height: calc(var(--sui-target) + var(--sui-space-3)); padding: var(--sui-space-1) var(--sui-space-3) }
.src-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; min-width: 0; margin: 0; padding: 0; list-style: none; font-size: var(--sui-text-lg) }
.src-crumbs li { display: flex; align-items: center; min-width: 0 }
.src-crumbs li + li::before { content: "›"; padding: 0 var(--sui-space-1); color: var(--sui-text-muted) }
.src-crumbs a { display: inline-flex; align-items: center; min-height: var(--sui-target); padding: 0 var(--sui-space-2); border-radius: var(--sui-radius); color: var(--sui-text-muted); text-decoration: none; overflow-wrap: anywhere }
.src-crumbs a:hover { background: var(--sui-bg-hover) }
.src-crumbs [aria-current="page"] { color: var(--sui-text); font-weight: var(--sui-weight-bold) }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.src-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.src-btn:hover { background: var(--sui-primary-light-hover) }
.src-btn:disabled, .src-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.src-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.src-btn-primary:hover { background: var(--sui-primary-element-hover) }
.src-btn-tertiary { background: transparent; color: var(--sui-text) }
.src-btn-tertiary:hover { background: var(--sui-bg-hover) }
.src-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.src-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.src-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.src-btn-icon:hover { background: var(--sui-bg-hover) }
.src-btn-wide { width: 100%; justify-content: flex-start }
.src-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.src-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.src-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.src-chip { cursor: pointer }
button.src-chip:hover { background: var(--sui-primary-light-hover) }
.src-chip-primary, .src-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.src-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.src-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.src-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.src-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.src-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.src-empty-icon .src-icon { width: 48px; height: 48px }
.src-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.src-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.src-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.src-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.src-toast-error { border-left-color: var(--sui-error) }
.src-toast-success { border-left-color: var(--sui-success) }
.src-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.src-status-error { color: var(--sui-error) }
.src-status-success { color: var(--sui-success) }
.src-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.src-note-error { background: var(--sui-error-light) }
.src-note-warning { background: var(--sui-warning-light) }
.src-note-success { background: var(--sui-success-light) }
/* suite:design end */
.src.source-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8); min-width: 0 }
.src-facts { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); overflow-wrap: anywhere }
.src-name { color: var(--sui-text); font-weight: var(--sui-weight-bold); font-size: var(--sui-text-md) }
.src.source-pane .src-toolbar { gap: var(--sui-space-2); min-height: 0; margin: var(--sui-space-2) 0; padding: 0 }
.src.source-pane .src-toolbar .src-status { width: auto; margin: 0 0 0 auto; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; min-width: 0; overflow-wrap: anywhere }
.src.source-pane .src-note { width: auto; border: 0 }
.src-toolbar .src-chip:not([hidden]) + .src-status { margin-left: 0 }
.src-toolbar .src-chip { margin-left: auto }
.src-note { margin: 0 0 var(--sui-space-3); overflow-wrap: anywhere }
.src-note > .src-icon { margin-top: 2px; color: var(--sui-primary-element) }
.src-note-error > .src-icon { color: var(--sui-error) }
.src-note-ok > .src-icon { color: var(--sui-success) }
.src-note-main { flex: 1 1 auto; min-width: 0 }
.src-note-main p { margin: 0 }
.src-note-main .src-btns { margin-top: var(--sui-space-2) }
.src-code { display: flex; min-width: 0; border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg); overflow: hidden }
.src-code.src-editing { border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.src-gutter-box, .src-gutter, .src-text { font-family: var(--sui-font-mono); font-size: var(--sui-text-sm); line-height: var(--sui-space-5); tab-size: 4 }
.src-gutter-box { flex: none; position: relative; background: var(--sui-bg-app); border-right: 1px solid var(--sui-border) }
.src-gutter { position: absolute; inset: 0; margin: 0; padding: var(--sui-space-2) var(--sui-space-2) var(--sui-space-12) var(--sui-space-1); text-align: right; color: var(--sui-text-muted); overflow: hidden; white-space: pre; user-select: none }
.src.source-pane .src-text { flex: 1 1 auto; min-width: 0; width: 100%; margin: 0; padding: var(--sui-space-2) var(--sui-space-3); border: 0; border-radius: 0; outline: 0; resize: vertical; background: transparent; color: var(--sui-text); white-space: pre; overflow: auto; overflow-wrap: normal; min-height: 160px }
.src-keys { margin: var(--sui-space-2) 0 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
@media (max-width: 600px) { .src.source-pane { padding: var(--sui-space-3) var(--sui-space-3) var(--sui-space-6) } }
`

const LIMIT = 1000000 // bytes shown at most; a longer file is shown in part and cannot be edited here
const MEDIA = 'http://www.w3.org/ns/iana/media-types/'
const LDP = 'http://www.w3.org/ns/ldp#'
const BINARY_NAME = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|heic|pdf|zip|gz|tgz|bz2|xz|7z|rar|mp3|m4a|ogg|oga|opus|wav|flac|mp4|m4v|webm|mov|avi|mkv|woff2?|ttf|otf|eot|wasm|exe|bin|dmg|iso|docx?|xlsx?|pptx?|odt|ods)$/i

// Content types this pane treats as text.
const isText = (type) => /^text\/|json|xml|javascript|ecmascript|turtle|n3|n-triples|n-quads|trig|markdown|yaml|toml|sparql|x-sh|csv/i.test(type || '')
const bare = (type) => (type || '').split(';')[0].trim().toLowerCase()
const kindOf = (type) => {
  const t = bare(type)
  if (t === 'text/turtle' || t === 'application/x-turtle') return 'turtle'
  if (t === 'text/n3' || t === 'application/n3') return 'n3'
  if (t === 'application/ld+json') return 'jsonld'
  if (t === 'application/json' || /\+json$/.test(t)) return 'json'
  return ''
}
// Ask for the form the file is stored in: its own type where the name says it, anything otherwise.
function acceptFor (uri) {
  const path = new URL(uri).pathname
  if (/\.ttl$/i.test(path)) return 'text/turtle'
  if (/\.n3$/i.test(path)) return 'text/n3'
  if (/\.jsonld$/i.test(path)) return 'application/ld+json'
  if (/\.json$/i.test(path)) return 'application/json'
  return '*/*'
}

// Material Design Icons (Apache 2.0), as paths in a 24 x 24 box.
const MDI = {
  code: 'M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z',
  copy: 'M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z',
  pencil: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  save: 'M15,9H5V5H15M12,19A3,3 0 0,1 9,16A3,3 0 0,1 12,13A3,3 0 0,1 15,16A3,3 0 0,1 12,19M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  alert: 'M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z',
  check: 'M12,2C6.5,2 2,6.5 2,12C2,17.5 6.5,22 12,22C17.5,22 22,17.5 22,12C22,6.5 17.5,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M16.59,7.58L10,14.17L7.41,11.59L6,13L10,17L18,9L16.59,7.58Z',
  lock: 'M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z',
  file: 'M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6Z',
  open: 'M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)
function icon (dom, name) {
  const span = dom.createElement('span')
  span.className = 'src-icon'
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--src-i', `url("${svg(MDI[name])}")`)
  return span
}

function el (dom, tag, className, text) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

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

const webFetch = (store) => (store.fetcher && store.fetcher._fetch) || fetch.bind(globalThis)

function sizeLabel (bytes) {
  if (bytes == null || isNaN(bytes)) return 'size unknown'
  if (bytes < 1024) return bytes + (bytes === 1 ? ' byte' : ' bytes')
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(/\.0$/, '') + ' KB'
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '') + ' MB'
}

// What WAC-Allow says the person may do: true or false for write, or null when the server did not say.
function canWrite (header) {
  const user = /user\s*=\s*"([^"]*)"/i.exec(header || '')
  return user ? /\bwrite\b/.test(user[1]) : null
}

// The line an error points at, if it says.
function errorLine (message, text) {
  const line = /line[\s:]*(\d+)/i.exec(message)
  if (line) return +line[1]
  const at = /position (\d+)/i.exec(message)
  if (at) return text.slice(0, +at[1]).split('\n').length
  return null
}

// Does this text parse as its type? Resolves to null when it does, or { message, line }.
function check (text, kind, base) {
  const fail = (error) => {
    const raw = String(error && error.message ? error.message : error).replace(/\s+/g, ' ').trim()
    const line = errorLine(raw, text)
    const message = raw.replace(/^\w*Error:\s*/, '').replace(/^Line \d+ of <[^>]*>:\s*/i, '')
    return { message: message.slice(0, 300), line }
  }
  if (kind === 'json' || kind === 'jsonld') {
    try { JSON.parse(text) } catch (error) { return Promise.resolve(fail(error)) }
    if (kind === 'json') return Promise.resolve(null)
  }
  const $rdf = globalThis.$rdf
  if (!$rdf || !$rdf.parse) return Promise.resolve(null)
  const type = { turtle: 'text/turtle', n3: 'text/n3', jsonld: 'application/ld+json' }[kind]
  return new Promise((resolve) => {
    const graph = $rdf.graph()
    const timer = setTimeout(() => resolve(null), 10000)
    const done = (result) => { clearTimeout(timer); resolve(result) }
    try {
      if (kind === 'jsonld') $rdf.parse(text, graph, base, type, (error) => done(error ? fail(error) : null))
      else { $rdf.parse(text, graph, base, type); done(null) }
    } catch (error) { done(fail(error)) }
  })
}

// The triples of an RDF text, as sorted lines, blank nodes blanked: a way to tell "the same data".
async function triples (text, kind, base) {
  const $rdf = globalThis.$rdf
  if (!$rdf || !$rdf.parse) return null
  const type = { turtle: 'text/turtle', n3: 'text/n3', jsonld: 'application/ld+json' }[kind]
  if (!type) return null
  const graph = $rdf.graph()
  await new Promise((resolve, reject) => {
    try {
      if (kind === 'jsonld') $rdf.parse(text, graph, base, type, (error) => error ? reject(error) : resolve())
      else { $rdf.parse(text, graph, base, type); resolve() }
    } catch (error) { reject(error) }
  })
  const term = (t) => t.termType === 'BlankNode' ? '_' : t.toNT()
  return graph.statements.map(s => term(s.subject) + ' ' + term(s.predicate) + ' ' + term(s.object)).sort().join('\n')
}

const pane = {
  name: 'source-lab',

  icon: svg(MDI.code, '#00679e'),

  // "Source" for a document that is (or may be) text; never for a folder or a thing inside a document.
  label (subject, context) {
    if (!subject || !subject.uri || subject.termType !== 'NamedNode') return null
    if (subject.uri.includes('#') || subject.uri.endsWith('/')) return null
    if (!/^https?:/i.test(subject.uri)) return null
    const store = (context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store)
    let types = {}
    try { types = store ? store.findTypeURIs(subject) : {} } catch { types = {} }
    if (types[LDP + 'Container'] || types[LDP + 'BasicContainer']) return null
    const media = Object.keys(types).filter(t => t.startsWith(MEDIA)).map(t => t.slice(MEDIA.length).split('#')[0])
    if (media.length) return media.some(isText) ? 'Source' : null
    // Not read yet: go by the name, and leave out what is plainly not text.
    if (BINARY_NAME.test(new URL(subject.uri).pathname)) return null
    return 'Source'
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const doc = subject.doc ? subject.doc() : subject
    const uri = doc.uri
    const me = () => currentUser(context)

    const root = el(dom, 'div', 'src source-pane src-root')
    root.appendChild(el(dom, 'style', '', CSS))
    // The file's name, type, size (and when it last changed), quietly, above a slim row of buttons.
    const factsLine = root.appendChild(el(dom, 'p', 'src-facts'))
    const meta = factsLine.appendChild(el(dom, 'span', 'src-meta'))
    const when = factsLine.appendChild(el(dom, 'span', 'src-when'))
    const name = decodeURIComponent(new URL(uri).pathname.split('/').pop() || uri)
    const facts = (text) => { meta.textContent = ''; const n = meta.appendChild(el(dom, 'span', 'src-name', name)); n.title = uri; if (text) meta.appendChild(dom.createTextNode(' · ' + text)) }
    facts('reading the file…')
    const bar = root.appendChild(el(dom, 'div', 'src-toolbar src-bar'))
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', 'File')
    bar.hidden = true
    // Short news ("Saving…", "Saved.") is a quiet status line at the end of the button row; anything longer,
    // anything wrong, or anything with buttons of its own is a note above the text.
    const status = el(dom, 'p', 'src-status src-msg')
    status.hidden = true
    status.setAttribute('role', 'status')
    const note = root.appendChild(el(dom, 'div', 'src-note src-msg'))
    note.hidden = true
    note.setAttribute('role', 'status')
    const body = root.appendChild(el(dom, 'div'))
    let modified = ''
    let lastModifiedSent = false
    // When it last changed: the Last-Modified header if the server sends one (JSS does not), else what the store
    // already knows from the folder's listing (dct:modified), if the folder was read. No extra request for it.
    const showWhen = () => {
      let stamp = modified
      if (!stamp) { try { const m = store.any(doc, store.sym('http://purl.org/dc/terms/modified')); stamp = m ? m.value : '' } catch { stamp = '' } }
      const t = new Date(stamp)
      when.textContent = stamp && !isNaN(t) ? ' · modified ' + t.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
    }

    // The state of the file as last read from the server.
    let original = '' // its text
    let etag = null
    let lastModified = '' // the Last-Modified header of the last read, if the server sent one (JSS does not)
    let draftBase = null // the ETag the file had before a restored draft took its place (see offerDraft)
    let contentType = ''
    let editing = false
    let forced = false // "Save anyway" was pressed for the text as it is now
    let busy = false

    function say (text, tone, actions = []) {
      status.textContent = ''
      note.textContent = ''
      status.hidden = note.hidden = true
      if (!text) return
      tone = tone || 'info'
      const lines = [].concat(text)
      if (!actions.length && tone !== 'bad' && lines.length === 1 && lines[0].length <= 48) {
        status.hidden = false
        status.dataset.tone = tone
        status.className = 'src-status src-msg' + (tone === 'good' ? ' src-status-success' : '')
        status.textContent = lines[0]
        return
      }
      note.hidden = false
      note.dataset.tone = tone
      note.className = 'src-note src-msg' + (tone === 'bad' ? ' src-note-error' : tone === 'good' ? ' src-note-ok' : '')
      note.appendChild(icon(dom, tone === 'bad' ? 'alert' : tone === 'good' ? 'check' : 'info'))
      const main = note.appendChild(el(dom, 'div', 'src-note-main'))
      for (const line of lines) main.appendChild(el(dom, 'p', '', line))
      if (actions.length) {
        const row = main.appendChild(el(dom, 'div', 'src-btns'))
        for (const [label, action] of actions) {
          const button = row.appendChild(el(dom, 'button', 'src-btn', label))
          button.type = 'button'
          button.addEventListener('click', action)
        }
      }
    }

    // A fresh read of the file, as the person.
    async function read () {
      const response = await webFetch(store)(uri, { method: 'GET', headers: { Accept: acceptFor(uri) }, cache: 'no-store', credentials: 'include' })
      return response
    }

    // Nothing to show: the sheet's empty state (a big muted icon, a title, one sentence).
    function emptyState (iconName, title, text) {
      body.textContent = ''
      bar.hidden = true
      const box = body.appendChild(el(dom, 'div', 'src-empty'))
      box.appendChild(el(dom, 'span', 'src-empty-icon')).appendChild(icon(dom, iconName))
      box.appendChild(el(dom, 'p', 'src-empty-title', title))
      box.appendChild(el(dom, 'p', 'src-empty-text', text))
      return box
    }

    function showProblem (text, status) {
      facts('')
      emptyState(status === 401 || status === 403 ? 'lock' : 'alert', status === 404 ? 'No file here' : 'Cannot show this file', text)
    }

    async function load () {
      let response
      try { response = await read() } catch (error) { showProblem('The file could not be read: ' + (error && error.message ? error.message : error)); return }
      if (!response.ok) {
        const why = {
          401: me() ? 'You are logged in, but this file is not shared with you.' : 'This file is private. Log in to see it.',
          403: 'This file is not shared with you.',
          404: 'There is no file at this address.'
        }[response.status] || 'The server answered ' + response.status + ' ' + (response.statusText || '') + '.'
        showProblem(why, response.status)
        return
      }
      contentType = response.headers.get('content-type') || ''
      const length = +response.headers.get('content-length')
      const links = response.headers.get('link') || ''
      if (/ldp#(Basic)?Container/.test(links) && /rel="type"/.test(links)) { showProblem('This is a folder, not a file.'); return }
      if (contentType && !isText(contentType)) {
        try { response.body && response.body.cancel() } catch { /* nothing to stop */ }
        showBinary(bare(contentType), response.headers.get('content-length') ? length : null)
        return
      }
      const bytes = await readSome(response, LIMIT + 1)
      if (!contentType && bytes.subarray(0, 8000).includes(0)) { showBinary('type not given', bytes.length); return }
      etag = response.headers.get('etag')
      lastModified = response.headers.get('last-modified') || ''
      modified = lastModified
      showWhen()
      const partial = bytes.length > LIMIT
      const text = new TextDecoder('utf-8').decode(partial ? bytes.subarray(0, LIMIT) : bytes)
      const writable = !partial && !!me() && allowed(response.headers.get('wac-allow'))
      original = text
      draw(text, partial ? (length || null) : bytes.length, partial, writable)
      if (writable) offerDraft()
    }

    // At most `most` bytes of a response: a 500 MB log is not pulled into the tab to show its first megabyte.
    async function readSome (response, most) {
      if (!response.body || !response.body.getReader) {
        const all = new Uint8Array(await response.arrayBuffer())
        return all.length > most ? all.subarray(0, most) : all
      }
      const reader = response.body.getReader()
      const parts = []
      let got = 0
      while (got < most) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
        got += value.length
      }
      if (got >= most) { try { await reader.cancel() } catch { /* already finished */ } }
      const out = new Uint8Array(Math.min(got, most))
      let at = 0
      for (const part of parts) { const piece = part.subarray(0, out.length - at); out.set(piece, at); at += piece.length; if (at >= out.length) break }
      return out
    }

    function allowed (wac) {
      const wacSays = canWrite(wac)
      if (wacSays !== null) return wacSays
      try { return !!(store.updater && store.updater.editable(uri, store)) } catch { return false }
    }

    function showBinary (type, size) {
      facts(type + ' · ' + sizeLabel(size))
      const box = emptyState('file', 'Not a text file', 'This file is not text (' + type + ', ' + sizeLabel(size) + '), so its source cannot be shown here.')
      const link = box.appendChild(el(dom, 'a', 'src-btn'))
      link.append(icon(dom, 'open'), 'Open the file itself')
      link.href = uri
      link.rel = 'noopener'
      link.target = '_blank'
    }

    // The text area, its gutter, and the buttons.
    let area, gutter, gutterBox, frame, editButton, saveButton, cancelButton, copyButton, dirtyNote, keysNote
    let shownLines = 0
    let canEdit = false
    const describe = (size) => facts((bare(contentType) || 'type not given') + ' · ' + sizeLabel(size) + (canEdit ? '' : ' · read only'))

    function draw (text, size, partial, writable) {
      canEdit = writable
      describe(size)
      body.textContent = ''
      bar.textContent = ''
      bar.hidden = false
      if (partial) say('This file is ' + (size ? sizeLabel(size) : 'over ' + sizeLabel(LIMIT)) + ': only the first ' + sizeLabel(LIMIT) + ' is shown, and it cannot be edited here.', 'info')
      frame = body.appendChild(el(dom, 'div', 'src-code'))
      gutterBox = frame.appendChild(el(dom, 'div', 'src-gutter-box'))
      gutter = gutterBox.appendChild(el(dom, 'pre', 'src-gutter'))
      gutter.setAttribute('aria-hidden', 'true')
      area = frame.appendChild(el(dom, 'textarea', 'src-text'))
      area.setAttribute('wrap', 'off')
      area.spellcheck = false
      area.setAttribute('autocapitalize', 'off')
      area.setAttribute('autocomplete', 'off')
      area.setAttribute('aria-label', 'Source of ' + uri)
      area.readOnly = true
      area.value = text
      numberLines()
      fitHeight()
      area.addEventListener('scroll', () => { gutter.scrollTop = area.scrollTop })
      area.addEventListener('input', () => { forced = false; numberLines(); markDirty() })
      area.addEventListener('keydown', keys)

      copyButton = bar.appendChild(button('Copy', copy, 'src-btn src-btn-icon', 'copy', true))
      if (writable) {
        editButton = bar.appendChild(button('Edit', startEdit, 'src-btn src-btn-primary', 'pencil'))
        saveButton = bar.appendChild(button('Save', () => save(false), 'src-btn src-btn-primary', 'save'))
        cancelButton = bar.appendChild(button('Cancel', cancel, 'src-btn src-btn-tertiary', 'close'))
        saveButton.hidden = cancelButton.hidden = true
      }
      dirtyNote = bar.appendChild(el(dom, 'span', 'src-chip src-chip-warning src-dirty', 'Unsaved changes'))
      dirtyNote.hidden = true
      bar.appendChild(status)
      keysNote = body.appendChild(el(dom, 'p', 'src-keys', 'Ctrl+S saves · Tab adds two spaces · Esc then Tab leaves the text'))
      keysNote.hidden = true
    }

    // A toolbar button: an icon, and its word beside it unless iconOnly (then the word is its label and tooltip).
    function button (label, action, cls, iconName, iconOnly) {
      const b = el(dom, 'button', cls)
      b.type = 'button'
      b.appendChild(icon(dom, iconName))
      if (iconOnly) { b.setAttribute('aria-label', label); b.title = label } else b.appendChild(dom.createTextNode(label))
      b.addEventListener('click', action)
      return b
    }

    function numberLines () {
      let count = 1
      const value = area.value
      for (let i = value.indexOf('\n'); i !== -1; i = value.indexOf('\n', i + 1)) count++
      if (count === shownLines) return
      shownLines = count
      const numbers = new Array(count)
      for (let i = 0; i < count; i++) numbers[i] = i + 1
      gutter.textContent = numbers.join('\n')
      gutterBox.style.width = 'calc(' + String(count).length + 'ch + 16px)'
      fitHeight()
      gutter.scrollTop = area.scrollTop
    }

    function fitHeight () {
      const wanted = shownLines * 20 + 20 + 18 // lines, padding, room for a sideways scroll bar
      const most = Math.max(240, Math.round((globalThis.innerHeight || 800) * 0.7))
      area.style.height = Math.max(160, Math.min(wanted, most)) + 'px'
    }

    const dirty = () => editing && area && area.value !== original

    function markDirty () {
      if (dirtyNote) dirtyNote.hidden = !dirty()
      keepDraft()
    }

    // Unsaved text survives leaving the view inside the app (a link, the shell's search, another view, Back), which
    // no leave warning can stop: while there are unsaved changes the text is kept in this tab's sessionStorage, per
    // file, with the ETag it was based on, and offered again the next time the file is opened here.
    const DRAFT = 'source-lab:draft:' + uri
    const storage = () => { try { return globalThis.sessionStorage || null } catch { return null } }
    function keepDraft () {
      const box = storage()
      if (!box) return
      try {
        if (dirty()) box.setItem(DRAFT, JSON.stringify({ text: area.value, etag: draftBase || etag, at: Date.now() }))
        else box.removeItem(DRAFT)
      } catch { /* full or blocked: the leave warning still covers closing the tab */ }
    }
    function dropDraft () { try { const box = storage(); if (box) box.removeItem(DRAFT) } catch { /* nothing kept */ } }
    function offerDraft () {
      let draft = null
      try { const box = storage(); draft = box && JSON.parse(box.getItem(DRAFT) || 'null') } catch { draft = null }
      if (!draft || typeof draft.text !== 'string') return
      if (draft.text === original) { dropDraft(); return }
      const when = new Date(draft.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      say('You have unsaved changes to this file from earlier (' + when + ').', 'info', [
        ['Restore them', () => restoreDraft(draft)],
        ['Discard them', () => { dropDraft(); say('') }]
      ])
    }
    // The draft comes back as an edit based on the version it was made from, so if the file changed since then,
    // Save gets 412 and says so instead of overwriting.
    function restoreDraft (draft) {
      if (!editing) setEditing(true)
      draftBase = etag
      if (draft.etag) etag = draft.etag
      area.value = draft.text
      numberLines()
      markDirty()
      say('Your earlier changes are back. Save writes them; Cancel drops them.', 'info')
      area.focus()
    }

    // Leaving the page with unsaved text: the browser's own leave warning, while the pane is on the page.
    function beforeUnload (event) {
      if (!root.isConnected) { globalThis.removeEventListener('beforeunload', beforeUnload); return }
      if (dirty()) { event.preventDefault(); event.returnValue = '' }
    }

    function setEditing (on) {
      editing = on
      area.readOnly = !on
      frame.classList.toggle('src-editing', on)
      editButton.hidden = on
      saveButton.hidden = cancelButton.hidden = !on
      keysNote.hidden = !on
      if (on) globalThis.addEventListener('beforeunload', beforeUnload)
      else globalThis.removeEventListener('beforeunload', beforeUnload)
      markDirty()
    }

    function startEdit () {
      forced = false
      setEditing(true)
      say(etag || lastModified
        ? 'Editing. Save writes the whole file back to the pod; Cancel puts it back as it was.'
        : ['Editing. Save writes the whole file back to the pod; Cancel puts it back as it was.',
            'This server gives no version for the file, so if someone else changes it while you edit, Save will replace their change.'], 'info')
      area.focus()
    }

    function cancel () {
      if (draftBase) { etag = draftBase; draftBase = null }
      area.value = original
      numberLines()
      setEditing(false)
      say('')
    }

    let escaped = false
    function keys (event) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === 's' || event.key === 'S')) {
        event.preventDefault()
        if (editing) save(false)
        return
      }
      if (!editing) return
      if (event.key === 'Escape') { escaped = true; return }
      if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (escaped) { escaped = false; return } // let focus move on
        event.preventDefault()
        area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end')
        area.dispatchEvent(new Event('input', { bubbles: true }))
        return
      }
      escaped = false
    }

    async function copy () {
      const text = area.value
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // No clipboard permission: select the text and use the older command.
        const { readOnly } = area
        area.focus(); area.select()
        let ok = false
        try { ok = dom.execCommand('copy') } catch { ok = false }
        area.readOnly = readOnly
        area.setSelectionRange(0, 0)
        if (!ok) { say('Could not copy: the browser did not allow it. Select the text and copy it by hand.', 'bad'); return }
      }
      say('Copied ' + (text.length === 1 ? '1 character' : text.length.toLocaleString() + ' characters') + '.', 'good')
    }

    function lock (on) {
      busy = on
      for (const b of [saveButton, cancelButton, copyButton]) if (b) b.disabled = on
    }

    async function save (anyway) {
      if (!editing || busy) return
      if (anyway) forced = true
      const text = area.value
      const kind = kindOf(contentType)
      if (kind && !forced) {
        const problem = await check(text, kind, uri)
        if (problem) {
          const where = problem.line ? 'Line ' + problem.line + ': ' : ''
          say(['This does not read as ' + bare(contentType) + ', so it was not saved.', where + problem.message],
            'bad', [['Save anyway', () => save(true)]])
          return
        }
      }
      lock(true)
      say('Saving…', 'info')
      let response
      try {
        const headers = { 'Content-Type': contentType || 'text/plain' }
        if (etag) headers['If-Match'] = etag
        else if (lastModified) headers['If-Unmodified-Since'] = lastModified // no version tag: the date is the next best guard
        response = await webFetch(store)(uri, { method: 'PUT', headers, body: text, cache: 'no-store', credentials: 'include' })
      } catch (error) {
        lock(false)
        say('Not saved: ' + (error && error.message ? error.message : error) + '. Your text is still here.', 'bad')
        return
      }
      if (response.status === 412) {
        lock(false)
        say(['Not saved: the file changed on the server since you opened it. Your text is still here; Copy keeps it safe.',
          'Load the server\'s version to see what is there now (your text is replaced).'], 'bad',
        [['Load the server\'s version', loadServerVersion]])
        return
      }
      if (!response.ok) {
        lock(false)
        const why = { 401: 'you need to log in again', 403: 'you may not write to this file', 415: 'the server does not accept this kind of file' }[response.status]
        say('Not saved: the server answered ' + response.status + (why ? ' (' + why + ')' : '') + '. Your text is still here.', 'bad')
        return
      }
      await afterSave(text, kind)
      lock(false)
    }

    // Read the file back, show what the server now holds, and tell the store.
    async function afterSave (sent, kind) {
      draftBase = null
      let back = null
      try {
        const again = await read()
        if (again.ok) { back = await again.text(); etag = again.headers.get('etag') || etag; lastModified = again.headers.get('last-modified') || lastModified; contentType = again.headers.get('content-type') || contentType; lastModifiedSent = !!again.headers.get('last-modified'); modified = again.headers.get('last-modified') || modified; showWhen() }
      } catch { back = null }
      if (!lastModifiedSent) { modified = new Date().toUTCString(); showWhen() } // just saved, and no header says when: now, by this clock
      if (back === null) {
        original = sent
        setEditing(false)
        say('Saved, but the file could not be read back to check it.', 'good')
      } else {
        original = back
        area.value = back
        numberLines()
        describe(new TextEncoder().encode(back).length)
        setEditing(false)
        if (back === sent) say('Saved.', 'good')
        else {
          let same = null
          if (kind && kind !== 'json') {
            try { same = (await triples(sent, kind, uri)) === (await triples(back, kindOf(contentType) || kind, uri)) } catch { same = null }
          } else if (kind === 'json') {
            try { same = JSON.stringify(JSON.parse(sent)) === JSON.stringify(JSON.parse(back)) } catch { same = null }
          }
          if (same === true) say('Saved. The server keeps this file in its own layout, so what you see now is its copy: the same data, but your comments, spacing and order are not kept.', 'good')
          else if (same === false) say('Saved, but what the server now holds is not what you sent. What you see is the server\'s copy.', 'bad')
          else say('Saved. The server\'s copy, shown now, is laid out differently from what you sent.', 'good')
        }
      }
      // Other panes read the document from the store: put the server's copy there.
      await renewStore(back === null ? sent : back)
    }

    // The store forgets its old copy of the document (so the next load reads it afresh) and, for RDF,
    // takes in the server's copy now. A forced fetcher.load would do the same, but the data browser
    // answers a finished load of the page's own document by drawing its default view again, which
    // would throw the person out of this one.
    async function renewStore (text) {
      const fetcher = store.fetcher
      try {
        if (fetcher && fetcher.unload) fetcher.unload(doc)
        else store.removeDocument(doc)
      } catch { /* nothing held */ }
      const kind = kindOf(contentType)
      const $rdf = globalThis.$rdf
      if (!kind || kind === 'json' || !$rdf || !$rdf.parse) return // plain JSON is not RDF: its keys would become junk triples
      const type = { turtle: 'text/turtle', n3: 'text/n3', jsonld: 'application/ld+json' }[kind]
      try {
        await new Promise((resolve) => {
          if (type === 'application/ld+json') $rdf.parse(text, store, uri, type, () => resolve())
          else { $rdf.parse(text, store, uri, type); resolve() }
        })
      } catch { /* the store simply reads it on the next load */ }
    }

    async function loadServerVersion () {
      lock(true)
      try {
        const response = await read()
        if (!response.ok) { say('The server\'s version could not be read (' + response.status + ').', 'bad'); return }
        const text = await response.text()
        etag = response.headers.get('etag')
        draftBase = null
        lastModified = response.headers.get('last-modified') || ''
        contentType = response.headers.get('content-type') || contentType
        modified = response.headers.get('last-modified') || modified
        showWhen()
        original = text
        area.value = text
        numberLines()
        describe(new TextEncoder().encode(text).length)
        markDirty()
        say('This is the server\'s version now. Edit it and save, or Cancel.', 'info')
      } catch (error) {
        say('The server\'s version could not be read: ' + (error && error.message ? error.message : error), 'bad')
      } finally { lock(false) }
    }

    load()
    return root
  }
}

export default pane
