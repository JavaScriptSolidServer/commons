// Whole-document writes (REVIEW.md 1, 2, 4) and who gets the pane (REVIEW.md 3), on copies in suite-data/profile-edit/.
// Dave's profile is JSON-LD the way older servers and apps wrote it: an inline cert:key, an inline email with no
// @id, an @list of languages, an empty string, and braces in the bio. A PATCH on JSS loses all of those; the pane
// must keep every one, save text with "}" exactly, put the original back when the pod stores something else, and
// refuse when the file changed since the page read it. A contact card (vcard:Individual, editable) is not offered.
//   node tests/whole.mjs      (logs in afresh)
import { open, POD, config } from '../../lib/lib.mjs'
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { PANE, PORT, show, sleep, realProfileHash } from './common.mjs'

const HOME = path.join(config.podDir, 'public/suite-data/profile-edit')
const DAVE_FILE = path.join(HOME, 'dave/profile/card.jsonld')
const DAVE = POD + 'public/suite-data/profile-edit/dave/profile/card.jsonld#me'
const DAVE_DOC = DAVE.split('#')[0]
const CONTACT = POD + 'public/suite-data/profile-edit/contact/card.ttl#this'
const F = 'http://xmlns.com/foaf/0.1/'
const V = 'http://www.w3.org/2006/vcard/ns#'
for (const [from, to] of [['dave/profile/card.jsonld', DAVE_FILE], ['contact/card.ttl', path.join(HOME, 'contact/card.ttl')]]) {
  rmSync(path.dirname(to), { recursive: true, force: true })
  mkdirSync(path.dirname(to), { recursive: true })
  copyFileSync(path.join(import.meta.dirname, '../samples', from), to)
}
const realBefore = realProfileHash()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, resource: DAVE, login: true })

// Every statement of the stored JSON-LD (read as JSON-LD, not through the server's Turtle, which drops lists and
// inline objects), blank nodes as _:b, lists spelled out: a sorted list of lines.
const lines = () => page.evaluate(async (u) => {
  const response = await fetch(u, { headers: { Accept: 'application/ld+json' }, cache: 'no-store' })
  const g = $rdf.graph()
  const text = await response.text()
  await new Promise((resolve, reject) => $rdf.parse(text, g, u, 'application/ld+json', (e) => e ? reject(e) : resolve()))
  const term = (t) => t.termType === 'BlankNode' ? '_:b' : t.termType === 'Collection' ? '( ' + t.elements.map(term).join(' ') + ' )' : t.termType === 'Literal' ? JSON.stringify(t.value) + (t.language ? '@' + t.language : '^^' + t.datatype.value) : t.value
  return g.statements.map(s => term(s.subject) + ' ' + term(s.predicate) + ' ' + term(s.object)).sort()
}, DAVE_DOC)
const lit = (v) => JSON.stringify(v) + '^^http://www.w3.org/2001/XMLSchema#string'
const diff = (a, b) => ({ gone: a.filter(l => !b.includes(l)), added: b.filter(l => !a.includes(l)) })
const saveField = async (name, value) => {
  await page.evaluate((args) => { const [n, v] = args; for (const m of document.querySelectorAll('.pfe-msg')) m.textContent = ''; document.querySelector(`.pfe [name=${n}]`).value = v; document.querySelector('.pfe [data-part=basics] form').requestSubmit() }, [name, value])
  await page.waitFor((n) => { const m = document.querySelector(`.pfe [data-field=${n}]`); return m && m.textContent && !/…$/.test(m.textContent) }, { timeout: 30000, args: [name] })
  return page.evaluate((n) => document.querySelector(`.pfe [data-field=${n}]`).textContent, name)
}
const kept = (text) => /c0ffee00c0ffee/.test(text) && /mailto:dave@example\.org/.test(text) && /language-code\/cs/.test(text) && /language-code\/en/.test(text)

