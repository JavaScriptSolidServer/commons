// The poll pane inside the suite shell (shell/suite-shell-pane.js lists it as the Polls app), reusing the login
// poll.mjs left: the poll in the content, the poll and "Add poll" in the shell's left column, the details column
// (About with the maker's edit form, Configuration, Participants), answers said with a toast, and no sideways
// scroll at 1300 px and a true 400 px. "Add poll" makes a second poll beside the first and opens it.
//   node tests/shell.mjs       (after poll.mjs; KEEP=1 keeps the polls)
// Browser on port 9523. Data: me/public/suite-data/poll/shell-<time>/ and the poll "Add poll" makes beside it.
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, wide, measure } from '../../design/viewport.mjs'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const NAME = 'shell-' + Date.now().toString(36)
const HOME = path.join(config.podDir, 'public', 'suite-data', 'poll')
const DIR = path.join(HOME, NAME)
const POLL = POD + 'public/suite-data/poll/' + NAME + '/index.ttl#this'
const ME = POD + 'profile/card.jsonld#me'
const disk = (f) => readFileSync(path.join(DIR, f), 'utf8')
const before = new Set(existsSync(HOME) ? readdirSync(HOME) : [])

// A poll by "me" with three hours and one answer from Alice, written straight to disk. Also: Carol answered only a
// choice that is no longer offered (not counted, review #10), and the answers file names Alice "Mallory" (ignored, #5).
mkdirSync(DIR, { recursive: true })
writeFileSync(path.join(DIR, 'index.ttl'), `@prefix sched: <http://www.w3.org/ns/pim/schedule#>.
@prefix cal: <http://www.w3.org/2002/12/cal/ical#>.
@prefix dc: <http://purl.org/dc/elements/1.1/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
<https://alice.example/profile/card#me> foaf:name "Alice".
<#this> a sched:SchedulableEvent; cal:summary "Garden committee"; dc:author <${ME}>;
    dc:created "2026-11-20T10:00:00Z"^^xsd:dateTime; cal:location "The shed";
    sched:option <#o1>, <#o2>, <#o3>; sched:results <results.ttl>.
<#o1> cal:dtstart "2026-12-10T12:00:00Z"^^xsd:dateTime; cal:dtend "2026-12-10T13:00:00Z"^^xsd:dateTime.
<#o2> cal:dtstart "2026-12-10T13:00:00Z"^^xsd:dateTime; cal:dtend "2026-12-10T14:00:00Z"^^xsd:dateTime.
<#o3> cal:dtstart "2026-12-11T12:00:00Z"^^xsd:dateTime; cal:dtend "2026-12-11T13:00:00Z"^^xsd:dateTime.
`)
writeFileSync(path.join(DIR, 'results.ttl'), `@prefix sched: <http://www.w3.org/ns/pim/schedule#>.
@prefix dc: <http://purl.org/dc/elements/1.1/>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
<index.ttl#this> sched:response <#ra>, <#rc>.
<#ra> dc:author <https://alice.example/profile/card#me>; sched:cell <#ra-1>.
<#ra-1> sched:option <index.ttl#o1>; sched:availabilty sched:Yes.
<#rc> dc:author <https://carol.example/profile/card#me>; sched:cell <#rc-1>.
<#rc-1> sched:option <index.ttl#gone>; sched:availabilty sched:Yes.
<https://alice.example/profile/card#me> foaf:name "Mallory".
`)

