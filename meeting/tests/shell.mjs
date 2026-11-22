// The pane inside the suite shell (shell/suite-shell-pane.js), reusing the login meeting.mjs left: the sample meeting
// in the content column, its sections (Overview, then every item in order) in the shell's left column, no details
// button (the pane has no renderDetails), a web page opening in a new tab and a pod item opening in place inside the
// shell; then a meeting made here: adding a link updates the left column and shows a toast; no sideways scroll at
// 1300 px and a true 400 px (with the navigation drawer open too).
//   node tests/shell.mjs       (after meeting.mjs)
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { rmSync } from 'node:fs'
import path from 'node:path'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const SAMPLE = LAB + 'meeting/samples/planning/index.ttl#this'
const NAME = 's-' + Date.now().toString(36)
const BASE = POD + 'public/suite-data/meeting/' + NAME + '/'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'meeting', NAME)
const MEETING = BASE + 'index.ttl#this'

const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9536, dir: import.meta.dirname, login: false, resource: SAMPLE })
const inShell = (uri) => page.waitFor((u) => {
  const r = document.querySelector('.sh.suite-shell-pane[data-ready]')
  return !!r && new URL(location.href).searchParams.get('uri') === u && !!r.querySelector('.sh-content .mtg.meeting-pane .mtg-title') && !!r.querySelector('.sh-navcol .mtg-shell-nav')
}, { timeout: 45000, args: [uri] }).then(() => true, () => false)
const nav = () => page.evaluate(() => [...document.querySelectorAll('.sh-navcol .mtg-nav-item')].map(a => a.querySelector('.mtg-nav-label').textContent + (a.getAttribute('aria-current') ? '*' : '')))

try {
  await page.goto(address(SAMPLE))
  check('in the shell: the Meetings app draws the meeting, its sections in the left column', await inShell(SAMPLE))
  const seen = await page.evaluate(() => ({
    app: document.querySelector('.sh.suite-shell-pane').dataset.app,
    title: document.querySelector('.sh-content .mtg-title').textContent,
    chips: [...document.querySelectorAll('.sh-content .mtg-head .mtg-chip')].map(c => c.dataset.fact).join(),
    info: document.querySelector('.sh-details-btn') ? document.querySelector('.sh-details-btn').hidden : true,
    nested: document.querySelectorAll('.sh-navcol nav').length,
    caption: document.querySelector('.sh-navcol .mtg-caption') ? document.querySelector('.sh-navcol .mtg-caption').textContent : ''
  }))
  check('the Meetings app is current; the header card is in the content', seen.app === 'meetings' && seen.title === 'Planning the spring workshop' && seen.chips === 'When,Where', JSON.stringify(seen))
  check('no (i) button: the pane has no details; no nav inside the shell\'s nav', seen.info && seen.nested === 0, JSON.stringify(seen))
  const items = await nav()
  check('the left column: Overview (current), then every item in the list\'s order', items.join(' ; ') === 'Overview* ; Agenda ; Shared notes ; Chat ; Last year\'s report' && seen.caption === 'For this meeting', items.join(' ; '))
  const links = await page.evaluate(() => [...document.querySelectorAll('.sh-navcol a.mtg-nav-item')].map(a => [a.textContent, a.target, a.rel, a.getAttribute('href')]))
  check('a web page in the left column opens in a new tab (noopener); pod items are plain links', links[0][1] === '_blank' && /noopener/.test(links[0][2]) && links[0][3] === 'https://workshop.example.org/agenda' && links[2][1] === '' && /Chat\/chat\.ttl$/.test(links[2][3]), JSON.stringify(links))
  check('1300 px in the shell: no sideways scroll', !(await measure(page)).sideways)
  await shot('shell-1300')

  // A pod item opens in place, inside the shell.
  await page.evaluate(() => [...document.querySelectorAll('.sh-navcol a.mtg-nav-item')].find(a => a.textContent === 'Chat').click())
  const went = await page.waitFor(() => /Chat\/chat\.ttl/.test(decodeURIComponent(location.href) + ' ' + (document.querySelector('.sh-bar-title') || {}).textContent) && !!document.querySelector('.sh.suite-shell-pane') && !document.querySelector('.sh-content .mtg.meeting-pane'), { timeout: 20000 }).then(() => true, () => false)
  check('a pod item in the left column opens in place, still inside the shell', went, await page.evaluate(() => location.href))

  // A meeting of our own: adding a link redraws the left column and says so with a toast.
  await page.goto(address(SAMPLE))
  await inShell(SAMPLE)
  await page.evaluate((base) => { window.__mint = null; window.panes.byName('meeting-page').mintNew({ dom: document, session: { store: window.SolidLogic.store } }, { newBase: base, title: 'Shell check' }).then(r => { window.__mint = { ok: r.newInstance.value } }, e => { window.__mint = { error: String(e.message || e) } }) }, BASE)
  const made = await page.waitFor(() => window.__mint, { timeout: 30000 })
  check('a meeting is made for the shell test', made.ok === MEETING, JSON.stringify(made))
  await page.goto(address(MEETING))
  await inShell(MEETING)
  await page.waitFor(() => !!document.querySelector('.sh-content .mtg-add'), { timeout: 15000 }).catch(() => {})
  check('an empty meeting: just Overview on the left, an empty state in the content', (await nav()).join() === 'Overview*' && await page.evaluate(() => !!document.querySelector('.sh-content .mtg-empty .mtg-empty-icon')), (await nav()).join())
  await page.evaluate(() => { const f = document.querySelector('.sh-content .mtg-add'); f.querySelector('[name=name]').value = 'Agenda'; f.querySelector('[name=url]').value = 'https://board.example.org/agenda'; f.requestSubmit() })
  const added = await page.waitFor(() => [...document.querySelectorAll('.sh-navcol .mtg-nav-label')].map(l => l.textContent).join() === 'Overview,Agenda' && [...document.querySelectorAll('.sh-toasts .sh-toast')].some(t => /Agenda was added/.test(t.textContent)), { timeout: 30000 }).then(() => true, () => false)
  check('add a link in the shell: saved, the left column gains it, a toast says so', added, (await nav()).join())
  await sleep(500)
  await shot('shell-1300-edit')

  await narrow(page)
  await sleep(600)
  let m = await measure(page)
  check('true 400 px in the shell: no sideways scroll', m.innerWidth === 400 && !m.sideways, JSON.stringify(m))
  await shot('shell-400')
  const opened = await page.evaluate(async () => {
    const root = document.querySelector('.sh.suite-shell-pane')
    const b = document.querySelector('.sh-nav-toggle')
    for (let i = 0; i < 2 && root.dataset.nav !== 'open'; i++) { b.click(); await new Promise(resolve => setTimeout(resolve, 300)) }
    const nav = document.querySelector('.sh-navcol')
    return root.dataset.nav === 'open' && !nav.hidden && nav.getBoundingClientRect().width > 0 && !!nav.querySelector('.mtg-nav-item')
  })
  check('true 400 px: the toggle opens the navigation as a drawer, with the meeting\'s sections', opened)
  await sleep(400)
  m = await measure(page)
  check('true 400 px, the navigation drawer open: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400-nav')

  const errors = page.console.filter(l => /^exception/.test(l) && /meeting-pane/.test(l))
  check('no errors thrown in the page', errors.length === 0, errors.slice(0, 3).join(' | '))
  rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { rmSync(DIR, { recursive: true, force: true }); await finish(error) }
