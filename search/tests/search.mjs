// Search from the shell's header box, logged in as `me`: the dropdown, its groups, "Show more", case and decoding,
// the cache, keyboard up/down/Escape/Enter, Enter opening the result inside the shell, the folder limit, read-only.
// The header walk is pointed at this test's own tree (the pane's _test.startAt), so nothing depends on the size or
// order of the rest of the pod; that the header finds the pod root is checked separately (data-pod-root).
// From search/ the walk meets many/ (320 folders), so it always reaches the folder limit at the same place.
//   node tests/search.mjs        logs in, 1300 px
//   node tests/search.mjs 400    reuses that login; a true 400 px page (CDP device metrics, design/viewport.mjs)
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const width = +(process.argv[2] || 1300)
const tag = String(width)
const SHELL = LAB + 'shell/suite-shell-pane.js'
const BASE = POD + 'public/suite-data/search/'
const PHOTOS = BASE + 'Quince%20photos/'
const DISK = path.join(config.podDir, 'public', 'suite-data', 'search')
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9551, dir: import.meta.dirname, login: width === 1300, resource: BASE })

const files = (dir) => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? [p + '/', ...files(p)] : [p] })
const snapshot = () => files(DISK).map(f => f.endsWith('/') ? f : f + ':' + createHash('sha1').update(readFileSync(f)).digest('hex')).join('\n')
const before = snapshot()

