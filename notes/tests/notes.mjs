// The notes pane alone in the data browser, logged in as the test user: what a note shows, links between notes
// (resolved, dated, missing), previous / next, a hostile note, a private note, a missing file, a reload, that it
// writes nothing, and no sideways scroll at 1300 px and a true 400 px (design/viewport.mjs).
//   node tests/notes.mjs        (after setup.mjs)
import { open, sleep } from '../../lib/lib.mjs'
import { narrow, wide, measure } from '../../design/viewport.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { BASE, DEST, PANE, PORT, NOTES, SETTLED, SEEN } from './setup.mjs'

const files = () => readdirSync(path.join(DEST, 'journal')).sort().map(f => f + ':' + createHash('sha1').update(readFileSync(path.join(DEST, 'journal', f))).digest('hex')).join('\n')
const before = files()
const N = NOTES.length

const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, login: true, resource: BASE + 'welcome.md' })
const writes = []
await page.send('Network.enable')
page.on(({ method, params }) => { if (method === 'Network.requestWillBeSent' && !['GET', 'HEAD', 'OPTIONS'].includes(params.request.method) && params.request.url.includes('/suite-data/notes/')) writes.push(params.request.method + ' ' + params.request.url) })

const settled = (count = N) => page.waitFor(`(${SETTLED})(${count})`, { timeout: 40000 }).then(() => true, () => false)
const seen = () => page.evaluate(`(${SEEN})()`)
const view = async (name, count) => { await page.goto(address(BASE + name)); const ok = await settled(count); await sleep(300); return ok ? seen() : null }
// Opening in place: the page is not loaded again, so a mark left on window survives.
const mark = () => page.evaluate(() => { window.__stay = 'here' })
const stayed = () => page.evaluate(() => window.__stay === 'here')
const click = (sel, text) => page.evaluate((s, t) => { const a = [...document.querySelectorAll(s)].find(e => !t || e.textContent.trim() === t); if (!a) return false; a.click(); return true }, sel, text || '')
const titled = (t) => page.waitFor((want) => { const h = document.querySelector('.note.notes-reader-pane .note-body h1'); return !!h && h.textContent === want && !!document.querySelector('.note-pager .note-all:not(.note-off)') }, { timeout: 30000, args: [t] }).then(() => true, () => false)

