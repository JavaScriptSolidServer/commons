// The Activity pane, logged in as the pod's owner, on Alice's sample folder: the stream holds the right files,
// newest first, in the right groups; titles and kinds come from the files; the filters narrow it; the walk
// stops at four levels and at 60 folders; a file touched during the test comes first after a reload; a row
// opens its thing; the shell contract (navigation, details) works; nothing on the pod changes; no sideways
// scroll at 1300 px and at a true 400 px.
//   node tests/activity.mjs
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, wide, measure } from '../../design/viewport.mjs'
import { readFileSync, readdirSync, statSync, utimesSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { DEST, BASE, times, BIG } from './setup.mjs'

const PANE = LAB + 'activity/activity-pane.js'
const ALICE = BASE + 'alice/'
const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9541, dir: import.meta.dirname, login: true, resource: ALICE })

// Every file under the test folder, hashed: the pane must not change any.
const hashes = (dir = DEST) => readdirSync(dir).flatMap(n => { const p = path.join(dir, n); return statSync(p).isDirectory() ? hashes(p) : [path.relative(DEST, p) + ':' + createHash('sha1').update(readFileSync(p)).digest('hex')] }).sort().join('\n')
const before = hashes()

// Logged in, ready means read in full: the owner-only folder too (the session may be restored after the first read).
const ready = () => page.waitFor(() => { const r = document.querySelector('.act.suite-activity[data-ready]'); return !!r && r.dataset.unread === '0' }, { timeout: 40000 }).catch(() => false)
const rows = () => page.evaluate(() => [...document.querySelectorAll('.act.suite-activity .act-item')].map(a => ({
  uri: a.dataset.uri, kind: a.dataset.kind, name: a.querySelector('.act-name').textContent, where: a.querySelector('.act-where').textContent,
  when: a.querySelector('.act-when').textContent, group: a.querySelector('.act-when').dataset.group, iso: a.querySelector('.act-when').getAttribute('datetime'), href: a.getAttribute('href')
})))
const filters = () => page.evaluate(() => [...document.querySelectorAll('.act.suite-activity .act-nav-item[data-filter]')].map(b => b.dataset.filter + '=' + (b.querySelector('.act-nav-count') || {}).textContent + (b.getAttribute('aria-current') ? '*' : '')).join(' '))
const pick = (id) => page.evaluate((id) => document.querySelector(`.act.suite-activity .act-nav-item[data-filter="${id}"]`).click(), id)
const rel = (uri) => uri.slice(ALICE.length)

