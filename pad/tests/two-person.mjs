// Two people on one pad, as a reviewer would check it: me (port 9521) and bob (port 9522), each logged in as
// himself in his own browser, side by side.
//   1. A pad me shares with bob for reading and writing: bob sees me's lines; me edits a line and bob's page shows
//      the change by itself; bob adds a line and me's page shows it by itself; then each edits a different line
//      at once, and after a reload both see both edits (no lost update), each line recorded as its writer's.
//   2. A pad me shares with bob for reading only: bob sees the lines, gets no fields and is told he can only read;
//      a write he sends himself is refused by the pod and the file is unchanged.
//   3. A pad me shares with bob for appending only (WAC Append, no Write): every change this pane makes deletes
//      something, which Append does not allow, so bob should not be offered fields that cannot save.
// Data: suite-data/pad-review/ (rebuilt each run, removed at the end).
//   node tests/two-person.mjs
import { open, config, LAB, POD, POD2, sleep } from '../../lib/lib.mjs'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'pad/pad-pane.js'
const ROOT = path.join(config.podDir, 'public', 'suite-data', 'pad-review')
if (!ROOT.endsWith(path.join('suite-data', 'pad-review'))) throw new Error('refusing: unexpected data folder ' + ROOT)
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
const folder = (name) => POD + 'public/suite-data/pad-review/' + name + '/'
const padOf = (name) => folder(name) + 'index.ttl#this'
const disk = (name) => readFileSync(path.join(ROOT, name, 'index.ttl'), 'utf8')

// A pad with two lines by me, shared with bob in the given modes (access rules as JSON-LD: this server refuses Turtle).
function makePad (name, title, bobModes) {
  const dir = path.join(ROOT, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'index.ttl'), `@prefix pad: <http://www.w3.org/ns/pim/pad#>.
@prefix dc: <http://purl.org/dc/elements/1.1/>.
@prefix sioc: <http://rdfs.org/sioc/ns#>.
<#this> a pad:Notepad; dc:title "${title}"; dc:author <${ME}>; pad:next <#l1>.
<#l1> sioc:content "Monday: me"; dc:author <${ME}>; pad:next <#l2>.
<#l2> sioc:content "Wednesday: open"; dc:author <${ME}>; pad:next <#this>.
`)
  const rule = (id, agent, modes) => ({ '@id': id, '@type': 'acl:Authorization', 'acl:agent': { '@id': agent }, 'acl:accessTo': { '@id': folder(name) }, 'acl:default': { '@id': folder(name) }, 'acl:mode': modes.map(m => ({ '@id': 'acl:' + m })) })
  writeFileSync(path.join(dir, '.acl'), JSON.stringify({ '@context': { acl: 'http://www.w3.org/ns/auth/acl#' }, '@graph': [rule('#me', ME, ['Read', 'Write', 'Control']), rule('#bob', BOB, bobModes)] }, null, 2))
}
makePad('both', 'Tea rota', ['Read', 'Write'])
makePad('read', 'Read-only rota', ['Read'])
makePad('append', 'Append-only rota', ['Read', 'Append'])

const me = await open({ pane: PANE, port: 9521, dir: import.meta.dirname, login: true, resource: padOf('both') })
const { check, finish, shot } = me
let bob = null