try {
  // ---- a note, its Markdown drawn as page elements
  let s = await view('welcome.md')
  check('a Markdown note opens in this pane first', !!s && await page.evaluate(() => window.panes.byName('notes-reader').shouldGetFocus(SolidLogic.store.sym(new URL(location.href).searchParams.get('uri'))) === true && !!document.querySelector('.note.notes-reader-pane.note-root')))
  check('its title is the first heading, shown once', s.title === 'Alice\'s notebook' && s.h1s === 1, s.title + ' x' + s.h1s)
  check('headings, table, quote and code are drawn', s.h2.join('|') === 'Links between notes|What else it shows' && s.table.length === 4 && s.table[2] === '- [ ] task / a checkbox' && s.table[3] === '**bold** / bold' && /Notes are files you own/.test(s.quote) && s.pre === 'code keeps its    spacing', JSON.stringify({ h2: s.h2, table: s.table, pre: s.pre }))
  check('[[name]] links the note beside it; [[name|label]] shows the label and finds a dated note without its date', s.wikis[0] === `linking|${BASE}linking.md|` && s.wikis[1] === `The seed swap|${BASE}2026-11-20-seed-swap.md|`, s.wikis.join(' ; '))
  check('a note that does not exist is greyed, with no link', s.wikis[2] === 'not-written-yet||missing' && await page.evaluate(() => /No note called "not-written-yet"/.test(document.querySelector('a.note-wiki.missing').title)), s.wikis[2])
  check('ordinary links: a relative one, and an outside one with rel noopener', s.links.includes('the shopping list|shopping-list.md|') && s.links.includes('https://alice.example/|https://alice.example/|noopener'), s.links.join(' ; '))
  check('the last note: previous is the note before it, next is not offered, "All notes" counts the folder', s.prev.href === BASE + 'shopping-list.md' && s.prev.text === 'Previous' && s.prev.shown && !s.next.shown && s.next.href === null && s.all.text === `All notes (${N})` && s.all.href === BASE, JSON.stringify([s.prev, s.all, s.next]))
  check('alone, there is no navigation column of its own', !s.ownNav && await page.evaluate(() => !document.querySelector('.note-nav-item')))
  let m = await measure(page)
  check('1300 px: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('welcome-1300')

  // ---- links open in place
  await mark()
  await click('a.note-wiki', 'linking')
  check('a [[link]] opens that note in place', await titled('Linking notes') && await stayed())
  s = await seen()
  check('…where [[first-entry]] finds the dated note, and [[welcome|back to the start]] keeps its words', s.wikis.includes(`first-entry|${BASE}2026-11-18-first-entry.md|`) && s.wikis.includes(`back to the start|${BASE}welcome.md|`), s.wikis.join(' ; '))
  await click('a.note-wiki', 'first-entry')
  check('a dated note opens in place', await titled('First entry') && await stayed())
  s = await seen()
  check('its date is shown above its title', s.date === '18 November 2026', s.date)
  check('the first note: no previous; next is named by its date', !s.prev.shown && s.next.text === '20 November 2026' && s.next.href === BASE + '2026-11-20-seed-swap.md', JSON.stringify([s.prev, s.next]))
  await click('.note-pager .note-next')
  check('next opens the next note in place', await titled('Seed swap at Carol\'s') && await stayed())
  s = await seen()
  check('tasks are checkboxes that cannot be changed, done ones marked; nested lists nest', s.tasks.join(';') === 'xd|Label the envelopes|note-task note-done; d|Sow the beans in March|note-task; d|Ask Bob about the bamboo canes|note-task' && s.nested === 1, s.tasks.join(';'))
  check('previous is named by its date, next ("Next") is the next file', s.prev.text === '18 November 2026' && s.next.text === 'Next' && s.next.href === BASE + 'hostile.md', JSON.stringify([s.prev, s.next]))
  await click('.note-pager .note-prev')
  check('previous goes back in place', await titled('First entry') && await stayed())

  // ---- a hostile note: its markup stays text
  s = await view('hostile.md')
  await sleep(1500)
  s = await seen()
  check('a note with script, an image handler and a javascript: link runs nothing', s.scripts === 0 && !s.pwned && !(await page.evaluate(() => window.__pwned || null)), `${s.scripts} ${s.pwned}`)
  check('…its markup is shown as text, and the bad links are text, not links', /<script>window.__pwned = 'script'<\/script>/.test(s.text) && /bad link/.test(s.text) && !s.links.some(l => /javascript:|data:/.test(l)), s.links.join(' ; '))

  // ---- a second hostile note: what the review found (REVIEW.md 1-5, 7)
  s = await view('hostile2.md')
  check('the title is the first real heading, not a # comment in a code block, and is not lost', s.title === 'Real title' && s.h1s === 1 && /^# install it first/.test(s.pre) && !/Real title/.test(s.text.replace(s.title, '')), s.title)
  check('a # in a heading is kept (Learn C#); a closing ### after a space is dropped', s.h2[0] === 'Learn C#' && await page.evaluate(() => document.querySelector('.note-body h3').textContent) === 'Closed heading', s.h2.join('|'))
  check('[[//other-site/…]] and [[../outside]] are not links: greyed, no address; a sub-folder note is', s.wikis.join(' ; ') === `//evil.example/steal||missing ; ../outside||missing ; sub/inner|${BASE}sub/inner.md|`, s.wikis.join(' ; '))
  check('a //other-site link gets rel noopener; tel: is a link; same-site and #anchor have none; vbscript: is text', s.links.join(' ; ') === 'phish|//evil.example/phish|noopener ; call Bob|tel:+15550100| ; the folder|/me/public/| ; anchor|#top|' && /vbs/.test(s.text), s.links.join(' ; '))
  check('a quote 20 000 deep is drawn (20 levels, then text), not lost to a stack error', !s.msg && await page.evaluate(() => { let d = 0; let q = document.querySelector('.note-body blockquote'); while (q) { d++; q = q.querySelector(':scope > blockquote') } return d === 20 && /deep quote/.test(document.querySelector('.note-body').textContent) }), s.msg)
  m = await measure(page)
  check('the hostile notes still have no sideways scroll at 1300 px', !m.sideways, JSON.stringify(m))
  await shot('hostile2-1300')

  // ---- private, missing
  s = await view('private.md')
  check('a private note opens for its owner', s && s.title === 'Private' && /Only Alice may read this/.test(s.text), s && s.title)
  // A missing file never reaches the pane: the data browser loads it first and says so itself.
  await page.goto(address(BASE + 'nope.md'))
  const gone = await page.waitFor(() => /Not Found|404/.test(document.body.innerText), { timeout: 30000 }).then(() => true, () => false)
  check('a note that is not there: the browser says Not Found, and nothing half-drawn is left', gone && await page.evaluate(() => !document.querySelector('.note.notes-reader-pane')))

  // ---- a reload reads back the same
  s = await view('welcome.md')
  await page.reload()
  await settled()
  const again = await seen()
  check('after a reload it shows the same', again.title === s.title && again.wikis.join() === s.wikis.join() && again.table.join() === s.table.join() && again.all.text === s.all.text)

  // ---- a true 400 px
  await narrow(page)
  await sleep(500)
  m = await measure(page)
  check('true 400 px, a note with a table: no sideways scroll', !m.sideways, JSON.stringify(m))
  check('true 400 px: the previous / all / next bar fits on one line', await page.evaluate(() => { const r = [...document.querySelectorAll('.note-pager .note-btn')].map(a => a.getBoundingClientRect()); return r.every(b => Math.abs(b.top - r[0].top) < 2 && b.right <= innerWidth && b.height >= 44) }))
  check('true 400 px: previous / next become icon buttons with their name as a tooltip; All notes is not cut short', await page.evaluate(() => { const p = document.querySelector('.note-pager .note-prev'); const all = document.querySelector('.note-pager .note-all span:last-child'); return Math.round(p.getBoundingClientRect().width) === 44 && p.title === 'Previous' && all.scrollWidth <= all.clientWidth }))
  await shot('welcome-400')
  await view('hostile2.md')
  m = await measure(page)
  check('true 400 px, the hostile note (20 nested quotes): no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('hostile2-400')
  await view('shopping-list.md')
  m = await measure(page)
  check('true 400 px, a note with a very long word: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shopping-400')
  await wide(page)
  await click('a.note-wiki', 'not-written-yet') // nothing to follow
  await view('2026-11-20-seed-swap.md')
  await shot('seed-swap-1300')

  // ---- read-only
  check('it never writes: no PUT, PATCH, POST or DELETE to the notes', writes.length === 0, writes.join(' ; '))
  check('…and the files on the pod are as they were', files() === before)
  let lint = ''
  try { execFileSync(process.execPath, [path.join(import.meta.dirname, '..', '..', 'design', 'embed.mjs'), path.join(import.meta.dirname, '..', 'notes-pane.js'), '--check'], { encoding: 'utf8' }) } catch (e) { lint = String(e.stdout || e.message) }
  check('the design block in the pane is current (design/embed.mjs --check)', !lint, lint.trim())
  await finish()
} catch (error) { await finish(error) }