try {
  await page.goto(address(DAVE))
  await page.waitFor(() => !!(window.panes && window.panes.byName('profile-edit-lab')), { timeout: 40000 })
  await sleep(2500)
  const labels = await page.evaluate((u) => { const p = window.panes.byName('profile-edit-lab'); const s = window.SolidLogic.store; return p.label(s.sym(u), { session: { store: s } }) }, DAVE)
  check('offered on a WebID profile the viewer may edit (it names an identity provider)', labels === 'Edit profile', labels)
  await show(page, 'profile-edit-lab', '.pfe', DAVE)
  const start = await lines()
  check('the copy holds an inline key, an inline email, a language list and an empty string', start.length >= 14 && start.some(l => / \( .*language-code\/en .*language-code\/cs \)$/.test(l)) && start.some(l => /cert#modulus/.test(l)) && start.includes(DAVE + ' ' + F + 'status ' + lit('')), start.length + '')

  // REVIEW 1 + 2: one name save with "}" keeps everything else and stores the name exactly.
  const named = await saveField('name', 'Dave {the} Tester')
  let now = await lines()
  let d = diff(start, now)
  check('a name with braces: "Saved", and exactly that one statement changed', named === 'Saved' && JSON.stringify(d) === JSON.stringify({ gone: [DAVE + ' ' + F + 'name ' + lit('Dave Older')], added: [DAVE + ' ' + F + 'name ' + lit('Dave {the} Tester')] }), named + ' ' + JSON.stringify(d).slice(0, 300))
  const disk = readFileSync(DAVE_FILE, 'utf8')
  check('on disk: the key, the email, both languages are still there, and the file is still JSON-LD', kept(disk) && JSON.parse(disk) && /"Dave \{the\} Tester"/.test(disk))
  const bio = await saveField('bio', 'Code: if (x) { y } and "quotes".')
  now = await lines()
  check('a bio with braces and quotes is saved exactly, nothing else changes', bio === 'Saved' && now.includes(DAVE + ' ' + V + 'note ' + lit('Code: if (x) { y } and "quotes".')) && diff(start, now).gone.length === 2 && diff(start, now).added.length === 2, bio)

  // A list add keeps the rest too.
  const before = now
  await page.evaluate(() => { const f = document.querySelector('.pfe [data-part=skills] form'); f.querySelector('input').value = 'Knots'; f.requestSubmit() })
  await page.waitFor(() => /Added|Not saved/.test(document.querySelector('.pfe [data-part=skills] > .pfe-msg').textContent), { timeout: 30000 })
  now = await lines()
  d = diff(before, now)
  check('adding a skill adds two statements and removes none', d.gone.length === 0 && d.added.length === 2 && d.added.some(l => /"Knots"/.test(l)), JSON.stringify(d).slice(0, 200))
  check('and the key, email and languages are still on disk', kept(readFileSync(DAVE_FILE, 'utf8')))
  await shot('whole-dave-1300')

  // The pod stores something other than what was sent (simulated: the first PUT is altered on its way): the pane
  // notices, puts the original back, says so, and shows the saved value again.
  const beforeBad = await lines()
  await page.evaluate(() => {
    // At the bottom, below the login's own fetch: the browser's fetch, so the request still carries the login.
    const original = window.fetch
    let once = true
    window.fetch = function (u, o) { if (once && o && o.method === 'PUT' && typeof o.body === 'string') { once = false; o = { ...o, body: o.body.replace('Dave Restored', 'Mangled') } } return original.apply(this, [u, o]) }
    window.__restoreFetch = () => { window.fetch = original }
  })
  const bad = await saveField('name', 'Dave Restored')
  await page.evaluate(() => window.__restoreFetch())
  now = await lines()
  check('when the pod stores something else: "Not saved", the original put back exactly', /^Not saved: your pod stored something different, so the profile was put back exactly as it was/.test(bad) && JSON.stringify(now) === JSON.stringify(beforeBad), bad + ' ' + JSON.stringify(diff(beforeBad, now)).slice(0, 200))
  check('the field shows what is saved again, so the next Save does not resend it (REVIEW 4)', await page.evaluate(() => document.querySelector('.pfe [name=name]').value) === 'Dave {the} Tester' && /shows what is saved again/.test(bad))
  const nick = await saveField('nick', 'dave')
  check('the next save sends only its own field', nick === 'Saved' && await page.evaluate(() => /^1 saved$/.test(document.querySelector('.pfe [data-part=basics] .pfe-actions .pfe-msg').textContent)))

  // Changed on the pod since the page read it: refused, the other change is kept.
  const json = JSON.parse(readFileSync(DAVE_FILE, 'utf8'))
  writeFileSync(DAVE_FILE, JSON.stringify(json).replace('Dave {the} Tester', 'Changed Elsewhere'))
  const conflict = await saveField('name', 'Dave Again')
  check('a name changed on the pod meanwhile: refused, and the other change is kept', /^Not saved: it was changed somewhere else/.test(conflict) && /Changed Elsewhere/.test(readFileSync(DAVE_FILE, 'utf8')) && !/Dave Again/.test(readFileSync(DAVE_FILE, 'utf8')), conflict)

  // REVIEW 3: a contact card is person-typed and editable, but not a profile: not offered.
  await page.goto(address(CONTACT))
  await page.waitFor(() => !!(window.panes && window.panes.byName('profile-edit-lab')), { timeout: 40000 })
  await sleep(2500)
  const contact = await page.evaluate(async (u) => { const s = window.SolidLogic.store; await s.fetcher.load(s.sym(u).doc()); const p = window.panes.byName('profile-edit-lab'); return { label: p.label(s.sym(u), { session: { store: s } }), editable: !!s.updater.editable(s.sym(u).doc().value, s) } }, CONTACT)
  check('a contact card the viewer may edit is not offered', contact.label === null && contact.editable, JSON.stringify(contact))
  check('the real profile is unchanged', realProfileHash() === realBefore)
  await finish()
} catch (error) { await finish(error) }
