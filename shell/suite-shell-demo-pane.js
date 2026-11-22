// suite-shell-demo-pane.js: a tiny reading shelf, written to show the suite's three-column contract.
//
//   render(subject, context)            the content: the books on the chosen list
//   renderNavigation(subject, context)  the left column: "All books" and each list, with counts
//   renderDetails(node, context)        the right column: one book (or the shelf itself)
//
// Inside the suite shell, context.suite is there: the three share context.suite.state, a row opens the details
// column with context.suite.showDetails(book). Alone in the data browser (no context.suite), render shows the
// lists as chips above the books and a book's details under its row. Read-only: it never writes.
//
// Data: a document with <#this> a shelf:Shelf (shelf: <https://example.org/ns/shelf#>), shelf:list <#l>; each list
// has schema:name and shelf:item <#book>; a book has schema:name, schema:author, schema:datePublished,
// schema:description. Icons: Material Design Icons (Apache 2.0). AGPL-3.0-or-later. Copyright (c) 2026 Melvin Carvalho.

const SHELF = 'https://example.org/ns/shelf#'
const SCHEMA = ['http://schema.org/', 'https://schema.org/']
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const BOOK = 'M18,2A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2H18M18,4H13V12L10.5,9.75L8,12V4H6V20H18V4Z'
const LIST = 'M7,5H21V7H7V5M7,13V11H21V13H7M4,4.5A1.5,1.5 0 0,1 5.5,6A1.5,1.5 0 0,1 4,7.5A1.5,1.5 0 0,1 2.5,6A1.5,1.5 0 0,1 4,4.5M4,10.5A1.5,1.5 0 0,1 5.5,12A1.5,1.5 0 0,1 4,13.5A1.5,1.5 0 0,1 2.5,12A1.5,1.5 0 0,1 4,10.5M7,19V17H21V19H7M4,16.5A1.5,1.5 0 0,1 5.5,18A1.5,1.5 0 0,1 4,19.5A1.5,1.5 0 0,1 2.5,18A1.5,1.5 0 0,1 4,16.5Z'
const svg = (d) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}"/></svg>`)

const CSS = `
/* suite:design begin --prefix dm --only icon,nav,row,chip,empty,details */
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
.dm-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.dm-root *, .dm-root *::before, .dm-root *::after { box-sizing: border-box }
.dm-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.dm-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.dm-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.dm-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.dm-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.dm-root [hidden] { display: none !important }
.dm-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.dm-muted { color: var(--sui-text-muted) }
.dm-small { font-size: var(--sui-text-sm) }
.dm-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.dm-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.dm-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.dm-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.dm-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.dm-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --dm-i set to url("data:image/svg+xml,...") ---------------------------------- */
.dm-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--dm-i) center / contain no-repeat; mask: var(--dm-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.dm-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.dm-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.dm-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.dm-nav-item:hover { background: var(--sui-bg-hover) }
.dm-nav-item[aria-current="page"], .dm-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.dm-nav-item .dm-icon { color: var(--sui-text-muted) }
.dm-nav-item[aria-current] .dm-icon { color: inherit }
.dm-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.dm-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.dm-nav-new { margin-bottom: var(--sui-space-2) }
.dm-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.dm-list { margin: 0; padding: 0; list-style: none }
.dm-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.dm-row:hover { background: var(--sui-bg-hover) }
.dm-row[aria-selected="true"], .dm-row[aria-current="true"] { background: var(--sui-primary-light) }
.dm-row-main { flex: 1 1 auto; min-width: 0 }
.dm-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.dm-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.dm-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.dm-row-actions { flex: none; display: flex; align-items: center }
.dm-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.dm-row-icon .dm-icon { width: 28px; height: 28px }
.dm-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .dm-row-meta { display: none } }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.dm-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.dm-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.dm-chip { cursor: pointer }
button.dm-chip:hover { background: var(--sui-primary-light-hover) }
.dm-chip-primary, .dm-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.dm-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.dm-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.dm-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.dm-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.dm-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.dm-empty-icon .dm-icon { width: 48px; height: 48px }
.dm-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.dm-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.dm-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.dm-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.dm-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.dm-details-figure .dm-icon { width: 36px; height: 36px }
.dm-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.dm-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.dm-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.dm-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.dm-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.dm-tab:hover { color: var(--sui-text) }
.dm-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.dm-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.dm-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.dm-props dt { color: var(--sui-text-muted) }
.dm-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.dm.suite-shell-demo-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-2) var(--sui-space-4) var(--sui-space-8) }
.dm-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sui-space-2); margin: var(--sui-space-2) 0 var(--sui-space-3) var(--sui-space-3) }
.dm-inline-details { margin: 0 0 var(--sui-space-2) 56px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-bg-app) }
.dm-chips { margin: 0 0 var(--sui-space-3) var(--sui-space-3) }
`

