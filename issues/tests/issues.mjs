// The issues pane on the local test pod, logged in: make a tracker from the Add menu's code, add issues,
// move, edit, assign, unassign, reload, open one issue, check SolidOS's own pane still reads it, then
// look at it logged out and at 400 px. Removes the tracker at the end (KEEP=1 keeps it).
//   node tests/issues.mjs
import { open, config, LAB, sleep } from '../../lib/lib.mjs'
import { readFileSync, existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { narrow, measure } from '../../design/viewport.mjs'

const PANE = LAB + 'issues/issues-pane.js'
const NAME = 'tracker-' + Date.now().toString(36)
const FOLDER = config.pod + 'public/suite-data/issues/'
const BASE = FOLDER + NAME + '/'
const TRACKER = BASE + 'index.ttl#this'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'issues', NAME)
mkdirSync(path.dirname(DIR), { recursive: true })
const disk = (f) => readFileSync(path.join(DIR, f), 'utf8')
// The pod keeps a file the pane wrote as JSON-LD: read it as data, not as text.
const graph = (f) => { const j = JSON.parse(disk(f)); return Array.isArray(j) ? j : (j['@graph'] || [j]) }
const node = (f, end) => graph(f).find(n => (n['@id'] || '').endsWith(end)) || {}
const values = (n, name) => { const k = Object.keys(n).find(x => x.split(/[#:/]/).pop() === name); return k ? [].concat(n[k]).map(v => typeof v === 'object' ? (v['@id'] || v['@value']) : v) : [] }
const typesOf = (n) => [].concat(n['@type'] || [])

const opened = await open({ pane: PANE, port: 9517, dir: import.meta.dirname, resource: FOLDER })
const { page, shot, address } = opened
let failures = 0
const check = (name, ok, detail) => { if (!ok) failures++; opened.check(name, ok, detail) }
const done = (error) => { if (error) { failures++; console.log('FAIL ' + (error && error.message ? error.message : error)) } console.log(failures ? `\n${failures} failure(s)` : '\nall passed'); process.exit(failures ? 1 : 0) }
// Done when nothing is disabled and the status has spoken; the data browser may redraw the pane after a change (a fresh pane has an empty status), so an empty status also counts.
const settled = async () => { await sleep(300); await page.waitFor(() => !!document.querySelector('.iss-msg') && !document.querySelector('.iss button:disabled, .iss select:disabled') && ['good', 'bad', '', undefined].includes(document.querySelector('.iss-msg').dataset.kind), { timeout: 30000 }); await sleep(300) }
const status = () => page.evaluate(() => (document.querySelector('.iss-msg').dataset.kind || '') + ' :: ' + document.querySelector('.iss-msg').textContent)
const board = () => page.evaluate(() => [...document.querySelectorAll('.iss-col')].map(c => c.querySelector('.iss-col-name').textContent + ' ' + c.querySelector('.iss-count').textContent + ': ' + [...c.querySelectorAll('.iss-card')].map(k => k.querySelector('.iss-card-title').textContent + ' ' + k.querySelector('.iss-who').textContent).join(' / ')).join(' | '))
const cardId = (title) => page.evaluate((t) => { const c = [...document.querySelectorAll('.iss-card')].find(k => k.querySelector('.iss-card-title') && k.querySelector('.iss-card-title').textContent === t); return c ? c.dataset.issue : '' }, title)
const onCard = (title, script) => page.evaluate(`(() => { const card = [...document.querySelectorAll('.iss-card')].find(k => k.querySelector('.iss-card-title') && k.querySelector('.iss-card-title').textContent === ${JSON.stringify(title)}); ${script} })()`)

try {
  await page.waitFor(() => !!(window.panes && window.panes.byName('issues')), { timeout: 40000 })
  check('the pane is registered', true)
  check('it is among the panes a folder can make new things with', await page.evaluate(() => window.panes.list.filter(p => p.mintNew).some(p => p.name === 'issues')))
  await page.evaluate((base) => { window.__mint = null; const store = (window.UI && window.UI.store) || window.SolidLogic.store; window.panes.byName('issues').mintNew({ dom: document, session: { store } }, { newBase: base, title: 'Kitchen' }).then(r => { window.__mint = { ok: r.newInstance.value } }, e => { window.__mint = { error: String(e && e.message ? e.message : e) } }) }, BASE)
  await page.waitFor(() => !!window.__mint, { timeout: 30000 })
  const made = await page.evaluate(() => window.__mint)
  check('a new tracker is made', made.ok === TRACKER, JSON.stringify(made))
  check('two files on the pod and no access rules', existsSync(DIR) && readdirSync(DIR).sort().join(' ') === 'index.ttl state.ttl', existsSync(DIR) ? readdirSync(DIR).join(' ') : 'no folder')

  await page.goto(address(TRACKER))
  await page.waitFor(() => document.querySelectorAll('.iss-col').length === 3 && !!document.querySelector('.iss-new'), { timeout: 40000 })
  check('it opens as a board with three empty states and the tools to change it', (await board()) === 'To do 0:  | Doing 0:  | Done 0: ', await board())

  const add = async (title, description) => {
    await page.evaluate(() => document.querySelector('.iss-new').click())
    await page.evaluate((v) => { const [t, d] = JSON.parse(v); const f = document.querySelector('.iss-new-form'); f.querySelector('input').value = t; f.querySelector('textarea').value = d; f.requestSubmit() }, JSON.stringify([title, description]))
    await settled()
  }
  await add('Fix the tap', 'It drips at night.')
  check('new issue: saved', /To do 1: Fix the tap/.test(await board()), await board())
  await add('Paint the wall', '')
  await page.evaluate(() => { document.querySelector('.iss-new').click() })
  await page.evaluate(() => document.querySelector('.iss-new-form').requestSubmit())
  await sleep(300)
  check('a new issue with no title is refused', /bad :: Give it a title/.test(await status()), await status())
  await page.evaluate(() => [...document.querySelectorAll('.iss-new-form button')].find(b => b.textContent === 'Cancel').click())
  check('Cancel clears the error line', (await status()) === ' :: ', await status())
  check('new issues go in the first state, newest first', (await board()) === 'To do 2: Paint the wall Unassigned / Fix the tap Unassigned | Doing 0:  | Done 0: ', await board())
  const tap = await cardId('Fix the tap')
  const tapEnd = '#' + tap.split('#').pop()
  const saved = node('state.ttl', tapEnd)
  check('the pod has the issue in the upstream shape', /#Iss\d+$/.test(tap) && typesOf(saved).some(t => /#ToDo$/.test(t)) && values(saved, 'title').includes('Fix the tap') && values(saved, 'description').includes('It drips at night.') && values(saved, 'tracker').some(v => /index\.ttl#this$/.test(v)) && values(saved, 'created').length === 1, JSON.stringify(saved).slice(0, 400))

  await onCard('Fix the tap', `const s = card.querySelector('.iss-move'); s.value = [...s.options].find(o => /Doing/.test(o.textContent)).value; s.dispatchEvent(new Event('change'))`)
  await settled()
  check('move to another state: shown', /To do 1: Paint the wall/.test(await board()) && /Doing 1: Fix the tap/.test(await board()), await board())
  check('move: the pod file has the new state and not the old', typesOf(node('state.ttl', tapEnd)).some(t => /#Doing$/.test(t)) && !typesOf(node('state.ttl', tapEnd)).some(t => /#ToDo$/.test(t)), JSON.stringify(typesOf(node('state.ttl', tapEnd))))

  await onCard('Fix the tap', `card.querySelector('.iss-edit').click()`)
  await page.evaluate(() => { const f = document.querySelector('.iss-card form'); f.querySelector('input').value = 'Fix the kitchen tap'; f.querySelector('textarea').value = 'It drips at night.\nNeeds a new washer.'; f.requestSubmit() })
  await settled()
  check('edit title and description: shown', /Doing 1: Fix the kitchen tap/.test(await board()), await board())
  const edited = node('state.ttl', tapEnd)
  check('edit: the pod file has the new text, once', values(edited, 'title').join() === 'Fix the kitchen tap' && values(edited, 'description').join() === 'It drips at night.\nNeeds a new washer.', JSON.stringify(edited).slice(0, 300))

  await onCard('Paint the wall', `card.querySelector('.iss-take').click()`)
  await settled()
  const me = await page.evaluate(() => { const a = (window.SolidLogic && window.SolidLogic.authn) || window.UI.authn; return a.currentUser().value })
  check('assign to me: saved in the pod file', values(node('state.ttl', '#' + (await cardId('Paint the wall')).split('#').pop()), 'assignee').join() === me, me)
  await sleep(1500)
  const who = await onCard('Paint the wall', `return card.querySelector('.iss-who').textContent + '|' + !!card.querySelector('.iss-take') + '|' + !!card.querySelector('.iss-drop')`)
  check('assign to me: the card names me and offers to unassign', /^(?!Unassigned)\S/.test(who) && /\|false\|true$/.test(who), who)
  await onCard('Paint the wall', `card.querySelector('.iss-drop').click()`)
  await settled()
  check('unassign: gone from the card and the pod file', /Paint the wall Unassigned/.test(await board()) && values(node('state.ttl', '#' + (await cardId('Paint the wall')).split('#').pop()), 'assignee').length === 0, await board())
  await onCard('Paint the wall', `card.querySelector('.iss-take').click()`)
  await settled()

  await page.goto(address(TRACKER))
  await page.waitFor(() => document.querySelectorAll('.iss-card').length === 2, { timeout: 40000 })
  await sleep(1500)
  const after = await board()
  check('after a reload it reads back the same', /^To do 1: Paint the wall (?!Unassigned)\S.* \| Doing 1: Fix the kitchen tap Unassigned \| Done 0: $/.test(after), after)
  console.log('     ' + after)
  check('no sideways scroll at 1300 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await shot('tracker-1300')

  // One issue on its own: move it, edit it, then follow the link back.
  await page.goto(address(tap))
  await page.waitFor(() => !!document.querySelector('.iss-one .iss-move'), { timeout: 40000 })
  await sleep(800)
  check('one issue opens in full, with its controls', await page.evaluate(() => document.querySelector('.iss-title').textContent === 'Fix the kitchen tap' && /Needs a new washer/.test(document.querySelector('.iss-one .iss-desc').textContent) && /Doing/.test(document.querySelector('.iss-state').textContent)))
  await page.evaluate(() => { const s = document.querySelector('.iss-one .iss-move'); s.value = [...s.options].find(o => /Done/.test(o.textContent)).value; s.dispatchEvent(new Event('change')) })
  await settled()
  check('move from the issue page: saved', /Done/.test(await page.evaluate(() => document.querySelector('.iss-state').textContent)) && typesOf(node('state.ttl', tapEnd)).some(t => /#Done$/.test(t)))
  await page.evaluate(() => document.querySelector('.iss-one .iss-edit').click())
  await page.evaluate(() => { const f = document.querySelector('.iss-one form'); f.querySelector('input').value = 'Fixed the kitchen tap'; f.requestSubmit() })
  await settled()
  check('edit from the issue page: saved', (await page.evaluate(() => document.querySelector('.iss-title').textContent)) === 'Fixed the kitchen tap' && values(node('state.ttl', tapEnd), 'title').join() === 'Fixed the kitchen tap')
  await shot('issue-1300')
  await page.evaluate(() => document.querySelector('.iss-back').click())
  await page.waitFor(() => document.querySelectorAll('.iss-col').length === 3, { timeout: 30000 })
  check('the link goes back to the board', /Done 1: Fixed the kitchen tap/.test(await board()), await board())

  // Review fixes. Braces in text (JSS finding 5): saved exactly, checked in the pod file.
  await onCard('Paint the wall', `card.querySelector('.iss-edit').click()`)
  await page.evaluate(() => { const f = document.querySelector('.iss-card form'); f.querySelector('input').value = 'Use {braces} here'; f.querySelector('textarea').value = 'a } b'; f.requestSubmit() })
  await settled()
  const wallEnd = '#' + (await cardId('Use {braces} here')).split('#').pop()
  check('edit with braces: "Saved." (or the pane redrawn) and the pod file has the new title and description', /^(good :: Saved| :: $)/.test(await status()) && values(node('state.ttl', wallEnd), 'title').join() === 'Use {braces} here' && values(node('state.ttl', wallEnd), 'description').join() === 'a } b', (await status()) + ' ' + JSON.stringify(node('state.ttl', wallEnd)))
  await add('Brace } new', 'x { y } z')
  const braceEnd = '#' + (await cardId('Brace } new')).split('#').pop()
  check('new issue with braces: "Added" and it is in the pod file as typed', /^good :: Added/.test(await status()) && braceEnd.length > 1 && values(node('state.ttl', braceEnd), 'title').join() === 'Brace } new' && values(node('state.ttl', braceEnd), 'description').join() === 'x { y } z', await status())
  // A save that fails keeps the form and what was typed.
  await onCard('Brace } new', `card.querySelector('.iss-edit').click()`)
  await page.evaluate(() => {
    const real = window.fetch
    window.fetch = (url, init) => { if (((init && init.method) || (url && url.method)) === 'PATCH') { window.fetch = real; return Promise.resolve(new Response('no', { status: 500, statusText: 'Server Error' })) } return real(url, init) }
    const form = document.querySelector('.iss-card form'); form.querySelector('input').value = 'Typed and lost?'; form.querySelector('textarea').value = 'Keep me.'; form.requestSubmit()
  })
  await settled()
  const kept = await page.evaluate(() => { const f = document.querySelector('.iss-card form'); return f ? f.querySelector('input').value + '|' + f.querySelector('textarea').value : 'no form' })
  check('a failed save says so and keeps the form with what was typed', /^bad :: Not saved/.test(await status()) && kept === 'Typed and lost?|Keep me.', (await status()) + ' / ' + kept)
  await page.evaluate(() => { [...document.querySelectorAll('.iss-card form button')].find(b => b.textContent === 'Cancel').click() })
  check('the pod file still has the old title', values(node('state.ttl', braceEnd), 'title').join() === 'Brace } new')
  // A 409 from the pod: a plain message, and the board is read again.
  await page.evaluate(() => {
    const real = window.fetch
    window.fetch = (url, init) => { if (((init && init.method) || (url && url.method)) === 'PATCH') { window.fetch = real; return Promise.resolve(new Response('', { status: 409, statusText: 'Conflict' })) } return real(url, init) }
  })
  await onCard('Brace } new', `const s = card.querySelector('.iss-move'); s.value = [...s.options].find(o => /Doing/.test(o.textContent)).value; s.dispatchEvent(new Event('change'))`)
  await settled()
  check('a conflict (409): a plain message, the card stays where the pod has it', /^bad :: Someone else changed this/.test(await status()) && /To do \d+: .*Brace \} new/.test(await board()), (await status()) + ' / ' + await board())
  // A very long title is cut short on its card; a non-http assignee is "Unknown person".
  const long = 'A very long title '.repeat(10).trim()
  await add(long, '')
  const longId = await page.evaluate(() => [...document.querySelectorAll('.iss-card')].find(k => /^A very long/.test(k.querySelector('.iss-card-title').textContent)).dataset.issue)
  check('a long title is cut short on its card', await page.evaluate((id) => { const t = document.querySelector('.iss-card[data-issue="' + id + '"] .iss-card-title').textContent; return t.length <= 120 && t.endsWith('…') }, longId))
  await page.evaluate(async (id) => { await window.SolidLogic.store.fetcher._fetch(id.split('#')[0], { method: 'PATCH', headers: { 'Content-Type': 'text/n3' }, body: '@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n_:p a solid:InsertDeletePatch; solid:inserts { <' + id + '> <http://www.w3.org/2005/01/wf/flow#assignee> <javascript:alert(2)> . }.' }) }, longId)
  await page.evaluate(() => document.querySelector('.iss-refresh').click())
  await settled()
  check('an assignee that is not a web address shows as "Unknown person"', await page.evaluate((id) => document.querySelector('.iss-card[data-issue="' + id + '"] .iss-who').textContent, longId) === 'Unknown person', await page.evaluate((id) => document.querySelector('.iss-card[data-issue="' + id + '"] .iss-who').textContent, longId))

  // SolidOS's own issue pane on what this pane wrote.
  const upstream = await page.evaluate(`(async () => {
    const issue = window.panes.byName('issue'); if (!issue) return 'not registered'
    const store = window.SolidLogic.store
    const t = store.sym(${JSON.stringify(TRACKER)}); const i = store.sym(${JSON.stringify(tap)})
    let asked = ''; window.confirm = (m) => { asked = m; return false }
    const div = issue.render(t, { dom: document, session: { store, paneRegistry: window.panes }, getOutliner: () => null })
    div.id = 'upstream-check'; div.style.display = 'none'; document.body.appendChild(div)
    for (let n = 0; n < 40 && !div.querySelector('.trackerBoardTable, table, [role=tablist]'); n++) await new Promise(r => setTimeout(r, 250))
    const errorText = [...div.querySelectorAll('[class*=rror]')].map(e => e.textContent.trim()).filter(Boolean).join(' / ')
    return issue.label(t) + ' ' + issue.label(i) + ' | ' + (errorText || (asked ? 'asked: ' + asked : 'no errors')) + ' | ' + div.textContent.replace(/\\s+/g, ' ').slice(0, 160)
  })()`)
  check('SolidOS\'s own issue pane reads the tracker and the issue with no errors', /^tracker issue \| no errors/.test(upstream), upstream)

  check('no sideways scroll on the issue page', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.close()

  // The same tracker at 400 px, still logged in.
  {
    const { page, shot: shot4 } = await open({ pane: PANE, port: 9517, dir: import.meta.dirname, width: 400, login: false, fresh: false, resource: TRACKER })
    await page.waitFor(() => document.querySelectorAll('.iss-card').length === 4 && !!document.querySelector('.iss-new'), { timeout: 40000 })
    await sleep(1200)
    check('400 px, logged in: the tools are there and there is no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.iss-col')].filter(c => c.offsetParent).length === 1 && !!document.querySelector('.iss-col.iss-active .iss-move')))
    await page.evaluate(() => document.querySelector('.iss-new').click())
    await sleep(300)
    check('400 px: the new issue form fits', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && !!document.querySelector('.iss-new-form')))
    await narrow(page)
    await sleep(400)
    const m4 = await measure(page)
    check('true 400 px (device metrics), form open: no sideways scroll, one column shown', !m4.sideways && (await page.evaluate(() => [...document.querySelectorAll('.iss-col')].filter(c => c.offsetParent).length)) === 1, JSON.stringify(m4))
    await shot4('tracker-400-form')
    await page.evaluate(() => [...document.querySelectorAll('.iss-new-form button')].find(b => b.textContent === 'Cancel').click())
    await shot4('tracker-400')
    await page.close()
  }

  // Logged out: it reads, offers nothing to change, and says why.
  {
    const { page } = await open({ pane: PANE, port: 9517, dir: import.meta.dirname, login: false, fresh: true, resource: TRACKER })
    await page.waitFor(() => document.querySelectorAll('.iss-card').length === 4, { timeout: 40000 })
    await sleep(1000)
    const out = await page.evaluate(() => document.querySelectorAll('.iss-move, .iss-new, .iss-edit, .iss-take, .iss-drop').length + ' ' + document.querySelector('.iss-msg').textContent)
    check('logged out: the board reads, with no controls, and it says so', /^0 Log in to add or change issues\.$/.test(out), out)
    await page.close()
  }

  if (process.env.KEEP) console.log('kept: ' + TRACKER); else rmSync(DIR, { recursive: true, force: true })
  done()
} catch (error) { await shot('error'); await page.close().catch(() => {}); done(error) }
