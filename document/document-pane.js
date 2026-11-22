// document-pane.js: show a human-readable file in a pod as itself. Read-only.
//
// One file, no imports. It shows:
//   HTML (text/html, .html, .htm)      in a sandboxed frame, with no scripts at all
//   plain text (text/plain, .txt, .log) as text
//   CSV (text/csv, .csv)               as a table (the first rows) or as text
//   PDF (application/pdf, .pdf)        in the browser's own PDF viewer, from a copy in memory
//   SVG (image/svg+xml, .svg)          as a picture only, never as part of the page
// Anything else, Markdown and RDF included, is left to other panes.
//
// A file in a pod can be hostile, and this pane runs with the person's session. So:
// - HTML goes into <iframe sandbox="" srcdoc="…">: no scripts, no forms, no pop-ups, no plugins,
//   and an origin of its own, so it cannot reach this page, its storage or its session. A
//   Content-Security-Policy that forbids scripts is put at the top of the document too, with a
//   <base href> for the file's own address so its relative pictures and links resolve.
// - An SVG is shown only through <img src="blob:…">, where an SVG cannot run script. The blob
//   address is dropped as soon as the picture has loaded, so it cannot be opened as a page.
// - Text and CSV cells are set with textContent. Nothing from the file is ever parsed as HTML here.
//
// What it writes: nothing.

const LIMIT = 5 * 1024 * 1024 // larger files are offered as a link, not shown
const CSV_ROWS = 500 // the table shows this many rows at most
const CSV_COLUMNS = 50 // and this many columns
const CSV_CELLS = 20000 // and this many cells in all (rows are cut to fit); the text view has everything
const STOPS = 5 // a page that keeps trying to move its frame is not shown again after this many tries
const MEDIA = 'http://www.w3.org/ns/iana/media-types/'

const CSS = `
/* suite:design begin --prefix doc --only icon,buttons,toast,details */
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
.doc-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.doc-root *, .doc-root *::before, .doc-root *::after { box-sizing: border-box }
.doc-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.doc-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.doc-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.doc-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.doc-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.doc-root [hidden] { display: none !important }
.doc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.doc-muted { color: var(--sui-text-muted) }
.doc-small { font-size: var(--sui-text-sm) }
.doc-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.doc-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.doc-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.doc-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.doc-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.doc-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --doc-i set to url("data:image/svg+xml,...") ---------------------------------- */
.doc-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--doc-i) center / contain no-repeat; mask: var(--doc-i) center / contain no-repeat }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.doc-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.doc-btn:hover { background: var(--sui-primary-light-hover) }
.doc-btn:disabled, .doc-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.doc-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.doc-btn-primary:hover { background: var(--sui-primary-element-hover) }
.doc-btn-tertiary { background: transparent; color: var(--sui-text) }
.doc-btn-tertiary:hover { background: var(--sui-bg-hover) }
.doc-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.doc-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.doc-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.doc-btn-icon:hover { background: var(--sui-bg-hover) }
.doc-btn-wide { width: 100%; justify-content: flex-start }
.doc-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.doc-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.doc-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.doc-toast-error { border-left-color: var(--sui-error) }
.doc-toast-success { border-left-color: var(--sui-success) }
.doc-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.doc-status-error { color: var(--sui-error) }
.doc-status-success { color: var(--sui-success) }
.doc-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.doc-note-error { background: var(--sui-error-light) }
.doc-note-warning { background: var(--sui-warning-light) }
.doc-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.doc-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.doc-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.doc-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.doc-details-figure .doc-icon { width: 36px; height: 36px }
.doc-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.doc-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.doc-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.doc-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.doc-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.doc-tab:hover { color: var(--sui-text) }
.doc-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.doc-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.doc-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.doc-props dt { color: var(--sui-text-muted) }
.doc-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.doc.document-lab-pane { max-width: calc(var(--sui-content-max) * 3 / 4); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8) }
.doc-root p { max-width: none }
.doc-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-1) var(--sui-space-3); min-height: var(--sui-target); margin: 0 0 var(--sui-space-3) }
.doc-titles { flex: 1 1 240px; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--sui-space-3) }
.doc-name { margin: 0; min-width: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.doc-meta { color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.doc-links { flex: none; display: flex; gap: var(--sui-space-1); margin-left: auto }
.doc-links .doc-btn-icon { color: var(--sui-text-muted) }
.doc-links .doc-btn-icon:hover { color: var(--sui-text) }
.doc-note { display: block; margin: 0 0 var(--sui-space-3); font-size: var(--sui-text-sm) }
.doc-note.doc-count { display: block; padding: 0; background: none; color: var(--sui-text-muted) }
.doc-state { margin: 0 0 var(--sui-space-3); padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-bg-app); color: var(--sui-text-muted) }
.doc-state.doc-bad { background: var(--sui-error-light); color: var(--sui-error) }
.doc-state:empty { display: none }
.doc-frame { display: block; width: 100%; height: 72vh; min-height: 360px; border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg) }
.doc-pdf { display: block; width: 100%; height: 80vh; min-height: 420px; border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg-app) }
.doc-pdf .doc-state { margin: var(--sui-space-3) }
.doc-text { margin: 0; padding: var(--sui-space-4) var(--sui-space-5); max-height: 75vh; overflow: auto; background: var(--sui-bg-app); border-radius: var(--sui-radius-lg); color: var(--sui-text); font-family: var(--sui-font-mono); font-size: var(--sui-text-sm); line-height: var(--sui-line); white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4 }
.doc-tabs { margin: 0 0 var(--sui-space-3); padding: 0 }
.doc-tablewrap { max-height: 75vh; overflow: auto; border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg) }
.doc-table { border-collapse: collapse; min-width: 100%; font-size: var(--sui-text-sm) }
.doc-table th, .doc-table td { padding: var(--sui-space-2) var(--sui-space-3); border-bottom: 1px solid var(--sui-border); text-align: left; vertical-align: top; white-space: pre-wrap; max-width: 28em; overflow-wrap: break-word }
.doc-table th { position: sticky; top: 0; background: var(--sui-bg-app); font-weight: var(--sui-weight-bold) }
.doc-table tr:last-child td { border-bottom: 0 }
.doc-table tbody tr:hover { background: var(--sui-bg-hover) }
.doc-picture { display: block; max-width: 100%; height: auto; margin: 0 auto; padding: var(--sui-space-3); background: var(--sui-bg); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg) }
`

