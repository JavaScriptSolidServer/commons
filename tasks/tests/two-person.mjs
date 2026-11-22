// Two people on one list (written by the reviewer). me shares the list "Family" with bob (read and write on its
// folder); a second list, "Private", is me's alone. bob, in his own browser, sees Family but not Private, adds a task
// and ticks one off; me reloads and sees both, with bob's name. Then the lost-update cases a shared list really meets:
//  - bob writes while me's save is between its read and its PUT: the pod answers 412, me is told, bob's task stays;
//  - me edits the notes from a details panel opened before bob changed them.
//   node tests/two-person.mjs     Browsers: me on 9531, bob on 9532. Data: me/public/suite-data/tasks-review/ (rebuilt).
import { open, config, LAB, POD, POD2, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'tasks/tasks-pane.js'
const HOME = POD + 'public/suite-data/tasks-review/'
const LIST = HOME + 'family/index.ttl#this'
const STATE = HOME + 'family/state.ttl'
const SECRET = HOME + 'private/state.ttl'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'tasks-review')
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
if (!DIR.endsWith('/public/suite-data/tasks-review')) throw new Error('refusing: unexpected data folder ' + DIR)

const PREFIXES = '@prefix wf: <http://www.w3.org/2005/01/wf/flow#> .\n@prefix cal: <http://www.w3.org/2002/12/cal/ical#> .\n@prefix dc: <http://purl.org/dc/elements/1.1/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n@prefix t: <index.ttl#> .\n'
const tracker = (title) => PREFIXES + `<#this> a wf:Tracker ; dc:title "${title}" ; dc:author <${ME}> ; wf:issueClass <#Task> ; wf:initialState <#ToDo> ; wf:stateStore <state.ttl> .
<#Task> a rdfs:Class ; rdfs:subClassOf wf:Task, cal:Vtodo ; owl:disjointUnionOf ( <#ToDo> <#Done> ) .
<#ToDo> a rdfs:Class ; rdfs:label "To do" ; rdfs:subClassOf <#Task>, wf:Open .
<#Done> a rdfs:Class ; rdfs:label "Done" ; rdfs:subClassOf <#Task>, wf:Closed .\n`
const task = (id, title, extra = '') => `<#${id}> a t:ToDo, cal:Vtodo ; wf:tracker t:this ; dc:title "${title}" ; dc:created "2026-11-20T09:00:00Z"^^xsd:dateTime ; dc:author <${ME}>${extra} .\n`
const rule = (folder, agents) => JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@graph': agents.map(([who, modes], i) => ({ '@id': '#r' + i, '@type': 'acl:Authorization', 'acl:agent': { '@id': who }, 'acl:accessTo': { '@id': folder }, 'acl:default': { '@id': folder }, 'acl:mode': modes.map(m => ({ '@id': 'acl:' + m })) }))
}, null, 2)

function reset () {
  rmSync(DIR, { recursive: true, force: true })
  for (const f of ['family', 'private']) mkdirSync(path.join(DIR, f), { recursive: true })
  writeFileSync(path.join(DIR, 'family', '.acl'), rule(HOME + 'family/', [[ME, ['Read', 'Write', 'Control']], [BOB, ['Read', 'Write']]]))
  writeFileSync(path.join(DIR, 'family', 'index.ttl'), tracker('Family'))
  writeFileSync(path.join(DIR, 'family', 'state.ttl'), PREFIXES + task('Iss1', 'Buy milk') + task('Iss2', 'Plan the picnic', ' ; wf:description "Bring a blanket."') + task('Iss3', 'Wash the dog'))
  writeFileSync(path.join(DIR, 'private', '.acl'), rule(HOME + 'private/', [[ME, ['Read', 'Write', 'Control']]]))
  writeFileSync(path.join(DIR, 'private', 'index.ttl'), tracker('Private'))
  writeFileSync(path.join(DIR, 'private', 'state.ttl'), PREFIXES + task('Iss1', 'Secret birthday present'))
}
const disk = (f) => { const p = path.join(DIR, f); return existsSync(p) ? readFileSync(p, 'utf8') : '' }
reset()

