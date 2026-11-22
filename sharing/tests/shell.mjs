// The pane inside the suite shell (shell/suite-shell-pane.js), reusing the login sharing.mjs left. The shell lists
// Sharing as a viewer app, so it is offered under "Other views" of a folder (Files opens the folder first). Content
// only: no navigation column, no (i) button. A save shows the shell's toast. No sideways scroll at 1300 and a true 400 px.
//   node tests/shell.mjs
import './free-ports.mjs'
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { reset, disk, BASE } from './setup.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const TEAM = BASE + 'team/'
reset()
const { page, check, finish, shot } = await open({ pane: SHELL, port: 9527, dir: import.meta.dirname, login: false, resource: TEAM })
// Pick Sharing in the shell's "Other views", wait until it has settled and is still there (a session restore can make
// the shell mount again, dropping it); if not, pick it again (logged), up to 3 times.
async function showSharing () {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.waitFor(() => !!document.querySelector('.sh-views [data-pane="sharing-lab"]'), { timeout: 45000 })
    await page.evaluate(() => document.querySelector('.sh-views [data-pane="sharing-lab"]').click())
    if (await ready().then(() => true, () => false)) { await sleep(400); if (await page.evaluate(() => { const r = document.querySelector('.sh-content .shr.sharing-lab-pane'); return !!r && !['busy', 'loading'].includes(r.dataset.state) })) return }
    console.log('     (Sharing did not settle in the shell on attempt ' + attempt + ')')
  }
  throw new Error('Sharing never settled in the shell')
}
const ready = () => page.waitFor(() => { const r = document.querySelector('.sh-content .shr.sharing-lab-pane'); return !!r && r.dataset.state && !['busy', 'loading'].includes(r.dataset.state) }, { timeout: 70000 })

try {
  await page.waitFor(() => !!(window.SolidLogic && window.SolidLogic.authn && window.SolidLogic.authn.currentUser()), { timeout: 40000 })
  const offered = await page.waitFor(() => !!document.querySelector('.sh-views [data-pane="sharing-lab"]'), { timeout: 45000 }).catch(() => false)
  check('the shell offers Sharing among the other views of a folder', !!offered)
  await showSharing()
  await sleep(800) // names from profiles
  const seen = await page.evaluate(() => {
    const r = document.querySelector('.sh-content .shr.sharing-lab-pane')
    return {
      state: r.dataset.state,
      people: r.querySelectorAll('.shr-people > .shr-row').length,
      nav: !document.querySelector('.sh-navcol') || !document.querySelector('.sh-navcol').children.length,
      info: !document.querySelector('.sh-details-btn') || document.querySelector('.sh-details-btn').hidden,
      tokens: getComputedStyle(r).getPropertyValue('--sui-primary-element').trim()
    }
  })
  check('in the shell: the folder\'s rules in the content column, content only (no nav column, no (i) button)', seen.state === 'own' && seen.people === 4 && seen.nav && seen.info, JSON.stringify(seen))
  check('in the shell: the shell\'s tokens apply', seen.tokens === '#00679e', seen.tokens)
  let m = await measure(page)
  check('1300 px in the shell: no sideways scroll', !m.sideways, m.poking.join(' '))
  await shot('shell-1300')

  // A save in the shell: the shell's toast says it, and the status line too.
  await page.evaluate(() => { const s = document.querySelector('.sh-content .shr-row[data-key^="public"] select'); s.value = 'view'; s.dispatchEvent(new Event('change')) })
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .shr button')].find(b => b.textContent.trim() === 'Review and save').click())
  await page.evaluate(() => document.querySelector('.sh-content .shr-confirm').click())
  await sleep(300)
  await ready()
  const toast = await page.waitFor(() => [...document.querySelectorAll('.sh-toasts .sh-toast')].some(t => /Saved/.test(t.textContent)), { timeout: 10000 }).catch(() => false)
  check('in the shell: a save shows the shell\'s toast, and the pod file has it', !!toast && /xmlns\.com\/foaf\/0\.1\/Agent/.test(disk('team/.acl') || ''))
  reset()

  await narrow(page)
  await showSharing()
  await sleep(600)
  m = await measure(page)
  check('a true 400 px in the shell: no sideways scroll', m.innerWidth === 400 && !m.sideways, m.innerWidth + ' ' + m.poking.join(' '))
  check('400 px in the shell: the permission dropdown sits under the name', await page.evaluate(() => { const row = document.querySelector('.sh-content .shr-people > .shr-row'); return row.querySelector('select').getBoundingClientRect().top >= row.querySelector('.shr-name').getBoundingClientRect().bottom - 1 }))
  await shot('shell-400')
  await finish()
} catch (error) { reset(); await finish(error) }
