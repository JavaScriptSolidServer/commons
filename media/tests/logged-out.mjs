// Logged out, at 1300 and 400 px: the samples straight from the lab folder (the try-it link) work in full;
// a private folder is left alone and a private file says to log in; nothing is written.
import { open, config, POD, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const PANE = LAB + 'media/media-pane.js'
const SAMPLES = LAB + 'media/samples/'
const BASE = POD + 'public/suite-data/media/'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'media')
const snapshot = () => {
  const out = []
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else out.push(p.slice(DIR.length) + ' ' + s.size + ' ' + s.mtimeMs) } }
  walk(DIR)
  return out.sort().join('\n')
}
const before = snapshot()

for (const width of [1300, 400]) {
  const { page, check, finish, shot, address: at } = await open({ pane: PANE, port: 9513, dir: import.meta.dirname, width: 1300, login: false, fresh: true, resource: SAMPLES + 'gallery/' })
  if (width === 400) await narrow(page) // a true 400 px page (design/viewport.mjs)
  const go = async (uri, ready) => { await page.goto(at(uri)); return page.waitFor(ready, { timeout: 40000 }).then(() => true, () => false) }
  try {
    const shown = await page.waitFor(() => document.querySelectorAll('.med-tile').length === 5, { timeout: 40000 }).then(() => true, () => false)
    check(width + ' px, logged out: the sample gallery opens', shown)
    check('its thumbnails load', await page.waitFor(() => [...document.querySelectorAll('.med-grid img')].every(i => i.complete && i.naturalWidth > 0), { timeout: 20000 }).then(() => true, () => false))
    await page.evaluate(() => document.querySelectorAll('.med-tile')[4].click())
    const big = await page.waitFor(() => { const b = document.querySelector('.med-box'); const i = b && b.querySelector('.med-frame img'); return b && !b.hidden && i && i.complete && i.naturalWidth > 0 && b.querySelector('.med-bname').textContent }, { timeout: 10000 }).catch(() => '')
    check('the large view works logged out', big === 'forest.png', big)
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    check('and wraps from the last to the first', await page.evaluate(() => document.querySelector('.med-count').textContent) === '1 / 5')
    await sleep(300)
    await shot('out-large-' + width)
    check('no sideways scroll, large view, ' + width + ' px', !(await measure(page)).sideways)
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await shot('out-gallery-' + width)

    check('the sample playlist opens', await go(SAMPLES + 'music/', () => document.querySelectorAll('.med-track').length === 4 && !!document.querySelector('.med-player audio')))
    check('no sideways scroll, playlist, ' + width + ' px', !(await measure(page)).sideways)

    await go(BASE + 'private/', () => !!document.querySelector('.paneDiv, [data-testid], main'))
    await sleep(4000)
    check('a private folder logged out: the pane does not claim it', await page.evaluate(() => !document.querySelector('.med.media-pane')))
    await shot('out-private-folder-' + width)
    check('a private picture logged out: the browser says access denied, the pane stays out', await go(BASE + 'private/secret-lake.png', () => { const text = (n) => (n.shadowRoot ? text(n.shadowRoot) : '') + [...n.childNodes].map(c => c.nodeType === 3 ? c.textContent : c.nodeType === 1 ? text(c) : '').join(' '); return /not publicly readable|denied/i.test(text(document.body)) }) && await page.evaluate(() => !document.querySelector('.med.media-pane')))
    // A public folder with one private picture: that one is tried with the session, and says to log in.
    const partly = await go(BASE + 'partly/', () => { const t = document.querySelectorAll('.med-tile'); return t.length === 2 && t[1].querySelector('.med-thumb').textContent })
    const tiles = await page.evaluate(() => [...document.querySelectorAll('.med-tile')].map(t => { const i = t.querySelector('img'); return t.querySelector('.med-name').textContent + '|' + (i ? (i.complete && i.naturalWidth > 0 ? 'shown' : 'not loaded') : t.querySelector('.med-thumb').textContent) }))
    check('one private picture in a public folder says to log in; the public one shows', partly && tiles.join(',') === 'open-lake.png|shown,shut-garden.png|Log in to see this file.', tiles.join(','))
    check('its own access rule file is not counted', await page.evaluate(() => document.querySelector('.med-meta').textContent) === '2 photos')
    await shot('out-partly-' + width)
    check('no sideways scroll, partly private folder, ' + width + ' px', !(await measure(page)).sideways)
    if (width === 400) check('nothing on the pod changed', snapshot() === before)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}
