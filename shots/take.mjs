// Screenshots of every suite app inside the shell, logged in as the test user, at 1300 px and a true 400 px
// (design/viewport.mjs: CDP device metrics, innerWidth exactly 400). Reads only; writes nothing to the pod.
//   node shots/take.mjs            (all)       node shots/take.mjs files photos   (some)
// Browser port 9590. The browser profile (session cookies) is kept outside the served suite folder.
import { open, LAB, POD, sleep } from '../lib/lib.mjs'
import { narrow, wide } from '../design/viewport.mjs'
import { mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = import.meta.dirname
const PROFILE_DIR = path.join(os.tmpdir(), 'suite-shots-browser') // open() puts profile/ and shots/ under this
const SHELL = LAB + 'shell/suite-shell-pane.js'
const S = LAB // the suite's own samples: http://127.0.0.1:8732/me/public/suite/<folder>/samples/…

// id (the shell's SUITE_APPS id) · pane name · where it opens · optional extra steps before the shot
const APPS = [
  { id: 'dashboard', pane: 'pod-home', uri: POD },
  { id: 'files', pane: 'folder-lab', uri: S + 'folder/samples/garden/' },
  { id: 'photos', pane: 'media', uri: S + 'media/samples/gallery/' },
  { id: 'contacts', pane: 'contacts', uri: S + 'contacts/samples/book/index.ttl#this' },
  { id: 'tasks', pane: 'suite-tasks', uri: S + 'tasks/samples/lists/garden/index.ttl#this' },
  { id: 'boards', pane: 'issues', uri: S + 'issues/samples/shed/index.ttl#this' },
  { id: 'notes', pane: 'notes-reader', uri: S + 'notes/samples/journal/welcome.md' },
  { id: 'pads', pane: 'notepad', uri: S + 'pad/samples/meeting-notes.ttl#this' },
  { id: 'source', pane: 'source-lab', uri: S + 'source/samples/people.ttl' },
  { id: 'polls', pane: 'poll', uri: S + 'poll/samples/call/index.ttl#this' },
  { id: 'meetings', pane: 'meeting-page', uri: S + 'meeting/samples/planning/index.ttl#this' },
  { id: 'activity', pane: 'suite-activity', uri: S + 'activity/samples/alice/' },
  { id: 'search', pane: 'folder-lab', app: 'files', uri: S + 'search/samples/orchard/', then: typeQuery('quince') },
  { id: 'sharing', pane: 'folder-lab', app: 'files', uri: S + 'folder/samples/garden/', then: openSharing('bob-watering.md') },
  { id: 'settings', menu: 'settings' },
  { id: 'profile', menu: 'profile' },
  { id: 'document', pane: 'document-lab', uri: S + 'document/samples/welcome.html' },
  { id: 'table', pane: 'table', uri: S + 'table/samples/library.ttl' },
  { id: 'data', pane: 'data-lab', uri: S + 'data/samples/people.ttl' }
]

function typeQuery (text) {
  return async (page) => {
    await page.evaluate(() => { const i = document.querySelector('.sh-header-search input'); i.focus(); i.select() })
    await page.type(text)
    await page.waitFor((q) => { const d = document.querySelector('[data-search="dropdown"]'); return !!d && !d.hidden && d.dataset.done === 'yes' && d.dataset.query === q }, { timeout: 90000, args: [text] }).catch(() => {})
  }
}
function openSharing (name) {
  return async (page) => {
    await page.waitFor((n) => !!document.querySelector(`.sh-content .fl-row[data-name="${n}"]`), { timeout: 30000, args: [name] })
    await page.evaluate((n) => document.querySelector(`.sh-content .fl-row[data-name="${n}"] .fl-row-main`).click(), name)
    await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .fl-tab-sharing'), { timeout: 10000 })
    await page.evaluate(() => document.querySelector('.sh-detcol .fl-tab-sharing').click())
    await page.waitFor(() => !!document.querySelector('.sh-detcol .fl-panel-sharing:not([hidden]) .sharing-lab-pane'), { timeout: 20000 }).catch(() => {})
  }
}

const only = process.argv.slice(2)
mkdirSync(PROFILE_DIR, { recursive: true })
const { page, finish, address } = await open({ pane: SHELL, port: 9590, dir: PROFILE_DIR, login: true, resource: POD })
const ready = () => page.waitFor(() => !!document.querySelector('.sh.suite-shell-pane[data-ready]') && document.querySelector('.sh-root')?.dataset.loggedIn !== 'no', { timeout: 45000 }).catch(() => {})
const loggedIn = () => page.waitFor(() => document.querySelector('.sh.suite-shell-pane')?.dataset.loggedIn === 'yes', { timeout: 30000 }).catch(() => {})
const onApp = (id) => page.waitFor((a) => document.querySelector('.sh-root')?.dataset.app === a && !!document.querySelector('.sh-content > *'), { timeout: 30000, args: [id] }).then(() => true, () => false)

async function show (app) {
  await page.goto(address(app.uri || POD))
  await ready()
  await loggedIn()
  if (app.menu) {
    await page.waitFor(() => !!document.querySelector('.sh-account [data-action]'), { timeout: 30000 })
    await page.evaluate(() => document.querySelector('.sh-account-btn').click())
    await sleep(300)
    await page.evaluate((a) => document.querySelector(`.sh-account [data-action="${a}"]`).click(), app.menu)
  } else if (!(await page.evaluate((a) => document.querySelector('.sh-root')?.dataset.app === a, app.app || app.id))) {
    await page.evaluate(([uri, pane]) => document.querySelector('.sh-root').suiteApi.go(uri, { pane }), [app.uri, app.pane])
  }
  const ok = await onApp(app.app || app.id)
  await sleep(3500) // the app reads its data
  if (app.then) await app.then(page)
  await sleep(1200)
  return ok
}

let count = 0
try {
  for (const app of APPS) {
    if (only.length && !only.includes(app.id)) continue
    for (const width of [1300, 400]) {
      if (width === 400) await narrow(page); else await wide(page)
      const ok = await show(app)
      await page.screenshot(path.join(HERE, `${app.id}-${width}.png`))
      count++
      console.log(`${ok ? 'shot' : 'shot (app not confirmed)'} ${app.id}-${width}`)
    }
  }
  if (!only.length || only.includes('launcher')) {
    await wide(page)
    await page.goto(address(POD))
    await ready()
    await loggedIn()
    await sleep(2500)
    await page.evaluate(() => document.querySelector('.sh-launch-btn').click())
    await sleep(800)
    await page.screenshot(path.join(HERE, 'launcher-1300.png'))
    count++
    console.log('shot launcher-1300')
  }
  console.log(`${count} screenshots in ${HERE}`)
} catch (error) {
  console.log('stopped: ' + (error && error.message))
}
rmSync(path.join(PROFILE_DIR, 'shots'), { recursive: true, force: true })
await finish()
