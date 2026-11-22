// Two people on one poll (written by the reviewer). "me" makes a poll in the pane, offers three hours and one
// other choice, and answers; "bob", in his own logged-in browser, opens it, sees what me offered and answered,
// answers himself, and finds he cannot change the poll; me reloads and sees bob's answers under his name.
// Also: bob's clicks never touch me's answers; Refresh in bob's open page after me adds a time; and two
// things the server lets bob do because the answers file is writable by anyone logged in (decided, printed as INFO).
//   node tests/two-person.mjs        (KEEP=1 keeps the poll folder)
// Browsers: me on 9523, bob on 9524 (the pane's own ports). Data: me/public/suite-data/poll/review-<time>/ (removed after).
// Since the review's fixes, Refresh and the planted names are checks, not INFO lines.
import { open, config, LAB, POD, POD2, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'poll/poll-pane.js'
const NAME = 'review-' + Date.now().toString(36)
const HOME = POD + 'public/suite-data/poll/'
const BASE = HOME + NAME + '/'
const POLL = BASE + 'index.ttl#this'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'poll', NAME)
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
const SCHED = 'http://www.w3.org/ns/pim/schedule#'
const CAL = 'http://www.w3.org/2002/12/cal/ical#'
mkdirSync(path.dirname(DIR), { recursive: true })
const disk = (f) => readFileSync(path.join(DIR, f), 'utf8')

const me = await open({ pane: PANE, port: 9523, dir: import.meta.dirname, resource: HOME })
const { check, finish } = me
let bob = null