const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9523, dir: import.meta.dirname, login: false, resource: POLL })
const toastSaying = (re) => page.waitFor((source) => [...document.querySelectorAll('.sh-toasts .sh-toast')].some(t => new RegExp(source).test(t.textContent)), { timeout: 30000, args: [re.source] }).catch(() => false)
const tab = (key) => page.evaluate((k) => document.querySelector(`.sh-detcol .pol-tab[data-tab=${k}]`).click(), key)
let made = null
// finish() exits the process, so the polls are removed before it is called.
const cleanup = () => { if (process.env.KEEP) return; rmSync(DIR, { recursive: true, force: true }); if (made) rmSync(path.join(HOME, made), { recursive: true, force: true }) }
try {
  const shown = await page.waitFor(() => !!document.querySelector('.sh-content .pol.poll-pane .pol-title') && document.querySelectorAll('.sh-content .pol-option .pol-choose').length === 3 && !!document.querySelector('.sh-navcol .pol-nav-item'), { timeout: 45000 }).catch(() => false)
  check('in the shell: Polls is the app, the poll in the content, its column on the left', !!shown && await page.evaluate(() => document.querySelector('[data-app="polls"][aria-current="page"]') !== null))
  const nav = await page.evaluate(() => ({ caption: document.querySelector('.sh-navcol .pol-caption').textContent, item: document.querySelector('.sh-navcol .pol-nav-item .pol-nav-label').textContent, current: document.querySelector('.sh-navcol .pol-nav-item').getAttribute('aria-current'), count: document.querySelector('.sh-navcol .pol-nav-count').textContent, add: !!document.querySelector('.sh-navcol .pol-nav-new'), nested: document.querySelectorAll('.sh-navcol nav').length }))
  check('left column: "Add poll", then the poll under "My polls", current, with the number who answered', nav.add && nav.caption === 'My polls' && nav.item === 'Garden committee' && nav.current === 'page' && nav.count === '1' && nav.nested === 0, JSON.stringify(nav))
  check('in the shell the edit form is not in the content (it is in the details); offering times is', await page.evaluate(() => !document.querySelector('.sh-content .pol-edit') && !!document.querySelector('.sh-content .pol-add')))

  // Answer: saved, said with a toast, the column's count follows.
  await page.evaluate(() => document.querySelectorAll('.sh-content .pol-option')[0].querySelector('button[data-answer=Yes]').click())
  check('answer in the shell: a toast says it was saved', !!await toastSaying(/Saved: Yes for/))
  check('answer in the shell: in the answers file, and the left column counts 2 people', /Yes/.test(disk('results.ttl')) && /2026-12-10T12/.test(disk('results.ttl')) && await page.waitFor(() => document.querySelector('.sh-navcol .pol-nav-count').textContent === '2', { timeout: 5000 }).catch(() => false))

  // The (i) button: the poll's details.
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  const det = await page.waitFor(() => { const t = document.querySelector('.sh-detcol:not([hidden]) .pol-details-title'); return t && t.textContent === 'Garden committee' }, { timeout: 8000 }).catch(() => false)
  check('the (i) button opens the details: title, by-line, three tabs, About first', !!det && await page.evaluate(() => /2 people have answered/.test(document.querySelector('.sh-detcol .pol-details-sub').textContent) && [...document.querySelectorAll('.sh-detcol .pol-tab')].map(t => t.textContent + (t.getAttribute('aria-selected') === 'true' ? '*' : '')).join() === 'About*,Configuration,Participants'))
  check('About: the place, and the maker\'s edit form', await page.evaluate(() => /The shed/.test(document.querySelector('.sh-detcol .pol-props').textContent) && !!document.querySelector('.sh-detcol .pol-edit button[type=submit]')))
  await page.evaluate(() => { const f = document.querySelector('.sh-detcol .pol-edit'); f.querySelector('textarea').value = 'Bring seed lists.'; f.requestSubmit() })
  check('edit notes in the details: a toast says saved', !!await toastSaying(/^Saved\.$/))
  check('edit notes in the details: on the pod, and in the content', /Bring seed lists/.test(disk('index.ttl')) && await page.waitFor(() => document.querySelector('.sh-content .pol-notes').textContent === 'Bring seed lists.', { timeout: 5000 }).catch(() => false))
  // #13: the tabs are tabs for the keyboard too.
  await page.evaluate(() => { const t = document.querySelector('.sh-detcol .pol-tab[aria-selected=true]'); t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
  check('#13 tabs: ArrowRight moves to Configuration and focuses it; tabs control the panel', await page.evaluate(() => { const t = document.activeElement; const panel = document.getElementById(t.getAttribute('aria-controls')); return t.dataset.tab === 'config' && t.getAttribute('aria-selected') === 'true' && t.tabIndex === 0 && !!panel && panel.getAttribute('aria-labelledby') === t.id && /Made by/.test(panel.textContent) }))
  // #3: typing in the About form survives a redraw (an answer pressed in the content).
  await tab('about')
  await page.evaluate(() => { document.querySelector('.sh-detcol .pol-edit textarea').value = 'Typing, not saved' })
  await page.evaluate(() => document.querySelectorAll('.sh-content .pol-option')[1].querySelector('button[data-answer=Maybe]').click())
  await toastSaying(/Saved: If need be/)
  check('#3 in the shell: an answer pressed does not wipe typing in the About form', await page.evaluate(() => document.querySelector('.sh-detcol .pol-edit textarea').value === 'Typing, not saved'))
  await page.evaluate(() => document.querySelectorAll('.sh-content .pol-option')[1].querySelector('button[data-answer=Maybe]').click())
  await page.waitFor(() => !document.querySelectorAll('.sh-content .pol-option')[1].querySelector('button[aria-pressed=true]'), { timeout: 30000 })
  // #7: one primary button in view.
  check('#7 in the shell: one primary button on screen ("Add poll")', await page.evaluate(() => [...document.querySelectorAll('.pol-btn-primary')].filter(b => b.offsetParent !== null).map(b => b.textContent).join() === 'Add poll'))
  await tab('config')
  check('Configuration: who made it, when, the choices, the time zone, and the honest note on who can answer', await page.evaluate(() => { const t = document.querySelector('.sh-detcol .pol-details-body').textContent; return /Made by/.test(t) && /Made on/.test(t) && /3 times/.test(t) && /Time zone/.test(t) && /could change another person/.test(t) && document.querySelector('.sh-detcol .pol-tab[data-tab=config]').getAttribute('aria-selected') === 'true' }))
  await tab('people')
  const people = await page.evaluate(() => [...document.querySelectorAll('.sh-detcol .pol-people .pol-row')].map(r => r.querySelector('.pol-row-title').textContent + '|' + r.querySelector('.pol-row-sub').textContent))
  check('Participants: Alice and me (marked "you"), with what each answered', people.length === 2 && !people.some(p => /Mallory|carol/i.test(p)) && people.some(p => /^Alice\|1 yes · 0 if need be · 0 no$/.test(p)) && people.some(p => /\(you\)\|1 yes · 0 if need be · 0 no$/.test(p)), people.join(' ; '))
  let m = await measure(page)
  check('1300 px in the shell, details open: no sideways scroll', !m.sideways, JSON.stringify(m))
  await tab('about')
  await shot('shell-1300')
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await sleep(300)
  m = await measure(page)
  check('1300 px in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-1300-closed')

  await narrow(page)
  // The shell opened its column at 1300 px; on a phone it is a drawer: shut it, and let the toasts go, for the picture.
  await page.evaluate(() => { const t = document.querySelector('.sh-nav-toggle'); if (t && t.getAttribute('aria-expanded') === 'true') t.click() })
  await page.waitFor(() => !document.querySelector('.sh-toasts .sh-toast') && document.querySelector('.sh-navcol').hidden, { timeout: 10000 }).catch(() => {})
  m = await measure(page)
  check('true 400 px in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400')
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .pol-details-title'), { timeout: 8000 })
  await sleep(400)
  m = await measure(page)
  check('true 400 px, details open in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400-details')
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await wide(page)
  await sleep(600)

  // "Add poll": a new poll beside this one, opened in the app. No toast: the shell draws a new frame when it goes.
  await page.evaluate(() => document.querySelector('.sh-navcol .pol-nav-new').click())
  const opened = await page.waitFor(() => { const t = document.querySelector('.sh-content .pol-title'); return t && t.textContent === 'New poll' && !!document.querySelector('.sh-content .pol-add') }, { timeout: 30000 }).catch(() => false)
  made = (readdirSync(HOME).filter(n => !before.has(n) && n !== NAME && n.startsWith('poll-')))[0] || null
  check('"Add poll": a new poll beside it, both files and their access rules, and it opens in the app', !!opened && !!made && ['index.ttl', 'results.ttl', 'index.ttl.acl', 'results.ttl.acl'].every(f => existsSync(path.join(HOME, made, f))), String(made))
  check('the new poll has its own empty state and its column follows', await page.evaluate(() => /No times offered yet/.test(document.querySelector('.sh-content .pol-empty').textContent) && document.querySelector('.sh-navcol .pol-nav-label').textContent === 'New poll'))
  await shot('shell-new')
  cleanup()
  await finish()
} catch (error) { cleanup(); await finish(error) }