try {
  await page.goto(address(ALICE))
  check('a folder opened by the pane\'s own link opens on Activity', !!await ready())
  let r = await rows()
  const want = Object.entries(times()).sort((a, b) => b[1] - a[1]).map(([f]) => f).filter(f => !f.includes('too-deep'))
  check('the stream: every dated file, newest first (the private one too, logged in)', r.map(x => rel(x.uri)).join(' ') === want.join(' '), r.map(x => rel(x.uri)).join(' '))
  check('times are in order', r.every((x, i) => i === 0 || x.iso <= r[i - 1].iso))
  const groups = [...new Set(r.map(x => x.group))]
  check('grouped: Today, Yesterday, This week, Last 30 days, then by month', groups.slice(0, 4).join('|') === 'Today|Yesterday|This week|Last 30 days' && groups.slice(4).every(g => /^[A-Z][a-z]+ \d{4}$/.test(g)), groups.join('|'))
  const headings = await page.evaluate(() => [...document.querySelectorAll('.act.suite-activity .act-group-title')].map(h => h.textContent).join('|'))
  check('each group has one heading', headings === groups.join('|'), headings)
  const by = Object.fromEntries(r.map(x => [rel(x.uri), x]))
  check('relative times', /^(\d+ min ago|just now)$/.test(by['notes/shopping.md'].when) && by['photos/lake.svg'].when === 'yesterday' && by['boards/garden.ttl'].when === '3 days ago', [by['notes/shopping.md'].when, by['photos/lake.svg'].when, by['boards/garden.ttl'].when].join(', '))
  check('each row names its folder', by['notes/shopping.md'].where === 'notes' && by['contacts/Person/carol/index.ttl'].where === 'contacts/Person/carol' && by['polls/dinner/index.ttl'].where === 'polls/dinner')
  const kinds = r.map(x => rel(x.uri) + '=' + x.kind).join(' ')
  check('kinds: from the type inside the file, or the file name', ['notes/shopping.md=notes', 'polls/dinner/index.ttl=polls', 'photos/lake.svg=photos', 'contacts/Person/carol/index.ttl=contacts', 'boards/garden.ttl=boards', 'pads/minutes.ttl=pads', 'documents/budget.csv=files', 'meetings/planning/index.ttl=meetings', 'contacts/people.ttl=contacts', 'contacts/index.ttl=contacts', 'data/plants.ttl=files'].every(k => kinds.includes(k)), kinds)
  check('a data file shows its own title', by['polls/dinner/index.ttl'].name === 'Club dinner' && by['contacts/Person/carol/index.ttl'].name === 'Carol Example' && by['boards/garden.ttl'].name === 'Garden jobs' && by['data/plants.ttl'].name === 'plants.ttl')
  check('a file that only mentions a typed thing from another file keeps its own name and opens itself', by['contacts/groups.ttl'] && by['contacts/groups.ttl'].name === 'groups.ttl' && by['contacts/groups.ttl'].kind === 'contacts' && new URL(by['contacts/groups.ttl'].href).searchParams.get('uri') === ALICE + 'contacts/groups.ttl' && !r.some(x => x.name === 'Friends'), JSON.stringify(by['contacts/groups.ttl']))
  check('a row links to its thing in the data browser (the main subject of a data file)', new URL(by['polls/dinner/index.ttl'].href).searchParams.get('uri') === ALICE + 'polls/dinner/index.ttl#this' && new URL(by['notes/shopping.md'].href).searchParams.get('uri') === ALICE + 'notes/shopping.md')

  // The walk's limits.
  const walk = await page.evaluate(() => { const d = document.querySelector('.act.suite-activity').dataset; return [d.read, d.deeper, d.skipped, d.unread].join(' ') })
  check('depth: four levels down is read, the fifth is not', !!by['archive/2025/old/deep/kept.md'] && !r.some(x => x.uri.includes('too-deep')) && walk.split(' ')[1] === '1', walk)
  const foot = await page.evaluate(() => document.querySelector('.act.suite-activity .act-foot').textContent)
  check('the footnote says how far it read and what it left out', /Read 19 folders \(at most 60\), up to 4 levels below this one/.test(foot) && /more than 4 levels down/.test(foot) && !/could not be read/.test(foot), foot)

  // Filters.
  let f = await filters()
  check('filters: All and Files, then only the apps that have something, with counts', f === 'all=17* files=3 photos=2 notes=4 contacts=4 boards=1 pads=1 polls=1 meetings=1', f)
  await shot('activity-1300')
  const only = async (id) => { await pick(id); await sleep(150); return (await rows()).map(x => rel(x.uri)) }
  let got = await only('contacts')
  check('Contacts: the four address-book files, newest first', got.join(' ') === 'contacts/Person/carol/index.ttl contacts/people.ttl contacts/groups.ttl contacts/index.ttl', got.join(' '))
  const title = await page.evaluate(() => document.querySelector('.act.suite-activity .act-title').textContent + ' ' + document.querySelector('.act.suite-activity').dataset.filter + ' ' + document.querySelector('.act-nav-item[data-filter="contacts"]').getAttribute('aria-current'))
  check('the chosen filter is marked and named in the heading', title === 'Contacts contacts page', title)
  await shot('activity-contacts')
  got = await only('files')
  check('Files: what no app claims', got.join(' ') === 'documents/budget.csv data/plants.ttl documents/report.pdf', got.join(' '))
  got = await only('photos')
  check('Photos', got.join(' ') === 'photos/lake.svg photos/bed.png', got.join(' '))
  got = await only('notes')
  check('Notes: Markdown files, the private diary among them', got.join(' ') === 'notes/shopping.md private/diary.md archive/2025/old/deep/kept.md notes/ideas.md', got.join(' '))
  got = await only('all')
  check('All again: the whole stream', got.length === 17)

  // A row opens its thing, in place. (A note: SolidOS's own poll view rewrites a poll its owner opens.)
  await page.evaluate(() => document.querySelector('.act.suite-activity [data-uri$="notes/shopping.md"]').click())
  await page.waitFor(() => !document.querySelector('.act.suite-activity'), { timeout: 20000 }).catch(() => {})
  const now = await page.evaluate(() => new URL(location.href).searchParams.get('uri') + ' ' + !!document.querySelector('.act.suite-activity'))
  check('clicking a row opens the thing in the data browser', now === ALICE + 'notes/shopping.md false', now)
  await sleep(4000) // leaving at once lost the login in headless runs (see NOTES)

  // A file touched now comes first after a reload.
  const touched = path.join(DEST, 'alice', 'notes', 'ideas.md')
  utimesSync(touched, new Date(), new Date())
  await page.goto(address(ALICE))
  await ready()
  r = await rows()
  check('a file touched during the test is first after a reload, today, just now', rel(r[0].uri) === 'notes/ideas.md' && r[0].group === 'Today' && /^(just now|1 min ago)$/.test(r[0].when) && r.length === 17, rel(r[0].uri) + ' ' + r[0].group + ' ' + r[0].when + ' ' + r.length + ' ' + r.map(x => rel(x.uri)).join(' '))

  // The folder limit: big/ has 70 folders with a note each; 60 listings are read (big/ itself and 59 folders).
  await page.goto(address(BASE + 'big/'))
  await ready()
  r = await rows()
  const big = await page.evaluate(() => { const d = document.querySelector('.act.suite-activity').dataset; return d.read + ' ' + d.skipped + ' | ' + document.querySelector('.act.suite-activity .act-foot').textContent })
  const names = r.map(x => x.where)
  check('folder limit: 60 listings read, the 11 oldest folders left out, and it says so', big.startsWith('60 11 ') && /11 more folders were not read: the limit of 60 was reached/.test(big), big)
  check('folder limit: the newest 59 notes are listed, newest folder first', r.length === 50 && names[0] === 'f00' && names[49] === 'f49', r.length + ' ' + names[0] + ' ' + names[49])
  await page.evaluate(() => document.querySelector('.act.suite-activity .act-more').click())
  await sleep(200)
  r = await rows()
  check('"Show more" shows the rest, and none past the limit', r.length === BIG - 11 && r[r.length - 1].where === 'f58' && !r.some(x => x.where === 'f59'), r.length + ' ' + r[r.length - 1].where)

  // The shell contract, without the shell: render, then renderNavigation and renderDetails with the same context.
  const contract = await page.evaluate(async (args) => {
    const [paneUrl, folder] = JSON.parse(args)
    const pane = (await import(paneUrl)).default
    const store = SolidLogic.store
    let refreshed = 0; let went = ''
    const suite = { version: 1, state: {}, go (u) { went = u }, refreshNavigation () { refreshed++ }, showDetails () {} }
    const ctx = { dom: document, session: { store }, suite, getOutliner: () => null }
    const subject = store.sym(folder)
    const host = document.body.appendChild(document.createElement('div'))
    const content = host.appendChild(pane.render(subject, ctx))
    const nav = host.appendChild(pane.renderNavigation(subject, ctx))
    for (let i = 0; i < 100 && !content.dataset.ready; i++) await new Promise(r => setTimeout(r, 100))
    const navInContent = !!content.querySelector('[data-filter]')
    const navNow = nav.querySelectorAll('[data-filter]').length
    nav.querySelector('[data-filter="photos"]').click()
    const shown = content.querySelectorAll('.act-item').length
    content.querySelector('.act-item').click()
    const details = pane.renderDetails(subject, ctx)
    const out = { navInContent, navNow, shown, refreshed, went, details: details && details.textContent }
    host.remove()
    return JSON.stringify(out)
  }, JSON.stringify([PANE, ALICE]))
  const c = JSON.parse(contract)
  check('in the shell: the filters go to the left column, not the content', !c.navInContent && c.navNow === 9, JSON.stringify(c))
  check('in the shell: a filter in the left column narrows the content', c.shown === 2)
  check('in the shell: a row opens through suite.go', c.went === ALICE + 'photos/lake.svg', c.went)
  check('in the shell: the details column says what was read', /What was read/.test(c.details) && /Folders read19 of at most 60/.test(c.details), c.details)

  // Width.
  await page.goto(address(ALICE))
  await ready()
  let m = await measure(page)
  check('no sideways scroll at 1300 px', !m.sideways && !m.poking.length, JSON.stringify(m))
  await shot('activity-1300')
  await narrow(page, 400)
  await sleep(300)
  m = await measure(page)
  check('no sideways scroll at a true 400 px', m.innerWidth === 400 && !m.sideways && !m.poking.length, JSON.stringify(m))
  const narrowRow = await page.evaluate(() => { const t = document.querySelector('.act.suite-activity .act-when-sub'); return getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().width > 0 && getComputedStyle(document.querySelector('.act.suite-activity .act-when')).display === 'none' })
  check('at 400 px the time moves into the subline (the meta column is dropped under 520 px)', narrowRow)
  await shot('activity-400')
  await page.evaluate(() => document.querySelector('.act.suite-activity .act-chip[data-filter="contacts"]').click())
  await sleep(200)
  await shot('activity-400-contacts')
  await wide(page)

  check('the pane wrote nothing: every file under the test folder is unchanged', hashes() === before)
} catch (error) { await finish(error) }
await finish()
