// Regression checks for the findings in REVIEW.md, one or more per fix, on a copy of the sample book (logged in).
//   1  "{ }" in values survive a save; a save the pod does not keep as typed is reported, never "Saved."
//   2  Delete and Edit never touch a file outside the book's folder
//   3  a malformed %-sequence in an email does not break the card or search
//   4  a new contact whose people.ttl entry fails is removed again
//   5  the group × has a 44 px hit area      7  the group menu is disabled while saving
//   8  no dct:created on a new card            9  the card head starts at the top; long names clamp
// (6, the read-only note, is checked in two-person.mjs.) Data under suite-data/contacts/review-<run>/, removed after.
//   node tests/review.mjs          (KEEP=1 keeps it)
import { open, POD, LAB, config, sleep } from '../../lib/lib.mjs'
import { mkdirSync, cpSync, rmSync, existsSync, readFileSync, appendFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'contacts/contacts-pane.js'
const RUN = Date.now().toString(36)
const AREA = POD + 'public/suite-data/contacts/review-' + RUN + '/'
const AREA_DIR = path.join(config.podDir, 'public', 'suite-data', 'contacts', 'review-' + RUN)
const BOOK_URL = AREA + 'book/'
const BOOK_DIR = path.join(AREA_DIR, 'book')
const VICTIM = path.join(AREA_DIR, 'victim.ttl')
const here = import.meta.dirname

mkdirSync(BOOK_DIR, { recursive: true })
cpSync(path.join(here, '..', 'samples', 'book'), BOOK_DIR, { recursive: true })
const VICTIM_TEXT = '@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .\n<#this> a vcard:Individual ; vcard:fn "Victim Outside" .\n'
writeFileSync(VICTIM, VICTIM_TEXT)
mkdirSync(path.join(BOOK_DIR, 'Person', 'pct'), { recursive: true })
writeFileSync(path.join(BOOK_DIR, 'Person', 'pct', 'index.ttl'), '@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .\n<#this> a vcard:Individual ; vcard:fn "Percy Cent" ; vcard:hasEmail <mailto:50%off@example.org> .\n')
appendFileSync(path.join(BOOK_DIR, 'people.ttl'), '<../victim.ttl#this> vcard:inAddressBook <index.ttl#this> ; vcard:fn "Victim Outside" .\n<Person/pct/index.ttl#this> vcard:inAddressBook <index.ttl#this> ; vcard:fn "Percy Cent" .\n')

const served = async (address) => { const r = await fetch(address, { headers: { Accept: 'text/turtle' } }); return r.ok ? await r.text() : 'HTTP ' + r.status }
const status = (page) => page.evaluate(() => { const s = document.querySelector('.ctc-msg'); return (s.dataset.kind || '') + ' :: ' + s.textContent })
const settled = (page) => page.waitFor(() => /^(good|bad)$/.test(document.querySelector('.ctc-msg').dataset.kind || '') && !document.querySelector('.ctc button:disabled'), { timeout: 30000 })
const clear = (page) => page.evaluate(() => { delete document.querySelector('.ctc-msg').dataset.kind })
const names = (page) => page.evaluate(() => [...document.querySelectorAll('.ctc-row-title')].map(n => n.textContent).join(','))
const pick = (page, who) => page.evaluate((name) => { [...document.querySelectorAll('.ctc-row')].find(r => r.querySelector('.ctc-row-title').textContent === name).click() }, who)
const fill = (page, values) => page.evaluate((json) => { const v = JSON.parse(json); const f = document.querySelector('form.ctc-form'); for (const [k, val] of Object.entries(v)) f.querySelector('[name="' + k + '"]').value = val; f.requestSubmit() }, JSON.stringify(values))
const search = (page, q) => page.evaluate((text) => { const s = document.querySelector('.ctc-search input'); s.value = text; s.dispatchEvent(new Event('input')) }, q)
// Make the pod misbehave for one kind of request, at window.fetch (wrapping the fetcher's own _fetch recurses).
const intercept = (page, kind) => page.evaluate((k) => {
  if (!window.__realFetch) window.__realFetch = window.fetch
  const real = window.__realFetch
  window.fetch = async (url, o = {}) => {
    const u = String(url)
    if (k === 'fail-people' && o.method === 'PUT' && /people\.ttl$/.test(u)) return new Response('no', { status: 500 })
    if (k === 'drop-zed' && o.method === 'PUT' && typeof o.body === 'string') return real(url, { ...o, body: o.body.replace(/Zed \{Z\}/g, "Zed") })
    return real(url, o)
  }
}, kind)
const restore = (page) => page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch })

