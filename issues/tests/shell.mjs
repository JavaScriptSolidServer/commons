// The Boards app inside the suite shell (shell/suite-shell-pane.js), logged in: the boards in the shell's left column
// (the current one marked, with its open count; another board already seen is listed and opens), the columns in the
// content, a card's details in the shell's right column (move and edit there save to the pod and say so with a toast),
// the board's own details from the shell's (i) button, the columns scrolling inside the board and not the page at
// 1300 px, and a true 400 px page (design/viewport.mjs) with and without the details open.
// Copies the sample tracker to suite-data/issues/ twice (shell-a, shell-b) and removes both at the end (KEEP=1 keeps them).
//   node tests/shell.mjs
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const SAMPLE = path.join(import.meta.dirname, '..', 'samples', 'shed')
const DATA = path.join(config.podDir, 'public', 'suite-data', 'issues')
const BASE = POD + 'public/suite-data/issues/'
const A = BASE + 'shell-a/index.ttl#this'
const B = BASE + 'shell-b/index.ttl#this'
for (const [folder, name] of [['shell-a', 'Garden shed'], ['shell-b', 'Allotment']]) {
  rmSync(path.join(DATA, folder), { recursive: true, force: true })
  mkdirSync(path.join(DATA, folder), { recursive: true })
  writeFileSync(path.join(DATA, folder, 'index.ttl'), readFileSync(path.join(SAMPLE, 'index.ttl'), 'utf8').replace('dc:title "Garden shed"', `dc:title "${name}"`))
  writeFileSync(path.join(DATA, folder, 'state.ttl'), readFileSync(path.join(SAMPLE, 'state.ttl'), 'utf8'))
}
// The pod may keep a changed file as JSON-LD or as Turtle: find the issue's statements either way.
const stateFile = () => readFileSync(path.join(DATA, 'shell-a', 'state.ttl'), 'utf8')
const issueSays = (end, pattern) => {
  const text = stateFile()
  try {
    const j = JSON.parse(text)
    const nodes = Array.isArray(j) ? j : (j['@graph'] || [j])
    const n = nodes.find(x => (x['@id'] || '').endsWith(end))
    return !!n && pattern.test(JSON.stringify(n))
  } catch { /* Turtle */ }
  // A subject may be written in more than one block: take every block that starts with it.
  const blocks = text.split(/\n(?=\S)/).filter(b => new RegExp('^\\S*[#:]' + end.slice(1) + '>?\\s').test(b))
  return pattern.test(blocks.join('\n'))
}

