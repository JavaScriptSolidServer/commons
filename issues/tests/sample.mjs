// The sample tracker and one of its issues, read without logging in, at 1300 and 400 px.
//   node tests/sample.mjs
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
// The copy of the design sheet in the pane is current (design/embed.mjs --check).
const sheet = spawnSync(process.execPath, [path.join(import.meta.dirname, '../../design/embed.mjs'), path.join(import.meta.dirname, '../issues-pane.js'), '--check'], { encoding: 'utf8' })
console.log((sheet.status === 0 ? 'PASS' : 'FAIL') + ' the design block is current (' + (sheet.stdout + sheet.stderr).trim() + ')')
if (sheet.status !== 0) process.exit(1)
const PANE = LAB + 'issues/issues-pane.js'
const TRACKER = LAB + 'issues/samples/shed/index.ttl#this'
const ISSUE = LAB + 'issues/samples/shed/state.ttl#Iss4'
for (const width of [1300, 400]) {
  const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9517, dir: import.meta.dirname, width, login: false, fresh: true, resource: TRACKER })
  try {
    await page.waitFor(() => document.querySelectorAll('.iss-card').length === 7, { timeout: 40000 })
    if (width === 400) await narrow(page) // a true 400 px page (design/viewport.mjs), not the helper's ~500 px window
    await sleep(1500)
    const seen = await page.evaluate(() => ({
      title: document.querySelector('.iss-title').textContent,
      meta: document.querySelector('.iss-meta').textContent,
      cols: [...document.querySelectorAll('.iss-col')].map(c => c.querySelector('.iss-col-name').textContent + ' ' + c.querySelector('.iss-count').textContent),
      visible: [...document.querySelectorAll('.iss-col')].filter(c => c.offsetParent !== null).length,
      tabs: [...document.querySelectorAll('.iss-coltabs button')].filter(b => b.offsetParent !== null).length,
      first: (() => { const c = document.querySelector('.iss-col .iss-card'); return c.querySelector('.iss-card-title').textContent + '|' + c.querySelector('.iss-desc').textContent + '|' + c.querySelector('.iss-who').textContent + '|' + c.querySelector('.iss-age').textContent })(),
      doing: document.querySelector('.iss-card[data-issue$="#Iss1"]').textContent,
      controls: document.querySelectorAll('.iss-move, .iss-new, .iss-edit, .iss-take').length,
      status: document.querySelector('.iss-msg').textContent,
      wide: document.documentElement.scrollWidth > innerWidth,
      refresh: !!document.querySelector('.iss-refresh'),
      tabHeights: [...document.querySelectorAll('.iss-coltabs button')].filter(b => b.offsetParent !== null).map(b => Math.round(b.getBoundingClientRect().height))
    }))
    check(width + ' px: title and count', seen.title === 'Garden shed' && seen.meta === '7 issues · 4 open', seen.title + ' / ' + seen.meta)
    check(width + ' px: one column per state, open states first, in the tracker\'s order', seen.cols.join(', ') === 'New 2, In progress 1, Waiting 1, Done 2, Won\'t do 1', seen.cols.join(', '))
    check(width + ' px: newest first; a card has title, description, assignee and age', /^Pick a paint colour\|\|Carol\|(today|\d+ days?)$/.test(seen.first), seen.first)
    check(width + ' px: a long description is cut short; names come from the data', /Level the base/.test(seen.doing) && /…/.test(seen.doing) && /Bob/.test(seen.doing), seen.doing)
    check(width + ' px: logged out, no controls, and it says so', seen.controls === 0 && /Log in/.test(seen.status), seen.controls + ' ' + seen.status)
    check(width + ' px: logged out, Refresh is still offered', seen.refresh)
    if (width === 400) {
      check('400 px: the column switches are 44 px targets', seen.tabHeights.length === 5 && seen.tabHeights.every(h => h >= 44), seen.tabHeights.join())
      check('400 px: one column at a time, with tabs', seen.visible === 1 && seen.tabs === 5, seen.visible + ' visible, ' + seen.tabs + ' tabs')
      await page.evaluate(() => [...document.querySelectorAll('.iss-coltabs button')].find(b => /^Done/.test(b.textContent)).click())
      await sleep(300)
      const shown = await page.evaluate(() => [...document.querySelectorAll('.iss-col')].filter(c => c.offsetParent !== null).map(c => c.querySelector('.iss-col-name').textContent).join())
      check('400 px: a tab shows its column', shown === 'Done', shown)
      await shot('sample-400-done')
      await page.evaluate(() => [...document.querySelectorAll('.iss-coltabs button')][0].click())
    } else {
      check('1300 px: every column shows at once, no tabs', seen.visible === 5 && seen.tabs === 0, seen.visible + ' visible, ' + seen.tabs + ' tabs')
    }
    check(width + ' px: no sideways scroll on the board', !seen.wide && !(await measure(page)).sideways)
    if (width === 1300) check('1300 px: the columns scroll inside the board, not the page', await page.evaluate(() => { const b = document.querySelector('.iss-board'); return getComputedStyle(b).overflowX === 'auto' && b.getBoundingClientRect().right <= innerWidth }))
    await shot('sample-' + width)

    await page.goto(address(ISSUE))
    await page.waitFor(() => !!document.querySelector('.iss-one'), { timeout: 40000 })
    await sleep(1000)
    const one = await page.evaluate(() => ({ title: document.querySelector('.iss-title').textContent, back: document.querySelector('.iss-back').textContent + '|' + document.querySelector('.iss-back').getAttribute('href'), text: document.querySelector('.iss-one').textContent, wide: document.documentElement.scrollWidth > innerWidth }))
    check(width + ' px: one issue in full', one.title === 'Fit the window' && /Waiting/.test(one.text) && /glazier to cut the pane to size\. He said the end of the month\./.test(one.text) && /by Bob/.test(one.text) && /Assigned to Alice/.test(one.text), one.text.slice(0, 160))
    check(width + ' px: with a link back to its tracker', /Garden shed/.test(one.back) && /index\.ttl#this$/.test(one.back), one.back)
    check(width + ' px: no sideways scroll on an issue', !one.wide)
    await shot('sample-issue-' + width)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}
