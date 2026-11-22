// notes-pane.js — a reader for Markdown notes.
// Applies to .md documents. Shows the note as a clean page, with previous / next through the
// other notes in the same folder. It imports nothing; the Markdown is turned into DOM nodes
// one by one (never innerHTML), so a note cannot inject script into the page. Read-only.
// Inside the suite shell (context.suite) it also gives the shell's left column: the folder's notes
// (renderNavigation). Styled with the suite's design sheet (design/, the block between the markers).
// Icons: Material Design Icons (Apache 2.0). AGPL-3.0-or-later. Copyright (c) 2026 Melvin Carvalho.
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const IS_NOTE = /\.(md|markdown)$/i
const DATED = /(\d{4})[ _-]?(\d{2})[ _-]?(\d{2})/
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// MDI paths (Material Design Icons, Apache 2.0) in a 24 x 24 box: note (file-document), chevrons, folder.
const MDI = {
  note: 'M14,10H19.5L14,4.5V10M5,3H15L21,9V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3M5,12V14H19V12H5M5,16V18H14V16H5Z',
  prev: 'M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z',
  next: 'M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z',
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${fill ? ` fill="${fill}"` : ''}><path d="${d}"/></svg>`)
const ICON = svg(MDI.note, '#0082c9')

const CSS = `
/* suite:design begin --prefix note --only icon,nav,buttons */
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
.note-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.note-root *, .note-root *::before, .note-root *::after { box-sizing: border-box }
.note-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.note-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.note-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.note-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.note-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.note-root [hidden] { display: none !important }
.note-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.note-muted { color: var(--sui-text-muted) }
.note-small { font-size: var(--sui-text-sm) }
.note-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.note-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.note-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.note-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.note-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.note-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --note-i set to url("data:image/svg+xml,...") ---------------------------------- */
.note-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--note-i) center / contain no-repeat; mask: var(--note-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.note-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.note-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.note-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.note-nav-item:hover { background: var(--sui-bg-hover) }
.note-nav-item[aria-current="page"], .note-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.note-nav-item .note-icon { color: var(--sui-text-muted) }
.note-nav-item[aria-current] .note-icon { color: inherit }
.note-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.note-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.note-nav-new { margin-bottom: var(--sui-space-2) }
.note-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.note-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.note-btn:hover { background: var(--sui-primary-light-hover) }
.note-btn:disabled, .note-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.note-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.note-btn-primary:hover { background: var(--sui-primary-element-hover) }
.note-btn-tertiary { background: transparent; color: var(--sui-text) }
.note-btn-tertiary:hover { background: var(--sui-bg-hover) }
.note-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.note-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.note-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.note-btn-icon:hover { background: var(--sui-bg-hover) }
.note-btn-wide { width: 100%; justify-content: flex-start }
.note-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* suite:design end */
.note.notes-reader-pane { max-width: var(--sui-reading-width); margin: 0 auto; padding: var(--sui-space-6) var(--sui-space-6) var(--sui-space-12) }
.note-pager { display: flex; align-items: center; gap: var(--sui-space-2); margin: 0 0 var(--sui-space-6) }
.note-pager .note-btn { min-width: 0; flex: 0 1 auto }
.note-pager .note-btn > span:not(.note-icon) { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.note-pager .note-gap { flex: 1 1 0 }
.note-pager .note-off { visibility: hidden }
.note-date { margin: 0 0 var(--sui-space-1); color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.note-body { overflow-wrap: anywhere }
.note-body h1 { margin: 0 0 var(--sui-space-5); font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.note-body h2 { margin: var(--sui-space-8) 0 var(--sui-space-2); font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.note-body h3 { margin: var(--sui-space-6) 0 var(--sui-space-2); font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.note-body h4, .note-body h5, .note-body h6 { margin: var(--sui-space-5) 0 var(--sui-space-1); font-size: var(--sui-text-md); font-weight: var(--sui-weight-bold) }
.note-body p { margin: 0 0 var(--sui-space-3) }
.note-body strong { font-size: inherit; font-weight: var(--sui-weight-bold) }
.note-body em { font-size: inherit }
.note-body ul, .note-body ol { margin: 0 0 var(--sui-space-3); padding-left: var(--sui-space-6) }
.note-body li { margin: var(--sui-space-1) 0 }
.note-body li.note-task { list-style: none; margin-left: calc(-1 * var(--sui-space-6)) }
.note-body li.note-task input { margin: 0 var(--sui-space-2) 0 0; accent-color: var(--sui-primary-element) }
.note-body li.note-done { color: var(--sui-text-muted); text-decoration: line-through }
.note-body blockquote { margin: 0 0 var(--sui-space-3); padding: var(--sui-space-1) var(--sui-space-4); border-left: var(--sui-space-1) solid var(--sui-primary-light); color: var(--sui-text-muted) }
.note-body code { padding: 2px var(--sui-space-1); border-radius: var(--sui-radius-sm); background: var(--sui-bg-app); font-family: var(--sui-font-mono); font-size: var(--sui-text-sm) }
.note-body pre { margin: 0 0 var(--sui-space-3); padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-bg-app); overflow-x: auto; overflow-wrap: normal }
.note-body pre code { padding: 0; background: none }
.note-body hr { margin: var(--sui-space-6) 0; border: 0; border-top: 1px solid var(--sui-border) }
.note-body table { display: block; max-width: 100%; overflow-x: auto; margin: 0 0 var(--sui-space-3); border-collapse: collapse; overflow-wrap: normal }
.note-body th, .note-body td { padding: var(--sui-space-2) var(--sui-space-4) var(--sui-space-2) 0; border-bottom: 1px solid var(--sui-border); text-align: left; vertical-align: top }
.note-body th { background: none; color: var(--sui-text-muted); font-weight: var(--sui-weight-bold) }
.note-body a.note-wiki.missing { color: var(--sui-text-muted); text-decoration: none; border-bottom: 1px dashed var(--sui-border-strong); cursor: help }
.note-msg { color: var(--sui-text-muted) }
.note-nav-item.note-nav-entry { min-height: 56px; padding-top: var(--sui-space-1); padding-bottom: var(--sui-space-1) }
.note-nav-text { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; line-height: 1.35 }
.note-nav-sub { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm); font-weight: var(--sui-weight) }
.note-nav-empty { margin: 0; padding: var(--sui-space-2) var(--sui-space-3); color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.note-body li.note-task > ul, .note-body li.note-task > ol { padding-left: calc(2 * var(--sui-space-6)) }
@media (max-width: 520px) {
  .note.notes-reader-pane { padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-12) }
  .note-pager .note-prev, .note-pager .note-next { width: var(--sui-target); padding: 0 }
  .note-pager .note-prev > span:not(.note-icon), .note-pager .note-next > span:not(.note-icon) { display: none }
}
`

// ---- Markdown to DOM -------------------------------------------------------------------------

// A Markdown link, decided by where it really goes once resolved against the note: http(s), mailto and tel only.
// The href stays as written; a link off the note's own site gets rel="noopener" (so //elsewhere/ does too).
function safeLink (raw, base) {
  if (raw.startsWith('#')) return { href: raw }
  let u
  try { u = new URL(raw, base || undefined) } catch (e) { return null }
  if (!/^(https?|mailto|tel):$/i.test(u.protocol)) return null
  let off = /^https?:$/i.test(u.protocol)
  try { if (off && base && u.origin === new URL(base).origin) off = false } catch (e) { /* keep off */ }
  return off ? { href: raw, rel: 'noopener' } : { href: raw }
}

// Inline: `code`, [text](url), **bold**, *italic* / _italic_, bare links, [[note]] and [[note|label]].
function inline (dom, parent, text, base) {
  const re = /(`[^`]+`)|\[([^\]]+)\]\(([^)\s]+)\)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b)|(https?:\/\/[^\s<>)]+)|\[\[([\w .\/-]+?)(?:\|([^\]]+))?\]\]/g
  let last = 0
  let m
  const add = (tag, content, attrs) => {
    const e = dom.createElement(tag)
    for (const k in attrs || {}) e.setAttribute(k, attrs[k])
    if (tag === 'code') e.textContent = content
    else inline(dom, e, content, base)
    parent.appendChild(e)
  }
  while ((m = re.exec(text))) {
    if (m.index > last) parent.appendChild(dom.createTextNode(text.slice(last, m.index)))
    if (m[1]) add('code', m[1].slice(1, -1))
    else if (m[2]) {
      const link = safeLink(m[3], base)
      if (link) add('a', m[2], link); else parent.appendChild(dom.createTextNode(m[2]))
    } else if (m[4]) add('strong', m[4].slice(2, -2))
    else if (m[5]) add('em', m[5].slice(1, -1))
    else if (m[6]) { const a = dom.createElement('a'); a.setAttribute('href', m[6]); a.setAttribute('rel', 'noopener'); a.textContent = m[6]; parent.appendChild(a) }
    else if (m[7]) {
      // [[note]]: a link to the note of that name beside this one; the pane resolves it once it has the folder listing
      const a = dom.createElement('a'); a.setAttribute('class', 'note-wiki'); a.setAttribute('data-wiki', m[7].trim())
      a.textContent = (m[8] || m[7]).trim(); parent.appendChild(a)
    }
    last = re.lastIndex
  }
  if (last < text.length) parent.appendChild(dom.createTextNode(text.slice(last)))
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