// What a person's pane shows, and how to drive it (the pane alone in the data browser).
const look = (p) => p.evaluate(() => ({
  title: (document.querySelector('.tsk-list-title') || {}).textContent,
  open: [...document.querySelectorAll('.tsk-open-list .tsk-task .tsk-row-title')].map(x => x.textContent),
  done: [...document.querySelectorAll('.tsk-done-list .tsk-task .tsk-row-title')].map(x => x.textContent),
  lists: [...document.querySelectorAll('.tsk-app > .tsk-nav .tsk-nav-label')].map(x => x.textContent),
  add: !!document.querySelector('.tsk-add'),
  newList: !!document.querySelector('.tsk-new-list'),
  enabled: [...document.querySelectorAll('.tsk-check')].filter(b => !b.disabled).length,
  status: (document.querySelector('.tsk-status-line') || {}).textContent || ''
}))
const loaded = (p) => p.waitFor(() => document.querySelectorAll('.tsk-open-list .tsk-task').length > 0, { timeout: 40000 }).then(() => sleep(1000))
const clear = (p) => p.evaluate(() => { for (const s of document.querySelectorAll('.tsk-status-line')) { s.className = 'tsk-status tsk-status-line'; s.textContent = '' } })
const settled = (p) => p.waitFor(() => { const s = document.querySelector('.tsk-status-line'); return !!s && /tsk-status-(success|error)/.test(s.className) }, { timeout: 30000 }).then(() => p.evaluate(() => document.querySelector('.tsk-status-line').className.replace('tsk-status tsk-status-line', '').trim() + ' :: ' + document.querySelector('.tsk-status-line').textContent))
const addTask = async (p, text) => { await clear(p); await p.evaluate((t) => { const f = document.querySelector('.tsk-add'); f.querySelector('input').value = t; f.requestSubmit() }, text); return settled(p) }
const rowOf = (title) => `[...document.querySelectorAll('.tsk-task')].find(li => li.querySelector('.tsk-row-title').textContent === ${JSON.stringify(title)})`
const tick = async (p, title) => { await clear(p); await p.evaluate(`${rowOf(title)}.querySelector('.tsk-check').click()`); return settled(p) }
const details = async (p, title) => { await p.evaluate(`${rowOf(title)}.querySelector('.tsk-open').click()`); await p.waitFor(() => !!document.querySelector('.tsk-app > .tsk-details .tsk-details-title'), { timeout: 5000 }) }
const edit = async (p, selector, value) => { await clear(p); await p.evaluate((v) => { const [sel, val] = JSON.parse(v); const x = document.querySelector('.tsk-app > .tsk-details ' + sel); x.value = val; x.dispatchEvent(new Event('change', { bubbles: true })) }, JSON.stringify([selector, value])); return settled(p) }
const statusOf = (p, url) => p.evaluate(async (v) => { const [m, u] = JSON.parse(v); return (await window.SolidLogic.store.fetcher._fetch(u, { method: m, cache: 'no-store', ...(m === 'PUT' ? { headers: { 'Content-Type': 'text/turtle' }, body: '<#x> <#y> "bob was here" .' } : {}) })).status }, JSON.stringify(url))