// Icons: Material Design Icons (Apache 2.0), paths in a 24 x 24 box.
const MDI = {
  document: 'M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z',
  openNew: 'M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z',
  download: 'M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path${fill ? ` fill="${fill}"` : ''} d="${d}"/></svg>`)
const ICON = svg(MDI.document, '#0082c9')

// Content types this pane shows, and what it calls each.
const TYPES = {
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'text/plain': 'text',
  'text/csv': 'csv',
  'application/pdf': 'pdf',
  'image/svg+xml': 'svg'
}
const EXTENSIONS = { html: 'html', htm: 'html', xhtml: 'html', txt: 'text', log: 'text', text: 'text', csv: 'csv', pdf: 'pdf', svg: 'svg' }
const NAMES = { html: 'HTML page', text: 'Text', csv: 'CSV', pdf: 'PDF', svg: 'SVG picture' }
// A server that does not know a type says one of these: then the file name decides.
const VAGUE = ['', 'application/octet-stream', 'binary/octet-stream', 'application/unknown']
// Never claimed, whatever the server says: Markdown has its own pane, and RDF is data, not a document.
const NOT_MINE = /\.(md|markdown|ttl|n3|nt|nq|trig|jsonld|rdf|owl|acl|meta)$/i

const mediaType = (value) => String(value || '').split(';', 1)[0].trim().toLowerCase()
const extension = (uri) => { try { const m = /\.([a-z0-9]+)$/i.exec(new URL(uri).pathname); return m ? m[1].toLowerCase() : '' } catch { return '' } }

// Content type first, file name second. Returns html, text, csv, pdf, svg or null.
function kindOf (uri, type) {
  if (!uri || /\/$/.test(uri.split('#')[0].split('?')[0])) return null // a folder
  let path = ''
  try { path = new URL(uri).pathname } catch { return null }
  if (NOT_MINE.test(path)) return null
  const t = mediaType(type)
  if (!VAGUE.includes(t)) return TYPES[t] || null
  return EXTENSIONS[extension(uri)] || null
}

// What the store already knows of the document's type: the header of the load the browser did
// before showing it, or the type a folder listing gave it.
function knownType (store, subject) {
  if (!store || !subject || !subject.uri) return ''
  const doc = subject.doc ? subject.doc() : subject
  try {
    const headers = store.fetcher && store.fetcher.getHeader && store.fetcher.getHeader(doc, 'content-type')
    if (headers && headers.length) return headers[0]
  } catch { /* not fetched */ }
  try {
    for (const t of Object.keys(store.findTypeURIs(doc) || {})) {
      if (t.startsWith(MEDIA) && t.endsWith('#Resource')) return t.slice(MEDIA.length, -'#Resource'.length)
    }
  } catch { /* no types */ }
  return ''
}

const subjectKind = (store, subject) => (subject && subject.uri ? kindOf(subject.doc().uri, knownType(store, subject)) : null)

function el (dom, tag, className, text) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = text
  return node
}

