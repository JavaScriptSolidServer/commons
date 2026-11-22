// A true narrow viewport for tests. The helper's `width: 400` sets the window, but headless Chromium's page is
// then about 500 px wide; this sets the page itself, as a phone would (CSS px, scale 1, mobile, touch).
//
//   import { open } from '../../lib/lib.mjs'
//   import { narrow, wide, measure } from '../../design/viewport.mjs'
//   const { page } = await open({ ... })        // any width
//   await narrow(page)                          // innerWidth is now exactly 400 (or narrow(page, 360))
//   const m = await measure(page)               // { innerWidth, scrollWidth, sideways } — sideways true = a bug
//   await wide(page)                            // back to the window's own size
//
// Media queries and layout follow at once; no reload is needed. Uses only page.send (lib/cdp.mjs).
export async function narrow (page, width = 400, height = 860) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height })
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }).catch(() => {})
  await page.waitFor(`innerWidth === ${width}`, { timeout: 5000 })
}

export async function wide (page) {
  await page.send('Emulation.clearDeviceMetricsOverride')
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {})
}

// Sideways scroll: the page wider than the viewport, or any element poking out past the right edge.
export async function measure (page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const out = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[hidden]') && e.offsetParent !== null }).slice(0, 5).map(e => (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : e.tagName) + '@' + Math.round(e.getBoundingClientRect().right))
    return { innerWidth, scrollWidth: doc.scrollWidth, sideways: doc.scrollWidth > innerWidth, poking: out }
  })
}
