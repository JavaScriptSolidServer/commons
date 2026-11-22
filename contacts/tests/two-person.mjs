// Two people and one address book: me shares a book with bob. First bob can only read it: he sees the people
// and groups, gets no controls, and the server refuses his own writes. Then me gives him write: bob adds a
// contact and puts them in a group, and me sees both after a reload.
//   node tests/two-person.mjs        (KEEP=1 keeps the book)
// Browsers: me on 9515, bob on 9516. Data: me/public/suite-data/contacts/two-person/book/ (rebuilt on every run),
// a copy of samples/book with its own JSON-LD access rule.
import { open, LAB, POD, POD2, config, sleep } from '../../lib/lib.mjs'
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'contacts/contacts-pane.js'
const FOLDER = POD + 'public/suite-data/contacts/two-person/book/'
const BOOK = FOLDER + 'index.ttl#this'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'contacts', 'two-person', 'book')
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
const here = import.meta.dirname
if (!DIR.endsWith('/suite-data/contacts/two-person/book')) throw new Error('refusing: unexpected data folder ' + DIR)

const acl = (bobModes) => JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@graph': [
    { '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': ME }, 'acl:accessTo': { '@id': FOLDER }, 'acl:default': { '@id': FOLDER }, 'acl:mode': ['Read', 'Write', 'Control'].map(m => ({ '@id': 'acl:' + m })) },
    ...(bobModes.length ? [{ '@id': '#bob', '@type': 'acl:Authorization', 'acl:agent': { '@id': BOB }, 'acl:accessTo': { '@id': FOLDER }, 'acl:default': { '@id': FOLDER }, 'acl:mode': bobModes.map(m => ({ '@id': 'acl:' + m })) }] : [])
  ]
}, null, 2)
function reset () {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })
  cpSync(path.join(here, '..', 'samples', 'book'), DIR, { recursive: true })
  writeFileSync(path.join(DIR, '.acl'), acl(['Read']))
}
const disk = (name) => { const p = path.join(DIR, name); return existsSync(p) ? readFileSync(p, 'utf8') : '' }
reset()

