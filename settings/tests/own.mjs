// The test user's own WebID, logged in: the overview as a health check
// of a real pod's settings. READ ONLY: nothing is pressed, and the profile and preferences files are compared
// on disk before and after. Then Bob, whose profile the test user may read but not change: not offered.
//   node tests/own.mjs
import { open, config } from '../../lib/lib.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PANE, PORT, REAL, BOB, freshAlice, openPane, offered, seen, shotOf } from './common.mjs'

freshAlice()
const files = ['profile/card.jsonld', 'settings/prefs.jsonld'].map(f => path.join(config.podDir, f))
const before = files.map(f => readFileSync(f, 'utf8'))
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, login: true, resource: REAL })
try {
  const opened = await openPane(page, REAL)
  check('the pane is offered on the logged-in person\'s own WebID', opened === 'ok', opened)
  const s = await seen(page)
  const rows = (item) => s.rows.filter(r => r.item === item)
  for (const r of s.rows) console.log(`     ${r.item.padEnd(14)} ${r.state.padEnd(8)} ${r.value}${r.help ? '  — ' + r.help : ''}`)
  check('overview: WebID, provider, storage and preferences file all found', ['webid', 'issuer', 'storage', 'preferences'].every(i => rows(i).length === 1 && rows(i)[0].state === 'found'), s.rows.map(r => r.item + '=' + r.state).join(' '))
  check('overview: the preferences file is the one the profile names', rows('preferences')[0].value === config.pod + 'settings/prefs.jsonld')
  check('overview: the tool index is found, read from the preferences file', rows('tool-index').length === 1 && rows('tool-index')[0].state === 'found' && /tool-index/.test(rows('tool-index')[0].value))
  const priv = rows('private-index')
  check('overview: two different private type indexes are listed, and it says apps may disagree', priv.length === 2 && priv.every(r => /More than one/.test(r.help)), priv.map(r => r.value).join(' , '))
  check('overview: says where each is listed when it is not the usual place', priv.some(r => /Listed in your profile/.test(r.help)), priv.map(r => r.help).join(' | '))
  check('it can edit: the add form and the switches are there', await page.evaluate(() => !!document.querySelector('.set-add') && [...document.querySelectorAll('.set-switch input')].every(b => !b.disabled)))
  check('no sideways scroll', !s.wide)
  await shot('own-1300')
  await shotOf(page, shot, '.set-row[data-item=private-index]', 'own-indexes-1300')

  // The way a person finds it: the data browser hides the pane menu on a #me WebID, so the way in is the
  // preferences file, whose menu lists "Settings".
  const PREFS = config.pod + 'settings/prefs.jsonld'
  await page.goto(address(PREFS))
  const menu = await page.waitFor((u) => { const p = [...document.querySelectorAll('solid-ui-file-explorer-provider')].find(p => p.subjectUri === u); const h = p && p.querySelector('solid-ui-file-explorer-header'); return h && h.menuItems && h.menuItems.length ? JSON.stringify(h.menuItems.map(i => i.label || i.name || i.title || '')) : false }, { timeout: 40000, args: [PREFS] }).catch(e => String(e.message))
  check('on the preferences file, the pane menu offers Settings', /Settings/.test(menu), menu.slice(0, 200))

  // Someone else's profile: readable, not editable, not the logged-in WebID.
  await page.goto(address(BOB))
  const forBob = await offered(page, BOB)
  check('on someone else\'s profile it is not offered', !/settings-lab/.test(forBob), forBob)
  check('and its label says no', await page.evaluate((u) => window.panes.byName('settings-lab').label($rdf.sym(u), { session: { store: SolidLogic.store } }) === null, BOB))

  const after = files.map(f => readFileSync(f, 'utf8'))
  check('the real profile and preferences files are unchanged', after.every((text, i) => text === before[i]))
  await finish()
} catch (error) { await finish(error) }