const values = (page) => page.evaluate(() => [...document.querySelectorAll('.npd-line textarea, .npd-line .npd-text')].map(i => i.value !== undefined ? i.value : i.textContent))
const lines = async (page) => (await values(page)).join('|')
const fields = (page) => page.evaluate(() => document.querySelectorAll('.npd-line textarea').length)
// Change line i as a person would: focus it, put the text, the input event, then leave it (which saves).
const setLine = (page, i, text) => page.evaluate((a) => {
  const [n, t] = JSON.parse(a)
  const f = document.querySelectorAll('.npd-line textarea')[n]
  f.focus(); f.value = t; f.dispatchEvent(new Event('input', { bubbles: true })); f.blur()
}, JSON.stringify([i, text]))
const saved = (page) => page.waitFor(() => !document.querySelector('.npd-pending') && /^(Saved|Not saved)/.test(document.querySelector('.npd-status').textContent), { timeout: 20000 }).then(() => page.evaluate(() => document.querySelector('.npd-status').textContent), () => 'timed out')
const arrives = (page, want) => page.waitFor((w) => [...document.querySelectorAll('.npd-line textarea, .npd-line .npd-text')].map(i => i.value !== undefined ? i.value : i.textContent).join('|') === w, { timeout: 25000, args: [want] }).then(() => true, () => false)
const onDisk = async (name, re) => { const end = Date.now() + 10000; while (Date.now() < end && !re.test(disk(name))) await sleep(250); return re.test(disk(name)) }
// Who the pod says wrote the line whose text is given: the file read fresh and parsed (it may be stored as Turtle or
// as JSON-LD, so not by its text).
const authorOf = (name, text) => me.page.evaluate(async (args) => {
  const [url, t, ME, BOB] = JSON.parse(args)
  const g = window.$rdf.graph()
  await new window.$rdf.Fetcher(g, { fetch: window.SolidLogic.store.fetcher._fetch }).load(url, { force: true })
  const lines = g.statementsMatching(null, g.sym('http://rdfs.org/sioc/ns#content'), null).filter(st => st.object.value === t)
  if (lines.length !== 1) return lines.length + ' lines with that text'
  const who = g.each(lines[0].subject, g.sym('http://purl.org/dc/elements/1.1/author')).map(x => x.value)
  return who.length !== 1 ? who.length + ' authors' : who[0] === BOB ? 'bob' : who[0] === ME ? 'me' : '?'
}, JSON.stringify([folder(name) + 'index.ttl', text, ME, BOB]))

