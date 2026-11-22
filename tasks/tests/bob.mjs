// A second person, and nobody: bob (logged in, his own browser on 9532) opens the list me made in tasks.mjs, which
// sits in me's public folder (anyone may read, only me may write). He sees the tasks but no way to change them, and
// the pod refuses his write. Then a logged-out browser reads the same list (a file the pane wrote, which the server
// keeps as JSON-LD).
//   node tests/bob.mjs       (after tasks.mjs)
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'tasks/tasks-pane.js'
const LIST = POD + 'public/suite-data/tasks/weekend-jobs/index.ttl#this'
const STATE = POD + 'public/suite-data/tasks/weekend-jobs/state.ttl'
const FILE = path.join(config.podDir, 'public', 'suite-data', 'tasks', 'weekend-jobs', 'state.ttl')
if (!existsSync(FILE)) { console.log('Run tests/tasks.mjs first: it makes the list this test opens.'); process.exit(1) }
const before = readFileSync(FILE, 'utf8')

const look = (page) => page.evaluate(() => ({
  title: (document.querySelector('.tsk-list-title') || {}).textContent,
  rows: [...document.querySelectorAll('.tsk-open-list .tsk-task')].map(li => li.querySelector('.tsk-row-title').textContent),
  lists: [...document.querySelectorAll('.tsk-app > .tsk-nav .tsk-nav-label')].map(x => x.textContent),
  controls: document.querySelectorAll('.tsk-add, .tsk-new-list').length,
  enabled: [...document.querySelectorAll('.tsk-check')].filter(b => !b.disabled).length,
  status: (document.querySelector('.tsk-status-line') || {}).textContent
}))

let bob = await open({ pane: PANE, port: 9532, dir: import.meta.dirname, as: 'bob', resource: LIST })
try {
  await bob.page.waitFor(() => document.querySelectorAll('.tsk-open-list .tsk-task').length > 0 && !!(document.querySelector('.tsk-status-line') || {}).textContent, { timeout: 40000 })
  await sleep(800)
  const s = await look(bob.page)
  bob.check('bob: sees me\'s list, its tasks and the other list', s.title === 'Weekend chores' && s.rows.includes('Buy peat-free compost') && s.lists.join() === 'Shopping,Weekend chores', JSON.stringify(s))
  bob.check('bob: no add box, no New list, no ticking, and it says why', s.controls === 0 && s.enabled === 0 && s.status === 'You can see this list but not change it.', s.controls + ' ' + s.enabled + ' ' + s.status)
  await bob.page.evaluate(() => document.querySelector('.tsk-open-list .tsk-task .tsk-open').click())
  await bob.page.waitFor(() => !!document.querySelector('.tsk-app > .tsk-details'), { timeout: 5000 })
  bob.check('bob: the details are read-only', await bob.page.evaluate(() => document.querySelectorAll('.tsk-app > .tsk-details input, .tsk-app > .tsk-details textarea, .tsk-app > .tsk-details select, .tsk-delete').length === 0 && /Two bags/.test(document.querySelector('.tsk-show-notes').textContent)))
  const put = await bob.page.evaluate(async (u) => (await window.SolidLogic.store.fetcher._fetch(u, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: '<#x> <#y> "bob was here" .' })).status, STATE)
  bob.check('bob: the pod refuses his write, and the file is unchanged', [401, 403].includes(put) && readFileSync(FILE, 'utf8') === before, String(put))
  await narrow(bob.page)
  await sleep(400)
  const m = await measure(bob.page)
  bob.check('bob, true 400 px: no sideways scroll', !m.sideways, JSON.stringify(m))
  await bob.shot('bob-400')
  await bob.page.close()
} catch (error) { await bob.finish(error) }

const anon = await open({ pane: PANE, port: 9532, dir: import.meta.dirname, login: false, fresh: true, resource: LIST })
try {
  await anon.page.waitFor(() => document.querySelectorAll('.tsk-open-list .tsk-task').length > 0 && !!(document.querySelector('.tsk-status-line') || {}).textContent, { timeout: 40000 })
  await sleep(800)
  const s = await look(anon.page)
  anon.check('logged out: reads the list the pane wrote (kept as JSON-LD by the server)', s.title === 'Weekend chores' && s.rows.includes('Buy peat-free compost') && s.lists.length === 2, JSON.stringify(s))
  anon.check('logged out: nothing to change, and it says to log in', s.controls === 0 && s.enabled === 0 && /Log in/.test(s.status), s.status)
  anon.check('logged out, 1300 px: no sideways scroll', !(await measure(anon.page)).sideways)
  await anon.shot('loggedout-1300')
  await anon.finish()
} catch (error) { await anon.finish(error) }
