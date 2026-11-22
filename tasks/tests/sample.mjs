// The sample lists, read without logging in: the lists on the left, the tasks in order, their facts, the details,
// no controls, and no sideways scroll at 1300 px and at a true 400 px (CDP device metrics, design/viewport.mjs).
//   node tests/sample.mjs
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
const PANE = LAB + 'tasks/tasks-pane.js'
const GARDEN = LAB + 'tasks/samples/lists/garden/index.ttl#this'
const TASK = LAB + 'tasks/samples/lists/garden/state.ttl#Iss1'

const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9531, dir: import.meta.dirname, login: false, fresh: true, resource: GARDEN })
const seen = () => page.evaluate(() => ({
  lists: [...document.querySelectorAll('.tsk-app > .tsk-nav .tsk-list-link')].map(a => a.querySelector('.tsk-nav-label').textContent + ' ' + a.querySelector('.tsk-nav-count').textContent + (a.getAttribute('aria-current') ? ' *' : '')),
  title: (document.querySelector('.tsk-list-title') || {}).textContent,
  meta: (document.querySelector('.tsk-list-meta') || {}).textContent,
  open: [...document.querySelectorAll('.tsk-open-list .tsk-task')].map(li => li.querySelector('.tsk-row-title').textContent + '|' + ((li.querySelector('.tsk-due') || {}).textContent || '') + '|' + li.className.match(/tsk-pri-(\w+)/)[1] + '|' + (li.querySelector('.tsk-facts [title="Has notes"]') ? 'notes' : '')),
  done: [...document.querySelectorAll('.tsk-done-list .tsk-task')].map(li => li.querySelector('.tsk-row-title').textContent),
  more: (document.querySelector('.tsk-more') || {}).textContent,
  controls: document.querySelectorAll('.tsk-add, .tsk-new-list, .tsk-edit-title, .tsk-delete').length,
  enabledChecks: [...document.querySelectorAll('.tsk-check')].filter(b => !b.disabled).length,
  status: (document.querySelector('.tsk-status-line') || {}).textContent,
  bold: document.querySelectorAll('.tsk-row-title b').length,
  wide: document.documentElement.scrollWidth > innerWidth
}))
try {
  const ready = await page.waitFor(() => document.querySelectorAll('.tsk-open-list .tsk-task').length === 5 && document.querySelectorAll('.tsk-app > .tsk-nav .tsk-list-link').length === 3, { timeout: 40000 }).catch(() => false)
  check('the garden list opens in the pane', !!ready)
  await sleep(1000)
  let s = await seen()
  console.log('     ' + s.open.join(' ; '))
  check('three lists on the left, by name, with the open count; the open one marked', s.lists.join(', ') === 'Garden 5 *, Groceries 2, Trip to Lisbon 1', s.lists.join(', '))
  check('title and counts', s.title === 'Garden' && s.meta === '5 to do · 2 done', s.title + ' / ' + s.meta)
  check('soonest due first, then by priority; no due date last', s.open.map(o => o.split('|')[0]).join(' / ') === 'Fix the gate latch / Sow the broad beans / Mulch the rose bed / Order seed potatoes / <b>Label</b> the seed tins & jars', s.open.map(o => o.split('|')[0]).join(' / '))
  check('priority shows on the row (high, medium, low, none)', s.open.map(o => o.split('|')[2]).join(',') === 'none,high,medium,low,none', s.open.map(o => o.split('|')[2]).join(','))
  check('a row with notes says so', /notes$/.test(s.open[0]) && /notes$/.test(s.open[1]) && !/notes$/.test(s.open[2]))
  check('due dates in words', s.open[0].split('|')[1].length > 2 && s.open[1].split('|')[1].length > 2 && s.open[3].split('|')[1] === '', s.open.map(o => o.split('|')[1]).join(','))
  check('the late one is marked late', await page.evaluate(() => !!document.querySelector('.tsk-open-list .tsk-task:first-child .tsk-due.tsk-late')))
  check('markup in a title is shown as text', s.bold === 0 && s.open.some(o => o.startsWith('<b>Label</b>')))
  check('completed tasks are folded away, with a count', s.done.length === 0 && s.more === '2 completed tasks', s.more)
  await page.evaluate(() => document.querySelector('.tsk-more').click())
  await sleep(300)
  s = await seen()
  check('unfolded: newest completed first', s.done.join(' / ') === 'Rake the leaves / Empty the water butt', s.done.join(' / '))
  check('logged out: nothing to change, and it says so', s.controls === 0 && s.enabledChecks === 0 && /Log in/.test(s.status), s.controls + ' ' + s.enabledChecks + ' ' + s.status)
  await page.evaluate(() => document.querySelector('.tsk-open-list .tsk-task:nth-child(2) .tsk-open').click())
  await page.waitFor(() => !!document.querySelector('.tsk-app > .tsk-details'), { timeout: 5000 })
  const d = await page.evaluate(() => { const x = document.querySelector('.tsk-app > .tsk-details'); return { title: x.querySelector('.tsk-details-title').textContent, due: x.querySelector('.tsk-show-due').textContent, pri: x.querySelector('.tsk-show-priority').textContent, notes: x.querySelector('.tsk-show-notes').textContent, meta: x.querySelector('.tsk-task-meta').textContent, inputs: x.querySelectorAll('input, textarea, select').length, selected: document.querySelector('.tsk-task[aria-selected=true] .tsk-row-title').textContent } })
  check('details: title, due, priority, notes, who added it; read-only', d.title === 'Sow the broad beans' && /November/.test(d.due) && /\b30\b/.test(d.due) && /2026/.test(d.due) && d.pri === 'High' && /Soak the seeds/.test(d.notes) && /^Added by Alice on /.test(d.meta) && /November/.test(d.meta) && /\b10\b/.test(d.meta) && d.inputs === 0, JSON.stringify(d))
  check('the row shown in the details is marked', d.selected === 'Sow the broad beans')
  check('1300 px: no sideways scroll', !(await seen()).wide)
  await shot('sample-1300')
  await page.evaluate(() => document.querySelector('.tsk-list-link[data-list*="lisbon"]').click())
  await page.waitFor(() => (document.querySelector('.tsk-list-title') || {}).textContent === 'Trip to Lisbon' && document.querySelectorAll('.tsk-open-list .tsk-task').length === 1, { timeout: 10000 })
  s = await seen()
  check('another list from the left opens in place; details close', s.meta === '1 to do · 2 done' && !(await page.evaluate(() => !!document.querySelector('.tsk-app > .tsk-details'))), s.meta)

  // A task's own address opens its list with that task in the details.
  await page.goto(address(TASK))
  const t = await page.waitFor(() => { const x = document.querySelector('.tsk-app > .tsk-details .tsk-details-title'); return x && x.textContent === 'Sow the broad beans' }, { timeout: 40000 }).catch(() => false)
  check('a task\'s address opens its list with the task in the details', !!t)

  await narrow(page)
  await sleep(500)
  let m = await measure(page)
  check('true 400 px with details open: no sideways scroll; details take the width', !m.sideways && await page.evaluate(() => getComputedStyle(document.querySelector('.tsk-main')).display === 'none' && document.querySelector('.tsk-app > .tsk-details').getBoundingClientRect().width > 300), JSON.stringify(m))
  await shot('sample-400-details')
  await page.evaluate(() => document.querySelector('.tsk-details-close').click())
  await sleep(300)
  m = await measure(page)
  check('true 400 px: lists folded behind a button, tasks shown, no sideways scroll', !m.sideways && await page.evaluate(() => getComputedStyle(document.querySelector('.tsk-app > .tsk-nav')).display === 'none' && getComputedStyle(document.querySelector('.tsk-lists-btn')).display !== 'none' && document.querySelectorAll('.tsk-open-list .tsk-task').length === 5), JSON.stringify(m))
  await shot('sample-400')
  await page.evaluate(() => document.querySelector('.tsk-lists-btn').click())
  await sleep(300)
  m = await measure(page)
  check('true 400 px: the lists button shows the lists', !m.sideways && await page.evaluate(() => getComputedStyle(document.querySelector('.tsk-app > .tsk-nav')).display !== 'none'), JSON.stringify(m))
  await shot('sample-400-lists')
  await finish()
} catch (error) { await finish(error) }
