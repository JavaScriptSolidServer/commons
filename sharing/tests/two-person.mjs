// Two people and the Sharing pane (adapted from two-person/sharing.mjs, on this folder's ports and data): "me" shares a private folder with "bob", and bob's own requests
// show what the server lets him do at each step: refused; can view (read yes, write no); can edit (write
// yes); removed (refused again). While bob can only view, he opens the Sharing pane on the folder himself.
//   node tests/two-person.mjs   (after sharing.mjs: me reuses its login)
// Browsers: me on 9527, bob on 9528. Data: me/public/suite-data/sharing/shared/ (rebuilt on every run, removed after).
import './free-ports.mjs'
import { open, config, LAB, POD, POD2, sleep } from '../../lib/lib.mjs'
import { openSharing as openPane } from './open-sharing.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'sharing/sharing-pane.js'
const FOLDER = POD + 'public/suite-data/sharing/shared/'
const FILE = FOLDER + 'secret.ttl'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'sharing', 'shared')
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
const BOB_KEY = 'agent ' + BOB
if (!DIR.endsWith('/suite-data/sharing/shared')) throw new Error('refusing: unexpected data folder ' + DIR)

// A private folder: only me, for the folder and everything in it. One file inside.
function reset () {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })
  writeFileSync(path.join(DIR, '.acl'), JSON.stringify({
    '@context': { acl: 'http://www.w3.org/ns/auth/acl#', foaf: 'http://xmlns.com/foaf/0.1/' },
    '@graph': [{ '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': ME }, 'acl:accessTo': { '@id': FOLDER }, 'acl:default': { '@id': FOLDER }, 'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }] }]
  }, null, 2))
  writeFileSync(path.join(DIR, 'secret.ttl'), '@prefix dc: <http://purl.org/dc/terms/>.\n<#this> dc:title "Only for people I share with" .\n')
}
const acl = () => { const p = path.join(DIR, '.acl'); return existsSync(p) ? readFileSync(p, 'utf8') : '' }
reset()

const me = await open({ pane: PANE, port: 9527, dir: import.meta.dirname, login: false, resource: FOLDER })
const { check, finish } = me
let bob = null

// bob's own request, with his logged-in fetch, in his browser.
const asBob = (method, uri, body) => bob.page.evaluate(async (v) => {
  const [m, u, b] = JSON.parse(v)
  const r = await window.SolidLogic.store.fetcher._fetch(u, { method: m, cache: 'no-store', ...(b ? { headers: { 'Content-Type': 'text/turtle' }, body: b } : {}) })
  return r.status
}, JSON.stringify([method, uri, body || null]))
const bobWrites = (n) => asBob('PUT', FILE, `@prefix dc: <http://purl.org/dc/terms/>.\n<#this> dc:title "Bob was here ${n}" .\n`)

const ready = (p) => p.waitFor(() => { const r = document.querySelector('.shr.sharing-lab-pane'); return !!r && r.dataset.state && !['busy', 'loading'].includes(r.dataset.state) }, { timeout: 70000 })
async function openSharing (who, uri) { await openPane(who.page, who.address(uri)) }
const view = (p) => p.evaluate(() => {
  const r = document.querySelector('.shr.sharing-lab-pane')
  return {
    state: r.dataset.state,
    text: [...r.childNodes].filter(n => n.nodeName !== 'STYLE').map(n => n.textContent).join(' '),
    status: r.querySelector('.shr-status').className + ' :: ' + r.querySelector('.shr-status').textContent,
    rows: [...r.querySelectorAll('.shr-list:not(.shr-extra) > .shr-row:not(.shr-readonly)')].map(row => row.dataset.key + ' = ' + (row.querySelector('select') ? row.querySelector('select').value : row.querySelector('.shr-level').textContent)),
    summary: [...r.querySelectorAll('.shr-summary li')].map(li => li.textContent),
    controls: r.querySelectorAll('button, select, input, textarea, form').length
  }
})
const page = me.page
const setLevel = (key, level) => page.evaluate((v) => { const [k, l] = JSON.parse(v); const s = [...document.querySelectorAll('.shr-row')].find(r => r.dataset.key === k).querySelector('select'); s.value = l; s.dispatchEvent(new Event('change')) }, JSON.stringify([key, level]))
const clickText = (text) => page.evaluate((t) => { const b = [...document.querySelectorAll('.shr button')].find(x => x.textContent.trim() === t); if (!b) throw new Error('no button ' + t); b.click() }, text)
const confirm = async () => { await page.evaluate(() => document.querySelector('.shr-confirm').click()); await sleep(300); await ready(page) }
const addPerson = (webId, level) => page.evaluate((v) => { const [w, l] = JSON.parse(v); const f = document.querySelector('.shr-add'); f.querySelector('input').value = w; f.querySelector('select').value = l; f.requestSubmit() }, JSON.stringify([webId, level]))

