// Two people, Files and the Sharing pane it hosts in its details (written by the reviewer). Inside the suite shell,
// "me" opens a private folder in Files, picks a file, opens its Sharing tab (the Sharing pane, imported by Files)
// and shares it with bob as "can view"; then a subfolder as "can edit". Bob, in his own browser, with his own
// requests: reads the file, cannot write it, cannot read the folder or the other file; writes into the subfolder,
// and me sees bob's new file in Files after a refresh. Then me removes bob from the file (Remove access) and sends
// the subfolder back to inherited rules, both through the Sharing tab in Files, and bob is refused again.
//   node tests/two-person.mjs
// Since the review's fixes (folder author): deleting a shared file deletes its own rules too, so a new file of the
// same name is NOT shared (bob refused); Rename refuses a file with its own rules; Files hears the Sharing pane's
// suite-sharing-change event and re-reads its listing.
// Browsers: me on 9511, bob on 9512 (the folder pane's ports). Data: me/public/suite-data/folder-review/ (rebuilt on every run).
import { open, config, LAB, POD, POD2, sleep } from '../../lib/lib.mjs'
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const FOLDER = POD + 'public/suite-data/folder-review/'
const FILE = FOLDER + 'report.md'
const OTHER = FOLDER + 'private.md'
const SUB = FOLDER + 'team/'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'folder-review')
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
const BOB_KEY = 'agent ' + BOB
if (!DIR.endsWith('/suite-data/folder-review')) throw new Error('refusing: unexpected data folder ' + DIR)

// A private folder: me only, for the folder and everything in it. Two files and a subfolder with one file.
function reset () {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(path.join(DIR, 'team'), { recursive: true })
  writeFileSync(path.join(DIR, '.acl'), JSON.stringify({
    '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
    '@graph': [{ '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': ME }, 'acl:accessTo': { '@id': FOLDER }, 'acl:default': { '@id': FOLDER }, 'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }] }]
  }, null, 2))
  writeFileSync(path.join(DIR, 'report.md'), '# Report\n\nFor Bob to read.\n')
  writeFileSync(path.join(DIR, 'private.md'), '# Private\n\nNot shared.\n')
  writeFileSync(path.join(DIR, 'team', 'plan.md'), '# Plan\n')
  // Nothing left from an earlier run: exactly the folder's own .acl, two files and team/plan.md.
  const left = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? left(path.join(d, e.name)).map(x => e.name + '/' + x) : [e.name])
  if (left(DIR).sort().join() !== '.acl,private.md,report.md,team/plan.md') throw new Error('reset left: ' + left(DIR).join())
}
const onDisk = (name) => { const p = path.join(DIR, name); return existsSync(p) ? readFileSync(p, 'utf8') : null }
reset()

// Sessions: reuse the ones write.mjs (me) and bob.mjs (bob) just left in this folder's profiles, and log in afresh
// only if there is none: fewer trips through the identity provider, which timed out once under a full run's load.
const loggedIn = (p) => p.waitFor(() => { try { return !!window.SolidLogic.authn.currentUser() } catch { return false } }, { timeout: 20000 }).then(() => true, () => false)
async function session (opts) {
  const s = await open({ ...opts, login: false })
  if (await loggedIn(s.page)) return s
  await s.page.close()
  return open({ ...opts, login: true })
}
// open() and finish() end the process: close every browser this test started first, so none is left holding a port.
let me = null
let bob = null
const realExit = process.exit.bind(process)
process.exit = (code) => { Promise.allSettled([me && me.page.close(), bob && bob.page.close()]).finally(() => realExit(code)) }
me = await session({ pane: SHELL, port: 9511, dir: import.meta.dirname, resource: FOLDER })
const { check, finish, page } = me

const asBob = (method, uri, body) => bob.page.evaluate(async (v) => {
  const [m, u, b] = JSON.parse(v)
  const r = await window.SolidLogic.store.fetcher._fetch(u, { method: m, cache: 'no-store', ...(b ? { headers: { 'Content-Type': 'text/markdown' }, body: b } : {}) })
  return r.status
}, JSON.stringify([method, uri, body || null]))
const refused = (s) => [401, 403].includes(s)
const wrote = (s) => [200, 201, 204, 205].includes(s)

