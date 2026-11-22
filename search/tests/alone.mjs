// The search page alone (no shell), logged in: a folder with more subfolders than the folder limit, a chain deeper
// than the depth limit, keyboard and Enter in the plain data browser, and both widths.
//   node tests/alone.mjs     logs in itself (no session from another file), then searches only this test's own trees
import { open, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, wide, measure } from '../../design/viewport.mjs'

const PANE = LAB + 'search/search-pane.js'
const BASE = POD + 'public/suite-data/search/'
const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9551, dir: import.meta.dirname, login: true, resource: BASE + 'many/' })

const shown = (uri) => page.waitFor((u) => { const r = document.querySelector('.se.suite-search-pane'); return !!r && r.isConnected && r.querySelector('.se-page-head .se-muted').textContent.endsWith(u) }, { timeout: 40000, args: [uri] }).then(() => true, () => false)
const search = async (q) => {
  await page.evaluate(() => { const i = document.querySelector('.se-page .se-input'); i.focus(); i.select() })
  await page.type(q)
  return page.waitFor((want) => { const r = document.querySelector('.se.suite-search-pane'); return r.dataset.done === 'yes' && r.dataset.query === want && !!r.querySelector('.se-group, .se-quiet') }, { timeout: 60000, args: [q] }).then(() => true, async () => {
    // say why, so a failure in a long run can be read from the log
    console.log('  search(' + q + ') did not settle: ' + await page.evaluate(() => { const r = document.querySelector('.se.suite-search-pane'); return r ? JSON.stringify({ ...r.dataset, status: r.querySelector('.se-status-text').textContent, input: r.querySelector('.se-input').value }) : 'no search page' }))
    return false
  })
}
const state = () => page.evaluate(() => {
  const r = document.querySelector('.se.suite-search-pane')
  const input = r.querySelector('.se-input')
  const a = input.getAttribute('aria-activedescendant')
  return {
    fetched: +r.dataset.fetched, capped: r.dataset.capped, status: r.querySelector('.se-status').textContent,
    titles: [...r.querySelectorAll('.se-row-title')].map(t => t.textContent),
    groups: [...r.querySelectorAll('.se-group')].map(g => g.dataset.group),
    active: a ? (document.getElementById(a) || {}).dataset.uri || '' : ''
  }
})
const key = async (k, vk) => { for (const type of ['rawKeyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }) }
const noSideways = async (what) => { const m = await measure(page); check(`no sideways scroll at ${m.innerWidth} px: ${what}`, !m.sideways, `scrollWidth ${m.scrollWidth}${m.poking.length ? '; past the edge: ' + m.poking.join(' ') : ''}`) }

try {
  // ---- the folder limit: many/ has 320 subfolders; 1 + 299 listings fit in 300
  check('alone, the pane opens first on a folder and draws a search page', await shown(BASE + 'many/'))
  check('an empty box shows the empty state', await page.evaluate(() => document.querySelector('.se-page .se-empty-title').textContent === 'Find a file or folder'))
  await shot('page-empty-1300')
  const L = await page.evaluate(async (url) => (await import(url)).default.limits, PANE)
  check('the limits read back from the pane: 300 folders, 8 levels', L.containers === 300 && L.depth === 8, JSON.stringify(L))
  check('typing searches inside this folder', await search('quince'))
  let s = await state()
  console.log(`  many/: ${s.fetched} folders; "${s.status}"`)
  check('exactly the limit of listings was fetched (many/ + 299 of its 320 boxes), and it says so', s.fetched === L.containers && s.capped === 'yes' && s.status.includes('limit (' + L.containers + ')'), `${s.fetched}: ${s.status}`)
  check('a file inside the limit is found (box-005)', s.titles.includes('quince-in-box-005.txt'), s.titles.join(', '))
  check('a file past the limit is not (box-320, the 321st folder)', !s.titles.includes('quince-in-box-320.txt'))
  await search('box-320')
  s = await state()
  check('folders past the limit are still found by their own name (from their parent\'s listing)', s.titles.includes('box-320') && s.groups[0] === 'folders', s.titles.length + ' rows')
  await shot('page-cap-1300')

  // ---- the depth limit: deep/level-1/…/level-10; folders down to 8 levels are read
  await page.goto(address(BASE + 'deep/'))
  check('the search page for deep/', await shown(BASE + 'deep/'))
  check('search for quince-at', await search('quince-at'))
  await page.evaluate(() => [...document.querySelectorAll('.se-page .se-more')].forEach(b => b.click()))
  await sleep(300)
  s = await state()
  const levels = s.titles.map(t => +(/level-(\d+)/.exec(t) || [])[1]).sort((a, b) => a - b)
  check('files in folders 1 to 8 levels down are found, 9 and 10 are not', levels.join(',') === Array.from({ length: L.depth }, (_, i) => i + 1).join(','), levels.join(','))
  check('the status says deeper folders were not searched', s.status.includes('more than ' + L.depth + ' levels down'), s.status)
  check('nothing was fetched past the depth limit (deep/ + 8 levels = 9 listings)', s.fetched === L.depth + 1, String(s.fetched))

  // ---- keyboard and Enter, in the plain data browser
  await page.evaluate(() => document.querySelector('.se-page .se-input').focus())
  await key('ArrowDown', 40)
  s = await state()
  check('Down highlights the first result', /quince-at-level-1\.txt$/.test(s.active), s.active)
  await key('ArrowDown', 40)
  await key('ArrowUp', 38)
  s = await state()
  check('Down, Up: back on the first', /quince-at-level-1\.txt$/.test(s.active), s.active)
  await noSideways('results')
  await key('Enter', 13)
  const opened = await page.waitFor(() => /A note 1 folders down/.test(document.body.textContent) && [...document.querySelectorAll('input')].some(i => i.value.endsWith('/deep/level-1/quince-at-level-1.txt')), { timeout: 15000 }).then(() => true, () => false)
  check('Enter opens the result in the data browser', opened)
  await shot('page-opened-1300')

  // ---- a true 400 px page
  await page.goto(address(BASE))
  await shown(BASE)
  await narrow(page, 400)
  await search('quince')
  await noSideways('the search page with results')
  await shot('page-400')
  await wide(page)
  await finish()
} catch (error) { await finish(error) }
