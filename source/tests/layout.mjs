// The source pane at a phone's width, logged in (reusing the session source.mjs left): reading, then editing.
// A true 400 px page (CDP device metrics, design/viewport.mjs), not the helper's window width.
//   node tests/layout.mjs 400
import { open, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { PANE, PORT, DATA, openSource, view, click, setText } from './common.mjs'
const width = +(process.argv[2] || 400)
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, login: false, resource: DATA + 'people.ttl' })
const sideways = async () => { const m = await measure(page); return m.sideways ? 'scrollWidth ' + m.scrollWidth + ' ' + m.poking.join(' ') : '' }
try {
  await narrow(page, width)
  await openSource(page, address, DATA + 'notes.md')
  check('the page really is ' + width + ' px wide', await page.evaluate(() => innerWidth) === width)
  let v = await view(page)
  check(width + ' px: still logged in, so Edit is offered', v.buttons.join(',') === 'Copy,Edit', v.buttons.join(','))
  const r1 = await sideways()
  check(width + ' px: a long line scrolls inside the text box, not the page', !r1 && !v.wide && await page.evaluate(() => { const a = document.querySelector('.src-text'); return a.scrollWidth > a.clientWidth }))
  await shot('read-' + width)
  await click(page, 'Edit')
  await setText(page, v.text + 'one more line\n')
  await page.evaluate(() => { const a = document.querySelector('.src-text'); a.scrollLeft = 400; a.scrollTop = 9999; a.dispatchEvent(new Event('scroll')) })
  await sleep(200)
  v = await view(page)
  const r2 = await sideways()
  check(width + ' px: editing, no sideways page scroll', !r2 && !v.wide && v.dirty, r2)
  check(width + ' px: the line numbers follow the text when it scrolls', await page.evaluate(() => { const a = document.querySelector('.src-text'); const g = document.querySelector('.src-gutter'); return g.scrollTop === a.scrollTop }))
  await shot('edit-' + width)
  await click(page, 'Cancel')
  await openSource(page, address, DATA + 'people.ttl')
  const r3 = await sideways()
  check(width + ' px: Turtle, no sideways page scroll', !r3 && !(await view(page)).wide, r3)
  await finish()
} catch (error) { await finish(error) }