const pane = {
  name: 'suite-shell-demo',
  icon: svg(BOOK),
  label (subject, context) {
    const store = (context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store)
    if (!store || !subject || !subject.uri) return null
    try { return store.holds(subject, store.sym(RDF_TYPE), store.sym(SHELF + 'Shelf')) || store.holds(null, store.sym(RDF_TYPE), store.sym(SHELF + 'Shelf'), subject.doc()) ? 'Shelf' : null } catch { return null }
  },
  shouldGetFocus () { return true }, // only asked once label said yes

  render (subject, context) {
    const { dom, suite, state, shelf } = setup(subject, context)
    const root = el(dom, 'div', 'dm suite-shell-demo-pane dm-root')
    root.appendChild(el(dom, 'style', null, CSS))
    const head = root.appendChild(el(dom, 'div', 'dm-head'))
    const title = head.appendChild(el(dom, 'h2', 'dm-heading'))
    const count = head.appendChild(el(dom, 'span', 'dm-muted'))
    const chips = suite ? null : root.appendChild(el(dom, 'div', 'dm-chips'))
    const list = root.appendChild(el(dom, 'ul', 'dm-list', null, { 'aria-label': 'Books' }))
    title.textContent = 'Loading…'

    state.draw = () => {
      const data = shelf()
      const chosen = data.lists.find(l => l.node.uri === state.list)
      const books = chosen ? chosen.books : data.all
      title.textContent = chosen ? chosen.name : data.name
      count.textContent = books.length + (books.length === 1 ? ' book' : ' books')
      list.replaceChildren()
      if (!books.length) {
        const box = list.appendChild(el(dom, 'li', 'dm-empty'))
        box.appendChild(el(dom, 'span', 'dm-empty-icon')).appendChild(icon(dom, BOOK))
        box.appendChild(el(dom, 'p', 'dm-empty-title', 'No books on this list'))
        return
      }
      for (const book of books) {
        const row = list.appendChild(el(dom, 'li', 'dm-row', null, { tabindex: '0', role: 'button', 'aria-selected': String(state.selected === book.node.uri), 'data-book': book.node.uri }))
        row.appendChild(el(dom, 'span', 'dm-row-icon')).appendChild(icon(dom, BOOK))
        const main = row.appendChild(el(dom, 'span', 'dm-row-main'))
        main.appendChild(el(dom, 'span', 'dm-row-title', book.name))
        main.appendChild(el(dom, 'span', 'dm-row-sub', book.author))
        row.appendChild(el(dom, 'span', 'dm-row-meta', book.year))
        const open = () => {
          if (suite) {
            state.selected = book.node.uri
            for (const r of list.querySelectorAll('.dm-row')) r.setAttribute('aria-selected', String(r === row))
            suite.showDetails(book.node, { onClose: () => { state.selected = ''; row.setAttribute('aria-selected', 'false') } })
          } else {
            const next = row.nextElementSibling
            if (next && next.classList.contains('dm-inline-details')) { next.remove(); return }
            row.after(el(dom, 'li', 'dm-inline-details')).appendChild(detailsOf(dom, book))
          }
        }
        row.addEventListener('click', open)
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } })
      }
    }
    state.loaded.then(() => {
      state.draw()
      if (chips) { // alone: the navigation becomes a row of chips above the list
        const data = shelf()
        const chip = (label, uri) => {
          const b = chips.appendChild(el(dom, 'button', 'dm-chip', label, { type: 'button', 'aria-pressed': String(state.list === uri) }))
          b.addEventListener('click', () => { state.list = uri; for (const c of chips.children) c.setAttribute('aria-pressed', String(c === b)); state.draw() })
        }
        chip('All books', '')
        for (const l of data.lists) chip(l.name, l.node.uri)
        chips.classList.add('dm-chips')
      }
    })
    return root
  },

  renderNavigation (subject, context) {
    const { dom, state, shelf } = setup(subject, context)
    const nav = el(dom, 'ul', 'dm-nav-list')
    state.loaded.then(() => {
      const data = shelf()
      const item = (label, uri, n, ic) => {
        const b = nav.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'dm-nav-item', null, { type: 'button', 'data-list': uri }))
        b.appendChild(icon(dom, ic))
        b.appendChild(el(dom, 'span', 'dm-nav-label', label))
        b.appendChild(el(dom, 'span', 'dm-nav-count', String(n)))
        if (state.list === uri) b.setAttribute('aria-current', 'page')
        b.addEventListener('click', () => {
          state.list = uri
          for (const x of nav.querySelectorAll('.dm-nav-item')) { if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current') }
          if (state.draw) state.draw()
        })
      }
      item('All books', '', data.all.length, BOOK)
      for (const l of data.lists) item(l.name, l.node.uri, l.books.length, LIST)
    })
    return nav
  },

  renderDetails (node, context) {
    const { dom, shelf } = setup(node, context)
    const data = shelf()
    const book = data.all.find(b => b.node.uri === node.uri)
    const box = el(dom, 'div', 'dm-details-wrap')
    const head = box.appendChild(el(dom, 'div', 'dm-details-head'))
    head.appendChild(el(dom, 'span', 'dm-details-figure')).appendChild(icon(dom, book ? BOOK : LIST))
    const titles = head.appendChild(el(dom, 'div', 'dm-details-titles'))
    titles.appendChild(el(dom, 'h2', 'dm-details-title', book ? book.name : data.name))
    titles.appendChild(el(dom, 'p', 'dm-details-sub', book ? book.author : data.all.length + ' books on ' + data.lists.length + ' lists'))
    const body = box.appendChild(el(dom, 'div', 'dm-details-body'))
    if (book) body.appendChild(detailsOf(dom, book))
    else body.appendChild(el(dom, 'p', null, 'A reading shelf: pick a list on the left, and a book to see it here.'))
    return box
  }
}

