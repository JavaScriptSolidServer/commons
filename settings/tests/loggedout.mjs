// Logged out, in a clean browser: the pane is not offered on Alice's profile, her preferences file or the
// test user's own WebID; drawn by hand it asks to log in and shows nothing private. At 1300 and 400 px.
//   node tests/loggedout.mjs
import { open } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { PANE, PORT, ALICE, ALICE_PREFS, REAL, freshAlice, offered } from './common.mjs'

freshAlice()
for (const width of [1300, 400]) {
  const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, width, login: false, fresh: true, resource: ALICE })
  try {
    if (width === 400) await narrow(page) // a true 400 px page (design/viewport.mjs)
    for (const uri of [ALICE, ALICE_PREFS, REAL]) {
      if (uri !== ALICE) await page.goto(address(uri))
      const names = await offered(page, uri)
      check(width + ' px: not offered on ' + uri.replace(/.*\/me\//, '/me/'), !/settings-lab/.test(names) && /./.test(names), names)
    }
    const drawn = await page.evaluate((u) => {
      const pane = window.panes.byName('settings-lab')
      const context = { dom: document, session: { store: SolidLogic.store } }
      const root = pane.render($rdf.sym(u), context)
      document.body.prepend(root)
      return { label: pane.label($rdf.sym(u), context), text: [...root.children].filter(c => c.tagName !== 'STYLE').map(c => c.textContent).join(' ').replace(/\s+/g, ' ').slice(0, 300), shown: [...root.querySelectorAll('section')].filter(s => !s.hidden).length, apps: root.querySelectorAll('.set-app').length }
    }, ALICE)
    check(width + ' px: its label says no', drawn.label === null)
    check(width + ' px: drawn anyway, it asks to log in and shows nothing of hers', /Log in to see your settings/.test(drawn.text) && drawn.shown === 0 && drawn.apps === 0 && !/recipes|notes\.example/.test(drawn.text), drawn.text)
    const m = await measure(page)
    check(width + ' px: no sideways scroll', !m.sideways && m.innerWidth === width, JSON.stringify(m))
    await shot('loggedout-' + width)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}
