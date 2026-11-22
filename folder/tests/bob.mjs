// A second person: bob, logged in, opens me's folders in the suite shell. The public garden lists for him with
// no write tools (the server's WAC-Allow says read only), its details and Sharing tab still work, and me's locked
// folder is not listed. Bob's own browser profile and port (9512).
//   node tests/bob.mjs
import { open, LAB, POD2, sleep } from '../../lib/lib.mjs'
import { BASE } from './setup.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const GARDEN = BASE + 'garden/'

const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9512, dir: import.meta.dirname, as: 'bob', resource: GARDEN })
try {
  check('bob is logged in', await page.waitFor((b) => { const a = globalThis.SolidLogic && SolidLogic.authn && SolidLogic.authn.currentUser(); return !!a && a.uri.startsWith(b) }, { timeout: 30000, args: [POD2] }).catch(() => false))
  await page.goto(address(GARDEN))
  await page.waitFor(() => document.querySelectorAll('.sh-content .fl-row').length === 8, { timeout: 45000 })
  await sleep(2500) // the access check (HEAD, WAC-Allow) runs after the listing
  const tools = await page.evaluate(() => ({ write: !document.querySelector('.sh-content .fl-write').hidden, rename: !!document.querySelector('.sh-content .fl-rename, .sh-content .fl-delete'), details: document.querySelectorAll('.sh-content .fl-show-details').length }))
  check('bob, in me\'s public folder: listed, no New / Rename / Delete, Details still offered', !tools.write && !tools.rename && tools.details === 8, JSON.stringify(tools))
  await page.evaluate(() => document.querySelector('.sh-content .fl-row[data-name="bob-watering.md"] .fl-row-main').click())
  await page.waitFor(() => document.querySelector('.sh-detcol:not([hidden]) .fl-details-title')?.textContent === 'bob-watering.md', { timeout: 8000 })
  await page.evaluate(() => document.querySelector('.sh-detcol .fl-tab-sharing').click())
  const shr = await page.waitFor(() => !!document.querySelector('.sh-detcol .fl-panel-sharing .sharing-lab-pane'), { timeout: 20000 }).catch(() => false)
  check('bob: the file\'s details and its Sharing tab open (the Sharing pane decides what he may see)', !!shr)
  await sleep(1500)
  await shot('bob-1300')

  await page.goto(address(BASE + 'locked/'))
  await sleep(6000)
  const said = await page.evaluate(() => document.querySelector('.fl-error')?.textContent || (document.querySelector('.fl-row') ? 'LISTED' : 'nothing listed'))
  check('bob, in me\'s locked folder: nothing listed', said !== 'LISTED', said)
  await finish()
} catch (error) { await finish(error) }