// Files in the shell: wait for the listing (and the write tools, for me).
const listed = (p, n, tools) => p.waitFor((v) => { const [n, tools] = JSON.parse(v); return document.querySelectorAll('.sh-content .fl-row').length === n && (!tools || !document.querySelector('.sh-content .fl-write').hidden) }, { timeout: 45000, args: [JSON.stringify([n, tools])] })
// The Sharing pane inside the Files details column, settled.
const ready = () => page.waitFor(() => { const r = document.querySelector('.sh-detcol .fl-panel-sharing .shr.sharing-lab-pane'); return !!r && r.dataset.state && !['busy', 'loading'].includes(r.dataset.state) }, { timeout: 30000 })
// Wait for the row (the list is drawn and settled: not busy), click it, and if the details column did not open
// (a redraw of the list or shell can land between), click once more before failing.
async function sharingFor (name) {
  const opened = () => page.waitFor((n) => document.querySelector('.sh-detcol:not([hidden]) .fl-details-title')?.textContent === n, { timeout: 8000, args: [name] }).then(() => true, () => false)
  const click = async () => {
    await page.waitFor((n) => { const r = document.querySelector(`.sh-content .fl-row[data-name="${n}"] .fl-row-main`); return !!r && r.isConnected && !document.querySelector('.sh-content .fl-status.fl-work') }, { timeout: 30000, args: [name] })
    await page.evaluate((n) => document.querySelector(`.sh-content .fl-row[data-name="${n}"] .fl-row-main`).click(), name)
  }
  await click()
  if (!await opened()) { console.log('     (details did not open; clicking once more)'); await click(); if (!await opened()) throw new Error('the details for ' + name + ' did not open') }
  await page.evaluate(() => document.querySelector('.sh-detcol .fl-tab-sharing').click())
  await ready()
}
const view = () => page.evaluate(() => {
  const r = document.querySelector('.sh-detcol .fl-panel-sharing .shr.sharing-lab-pane')
  return {
    state: r.dataset.state,
    status: r.querySelector('.shr-status').className + ' :: ' + r.querySelector('.shr-status').textContent,
    rows: [...r.querySelectorAll('.shr-list:not(.shr-extra) > .shr-row')].map(row => row.dataset.key + ' = ' + (row.querySelector('select') ? row.querySelector('select').value : row.querySelector('.shr-level').textContent)),
    summary: [...r.querySelectorAll('.shr-summary li')].map(li => li.textContent)
  }
})
const clickText = (text) => page.evaluate((t) => { const b = [...document.querySelectorAll('.sh-detcol .shr button')].find(x => x.textContent.trim() === t); if (!b) throw new Error('no button ' + t); b.click() }, text)
const confirm = async () => { await page.evaluate(() => document.querySelector('.sh-detcol .shr-confirm').click()); await sleep(300); await ready() }
const addPerson = (webId, level) => page.evaluate((v) => { const [w, l] = JSON.parse(v); const f = document.querySelector('.sh-detcol .shr-add'); f.querySelector('input').value = w; f.querySelector('select').value = l; f.requestSubmit() }, JSON.stringify([webId, level]))
// "Give it its own rules", then confirm: the file starts out inheriting the folder's rules.
const meStatus = () => page.evaluate(() => { const s = document.querySelector('.sh-content .fl-status'); return s.className.replace('fl-status', '').replace('fl-', '').trim() + ' :: ' + s.textContent })
const meSettled = () => page.waitFor(() => { const s = document.querySelector('.sh-content .fl-status'); return s && /fl-(good|bad)/.test(s.className) && document.querySelector('.sh-content .fl-head') && !document.querySelector('.sh-content .fl-write button:disabled') }, { timeout: 30000 })
const meFetch = (method, uri, body) => page.evaluate(async (v) => {
  const [m, u, b] = JSON.parse(v)
  const r = await window.SolidLogic.store.fetcher._fetch(u, { method: m, cache: 'no-store', ...(b ? { headers: { 'Content-Type': 'text/markdown' }, body: b } : {}) })
  return r.status
}, JSON.stringify([method, uri, body || null]))
async function ownRules () {
  await clickText('Give it its own rules')
  await confirm()
}

