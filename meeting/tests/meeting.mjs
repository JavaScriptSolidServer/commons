// The meeting pane on the test pod, logged in: make a meeting from the Add menu's hook, edit its details,
// add links, move one, remove one (two presses), reload, then check SolidOS's own pane still reads the file.
//   node tests/meeting.mjs          logs in, runs everything at 1300 px, then the layout at 400 px; removes the meeting
//   KEEP=1 node tests/meeting.mjs   keeps the meeting folder afterwards
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'meeting/meeting-pane.js'
const NAME = 'm-' + Date.now().toString(36)
const BASE = POD + 'public/suite-data/meeting/' + NAME + '/'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'meeting', NAME)
const MEETING = BASE + 'index.ttl#this'
const port = 9536
const dir = import.meta.dirname

// The file as the pod serves it to anyone (it is under public/), as Turtle.
const served = async () => (await fetch(BASE + 'index.ttl', { headers: { Accept: 'text/turtle' } })).text()

let { page, check, finish, shot, address } = await open({ pane: PANE, port, dir, width: 1300, login: true, resource: POD + 'public/suite-data/' })
const status = () => page.evaluate(() => document.querySelector('.mtg-status').className + ' :: ' + document.querySelector('.mtg-status').textContent)
const settled = () => page.waitFor(() => /mtg-(good|bad)/.test(document.querySelector('.mtg-status').className) && !document.querySelector('.mtg button:disabled:not([data-act])'), { timeout: 30000 })
const names = () => page.evaluate(() => [...document.querySelectorAll('.mtg-item')].map(li => li.querySelector('.mtg-name').textContent + '|' + li.querySelector('.mtg-kind').textContent))
const openMeeting = async () => {
  await page.goto(address(MEETING))
  await page.waitFor(() => !!document.querySelector('.mtg.meeting-pane .mtg-title'), { timeout: 40000 })
  await page.waitFor(() => !!document.querySelector('.mtg-add'), { timeout: 15000 }).catch(() => false) // the write check is async
}
try {
  // 1. Made from a folder's Add menu.
  await page.waitFor(() => !!(window.panes && window.panes.byName('meeting-page')), { timeout: 40000 })
  check('the pane is registered and offers New Meeting', await page.evaluate(() => { const p = window.panes.byName('meeting-page'); return !!p.mintNew && p.mintClass.value === 'http://www.w3.org/ns/pim/meeting#Meeting' && window.panes.list.filter(x => x.mintNew).includes(p) }))
  await page.evaluate((base) => { window.__mint = null; const store = window.SolidLogic.store; window.panes.byName('meeting-page').mintNew({ dom: document, session: { store } }, { newBase: base }).then(r => { window.__mint = { ok: r.newInstance.value } }, e => { window.__mint = { error: String(e && e.message ? e.message : e) } }) }, BASE)
  const made = await page.waitFor(() => window.__mint, { timeout: 30000 })
  check('a new meeting is created', made.ok === MEETING, JSON.stringify(made))
  check('only index.ttl is written: no access rule', existsSync(DIR) && readdirSync(DIR).join(' ') === 'index.ttl', existsSync(DIR) ? readdirSync(DIR).join(' ') : 'no folder')
  const fresh = await served()
  check('in SolidOS\'s format: a meeting:Meeting with a toolList holding itself', /meeting#Meeting|meeting:Meeting/.test(fresh) && /toolList/.test(fresh) && /dc\/elements\/1\.1\/author|dc:author/.test(fresh), fresh.slice(0, 300).replace(/\n/g, ' '))

  // 2. Opens, with the tools for its maker.
  await openMeeting()
  check('it opens in the pane, with the tools to edit', await page.evaluate(() => !!document.querySelector('.mtg-add') && !!document.querySelector('.mtg-edit')))
  check('an empty list says so', /Nothing here yet/.test(await page.evaluate(() => document.querySelector('.mtg-list').textContent)))

  // 3. Edit the details.
  await page.evaluate(() => {
    const f = document.querySelector('.mtg-edit'); f.open = true
    const set = (n, v) => { f.querySelector(`[name=${n}]`).value = v }
    set('summary', 'Board meeting'); set('startDay', '2026-12-10'); set('startTime', '09:30'); set('endDay', '2026-12-10'); set('endTime', '11:00')
    set('location', 'Café Example, Prague'); set('comment', 'Two items.\nBring the budget.')
    f.querySelector('form').requestSubmit()
  })
  await settled()
  check('edit details: saved', /mtg-good/.test(await status()), await status())
  const header = await page.evaluate(() => ({ title: document.querySelector('.mtg-title').textContent, when: [...document.querySelectorAll('.mtg-head [data-fact=When]')].map(e => e.textContent).join(' '), ics: !!document.querySelector('a.mtg-ics'), expect: new Date(2026, 11, 10, 9, 30).toISOString().replace('.000Z', 'Z') }))
  check('the header shows them', header.title === 'Board meeting' && /09:30/.test(header.when) && /11:00/.test(header.when) && /time zone/.test(header.when) && header.ics, JSON.stringify(header))
  let text = await served()
  check('the pod file has the exact moments in UTC, place and notes', text.includes(header.expect) && /dateTime/.test(text) && /Café Example/.test(text) && /Bring the budget/.test(text), text.slice(0, 600).replace(/\n/g, ' '))

  // 3b. Braces in a literal (JSS drops them from a SPARQL patch and answers 204): saved whole, read back, and kept.
  await page.evaluate(() => { const f = document.querySelector('.mtg-edit'); f.open = true; f.querySelector('[name=comment]').value = 'Agree budget {draft} }\nBring the budget.'; f.querySelector('form').requestSubmit() })
  await settled()
  text = await served()
  check('notes with braces: "Saved." and the pod really has them', /mtg-good :: Saved\./.test(await status()) && text.includes('{draft} }'), await status() + ' / ' + (text.match(/comment[^\n]*/) || [''])[0])
  await openMeeting()
  check('notes with braces: still there after a reload', /\{draft\} \}/.test(await page.evaluate(() => document.querySelector('.mtg-head [data-fact=Notes]').textContent)))

  // 4. Add links.
  const addLink = (n, u) => page.evaluate((v) => { const [n, u] = JSON.parse(v); const f = document.querySelector('.mtg-add'); f.querySelector('[name=name]').value = n; f.querySelector('[name=url]').value = u; f.requestSubmit() }, JSON.stringify([n, u]))
  await addLink('Plain web', 'http://example.org/'); await sleep(300)
  check('an http (not https) address is refused', /mtg-bad/.test(await status()) && /https/.test(await status()), await status())
  await addLink('Agenda', 'https://board.example.org/agenda'); await settled()
  check('add a link: saved', /mtg-good/.test(await status()), await status())
  await addLink('Minutes', 'https://board.example.org/minutes'); await settled()
  await addLink('Budget', 'https://board.example.org/budget.pdf'); await settled()
  check('three links, in the order added', (await names()).join(' ; ') === 'Agenda|Web page ; Minutes|Web page ; Budget|Web page', (await names()).join(' ; '))
  text = await served()
  check('the pod file has each as a meeting:Tool with a target, and a wf:attachment', (text.match(/board\.example\.org/g) || []).length >= 6 && /flow#attachment|wf:attachment|attachment/.test(text) && /meeting#Tool|meeting:Tool/.test(text), text.slice(0, 900).replace(/\n/g, ' '))

  // 5. Reorder.
  await page.evaluate(() => document.querySelectorAll('.mtg-item')[2].querySelector('[data-act=up]').click()); await settled()
  check('move Budget up', (await names()).map(n => n.split('|')[0]).join(',') === 'Agenda,Budget,Minutes', (await names()).join(' ; '))
  await page.evaluate(() => document.querySelectorAll('.mtg-item')[0].querySelector('[data-act=down]').click()); await settled()
  check('move Agenda down', (await names()).map(n => n.split('|')[0]).join(',') === 'Budget,Agenda,Minutes', (await names()).join(' ; '))
  check('first cannot go up, last cannot go down', await page.evaluate(() => { const i = document.querySelectorAll('.mtg-item'); return i[0].querySelector('[data-act=up]').disabled && i[i.length - 1].querySelector('[data-act=down]').disabled }))

  // 6. Remove, with two presses.
  await page.evaluate(() => document.querySelectorAll('.mtg-item')[2].querySelector('[data-act=remove]').click()); await sleep(600)
  check('one press only arms Remove', (await names()).length === 3 && await page.evaluate(() => /Press again/.test(document.querySelectorAll('.mtg-item')[2].querySelector('[data-act=remove]').textContent)))
  await page.evaluate(() => document.querySelectorAll('.mtg-item')[2].querySelector('[data-act=remove]').click()); await settled()
  check('the second press removes it', (await names()).map(n => n.split('|')[0]).join(',') === 'Budget,Agenda', (await names()).join(' ; '))
  text = await served()
  check('the pod file no longer has it, nor the meeting\'s link to it', !/minutes/.test(text), text.slice(0, 900).replace(/\n/g, ' '))

  // 7. The list in the file, read with a fresh rdflib store as SolidOS's pane reads it: a list, in order.
  const asUpstream = async () => page.evaluate(async (m) => {
    const $rdf = window.$rdf; const kb = $rdf.graph(); const doc = m.split('#')[0]
    const r = await fetch(doc, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
    $rdf.parse(await r.text(), kb, doc, (r.headers.get('content-type') || 'text/turtle').split(';')[0])
    const list = kb.the(kb.sym(m), kb.sym('http://www.w3.org/ns/pim/meeting#toolList'))
    if (!list || !list.elements) return 'not a Collection: ' + (list && list.termType)
    return list.elements.map(e => e.value === m ? 'self' : (kb.anyValue(e, kb.sym('http://www.w3.org/2000/01/rdf-schema#label')) + '>' + (kb.any(e, kb.sym('http://www.w3.org/ns/pim/meeting#target')) || {}).value)).join(' ; ')
  }, MEETING)
  const listed = await asUpstream()
  check('the file\'s toolList is an RDF list SolidOS reads, the meeting first, in the new order', /^self ; Budget>https:\/\/board\.example\.org\/budget\.pdf ; Agenda>https:\/\/board\.example\.org\/agenda$/.test(listed), listed)

  // 8. Back to whole days, the way SolidOS's own form writes dates.
  await page.evaluate(() => { const f = document.querySelector('.mtg-edit'); f.open = true; f.querySelector('[name=startTime]').value = ''; f.querySelector('[name=endTime]').value = ''; f.querySelector('[name=endDay]').value = '2026-12-11'; f.querySelector('form').requestSubmit() })
  await settled()
  text = await served()
  check('a day without a time is saved as an xsd:date', /2026-12-10"\^\^(xsd:date|<http:\/\/www\.w3\.org\/2001\/XMLSchema#date>)/.test(text) && /2026-12-11"\^\^(xsd:date|<http:\/\/www\.w3\.org\/2001\/XMLSchema#date>)/.test(text), (text.match(/dt(start|end)[^;.]*/g) || []).join(' | '))
  check('and shown as days', /December 10.*December 11|10 December.*11 December/.test(await page.evaluate(() => [...document.querySelectorAll('.mtg-head [data-fact=When]')].map(e => e.textContent).join(' '))), await page.evaluate(() => [...document.querySelectorAll('.mtg-head [data-fact=When]')].map(e => e.textContent).join(' ')))
  const ics = await page.evaluate(() => decodeURIComponent(document.querySelector('a.mtg-ics').href.split(',').slice(1).join(',')))
  check('the calendar file has whole days, the end being the day after', /DTSTART;VALUE=DATE:20261210/.test(ics) && /DTEND;VALUE=DATE:20261212/.test(ics), ics.split('\r\n').filter(l => /^DT/.test(l)).join(' '))
  const invalid = async (fill) => { await page.evaluate(fill); await sleep(300); return status() }
  check('an end before the start is refused', /mtg-bad.*before/.test(await invalid(() => { const f = document.querySelector('.mtg-edit'); f.open = true; f.querySelector('[name=endDay]').value = '2026-12-01'; f.querySelector('form').requestSubmit() })))

  // 9. The safety catch: the pod refuses a write over a file that changed.
  const refused = await page.evaluate(async (doc) => (await window.SolidLogic.store.fetcher._fetch(doc, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-Match': '"stale"' }, body: '<#x> <#y> <#z>.' })).status, BASE + 'index.ttl')
  check('the pod refuses a rewrite with an old ETag (412), which is what keeps list changes safe', refused === 412, String(refused))

  // 10. Reload reads back the same.
  await openMeeting()
  await page.waitFor(() => document.querySelectorAll('.mtg-item').length === 2, { timeout: 20000 })
  check('after a reload it reads back the same', (await names()).join(' ; ') === 'Budget|Web page ; Agenda|Web page' && (await page.evaluate(() => document.querySelector('.mtg-title').textContent)) === 'Board meeting', (await names()).join(' ; '))
  check('no sideways scroll at 1300 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.evaluate(() => { document.querySelector('.mtg-edit').open = true })
  await shot('meeting-1300')

  // 11. SolidOS's own meeting pane opens the same file (no ?pane=, so it is the one chosen).
  await page.goto(config.browser + '?uri=' + encodeURIComponent(MEETING))
  const tabs = await page.waitFor(() => { const t = [...document.querySelectorAll('.meetingPane')]; return t.length ? (document.querySelector('.meetingPane').textContent.match(/Budget|Agenda|Board meeting/g) || []).join(',') : false }, { timeout: 40000 }).catch(e => 'timeout ' + e.message.slice(0, 100))
  check('SolidOS\'s own meeting pane reads it: its tabs are the title, Budget, Agenda', /^Board meeting,Budget,Agenda/.test(tabs), tabs)
  await shot('upstream-reads-it')
  await page.close()

  // 12. The same page at a true 400 px (design/viewport.mjs), logged in (the session is reused).
  ;({ page, check, finish, shot, address } = await open({ pane: PANE, port, dir, width: 400, login: false, resource: MEETING }))
  await narrow(page)
  await page.waitFor(() => document.querySelectorAll('.mtg-item').length === 2 && !!document.querySelector('.mtg-add'), { timeout: 40000 })
  await page.evaluate(() => { document.querySelector('.mtg-edit').open = true })
  await sleep(500)
  const m = await measure(page)
  check('true 400 px, logged in: no sideways scroll with the forms open', m.innerWidth === 400 && !m.sideways, JSON.stringify(m))
  check('true 400 px: every button and input is at least 44 px tall', await page.evaluate(() => [...document.querySelectorAll('.mtg button, .mtg input, .mtg-edit > summary')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height >= 44)), await page.evaluate(() => [...document.querySelectorAll('.mtg button, .mtg input')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).map(b => b.className || b.name).join(' ')))
  await shot('meeting-400')

  // An address with two apostrophes (JSS garbles such IRIs, finding 3b): written percent-encoded, so later changes still work.
  await addLink('Quotes', "https://example.org/bob's-and-carol's"); await settled()
  check('a link with two apostrophes: saved', /mtg-good/.test(await status()), await status())
  await addLink('Next', 'https://example.org/next'); await settled()
  check('and a later list change still works', /mtg-good/.test(await status()) && (await names()).map(n => n.split('|')[0]).join(',') === 'Budget,Agenda,Quotes,Next', await status() + ' / ' + (await names()).join(' ; '))
  text = await served()
  check('the pod file has the address percent-encoded, and no NUL bytes', text.includes('bob%27s-and-carol%27s') && !text.includes('\u0000'), (text.match(/[^\s<]*carol[^\s>]*/) || [''])[0])

  // A real double-click on the bin must not count as the two presses.
  const bin = await page.evaluate(() => { const b = document.querySelectorAll('.mtg-item')[3].querySelector('[data-act=remove]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  for (const [type, clickCount] of [['mousePressed', 1], ['mouseReleased', 1], ['mousePressed', 2], ['mouseReleased', 2]]) await page.send('Input.dispatchMouseEvent', { type, x: bin.x, y: bin.y, button: 'left', clickCount })
  await sleep(1500)
  check('a double-click on Remove only arms it; nothing is removed', (await names()).length === 4 && await page.evaluate(() => /Press again/.test(document.querySelectorAll('.mtg-item')[3].querySelector('[data-act=remove]').textContent)), (await names()).join(' ; ') + ' / ' + await status())
  text = await served()
  check('and the pod file still has it', text.includes('example.org/next'))
  await page.evaluate(() => document.querySelector('.mtg-add').scrollIntoView())
  await shot('meeting-400-forms')
  if (process.env.KEEP) console.log('kept: ' + MEETING); else rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { if (!process.env.KEEP) rmSync(DIR, { recursive: true, force: true }); await finish(error) }