const ready = (p, n) => p.waitFor((count) => document.querySelectorAll('.pol-option').length === +count && !!document.querySelector('.pol-choose'), { timeout: 40000, args: [String(n)] })
const settled = (p) => p.waitFor(() => /pol-(good|bad)/.test(document.querySelector('.pol-status').className) && !document.querySelector('.pol button:disabled'), { timeout: 30000 })
const status = (p) => p.evaluate(() => document.querySelector('.pol-status').className + ' :: ' + document.querySelector('.pol-status').textContent)
const press = async (p, i, a) => {
  await p.evaluate(() => { document.querySelector('.pol-status').className = 'pol-status' })
  await p.evaluate((v) => { const [n, ans] = v.split('|'); document.querySelectorAll('.pol-option')[+n].querySelector(`button[data-answer=${ans}]`).click() }, i + '|' + a)
  await settled(p)
}
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.pol-option')].map(o => ({
  name: o.querySelector('.pol-name').textContent,
  count: o.querySelector('.pol-count').textContent,
  best: !!o.querySelector('.pol-tag'),
  who: [...o.querySelectorAll('.pol-who .pol-chip')].map(c => c.textContent).join(', '),
  mine: [...o.querySelectorAll('.pol-choose button[aria-pressed=true]')].map(b => b.dataset.answer).join('')
})))
const show = (r) => r.map(x => `${x.name} | ${x.count} | ${x.best ? 'best' : '-'} | ${x.who || '-'} | own:${x.mine || '-'}`).join(' ; ')
// Every answer in the answers file, read from the server as the person on this page.
const answersOnServer = (p) => p.evaluate(async (address) => {
  const $rdf = globalThis.$rdf
  const response = await window.SolidLogic.store.fetcher._fetch(address, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
  const g = $rdf.graph()
  $rdf.parse(await response.text(), g, address, response.headers.get('content-type').split(';')[0])
  const S = 'http://www.w3.org/ns/pim/schedule#'
  const A = $rdf.sym('http://purl.org/dc/elements/1.1/author')
  const out = []
  for (const r of g.each(null, A)) {
    for (const cell of g.each(r, $rdf.sym(S + 'cell'))) {
      const v = g.any(cell, $rdf.sym(S + 'availabilty'))
      out.push({ author: g.any(r, A).value, cell: cell.value, option: ((g.any(cell, $rdf.sym(S + 'option')) || {}).value || '').split('#').pop(), answer: v ? v.value.slice(S.length) : null })
    }
  }
  return out
}, BASE + 'results.ttl')
const send = (p, address, method, body, type) => p.evaluate(async (v) => {
  const [a, m, b, t] = JSON.parse(v)
  const r = await window.SolidLogic.store.fetcher._fetch(a, { method: m, headers: t ? { 'Content-Type': t } : {}, body: b || undefined })
  return r.status
}, JSON.stringify([address, method, body, type]))
const mineOf = (list, who) => list.filter(a => a.author === who).map(a => a.option + '=' + a.answer).sort().join(' ')

try {
  // 1. me makes the poll (mintNew, as the Add menu does), offers 12:00-15:00 and one other choice, answers two.
  await me.page.waitFor(() => !!(window.panes && window.panes.byName('poll')), { timeout: 40000 })
  await me.page.evaluate((base) => { window.__mint = null; window.panes.byName('poll').mintNew({ dom: document, session: { store: window.SolidLogic.store } }, { newBase: base, title: 'Review lunch' }).then(r => { window.__mint = { ok: r.newInstance.value } }, e => { window.__mint = { error: String(e && e.message ? e.message : e) } }) }, BASE)
  await me.page.waitFor(() => !!window.__mint, { timeout: 30000 })
  const made = await me.page.evaluate(() => window.__mint)
  check('me: a poll is made', made.ok === POLL, JSON.stringify(made))
  await me.page.goto(me.address(POLL))
  await me.page.waitFor(() => !!document.querySelector('.pol-add'), { timeout: 40000 })
  await me.page.evaluate(() => { const f = document.querySelector('.pol-add'); f.querySelector('input[type=date]').value = '2026-12-10'; const s = f.querySelectorAll('select'); s[0].value = '12'; s[1].value = '15'; f.requestSubmit() })
  await settled(me.page)
  check('me: three hours offered', /3 times added/.test(await status(me.page)), await status(me.page))
  await me.page.evaluate(() => { document.querySelector('.pol-status').className = 'pol-status'; const box = document.querySelector('.pol-more'); box.open = true; box.querySelector('input').value = 'Bring cake'; box.querySelector('button').click() })
  await settled(me.page)
  check('me: one other choice added', /Choice added/.test(await status(me.page)), await status(me.page))
  await ready(me.page, 4)
  await press(me.page, 0, 'Yes')
  await press(me.page, 1, 'Maybe')
  await press(me.page, 3, 'Yes')
  const meFirst = mineOf(await answersOnServer(me.page), ME)
  check('me: my three answers are on the server', meFirst === 'o1=Yes o2=Maybe o4=Yes', meFirst)
  const indexBefore = disk('index.ttl')

  // 2. bob opens it in his own browser.
  bob = await open({ pane: PANE, port: 9524, dir: import.meta.dirname, resource: POLL, as: 'bob' })
  const bobWho = await bob.page.evaluate(() => { try { return window.SolidLogic.authn.currentUser().value } catch { return null } })
  check('bob: logged in as bob', bobWho === BOB, String(bobWho))
  await ready(bob.page, 4)
  await bob.page.waitFor(() => /By me/.test(document.querySelector('.pol-meta').textContent), { timeout: 15000 }).catch(() => {})
  const seen = await rows(bob.page)
  check('bob: sees the title and who made it', await bob.page.evaluate(() => document.querySelector('.pol-title').textContent === 'Review lunch' && /^By me · 1 person has answered/.test(document.querySelector('.pol-meta').textContent)), await bob.page.evaluate(() => document.querySelector('.pol-meta').textContent))
  check('bob: sees the three hours and the other choice', seen.length === 4 && seen.slice(0, 3).every(r => / to /.test(r.name)) && seen[3].name === 'Bring cake', show(seen))
  check('bob: sees my answers', seen[0].who === 'me' && seen[1].who === 'me (if need be)' && seen[2].who === '' && seen[3].who === 'me', show(seen))
  check('bob: none of my answers shows as his', seen.every(r => r.mine === ''), show(seen))
  const tools = await bob.page.evaluate(() => ({ add: !!document.querySelector('.pol-add'), edit: !!document.querySelector('.pol-edit'), remove: document.querySelectorAll('.pol-quiet').length, answer: document.querySelectorAll('.pol-choose button[data-answer]').length }))
  check('bob: no maker tools (Offer times, About this meeting, Remove)', !tools.add && !tools.edit && tools.remove === 0, JSON.stringify(tools))
  check('bob: answer buttons for each choice', tools.answer === 12, JSON.stringify(tools))

  // 3. bob answers, in the pane. One of them on the hour me said Yes to.
  await press(bob.page, 0, 'No')
  check('bob: No for the first hour saved', /pol-good/.test(await status(bob.page)), await status(bob.page))
  await press(bob.page, 1, 'Yes')
  await press(bob.page, 3, 'Maybe')
  await press(bob.page, 3, 'Maybe') // the same again clears it
  await press(bob.page, 2, 'Maybe')
  const after = await answersOnServer(bob.page)
  check('pod: bob\'s answers under his WebID', mineOf(after, BOB) === 'o1=No o2=Yes o3=Maybe o4=null', mineOf(after, BOB))
  check('pod: bob\'s presses left my answers as they were', mineOf(after, ME) === meFirst, mineOf(after, ME))
  await bob.shot('review-two-bob')

  // 4. bob cannot change the poll itself: not in the pane (no tools) and not by hand.
  const summary = disk('index.ttl').match(/Review lunch/)
  const patchIndex = await send(bob.page, BASE + 'index.ttl', 'PATCH', `INSERT DATA { <${POLL}> <${CAL}summary> "Bob's lunch" . <${POLL}> <${SCHED}option> <${BASE}index.ttl#bob> . <${BASE}index.ttl#bob> <http://www.w3.org/2000/01/rdf-schema#label> "Bob's choice" . }`, 'application/sparql-update')
  const deleteOption = await send(bob.page, BASE + 'index.ttl', 'PATCH', `DELETE DATA { <${POLL}> <${SCHED}option> <${BASE}index.ttl#o1> . }`, 'application/sparql-update')
  const putIndex = await send(bob.page, BASE + 'index.ttl', 'PUT', `<#this> <${CAL}summary> "Bob's lunch" .`, 'text/turtle')
  const putAcl = await send(bob.page, BASE + 'index.ttl.acl', 'PUT', '{}', 'application/ld+json')
  check('bob: his PATCH to add a title and a choice is refused', patchIndex === 403, String(patchIndex))
  check('bob: his PATCH to remove a time is refused', deleteOption === 403, String(deleteOption))
  check('bob: his PUT over the poll is refused', putIndex === 403, String(putIndex))
  check('bob: he cannot rewrite the poll\'s access rule', putAcl === 403, String(putAcl))
  check('pod: index.ttl unchanged on disk', !!summary && disk('index.ttl') === indexBefore)

  // 5. me reloads and sees bob's answers, with bob's name from his profile.
  await me.page.goto(me.address(POLL))
  await ready(me.page, 4)
  await me.page.waitFor(() => /Bob Tester/.test(document.querySelector('.pol-options').textContent), { timeout: 20000 }).catch(() => {})
  const both = await rows(me.page)
  console.log('     me sees: ' + show(both))
  check('me: first hour, my Yes only (bob said No)', both[0].count === '1 yes' && both[0].who === 'me' && both[0].mine === 'Yes', show([both[0]]))
  check('me: second hour, bob yes and me if need be', both[1].count === '1 yes · 1 if need be' && both[1].who === 'Bob Tester, me (if need be)' && both[1].mine === 'Maybe', show([both[1]]))
  check('me: third hour, bob if need be', both[2].count === '0 yes · 1 if need be' && both[2].who === 'Bob Tester (if need be)' && both[2].mine === '', show([both[2]]))
  check('me: the other choice, my Yes only (bob cleared his)', both[3].count === '1 yes' && both[3].who === 'me' && both[3].mine === 'Yes', show([both[3]]))
  check('me: two people have answered', /2 people have answered/.test(await me.page.evaluate(() => document.querySelector('.pol-meta').textContent)))
  check('me: best so far is the second hour only (yes 2 + if need be 1)', !both[0].best && both[1].best && !both[2].best && !both[3].best, show(both))
  await me.shot('review-two-me')

  // 6. bob's open page: me adds a time, bob presses Refresh, then reloads.
  await me.page.evaluate(() => { const f = document.querySelector('.pol-add'); f.querySelector('input[type=date]').value = '2026-12-11'; const s = f.querySelectorAll('select'); s[0].value = '12'; s[1].value = '13'; f.requestSubmit() })
  await settled(me.page)
  await bob.page.evaluate(() => [...document.querySelectorAll('.pol-foot button')].find(b => /Refresh/.test(b.textContent)).click())
  const afterRefresh = await bob.page.waitFor(() => document.querySelectorAll('.pol-option').length === 5, { timeout: 15000 }).catch(() => false)
  check('bob: Refresh reads the poll again too: he sees the time me added (review #4)', !!afterRefresh, String(await bob.page.evaluate(() => document.querySelectorAll('.pol-option').length)))
  await bob.page.goto(bob.address(POLL))
  await ready(bob.page, 5)
  check('bob: after a reload he sees the new time', (await bob.page.evaluate(() => document.querySelectorAll('.pol-option').length)) === 5)

  // 7. bob at a true 400 px.
  await narrow(bob.page)
  await sleep(400)
  const m = await measure(bob.page)
  check('bob: no sideways scroll at a true 400 px', !m.sideways, JSON.stringify(m))
  await bob.shot('review-two-bob-400')

  // 8. What the writable answers file lets bob do by hand (decided; printed, not failed).
  const target = after.find(a => a.author === ME && a.option === 'o1')
  const flip = await send(bob.page, BASE + 'results.ttl', 'PATCH', `DELETE DATA { <${target.cell}> <${SCHED}availabilty> <${SCHED}Yes> . } ; INSERT DATA { <${target.cell}> <${SCHED}availabilty> <${SCHED}No> . }`, 'application/sparql-update')
  console.log(`INFO bob's hand-made PATCH flipping my Yes to No: ${flip}; my o1 now ${(await answersOnServer(me.page)).find(a => a.cell === target.cell).answer}`)
  const spoof = await send(bob.page, BASE + 'results.ttl', 'PATCH', `INSERT DATA { <${ME}> <http://xmlns.com/foaf/0.1/name> "Mallory" . <${BOB}> <http://xmlns.com/foaf/0.1/name> "Alice" . }`, 'application/sparql-update')
  await bob.page.goto(bob.address(POLL))
  await ready(bob.page, 5)
  await sleep(2500)
  const spoofed = await bob.page.evaluate((v) => { const [me, bob] = JSON.parse(v); const s = window.SolidLogic.store; const n = (w) => s.each(s.sym(w), s.sym('http://xmlns.com/foaf/0.1/name')).map(x => x.value).join('/'); return document.querySelector('.pol-meta').textContent + ' | chips: ' + [...document.querySelectorAll('.pol-who .pol-chip')].map(c => c.textContent).join(', ') + ' | names in store: me=' + n(me) + ' bob=' + n(bob) }, JSON.stringify([ME, BOB]))
  console.log(`INFO bob writes foaf:name for me and for himself into results.ttl (${spoof}); a viewer then sees: ${spoofed}`)
  const onPage = spoofed.split(' | names')[0]
  check('planted names in the answers file are not shown: the maker is still "me", bob still "Bob Tester" (review #5)', /^By me ·/.test(onPage) && !/Mallory/.test(onPage) && /Bob Tester/.test(onPage) && !/\bAlice\b/.test(onPage), onPage)
  await bob.shot('review-two-bob-spoof')

  await bob.page.close()
  bob = null
  if (process.env.KEEP) console.log('kept: ' + DIR); else rmSync(DIR, { recursive: true, force: true })
  rmSync(path.join(import.meta.dirname, 'profile-bob'), { recursive: true, force: true })
  await finish()
} catch (error) { if (bob) await bob.page.close().catch(() => {}); await finish(error) }
