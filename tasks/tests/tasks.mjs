// The pane on the test pod, logged in as the owner: make a list, add tasks, tick one off, edit one in the details
// (title, due date, priority, notes), delete one, rename the list, make a second list, reload and read it all back.
// Every step is checked in the pane and in the file on the pod. 1300 px, then a true 400 px (design/viewport.mjs).
//   node tests/tasks.mjs        (leaves the data in suite-data/tasks/ for bob.mjs; the next run starts clean)
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'tasks/tasks-pane.js'
const HOME = POD + 'public/suite-data/tasks/'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'tasks')
if (!DIR.endsWith('/public/suite-data/tasks')) throw new Error('refusing: unexpected data folder ' + DIR)
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })
const disk = (f) => { const p = path.join(DIR, f); return existsSync(p) ? readFileSync(p, 'utf8') : '' }

const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9531, dir: import.meta.dirname, resource: HOME })
const status = () => page.evaluate(() => { const s = document.querySelector('.tsk-status-line'); return s ? s.className.replace('tsk-status tsk-status-line', '').trim() + ' :: ' + s.textContent : '' })
const settled = () => page.waitFor(() => { const s = document.querySelector('.tsk-status-line'); return !!s && /tsk-status-(success|error)/.test(s.className) && !/Saving|Making/.test(s.textContent) }, { timeout: 30000 })
const clearStatus = () => page.evaluate(() => { for (const s of document.querySelectorAll('.tsk-status-line')) { s.className = 'tsk-status tsk-status-line'; s.textContent = '' } })
const rows = () => page.evaluate(() => [...document.querySelectorAll('.tsk-open-list .tsk-task, .tsk-done-list .tsk-task')].map(li => li.querySelector('.tsk-row-title').textContent + '|' + li.querySelector('.tsk-check').getAttribute('aria-checked') + '|' + ((li.querySelector('.tsk-due') || {}).textContent || '') + '|' + li.className.match(/tsk-pri-(\w+)/)[1]))
const rowOf = (title) => `[...document.querySelectorAll('.tsk-task')].find(li => li.querySelector('.tsk-row-title').textContent === ${JSON.stringify(title)})`
const addTask = async (text) => {
  await clearStatus()
  await page.evaluate((t) => { const f = document.querySelector('.tsk-add'); f.querySelector('input').value = t; f.requestSubmit() }, text)
  await settled()
}
const edit = async (selector, value) => {
  await clearStatus()
  await page.evaluate((v) => { const [sel, val] = JSON.parse(v); const x = document.querySelector('.tsk-app > .tsk-details ' + sel); x.value = val; x.dispatchEvent(new Event('change', { bubbles: true })) }, JSON.stringify([selector, value]))
  await settled()
}