// What render, renderNavigation and renderDetails share: one load of the document, the chosen list, the selection.
function setup (subject, context) {
  const dom = context.dom
  const store = context.session.store
  const suite = context.suite || null
  const state = suite ? suite.state : {}
  if (!state.loaded) state.loaded = store.fetcher.load(subject.doc()).catch(() => null)
  if (state.list === undefined) state.list = ''
  const sym = (u) => store.sym(u)
  const text = (s, term) => { for (const ns of SCHEMA) { const v = store.any(s, sym(ns + term), null, subject.doc()); if (v) return v.value } return '' }
  const shelf = () => {
    const doc = subject.doc()
    const me = store.any(null, sym(RDF_TYPE), sym(SHELF + 'Shelf'), doc) || subject
    const seen = new Map()
    const book = (n) => { if (!seen.has(n.uri)) seen.set(n.uri, { node: n, name: text(n, 'name') || n.uri, author: text(n, 'author'), year: text(n, 'datePublished'), description: text(n, 'description') }); return seen.get(n.uri) }
    const lists = store.each(me, sym(SHELF + 'list'), null, doc).map(l => ({ node: l, name: text(l, 'name') || l.uri, books: store.each(l, sym(SHELF + 'item'), null, doc).map(book) }))
    lists.sort((a, b) => a.name.localeCompare(b.name))
    for (const l of lists) l.books.sort((a, b) => a.name.localeCompare(b.name))
    const all = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
    for (const b of all) b.lists = lists.filter(l => l.books.includes(b)).map(l => l.name)
    return { name: text(me, 'name') || 'Shelf', lists, all }
  }
  return { dom, store, suite, state, shelf }
}

function detailsOf (dom, book) {
  const dl = el(dom, 'dl', 'dm-props')
  for (const [k, v] of [['Author', book.author], ['Published', book.year], ['On lists', (book.lists || []).join(', ')], ['About', book.description]]) {
    if (!v) continue
    dl.appendChild(el(dom, 'dt', null, k))
    dl.appendChild(el(dom, 'dd', null, v))
  }
  return dl
}
function el (dom, tag, cls, text, attrs) {
  const node = dom.createElement(tag)
  if (cls) node.className = cls
  if (text) node.textContent = text
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}
function icon (dom, path) {
  const span = el(dom, 'span', 'dm-icon', null, { 'aria-hidden': 'true' })
  span.style.setProperty('--dm-i', `url("${svg(path)}")`)
  return span
}

export default pane