// Blocks: headings, fenced code, lists (nested, with task boxes), quotes, tables, rules, paragraphs.
// take: an object to receive the first top-level H1 (taken out as the title), or null. Quotes nest at most 20 deep.
function markdown (dom, text, take, base, depth = 0) {
  const out = dom.createDocumentFragment()
  const el = (tag, parent) => { const e = dom.createElement(tag); (parent || out).appendChild(e); return e }
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  let skipped = !take
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      const body = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      i++
      el('code', el('pre')).textContent = body.join('\n')
      continue
    }

    const h = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line)
    if (h) {
      i++
      if (h[1].length === 1 && !skipped) { skipped = true; take.title = h[2]; continue }
      inline(dom, el('h' + h[1].length), h[2], base)
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { el('hr'); i++; continue }

    if (/^\s*>/.test(line) && depth < 20) {
      const body = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      el('blockquote').appendChild(markdown(dom, body.join('\n'), null, base, depth + 1))
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const table = el('table')
      const head = el('tr', el('thead', table))
      for (const c of cells(line)) inline(dom, el('th', head), c, base)
      i += 2
      const body = el('tbody', table)
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const tr = el('tr', body)
        for (const c of cells(lines[i])) inline(dom, el('td', tr), c, base)
        i++
      }
      continue
    }

    if (LIST.test(line)) {
      // a stack of open lists, one per indent level
      const stack = []
      while (i < lines.length && (LIST.test(lines[i]) || (/^\s+\S/.test(lines[i]) && stack.length))) {
        const m = LIST.exec(lines[i])
        if (!m) { // a continuation line of the last item
          const li = stack[stack.length - 1].list.lastChild
          if (li) { li.appendChild(dom.createTextNode(' ')); inline(dom, li, lines[i].trim(), base) }
          i++
          continue
        }
        const indent = m[1].replace(/\t/g, '  ').length
        while (stack.length && indent < stack[stack.length - 1].indent) stack.pop()
        if (!stack.length || indent > stack[stack.length - 1].indent) {
          const tag = /\d/.test(m[2]) ? 'ol' : 'ul'
          const parent = stack.length ? stack[stack.length - 1].list.lastChild || stack[stack.length - 1].list : out
          stack.push({ indent, list: el(tag, parent) })
        }
        const li = el('li', stack[stack.length - 1].list)
        const task = /^\[([ xX])\]\s+(.*)$/.exec(m[3])
        if (task) {
          const done = task[1] !== ' '
          li.setAttribute('class', done ? 'note-task note-done' : 'note-task')
          const box = el('input', li)
          box.setAttribute('type', 'checkbox')
          box.setAttribute('disabled', '')
          if (done) box.setAttribute('checked', '')
          inline(dom, li, task[2], base)
        } else inline(dom, li, m[3], base)
        i++
      }
      continue
    }

    // a paragraph; a line ending in two spaces or a backslash is a line break
    const para = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|>|```|~~~)/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++])
    const p = el('p')
    para.forEach((raw, n) => {
      const hard = /( {2,}|\\)$/.test(raw)
      inline(dom, p, raw.replace(/\\$/, '').trim(), base)
      if (n < para.length - 1) p.appendChild(hard ? dom.createElement('br') : dom.createTextNode(' '))
    })
  }
  return out
}

// ---- The pane --------------------------------------------------------------------------------

const fileName = uri => decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1))
const folderOf = uri => uri.slice(0, uri.lastIndexOf('/') + 1)

function prettyDate (name) {
  const m = DATED.exec(name)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null
  return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1]
}

// The notes the folder's listing names, in file-name order (the order previous / next step through).
const notesIn = (store, folder) => [...new Set(store.each(folder, store.sym(LDP_CONTAINS)).map(n => n.value))]
  .filter(u => IS_NOTE.test(u)).sort()

// A note's name for the list: its file name without the extension and a leading date, dashes as spaces.
function listName (uri) {
  const name = fileName(uri).replace(IS_NOTE, '')
  const bare = name.replace(/^\d{4}[ _-]?\d{2}[ _-]?\d{2}[ _-]*/, '').replace(/[_-]+/g, ' ').trim()
  const text = bare || prettyDate(name) || name
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Under it: the date in its file name, else when the listing says it was last changed.
function listSub (store, uri) {
  const dated = prettyDate(fileName(uri))
  if (dated) return dated
  const mod = store.any(store.sym(uri), store.sym('http://purl.org/dc/terms/modified'))
  const d = mod ? new Date(mod.value) : null
  return d && !isNaN(d) ? 'Changed ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() : ''
}

function make (dom, tag, cls, text) {
  const e = dom.createElement(tag)
  if (cls) e.setAttribute('class', cls)
  if (text !== undefined) e.textContent = text
  return e
}
function icon (dom, path) {
  const span = make(dom, 'span', 'note-icon')
  span.setAttribute('aria-hidden', 'true')
  span.style.setProperty('--note-i', `url("${svg(path)}")`)
  return span
}

// Opening a note in place: through the outliner (inside the suite shell this stays in the shell), else the link.
const opener = (context, node) => function (event) {
  try {
    const outliner = context.getOutliner(context.dom)
    event.preventDefault()
    outliner.GotoSubject(node, true, undefined, true, undefined)
  } catch (e) { /* fall back to the link */ }
}

// What render and renderNavigation share. In the suite shell that is context.suite.state (new for each showing);
// alone there is no navigation column, so a plain object does.
function shared (subject, context) {
  const store = context.session.store
  const state = context.suite && context.suite.state ? context.suite.state : {}
  const folder = store.sym(folderOf(subject.uri))
  // The folder's listing: there already, or loaded once (by whichever of the two asks first).
  if (!state.listing) {
    state.listing = store.any(folder, store.sym(LDP_CONTAINS)) || !store.fetcher
      ? Promise.resolve(false)
      : store.fetcher.load(folder).then(() => true, () => false)
  }
  return { store, state, folder }
}

const notesPane = {
  name: 'notes-reader',
  icon: ICON,

  label: function (subject) {
    return subject && subject.uri && IS_NOTE.test(subject.uri.split(/[?#]/)[0]) ? 'Notes' : null
  },

  // A note opens in this pane first.
  shouldGetFocus: function (subject) {
    return !!notesPane.label(subject)
  },

  render: function (subject, context) {
    const dom = context.dom
    const { store, state, folder } = shared(subject, context)
    const el = (tag, cls, text) => make(dom, tag, cls, text)
    const root = el('div', 'note notes-reader-pane note-root')
    root.appendChild(el('style', '', CSS))
    const nav = root.appendChild(el('nav', 'note-pager'))
    nav.setAttribute('aria-label', 'Notes in this folder')
    const body = root.appendChild(el('article', 'note-body'))
    body.appendChild(el('p', 'note-msg', 'Loading…'))

    const goto = node => opener(context, node)
    const link = (text, node, cls, path, after) => {
      const a = el('a', 'note-btn' + (cls ? ' ' + cls : ''))
      if (path && !after) a.appendChild(icon(dom, path))
      a.appendChild(el('span', '', text))
      if (path && after) a.appendChild(icon(dom, path))
      if (node) { a.setAttribute('href', node.value); a.setAttribute('title', text); a.addEventListener('click', goto(node)) } else a.setAttribute('aria-hidden', 'true')
      return a
    }

    // previous / folder / next, from the folder's listing
    const drawNav = () => {
      const notes = notesIn(store, folder)
      const at = notes.indexOf(subject.uri)
      const prev = at > 0 ? store.sym(notes[at - 1]) : null
      const next = at >= 0 && at < notes.length - 1 ? store.sym(notes[at + 1]) : null
      nav.textContent = ''
      const p = nav.appendChild(link(prev ? (prettyDate(fileName(prev.value)) || 'Previous') : 'Previous', prev, 'note-btn-tertiary note-prev' + (prev ? '' : ' note-off'), MDI.prev))
      if (prev) p.setAttribute('rel', 'prev')
      nav.appendChild(el('span', 'note-gap'))
      nav.appendChild(link('All notes' + (notes.length ? ' (' + notes.length + ')' : ''), folder, 'note-all' + (notes.length ? '' : ' note-off'), MDI.folder)) // no listing (a static site): no folder to show
      nav.appendChild(el('span', 'note-gap'))
      const n = nav.appendChild(link(next ? (prettyDate(fileName(next.value)) || 'Next') : 'Next', next, 'note-btn-tertiary note-next' + (next ? '' : ' note-off'), MDI.next, true))
      if (next) n.setAttribute('rel', 'next')
    }
    // SolidOS's own (logged-in) fetch when there is one: for the note, and for checking [[links]] with no listing
    const doFetch = (store.fetcher && store.fetcher._fetch) || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
    // [[name]] links: the note called name.md in this folder, also matched without its date
    // (so [[dyson-squeak]] finds 2026-11-18-dyson-squeak.md); a path with / is taken as written.
    const slug = v => v.toLowerCase().replace(IS_NOTE, '').replace(/[\s_]+/g, '-')
    const linkWikis = () => {
      const listed = !!store.any(folder, store.sym(LDP_CONTAINS))
      const notes = store.each(folder, store.sym(LDP_CONTAINS)).map(n => n.value).filter(u => IS_NOTE.test(u))
      for (const a of body.querySelectorAll('a.note-wiki')) {
        const name = a.getAttribute('data-wiki')
        let target = null
        if (name.includes('/')) target = new URL(IS_NOTE.test(name) ? name : name + '.md', subject.uri).href
        else {
          const want = slug(name)
          target = notes.find(u => slug(fileName(u)) === want) ||
            notes.find(u => slug(fileName(u)).replace(/^\d{4}-?\d{2}-?\d{2}-/, '') === want) || null
          if (!target && !listed) target = new URL(encodeURIComponent(name) + '.md', subject.uri).href // no listing: best guess
        }
        if (target && !target.startsWith(folder.value)) target = null // only notes in this folder or below, never another site
        const fresh = a.cloneNode(true) // drops any earlier click handler
        if (target) {
          fresh.setAttribute('class', 'note-wiki'); fresh.setAttribute('href', target); fresh.removeAttribute('title')
          fresh.addEventListener('click', goto(store.sym(target)))
        } else {
          fresh.setAttribute('class', 'note-wiki missing'); fresh.removeAttribute('href')
          fresh.setAttribute('title', 'No note called "' + name + '" in this folder')
        }
        a.replaceWith(fresh)
        // No folder listing (a static site): the target was a guess, so ask whether it is there.
        if (target && !listed && !name.includes('/') && doFetch) {
          Promise.resolve().then(() => doFetch(target, { method: 'HEAD' })).then(res => {
            if (res.ok || !fresh.isConnected) return
            const gone = fresh.cloneNode(true)
            gone.setAttribute('class', 'note-wiki missing'); gone.removeAttribute('href')
            gone.setAttribute('title', 'No note called "' + name + '" in this folder')
            fresh.replaceWith(gone)
          }, () => {})
        }
      }
    }
    drawNav()
    state.listing.then(loaded => { if (loaded) { drawNav(); linkWikis() } })

    // the note itself, through SolidOS's own (logged-in) fetch when there is one
    Promise.resolve()
      .then(() => doFetch(subject.uri, { headers: { Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1' } }))
      .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text() })
      .then(text => {
        body.textContent = ''
        const name = fileName(subject.uri)
        const date = prettyDate(name)
        if (date) body.appendChild(el('p', 'note-date', date))
        const take = { title: null }
        const blocks = markdown(dom, text, take, subject.uri) // the title is the first H1 the parser meets (never one in a code block)
        inline(dom, body.appendChild(el('h1')), take.title !== null ? take.title : name.replace(IS_NOTE, '').replace(/[_-]+/g, ' '), subject.uri)
        body.appendChild(blocks)
        linkWikis()
      })
      .catch(e => { body.textContent = ''; body.appendChild(el('p', 'note-msg', 'Could not load this note: ' + (e && e.message ? e.message : e))) })

    return root
  },

  // Inside the suite shell: the notes of this folder in the left column, the open one marked. Each is a name and
  // its date. It reads only the folder listing render already loads; with no listing there is no column.
  renderNavigation: function (subject, context) {
    const dom = context.dom
    const { store, state, folder } = shared(subject, context)
    if (state.unlisted) return null
    const box = make(dom, 'div', 'note-shell-nav')
    const caption = box.appendChild(make(dom, 'p', 'note-caption', 'Notes'))
    const list = box.appendChild(make(dom, 'ul', 'note-nav-list'))
    list.setAttribute('aria-label', 'Notes in this folder')
    const draw = () => {
      const notes = notesIn(store, folder)
      caption.textContent = notes.length + (notes.length === 1 ? ' note' : ' notes')
      list.replaceChildren()
      for (const uri of notes) {
        const node = store.sym(uri)
        const a = list.appendChild(make(dom, 'li')).appendChild(make(dom, 'a', 'note-nav-item note-nav-entry'))
        a.setAttribute('href', uri)
        a.setAttribute('title', fileName(uri))
        a.appendChild(icon(dom, MDI.note))
        const text = a.appendChild(make(dom, 'span', 'note-nav-text'))
        text.appendChild(make(dom, 'span', 'note-nav-label', listName(uri)))
        const sub = listSub(store, uri)
        if (sub) text.appendChild(make(dom, 'span', 'note-nav-sub', sub))
        if (uri === subject.uri) a.setAttribute('aria-current', 'page')
        a.addEventListener('click', opener(context, node))
      }
    }
    if (store.any(folder, store.sym(LDP_CONTAINS))) draw()
    else {
      list.appendChild(make(dom, 'li', 'note-nav-empty', 'Loading…'))
      state.listing.then(() => {
        if (store.any(folder, store.sym(LDP_CONTAINS))) { draw(); return }
        // No listing (a static site, or not allowed): drop the column rather than show an empty one.
        state.unlisted = true
        if (context.suite && context.suite.refreshNavigation) context.suite.refreshNavigation()
      })
    }
    return box
  }
}

export default notesPane