function icon (dom, path) {
  const span = el(dom, 'span', 'doc-icon')
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--doc-i', `url("${svg(path)}")`)
  return span
}

// An action in the header: an icon button, its name for screen readers and as a tooltip.
function link (dom, href, text, extra = {}, path = MDI.openNew) {
  const a = el(dom, 'a', 'doc-btn doc-btn-icon')
  a.appendChild(icon(dom, path))
  a.appendChild(el(dom, 'span', 'doc-sr', text))
  a.title = text
  let ok = false
  try { ok = ['http:', 'https:', 'blob:'].includes(new URL(href).protocol) } catch { /* not an address */ }
  if (ok) a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  for (const [k, v] of Object.entries(extra)) a.setAttribute(k, v)
  return a
}

function size (bytes) {
  if (bytes < 1024) return bytes + ' bytes'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

const attr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The HTML the frame is given: the file, with a policy and a base address put first.
// The first <base href> in a document is the one that counts, and every policy in it applies,
// so nothing later in the file can loosen these.
function framed (html, address) {
  const policy = "default-src 'none'; script-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; connect-src 'none'; form-action 'none'; " +
    'img-src * data:; media-src * data:; style-src * \'unsafe-inline\'; font-src * data:'
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${attr(policy)}"><base href="${attr(address)}" target="_blank">`
  const doctype = /^﻿?\s*<!doctype[^>]*>/i.exec(html)
  return doctype ? doctype[0] + head + html.slice(doctype[0].length) : head + html
}

// RFC 4180, loosely: commas, double-quoted fields, "" inside quotes, CRLF or LF.
function parseCsv (text, max) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let total = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === ',') { row.push(field); field = '' } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      total++
      if (rows.length < max) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); total++; if (rows.length < max) rows.push(row) }
  return { rows, total }
}

// Read a response body, giving up past the limit. Returns bytes, or null if it was too large.
async function readCapped (response, limit) {
  if (!response.body || !response.body.getReader) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    return buffer.length > limit ? null : buffer
  }
  const reader = response.body.getReader()
  const parts = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > limit) { reader.cancel().catch(() => {}); return null }
    parts.push(value)
  }
  const all = new Uint8Array(length)
  let at = 0
  for (const part of parts) { all.set(part, at); at += part.length }
  return all
}

