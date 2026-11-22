// The review's findings, each checked (REVIEW.md): a list whose wf:stateStore points outside its folder is read-only
// and that file is never written (#4); a tick clicked while a save is in flight is queued, not dropped (#3); after a
// 412 the typed notes stay in the box and "Save again" saves them (#2); deleting a task someone changed meanwhile is
// refused (#1, delete); a success line clears itself (#9). Logs in as me, port 9531.
//   node tests/fixes.mjs     Data: me/public/suite-data/tasks-checks/ (rebuilt, removed after).
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { rmSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'tasks/tasks-pane.js'
const HOME = POD + 'public/suite-data/tasks-checks/'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'tasks-checks')
if (!DIR.endsWith('/public/suite-data/tasks-checks')) throw new Error('refusing: unexpected data folder ' + DIR)
const ME = POD + 'profile/card.jsonld#me'
const P = '@prefix wf: <http://www.w3.org/2005/01/wf/flow#> .\n@prefix cal: <http://www.w3.org/2002/12/cal/ical#> .\n@prefix dc: <http://purl.org/dc/elements/1.1/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n@prefix t: <index.ttl#> .\n'
const tracker = (title, store) => P + `<#this> a wf:Tracker ; dc:title "${title}" ; dc:author <${ME}> ; wf:issueClass <#Task> ; wf:initialState <#ToDo> ; wf:stateStore <${store}> .
<#Task> a rdfs:Class ; rdfs:subClassOf wf:Task, cal:Vtodo ; owl:disjointUnionOf ( <#ToDo> <#Done> ) .
<#ToDo> a rdfs:Class ; rdfs:label "To do" ; rdfs:subClassOf <#Task>, wf:Open .
<#Done> a rdfs:Class ; rdfs:label "Done" ; rdfs:subClassOf <#Task>, wf:Closed .\n`
const task = (id, title, extra = '') => `<#${id}> a t:ToDo, cal:Vtodo ; wf:tracker <index.ttl#this> ; dc:title "${title}" ; dc:created "2026-11-20T09:00:00Z"^^xsd:dateTime ; dc:author <${ME}>${extra} .\n`
const VICTIM = '# A file that has nothing to do with tasks. It must never be rewritten.\n<#a> <#b> "untouched" .\n'
rmSync(DIR, { recursive: true, force: true })
for (const f of ['home', 'outside']) mkdirSync(path.join(DIR, f), { recursive: true })
writeFileSync(path.join(DIR, 'victim.ttl'), VICTIM)
writeFileSync(path.join(DIR, 'outside', 'index.ttl'), tracker('Looks harmless', '../victim.ttl'))
writeFileSync(path.join(DIR, 'home', 'index.ttl'), tracker('Home', 'state.ttl'))
writeFileSync(path.join(DIR, 'home', 'state.ttl'), P.replace('@prefix t: <index.ttl#> .\n', '@prefix t: <index.ttl#> .\n') + task('Iss1', 'Paint the shelf', ' ; wf:description "Shelves first."') + task('Iss2', 'Fix the tap') + task('Iss3', 'Sort the books'))
const disk = (f) => readFileSync(path.join(DIR, f), 'utf8')

