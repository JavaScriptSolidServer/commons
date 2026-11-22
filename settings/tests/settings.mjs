// The settings pane on a made-up person, Alice, whose profile and preferences are files in this lab's
// own pod folder (the test user owns that folder, so may edit them). Every write goes there.
//   node tests/settings.mjs        logs in; overview, trusted apps (add, level, control, remove), switches, reload; 1300 px
//   node tests/settings.mjs 400    reuses that login; the layout at a true 400 px (design/viewport.mjs)
import { open, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PANE, PORT, DATA_DIR, ALICE, ALICE_PREFS, freshAlice, openPane, seen, settled, statusText, podGraph, shotOf } from './common.mjs'

const width = +(process.argv[2] || 1300)
freshAlice()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, width, login: width === 1300, resource: ALICE })
const disk = (f) => readFileSync(path.join(DATA_DIR, 'alice', f), 'utf8')
const row = (s, item) => s.rows.filter(r => r.item === item)
const PROFILE = ALICE.split('#')[0]
const ACL_TERMS = /<http:\/\/www\.w3\.org\/ns\/auth\/acl#(trustedApp|origin|mode)>/
// Only trusted-app statements may differ between two reads of the profile.
const onlyApps = (before, after) => {
  const gone = before.lines.filter(l => !after.lines.includes(l))
  const added = after.lines.filter(l => !before.lines.includes(l))
  return { ok: [...gone, ...added].every(l => ACL_TERMS.test(l)), detail: `-${gone.length} +${added.length} ` + [...gone, ...added].filter(l => !ACL_TERMS.test(l)).join(' | ').slice(0, 200) }
}

