// Logged out, on Alice's sample folder: everything public is listed; the owner-only folder is not, and the pane
// says one folder could not be read and that logging in would show more. No sideways scroll at 1300 and 400 px.
//   node tests/loggedout.mjs
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { BASE } from './setup.mjs'

const PANE = LAB + 'activity/activity-pane.js'
const ALICE = BASE + 'alice/'
const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9541, dir: import.meta.dirname, login: false, fresh: true, resource: ALICE })
try {
  await page.goto(address(ALICE))
  const ok = await page.waitFor(() => !!document.querySelector('.act.suite-activity[data-ready]'), { timeout: 40000 }).catch(() => false)
  check('logged out, the folder still opens on Activity', !!ok)
  const s = await page.evaluate(() => ({
    uris: [...document.querySelectorAll('.act.suite-activity .act-item')].map(a => a.dataset.uri),
    times: [...document.querySelectorAll('.act.suite-activity .act-when')].map(t => t.getAttribute('datetime')),
    note: (document.querySelector('.act.suite-activity .act-login') || {}).textContent || '',
    unread: document.querySelector('.act.suite-activity').dataset.unread,
    foot: document.querySelector('.act.suite-activity .act-foot').textContent
  }))
  check('the 16 public files are listed, newest first', s.uris.length === 16 && s.times.every((t, i) => i === 0 || t <= s.times[i - 1]), s.uris.length + ' ' + s.uris[0])
  check('the owner-only folder is left out', !s.uris.some(u => u.includes('/private/')))
  check('it says one folder could not be read, and to log in, above the stream and in the footnote', s.unread === '1' && /Log in to see everything you have access to/.test(s.note) && /1 folder could not be read\. Log in to see what you have access to\./.test(s.foot), s.note + ' | ' + s.foot)
  let m = await measure(page)
  check('no sideways scroll at 1300 px', !m.sideways && !m.poking.length, JSON.stringify(m))
  await shot('loggedout-1300')
  await narrow(page, 400)
  await sleep(300)
  m = await measure(page)
  check('no sideways scroll at a true 400 px', m.innerWidth === 400 && !m.sideways && !m.poking.length, JSON.stringify(m))
  await shot('loggedout-400')
  // A folder nobody logged out can read: the data browser says so itself, before any pane is asked.
  await page.goto(address(ALICE + 'private/'))
  await sleep(6000)
  const denied = await page.evaluate(() => !document.querySelector('.act.suite-activity'))
  check("an unreadable folder: left to the data browser, which says 'Access denied' itself (see the shot)", denied)
  await shot('loggedout-private')
} catch (error) { await finish(error) }
await finish()
