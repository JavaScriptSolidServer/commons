// Logged out: log in, then log out from the avatar menu; the shell follows. Public things still show; apps that
// need the person say so; "Log in" uses the browser's own login. (A reload after logging out stands for a fresh visit.)
//   node tests/loggedout.mjs
import { open, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const SHELF = POD + 'public/suite-data/shell/shelf/shelf.ttl'
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9501, dir: import.meta.dirname, login: true, resource: SHELF })
const ready = (loggedIn) => page.waitFor((want) => { const r = document.querySelector('.sh.suite-shell-pane[data-ready]'); return !!r && r.dataset.loggedIn === want && !!r.querySelector('.dm-row') }, { timeout: 40000, args: [loggedIn] }).then(() => true, () => false)
const click = (sel) => page.evaluate((s) => { const n = document.querySelector(s); if (n) n.click(); return !!n }, sel)
const DEEP = `(sel) => { const walk = (node) => { const f = node.querySelector(sel); if (f) return f; for (const e of node.querySelectorAll('*')) if (e.shadowRoot) { const g = walk(e.shadowRoot); if (g) return g } return null }; return walk(document) }`

try {
  await page.goto(address(SHELF))
  check('logged in, the shell shows the avatar', await ready('yes'))
  await click('.sh-account-btn')
  await click('.sh-account [data-action="logout"]')
  check('"Log out" in the avatar menu logs out, and the shell follows', await ready('no'))
  await sleep(800)
  const s = await page.evaluate(() => ({ login: !!document.querySelector('.sh-header .sh-login'), avatar: !!document.querySelector('.sh-account-btn'), rows: document.querySelectorAll('.dm-row').length, tools: !!document.querySelector('.sh-launcher .sh-tools') }))
  check('logged out: a "Log in" button instead of the avatar', s.login && !s.avatar)
  check('logged out: a public thing still shows, in the frame', s.rows === 6, String(s.rows))
  check('logged out: no tool index section in the launcher', !s.tools)
  await shot('loggedout-1300')
  await page.reload()
  check('after a reload it is still logged out', await ready('no'))
  await click('.sh-launch-btn')
  await click('.sh-launcher [data-app="contacts"]')
  await sleep(500)
  const empty = await page.evaluate(() => [document.querySelector('.sh-empty-title')?.textContent, document.querySelector('.sh-empty .sh-btn-primary')?.textContent].join(' | '))
  check('an app that needs the person asks to log in', empty === 'Log in to open Contacts | Log in', empty)
  await narrow(page, 400)
  await sleep(300)
  const m = await measure(page)
  check('no sideways scroll at 400 px, logged out', !m.sideways, String(m.scrollWidth))
  await shot('loggedout-400')
  await click('.sh-header .sh-login')
  const modal = await page.waitFor(`(() => { const m = (${DEEP})('solid-ui-login-modal'); return !!m && !!m.issuerInputValue })()`, { timeout: 10000 }).then(() => true, () => false)
  check('"Log in" opens the browser\'s own login', modal)
  await sleep(500)
  await shot('loggedout-login-400')
  await finish()
} catch (error) { await finish(error) }