try {
  await page.goto(address(HOME))
  const empty = await page.waitFor(() => { const e = document.querySelector('.tsk-empty-title'); return e && e.textContent === 'No task lists here yet' && !!document.querySelector('.tsk-new-list') }, { timeout: 40000 }).catch(() => false)
  check('opens on the empty tasks folder, says so, and offers New list', !!empty)

  // Make a list from the left column.
  await page.evaluate(() => document.querySelector('.tsk-app > .tsk-nav .tsk-new-list').click())
  await page.evaluate(() => { const f = document.querySelector('.tsk-app > .tsk-nav .tsk-nav-form'); f.querySelector('input').value = 'Weekend jobs'; f.requestSubmit() })
  await page.waitFor(() => (document.querySelector('.tsk-list-title') || {}).textContent === 'Weekend jobs' && !!document.querySelector('.tsk-add'), { timeout: 30000 })
  check('create a list: it opens, ready for tasks', /success/.test(await status()), await status())
  const index = disk('weekend-jobs/index.ttl')
  check('create a list: a folder with index.ttl and state.ttl on the pod', !!index && existsSync(path.join(DIR, 'weekend-jobs', 'state.ttl')), readdirSync(DIR).join(' '))
  check('create a list: a wf:Tracker whose task class is a cal:Vtodo, with To do and Done', /Weekend jobs/.test(index) && /flow#Tracker|wf:Tracker/.test(index) && /ical#Vtodo|cal:Vtodo/.test(index) && /flow#Closed|wf:Closed/.test(index) && /disjointUnionOf/.test(index))
  check('create a list: on the left, marked as the open one', await page.evaluate(() => [...document.querySelectorAll('.tsk-app > .tsk-nav .tsk-list-link')].map(a => a.textContent + (a.getAttribute('aria-current') || '')).join()) === 'Weekend jobs0page')

  // Add.
  for (const t of ['Buy compost', 'Call the plumber {urgent}', 'Wash the car']) await addTask(t)
  let r = await rows()
  check('add three tasks: shown, newest first', r.map(x => x.split('|')[0]).join(' / ') === 'Wash the car / Call the plumber {urgent} / Buy compost', r.join(' ; '))
  let state = disk('weekend-jobs/state.ttl')
  check('add: all three in state.ttl, braces and all', /Buy compost/.test(state) && /Call the plumber \{urgent\}/.test(state) && /Wash the car/.test(state), state.slice(0, 200))
  check('add: the count on the left follows', await page.evaluate(() => document.querySelector('.tsk-app > .tsk-nav .tsk-nav-count').textContent) === '3')

  // Complete.
  await clearStatus()
  await page.evaluate(`${rowOf('Wash the car')}.querySelector('.tsk-check').click()`)
  await settled()
  r = await rows()
  check('tick one off: it leaves the to-do list; the fold counts it', r.length === 2 && await page.evaluate(() => document.querySelector('.tsk-more').textContent) === '1 completed task' && await page.evaluate(() => document.querySelector('.tsk-list-meta').textContent) === '2 to do · 1 done', r.join(' ; '))
  state = disk('weekend-jobs/state.ttl')
  check('tick one off: its state is Done in the file, with when', /(index:|#)Done\b/.test(state) && /ical#completed|cal:completed/.test(state))

  // Edit in the details.
  await page.evaluate(`${rowOf('Buy compost')}.querySelector('.tsk-open').click()`)
  await page.waitFor(() => !!document.querySelector('.tsk-app > .tsk-details .tsk-edit-title'), { timeout: 5000 })
  check('details open with the task in them', await page.evaluate(() => document.querySelector('.tsk-app > .tsk-details .tsk-edit-title').value) === 'Buy compost')
  await edit('.tsk-edit-title', 'Buy peat-free compost')
  check('edit the title: saved', /success/.test(await status()) && /Buy peat-free compost/.test(disk('weekend-jobs/state.ttl')), await status())
  await edit('.tsk-edit-due', '2026-12-01')
  check('set a due date: saved', /success/.test(await status()) && /2026-12-01/.test(disk('weekend-jobs/state.ttl')), await status())
  await edit('.tsk-edit-priority', 'high')
  check('set priority high: saved as iCalendar priority 1', /success/.test(await status()) && /ical#priority|cal:priority/.test(disk('weekend-jobs/state.ttl')), await status())
  const NOTES = 'Two bags, the "green" ones.\nNot the cheap kind {see receipt}.'
  await edit('.tsk-edit-notes', NOTES)
  check('write notes with quotes, a new line and braces: saved as typed', /success/.test(await status()), await status())
  r = await rows()
  check('the row shows the due date and the priority', /^Buy peat-free compost\|false\|.+\|high$/.test(r[0]), r[0])

  // Delete, with a second press.
  await page.evaluate(`${rowOf('Call the plumber {urgent}')}.querySelector('.tsk-open').click()`)
  await page.waitFor(() => document.querySelector('.tsk-app > .tsk-details .tsk-edit-title') && document.querySelector('.tsk-app > .tsk-details .tsk-edit-title').value === 'Call the plumber {urgent}', { timeout: 5000 })
  await page.evaluate(() => document.querySelector('.tsk-delete').click())
  check('delete asks for a second press', /Press again/.test(await page.evaluate(() => document.querySelector('.tsk-delete').textContent)) && (await rows()).length === 2)
  await clearStatus()
  await page.evaluate(() => document.querySelector('.tsk-delete').click())
  await settled()
  check('delete: gone from the pane and the file; the details close', !(await rows()).some(x => /plumber/.test(x)) && !/plumber/.test(disk('weekend-jobs/state.ttl')) && !(await page.evaluate(() => !!document.querySelector('.tsk-app > .tsk-details'))), await status())

  // Un-tick.
  await page.evaluate(() => document.querySelector('.tsk-more').click())
  await clearStatus()
  await page.evaluate(`${rowOf('Wash the car')}.querySelector('.tsk-check').click()`)
  await settled()
  check('un-tick: back in the to-do list; Done and its date gone from the file', (await rows()).filter(x => /\|false\|/.test(x)).length === 2 && !/(index:|#)Done\b/.test(disk('weekend-jobs/state.ttl')) && /(index:|#)ToDo\b/.test(disk('weekend-jobs/state.ttl')) && !/completed/.test(disk('weekend-jobs/state.ttl')))

  // Rename the list from its details.
  await page.evaluate(() => document.querySelector('.tsk-list-info').click())
  await page.waitFor(() => !!document.querySelector('.tsk-app > .tsk-details .tsk-list-name'), { timeout: 5000 })
  await edit('.tsk-list-name', 'Weekend chores')
  await page.waitFor(() => (document.querySelector('.tsk-list-title') || {}).textContent === 'Weekend chores', { timeout: 10000 })
  check('rename the list: saved, shown, the steps list in the file kept', /Weekend chores/.test(disk('weekend-jobs/index.ttl')) && /disjointUnionOf/.test(disk('weekend-jobs/index.ttl')) && await page.evaluate(() => document.querySelector('.tsk-app > .tsk-nav .tsk-nav-label').textContent) === 'Weekend chores', await status())

  // A second list, then back.
  await page.evaluate(() => document.querySelector('.tsk-app > .tsk-nav .tsk-new-list').click())
  await page.evaluate(() => { const f = document.querySelector('.tsk-app > .tsk-nav .tsk-nav-form'); f.querySelector('input').value = 'Shopping'; f.requestSubmit() })
  await page.waitFor(() => (document.querySelector('.tsk-list-title') || {}).textContent === 'Shopping', { timeout: 30000 })
  await addTask('Light bulbs')
  check('a second list: its own folder and tasks; both on the left, by name', existsSync(path.join(DIR, 'shopping', 'index.ttl')) && /Light bulbs/.test(disk('shopping/state.ttl')) && !/Light bulbs/.test(disk('weekend-jobs/state.ttl')) && await page.evaluate(() => [...document.querySelectorAll('.tsk-app > .tsk-nav .tsk-nav-label')].map(a => a.textContent).join()) === 'Shopping,Weekend chores')

  // Reload, on the list's own address, and read everything back.
  await page.goto(address(POD + 'public/suite-data/tasks/weekend-jobs/index.ttl#this'))
  await page.waitFor(() => (document.querySelector('.tsk-list-title') || {}).textContent === 'Weekend chores' && document.querySelectorAll('.tsk-open-list .tsk-task').length === 2, { timeout: 40000 })
  await sleep(800)
  r = await rows()
  check('after a reload: the same tasks, due date, priority, and both lists', r[0].startsWith('Buy peat-free compost|false|') && /\|high$/.test(r[0]) && r[1] === 'Wash the car|false||none' && await page.evaluate(() => document.querySelectorAll('.tsk-app > .tsk-nav .tsk-list-link').length) === 2, r.join(' ; '))
  await page.evaluate(`${rowOf('Buy peat-free compost')}.querySelector('.tsk-open').click()`)
  await page.waitFor(() => !!document.querySelector('.tsk-app > .tsk-details .tsk-edit-notes'), { timeout: 5000 })
  const back = await page.evaluate(() => { const d = document.querySelector('.tsk-app > .tsk-details'); return { due: d.querySelector('.tsk-edit-due').value, pri: d.querySelector('.tsk-edit-priority').value, notes: d.querySelector('.tsk-edit-notes').value, meta: d.querySelector('.tsk-task-meta').textContent } })
  check('after a reload: the details read back exactly as typed', back.due === '2026-12-01' && back.pri === 'high' && back.notes === NOTES && /^Added by /.test(back.meta), JSON.stringify(back))
  check('1300 px: no sideways scroll', !(await measure(page)).sideways)
  await shot('tasks-1300')

  // A ticked one, to show in the picture.
  await clearStatus()
  await page.evaluate(`${rowOf('Wash the car')}.querySelector('.tsk-check').click()`)
  await settled()
  await page.evaluate(() => document.querySelector('.tsk-more').click())
  await narrow(page)
  await sleep(500)
  const m = await measure(page)
  check('true 400 px with the details open: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('tasks-400-details')
  await page.evaluate(() => document.querySelector('.tsk-details-close').click())
  await sleep(300)
  const m2 = await measure(page)
  check('true 400 px: no sideways scroll; the add box fits', !m2.sideways && await page.evaluate(() => document.querySelector('.tsk-add').getBoundingClientRect().right <= innerWidth), JSON.stringify(m2))
  await shot('tasks-400')
  await finish()
} catch (error) { await finish(error) }
