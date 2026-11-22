// Editing a Turtle profile written in older shapes (Carol): a vCard-only name, values straight on the person,
// RDF lists, a blank-node email and key. Reuses the login left by edit.mjs.
//   node tests/turtle.mjs
import { open } from '../../lib/lib.mjs'
import { PANE, VIEW_PANE, PORT, CAROL, freshCopy, facts, has, show, sleep } from './common.mjs'

const F = 'http://xmlns.com/foaf/0.1/'
const V = 'http://www.w3.org/2006/vcard/ns#'
const S = 'http://schema.org/'
const DOC = CAROL.split('#')[0]
const H = DOC + '#'
if (process.argv[2] === 'fresh') freshCopy()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, resource: CAROL, login: false, fresh: false })
async function act (msgSelector, fn, arg) {
  await page.evaluate((sel) => { for (const m of document.querySelectorAll(sel)) m.textContent = '' }, msgSelector)
  await page.evaluate(fn, arg)
  await page.waitFor((sel) => { const m = document.querySelector(sel); return !!m && !!m.textContent }, { timeout: 30000, args: [msgSelector] })
  return page.evaluate((sel) => document.querySelector(sel).textContent, msgSelector)
}
const listText = (name) => page.evaluate((n) => [...document.querySelectorAll(`.pfe [data-part=${n}] .pfe-list li:not(.pfe-empty) > span`)].map(s => s.textContent), name)
const remove = (name, text) => act(`.pfe [data-part=${name}] > .pfe-msg`, (args) => {
  const [n, t] = JSON.parse(args)
  ;[...document.querySelectorAll(`.pfe [data-part=${n}] .pfe-list li`)].find(l => l.textContent.includes(t)).querySelector('button.pfe-remove').click()
}, JSON.stringify([name, text]))

try {
  await page.goto(address(CAROL))
  await page.waitFor(() => !!(window.panes && window.panes.byName('profile-edit-lab')), { timeout: 40000 })
  await sleep(2500)
  check('logged in from the last run, and it applies to a vcard:Individual', await page.evaluate((u) => window.panes.byName('profile-edit-lab').label(window.$rdf.sym(u), { session: { store: window.SolidLogic.store } }) === 'Edit profile', CAROL))
  await show(page, 'profile-edit-lab', '.pfe', CAROL)
  const read = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pfe [data-part=basics] [name]')].map(i => [i.name, i.value])))
  check('older shapes are read: vcard:fn, vcard:nickname, vcard:title, schema:description', read.name === 'Carol Example' && read.nick === 'caz' && read.job === 'Map maker' && read.bio === 'Draws maps of small towns.', JSON.stringify(read))
  const lists = { emails: await listText('emails'), phones: await listText('phones'), skills: await listText('skills'), languages: await listText('languages'), accounts: await listText('accounts'), friends: await listText('friends') }
  console.log('     ' + JSON.stringify(lists))
  check('lists are read: foaf:mbox and a blank-node email, foaf:phone, a plain-text skill, languages and accounts in RDF lists, a friend',
    lists.emails.join() === 'carol.home@example.netHome,carol@example.net' && lists.phones.join() === '+44-20-7946-0000' && lists.skills.join() === 'Cartography' &&
    lists.languages.join() === 'EnglishNative,CzechBasic' && lists.accounts.length === 1 && /^GitHub/.test(lists.accounts[0]) && lists.friends.join() === 'alice.example.org')
  check('the blank-node email cannot be removed here, and says why', await page.evaluate(() => { const b = [...document.querySelectorAll('.pfe [data-part=emails] li')].find(l => l.textContent.includes('carol.home')).querySelector('button'); return b.disabled && /does not change/.test(b.title) }))

  await act('.pfe [data-part=basics] .pfe-actions .pfe-msg', () => {
    const set = (n, v) => { document.querySelector(`.pfe [name=${n}]`).value = v }
    set('name', 'Carol B. Example'); set('nick', 'cazzy'); set('job', 'Senior map maker'); set('bio', 'Draws maps.')
    document.querySelector('.pfe [data-part=basics] form').requestSubmit()
  })
  let t = await facts(page, DOC)
  check('name: foaf:name added, vcard:fn kept in step', has(t, H + 'me', F + 'name', 'Carol B. Example') && has(t, H + 'me', V + 'fn', 'Carol B. Example') && !t.includes('Carol Example\n'))
  check('nickname: vcard:nickname changed, no foaf:nick added', has(t, H + 'me', V + 'nickname', 'cazzy') && !t.includes(F + 'nick'))
  check('job: vcard:title changed in place (no role invented)', has(t, H + 'me', V + 'title', 'Senior map maker') && !t.includes('CurrentRole'))
  check('bio: vcard:note written; schema:description left as it was', has(t, H + 'me', V + 'note', 'Draws maps.') && has(t, H + 'me', S + 'description', 'Draws maps of small towns.'))

  await remove('skills', 'Cartography')
  await remove('languages', 'Czech')
  await remove('accounts', 'GitHub')
  await remove('emails', 'carol@example.net')
  t = await facts(page, DOC)
  check('remove a plain-text skill', !t.includes('Cartography'))
  check('remove items inside RDF lists: their descriptions go, the lists stay', !t.split('\n').some(l => l.startsWith(H + 'lang-cs ') || l.startsWith(H + 'acc-github ')) && has(t, H + 'me', S + 'knowsLanguage', '( ' + H + 'lang-en ' + H + 'lang-cs )') && has(t, H + 'lang-en', 'http://www.w3.org/ns/solid/terms#publicId', 'https://www.w3.org/ns/iana/language-code/en'))
  check('remove a foaf:mbox email: only that link goes', !t.includes('mailto:carol@example.net') && t.includes('mailto:carol.home@example.net'))
  check('the blank-node key and the login provider are untouched', t.includes('cert#modulus 00beef') && has(t, H + 'me', 'http://www.w3.org/ns/solid/terms#oidcIssuer', 'https://idp.example.net/'))

  await show(page, 'profile-edit-lab', '.pfe', CAROL)
  const after = { languages: await listText('languages'), accounts: await listText('accounts'), skills: await listText('skills') }
  check('after a reload: Czech, GitHub and the skill are gone, English stays', after.languages.join() === 'EnglishNative' && !after.accounts.length && !after.skills.length, JSON.stringify(after))

  await page.evaluate(async (u) => { if (!window.panes.byName('profile-view')) window.panes.register((await import(URL.createObjectURL(new Blob([u], { type: 'text/javascript' })))).default) }, VIEW_PANE)
  await show(page, 'profile-view', '.prf-root', CAROL)
  await page.waitFor(() => !!document.querySelector('.prf-root:not(.was-here) .prf-name'), { timeout: 20000 })
  const view = await page.evaluate(() => { const r = document.querySelector('.prf-root:not(.was-here)'); const txt = (s) => [...r.querySelectorAll(s)].map(e => e.textContent.trim()); return { name: txt('.prf-name')[0], sub: txt('.prf-sub span'), bio: txt('.prf-bio')[0], langs: txt('.prf-langs li'), social: txt('.prf-social a'), skills: txt('.prf-s-skills li') } })
  console.log('     view pane: ' + JSON.stringify(view))
  check('view pane shows the result', view.name === 'Carol B. Example' && view.sub.includes('cazzy') && view.sub.includes('Senior map maker') && view.bio === 'Draws maps.' && view.langs.join() === 'EnglishNative' && !view.social.length && !view.skills.length)
  await finish()
} catch (error) { await finish(error) }
