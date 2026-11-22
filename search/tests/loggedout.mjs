// Logged out (a clean browser): the header box says to log in instead of walking; the search page still searches
// what is public, and says what it could not read.
//   node tests/loggedout.mjs
import { open, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const PANE = LAB + 'search/search-pane.js'
const BASE = POD + 'public/suite-data/search/'
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9552, dir: import.meta.dirname, login: false, fresh: true, resource: BASE })

try {
  const ok = await page.waitFor(() => { const r = document.querySelector('.sh.suite-shell-pane[data-ready]'); return !!r && r.dataset.loggedIn === 'no' }, { timeout: 40000 }).then(() => true, () => false)
  check('the shell opens, logged out', ok)
  await narrow(page, 400)
  await page.evaluate(() => document.querySelector('.sh-header-search input').focus())
  await page.type('quince')
  const said = await page.waitFor(() => { const d = document.querySelector('[data-search="dropdown"]'); return !!d && !d.hidden && d.dataset.loggedIn === 'no' && d.querySelector('.se-results').textContent }, { timeout: 15000 }).catch(() => '')
  check('the dropdown asks to log in, and walks nothing', /Log in to search/.test(said) && await page.evaluate(() => !document.querySelector('[data-search="dropdown"]').dataset.fetched), said)
  const m = await measure(page)
  check('no sideways scroll at 400 px, logged out', !m.sideways, String(m.scrollWidth))
  await shot('loggedout-header-400')
  await page.evaluate(() => document.querySelector('.sh-header-search input').closest('form').requestSubmit())
  const opened = await page.waitFor(() => { const r = document.querySelector('.sh-content .se.suite-search-pane'); return !!r && r.dataset.done === 'yes' && r.dataset.query === 'quince' && !!r.querySelector('.se-group') }, { timeout: 60000 }).then(() => true, () => false)
  check('Enter (nothing highlighted) opens the search page in the shell with the words kept; logged out it searches public folders', opened && await page.evaluate(() => [...document.querySelectorAll('.sh-content .se-row-title')].some(t => t.textContent === 'Quince photos') && !document.querySelector('[data-search="dropdown"]:not([hidden])')))
  await shot('loggedout-enter-400')

  // The search page alone, logged out: on the public sample folder it finds the public files; on the pod root the
  // private folders right under it (private/, settings/, inbox/: read first, whatever else the pod holds) are counted
  // as unreadable, not shown as errors.
  const alone = async (uri, q) => {
    await page.goto(`${address(BASE).split('?')[0]}?pane=${encodeURIComponent(PANE)}&uri=${encodeURIComponent(uri)}`)
    const shown = await page.waitFor(() => !!document.querySelector('.se.suite-search-pane .se-input'), { timeout: 40000 }).then(() => true, () => false)
    await page.evaluate(() => document.querySelector('.se-page .se-input').focus())
    await page.type(q)
    await page.waitFor((want) => { const r = document.querySelector('.se.suite-search-pane'); return r.dataset.done === 'yes' && r.dataset.query === want }, { timeout: 60000, args: [q] }).catch(() => {})
    return { shown, ...await page.evaluate(() => { const r = document.querySelector('.se.suite-search-pane'); return { titles: [...r.querySelectorAll('.se-row-title')].map(t => t.textContent), status: r.querySelector('.se-status-text').textContent } }) }
  }
  let s = await alone(BASE, 'quince')
  check('alone, logged out: the search page on the public sample folder', s.shown)
  check('public files are found', s.titles.includes('Quince photos') && s.titles.some(t => /^quince-.*\.md$/.test(t)), s.titles.slice(0, 6).join(', '))
  await shot('loggedout-page-400')
  s = await alone(POD, 'quince')
  console.log('  ' + s.status)
  check('alone, logged out, on the pod root: folders it may not read are counted, not shown as errors', s.shown && /\d+ could not be read/.test(s.status), s.status)
  const m2 = await measure(page)
  check('no sideways scroll at 400 px, the page logged out', !m2.sideways, String(m2.scrollWidth))
  await finish()
} catch (error) { await finish(error) }
