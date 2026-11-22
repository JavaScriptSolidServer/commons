// Whole-document writes (REVIEW.md 1) and who gets the pane (REVIEW.md 2, 3), on copies in suite-data/settings/.
// Dave's profile and preferences are JSON-LD the way older servers and apps wrote them: an inline cert:key, an inline
// email with no @id, @list values, an empty string, braces. A PATCH on JSS loses all of those and still says yes;
// the pane must keep every one, put the original back when the pod stores something else, and say so.
// A contact card (vcard:Individual, editable by the viewer) must not get the pane.
//   node tests/whole.mjs      (logs in afresh)
import { open, sleep } from '../../lib/lib.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PANE, PORT, DATA_DIR, DAVE, DAVE_PREFS, CONTACT, freshAlice, openPane, offered, seen, settled, statusText } from './common.mjs'

freshAlice()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, login: true, resource: DAVE })
const disk = (f) => readFileSync(path.join(DATA_DIR, 'dave', f), 'utf8')
// Every statement of a stored JSON-LD document, read as JSON-LD (the server's Turtle drops lists and inline
// objects), blank nodes as _:b, lists spelled out: sorted lines.
const lines = (u) => page.evaluate(async (u) => {
  const response = await fetch(u, { headers: { Accept: 'application/ld+json' }, cache: 'no-store' })
  const text = await response.text()
  const g = $rdf.graph()
  await new Promise((resolve, reject) => $rdf.parse(text, g, u, 'application/ld+json', (e) => e ? reject(e) : resolve()))
  const term = (t) => t.termType === 'BlankNode' ? '_:b' : t.termType === 'Collection' ? '( ' + t.elements.map(term).join(' ') + ' )' : t.termType === 'Literal' ? JSON.stringify(t.value) + (t.language ? '@' + t.language : '^^' + t.datatype.value) : t.value
  return g.statements.map(s => term(s.subject) + ' ' + term(s.predicate) + ' ' + term(s.object)).sort()
}, u)
const diff = (a, b) => ({ gone: a.filter(l => !b.includes(l)), added: b.filter(l => !a.includes(l)) })
const ACL = 'http://www.w3.org/ns/auth/acl#'
const kept = (text) => /c0ffee00c0ffee/.test(text) && /mailto:dave@example\.org/.test(text) && /language-code\/cs/.test(text)
const trust = (origin) => page.evaluate((o) => { const f = document.querySelector('.set-add'); f.querySelector('input').value = o; f.querySelector('select').value = 'view'; f.requestSubmit() }, origin)

