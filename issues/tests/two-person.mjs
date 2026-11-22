// Two people and one board (written by the reviewer). "me" keeps three trackers in suite-data/issues-review/:
//   rw/  bob can read and write (ACL: bob Read + Write)   ro/  bob can only read   priv/  only me
// me adds a card; bob, in his own browser, sees it, adds a card of his own, assigns it to himself and moves it;
// me reloads and sees all of it (bob's name from his profile). On ro/ bob sees the board with no edit controls and
// the server refuses his own PATCH; on priv/ he is told he may not see it. Then a race: me's page is stale, bob moves
// a card, me moves the same card from her stale page; the issue must end up in ONE state.
//   node tests/two-person.mjs          (KEEP=1 keeps the data)
// Browsers: me on 9517, bob on 9518. Data: me/public/suite-data/issues-review/ (rebuilt on every run).
import { open, config, LAB, POD, POD2, sleep } from '../../lib/lib.mjs'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'issues/issues-pane.js'
const SHELL = LAB + 'shell/suite-shell-pane.js'
const BASE = POD + 'public/suite-data/issues-review/'
const DATA = path.join(config.podDir, 'public', 'suite-data', 'issues-review')
if (!DATA.endsWith('/suite-data/issues-review')) throw new Error('refusing: unexpected data folder ' + DATA)
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
const WF = 'http://www.w3.org/2005/01/wf/flow#'
const board = (f) => BASE + f + '/index.ttl#this'

const INDEX = (title) => `@prefix wf: <${WF}>.
@prefix dc: <http://purl.org/dc/elements/1.1/>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix owl: <http://www.w3.org/2002/07/owl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
<#this> a wf:Tracker; dc:title "${title}"; dc:author <${ME}>; wf:issueClass <#Issue>; wf:initialState <#ToDo>;
    wf:stateStore <state.ttl>; wf:assigneeClass foaf:Person.
<#Issue> a rdfs:Class; rdfs:subClassOf wf:Task; owl:disjointUnionOf (<#ToDo> <#Doing> <#Done>).
<#ToDo> a rdfs:Class; rdfs:label "To do"; rdfs:subClassOf <#Issue>, wf:Open.
<#Doing> a rdfs:Class; rdfs:label "Doing"; rdfs:subClassOf <#Issue>, wf:Open.
<#Done> a rdfs:Class; rdfs:label "Done"; rdfs:subClassOf <#Issue>, wf:Closed.
`
const STATE = `@prefix wf: <${WF}>.
@prefix dc: <http://purl.org/dc/elements/1.1/>.
<index.ttl#this> wf:stateStore <state.ttl>.
<#Iss1> a <index.ttl#ToDo>; wf:tracker <index.ttl#this>; dc:title "Sweep the yard"; dc:author <${ME}>.
`
const acl = (folder, bobModes) => JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@graph': [
    { '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': ME }, 'acl:accessTo': { '@id': folder }, 'acl:default': { '@id': folder }, 'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }] },
    ...(bobModes.length ? [{ '@id': '#bob', '@type': 'acl:Authorization', 'acl:agent': { '@id': BOB }, 'acl:accessTo': { '@id': folder }, 'acl:default': { '@id': folder }, 'acl:mode': bobModes.map(m => ({ '@id': 'acl:' + m })) }] : [])
  ]
}, null, 2)
function reset () {
  rmSync(DATA, { recursive: true, force: true })
  for (const [f, title, modes] of [['rw', 'Shared yard', ['Read', 'Write']], ['ro', 'Read-only yard', ['Read']], ['priv', 'Private yard', []], ['half', 'Half-shared yard', ['Read']], ['app', 'Append-only yard', ['Read', 'Append']]]) {
    mkdirSync(path.join(DATA, f), { recursive: true })
    writeFileSync(path.join(DATA, f, '.acl'), acl(BASE + f + '/', modes))
    writeFileSync(path.join(DATA, f, 'index.ttl'), INDEX(title))
    writeFileSync(path.join(DATA, f, 'state.ttl'), STATE)
  }
  // half/: bob may read the settings but not the issues file (its own ACL: only me).
  writeFileSync(path.join(DATA, 'half', 'state.ttl.acl'), acl(BASE + 'half/state.ttl', []).replace(/"acl:default": \{[^}]*\},\s*/g, ''))
}
reset()

