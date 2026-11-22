// The design sheet's sample page in a real browser, at 1300 px and at a true 400 px (CDP device metrics):
// every shared piece is there, every icon is drawn, nothing scrolls sideways. Full-page screenshots in tests/shots/.
// Also says whether the panes in shell/ carry the current design block (design/embed.mjs --check; stale is a NOTE).
//   node design/tests/samples.mjs
import { launch } from '../../lib/cdp.mjs'
import { LAB } from '../../lib/lib.mjs'
import { narrow, measure } from '../viewport.mjs'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const HERE = import.meta.dirname
const SHOTS = path.join(HERE, 'shots')
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`) }

for (const pane of ['shell/suite-shell-pane.js', 'shell/suite-shell-demo-pane.js']) {
  const r = spawnSync(process.execPath, [path.join(HERE, '..', 'embed.mjs'), path.join(HERE, '..', '..', pane), '--check'], { encoding: 'utf8' })
  // Stale only means the sheet moved on: re-run embed. Reported, not failed, so a sheet change never blocks a pane.
  if (r.status === 0) check(`${pane} carries the current design block`, true)
  else console.log(`NOTE ${pane}: ${(r.stdout || r.stderr).trim()}`)
}

const fullShot = async (page, name) => {
  const { cssContentSize } = await page.send('Page.getLayoutMetrics')
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 } })
  mkdirSync(SHOTS, { recursive: true })
  writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64'))
}

const PROFILE = path.join(HERE, 'profile')
rmSync(PROFILE, { recursive: true, force: true })
const page = await launch({ profile: PROFILE, port: 9501, width: 1300, height: 900 })
try {
  await page.goto(LAB + 'design/samples.html')
  await page.waitFor(() => document.readyState === 'complete' && document.querySelectorAll('.sp-swatch').length > 10)
  // The data browser's own rules for live regions (from its mash.css), added ahead of the sheet as they are on the real page.
  await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '[role="status"] { display: block; width: 100%; margin: 20px 0; padding: 11px 14px; border: 0; border-radius: 8px; background: rgba(0, 200, 83, 0.08); box-shadow: 0 1px 2px rgb(15 23 42 / 6%) } [role="alert"] { padding: 16px; border: 2px solid #b00020; background-color: rgba(176, 0, 32, 0.1); margin: 16px 0 }'; document.head.prepend(st) })
  const live = await page.evaluate(() => ['#plainStatus', '#toasts .ui-status', '#toasts .ui-toast'].map(sel => { const c = getComputedStyle(document.querySelector(sel)); return sel + ' m=' + c.marginTop + ' bg=' + c.backgroundColor + ' shadow=' + (c.boxShadow !== 'none' ? 'yes' : 'no') + ' border=' + c.borderTopWidth }))
  check('[role=status] reset: the data browser\'s green box is undone (plain, status line, toast)', /plainStatus m=0px bg=rgba\(0, 0, 0, 0\) shadow=no border=0px/.test(live[0]) && /ui-status m=0px bg=rgba\(0, 0, 0, 0\)/.test(live[1]) && /ui-toast m=0px bg=rgb\(31, 35, 40\) shadow=yes/.test(live[2]), live.join(' | '))
  const controls = await page.evaluate(() => ({ chevron: getComputedStyle(document.querySelector('#forms .ui-select'), '::after').maskImage || getComputedStyle(document.querySelector('#forms .ui-select'), '::after').webkitMaskImage, tick: getComputedStyle(document.querySelector('#forms .ui-check:checked'), '::after').content, file: getComputedStyle(document.querySelector('#forms .ui-file input')).opacity, dark: getComputedStyle(document.querySelector('.ui-viewer')).backgroundColor, reading: document.querySelector('.ui-reading').getBoundingClientRect().width }))
  check('select chevron, checkbox tick, hidden file input, dark viewer, reading width', /svg/.test(controls.chevron) && controls.tick === '""' && controls.file === '0' && controls.dark === 'rgb(22, 25, 29)' && controls.reading <= 760, JSON.stringify(controls))
  const pieces = ['#header .ui-header', '#launcher .ui-launcher', '#launcher .ui-menu', '#nav .ui-nav', '#rows .ui-row', '#buttons .ui-btn-primary', '#buttons .ui-btn-tertiary', '#buttons .ui-btn-danger', '#buttons .ui-btn-icon', '#inputs .ui-input', '#switches .ui-switch', '#switches .ui-chip', '#avatars .ui-avatar', '#empty .ui-empty', '#toasts .ui-toast', '#toasts .ui-status', '#modal .ui-modal', '#details .ui-details', '#frame .ui-header', '#toasts .ui-note-success', '#toasts .ui-late', '#avatars .ui-avatar-xl', '#forms .ui-select', '#forms .ui-file', '#forms .ui-checkbox', '#forms .ui-segmented', '#forms .ui-row-check', '#fields .ui-field-row', '#cards .ui-card', '#board .ui-column', '#viewer .ui-viewer', '#viewer .ui-reading']
  const missing = await page.evaluate((list) => list.filter(s => { const n = document.querySelector(s); return !n || !n.getBoundingClientRect().width }), pieces)
  check('every shared piece is on the page and drawn', missing.length === 0, missing.join(', '))
  const tokens = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sui-primary').trim())
  check('tokens.css applies (:where(:root))', tokens === '#0082c9', tokens)
  const icons = await page.evaluate(() => [...document.querySelectorAll('.ui-icon')].filter(i => !getComputedStyle(i).getPropertyValue('--ui-i').includes('data:image/svg+xml')).length)
  check('every icon has its Material Design Icon', icons === 0, icons + ' without')
  const targets = await page.evaluate(() => [...document.querySelectorAll('.ui-btn, .ui-header-btn, .ui-nav-item, .ui-menu-item, .ui-input, .ui-tab, .ui-switch, .ui-checkbox, .ui-segmented, .ui-column-head')].filter(n => n.getBoundingClientRect().height < 44 && n.getBoundingClientRect().height > 0).map(n => n.className))
  check('buttons, nav items, menu items, inputs, tabs, switches, checkboxes and segmented controls are at least 44 px tall', targets.length === 0, targets.slice(0, 4).join(' | '))
  let m = await measure(page)
  check('no sideways scroll at 1300 px', !m.sideways, `scrollWidth ${m.scrollWidth}`)
  await fullShot(page, 'samples-1300')
  await narrow(page, 400)
  await new Promise(r => setTimeout(r, 300))
  m = await measure(page)
  check('a true 400 px page (CDP device metrics)', m.innerWidth === 400, String(m.innerWidth))
  check('no sideways scroll at 400 px', !m.sideways, `scrollWidth ${m.scrollWidth}${m.poking.length ? '; ' + m.poking.join(' ') : ''}`)
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.sp-card')].filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.id))
  check('no card is wider than the page at 400 px', clipped.length === 0, clipped.join(', '))
  await fullShot(page, 'samples-400')
} catch (error) { failures++; console.log('FAIL ' + error.message) }
await page.close()
console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
process.exit(failures ? 1 : 0)
