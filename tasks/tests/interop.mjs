// The point of reusing SolidOS's tracker format: the suite's Boards pane (issues/issues-pane.js, the SolidOS
// issue-pane format) opens a Tasks list as a board with a To do and a Done column. Logged out, sample data.
//   node tests/interop.mjs
import { open, LAB, sleep } from '../../lib/lib.mjs'
const BOARDS = LAB + 'issues/issues-pane.js'
const GARDEN = LAB + 'tasks/samples/lists/garden/index.ttl#this'

const { page, check, finish, shot } = await open({ pane: BOARDS, port: 9531, dir: import.meta.dirname, login: false, fresh: true, resource: GARDEN })
try {
  const shown = await page.waitFor(() => document.querySelectorAll('.iss-card').length === 7, { timeout: 40000 }).catch(() => false)
  check('the Boards pane opens a Tasks list: seven cards', !!shown)
  await sleep(800)
  const seen = await page.evaluate(() => ({
    title: (document.querySelector('.iss-title') || {}).textContent,
    cols: [...document.querySelectorAll('.iss-col')].map(c => c.querySelector('.iss-col-name').textContent + ' ' + c.querySelector('.iss-count').textContent),
    text: document.body.textContent
  }))
  check('its columns are the list\'s states, To do 5 and Done 2', seen.cols.join(', ') === 'To do 5, Done 2', seen.cols.join(', '))
  check('the titles and notes come across', seen.title === 'Garden' && /Sow the broad beans/.test(seen.text) && /Soak the seeds/.test(seen.text))
  await shot('interop-boards')
  await finish()
} catch (error) { await finish(error) }
