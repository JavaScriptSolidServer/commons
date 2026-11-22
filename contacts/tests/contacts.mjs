// The pane on the test pod, logged in: make a book, groups and people; edit, group, ungroup, delete;
// reload; then edit cards written by hand in the upstream shape (blank nodes, WebID members).
// Then the same session at 400 px. Everything is made under suite-data/contacts/ and removed after.
//   node tests/contacts.mjs          (KEEP=1 keeps the test books)
import { open, LAB, POD, config, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { existsSync, readdirSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'contacts/contacts-pane.js'
const PORT = 9515
const RUN = Date.now().toString(36)
const AREA = POD + 'public/suite-data/contacts/'
const AREA_DIR = path.join(config.podDir, 'public', 'suite-data', 'contacts')
const NEW = AREA + 'book-' + RUN + '/'
const NEW_DIR = path.join(AREA_DIR, 'book-' + RUN)
const HAND = AREA + 'hand-' + RUN + '/'
const HAND_DIR = path.join(AREA_DIR, 'hand-' + RUN)
const here = import.meta.dirname

// What the pod serves, as Turtle, to anyone (suite-data is public to read).
const served = async (address) => { const r = await fetch(address, { headers: { Accept: 'text/turtle' } }); return r.ok ? await r.text() : 'HTTP ' + r.status }
// The line under the title: data-kind good, bad or info. Read as 'ctc-<kind> :: text'.
const status = (page) => page.evaluate(() => { const s = document.querySelector('.ctc-msg'); return 'ctc-' + (s.dataset.kind || '') + ' :: ' + s.textContent })
const settled = (page) => page.waitFor(() => /^(good|bad)$/.test(document.querySelector('.ctc-msg').dataset.kind || '') && !document.querySelector('.ctc button:disabled'), { timeout: 30000 }).catch(async (e) => { throw new Error('not settled: ' + await page.evaluate(() => { const s = document.querySelector('.ctc-msg'); return (s.dataset.kind || '') + ' :: ' + s.textContent + ' :: disabled ' + document.querySelectorAll('.ctc button:disabled').length + ' :: form ' + !!document.querySelector('form.ctc-form') + ' :: ' + document.querySelector('.ctc-main').textContent.slice(0, 120) })) })
const names = (page) => page.evaluate(() => [...document.querySelectorAll('.ctc-row-title')].map(n => n.textContent).join(','))
const pick = (page, who) => page.evaluate((name) => { const back = document.querySelector('.ctc-back'); if (back && getComputedStyle(back).display !== 'none') back.click(); [...document.querySelectorAll('.ctc-row')].find(r => r.querySelector('.ctc-row-title').textContent === name).click() }, who)
const fill = (page, values) => page.evaluate((json) => { const v = JSON.parse(json); const f = document.querySelector('form.ctc-form'); for (const [k, val] of Object.entries(v)) { const [name, i] = k.split('#'); f.querySelectorAll('[name="' + name + '"]')[+(i || 0)].value = val } f.requestSubmit() }, JSON.stringify(values))
const people = (text) => (text.match(/Person\/[^/>]+\/index\.ttl/g) || []).filter((v, i, a) => a.indexOf(v) === i)

// A book written by hand, as the upstream pane and the public demo write it.
mkdirSync(HAND_DIR, { recursive: true })
cpSync(path.join(here, '..', 'samples', 'book'), HAND_DIR, { recursive: true })

let failed = 0 // each open() counts its own; this counts both
let page, check0, finish, shot, address
const check = (name, ok, detail) => { if (!ok) failed++; check0(name, ok, detail) }
;({ page, check: check0, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: here, width: 1300, login: true, resource: POD + 'public/' }))
try {
  // ---- a new book from a folder's Add menu ----
  await page.waitFor(() => !!(window.panes && window.panes.byName('contacts')), { timeout: 40000 })
  check('the pane is registered', true)
  check('a folder can make a new address book with it', await page.evaluate(() => window.panes.list.filter(p => p.mintNew && p.mintClass).some(p => p.name === 'contacts' && /AddressBook$/.test(p.mintClass.value))))
  await page.evaluate((base) => { window.__mint = null; const store = window.SolidLogic.store; window.panes.byName('contacts').mintNew({ dom: document, session: { store } }, { newBase: base }).then(r => { window.__mint = { ok: r.newInstance.value, base: r.newBase } }, e => { window.__mint = { error: String(e && e.message ? e.message : e) } }) }, NEW)
  await page.waitFor(() => !!window.__mint, { timeout: 30000 })
  const made = await page.evaluate(() => window.__mint)
  check('mintNew returns the new book and keeps the options', made.ok === NEW + 'index.ttl#this' && made.base === NEW, JSON.stringify(made))
  const files = existsSync(NEW_DIR) ? readdirSync(NEW_DIR) : []
  check('index.ttl, people.ttl and groups.ttl are on the pod, and no access rule', ['index.ttl', 'people.ttl', 'groups.ttl'].every(f => files.includes(f)) && !files.some(f => /acl/.test(f)), files.join(' '))
  const index = await served(NEW + 'index.ttl')
  check('index.ttl is an AddressBook pointing at people.ttl and groups.ttl', /AddressBook/.test(index) && /nameEmailIndex/.test(index) && /people\.ttl/.test(index) && /groupIndex/.test(index) && /groups\.ttl/.test(index), index.slice(0, 300))
  const again = await page.evaluate((base) => window.panes.byName('contacts').mintNew({ dom: document, session: { store: window.SolidLogic.store } }, { newBase: base }).then(() => 'made', e => String(e.message)), NEW)
  check('making a book where one already is is refused, not overwritten', /not created \(412\)/.test(again), again)

  // ---- open it ----
  await page.goto(address(NEW + 'index.ttl#this'))
  await page.waitFor(() => !!document.querySelector('.ctc .ctc-add'), { timeout: 40000 })
  check('the new book opens, empty, with the tools to add', /No one here yet/.test(await page.evaluate(() => document.querySelector('.ctc-list').textContent)) && await page.evaluate(() => !!document.querySelector('.ctc-new-group')))

  // ---- groups ----
  for (const group of ['Friends', 'Work & play']) {
    await page.evaluate(() => document.querySelector('.ctc-new-group').click())
    await page.evaluate((name) => { const f = document.querySelector('.ctc-group-form'); f.querySelector('input').value = name; f.requestSubmit() }, group)
    await settled(page)
  }
  const groupFiles = existsSync(path.join(NEW_DIR, 'Group')) ? readdirSync(path.join(NEW_DIR, 'Group')) : []
  check('new groups: a file each, named as SolidOS names them', groupFiles.includes('Friends.ttl') && groupFiles.includes('Work_play.ttl'), groupFiles.join(' ') + ' :: ' + await status(page))
  const groupsTtl = await served(NEW + 'groups.ttl')
  check('groups.ttl lists both with their names and type', /includesGroup/.test(groupsTtl) && /Group\/Friends\.ttl#this/.test(groupsTtl) && /Work & play/.test(groupsTtl) && /vcard:Group|ns#Group/.test(groupsTtl), groupsTtl.slice(0, 400))
  const friendsTtl = await served(NEW + 'Group/Friends.ttl')
  check('a group file says what it is and which book it is in', /vcard:Group|ns#Group/.test(friendsTtl) && /"Friends"/.test(friendsTtl) && /includesGroup/.test(friendsTtl), friendsTtl.slice(0, 300))
  check('the groups are chips', (await page.evaluate(() => [...document.querySelectorAll('.ctc-chips .ctc-chip')].map(c => c.textContent).join(','))) === 'All contacts,Friends,Work & play')

  // ---- add people ----
  await page.evaluate(() => document.querySelector('.ctc-add').click())
  await fill(page, { name: 'Alice Example', email: 'alice@example.org', phone: '+44 20 7946 0000', role: 'Mathematician', org: 'Example University', note: 'Met at the workshop.\nLikes proofs.' })
  await settled(page)
  check('add Alice: saved', /ctc-good.*Alice Example was added/.test(await status(page)), await status(page))
  let peopleTtl = await served(NEW + 'people.ttl')
  const alicePath = people(peopleTtl)[0]
  check('people.ttl lists her in the book with her name', !!alicePath && /inAddressBook/.test(peopleTtl) && /Alice Example/.test(peopleTtl), peopleTtl.slice(0, 300))
  const ALICE = NEW + alicePath
  let card = await served(ALICE)
  check('her card has type, name, role, organisation, note, email and phone', /Individual/.test(card) && /Alice Example/.test(card) && /Mathematician/.test(card) && /organization-name/.test(card) && /Example University/.test(card) && /Likes proofs/.test(card) && /hasEmail/.test(card) && /mailto:alice@example\.org/.test(card) && /hasTelephone/.test(card) && /tel:\+44-20-7946-0000/.test(card), card)
  check('she is shown and selected', await page.evaluate(() => document.querySelector('.ctc-name').textContent === 'Alice Example' && !!document.querySelector('.ctc-person a[href="tel:+44-20-7946-0000"]')))
  await page.evaluate(() => document.querySelector('.ctc-add').click())
  await fill(page, { name: 'Bob Builder', email: 'not an email' })
  await sleep(1500)
  check('a bad email is refused by the form and nothing is written', await page.evaluate(() => !document.querySelector('form.ctc-form').checkValidity()) && people(await served(NEW + 'people.ttl')).length === 1)
  await fill(page, { name: 'Bob Builder', email: '' })
  await settled(page)
  check('add Bob with a name only', /Bob Builder was added/.test(await status(page)) && (await names(page)) === 'Alice Example,Bob Builder', await names(page))

  // ---- groups for a person ----
  await pick(page, 'Alice Example')
  await page.evaluate(() => { const s = document.querySelector('.ctc-pick'); s.value = [...s.options].find(o => o.textContent === 'Friends').value; s.dispatchEvent(new Event('change')) })
  await settled(page)
  let friends = await served(NEW + 'Group/Friends.ttl')
  check('add Alice to Friends: the group file lists her, with her name', /hasMember/.test(friends) && friends.includes(alicePath) && /Alice Example/.test(friends), friends)
  await page.evaluate(() => [...document.querySelectorAll('.ctc-chips .ctc-chip')].find(c => c.textContent === 'Friends').click())
  check('the Friends chip shows only Alice', (await names(page)) === 'Alice Example', await names(page))
  await page.evaluate(() => [...document.querySelectorAll('.ctc-chips .ctc-chip')].find(c => c.textContent === 'All contacts').click())
  await page.evaluate(() => { const s = document.querySelector('.ctc-pick'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')) })
  await settled(page)
  check('add her to the second group too', /Work & play/.test(await served(NEW + 'Group/Work_play.ttl')) && (await served(NEW + 'Group/Work_play.ttl')).includes(alicePath))
  await page.evaluate(() => document.querySelector('.ctc-x[aria-label*="Work"]').click())
  await settled(page)
  const work = await served(NEW + 'Group/Work_play.ttl')
  check('take her out of it: the file no longer lists her or her name', !work.includes(alicePath) && !/Alice/.test(work), work)

  // ---- edit ----
  await page.evaluate(() => document.querySelector('.ctc-edit').click())
  await page.waitFor(() => !!document.querySelector('form.ctc-form'), { timeout: 5000 })
  const form = await page.evaluate(() => [...document.querySelectorAll('form.ctc-form input, form.ctc-form textarea')].map(i => i.name + '=' + i.value).join('|'))
  check('the edit form holds what she has, plus a blank for another email and phone', form.includes('name=Alice Example') && form.includes('email=alice@example.org|email=|') && form.includes('phone=+44-20-7946-0000|phone=|'), form)
  await fill(page, { name: 'Alice Smith', 'email#0': 'alice@example.com', 'phone#1': '+420 777 000 111', role: '', org: 'Example Institute' })
  await settled(page)
  check('edit: saved', /ctc-good :: Saved\./.test(await status(page)), await status(page))
  card = await served(ALICE)
  check('the card has the new name, email, both phones, organisation, and no role', /Alice Smith/.test(card) && !/Alice Example/.test(card) && /mailto:alice@example\.com/.test(card) && !/alice@example\.org/.test(card) && /tel:\+44-20-7946-0000/.test(card) && /tel:\+420-777-000-111/.test(card) && /Example Institute/.test(card) && !/Mathematician/.test(card), card)
  check('the new name is in people.ttl and in her group too', /Alice Smith/.test(await served(NEW + 'people.ttl')) && !/Alice Example/.test(await served(NEW + 'people.ttl')) && /Alice Smith/.test(await served(NEW + 'Group/Friends.ttl')))
  await page.evaluate(() => document.querySelector('.ctc-edit').click())
  await fill(page, { 'phone#0': '' })
  await settled(page)
  card = await served(ALICE)
  check('emptying a phone removes it', !/7946/.test(card) && /777-000-111/.test(card), card)

  // ---- delete ----
  await pick(page, 'Bob Builder')
  const BOB = NEW + people(await served(NEW + 'people.ttl')).find(p => p !== alicePath)
  const bobDir = path.join(NEW_DIR, BOB.slice(NEW.length).replace(/index\.ttl$/, ''))
  await page.evaluate(() => document.querySelector('.ctc-delete').click())
  await sleep(500)
  check('one press on Delete only asks', /Press again/.test(await page.evaluate(() => document.querySelector('.ctc-delete').textContent)) && existsSync(bobDir) && /Bob/.test(await served(NEW + 'people.ttl')))
  await page.evaluate(() => document.querySelector('.ctc-delete').click())
  await settled(page)
  check('the second press deletes Bob: out of the list and people.ttl, card and folder gone', /Bob Builder was deleted/.test(await status(page)) && (await names(page)) === 'Alice Smith' && !/Bob/.test(await served(NEW + 'people.ttl')) && !existsSync(bobDir), (await status(page)) + ' :: ' + existsSync(bobDir))

  // ---- reload ----
  await page.goto(address(NEW + 'index.ttl#this'))
  await page.waitFor(() => document.querySelectorAll('.ctc-row').length === 1 && /Example Institute/.test(document.querySelector('.ctc-list').textContent) && document.querySelectorAll('.ctc-chips .ctc-chip').length === 3, { timeout: 40000 })
  await sleep(500)
  await pick(page, 'Alice Smith')
  const back = await page.evaluate(() => document.querySelector('.ctc-person').textContent)
  check('after a reload it reads back the same', /alice@example\.com/.test(back) && /\+420-777-000-111/.test(back) && /Likes proofs/.test(back) && (await page.evaluate(() => [...document.querySelectorAll('.ctc-tag')].map(t => t.firstChild.textContent).join(','))) === 'Friends', back)
  await shot('book-1300')

  // ---- a book written by hand, in the upstream shape ----
  await page.goto(address(HAND + 'index.ttl#this'))
  await page.waitFor(() => document.querySelectorAll('.ctc-row').length === 3 && !!document.querySelector('.ctc-add'), { timeout: 40000 })
  await pick(page, 'Alice Example')
  await page.evaluate(() => document.querySelector('.ctc-edit').click())
  await fill(page, { email: 'alice@example.net', note: 'Changed by the pane.' })
  await settled(page)
  card = await served(HAND + 'Person/alice/index.ttl')
  check('a blank-node email (as SolidOS writes it) can be changed', /ctc-good/.test(await status(page)) && /mailto:alice@example\.net/.test(card) && !/alice@example\.org/.test(card) && /Changed by the pane/.test(card) && /Cell/.test(card), (await status(page)) + ' :: ' + card)
  await pick(page, 'Carol Danvers')
  await page.evaluate(() => document.querySelector('.ctc-x[aria-label*="Friends"]').click())
  await settled(page)
  friends = await served(HAND + 'Group/Friends.ttl')
  check('Carol, a member by her WebID, can be taken out: WebID, sameAs and name go', !/carol\.example\.org/.test(friends) && !/Carol/.test(friends) && /Person\/alice/.test(friends), friends)
  await page.evaluate(() => { const s = document.querySelector('.ctc-pick'); s.value = [...s.options].find(o => o.textContent === 'Work').value; s.dispatchEvent(new Event('change')) })
  await settled(page)
  const handWork = await served(HAND + 'Group/Work.ttl')
  check('Carol added to a group is listed by her WebID, linked to her card, as SolidOS does', /hasMember[^;]*<https:\/\/carol\.example\.org\/profile\/card#me>/.test(handWork) && /sameAs/.test(handWork) && /Carol Danvers/.test(handWork), handWork)
  check('no sideways scroll at 1300 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.evaluate(() => document.querySelector('.ctc-add').click())
  await shot('add-1300')
  await page.close()

  // ---- the same session at 400 px ----
  ;({ page, check: check0, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: here, width: 400, login: false, fresh: false, resource: NEW + 'index.ttl#this' }))
  await page.waitFor(() => document.querySelectorAll('.ctc-row').length === 1 && !!document.querySelector('.ctc-add'), { timeout: 40000 })
  await narrow(page) // a true 400 px page (design/viewport.mjs)
  await page.waitFor(() => !!document.querySelector('.ctc-add'), { timeout: 10000 })
  check('400 px: still logged in, with the tools', true)
  const fits = async (what) => { const m = await measure(page); check('true 400 px: no sideways scroll ' + what, m.innerWidth === 400 && !m.sideways, m.innerWidth + '/' + m.scrollWidth + ' ' + m.poking.join(' ')) }
  await fits('on the list')
  check('400 px: no sideways scroll on the list', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await pick(page, 'Alice Smith')
  await page.evaluate(() => document.querySelector('.ctc-edit').click())
  await sleep(400)
  check('400 px: the edit form fits', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && getComputedStyle(document.querySelector('.ctc-side')).display === 'none'))
  await fits('on the edit form')
  await shot('edit-400')
  await page.evaluate(() => [...document.querySelectorAll('form.ctc-form button')].find(b => b.textContent === 'Cancel').click())
  await page.evaluate(() => document.querySelector('.ctc-delete').click())
  await sleep(300)
  check('400 px: the armed Delete button fits', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await fits('with the armed Delete button')
  await shot('person-400')
  await page.evaluate(() => document.querySelector('.ctc-back').click())
  check('400 px: back to the list', await page.evaluate(() => getComputedStyle(document.querySelector('.ctc-side')).display !== 'none'))
  await page.evaluate(() => document.querySelector('.ctc-add').click())
  await sleep(300)
  check('400 px: the add form fits', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await fits('on the add form')
  await shot('add-400')

  if (process.env.KEEP) console.log('kept: ' + NEW + ' and ' + HAND)
  else { rmSync(NEW_DIR, { recursive: true, force: true }); rmSync(HAND_DIR, { recursive: true, force: true }) }
  if (failed) check0('every check above', false, failed + ' failed')
  await finish()
} catch (error) { await finish(error) }
