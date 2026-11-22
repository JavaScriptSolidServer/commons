// Editing a profile: logged in, on a copy of Alice's profile in the lab folder (never the real one).
// Every action the pane offers, checked on the pod; then a reload; then the result in the view pane
// and in SolidOS's own profile pane.
//   node tests/edit.mjs
import { open } from '../../lib/lib.mjs'
import { PANE, VIEW_PANE, PORT, ME, DOC, FOLDER, freshCopy, files, facts, has, menuEdit, show, sleep, realProfileHash } from './common.mjs'
import path from 'node:path'

const F = 'http://xmlns.com/foaf/0.1/'
const V = 'http://www.w3.org/2006/vcard/ns#'
const S = 'http://schema.org/'
const SO = 'http://www.w3.org/ns/solid/terms#'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const H = DOC + '#'

const realBefore = realProfileHash()
freshCopy()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, resource: ME })
const part = (name) => `.pfe [data-part=${name}]`
// Do something in the page, then wait until the given message says how it went.
async function act (msgSelector, fn, arg) {
  await page.evaluate((sel) => { for (const m of document.querySelectorAll(sel)) m.textContent = '' }, msgSelector)
  await page.evaluate(fn, arg)
  await page.waitFor((sel) => { const m = document.querySelector(sel); return !!m && m.textContent && !/Uploading/.test(m.textContent) }, { timeout: 30000, args: [msgSelector] })
  return page.evaluate((sel) => document.querySelector(sel).textContent, msgSelector)
}
const field = (key) => page.evaluate((k) => document.querySelector(`.pfe [name=${k}]`).value, key)
const listText = (name) => page.evaluate((n) => [...document.querySelectorAll(`.pfe [data-part=${n}] .pfe-list li:not(.pfe-empty) > span:not(.pfe-face)`)].map(s => s.textContent), name)
const add = (name, values) => act(part(name) + ' > .pfe-msg', (args) => {
  const [n, vals] = JSON.parse(args)
  const form = document.querySelector(`.pfe [data-part=${n}] form`)
  const controls = form.querySelectorAll('input, select')
  vals.forEach((v, i) => { controls[i].value = v })
  form.requestSubmit()
}, JSON.stringify([name, values]))
const remove = (name, text) => act(part(name) + ' > .pfe-msg', (args) => {
  const [n, t] = JSON.parse(args)
  const li = [...document.querySelectorAll(`.pfe [data-part=${n}] .pfe-list li`)].find(l => l.textContent.includes(t))
  li.querySelector('button.pfe-remove').click()
}, JSON.stringify([name, text]))

