// The notepad on the test pod, logged in: make a pad, type lines, Enter, Backspace, pause-to-save,
// someone else's changes (made with direct patches, as a second person would), polling, last write wins,
// a reload, and the file checked the way SolidOS's own pane checks it. Then the layout at 400 px.
//   node tests/pad.mjs          (KEEP=1 keeps the test pad on the pod)
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
const PANE = LAB + 'pad/pad-pane.js'
const NAME = 'pad-test-' + Date.now().toString(36)
const BASE = POD + 'public/suite-data/pad/' + NAME + '/'
const PAD = BASE + 'index.ttl#this'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'pad', NAME)
const disk = () => { try { return readFileSync(path.join(DIR, 'index.ttl'), 'utf8') } catch { return '' } }
const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9521, dir: import.meta.dirname, width: 1300, login: true, resource: POD + 'public/suite-data/pad/' })

const values = () => page.evaluate(() => [...document.querySelectorAll('.npd-line textarea')].map(i => i.value))
const status = () => page.evaluate(() => document.querySelector('.npd-status').textContent)
const onDisk = async (re, what) => { const end = Date.now() + 15000; while (Date.now() < end) { if (re.test(disk())) return true; await sleep(250) } return false }
const settled = () => page.waitFor(() => !document.querySelector('.npd-pending') && /^(Saved|Not saved)/.test(document.querySelector('.npd-status').textContent), { timeout: 20000 })
const focus = (i) => page.evaluate((n) => { const f = document.querySelectorAll('.npd-line textarea')[+n]; f.focus(); f.setSelectionRange(f.value.length, f.value.length) }, String(i))
const key = async (name, code) => { await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, code: name, windowsVirtualKeyCode: code }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code }) }
const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur())
const chunks = () => page.evaluate(() => [...document.querySelectorAll('.npd-line')].map(l => l.dataset.chunk))
// A change made outside this page, as a second person would make it: a SPARQL patch with the logged-in fetch.
const outside = (sparql) => page.evaluate(async (args) => { const [url, body] = JSON.parse(args); const r = await window.SolidLogic.store.fetcher._fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/sparql-update' }, body }); return r.status }, JSON.stringify([BASE + 'index.ttl', sparql]))
// Read the file afresh and check it the way SolidOS's pad widget does (consistencyCheck in solid-ui pad.ts).
const upstreamCheck = () => page.evaluate(async (url) => {
  const $rdf = window.$rdf
  const g = $rdf.graph()
  const fetcher = new $rdf.Fetcher(g, { fetch: window.SolidLogic.store.fetcher._fetch })
  await fetcher.load(url, { force: true })
  const P = (t) => g.sym('http://www.w3.org/ns/pim/pad#' + t)
  const subject = g.sym(url + '#this')
  const problems = []
  const texts = []
  if (!g.holds(subject, g.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), P('Notepad'))) problems.push('not a Notepad')
  if (g.each(subject, P('next')).length !== 1) problems.push('pad has ' + g.each(subject, P('next')).length + ' next')
  const seen = new Set()
  let chunk = g.the(subject, P('next'))
  while (chunk && !chunk.equals(subject)) {
    if (seen.has(chunk.value)) { problems.push('loop'); break }
    seen.add(chunk.value)
    for (const [p, n] of [[P('next'), 1], [g.sym('http://rdfs.org/sioc/ns#content'), 1], [g.sym('http://purl.org/dc/elements/1.1/author'), 1]]) { const k = g.each(chunk, p).length; if (k !== n) problems.push(chunk.value.split('#')[1] + ' has ' + k + ' ' + p.value.split(/[#/]/).pop()) }
    if (g.each(null, P('next'), chunk).length !== 1) problems.push(chunk.value.split('#')[1] + ' is pointed at ' + g.each(null, P('next'), chunk).length + ' times')
    texts.push((g.any(chunk, g.sym('http://rdfs.org/sioc/ns#content')) || { value: '?' }).value)
    chunk = g.the(chunk, P('next'))
  }
  if (!chunk) problems.push('ring not closed')
  return { problems, texts }
}, BASE + 'index.ttl')

try {
  await page.waitFor(() => !!(window.panes && window.panes.byName('notepad')), { timeout: 40000 })
  check('the pane is registered', true)
  check('a folder can make a new notepad with it', await page.evaluate(() => window.panes.list.filter(p => p.mintNew).some(p => p.name === 'notepad' && p.mintClass.value === 'http://www.w3.org/ns/pim/pad#Notepad')))
  await page.evaluate((base) => { window.__mint = null; const store = window.SolidLogic.store; window.panes.byName('notepad').mintNew({ dom: document, session: { store } }, { newBase: base }).then(r => { window.__mint = { ok: r.newInstance.value } }, e => { window.__mint = { error: String(e && e.message ? e.message : e) } }) }, BASE)
  await page.waitFor(() => !!window.__mint, { timeout: 30000 })
  const made = await page.evaluate(() => window.__mint)
  check('a new notepad is created', made.ok === PAD, JSON.stringify(made))
  check('the pod file is in the upstream format: a Notepad with one empty line in the ring', /pad#Notepad|pad:Notepad/.test(disk()) && /this_line0/.test(disk()) && /Shared Notes/.test(disk()))
  check('no access rule was written', !existsSync(path.join(DIR, 'index.ttl.acl')))
  let up = await upstreamCheck()
  check('SolidOS\'s own check accepts the new pad', !up.problems.length && up.texts.length === 1, up.problems.join('; '))

  await page.goto(address(PAD))
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 1, { timeout: 40000 })
  await sleep(1000)
  check('it opens with its title and one line to type in', (await page.evaluate(() => document.querySelector('.npd-title').textContent)) === 'Shared Notes')

  await focus(0); await page.type('Hello world'); await blur(); await settled()
  check('type a line and leave it: saved', (await status()) === 'Saved' && await onDisk(/Hello world/), await status())

  await focus(0); await key('Enter', 13)
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 2 && document.activeElement === document.querySelectorAll('.npd-line textarea')[1], { timeout: 15000 })
  check('Enter makes a new line after it and moves there', true)
  await page.type('Second line'); await sleep(2600)
  check('pause typing: the line saves without leaving it', await onDisk(/Second line/) && (await status()) === 'Saved', await status())
  await key('Enter', 13)
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 3, { timeout: 15000 })
  await page.type('Third')
  await key('Enter', 13)
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 4 && document.activeElement === document.querySelectorAll('.npd-line textarea')[3], { timeout: 15000 })
  await settled()
  await key('Backspace', 8)
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 3, { timeout: 15000 })
  await settled()
  check('Backspace on an empty line removes it and goes to the line before', (await values()).join('|') === 'Hello world|Second line|Third' && await page.evaluate(() => document.activeElement === document.querySelectorAll('.npd-line textarea')[2]), (await values()).join('|'))
  up = await upstreamCheck()
  check('the file still passes SolidOS\'s check, lines in order', !up.problems.length && up.texts.join('|') === 'Hello world|Second line|Third', up.problems.join('; ') + ' :: ' + up.texts.join('|'))
  check('my participation and colour are recorded', /participant/.test(disk()) && /backgroundColor/.test(disk()))
  const meta = await page.evaluate(() => document.querySelector('.npd-meta').textContent)
  check('it counts the lines and says who wrote last', /3 lines · last written by /.test(meta), meta)
  await blur()

  // Someone else changes line 1 and adds a line at the end, while I am typing in line 2.
  const [c1, c2, c3] = await chunks()
  await focus(1); await page.type(' (editing)')
  const s1 = await outside(`DELETE DATA { <${c1}> <http://rdfs.org/sioc/ns#content> "Hello world" . <${c3}> <http://www.w3.org/ns/pim/pad#next> <${PAD}> . } ;
INSERT DATA { <${c1}> <http://rdfs.org/sioc/ns#content> "Changed elsewhere" . <${c3}> <http://www.w3.org/ns/pim/pad#next> <${BASE}index.ttl#bob1> .
  <${BASE}index.ttl#bob1> <http://www.w3.org/ns/pim/pad#next> <${PAD}> ; <http://rdfs.org/sioc/ns#content> "From Bob" ; <http://purl.org/dc/elements/1.1/author> <https://bob.example/profile/card#me> . }`)
  check('(a change made by someone else is on the pod)', s1 < 300, String(s1))
  await page.evaluate(() => { document.querySelector('.npd').dataset.mark = 'x' })
  await page.evaluate(() => [...document.querySelectorAll('.npd button')].find(b => (b.getAttribute('aria-label') || b.textContent) === 'Refresh').click())
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 4, { timeout: 15000 })
  let v = await values()
  check('Refresh: their changes show up, and the line I am typing in is left alone', v.join('|') === 'Changed elsewhere|Second line (editing)|Third|From Bob', v.join('|'))
  check('their line joins the legend', await page.evaluate(() => [...document.querySelectorAll('.npd-who')].some(w => /bob\.example/.test(w.textContent))))
  await blur(); await settled()
  check('my line saves on top of their change; both are kept', await onDisk(/Second line \(editing\)/) && /Changed elsewhere/.test(disk()) && /From Bob/.test(disk()))

  // Polling: a change made elsewhere arrives without pressing anything.
  await outside(`DELETE DATA { <${c3}> <http://rdfs.org/sioc/ns#content> "Third" . } ; INSERT DATA { <${c3}> <http://rdfs.org/sioc/ns#content> "Polled in" . }`)
  const polled = await page.waitFor(() => document.querySelectorAll('.npd-line textarea')[2].value === 'Polled in', { timeout: 16000 }).catch(() => false)
  check('within ten seconds the page picks up a change made elsewhere', !!polled, (await values()).join('|'))

  // The same line changed by both: the last one saved wins.
  await focus(2); await page.type(' mine')
  await outside(`DELETE DATA { <${c3}> <http://rdfs.org/sioc/ns#content> "Polled in" . } ; INSERT DATA { <${c3}> <http://rdfs.org/sioc/ns#content> "Theirs" . }`)
  await blur(); await settled()
  check('same line changed by both: mine, saved last, wins', (await status()) === 'Saved' && await onDisk(/Polled in mine/) && !/"Theirs"/.test(disk()), await status())
  up = await upstreamCheck()
  check('after all that, SolidOS\'s check still passes', !up.problems.length && up.texts.join('|') === 'Changed elsewhere|Second line (editing)|Polled in mine|From Bob', up.problems.join('; ') + ' :: ' + up.texts.join('|'))

  await page.goto(address(PAD))
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 4, { timeout: 40000 })
  await sleep(2000)
  v = await values()
  check('after a reload it reads back the same', v.join('|') === 'Changed elsewhere|Second line (editing)|Polled in mine|From Bob', v.join('|'))
  console.log('     ' + await page.evaluate(() => document.querySelector('.npd-meta').textContent))
  console.log('     ' + await page.evaluate(() => [...document.querySelectorAll('.npd-who')].map(w => w.textContent).join(' ; ')))
  // SolidOS's own pad pane (bundled in the browser) draws the same file: same lines, same order.
  const theirs = await page.evaluate(async (uri) => {
    const upstream = window.panes.byName('pad')
    if (!upstream) return 'no upstream pad pane'
    const store = window.SolidLogic.store
    const box = document.body.appendChild(document.createElement('div'))
    box.id = 'upstreamPad'
    box.appendChild(upstream.render(store.sym(uri), { dom: document, session: { store, paneRegistry: window.panes } }, {}))
    for (let i = 0; i < 50 && box.querySelectorAll('table input[type=text]').length < 4; i++) await new Promise(r => setTimeout(r, 200))
    const texts = [...box.querySelectorAll('table input[type=text]')].map(i => i.value).join('|')
    box.remove()
    return texts
  }, PAD)
  check('SolidOS\'s own pad pane shows the same lines in the same order', theirs === 'Changed elsewhere|Second line (editing)|Polled in mine|From Bob', theirs)
  // Text that JSS's PATCH loses (finding 5: a "}" in a literal, or "PREFIX …"): saved whole, confirmed by a read-back.
  for (const tricky of ['if (x) { y }', 'PREFIX x: <http://example.org/> and } more']) {
    await page.evaluate((t) => { const f = document.querySelectorAll('.npd-line textarea')[3]; f.focus(); f.value = t; f.dispatchEvent(new Event('input', { bubbles: true })); f.blur() }, tricky)
    await settled()
    up = await upstreamCheck()
    check('a line with ' + JSON.stringify(tricky) + ': "Saved", and the pod really holds it (one text per line)', (await status()) === 'Saved' && !up.problems.length && up.texts[3] === tricky, (await status()) + ' :: ' + up.problems.join('; ') + ' :: ' + up.texts[3])
  }
  // A pod that answers 204 but keeps nothing: the pane must not say "Saved".
  await page.evaluate(() => {
    window.__orig = window.fetch
    window.fetch = (url, init) => (init && init.method === 'PUT') || (url && url.method === 'PUT') ? Promise.resolve(new Response(null, { status: 204 })) : window.__orig(url, init)
  })
  await page.evaluate(() => { const f = document.querySelectorAll('.npd-line textarea')[3]; f.focus(); f.value = 'Never kept'; f.dispatchEvent(new Event('input', { bubbles: true })); f.blur() })
  await settled()
  const lost = await status()
  await page.evaluate(() => { window.fetch = window.__orig })
  check('a save the pod answers but does not keep: "Not saved", not "Saved"', /^Not saved: line: the pod did not keep it/.test(lost) && !/Never kept/.test(disk()), lost)

  // A pad with no lines at all: nothing is written on opening; "Start writing" adds the first line.
  writeFileSync(path.join(DIR, 'empty.ttl'), '@prefix pad: <http://www.w3.org/ns/pim/pad#>.\n<#this> a pad:Notepad; pad:next <#this>.\n')
  await page.goto(address(BASE + 'empty.ttl#this'))
  await page.waitFor(() => !!document.querySelector('.npd-empty button'), { timeout: 40000 })
  await sleep(1500)
  const untouched = /^@prefix/.test(readFileSync(path.join(DIR, 'empty.ttl'), 'utf8'))
  await page.evaluate(() => document.querySelector('.npd-empty button').click())
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 1 && document.activeElement === document.querySelector('.npd-line textarea'), { timeout: 15000 })
  check('an empty pad is not written to on opening; Start writing adds its first line', untouched && /content/.test(readFileSync(path.join(DIR, 'empty.ttl'), 'utf8')))
  await page.goto(address(PAD))
  await page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 4, { timeout: 40000 })
  await sleep(1000)
  check('no sideways scroll at 1300 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await focus(1)
  await shot('pad-1300')
  await narrow(page, 400) // a true 400 px page (design/viewport.mjs, CDP device metrics)
  await sleep(500)
  const m = await measure(page)
  check('no sideways scroll at a true 400 px', m.innerWidth === 400 && !m.sideways && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), m.poking.join(' '))
  await shot('pad-400')
  if (process.env.KEEP) console.log('kept: ' + PAD); else rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { await finish(error) }
