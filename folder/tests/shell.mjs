// The pane inside the suite shell (shell/suite-shell-pane.js lists it as the Files app), reusing the login
// write.mjs left: the folder in the content, "All files" / "Recent" in the shell's left column, a file's details in
// its right column with the Sharing pane in a tab, the folder's own details from the shell's (i) button, and no
// sideways scroll at 1300 px and a true 400 px (design/viewport.mjs).
//   node tests/shell.mjs       (after write.mjs 1300)
import { open, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { BASE } from './setup.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const GARDEN = BASE + 'garden/'
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.sh-content .fl-row')].map(r => r.dataset.name + (r.classList.contains('fl-isdir') ? '/' : '')))

const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9511, dir: import.meta.dirname, login: false, resource: GARDEN })
try {
  const shown = await page.waitFor(() => !!document.querySelector('.sh-content .fl.folder-lab-pane') && document.querySelectorAll('.sh-content .fl-row').length === 8 && !document.querySelector('.sh-content .fl-write').hidden, { timeout: 45000 }).catch(() => false)
  check('in the shell: Files draws the folder in the content, with the write tools for the owner', !!shown)
  check('the Files app is the current one', (await page.evaluate(() => document.querySelector('.sh-root').dataset.app)) === 'files')
  const nav = await page.evaluate(() => [...document.querySelectorAll('.sh-navcol .fl-nav-item')].map(b => b.textContent + (b.getAttribute('aria-current') ? '*' : '')))
  check('the shell\'s left column: All files (current) and Recent', nav.join() === 'All files*,Recent', nav.join())

  // A file's details in the shell's right column.
  await page.evaluate(() => document.querySelector('.sh-content .fl-row[data-name="bob-watering.md"] .fl-row-main').click())
  const det = await page.waitFor(() => { const t = document.querySelector('.sh-detcol:not([hidden]) .fl-details-title'); return t && t.textContent === 'bob-watering.md' }, { timeout: 8000 }).catch(() => false)
  const info = await page.evaluate(() => ({ props: [...document.querySelectorAll('.sh-detcol .fl-props dt')].map(t => t.textContent + '=' + t.nextElementSibling.textContent).join('; '), selected: [...document.querySelectorAll('.sh-content .fl-row[aria-selected="true"]')].map(r => r.dataset.name).join(), inline: !!document.querySelector('.sh-content .fl-inline-details') }))
  check('a row click opens its details in the shell\'s right column (not under the row), the row marked', !!det && info.selected === 'bob-watering.md' && !info.inline && /Size=68 B/.test(info.props) && /Modified=/.test(info.props), JSON.stringify(info))
  await page.evaluate(() => document.querySelector('.sh-detcol .fl-tab-sharing').click())
  const shr = await page.waitFor(() => !!document.querySelector('.sh-detcol .fl-panel-sharing:not([hidden]) .sharing-lab-pane'), { timeout: 20000 }).catch(() => false)
  check('the Sharing tab hosts the Sharing pane for that file', !!shr, await page.evaluate(() => (document.querySelector('.sh-detcol .fl-panel-sharing') || {}).innerText?.slice(0, 120) || 'no panel'))
  await sleep(1500)
  await shot('shell-1300-sharing')
  check('1300 px in the shell, details open: no sideways scroll', !(await measure(page)).sideways)

  // Another row replaces the details; an image shows a preview.
  await page.evaluate(() => document.querySelector('.sh-content .fl-row[data-name="layout.svg"] .fl-date').click())
  const prev = await page.waitFor(() => { const i = document.querySelector('.sh-detcol .fl-preview'); return i && !i.hidden && i.naturalWidth > 0 && document.querySelector('.sh-detcol .fl-details-title').textContent === 'layout.svg' }, { timeout: 10000 }).catch(() => false)
  check('another row replaces the details; an image shows its preview; only that row is marked', !!prev && (await page.evaluate(() => [...document.querySelectorAll('.sh-content .fl-row[aria-selected="true"]')].map(r => r.dataset.name).join())) === 'layout.svg')
  await shot('shell-1300')
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await sleep(300)
  check('closing the column clears the marked row', await page.evaluate(() => !document.querySelector('.sh-content .fl-row[aria-selected="true"]') && document.querySelector('.sh-detcol').hidden))

  // The shell's (i) button: the folder itself.
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  const folder = await page.waitFor(() => { const t = document.querySelector('.sh-detcol:not([hidden]) .fl-details-title'); return t && t.textContent === 'garden' }, { timeout: 8000 }).catch(() => false)
  check('the (i) button shows the folder: its name and what is in it', !!folder && /3 folders, 5 files/.test(await page.evaluate(() => document.querySelector('.sh-detcol .fl-details-sub').textContent)))
  await page.evaluate(() => document.querySelector('.sh-details-close').click())

  // Recent: this folder's files, newest first; All files goes back to the pod's root.
  await page.evaluate(() => document.querySelector('.sh-navcol .fl-nav-item[data-view="recent"]').click())
  await sleep(300)
  const recent = await rows(page)
  check('Recent: only the files, no folders, no sort header; Recent is marked', recent.length === 5 && !recent.some(n => n.endsWith('/')) && await page.evaluate(() => !document.querySelector('.sh-content .fl-head') && document.querySelector('.sh-navcol .fl-nav-item[aria-current]').dataset.view === 'recent'), recent.join(' '))
  await shot('shell-1300-recent')
  await page.evaluate(() => document.querySelector('.sh-navcol .fl-nav-item[data-view="all"]').click())
  const atRoot = await page.waitFor((root) => document.querySelector('.sh-content .fl-crumbs .fl-here')?.textContent === 'me' && document.querySelector('.sh-content .fl-head') && location.href.includes(encodeURIComponent(root)), { timeout: 30000, args: [POD] }).catch(() => false)
  check('All files: the pod\'s root folder, in the Files app, All files marked', !!atRoot && await page.evaluate(() => document.querySelector('.sh-navcol .fl-nav-item[aria-current]')?.dataset.view === 'all'))

  // Widths
  await page.goto(address(GARDEN))
  await page.waitFor(() => document.querySelectorAll('.sh-content .fl-row').length === 8, { timeout: 45000 })
  await sleep(500)
  check('1300 px in the shell: no sideways scroll', !(await measure(page)).sideways)
  await narrow(page)
  // Load again at 400 px, as a phone would: the shell decides at mount that the navigation is a closed drawer.
  await page.goto(address(GARDEN))
  await page.waitFor(() => document.querySelectorAll('.sh-content .fl-row').length === 8 && innerWidth === 400, { timeout: 45000 })
  await sleep(600)
  let m = await measure(page)
  check('true 400 px in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400')
  await page.evaluate(() => document.querySelector('.sh-content .fl-row[data-name="bob-watering.md"] .fl-row-main').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .fl-details-title'), { timeout: 8000 })
  await page.evaluate(() => document.querySelector('.sh-detcol .fl-tab-sharing').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol .sharing-lab-pane'), { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  m = await measure(page)
  check('true 400 px, details with Sharing open in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400-details')
  const errors = page.console.filter(l => /exception/.test(l) && /folder-pane|fl-/.test(l))
  check('no errors from the pane', !errors.length, errors.join(' | ').slice(0, 300))
  await finish()
} catch (error) { await finish(error) }