let failed = 0
let me, bob
const results = []
const check = (name, ok, detail = '') => { if (!ok) failed++; results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`) }

const view = (page) => page.evaluate(() => {
  const r = document.querySelector('.ctc.contacts-pane')
  const vis = (n) => !!n && !n.hidden && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0
  return {
    rows: [...r.querySelectorAll('.ctc-row-title')].map(n => n.textContent),
    chips: [...r.querySelectorAll('.ctc-chips .ctc-chip')].map(n => n.textContent),
    card: (r.querySelector('.ctc-person .ctc-name') || {}).textContent || '',
    cardText: (r.querySelector('.ctc-person') || {}).textContent || '',
    msg: (r.querySelector('.ctc-msg') || {}).textContent || '',
    editControls: [...r.querySelectorAll('.ctc-add, .ctc-new-group, .ctc-edit, .ctc-delete, .ctc-x, .ctc-pick, form')].filter(vis).map(n => n.className.split(' ').pop()),
    sideways: document.documentElement.scrollWidth > innerWidth
  }
})
const rowsLoaded = (page, n) => page.waitFor((k) => document.querySelectorAll('.ctc .ctc-row').length === k && !/Reading/.test(document.querySelector('.ctc').textContent), { timeout: 40000, args: [n] })
const pick = (page, who) => page.evaluate((name) => { const row = [...document.querySelectorAll('.ctc-row')].find(r => r.querySelector('.ctc-row-title').textContent === name); if (!row) return false; row.click(); return true }, who)
const settled = (page) => page.waitFor(() => /^(good|bad)$/.test(document.querySelector('.ctc-msg').dataset.kind || '') && !document.querySelector('.ctc button:disabled'), { timeout: 30000 })
const status = (page) => page.evaluate(() => { const s = document.querySelector('.ctc-msg'); return (s.dataset.kind || '') + ' :: ' + s.textContent })
// bob's own request, with his logged-in fetch.
const asBob = (method, uri, body, type) => bob.page.evaluate(async (v) => {
  const [m, u, b, t] = JSON.parse(v)
  const r = await window.SolidLogic.store.fetcher._fetch(u, { method: m, cache: 'no-store', ...(b ? { headers: { 'Content-Type': t }, body: b } : {}) })
  return r.status
}, JSON.stringify([method, uri, body || null, type || 'text/turtle']))

try {
  me = await open({ pane: PANE, port: 9515, dir: here, resource: BOOK })
  await me.page.waitFor(() => !!document.querySelector('.ctc .ctc-add'), { timeout: 40000 })
  await rowsLoaded(me.page, 3)
  let m = await view(me.page)
  check('me: my shared book opens with its three people and my controls', m.rows.join(',') === 'Alice Example,Bob Builder,Carol Danvers' && m.editControls.includes('ctc-add'), m.rows.join(',') + ' | ' + m.editControls.join(' '))

  // ---- 1. bob can read, not write ----
  bob = await open({ pane: PANE, port: 9516, dir: here, resource: BOOK, as: 'bob' })
  const who = await bob.page.evaluate(() => { try { return window.SolidLogic.authn.currentUser().value } catch { return null } })
  check('bob: logged in as bob', who === BOB, String(who))
  await rowsLoaded(bob.page, 3)
  await sleep(800)
  let b = await view(bob.page)
  check('bob (read only): sees the same three people', b.rows.join(',') === 'Alice Example,Bob Builder,Carol Danvers', b.rows.join(','))
  check('bob (read only): sees the groups', b.chips.join(',') === 'All contacts,Friends,Work', b.chips.join(','))
  check('bob (read only): no New contact, no New group', !b.editControls.length, b.editControls.join(' '))
  check('bob (read only): a note says he may see but not change the book (review 6)', /can see this address book but not change it/.test(b.msg), b.msg)
  await pick(bob.page, 'Alice Example')
  await bob.page.waitFor(() => /alice@example\.org/.test((document.querySelector('.ctc-person') || {}).textContent || ''), { timeout: 10000 })
  b = await view(bob.page)
  check('bob (read only): opens Alice\'s card with her email', b.card === 'Alice Example' && /alice@example\.org/.test(b.cardText), b.card)
  check('bob (read only): the card has no Edit, Delete, group menu or ×', !b.editControls.length, b.editControls.join(' '))
  check('bob (read only): no sideways scroll at 1300 px', !b.sideways)
  await bob.shot('review-two-bob-read')
  const before = disk('people.ttl')
  const put = await asBob('PUT', FOLDER + 'people.ttl', '<#x> <http://www.w3.org/2006/vcard/ns#fn> "Bob was here" .')
  const patch = await asBob('PATCH', FOLDER + 'people.ttl', 'INSERT DATA { <#x> <http://www.w3.org/2006/vcard/ns#fn> "Bob was here" . }', 'application/sparql-update')
  const card = await asBob('PUT', FOLDER + 'Person/bobs/index.ttl', '<#this> a <http://www.w3.org/2006/vcard/ns#Individual> .')
  check('server: bob\'s PUT, PATCH and new card are refused', [put, patch, card].every(s => [401, 403].includes(s)), [put, patch, card].join(' '))
  check('pod: people.ttl unchanged', disk('people.ttl') === before)

  // ---- 2. me gives bob write; bob adds a contact and groups them ----
  writeFileSync(path.join(DIR, '.acl'), acl(['Read', 'Write']))
  await bob.page.goto(bob.address(BOOK))
  await bob.page.waitFor(() => !!document.querySelector('.ctc .ctc-add'), { timeout: 40000 })
  await rowsLoaded(bob.page, 3)
  b = await view(bob.page)
  check('bob (can edit): after a reload he gets New contact and New group', b.editControls.includes('ctc-add') && b.editControls.includes('ctc-new-group'), b.editControls.join(' '))
  await bob.page.evaluate(() => document.querySelector('.ctc-add').click())
  await bob.page.waitFor(() => !!document.querySelector('form.ctc-form'), { timeout: 5000 })
  await bob.page.evaluate(() => { const f = document.querySelector('form.ctc-form'); f.querySelector('[name=name]').value = 'Dave Shared'; f.querySelector('[name=email]').value = 'dave@example.org'; f.querySelector('[name=role]').value = 'Added by Bob'; f.requestSubmit() })
  await settled(bob.page)
  check('bob (can edit): adds Dave Shared', /good :: Dave Shared was added/.test(await status(bob.page)), await status(bob.page))
  check('pod: people.ttl lists Dave', /Dave Shared/.test(disk('people.ttl')))
  const cards = readdirSync(path.join(DIR, 'Person')).filter(d => !['alice', 'bob', 'carol'].includes(d))
  check('pod: one new card folder, with Dave\'s email', cards.length === 1 && /dave@example\.org/.test(disk('Person/' + cards[0] + '/index.ttl')), cards.join(' '))
  // bob puts Dave in Friends with the card's menu
  await bob.page.waitFor(() => !!document.querySelector('.ctc-person select.ctc-pick'), { timeout: 10000 })
  await bob.page.evaluate(() => { const s = document.querySelector('.ctc-person select.ctc-pick'); s.value = [...s.options].find(o => o.textContent === 'Friends').value; s.dispatchEvent(new Event('change')) })
  await settled(bob.page)
  check('bob (can edit): adds Dave to Friends', /good :: Dave Shared was added to Friends/.test(await status(bob.page)), await status(bob.page))
  check('pod: Friends.ttl holds Dave', /Dave Shared/.test(disk('Group/Friends.ttl')) && cards.every(c => disk('Group/Friends.ttl').includes(c)))
  await bob.shot('review-two-bob-added')

  // ---- 3. me sees bob's change after a reload ----
  await me.page.goto(me.address(BOOK))
  await rowsLoaded(me.page, 4)
  m = await view(me.page)
  check('me after reload: Dave is in my list', m.rows.join(',') === 'Alice Example,Bob Builder,Carol Danvers,Dave Shared', m.rows.join(','))
  await pick(me.page, 'Dave Shared')
  await me.page.waitFor(() => /dave@example\.org/.test((document.querySelector('.ctc-person') || {}).textContent || ''), { timeout: 10000 })
  m = await view(me.page)
  check('me after reload: Dave\'s card shows the email, role and Friends that bob gave', /dave@example\.org/.test(m.cardText) && /Added by Bob/.test(m.cardText) && /Friends/.test(m.cardText), m.cardText.slice(0, 160))
  await me.page.evaluate(() => [...document.querySelectorAll('.ctc-chip')].find(c => c.textContent === 'Friends').click())
  await sleep(300)
  m = await view(me.page)
  check('me after reload: the Friends filter has Dave in it', m.rows.includes('Dave Shared'), m.rows.join(','))
  await me.shot('review-two-me-sees-dave')

  // ---- 4. bob loses access ----
  writeFileSync(path.join(DIR, '.acl'), acl([]))
  await bob.page.goto(bob.address(BOOK))
  // The data browser may not hand a 403 resource to the pane at all; either way bob must see no one.
  await bob.page.waitFor(() => { const s = document.querySelector('.ctc-msg'); return (!!s && s.dataset.kind === 'bad') || /403|forbidden|not allowed|denied/i.test(document.body.innerText) }, { timeout: 30000 }).catch(() => false)
  await sleep(1500)
  const gone = await bob.page.evaluate(() => ({ pane: !!document.querySelector('.ctc.contacts-pane'), rows: document.querySelectorAll('.ctc-row').length, controls: document.querySelectorAll('.ctc-add, .ctc-edit, .ctc-delete').length, msg: (document.querySelector('.ctc-msg') || {}).textContent || '', body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200) }))
  console.log('     bob without access sees: ' + JSON.stringify(gone))
  check('bob (no access): no people and no controls', !gone.rows && !gone.controls, JSON.stringify(gone))
  check('pod: the book is unchanged after bob loses access', /Dave Shared/.test(disk('people.ttl')))
  await bob.shot('review-two-bob-removed')
} catch (error) {
  failed++
  console.log('FAIL ' + (error && error.message ? error.message : error))
  if (bob) await bob.shot('review-two-error-bob')
  if (me) await me.shot('review-two-error-me')
}
if (bob) await bob.page.close().catch(() => {})
if (!process.env.KEEP) rmSync(path.dirname(DIR), { recursive: true, force: true })
console.log(failed ? `\n${failed} failure(s)` : `\nall passed (${results.length} checks)`)
if (me) await me.page.close().catch(() => {})
process.exit(failed ? 1 : 0)
