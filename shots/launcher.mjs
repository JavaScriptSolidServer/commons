// Opens each launcher app from the launcher (logged in as `me`) and records where it landed:
// the app's own pane on the registered demo data, or the "No … yet" empty state. Reads only.
//   node shots/launcher.mjs      → shots/launcher/<app>.png and a line per app
import { open, LAB, POD, sleep } from '../lib/lib.mjs'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = import.meta.dirname
const DIR = path.join(HERE, '..', '..', 'suite-browsers', 'launcher') // outside the served folder; not /tmp (snap Chromium has its own /tmp)
mkdirSync(DIR, { recursive: true })
const { page, finish, address } = await open({ pane: LAB + 'shell/suite-shell-pane.js', port: 9591, dir: DIR, login: true, resource: POD })
const APPS = ['photos', 'contacts', 'tasks', 'boards', 'notes', 'pads', 'polls', 'meetings']
let bad = 0
for (const id of APPS) {
  await page.goto(address(POD))
  await page.waitFor(() => document.querySelector('.sh.suite-shell-pane')?.dataset.loggedIn === 'yes', { timeout: 45000 }).catch(() => {})
  await page.evaluate(() => document.querySelector('.sh-launch-btn').click())
  await sleep(300)
  await page.evaluate((a) => document.querySelector(`.sh-launcher [data-app="${a}"]`).click(), id)
  await page.waitFor((a) => document.querySelector('.sh-root')?.dataset.app === a && !!document.querySelector('.sh-content > *'), { timeout: 30000, args: [id] }).catch(() => {})
  await sleep(2500)
  const r = await page.evaluate(() => ({ uri: document.querySelector('.sh-root')?.dataset.uri || '', text: (document.querySelector('.sh-content')?.innerText || '').replace(/\s+/g, ' ').slice(0, 90) }))
  const empty = /No \w+ yet|Failed|not found|private/i.test(r.text)
  if (empty) bad++
  console.log(empty ? 'EMPTY' : 'OK   ', id.padEnd(9), r.text)
  await page.screenshot(path.join(HERE, 'launcher', id + '.png'))
}
console.log(bad ? `${bad} app(s) did not open on data` : 'every launcher app opened on data')
await finish(bad ? `${bad} app(s) did not open on data` : undefined)