const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9531, dir: import.meta.dirname, resource: HOME + 'outside/index.ttl#this' })
const line = () => page.evaluate(() => { const s = document.querySelector('.tsk-status-line'); return s ? s.className.replace('tsk-status tsk-status-line', '').trim() + ' :: ' + s.textContent : '' })
const settled = () => page.waitFor(() => { const s = document.querySelector('.tsk-status-line'); return !!s && /tsk-status-(success|error)/.test(s.className) }, { timeout: 30000 }).then(line)
const clear = () => page.evaluate(() => { for (const s of document.querySelectorAll('.tsk-status-line')) { s.className = 'tsk-status tsk-status-line'; s.textContent = '' } })
const rowOf = (title) => `[...document.querySelectorAll('.tsk-task')].find(li => li.querySelector('.tsk-row-title').textContent === ${JSON.stringify(title)})`
const details = async (title) => { await page.evaluate(`${rowOf(title)}.querySelector('.tsk-open').click()`); await page.waitFor(() => !!document.querySelector('.tsk-app > .tsk-details .tsk-edit-title'), { timeout: 5000 }) }
// Hold the next PUT to a file in the page until window.__go() is called.
const hold = (pattern) => page.evaluate((p) => {
  const real = window.__realFetch || (window.__realFetch = window.fetch.bind(window))
  window.__go = null
  let held = false
  window.fetch = async (u, o = {}) => { if (o.method === 'PUT' && new RegExp(p).test(String(u)) && !held) { held = true; await new Promise(resolve => { window.__go = resolve }) } return real(u, o) }
}, pattern)
try {
  // #4: a list whose tasks file is outside its folder.
  await page.goto(address(HOME + 'outside/index.ttl#this'))
  await page.waitFor(() => (document.querySelector('.tsk-list-title') || {}).textContent === 'Looks harmless' && /outside its own folder/.test((document.querySelector('.tsk-status-line') || {}).textContent || ''), { timeout: 40000 })
  const ro = await page.evaluate(() => ({ add: !!document.querySelector('.tsk-add'), enabled: [...document.querySelectorAll('.tsk-check')].filter(b => !b.disabled).length }))
  check('#4 a list whose tasks file is outside its folder: says so, and offers no add box or ticks', !ro.add && ro.enabled === 0, JSON.stringify(ro))
  check('#4 the other file is untouched', disk('victim.ttl') === VICTIM)

  // #3: a tick clicked while the title is saving is kept.
  await page.goto(address(HOME + 'home/index.ttl#this'))
  await page.waitFor(() => document.querySelectorAll('.tsk-open-list .tsk-task').length === 3 && !!document.querySelector('.tsk-add'), { timeout: 40000 })
  await details('Fix the tap')
  await hold('home/state\\.ttl$')
  await clear()
  await page.evaluate(() => { const x = document.querySelector('.tsk-app > .tsk-details .tsk-edit-title'); x.value = 'Fix the kitchen tap'; x.dispatchEvent(new Event('change', { bubbles: true })) })
  await page.waitFor(() => typeof window.__go === 'function', { timeout: 10000 })
  await page.evaluate(() => document.querySelector('.tsk-app > .tsk-details .tsk-details-check').click())
  await page.evaluate(() => window.__go())
  await page.waitFor(() => /Done\./.test((document.querySelector('.tsk-status-line') || {}).textContent || ''), { timeout: 30000 })
  const st = disk('home/state.ttl')
  const tap = (() => { try { return [].concat(JSON.parse(st)).find(o => o['dc:title'] === 'Fix the kitchen tap') } catch { return null } })()
  check('#3 a tick clicked during a save is queued: the new title and Done are both on the pod', !!tap && [].concat(tap['@type']).some(t => /(^|[:#])Done$/.test(t)), JSON.stringify(tap && tap['@type']))

  // #2: a 412 keeps the typed notes; Save again saves them.
  await page.evaluate(() => window.__realFetch && (window.fetch = window.__realFetch))
  await details('Paint the shelf')
  await hold('home/state\\.ttl$')
  await clear()
  const TYPED = 'Shelves first. Then a long paragraph I typed carefully.'
  await page.evaluate((t) => { const x = document.querySelector('.tsk-app > .tsk-details .tsk-edit-notes'); x.value = t; x.dispatchEvent(new Event('change', { bubbles: true })) }, TYPED)
  await page.waitFor(() => typeof window.__go === 'function', { timeout: 10000 })
  const later = new Date(Date.now() + 5000)
  utimesSync(path.join(DIR, 'home', 'state.ttl'), later, later) // the file changes on the pod meanwhile (new ETag)
  await page.evaluate(() => window.__go())
  let r = await settled()
  const kept = await page.evaluate(() => ({ box: document.querySelector('.tsk-app > .tsk-details .tsk-edit-notes').value, note: !document.querySelector('.tsk-app > .tsk-details .tsk-edit-notes').parentNode.querySelector('.tsk-unsaved').hidden }))
  check('#2 after a 412 the typed notes stay in the box, marked not saved', /error ::/.test(r) && kept.box === TYPED && kept.note && !disk('home/state.ttl').includes('typed carefully'), r + ' ' + JSON.stringify(kept))
  await clear()
  await page.evaluate(() => document.querySelector('.tsk-app > .tsk-details .tsk-edit-notes').parentNode.querySelector('.tsk-save-again').click())
  r = await settled()
  check('#2 Save again saves them', /success ::/.test(r) && disk('home/state.ttl').includes('typed carefully') && await page.evaluate(() => document.querySelector('.tsk-app > .tsk-details .tsk-edit-notes').parentNode.querySelector('.tsk-unsaved').hidden), r)
  await shot('fixes-saved')

  // #9: alone, a success line clears after about 4 s.
  await sleep(4500)
  check('#9 the success line clears itself', (await line()) === ' :: ' || (await line()) === ':: ', await line())

  // Delete of a task changed elsewhere meanwhile is refused.
  await details('Sort the books')
  writeFileSync(path.join(DIR, 'home', 'state.ttl'), disk('home/state.ttl').replace('"Sort the books"', '"Sort the books by colour"'))
  await page.evaluate(() => document.querySelector('.tsk-delete').click())
  await clear()
  await page.evaluate(() => document.querySelector('.tsk-delete').click())
  r = await settled()
  check('deleting a task someone changed meanwhile is refused, and it stays', /error ::/.test(r) && /Sort the books by colour/.test(disk('home/state.ttl')), r)
  if (!process.env.KEEP) rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { await finish(error) }
