// The pane inside the suite shell (shell/suite-shell-pane.js), reusing the login document.mjs left: the shell picks
// this pane for a text file and a CSV (it is in the shell's SUITE_APPS as a viewer), shows it content only with no
// navigation column, the shell's (i) button shows the file's details (kind, size, lines, address), the hostile page
// still runs nothing inside the shell, and nothing scrolls sideways at 1300 px and a true 400 px.
//   node tests/shell.mjs       (after document.mjs)
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { setup, DATA, PORT, SETTLED } from './setup.mjs'

setup()
const SHELL = LAB + 'shell/suite-shell-pane.js'
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: PORT, dir: import.meta.dirname, login: false, resource: DATA + 'notes.txt' })

const inShell = (uri) => page.waitFor((u) => {
  const r = document.querySelector('.sh.suite-shell-pane[data-ready]')
  return !!r && new URL(location.href).searchParams.get('uri') === u && !!r.querySelector('.sh-content .doc.document-lab-pane')
}, { timeout: 45000, args: [uri] }).then(() => true, () => false)
const settled = () => page.waitFor(SETTLED, { timeout: 40000 }).then(() => true, () => false)
const details = () => page.evaluate(() => {
  const col = document.querySelector('.sh-detcol:not([hidden])')
  if (!col) return null
  const props = {}
  const dts = [...col.querySelectorAll('.doc-props dt')]
  for (const dt of dts) props[dt.textContent] = dt.nextElementSibling.textContent
  return { title: col.querySelector('.doc-details-title')?.textContent, sub: col.querySelector('.doc-details-sub')?.textContent, props }
})

try {
  await page.goto(address(DATA + 'notes.txt'))
  check('in the shell: a text file is drawn by this pane in the content column', await inShell(DATA + 'notes.txt') && await settled())
  const frame = await page.evaluate(() => ({
    text: !!document.querySelector('.sh-content .doc-text'),
    nav: document.querySelector('.sh-navcol') ? document.querySelector('.sh-navcol').children.length : 0,
    info: !!document.querySelector('.sh-details-btn') && !document.querySelector('.sh-details-btn').hidden,
    font: getComputedStyle(document.querySelector('.doc.document-lab-pane')).fontSize
  }))
  check('content only: no navigation column; the shell offers its (i) button', frame.text && frame.nav === 0 && frame.info, JSON.stringify(frame))
  check('in the shell, the suite type scale (15 px body)', frame.font === '15px', frame.font)

  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await page.waitFor(() => /Text/.test(document.querySelector('.sh-detcol:not([hidden]) .doc-details-sub')?.textContent || ''), { timeout: 8000 }).catch(() => {})
  let d = await details()
  check('(i): the file\'s details in the shell\'s right column: name, kind, size, lines, address', !!d && d.title === 'notes.txt' && d.props.Kind === 'Text' && /bytes|KB/.test(d.props.Size) && /^\d+$/.test(d.props.Lines) && d.props.Address === DATA + 'notes.txt' && d.props['Content type'] === 'text/plain', JSON.stringify(d))
  check('the details\' address link is safe (new tab, noopener)', await page.evaluate(() => { const a = document.querySelector('.sh-detcol .doc-props a'); return !!a && a.target === '_blank' && /noopener/.test(a.rel) }))
  await shot('shell-1300')
  check('1300 px in the shell, details open: no sideways scroll', !(await measure(page)).sideways)
  await page.evaluate(() => document.querySelector('.sh-details-close').click())

  await page.goto(address(DATA + 'team.csv'))
  check('in the shell: a CSV', await inShell(DATA + 'team.csv') && await settled())
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .doc-props'), { timeout: 8000 }).catch(() => {})
  d = await details()
  check('(i) on a CSV: its rows are counted', !!d && d.props.Rows === '3 under the header' && d.props.Kind === 'CSV', JSON.stringify(d))
  await page.evaluate(() => document.querySelector('.sh-details-close').click())

  await page.goto(address(DATA + 'hostile.html'))
  check('in the shell: the hostile page', await inShell(DATA + 'hostile.html') && await settled())
  await sleep(1500)
  const hostile = await page.evaluate(() => ({ sandbox: document.querySelector('.sh-content .doc-frame')?.getAttribute('sandbox'), pwned: window.__pwned === undefined ? null : window.__pwned, title: document.title, stored: (() => { try { return localStorage.getItem('pwned') } catch { return 'unreadable' } })() }))
  check('hostile, in the shell: sandboxed, ran nothing, wrote nothing', hostile.sandbox === '' && hostile.pwned === null && !/PWNED/.test(hostile.title) && hostile.stored === null, JSON.stringify(hostile))
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .doc-props'), { timeout: 8000 }).catch(() => {})
  d = await details()
  check('(i) on an HTML page says it is shown without scripts', !!d && /Without scripts/.test(d.props.Shown || ''), JSON.stringify(d))
  check('(i) on an HTML page on this site: the address is text, not a link to open it here', await page.evaluate(() => !document.querySelector('.sh-detcol .doc-props a')) && d.props.Address === DATA + 'hostile.html')
  await page.evaluate(() => document.querySelector('.sh-details-close').click())

  await narrow(page)
  await page.goto(address(DATA + 'notes.txt'))
  await inShell(DATA + 'notes.txt'); await settled()
  await sleep(600)
  let m = await measure(page)
  check('true 400 px in the shell: no sideways scroll', m.innerWidth === 400 && !m.sideways, JSON.stringify(m))
  await shot('shell-400')
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .doc-props'), { timeout: 8000 }).catch(() => {})
  await sleep(400)
  m = await measure(page)
  check('true 400 px, details open in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400-details')
  await page.goto(address(DATA + 'team.csv'))
  await inShell(DATA + 'team.csv'); await settled()
  await sleep(600)
  m = await measure(page)
  check('true 400 px in the shell, a CSV: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400-csv')

  const errors = page.console.filter(l => /^exception/.test(l) && /document-pane/.test(l))
  check('no errors thrown in the page', errors.length === 0, errors.slice(0, 3).join(' | '))
  await finish()
} catch (error) { await finish(error) }