try {
  // 0. bob logs in, in his own browser, on his own pod.
  // bob reuses the session his last run left in tests/profile-bob (a fresh login through the identity provider is the
  // slow, flaky step under load); he logs in afresh only when there is none.
  if (existsSync(path.join(import.meta.dirname, 'profile-bob'))) {
    bob = await open({ pane: PANE, port: 9528, dir: import.meta.dirname, resource: POD2, as: 'bob', login: false })
    const still = await bob.page.waitFor((w) => { try { return window.SolidLogic.authn.currentUser().value === w } catch { return false } }, { timeout: 20000, args: [BOB] }).catch(() => false)
    if (!still) { console.log('     (no saved session for bob: logging in)'); await bob.page.close(); bob = null }
  }
  if (!bob) bob = await open({ pane: PANE, port: 9528, dir: import.meta.dirname, resource: POD2, as: 'bob' })
  const bobWho = await bob.page.evaluate(() => { try { return window.SolidLogic.authn.currentUser().value } catch { return null } })
  check('bob: logged in as bob', bobWho === BOB, String(bobWho))

  // 1. Private: bob is refused.
  const r1 = [await asBob('GET', FILE), await asBob('GET', FOLDER)]
  check('private: bob cannot read the file or the folder', r1.every(s => [401, 403].includes(s)), r1.join(' '))
  check('private: bob cannot write the file', [401, 403].includes(await bobWrites(1)))

  // 2. me adds bob as "can view".
  await openSharing(me, FOLDER)
  let v = await view(page)
  check('me: the folder has its own rules, me as owner only', v.state === 'own' && v.rows.includes('agent ' + ME + ' = owner') && !v.rows.some(r => r.includes('/bob/')), v.rows.join(' ; '))
  await addPerson(BOB, 'view')
  v = await view(page)
  check('me: bob joins the list as new, not saved yet', v.rows.includes(BOB_KEY + ' = view') && !acl().includes('/bob/'), v.rows.join(' ; '))
  // The pane fills in names as profiles load; give bob's a moment before the review.
  const named = await page.waitFor((k) => /Bob Tester/.test([...document.querySelectorAll('.shr-row')].find(r => r.dataset.key === k).textContent), { timeout: 15000, args: [BOB_KEY] }).catch(() => false)
  check('me: bob\'s row shows his name from his profile', !!named)
  await clickText('Review and save')
  v = await view(page)
  console.log('     summary: ' + v.summary.join(' | '))
  check('me: the summary says bob can now view, in the folder and everything inside', /can now view, in this folder and everything inside/.test(v.summary[0] || ''), v.summary.join(' | '))
  check('me: the summary uses bob\'s name from his profile', /Bob Tester/.test(v.summary[0] || ''), v.summary.join(' | '))
  await confirm()
  v = await view(page)
  check('me: saved', /shr-good/.test(v.status) && v.rows.includes(BOB_KEY + ' = view'), v.status)
  check('pod: the rules file names bob', acl().includes(BOB))
  await me.shot('sharing-me-bob-view')

  // 3. bob can read, not write.
  const r3 = [await asBob('GET', FILE), await asBob('GET', FOLDER)]
  check('can view: bob reads the file and the folder', r3.every(s => s === 200), r3.join(' '))
  const w3 = await bobWrites(3)
  check('can view: a write by bob is refused', [401, 403].includes(w3), String(w3))
  check('can view: the file is unchanged on disk', !/Bob was here/.test(readFileSync(path.join(DIR, 'secret.ttl'), 'utf8')))

  // 3b. bob opens the Sharing pane on my folder: he cannot see who has access, and gets no controls.
  await openSharing(bob, FOLDER)
  const bv = await view(bob.page)
  console.log('     bob sees: ' + bv.state + ' :: ' + bv.text.replace(/\s+/g, ' ').slice(0, 160))
  check('bob in the pane: it says he cannot see who has access', bv.state === 'denied' && /cannot see who has access/i.test(bv.text), bv.state)
  check('bob in the pane: no controls at all', bv.controls === 0, String(bv.controls))
  check('bob in the pane: no list of people', bv.rows.length === 0 && !bv.text.includes(ME), bv.rows.join(' ; '))
  check('no sideways scroll for bob at 1300 px', await bob.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await bob.shot('sharing-bob-view-only')
  await narrow(bob.page)
  const bm = await measure(bob.page)
  check('bob, a true 400 px: still no controls, no sideways scroll', bm.innerWidth === 400 && !bm.sideways && (await view(bob.page)).controls === 0, bm.innerWidth + ' ' + bm.poking.join(' '))
  await bob.shot('sharing-bob-view-only-400')

  // 4. me raises bob to "can edit"; bob can write.
  await setLevel(BOB_KEY, 'edit')
  await clickText('Review and save')
  v = await view(page)
  console.log('     summary: ' + v.summary.join(' | '))
  check('me: the summary says bob can now edit (could view)', /can now edit \(could view\)/.test(v.summary[0] || ''), v.summary.join(' | '))
  await confirm()
  check('me: saved as edit', (await view(page)).rows.includes(BOB_KEY + ' = edit') && /Write/.test(acl()))
  const w4 = await bobWrites(4)
  check('can edit: bob writes the file', [200, 201, 204, 205].includes(w4), String(w4))
  check('can edit: bob\'s write is on disk', /Bob was here 4/.test(readFileSync(path.join(DIR, 'secret.ttl'), 'utf8')))

  // 5. me removes bob; refused again.
  await page.evaluate((k) => [...document.querySelectorAll('.shr-row')].find(r => r.dataset.key === k).querySelector('.shr-quiet').click(), BOB_KEY)
  await clickText('Review and save')
  v = await view(page)
  console.log('     summary: ' + v.summary.join(' | '))
  check('me: the summary says bob loses access (could edit)', /can no longer see or change it \(could edit\)/.test(v.summary[0] || ''), v.summary.join(' | '))
  await confirm()
  check('pod: bob is gone from the rules file, me still owner', !acl().includes('/bob/') && acl().includes(ME) && /Control/.test(acl()))
  const r5 = [await asBob('GET', FILE), await asBob('GET', FOLDER), await bobWrites(5)]
  check('removed: bob is refused again (read file, read folder, write)', r5.every(s => [401, 403].includes(s)), r5.join(' '))
  check('no sideways scroll for me at 1300 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await me.shot('sharing-me-removed')

  await bob.page.close()
  if (!process.env.KEEP) rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { rmSync(DIR, { recursive: true, force: true }); if (bob) await bob.page.close().catch(() => {}); await finish(error) }