try {
  // The profile document (not #me) is where SolidOS shows a pane menu; the pane edits the person it is about.
  await page.goto(address(DOC))
  await page.waitFor((d) => !!(window.panes && window.panes.byName('profile-edit-lab')) && window.SolidLogic.store.updater.editable(d), { timeout: 40000, args: [DOC] })
  await sleep(2500)
  const labels = await page.evaluate((u) => { const p = window.panes.byName('profile-edit-lab'); const s = window.SolidLogic.store; return [p.label(s.sym(u), { session: { store: s } }), p.label(s.sym(u.split('#')[0]), { session: { store: s } }), p.label(s.sym(u.split('#')[0] + '#nobody'), { session: { store: s } }), p.shouldGetFocus(s.sym(u))] }, ME)
  check('label: "Edit profile" on the person and on their profile document, null on anything else, never focus', labels[0] === 'Edit profile' && labels[1] === 'Edit profile' && labels[2] === null && labels[3] === false, JSON.stringify(labels))
  check('it does not open by itself', await page.evaluate(() => !document.querySelector('.pfe')))
  check('it is offered in the pane menu as "Edit profile"', await menuEdit(page))
  await page.waitFor(() => !!document.querySelector('.pfe [data-part=basics] [name=name]'), { timeout: 20000 })
  await sleep(500)

  // ----- the form reads what is there -----
  const read = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pfe [data-part=basics] [name]')].map(i => [i.name, i.value])))
  check('basics are read: name, nickname, pronouns, job, organisation, place, home page, bio',
    read.name === 'Alice Example' && read.nick === 'alice' && read.pronouns === 'she/her' && read.job === 'Lead engineer' && read.org === 'Example Labs' && read.city === 'Lisbon' && read.country === 'Portugal' && read.homepage === 'https://alice.example.org/' && /^Builds tools/.test(read.bio), JSON.stringify(read).slice(0, 300))
  check('emails and phones are read', JSON.stringify(await listText('emails')) === JSON.stringify(['alice@example.orgWork', 'alice.home@example.netHome']) && (await listText('phones'))[0] === '+351-210-000-000Cell', JSON.stringify([await listText('emails'), await listText('phones')]))
  check('skills are read, including one named through solid:publicId', JSON.stringify(await listText('skills')) === JSON.stringify(['Linked Data', 'JavaScript', 'User experience design']), JSON.stringify(await listText('skills')))
  check('languages are read from a list and a plain value', JSON.stringify((await listText('languages')).sort()) === JSON.stringify(['EnglishNative', 'GermanBasic', 'PortugueseFluent']), JSON.stringify(await listText('languages')))
  check('accounts are read from a list and a plain value', (await listText('accounts')).length === 3, JSON.stringify(await listText('accounts')))
  check('people I know are read', JSON.stringify(await listText('friends')) === JSON.stringify(['Bob Example' + 'bob']) || (await listText('friends'))[0].startsWith('Bob Example'), JSON.stringify(await listText('friends')))
  check('the resume is not editable here, and says so', /not available here yet/.test(await page.evaluate(() => document.querySelector('.pfe [data-part=resume]').textContent)))

  // ----- basics: one PATCH per changed field -----
  const bio = 'Writes small programs, mostly for maps.\nSecond line.'
  await act('.pfe [data-part=basics] .pfe-actions .pfe-msg', (b) => {
    const set = (n, v) => { document.querySelector(`.pfe [name=${n}]`).value = v }
    set('name', 'Alice Q. Example'); set('pronouns', 'they/them'); set('job', 'Principal engineer'); set('org', 'Example Labs Ltd')
    set('city', 'Porto'); set('homepage', 'http://insecure.example.org/'); set('bio', b); set('nick', '')
    document.querySelector('.pfe [data-part=basics] form').requestSubmit()
  }, bio)
  const msgs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pfe [data-part=basics] [data-field]')].map(m => [m.dataset.field, m.textContent])))
  console.log('     ' + JSON.stringify(msgs))
  check('each changed field says Saved; the untouched ones say nothing', ['name', 'pronouns', 'job', 'org', 'city', 'bio', 'nick'].every(k => msgs[k] === 'Saved') && !msgs.country)
  check('a http:// home page is refused, and the text is kept', /^Not saved: only https/.test(msgs.homepage) && await field('homepage') === 'http://insecure.example.org/', msgs.homepage)
  let t = await facts(page)
  check('pod: foaf:name and vcard:fn both changed, the old name gone', has(t, ME, F + 'name', 'Alice Q. Example') && has(t, ME, V + 'fn', 'Alice Q. Example') && !/Alice Example$/m.test(t))
  check('pod: pronouns, current role title, organisation name, town, bio', has(t, ME, SO + 'preferredSubjectPronoun', 'they') && has(t, ME, SO + 'preferredObjectPronoun', 'them') &&
    has(t, H + 'role-now', V + 'role', 'Principal engineer') && has(t, H + 'org-labs', S + 'name', 'Example Labs Ltd') && has(t, H + 'address', V + 'locality', 'Porto') && t.includes(ME + ' ' + V + 'note ' + bio))
  check('pod: the cleared nickname is gone; the home page is unchanged; the past role untouched', !t.includes(F + 'nick') && has(t, ME, F + 'homepage', 'https://alice.example.org/') && has(t, H + 'role-before', V + 'role', 'Web developer'))
  await act('.pfe [data-part=basics] .pfe-actions .pfe-msg', () => { document.querySelector('.pfe [name=homepage]').value = 'https://alice.example.com/'; document.querySelector('.pfe [data-part=basics] form').requestSubmit() })
  t = await facts(page)
  check('a https:// home page is saved in place of the old one', has(t, ME, F + 'homepage', 'https://alice.example.com/') && !t.includes('https://alice.example.org/\n') && !has(t, ME, F + 'homepage', 'https://alice.example.org/'))
  // Text a SPARQL patch on JSS loses (braces, quotes): written whole now, so it must be stored exactly (REVIEW 2).
  const odd = 'Likes {curly} braces and "quotes".'
  const oddMsg = await act('.pfe [data-field=bio]', (v) => { document.querySelector('.pfe [name=bio]').value = v; document.querySelector('.pfe [data-part=basics] form').requestSubmit() }, odd)
  t = await facts(page)
  const oddStored = t.includes(ME + ' ' + V + 'note ' + odd)
  console.log('     bio with braces and quotes: ' + oddMsg + (oddStored ? ' (stored exactly)' : ' (not stored exactly)'))
  check('text with braces and quotes is saved exactly, and said so', oddMsg === 'Saved' && oddStored, oddMsg)
  await act('.pfe [data-field=bio]', (v) => { document.querySelector('.pfe [name=bio]').value = v; document.querySelector('.pfe [data-part=basics] form').requestSubmit() }, bio)
  t = await facts(page)
  check('the bio can be saved again after that', t.includes(ME + ' ' + V + 'note ' + bio))
  check('saving with nothing changed says so', /Nothing has changed/.test(await act('.pfe [data-part=basics] .pfe-actions .pfe-msg', () => document.querySelector('.pfe [data-part=basics] form').requestSubmit())))
  const noName = await act('.pfe [data-field=name]', () => { document.querySelector('.pfe [name=name]').value = ''; document.querySelector('.pfe [data-part=basics] form').requestSubmit() })
  check('an empty name is refused and the field keeps what was typed', /^Not saved: a profile needs a name/.test(noName) && await field('name') === '', noName)
  await page.evaluate(() => { document.querySelector('.pfe [name=name]').value = 'Alice Q. Example' })

  // ----- photo -----
  const photoMsg = part('photo') + ' .pfe-msg'
  check('the current photo is shown', await page.evaluate(() => /^data:image\/svg/.test(document.querySelector('.pfe [data-part=photo] img.pfe-photo')?.src || '')))
  check('a photo link that is not https is refused', /^Not saved: only https/.test(await act(photoMsg, () => { document.querySelector('.pfe [data-part=photo] input[inputmode=url]').value = 'http://pics.example.org/a.png'; [...document.querySelectorAll('.pfe [data-part=photo] button')].find(b => b.textContent === 'Use this link').click() })))
  await act(photoMsg, () => { document.querySelector('.pfe [data-part=photo] input[inputmode=url]').value = 'https://pics.example.org/alice.png'; [...document.querySelectorAll('.pfe [data-part=photo] button')].find(b => b.textContent === 'Use this link').click() })
  t = await facts(page)
  check('photo by link: foaf:img (the property already used) points at it, the old one is gone', has(t, ME, F + 'img', 'https://pics.example.org/alice.png') && !t.includes('data:image/svg') && !t.includes(V + 'hasPhoto'))
  const tooBig = await act(photoMsg, () => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(2 * 1024 * 1024 + 10)], 'big.png', { type: 'image/png' }))
    const input = document.querySelector('.pfe [data-part=photo] input[type=file]'); input.files = dt.files
    ;[...document.querySelectorAll('.pfe [data-part=photo] button')].find(b => b.textContent === 'Upload').click()
  })
  check('a picture over 2 MB is refused before upload', /larger than 2 MB/.test(tooBig) && !files().some(f => f.startsWith('photo-')), tooBig)
  const notImage = await act(photoMsg, () => {
    const dt = new DataTransfer(); dt.items.add(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))
    document.querySelector('.pfe [data-part=photo] input[type=file]').files = dt.files
    ;[...document.querySelectorAll('.pfe [data-part=photo] button')].find(b => b.textContent === 'Upload').click()
  })
  check('an SVG or other non-picture file is refused', /PNG, JPEG/.test(notImage), notImage)
  const uploaded = await act(photoMsg, async () => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64
    const g = canvas.getContext('2d'); g.fillStyle = '#7c4dff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(16, 16, 32, 32)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'me.png', { type: 'image/png' }))
    document.querySelector('.pfe [data-part=photo] input[type=file]').files = dt.files
    ;[...document.querySelectorAll('.pfe [data-part=photo] button')].find(b => b.textContent === 'Upload').click()
  })
  const photoFile = files().find(f => /^photo-.*\.png$/.test(f))
  t = await facts(page)
  check('upload: the picture is stored next to the profile with a fresh name', uploaded === 'Photo saved' && !!photoFile, uploaded + ' ' + files().join(' '))
  check('upload: the profile points at it', !!photoFile && has(t, ME, F + 'img', DOC.replace(/card\.jsonld$/, '') + photoFile))
  check('upload: the picture is shown', await page.waitFor(() => { const i = document.querySelector('.pfe [data-part=photo] img.pfe-photo'); return i && /photo-.*\.png$/.test(i.src) && i.complete && i.naturalWidth === 64 }, { timeout: 10000 }).catch(() => false))
  await act(photoMsg, () => [...document.querySelectorAll('.pfe [data-part=photo] button')].find(b => b.textContent === 'Remove photo').click())
  t = await facts(page)
  check('remove photo: no foaf:img or vcard:hasPhoto left; initials shown', !t.includes(F + 'img') && !t.includes(V + 'hasPhoto') && await page.evaluate(() => document.querySelector('.pfe [data-part=photo] .pfe-photo').textContent === 'AE'))

  // ----- emails and phones -----
  check('an email that is not an email is refused, text kept', /^Not saved: that does not look like an email/.test(await add('emails', ['not-an-email', 'Home'])) && await page.evaluate(() => document.querySelector('.pfe [data-part=emails] form input').value === 'not-an-email'))
  check('add an email', (await add('emails', ['carol.alice@example.com', 'Work'])) === 'Added')
  t = await facts(page)
  const mailNode = t.split('\n').find(l => l.endsWith(V + 'value mailto:carol.alice@example.com'))
  const mailId = mailNode && mailNode.split(' ')[0]
  check('pod: vcard:hasEmail <#id…> a vcard:Work ; vcard:value <mailto:…>', !!mailId && mailId.startsWith(H + 'id') && has(t, ME, V + 'hasEmail', mailId) && has(t, mailId, RDF, V + 'Work'), mailNode)
  check('the same email twice is refused', /already in your profile/.test(await add('emails', ['carol.alice@example.com', 'Home'])))
  await remove('emails', 'alice.home@example.net')
  t = await facts(page)
  check('remove an email: its link and its description are gone, the others stay', !t.includes('alice.home@example.net') && !t.includes(H + 'email-home') && has(t, H + 'email-work', V + 'value', 'mailto:alice@example.org'))
  await add('phones', ['+420 777 000 111', 'Home'])
  t = await facts(page)
  check('add a phone: tel: link without spaces, typed Home', /vcard\/ns#value tel:\+420777000111$/m.test(t) && t.split('\n').some(l => l.endsWith(RDF + ' ' + V + 'Home')))
  check('a phone with letters is refused', /^Not saved: a phone number/.test(await add('phones', ['call me', 'Cell'])))
  await remove('phones', '+351')
  t = await facts(page)
  check('remove a phone', !t.includes('+351') && !t.includes(H + 'phone '))

  // ----- skills -----
  await add('skills', ['Cooking'])
  t = await facts(page)
  check('add a skill: schema:skills <#id…> with schema:name', t.split('\n').some(l => l.endsWith(S + 'name Cooking') && l.startsWith(H + 'id')))
  check('the same skill twice (any case) is refused', /already there/.test(await add('skills', ['cooking'])))
  await remove('skills', 'Linked Data')
  await remove('skills', 'User experience')
  t = await facts(page)
  check('remove skills: link, entry and its own publicId description are gone', !t.includes('Linked Data') && !t.includes(H + 'skill-ux') && !t.includes(H + 'esco-ux') && has(t, H + 'skill-js', S + 'name', 'JavaScript'))
  check('skills list now', JSON.stringify(await listText('skills')) === JSON.stringify(['JavaScript', 'Cooking']), JSON.stringify(await listText('skills')))

  // ----- languages -----
  await add('languages', ['fr', 'Conversational'])
  t = await facts(page)
  check('add a language: solid:publicId lang:fr and a level, plain value', t.split('\n').some(l => l.endsWith(SO + 'publicId https://www.w3.org/ns/iana/language-code/fr')) && t.split('\n').some(l => l.endsWith(S + 'proficiencyLevel Conversational')))
  check('a language already there is refused', /already there/.test(await add('languages', ['pt', ''])))
  await remove('languages', 'Portuguese')
  await remove('languages', 'German')
  t = await facts(page)
  check('remove two languages: link and description gone, English stays', !t.includes(H + 'lang-pt') && !t.includes(H + 'lang-de') && t.includes(H + 'lang-en '))
  check('languages list now', JSON.stringify((await listText('languages')).sort()) === JSON.stringify(['EnglishNative', 'FrenchConversational']), JSON.stringify(await listText('languages')))

  // ----- accounts -----
  await add('accounts', ['BlueSkyAccount', 'alice.example.org'])
  await add('accounts', ['OtherAccount', 'https://notes.example.org/alice'])
  check('an Other account needs a https link', /^Not saved: that is not a web address/.test(await add('accounts', ['OtherAccount', 'alice'])))
  t = await facts(page)
  check('add accounts: typed in the upstream social ontology, with a home page', t.split('\n').some(l => l.endsWith(F + 'homepage https://bsky.app/profile/alice.example.org')) && t.includes('socialMedia.ttl#BlueSkyAccount') && t.split('\n').some(l => l.endsWith(F + 'homepage https://notes.example.org/alice')))
  await remove('accounts', 'LinkedIn')
  await remove('accounts', 'Mastodon')
  t = await facts(page)
  check('remove two accounts', !t.includes(H + 'acc-linkedin ') && !t.includes(H + 'acc-mastodon') && t.includes(H + 'acc-github '))

  // ----- people I know -----
  check('a WebID that is not a web address is refused', /^Not saved: that is not a web address/.test(await add('friends', ['bob'])))
  const someone = 'http://127.0.0.1:8732/me/profile/card.jsonld#me'
  await add('friends', [someone])
  t = await facts(page)
  check('add someone: foaf:knows <WebID>', has(t, ME, F + 'knows', someone))
  check('their name shows once their profile loads', await page.waitFor((u) => [...document.querySelectorAll('.pfe [data-part=friends] li a')].some(a => a.href === u && a.textContent === 'me'), { timeout: 15000, args: [someone] }).catch(() => false))
  await remove('friends', 'Bob Example')
  t = await facts(page)
  check('remove someone: only the foaf:knows link goes', !has(t, ME, F + 'knows', H + 'bob') && has(t, H + 'bob', F + 'name', 'Bob Example'))

  // ----- what it must never touch -----
  t = await facts(page)
  const kept = [[SO + 'oidcIssuer', 'https://idp.example.org/'], ['http://www.w3.org/ns/pim/space#storage', 'https://alice.example.org/storage/'], ['http://www.w3.org/ns/pim/space#preferencesFile', 'https://alice.example.org/storage/settings/prefs.jsonld'],
    [SO + 'publicTypeIndex', 'https://alice.example.org/storage/settings/publicTypeIndex.jsonld'], [SO + 'privateTypeIndex', 'https://alice.example.org/storage/settings/privateTypeIndex.jsonld'], ['http://www.w3.org/ns/ldp#inbox', 'https://alice.example.org/storage/inbox/'], ['https://www.w3.org/ns/cid/v1#verificationMethod', H + 'key-1']]
  check('login provider, storage, settings, type indexes, inbox and key link are exactly as they were', kept.every(([pr, o]) => has(t, ME, pr, o)))
  check('the keys themselves are untouched', has(t, ME, 'http://www.w3.org/ns/auth/cert#key', H + 'key-rsa') && has(t, H + 'key-rsa', 'http://www.w3.org/ns/auth/cert#modulus', '00c0ffee00c0ffee') && has(t, H + 'key-1', 'https://www.w3.org/ns/cid/v1#publicKeyMultibase', 'z6MkExampleExampleExampleExampleExampleExample'))
  check('the real logged-in profile was not touched', realProfileHash() === realBefore)

  // ----- reload: reads back the same -----
  await page.goto(address(ME))
  await page.waitFor(() => !!(window.panes && window.panes.byName('profile-edit-lab')), { timeout: 40000 })
  await sleep(2000)
  await show(page, 'profile-edit-lab', '.pfe')
  const again = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pfe [data-part=basics] [name]')].map(i => [i.name, i.value])))
  check('after a reload the form reads back the saved values', again.name === 'Alice Q. Example' && again.pronouns === 'they/them' && again.job === 'Principal engineer' && again.org === 'Example Labs Ltd' && again.city === 'Porto' && again.nick === '' && again.homepage === 'https://alice.example.com/' && again.bio === bio, JSON.stringify(again).slice(0, 300))
  const lists = { emails: await listText('emails'), skills: await listText('skills'), languages: (await listText('languages')).sort(), accounts: await listText('accounts'), friends: await listText('friends') }
  console.log('     ' + JSON.stringify(lists))
  check('after a reload the lists read back the same', lists.emails.length === 2 && lists.skills.join() === 'JavaScript,Cooking' && lists.languages.join() === 'EnglishNative,FrenchConversational' && lists.accounts.length === 3 && lists.friends.length === 1)
  check('no sideways scroll at 1300 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await shot('edit-1300')
  await page.evaluate(() => document.querySelector('.pfe [data-part=photo]').scrollIntoView())
  await sleep(800)
  await shot('edit-1300-lists')
  await page.evaluate(() => document.querySelector('.pfe [data-part=languages]').scrollIntoView())
  await sleep(800)
  await shot('edit-1300-lists-2')

  // ----- the read-only view pane shows what was written -----
  await page.evaluate(async (u) => { window.panes.register((await import(URL.createObjectURL(new Blob([u], { type: 'text/javascript' })))).default) }, VIEW_PANE)
  await show(page, 'profile-view', '.prf-root')
  await page.waitFor(() => !!document.querySelector('.prf-root:not(.was-here) .prf-name'), { timeout: 20000 })
  await sleep(1500)
  const view = await page.evaluate(() => { const r = document.querySelector('.prf-root:not(.was-here)'); const txt = (s) => [...r.querySelectorAll(s)].map(e => e.textContent.trim()); return { name: txt('.prf-name')[0], sub: txt('.prf-sub span'), bio: txt('.prf-bio')[0], skills: txt('.prf-s-skills li'), langs: txt('.prf-langs li'), social: txt('.prf-social a'), friends: txt('.prf-friend span'), contact: txt('.prf-contacts li') } })
  console.log('     view pane: ' + JSON.stringify(view))
  check('view pane: name, pronouns, job, place', view.name === 'Alice Q. Example' && view.sub.includes('they/them') && view.sub.includes('Principal engineer') && view.sub.includes('Porto, Portugal'))
  check('view pane: bio, skills, languages', view.bio === bio && view.skills.join() === 'JavaScript,Cooking' && view.langs.some(l => /^French/.test(l)) && !view.langs.some(l => /Portuguese|German/.test(l)))
  check('view pane: accounts, people, contact', view.social.some(s => /Bluesky/.test(s)) && view.social.some(s => /notes\.example\.org/.test(s)) && !view.social.some(s => /LinkedIn|Mastodon/.test(s)) && view.friends.join() === 'me' && view.contact.some(c => c.includes('carol.alice@example.com')) && view.contact.some(c => c.includes('+420777000111')) && view.contact.some(c => c.includes('alice.example.com')))
  await shot('view-pane-after-edit')

  // ----- SolidOS's own profile pane shows it too -----
  await show(page, 'profile', '.profile-grid, [data-testid=profile-view], .profile', ME).catch(() => {})
  await sleep(2500)
  const upstream = await page.evaluate(() => { const box = document.getElementById('OutlineView') || document.body; const parts = []; const walk = (n) => { for (const e of n.querySelectorAll('*')) { if (e.shadowRoot) { parts.push(e.shadowRoot.textContent); walk(e.shadowRoot) } } }; walk(box); return box.innerText + ' ' + parts.join(' ') })
  // (This browser page draws no profile heading, so pronouns and the photo are not visible there to check.)
  const seen = ['Alice Q. Example', 'Principal engineer', 'Porto', 'Cooking', 'French', 'carol.alice@example.com', 'Writes small programs'].map(w => [w, upstream.includes(w)])
  console.log('     upstream profile pane: ' + JSON.stringify(seen))
  await page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop) e.scrollTop = 0 })
  check('SolidOS profile pane shows the name, job, town, a new skill, a new language, a new email and the bio', seen.every(([, ok]) => ok))
  await shot('upstream-after-edit')
  await finish()
} catch (error) { await finish(error) }