const ready = (uri) => page.waitFor((u) => { const r = document.querySelector('.sh.suite-shell-pane[data-ready]'); return !!r && r.querySelector('.sh-bar-title').textContent === u }, { timeout: 40000, args: [uri] }).then(() => true, () => false)
const key = async (k, code, vk) => { for (const type of ['rawKeyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }) }
const KEYS = { down: ['ArrowDown', 'ArrowDown', 40], up: ['ArrowUp', 'ArrowUp', 38], esc: ['Escape', 'Escape', 27], enter: ['Enter', 'Enter', 13] }
const press = (name) => key(...KEYS[name])
// Type into the header box as a person would: focus, select all, then insert the text (fires input events).
const typeQuery = async (text) => {
  await page.evaluate(() => { const i = document.querySelector('.sh-header-search input'); i.focus(); i.select() })
  await page.type(text)
}
const settled = (q) => page.waitFor((want) => {
  const d = document.querySelector('[data-search="dropdown"]')
  return !!d && !d.hidden && d.dataset.done === 'yes' && d.dataset.query === want && !!d.querySelector('.se-results > *')
}, { timeout: 90000, args: [q] }).then(() => true, () => false)
const drop = () => page.evaluate(() => {
  const d = document.querySelector('[data-search="dropdown"]')
  const input = document.querySelector('.sh-header-search input')
  if (!d) return null
  const active = input.getAttribute('aria-activedescendant')
  return {
    open: !d.hidden, fetched: +d.dataset.fetched, capped: d.dataset.capped, done: d.dataset.done, root: d.dataset.root || '', podRoot: d.dataset.podRoot || '',
    status: (d.querySelector('.se-status') || {}).textContent || '',
    quiet: (d.querySelector('.se-quiet') || {}).textContent || '',
    groups: [...d.querySelectorAll('.se-group')].map(g => ({
      id: g.dataset.group, name: g.querySelector('.se-caption').textContent, count: +g.querySelector('.se-group-count').textContent,
      rows: [...g.querySelectorAll('.se-row')].map(r => ({ title: r.querySelector('.se-row-title').textContent, sub: r.querySelector('.se-row-sub').textContent, icon: !!r.querySelector('.se-row-icon .se-icon'), hit: (r.querySelector('.se-hit') || {}).textContent || '', uri: r.dataset.uri })),
      more: !!g.querySelector('.se-more')
    })),
    active: active ? (document.getElementById(active) || {}).textContent || '?' : '',
    activeIndex: active ? [...d.querySelectorAll('[role="option"]')].findIndex(o => o.id === active) : -1,
    expanded: input.getAttribute('aria-expanded'), role: input.getAttribute('role'),
    focus: document.activeElement === input, value: input.value,
    rect: (() => { const b = d.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.top)] })()
  }
})
const group = (s, id) => (s.groups.find(g => g.id === id) || { rows: [], count: 0 })
const noSideways = async (what) => { const m = await measure(page); check(`no sideways scroll at ${m.innerWidth} px: ${what}`, !m.sideways, `scrollWidth ${m.scrollWidth}${m.poking.length ? '; past the edge: ' + m.poking.join(' ') : ''}`) }

try {
  check('the shell opens on the sample folder', await ready(BASE))
  if (width !== 1300) await narrow(page, width)
  await sleep(500)

  // ---- typing finds files and folders by name, grouped
  const LIMIT = await page.evaluate(async (url, start) => { const m = await import(url); m.default._test.startAt = start; return m.default.limits.containers }, LAB + 'search/search-pane.js', BASE)
  const t0 = Date.now()
  await typeQuery('quince')
  check('typing opens the dropdown under the box, and the walk finishes', await settled('quince'), `${Date.now() - t0} ms`)
  let s = await drop()
  console.log(`  walk: ${s.fetched} folders, capped ${s.capped}, ${Date.now() - t0} ms; status "${s.status}"`)
  check('the header finds the pod root (pim:storage / profile)', s.podRoot === POD, s.podRoot)
  check('for this test the walk starts at the sample tree', s.root === BASE, s.root)
  check('the box is a combobox and says it is expanded', s.role === 'combobox' && s.expanded === 'true')
  check('groups in order: Folders first, then by app type', s.groups[0] && s.groups[0].id === 'folders' && s.groups.map(g => g.id).join(',').startsWith('folders,photos,notes'), s.groups.map(g => g.id).join(','))
  const photosFolder = group(s, 'folders').rows.find(r => r.title === 'Quince photos')
  check('a folder by name, its name decoded (a space)', !!photosFolder && photosFolder.uri === PHOTOS)
  check('each row: icon, name with the match marked, folder path', !!photosFolder && photosFolder.icon && photosFolder.hit === 'Quince' && photosFolder.sub === 'in /', JSON.stringify(photosFolder))
  check('Photos: quince-tree.svg', group(s, 'photos').rows.some(r => r.title === 'quince-tree.svg'))
  check('Tables: quince-yield.csv', group(s, 'tables').rows.some(r => r.title === 'quince-yield.csv'))
  const notes = group(s, 'notes')
  check('Notes: eight matches, five shown, and "Show more"', notes.count >= 8 && notes.rows.length === 5 && notes.more, `${notes.count} / ${notes.rows.length}`)
  check('names that start with the words come first', notes.rows.every(r => /^quince/i.test(r.title)), notes.rows.map(r => r.title).join(', '))
  check('apple-pie.md and orchard.ttl are not found (no match)', !s.groups.some(g => g.rows.some(r => /apple|orchard/.test(r.title))))
  check(`the folder limit (read back from the pane: ${LIMIT}) is reached exactly and kept`, LIMIT === 300 && s.fetched === LIMIT && s.capped === 'yes', String(s.fetched))
  check('a file found in a nested folder within the limit (Quince photos/quince-in-bloom.png)', group(s, 'photos').rows.some(r => r.title === 'quince-in-bloom.png' && r.sub === 'in /Quince photos'))
  check('the status says the limit was reached', /limit \(300\)/.test(s.status), s.status)
  await shot('dropdown-' + tag)
  await noSideways('dropdown open')
  if (width !== 1300) check('narrow: the dropdown spans the page, 8 px from each side', s.rect[0] === 8 && s.rect[1] === width - 8, s.rect.join(','))
  else check('wide: the dropdown sits under the box, right-aligned with it', await page.evaluate(() => { const f = document.querySelector('.sh-header-search').getBoundingClientRect(); const d = document.querySelector('[data-search="dropdown"]').getBoundingClientRect(); return Math.abs(f.right - d.right) <= 1 && d.top >= f.bottom }))

  // ---- review fixes #3, #5, #6: safe links, a quiet live region, when it searched
  const extra = await page.evaluate(() => {
    const d = document.querySelector('[data-search="dropdown"]')
    const rows = [...d.querySelectorAll('a.se-row')]
    return {
      rows: rows.length, safe: rows.every(a => a.rel === 'noopener' && /^https?:/.test(a.href)),
      statusLive: d.querySelector('.se-status').hasAttribute('aria-live'), live: d.querySelector('[data-live="search"]').textContent,
      text: d.querySelector('.se-status-text').textContent, again: !d.querySelector('.se-again').hidden
    }
  })
  check('#3 every result link has rel="noopener" and an http(s) address', extra.rows > 0 && extra.safe, String(extra.rows))
  check('#5 the visible status is not live; the live region says only the final line', !extra.statusLive && extra.live === extra.text, extra.live)
  check('#6 the status says when it searched, with "Search again"', /at \d\d:\d\d\./.test(extra.text) && extra.again, extra.text)

  // ---- Show more
  await page.evaluate(() => document.querySelector('[data-search="dropdown"] [data-group="notes"] .se-more').click())
  await sleep(200)
  s = await drop()
  check('"Show more" shows the rest of the group', group(s, 'notes').rows.length === group(s, 'notes').count && !group(s, 'notes').more, String(group(s, 'notes').rows.length))
  check('the focus stays in the box', s.focus)

  // ---- case and decoding; the walk is cached
  const fetched = s.fetched
  await typeQuery('CAFÉ')
  check('upper case finds a decoded name (café-quince.md, %C3%A9 on the pod)', await settled('CAFÉ'))
  s = await drop()
  check('the match is café-quince.md, in Notes', group(s, 'notes').rows.some(r => r.title === 'café-quince.md' && r.hit === 'café'), JSON.stringify(group(s, 'notes').rows.map(r => r.title)))
  check('the walk is cached: no new listings for a second search', s.fetched === fetched, `${s.fetched} vs ${fetched}`)
  await typeQuery('zzqx-nothing')
  await settled('zzqx-nothing')
  s = await drop()
  check('no match says so', /Nothing is named like “zzqx-nothing”/.test(s.quiet), s.quiet)
  await shot('nomatch-' + tag)
  check('#6 "nothing found" says the answer is from the earlier walk', /searched at \d\d:\d\d\. Files added since then need “Search again”/.test(s.quiet), s.quiet)

  // ---- #6 a file made after the walk: not found until "Search again"
  const NEW = path.join(DISK, 'quince-new-after-walk.md')
  writeFileSync(NEW, '# Made after the walk\n')
  await typeQuery('quince-new-after')
  await settled('quince-new-after')
  s = await drop()
  check('#6 a file made after the walk is not in the kept walk', /Nothing is named like/.test(s.quiet), s.quiet)
  await page.evaluate(() => document.querySelector('[data-search="dropdown"] .se-again').click())
  const found = await page.waitFor(() => { const d = document.querySelector('[data-search="dropdown"]'); return d.dataset.done === 'yes' && [...d.querySelectorAll('.se-row-title')].some(t => t.textContent === 'quince-new-after-walk.md') }, { timeout: 60000 }).then(() => true, () => false)
  check('#6 "Search again" walks again and finds it', found)
  s = await drop()
  check('#6 …and the new walk keeps the limit', s.fetched > 0 && s.fetched <= 300, String(s.fetched))
  rmSync(NEW)
  await page.evaluate(() => document.querySelector('[data-search="dropdown"] .se-again').click())
  await page.waitFor(() => document.querySelector('[data-search="dropdown"]').dataset.done === 'yes', { timeout: 60000 }).catch(() => {})

  // ---- keyboard
  await typeQuery('quince')
  await settled('quince')
  await press('down')
  s = await drop()
  check('Down highlights the first result', s.activeIndex === 0 && s.active === 'Quince photosin /', s.active)
  await press('down'); await press('down')
  s = await drop()
  check('Down again moves on', s.activeIndex === 2, String(s.activeIndex))
  await press('up')
  s = await drop()
  check('Up moves back', s.activeIndex === 1, String(s.activeIndex))

  // ---- #1 the highlight stays on the same result while the walk adds rows above it
  const follow = await page.evaluate(async (url) => {
    const m = await import(url)
    const d = document.querySelector('[data-search="dropdown"]')
    const w = [...m.default._test.walks.values()].find(x => x.root === d.dataset.root && x.items.length)
    const activeUri = () => { const id = document.querySelector('.sh-header-search input').getAttribute('aria-activedescendant'); const o = id && document.getElementById(id); return [o ? o.dataset.uri : '', o ? [...d.querySelectorAll('[role="option"]')].indexOf(o) : -1] }
    const [uri, index] = activeUri()
    const fake = { uri: w.root + 'public/aaa-quince-arrives-late/', name: 'aaa-quince-arrives-late', folder: true, parent: w.root + 'public/', depth: 0 }
    w.items.push(fake)
    for (const f of [...w.listeners]) f() // what a walk step does
    const [after, afterIndex] = activeUri()
    w.items.splice(w.items.indexOf(fake), 1)
    for (const f of [...w.listeners]) f()
    const [back] = activeUri()
    return { uri, index, after, afterIndex, back }
  }, LAB + 'search/search-pane.js')
  check('#1 a row added above keeps the highlight on the same result (by address, not place)', !!follow.uri && follow.after === follow.uri && follow.afterIndex === follow.index + 1 && follow.back === follow.uri, JSON.stringify(follow))
  await shot('keyboard-' + tag)
  await press('esc')
  s = await drop()
  check('Escape closes the dropdown, keeps the text and the focus', !s.open && s.expanded === 'false' && s.value === 'quince' && s.focus)
  check('Escape closed only the dropdown: still on the same folder', await page.evaluate((u) => document.querySelector('.sh-bar-title').textContent === u, BASE))
  await press('down')
  s = await drop()
  check('Down opens it again', s.open)
  await press('down')
  s = await drop()
  check('…and highlights the first result', s.activeIndex === 0)
  await press('enter')
  check('Enter opens the result inside the shell', await ready(PHOTOS))
  s = await page.evaluate(() => ({ url: new URL(location.href).searchParams.get('uri'), shell: !!document.querySelector('.sh.suite-shell-pane'), drop: [...document.querySelectorAll('[data-search="dropdown"]')].filter(d => !d.hidden).length, toast: [...document.querySelectorAll('.sh-toast')].map(t => t.textContent).join(' ') }))
  check('…in the frame, with no dropdown left open and no toast', s.shell && s.drop === 0 && !s.toast, JSON.stringify(s))
  await sleep(800)
  await shot('opened-' + tag)

  // ---- after opening: a new shell showing; the walk is still cached
  await typeQuery('quince-jam')
  check('a later search on the new page answers from the cache', await settled('quince-jam'))
  s = await drop()
  check('…with the same walk (no new listings)', s.fetched === fetched, `${s.fetched} vs ${fetched}`)
  await press('esc')

  // ---- #2 no pod root to be found: a message, not "Searching…" forever
  const lost = await page.evaluate(async (url) => {
    const m = await import(url)
    const kept = m.default._test.startAt
    m.default._test.startAt = null // the real path: find the pod root, which fails here
    const top = document.body.appendChild(document.createElement('div'))
    top.className = 'sh-top'
    const form = top.appendChild(document.createElement('form'))
    const input = form.appendChild(document.createElement('input'))
    const context = { session: { store: { fetcher: { load: async () => { throw new Error('offline') } }, any: () => null, sym: (u) => ({ value: u }) }, logic: { authn: { currentUser: () => ({ uri: 'x#me', doc: () => ({ uri: 'not an address' }) }) } } } }
    const h = m.default.headerSearch({ input, form, context, suite: { state: {}, go () {} } })
    h.query('quince')
    await new Promise(resolve => setTimeout(resolve, 500))
    const out = { text: h.element.querySelector('.se-results').textContent, done: h.element.dataset.done }
    h.forget(); top.remove()
    m.default._test.startAt = kept
    return out
  }, LAB + 'search/search-pane.js')
  check('#2 with no pod root the dropdown ends with a message', lost.done === 'yes' && /could not be found/.test(lost.text), JSON.stringify(lost))

  check('read-only: nothing in the sample tree changed', snapshot() === before)
  await finish()
} catch (error) { await finish(error) }
