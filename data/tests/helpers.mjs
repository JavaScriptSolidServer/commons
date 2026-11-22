// Small things the test files share.

// Runs in the page: picks "Data" in the open pane's menu (the explorer header's "More options").
export function menuData () {
  const found = []
  const walk = (node) => { for (const e of node.querySelectorAll('*')) { if (e.tagName === 'SOLID-UI-MENU-ITEM' && e.textContent.trim() === 'Data') found.push(e); if (e.shadowRoot) walk(e.shadowRoot) } }
  walk(document.getElementById('OutlineView'))
  if (found.length !== 1) return false
  // What a person clicks is the dropdown entry in the menu's own shadow root that shows this item.
  const item = found[0]
  const menu = item.parentElement
  const slot = menu.shadowRoot && menu.shadowRoot.querySelector('slot[name="' + item.getAttribute('slot') + '"]')
  const entry = slot && slot.parentElement
  if (!entry) return false
  entry.click()
  return true
}

// Shows a thing with the data pane, as a click in the pane menu would, and waits until it is drawn.
export async function view (page, uri, state = 'ready') {
  await page.evaluate((u) => { document.querySelector('.data-pane')?.classList.add('dat-old'); panes.getOutliner(document).GotoSubject($rdf.sym(u), true, panes.byName('data-lab'), true) }, uri)
  await page.waitFor((u, s) => { const r = document.querySelector('.data-pane:not(.dat-old)'); return !!r && r.querySelector('.dat-uri')?.textContent === u && r.dataset.state === s }, { timeout: 30000, args: [uri, state] })
}

// Draws the pane straight into the page for a thing, as the outliner would, and waits for it to
// settle. Used where the browser itself stops before any pane is drawn (401 and 403), and to see
// the loading state. Returns 'first state|note -> last state|note|title'.
export function direct (page, uri) {
  return page.evaluate(async (u) => {
    const root = panes.byName('data-lab').render($rdf.sym(u), { dom: document, session: { store: SolidLogic.store }, getOutliner: panes.getOutliner })
    const view = document.getElementById('OutlineView')
    view.replaceChildren(root)
    const say = () => root.dataset.state + '|' + (root.querySelector('.dat-note')?.textContent || '')
    const first = say()
    for (let i = 0; i < 75 && root.dataset.state === 'loading'; i++) await new Promise(resolve => setTimeout(resolve, 200))
    return first + ' -> ' + say() + '|' + root.querySelector('.dat-title').textContent
  }, uri)
}

// A real mouse click (a user gesture, which copying to the clipboard needs).
export async function realClick (page, selector) {
  const box = await page.evaluate((s) => { const e = document.querySelector(s); e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, selector)
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
}
