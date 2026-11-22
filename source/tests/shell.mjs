// The source pane inside the suite shell, logged in (reusing the session source.mjs left): picked from the shell's
// "Other views" menu on a Markdown file, it reads, edits and saves in the shell's frame, content only. Then the same
// at a true 400 px (CDP device metrics, design/viewport.mjs). Writes only notes.md in suite-data/source/.
//   node tests/shell.mjs
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PORT, DATA, DATA_DIR, freshData, view, click, setText, settled } from './common.mjs'

freshData()
const SHELL = LAB + 'shell/suite-shell-pane.js'
const NOTE = DATA + 'notes.md'
const disk = () => readFileSync(path.join(DATA_DIR, 'notes.md'), 'utf8')
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: PORT, dir: import.meta.dirname, login: false, resource: NOTE })

const ready = () => page.waitFor((u) => { const r = document.querySelector('.sh.suite-shell-pane[data-ready]'); return !!r && r.querySelector('.sh-bar-title').textContent === u }, { timeout: 40000, args: [NOTE] }).then(() => true, () => false)
// Choose Source from the shell's "Other views" menu, as a person would.
async function pickSource () {
  await page.waitFor(() => { const b = document.querySelector('.sh-views-btn'); return b && !b.hidden }, { timeout: 20000 })
  await page.evaluate(() => document.querySelector('.sh-views-btn').click())
  await page.waitFor(() => !!document.querySelector('.sh-views .sh-menu-item[data-pane="source-lab"]'), { timeout: 10000 })
  await page.evaluate(() => document.querySelector('.sh-views .sh-menu-item[data-pane="source-lab"]').click())
  await page.waitFor(() => !!document.querySelector('.sh-content .src.source-pane .src-text'), { timeout: 30000 })
  await sleep(500)
}
const frame = () => page.evaluate(() => {
  const r = document.querySelector('.sh.suite-shell-pane')
  const vis = (n) => !!n && !n.hidden && n.getBoundingClientRect().width > 0
  return { nav: vis(r.querySelector('.sh-navcol')), details: vis(r.querySelector('.sh-detcol')), detailsBtn: vis(r.querySelector('.sh-details-btn')), inside: !!r.querySelector('.sh-content .src.source-pane') }
})

try {
  check('the shell opens on the Markdown file', await ready())
  await pickSource()
  let f = await frame()
  check('Source, picked from Other views, draws inside the shell\'s content column', f.inside)
  check('content only: no navigation column, no details', !f.nav && !f.details && !f.detailsBtn)
  let v = await view(page)
  check('in the shell it shows the file exactly as stored, with its type and size', v.text === disk() && /^notes\.md · text\/markdown · \d+ bytes$/.test(v.meta), v.meta)
  check('the sheet\'s tokens come from the shell (same primary colour)', await page.evaluate(() => getComputedStyle(document.querySelector('.src-btn-primary')).backgroundColor === 'rgb(0, 103, 158)'))
  check('the toolbar buttons are 44 px targets', await page.evaluate(() => [...document.querySelectorAll('.src-bar button')].filter(b => !b.hidden).every(b => b.getBoundingClientRect().height >= 44)))
  let m = await measure(page)
  check('no sideways scroll at 1300 px in the shell', !m.sideways, m.poking.join(' '))
  await shot('shell-1300')

  await click(page, 'Edit')
  const changed = v.text.replace('Saturday', 'Sunday')
  await setText(page, changed)
  await shot('shell-edit-1300')
  await click(page, 'Save'); await settled(page)
  v = await view(page)
  check('in the shell, Save writes the file, and the status line says Saved.', v.status === 'good :: Saved.' && disk() === changed, v.status)
  f = await frame()
  check('after saving it is still the Source view in the shell', f.inside && v.readOnly)
  check('"Saved." is a quiet status line: no box around it (the data browser styles every role=status)', await page.evaluate(() => { const st = getComputedStyle(document.querySelector('.src-toolbar .src-status')); return st.backgroundColor === 'rgba(0, 0, 0, 0)' && st.paddingLeft === '0px' && st.borderTopWidth === '0px' }))
  await shot('shell-saved-1300')

  await narrow(page, 400)
  await page.goto(address(NOTE))
  check('the shell opens again at 400 px', await ready())
  await pickSource()
  check('the page really is 400 px wide', await page.evaluate(() => innerWidth) === 400)
  m = await measure(page)
  check('no sideways scroll at a true 400 px in the shell', !m.sideways, m.poking.join(' '))
  await click(page, 'Edit')
  await setText(page, (await view(page)).text + 'one more line that is long enough to need a sideways scroll inside the text box\n')
  await sleep(200)
  m = await measure(page)
  check('editing at 400 px in the shell: still no sideways page scroll', !m.sideways && (await view(page)).dirty, m.poking.join(' '))
  await shot('shell-400')
  await click(page, 'Cancel')
  check('no page errors', !page.console.some(l => /^exception:/.test(l) && /source-pane|src-/.test(l)), page.console.filter(l => /^exception/.test(l)).join(' | ').slice(0, 200))
  await finish()
} catch (error) { await finish(error) }
