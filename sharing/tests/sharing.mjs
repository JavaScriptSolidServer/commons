// The sharing pane on the test pod, logged in. Every change is made ONLY inside suite-data/sharing/.
//   node tests/sharing.mjs
// A file that inherits; giving it its own rules changes nothing; everyone can view (seen logged out);
// taken back; a person added, refused when not a WebID, removed; the no-owner guard; going back to
// inherited; losing your own control needs a second click; a folder with group and app rules kept as they are.
import './free-ports.mjs'
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { reset, disk, BASE, ME } from './setup.mjs'
import { openSharing as openPane } from './open-sharing.mjs'

const PANE = LAB + 'sharing/sharing-pane.js'
const NOTE = BASE + 'note.ttl'
const PUBLIC_KEY = 'public http://xmlns.com/foaf/0.1/Agent'
const ME_KEY = 'agent ' + ME
const BOB = 'https://bob.example/profile/card#me'
reset()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9527, dir: import.meta.dirname, login: true, resource: NOTE })

const loggedOut = async (uri) => (await fetch(uri, { cache: 'no-store' })).status
const ready = () => page.waitFor(() => { const r = document.querySelector('.shr.sharing-lab-pane'); return !!r && r.dataset.state && !['busy', 'loading'].includes(r.dataset.state) }, { timeout: 70000 })
async function openSharing (uri) { await openPane(page, address(uri)) }
const view = () => page.evaluate(() => {
  const r = document.querySelector('.shr.sharing-lab-pane')
  return {
    state: r.dataset.state,
    status: r.querySelector('.shr-status').className + ' :: ' + r.querySelector('.shr-status').textContent,
    source: (r.querySelector('.shr-source') || {}).textContent || '',
    rows: [...r.querySelectorAll('.shr-list:not(.shr-extra) > .shr-row:not(.shr-readonly)')].map(row => row.dataset.key + ' = ' + (row.querySelector('select') ? row.querySelector('select').value : row.querySelector('.shr-level').textContent)),
    readOnly: [...r.querySelectorAll('.shr-readonly')].map(row => row.textContent),
    review: (r.querySelector('.shr-review') || {}).textContent || '',
    summary: [...r.querySelectorAll('.shr-summary li')].map(li => li.textContent),
    confirm: (r.querySelector('.shr-confirm') || {}).textContent || '',
    blocked: (r.querySelector('.shr-blocked') || {}).textContent || '',
    wide: document.documentElement.scrollWidth > innerWidth
  }
})
const setLevel = (key, level) => page.evaluate((v) => { const [k, l] = JSON.parse(v); const s = [...document.querySelectorAll('.shr-row')].find(r => r.dataset.key === k).querySelector('select'); s.value = l; s.dispatchEvent(new Event('change')) }, JSON.stringify([key, level]))
const clickText = (text) => page.evaluate((t) => { const b = [...document.querySelectorAll('.shr button')].find(x => x.textContent.trim() === t); if (!b) throw new Error('no button ' + t); b.click() }, text)
const confirm = async () => { await page.evaluate(() => document.querySelector('.shr-confirm').click()); await sleep(300); await ready() }
const addPerson = (webId, level) => page.evaluate((v) => { const [w, l] = JSON.parse(v); const f = document.querySelector('.shr-add'); f.querySelector('input').value = w; f.querySelector('select').value = l; f.requestSubmit() }, JSON.stringify([webId, level]))

