// Logged out: the pane is not offered, and if drawn anyway it changes nothing and says why.
//   node tests/loggedout.mjs
import { open } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { PANE, PORT, ME, DOC, menuEdit, sleep, disk } from './common.mjs'

const before = disk()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, resource: DOC, login: false, fresh: true })
try {
  await page.goto(address(DOC))
  await page.waitFor(() => !!(window.panes && window.panes.byName('profile-edit-lab')), { timeout: 40000 })
  await sleep(2500)
  const labels = await page.evaluate((u) => { const p = window.panes.byName('profile-edit-lab'); const s = window.SolidLogic.store; return [p.label(s.sym(u), { session: { store: s } }), p.label(s.sym(u.split('#')[0]), { session: { store: s } })] }, ME)
  check('logged out: label is null on the person and the document', labels[0] === null && labels[1] === null, JSON.stringify(labels))
  check('logged out: not in the pane menu', !(await menuEdit(page)))
  const drawn = await page.evaluate((u) => { const s = window.SolidLogic.store; const root = window.panes.byName('profile-edit-lab').render(s.sym(u), { dom: document, session: { store: s } }); document.body.appendChild(root); return { text: (root.querySelector('.pfe-locked') || root).textContent.slice(0, 120), inputs: root.querySelectorAll('input, button, textarea').length } }, ME)
  check('logged out: drawn anyway, it shows no form and says why', drawn.inputs === 0 && /only when you are logged in/.test(drawn.text), JSON.stringify(drawn))
  check('logged out: the profile is unchanged', disk() === before)
  check('no sideways scroll at 1300 px', !(await measure(page)).sideways)
  await shot('logged-out')
  await narrow(page)
  const m = await measure(page)
  check('no sideways scroll at a true 400 px', m.innerWidth === 400 && !m.sideways, JSON.stringify(m))
  await shot('logged-out-400')
  await finish()
} catch (error) { await finish(error) }
