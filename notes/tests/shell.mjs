// The notes pane inside the suite shell (shell/suite-shell-pane.js lists it as the Notes app, and loads it itself),
// from a clean browser, logged out: the note in the content, the folder's notes in the shell's left column with the
// open one marked, opening another note from that column, from a [[link]] and from previous (all staying in the
// shell), a private note saying it cannot be read, no details button (Notes has none), and no sideways scroll at
// 1300 px and a true 400 px, column closed and open.
// Why logged out: logged in, the browser also loads the panes in the test user's tool index, which lists the
// PUBLISHED notes pane under the same name (notes-reader); it registers first and the shell then skips this copy.
// Loading this copy by link as well (?pane= twice) races with the shell. See NOTES.md, Needs a decision.
//   node tests/shell.mjs
import { open, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { BASE, SHELL, PORT2, NOTES } from './setup.mjs'

const { page, check, finish, shot, address } = await open({ pane: SHELL, port: PORT2, dir: import.meta.dirname, login: false, fresh: true, resource: BASE + 'welcome.md' })
const N = NOTES.length
const showing = (name, title) => page.waitFor((v) => {
  const [uri, want, n] = JSON.parse(v)
  const r = document.querySelector('.sh.suite-shell-pane[data-ready]')
  const h = r && r.querySelector('.sh-content .note.notes-reader-pane .note-body h1')
  const items = r ? r.querySelectorAll('.sh-navcol .note-nav-item') : []
  const current = r && r.querySelector('.sh-navcol .note-nav-item[aria-current="page"]')
  return !!h && h.textContent === want && items.length === n && !!current && current.getAttribute('href') === uri
}, { timeout: 40000, args: [JSON.stringify([BASE + name, title, N])] }).then(() => true, () => false)
const nav = () => page.evaluate(() => [...document.querySelectorAll('.sh-navcol .note-nav-item')].map(a => a.querySelector('.note-nav-label').textContent + '|' + ((a.querySelector('.note-nav-sub') || {}).textContent || '') + (a.getAttribute('aria-current') ? '|*' : '')))
const frame = () => page.evaluate(() => { const r = document.querySelector('.sh.suite-shell-pane'); const vis = (n) => !!n && !n.hidden && n.getBoundingClientRect().width > 0; return { app: r.dataset.app, nav: vis(r.querySelector('.sh-navcol')), toggle: vis(r.querySelector('.sh-nav-toggle')), details: vis(r.querySelector('.sh-details-btn')), caption: (r.querySelector('.sh-navcol .note-caption') || {}).textContent, own: !!r.querySelector('.sh-content .note-nav-list'), stay: window.__stay === 'here' } })
const click = (sel, text) => page.evaluate((s, t) => { const a = [...document.querySelectorAll(s)].find(e => !t || e.textContent.trim() === t || (e.querySelector('.note-nav-label') || {}).textContent === t); if (!a) return false; a.click(); return true }, sel, text || '')

try {
  await page.goto(address(BASE + 'welcome.md'))
  const first = await showing('welcome.md', 'Alice\'s notebook')
  check('in the shell, a note opens in the Notes app, the folder\'s notes in the left column, it marked', first, first ? '' : await page.evaluate(() => location.href + ' :: ' + document.body.innerText.slice(0, 200)))
  check('the pane drawing the note is this copy, loaded by the shell', await page.evaluate(() => typeof window.panes.byName('notes-reader').renderNavigation === 'function' && performance.getEntriesByType('resource').some(e => e.name.endsWith('/suite/notes/notes-pane.js'))))
  let f = await frame()
  check('the Notes app is current; the column is shown; no details button (Notes has none); no second list in the content', f.app === 'notes' && f.nav && !f.details && !f.own && f.caption === N + ' notes', JSON.stringify(f))
  const items = await nav()
  check('each note by its name, with its date (from the file name, else when it was changed)', items[0] === 'First entry|18 November 2026' && items[1] === 'Seed swap|20 November 2026' && /^Welcome\|Changed \d+ \w+ 20\d\d\|\*$/.test(items[N - 1]) && items.filter(i => i.endsWith('|*')).length === 1, items.join(' ; '))
  check('the content still has previous / all / next', await page.evaluate(() => document.querySelector('.sh-content .note-pager .note-all').textContent) === `All notes (${N})`)
  check('1300 px in the shell: no sideways scroll', !(await measure(page)).sideways)
  await shot('shell-1300')

  await page.evaluate(() => { window.__stay = 'here' })
  await click('.sh-navcol .note-nav-item', 'Seed swap')
  check('a note in the column opens in the content, still in the shell, and becomes the marked one', await showing('2026-11-20-seed-swap.md', 'Seed swap at Carol\'s') && (await frame()).stay && (await frame()).app === 'notes')
  await click('.sh-content .note-pager .note-prev')
  check('previous, in the shell: the column follows', await showing('2026-11-18-first-entry.md', 'First entry') && (await frame()).stay)
  await click('.sh-content a.note-wiki', 'welcome')
  check('a [[link]], in the shell: the column follows', await showing('welcome.md', 'Alice\'s notebook') && (await frame()).stay)
  await shot('shell-seed-1300')
  await click('.sh-navcol .note-nav-item', 'Private')
  // A private note never reaches the pane logged out: the data browser asks for the address first and handles the 401
  // itself (its own Access denied panel). What matters here: nothing of it is shown, and no stale note stays up.
  const priv = await page.waitFor(() => new URL(location.href).searchParams.get('uri').endsWith('/private.md') && !document.querySelector('.note-body h1'), { timeout: 30000 }).then(() => true, () => false)
  await sleep(2500)
  check('logged out, a private note picked in the column: nothing of it is shown, and the last note is gone', priv && await page.evaluate(() => !/Only Alice may read this/.test(document.body.textContent) && !document.querySelector('.note-body h1')))
  await shot('shell-private-1300')

  await narrow(page)
  await page.goto(address(BASE + 'welcome.md'))
  check('back to a public note', await showing('welcome.md', 'Alice\'s notebook'))
  await sleep(600)
  f = await frame()
  let m = await measure(page)
  check('true 400 px in the shell: the column is a drawer behind a toggle; no sideways scroll', !f.nav && f.toggle && !m.sideways, JSON.stringify([f, m]))
  await shot('shell-400')
  await page.evaluate(() => document.querySelector('.sh-nav-toggle').click())
  await page.waitFor(() => { const n = document.querySelector('.sh-navcol'); return !n.hidden && n.getBoundingClientRect().width > 0 }, { timeout: 5000 })
  await sleep(400)
  m = await measure(page)
  check('true 400 px, the drawer open: the notes are there; no sideways scroll', !m.sideways && (await nav()).length === N, JSON.stringify(m))
  await shot('shell-400-nav')
  await click('.sh-navcol .note-nav-item', 'Shopping list')
  check('true 400 px: a note picked in the drawer opens', await showing('shopping-list.md', 'Shopping list'))
  m = await measure(page)
  check('true 400 px: a note with a very long word, in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await finish()
} catch (error) { await finish(error) }