const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9515, dir: here, width: 1300, login: true, resource: BOOK_URL + 'index.ttl#this' })
try {
  await page.waitFor(() => document.querySelectorAll('.ctc-row').length === 5 && !!document.querySelector('.ctc-add'), { timeout: 40000 })
  await sleep(1500)

  // ---- 3: a %-sequence that does not decode ----
  await search(page, 'ali')
  check('3: with a malformed %-email in the book, search still works', (await names(page)) === 'Alice Example', await names(page))
  await search(page, '50%off')
  check('3: and finds that email as typed', (await names(page)) === 'Percy Cent', await names(page))
  await search(page, '')
  await pick(page, 'Percy Cent')
  await sleep(300)
  const percy = await page.evaluate(() => { const p = document.querySelector('.ctc-person'); return { text: p.textContent, edit: !!p.querySelector('.ctc-edit'), del: !!p.querySelector('.ctc-delete') } })
  check('3: the card shows its fields, Edit and Delete', /50%off@example\.org/.test(percy.text) && percy.edit && percy.del, JSON.stringify(percy))

  // ---- 2: an entry pointing outside the book's folder ----
  await pick(page, 'Victim Outside')
  await sleep(300)
  const outside = await page.evaluate(() => { const p = document.querySelector('.ctc-person'); return { edit: !!p.querySelector('.ctc-edit'), hint: !!p.querySelector('.ctc-outside'), del: !!p.querySelector('.ctc-delete') } })
  check('2: a card outside the book\'s folder has no Edit, and says why', !outside.edit && outside.hint && outside.del, JSON.stringify(outside))
  await clear(page)
  await page.evaluate(() => document.querySelector('.ctc-delete').click())
  await page.evaluate(() => document.querySelector('.ctc-delete').click())
  await settled(page)
  const victimMsg = await status(page)
  check('2: Delete takes the entry out of the book and says the file was left', /^good :: Victim Outside was taken out of the book.*left as it is/.test(victimMsg), victimMsg)
  check('2: the file outside the book is still there, unchanged', existsSync(VICTIM) && readFileSync(VICTIM, 'utf8') === VICTIM_TEXT)
  check('2: people.ttl no longer lists it', !/victim/.test(await served(BOOK_URL + 'people.ttl')) && !/Victim/.test(await names(page)))

  // ---- 1: braces ----
  await pick(page, 'Alice Example')
  await page.evaluate(() => document.querySelector('.ctc-edit').click())
  await clear(page)
  await fill(page, { name: 'Alice {A}', note: 'see {the} plan' })
  await settled(page)
  check('1: a name and note with { } save', /^good :: Saved\.$/.test(await status(page)), await status(page))
  const aliceCard = await served(BOOK_URL + 'Person/alice/index.ttl')
  check('1: the card on the pod holds both as typed', /Alice \{A\}/.test(aliceCard) && /see \{the\} plan/.test(aliceCard), aliceCard.slice(0, 400))
  check('1: people.ttl and the group hold the new name', /Alice \{A\}/.test(await served(BOOK_URL + 'people.ttl')) && /Alice \{A\}/.test(await served(BOOK_URL + 'Group/Friends.ttl')))
  await page.goto(address(BOOK_URL + 'index.ttl#this'))
  await page.waitFor(() => document.querySelectorAll('.ctc-row').length === 4 && !!document.querySelector('.ctc-add'), { timeout: 40000 })
  await sleep(800)
  await pick(page, 'Alice {A}')
  await sleep(300)
  check('1: after a reload the list and card read back the same', /see \{the\} plan/.test(await page.evaluate(() => document.querySelector('.ctc-person').textContent)))
  check('nit: initials skip punctuation (Alice {A} is AA)', await page.evaluate(() => [...document.querySelectorAll('.ctc-row')].find(r => /Alice/.test(r.textContent)).querySelector('.ctc-avatar').textContent === 'AA'))
  // A pod that answers 2xx but keeps something else: the pane must not say "Saved.".
  await intercept(page, 'drop-zed')
  await page.evaluate(() => document.querySelector('.ctc-edit').click())
  await clear(page)
  await fill(page, { role: 'Zed {Z}' })
  await settled(page)
  check('1: a save the pod does not keep as typed is an error, not "Saved."', /^bad :: Not saved: the pod did not keep it as typed/.test(await status(page)), await status(page))
  await restore(page)

  // ---- 4: the people.ttl step fails ----
  const before = readdirSync(path.join(BOOK_DIR, 'Person')).sort().join(',')
  await intercept(page, 'fail-people')
  await page.evaluate(() => document.querySelector('.ctc-add').click())
  await clear(page)
  await fill(page, { name: 'Ghost Person' })
  await settled(page)
  await restore(page)
  check('4: a failed people.ttl step says so and removes the new card', /^bad :: .*removed again/.test(await status(page)), await status(page))
  check('4: no card folder is left behind', readdirSync(path.join(BOOK_DIR, 'Person')).sort().join(',') === before, readdirSync(path.join(BOOK_DIR, 'Person')).join(','))

  // ---- 8: a new card, braces in its name too ----
  await page.evaluate(() => { const c = [...document.querySelectorAll('form.ctc-form button')].find(b => b.textContent === 'Cancel'); if (c) c.click() })
  await page.evaluate(() => document.querySelector('.ctc-add').click())
  await clear(page)
  await fill(page, { name: 'Eve {E}' })
  await settled(page)
  const made = readdirSync(path.join(BOOK_DIR, 'Person')).filter(f => !before.split(',').includes(f))
  const eve = made.length === 1 ? await served(BOOK_URL + 'Person/' + made[0] + '/index.ttl') : ''
  check('8: a new card has no dct:created (or any created date)', /Eve \{E\}/.test(eve) && !/created/.test(eve), eve.slice(0, 300))
  check('1: its name with { } is in people.ttl', /Eve \{E\}/.test(await served(BOOK_URL + 'people.ttl')))

  // ---- 5, 7, 9: the card ----
  await pick(page, 'Bob Builder')
  await sleep(300)
  const hit = await page.evaluate(() => {
    const x = document.querySelector('.ctc-x')
    const r = x.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const at = (dx, dy) => { const e = document.elementFromPoint(cx + dx, cy + dy); return !!e && !!e.closest('.ctc-x') }
    return { size: Math.round(r.width), up: at(0, -20), down: at(0, 20), left: at(-20, 0) }
  })
  check('5: the group × has a 44 px hit area around its 20 px mark', hit.up && hit.down && hit.left, JSON.stringify(hit))
  const busy = await page.evaluate(() => { const s = document.querySelector('.ctc-pick'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')); return s.disabled })
  check('7: the group menu is disabled while a join is saving', busy)
  await settled(page)
  const head = await page.evaluate(() => ({ align: getComputedStyle(document.querySelector('.ctc-head')).alignItems, clamp: getComputedStyle(document.querySelector('.ctc-name')).webkitLineClamp }))
  check('9: the card head starts at the top, and a long name is clamped to 3 lines', head.align === 'flex-start' && String(head.clamp) === '3', JSON.stringify(head))
  await shot('review-card-1300')
} catch (error) {
  if (!process.env.KEEP) rmSync(AREA_DIR, { recursive: true, force: true })
  await finish(error)
}
if (process.env.KEEP) console.log('kept: ' + AREA); else rmSync(AREA_DIR, { recursive: true, force: true })
await finish()
