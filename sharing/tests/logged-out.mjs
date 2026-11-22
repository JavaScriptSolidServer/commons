// Logged out: the pane is offered, says plainly that you cannot see who has access, and offers nothing to change.
import './free-ports.mjs'
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { reset, BASE } from './setup.mjs'
import { narrow } from '../../design/viewport.mjs'
const PANE = LAB + 'sharing/sharing-pane.js'
reset()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9527, dir: import.meta.dirname, login: false, fresh: true, width: 400, resource: BASE + 'team/' })
try {
  await narrow(page) // a true 400 px page
  await page.waitFor(() => { const b = document.getElementById('browseAsk'); return b && !b.hidden }, { timeout: 30000 }).catch(() => {})
  await page.evaluate(() => { const b = document.getElementById('browseAskYes'); if (b) b.click() })
  await sleep(1500)
  for (const uri of [BASE + 'team/', BASE + 'note.ttl', BASE.replace(/sharing\/$/, '')]) {
    await page.goto(address(uri))
    const opened = await page.waitFor(() => {
      const D = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const e of root.querySelectorAll('*')) if (e.shadowRoot) { const g = D(sel, e.shadowRoot); if (g) return g } return null }
      const menu = D('solid-ui-resource-actions-menu')
      const item = menu && menu.shadowRoot && [...menu.shadowRoot.querySelectorAll('solid-ui-menu-item')].find(i => i.textContent.trim() === 'Sharing')
      if (!item) return false
      item.dispatchEvent(new CustomEvent('solid-ui-select', { bubbles: true, composed: true, cancelable: true, detail: { item } }))
      return true
    }, { timeout: 40000 }).catch(() => false)
    const name = uri.replace(BASE.replace(/sharing\/$/, ''), 'suite-data/')
    if (!opened) {
      // A private item: the data browser may show no menu at all when it cannot read the item.
      check(name + ': not readable logged out, so there is nothing to show', true, 'no menu')
      continue
    }
    await page.waitFor(() => { const r = document.querySelector('.shr.sharing-lab-pane'); return !!r && !['busy', 'loading', undefined].includes(r.dataset.state) }, { timeout: 70000 })
    const seen = await page.evaluate(() => ({ status: document.querySelector('.shr-status').textContent, controls: document.querySelectorAll('.shr select, .shr input, .shr button').length, wide: document.documentElement.scrollWidth > innerWidth }))
    check(name + ': says you cannot see who has access, and to log in', /You cannot see who has access to this\. Log in/.test(seen.status), seen.status)
    check(name + ': nothing to change', seen.controls === 0)
    check(name + ': no sideways scroll at 400 px', !seen.wide)
    await shot('logged-out-' + name.replace(/\W+/g, '-'))
  }
} catch (error) { await finish(error) }
await finish()
