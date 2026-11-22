// Two people on one poll: "me" makes it and offers three hours, "bob" answers, "me" sees bob's answers.
// Then the uncomfortable check: bob sends an update of his own that changes, then deletes, MY answer.
//   node poll.mjs          (KEEP=1 keeps the poll folder for a look)
// Browsers: me on 9431, bob on 9432. Data: me/public/suite-data/two-person/poll-<time>/
import { open, config, POD, POD2, sleep } from '../lib/lib.mjs'
import { readFileSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const PANE = POD + 'public/poll-repo/poll-pane.js'
const NAME = 'poll-' + Date.now().toString(36)
const BASE = POD + 'public/suite-data/two-person/' + NAME + '/'
const POLL = BASE + 'index.ttl#this'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'two-person', NAME)
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
const SCHED = 'http://www.w3.org/ns/pim/schedule#'
mkdirSync(path.dirname(DIR), { recursive: true })
const disk = (f) => readFileSync(path.join(DIR, f), 'utf8')

const me = await open({ pane: PANE, port: 9431, dir: import.meta.dirname, resource: POD + 'public/suite-data/two-person/' })
const { check, finish } = me
let bob = null

// Helpers that work on either person's page.
const ready = (p, n) => p.waitFor((count) => document.querySelectorAll('.pol-option').length === +count && !!document.querySelector('.pol-choose'), { timeout: 40000, args: [String(n)] })
const settled = (p) => p.waitFor(() => /pol-(good|bad)/.test(document.querySelector('.pol-status').className) && !document.querySelector('.pol button:disabled'), { timeout: 30000 })
const status = (p) => p.evaluate(() => document.querySelector('.pol-status').className + ' :: ' + document.querySelector('.pol-status').textContent)
const press = async (p, i, a) => { await p.evaluate((v) => { const [n, ans] = v.split('|'); document.querySelectorAll('.pol-option')[+n].querySelector(`button[data-answer=${ans}]`).click() }, i + '|' + a); await settled(p) }
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.pol-option')].map(o => ({
  name: o.querySelector('.pol-name').textContent,
  count: o.querySelector('.pol-count').textContent,
  lead: o.classList.contains('pol-lead'),
  best: !!o.querySelector('.pol-tag'),
  who: o.querySelector('.pol-who').textContent,
  mine: [...o.querySelectorAll('.pol-choose button[aria-pressed=true]')].map(b => b.dataset.answer).join('')
})))
const show = (r) => r.map(x => `${x.name} | ${x.count} | ${x.best ? 'best' : '-'} | ${x.who || '-'} | own:${x.mine || '-'}`).join(' ; ')
// Ask the server for the answers file as the person on this page, and list every answer in it.
const answersOnServer = (p) => p.evaluate(async (address) => {
  const store = window.SolidLogic.store
  const $rdf = globalThis.$rdf
  const response = await store.fetcher._fetch(address, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
  const text = await response.text()
  const g = $rdf.graph()
  $rdf.parse(text, g, address, response.headers.get('content-type').split(';')[0])
  const S = 'http://www.w3.org/ns/pim/schedule#'
  const out = []
  for (const r of g.each(null, $rdf.sym('http://purl.org/dc/elements/1.1/author'))) {
    const author = g.any(r, $rdf.sym('http://purl.org/dc/elements/1.1/author'))
    for (const cell of g.each(r, $rdf.sym(S + 'cell'))) {
      const v = g.any(cell, $rdf.sym(S + 'availabilty'))
      out.push({ author: author.value, response: r.value, cell: cell.value, option: (g.any(cell, $rdf.sym(S + 'option')) || {}).value, answer: v ? v.value.slice(S.length) : null })
    }
  }
  return { status: response.status, answers: out }
}, BASE + 'results.ttl')

try {
  // 1. me makes the poll with mintNew and offers three hours.
  await me.page.waitFor(() => !!(window.panes && window.panes.byName('poll')), { timeout: 40000 })
  await me.page.evaluate((base) => { window.__mint = null; const store = window.SolidLogic.store; window.panes.byName('poll').mintNew({ dom: document, session: { store } }, { newBase: base, title: 'Two-person lunch' }).then(r => { window.__mint = { ok: r.newInstance.value } }, e => { window.__mint = { error: String(e && e.message ? e.message : e) } }) }, BASE)
  await me.page.waitFor(() => !!window.__mint, { timeout: 30000 })
  const made = await me.page.evaluate(() => window.__mint)
  check('me: a new poll is made with mintNew', made.ok === POLL, JSON.stringify(made))
  await me.page.goto(me.address(POLL))
  await me.page.waitFor(() => !!document.querySelector('.pol-add'), { timeout: 40000 })
  await me.page.evaluate(() => { const f = document.querySelector('.pol-add'); f.querySelector('input[type=date]').value = '2026-12-10'; const s = f.querySelectorAll('select'); s[0].value = '12'; s[1].value = '15'; f.requestSubmit() })
  await settled(me.page)
  check('me: three hours offered', /3 times added/.test(await status(me.page)), (await status(me.page)).slice(0, 80))
  await ready(me.page, 3)
  await press(me.page, 0, 'Yes')
  await press(me.page, 1, 'Yes')
  check('me: my Yes on the first two hours is saved', (await rows(me.page)).map(r => r.mine).join(',') === 'Yes,Yes,', show(await rows(me.page)))

  // 2. bob opens the poll in his own browser.
  bob = await open({ pane: PANE, port: 9432, dir: import.meta.dirname, resource: POLL, as: 'bob' })
  const bobWho = await bob.page.evaluate(() => { try { return window.SolidLogic.authn.currentUser().value } catch { return null } })
  check('bob: logged in as bob, not as me', bobWho === BOB, String(bobWho))
  await ready(bob.page, 3)
  await sleep(2500)
  const seen = await rows(bob.page)
  check('bob: sees the three hours', seen.length === 3 && seen.every(r => /\d\d:\d\d( [AP]M)? to \d\d:\d\d/.test(r.name)), show(seen))
  check('bob: sees my two answers', seen[0].count === '1 yes' && seen[1].count === '1 yes' && /\bme\b/.test(seen[0].who), show(seen))
  const tools = await bob.page.evaluate(() => ({ add: !!document.querySelector('.pol-add'), edit: !!document.querySelector('.pol-edit'), remove: [...document.querySelectorAll('.pol-quiet')].length, answer: document.querySelectorAll('.pol-choose button[data-answer]').length }))
  check('bob: no owner tools (no Offer times, no About this meeting, no Remove)', !tools.add && !tools.edit && tools.remove === 0, JSON.stringify(tools))
  check('bob: but he does get the answer buttons', tools.answer === 9, JSON.stringify(tools))
  await bob.shot('poll-bob-before')
  await press(bob.page, 1, 'Yes')
  check('bob: Yes for the second hour saved', /pol-good/.test(await status(bob.page)), (await status(bob.page)).slice(0, 80))
  await press(bob.page, 2, 'Maybe')
  check('bob: If need be for the third hour saved', /pol-good/.test(await status(bob.page)), (await status(bob.page)).slice(0, 80))
  const onServer = await answersOnServer(bob.page)
  const bobs = onServer.answers.filter(a => a.author === BOB)
  check('pod: the answers file has bob\'s two answers under his WebID', bobs.length === 2 && bobs.some(a => a.answer === 'Yes' && a.option === BASE + 'index.ttl#o2') && bobs.some(a => a.answer === 'Maybe' && a.option === BASE + 'index.ttl#o3'), JSON.stringify(bobs.map(a => a.option.split('#')[1] + '=' + a.answer)))
  check('pod: the file on disk names bob', disk('results.ttl').includes(BOB) || disk('results.ttl').includes('/bob/profile/card.jsonld#me'))
  check('pod: bob\'s answer and mine are separate responses', new Set(onServer.answers.map(a => a.response)).size === 2, onServer.answers.map(a => a.author.split('/')[3] + ':' + a.answer).join(' '))
  await bob.shot('poll-bob-after')

  // 3. back as me: reload and see both.
  await me.page.goto(me.address(POLL))
  await ready(me.page, 3)
  await me.page.waitFor(() => /Bob Tester/.test(document.querySelector('.pol-list').textContent), { timeout: 20000 }).catch(() => {})
  const both = await rows(me.page)
  console.log('     ' + show(both))
  check('me: the first hour, my Yes only', both[0].count === '1 yes' && both[0].who === 'me' && !both[0].best, show(both))
  check('me: the second hour, two yes, me and bob', both[1].count === '2 yes' && /me/.test(both[1].who) && /Bob Tester/.test(both[1].who), show([both[1]]))
  check('me: the third hour, bob if need be', both[2].count === '0 yes · 1 if need be' && both[2].who === 'Bob Tester (if need be)', show([both[2]]))
  check('me: "Best so far" is the second hour, and only that one', both[1].best && both[1].lead && !both[0].best && !both[2].best, show(both))
  check('me: bob\'s name comes from his profile (foaf:name "Bob Tester"), not from his address', /Bob Tester/.test(both.map(r => r.who).join(' ')) && !/127\.0\.0\.1\/bob/.test(both.map(r => r.who).join(' ')))
  check('me: two people have answered', /2 people have answered/.test(await me.page.evaluate(() => document.querySelector('.pol-meta').textContent)))
  check('no sideways scroll at 1300 px', await me.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await me.shot('poll-me-both')

  // 4. The uncomfortable check. bob sends updates himself, by-passing the pane's buttons.
  const mineBefore = (await answersOnServer(me.page)).answers.filter(a => a.author === ME)
  const target = mineBefore.find(a => a.option === BASE + 'index.ttl#o1')
  const patch = (p, body) => p.evaluate(async (v) => {
    const [address, text] = JSON.parse(v)
    const r = await window.SolidLogic.store.fetcher._fetch(address, { method: 'PATCH', headers: { 'Content-Type': 'application/sparql-update' }, body: text })
    return { status: r.status, body: (await r.text()).slice(0, 200) }
  }, JSON.stringify([BASE + 'results.ttl', body]))
  const flip = `DELETE DATA { <${target.cell}> <${SCHED}availabilty> <${SCHED}Yes> . } ;\nINSERT DATA { <${target.cell}> <${SCHED}availabilty> <${SCHED}No> . }`
  const flipped = await patch(bob.page, flip)
  const afterFlip = (await answersOnServer(me.page)).answers.filter(a => a.author === ME)
  const changed = afterFlip.find(a => a.cell === target.cell)
  console.log(`     bob PATCH (my Yes -> No on o1): ${flipped.status} ${flipped.body.replace(/\s+/g, ' ')}`)
  console.log(`     my answer on o1 now: ${changed ? changed.answer : 'gone'}`)
  // This PASSes when the test managed to find out; the finding itself is printed as FINDING.
  check('uncomfortable: bob\'s PATCH to change my answer got a reply', flipped.status > 0)
  console.log(`FINDING bob ${changed && changed.answer === 'No' ? 'CAN' : 'cannot'} change my answer (my Yes on the first hour is now ${changed ? changed.answer : 'gone'})`)
  const myResponse = target.response
  const wipe = `DELETE DATA { <${POLL}> <${SCHED}response> <${myResponse}> . <${myResponse}> <http://purl.org/dc/elements/1.1/author> <${ME}> . }`
  const wiped = await patch(bob.page, wipe)
  const afterWipe = (await answersOnServer(me.page)).answers.filter(a => a.author === ME)
  console.log(`     bob PATCH (delete my whole response): ${wiped.status} ${wiped.body.replace(/\s+/g, ' ')}`)
  check('uncomfortable: bob\'s PATCH to delete my answers got a reply', wiped.status > 0)
  console.log(`FINDING bob ${afterWipe.length === 0 ? 'CAN' : 'cannot'} delete my answers (answers of mine the pane can still read: ${afterWipe.length})`)
  await me.page.goto(me.address(POLL))
  await ready(me.page, 3)
  await sleep(2000)
  const finalRows = await rows(me.page)
  console.log('     what me sees now: ' + show(finalRows))
  await me.shot('poll-me-after-bob-tampered')
  await bob.page.close()
  if (process.env.KEEP) console.log('kept: ' + DIR); else rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { if (bob) await bob.page.close().catch(() => {}); await finish(error) }