try {
  await page.goto(address(ALICE))
  const opened = await openPane(page, ALICE)
  check('the pane is offered on Alice\'s WebID and opens', opened === 'ok', opened)
  let s = await seen(page)
  check('the title names her', s.title === 'Settings · Alice Example', s.title)

  if (width === 1300) {
    // 1. Overview
    const state = (item) => row(s, item).map(r => r.state).join(',')
    check('overview: the WebID is found', state('webid') === 'found' && row(s, 'webid')[0].value === ALICE, state('webid'))
    check('overview: the identity provider is found', state('issuer') === 'found' && row(s, 'issuer')[0].value === 'http://127.0.0.1:8732/', state('issuer'))
    check('overview: storage is found', state('storage') === 'found', state('storage'))
    check('overview: the preferences file is found', state('preferences') === 'found' && row(s, 'preferences')[0].value === ALICE_PREFS, state('preferences'))
    check('overview: the public type index is found', state('public-index') === 'found', state('public-index'))
    const priv = row(s, 'private-index')[0]
    check('overview: the private type index is linked but missing, and it says so kindly', priv.state === 'missing' && /can make it again/.test(priv.help) && !/error|fail/i.test(priv.help), priv.state + ' ' + priv.help)
    const tools = row(s, 'tool-index')[0]
    check('overview: no tool index, with a link to the Tools app', tools.state === 'unset' && tools.links.includes('https://solid-apps.github.io/tools/'), JSON.stringify(tools))
    check('overview: every address is a link', s.rows.filter(r => r.state !== 'unset').every(r => r.links[0] === r.value), s.rows.map(r => r.links.length).join(''))
    check('overview: links open safely', await page.evaluate(() => [...document.querySelectorAll('.set a')].every(a => /^https?:/.test(a.href) && /noopener/.test(a.rel))))
    await shot('overview-1300')

    // 2. Trusted apps as listed
    const apps = () => Object.fromEntries(s.apps.map(a => [a.origin, a.level + ' | ' + a.words]))
    check('apps: both listed, the one written as a blank node too', s.apps.length === 2 && /^edit \| May see your data and change and delete your data\.$/.test(apps()['https://notes.example']) && /^view \| May see your data\.$/.test(apps()['https://recipes.example']), JSON.stringify(apps()))

    await shotOf(page, shot, '.set-trusted', 'apps-1300')
    const start = await podGraph(page, PROFILE, ALICE)
    const tryAdd = (origin, level) => page.evaluate((v) => { const [o, l] = v; const f = document.querySelector('.set-add'); f.querySelector('input').value = o; f.querySelector('select').value = l; f.requestSubmit() }, [origin, level])
    for (const bad of ['http://plain.example', 'https://app.example/path', 'https://app.example?x=1', 'https://user:pw@app.example', 'not a url at all']) {
      await tryAdd(bad, 'view'); await sleep(250)
      check('apps: refuses ' + bad, /set-bad/.test(await statusText(page)), (await statusText(page)).slice(0, 90))
    }
    await tryAdd('https://notes.example/', 'view'); await sleep(250)
    check('apps: refuses one that is already trusted', /already trusted/.test(await statusText(page)), await statusText(page))
    check('apps: nothing was written by the refusals', JSON.stringify((await podGraph(page, PROFILE, ALICE)).lines) === JSON.stringify(start.lines))

    await tryAdd('Calendar.Example', 'add'); await settled(page)
    s = await seen(page)
    let pod = await podGraph(page, PROFILE, ALICE)
    check('apps: add calendar.example as view and add (a bare host gets https://)', /set-good/.test(s.status) && pod.apps['https://calendar.example'] === 'Append Read', JSON.stringify(pod.apps))
    check('apps: the add wrote only that app\'s statements', onlyApps(start, pod).ok, onlyApps(start, pod).detail)
    check('apps: the file on disk has it', /calendar\.example/.test(disk('card.ttl')))

    await tryAdd('https://admin.example', 'control'); await sleep(300)
    check('apps: control asks first, in plain words', await page.evaluate(() => /lock you out/.test((document.querySelector('.set-add .set-warn') || {}).textContent || '')))
    await page.evaluate(() => document.querySelector('.set-add .set-no-control').click()); await sleep(300)
    check('apps: cancel writes nothing', !(await podGraph(page, PROFILE, ALICE)).apps['https://admin.example'])
    await tryAdd('https://admin.example', 'control'); await sleep(300)
    await page.evaluate(() => document.querySelector('.set-add .set-yes-control').click()); await settled(page)
    pod = await podGraph(page, PROFILE, ALICE)
    check('apps: control granted after the warning', pod.apps['https://admin.example'] === 'Control Read Write', JSON.stringify(pod.apps))

    const setLevel = (origin, level) => page.evaluate((v) => { const [o, l] = v; const sel = document.querySelector(`.set-app[data-origin="${o}"] .set-level`); sel.value = l; sel.dispatchEvent(new Event('change')) }, [origin, level])
    let before = pod
    await setLevel('https://notes.example', 'view'); await settled(page)
    pod = await podGraph(page, PROFILE, ALICE)
    check('apps: change notes.example to view', pod.apps['https://notes.example'] === 'Read' && pod.apps['https://admin.example'] === 'Control Read Write', JSON.stringify(pod.apps))
    check('apps: the change touched only that app\'s modes', onlyApps(before, pod).ok && before.lines.length - pod.lines.length === 2, onlyApps(before, pod).detail)

    before = pod
    await setLevel('https://recipes.example', 'edit'); await settled(page)
    pod = await podGraph(page, PROFILE, ALICE)
    // JSS answers 200 to a SPARQL patch with a WHERE clause but ignores the clause, so an entry written as a
    // blank node (as upstream SolidOS writes them) cannot be changed here. The pane must notice and say so.
    s = await seen(page)
    check('apps: a blank-node app the server will not change: reported as not changed, not as saved', /set-bad/.test(s.status) && /blank node/.test(s.status) && pod.apps['https://recipes.example'] === 'Read' && s.apps.find(a => a.origin === 'https://recipes.example').level === 'view', JSON.stringify(pod.apps) + ' ' + s.status.slice(0, 120))
    check('apps: and nothing else was touched by it', JSON.stringify(pod.lines) === JSON.stringify(before.lines))

    await setLevel('https://recipes.example', 'control'); await sleep(300)
    check('apps: raising a listed app to control asks first', await page.evaluate(() => !!document.querySelector('.set-app[data-origin="https://recipes.example"] .set-warn')))
    await page.evaluate(() => document.querySelector('.set-app[data-origin="https://recipes.example"] .set-no-control').click()); await sleep(300)
    s = await seen(page)
    check('apps: cancel puts the level back and writes nothing', (await podGraph(page, PROFILE, ALICE)).apps['https://recipes.example'] === 'Read' && s.apps.find(a => a.origin === 'https://recipes.example').level === 'view')

    const removeOnce = (origin) => page.evaluate((o) => document.querySelector(`.set-app[data-origin="${o}"] .set-remove`).click(), origin)
    await removeOnce('https://calendar.example'); await sleep(300)
    check('apps: one click on remove only asks', (await podGraph(page, PROFILE, ALICE)).apps['https://calendar.example'] === 'Append Read' && await page.evaluate(() => /again/.test(document.querySelector('.set-app[data-origin="https://calendar.example"] .set-remove').textContent)))
    before = await podGraph(page, PROFILE, ALICE)
    await removeOnce('https://calendar.example'); await settled(page)
    pod = await podGraph(page, PROFILE, ALICE)
    check('apps: the second click removes it, and only it', !pod.apps['https://calendar.example'] && Object.keys(pod.apps).length === 3 && onlyApps(before, pod).ok && before.lines.length - pod.lines.length === 4, JSON.stringify(pod.apps) + ' ' + onlyApps(before, pod).detail)
    await removeOnce('https://recipes.example'); await sleep(200); await removeOnce('https://recipes.example'); await settled(page)
    pod = await podGraph(page, PROFILE, ALICE)
    check('apps: removing the blank-node app is also reported honestly', pod.apps['https://recipes.example'] === 'Read' && /set-bad/.test(await statusText(page)) && (await seen(page)).apps.some(a => a.origin === 'https://recipes.example'), JSON.stringify(pod.apps) + ' ' + await statusText(page))
    check('apps: everything else in the profile is as it was', onlyApps(start, pod).ok && /Alice Example/.test(disk('card.ttl')), onlyApps(start, pod).detail)

    // 3. Preferences
    s = await seen(page)
    check('preferences: power user on, developer off, as the file says', s.switches.PowerUser === 'true' && s.switches.Developer === 'false', JSON.stringify(s.switches))
    const prefsBefore = await podGraph(page, ALICE_PREFS, ALICE)
    await page.evaluate(() => document.querySelector('.set-switch-row[data-role=Developer] .set-switch input').click()); await settled(page)
    await page.evaluate(() => document.querySelector('.set-switch-row[data-role=PowerUser] .set-switch input').click()); await settled(page)
    const prefsAfter = await podGraph(page, ALICE_PREFS, ALICE)
    const type = (g, t) => g.lines.includes(`<${ALICE}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/solid/terms#${t}>`)
    check('preferences: developer on and power user off, in the preferences file', type(prefsAfter, 'Developer') && !type(prefsAfter, 'PowerUser'), prefsAfter.lines.filter(l => /type/.test(l)).join(' | '))
    check('preferences: nothing else in it changed', prefsBefore.lines.filter(l => !type({ lines: [l] }, 'PowerUser')).every(l => prefsAfter.lines.includes(l)) && prefsAfter.lines.length === prefsBefore.lines.length, prefsBefore.lines.length + ' -> ' + prefsAfter.lines.length)
    check('preferences: the file on disk shows it', /Developer/.test(disk('prefs.ttl')) && !/PowerUser/.test(disk('prefs.ttl')))

    // Reload: the same, read back from the pod.
    await page.goto(address(ALICE))
    await openPane(page, ALICE)
    s = await seen(page)
    check('after a reload: the apps read back the same', JSON.stringify(s.apps.map(a => a.origin + '=' + a.level)) === JSON.stringify(['https://admin.example=control', 'https://notes.example=view', 'https://recipes.example=view']), JSON.stringify(s.apps))
    check('after a reload: the switches read back the same', s.switches.PowerUser === 'false' && s.switches.Developer === 'true', JSON.stringify(s.switches))

    // On the preferences file itself: the same person and the same switches.
    await page.goto(address(ALICE_PREFS))
    const onPrefs = await openPane(page, ALICE_PREFS)
    s = await seen(page)
    check('on her preferences file: offered, and it finds whose it is', onPrefs === 'ok' && s.title === 'Settings · Alice Example' && s.switches.Developer === 'true' && s.apps.length === 3, onPrefs + ' ' + s.title)
    await page.evaluate(() => document.querySelector('.set-switch-row[data-role=PowerUser] .set-switch input').click()); await settled(page)
    check('on her preferences file: a switch writes there', /PowerUser/.test(disk('prefs.ttl')))
    await shotOf(page, shot, '.set-prefs', 'prefs-1300')
  } else {
    await narrow(page)
    await sleep(500)
    await shot('alice-400')
    await shotOf(page, shot, '.set-trusted', 'apps-400')
    await shotOf(page, shot, '.set-prefs', 'prefs-400')
    // The control warning at this width too.
    await page.evaluate(() => { const f = document.querySelector('.set-add'); f.querySelector('input').value = 'https://admin.example'; f.querySelector('select').value = 'control'; f.requestSubmit() })
    await sleep(400)
    check('400 px: the control warning shows', await page.evaluate(() => !!document.querySelector('.set-add .set-warn')))
    await shotOf(page, shot, '.set-add', 'warning-400')
    check('400 px: no write without the second click', !/admin\.example/.test(disk('card.ttl')))
  }
  const m = await measure(page)
  check('no sideways scroll at ' + (width === 400 ? 'a true ' : '') + m.innerWidth + ' px', !m.sideways && !m.poking.length && !(await seen(page)).wide && await page.evaluate(() => { const r = document.querySelector('.set.settings-pane').getBoundingClientRect(); return r.right <= innerWidth + 1 }), JSON.stringify(m))
  await finish()
} catch (error) { await finish(error) }