try {
  bob = await session({ pane: SHELL, port: 9512, dir: import.meta.dirname, resource: POD2, as: 'bob' })
  check('bob: logged in as bob', (await bob.page.evaluate(() => { try { return window.SolidLogic.authn.currentUser().value } catch { return null } })) === BOB)

  // 1. Private: bob is refused everything.
  const r1 = [await asBob('GET', FILE), await asBob('GET', OTHER), await asBob('GET', FOLDER), await asBob('GET', SUB)]
  check('private: bob can read nothing (file, other file, folder, subfolder)', r1.every(refused), r1.join(' '))

  // 2. me, in Files: report.md › Details › Sharing. It inherits; give it its own rules, add bob as "can view".
  await page.goto(me.address(FOLDER))
  await listed(page, 3, true)
  await sharingFor('report.md')
  let v = await view()
  check('me, Files › report.md › Sharing: the Sharing pane is there and says it inherits the folder\'s rules', v.state === 'inherited', v.state + ' ' + v.status)
  await ownRules()
  v = await view()
  check('me: report.md now has its own rules, me as owner', v.state === 'own' && v.rows.includes('agent ' + ME + ' = owner'), v.state + ' ' + v.rows.join(' ; '))
  await addPerson(BOB, 'view')
  await clickText('Review and save')
  v = await view()
  console.log('     summary: ' + v.summary.join(' | '))
  await confirm()
  v = await view()
  check('me: saved in the Files details, bob listed as can view', /shr-good/.test(v.status) && v.rows.includes(BOB_KEY + ' = view'), v.status + ' ' + v.rows.join(' ; '))
  const fileAcl = onDisk('report.md.acl')
  check('pod: report.md has its own rules file naming bob; the folder\'s rules untouched', !!fileAcl && fileAcl.includes(BOB) && !onDisk('.acl').includes(BOB))
  // Files heard the Sharing pane's suite-sharing-change and read its listing again: the new rules file is counted
  // (1 hidden → 2 hidden) without a reload, and the details column stayed open.
  const heard = await page.waitFor(() => { const r = document.querySelector('.sh-content .fl.folder-lab-pane'); return +(r.dataset.sharingSeen || 0) >= 1 && /2 hidden/.test(r.querySelector('.fl-foot').textContent) }, { timeout: 10000 }).catch(() => false)
  check('Files hears the Sharing tab\'s change: its listing is read again (2 hidden), the details stay open', !!heard && await page.evaluate(() => !document.querySelector('.sh-detcol').hidden), await page.evaluate(() => document.querySelector('.sh-content .fl-foot').textContent))
  // Rename must not leave the rules behind or drop them: it refuses, asking the server (not the listing).
  await page.evaluate(() => document.querySelector('.sh-content .fl-row[data-name="report.md"] .fl-rename').click())
  await page.evaluate(() => { const r = document.querySelector('.sh-content .fl-renamer'); r.querySelector('input').value = 'moved.md'; r.querySelector('.fl-yes').click() })
  await meSettled()
  const renameSaid = await meStatus()
  check('Rename of a file with its own rules is refused, nothing moved, the rules where they were', /^bad :: Not renamed: .*own sharing rules/.test(renameSaid) && !!onDisk('report.md') && !!onDisk('report.md.acl') && !onDisk('moved.md') && !onDisk('moved.md.acl'), renameSaid)
  await me.shot('review-two-person-me-shared')

  // 3. bob reads report.md, cannot write it, still cannot read the rest.
  const r3 = await asBob('GET', FILE)
  check('can view: bob reads report.md', r3 === 200, String(r3))
  const w3 = await asBob('PUT', FILE, '# Bob was here\n')
  check('can view: bob\'s write to report.md is refused, the file unchanged', refused(w3) && !/Bob was here/.test(onDisk('report.md')), String(w3))
  const r3b = [await asBob('GET', OTHER), await asBob('GET', FOLDER), await asBob('PUT', FOLDER + 'bob.md', '# Bob\n')]
  check('can view: bob still cannot read private.md, list the folder or add a file to it', r3b.every(refused), r3b.join(' '))
  // bob opens me's folder in the shell: the data browser itself answers "Access denied" before any pane draws
  // (or, if Files draws, it says he may not see it). Either way nothing of me's is listed.
  await bob.page.goto(bob.address(FOLDER))
  const said = await bob.page.waitFor(() => document.querySelector('.sh-content .fl-error')?.textContent || ((function deep (n) { let t = n.textContent || ''; for (const e of n.querySelectorAll('*')) if (e.shadowRoot) t += deep(e.shadowRoot); return t })(document.body).match(/Access denied/) && 'browser: Access denied') || false, { timeout: 30000 }).catch(() => '')
  check('bob, opening me\'s folder: refused, nothing listed, no write tools', /not allowed|private|Access denied/i.test(said) && await bob.page.evaluate(() => !document.querySelector('.fl-row') && !document.querySelector('.fl-write:not([hidden])')), said)
  await bob.shot('review-two-person-bob-refused')

  // 3b. Delete a shared file: its own rules go too, so a new file of the same name is not shared.
  await page.goto(me.address(FOLDER))
  await listed(page, 3, true)
  await sharingFor('private.md')
  await ownRules()
  await addPerson(BOB, 'view')
  await clickText('Review and save')
  await confirm()
  check('setup: private.md shared with bob (he reads it), its rules file on disk', (await asBob('GET', OTHER)) === 200 && (onDisk('private.md.acl') || '').includes(BOB))
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await page.evaluate(() => document.querySelector('.sh-content .fl-row[data-name="private.md"] .fl-delete').click())
  const warned = await page.waitFor(() => { const n = document.querySelector('.sh-content .fl-confirm .fl-acl-note'); return n && !n.hidden && n.textContent }, { timeout: 10000 }).catch(() => '')
  check('the delete question says its own sharing rules go with it', /private\.md\.acl\) are deleted with it/.test(warned || ''), warned)
  await page.evaluate(() => document.querySelector('.sh-content .fl-confirm .fl-yes').click())
  await meSettled()
  const gone = await meStatus()
  check('delete: the file and its own rules are gone from the pod', /^good :: Deleted “private\.md” and its own sharing rules/.test(gone) && !onDisk('private.md') && !onDisk('private.md.acl'), gone)
  const made = await meFetch('PUT', OTHER, '# A new private file\n')
  const r3c = await asBob('GET', OTHER)
  check('a new private.md (same name) does NOT get the old rules: bob is refused', wrote(made) && refused(r3c), made + ' then bob ' + r3c)

  // 4. me shares the subfolder team/ with bob as "can edit", from its row in Files.
  await sharingFor('team')
  v = await view()
  check('me, Files › team › Sharing: inherits', v.state === 'inherited', v.state)
  await ownRules()
  await addPerson(BOB, 'edit')
  await clickText('Review and save')
  v = await view()
  console.log('     summary: ' + v.summary.join(' | '))
  check('me: the summary says bob can edit, in this folder and everything inside', /can now edit, in this folder and everything inside/.test(v.summary[0] || ''), v.summary.join(' | '))
  await confirm()
  check('pod: team/.acl names bob with Write', /Write/.test(onDisk('team/.acl') || '') && (onDisk('team/.acl') || '').includes(BOB))
  const r4 = [await asBob('GET', SUB), await asBob('GET', SUB + 'plan.md'), await asBob('PUT', SUB + 'from-bob.md', '# From Bob\n')]
  check('can edit: bob lists team/, reads plan.md and adds from-bob.md', r4[0] === 200 && r4[1] === 200 && wrote(r4[2]), r4.join(' '))
  check('pod: bob\'s file is on disk', /From Bob/.test(onDisk('team/from-bob.md') || ''))
  // me sees bob's file in Files, after opening team/.
  await page.goto(me.address(SUB))
  await listed(page, 2, true)
  check('me, Files on team/: bob\'s from-bob.md is listed next to plan.md', (await page.evaluate(() => [...document.querySelectorAll('.sh-content .fl-row')].map(r => r.dataset.name).sort().join())) === 'from-bob.md,plan.md')

  // 5. me removes bob from report.md (⋯ › Remove access) and sends team/ back to inherited rules.
  await page.goto(me.address(FOLDER))
  await listed(page, 3, true)
  await sharingFor('report.md')
  await page.evaluate((k) => [...document.querySelectorAll('.sh-detcol .shr-row')].find(r => r.dataset.key === k).querySelector('.shr-quiet').click(), BOB_KEY)
  await clickText('Review and save')
  v = await view()
  console.log('     summary: ' + v.summary.join(' | '))
  check('me: the summary says bob can no longer see it', /can no longer see or change it \(could view\)/.test(v.summary[0] || ''), v.summary.join(' | '))
  await confirm()
  v = await view()
  check('me: saved, bob gone from the list', /shr-good/.test(v.status) && !v.rows.some(r => r.startsWith(BOB_KEY)), v.status)
  const r5 = [await asBob('GET', FILE), await asBob('PUT', FILE, '# Bob again\n')]
  check('removed: bob can no longer read or write report.md', r5.every(refused), r5.join(' '))

  await sharingFor('team')
  await clickText('Go back to inherited rules')
  await page.waitFor(() => !!document.querySelector('.sh-detcol .shr-review'), { timeout: 15000 })
  await confirm()
  v = await view()
  check('me: team/ follows the folder\'s rules again, its rules file gone', v.state === 'inherited' && !onDisk('team/.acl'), v.state + ' ' + v.status)
  const r6 = [await asBob('GET', SUB), await asBob('GET', SUB + 'from-bob.md'), await asBob('PUT', SUB + 'again.md', '# Again\n')]
  check('removed: bob can no longer list team/, read his own file there or add one', r6.every(refused), r6.join(' '))
  await me.shot('review-two-person-me-removed')

  const errors = page.console.filter(l => /exception/.test(l) && /folder-pane|sharing-pane|fl-|shr-/.test(l))
  check('no errors from either pane', !errors.length, errors.join(' | ').slice(0, 300))
  await bob.page.close()
  await finish()
} catch (error) { if (bob) await bob.page.close().catch(() => {}); await finish(error) }
