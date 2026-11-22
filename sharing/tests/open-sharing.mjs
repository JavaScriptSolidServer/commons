// Open the Sharing pane on an address in the plain data browser, the way a person does: load the page, wait until
// the session has settled (a session restore makes the browser redraw, which would drop a click made before it),
// pick "Sharing" in the item's ⋮ menu, and wait until the pane has settled (its state is no longer busy/loading)
// and is still on the page. If the browser redrew it away meanwhile, it opens it again (logged), up to 3 times.
//   await openSharing(page, address(uri), { loggedIn: true })
import { sleep } from '../../lib/lib.mjs'

const clickSharing = () => {
  const D = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const e of root.querySelectorAll('*')) if (e.shadowRoot) { const g = D(sel, e.shadowRoot); if (g) return g } return null }
  const menu = D('solid-ui-resource-actions-menu')
  const item = menu && menu.shadowRoot && [...menu.shadowRoot.querySelectorAll('solid-ui-menu-item')].find(i => i.textContent.trim() === 'Sharing')
  if (!item) return false
  item.dispatchEvent(new CustomEvent('solid-ui-select', { bubbles: true, composed: true, cancelable: true, detail: { item } }))
  return true
}
const settled = () => { const r = document.querySelector('.shr.sharing-lab-pane'); return !!r && !!r.dataset.state && !['busy', 'loading'].includes(r.dataset.state) }

export async function openSharing (page, url, { loggedIn = true } = {}) {
  await page.goto(url)
  if (loggedIn) {
    const deep = "function D (sel, root = document) { const f = root.querySelector(sel); if (f) return f; for (const e of root.querySelectorAll('*')) if (e.shadowRoot) { const g = D(sel, e.shadowRoot); if (g) return g } return null }"
    await page.waitFor(`!!(window.SolidLogic && window.SolidLogic.authn && window.SolidLogic.authn.currentUser()) && !!(${deep})('solid-ui-account')?.hasAttribute('data-state-loggedin')`, { timeout: 40000 })
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const clicked = await page.waitFor(clickSharing, { timeout: 40000 }).catch(() => false)
    if (clicked) {
      const ok = await page.waitFor(settled, { timeout: 45000 }).catch(() => false)
      if (ok) {
        await sleep(400) // still there: not redrawn away just after
        if (await page.evaluate(settled)) return attempt
      }
    }
    console.log(`     (Sharing did not open and settle on attempt ${attempt}${attempt < 3 ? '; opening it again' : ''})`)
    if (attempt < 3) { await page.goto(url); await sleep(1000) }
  }
  throw new Error('the Sharing pane never opened and settled on ' + url)
}
