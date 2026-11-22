// The notes pane alone, from a clean browser, logged out: public notes read the same as logged in (the folder is
// listed, links resolve, previous / next work), a private note is not shown, and no sideways scroll at 1300 px and
// a true 400 px.
//   node tests/loggedout.mjs
import { open, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { BASE, PANE, PORT2, NOTES, SETTLED, SEEN } from './setup.mjs'

const N = NOTES.length
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT2, dir: import.meta.dirname, login: false, fresh: true, resource: BASE + 'welcome.md' })
const view = async (name) => { await page.goto(address(BASE + name)); const ok = await page.waitFor(`(${SETTLED})(${N})`, { timeout: 40000 }).then(() => true, () => false); await sleep(300); return ok ? page.evaluate(`(${SEEN})()`) : null }
try {
  let s = await view('welcome.md')
  check('logged out: a public note opens, with the folder counted', !!s && s.title === 'Alice\'s notebook' && s.all.text === `All notes (${N})`, s && s.all.text)
  check('logged out: [[links]] resolve from the listing, the missing one greyed', !!s && s.wikis.join(' ; ') === `linking|${BASE}linking.md| ; The seed swap|${BASE}2026-11-20-seed-swap.md| ; not-written-yet||missing`, s && s.wikis.join(' ; '))
  let m = await measure(page)
  check('logged out, 1300 px: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('loggedout-1300')
  s = await view('2026-11-20-seed-swap.md')
  check('logged out: a dated note with its date and both neighbours', !!s && s.date === '20 November 2026' && s.prev.href === BASE + '2026-11-18-first-entry.md' && s.next.href === BASE + 'hostile.md')

  // A private note: the data browser asks for it first, gets 401 and says so itself; the pane is never reached.
  await page.goto(address(BASE + 'private.md'))
  await page.waitFor(() => document.readyState === 'complete' && !!window.panes, { timeout: 30000 })
  await sleep(4000)
  const kept = await page.evaluate(() => { const text = (node) => [node.textContent || '', ...[...node.querySelectorAll('*')].filter(e => e.shadowRoot).map(e => text(e.shadowRoot))].join(' '); return text(document.body) }).then(t => !/Only Alice may read this/.test(t))
  check('logged out: a private note is not shown (the browser asks to log in)', kept && await page.evaluate(() => !document.querySelector('.note.notes-reader-pane .note-body h1')))
  await shot('loggedout-private')

  await narrow(page)
  s = await view('welcome.md')
  m = await measure(page)
  check('logged out, true 400 px: the note shows, no sideways scroll', !!s && s.title === 'Alice\'s notebook' && !m.sideways, JSON.stringify(m))
  await shot('loggedout-400')
  s = await view('shopping-list.md')
  m = await measure(page)
  check('logged out, true 400 px, a very long word: no sideways scroll', !!s && !m.sideways, JSON.stringify(m))
  await finish()
} catch (error) { await finish(error) }
