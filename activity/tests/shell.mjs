// Activity inside the real suite shell, logged in, on Alice's sample folder: the shell lists Activity among its
// apps; switching the folder's view to Activity puts the filters in the shell's left column (not the content),
// a filter there narrows the stream, the (i) button opens "What was read" in the details column, a row opens
// its thing in the shell; no sideways scroll at 1300 px and a true 400 px.
//   node tests/shell.mjs
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, wide, measure } from '../../design/viewport.mjs'
import { BASE } from './setup.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const ALICE = BASE + 'alice/'
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9541, dir: import.meta.dirname, login: true, resource: ALICE })
const ready = () => page.waitFor(() => { const r = document.querySelector('.sh-root .act.suite-activity[data-ready]'); return !!r && r.dataset.unread === '0' }, { timeout: 40000 }).catch(() => false)
try {
  await page.goto(address(ALICE))
  const listed = await page.waitFor(() => !!document.querySelector('.sh-root [data-app="activity"]') && !!document.querySelector('.sh-root [data-pane="suite-activity"]'), { timeout: 40000 }).catch(() => false)
  check('the shell lists Activity among its apps, and as a view of the folder', !!listed)
  await page.evaluate(() => document.querySelector('.sh-root [data-pane="suite-activity"]').click())
  check('the folder shows as Activity inside the shell', !!await ready())
  await sleep(500)
  const s = await page.evaluate(() => {
    const content = document.querySelector('.sh-root .act.suite-activity')
    const nav = document.querySelector('.sh-navcol')
    return {
      inShell: content.classList.contains('act-in-shell'),
      chipsInContent: !!content.querySelector('[data-filter]'),
      navFilters: [...nav.querySelectorAll('.act-nav-item[data-filter]')].map(b => b.dataset.filter + '=' + b.querySelector('.act-nav-count').textContent).join(' '),
      navOpen: !nav.hidden,
      app: document.querySelector('.sh-root').dataset.app,
      rows: content.querySelectorAll('.act-item').length
    }
  })
  check('the shell marks Activity as the current app', s.app === 'activity', s.app)
  check('the filters are in the shell\'s left column, not in the content', s.inShell && !s.chipsInContent && s.navOpen && s.navFilters === 'all=17 files=3 photos=2 notes=4 contacts=4 boards=1 pads=1 polls=1 meetings=1', JSON.stringify(s))
  check('the stream is all there', s.rows === 17, String(s.rows))
  await shot('shell-1300')
  await page.evaluate(() => document.querySelector('.sh-navcol .act-nav-item[data-filter="photos"]').click())
  await sleep(300)
  const photos = await page.evaluate(() => [document.querySelectorAll('.sh-root .act.suite-activity .act-item').length, document.querySelector('.sh-root .act.suite-activity .act-title').textContent, document.querySelector('.sh-navcol .act-nav-item[data-filter="photos"]').getAttribute('aria-current')].join(' '))
  check('a filter in the left column narrows the stream and is marked', photos === '2 Photos page', photos)
  await page.evaluate(() => document.querySelector('.sh-navcol .act-nav-item[data-filter="all"]').click())
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await sleep(300)
  const details = await page.evaluate(() => { const d = document.querySelector('.sh-detcol'); return !d.hidden && d.textContent })
  check('the (i) button opens "What was read" in the details column', !!details && /What was read/.test(details) && /Folders read19 of at most 60/.test(details), String(details).slice(0, 160))
  await shot('shell-details')
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  let m = await measure(page)
  check('no sideways scroll at 1300 px', !m.sideways && !m.poking.length, JSON.stringify(m))
  await narrow(page, 400)
  await sleep(400)
  m = await measure(page)
  check('no sideways scroll at a true 400 px', m.innerWidth === 400 && !m.sideways && !m.poking.length, JSON.stringify(m))
  await shot('shell-400')
  await wide(page)
  await sleep(300)
  await page.evaluate(() => document.querySelector('.sh-root .act.suite-activity [data-uri$="notes/shopping.md"]').click())
  const went = await page.waitFor(() => !document.querySelector('.sh-root .act.suite-activity') && new URL(location.href).searchParams.get('uri'), { timeout: 20000 }).catch(() => '')
  const still = await page.evaluate(() => !!document.querySelector('.sh-root'))
  check('a row opens its thing, still inside the shell', went === ALICE + 'notes/shopping.md' && still, went + ' ' + still)
  await sleep(3000)
} catch (error) { await finish(error) }
await finish()
