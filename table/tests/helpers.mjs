// Shared by the table tests: addresses, the view menu, and a watch on anything that writes.
import { LAB, POD, sleep } from '../../lib/lib.mjs'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'

export const PANE = LAB + 'table/table-pane.js'
export const PORT = 9534
export const DATA = POD + 'public/suite-data/table/'
const DISK = homedir() + '/ideas/jss-data/me/public/suite-data/table/'
export const diskHash = (name) => createHash('sha256').update(readFileSync(DISK + name)).digest('hex')

// Every element matching sel, inside shadow roots too.
const ALL = `(sel) => { const out = []; const walk = (n) => { out.push(...n.querySelectorAll(sel)); for (const el of n.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot) }; walk(document); return out }`

// The names in the data browser's view menu (the "more options" menu in the resource header).
export async function views (page) {
  await page.waitFor(`(${ALL})('solid-ui-menu-item').length > 0`, { timeout: 40000 })
  await sleep(500)
  return page.evaluate(`(${ALL})('solid-ui-menu-item').map(m => m.textContent.trim())`)
}

// Choose a view from that menu, as a person would.
export async function choose (page, name) {
  await views(page)
  const ok = await page.evaluate(`(() => { const item = (${ALL})('solid-ui-menu-item').find(m => m.textContent.trim() === ${JSON.stringify(name)}); const target = item && item.assignedSlot && item.assignedSlot.closest('wa-dropdown-item'); if (target) target.click(); return !!target })()`)
  if (!ok) throw new Error('no view called ' + name)
}

// Watch for anything that would write: non-GET fetches, and the store's updater.
export const WATCH = `(() => {
  window.__writes = []
  const writes = (m) => m && !/^(GET|HEAD|OPTIONS)$/i.test(m)
  const f = window.fetch
  window.fetch = function (u, o) { if (o && writes(o.method)) window.__writes.push(o.method + ' ' + u); return f.apply(this, arguments) }
  const store = globalThis.SolidLogic && SolidLogic.store
  if (store && store.fetcher && store.fetcher._fetch) { const g = store.fetcher._fetch; store.fetcher._fetch = (u, o) => { if (o && writes(o.method)) window.__writes.push(o.method + ' ' + u); return g(u, o) } }
  if (store && store.updater) { const up = store.updater.update.bind(store.updater); store.updater.update = (...a) => { window.__writes.push('update'); return up(...a) } }
  return true
})()`

// What the table shows now.
export const READ = `(() => {
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  return {
    title: q('.tbl-title')?.textContent,
    meta: q('.tbl-meta')?.textContent,
    count: q('.tbl-count')?.textContent,
    heads: qa('.tbl thead th').map(th => th.textContent.replace(/[\\u25B2\\u25BC]/g, '').trim()),
    sorted: qa('.tbl thead th[aria-sort]').map(th => th.textContent.replace(/[\\u25B2\\u25BC]/g, '').trim() + ':' + th.getAttribute('aria-sort')),
    names: qa('.tbl tbody td.tbl-name').map(td => td.textContent),
    rows: qa('.tbl tbody tr').map(tr => [...tr.cells].map(td => td.textContent)),
    status: q('.tbl-status')?.textContent,
    wide: document.documentElement.scrollWidth > innerWidth
  }
})()`

// A true 400 px page (CDP device metrics; the window itself cannot go below about 500 px), and the
// sideways-scroll measure: the design sheet's own helper.
export { narrow, wide, measure } from '../../design/viewport.mjs'