// Read a state file from the server as the person on this page: each issue's title, states, assignee, author.
const onServer = (p, f) => p.evaluate(async (address) => {
  const $rdf = globalThis.$rdf
  const r = await window.SolidLogic.store.fetcher._fetch(address, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
  const g = $rdf.graph()
  $rdf.parse(await r.text(), g, address, 'text/turtle')
  const W = 'http://www.w3.org/2005/01/wf/flow#'
  const T = (u) => $rdf.sym(u)
  return g.each(null, T(W + 'tracker')).map(i => ({
    id: i.value.split('#').pop(),
    title: (g.any(i, T('http://purl.org/dc/elements/1.1/title')) || {}).value,
    states: g.each(i, T('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')).map(t => t.value.split('#').pop()).sort(),
    assignee: (g.any(i, T(W + 'assignee')) || {}).value || null,
    author: (g.any(i, T('http://purl.org/dc/elements/1.1/author')) || {}).value || null
  }))
}, BASE + f + '/state.ttl')
const ready = (p, n) => p.waitFor((count) => document.querySelectorAll('.iss-card').length === +count && !/Loading/.test(document.querySelector('.iss-title').textContent), { timeout: 40000, args: [String(n)] })
const settled = (p) => p.waitFor(() => /good|bad/.test(document.querySelector('.iss-msg').dataset.kind || '') && !document.querySelector('.iss button:disabled'), { timeout: 30000 })
const msg = (p) => p.evaluate(() => (document.querySelector('.iss-msg').dataset.kind || '') + ' :: ' + document.querySelector('.iss-msg').textContent)
const cards = (p) => p.evaluate(() => [...document.querySelectorAll('.iss-col')].map(c => c.querySelector('.iss-col-name').textContent + ': ' + [...c.querySelectorAll('.iss-card')].map(k => k.querySelector('.iss-card-title').textContent + ' (' + k.querySelector('.iss-who').textContent + ')').join(' / ')).join(' | '))
const onCard = (p, title, js) => p.evaluate(`(() => { const card = [...document.querySelectorAll('.iss-card')].find(c => c.querySelector('.iss-card-title').textContent === ${JSON.stringify(title)}); if (!card) throw new Error('no card ' + ${JSON.stringify(title)}); ${js} })()`)
const moveCard = (p, title, state) => onCard(p, title, `const s = card.querySelector('.iss-move'); s.value = [...s.options].find(o => o.textContent.endsWith(${JSON.stringify(state)})).value; s.dispatchEvent(new Event('change'))`)
const controls = (p) => p.evaluate(() => document.querySelectorAll('.iss-new, .iss-move, .iss-edit, .iss-take, .iss-drop, .iss form').length)
const show = (list) => list.map(i => `${i.id}:${i.title}[${i.states}]${i.assignee ? ' @' + i.assignee.split('/')[3] : ''}`).join(' ; ')

const me = await open({ pane: PANE, port: 9517, dir: import.meta.dirname, resource: board('rw') })
const { check, finish } = me
let bob = null
try {
  // 1. me adds a card on the shared board.
  await me.page.goto(me.address(board('rw')))
  await ready(me.page, 1)
  await me.page.waitFor(() => !!document.querySelector('.iss-new'), { timeout: 20000 })
  await me.page.evaluate(() => document.querySelector('.iss-new').click())
  await me.page.evaluate(() => { const f = document.querySelector('.iss-new-form'); f.querySelector('input').value = 'Fix the gate'; f.querySelector('textarea').value = 'Top hinge.'; f.requestSubmit() })
  await settled(me.page)
  check('me: adds "Fix the gate" on the shared board', /good :: Added/.test(await msg(me.page)), await msg(me.page))

  // 2. bob, in his own browser.
  bob = await open({ pane: PANE, port: 9518, dir: import.meta.dirname, resource: board('rw'), as: 'bob' })
  const who = await bob.page.evaluate(() => { try { return window.SolidLogic.authn.currentUser().value } catch { return null } })
  check('bob: logged in as bob', who === BOB, String(who))
  await bob.page.goto(bob.address(board('rw')))
  await ready(bob.page, 2)
  await bob.page.waitFor(() => !!document.querySelector('.iss-new'), { timeout: 20000 }).catch(() => {})
  check('bob: sees both of me\'s cards', /To do: (Fix the gate|Sweep the yard).* \/ (Fix the gate|Sweep the yard)/.test(await cards(bob.page)), await cards(bob.page))
  check('bob: has the edit controls on a board shared with write', await bob.page.evaluate(() => !!document.querySelector('.iss-new') && document.querySelectorAll('.iss-move').length === 2))
  await bob.page.evaluate(() => document.querySelector('.iss-new').click())
  await bob.page.evaluate(() => { const f = document.querySelector('.iss-new-form'); f.querySelector('input').value = 'Bob paints the shed'; f.querySelector('textarea').value = 'Green.'; f.requestSubmit() })
  await settled(bob.page)
  check('bob: adds a card', /good :: Added/.test(await msg(bob.page)), await msg(bob.page))
  await onCard(bob.page, 'Bob paints the shed', `card.querySelector('.iss-take').click()`)
  await settled(bob.page)
  check('bob: assigns it to himself', /good :: Assigned to you/.test(await msg(bob.page)), await msg(bob.page))
  await moveCard(bob.page, 'Bob paints the shed', 'Doing')
  await settled(bob.page)
  check('bob: moves it to Doing', /good :: Moved to Doing/.test(await msg(bob.page)), await msg(bob.page))
  const pod1 = await onServer(bob.page, 'rw')
  const bobs = pod1.find(i => i.title === 'Bob paints the shed')
  check('pod: bob\'s card is in Doing only, assigned to bob, authored by bob', !!bobs && bobs.states.join() === 'Doing' && bobs.assignee === BOB && bobs.author === BOB, show(pod1))
  await bob.shot('review-two-bob-rw')

  // 3. me reloads and sees all of it.
  await me.page.goto(me.address(board('rw')))
  await ready(me.page, 3)
  await me.page.waitFor(() => /Bob Tester/.test(document.querySelector('.iss-board').textContent), { timeout: 15000 }).catch(() => {})
  const seen = await cards(me.page)
  check('me, after a reload: bob\'s card in Doing, assigned to "Bob Tester" (from his profile)', /Doing: Bob paints the shed \(Bob Tester\)/.test(seen), seen)
  check('me, after a reload: my two cards still in To do', /To do: .*Fix the gate.*Sweep the yard|To do: .*Sweep the yard.*Fix the gate/.test(seen), seen)
  await me.page.evaluate(() => [...document.querySelectorAll('.iss-card')].find(c => /Bob paints/.test(c.textContent)).querySelector('.iss-card-title').click())
  await me.page.waitFor(() => !!document.querySelector('.iss-one'), { timeout: 20000 })
  await me.page.waitFor(() => /by Bob Tester/.test(document.querySelector('.iss-one').textContent), { timeout: 10000 }).catch(() => {})
  const page1 = await me.page.evaluate(() => document.querySelector('.iss-one .iss-facts').textContent)
  check('me: the issue page says it was opened by Bob Tester and assigned to him', /by Bob Tester/.test(page1) && /Assigned to Bob Tester/.test(page1), page1)
  await me.shot('review-two-me-after')

  // 4. A board shared read-only.
  await bob.page.goto(bob.address(board('ro')))
  await ready(bob.page, 1)
  await sleep(1500)
  const ro = await bob.page.evaluate(() => document.querySelector('.iss-msg').textContent)
  check('bob, read-only board: the cards show', /Sweep the yard/.test(await cards(bob.page)), await cards(bob.page))
  check('bob, read-only board: no edit controls at all', (await controls(bob.page)) === 0, String(await controls(bob.page)))
  check('bob, read-only board: it says he can see but not change it', /can see this tracker but not change it/.test(ro), ro)
  check('bob, read-only board: he can still refresh it', await bob.page.evaluate(() => !!document.querySelector('.iss-refresh')))
  const refused = await bob.page.evaluate(async (address) => (await window.SolidLogic.store.fetcher._fetch(address, { method: 'PATCH', headers: { 'Content-Type': 'text/n3' }, body: '@prefix solid: <http://www.w3.org/ns/solid/terms#>. _:p a solid:InsertDeletePatch; solid:inserts { <#Iss1> <http://purl.org/dc/elements/1.1/title> "Bob was here" }.' })).status, BASE + 'ro/state.ttl')
  check('bob, read-only board: the server refuses his own PATCH (403)', refused === 403, String(refused))
  await bob.shot('review-two-bob-ro')

  // Same board in the shell: the card's details have no controls.
  await bob.page.goto(`${config.browser}?pane=${encodeURIComponent(SHELL)}&uri=${encodeURIComponent(board('ro'))}`)
  await bob.page.waitFor(() => document.querySelectorAll('.sh-content .iss-card').length === 1, { timeout: 45000 })
  await sleep(1000)
  await bob.page.evaluate(() => document.querySelector('.sh-content .iss-card').click())
  const det = await bob.page.waitFor(() => !!document.querySelector('.sh-detcol .iss-details-issue'), { timeout: 10000 }).then(() => true, () => false)
  const detCtl = await bob.page.evaluate(() => { const d = document.querySelector('.sh-detcol .iss-details-issue'); return d ? d.querySelectorAll('.iss-move, .iss-edit, .iss-take, .iss-drop').length : -1 })
  check('bob in the shell, read-only board: a card\'s details open with no controls, and no New issue', det && detCtl === 0 && !(await bob.page.evaluate(() => !!document.querySelector('.sh-content .iss-new'))), String(detCtl))
  await bob.shot('review-two-bob-ro-shell')

  // 4b. A board bob may only append to: New issue, but no move, edit or assign.
  await bob.page.goto(bob.address(board('app')))
  await ready(bob.page, 1)
  await bob.page.waitFor(() => !!document.querySelector('.iss-new'), { timeout: 20000 }).catch(() => {})
  const appCtl = await bob.page.evaluate(() => (document.querySelector('.iss-new') ? 'new' : 'no new') + ' | ' + document.querySelectorAll('.iss-move, .iss-edit, .iss-take, .iss-drop').length + ' | ' + document.querySelector('.iss-msg').textContent)
  check('bob, append-only board: New issue only, no move/edit/assign, and it says so', /^new \| 0 \| You can add issues to this tracker but not change them/.test(appCtl), appCtl)
  await bob.page.evaluate(() => document.querySelector('.iss-new').click())
  await bob.page.evaluate(() => { const f = document.querySelector('.iss-new-form'); f.querySelector('input').value = 'Bob appends'; f.requestSubmit() })
  await settled(bob.page)
  const appended = await msg(bob.page)
  const pod3 = await onServer(bob.page, 'app')
  check('bob, append-only board: his new issue is added and is on the pod', /^good :: Added/.test(appended) && pod3.some(i => i.title === 'Bob appends'), appended + ' | ' + show(pod3))

  // 5. A board not shared with bob.
  await bob.page.goto(bob.address(board('priv')))
  await bob.page.waitFor(() => { const m = document.querySelector('.iss-msg'); return !!m && !!m.textContent }, { timeout: 40000 }).catch(() => {})
  await sleep(1000)
  const pv = await bob.page.evaluate(() => { const m = document.querySelector('.iss-msg'); return (m ? m.textContent : '(no pane)') + ' | cards ' + document.querySelectorAll('.iss-card').length + ' | controls ' + document.querySelectorAll('.iss-new, .iss-move').length })
  const denied = await bob.page.evaluate(() => { const text = (n) => [...n.querySelectorAll('*')].map(e => (e.shadowRoot ? text(e.shadowRoot) : '')).join(' ') + ' ' + (n.textContent || ''); return /Access denied/.test(text(document)) })
  check('bob, private board: a clear refusal (the data browser\'s "Access denied"; the pane cannot know it is a board), no cards, no controls', denied && /cards 0 \| controls 0/.test(pv), pv)
  await bob.shot('review-two-bob-priv')
  // half/: the board's settings are readable but its issues file is not: the pane itself must say so.
  await bob.page.goto(bob.address(board('half')))
  await bob.page.waitFor(() => { const m = document.querySelector('.iss-msg'); return !!m && !!m.textContent }, { timeout: 40000 }).catch(() => {})
  await sleep(1000)
  const hv = await bob.page.evaluate(() => { const m = document.querySelector('.iss-msg'); return (m ? (m.dataset.kind || '') + ' :: ' + m.textContent : '(no pane)') + ' | cards ' + document.querySelectorAll('.iss-card').length + ' | controls ' + document.querySelectorAll('.iss-new, .iss-move').length })
  check('bob, issues file not shared: the pane says he is not allowed to see the issues, no controls', /bad :: You are not allowed to see these issues/.test(hv) && /controls 0/.test(hv), hv)
  await bob.shot('review-two-bob-half')

  // 6. A stale page. me has the board open; bob moves "Fix the gate" to Done; me, without reloading, moves it to Doing.
  await me.page.goto(me.address(board('rw')))
  await ready(me.page, 3)
  await bob.page.goto(bob.address(board('rw')))
  await ready(bob.page, 3)
  await moveCard(bob.page, 'Fix the gate', 'Done')
  await settled(bob.page)
  check('race: bob moves "Fix the gate" to Done', /good :: Moved to Done/.test(await msg(bob.page)), await msg(bob.page))
  await sleep(3000)
  const live = await cards(me.page)
  console.log('     me, 3 s after bob\'s move, without reloading: ' + live)
  await moveCard(me.page, 'Fix the gate', 'Doing')
  await settled(me.page)
  const raced = await msg(me.page)
  const pod2 = await onServer(me.page, 'rw')
  const gate = pod2.find(i => i.title === 'Fix the gate')
  console.log('     me\'s stale move: ' + raced + ' | pod: ' + show(pod2))
  check('race: me\'s stale move is refused, said in plain words', /^bad :: Someone else changed this/.test(raced), raced)
  const fresh = await cards(me.page)
  check('race: me\'s board is read again, the card in the column the pod has (Done), without a reload', /Done: .*Fix the gate/.test(fresh), fresh)
  check('race: after me\'s stale move the issue is in exactly one state on the pod', !!gate && gate.states.length === 1, gate ? gate.states.join() : 'gone')
  await me.page.goto(me.address(board('rw')))
  await ready(me.page, 3)
  console.log('     me after reload: ' + await cards(me.page))
  await me.shot('review-two-me-race')

  if (!process.env.KEEP) rmSync(DATA, { recursive: true, force: true })
  await bob.page.close().catch(() => {})
  await finish()
} catch (error) {
  if (bob) { await bob.shot('review-two-bob-error'); await bob.page.close().catch(() => {}) }
  await finish(error)
}