const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9518, dir: import.meta.dirname, resource: A })
const wait = (fn, ms = 30000) => page.waitFor(fn, { timeout: ms }).then(() => true, () => false)
const toast = (re) => page.waitFor((s) => [...document.querySelectorAll('.sh-toasts .sh-toast')].some(t => new RegExp(s).test(t.textContent)), { timeout: 30000, args: [re.source] }).then(() => true, () => false)
try {
  const shown = await wait(() => document.querySelectorAll('.sh-content .iss.issues-pane .iss-card').length === 7 && document.querySelector('.sh-content .iss-title').textContent === 'Garden shed' && [...document.querySelectorAll('.sh-navcol .iss-nav-item')].filter(b => !/\(demo\)/.test(b.textContent)).length === 1, 45000)
  const nav = await page.evaluate(() => [...document.querySelectorAll('.sh-navcol .iss-nav-item')].map(b => b.querySelector('.iss-nav-label').textContent + (b.querySelector('.iss-nav-count') ? ' ' + b.querySelector('.iss-nav-count').textContent : '') + (b.getAttribute('aria-current') === 'page' ? '*' : '') + (b.querySelector('.iss-dot') ? ' dot' : '')))
  check('the shell opens a tracker with this pane; the board is in the shell\'s left column, marked, with a colour dot and its open count', !!shown && nav.filter(n => !/\(demo\)/.test(n)).join() === 'Garden shed 4* dot', nav.join())
  const inner = await page.evaluate(() => ({ cols: [...document.querySelectorAll('.sh-content .iss-col .iss-col-name')].map(c => c.textContent).join(), controls: document.querySelectorAll('.sh-content .iss-move, .sh-content .iss-edit').length, add: !!document.querySelector('.sh-content .iss-new'), msg: document.querySelector('.sh-content .iss-msg').textContent }))
  check('the columns in the content; the cards carry no controls in the shell (they are in the details); New issue is there', inner.cols === 'New,In progress,Waiting,Done,Won\'t do' && inner.controls === 0 && inner.add, JSON.stringify(inner))
  const scroll = await page.evaluate(() => { const b = document.querySelector('.sh-content .iss-board'); const r = b.getBoundingClientRect(); const main = document.querySelector('.sh-main').getBoundingClientRect(); return { inside: b.scrollWidth > b.clientWidth, right: Math.round(r.right), main: Math.round(main.right), page: document.documentElement.scrollWidth > innerWidth } })
  check('1300 px in the shell: the columns scroll sideways inside the board, the page does not', scroll.inside && scroll.right <= scroll.main && !scroll.page && !(await measure(page)).sideways, JSON.stringify(scroll))

  // A card's details in the shell's right column.
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .iss-card')].find(c => c.querySelector('.iss-card-title').textContent === 'Fit the window').click())
  const det = await wait(() => { const d = document.querySelector('.sh-detcol:not([hidden]) .iss-details-issue'); return !!d && d.querySelector('.iss-details-title').textContent === 'Fit the window' && !!d.querySelector('.iss-move') }, 8000)
  const props = await page.evaluate(() => { const d = document.querySelector('.sh-detcol .iss-details-issue'); return d ? [...d.querySelectorAll('.iss-props dt')].map(dt => dt.textContent + '=' + dt.nextElementSibling.textContent).join('; ') + ' | ' + d.querySelector('.iss-section').textContent : '' })
  check('a card opens its details in the right column: title, state, dates, people, description, controls', !!det && /State=Waiting/.test(props) && /By=Bob/.test(props) && /Assigned to=Alice/.test(props) && /glazier/.test(props), props)
  check('the card is marked while its details are open', await page.evaluate(() => document.querySelector('.sh-content .iss-card[aria-current="true"]').dataset.issue.endsWith('#Iss4')))
  await shot('shell-1300')

  await page.evaluate(() => { const s = document.querySelector('.sh-detcol .iss-details-issue .iss-move'); s.value = [...s.options].find(o => /Done/.test(o.textContent)).value; s.dispatchEvent(new Event('change')) })
  const moved = await toast(/Moved to Done/)
  await wait(() => [...document.querySelectorAll('.sh-content .iss-col')].find(c => c.dataset.state.endsWith('#Done')).querySelectorAll('.iss-card').length === 3, 10000)
  check('move from the details: a toast, the card in its new column, the details follow, the pod file has it', moved && issueSays('#Iss4', /Done/) && !issueSays('#Iss4', /Blocked/) && await page.evaluate(() => /State=Done/.test([...document.querySelectorAll('.sh-detcol .iss-props dt')].map(dt => dt.textContent + '=' + dt.nextElementSibling.textContent).join(';'))), JSON.stringify({ moved, toasts: await page.evaluate(() => [...document.querySelectorAll(".sh-toast")].map(t => t.textContent)), msg: await page.evaluate(() => document.querySelector(".sh-content .iss-msg").textContent), file: stateFile().slice(0, 600) }))

  await page.evaluate(() => document.querySelector('.sh-detcol .iss-details-issue .iss-edit').click())
  await wait(() => !!document.querySelector('.sh-detcol .iss-details-issue form'), 5000)
  await page.evaluate(() => { const f = document.querySelector('.sh-detcol .iss-details-issue form'); f.querySelector('input').value = 'Fit the shed window'; f.requestSubmit() })
  const saved = await toast(/Saved/)
  await wait(() => document.querySelector('.sh-detcol .iss-details-title').textContent === 'Fit the shed window', 10000)
  check('edit from the details: a toast, the details and the card show it, the pod file has it', saved && issueSays('#Iss4', /Fit the shed window/) && await page.evaluate(() => [...document.querySelectorAll('.sh-content .iss-card-title')].some(t => t.textContent === 'Fit the shed window')), JSON.stringify({ saved, pod: issueSays('#Iss4', /Fit the shed window/), title: await page.evaluate(() => (document.querySelector('.sh-detcol .iss-details-title') || {}).textContent), toasts: await page.evaluate(() => [...document.querySelectorAll('.sh-toast')].map(t => t.textContent)), msg: await page.evaluate(() => document.querySelector('.sh-content .iss-msg').textContent), form: await page.evaluate(() => !!document.querySelector('.sh-detcol form')) }))

  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await sleep(300)
  check('closing the details clears the marked card', await page.evaluate(() => !document.querySelector('.sh-content .iss-card[aria-current="true"]')))
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  const about = await wait(() => { const t = document.querySelector('.sh-detcol:not([hidden]) .iss-details-title'); return !!t && t.textContent === 'Garden shed' }, 8000)
  const aboutText = await page.evaluate(() => [...document.querySelectorAll('.sh-detcol .iss-props dt')].map(dt => dt.textContent + '=' + dt.nextElementSibling.textContent).join('; '))
  check('the shell\'s (i) button shows the board: owner, columns with counts, where the issues are kept', about && /Owner=Alice/.test(aboutText) && /Done=3 closed/.test(aboutText) && /Issues kept in=shell-a\/state\.ttl/.test(aboutText), aboutText)
  await page.evaluate(() => document.querySelector('.sh-details-close').click())

  // True 400 px: one column at a time (tabs), nothing sideways, the details over the content.
  await narrow(page)
  await sleep(600)
  // The shell keeps its column open when the window narrows under it; a phone starts with the drawer shut.
  await page.evaluate(() => { if (document.querySelector('.sh.suite-shell-pane').dataset.nav === 'open') document.querySelector('.sh-nav-toggle').click() })
  await wait(() => !document.querySelector('.sh-toast'), 8000)
  let m = await measure(page)
  const tabs = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('.sh-content .iss-coltabs [role=tab]')].filter(t => t.offsetParent).length, cols: [...document.querySelectorAll('.sh-content .iss-col')].filter(c => c.offsetParent).length }))
  check('true 400 px in the shell: tabs, one column, no sideways scroll', !m.sideways && tabs.tabs === 5 && tabs.cols === 1, JSON.stringify({ m, tabs }))
  await shot('shell-400')
  await page.evaluate(() => document.querySelector('.sh-content .iss-col.iss-active .iss-card').click())
  await wait(() => !!document.querySelector('.sh-detcol:not([hidden]) .iss-details-issue'), 8000)
  await sleep(400)
  m = await measure(page)
  check('true 400 px, details open: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400-details')

  // Another board, opened in the shell (from its search box, as an address): the left column then lists both, and
  // the first board opens again from there.
  await page.evaluate(() => document.querySelector('.sh-details-close') && document.querySelector('.sh-details-close').click())
  await page.evaluate((b) => { const i = document.querySelector('input[type=search][aria-label=Search]'); i.value = b; i.closest('form').requestSubmit() }, B)
  const both = await wait(() => { const t = document.querySelector('.sh-content .iss-title'); return !!t && t.textContent === 'Allotment' && [...document.querySelectorAll('.sh-navcol .iss-nav-item')].filter(b => !/\(demo\)/.test(b.textContent)).length === 2 }, 30000)
  const nav2 = await page.evaluate(() => [...document.querySelectorAll('.sh-navcol .iss-nav-item')].map(b => b.querySelector('.iss-nav-label').textContent + (b.getAttribute('aria-current') === 'page' ? '*' : '')).join())
  check('another board: the left column lists it (marked) and the board seen before', both && nav2.split(',').filter(n => !/\(demo\)/.test(n)).join() === 'Allotment*,Garden shed', nav2)
  await page.evaluate(() => [...document.querySelectorAll('.sh-navcol .iss-nav-item')].find(b => /Garden shed/.test(b.textContent)).click())
  const back = await wait(() => { const t = document.querySelector('.sh-content .iss-title'); return !!t && t.textContent === 'Garden shed' && !!document.querySelector('.sh-navcol .iss-nav-item[aria-current="page"]') && /Garden shed/.test(document.querySelector('.sh-navcol .iss-nav-item[aria-current="page"]').textContent) }, 30000)
  check('a board in the left column opens that board in the shell', back)
  await shot('shell-400-nav')

  if (!process.env.KEEP) for (const f of ['shell-a', 'shell-b']) rmSync(path.join(DATA, f), { recursive: true, force: true })
  await finish()
} catch (error) { await finish(error) }
