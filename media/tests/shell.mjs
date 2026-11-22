// The pane inside the suite shell (shell/suite-shell-pane.js lists it as the Photos app), reusing the login
// media.mjs left: the filters and sub-folders in the shell's left column, a photo's details in the shell's right
// column beside the viewer, the folder's details from the shell's (i) button, and no sideways scroll at 1300 px and
// a true 400 px (design/viewport.mjs). Read-only: checks the pod is unchanged.
//   node tests/shell.mjs       (after media.mjs, which logs in)
import { open, config, POD, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const BASE = POD + 'public/suite-data/media/'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'media')
const snapshot = () => {
  const out = []
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else out.push(p.slice(DIR.length) + ' ' + s.size + ' ' + s.mtimeMs) } }
  walk(DIR)
  return out.sort().join('\n')
}
const before = snapshot()

const { page, check, finish, shot, address: at } = await open({ pane: SHELL, port: 9514, dir: import.meta.dirname, login: false, resource: BASE + 'gallery/' })
const key = (k) => page.evaluate((k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k)
// Show uri in the shell with this pane: it is the Photos app, and also one of the "other views" if Files took it.
const showIn = async (uri, ready) => {
  await page.goto(at(uri))
  await page.waitFor(() => !!document.querySelector('.sh-content .med.media-pane') || !!document.querySelector('[data-pane="media"]'), { timeout: 45000 }).catch(() => {})
  if (!await page.evaluate(() => !!document.querySelector('.sh-content .med.media-pane'))) await page.evaluate(() => { const b = document.querySelector('[data-pane="media"]'); if (b) b.click() })
  return page.waitFor(ready, { timeout: 30000 }).then(() => true, () => false)
}
const navItems = () => page.evaluate(() => [...document.querySelectorAll('.sh-navcol .med-shell-nav .med-nav-item')].map(b => b.querySelector('.med-nav-label').textContent + (b.querySelector('.med-nav-count') ? ' ' + b.querySelector('.med-nav-count').textContent : '') + (b.getAttribute('aria-current') ? '*' : '')).join(','))
const detailsText = () => page.evaluate(() => { const d = document.querySelector('.sh-detcol:not([hidden]) .med-details-wrap'); return d ? d.querySelector('.med-details-title').textContent + '|' + [...d.querySelectorAll('.med-props dt')].map(t => t.textContent + '=' + t.nextElementSibling.textContent).join('|') : '' })

try {
  // The gallery as Photos: grid in the content, filters in the shell's left column.
  const shown = await showIn(BASE + 'gallery/', () => document.querySelectorAll('.sh-content .med-tile').length === 5 && document.querySelectorAll('.sh-navcol .med-nav-item').length > 0)
  check('in the shell: the photo grid in the content, the filters in the shell\'s left column', shown)
  check('the shell shows it as the Photos app', await page.evaluate(() => document.querySelector('.sh.suite-shell-pane').dataset.app) === 'photos')
  let nav = await navItems()
  check('navigation: All media (current) and Photos, with counts', nav === 'All media 5*,Photos 5', nav)
  check('no column of its own inside the content', await page.evaluate(() => !document.querySelector('.sh-content .med-nav-list') && !document.querySelector('.sh-content .med-details-wrap')))
  await page.waitFor(() => [...document.querySelectorAll('.sh-content .med-grid img')].every(i => i.complete && i.naturalWidth > 0), { timeout: 20000 }).catch(() => {})
  await shot('shell-1300')

  // A photo in the viewer, its details in the shell's column beside it.
  await page.evaluate(() => document.querySelectorAll('.sh-content .med-tile')[1].click())
  await page.waitFor(() => { const b = document.querySelector('.med-box'); return b && !b.hidden }, { timeout: 10000 })
  await page.evaluate(() => document.querySelector('.med-info').click())
  const det = await page.waitFor(() => { const d = document.querySelector('.sh-detcol:not([hidden]) .med-details-wrap'); return d && /Dimensions/.test(d.textContent) }, { timeout: 10000 }).then(() => true, () => false)
  let text = await detailsText()
  check('the viewer\'s Details button opens the photo in the shell\'s details column', det && /^bob-hills\.png\|Type=PNG image\|Dimensions=240 × 160 pixels\|Size=7\.0 kB\|Modified=.+\|Folder=gallery\|Address=http/.test(text), text)
  const beside = await page.evaluate(() => { const b = document.querySelector('.med-box').getBoundingClientRect(); const d = document.querySelector('.sh-detcol').getBoundingClientRect(); return { box: Math.round(b.right), col: Math.round(d.left), pressed: document.querySelector('.med-info').getAttribute('aria-pressed') } })
  check('the viewer steps aside: the details column is beside it, not under it', Math.abs(beside.box - beside.col) <= 2 && beside.pressed === 'true', JSON.stringify(beside))
  await sleep(300)
  await shot('shell-viewer-details-1300')
  await key('ArrowRight')
  await page.waitFor(() => /carol-sun/.test((document.querySelector('.sh-detcol .med-details-title') || {}).textContent || ''), { timeout: 5000 }).catch(() => {})
  text = await detailsText()
  check('the next photo: its details follow', /^carol-sun\.svg\|Type=SVG image/.test(text), text)
  // Tab with the details open: it reaches the shell's column (its close button and the links), and the viewer is
  // not marked modal while the column beside it is part of it.
  const tabbed = []
  for (let i = 0; i < 10; i++) { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); tabbed.push(await page.evaluate(() => { const a = document.activeElement; return a.closest('.sh-detcol') ? 'col:' + (a.getAttribute('aria-label') || a.textContent.slice(0, 12)) : a.closest('.med-box') ? 'viewer:' + a.getAttribute('aria-label') : 'out:' + a.tagName })) }
  check('Tab reaches the details column\'s close button and links, and stays within viewer + column', tabbed.includes('col:Close details') && tabbed.some(t => t.startsWith('col:http')) && tabbed.every(t => !t.startsWith('out:')) && await page.evaluate(() => document.querySelector('.med-box').getAttribute('aria-modal')) === 'false', tabbed.join(' '))
  await page.evaluate(() => document.querySelector('.med-close').focus())
  await key('Escape')
  const first = await page.evaluate(() => ({ details: !document.querySelector('.sh-detcol').hidden, viewer: !document.querySelector('.med-box').hidden, pressed: document.querySelector('.med-info').getAttribute('aria-pressed') }))
  check('Escape closes the details first; the photo stays', !first.details && first.viewer && first.pressed === 'false', JSON.stringify(first))
  await page.evaluate(() => document.querySelector('.med-info').click())
  await page.waitFor(() => !document.querySelector('.sh-detcol').hidden, { timeout: 5000 }).catch(() => {})
  await page.evaluate(() => document.querySelector('.med-close').click())
  const closed = await page.evaluate(() => ({ details: !document.querySelector('.sh-detcol').hidden, viewer: !document.querySelector('.med-box').hidden }))
  check('closing the viewer closes its details too', !closed.details && !closed.viewer, JSON.stringify(closed))

  // The shell's (i) button: the folder itself.
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .med-details-wrap'), { timeout: 5000 }).catch(() => {})
  text = await detailsText()
  check('the shell\'s (i) button shows the folder: counts and who can see it', /^gallery\|Photos=5\|Sound and video=0\|Other items=1\|Who can see it=Anyone with the address\|.*Address=http/.test(text), text)
  await shot('shell-folder-details-1300')
  check('1300 px in the shell: no sideways scroll', !(await measure(page)).sideways)
  await page.evaluate(() => document.querySelector('.sh-details-close').click())

  // A folder with both kinds: the filters show only photos, or only sound and video.
  const priv = await showIn(BASE + 'private/', () => document.querySelectorAll('.sh-content .med-tile').length === 2 && document.querySelectorAll('.sh-content .med-track').length === 1)
  check('a folder with photos and sound opens in the shell', priv)
  nav = await navItems()
  check('navigation: All media, Photos, Sound and video', nav === 'All media 3*,Photos 2,Sound and video 1', nav)
  const filtered = async (label) => {
    await page.evaluate((label) => [...document.querySelectorAll('.sh-navcol .med-nav-item')].find(b => b.textContent.startsWith(label)).click(), label)
    return page.evaluate(() => ({ photos: !document.querySelector('.med-gallery').hidden, tracks: !document.querySelector('.med-playlist').hidden, current: document.querySelector('.sh-navcol [aria-current]').dataset.filter }))
  }
  let f = await filtered('Photos')
  check('Photos: only the photos', f.photos && !f.tracks && f.current === 'photos', JSON.stringify(f))
  f = await filtered('Sound and video')
  check('Sound and video: only the playlist', !f.photos && f.tracks && f.current === 'tracks', JSON.stringify(f))
  await shot('shell-filter-1300')
  f = await filtered('All media')
  check('All media: both again', f.photos && f.tracks && f.current === 'all', JSON.stringify(f))

  // Sub-folders: listed under Folders; one opens in Photos.
  const music = await showIn(BASE + 'music/', () => document.querySelectorAll('.sh-content .med-track').length === 4 && !!document.querySelector('.sh-navcol [data-folder]'))
  check('a playlist folder in the shell, its sub-folders under Folders', music && /Folders/.test(await page.evaluate(() => document.querySelector('.sh-navcol .med-caption').textContent)) && await navItems() === 'All media 4*,Sound and video 4,live,notes', await navItems())
  // A sub-folder with no media is not a dead end: the shell opens it in Files.
  await page.evaluate(() => document.querySelector('.sh-navcol [data-folder$="/notes/"]').click())
  const notes = await page.waitFor(() => { const app = document.querySelector('.sh.suite-shell-pane').dataset.app; return app && app !== 'photos' && !document.querySelector('.sh-content .sh-empty') && /notes\/$/.test(document.querySelector('.sh-bar-title').textContent) && app }, { timeout: 30000 }).catch(() => '')
  check('a sub-folder without media opens in another app (not "Photos has nothing to show")', notes === 'files', String(notes))
  await showIn(BASE + 'music/', () => !!document.querySelector('.sh-navcol [data-folder$="/live/"]'))
  await page.evaluate(() => document.querySelector('.sh-navcol [data-folder$="/live/"]').click())
  const live = await page.waitFor(() => { const t = document.querySelector('.sh-content .med-title'); return t && t.textContent === 'live' && document.querySelectorAll('.sh-content .med-track').length === 1 }, { timeout: 30000 }).then(() => true, () => false)
  check('a sub-folder opens in Photos, in the shell', live && await page.evaluate(() => document.querySelector('.sh.suite-shell-pane').dataset.app) === 'photos')

  // A true 400 px: no sideways scroll; the viewer and its details still usable.
  await narrow(page) // first, so the shell draws for a phone (navigation as a closed drawer)
  await showIn(BASE + 'gallery/', () => document.querySelectorAll('.sh-content .med-tile').length === 5)
  await page.waitFor(() => [...document.querySelectorAll('.sh-content .med-grid img')].every(i => i.complete && i.naturalWidth > 0), { timeout: 20000 }).catch(() => {})
  let m = await measure(page)
  check('true 400 px in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400')
  await page.evaluate(() => document.querySelectorAll('.sh-content .med-tile')[0].click())
  await page.waitFor(() => { const b = document.querySelector('.med-box'); return b && !b.hidden }, { timeout: 10000 })
  await page.evaluate(() => document.querySelector('.med-info').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .med-details-wrap'), { timeout: 10000 }).catch(() => {})
  await sleep(300)
  const top = await page.evaluate(() => { const r = document.querySelector('.sh-detcol').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + 120); return !!e && !!e.closest('.sh-detcol') })
  check('true 400 px: the details column lies over the viewer, where it can be read', top)
  m = await measure(page)
  check('true 400 px, viewer and details open in the shell: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-400-details')
  await key('Escape'); await key('Escape')
  check('two Escapes close the details, then the viewer', await page.evaluate(() => document.querySelector('.sh-detcol').hidden && document.querySelector('.med-box').hidden))
  check('nothing on the pod changed (read-only)', snapshot() === before)
  await finish()
} catch (error) { await finish(error) }