try {
  // 1. A file that inherits.
  await openSharing(NOTE)
  let v = await view()
  check('a file with no rules of its own says it follows its folder', v.state === 'inherited' && /follows the rules of the folder sharing\//.test(v.source), v.source)
  check('the owner is listed as owner', v.rows.length === 1 && v.rows[0].startsWith(ME_KEY) && /owner/.test(v.rows[0]), v.rows.join(' ; '))
  check('nobody else: logged out, the file cannot be read', [401, 403].includes(await loggedOut(NOTE)))
  check('no rules file yet on the pod', disk('note.ttl.acl') === null)
  await shot('inherited-1300')

  // 2. Give it its own rules: a copy, so nothing changes.
  await clickText('Give it its own rules')
  v = await view()
  check('it explains that nothing changes before making the copy', /Nothing changes/.test(v.review) && v.confirm === 'Make its own rules', v.review.slice(0, 120))
  check('nothing is written before the click', disk('note.ttl.acl') === null)
  await confirm()
  v = await view()
  const own = disk('note.ttl.acl') || ''
  check('own rules: saved and said so', v.state === 'own' && /shr-good/.test(v.status) && /the same as before/.test(v.status), v.status)
  check('own rules: the file on the pod has the owner with control, for this file', own.includes(ME) && /Control/.test(own) && own.includes(NOTE), own.slice(0, 200))
  check('own rules: the same people with the same levels', v.rows.length === 3 && v.rows[0] === ME_KEY + ' = owner' && v.rows.slice(1).every(r => / = none$/.test(r)), v.rows.join(' ; '))
  check('own rules: in effect nothing changed (still private logged out)', [401, 403].includes(await loggedOut(NOTE)))

  // 3. Everyone can view: the summary first, then the save, then a logged-out read works.
  await setLevel(PUBLIC_KEY, 'view')
  v = await view()
  check('an unsaved change is marked and nothing is written yet', /1 change, not saved yet/.test(await page.evaluate(() => (document.querySelector('.shr-pending') || {}).textContent || '')) && !/foaf\/0\.1\/Agent/.test(disk('note.ttl.acl')))
  await clickText('Review and save')
  v = await view()
  check('the summary says it plainly: Everyone can now view', v.summary.length === 1 && v.summary[0] === 'Everyone can now view', v.summary.join(' | '))
  await confirm()
  v = await view()
  check('saved, and the pane shows what the server now has', /shr-good/.test(v.status) && /server now has/.test(v.status) && v.rows.includes(PUBLIC_KEY + ' = view'), v.status + ' :: ' + v.rows.join(' ; '))
  check('the pod file gives everyone Read', /xmlns\.com\/foaf\/0\.1\/Agent/.test(disk('note.ttl.acl')))
  check('logged out, the file can now be read', await loggedOut(NOTE) === 200)

  // 4. A reload reads back the same.
  await openSharing(NOTE)
  v = await view()
  check('after a reload: own rules, everyone can view, you are owner', v.state === 'own' && v.rows.includes(PUBLIC_KEY + ' = view') && v.rows.includes(ME_KEY + ' = owner'), v.rows.join(' ; '))

  // 5. Take it back.
  await setLevel(PUBLIC_KEY, 'none')
  await clickText('Review and save')
  v = await view()
  check('the summary says everyone loses access', /^Everyone can no longer see or change it \(could view\)$/.test(v.summary[0] || ''), v.summary.join(' | '))
  await confirm()
  check('taken back: logged out, it cannot be read again', [401, 403].includes(await loggedOut(NOTE)))
  check('taken back: the pod file no longer names everyone', !/xmlns\.com\/foaf\/0\.1\/Agent/.test(disk('note.ttl.acl')))

  // 6. Add a person: a bad WebID is refused; a good one shows up as new, then is saved, then removed.
  await addPerson('bob', 'edit')
  v = await view()
  check('a WebID that is not an address is refused', /shr-bad/.test(v.status) && /not a web address/.test(v.status), v.status)
  await addPerson('http://bob.example/profile/card#me', 'edit')
  v = await view()
  check('a WebID that is not https is refused', /shr-bad/.test(v.status) && /https/.test(v.status), v.status)
  await addPerson(BOB, 'edit')
  v = await view()
  check('a good WebID joins the list as new, not saved yet', v.rows.includes('agent ' + BOB + ' = edit') && /not saved yet/.test(v.status) && !disk('note.ttl.acl').includes('bob.example'), v.rows.join(' ; '))
  await clickText('Review and save')
  v = await view()
  check('the summary names the WebID: can now edit (the profile does not load, so no name)', v.summary[0] === BOB + ' can now edit', v.summary.join(' | '))
  await confirm()
  const withBob = disk('note.ttl.acl')
  check('saved: Bob is in the pod file with Write, the owner is still there', withBob.includes(BOB) && /Write/.test(withBob) && withBob.includes(ME))
  await page.evaluate((k) => [...document.querySelectorAll('.shr-row')].find(r => r.dataset.key === k).querySelector('.shr-quiet').click(), 'agent ' + BOB)
  await clickText('Review and save')
  v = await view()
  check('removing: the summary says Bob loses access', /can no longer see or change it \(could edit\)/.test(v.summary[0] || ''), v.summary.join(' | '))
  await confirm()
  check('removed: Bob is gone from the pod file', !disk('note.ttl.acl').includes('bob.example'))

  // 7. The no-owner guard: removing the only owner is refused, and nothing is written.
  const before = disk('note.ttl.acl')
  await page.evaluate((k) => [...document.querySelectorAll('.shr-row')].find(r => r.dataset.key === k).querySelector('.shr-quiet').click(), ME_KEY)
  await clickText('Review and save')
  v = await view()
  check('no owner left: refused with a reason, and no save button', /nobody as owner/.test(v.blocked) && !v.confirm, v.blocked)
  await shot('no-owner-1300')
  check('no owner left: the pod file is unchanged', disk('note.ttl.acl') === before)
  await clickText('Back')
  await clickText('Undo changes')

  // 8. Go back to inherited: two clicks, the rules file is deleted, the folder rules show again.
  await clickText('Go back to inherited rules')
  await ready()
  v = await view()
  check('going back says what happens and asks first', /deletes the rules file/.test(v.review) && /Nothing changes/.test(v.review) && v.confirm === 'Delete its own rules' && disk('note.ttl.acl') !== null, v.review.slice(0, 160))
  await confirm()
  v = await view()
  check('back to inherited: the rules file is gone and the pane says it follows the folder', disk('note.ttl.acl') === null && v.state === 'inherited' && /shr-good/.test(v.status), v.state + ' :: ' + v.status)

  // 9. Removing your own control needs a second, explicit click.
  await clickText('Give it its own rules'); await confirm()
  await addPerson(BOB, 'owner')
  await setLevel(ME_KEY, 'edit')
  await clickText('Review and save')
  v = await view()
  check('demoting yourself: warned, and the button says what it does', /no longer be able to change who has access/.test(v.review) && v.confirm === 'Yes, remove my own control', v.confirm)
  const kept = disk('note.ttl.acl')
  await page.evaluate(() => document.querySelector('.shr-confirm').click())
  await sleep(1500)
  v = await view()
  check('the first click only asks again; nothing is written', disk('note.ttl.acl') === kept && /Click again/.test(v.confirm), v.confirm)
  await confirm()
  v = await view()
  const after = disk('note.ttl.acl')
  check('the second click saves: Bob is owner, you can edit, and the pane says you can no longer see the rules', after.includes(BOB) && /Control/.test(after) && v.state === 'denied' && /no longer see the rules/.test(v.status), v.state + ' :: ' + v.status)

  // 10. A folder with the sample rules: names, levels, contents, and the rules it cannot edit.
  reset()
  await openSharing(BASE + 'team/')
  v = await view()
  check('a folder with its own rules says they apply inside too', v.state === 'own' && /apply to everything inside/.test(v.source), v.source)
  const rows = v.rows.join(' ; ')
  check('folder: you, Alice owners; Bob edit; Carol only the folder itself; anyone logged in view and add', v.rows.includes(ME_KEY + ' = owner') && v.rows.includes('agent https://alice.example/profile/card#me = owner') && v.rows.includes('agent ' + BOB + ' = edit') && v.rows.includes('agent https://carol.example/profile/card#me = custom') && v.rows.includes('authenticated http://www.w3.org/ns/auth/acl#AuthenticatedAgent = add') && v.rows.includes(PUBLIC_KEY + ' = none'), rows)
  check('folder: the group and the app rule are shown, read-only', v.readOnly.length === 2 && v.readOnly.some(t => /group/.test(t) && /friends/.test(t)) && v.readOnly.some(t => /notes\.example/.test(t)), v.readOnly.join(' | '))
  const carol = await page.evaluate(() => [...document.querySelectorAll('.shr-row')].find(r => /carol/.test(r.dataset.key)).querySelector('select').selectedOptions[0].textContent)
  check('folder: Carol\'s level is described for the folder and for what is inside', /this folder: can view · things inside it: no access/.test(carol), carol)
  await setLevel('agent ' + BOB, 'view')
  await clickText('Review and save')
  v = await view()
  check('folder: the summary says the change applies to everything inside', v.summary[0] === BOB + ' can now view (could edit), in this folder and everything inside', v.summary.join(' | '))
  await confirm()
  const team = disk('team/.acl')
  check('folder: saved, and the group and app rules are kept exactly', /friends#group/.test(team) && /notes\.example/.test(team) && /carol/.test(team) && /shr-good/.test((await view()).status))
  check('folder: Carol still only for the folder itself after a save', (await view()).rows.includes('agent https://carol.example/profile/card#me = custom'))
  check('no sideways scroll at 1300 px', !(await view()).wide)
  await shot('folder-1300')

  // 11. A file inside the folder inherits its default rules: Carol (folder only) is not there.
  await openSharing(BASE + 'team/plan.ttl')
  v = await view()
  check('a file in the folder inherits; Carol, whose rule is for the folder only, is not listed', v.state === 'inherited' && /team\//.test(v.source) && !v.rows.join().includes('carol') && v.rows.some(r => r.startsWith('agent ' + BOB)), v.rows.join(' ; '))
  reset()
  await finish()
} catch (error) { reset(); await finish(error) }
