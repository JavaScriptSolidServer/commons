// Two real people on one pad: me (port 9521, reusing the session pad.mjs left) and bob (port 9522, his own login).
// me's pad gives bob read and write. Bob opens it, sees the lines, adds one; me's page picks it up by itself
// (the 10 s check), and after a reload shows bob's name from his profile. Data: suite-data/pad/two/, rebuilt.
//   node tests/two.mjs
import { open, config, LAB, POD, POD2, sleep } from '../../lib/lib.mjs'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'pad/pad-pane.js'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'pad', 'two')
if (!DIR.endsWith(path.join('suite-data', 'pad', 'two'))) throw new Error('refusing: unexpected data folder ' + DIR)
const FOLDER = POD + 'public/suite-data/pad/two/'
const PAD = FOLDER + 'index.ttl#this'
const ME = POD + 'profile/card.jsonld#me'
const BOB = POD2 + 'profile/card.jsonld#me'
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })
writeFileSync(path.join(DIR, 'index.ttl'), `@prefix pad: <http://www.w3.org/ns/pim/pad#>.
@prefix dc: <http://purl.org/dc/elements/1.1/>.
@prefix sioc: <http://rdfs.org/sioc/ns#>.
<#this> a pad:Notepad; dc:title "Tea rota"; dc:author <${ME}>; pad:next <#l1>.
<#l1> sioc:content "Monday: me"; dc:author <${ME}>; pad:next <#this>.
`)
// Access rules as JSON-LD (this server refuses Turtle ACLs): me everything, bob read and write, on the folder and inside.
const rule = (id, agent, modes) => ({ '@id': id, '@type': 'acl:Authorization', 'acl:agent': { '@id': agent }, 'acl:accessTo': { '@id': FOLDER }, 'acl:default': { '@id': FOLDER }, 'acl:mode': modes.map(m => ({ '@id': 'acl:' + m })) })
writeFileSync(path.join(DIR, '.acl'), JSON.stringify({ '@context': { acl: 'http://www.w3.org/ns/auth/acl#' }, '@graph': [rule('#me', ME, ['Read', 'Write', 'Control']), rule('#bob', BOB, ['Read', 'Write'])] }, null, 2))
const disk = () => readFileSync(path.join(DIR, 'index.ttl'), 'utf8')

const me = await open({ pane: PANE, port: 9521, dir: import.meta.dirname, login: false, resource: PAD })
const { check, finish, shot } = me
let bob = null
const values = (page) => page.evaluate(() => [...document.querySelectorAll('.npd-line textarea, .npd-line .npd-text')].map(i => i.value !== undefined ? i.value : i.textContent))
try {
  await me.page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 1, { timeout: 40000 })
  check('me: my pad opens, editable', (await values(me.page)).join('|') === 'Monday: me')

  bob = await open({ pane: PANE, port: 9522, dir: import.meta.dirname, as: config.user2, resource: PAD })
  await bob.page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 1, { timeout: 40000 })
  check('bob, logged in as himself: the pad me shared with him opens, and he may edit it', (await values(bob.page)).join('|') === 'Monday: me')
  await bob.page.evaluate(() => { const f = document.querySelector('.npd-line textarea'); f.focus(); f.setSelectionRange(f.value.length, f.value.length) })
  await bob.page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await bob.page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await bob.page.waitFor(() => document.querySelectorAll('.npd-line textarea').length === 2 && document.activeElement === document.querySelectorAll('.npd-line textarea')[1], { timeout: 15000 })
  await bob.page.type('Tuesday: Bob')
  await bob.page.evaluate(() => document.activeElement.blur())
  await bob.page.waitFor(() => !document.querySelector('.npd-pending') && /^(Saved|Not saved)/.test(document.querySelector('.npd-status').textContent), { timeout: 20000 })
  const end = Date.now() + 10000; while (Date.now() < end && !/Tuesday: Bob/.test(disk())) await sleep(250)
  check('bob\'s new line is on the pod, written as him', /Tuesday: Bob/.test(disk()) && disk().includes(BOB), await bob.page.evaluate(() => document.querySelector('.npd-status').textContent))
  await bob.shot('two-bob-1300')

  const seen = await me.page.waitFor(() => [...document.querySelectorAll('.npd-line textarea')].map(i => i.value).join('|') === 'Monday: me|Tuesday: Bob', { timeout: 20000 }).then(() => true, () => false)
  check('me: bob\'s line arrives by itself (the 10 s check), without a reload', seen, (await values(me.page)).join('|'))
  await me.page.goto(me.address(PAD))
  await me.page.waitFor(() => [...document.querySelectorAll('.npd-who')].some(w => /Bob Tester/.test(w.textContent)), { timeout: 30000 }).catch(() => {})
  const legend = await me.page.evaluate(() => [...document.querySelectorAll('.npd-who')].map(w => w.textContent))
  check('me, after a reload: bob is in the legend by the name in his profile, with his line', legend.some(l => l === 'Bob Tester1 line'), legend.join(' ; '))
  const tint = await me.page.evaluate((args) => {
    const [pad, bob] = JSON.parse(args)
    const s = window.SolidLogic.store
    const W = 'http://www.w3.org/2005/01/wf/flow#'
    const part = s.each(s.sym(pad), s.sym(W + 'participation')).find(p => s.holds(p, s.sym(W + 'participant'), s.sym(bob)))
    const colour = part && s.any(part, s.sym('http://www.w3.org/ns/ui#backgroundColor'))
    const hex = colour ? colour.value : ''
    const rgb = hex ? 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')' : 'none'
    return { rgb, line: document.querySelectorAll('.npd-line')[1].style.background }
  }, JSON.stringify([PAD, BOB]))
  check('bob\'s participation and colour are recorded, and his line is tinted in it', tint.rgb !== 'none' && tint.line === tint.rgb, JSON.stringify(tint))
  await shot('two-me-1300')
  await bob.page.close()
  rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { if (bob) await bob.page.close().catch(() => {}); await finish(error) }
