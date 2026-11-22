// The pane inside the suite shell (shell/suite-shell-pane.js), reusing the login tasks.mjs left: the lists in the
// shell's left column, a task's details in its right column (editing there saves and shows a toast), the list's own
// details from the shell's (i) button, the header search filtering the tasks, and no sideways scroll at 1300 px and
// a true 400 px. The shell does not list Tasks among its apps yet, so both panes are loaded by link (?pane= twice).
//   node tests/shell.mjs       (after tasks.mjs)
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const PANE = LAB + 'tasks/tasks-pane.js'
const LIST = POD + 'public/suite-data/tasks/weekend-jobs/index.ttl#this'
const FILE = path.join(config.podDir, 'public', 'suite-data', 'tasks', 'weekend-jobs', 'state.ttl')
if (!existsSync(FILE)) { console.log('Run tests/tasks.mjs first: it makes the list this test opens.'); process.exit(1) }
const both = (uri) => `${config.browser}?pane=${encodeURIComponent(SHELL)}&pane=${encodeURIComponent(PANE)}&uri=${encodeURIComponent(uri)}`

const { page, check, finish, shot } = await open({ pane: SHELL, port: 9531, dir: import.meta.dirname, login: false, resource: LIST })
try {
  // The browser imports the two linked panes side by side and registers whichever arrives first; if this pane wins,
  // it opens alone and the shell is not shown. A reload (modules now cached) registers them in link order.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(both(LIST))
    const where = await page.waitFor(() => document.querySelector('.sh-content') ? 'shell' : document.querySelector('.tsk-app') ? 'alone' : false, { timeout: 45000 }).catch(() => false)
    if (where === 'shell') break
    console.log('     the shell did not take the page (attempt ' + attempt + ': ' + where + '); loading again')
  }
  // Until the shell lists Tasks as an app, its Boards app claims any tracker first; Tasks is one of the other views.
  const offered = await page.waitFor(() => !!document.querySelector('[data-pane="suite-tasks"]'), { timeout: 45000 }).catch(() => false)
  check('the shell offers Tasks as a view of the list', !!offered)
  if (!await page.evaluate(() => !!document.querySelector('.sh-content .tsk.suite-tasks-pane'))) await page.evaluate(() => document.querySelector('[data-pane="suite-tasks"]').click())
  const shown = await page.waitFor(() => !!document.querySelector('.sh-content .tsk.suite-tasks-pane .tsk-list-title') && document.querySelectorAll('.sh-navcol .tsk-shell-nav .tsk-list-link').length === 2 && document.querySelectorAll('.sh-content .tsk-open-list .tsk-task').length > 0, { timeout: 45000 }).catch(() => false)
  check('in the shell: the list in the content, the lists in the shell\'s left column', !!shown)
  const nav = await page.evaluate(() => ({ items: [...document.querySelectorAll('.sh-navcol .tsk-list-link')].map(a => a.querySelector('.tsk-nav-label').textContent + (a.getAttribute('aria-current') ? '*' : '')), own: !!document.querySelector('.sh-content .tsk-app'), nested: document.querySelectorAll('.sh-navcol nav').length, title: document.querySelector('.sh-content .tsk-list-title').textContent }))
  check('the open list is marked in the shell\'s column; no second column of our own; no nav inside its nav', nav.items.join() === 'Shopping,Weekend chores*' && !nav.own && nav.nested === 0 && nav.title === 'Weekend chores', JSON.stringify(nav))

  // A task's details in the shell's right column, edited there.
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tsk-task')].find(li => /compost/.test(li.textContent)).querySelector('.tsk-open').click())
  const det = await page.waitFor(() => { const d = document.querySelector('.sh-detcol:not([hidden]) .tsk-shell-details .tsk-edit-title'); return d && d.value === 'Buy peat-free compost' }, { timeout: 8000 }).catch(() => false)
  check('a task opens in the shell\'s details column, its row marked', !!det && await page.evaluate(() => /compost/.test(document.querySelector('.sh-content .tsk-task[aria-selected=true]').textContent)))
  const [want, number] = (await page.evaluate(() => document.querySelector('.sh-detcol .tsk-edit-priority').value)) === 'medium' ? ['low', 9] : ['medium', 5]
  await page.evaluate((w) => { const s = document.querySelector('.sh-detcol .tsk-edit-priority'); s.value = w; s.dispatchEvent(new Event('change', { bubbles: true })) }, want)
  const toast = await page.waitFor(() => [...document.querySelectorAll('.sh-toasts .sh-toast')].some(t => /Priority saved/.test(t.textContent)), { timeout: 30000 }).catch(() => false)
  const stored = readFileSync(FILE, 'utf8')
  check('edit in the shell\'s column: saved (priority ' + number + ' on the pod), said with a toast', !!toast && new RegExp('"cal:priority": ' + number + '|ical#priority[^\\n]*' + number).test(stored), stored.match(/priority[^\n]*/) ? stored.match(/priority[^\n]*/)[0] : 'no priority')
  check('the row follows the edit', await page.evaluate((w) => [...document.querySelectorAll('.sh-content .tsk-task')].find(li => /compost/.test(li.textContent)).classList.contains('tsk-pri-' + w), want))
  await shot('shell-1300')

  // The shell's close button clears the selection; its (i) button shows the list.
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await sleep(300)
  check('closing the column clears the marked row', await page.evaluate(() => !document.querySelector('.sh-content .tsk-task[aria-selected=true]')))
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  const about = await page.waitFor(() => { const n = document.querySelector('.sh-detcol:not([hidden]) .tsk-list-name'); return n && n.value === 'Weekend chores' }, { timeout: 8000 }).catch(() => false)
  check('the shell\'s (i) button shows the list: its name, counts, where it is', !!about && await page.evaluate(() => /to do · \d+ done/.test(document.querySelector('.sh-detcol .tsk-meta').textContent)))
  await page.evaluate(() => document.querySelector('.sh-details-close').click())

  // The header search filters the open list.
  await page.evaluate(() => { const i = document.querySelector('input[type=search][aria-label=Search]'); i.value = 'car'; i.dispatchEvent(new Event('input', { bubbles: true })) })
  const found = await page.waitFor(() => document.querySelectorAll('.sh-content .tsk-open-list .tsk-task').length === 0 && /^Matching “car”: 0 to do · 1 done$/.test(document.querySelector('.sh-content .tsk-list-meta').textContent) && document.querySelector('.sh-content .tsk-more').textContent === '1 completed task', { timeout: 5000 }).catch(() => false)
  check('the header search filters the tasks (the one match is a done one)', !!found, await page.evaluate(() => document.querySelector('.sh-content .tsk-list-meta').textContent))
  await page.evaluate(() => { const i = document.querySelector('input[type=search][aria-label=Search]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.waitFor(() => document.querySelectorAll('.sh-content .tsk-open-list .tsk-task').length === 1 && /^1 to do · 1 done$/.test(document.querySelector('.sh-content .tsk-list-meta').textContent), { timeout: 5000 })
  check('clearing the search shows them all again', true)
  check('1300 px in the shell: no sideways scroll', !(await measure(page)).sideways)

  await narrow(page)
  await sleep(600)
  // The shell keeps the drawer open from the wide layout; close it, as a person would, to see the list.
  if (await page.evaluate(() => document.querySelector('.sh-nav-toggle').getAttribute('aria-expanded') === 'true')) await page.evaluate(() => document.querySelector('.sh-nav-toggle').click())
  await sleep(300)
  let m = await measure(page)
  check('true 400 px in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400')
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tsk-task')].find(li => /compost/.test(li.textContent)).querySelector('.tsk-open').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .tsk-edit-title'), { timeout: 8000 })
  await sleep(400)
  m = await measure(page)
  check('true 400 px, details open in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400-details')
  await finish()
} catch (error) { await finish(error) }
