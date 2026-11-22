// The pane at a true 400 px (a phone; design/viewport.mjs sets the page itself to 400 CSS px): no sideways scroll, every section usable. Reuses the login left by edit.mjs.
//   node tests/layout.mjs
import { open } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { PANE, PORT, ME, freshCopy, show, sleep } from './common.mjs'

freshCopy()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, resource: ME, width: 400, login: false, fresh: false })
try {
  await narrow(page)
  await page.goto(address(ME))
  await narrow(page)
  await page.waitFor(() => !!(window.panes && window.panes.byName('profile-edit-lab')), { timeout: 40000 })
  await sleep(2500)
  await show(page, 'profile-edit-lab', '.pfe', ME)
  check('400 px: the pane is drawn with every section', await page.evaluate(() => ['basics', 'photo', 'emails', 'phones', 'skills', 'languages', 'accounts', 'friends', 'resume'].every(p => !!document.querySelector(`.pfe [data-part=${p}]`))))
  const m = await measure(page)
  check('a true 400 px: no sideways scroll', m.innerWidth === 400 && !m.sideways && !m.poking.length, JSON.stringify(m))
  check('400 px: nothing in the pane is wider than the pane', await page.evaluate(() => { const r = document.querySelector('.pfe').getBoundingClientRect(); return [...document.querySelectorAll('.pfe *')].every(e => e.getBoundingClientRect().right <= r.right + 1) }))
  check('400 px: a failed save keeps the text and says why', await page.evaluate(async () => {
    const i = document.querySelector('.pfe [name=homepage]'); i.value = 'ftp://example.org/'
    document.querySelector('.pfe [data-part=basics] form').requestSubmit()
    await new Promise(resolve => setTimeout(resolve, 600))
    return i.value === 'ftp://example.org/' && /^Not saved/.test(document.querySelector('.pfe [data-field=homepage]').textContent)
  }))
  await shot('layout-400-top')
  for (const [i, part] of ['photo', 'skills', 'accounts', 'friends'].entries()) {
    await page.evaluate((p) => document.querySelector(`.pfe [data-part=${p}]`).scrollIntoView(), part)
    await sleep(300)
    await shot('layout-400-' + (i + 1) + '-' + part)
  }
  await finish()
} catch (error) { await finish(error) }