const me = await open({ pane: PANE, port: 9531, dir: import.meta.dirname, resource: LIST })
const { check, finish } = me
let bob = null
try {
  // me, the owner: both lists, can change Family.
  await me.page.goto(me.address(LIST))
  await loaded(me.page)
  let s = await look(me.page)
  check('me: opens Family, sees both lists and can add and tick', s.title === 'Family' && s.lists.join() === 'Family,Private' && s.add && s.enabled === 3, JSON.stringify(s))

  // bob, in his own browser.
  bob = await open({ pane: PANE, port: 9532, dir: import.meta.dirname, as: 'bob', resource: LIST })
  await loaded(bob.page)
  s = await look(bob.page)
  check('bob: sees the shared list and its three tasks', s.title === 'Family' && ['Buy milk', 'Plan the picnic', 'Wash the dog'].every(t => s.open.includes(t)), JSON.stringify(s))
  check('bob: the private list is not on the left', s.lists.join() === 'Family', s.lists.join())
  check('bob: can add and tick in Family, but no New list (the folder above is not his)', s.add && s.enabled === 3 && !s.newList && !/not change/.test(s.status), JSON.stringify(s))
  const refused = [await statusOf(bob.page, ['GET', SECRET]), await statusOf(bob.page, ['PUT', SECRET])]
  check('bob: the pod refuses him the private list (read and write)', refused.every(x => [401, 403].includes(x)) && !/bob was here/.test(disk('private/state.ttl')), refused.join(' '))

  // bob adds a task and ticks one off.
  let r = await addTask(bob.page, 'Bring the lemonade')
  check('bob: adds "Bring the lemonade"', /success ::/.test(r) && (await look(bob.page)).open.includes('Bring the lemonade'), r)
  check('pod: bob\'s task is in state.ttl, under his WebID, and me\'s tasks are kept', /Bring the lemonade/.test(disk('family/state.ttl')) && disk('family/state.ttl').includes(BOB) && /Plan the picnic/.test(disk('family/state.ttl')) && /Bring a blanket/.test(disk('family/state.ttl')))
  r = await tick(bob.page, 'Buy milk')
  check('bob: ticks off "Buy milk"', /success ::/.test(r) && !(await look(bob.page)).open.includes('Buy milk'), r)
  check('pod: "Buy milk" is Done, with a completed time', /index\.ttl#Done|t:Done/.test(disk('family/state.ttl')) && /completed/.test(disk('family/state.ttl')))
  await narrow(bob.page)
  await sleep(400)
  const m = await measure(bob.page)
  check('bob, true 400 px: no sideways scroll', !m.sideways, JSON.stringify(m))
  await bob.shot('review-two-person-bob-400')

  // me reloads: bob's task, bob's tick, bob's name.
  await me.page.goto(me.address(LIST))
  await loaded(me.page)
  await me.page.evaluate(() => { const b = document.querySelector('.tsk-more'); if (b && b.getAttribute('aria-expanded') === 'false') b.click() })
  s = await look(me.page)
  check('me, after reload: bob\'s new task is there', s.open.includes('Bring the lemonade'), JSON.stringify(s))
  check('me, after reload: "Buy milk" is under completed', s.done.includes('Buy milk') && !s.open.includes('Buy milk'), JSON.stringify(s))
  await details(me.page, 'Bring the lemonade')
  const by = await me.page.waitFor(() => /Added by Bob Tester/.test((document.querySelector('.tsk-app > .tsk-details .tsk-task-meta') || {}).textContent || ''), { timeout: 10000 }).catch(() => false)
  check('me: the task says it was added by Bob Tester (his profile name)', !!by, await me.page.evaluate(() => (document.querySelector('.tsk-app > .tsk-details .tsk-task-meta') || {}).textContent))
  await me.shot('review-two-person-me-1300')

  // Lost update 1: bob writes while me's save sits between its fresh read and its PUT. me's PUT is held in the page
  // (a wrapper on the page's window.fetch, under the pane's logged-in fetch) until bob's write is on the pod; then it goes on, with the ETag me read.
  await me.page.evaluate(() => {
    const real = window.fetch.bind(window)
    window.__held = false
    window.fetch = async (u, o = {}) => {
      if (o.method === 'PUT' && /family\/state\.ttl$/.test(u) && !window.__held) { window.__held = true; await new Promise(resolve => { window.__go = resolve }) }
      return real(u, o)
    }
  })
  await details(me.page, 'Wash the dog')
  await clear(me.page)
  await me.page.evaluate(() => { const x = document.querySelector('.tsk-app > .tsk-details .tsk-edit-priority'); x.value = 'high'; x.dispatchEvent(new Event('change', { bubbles: true })) })
  await me.page.waitFor(() => typeof window.__go === 'function', { timeout: 15000 })
  r = await addTask(bob.page, 'Charge the camera')
  check('bob: adds "Charge the camera" while me is saving', /success ::/.test(r), r)
  await me.page.evaluate(() => window.__go())
  r = await settled(me.page)
  check('me: the pod refuses the stale save (412) and the pane says so', /error ::/.test(r) && /changed somewhere else/.test(r), r)
  check('pod: bob\'s task survived me\'s stale save, and the priority was not written', /Charge the camera/.test(disk('family/state.ttl')) && !/priority/.test(disk('family/state.ttl')))
  s = await look(me.page)
  check('me: after the refusal the pane shows bob\'s new task (it read the file again)', s.open.includes('Charge the camera'), JSON.stringify(s.open))
  r = await edit(me.page, '.tsk-edit-priority', 'high')
  check('me: trying once more saves, and bob\'s task is still there', /success ::/.test(r) && /priority/.test(disk('family/state.ttl')) && /Charge the camera/.test(disk('family/state.ttl')), r)

  // Lost update 2: me opened "Plan the picnic" before bob changed its notes, then edits the notes from that view.
  await details(me.page, 'Plan the picnic')
  await details(bob.page, 'Plan the picnic')
  r = await edit(bob.page, '.tsk-edit-notes', 'Bring a blanket and the kite.')
  check('bob: changes the picnic notes', /success ::/.test(r) && /the kite/.test(disk('family/state.ttl')), r)
  const stale = await me.page.evaluate(() => document.querySelector('.tsk-app > .tsk-details .tsk-edit-notes').value)
  r = await edit(me.page, '.tsk-edit-notes', stale + ' Ask Carol.')
  const kept = /the kite/.test(disk('family/state.ttl'))
  console.log(`     me's stale notes edit: ${r}; on the pod now: ${kept ? 'bob\'s kite kept' : 'bob\'s kite gone'}`)
  check('me\'s edit from a stale view does not silently erase bob\'s newer notes (kept, or me is told)', kept || /error ::/.test(r), r)

  await bob.page.close()
  if (!process.env.KEEP) reset()
  await finish()
} catch (error) { if (bob) await bob.page.close().catch(() => {}); await finish(error) }