function decode (bytes, type) {
  const charset = /charset=([^;]+)/i.exec(type || '')
  try { return new TextDecoder(charset ? charset[1].trim().replace(/"/g, '') : 'utf-8').decode(bytes) } catch { return new TextDecoder('utf-8').decode(bytes) }
}

const pane = {
  name: 'document-lab',
  icon: ICON,
  audience: [],

  label (subject, context) {
    const store = (context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store)
    return subjectKind(store, subject) ? 'View' : null
  },

  // Open first for pages, text and PDFs; a picture is left to the picture panes.
  shouldGetFocus (subject) {
    const store = globalThis.SolidLogic && globalThis.SolidLogic.store
    return ['html', 'text', 'csv', 'pdf'].includes(subjectKind(store, subject))
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const address = subject.doc().uri
    const fetcher = (store.fetcher && store.fetcher._fetch) || fetch.bind(globalThis)
    const root = el(dom, 'div', 'doc document-lab-pane doc-root')
    root.appendChild(el(dom, 'style', '', CSS))

    const head = root.appendChild(el(dom, 'div', 'doc-head'))
    const name = nameOf(address)
    const titles = head.appendChild(el(dom, 'div', 'doc-titles'))
    titles.appendChild(el(dom, 'h2', 'doc-name', name))
    const meta = titles.appendChild(el(dom, 'span', 'doc-meta'))
    const links = head.appendChild(el(dom, 'span', 'doc-links'))
    const opener = links.appendChild(link(dom, address, 'Open in a new tab'))
    const download = () => links.appendChild(link(dom, address, 'Download', { download: name }, MDI.download))
    const note = root.appendChild(el(dom, 'p', 'doc-note'))
    note.hidden = true
    const state = root.appendChild(el(dom, 'div', 'doc-state', 'Loading…'))
    state.setAttribute('role', 'status')
    const body = root.appendChild(el(dom, 'div', 'doc-body'))

    // What the shell's details column shows (file info): filled in as the file is read.
    const shared = context.suite ? context.suite.state : {}
    const info = shared.info = { name, address, kind: '', type: '', size: null, lines: null, rows: null, problem: '' }

    // Blob addresses made here are dropped when the pane leaves the page.
    const blobs = []
    const drop = (url) => { try { URL.revokeObjectURL(url) } catch { /* gone */ } }
    const watch = new MutationObserver(() => {
      if (root.isConnected) { root.dataset.shown = '1'; return }
      if (!root.dataset.shown) return
      blobs.splice(0).forEach(drop)
      watch.disconnect()
    })
    watch.observe(dom.documentElement || dom, { childList: true, subtree: true })
    const blobFor = (bytes, type) => { const url = URL.createObjectURL(new Blob([bytes], { type })); blobs.push(url); return url }

    const changed = () => { if (shared.redraw) shared.redraw() }
    const fail = (text) => { state.textContent = text; state.classList.add('doc-bad'); info.problem = text; changed() }
    const sameSite = (() => { try { return new URL(address).origin === dom.location.origin } catch { return false } })()

    async function show () {
      let response
      try {
        response = await fetcher(address, { headers: { Accept: 'text/html, text/plain, text/csv, application/pdf, image/svg+xml, */*;q=0.1' } })
      } catch (error) {
        return fail('The file could not be read: ' + (error && error.message ? error.message : 'no answer from the server') + '.')
      }
      if (response.status === 401) return fail('This file is private. Log in to see it, if it has been shared with you.')
      if (response.status === 403) return fail('You are not allowed to see this file.')
      if (response.status === 404 || response.status === 410) return fail('There is no file at this address.')
      if (!response.ok) return fail('The file could not be read (the server said ' + response.status + ').')

      const type = response.headers.get('content-type') || ''
      const kind = kindOf(address, type)
      if (!kind) return fail('This pane does not show files of this type' + (mediaType(type) ? ' (' + mediaType(type) + ')' : '') + '. Use the button above to open it.')
      meta.textContent = NAMES[kind]
      Object.assign(info, { kind, type: mediaType(type) })
      // HTML and SVG can hold scripts. Opened on their own from a pod on this site, those scripts would run here,
      // with the person's session: so for them the raw file is offered only as a download.
      const active = (kind === 'html' || kind === 'svg') && sameSite
      if (active) { opener.remove(); info.active = true; download() }

      const declared = +response.headers.get('content-length')
      const tooBig = () => {
        meta.textContent = NAMES[kind] + ' · ' + (declared > LIMIT ? size(declared) : 'over ' + size(LIMIT))
        info.size = declared > LIMIT ? declared : null
        fail('This file is larger than ' + size(LIMIT) + ', too large to show here. Open it in a new tab or download it with the buttons above.')
        if (!active) download()
      }
      if (declared > LIMIT) { if (response.body && response.body.cancel) response.body.cancel().catch(() => {}); return tooBig() }
      let bytes
      try { bytes = await readCapped(response, LIMIT) } catch { return fail('The file could not be read to the end.') }
      if (!bytes) return tooBig()
      meta.textContent = NAMES[kind] + ' · ' + size(bytes.length)
      info.size = bytes.length
      state.textContent = ''
      changed()

      if (kind === 'html') {
        const html = framed(decode(bytes, type), address)
        // Links inside do not open. A plain link targets a new window (the <base> says so), which the sandbox
        // refuses. A link that names its own frame (target="_self") can still move the frame: when the frame
        // loads anything after the page itself, it is put back, and the person is told.
        let stops = 0
        const stopped = el(dom, 'span', 'doc-stopped')
        const makeFrame = () => {
          const frame = el(dom, 'iframe', 'doc-frame')
          frame.setAttribute('sandbox', '') // no scripts, no same origin, no forms, no pop-ups, no top navigation
          frame.setAttribute('referrerpolicy', 'no-referrer')
          frame.setAttribute('title', name)
          frame.srcdoc = html
          let first = true
          frame.addEventListener('load', () => {
            if (first) { first = false; return }
            stops++
            if (stops > STOPS) { frame.replaceWith(el(dom, 'div', 'doc-state doc-bad', 'This page keeps trying to open other pages, so it is no longer shown.')); return }
            stopped.textContent = ' A link inside tried to open another page in its place; it was stopped.'
            frame.replaceWith(makeFrame())
          })
          return frame
        }
        note.textContent = 'Shown without scripts. Links inside do not open; pictures from other sites are loaded.'
        if (sameSite) {
          note.classList.add('doc-note-warning')
          // The pod and this page share a site: opened on its own, the file's scripts would run here.
          note.appendChild(el(dom, 'span', 'doc-warn', ' This pod serves files on this site, where the page\'s scripts would run, so it is not opened on its own here: use Download.'))
        } else note.appendChild(dom.createTextNode(' To see it as its author meant, use “Open in a new tab”.'))
        note.appendChild(stopped)
        note.hidden = false
        body.appendChild(makeFrame())
      } else if (kind === 'text' || kind === 'csv') {
        const text = decode(bytes, type)
        const lines = text ? text.split(/\r\n|\r|\n/).length - (/(\r\n|\r|\n)$/.test(text) ? 1 : 0) : 0
        meta.textContent += ' · ' + lines + (lines === 1 ? ' line' : ' lines')
        info.lines = lines
        changed()
        const pre = el(dom, 'pre', 'doc-text', text)
        if (kind === 'text') { body.appendChild(pre); return }
        const { rows, total } = parseCsv(text, CSV_ROWS + 1)
        const tabs = body.appendChild(el(dom, 'div', 'doc-tabs'))
        tabs.setAttribute('role', 'tablist')
        tabs.setAttribute('aria-label', 'Show as')
        const asTable = tabs.appendChild(el(dom, 'button', 'doc-tab', 'Table'))
        const asText = tabs.appendChild(el(dom, 'button', 'doc-tab', 'Text'))
        asTable.type = asText.type = 'button'
        asTable.setAttribute('role', 'tab'); asText.setAttribute('role', 'tab')
        const wrap = el(dom, 'div', 'doc-tablewrap')
        const table = wrap.appendChild(el(dom, 'table', 'doc-table'))
        const [header, ...rest] = rows
        const full = rows.reduce((n, r) => Math.max(n, r.length), 0)
        const width = Math.min(full, CSV_COLUMNS)
        const fit = Math.min(CSV_ROWS, Math.floor(CSV_CELLS / Math.max(1, width)))
        const shown = rest.slice(0, fit)
        if (header) {
          const tr = table.appendChild(el(dom, 'thead')).appendChild(el(dom, 'tr'))
          for (let i = 0; i < width; i++) tr.appendChild(el(dom, 'th', '', header[i] || ''))
        }
        const tbody = table.appendChild(el(dom, 'tbody'))
        for (const r of shown) {
          const tr = tbody.appendChild(el(dom, 'tr'))
          for (let i = 0; i < width; i++) tr.appendChild(el(dom, 'td', '', r[i] === undefined ? '' : r[i]))
        }
        const records = Math.max(0, total - 1)
        info.rows = records
        changed()
        const parts = []
        if (records > shown.length) parts.push('Showing the first ' + shown.length + ' of ' + records + ' rows')
        if (full > width) parts.push((parts.length ? 'and the first ' : 'Showing the first ') + width + ' of ' + full + ' columns')
        const capped = el(dom, 'p', 'doc-note doc-count', parts.length ? parts.join(' ') + '. The text view has them all.' : records + (records === 1 ? ' row' : ' rows') + ' under the header.')
        const pick = (table) => {
          asTable.setAttribute('aria-selected', String(table)); asText.setAttribute('aria-selected', String(!table))
          wrap.hidden = capped.hidden = !table; pre.hidden = table
        }
        asTable.addEventListener('click', () => pick(true))
        asText.addEventListener('click', () => pick(false))
        body.append(capped, wrap, pre)
        pick(true)
      } else if (kind === 'pdf') {
        download()
        if (dom.defaultView && dom.defaultView.navigator && dom.defaultView.navigator.pdfViewerEnabled === false) {
          state.textContent = 'This browser does not show PDFs in the page. Open it in a new tab or download it.'
          return
        }
        const object = el(dom, 'object', 'doc-pdf')
        object.type = 'application/pdf'
        object.data = blobFor(bytes, 'application/pdf')
        object.setAttribute('aria-label', name)
        object.appendChild(el(dom, 'div', 'doc-state', 'This browser cannot show the PDF here. Open it in a new tab or download it with the buttons above.'))
        body.appendChild(object)
      } else if (kind === 'svg') {
        if (sameSite) {
          note.textContent = 'Shown as a picture only, without its scripts. This pod serves files on this site, where an SVG\'s scripts would run, so it is not opened on its own here: use Download.'
          note.classList.add('doc-note-warning')
          note.hidden = false
        }
        const img = el(dom, 'img', 'doc-picture')
        img.alt = name
        const url = blobFor(bytes, 'image/svg+xml')
        // Once drawn, the picture no longer needs its address, and an SVG opened by its blob
        // address would be a page on this site. Drop it.
        img.addEventListener('load', () => { drop(url); blobs.splice(blobs.indexOf(url), 1) }, { once: true })
        img.addEventListener('error', () => fail('The picture could not be drawn.'), { once: true })
        img.src = url
        body.appendChild(img)
      }
    }

    shared.loaded = show().catch(error => fail('Something went wrong showing the file: ' + (error && error.message ? error.message : error)))
    return root
  },

  // In the suite shell, the (i) button: what the file is. Drawn from what render has read so far, and drawn
  // again as it learns more. Alone in the data browser the header line says the same, more briefly.
  renderDetails (node, context) {
    const dom = context.dom
    const shared = context.suite ? context.suite.state : {}
    const info = shared.info || { name: nameOf(node.doc().uri), address: node.doc().uri }
    const box = el(dom, 'div', 'doc-details-wrap')
    const head = box.appendChild(el(dom, 'div', 'doc-details-head'))
    head.appendChild(el(dom, 'span', 'doc-details-figure')).appendChild(icon(dom, MDI.document))
    const titles = head.appendChild(el(dom, 'div', 'doc-details-titles'))
    titles.appendChild(el(dom, 'h2', 'doc-details-title', info.name))
    const sub = titles.appendChild(el(dom, 'p', 'doc-details-sub'))
    const body = box.appendChild(el(dom, 'div', 'doc-details-body'))
    const props = body.appendChild(el(dom, 'dl', 'doc-props'))
    const draw = () => {
      sub.textContent = info.kind ? NAMES[info.kind] : info.problem ? 'Not shown' : 'Loading…'
      props.replaceChildren()
      const add = (k, v) => { if (v === '' || v === null || v === undefined) return; props.appendChild(el(dom, 'dt', '', k)); props.appendChild(typeof v === 'string' ? el(dom, 'dd', '', v) : el(dom, 'dd')).append(...(typeof v === 'string' ? [] : [v])) }
      add('Kind', info.kind ? NAMES[info.kind] : '')
      add('Content type', info.type)
      add('Size', info.size !== null && info.size !== undefined ? size(info.size) : '')
      add('Lines', info.lines !== null && info.lines !== undefined ? String(info.lines) : '')
      add('Rows', info.rows !== null && info.rows !== undefined ? info.rows + ' under the header' : '')
      add('Shown', info.kind === 'html' ? 'Without scripts, in a sandbox' : info.kind === 'svg' ? 'As a picture only' : '')
      if (info.active) add('Address', info.address) // not a link: opened here, its scripts would run on this site
      else {
        const a = link(dom, info.address, 'Open in a new tab')
        a.className = ''
        a.replaceChildren(info.address)
        add('Address', a)
      }
      add('Problem', info.problem)
    }
    draw()
    shared.redraw = () => { if (box.isConnected) draw() }
    return box
  }
}

// The file's own name, from its address.
function nameOf (address) {
  try { return decodeURIComponent(new URL(address).pathname.split('/').pop()) || address } catch { return address }
}

export default pane
