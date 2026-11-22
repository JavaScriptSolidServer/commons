// The samples, read without logging in, at 1300 and 400 px: each kind of file shows, nothing
// scrolls sideways, the hostile page runs nothing, and a private file says it is private.
// 400 is a TRUE 400 px page (design/viewport.mjs: CDP device metrics), not the helper's 400 px window.
//   node tests/sample.mjs 1300   (or 400)
import { open, sleep, config } from '../../lib/lib.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { narrow, measure } from '../../design/viewport.mjs'
import { setup, DATA, SAMPLES, PANE, PORT, SETTLED, SEEN, DIRECT } from './setup.mjs'

setup()
const HERE = config.lab + 'document/samples/'
const sample = (f) => readFileSync(path.join(SAMPLES, f), 'utf8')

const width = +(process.argv[2] || 1300)
{
  const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, width, login: false, fresh: true, resource: HERE + 'welcome.html' })
  const view = async (uri) => {
    await page.goto(address(uri))
    const ok = await page.waitFor(SETTLED, { timeout: 40000 }).catch(() => false)
    await sleep(1200)
    if (!ok) return null
    const seen = await page.evaluate(SEEN)
    const m = await measure(page)
    seen.wide = seen.wide || m.sideways
    seen.poking = m.poking.join(' ') + ' @' + m.innerWidth
    return seen
  }
  try {
    if (width === 400) await narrow(page)
    check(width + ' px: the page really is ' + width + ' px wide', await page.evaluate(() => innerWidth) === width, String(await page.evaluate(() => innerWidth)))
    let seen = await view(HERE + 'welcome.html')
    check(width + ' px, logged out: an HTML page shows in a sandboxed frame', !!seen && seen.frame && seen.frame.sandbox === '' && /^Shown without scripts\./.test(seen.note), seen && seen.note)
    check(width + ' px: no sideways scroll (HTML)', !seen.wide, seen.poking)
    await shot('html-' + width)

    seen = await view(HERE + 'hostile.html')
    check(width + ' px: the hostile page ran nothing', !!seen && seen.pwned === null && !/PWNED/.test(seen.title) && seen.stored === null, seen && JSON.stringify([seen.pwned, seen.title]))
    check(width + ' px: no sideways scroll (hostile)', !seen.wide, seen.poking)

    const look = await page.evaluate(() => { const r = document.querySelector('.doc.document-lab-pane'); const h = r.querySelector('.doc-head').getBoundingClientRect(); const b = [...r.querySelectorAll('.doc-links a')].map(a => a.getBoundingClientRect()); return { root: r.classList.contains('doc-root'), font: getComputedStyle(r).fontSize, head: h.height, buttons: b.every(x => x.width >= 44 && x.height >= 44), named: [...r.querySelectorAll('.doc-links a')].every(a => a.title && a.querySelector('.doc-icon') && a.querySelector('.doc-sr')) } })
    check(width + ' px: the suite type scale, a slim header, actions as 44 px icon buttons with names', look.root && look.font === '15px' && look.buttons && look.named && look.head <= (width === 400 ? 140 : 70), JSON.stringify(look))

    seen = await view(HERE + 'notes.txt')
    check(width + ' px: text shows as itself', !!seen && seen.pre && seen.pre.text === sample('notes.txt'))
    check(width + ' px: no sideways scroll (a long line wraps)', !seen.wide, seen.poking)
    await shot('text-' + width)

    seen = await view(HERE + 'team.csv')
    check(width + ' px: CSV shows as a table', !!seen && seen.table && seen.table.rows.length === 3)
    check(width + ' px: no sideways scroll (the table scrolls in its own box)', !seen.wide, seen.poking)
    await shot('csv-' + width)

    seen = await view(HERE + 'minutes.pdf')
    check(width + ' px: the PDF shows, with a download link', !!seen && seen.object && seen.object.data.startsWith('blob:') && seen.links.some(l => l.startsWith('Download|')))
    check(width + ' px: no sideways scroll (PDF)', !seen.wide, seen.poking)
    await sleep(1200)
    await shot('pdf-' + width)

    if (width === 1300) {
      await page.goto(address(DATA + 'private.txt'))
      await sleep(2500)
      const shown = await page.evaluate(DIRECT, DATA + 'private.txt')
      check('logged out, a private file: it says so and shows nothing', shown.bad && /This file is private\. Log in/.test(shown.state) && !shown.shown, shown.state)
      await shot('private-1300')
    }
  } catch (error) { await finish(error) }
  await finish()
}