try {
  const opened = await openPane(page, DAVE)
  check('offered on Dave\'s WebID profile (it names an identity provider, and the viewer may edit it)', opened === 'ok', opened)
  const profile = DAVE.split('#')[0]
  const start = await lines(profile)
  check('the copy holds an inline key, an inline email, a language list and an empty string', start.some(l => /cert#modulus/.test(l)) && start.some(l => /mailto:dave/.test(l)) && start.some(l => /\( .*language-code\/en .*language-code\/cs \)$/.test(l)) && start.some(l => / "".*string$/.test(l)), start.length + '')

  // REVIEW 1: "Trust it" adds exactly the app's statements and keeps everything else.
  await trust('https://review.example'); await settled(page)
  let now = await lines(profile)
  let d = diff(start, now)
  check('trusting an app: "now trusted", and only that app\'s 3 statements were added, none removed', /set-good/.test(await statusText(page)) && d.gone.length === 0 && d.added.length === 3 && d.added.every(l => l.includes(ACL)), JSON.stringify(d).slice(0, 300))
  check('on disk: the key, the email and the languages are still there, still JSON-LD', kept(disk('card.jsonld')) && !!JSON.parse(disk('card.jsonld')))
  const s = await seen(page)
  check('the app is listed', s.apps.some(a => a.origin === 'https://review.example' && a.level === 'view'), JSON.stringify(s.apps))

  // Change its level, then remove it: still nothing else touched.
  await page.evaluate(() => { const sel = document.querySelector('.set-app[data-origin="https://review.example"] .set-level'); sel.value = 'edit'; sel.dispatchEvent(new Event('change')) }); await settled(page)
  now = await lines(profile)
  d = diff(start, now)
  check('changing its level: only its modes differ', d.gone.length === 0 && d.added.length === 4 && d.added.filter(l => /#mode/.test(l)).length === 2, JSON.stringify(d).slice(0, 300))
  await page.evaluate(() => document.querySelector('.set-app[data-origin="https://review.example"] .set-remove').click()); await sleep(200)
  await page.evaluate(() => document.querySelector('.set-app[data-origin="https://review.example"] .set-remove').click()); await settled(page)
  check('removing it puts the profile back exactly as it started', JSON.stringify(await lines(profile)) === JSON.stringify(start), JSON.stringify(diff(start, await lines(profile))).slice(0, 300))

  // A switch in a JSON-LD preferences file with a list and an inline object.
  const prefsStart = await lines(DAVE_PREFS)
  await page.evaluate(() => document.querySelector('.set-switch-row[data-role=Developer] .set-switch input').click()); await settled(page)
  const prefsNow = await lines(DAVE_PREFS)
  d = diff(prefsStart, prefsNow)
  check('a switch adds one statement to the preferences file and keeps its list and inline object', d.gone.length === 0 && d.added.length === 1 && /Developer/.test(d.added[0]) && /an inline object \{with braces\}/.test(disk('prefs.jsonld')), JSON.stringify(d).slice(0, 300))

  // The pod stores something else (simulated: the first PUT is altered on its way): the original is put back.
  const beforeBad = await lines(profile)
  await page.evaluate(() => {
    const original = window.fetch
    let once = true
    window.fetch = function (u, o) { if (once && o && o.method === 'PUT' && typeof o.body === 'string') { once = false; o = { ...o, body: o.body.replace('Dave Older', 'Mangled') } } return original.apply(this, [u, o]) }
    window.__restoreFetch = () => { window.fetch = original }
  })
  await trust('https://second.example'); await settled(page)
  await page.evaluate(() => window.__restoreFetch())
  const said = await statusText(page)
  check('when the pod stores something else: "Not saved", and the file put back exactly as it was', /set-bad/.test(said) && /put back exactly as it was/.test(said) && JSON.stringify(await lines(profile)) === JSON.stringify(beforeBad), said.slice(0, 160))
  check('and the app is not listed as trusted', !(await seen(page)).apps.some(a => a.origin === 'https://second.example'))
  await shot('whole-dave-1300')

  // REVIEW 2: a contact card the viewer may edit does not get Settings.
  await page.goto(address(CONTACT))
  const names = await offered(page, CONTACT)
  const label = await page.evaluate((u) => { const s = SolidLogic.store; return { label: window.panes.byName('settings-lab').label($rdf.sym(u), { session: { store: s } }), editable: !!s.updater.editable($rdf.sym(u).doc().value, s) } }, CONTACT)
  check('a contact card the viewer may edit is not offered Settings', !/settings-lab/.test(names) && label.label === null && label.editable, names + ' ' + JSON.stringify(label))

  // REVIEW 3: with no preferences file, the indexes it would list say so (drawn by hand on a copy of Dave without one).
  const drawn = await page.evaluate(async (u) => {
    const s = SolidLogic.store
    const me = $rdf.sym(u)
    await s.fetcher.load(me.doc())
    s.removeMatches(me, $rdf.sym('http://www.w3.org/ns/pim/space#preferencesFile'), null, me.doc())
    const root = window.panes.byName('settings-lab').render(me, { dom: document, session: { store: s } })
    document.body.prepend(root)
    for (let i = 0; i < 60 && !root.querySelector('.set-item[data-item=tool-index] .set-help'); i++) await new Promise(r => setTimeout(r, 250))
    const help = (k) => (root.querySelector(`.set-item[data-item=${k}] .set-help`) || {}).textContent || ''
    const out = { priv: help('private-index'), tools: help('tool-index') }
    root.remove()
    return out
  }, DAVE)
  check('no preferences file: the private type index and tool index say there is none, not "could not be read"', /there is no preferences file/.test(drawn.priv) && /there is no preferences file/.test(drawn.tools) && !/could not be read/.test(drawn.priv + drawn.tools), JSON.stringify(drawn))
  await finish()
} catch (error) { await finish(error) }