try {
  // ---- 1. shared for reading and writing
  await me.page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 2, { timeout: 40000 })
  check('me: my pad opens with its two lines, editable', await lines(me.page) === 'Monday: me|Wednesday: open')

  bob = await open({ pane: PANE, port: 9522, dir: import.meta.dirname, as: config.user2, login: true, resource: padOf('both') })
  await bob.page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 2, { timeout: 40000 })
  check('bob, logged in as himself: the shared pad opens with me\'s lines, and he may edit it', await lines(bob.page) === 'Monday: me|Wednesday: open')

  await setLine(me.page, 0, 'Monday: me, with biscuits')
  check('me edits my first line: saved', /^Saved/.test(await saved(me.page)) && await onDisk('both', /Monday: me, with biscuits/))
  check('bob: me\'s edit arrives on his page by itself, without a reload', await arrives(bob.page, 'Monday: me, with biscuits|Wednesday: open'), await lines(bob.page))

  await bob.page.evaluate(() => { const f = document.querySelectorAll('.npd-line textarea')[1]; f.focus(); f.setSelectionRange(f.value.length, f.value.length) })
  await bob.page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await bob.page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await bob.page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 3 && document.activeElement === document.querySelectorAll('.npd-line textarea')[2], { timeout: 15000 })
  await bob.page.type('Friday: Bob')
  await bob.page.evaluate(() => document.activeElement.blur())
  check('bob adds a line of his own: saved, and on the pod as his', /^Saved/.test(await saved(bob.page)) && await onDisk('both', /Friday: Bob/) && (await authorOf('both', 'Friday: Bob')) === 'bob', await authorOf('both', 'Friday: Bob'))
  check('me: bob\'s new line arrives on my page by itself', await arrives(me.page, 'Monday: me, with biscuits|Wednesday: open|Friday: Bob'), await lines(me.page))

  // Both at once, on different lines.
  await Promise.all([setLine(me.page, 1, 'Wednesday: me after all'), setLine(bob.page, 0, 'Monday: Bob brings the milk')])
  const [a, b] = await Promise.all([saved(me.page), saved(bob.page)])
  check('me and bob each change a different line at the same moment: both say saved', /^Saved/.test(a) && /^Saved/.test(b), a + ' / ' + b)
  await Promise.all([me.page.goto(me.address(padOf('both'))), bob.page.goto(bob.address(padOf('both')))])
  const want = 'Monday: Bob brings the milk|Wednesday: me after all|Friday: Bob'
  const [meSees, bobSees] = await Promise.all([arrives(me.page, want), arrives(bob.page, want)])
  check('after a reload both see both changes: neither overwrote the other', meSees && bobSees, (await lines(me.page)) + ' / ' + (await lines(bob.page)))
  check('the pod records each line as its last writer\'s', (await authorOf('both', 'Monday: Bob brings the milk')) === 'bob' && (await authorOf('both', 'Wednesday: me after all')) === 'me')
  const contents = (disk('both').match(/sioc:content|rdfs\.org\/sioc\/ns#content/g) || []).length
  check('the pad stays well formed: one text per line', contents === 3, contents + ' texts for 3 lines')
  await me.page.waitFor(() => [...document.querySelectorAll('.npd-who')].some(w => /Bob/.test(w.textContent)), { timeout: 20000 }).catch(() => {})
  check('me: bob is in the legend by his name', await me.page.evaluate(() => [...document.querySelectorAll('.npd-who')].some(w => /Bob/.test(w.textContent))))
  await me.shot('review-two-me-1300')
  await bob.shot('review-two-bob-1300')

  // ---- 2. shared for reading only
  const readBefore = disk('read')
  await bob.page.goto(bob.address(padOf('read')))
  await bob.page.waitFor(() => document.querySelectorAll('.npd-line').length === 2 && /read this pad but not change it|Log in/.test((document.querySelector('.npd-hint') || {}).textContent || ''), { timeout: 40000 }).catch(() => {})
  check('bob, read-only share: he sees me\'s lines', await lines(bob.page) === 'Monday: me|Wednesday: open', await lines(bob.page))
  check('…as text, not fields, and he is told he can only read', await fields(bob.page) === 0 && /read this pad but not change it/.test(await bob.page.evaluate(() => document.querySelector('.npd-hint').textContent)), await bob.page.evaluate(() => document.querySelector('.npd-hint').textContent))
  const refused = await bob.page.evaluate(async (u) => {
    const r = await window.SolidLogic.store.fetcher._fetch(u, { method: 'PATCH', headers: { 'Content-Type': 'application/sparql-update' }, body: 'INSERT DATA { <' + u + '#l1> <http://rdfs.org/sioc/ns#content> "Bob was here" . }' })
    return r.status
  }, padOf('read').split('#')[0])
  check('bob\'s own write to the read-only pad is refused by the pod, and the file is unchanged', refused === 403 && disk('read') === readBefore, 'status ' + refused)
  await bob.shot('review-two-bob-readonly')

  // ---- 3. shared for appending only
  const appendBefore = disk('append')
  await bob.page.goto(bob.address(padOf('append')))
  await bob.page.waitFor(() => document.querySelectorAll('.npd-line').length === 2 && !!(document.querySelector('.npd-hint') || {}).textContent, { timeout: 40000 }).catch(() => {})
  await sleep(1500)
  const appendFields = await fields(bob.page)
  let appendSay = ''
  if (appendFields) { await setLine(bob.page, 0, 'Monday: Bob'); appendSay = await saved(bob.page) }
  check('bob, append-only share: he is not offered fields that cannot save (every edit here deletes, which Append does not allow)', appendFields === 0, appendFields + ' fields; typing in one: ' + appendSay)
  check('…and the append-only pad is unchanged on the pod', disk('append') === appendBefore)
  await bob.shot('review-two-bob-append')

  await bob.page.close()
  rmSync(ROOT, { recursive: true, force: true })
  await finish()
} catch (error) { if (bob) await bob.page.close().catch(() => {}); await finish(error) }
