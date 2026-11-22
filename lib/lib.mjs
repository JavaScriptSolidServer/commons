// Shared by every pane's tests in this lab: the local settings and a page on the test pod's data
// browser with your pane added, logged in or not. Settings come from ~/ideas/suite-local.json, kept OUTSIDE the
// served suite folder so the pod never serves the passwords (never print it).
//
//   import { open, config, POD, sleep } from '../../lib/lib.mjs'
//   const { page, check, finish, shot, address } = await open({ pane: LAB + 'media/media-pane.js', port: 9401, dir: import.meta.dirname, resource: someUri })
//   page.goto(address(uri)) · page.evaluate(fn|string, oneStringArg) · page.waitFor(fn|string, {timeout}) · page.screenshot(path)
//   check(name, ok, detail) prints PASS/FAIL · await finish() closes and exits 0/1 · await shot('name') saves dir/shots/name.png
//   login: true = clean browser then log in as the test user; login: false, fresh: true = clean browser, logged out;
//   login: false = reuse the last session of this dir.
//   as: 'bob' = the same, but as the second test user (config.user2, pod POD2) in its own profile dir,
//   dir/profile-bob, so a "me" browser and a "bob" browser can run side by side. Default: the first user.
//   import { POD2 } for the second user's pod.
import { launch } from './cdp.mjs'
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const at = (...parts) => path.join(HERE, ...parts)
const LOCAL = path.join(HERE, '..', '..', 'suite-local.json')
if (!existsSync(LOCAL)) { console.log('No ~/ideas/suite-local.json.'); process.exit(2) }
export const config = JSON.parse(readFileSync(LOCAL, 'utf8'))
export const LAB = config.lab // where the lab folder is served from, on the pod's own site
export const POD = config.pod
export const POD2 = config.pod2 // the second test user's pod (as: 'bob')
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const DEEP = `(sel, root = document) => { const walk = (node) => { const found = node.querySelector(sel); if (found) return found; for (const el of node.querySelectorAll('*')) if (el.shadowRoot) { const f = walk(el.shadowRoot); if (f) return f } return null }; return walk(root) }`

// A page on the browser with the pane added. login: true starts from a clean profile and logs in;
// login: false reuses the session the last logged-in run left behind.
export async function open ({ pane, port, dir, width = 1300, login = true, fresh = login, resource = POD, as } = {}) {
  if (!pane || !port || !dir) throw new Error('open() needs pane (address), port (your own) and dir (import.meta.dirname)')
  const SHOTS = path.join(dir, 'shots')
  if (as && as !== config.user2) throw new Error(`open(): as must be '${config.user2}' or left out`)
  const PROFILE = path.join(dir, as ? 'profile-' + as : 'profile')
  const who = as ? [config.user2, config.password2] : [config.user, config.password]
  const address = (uri) => `${config.browser}?pane=${encodeURIComponent(pane)}&uri=${encodeURIComponent(uri)}`
  if (fresh) rmSync(PROFILE, { recursive: true, force: true }) // a clean browser: nobody logged in
  mkdirSync(SHOTS, { recursive: true })
  let failures = 0
  const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`) }
  const page = await launch({ profile: PROFILE, port, width, height: 900 })
  // The question box is made after load: wait for it to exist before answering.
  const answerQuestions = async () => {
    for (let i = 0; i < 4; i++) {
      const asked = await page.waitFor(() => { const box = document.getElementById('browseAsk'); return !!box && !box.hidden }, { timeout: 5000 }).catch(() => false)
      if (!asked) break
      await page.evaluate(() => document.getElementById('browseAskYes').click())
      await sleep(1200)
    }
  }
  const shot = (name) => page.screenshot(path.join(SHOTS, name + '.png')).catch(() => {})
  const finish = async (error) => {
    if (error) { failures++; console.log('FAIL ' + (error && error.message ? error.message : error)); await shot('error') }
    await page.close()
    console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
    process.exit(failures ? 1 : 0)
  }
  try {
    await page.goto(address(resource))
    if (login) {
      await page.waitFor(`!!(${DEEP})('solid-ui-account')?.shadowRoot?.querySelector('solid-ui-login-button')`, { timeout: 40000 })
      await answerQuestions()
      await page.evaluate(`(${DEEP})('solid-ui-account').shadowRoot.querySelector('solid-ui-login-button solid-ui-button').shadowRoot.querySelector('button').click()`)
      await page.waitFor(`(() => { const m = (${DEEP})('solid-ui-login-modal'); return m && m.issuerInputValue })()`)
      await page.evaluate(`(() => { const m = (${DEEP})('solid-ui-login-modal'); const b = [...m.shadowRoot.querySelectorAll('solid-ui-dialog-footer solid-ui-button')][1]; b.shadowRoot.querySelector('button').click() })()`)
      await page.waitFor(() => location.pathname.startsWith('/idp/') && !!document.querySelector('#username'), { timeout: 30000 })
      await page.evaluate((who) => { const [user, password] = JSON.parse(who); document.querySelector('#username').value = user; document.querySelector('#password').value = password; document.querySelector('form[action$="/login"]').submit() }, JSON.stringify(who))
      for (let step = 0; step < 4; step++) {
        const where = await page.waitFor(() => { if (!location.pathname.startsWith('/idp/')) return 'back'; if ([...document.querySelectorAll('button, a')].find(b => /skip for now/i.test(b.textContent))) return 'passkey'; if (document.querySelector('form[action$="/confirm"]')) return 'consent'; return false }, { timeout: 30000 })
        if (where === 'back') break
        if (where === 'passkey') await page.evaluate(() => [...document.querySelectorAll('button, a')].find(b => /skip for now/i.test(b.textContent)).click())
        if (where === 'consent') await page.evaluate(() => document.querySelector('form[action$="/confirm"]').submit())
        await sleep(1000)
      }
      await page.waitFor(`!!(${DEEP})('solid-ui-account')?.hasAttribute('data-state-loggedin')`, { timeout: 40000 })
      check('logged in', true)
      await answerQuestions()
    }
  } catch (error) { await finish(error) }

  return { page, check, finish, shot, address }
}
